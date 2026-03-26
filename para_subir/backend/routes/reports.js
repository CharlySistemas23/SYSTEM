import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';

const router = express.Router();

// Función helper para obtener io desde la app
const getIO = (req) => {
  return req.app.get('io');
};

const logReportsOperation = createOperationLogger('reports');
const isDebugReports = process.env.DEBUG_REPORTS === 'true';

// Validar UUID para evitar errores de tipo en PostgreSQL (e.g. guide_ids legacy)
const isValidUUID = (uuid) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(uuid || ''));
const debugReportsLog = (...args) => {
  if (isDebugReports) {
    console.log(...args);
  }
};
const debugReportsWarn = (...args) => {
  if (isDebugReports) {
    console.warn(...args);
  }
};

const loadQuickCaptureDetails = async (captureId) => {
  const captureWithDetails = await query(
    `SELECT 
      qc.*,
      b.name as branch_name,
      s.name as seller_name,
      g.name as guide_name,
      a.name as agency_name
    FROM quick_captures qc
    LEFT JOIN branches b ON qc.branch_id = b.id
    LEFT JOIN catalog_sellers s ON qc.seller_id = s.id
    LEFT JOIN catalog_guides g ON qc.guide_id = g.id
    LEFT JOIN catalog_agencies a ON qc.agency_id = a.id
    WHERE qc.id = $1`,
    [captureId]
  );

  if (captureWithDetails.rows.length === 0) {
    return null;
  }

  const captureData = captureWithDetails.rows[0];
  if (captureData.payments) {
    captureData.payments = typeof captureData.payments === 'string' ? JSON.parse(captureData.payments) : captureData.payments;
  }

  return captureData;
};

// Reportes de utilidad
router.get('/profit', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;
    const branchId = branch_id || req.user.branchId;

    const whereConditions = [];
    const params = [];
    let paramCount = 1;

    if (req.user.isMasterAdmin) {
      if (branchId) {
        whereConditions.push(`s.branch_id = $${paramCount}`);
        params.push(branchId);
        paramCount++;
      }
    } else {
      whereConditions.push(`s.branch_id = $${paramCount}`);
      params.push(req.user.branchId);
      paramCount++;
    }

    if (start_date) {
      whereConditions.push(`s.created_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      whereConditions.push(`s.created_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }

    whereConditions.push(`s.status = 'completed'`);
    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const profitResult = await query(
      `SELECT 
        DATE(s.created_at) as date,
        COUNT(s.id) as sales_count,
        COALESCE(SUM(s.total), 0) as total_sales,
        COALESCE(SUM(
          (SELECT SUM(ii.cost * si.quantity)
           FROM sale_items si
           INNER JOIN inventory_items ii ON si.item_id = ii.id
           WHERE si.sale_id = s.id)
        ), 0) as total_cogs,
        COALESCE(SUM(
          (SELECT SUM(si.guide_commission + si.seller_commission)
           FROM sale_items si
           WHERE si.sale_id = s.id)
        ), 0) as total_commissions
       FROM sales s
       ${whereClause}
       GROUP BY DATE(s.created_at)
       ORDER BY date DESC`,
      params
    );

    // Calcular utilidad
    const profitData = profitResult.rows.map(row => ({
      ...row,
      gross_profit: parseFloat(row.total_sales) - parseFloat(row.total_cogs),
      net_profit: parseFloat(row.total_sales) - parseFloat(row.total_cogs) - parseFloat(row.total_commissions)
    }));

    res.json(profitData);
  } catch (error) {
    console.error('Error obteniendo reporte de utilidad:', error);
    res.status(500).json({ error: 'Error al obtener reporte de utilidad' });
  }
});

