// Rutas de Reportes
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Dashboard KPI
router.get('/dashboard', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo } = req.query;
    
    let dateFilter = '';
    const params = [branchId];
    let paramIndex = 2;

    if (dateFrom && dateTo) {
        dateFilter = `AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    } else {
        // Por defecto, hoy
        const today = new Date().toISOString().split('T')[0];
        dateFilter = `AND DATE(created_at) = $${paramIndex}`;
        params.push(today);
    }

    // Total de ventas
    const salesResult = await queryOne(
        `SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total,
            COALESCE(SUM(passengers), 0) as passengers
         FROM sales 
         WHERE branch_id = $1 AND status = 'completada' ${dateFilter}`,
        params
    );

    // Productos vendidos
    const itemsResult = await queryOne(
        `SELECT COUNT(*) as count
         FROM sale_items si
         INNER JOIN sales s ON si.sale_id = s.id
         WHERE s.branch_id = $1 AND s.status = 'completada' ${dateFilter.replace('created_at', 's.created_at')}`,
        params.slice(0, -1) // Remover fecha porque la query es diferente
    );

    // Ticket promedio (requiere tipo de cambio)
    const exchangeRateUsd = 20.00; // TODO: Obtener de settings
    const avgTicket = salesResult.passengers > 0 
        ? (parseFloat(salesResult.total) / parseInt(salesResult.passengers)) / exchangeRateUsd 
        : 0;

    // % de cierre (ventas / pasajeros * 100)
    const closeRate = salesResult.passengers > 0 
        ? (parseInt(salesResult.count) / parseInt(salesResult.passengers)) * 100 
        : 0;

    res.json({
        success: true,
        data: {
            totalSales: parseFloat(salesResult.total || 0),
            salesCount: parseInt(salesResult.count || 0),
            passengers: parseInt(salesResult.passengers || 0),
            itemsSold: parseInt(itemsResult.count || 0),
            avgTicket: parseFloat(avgTicket.toFixed(2)),
            closeRate: parseFloat(closeRate.toFixed(2))
        }
    });
}));

// Reporte de comisiones
router.get('/commissions', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo, sellerId, guideId } = req.query;

    let dateFilter = '';
    const params = [branchId];
    let paramIndex = 2;

    if (dateFrom && dateTo) {
        dateFilter = `AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    }

    let additionalFilter = '';
    if (sellerId) {
        additionalFilter += ` AND seller_id = $${paramIndex}`;
        params.push(sellerId);
        paramIndex++;
    }
    if (guideId) {
        additionalFilter += ` AND guide_id = $${paramIndex}`;
        params.push(guideId);
        paramIndex++;
    }

    const sales = await query(
        `SELECT 
            seller_id,
            guide_id,
            COALESCE(SUM(seller_commission), 0) as total_seller_commission,
            COALESCE(SUM(guide_commission), 0) as total_guide_commission
         FROM sales
         WHERE branch_id = $1 AND status = 'completada' ${dateFilter} ${additionalFilter}
         GROUP BY seller_id, guide_id`,
        params
    );

    res.json({
        success: true,
        data: sales
    });
}));

// Reporte de ventas por vendedor
router.get('/sales-by-seller', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo } = req.query;

    let dateFilter = '';
    const params = [branchId];
    let paramIndex = 2;

    if (dateFrom && dateTo) {
        dateFilter = `AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    }

    const results = await query(
        `SELECT 
            s.seller_id,
            e.name as seller_name,
            COUNT(*) as sales_count,
            COALESCE(SUM(s.total), 0) as total_sales,
            COALESCE(SUM(s.seller_commission), 0) as total_commission
         FROM sales s
         LEFT JOIN employees e ON s.seller_id = e.id
         WHERE s.branch_id = $1 AND s.status = 'completada' ${dateFilter}
         GROUP BY s.seller_id, e.name
         ORDER BY total_sales DESC`,
        params
    );

    res.json({
        success: true,
        data: results
    });
}));

// Reporte de ventas por guía
router.get('/sales-by-guide', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo } = req.query;

    let dateFilter = '';
    const params = [branchId];
    let paramIndex = 2;

    if (dateFrom && dateTo) {
        dateFilter = `AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    }

    const results = await query(
        `SELECT 
            s.guide_id,
            g.name as guide_name,
            COUNT(*) as sales_count,
            COALESCE(SUM(s.total), 0) as total_sales,
            COALESCE(SUM(s.guide_commission), 0) as total_commission
         FROM sales s
         LEFT JOIN catalog_guides g ON s.guide_id = g.id
         WHERE s.branch_id = $1 AND s.status = 'completada' ${dateFilter}
         GROUP BY s.guide_id, g.name
         ORDER BY total_sales DESC`,
        params
    );

    res.json({
        success: true,
        data: results
    });
}));

export default router;
