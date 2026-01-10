// Rutas de Cálculo de Utilidad
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Calcular utilidad diaria
router.get('/daily/:date', asyncHandler(async (req, res) => {
    const { date } = req.params;
    const { branchId } = req.query;
    const userBranchId = req.user.branchId;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
    }

    // Determinar qué sucursal consultar
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (isAdmin && branchId) ? branchId : userBranchId;

    if (!finalBranchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado'
        });
    }

    // Verificar si ya existe un reporte calculado
    const existingReport = await queryOne(`
        SELECT * FROM daily_profit_reports
        WHERE date = $1 AND branch_id = $2
    `, [date, finalBranchId]);

    // Calcular revenue (ventas del día)
    const sales = await query(`
        SELECT id, total FROM sales
        WHERE branch_id = $1 
        AND DATE(created_at) = $2
        AND status = 'completada'
    `, [finalBranchId, date]);

    const revenue = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

    // Calcular COGS (costo de productos vendidos)
    let cogs = 0;
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const saleItems = await query(`
            SELECT cost, quantity
            FROM sale_items
            WHERE sale_id IN (${placeholders})
        `, saleIds);

        saleItems.forEach(item => {
            cogs += parseFloat(item.cost || 0) * parseInt(item.quantity || 1);
        });
    }

    // Calcular comisiones
    let commissions = 0;
    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const saleItems = await query(`
            SELECT commission
            FROM sale_items
            WHERE sale_id IN (${placeholders})
        `, saleIds);

        saleItems.forEach(item => {
            commissions += parseFloat(item.commission || 0);
        });
    }

    // Calcular costos operativos del día
    const costs = await query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM cost_entries
        WHERE branch_id = $1 AND date = $2
    `, [finalBranchId, date]);

    const operatingCosts = parseFloat(costs[0]?.total || 0);

    // Calcular utilidad
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - commissions - operatingCosts;

    const profitData = {
        date: date,
        branch_id: finalBranchId,
        revenue: revenue,
        cogs: cogs,
        commissions: commissions,
        costs: operatingCosts,
        profit: netProfit,
        grossProfit: grossProfit
    };

    // Guardar o actualizar reporte diario
    if (existingReport) {
        await update('daily_profit_reports', existingReport.id, {
            revenue: revenue,
            cogs: cogs,
            commissions: commissions,
            costs: operatingCosts,
            profit: netProfit
        });
    } else {
        await insert('daily_profit_reports', {
            id: `profit_${date.replace(/-/g, '')}_${finalBranchId}_${Date.now()}`,
            date: date,
            branch_id: finalBranchId,
            revenue: revenue,
            cogs: cogs,
            commissions: commissions,
            costs: operatingCosts,
            profit: netProfit
        });
    }

    res.json({
        success: true,
        data: profitData,
        cached: !!existingReport
    });
}));

// Calcular utilidad mensual
router.get('/monthly/:year/:month', asyncHandler(async (req, res) => {
    const { year, month } = req.params;
    const { branchId } = req.query;
    const userBranchId = req.user.branchId;

    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
        return res.status(400).json({
            success: false,
            error: 'Formato inválido. Use YYYY para año y M o MM para mes'
        });
    }

    const monthInt = parseInt(month);
    if (monthInt < 1 || monthInt > 12) {
        return res.status(400).json({
            success: false,
            error: 'Mes debe estar entre 1 y 12'
        });
    }

    // Determinar qué sucursal consultar
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (isAdmin && branchId) ? branchId : userBranchId;

    if (!finalBranchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado'
        });
    }

    const monthStart = `${year}-${String(monthInt).padStart(2, '0')}-01`;
    const monthEnd = new Date(parseInt(year), monthInt, 0).toISOString().split('T')[0];

    // Calcular revenue (ventas del mes)
    const sales = await query(`
        SELECT id, total, created_at
        FROM sales
        WHERE branch_id = $1 
        AND DATE(created_at) >= $2
        AND DATE(created_at) <= $3
        AND status = 'completada'
    `, [finalBranchId, monthStart, monthEnd]);

    const revenue = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

    // Calcular COGS
    let cogs = 0;
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const saleItems = await query(`
            SELECT cost, quantity
            FROM sale_items
            WHERE sale_id IN (${placeholders})
        `, saleIds);

        saleItems.forEach(item => {
            cogs += parseFloat(item.cost || 0) * parseInt(item.quantity || 1);
        });
    }

    // Calcular comisiones
    let commissions = 0;
    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const saleItems = await query(`
            SELECT commission
            FROM sale_items
            WHERE sale_id IN (${placeholders})
        `, saleIds);

        saleItems.forEach(item => {
            commissions += parseFloat(item.commission || 0);
        });
    }

    // Calcular costos operativos del mes
    const costs = await query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM cost_entries
        WHERE branch_id = $1 
        AND date >= $2
        AND date <= $3
    `, [finalBranchId, monthStart, monthEnd]);

    const operatingCosts = parseFloat(costs[0]?.total || 0);

    // Obtener presupuesto del mes si existe
    const budget = await query(`
        SELECT category, budgeted_amount
        FROM budget_entries
        WHERE branch_id = $1 AND year = $2 AND month = $3
    `, [finalBranchId, parseInt(year), monthInt]);

    const totalBudget = budget.reduce((sum, b) => sum + parseFloat(b.budgeted_amount || 0), 0);

    // Calcular utilidad
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - commissions - operatingCosts;
    const budgetVariance = totalBudget > 0 ? ((operatingCosts - totalBudget) / totalBudget) * 100 : 0;

    // Agrupar ventas por día para gráfico
    const salesByDay = {};
    sales.forEach(sale => {
        const day = sale.created_at.split('T')[0];
        if (!salesByDay[day]) {
            salesByDay[day] = 0;
        }
        salesByDay[day] += parseFloat(sale.total || 0);
    });

    const profitData = {
        year: parseInt(year),
        month: monthInt,
        branch_id: finalBranchId,
        revenue: revenue,
        cogs: cogs,
        commissions: commissions,
        costs: operatingCosts,
        profit: netProfit,
        grossProfit: grossProfit,
        budget: {
            budgeted: totalBudget,
            actual: operatingCosts,
            variance: budgetVariance
        },
        salesCount: sales.length,
        salesByDay: salesByDay
    };

    res.json({
        success: true,
        data: profitData
    });
}));

