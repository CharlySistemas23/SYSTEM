// Rutas de Caja (Cash Management)
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todas las sesiones de caja (con filtro por sucursal para admin)
router.get('/sessions', asyncHandler(async (req, res) => {
    // CRÍTICO: Asegurar que branchId existe
    if (!req.user.branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }
    
    const { dateFrom, dateTo, status, branchId: requestedBranchId, limit = 100, offset = 0 } = req.query;
    const branchId = req.user.branchId;

    // Verificar si es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué branch_id usar para el filtro
    let filterBranchId = branchId;
    
    if (isAdmin && requestedBranchId) {
        filterBranchId = requestedBranchId;
    } else if (!isAdmin && !branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }

    // Si es admin y NO se especificó branchId, mostrar TODAS las tiendas
    let queryText;
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todas las sesiones de todas las tiendas
        queryText = `
            SELECT cs.*, 
                   e.name as employee_name,
                   b.name as branch_name,
                   b.id as branch_id,
                   COUNT(cm.id) as movements_count
            FROM cash_sessions cs
            LEFT JOIN employees e ON cs.employee_id = e.id
            LEFT JOIN catalog_branches b ON cs.branch_id = b.id
            LEFT JOIN cash_movements cm ON cs.id = cm.session_id
            WHERE 1=1
        `;
    } else {
        // Filtrar por branch_id específico
        queryText = `
            SELECT cs.*, 
                   e.name as employee_name,
                   b.name as branch_name,
                   b.id as branch_id,
                   COUNT(cm.id) as movements_count
            FROM cash_sessions cs
            LEFT JOIN employees e ON cs.employee_id = e.id
            LEFT JOIN catalog_branches b ON cs.branch_id = b.id
            LEFT JOIN cash_movements cm ON cs.id = cm.session_id
            WHERE cs.branch_id = $${paramIndex}
        `;
        params.push(filterBranchId);
        paramIndex++;
    }

    if (status) {
        queryText += ` AND cs.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND DATE(cs.opened_at) >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND DATE(cs.opened_at) <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    // Ordenar: primero por sucursal (si es admin), luego por fecha
    if (isAdmin && !requestedBranchId) {
        queryText += ` GROUP BY cs.id, e.name, b.name, b.id ORDER BY b.name ASC, cs.opened_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    } else {
        queryText += ` GROUP BY cs.id, e.name, b.name, b.id ORDER BY cs.opened_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    }
    params.push(parseInt(limit), parseInt(offset));

    const sessions = await query(queryText, params);

    res.json({
        success: true,
        data: sessions
    });
}));

// Obtener sesión actual (abierta)
router.get('/sessions/current', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;

    if (!branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }

    const session = await queryOne(`
        SELECT cs.*, 
               e.name as employee_name
        FROM cash_sessions cs
        LEFT JOIN employees e ON cs.employee_id = e.id
        WHERE cs.branch_id = $1 AND cs.status = 'open'
        ORDER BY cs.opened_at DESC
        LIMIT 1
    `, [branchId]);

    if (!session) {
        return res.json({
            success: true,
            data: null,
            message: 'No hay sesión abierta'
        });
    }

    // Obtener movimientos de la sesión
    const movements = await query(`
        SELECT * FROM cash_movements
        WHERE session_id = $1
        ORDER BY created_at ASC
    `, [session.id]);

    // Calcular totales
    const salesTotal = await queryOne(`
        SELECT COALESCE(SUM(sp.amount), 0) as total
        FROM sales s
        JOIN sale_payments sp ON s.id = sp.sale_id
        WHERE s.branch_id = $1
        AND s.status = 'completada'
        AND DATE(s.created_at) = DATE($2::timestamp)
        AND sp.payment_method IN ('cash', 'efectivo')
    `, [branchId, session.opened_at]);

    const incomeMovements = movements.filter(m => m.type === 'income').reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    const expenseMovements = movements.filter(m => m.type === 'expense').reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);

    res.json({
        success: true,
        data: {
            ...session,
            movements: movements,
            calculated_total: parseFloat(session.initial_amount || 0) + salesTotal.total + incomeMovements - expenseMovements,
            sales_total: parseFloat(salesTotal.total || 0),
            movements_income: incomeMovements,
            movements_expense: expenseMovements
        }
    });
}));

// Obtener una sesión específica
router.get('/sessions/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const session = await queryOne(`
        SELECT cs.*, 
               e.name as employee_name
        FROM cash_sessions cs
        LEFT JOIN employees e ON cs.employee_id = e.id
        WHERE cs.id = $1 AND cs.branch_id = $2
    `, [id, branchId]);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    const movements = await query(`
        SELECT cm.*, u.username as created_by_username
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        WHERE cm.session_id = $1
        ORDER BY cm.created_at ASC
    `, [id]);

    res.json({
        success: true,
        data: {
            ...session,
            movements: movements
        }
    });
}));

// Abrir nueva sesión de caja
router.post('/sessions', asyncHandler(async (req, res) => {
    const { initial_amount, notes } = req.body;
    const branchId = req.user.branchId;
    const employeeId = req.user.employeeId || req.user.id;

    if (!branchId || !employeeId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID o Employee ID no encontrado'
        });
    }

    // Verificar si ya hay una sesión abierta
    const existingSession = await queryOne(`
        SELECT id FROM cash_sessions
        WHERE branch_id = $1 AND status = 'open'
        LIMIT 1
    `, [branchId]);

    if (existingSession) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe una sesión de caja abierta para esta sucursal'
        });
    }

    const sessionId = `cash_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = await insert('cash_sessions', {
        id: sessionId,
        branch_id: branchId,
        employee_id: employeeId,
        initial_amount: parseFloat(initial_amount || 0),
        status: 'open',
        notes: notes || null,
        opened_at: new Date().toISOString()
    });

    // Emitir evento WebSocket
    emitToBranch(req.io, branchId, 'cash-session-created', session);

    res.status(201).json({
        success: true,
        data: session,
        message: 'Sesión de caja abierta exitosamente'
    });
}));

