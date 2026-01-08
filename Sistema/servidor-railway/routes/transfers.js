// Rutas de Transferencias entre Sucursales
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todas las transferencias (con filtro por sucursal para admin)
router.get('/', asyncHandler(async (req, res) => {
    const { fromBranchId, toBranchId, status, dateFrom, dateTo, branchId: requestedBranchId, limit = 100, offset = 0 } = req.query;
    const userBranchId = req.user.branchId;

    // Verificar si es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Si es admin y NO se especificó branchId, mostrar TODAS las transferencias
    let queryText;
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todas las transferencias
        queryText = `
            SELECT t.*, 
                   fb.name as from_branch_name,
                   tb.name as to_branch_name
            FROM inventory_transfers t
            LEFT JOIN catalog_branches fb ON t.from_branch_id = fb.id
            LEFT JOIN catalog_branches tb ON t.to_branch_id = tb.id
            WHERE 1=1
        `;
    } else {
        // Filtrar por sucursal del usuario o la solicitada por admin
        const filterBranchId = requestedBranchId || userBranchId;
        queryText = `
            SELECT t.*, 
                   fb.name as from_branch_name,
                   tb.name as to_branch_name
            FROM inventory_transfers t
            LEFT JOIN catalog_branches fb ON t.from_branch_id = fb.id
            LEFT JOIN catalog_branches tb ON t.to_branch_id = tb.id
            WHERE (t.from_branch_id = $${paramIndex} OR t.to_branch_id = $${paramIndex})
        `;
        params.push(filterBranchId);
        paramIndex++;
    }

    if (fromBranchId) {
        queryText += ` AND t.from_branch_id = $${paramIndex}`;
        params.push(fromBranchId);
        paramIndex++;
    }

    if (toBranchId) {
        queryText += ` AND t.to_branch_id = $${paramIndex}`;
        params.push(toBranchId);
        paramIndex++;
    }

    if (status) {
        queryText += ` AND t.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND DATE(t.created_at) >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND DATE(t.created_at) <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const transfers = await query(queryText, params);

    // Obtener items para cada transferencia
    const transfersWithItems = await Promise.all(transfers.map(async (transfer) => {
        const items = await query(`
            SELECT ti.*, 
                   i.name as item_name,
                   i.sku as item_sku,
                   i.barcode as item_barcode,
                   i.price as item_price
            FROM inventory_transfer_items ti
            LEFT JOIN inventory_items i ON ti.inventory_item_id = i.id
            WHERE ti.transfer_id = $1
        `, [transfer.id]);

        return {
            ...transfer,
            items: items
        };
    }));

    res.json({
        success: true,
        data: transfersWithItems
    });
}));

// Obtener una transferencia específica
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const transfer = await queryOne(`
        SELECT t.*, 
               fb.name as from_branch_name,
               tb.name as to_branch_name
        FROM inventory_transfers t
        LEFT JOIN catalog_branches fb ON t.from_branch_id = fb.id
        LEFT JOIN catalog_branches tb ON t.to_branch_id = tb.id
        WHERE t.id = $1 AND (t.from_branch_id = $2 OR t.to_branch_id = $2)
    `, [id, userBranchId]);

    if (!transfer) {
        return res.status(404).json({
            success: false,
            error: 'Transferencia no encontrada'
        });
    }

    // Obtener items
    const items = await query(`
        SELECT ti.*, 
               i.name as item_name,
               i.sku as item_sku,
               i.barcode as item_barcode,
               i.price as item_price,
               i.stock as item_stock
        FROM inventory_transfer_items ti
        LEFT JOIN inventory_items i ON ti.inventory_item_id = i.id
        WHERE ti.transfer_id = $1
    `, [id]);

    res.json({
        success: true,
        data: {
            ...transfer,
            items: items
        }
    });
}));

// Crear nueva transferencia
router.post('/', asyncHandler(async (req, res) => {
    const { to_branch_id, items, notes } = req.body;
    const fromBranchId = req.user.branchId;

    if (!to_branch_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'to_branch_id y items (array) son requeridos'
        });
    }

    if (to_branch_id === fromBranchId) {
        return res.status(400).json({
            success: false,
            error: 'No puedes transferir a la misma sucursal'
        });
    }

    // Verificar que la sucursal destino existe
    const toBranch = await queryOne('SELECT id FROM catalog_branches WHERE id = $1', [to_branch_id]);
    if (!toBranch) {
        return res.status(400).json({
            success: false,
            error: 'Sucursal destino no encontrada'
        });
    }

    // Generar número de transferencia
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    
    const count = await queryOne(`
        SELECT COUNT(*) as count
        FROM inventory_transfers
        WHERE DATE(created_at) >= $1
        AND DATE(created_at) <= $2
    `, [`${year}-${month}-01`, `${year}-${month}-31`]);

    const sequentialNumber = String((parseInt(count?.count || 0) + 1)).padStart(4, '0');
    const transferNumber = `TRF-${year}${month}-${sequentialNumber}`;

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Verificar que todos los items existen y tienen stock suficiente
    for (const item of items) {
        const inventoryItem = await queryOne(`
            SELECT * FROM inventory_items
            WHERE id = $1 AND branch_id = $2
        `, [item.inventory_item_id, fromBranchId]);

        if (!inventoryItem) {
            return res.status(400).json({
                success: false,
                error: `Producto ${item.inventory_item_id} no encontrado en la sucursal origen`
            });
        }

        if (parseInt(inventoryItem.stock || 0) < parseInt(item.quantity || 1)) {
            return res.status(400).json({
                success: false,
                error: `Stock insuficiente para el producto ${inventoryItem.name}. Disponible: ${inventoryItem.stock}, Solicitado: ${item.quantity}`
            });
        }
    }

    // Crear transferencia
    const transfer = await insert('inventory_transfers', {
        id: transferId,
        transfer_number: transferNumber,
        from_branch_id: fromBranchId,
        to_branch_id: to_branch_id,
        status: 'pending',
        notes: notes || null,
        created_by: req.user.id
    });

    // Emitir evento WebSocket a ambas sucursales
    emitToBranch(fromBranchId, 'transfer-created', transfer);
    emitToBranch(to_branch_id, 'transfer-created', transfer);

    // Crear items de transferencia y reducir stock en origen
    const transferItems = [];
    for (const item of items) {
        const itemId = `transfer_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await insert('inventory_transfer_items', {
            id: itemId,
            transfer_id: transferId,
            inventory_item_id: item.inventory_item_id,
            quantity: parseInt(item.quantity || 1),
            status: 'pending'
        });

        // Reducir stock en sucursal origen
        const inventoryItem = await queryOne('SELECT stock FROM inventory_items WHERE id = $1', [item.inventory_item_id]);
        const newStock = parseInt(inventoryItem.stock || 0) - parseInt(item.quantity || 1);
        
        await update('inventory_items', item.inventory_item_id, {
            stock: newStock
        });

        transferItems.push({
            id: itemId,
            transfer_id: transferId,
            inventory_item_id: item.inventory_item_id,
            quantity: parseInt(item.quantity || 1),
            status: 'pending'
        });
    }

    res.status(201).json({
        success: true,
        data: {
            ...transfer,
            items: transferItems
        },
        message: 'Transferencia creada exitosamente'
    });
}));

