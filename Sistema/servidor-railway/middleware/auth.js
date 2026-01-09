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
            // Logging de intentos de acceso no autorizados
            console.warn('⚠️ Intento de acceso con token inválido:', {
                ip: req.ip || req.connection?.remoteAddress,
                path: req.path,
                method: req.method,
                timestamp: new Date().toISOString()
            });
            
            return res.status(401).json({
                success: false,
                error: 'Token inválido o expirado'
            });
        }
        
        // Verificar expiración del token
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
            console.warn('⚠️ Intento de acceso con token expirado:', {
                userId: decoded.userId,
                username: decoded.username,
                ip: req.ip || req.connection?.remoteAddress,
                path: req.path,
                expiredAt: new Date(decoded.exp * 1000).toISOString(),
                timestamp: new Date().toISOString()
            });
            
            return res.status(401).json({
                success: false,
                error: 'Token expirado. Por favor, inicia sesión nuevamente.'
            });
        }

        // Verificar que el usuario aún existe y está activo
        const user = await getById('users', decoded.userId);
        
        if (!user || !user.active) {
            // Logging de intentos de acceso con usuario inactivo
            console.warn('⚠️ Intento de acceso con usuario inactivo o no encontrado:', {
                userId: decoded.userId,
                username: decoded.username,
                ip: req.ip || req.connection?.remoteAddress,
                path: req.path,
                userExists: !!user,
                userActive: user?.active || false,
                timestamp: new Date().toISOString()
            });
            
            return res.status(401).json({
                success: false,
                error: 'Usuario no encontrado o inactivo'
            });
        }

        // Parsear permissions si viene como JSON string desde la BD
        let permissions = decoded.permissions || user.permissions || [];
        if (typeof permissions === 'string') {
            try {
                permissions = JSON.parse(permissions);
            } catch (e) {
                console.warn('Error parseando permissions en authenticate:', e);
                permissions = [];
            }
        }
        
        // Si es admin, asegurar que tiene permisos completos
        if (decoded.role === 'admin' || user.role === 'admin') {
            if (!permissions.includes('all')) {
                permissions = ['all'];
            }
        }

        // CRÍTICO: Asegurar que siempre haya branch_id
        let finalBranchId = decoded.branchId || user.branch_id;
        
        // Si no hay branch_id, asignar branch1 (JOYERIA 1)
        if (!finalBranchId) {
            console.warn(`⚠️ Usuario ${decoded.username} no tiene branch_id. Asignando branch1...`);
            const { queryOne, insert, update } = await import('../config/database.js');
            
            // Verificar que branch1 existe, si no, crearlo
            let branch1 = await queryOne('SELECT id FROM catalog_branches WHERE id = $1', ['branch1']);
            if (!branch1) {
                branch1 = await insert('catalog_branches', {
                    id: 'branch1',
                    name: 'JOYERIA 1',
                    address: '',
                    phone: '',
                    email: '',
                    active: true
                });
                console.log('✅ Sucursal branch1 creada');
            }
            
            finalBranchId = 'branch1';
            await update('users', decoded.userId, { branch_id: finalBranchId });
            console.log(`✅ Branch_id asignado: ${finalBranchId}`);
        }
        
        // Agregar información del usuario al request
        req.user = {
            id: decoded.userId,
            username: decoded.username,
            branchId: finalBranchId, // CRÍTICO: Siempre debe tener branch_id
            employeeId: decoded.employeeId || user.employee_id,
            role: decoded.role || user.role,
            permissions: permissions
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
    // Si viene branchId en el body, params o query, verificar que coincida con el token
    // El frontend puede enviar branchId (camelCase) o branch_id (snake_case)
    const requestedBranchId = req.body.branch_id || req.body.branchId || 
                              req.params.branchId || req.params.branch_id ||
                              req.query.branchId || req.query.branch_id;
    
    // Si no se solicita un branchId específico, permitir acceso (se filtrará por el branchId del token)
    if (!requestedBranchId) {
        return next();
    }
    
    // Si el branchId solicitado coincide con el del token, permitir acceso
    if (requestedBranchId === req.user.branchId) {
        return next();
    }
    
    // Admin puede acceder a todas las tiendas
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (isAdmin) {
        return next();
    }
    
    // Usuario no admin intentando acceder a otra tienda
    return res.status(403).json({
        success: false,
        error: 'No tienes acceso a esta tienda'
    });
}
