// Rutas de Ventas
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todas las ventas (con filtro por sucursal para admin)
router.get('/', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, status, sellerId, guideId, agencyId, branchId: requestedBranchId, limit = 1000, offset = 0 } = req.query;
    const branchId = req.user.branchId; // Del token JWT

    // Verificar si es admin y si puede ver todas las tiendas
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué branch_id usar para el filtro
    let filterBranchId = branchId;
    
    if (isAdmin && requestedBranchId) {
        filterBranchId = requestedBranchId;
    } else if (!isAdmin && !branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }

    // Si es admin y NO se especificó branchId, mostrar TODAS las tiendas
    let queryText;
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todas las ventas de todas las tiendas
        queryText = `
            SELECT s.*, b.name as branch_name, b.id as branch_id 
            FROM sales s
            LEFT JOIN catalog_branches b ON s.branch_id = b.id
            WHERE 1=1
        `;
    } else {
        // Filtrar por branch_id específico
        queryText = `
            SELECT s.*, b.name as branch_name, b.id as branch_id 
            FROM sales s
            LEFT JOIN catalog_branches b ON s.branch_id = b.id
            WHERE s.branch_id = $${paramIndex}
        `;
        params.push(filterBranchId);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND s.created_at >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND s.created_at <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    if (status) {
        queryText += ` AND s.status = $${paramIndex}`;
        params.push(status);
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

    // Ordenar: primero por sucursal (si es admin), luego por fecha
    if (isAdmin && !requestedBranchId) {
        queryText += ' ORDER BY b.name ASC, s.created_at DESC';
    } else {
        queryText += ' ORDER BY s.created_at DESC';
    }

    if (limit) {
        queryText += ` LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
        paramIndex++;
    }

    if (offset) {
        queryText += ` OFFSET $${paramIndex}`;
        params.push(parseInt(offset));
    }

    const sales = await query(queryText, params);

    // Obtener items para cada venta
    for (const sale of sales) {
        sale.items = await query(
            'SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY created_at',
            [sale.id]
        );
        sale.payments = await query(
            'SELECT * FROM sale_payments WHERE sale_id = $1 ORDER BY created_at',
            [sale.id]
        );
    }

    res.json({
        success: true,
        data: sales,
        count: sales.length
    });
}));

// Obtener todos los items de venta (para reportes)
router.get('/items', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId, dateFrom, dateTo, limit = 1000 } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué branch_id usar para el filtro
    let filterBranchId = branchId;
    if (isAdmin && requestedBranchId) {
        filterBranchId = requestedBranchId;
    } else if (!isAdmin && !branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }
    
    let queryText = `
        SELECT si.*, s.folio, s.created_at as sale_date, s.branch_id
        FROM sale_items si
        INNER JOIN sales s ON si.sale_id = s.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filtrar por branch_id (a menos que sea admin sin filtro)
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todos
    } else {
        queryText += ` AND s.branch_id = $${paramIndex}`;
        params.push(filterBranchId);
        paramIndex++;
    }
    
    // Filtros de fecha
    if (dateFrom) {
        queryText += ` AND s.created_at >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }
    
    if (dateTo) {
        queryText += ` AND s.created_at <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }
    
    queryText += ` ORDER BY s.created_at DESC`;
    
    if (limit) {
        queryText += ` LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
    }
    
    const items = await query(queryText, params);
    
    res.json({
        success: true,
        data: items,
        count: items.length
    });
}));

// Obtener todos los pagos de venta (para reportes)
router.get('/payments', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId, saleId, dateFrom, dateTo, limit = 1000, offset = 0 } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué branch_id usar para el filtro
    let filterBranchId = branchId;
    if (isAdmin && requestedBranchId) {
        filterBranchId = requestedBranchId;
    } else if (!isAdmin && !branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }
    
    let queryText = `
        SELECT sp.*, s.folio as sale_folio, s.created_at as sale_date, s.branch_id, b.name as branch_name
        FROM sale_payments sp
        INNER JOIN sales s ON sp.sale_id = s.id
        LEFT JOIN catalog_branches b ON s.branch_id = b.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filtrar por branch_id (a menos que sea admin sin filtro)
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todos
    } else {
        queryText += ` AND s.branch_id = $${paramIndex}`;
        params.push(filterBranchId);
        paramIndex++;
    }
    
    // Filtro por sale_id
    if (saleId) {
        queryText += ` AND sp.sale_id = $${paramIndex}`;
        params.push(saleId);
        paramIndex++;
    }
    
    // Filtros de fecha
    if (dateFrom) {
        queryText += ` AND s.created_at >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }
    
    if (dateTo) {
        queryText += ` AND s.created_at <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }
    
    queryText += ` ORDER BY s.created_at DESC, sp.created_at DESC`;
    
    if (limit) {
        queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
    }
    
    const payments = await query(queryText, params);
    
    res.json({
        success: true,
        data: payments,
        count: payments.length
    });
}));

