// Sistema de Auditoría
// Registra todas las acciones importantes del sistema

import { insert } from '../config/database.js';

/**
 * Registrar acción en auditoría
 * @param {Object} options - Opciones de auditoría
 * @param {string} options.userId - ID del usuario
 * @param {string} options.username - Username del usuario
 * @param {string} options.action - Acción realizada ('create', 'update', 'delete', 'login', 'logout', etc.)
 * @param {string} options.entityType - Tipo de entidad ('sale', 'employee', 'inventory_item', etc.)
 * @param {string} options.entityId - ID de la entidad afectada
 * @param {string} options.branchId - ID de la sucursal
 * @param {Object} options.oldData - Datos anteriores (para updates)
 * @param {Object} options.newData - Datos nuevos
 * @param {Object} options.metadata - Información adicional
 * @param {Object} options.req - Request object (opcional, para obtener IP y user agent)
 */
export async function logAudit(options) {
    try {
        const {
            userId,
            username,
            action,
            entityType,
            entityId,
            branchId,
            oldData,
            newData,
            metadata = {},
            req = null
        } = options;

        // Calcular cambios si hay oldData y newData
        let changes = null;
        if (oldData && newData) {
            changes = calculateChanges(oldData, newData);
        }

        // Obtener IP y user agent del request si está disponible
        let ipAddress = null;
        let userAgent = null;
        if (req) {
            ipAddress = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null;
            userAgent = req.get('user-agent') || null;
        }

        const auditLog = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: userId || null,
            username: username || null,
            action: action,
            entity_type: entityType,
            entity_id: entityId || null,
            branch_id: branchId || null,
            old_data: oldData ? JSON.stringify(oldData) : null,
            new_data: newData ? JSON.stringify(newData) : null,
            changes: changes ? JSON.stringify(changes) : null,
            ip_address: ipAddress,
            user_agent: userAgent,
            metadata: JSON.stringify(metadata),
            created_at: new Date().toISOString()
        };

        await insert('audit_logs', auditLog);
        
        // En desarrollo, loggear también en consola
        if (process.env.NODE_ENV === 'development') {
            console.log('📝 Audit log:', {
                action,
                entityType,
                entityId,
                userId,
                username
            });
        }
    } catch (error) {
        // No fallar la operación principal si falla el logging
        console.error('Error registrando auditoría:', error);
    }
}

/**
 * Calcular diferencias entre dos objetos
 */
function calculateChanges(oldData, newData) {
    const changes = {};
    
    // Comparar campos
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    
    for (const key of allKeys) {
        const oldValue = oldData[key];
        const newValue = newData[key];
        
        // Ignorar campos de sistema
        if (['created_at', 'updated_at', 'id'].includes(key)) {
            continue;
        }
        
        // Comparar valores
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes[key] = {
                old: oldValue,
                new: newValue
            };
        }
    }
    
    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Middleware para agregar auditoría automáticamente a rutas
 */
export function auditMiddleware(action, entityType) {
    return async (req, res, next) => {
        // Guardar referencia al request para usar en logAudit
        req.auditAction = action;
        req.auditEntityType = entityType;
        next();
    };
}

/**
 * Helper para registrar creación
 */
export async function logCreate(req, entityType, entityId, newData, branchId = null) {
    await logAudit({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'create',
        entityType,
        entityId,
        branchId: branchId || req.user?.branchId,
        newData,
        req
    });
}

/**
 * Helper para registrar actualización
 */
export async function logUpdate(req, entityType, entityId, oldData, newData, branchId = null) {
    await logAudit({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'update',
        entityType,
        entityId,
        branchId: branchId || req.user?.branchId,
        oldData,
        newData,
        req
    });
}

/**
 * Helper para registrar eliminación
 */
export async function logDelete(req, entityType, entityId, oldData, branchId = null) {
    await logAudit({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'delete',
        entityType,
        entityId,
        branchId: branchId || req.user?.branchId,
        oldData,
        req
    });
}

/**
 * Helper para registrar login
 */
export async function logLogin(req, userId, username, success = true) {
    await logAudit({
        userId,
        username,
        action: success ? 'login' : 'login_failed',
        entityType: 'user',
        entityId: userId,
        metadata: { success },
        req
    });
}

/**
 * Helper para registrar logout
 */
export async function logLogout(req, userId, username) {
    await logAudit({
        userId,
        username,
        action: 'logout',
        entityType: 'user',
        entityId: userId,
        req
    });
}
