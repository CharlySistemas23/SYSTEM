// Rutas de Auditoría
import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación y ser admin
router.use(authenticate);
router.use(requireAdmin);

// Obtener logs de auditoría
router.get('/', asyncHandler(async (req, res) => {
    const {
        userId,
        username,
        action,
        entityType,
        entityId,
        branchId,
        dateFrom,
        dateTo,
        limit = 1000,
        offset = 0
    } = req.query;

    let queryText = `
        SELECT 
            al.*,
            b.name as branch_name,
            u.username as user_username
        FROM audit_logs al
        LEFT JOIN catalog_branches b ON al.branch_id = b.id
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Filtros
    if (userId) {
        queryText += ` AND al.user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
    }

    if (username) {
        queryText += ` AND al.username ILIKE $${paramIndex}`;
        params.push(`%${username}%`);
        paramIndex++;
    }

    if (action) {
        queryText += ` AND al.action = $${paramIndex}`;
        params.push(action);
        paramIndex++;
    }

    if (entityType) {
        queryText += ` AND al.entity_type = $${paramIndex}`;
        params.push(entityType);
        paramIndex++;
    }

    if (entityId) {
        queryText += ` AND al.entity_id = $${paramIndex}`;
        params.push(entityId);
        paramIndex++;
    }

    if (branchId) {
        queryText += ` AND al.branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND al.created_at >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND al.created_at <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    // Ordenar por fecha descendente
    queryText += ` ORDER BY al.created_at DESC`;

    // Paginación
    const finalLimit = Math.min(parseInt(limit) || 1000, 5000);
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(finalLimit, parseInt(offset) || 0);

    const logs = await query(queryText, params);

    // Obtener total para paginación
    let countQuery = queryText.replace(/LIMIT.*$/, '');
    countQuery = countQuery.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await queryOne(countQuery, params.slice(0, -2));
    const total = parseInt(countResult?.total || logs.length);

    // Parsear JSONB fields
    const parsedLogs = logs.map(log => ({
        ...log,
        old_data: log.old_data ? JSON.parse(log.old_data) : null,
        new_data: log.new_data ? JSON.parse(log.new_data) : null,
        changes: log.changes ? JSON.parse(log.changes) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
    }));

    res.json({
        success: true,
        data: parsedLogs,
        count: parsedLogs.length,
        total: total,
        limit: finalLimit,
        offset: parseInt(offset) || 0,
        hasMore: (parseInt(offset) || 0) + parsedLogs.length < total
    });
}));

// Obtener un log específico
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const log = await queryOne(
        `SELECT 
            al.*,
            b.name as branch_name,
            u.username as user_username
        FROM audit_logs al
        LEFT JOIN catalog_branches b ON al.branch_id = b.id
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.id = $1`,
        [id]
    );

    if (!log) {
        return res.status(404).json({
            success: false,
            error: 'Log de auditoría no encontrado'
        });
    }

    // Parsear JSONB fields
    const parsedLog = {
        ...log,
        old_data: log.old_data ? JSON.parse(log.old_data) : null,
        new_data: log.new_data ? JSON.parse(log.new_data) : null,
        changes: log.changes ? JSON.parse(log.changes) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null
    };

    res.json({
        success: true,
        data: parsedLog
    });
}));

// Obtener estadísticas de auditoría
router.get('/stats/summary', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, branchId } = req.query;

    let queryText = `
        SELECT 
            action,
            entity_type,
            COUNT(*) as count
        FROM audit_logs
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (dateFrom) {
        queryText += ` AND created_at >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND created_at <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    if (branchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

    queryText += ` GROUP BY action, entity_type ORDER BY count DESC`;

    const stats = await query(queryText, params);

    res.json({
        success: true,
        data: stats
    });
}));

export default router;
