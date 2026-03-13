import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN
);
const isProductionLike = process.env.NODE_ENV === 'production' || isRailway;

const validateMaintenanceAccess = (req, res) => {
  const enabled = process.env.ENABLE_AUTH_MAINTENANCE_ENDPOINTS === 'true';
  if (!enabled) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }

  const expectedToken = process.env.AUTH_MAINTENANCE_TOKEN;
  if (isProductionLike && (!expectedToken || typeof expectedToken !== 'string')) {
    return res.status(403).json({ error: 'Mantenimiento deshabilitado en producción' });
  }

  if (expectedToken) {
    const providedToken = req.headers['x-maintenance-token'];
    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Token de mantenimiento inválido' });
    }
  }

  return null;
};

// Login
router.post('/login', [
  body('username').notEmpty().withMessage('Usuario requerido'),
  body('password').notEmpty().withMessage('Contraseña requerida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Buscar usuario
    const userResult = await query(
       `SELECT u.*, e.branch_id, e.branch_ids, e.role as employee_role, e.name as employee_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.username = $1 AND u.active = true`,
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const user = userResult.rows[0];

    // Verificar contraseña (soporta tanto bcrypt como SHA-256 para compatibilidad)
    let isValidPassword = false;
    
    // Verificar si el hash es bcrypt (empieza con $2a$, $2b$, $2y$)
    const isBcryptHash = user.password_hash && (
      user.password_hash.startsWith('$2a$') ||
      user.password_hash.startsWith('$2b$') ||
      user.password_hash.startsWith('$2y$')
    );
    
    if (isBcryptHash) {
      // Intentar con bcrypt (nuevo sistema)
      try {
        isValidPassword = await bcrypt.compare(password, user.password_hash);
      } catch (bcryptError) {
        console.error('Error comparando con bcrypt:', bcryptError);
        isValidPassword = false;
      }
    } else {
      // Intentar con SHA-256 (sistema legacy)
      try {
        const crypto = await import('crypto');
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        isValidPassword = (sha256Hash === user.password_hash);
      } catch (shaError) {
        console.error('Error comparando con SHA-256:', shaError);
        isValidPassword = false;
      }
    }
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Actualizar último login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || typeof jwtSecret !== 'string') {
      console.error('JWT_SECRET no configurado. No se puede emitir token de login.');
      return res.status(500).json({ error: 'Configuración de autenticación incompleta' });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role || user.employee_role,
        employeeId: user.employee_id
      },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Registrar en audit log (no bloquear login si falla)
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, details, ip_address)
         VALUES ($1, 'login', 'user', $2, $3)`,
        [
          user.id,
          JSON.stringify({ username: user.username }),
          req.ip || req.connection.remoteAddress
        ]
      );
    } catch (auditError) {
      console.error('No se pudo registrar audit log de login:', auditError?.message || auditError);
    }

    // Verificar si es master_admin (puede estar en user.role o employee_role)
    const userRole = user.role || user.employee_role;
    const isMasterAdmin = userRole === 'master_admin';
    const permissions = (user.permissions != null && Array.isArray(user.permissions))
      ? user.permissions
      : [];
    const permissionsByBranch = (user.permissions_by_branch != null && typeof user.permissions_by_branch === 'object')
      ? user.permissions_by_branch
      : {};

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.employee_name,
        role: userRole,
        branchId: user.branch_id,
        branchIds: user.branch_ids || (user.branch_id ? [user.branch_id] : []),
        isMasterAdmin: isMasterAdmin,
        is_master_admin: isMasterAdmin, // Compatibilidad con frontend
        employeeId: user.employee_id,
        permissions,
        permissions_by_branch: permissionsByBranch
      }
    });
  } catch (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isDbTimeout = errorMessage.includes('timeout exceeded when trying to connect');
    const isDbConnIssue = isDbTimeout || errorMessage.includes('econnrefused') || errorMessage.includes('connection');

    console.error('Error en login:', error);
    if (isDbConnIssue) {
      return res.status(503).json({ error: 'Base de datos no disponible temporalmente', code: 'DB_UNAVAILABLE' });
    }
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Verificar token
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await query(
       `SELECT u.*, e.branch_id, e.branch_ids, e.role as employee_role, e.name as employee_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = $1 AND u.active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];
    const userRole = user.role || user.employee_role;
    const isMasterAdmin = userRole === 'master_admin';
    const permissions = (user.permissions != null && Array.isArray(user.permissions))
      ? user.permissions
      : [];
    const permissionsByBranch = (user.permissions_by_branch != null && typeof user.permissions_by_branch === 'object')
      ? user.permissions_by_branch
      : {};

    // Renovar token automáticamente si expira en menos de 2 días (evita desconexiones en estaciones 24/7)
    let newToken = null;
    try {
      const tokenExpiresAt = decoded.exp * 1000;
      if (tokenExpiresAt - Date.now() < 2 * 24 * 60 * 60 * 1000) {
        const jwtSecret = process.env.JWT_SECRET;
        if (jwtSecret) {
          newToken = jwt.sign(
            { userId: user.id, username: user.username, role: userRole, employeeId: user.employee_id },
            jwtSecret,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
          );
        }
      }
    } catch (renewError) {
      console.warn('No se pudo renovar token:', renewError.message);
    }

    res.json({
      valid: true,
      newToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.employee_name,
        role: userRole,
        branchId: user.branch_id,
        branchIds: user.branch_ids || (user.branch_id ? [user.branch_id] : []),
        isMasterAdmin: isMasterAdmin,
        is_master_admin: isMasterAdmin, // Compatibilidad con frontend
        employeeId: user.employee_id,
        permissions,
        permissions_by_branch: permissionsByBranch
      }
    });
  } catch (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isDbTimeout = errorMessage.includes('timeout exceeded when trying to connect');
    const isDbConnIssue = isDbTimeout || errorMessage.includes('econnrefused') || errorMessage.includes('connection');

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    if (isDbConnIssue) {
      return res.status(503).json({ error: 'Base de datos no disponible temporalmente', code: 'DB_UNAVAILABLE' });
    }

    console.error('Error verificando token:', error);
    res.status(500).json({ error: 'Error al verificar token' });
  }
});

