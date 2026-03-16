import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { body, validationResult } from 'express-validator';
import { emitCashSessionUpdate, emitCashMovementUpdate } from '../socket/socketHandler.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';

let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const logCashOperation = createOperationLogger('cash');

const router = express.Router();

// Listar sesiones de caja
router.get('/sessions', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, status, start_date, end_date } = req.query;
    
    // Validar que branch_id sea un UUID válido si se proporciona
    let branchId = branch_id || req.user.branchId;
    
    // Validar formato UUID (básico: debe tener 36 caracteres con guiones o ser null)
    if (branchId && (branchId === 'branch1' || branchId.length < 10 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId))) {
      console.warn('⚠️ Branch ID inválido recibido:', branchId);
      // Si no es master admin, usar el branch_id del usuario
      if (!req.user.isMasterAdmin) {
        branchId = req.user.branchId;
      } else {
        // Master admin sin branch_id válido: no filtrar por sucursal
        branchId = null;
      }
    }

    let sql = `
      SELECT cs.*, u.username as opened_by_username, e.name as opened_by_name
      FROM cash_sessions cs
      LEFT JOIN users u ON cs.user_id = u.id
      LEFT JOIN employees e ON u.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND cs.branch_id = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND cs.branch_id = $${paramCount}`;
      params.push(req.user.branchId);
      paramCount++;
    }

    if (status) {
      sql += ` AND cs.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND cs.date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND cs.date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ' ORDER BY cs.created_at DESC LIMIT 100';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo sesiones de caja:', error);
    res.status(500).json({ error: 'Error al obtener sesiones de caja' });
  }
});

// Obtener sesión actual abierta
router.get('/sessions/current', requireBranchAccess, async (req, res) => {
  try {
    const branchId = req.user.branchId;

    const result = await query(
      `SELECT cs.*, u.username as opened_by_username, e.name as opened_by_name
       FROM cash_sessions cs
       LEFT JOIN users u ON cs.user_id = u.id
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE cs.branch_id = $1 AND cs.status = 'open'
       ORDER BY cs.created_at DESC
       LIMIT 1`,
      [branchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay sesión de caja abierta' });
    }

    const session = result.rows[0];

    // Obtener movimientos
    const movementsResult = await query(
      'SELECT * FROM cash_movements WHERE session_id = $1 ORDER BY created_at',
      [session.id]
    );

    res.json({
      ...session,
      movements: movementsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo sesión actual:', error);
    res.status(500).json({ error: 'Error al obtener sesión actual' });
  }
});

// Obtener sesión por ID
router.get('/sessions/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT cs.*, u.username as opened_by_username, e.name as opened_by_name
       FROM cash_sessions cs
       LEFT JOIN users u ON cs.user_id = u.id
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE cs.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const session = result.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && session.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a esta sesión' });
    }

    // Obtener movimientos
    const movementsResult = await query(
      'SELECT * FROM cash_movements WHERE session_id = $1 ORDER BY created_at',
      [id]
    );

    res.json({
      ...session,
      movements: movementsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo sesión:', error);
    res.status(500).json({ error: 'Error al obtener sesión' });
  }
});

// Abrir sesión de caja
router.post('/sessions', requireBranchAccess, [
  body('initial_amount')
    .custom((value) => {
      const numValue = parseFloat(value);
      return !isNaN(numValue) && isFinite(numValue) && numValue >= 0;
    })
    .withMessage('Monto inicial debe ser un número válido mayor o igual a 0')
], async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errors: errors.array() });
    }

    const { branch_id, initial_amount, notes } = req.body;
    const finalBranchId = branch_id || req.user.branchId;
    logCashOperation('session_open_started', {
      branchId: finalBranchId,
      userId: req.user.id,
      initialAmount: Number(initial_amount || 0)
    });

    // Verificar que no haya otra sesión abierta
    const existingSession = await client.query(
      'SELECT id FROM cash_sessions WHERE branch_id = $1 AND status = $2 FOR UPDATE',
      [finalBranchId, 'open']
    );

    if (existingSession.rows.length > 0) {
      await safeRollback(client);
      return res.status(400).json({ error: 'Ya existe una sesión de caja abierta para esta sucursal' });
    }

    // Crear sesión
    const result = await client.query(
      `INSERT INTO cash_sessions (
        branch_id, user_id, date, initial_amount, current_amount, status, notes
      )
      VALUES ($1, $2, CURRENT_DATE, $3, $3, 'open', $4)
      RETURNING *`,
      [finalBranchId, req.user.id, initial_amount || 0, notes]
    );

    const session = result.rows[0];

    // Registrar movimiento inicial
    await client.query(
      `INSERT INTO cash_movements (session_id, type, amount, description, created_by)
       VALUES ($1, 'opening', $2, 'Apertura de caja', $3)`,
      [session.id, initial_amount || 0, req.user.id]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'create', 'cash_session', $2, $3)`,
        [req.user.id, session.id, JSON.stringify({ initial_amount, branch_id: finalBranchId })]
      );

      logCashOperation('session_open_committed', {
        sessionId: session.id,
        branchId: finalBranchId,
        userId: req.user.id
      });

      if (io && finalBranchId) {
        emitCashSessionUpdate(io, finalBranchId, 'opened', session);
      }
    } catch (postCommitError) {
      logCashOperation('session_open_post_commit_failed', {
        sessionId: session.id,
        message: postCommitError.message
      });
      console.error('Sesión de caja abierta pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(session);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logCashOperation('session_open_failed', {
      branchId: req.body?.branch_id || req.user.branchId,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error abriendo sesión de caja:', error);
    res.status(500).json({ error: 'Error al abrir sesión de caja' });
  } finally {
    client.release();
  }
});