// Guardar reporte
router.post('/save', requireBranchAccess, async (req, res) => {
  try {
    const {
      name,
      report_type,
      branch_id,
      date_from,
      date_to,
      filters = {},
      report_data,
      summary = {}
    } = req.body;

    if (!name || !report_type || !report_data) {
      return res.status(400).json({ error: 'Faltan campos requeridos: name, report_type, report_data' });
    }

    const finalBranchId = branch_id || req.user.branchId;

    const result = await query(
      `INSERT INTO saved_reports (
        name, report_type, branch_id, date_from, date_to, filters, report_data, summary, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        name,
        report_type,
        finalBranchId,
        date_from || null,
        date_to || null,
        JSON.stringify(filters),
        JSON.stringify(report_data),
        JSON.stringify(summary),
        req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error guardando reporte:', error);
    res.status(500).json({ error: 'Error al guardar reporte' });
  }
});

// Listar reportes guardados
router.get('/saved', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, report_type, limit = 50, offset = 0 } = req.query;
    
    // Asegurar que req.user existe
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    const branchId = branch_id || req.user.branchId;

    let sql = `
      SELECT 
        sr.*,
        b.name as branch_name,
        u.username as created_by_username
      FROM saved_reports sr
      LEFT JOIN branches b ON sr.branch_id = b.id
      LEFT JOIN users u ON sr.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND sr.branch_id = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      if (req.user.branchId) {
        sql += ` AND sr.branch_id = $${paramCount}`;
        params.push(req.user.branchId);
        paramCount++;
      }
    }

    // Filtro por tipo de reporte
    if (report_type) {
      sql += ` AND sr.report_type = $${paramCount}`;
      params.push(report_type);
      paramCount++;
    }

    sql += ` ORDER BY sr.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    // Parsear JSONB fields
    const reports = result.rows.map(row => ({
      ...row,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
      report_data: typeof row.report_data === 'string' ? JSON.parse(row.report_data) : row.report_data,
      summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary
    }));

    res.json(reports);
  } catch (error) {
    console.error('Error obteniendo reportes guardados:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Error al obtener reportes guardados', details: error.message });
  }
});

// Obtener un reporte guardado por ID
router.get('/saved/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        sr.*,
        b.name as branch_name,
        u.username as created_by_username
      FROM saved_reports sr
      LEFT JOIN branches b ON sr.branch_id = b.id
      LEFT JOIN users u ON sr.created_by = u.id
      WHERE sr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    // Verificar acceso por sucursal
    const report = result.rows[0];
    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    // Parsear JSONB fields
    const parsedReport = {
      ...report,
      filters: typeof report.filters === 'string' ? JSON.parse(report.filters) : report.filters,
      report_data: typeof report.report_data === 'string' ? JSON.parse(report.report_data) : report.report_data,
      summary: typeof report.summary === 'string' ? JSON.parse(report.summary) : report.summary
    };

    res.json(parsedReport);
  } catch (error) {
    console.error('Error obteniendo reporte guardado:', error);
    res.status(500).json({ error: 'Error al obtener reporte guardado' });
  }
});

// Eliminar reporte guardado
router.delete('/saved/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el reporte existe y el usuario tiene acceso
    const checkResult = await query(
      'SELECT branch_id, created_by FROM saved_reports WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    const report = checkResult.rows[0];

    // Verificar permisos: solo el creador o master_admin puede eliminar
    if (!req.user.isMasterAdmin && report.created_by !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este reporte' });
    }

    // Verificar acceso por sucursal
    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    await query('DELETE FROM saved_reports WHERE id = $1', [id]);

    res.json({ message: 'Reporte eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando reporte guardado:', error);
    res.status(500).json({ error: 'Error al eliminar reporte guardado' });
  }
});

// ============================================
// CAPTURAS RÁPIDAS (Quick Captures)
// ============================================

// Crear captura rápida
router.post('/quick-captures', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const {
      branch_id,
      seller_id,
      guide_id,
      agency_id,
      product,
      quantity,
      currency,
      total,
      merchandise_cost,
      notes,
      is_street,
      payment_method,
      payments,
      date,
      original_report_date
    } = req.body;

    logReportsOperation('quick_capture_create_started', {
      userId: req.user.id,
      branchId: branch_id || req.user.branchId,
      product
    });

    if (!product || !quantity || !currency || !total || !date) {
      await safeRollback(client);
      return res.status(400).json({ error: 'Faltan campos requeridos: product, quantity, currency, total, date' });
    }

    const finalBranchId = branch_id || req.user.branchId;

    if (guide_id && !isValidUUID(guide_id)) {
      console.warn(`⚠️ guide_id inválido ignorado (POST /quick-captures): "${guide_id}"`);
    }
    const validGuideId = guide_id && isValidUUID(guide_id) ? guide_id : null;

    const result = await client.query(
      `INSERT INTO quick_captures (
        branch_id, seller_id, guide_id, agency_id, product, quantity, currency,
        total, merchandise_cost, notes, is_street, payment_method, payments,
        date, original_report_date, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        finalBranchId,
        seller_id || null,
        validGuideId,
        agency_id || null,
        product,
        quantity,
        currency,
        total,
        merchandise_cost || 0,
        notes || null,
        is_street || false,
        payment_method || null,
        payments ? JSON.stringify(payments) : null,
        date,
        original_report_date || date,
        req.user.id
      ]
    );

    const capture = result.rows[0];
    
    // Parsear JSONB fields
    if (capture.payments) {
      capture.payments = typeof capture.payments === 'string' ? JSON.parse(capture.payments) : capture.payments;
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    res.status(201).json(capture);

    setImmediate(async () => {
      try {
        const io = getIO(req);
        const captureData = await loadQuickCaptureDetails(capture.id);
        logReportsOperation('quick_capture_create_committed', {
          captureId: capture.id,
          branchId: finalBranchId,
          userId: req.user.id
        });

        if (io && captureData) {
          if (finalBranchId) {
            io.to(`branch:${finalBranchId}`).emit('quick_capture_created', { capture: captureData });
          }
          io.to('master_admin').emit('quick_capture_created', { capture: captureData });
          if (req.user.id) {
            io.to(`user:${req.user.id}`).emit('quick_capture_created', { capture: captureData });
          }
        }
      } catch (postCommitError) {
        logReportsOperation('quick_capture_create_post_commit_failed', {
          captureId: capture.id,
          message: postCommitError.message
        });
        console.error('Captura rápida creada pero fallaron efectos post-commit:', postCommitError);
      }
    });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logReportsOperation('quick_capture_create_failed', {
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error creando captura rápida:', error);
    res.status(500).json({ error: 'Error al crear captura rápida', details: error.message });
  } finally {
    client.release();
  }
});

// Obtener capturas rápidas
router.get('/quick-captures', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, date_from, date_to, date, created_by } = req.query;

    const whereConditions = [];
    const params = [];
    let paramCount = 1;

    if (req.user.isMasterAdmin) {
      if (branch_id) {
        whereConditions.push(`qc.branch_id = $${paramCount}`);
        params.push(branch_id);
        paramCount++;
      }
    } else {
      // Usuarios normales: obtener capturas de su sucursal O capturas creadas por ellos (independientemente de la sucursal)
      // Esto permite que un usuario vea sus capturas en diferentes computadoras/sucursales
      let userScopeCondition = `(qc.branch_id = $${paramCount}`;
      params.push(req.user.branchId);
      paramCount++;
      
      // Si el usuario tiene ID, también incluir sus capturas creadas por él
      if (req.user.id) {
        userScopeCondition += ` OR qc.created_by = $${paramCount}`;
        params.push(req.user.id);
        paramCount++;
      }
      userScopeCondition += ')';
      whereConditions.push(userScopeCondition);
    }

    // Filtro por fecha específica
    if (date) {
      whereConditions.push(`(qc.date = $${paramCount} OR qc.original_report_date = $${paramCount})`);
      params.push(date);
      paramCount++;
    } else {
      // Filtro por rango de fechas
      if (date_from) {
        whereConditions.push(`COALESCE(qc.original_report_date, qc.date) >= $${paramCount}`);
        params.push(date_from);
        paramCount++;
      }
      if (date_to) {
        whereConditions.push(`COALESCE(qc.original_report_date, qc.date) <= $${paramCount}`);
        params.push(date_to);
        paramCount++;
      }
    }

    // Filtro opcional por creador
    if (created_by) {
      whereConditions.push(`qc.created_by = $${paramCount}`);
      params.push(created_by);
      paramCount++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT 
        qc.*,
        b.name as branch_name,
        s.name as seller_name,
        g.name as guide_name,
        a.name as agency_name
      FROM quick_captures qc
      LEFT JOIN branches b ON qc.branch_id = b.id
      LEFT JOIN catalog_sellers s ON qc.seller_id = s.id
      LEFT JOIN catalog_guides g ON qc.guide_id = g.id
      LEFT JOIN catalog_agencies a ON qc.agency_id = a.id
      ${whereClause}
      ORDER BY qc.date DESC, qc.created_at DESC`,
      params
    );

    // Parsear JSONB fields
    const captures = result.rows.map(row => ({
      ...row,
      payments: row.payments ? (typeof row.payments === 'string' ? JSON.parse(row.payments) : row.payments) : null
    }));

    res.json(captures);
  } catch (error) {
    console.error('Error obteniendo capturas rápidas:', error);
    res.status(500).json({ error: 'Error al obtener capturas rápidas', details: error.message });
  }
});

// Actualizar captura rápida
router.put('/quick-captures/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updateData = req.body;
    logReportsOperation('quick_capture_update_started', {
      captureId: id,
      userId: req.user.id
    });

    // Verificar que existe y tiene acceso
    const existingResult = await client.query(
      'SELECT branch_id FROM quick_captures WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Captura no encontrada' });
    }

    const existing = existingResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && existing.branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'No tienes acceso a esta captura' });
    }

    // Construir query de actualización
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'seller_id', 'guide_id', 'agency_id', 'product', 'quantity', 'currency',
      'total', 'merchandise_cost', 'notes', 'is_street', 'payment_method',
      'payments', 'date', 'original_report_date'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'payments' && updateData[field]) {
          fields.push(`${field} = $${paramCount}`);
          values.push(JSON.stringify(updateData[field]));
        } else if (field === 'guide_id') {
          if (updateData[field] && !isValidUUID(updateData[field])) {
            console.warn(`⚠️ guide_id inválido ignorado (PUT /quick-captures): "${updateData[field]}"`);
            fields.push(`${field} = $${paramCount}`);
            values.push(null);
          } else {
            fields.push(`${field} = $${paramCount}`);
            values.push(updateData[field]);
          }
        } else {
          fields.push(`${field} = $${paramCount}`);
          values.push(updateData[field]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) {
      await safeRollback(client);
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `UPDATE quick_captures SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await client.query(sql, values);

    // Parsear JSONB
    const updated = result.rows[0];
    if (updated.payments) {
      updated.payments = typeof updated.payments === 'string' ? JSON.parse(updated.payments) : updated.payments;
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    res.json(updated);

    setImmediate(async () => {
      try {
        const io = getIO(req);
        const captureData = await loadQuickCaptureDetails(id);
        logReportsOperation('quick_capture_update_committed', {
          captureId: id,
          branchId: updated.branch_id,
          userId: req.user.id
        });

        if (io && captureData) {
          if (updated.branch_id) {
            io.to(`branch:${updated.branch_id}`).emit('quick_capture_updated', { capture: captureData });
          }
          io.to('master_admin').emit('quick_capture_updated', { capture: captureData });
          if (updated.created_by) {
            io.to(`user:${updated.created_by}`).emit('quick_capture_updated', { capture: captureData });
          }
        }
      } catch (postCommitError) {
        logReportsOperation('quick_capture_update_post_commit_failed', {
          captureId: id,
          message: postCommitError.message
        });
        console.error('Captura rápida actualizada pero fallaron efectos post-commit:', postCommitError);
      }
    });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logReportsOperation('quick_capture_update_failed', {
      captureId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error actualizando captura rápida:', error);
    res.status(500).json({ error: 'Error al actualizar captura rápida', details: error.message });
  } finally {
    client.release();
  }
});

// Eliminar captura rápida
router.delete('/quick-captures/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    logReportsOperation('quick_capture_delete_started', {
      captureId: id,
      userId: req.user.id
    });

    // Verificar que existe y tiene acceso
    const existingResult = await client.query(
      'SELECT branch_id FROM quick_captures WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Captura no encontrada' });
    }

    const existing = existingResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && existing.branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'No tienes acceso a esta captura' });
    }

    // Obtener created_by antes de eliminar para emitir el evento
    const captureInfo = await client.query(
      'SELECT created_by, branch_id FROM quick_captures WHERE id = $1',
      [id]
    );
    const captureData = captureInfo.rows[0];

    await client.query('DELETE FROM quick_captures WHERE id = $1', [id]);

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      const io = getIO(req);
      logReportsOperation('quick_capture_delete_committed', {
        captureId: id,
        branchId: captureData?.branch_id,
        userId: req.user.id
      });

      if (io && captureData) {
        if (captureData.branch_id) {
          io.to(`branch:${captureData.branch_id}`).emit('quick_capture_deleted', { capture_id: id });
        }
        io.to('master_admin').emit('quick_capture_deleted', { capture_id: id });
        if (captureData.created_by) {
          io.to(`user:${captureData.created_by}`).emit('quick_capture_deleted', { capture_id: id });
        }
      }
    } catch (postCommitError) {
      logReportsOperation('quick_capture_delete_post_commit_failed', {
        captureId: id,
        message: postCommitError.message
      });
      console.error('Captura rápida eliminada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json({ message: 'Captura eliminada correctamente' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logReportsOperation('quick_capture_delete_failed', {
      captureId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando captura rápida:', error);
    res.status(500).json({ error: 'Error al eliminar captura rápida', details: error.message });
  } finally {
    client.release();
  }
});

