// Rutas de Reportes
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Dashboard KPI - Optimizado con agregaciones
router.get('/dashboard', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo, viewAllBranches = 'false' } = req.query;
    
    // Determinar qué sucursal(es) consultar
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const shouldViewAll = isAdmin && viewAllBranches === 'true';

    let dateFilter = '';
    let branchFilter = '';
    const params = [];
    let paramIndex = 1;

    if (shouldViewAll) {
        // Ver todas las sucursales
        branchFilter = '';
    } else {
        branchFilter = `WHERE s.branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

    if (dateFrom && dateTo) {
        dateFilter = `${branchFilter ? 'AND' : 'WHERE'} DATE(s.created_at) >= $${paramIndex} AND DATE(s.created_at) <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    } else {
        // Por defecto, hoy
        const today = new Date().toISOString().split('T')[0];
        dateFilter = `${branchFilter ? 'AND' : 'WHERE'} DATE(s.created_at) = $${paramIndex}`;
        params.push(today);
        paramIndex++;
    }

    // Total de ventas con agregaciones optimizadas
    const salesResult = await queryOne(
        `SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total,
            COALESCE(SUM(passengers), 0) as passengers,
            COALESCE(SUM(seller_commission), 0) as total_seller_commission,
            COALESCE(SUM(guide_commission), 0) as total_guide_commission,
            COUNT(DISTINCT seller_id) as unique_sellers,
            COUNT(DISTINCT guide_id) as unique_guides
         FROM sales s
         ${branchFilter} ${dateFilter} AND s.status = 'completada'`,
        params
    );

    // Productos vendidos
    const itemsResult = await queryOne(
        `SELECT 
            COUNT(DISTINCT si.id) as count,
            COALESCE(SUM(si.quantity), 0) as total_quantity,
            COALESCE(SUM(si.subtotal), 0) as total_items_value
         FROM sale_items si
         INNER JOIN sales s ON si.sale_id = s.id
         ${branchFilter.replace('s.branch_id', 's.branch_id')} ${dateFilter} AND s.status = 'completada'`,
        params
    );

    // Obtener tipo de cambio actual
    const exchangeRate = await queryOne(`
        SELECT usd FROM exchange_rates_daily
        WHERE date = CURRENT_DATE
        ORDER BY date DESC LIMIT 1
    `) || { usd: 20.00 };

    const exchangeRateUsd = parseFloat(exchangeRate.usd || 20.00);

    // Ticket promedio
    const avgTicket = parseInt(salesResult.count || 0) > 0
        ? parseFloat(salesResult.total) / parseInt(salesResult.count) / exchangeRateUsd
        : 0;

    // % de cierre
    const closeRate = parseInt(salesResult.passengers || 0) > 0
        ? (parseInt(salesResult.count) / parseInt(salesResult.passengers)) * 100
        : 0;

    // Top vendedores (primeros 5)
    const topSellers = await query(
        `SELECT 
            s.seller_id,
            seller.name as seller_name,
            COUNT(*) as sales_count,
            COALESCE(SUM(s.total), 0) as total_sales,
            COALESCE(SUM(s.seller_commission), 0) as total_commission
         FROM sales s
         LEFT JOIN catalog_sellers seller ON s.seller_id = seller.id
         ${branchFilter.replace('s.branch_id', 's.branch_id')} ${dateFilter} AND s.status = 'completada'
         GROUP BY s.seller_id, seller.name
         ORDER BY total_sales DESC
         LIMIT 5`,
        params
    );

    // Alertas: productos sin foto
    const itemsWithoutPhoto = shouldViewAll
        ? await query(`
            SELECT COUNT(DISTINCT i.id) as count
            FROM inventory_items i
            LEFT JOIN inventory_photos p ON i.id = p.inventory_item_id
            WHERE p.id IS NULL
        `)
        : await query(`
            SELECT COUNT(DISTINCT i.id) as count
            FROM inventory_items i
            LEFT JOIN inventory_photos p ON i.id = p.inventory_item_id
            WHERE i.branch_id = $1 AND p.id IS NULL
        `, [branchId]);

    // Alertas: stock bajo (stock < 5)
    const lowStockItems = shouldViewAll
        ? await query(`
            SELECT COUNT(*) as count
            FROM inventory_items
            WHERE stock < 5 AND status = 'disponible'
        `)
        : await query(`
            SELECT COUNT(*) as count
            FROM inventory_items
            WHERE branch_id = $1 AND stock < 5 AND status = 'disponible'
        `, [branchId]);

    res.json({
        success: true,
        data: {
            kpis: {
                totalSales: parseFloat(salesResult.total || 0),
                salesCount: parseInt(salesResult.count || 0),
                passengers: parseInt(salesResult.passengers || 0),
                itemsSold: parseInt(itemsResult.count || 0),
                itemsQuantity: parseInt(itemsResult.total_quantity || 0),
                itemsValue: parseFloat(itemsResult.total_items_value || 0),
                avgTicket: parseFloat(avgTicket.toFixed(2)),
                closeRate: parseFloat(closeRate.toFixed(2)),
                totalCommissions: {
                    sellers: parseFloat(salesResult.total_seller_commission || 0),
                    guides: parseFloat(salesResult.total_guide_commission || 0)
                },
                uniqueSellers: parseInt(salesResult.unique_sellers || 0),
                uniqueGuides: parseInt(salesResult.unique_guides || 0)
            },
            topSellers: topSellers,
            alerts: {
                itemsWithoutPhoto: parseInt(itemsWithoutPhoto[0]?.count || 0),
                lowStockItems: parseInt(lowStockItems[0]?.count || 0)
            },
            exchangeRate: exchangeRateUsd,
            dateRange: {
                from: dateFrom || new Date().toISOString().split('T')[0],
                to: dateTo || new Date().toISOString().split('T')[0]
            }
        }
    });
}));

