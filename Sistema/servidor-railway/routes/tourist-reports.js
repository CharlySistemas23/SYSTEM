// Rutas de Reportes Turísticos
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los reportes
router.get('/', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, status, limit = 100, offset = 0 } = req.query;
    const branchId = req.user.branchId;

    if (!branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }

    let queryText = `
        SELECT tr.*,
               COUNT(trl.id) as line_count
        FROM tourist_reports tr
        LEFT JOIN tourist_report_lines trl ON tr.id = trl.report_id
        WHERE tr.branch_id = $1
    `;
    const params = [branchId];
    let paramIndex = 2;

    if (status) {
        queryText += ` AND tr.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND tr.date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND tr.date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` GROUP BY tr.id ORDER BY tr.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const reports = await query(queryText, params);

    res.json({
        success: true,
        data: reports
    });
}));

// Obtener un reporte específico
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const report = await queryOne('SELECT * FROM tourist_reports WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }

    // Obtener líneas del reporte con datos de ventas
    const lines = await query(`
        SELECT trl.*,
               s.folio as sale_folio,
               s.total as sale_total,
               s.created_at as sale_date,
               s.seller_id,
               s.guide_id,
               s.agency_id,
               seller.name as seller_name,
               guide.name as guide_name,
               agency.name as agency_name
        FROM tourist_report_lines trl
        JOIN sales s ON trl.sale_id = s.id
        LEFT JOIN catalog_sellers seller ON s.seller_id = seller.id
        LEFT JOIN catalog_guides guide ON s.guide_id = guide.id
        LEFT JOIN catalog_agencies agency ON s.agency_id = agency.id
        WHERE trl.report_id = $1
        ORDER BY trl.created_at ASC
    `, [id]);

    // Calcular totales y comisiones
    let totalSales = 0;
    let totalCommissions = 0;

    const saleItems = await query(`
        SELECT si.* FROM sale_items si
        JOIN tourist_report_lines trl ON si.sale_id = trl.sale_id
        WHERE trl.report_id = $1
    `, [id]);

    lines.forEach(line => {
        totalSales += parseFloat(line.sale_total || 0);
    });

    saleItems.forEach(item => {
        totalCommissions += parseFloat(item.commission || 0);
    });

    res.json({
        success: true,
        data: {
            ...report,
            lines: lines,
            calculated_totals: {
                total_sales: totalSales,
                total_commissions: totalCommissions,
                line_count: lines.length
            }
        }
    });
}));