// Endpoint temporal para crear usuario admin si no existe
router.post('/ensure-admin', async (req, res) => {
  try {
    const maintenanceError = validateMaintenanceAccess(req, res);
    if (maintenanceError) return;
    
    // Verificar si el usuario master_admin existe
    const adminCheck = await query(`
      SELECT id FROM users WHERE username = 'master_admin' LIMIT 1
    `);
    
    if (adminCheck.rows.length > 0) {
      return res.json({ 
        message: 'Usuario master_admin ya existe',
        username: 'master_admin'
      });
    }
    
    // Verificar/crear sucursal MAIN
    let branchResult = await query(`SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`);
    let branchId;
    
    if (branchResult.rows.length === 0) {
      await query(`
        INSERT INTO branches (id, name, code, address, phone, email, active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Sucursal Principal',
          'MAIN',
          'Dirección principal',
          '1234567890',
          'admin@opalco.com',
          true
        )
        ON CONFLICT (id) DO NOTHING
      `);
      branchResult = await query(`SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`);
    }
    
    branchId = branchResult.rows[0]?.id;
    if (!branchId) {
      const firstBranch = await query(`SELECT id FROM branches WHERE active = true LIMIT 1`);
      branchId = firstBranch.rows[0]?.id;
    }
    
    // Verificar/crear empleado ADMIN
    let employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    let employeeId;
    
    if (employeeResult.rows.length === 0) {
      // Crear empleado admin (master_admin NO debe tener branch_id para acceder a todas las sucursales)
      await query(`
        INSERT INTO employees (id, code, name, role, branch_id, active)
        VALUES (
          '00000000-0000-0000-0000-000000000002',
          'ADMIN',
          'Administrador Maestro',
          'master_admin',
          NULL,
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          role = 'master_admin',
          branch_id = NULL
      `);
      employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    } else {
      // Asegurar que el empleado master_admin tenga branch_id NULL
      await query(`
        UPDATE employees 
        SET role = 'master_admin', branch_id = NULL 
        WHERE code = 'ADMIN' AND role = 'master_admin'
      `);
    }
    
    employeeId = employeeResult.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
    
    // Crear usuario admin
    const passwordHash = await bcrypt.hash('1234', 10);
    
    try {
      await query(`
        INSERT INTO users (id, username, password_hash, employee_id, role, active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'master_admin',
          $1,
          $2,
          'master_admin',
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          employee_id = EXCLUDED.employee_id,
          role = EXCLUDED.role,
          active = EXCLUDED.active
      `, [passwordHash, employeeId]);
      
      return res.json({ 
        success: true,
        message: 'Usuario master_admin creado exitosamente',
        username: 'master_admin',
        pin: '1234'
      });
    } catch (userError) {
      if (userError.code === '23505') {
        // Usuario ya existe con otro ID, actualizar
        await query(`
          UPDATE users 
          SET password_hash = $1, 
              employee_id = $2, 
              role = 'master_admin',
              active = true
          WHERE username = 'master_admin'
        `, [passwordHash, employeeId]);
        
        return res.json({ 
          success: true,
          message: 'Usuario master_admin actualizado',
          username: 'master_admin',
          pin: '1234'
        });
      } else {
        throw userError;
      }
    }
  } catch (error) {
    console.error('❌ Error creando usuario admin:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Error al crear usuario admin',
      details: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint temporal para limpiar usuarios (excepto master_admin)
router.post('/cleanup-users', async (req, res) => {
  try {
    const maintenanceError = validateMaintenanceAccess(req, res);
    if (maintenanceError) return;
    console.log('🧹 Limpiando usuarios (excepto master_admin)...');
    
    // Obtener todos los usuarios
    const allUsersResult = await query('SELECT id, username, role FROM users ORDER BY username');
    
    console.log(`📊 Total de usuarios encontrados: ${allUsersResult.rows.length}`);
    
    if (allUsersResult.rows.length === 0) {
      // Crear usuario master_admin si no existe
      console.log('🔨 No hay usuarios, creando master_admin...');
      
      // Verificar/crear empleado ADMIN
      let employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
      let employeeId;
      
      if (employeeResult.rows.length === 0) {
        await query(`
          INSERT INTO employees (id, code, name, role, branch_id, active)
          VALUES (
            '00000000-0000-0000-0000-000000000002',
            'ADMIN',
            'Administrador Maestro',
            'master_admin',
            NULL,
            true
          )
          ON CONFLICT (id) DO UPDATE SET
            role = 'master_admin',
            branch_id = NULL
        `);
        employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
      }
      
      employeeId = employeeResult.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
      
      // Crear usuario master_admin
      const passwordHash = await bcrypt.hash('1234', 10);
      await query(`
        INSERT INTO users (id, username, password_hash, employee_id, role, active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'master_admin',
          $1,
          $2,
          'master_admin',
          true
        )
      `, [passwordHash, employeeId]);
      
      return res.json({ 
        success: true,
        message: '✅ Usuario master_admin creado',
        usersRemaining: 1,
        credentials: {
          username: 'master_admin',
          pin: '1234'
        }
      });
    }
    
    // Eliminar TODOS los usuarios primero
    console.log('🗑️ Eliminando todos los usuarios...');
    const deleteResult = await query('DELETE FROM users RETURNING id, username, role');
    const deletedCount = deleteResult.rows.length;
    const deletedUsers = deleteResult.rows;
    
    console.log(`✅ ${deletedCount} usuario(s) eliminado(s)`);
    
    // Verificar/crear empleado ADMIN
    let employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    let employeeId;
    
    if (employeeResult.rows.length === 0) {
      await query(`
        INSERT INTO employees (id, code, name, role, branch_id, active)
        VALUES (
          '00000000-0000-0000-0000-000000000002',
          'ADMIN',
          'Administrador Maestro',
          'master_admin',
          NULL,
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          role = 'master_admin',
          branch_id = NULL
      `);
      employeeResult = await query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    }
    
    employeeId = employeeResult.rows[0]?.id || '00000000-0000-0000-0000-000000000002';
    
    // Crear usuario master_admin con username "master_admin"
    console.log('🔨 Creando usuario master_admin...');
    const passwordHash = await bcrypt.hash('1234', 10);
    await query(`
      INSERT INTO users (id, username, password_hash, employee_id, role, active)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'master_admin',
        $1,
        $2,
        'master_admin',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        username = 'master_admin',
        password_hash = EXCLUDED.password_hash,
        employee_id = EXCLUDED.employee_id,
        role = 'master_admin',
        active = true
    `, [passwordHash, employeeId]);
    
    // Verificar que se creó correctamente
    const verifyResult = await query('SELECT id, username, role FROM users WHERE role = $1', ['master_admin']);
    
    return res.json({
      success: true,
      message: `✅ ${deletedCount} usuario(s) eliminado(s). Usuario master_admin creado/actualizado.`,
      deletedCount,
      deletedUsers,
      usersRemaining: verifyResult.rows.length,
      credentials: {
        username: 'master_admin',
        pin: '1234'
      }
    });
  } catch (error) {
    console.error('Error limpiando usuarios:', error);
    return res.status(500).json({ 
      error: 'Error al limpiar usuarios',
      details: error.message 
    });
  }
});

export default router;
