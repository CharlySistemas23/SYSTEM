// Middleware de Autenticación JWT
import jwt from 'jsonwebtoken';
import { getById } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generar token JWT
export function generateToken(user) {
    const payload = {
        userId: user.id,
        username: user.username,
        branchId: user.branch_id, // CRÍTICO: Incluir branch_id en el token
        employeeId: user.employee_id,
        role: user.role,
        permissions: user.permissions || []
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
}

// Verificar token JWT
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Middleware para autenticar requests
export async function authenticate(req, res, next) {
    try {
        // Obtener token del header Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Token no proporcionado'
            });
        }

        const token = authHeader.substring(7); // Remover "Bearer "
        const decoded = verifyToken(token);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido o expirado'
            });
        }

        // Verificar que el usuario aún existe y está activo
        const user = await getById('users', decoded.userId);
        
        if (!user || !user.active) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no encontrado o inactivo'
            });
        }

        // Agregar información del usuario al request
        req.user = {
            id: decoded.userId,
            username: decoded.username,
            branchId: decoded.branchId, // CRÍTICO: branch_id del token
            employeeId: decoded.employeeId,
            role: decoded.role,
            permissions: decoded.permissions || []
        };

        next();
    } catch (error) {
        console.error('Error en autenticación:', error);
        return res.status(401).json({
            success: false,
            error: 'Error de autenticación'
        });
    }
}

// Middleware para verificar permisos
export function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        // Admin tiene todos los permisos
        if (req.user.role === 'admin' || req.user.permissions?.includes('all')) {
            return next();
        }

        // Verificar permiso específico
        if (req.user.permissions?.includes(permission)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: 'Permiso denegado'
        });
    };
}

// Middleware para verificar que es admin
export function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'No autenticado'
        });
    }

    if (req.user.role === 'admin' || req.user.permissions?.includes('all')) {
        return next();
    }

    return res.status(403).json({
        success: false,
        error: 'Se requiere rol de administrador'
    });
}

// Middleware para asegurar que solo accede a su tienda
// (ya está incluido en authenticate, pero esta función es adicional)
export function ensureOwnBranch(req, res, next) {
    // Si viene branchId en el body o params, verificar que coincida con el token
    const requestedBranchId = req.body.branch_id || req.params.branchId || req.query.branch_id;
    
    if (requestedBranchId && requestedBranchId !== req.user.branchId) {
        // Admin puede acceder a todas las tiendas
        if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
            return res.status(403).json({
                success: false,
                error: 'No tienes acceso a esta tienda'
            });
        }
    }

    next();
}