// Obtener una venta por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const sale = await queryOne(
        'SELECT * FROM sales WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!sale) {
        return res.status(404).json({
            success: false,
            error: 'Venta no encontrada'
        });
    }

    // Obtener items y pagos
    sale.items = await query(
        'SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY created_at',
        [sale.id]
    );
    sale.payments = await query(
        'SELECT * FROM sale_payments WHERE sale_id = $1 ORDER BY created_at',
        [sale.id]
    );

    res.json({
        success: true,
        data: sale
    });
}));

// Crear nueva venta
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId; // CRÍTICO: Usar branch_id del token
    const {
        folio,
        items = [],
        payments = [],
        sellerId,
        guideId,
        agencyId,
        customerId,
        passengers = 1,
        currency = 'MXN',
        exchangeRate = 1,
        subtotal = 0,
        discount = 0,
        total = 0,
        sellerCommission = 0,
        guideCommission = 0,
        status = 'completada',
        notes,
        deviceId
    } = req.body;

    // Generar ID único si no viene
    const saleId = req.body.id || `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Crear venta
    const saleData = {
        id: saleId,
        folio: folio || `FOL-${Date.now()}`,
        branch_id: branchId, // CRÍTICO: Usar branch_id del token
        employee_id: req.user.employeeId,
        seller_id: sellerId || null,
        guide_id: guideId || null,
        agency_id: agencyId || null,
        customer_id: customerId || null,
        passengers: passengers,
        currency: currency,
        exchange_rate: exchangeRate,
        subtotal: subtotal,
        discount: discount,
        total: total,
        seller_commission: sellerCommission,
        guide_commission: guideCommission,
        status: status,
        notes: notes || null,
        cart_data: JSON.stringify(items),
        device_id: deviceId || null,
        sync_status: 'synced'
    };

    const sale = await insert('sales', saleData);

    // Crear items de venta
    for (const item of items) {
        const itemData = {
            id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sale_id: sale.id,
            product_id: item.productId || null,
            inventory_item_id: item.inventoryItemId || null,
            name: item.name,
            sku: item.sku || null,
            quantity: item.quantity || 1,
            price: item.price || 0,
            cost: item.cost || 0,
            discount: item.discount || 0,
            subtotal: item.subtotal || 0,
            commission: item.commission || 0
        };
        const insertedItem = await insert('sale_items', itemData);
        saleItems.push(insertedItem);
    }

    // Crear pagos
    for (const payment of payments) {
        const paymentData = {
            id: payment.id || `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sale_id: sale.id,
            payment_method: payment.method,
            amount: payment.amount,
            currency: payment.currency || 'MXN',
            bank: payment.bank || null,
            payment_type: payment.type || null,
            bank_commission: payment.bankCommission || 0
        };
        await insert('sale_payments', paymentData);
    }

    // Obtener venta completa con items y pagos
    sale.items = await query('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id]);
    sale.payments = await query('SELECT * FROM sale_payments WHERE sale_id = $1', [sale.id]);

    // Emitir evento WebSocket para actualización en tiempo real
    emitToBranch(sale.branch_id, 'sale-created', sale);

    res.status(201).json({
        success: true,
        data: sale
    });
}));

// Actualizar venta
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que la venta pertenece a esta tienda
    const existingSale = await queryOne(
        'SELECT * FROM sales WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!existingSale) {
        return res.status(404).json({
            success: false,
            error: 'Venta no encontrada'
        });
    }

    // Actualizar solo campos permitidos
    const allowedFields = [
        'status', 'notes', 'seller_id', 'guide_id', 'agency_id',
        'customer_id', 'passengers', 'currency', 'exchange_rate',
        'subtotal', 'discount', 'total', 'seller_commission', 'guide_commission'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    // Asegurar que branch_id no cambie
    if (updateData.branch_id) {
        delete updateData.branch_id;
    }

    const updatedSale = await update('sales', id, updateData);
    
    // Obtener items y payments para respuesta completa
    updatedSale.items = await query('SELECT * FROM sale_items WHERE sale_id = $1', [id]);
    updatedSale.payments = await query('SELECT * FROM sale_payments WHERE sale_id = $1', [id]);

    // Emitir evento WebSocket
    emitToBranch(updatedSale.branch_id || branchId, 'sale-updated', updatedSale);

    res.json({
        success: true,
        data: updatedSale
    });
}));

// Eliminar venta (solo si es admin)
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que es admin
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar ventas'
        });
    }

    const sale = await queryOne(
        'SELECT * FROM sales WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!sale) {
        return res.status(404).json({
            success: false,
            error: 'Venta no encontrada'
        });
    }

    // Eliminar items y pagos primero (CASCADE debería hacerlo, pero por seguridad)
    await query('DELETE FROM sale_items WHERE sale_id = $1', [id]);
    await query('DELETE FROM sale_payments WHERE sale_id = $1', [id]);
    await remove('sales', id);

    // Emitir evento WebSocket
    emitToBranch(sale.branch_id, 'sale-deleted', { id });

    res.json({
        success: true,
        message: 'Venta eliminada'
    });
}));

export default router;
