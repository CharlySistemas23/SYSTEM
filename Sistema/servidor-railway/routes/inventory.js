// Rutas de Inventario
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los productos (solo de la tienda del usuario)
router.get('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { status, sku, barcode, search } = req.query;

    let queryText = 'SELECT * FROM inventory_items WHERE branch_id = $1';
    const params = [branchId];
    let paramIndex = 2;

    if (status) {
        queryText += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (sku) {
        queryText += ` AND sku = $${paramIndex}`;
        params.push(sku);
        paramIndex++;
    }

    if (barcode) {
        queryText += ` AND barcode = $${paramIndex}`;
        params.push(barcode);
        paramIndex++;
    }

    if (search) {
        queryText += ` AND (name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR barcode ILIKE $${paramIndex})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex += 3;
    }

    queryText += ' ORDER BY name ASC';

    const items = await query(queryText, params);

    res.json({
        success: true,
        data: items,
        count: items.length
    });
}));

// Obtener un producto por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const item = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    res.json({
        success: true,
        data: item
    });
}));

// Crear nuevo producto
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    
    const {
        id,
        sku,
        barcode,
        name,
        description,
        metal,
        stone,
        size,
        weight,
        dimensions,
        cost = 0,
        price = 0,
        stock = 0,
        location,
        status = 'disponible',
        deviceId
    } = req.body;

    if (!sku || !name) {
        return res.status(400).json({
            success: false,
            error: 'SKU y nombre son requeridos'
        });
    }

    // Verificar que el SKU no exista en esta tienda
    const existing = await queryOne(
        'SELECT * FROM inventory_items WHERE sku = $1 AND branch_id = $2',
        [sku, branchId]
    );

    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un producto con este SKU en esta tienda'
        });
    }

    const itemId = id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const itemData = {
        id: itemId,
        sku: sku,
        barcode: barcode || null,
        name: name,
        description: description || null,
        metal: metal || null,
        stone: stone || null,
        size: size || null,
        weight: weight || null,
        dimensions: dimensions || null,
        cost: cost,
        price: price,
        stock: stock,
        branch_id: branchId, // CRÍTICO: Usar branch_id del token
        location: location || null,
        status: status,
        device_id: deviceId || null,
        sync_status: 'synced'
    };

    const item = await insert('inventory_items', itemData);

    // Emitir evento WebSocket
    req.io.to(`branch_${branchId}`).emit('inventory-item-created', item);

    res.status(201).json({
        success: true,
        data: item
    });
}));

// Actualizar producto
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existingItem = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!existingItem) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    const allowedFields = [
        'sku', 'barcode', 'name', 'description', 'metal', 'stone',
        'size', 'weight', 'dimensions', 'cost', 'price', 'stock',
        'location', 'status'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    // No permitir cambiar branch_id
    if (updateData.branch_id) {
        delete updateData.branch_id;
    }

    const updatedItem = await update('inventory_items', id, updateData);

    // Emitir evento WebSocket
    req.io.to(`branch_${branchId}`).emit('inventory-item-updated', updatedItem);

    res.json({
        success: true,
        data: updatedItem
    });
}));

// Eliminar producto
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Solo admin puede eliminar
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar productos'
        });
    }

    const item = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    await remove('inventory_items', id);

    // Emitir evento WebSocket
    req.io.to(`branch_${branchId}`).emit('inventory-item-deleted', { id });

    res.json({
        success: true,
        message: 'Producto eliminado'
    });
}));

export default router;