// Recalcular utilidad diaria (forzar recálculo)
router.post('/recalculate/daily', asyncHandler(async (req, res) => {
    const { date, branchId } = req.body;
    const userBranchId = req.user.branchId;

    if (!date) {
        return res.status(400).json({
            success: false,
            error: 'date es requerido'
        });
    }

    // Determinar qué sucursal
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (isAdmin && branchId) ? branchId : userBranchId;

    // Eliminar reporte existente si existe
    await query(`
        DELETE FROM daily_profit_reports
        WHERE date = $1 AND branch_id = $2
    `, [date, finalBranchId]);

    // Recalcular (usar la misma lógica que GET)
    const sales = await query(`
        SELECT id, total FROM sales
        WHERE branch_id = $1 
        AND DATE(created_at) = $2
        AND status = 'completada'
    `, [finalBranchId, date]);

    const revenue = sales.reduce((sum, s) => sum + parseFloat(s.total || 0), 0);

    let cogs = 0;
    let commissions = 0;
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
        const placeholders = saleIds.map((_, i) => `$${i + 1}`).join(', ');
        const saleItems = await query(`
            SELECT cost, quantity, commission
            FROM sale_items
            WHERE sale_id IN (${placeholders})
        `, saleIds);

        saleItems.forEach(item => {
            cogs += parseFloat(item.cost || 0) * parseInt(item.quantity || 1);
            commissions += parseFloat(item.commission || 0);
        });
    }

    const costs = await query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM cost_entries
        WHERE branch_id = $1 AND date = $2
    `, [finalBranchId, date]);

    const operatingCosts = parseFloat(costs[0]?.total || 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - commissions - operatingCosts;

    await insert('daily_profit_reports', {
        id: `profit_${date.replace(/-/g, '')}_${finalBranchId}_${Date.now()}`,
        date: date,
        branch_id: finalBranchId,
        revenue: revenue,
        cogs: cogs,
        commissions: commissions,
        costs: operatingCosts,
        profit: netProfit
    });

    res.json({
        success: true,
        message: 'Utilidad recalculada exitosamente',
        data: {
            date: date,
            revenue: revenue,
            cogs: cogs,
            commissions: commissions,
            costs: operatingCosts,
            profit: netProfit
        }
    });
}));

// Obtener historial de utilidades
router.get('/history', asyncHandler(async (req, res) => {
    const { branchId, dateFrom, dateTo, limit = 100 } = req.query;
    const userBranchId = req.user.branchId;

    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (isAdmin && branchId) ? branchId : userBranchId;

    let queryText = `
        SELECT * FROM daily_profit_reports
        WHERE branch_id = $1
    `;
    const params = [finalBranchId];
    let paramIndex = 2;

    if (dateFrom) {
        queryText += ` AND date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` ORDER BY date DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const reports = await query(queryText, params);

    res.json({
        success: true,
        data: reports
    });
}));

// ==================== ENDPOINTS PARA daily_profit_reports ====================

// Obtener todos los reportes de utilidad diaria
router.get('/reports', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId, dateFrom, dateTo, limit = 100 } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué sucursal consultar
    const finalBranchId = (isAdmin && requestedBranchId) ? requestedBranchId : branchId;
    
    if (!finalBranchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado'
        });
    }
    
    let queryText = `
        SELECT * FROM daily_profit_reports
        WHERE branch_id = $1
    `;
    const params = [finalBranchId];
    let paramIndex = 2;
    
    if (dateFrom) {
        queryText += ` AND date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }
    
    if (dateTo) {
        queryText += ` AND date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }
    
    queryText += ` ORDER BY date DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
    
    const reports = await query(queryText, params);
    
    res.json({
        success: true,
        data: reports,
        count: reports.length
    });
}));

