import express from 'express';
import { query } from '../config/database.js';
import { requireMasterAdmin } from '../middleware/authOptional.js';
import bcrypt from 'bcryptjs';
import { emitEmployeeUpdate, emitUserUpdate } from '../socket/socketHandler.js';

let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const router = express.Router();

// Obtener empleados
router.get('/', async (req, res) => {
  try {
    let result;

    if (req.user.isMasterAdmin) {
      // Admin maestro ve todos los empleados con información de usuarios asociados (incl. permissions)
      result = await query(
        `SELECT e.*, b.name as branch_name, u.id as user_id, u.username, u.role as user_role, u.permissions as user_permissions, u.permissions_by_branch as user_permissions_by_branch, u.active as user_active
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         LEFT JOIN users u ON u.employee_id = e.id
         ORDER BY e.name`
      );
    } else {
      // Otros usuarios solo ven empleados de sus sucursales
      const branchIds = req.user.branchIds || [];
      if (branchIds.length === 0) {
        return res.json([]);
      }
      result = await query(
        `SELECT e.*, b.name as branch_name, u.id as user_id, u.username, u.role as user_role, u.permissions as user_permissions, u.permissions_by_branch as user_permissions_by_branch, u.active as user_active
         FROM employees e
         LEFT JOIN branches b ON e.branch_id = b.id
         LEFT JOIN users u ON u.employee_id = e.id
         WHERE e.branch_id = ANY($1) OR e.branch_id IS NULL
         ORDER BY e.name`,
        [branchIds]
      );
    }

    const rows = result.rows.map((row) => {
      const perms = row.user_permissions;
      const pbb = row.user_permissions_by_branch;
      return {
        ...row,
        user_permissions: perms != null && Array.isArray(perms) ? perms : [],
        user_permissions_by_branch: (pbb != null && typeof pbb === 'object') ? pbb : {}
      };
    });
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo empleados:', error);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

// Crear empleado (solo admin maestro)
router.post('/', requireMasterAdmin, async (req, res) => {
  try {
    const { code, barcode, name, email, phone, role, branch_id, branch_ids, active = true } = req.body;

    const result = await query(
      `INSERT INTO employees (code, barcode, name, email, phone, role, branch_id, branch_ids, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [code, barcode, name, email, phone, role, branch_id, branch_ids || [], active]
    );

    const employee = result.rows[0];
    if (io) {
      emitEmployeeUpdate(io, employee.branch_id, 'created', employee);
    }

    res.status(201).json(employee);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error creando empleado:', error);
    res.status(500).json({ error: 'Error al crear empleado' });
  }
});

// Actualizar empleado (solo admin maestro)
router.put('/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, barcode, name, email, phone, role, branch_id, branch_ids, active } = req.body;

    // Verificar que el empleado existe
    const existingResult = await query(
      'SELECT * FROM employees WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const result = await query(
      `UPDATE employees 
       SET code = $1, barcode = $2, name = $3, email = $4, phone = $5, 
           role = $6, branch_id = $7, branch_ids = $8, active = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [code, barcode, name, email, phone, role, branch_id, branch_ids || [], active, id]
    );

    // Si el rol cambió a master_admin o desde master_admin, actualizar también el usuario asociado
    if (role && role !== existingResult.rows[0].role) {
      const userResult = await query(
        'SELECT * FROM users WHERE employee_id = $1',
        [id]
      );

      if (userResult.rows.length > 0) {
        // Actualizar el rol del usuario para que coincida con el empleado
        await query(
          `UPDATE users 
           SET role = $1, updated_at = CURRENT_TIMESTAMP
           WHERE employee_id = $2`,
          [role, id]
        );
      }
    }

    const updatedEmployee = result.rows[0];
    if (io) {
      emitEmployeeUpdate(io, updatedEmployee.branch_id, 'updated', updatedEmployee);
    }

    res.json(updatedEmployee);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error actualizando empleado:', error);
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
});

// Eliminar empleado (solo admin maestro)
router.delete('/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM employees WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const deletedEmployee = result.rows[0];
    if (io) {
      emitEmployeeUpdate(io, deletedEmployee.branch_id, 'deleted', deletedEmployee);
    }

    res.json({ message: 'Empleado eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando empleado:', error);
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
});

// Crear usuario para empleado
router.post('/:employeeId/user', requireMasterAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { username, password, role, permissions } = req.body;

    // Verificar que el empleado existe
    const employeeResult = await query(
      'SELECT * FROM employees WHERE id = $1',
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const employee = employeeResult.rows[0];

    // Hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Usar el rol del empleado si no se especifica uno diferente
    const userRole = role || employee.role || 'employee';
    const permsArray = Array.isArray(permissions) ? permissions : [];

    const result = await query(
      `INSERT INTO users (username, password_hash, employee_id, role, active, permissions)
       VALUES ($1, $2, $3, $4, true, $5::jsonb)
       RETURNING id, username, role, active, permissions`,
      [username, passwordHash, employeeId, userRole, JSON.stringify(permsArray)]
    );

    const row = result.rows[0];
    const perms = row.permissions;
    const userPayload = {
      id: row.id,
      username: row.username,
      role: row.role,
      active: row.active,
      permissions: perms != null && Array.isArray(perms) ? perms : [],
      employee_id: employeeId
    };
    if (io) {
      emitUserUpdate(io, 'created', userPayload);
    }
    res.status(201).json(userPayload);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    if (error.code === '42703') {
      return res.status(500).json({ error: 'Columna permissions no existe. Ejecuta la migración: node scripts/apply-users-permissions-migration.js' });
    }
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Actualizar usuario: role, permissions y permissions_by_branch (solo master_admin)
router.put('/user/:userId', requireMasterAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions, permissions_by_branch } = req.body;

    const userResult = await query(
      'SELECT id, username FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const updates = [];
    const values = [];
    let pos = 1;
    if (role !== undefined) {
      updates.push(`role = $${pos++}`);
      values.push(role);
    }
    if (permissions !== undefined) {
      updates.push(`permissions = $${pos++}::jsonb`);
      values.push(Array.isArray(permissions) ? JSON.stringify(permissions) : (typeof permissions === 'string' ? permissions : '[]'));
    }
    if (permissions_by_branch !== undefined) {
      updates.push(`permissions_by_branch = $${pos++}::jsonb`);
      const pbb = (typeof permissions_by_branch === 'object' && permissions_by_branch !== null)
        ? JSON.stringify(permissions_by_branch)
        : '{}';
      values.push(pbb);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Indica role, permissions y/o permissions_by_branch para actualizar' });
    }
    values.push(userId);
    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${pos}`,
      values
    );

    const updated = await query(
      `SELECT id, username, role, permissions, permissions_by_branch FROM users WHERE id = $1`,
      [userId]
    );
    const row = updated.rows[0];
    const perms = row.permissions;
    const pbb = row.permissions_by_branch;
    const userPayload = {
      id: row.id,
      username: row.username,
      role: row.role,
      permissions: perms != null && Array.isArray(perms) ? perms : (typeof perms === 'string' ? JSON.parse(perms) : []),
      permissions_by_branch: (pbb != null && typeof pbb === 'object') ? pbb : {}
    };
    if (io) {
      emitUserUpdate(io, 'updated', userPayload);
    }
    res.json(userPayload);
  } catch (error) {
    if (error.code === '42703') {
      return res.status(500).json({ error: 'Columna permissions_by_branch no existe. Reinicia el servidor para aplicar la migración.' });
    }
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Eliminar usuario (solo admin maestro)
router.delete('/user/:userId', requireMasterAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verificar que el usuario existe
    const userResult = await query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Eliminar el usuario
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [userId]
    );

    // Registrar en audit log
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'delete', 'user', $2, $3)`,
        [req.user.id, userId, JSON.stringify({ username: user.username })]
      );
    } catch (auditError) {
      console.warn('Error registrando en audit_log (no crítico):', auditError.message);
    }

    if (io) {
      emitUserUpdate(io, 'deleted', { id: user.id, username: user.username });
    }

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;