// Cerrar sesión de caja
router.put('/sessions/:id/close', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { final_amount, notes } = req.body;
    logCashOperation('session_close_started', {
      sessionId: id,
      userId: req.user.id
    });

    // Obtener sesión
    const sessionResult = await client.query(
      'SELECT * FROM cash_sessions WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (sessionResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const session = sessionResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && session.branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'No tienes acceso a esta sesión' });
    }

    if (session.status !== 'open') {
      await safeRollback(client);
      return res.status(400).json({ error: 'La sesión ya está cerrada' });
    }

    // Calcular diferencia
    const finalAmount = final_amount || session.current_amount;
    const difference = finalAmount - session.current_amount;

    // Cerrar sesión
    const result = await client.query(
      `UPDATE cash_sessions
       SET status = 'closed',
           final_amount = $1,
           difference = $2,
           closed_at = CURRENT_TIMESTAMP,
           closed_by = $3,
           notes = COALESCE($4::text, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [finalAmount, difference, req.user.id, notes, id]
    );

    // Registrar movimiento de cierre
    await client.query(
      `INSERT INTO cash_movements (session_id, type, amount, description, created_by)
       VALUES ($1, 'closing', $2, $3, $4)`,
      [
        id,
        finalAmount,
        `Cierre de caja${difference !== 0 ? ` - Diferencia: ${difference > 0 ? '+' : ''}${difference}` : ''}`,
        req.user.id
      ]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    const closedSession = result.rows[0];
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'close', 'cash_session', $2, $3)`,
        [req.user.id, id, JSON.stringify({ final_amount: finalAmount, difference })]
      );

      logCashOperation('session_close_committed', {
        sessionId: id,
        branchId: closedSession.branch_id,
        difference
      });

      if (io && closedSession.branch_id) {
        emitCashSessionUpdate(io, closedSession.branch_id, 'closed', closedSession);
      }
    } catch (postCommitError) {
      logCashOperation('session_close_post_commit_failed', {
        sessionId: id,
        message: postCommitError.message
      });
      console.error('Sesión de caja cerrada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logCashOperation('session_close_failed', {
      sessionId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error cerrando sesión de caja:', error);
    res.status(500).json({ error: 'Error al cerrar sesión de caja' });
  } finally {
    client.release();
  }
});

// Agregar movimiento de efectivo
router.post('/sessions/:id/movements', requireBranchAccess, [
  body('type').isIn(['deposit', 'withdrawal']).withMessage('Tipo inválido'),
  body('amount').isNumeric().withMessage('Monto requerido')
], async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { type, amount, description } = req.body;
    logCashOperation('movement_create_started', {
      sessionId: id,
      userId: req.user.id,
      type,
      amount: Number(amount)
    });

    // Verificar que la sesión existe y está abierta
    const sessionResult = await client.query(
      'SELECT * FROM cash_sessions WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (sessionResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    const session = sessionResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && session.branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'No tienes acceso a esta sesión' });
    }

    if (session.status !== 'open') {
      await safeRollback(client);
      return res.status(400).json({ error: 'La sesión debe estar abierta para agregar movimientos' });
    }

    // Calcular nuevo monto actual
    const amountValue = parseFloat(amount);
    const newAmount = type === 'deposit' 
      ? session.current_amount + amountValue
      : session.current_amount - amountValue;

    if (newAmount < 0) {
      await safeRollback(client);
      return res.status(400).json({ error: 'No hay suficiente efectivo en caja' });
    }

    // Crear movimiento
    const movementResult = await client.query(
      `INSERT INTO cash_movements (session_id, type, amount, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, type, amountValue, description || '', req.user.id]
    );

    // Actualizar monto actual de la sesión
    await client.query(
      'UPDATE cash_sessions SET current_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newAmount, id]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    const movement = movementResult.rows[0];
    try {
      logCashOperation('movement_create_committed', {
        movementId: movement.id,
        sessionId: id,
        branchId: session.branch_id,
        type,
        amount: amountValue,
        currentAmount: newAmount
      });

      if (io && session.branch_id) {
        emitCashMovementUpdate(io, session.branch_id, 'created', movement);
      }
    } catch (postCommitError) {
      logCashOperation('movement_create_post_commit_failed', {
        movementId: movement.id,
        sessionId: id,
        message: postCommitError.message
      });
      console.error('Movimiento de caja registrado pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(movementResult.rows[0]);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logCashOperation('movement_create_failed', {
      sessionId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error agregando movimiento:', error);
    res.status(500).json({ error: 'Error al agregar movimiento' });
  } finally {
    client.release();
  }
});

export default router;
