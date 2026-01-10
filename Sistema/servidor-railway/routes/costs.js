// Rutas de Costos
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sanitizeString, sanitizeNumber, sanitizeDate, sanitizeObject } from '../utils/sanitize.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los costos
router.get('/', asyncHandler(async (req, res) => {
    // CRÍTICO: Asegurar que branchId existe
    if (!req.user.branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }
    
    const { branchId, dateFrom, dateTo, type, category, limit = 1000, offset = 0 } = req.query;
    const userBranchId = req.user.branchId;

    let queryText = 'SELECT * FROM cost_entries WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filtrar por sucursal
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(userBranchId);
        paramIndex++;
    } else if (branchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

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

    if (type) {
        queryText += ` AND type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
    }

    if (category) {
        queryText += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
    }

    queryText += ` ORDER BY date DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const costs = await query(queryText, params);

    res.json({
        success: true,
        data: costs
    });
}));

// Obtener un costo específico
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const cost = await queryOne('SELECT * FROM cost_entries WHERE id = $1', [id]);

    if (!cost) {
        return res.status(404).json({
            success: false,
            error: 'Costo no encontrado'
        });
    }

    // Verificar acceso
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && cost.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a este costo'
        });
    }

    res.json({
        success: true,
        data: cost
    });
}));

// Crear nuevo costo
router.post('/', asyncHandler(async (req, res) => {
    // Sanitizar datos del body
    const sanitizedBody = sanitizeObject(req.body, {
        type: { type: 'string', options: { maxLength: 100 } },
        category: { type: 'string', options: { maxLength: 100 } },
        amount: { type: 'number', options: { min: 0 } },
        date: { type: 'date', options: {} },
        notes: { type: 'string', options: { maxLength: 1000 } },
        branch_id: { type: 'string', options: {} }
    });
    
    const { type, category, amount, date, notes, branch_id } = sanitizedBody;
    const branchId = req.user.branchId || branch_id;

    // Validar campos requeridos con mensajes específicos
    if (!type) {
        return res.status(400).json({
            success: false,
            error: 'El campo "type" es requerido'
        });
    }
    if (amount === undefined || amount === null || amount === '') {
        return res.status(400).json({
            success: false,
            error: 'El campo "amount" es requerido'
        });
    }
    if (!date) {
        return res.status(400).json({
            success: false,
            error: 'El campo "date" es requerido'
        });
    }
    
    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            error: 'El campo "date" debe tener el formato YYYY-MM-DD'
        });
    }
    
    // Validar que amount sea un número
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
        return res.status(400).json({
            success: false,
            error: 'El campo "amount" debe ser un número válido'
        });
    }
    
    // Validar branch_id
    if (!branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }

    const costId = `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const cost = await insert('cost_entries', {
        id: costId,
        type: type,
        category: category || null,
        amount: parseFloat(amount),
        branch_id: branchId,
        date: date,
        notes: notes || null
    });

    res.status(201).json({
        success: true,
        data: cost,
        message: 'Costo creado exitosamente'
    });
}));

// Actualizar costo
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM cost_entries WHERE id = $1', [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Costo no encontrado'
        });
    }

    // Verificar acceso
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && existing.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para modificar este costo'
        });
    }

    const updateData = {};
    if (req.body.type !== undefined) updateData.type = req.body.type;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.amount !== undefined) updateData.amount = parseFloat(req.body.amount);
    if (req.body.date !== undefined) updateData.date = req.body.date;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    updateData.updated_at = new Date().toISOString();

    const cost = await update('cost_entries', id, updateData);

    res.json({
        success: true,
        data: cost,
        message: 'Costo actualizado exitosamente'
    });
}));

// Eliminar costo
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM cost_entries WHERE id = $1', [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Costo no encontrado'
        });
    }

    // Verificar acceso
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && existing.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para eliminar este costo'
        });
    }

    await remove('cost_entries', id);

    res.json({
        success: true,
        message: 'Costo eliminado exitosamente'
    });
}));

// ========== PRESUPUESTOS ==========

// Obtener presupuestos
router.get('/budgets', asyncHandler(async (req, res) => {
    const { branchId, year, month } = req.query;
    const userBranchId = req.user.branchId;

    let queryText = 'SELECT * FROM budget_entries WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Filtrar por sucursal
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(userBranchId);
        paramIndex++;
    } else if (branchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

    if (year) {
        queryText += ` AND year = $${paramIndex}`;
        params.push(parseInt(year));
        paramIndex++;
    }

    if (month) {
        queryText += ` AND month = $${paramIndex}`;
        params.push(parseInt(month));
        paramIndex++;
    }

    queryText += ` ORDER BY year DESC, month DESC, category`;

    const budgets = await query(queryText, params);

    res.json({
        success: true,
        data: budgets
    });
}));

// Crear o actualizar presupuesto
router.post('/budgets', asyncHandler(async (req, res) => {
    const { branch_id, year, month, category, budgeted_amount } = req.body;
    const userBranchId = req.user.branchId;

    if (!year || !month || !category || budgeted_amount === undefined) {
        return res.status(400).json({
            success: false,
            error: 'year, month, category y budgeted_amount son requeridos'
        });
    }

    // Si no es admin, usar la sucursal del usuario
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (!isAdmin || !branch_id) ? userBranchId : branch_id;

    // Verificar si ya existe
    const existing = await queryOne(`
        SELECT * FROM budget_entries
        WHERE branch_id = $1 AND year = $2 AND month = $3 AND category = $4
    `, [finalBranchId, parseInt(year), parseInt(month), category]);

    if (existing) {
        // Actualizar
        const budget = await update('budget_entries', existing.id, {
            budgeted_amount: parseFloat(budgeted_amount),
            updated_at: new Date().toISOString()
        });

        return res.json({
            success: true,
            data: budget,
            message: 'Presupuesto actualizado'
        });
    } else {
        // Crear nuevo
        const budgetId = `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const budget = await insert('budget_entries', {
            id: budgetId,
            branch_id: finalBranchId,
            year: parseInt(year),
            month: parseInt(month),
            category: category,
            budgeted_amount: parseFloat(budgeted_amount)
        });

        return res.status(201).json({
            success: true,
            data: budget,
            message: 'Presupuesto creado'
        });
    }
}));

// Eliminar presupuesto
router.delete('/budgets/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM budget_entries WHERE id = $1', [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Presupuesto no encontrado'
        });
    }

    // Verificar acceso
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && existing.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para eliminar este presupuesto'
        });
    }

    await remove('budget_entries', id);

    res.json({
        success: true,
        message: 'Presupuesto eliminado exitosamente'
    });
}));

export default router;