// ============================================
// REPORTES ARCHIVADOS (Archived Quick Capture Reports)
// ============================================

// Guardar reporte archivado diario
router.post('/archived-quick-captures', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const {
      report_date,
      branch_id,
      total_captures,
      total_quantity,
      total_sales_mxn,
      total_cogs,
      total_commissions,
      total_arrival_costs,
      total_operating_costs,
      variable_costs_daily,
      fixed_costs_prorated,
      bank_commissions,
      gross_profit,
      net_profit,
      exchange_rates,
      captures,
      daily_summary,
      seller_commissions,
      guide_commissions,
      arrivals,
      metrics
    } = req.body || {};

    logReportsOperation('archived_report_save_started', {
      userId: req.user.id,
      branchId: branch_id || req.user.branchId,
      reportDate: report_date
    });

    if (!report_date) {
      await safeRollback(client, 'reports');
      return res.status(400).json({ error: 'report_date es requerido' });
    }

    const finalBranchId = branch_id || req.user.branchId;

    // Logging detallado para diagnóstico
    debugReportsLog('📤 [POST /archived-quick-captures] Guardando reporte archivado');
    debugReportsLog(`   Usuario: ${req.user.id} (${req.user.username})`);
    debugReportsLog(`   Sucursal: ${finalBranchId}`);
    debugReportsLog(`   Fecha reporte: ${report_date}`);
    debugReportsLog(`   Capturas: ${total_captures || 0}`);

    // Verificar si ya existe un reporte para esta fecha y sucursal
    const existingResult = await client.query(
      'SELECT id FROM archived_quick_capture_reports WHERE report_date = $1 AND branch_id = $2 FOR UPDATE',
      [report_date, finalBranchId]
    );
    
    debugReportsLog(`   🔍 Reporte existente: ${existingResult.rows.length > 0 ? 'Sí (ID: ' + existingResult.rows[0].id + ')' : 'No'}`);

    let result;
    if (existingResult.rows.length > 0) {
      // Actualizar reporte existente
      const existingId = existingResult.rows[0].id;
      result = await client.query(
        `UPDATE archived_quick_capture_reports SET
          total_captures = $1,
          total_quantity = $2,
          total_sales_mxn = $3,
          total_cogs = $4,
          total_commissions = $5,
          total_arrival_costs = $6,
          total_operating_costs = $7,
          variable_costs_daily = $8,
          fixed_costs_prorated = $9,
          bank_commissions = $10,
          gross_profit = $11,
          net_profit = $12,
          exchange_rates = $13,
          captures = $14,
          daily_summary = $15,
          seller_commissions = $16,
          guide_commissions = $17,
          arrivals = $18,
          metrics = $19,
          archived_at = CURRENT_TIMESTAMP,
          archived_by = $20,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $21
        RETURNING *`,
        [
          total_captures || 0,
          total_quantity || 0,
          total_sales_mxn || 0,
          total_cogs || 0,
          total_commissions || 0,
          total_arrival_costs || 0,
          total_operating_costs || 0,
          variable_costs_daily || 0,
          fixed_costs_prorated || 0,
          bank_commissions || 0,
          gross_profit || 0,
          net_profit || 0,
          exchange_rates ? JSON.stringify(exchange_rates) : null,
          captures ? JSON.stringify(captures) : null,
          daily_summary ? JSON.stringify(daily_summary) : null,
          seller_commissions ? JSON.stringify(seller_commissions) : null,
          guide_commissions ? JSON.stringify(guide_commissions) : null,
          arrivals ? JSON.stringify(arrivals) : null,
          metrics ? JSON.stringify(metrics) : null,
          req.user.id,
          existingId
        ]
      );
    } else {
      // Crear nuevo reporte
      result = await client.query(
        `INSERT INTO archived_quick_capture_reports (
          report_date, branch_id, total_captures, total_quantity, total_sales_mxn,
          total_cogs, total_commissions, total_arrival_costs, total_operating_costs,
          variable_costs_daily, fixed_costs_prorated, bank_commissions,
          gross_profit, net_profit, exchange_rates, captures, daily_summary,
          seller_commissions, guide_commissions, arrivals, metrics, archived_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *`,
        [
          report_date,
          finalBranchId,
          total_captures || 0,
          total_quantity || 0,
          total_sales_mxn || 0,
          total_cogs || 0,
          total_commissions || 0,
          total_arrival_costs || 0,
          total_operating_costs || 0,
          variable_costs_daily || 0,
          fixed_costs_prorated || 0,
          bank_commissions || 0,
          gross_profit || 0,
          net_profit || 0,
          exchange_rates ? JSON.stringify(exchange_rates) : null,
          captures ? JSON.stringify(captures) : null,
          daily_summary ? JSON.stringify(daily_summary) : null,
          seller_commissions ? JSON.stringify(seller_commissions) : null,
          guide_commissions ? JSON.stringify(guide_commissions) : null,
          arrivals ? JSON.stringify(arrivals) : null,
          metrics ? JSON.stringify(metrics) : null,
          req.user.id
        ]
      );
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    // Parsear JSONB fields
    const report = result.rows[0];
    const parsedReport = {
      ...report,
      exchange_rates: report.exchange_rates ? (typeof report.exchange_rates === 'string' ? JSON.parse(report.exchange_rates) : report.exchange_rates) : null,
      captures: report.captures ? (typeof report.captures === 'string' ? JSON.parse(report.captures) : report.captures) : null,
      daily_summary: report.daily_summary ? (typeof report.daily_summary === 'string' ? JSON.parse(report.daily_summary) : report.daily_summary) : null,
      seller_commissions: report.seller_commissions ? (typeof report.seller_commissions === 'string' ? JSON.parse(report.seller_commissions) : report.seller_commissions) : null,
      guide_commissions: report.guide_commissions ? (typeof report.guide_commissions === 'string' ? JSON.parse(report.guide_commissions) : report.guide_commissions) : null,
      arrivals: report.arrivals ? (typeof report.arrivals === 'string' ? JSON.parse(report.arrivals) : report.arrivals) : null,
      metrics: report.metrics ? (typeof report.metrics === 'string' ? JSON.parse(report.metrics) : report.metrics) : null
    };

    // Logging del reporte guardado
    debugReportsLog(`   ✅ Reporte guardado: ID=${parsedReport.id}, Fecha=${parsedReport.report_date}, Branch=${parsedReport.branch_id}, Archived_by=${parsedReport.archived_by}`);

    try {
      const io = getIO(req);
      if (io) {
        const isUpdate = existingResult.rows.length > 0;
        const eventName = isUpdate ? 'archived_report_updated' : 'archived_report_created';
        logReportsOperation('archived_report_save_committed', {
          reportId: parsedReport.id,
          branchId: finalBranchId,
          reportDate: parsedReport.report_date,
          isUpdate
        });
        
        // 1. Emitir a la sucursal del reporte
        if (finalBranchId) {
          io.to(`branch:${finalBranchId}`).emit(eventName, { report: parsedReport });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a branch:${finalBranchId}`);
        }
        
        // 2. Emitir al master admin (ve todos los reportes de todas las sucursales)
        io.to('master_admin').emit(eventName, { report: parsedReport });
        debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a master_admin`);
        
        // 3. Emitir al usuario que archivó el reporte (para ver en otras computadoras)
        if (req.user.id) {
          io.to(`user:${req.user.id}`).emit(eventName, { report: parsedReport });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a user:${req.user.id}`);
        }
      } else {
        debugReportsWarn('⚠️ Socket.IO no disponible para emitir eventos de reporte archivado');
      }
    } catch (socketError) {
      logReportsOperation('archived_report_save_post_commit_failed', {
        reportDate,
        branchId: finalBranchId,
        message: socketError.message
      });
      debugReportsWarn('⚠️ Error emitiendo evento Socket.IO para reporte archivado:', socketError);
      // No bloquear la respuesta si falla la emisión del evento
    }

    res.status(existingResult.rows.length > 0 ? 200 : 201).json(parsedReport);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client, 'reports');
    }
    logReportsOperation('archived_report_save_failed', {
      userId: req.user.id,
      reportDate: req.body?.report_date,
      code: error?.code,
      message: error?.message
    });
    console.error('Error guardando reporte archivado:', error);
    res.status(500).json({ error: 'Error al guardar reporte archivado', details: error.message });
  } finally {
    client.release();
  }
});

// Obtener reportes archivados
router.get('/archived-quick-captures', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, date_from, date_to, date, limit = 50, offset = 0 } = req.query;

    // Logging detallado para diagnóstico
    debugReportsLog('📥 [GET /archived-quick-captures] Solicitud recibida');
    debugReportsLog(`   Usuario: ${req.user.id} (${req.user.username})`);
    debugReportsLog(`   Sucursal: ${req.user.branchId}`);
    debugReportsLog(`   Master Admin: ${req.user.isMasterAdmin}`);
    debugReportsLog(`   Query params:`, { branch_id, date_from, date_to, date, limit, offset });

    // Diagnósticos pesados solo en modo debug explícito
    if (isDebugReports) {
      const totalCheck = await query(
        'SELECT COUNT(*) as total FROM archived_quick_capture_reports'
      );
      debugReportsLog(`   📊 Total reportes en BD: ${totalCheck.rows[0]?.total || 0}`);

      if (req.user.branchId) {
        const branchCheck = await query(
          'SELECT COUNT(*) as total FROM archived_quick_capture_reports WHERE branch_id = $1',
          [req.user.branchId]
        );
        debugReportsLog(`   📊 Reportes de sucursal ${req.user.branchId}: ${branchCheck.rows[0]?.total || 0}`);
      }

      if (req.user.id) {
        const userCheck = await query(
          'SELECT COUNT(*) as total FROM archived_quick_capture_reports WHERE archived_by = $1',
          [req.user.id]
        );
        debugReportsLog(`   📊 Reportes archivados por usuario ${req.user.id}: ${userCheck.rows[0]?.total || 0}`);
      }
    }

    let sql = `
      SELECT 
        aqr.*,
        b.name as branch_name
      FROM archived_quick_capture_reports aqr
      LEFT JOIN branches b ON aqr.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    // NUEVA LÓGICA: Filtrar SOLO por branch_id y report_date (fecha)
    // Esto permite que todos los usuarios de la misma sucursal vean los mismos reportes archivados,
    // independientemente de quién los archivó. Los reportes se filtran por fecha para evitar mostrar todos.
    if (req.user.isMasterAdmin) {
      // Master admin puede ver todos los reportes, o filtrar por branch_id si se especifica
      if (branch_id) {
        sql += ` AND aqr.branch_id = $${paramCount}`;
        params.push(branch_id);
        paramCount++;
        debugReportsLog(`   🔍 Filtro Master Admin: branch_id = ${branch_id}`);
      } else {
        debugReportsLog(`   🔍 Master Admin: Sin filtro de sucursal (mostrando todos)`);
      }
    } else {
      // Usuarios normales: mostrar reportes de su sucursal SOLO
      // NO usar archived_by para el filtrado - todos los usuarios de la sucursal ven los mismos reportes
      if (req.user.branchId) {
        sql += ` AND aqr.branch_id = $${paramCount}`;
        params.push(req.user.branchId);
        paramCount++;
        debugReportsLog(`   🔍 Filtro Usuario: branch_id = ${req.user.branchId} (todos los reportes de la sucursal)`);
      } else {
        debugReportsWarn(`   ⚠️ Usuario sin branchId, no se pueden filtrar reportes`);
        // No devolver ningún reporte si no hay información de sucursal
        sql += ` AND 1=0`;
      }
    }

    // Filtro por fecha específica
    if (date) {
      sql += ` AND aqr.report_date = $${paramCount}`;
      params.push(date);
      paramCount++;
      debugReportsLog(`   🔍 Filtro fecha: report_date = ${date}`);
    } else {
      // Filtro por rango de fechas
      if (date_from) {
        sql += ` AND aqr.report_date >= $${paramCount}`;
        params.push(date_from);
        paramCount++;
        debugReportsLog(`   🔍 Filtro fecha desde: ${date_from}`);
      }
      if (date_to) {
        sql += ` AND aqr.report_date <= $${paramCount}`;
        params.push(date_to);
        paramCount++;
        debugReportsLog(`   🔍 Filtro fecha hasta: ${date_to}`);
      }
    }

    sql += ` ORDER BY aqr.report_date DESC, aqr.archived_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    debugReportsLog(`   📝 SQL Query: ${sql}`);
    debugReportsLog(`   📝 Parámetros:`, params);

    const result = await query(sql, params);
    
    debugReportsLog(`   ✅ Resultado: ${result.rows.length} reportes encontrados`);
    if (result.rows.length > 0) {
      debugReportsLog(`   📋 Fechas de reportes:`, result.rows.map(r => r.report_date).join(', '));
      debugReportsLog(`   📋 Branch IDs:`, result.rows.map(r => r.branch_id).join(', '));
      debugReportsLog(`   📋 Archived by:`, result.rows.map(r => r.archived_by).join(', '));
    }

    // Parsear JSONB fields
    const reports = result.rows.map(row => ({
      ...row,
      exchange_rates: row.exchange_rates ? (typeof row.exchange_rates === 'string' ? JSON.parse(row.exchange_rates) : row.exchange_rates) : null,
      captures: row.captures ? (typeof row.captures === 'string' ? JSON.parse(row.captures) : row.captures) : null,
      daily_summary: row.daily_summary ? (typeof row.daily_summary === 'string' ? JSON.parse(row.daily_summary) : row.daily_summary) : null,
      seller_commissions: row.seller_commissions ? (typeof row.seller_commissions === 'string' ? JSON.parse(row.seller_commissions) : row.seller_commissions) : null,
      guide_commissions: row.guide_commissions ? (typeof row.guide_commissions === 'string' ? JSON.parse(row.guide_commissions) : row.guide_commissions) : null,
      arrivals: row.arrivals ? (typeof row.arrivals === 'string' ? JSON.parse(row.arrivals) : row.arrivals) : null,
      metrics: row.metrics ? (typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics) : null
    }));

    res.json(reports);
  } catch (error) {
    console.error('Error obteniendo reportes archivados:', error);
    res.status(500).json({ error: 'Error al obtener reportes archivados', details: error.message });
  }
});

// Obtener un reporte archivado específico
router.get('/archived-quick-captures/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        aqr.*,
        b.name as branch_name
      FROM archived_quick_capture_reports aqr
      LEFT JOIN branches b ON aqr.branch_id = b.id
      WHERE aqr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte archivado no encontrado' });
    }

    const report = result.rows[0];

    // Verificar acceso por sucursal
    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    // Parsear JSONB fields
    const parsedReport = {
      ...report,
      exchange_rates: report.exchange_rates ? (typeof report.exchange_rates === 'string' ? JSON.parse(report.exchange_rates) : report.exchange_rates) : null,
      captures: report.captures ? (typeof report.captures === 'string' ? JSON.parse(report.captures) : report.captures) : null,
      daily_summary: report.daily_summary ? (typeof report.daily_summary === 'string' ? JSON.parse(report.daily_summary) : report.daily_summary) : null,
      seller_commissions: report.seller_commissions ? (typeof report.seller_commissions === 'string' ? JSON.parse(report.seller_commissions) : report.seller_commissions) : null,
      guide_commissions: report.guide_commissions ? (typeof report.guide_commissions === 'string' ? JSON.parse(report.guide_commissions) : report.guide_commissions) : null,
      arrivals: report.arrivals ? (typeof report.arrivals === 'string' ? JSON.parse(report.arrivals) : report.arrivals) : null,
      metrics: report.metrics ? (typeof report.metrics === 'string' ? JSON.parse(report.metrics) : report.metrics) : null
    };

    res.json(parsedReport);
  } catch (error) {
    console.error('Error obteniendo reporte archivado:', error);
    res.status(500).json({ error: 'Error al obtener reporte archivado', details: error.message });
  }
});

// Eliminar reporte archivado
router.delete('/archived-quick-captures/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    logReportsOperation('archived_report_delete_started', {
      reportId: id,
      userId: req.user.id
    });

    const checkResult = await client.query(
      'SELECT id, branch_id FROM archived_quick_capture_reports WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkResult.rows.length === 0) {
      await safeRollback(client, 'reports');
      return res.status(404).json({ error: 'Reporte archivado no encontrado' });
    }

    const report = checkResult.rows[0];

    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      await safeRollback(client, 'reports');
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    await client.query('DELETE FROM archived_quick_capture_reports WHERE id = $1', [id]);

    await client.query('COMMIT');
    transactionCommitted = true;

    res.json({ message: 'Reporte archivado eliminado correctamente', id });

    setImmediate(async () => {
      try {
        const io = getIO(req);
        logReportsOperation('archived_report_delete_committed', {
          reportId: id,
          branchId: report.branch_id,
          userId: req.user.id
        });
        if (io) {
          io.to(`branch:${report.branch_id}`).emit('archived_report_deleted', { report_id: id });
          io.to('master_admin').emit('archived_report_deleted', { report_id: id });
        }
      } catch (postCommitError) {
        logReportsOperation('archived_report_delete_post_commit_failed', {
          reportId: id,
          branchId: report.branch_id,
          message: postCommitError.message
        });
        debugReportsWarn('⚠️ Error emitiendo evento Socket.IO para reporte archivado eliminado:', postCommitError);
      }
    });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client, 'reports');
    }
    logReportsOperation('archived_report_delete_failed', {
      reportId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando reporte archivado:', error);
    res.status(500).json({ error: 'Error al eliminar reporte archivado', details: error.message });
  } finally {
    client.release();
  }
});

// ============================================
// REPORTES HISTÓRICOS (Historical Quick Capture Reports)
// ============================================

// Generar y guardar reporte histórico agregado
router.post('/historical-quick-captures', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const {
      period_type,
      period_name,
      date_from,
      date_to,
      branch_id,
      archived_report_ids
    } = req.body || {};

    logReportsOperation('historical_report_create_started', {
      userId: req.user.id,
      branchId: branch_id || req.user.branchId,
      periodType: period_type,
      dateFrom: date_from,
      dateTo: date_to
    });

    if (!period_type || !date_from || !date_to) {
      await safeRollback(client, 'reports');
      return res.status(400).json({ error: 'period_type, date_from y date_to son requeridos' });
    }

    if (new Date(date_from) > new Date(date_to)) {
      await safeRollback(client, 'reports');
      return res.status(400).json({ error: 'date_from no puede ser mayor que date_to' });
    }

    const finalBranchId = branch_id || req.user.branchId;

    // Verificar si ya existe un reporte histórico con los mismos parámetros
    const existingResult = await client.query(
      'SELECT id FROM historical_quick_capture_reports WHERE period_type = $1 AND date_from = $2 AND date_to = $3 AND branch_id = $4 FOR UPDATE',
      [period_type, date_from, date_to, finalBranchId]
    );

    if (existingResult.rows.length > 0) {
      await safeRollback(client, 'reports');
      return res.status(409).json({ 
        error: 'Ya existe un reporte histórico con estos parámetros',
        existing_id: existingResult.rows[0].id
      });
    }

    // Obtener reportes archivados del rango de fechas para calcular totales
    let archivedReportsSql = `
      SELECT * FROM archived_quick_capture_reports
      WHERE report_date >= $1 AND report_date <= $2
    `;
    const archivedParams = [date_from, date_to];
    let archivedParamCount = 3;

    if (finalBranchId) {
      archivedReportsSql += ` AND branch_id = $${archivedParamCount}`;
      archivedParams.push(finalBranchId);
      archivedParamCount++;
    }

    archivedReportsSql += ` ORDER BY report_date ASC`;

  const archivedReportsResult = await client.query(archivedReportsSql, archivedParams);
    const archivedReports = archivedReportsResult.rows;

    // Calcular totales agregados
    let totalDays = 0;
    let totalCaptures = 0;
    let totalQuantity = 0;
    let totalSalesMXN = 0;
    let totalCOGS = 0;
    let totalCommissions = 0;
    let totalArrivalCosts = 0;
    let totalOperatingCosts = 0;
    let grossProfit = 0;
    let netProfit = 0;
    const dailySummary = [];

    archivedReports.forEach(report => {
      totalDays++;
      totalCaptures += parseInt(report.total_captures || 0);
      totalQuantity += parseInt(report.total_quantity || 0);
      totalSalesMXN += parseFloat(report.total_sales_mxn || 0);
      totalCOGS += parseFloat(report.total_cogs || 0);
      totalCommissions += parseFloat(report.total_commissions || 0);
      totalArrivalCosts += parseFloat(report.total_arrival_costs || 0);
      totalOperatingCosts += parseFloat(report.total_operating_costs || 0);
      grossProfit += parseFloat(report.gross_profit || 0);
      netProfit += parseFloat(report.net_profit || 0);

      // Agregar a daily_summary
      dailySummary.push({
        date: report.report_date,
        captures: parseInt(report.total_captures || 0),
        sales_mxn: parseFloat(report.total_sales_mxn || 0),
        gross_profit: parseFloat(report.gross_profit || 0),
        net_profit: parseFloat(report.net_profit || 0)
      });
    });

    // Calcular métricas agregadas (se calcularán en el frontend y se enviarán aquí)
    // Por ahora, metrics será null y se calculará en el frontend antes de enviar

    // Crear reporte histórico
    const result = await client.query(
      `INSERT INTO historical_quick_capture_reports (
        period_type, period_name, date_from, date_to, branch_id,
        total_days, total_captures, total_quantity, total_sales_mxn,
        total_cogs, total_commissions, total_arrival_costs, total_operating_costs,
        gross_profit, net_profit, daily_summary, archived_report_ids, metrics, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        period_type,
        period_name || null,
        date_from,
        date_to,
        finalBranchId,
        totalDays,
        totalCaptures,
        totalQuantity,
        totalSalesMXN,
        totalCOGS,
        totalCommissions,
        totalArrivalCosts,
        totalOperatingCosts,
        grossProfit,
        netProfit,
        dailySummary.length > 0 ? JSON.stringify(dailySummary) : null,
        archived_report_ids && archived_report_ids.length > 0 ? archived_report_ids : null,
        req.body.metrics ? JSON.stringify(req.body.metrics) : null,
        req.user.id
      ]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    // Parsear JSONB fields
    const report = result.rows[0];
    const parsedReport = {
      ...report,
      daily_summary: report.daily_summary ? (typeof report.daily_summary === 'string' ? JSON.parse(report.daily_summary) : report.daily_summary) : null,
      archived_report_ids: report.archived_report_ids || [],
      metrics: report.metrics ? (typeof report.metrics === 'string' ? JSON.parse(report.metrics) : report.metrics) : null
    };

    try {
      const io = getIO(req);
      if (io) {
        const eventName = 'historical_report_created';
        logReportsOperation('historical_report_create_committed', {
          reportId: parsedReport.id,
          branchId: finalBranchId,
          periodType: period_type,
          dateFrom: date_from,
          dateTo: date_to
        });
        
        // 1. Emitir a la sucursal del reporte
        if (finalBranchId) {
          io.to(`branch:${finalBranchId}`).emit(eventName, { report: parsedReport });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a branch:${finalBranchId}`);
        }
        
        // 2. Emitir al master admin (ve todos los reportes de todas las sucursales)
        io.to('master_admin').emit(eventName, { report: parsedReport });
        debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a master_admin`);
        
        // 3. Emitir al usuario que creó el reporte (para ver en otras computadoras)
        if (req.user.id) {
          io.to(`user:${req.user.id}`).emit(eventName, { report: parsedReport });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a user:${req.user.id}`);
        }
      } else {
        debugReportsWarn('⚠️ Socket.IO no disponible para emitir eventos de reporte histórico');
      }
    } catch (socketError) {
      logReportsOperation('historical_report_create_post_commit_failed', {
        branchId: finalBranchId,
        periodType: period_type,
        message: socketError.message
      });
      debugReportsWarn('⚠️ Error emitiendo evento Socket.IO para reporte histórico:', socketError);
      // No bloquear la respuesta si falla la emisión del evento
    }

    res.status(201).json(parsedReport);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client, 'reports');
    }
    logReportsOperation('historical_report_create_failed', {
      userId: req.user.id,
      periodType: req.body?.period_type,
      dateFrom: req.body?.date_from,
      dateTo: req.body?.date_to,
      code: error?.code,
      message: error?.message
    });
    console.error('Error generando reporte histórico:', error);
    res.status(500).json({ error: 'Error al generar reporte histórico', details: error.message });
  } finally {
    client.release();
  }
});

// Obtener reportes históricos
router.get('/historical-quick-captures', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, period_type, date_from, date_to, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        hqr.*,
        b.name as branch_name
      FROM historical_quick_capture_reports hqr
      LEFT JOIN branches b ON hqr.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branch_id) {
        sql += ` AND hqr.branch_id = $${paramCount}`;
        params.push(branch_id);
        paramCount++;
      }
    } else {
      if (req.user.branchId) {
        sql += ` AND hqr.branch_id = $${paramCount}`;
        params.push(req.user.branchId);
        paramCount++;
      }
    }

    // Filtro por tipo de período
    if (period_type) {
      sql += ` AND hqr.period_type = $${paramCount}`;
      params.push(period_type);
      paramCount++;
    }

    // Filtro por rango de fechas
    if (date_from) {
      sql += ` AND hqr.date_to >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }
    if (date_to) {
      sql += ` AND hqr.date_from <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    sql += ` ORDER BY hqr.date_from DESC, hqr.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    // Parsear JSONB fields
    const reports = result.rows.map(row => ({
      ...row,
      daily_summary: row.daily_summary ? (typeof row.daily_summary === 'string' ? JSON.parse(row.daily_summary) : row.daily_summary) : null,
      archived_report_ids: row.archived_report_ids || [],
      metrics: row.metrics ? (typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics) : null
    }));

    res.json(reports);
  } catch (error) {
    console.error('Error obteniendo reportes históricos:', error);
    res.status(500).json({ error: 'Error al obtener reportes históricos', details: error.message });
  }
});

// Obtener un reporte histórico específico
router.get('/historical-quick-captures/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        hqr.*,
        b.name as branch_name
      FROM historical_quick_capture_reports hqr
      LEFT JOIN branches b ON hqr.branch_id = b.id
      WHERE hqr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte histórico no encontrado' });
    }

    const report = result.rows[0];

    // Verificar acceso por sucursal
    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    // Parsear JSONB fields
    const parsedReport = {
      ...report,
      daily_summary: report.daily_summary ? (typeof report.daily_summary === 'string' ? JSON.parse(report.daily_summary) : report.daily_summary) : null,
      archived_report_ids: report.archived_report_ids || [],
      metrics: report.metrics ? (typeof report.metrics === 'string' ? JSON.parse(report.metrics) : report.metrics) : null
    };

    res.json(parsedReport);
  } catch (error) {
    console.error('Error obteniendo reporte histórico:', error);
    res.status(500).json({ error: 'Error al obtener reporte histórico', details: error.message });
  }
});

// Eliminar reporte histórico
router.delete('/historical-quick-captures/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    logReportsOperation('historical_report_delete_started', {
      reportId: id,
      userId: req.user.id
    });

    // Verificar que el reporte existe y el usuario tiene acceso
    const checkResult = await client.query(
      'SELECT branch_id, created_by FROM historical_quick_capture_reports WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (checkResult.rows.length === 0) {
      await safeRollback(client, 'reports');
      return res.status(404).json({ error: 'Reporte histórico no encontrado' });
    }

    const report = checkResult.rows[0];

    // Verificar permisos: solo el creador o master_admin puede eliminar
    if (!req.user.isMasterAdmin && report.created_by !== req.user.id) {
      await safeRollback(client, 'reports');
      return res.status(403).json({ error: 'No tienes permiso para eliminar este reporte' });
    }

    // Verificar acceso por sucursal
    if (!req.user.isMasterAdmin && report.branch_id !== req.user.branchId) {
      await safeRollback(client, 'reports');
      return res.status(403).json({ error: 'No tienes acceso a este reporte' });
    }

    const reportToDelete = checkResult.rows[0];
    
    await client.query('DELETE FROM historical_quick_capture_reports WHERE id = $1', [id]);

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      const io = getIO(req);
      if (io) {
        const eventName = 'historical_report_deleted';
        logReportsOperation('historical_report_delete_committed', {
          reportId: id,
          branchId: reportToDelete.branch_id,
          userId: req.user.id
        });
        
        // 1. Emitir a la sucursal del reporte
        if (reportToDelete.branch_id) {
          io.to(`branch:${reportToDelete.branch_id}`).emit(eventName, { report_id: id });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a branch:${reportToDelete.branch_id}`);
        }
        
        // 2. Emitir al master admin (ve todos los reportes de todas las sucursales)
        io.to('master_admin').emit(eventName, { report_id: id });
        debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a master_admin`);
        
        // 3. Emitir al usuario que creó el reporte (para ver en otras computadoras)
        if (reportToDelete.created_by) {
          io.to(`user:${reportToDelete.created_by}`).emit(eventName, { report_id: id });
          debugReportsLog(`📡 [Socket.IO] Evento ${eventName} emitido a user:${reportToDelete.created_by}`);
        }
      } else {
        debugReportsWarn('⚠️ Socket.IO no disponible para emitir eventos de reporte histórico');
      }
    } catch (socketError) {
      logReportsOperation('historical_report_delete_post_commit_failed', {
        reportId: id,
        branchId: reportToDelete.branch_id,
        message: socketError.message
      });
      debugReportsWarn('⚠️ Error emitiendo evento Socket.IO para reporte histórico:', socketError);
      // No bloquear la respuesta si falla la emisión del evento
    }

    res.json({ message: 'Reporte histórico eliminado correctamente' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client, 'reports');
    }
    logReportsOperation('historical_report_delete_failed', {
      reportId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando reporte histórico:', error);
    res.status(500).json({ error: 'Error al eliminar reporte histórico', details: error.message });
  } finally {
    client.release();
  }
});

export default router;
