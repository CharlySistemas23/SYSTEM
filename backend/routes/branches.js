import express from 'express';
import { query, getClient } from '../config/database.js';
import { authenticateOptional, requireMasterAdmin } from '../middleware/authOptional.js';
import { body, validationResult } from 'express-validator';
import { emitBranchUpdate } from '../socket/socketHandler.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const router = express.Router();

// Obtener todas las sucursales (admin maestro ve todas, otros solo las suyas)
router.get('/', authenticateOptional, async (req, res) => {
  try {
    let branchesResult;

    if (req.user.isMasterAdmin) {
      // Admin maestro ve todas las sucursales
      branchesResult = await query(
        'SELECT * FROM branches ORDER BY name'
      );
    } else {
      // Otros usuarios solo ven sus sucursales ACTIVAS
      const branchIds = req.user.branchIds || [];
      if (branchIds.length === 0) {
        return res.json([]);
      }
      branchesResult = await query(
        'SELECT * FROM branches WHERE id = ANY($1) AND active = true ORDER BY name',
        [branchIds]
      );
    }

    res.json(branchesResult.rows);
  } catch (error) {
    console.error('Error obteniendo sucursales:', error);
    res.status(500).json({ error: 'Error al obtener sucursales' });
  }
});

// Obtener una sucursal por ID
router.get('/:id', authenticateOptional, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar acceso
    if (!req.user.isMasterAdmin) {
      const branchIds = req.user.branchIds || [];
      if (!branchIds.includes(id)) {
        return res.status(403).json({ error: 'No tienes acceso a esta sucursal' });
      }
    }

    const result = await query(
      'SELECT * FROM branches WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo sucursal:', error);
    res.status(500).json({ error: 'Error al obtener sucursal' });
  }
});

// Crear sucursal (solo admin maestro)
router.post('/', requireMasterAdmin, [
  body('code').notEmpty().withMessage('Código requerido'),
  body('name').notEmpty().withMessage('Nombre requerido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, address, phone, email, active = true } = req.body;

    const result = await query(
      `INSERT INTO branches (code, name, address, phone, email, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [code, name, address, phone, email, active]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'branch', $2, $3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ code, name })]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitBranchUpdate(io, 'created', result.rows[0]);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El código de sucursal ya existe' });
    }
    console.error('Error creando sucursal:', error);
    res.status(500).json({ error: 'Error al crear sucursal' });
  }
});

// Actualizar sucursal (solo admin maestro)
router.put('/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, address, phone, email, active } = req.body;

    const result = await query(
      `UPDATE branches
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           address = COALESCE($3, address),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           active = COALESCE($6, active)
       WHERE id = $7
       RETURNING *`,
      [code, name, address, phone, email, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'branch', $2, $3)`,
      [req.user.id, id, JSON.stringify(req.body)]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitBranchUpdate(io, 'updated', result.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando sucursal:', error);
    res.status(500).json({ error: 'Error al actualizar sucursal' });
  }
});

// Eliminar sucursal (solo admin maestro)
router.delete('/:id', requireMasterAdmin, async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    // Verificar que existe
    const branchResult = await client.query(
      'SELECT * FROM branches WHERE id = $1',
      [id]
    );

    if (branchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const branch = branchResult.rows[0];

    // No permitir eliminar la sucursal principal (MAIN)
    if (branch.code === 'MAIN') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se puede eliminar la sucursal principal' });
    }

    // Verificar dependencias críticas antes de eliminar
    const employeesCount = await client.query(
      'SELECT COUNT(*) as count FROM employees WHERE branch_id = $1 OR $1 = ANY(branch_ids)',
      [id]
    );

    const inventoryCount = await client.query(
      'SELECT COUNT(*) as count FROM inventory_items WHERE branch_id = $1',
      [id]
    );

    const salesCount = await client.query(
      'SELECT COUNT(*) as count FROM sales WHERE branch_id = $1',
      [id]
    );

    const hasCriticalData = 
      parseInt(employeesCount.rows[0].count) > 0 ||
      parseInt(inventoryCount.rows[0].count) > 0 ||
      parseInt(salesCount.rows[0].count) > 0;

    if (hasCriticalData) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'No se puede eliminar la sucursal porque tiene datos asociados',
        details: {
          employees: parseInt(employeesCount.rows[0].count),
          inventory: parseInt(inventoryCount.rows[0].count),
          sales: parseInt(salesCount.rows[0].count)
        }
      });
    }

    // Limpiar referencias en branch_ids de employees (array)
    await client.query(
      `UPDATE employees 
       SET branch_ids = array_remove(branch_ids, $1::uuid)
       WHERE $1::uuid = ANY(branch_ids)`,
      [id]
    );

    // Eliminar la sucursal
    await client.query('DELETE FROM branches WHERE id = $1', [id]);

    // Registrar en audit log (manejar error si falla, pero no bloquear)
    try {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'delete', 'branch', $2, $3)`,
        [req.user.id, id, JSON.stringify({ name: branch.name, code: branch.code })]
      );
    } catch (auditError) {
      console.warn('Error registrando en audit_log (no crítico):', auditError.message);
      // No hacer rollback por un error en audit_log
    }

    await client.query('COMMIT');

    // Emitir actualización en tiempo real
    if (io) {
      emitBranchUpdate(io, 'deleted', branch);
    }

    res.json({ 
      message: 'Sucursal eliminada correctamente',
      deleted: branch
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error eliminando sucursal:', error);
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') {
      return res.status(400).json({ 
        error: 'No se puede eliminar la sucursal porque tiene referencias en otras tablas',
        details: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Error al eliminar sucursal',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

export default router;