// Obtener un reporte específico por ID
router.get('/reports/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = 'SELECT * FROM daily_profit_reports WHERE id = $1';
    const params = [id];
    
    if (!isAdmin) {
        queryText += ' AND branch_id = $2';
        params.push(branchId);
    }
    
    const report = await queryOne(queryText, params);
    
    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }
    
    res.json({
        success: true,
        data: report
    });
}));

// Crear un nuevo reporte de utilidad diaria
router.post('/reports', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { date, branch_id, revenue = 0, cogs = 0, commissions = 0, costs = 0, profit = 0 } = req.body;
    
    if (!date) {
        return res.status(400).json({
            success: false,
            error: 'date es requerido'
        });
    }
    
    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
    }
    
    const finalBranchId = branch_id || branchId;
    
    if (!finalBranchId) {
        return res.status(400).json({
            success: false,
            error: 'branch_id es requerido'
        });
    }
    
    // Verificar si ya existe un reporte para esta fecha y sucursal
    const existing = await queryOne(`
        SELECT * FROM daily_profit_reports
        WHERE date = $1 AND branch_id = $2
    `, [date, finalBranchId]);
    
    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un reporte para esta fecha y sucursal'
        });
    }
    
    const reportId = `profit_${date.replace(/-/g, '')}_${finalBranchId}_${Date.now()}`;
    
    const report = await insert('daily_profit_reports', {
        id: reportId,
        date: date,
        branch_id: finalBranchId,
        revenue: parseFloat(revenue),
        cogs: parseFloat(cogs),
        commissions: parseFloat(commissions),
        costs: parseFloat(costs),
        profit: parseFloat(profit)
    });
    
    res.status(201).json({
        success: true,
        data: report,
        message: 'Reporte creado exitosamente'
    });
}));

// Actualizar un reporte de utilidad diaria
router.put('/reports/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const { revenue, cogs, commissions, costs, profit } = req.body;
    
    // Verificar que el reporte existe y pertenece a la sucursal del usuario
    let queryText = 'SELECT * FROM daily_profit_reports WHERE id = $1';
    const params = [id];
    
    if (!isAdmin) {
        queryText += ' AND branch_id = $2';
        params.push(branchId);
    }
    
    const existing = await queryOne(queryText, params);
    
    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }
    
    const updates = {};
    if (revenue !== undefined) updates.revenue = parseFloat(revenue);
    if (cogs !== undefined) updates.cogs = parseFloat(cogs);
    if (commissions !== undefined) updates.commissions = parseFloat(commissions);
    if (costs !== undefined) updates.costs = parseFloat(costs);
    if (profit !== undefined) updates.profit = parseFloat(profit);
    
    const updated = await update('daily_profit_reports', id, updates);
    
    res.json({
        success: true,
        data: updated,
        message: 'Reporte actualizado exitosamente'
    });
}));

// Eliminar un reporte de utilidad diaria
router.delete('/reports/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Verificar que el reporte existe y pertenece a la sucursal del usuario
    let queryText = 'SELECT * FROM daily_profit_reports WHERE id = $1';
    const params = [id];
    
    if (!isAdmin) {
        queryText += ' AND branch_id = $2';
        params.push(branchId);
    }
    
    const existing = await queryOne(queryText, params);
    
    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Reporte no encontrado'
        });
    }
    
    await query('DELETE FROM daily_profit_reports WHERE id = $1', [id]);
    
    res.json({
        success: true,
        message: 'Reporte eliminado exitosamente'
    });
}));

export default router;

