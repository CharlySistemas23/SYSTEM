import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

// Middleware para autenticar tokens JWT
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que el usuario existe y está activo
    const userResult = await query(
      `SELECT u.*, e.branch_id, e.branch_ids, e.role as employee_role
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = $1 AND u.active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    const user = userResult.rows[0];
    const role = user.role || user.employee_role;

    // Agregar información del usuario al request
    req.user = {
      id: user.id,
      username: user.username,
      employeeId: user.employee_id,
      role,
      branchId: user.branch_id,
      branchIds: user.branch_ids || (user.branch_id ? [user.branch_id] : []),
      isMasterAdmin: role === 'master_admin'
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expirado' });
    }
    console.error('Error en autenticación:', error);
    return res.status(500).json({ error: 'Error en autenticación' });
  }
};

// Middleware para verificar si es admin maestro
export const requireMasterAdmin = (req, res, next) => {
  if (!req.user || !req.user.isMasterAdmin) {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador maestro' });
  }
  next();
};

// Middleware para verificar acceso a sucursal
export const requireBranchAccess = (req, res, next) => {
  const branchId = req.params.branchId || req.body.branch_id || req.query.branch_id;
  
  if (!branchId) {
    return next(); // Si no hay branchId, continuar (algunas rutas no lo requieren)
  }

  // Admin maestro tiene acceso a todas las sucursales
  if (req.user.isMasterAdmin) {
    return next();
  }

  // Verificar que el usuario tenga acceso a esta sucursal
  const userBranchIds = req.user.branchIds || [];
  if (!userBranchIds.includes(branchId)) {
    return res.status(403).json({ error: 'No tienes acceso a esta sucursal' });
  }

  next();
};