// Dashboard consolidado (todas las sucursales)
router.get('/dashboard/consolidated', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    // Solo admin puede ver consolidado
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden ver dashboard consolidado'
        });
    }

    let dateFilter = '';
    const params = [];
    let paramIndex = 1;

    if (dateFrom && dateTo) {
        dateFilter = `WHERE DATE(s.created_at) >= $${paramIndex} AND DATE(s.created_at) <= $${paramIndex + 1}`;
        params.push(dateFrom, dateTo);
        paramIndex += 2;
    } else {
        const today = new Date().toISOString().split('T')[0];
        dateFilter = `WHERE DATE(s.created_at) = $${paramIndex}`;
        params.push(today);
        paramIndex++;
    }

    // Totales por sucursal
    const byBranch = await query(
        `SELECT 
            b.id as branch_id,
            b.name as branch_name,
            COUNT(*) as sales_count,
            COALESCE(SUM(s.total), 0) as total_sales,
            COALESCE(SUM(s.passengers), 0) as total_passengers
         FROM sales s
         JOIN catalog_branches b ON s.branch_id = b.id
         ${dateFilter} AND s.status = 'completada'
         GROUP BY b.id, b.name
         ORDER BY total_sales DESC`,
        params
    );

    // Total general
    const total = await queryOne(
        `SELECT 
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total,
            COALESCE(SUM(passengers), 0) as passengers
         FROM sales s
         ${dateFilter} AND s.status = 'completada'`,
        params
    );

    res.json({
        success: true,
        data: {
            branches: byBranch,
            totals: {
                salesCount: parseInt(total.count || 0),
                totalSales: parseFloat(total.total || 0),
                totalPassengers: parseInt(total.passengers || 0)
            }
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

// Reporte de ventas detallado
router.get('/sales/detailed', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { dateFrom, dateTo, sellerId, guideId, agencyId, limit = 100, offset = 0 } = req.query;

    let queryText = `
        SELECT 
            s.*,
            seller.name as seller_name,
            guide.name as guide_name,
            agency.name as agency_name,
            customer.name as customer_name,
            COUNT(DISTINCT si.id) as items_count
        FROM sales s
        LEFT JOIN catalog_sellers seller ON s.seller_id = seller.id
        LEFT JOIN catalog_guides guide ON s.guide_id = guide.id
        LEFT JOIN catalog_agencies agency ON s.agency_id = agency.id
        LEFT JOIN customers customer ON s.customer_id = customer.id
        LEFT JOIN sale_items si ON s.id = si.sale_id
        WHERE s.branch_id = $1 AND s.status = 'completada'
    `;
    const params = [branchId];
    let paramIndex = 2;

    if (dateFrom) {
        queryText += ` AND DATE(s.created_at) >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND DATE(s.created_at) <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    if (sellerId) {
        queryText += ` AND s.seller_id = $${paramIndex}`;
        params.push(sellerId);
        paramIndex++;
    }

    if (guideId) {
        queryText += ` AND s.guide_id = $${paramIndex}`;
        params.push(guideId);
        paramIndex++;
    }

    if (agencyId) {
        queryText += ` AND s.agency_id = $${paramIndex}`;
        params.push(agencyId);
        paramIndex++;
    }

    queryText += ` GROUP BY s.id, seller.name, guide.name, agency.name, customer.name ORDER BY s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const sales = await query(queryText, params);

    res.json({
        success: true,
        data: sales,
        count: sales.length
    });
}));

// Reporte de inventario
router.get('/inventory', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { status, lowStock = 'false' } = req.query;

    let queryText = `
        SELECT 
            i.*,
            COUNT(DISTINCT p.id) as photos_count,
            COUNT(DISTINCT c.id) as certificates_count
        FROM inventory_items i
        LEFT JOIN inventory_photos p ON i.id = p.inventory_item_id
        LEFT JOIN inventory_certificates c ON i.id = c.inventory_item_id
        WHERE i.branch_id = $1
    `;
    const params = [branchId];
    let paramIndex = 2;

    if (status) {
        queryText += ` AND i.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (lowStock === 'true') {
        queryText += ` AND i.stock < 5`;
    }

    queryText += ` GROUP BY i.id ORDER BY i.name ASC`;

    const items = await query(queryText, params);

    // Estadísticas agregadas
    const stats = await queryOne(`
        SELECT 
            COUNT(*) as total_items,
            COALESCE(SUM(stock), 0) as total_stock,
            COALESCE(SUM(CASE WHEN stock < 5 THEN 1 ELSE 0 END), 0) as low_stock_count,
            COALESCE(SUM(cost * stock), 0) as total_cost_value,
            COALESCE(SUM(price * stock), 0) as total_price_value
        FROM inventory_items
        WHERE branch_id = $1
        ${status ? `AND status = $2` : ''}
    `, status ? [branchId, status] : [branchId]);

    res.json({
        success: true,
        data: {
            items: items,
            statistics: {
                totalItems: parseInt(stats.total_items || 0),
                totalStock: parseInt(stats.total_stock || 0),
                lowStockCount: parseInt(stats.low_stock_count || 0),
                totalCostValue: parseFloat(stats.total_cost_value || 0),
                totalPriceValue: parseFloat(stats.total_price_value || 0),
                potentialProfit: parseFloat((stats.total_price_value || 0) - (stats.total_cost_value || 0))
            }
        }
    });
}));

export default router;