// Confirmar recepción de transferencia
router.put('/:id/confirm', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const toBranchId = req.user.branchId;

    const transfer = await queryOne('SELECT * FROM inventory_transfers WHERE id = $1', [id]);

    if (!transfer) {
        return res.status(404).json({
            success: false,
            error: 'Transferencia no encontrada'
        });
    }

    if (transfer.to_branch_id !== toBranchId) {
        return res.status(403).json({
            success: false,
            error: 'Solo la sucursal destino puede confirmar la recepción'
        });
    }

    if (transfer.status !== 'pending' && transfer.status !== 'in_transit') {
        return res.status(400).json({
            success: false,
            error: 'La transferencia ya fue procesada'
        });
    }

    // Obtener items de la transferencia
    const items = await query('SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [id]);

    // Agregar stock en sucursal destino o crear items si no existen
    for (const item of items) {
        // Buscar si el item existe en la sucursal destino
        let destItem = await queryOne(`
            SELECT * FROM inventory_items
            WHERE id = $1 AND branch_id = $2
        `, [item.inventory_item_id, toBranchId]);

        if (destItem) {
            // Actualizar stock
            const newStock = parseInt(destItem.stock || 0) + parseInt(item.quantity || 1);
            await update('inventory_items', item.inventory_item_id, {
                stock: newStock,
                branch_id: toBranchId
            });
        } else {
            // Crear item en sucursal destino (copiar datos del item origen)
            const originItem = await queryOne('SELECT * FROM inventory_items WHERE id = $1', [item.inventory_item_id]);
            if (originItem) {
                const newItemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await insert('inventory_items', {
                    ...originItem,
                    id: newItemId,
                    branch_id: toBranchId,
                    stock: parseInt(item.quantity || 1)
                });
            }
        }

        // Actualizar estado del item de transferencia
        await update('inventory_transfer_items', item.id, {
            status: 'completed'
        });
    }

    // Actualizar estado de la transferencia
    const updatedTransfer = await update('inventory_transfers', id, {
        status: 'completed',
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // Emitir evento WebSocket a ambas sucursales
    emitToBranch(transfer.from_branch_id, 'transfer-updated', updatedTransfer);
    emitToBranch(transfer.to_branch_id, 'transfer-updated', updatedTransfer);

    res.json({
        success: true,
        data: updatedTransfer,
        message: 'Transferencia confirmada exitosamente'
    });
}));

// Marcar transferencia como en tránsito
router.put('/:id/send', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fromBranchId = req.user.branchId;

    const transfer = await queryOne('SELECT * FROM inventory_transfers WHERE id = $1', [id]);

    if (!transfer) {
        return res.status(404).json({
            success: false,
            error: 'Transferencia no encontrada'
        });
    }

    if (transfer.from_branch_id !== fromBranchId) {
        return res.status(403).json({
            success: false,
            error: 'Solo la sucursal origen puede enviar la transferencia'
        });
    }

    if (transfer.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: 'La transferencia ya fue procesada'
        });
    }

    const updatedTransfer = await update('inventory_transfers', id, {
        status: 'in_transit',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    // Emitir evento WebSocket a ambas sucursales
    emitToBranch(transfer.from_branch_id, 'transfer-updated', updatedTransfer);
    emitToBranch(transfer.to_branch_id, 'transfer-updated', updatedTransfer);

    res.json({
        success: true,
        data: updatedTransfer,
        message: 'Transferencia marcada como enviada'
    });
}));