// Cerrar sesión de caja
router.put('/sessions/:id/close', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { final_amount, notes } = req.body;
    const branchId = req.user.branchId;

    const session = await queryOne(`
        SELECT * FROM cash_sessions
        WHERE id = $1 AND branch_id = $2
    `, [id, branchId]);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            success: false,
            error: 'La sesión ya está cerrada'
        });
    }

    const updatedSession = await update('cash_sessions', id, {
        status: 'closed',
        final_amount: parseFloat(final_amount || 0),
        closed_at: new Date().toISOString(),
        notes: notes || session.notes
    });

    // Emitir evento WebSocket
    emitToBranch(req.io, branchId, 'cash-session-updated', updatedSession);

    res.json({
        success: true,
        data: updatedSession,
        message: 'Sesión de caja cerrada exitosamente'
    });
}));

// Crear movimiento de efectivo
router.post('/movements', asyncHandler(async (req, res) => {
    const { session_id, type, amount, description } = req.body;
    const userId = req.user.id;

    if (!session_id || !type || !amount) {
        return res.status(400).json({
            success: false,
            error: 'session_id, type y amount son requeridos'
        });
    }

    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({
            success: false,
            error: 'type debe ser "income" o "expense"'
        });
    }

    // Verificar que la sesión existe y está abierta
    const session = await queryOne(`
        SELECT * FROM cash_sessions
        WHERE id = $1
    `, [session_id]);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    if (session.status !== 'open') {
        return res.status(400).json({
            success: false,
            error: 'La sesión debe estar abierta para agregar movimientos'
        });
    }

    // Verificar que la sesión pertenece a la sucursal del usuario
    if (session.branch_id !== req.user.branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a esta sesión'
        });
    }

    const movementId = `cash_movement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const movement = await insert('cash_movements', {
        id: movementId,
        session_id: session_id,
        type: type,
        amount: parseFloat(amount),
        description: description || null,
        created_by: userId
    });

    res.status(201).json({
        success: true,
        data: movement,
        message: 'Movimiento creado exitosamente'
    });
}));

// Obtener movimientos de una sesión
router.get('/sessions/:id/movements', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que la sesión pertenece a la sucursal del usuario
    const session = await queryOne(`
        SELECT branch_id FROM cash_sessions
        WHERE id = $1
    `, [id]);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    if (session.branch_id !== branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a esta sesión'
        });
    }

    const movements = await query(`
        SELECT cm.*, u.username as created_by_username
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        WHERE cm.session_id = $1
        ORDER BY cm.created_at ASC
    `, [id]);

    res.json({
        success: true,
        data: movements
    });
}));

// Conciliación con ventas POS
router.get('/sessions/:id/reconcile', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const session = await queryOne(`
        SELECT * FROM cash_sessions
        WHERE id = $1 AND branch_id = $2
    `, [id, branchId]);

    if (!session) {
        return res.status(404).json({
            success: false,
            error: 'Sesión no encontrada'
        });
    }

    // Obtener ventas en efectivo del día
    const sales = await query(`
        SELECT s.*, 
               SUM(sp.amount) as cash_total
        FROM sales s
        JOIN sale_payments sp ON s.id = sp.sale_id
        WHERE s.branch_id = $1
        AND s.status = 'completada'
        AND DATE(s.created_at) = DATE($2::timestamp)
        AND sp.payment_method IN ('cash', 'efectivo')
        GROUP BY s.id
        ORDER BY s.created_at ASC
    `, [branchId, session.opened_at]);

    // Obtener movimientos
    const movements = await query(`
        SELECT * FROM cash_movements
        WHERE session_id = $1
        ORDER BY created_at ASC
    `, [id]);

    const incomeMovements = movements.filter(m => m.type === 'income').reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    const expenseMovements = movements.filter(m => m.type === 'expense').reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    const salesTotal = sales.reduce((sum, s) => sum + parseFloat(s.cash_total || 0), 0);

    const calculatedTotal = parseFloat(session.initial_amount || 0) + salesTotal + incomeMovements - expenseMovements;
    const expectedTotal = parseFloat(session.final_amount || calculatedTotal);

    res.json({
        success: true,
        data: {
            session: session,
            sales: sales,
            movements: movements,
            summary: {
                initial_amount: parseFloat(session.initial_amount || 0),
                sales_total: salesTotal,
                movements_income: incomeMovements,
                movements_expense: expenseMovements,
                calculated_total: calculatedTotal,
                expected_total: expectedTotal,
                difference: expectedTotal - calculatedTotal
            }
        }
    });
}));

export default router;

