import express from 'express';
import { randomUUID } from 'crypto';
import { query } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

async function resolveAgencyId(agencyId) {
  if (!agencyId) return null;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(agencyId).trim());
  if (isUUID) return agencyId;
  const r = await query('SELECT id FROM catalog_agencies WHERE code = $1', [String(agencyId).trim()]);
  return r.rows.length ? r.rows[0].id : null;
}

// Listar reglas de llegadas (GET /api/arrival-rules)
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id } = req.query;
    const branchId = branch_id || req.user?.branchId;

    let sql = 'SELECT * FROM arrival_rate_rules WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (req.user?.isMasterAdmin) {
      if (branchId && branchId !== 'all') {
        sql += ` AND (branch_id = $${paramCount} OR branch_id IS NULL)`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND (branch_id = $${paramCount} OR branch_id IS NULL)`;
      params.push(req.user?.branchId);
      paramCount++;
    }

    sql += ' ORDER BY agency_id, branch_id NULLS LAST, min_passengers ASC, created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reglas de llegadas:', error);
    res.status(500).json({ error: 'Error al obtener reglas de llegadas' });
  }
});

// Obtener una regla por ID (GET /api/arrival-rules/:id)
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM arrival_rate_rules WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de llegada no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo regla de llegada:', error);
    res.status(500).json({ error: 'Error al obtener regla de llegada' });
  }
});

// Crear regla de llegada (POST /api/arrival-rules)
router.post('/', requireBranchAccess, [
  body('agency_id').notEmpty().withMessage('Agencia requerida'),
  body('fee_type').optional().isIn(['flat', 'per_passenger']).withMessage('Tipo de tarifa inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      id,
      agency_id: rawAgencyId,
      branch_id,
      unit_type,
      fee_type,
      flat_fee,
      rate_per_passenger,
      extra_per_passenger,
      min_passengers,
      max_passengers,
      active_from,
      active_until,
      notes
    } = req.body;

    const agency_id = await resolveAgencyId(rawAgencyId);
    if (!agency_id) {
      return res.status(400).json({
        error: 'La agencia especificada no existe',
        details: `agency_id: ${rawAgencyId} no encontrada por id ni por código`
      });
    }

    const finalBranchId = branch_id || (req.user?.isMasterAdmin ? null : req.user?.branchId);
    const ruleId = id || randomUUID();

    const existing = await query('SELECT id FROM arrival_rate_rules WHERE id = $1', [ruleId]);

    if (existing.rows.length > 0) {
      const result = await query(
        `UPDATE arrival_rate_rules SET
          agency_id = $1,
          branch_id = $2,
          unit_type = $3,
          fee_type = $4,
          flat_fee = $5,
          rate_per_passenger = $6,
          extra_per_passenger = $7,
          min_passengers = $8,
          max_passengers = $9,
          active_from = $10,
          active_until = $11,
          notes = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
        RETURNING *`,
        [
          agency_id,
          finalBranchId,
          unit_type || null,
          fee_type || 'flat',
          flat_fee || 0,
          rate_per_passenger || 0,
          extra_per_passenger || 0,
          min_passengers ?? 1,
          max_passengers || null,
          active_from,
          active_until || null,
          notes || '',
          ruleId
        ]
      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO arrival_rate_rules (
          id, agency_id, branch_id, unit_type, fee_type, flat_fee,
          rate_per_passenger, extra_per_passenger, min_passengers, max_passengers,
          active_from, active_until, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          ruleId,
          agency_id,
          finalBranchId,
          unit_type || null,
          fee_type || 'flat',
          flat_fee || 0,
          rate_per_passenger || 0,
          extra_per_passenger || 0,
          min_passengers ?? 1,
          max_passengers || null,
          active_from,
          active_until || null,
          notes || ''
        ]
      );
      res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error guardando regla de llegada:', error.message);
    if (error.code === '42703') {
      return res.status(500).json({
        error: 'Error de base de datos: La tabla arrival_rate_rules necesita ser migrada.'
      });
    }
    if (error.message && error.message.includes('invalid input syntax')) {
      return res.status(400).json({
        error: 'El ID de agencia o sucursal no tiene el formato correcto (UUID o código de agencia).'
      });
    }
    res.status(500).json({ error: 'Error al guardar regla de llegada', details: error.message });
  }
});

// Actualizar regla de llegada (PUT /api/arrival-rules/:id)
router.put('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      agency_id: rawAgencyId,
      branch_id,
      unit_type,
      fee_type,
      flat_fee,
      rate_per_passenger,
      extra_per_passenger,
      min_passengers,
      max_passengers,
      active_from,
      active_until,
      notes
    } = req.body;

    const agency_id = rawAgencyId !== undefined ? await resolveAgencyId(rawAgencyId) : undefined;
    const finalBranchId = branch_id !== undefined ? branch_id : (req.user?.isMasterAdmin ? null : req.user?.branchId);

    const result = await query(
      `UPDATE arrival_rate_rules SET
        agency_id = COALESCE($1, agency_id),
        branch_id = COALESCE($2, branch_id),
        unit_type = COALESCE($3, unit_type),
        fee_type = COALESCE($4, fee_type),
        flat_fee = COALESCE($5, flat_fee),
        rate_per_passenger = COALESCE($6, rate_per_passenger),
        extra_per_passenger = COALESCE($7, extra_per_passenger),
        min_passengers = COALESCE($8, min_passengers),
        max_passengers = COALESCE($9, max_passengers),
        active_from = COALESCE($10, active_from),
        active_until = COALESCE($11, active_until),
        notes = COALESCE($12, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *`,
      [
        agency_id,
        finalBranchId,
        unit_type || null,
        fee_type || null,
        flat_fee ?? null,
        rate_per_passenger ?? null,
        extra_per_passenger ?? null,
        min_passengers ?? null,
        max_passengers ?? null,
        active_from || null,
        active_until || null,
        notes ?? null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de llegada no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando regla de llegada:', error);
    res.status(500).json({ error: 'Error al actualizar regla de llegada' });
  }
});

// Eliminar regla de llegada (DELETE /api/arrival-rules/:id)
router.delete('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM arrival_rate_rules WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regla de llegada no encontrada' });
    }
    res.json({ message: 'Regla de llegada eliminada', rule: result.rows[0] });
  } catch (error) {
    console.error('Error eliminando regla de llegada:', error);
    res.status(500).json({ error: 'Error al eliminar regla de llegada' });
  }
});

export default router;