// Crear nuevo reporte
router.post('/', asyncHandler(async (req, res) => {
    const { date, notes } = req.body;
    const branchId = req.user.branchId;

    if (!date) {
        return res.status(400).json({
            success: false,
            error: 'date es requerido'
        });
    }

    // Verificar si ya existe un reporte abierto para esa fecha
    const existing = await queryOne(`
        SELECT id FROM tourist_reports
        WHERE branch_id = $1 AND date = $2 AND status = 'open'
    `, [branchId, date]);

    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un reporte abierto para esta fecha'
        });
    }

    // Generar folio
    const year = date.split('-')[0];
    const month = date.split('-')[1];
    
    const count = await queryOne(`
        SELECT COUNT(*) as count
        FROM tourist_reports
        WHERE branch_id = $1
        AND DATE(date) >= $2
        AND DATE(date) <= $3
    `, [branchId, `${year}-${month}-01`, `${year}-${month}-31`]);

    const sequentialNumber = String((parseInt(count?.count || 0) + 1)).padStart(4, '0');
    const folio = `TR-${year}${month}-${sequentialNumber}`;

    const reportId = `tourist_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const report = await insert('tourist_reports', {
        id: reportId,
        folio: folio,
        date: date,
        branch_id: branchId,
        status: 'open',
        total_sales: 0,
        total_commissions: 0,
        notes: notes || null,
        created_by: req.user.id
    });

    res.status(201).json({
        success: true,
        data: report,
        message: 'Reporte creado exitosamente'
    });
}));

// Agregar línea (venta) al reporte
router.post('/:id/lines', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { sale_id } = req.body;
    const branchId = req.user.branchId;

    if (!sale_id) {
        return res.status(400).json({
            success: false,
            error: 'sale_id es requerido'
        });
    }

    // Verificar que el reporte existe y pertenece a la sucursal
    const report = await queryOne('SELECT * FROM tourist_reports WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }

    if (report.status !== 'open') {
        return res.status(400).json({
            success: false,
            error: 'Solo se pueden agregar líneas a reportes abiertos'
        });
    }

    // Verificar que la venta existe y pertenece a la sucursal
    const sale = await queryOne('SELECT * FROM sales WHERE id = $1 AND branch_id = $2', [sale_id, branchId]);

    if (!sale) {
        return res.status(404).json({
            success: false,
            error: 'Venta no encontrada'
        });
    }

    // Verificar que la venta no esté ya en otro reporte
    const existingLine = await queryOne('SELECT id FROM tourist_report_lines WHERE sale_id = $1', [sale_id]);

    if (existingLine) {
        return res.status(400).json({
            success: false,
            error: 'Esta venta ya está incluida en otro reporte'
        });
    }

    // Crear línea
    const lineId = `report_line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await insert('tourist_report_lines', {
        id: lineId,
        report_id: id,
        sale_id: sale_id
    });

    // Recalcular totales del reporte
    const lines = await query('SELECT sale_id FROM tourist_report_lines WHERE report_id = $1', [id]);
    const saleIds = lines.map(l => l.sale_id);

    let totalSales = 0;
    let totalCommissions = 0;

    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const sales = await query(`SELECT id, total FROM sales WHERE id IN (${placeholders})`, saleIds);
        const saleItems = await query(`SELECT sale_id, commission FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);

        sales.forEach(s => {
            totalSales += parseFloat(s.total || 0);
        });

        saleItems.forEach(item => {
            totalCommissions += parseFloat(item.commission || 0);
        });
    }

    // Actualizar totales del reporte
    await update('tourist_reports', id, {
        total_sales: totalSales,
        total_commissions: totalCommissions,
        updated_at: new Date().toISOString()
    });

    res.status(201).json({
        success: true,
        message: 'Línea agregada exitosamente'
    });
}));

// Eliminar línea del reporte
router.delete('/:id/lines/:lineId', asyncHandler(async (req, res) => {
    const { id, lineId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el reporte existe y está abierto
    const report = await queryOne('SELECT * FROM tourist_reports WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }

    if (report.status !== 'open') {
        return res.status(400).json({
            success: false,
            error: 'Solo se pueden eliminar líneas de reportes abiertos'
        });
    }

    // Verificar que la línea existe
    const line = await queryOne('SELECT * FROM tourist_report_lines WHERE id = $1 AND report_id = $2', [lineId, id]);

    if (!line) {
        return res.status(404).json({
            success: false,
            error: 'Línea no encontrada'
        });
    }

    // Eliminar línea
    await query('DELETE FROM tourist_report_lines WHERE id = $1', [lineId]);

    // Recalcular totales
    const lines = await query('SELECT sale_id FROM tourist_report_lines WHERE report_id = $1', [id]);
    const saleIds = lines.map(l => l.sale_id);

    let totalSales = 0;
    let totalCommissions = 0;

    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const sales = await query(`SELECT id, total FROM sales WHERE id IN (${placeholders})`, saleIds);
        const saleItems = await query(`SELECT sale_id, commission FROM sale_items WHERE sale_id IN (${placeholders})`, saleIds);

        sales.forEach(s => {
            totalSales += parseFloat(s.total || 0);
        });

        saleItems.forEach(item => {
            totalCommissions += parseFloat(item.commission || 0);
        });
    }

    // Actualizar totales
    await update('tourist_reports', id, {
        total_sales: totalSales,
        total_commissions: totalCommissions,
        updated_at: new Date().toISOString()
    });

    res.json({
        success: true,
        message: 'Línea eliminada exitosamente'
    });
}));

// Cerrar reporte
router.put('/:id/close', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const report = await queryOne('SELECT * FROM tourist_reports WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }

    if (report.status === 'closed') {
        return res.status(400).json({
            success: false,
            error: 'El reporte ya está cerrado'
        });
    }

    const updatedReport = await update('tourist_reports', id, {
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    res.json({
        success: true,
        data: updatedReport,
        message: 'Reporte cerrado exitosamente'
    });
}));

// Actualizar reporte
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM tourist_reports WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }

    if (existing.status === 'closed') {
        return res.status(400).json({
            success: false,
            error: 'No se puede modificar un reporte cerrado'
        });
    }

    const updateData = {};
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.date !== undefined && req.body.date !== existing.date) {
        // Verificar que no exista otro reporte para la nueva fecha
        const conflict = await queryOne(`
            SELECT id FROM tourist_reports
            WHERE branch_id = $1 AND date = $2 AND id != $3 AND status = 'open'
        `, [branchId, req.body.date, id]);

        if (conflict) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un reporte abierto para esa fecha'
            });
        }
        updateData.date = req.body.date;
    }

    updateData.updated_at = new Date().toISOString();

    const report = await update('tourist_reports', id, updateData);

    res.json({
        success: true,
        data: report,
        message: 'Reporte actualizado exitosamente'
    });
}));

export default router;