// Cancelar transferencia
router.put('/:id/cancel', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const transfer = await queryOne('SELECT * FROM inventory_transfers WHERE id = $1', [id]);

    if (!transfer) {
        return res.status(404).json({
            success: false,
            error: 'Transferencia no encontrada'
        });
    }

    // Solo la sucursal origen puede cancelar
    if (transfer.from_branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'Solo la sucursal origen puede cancelar la transferencia'
        });
    }

    if (transfer.status === 'completed') {
        return res.status(400).json({
            success: false,
            error: 'No se puede cancelar una transferencia completada'
        });
    }

    // Devolver stock a la sucursal origen
    if (transfer.status !== 'pending') {
        const items = await query('SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [id]);
        
        for (const item of items) {
            const inventoryItem = await queryOne('SELECT stock FROM inventory_items WHERE id = $1', [item.inventory_item_id]);
            if (inventoryItem) {
                const newStock = parseInt(inventoryItem.stock || 0) + parseInt(item.quantity || 1);
                await update('inventory_items', item.inventory_item_id, {
                    stock: newStock
                });
            }
        }
    }

    // Actualizar estado
    const updatedTransfer = await update('inventory_transfers', id, {
        status: 'cancelled',
        updated_at: new Date().toISOString()
    });

    res.json({
        success: true,
        data: updatedTransfer,
        message: 'Transferencia cancelada exitosamente'
    });
}));

export default router;

