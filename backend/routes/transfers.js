import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { body, validationResult } from 'express-validator';
import { emitTransferUpdate } from '../socket/socketHandler.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';
import { getLockedInventoryItem } from '../utils/inventory-helpers.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const logTransferOperation = createOperationLogger('transfers');

const router = express.Router();

// Listar transferencias
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, status, from_branch_id, to_branch_id } = req.query;
    const branchId = branch_id || req.user.branchId;

    let sql = `
      SELECT t.*,
             bf.name as from_branch_name,
             bt.name as to_branch_name,
             uf.username as created_by_username,
             ua.username as approved_by_username
      FROM inventory_transfers t
      LEFT JOIN branches bf ON t.from_branch_id = bf.id
      LEFT JOIN branches bt ON t.to_branch_id = bt.id
      LEFT JOIN users uf ON t.created_by = uf.id
      LEFT JOIN users ua ON t.approved_by = ua.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND (t.from_branch_id = $${paramCount} OR t.to_branch_id = $${paramCount})`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      // Usuarios normales solo ven transferencias de su sucursal
      sql += ` AND (t.from_branch_id = $${paramCount} OR t.to_branch_id = $${paramCount})`;
      params.push(req.user.branchId);
      paramCount++;
    }

    if (status) {
      sql += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (from_branch_id) {
      sql += ` AND t.from_branch_id = $${paramCount}`;
      params.push(from_branch_id);
      paramCount++;
    }

    if (to_branch_id) {
      sql += ` AND t.to_branch_id = $${paramCount}`;
      params.push(to_branch_id);
      paramCount++;
    }

    sql += ' ORDER BY t.created_at DESC LIMIT 100';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo transferencias:', error);
    res.status(500).json({ error: 'Error al obtener transferencias' });
  }
});

// Obtener transferencia por ID (con items)
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const transferResult = await query(
      `SELECT t.*,
              bf.name as from_branch_name,
              bt.name as to_branch_name
       FROM inventory_transfers t
       LEFT JOIN branches bf ON t.from_branch_id = bf.id
       LEFT JOIN branches bt ON t.to_branch_id = bt.id
       WHERE t.id = $1`,
      [id]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }

    const transfer = transferResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin) {
      const userBranchId = req.user.branchId;
      if (transfer.from_branch_id !== userBranchId && transfer.to_branch_id !== userBranchId) {
        return res.status(403).json({ error: 'No tienes acceso a esta transferencia' });
      }
    }

    // Obtener items
    const itemsResult = await query(
      `SELECT ti.*, ii.sku, ii.name, ii.barcode
       FROM inventory_transfer_items ti
       LEFT JOIN inventory_items ii ON ti.item_id = ii.id
       WHERE ti.transfer_id = $1`,
      [id]
    );

    res.json({
      ...transfer,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo transferencia:', error);
    res.status(500).json({ error: 'Error al obtener transferencia' });
  }
});

// Crear transferencia
router.post('/', requireBranchAccess, [
  body('from_branch_id').optional().isUUID().withMessage('from_branch_id debe ser UUID'),
  body('to_branch_id').notEmpty().withMessage('Sucursal destino requerida'),
  body('items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item')
], async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ errors: errors.array() });
    }

    const { to_branch_id, items, notes, from_branch_id } = req.body;
    // Por seguridad:
    // - usuarios normales SIEMPRE transfieren desde su sucursal (req.user.branchId)
    // - master admin puede especificar from_branch_id en el body
    const fromBranchId = req.user.isMasterAdmin && from_branch_id ? from_branch_id : req.user.branchId;
    logTransferOperation('create_started', {
      fromBranchId,
      toBranchId: to_branch_id,
      userId: req.user.id,
      itemsCount: Array.isArray(items) ? items.length : 0
    });

    if (!fromBranchId) {
      await safeRollback(client);
      return res.status(400).json({ error: 'Sucursal origen requerida' });
    }

    if (fromBranchId === to_branch_id) {
      await safeRollback(client);
      return res.status(400).json({ error: 'No puedes transferir a la misma sucursal' });
    }

    // Verificar que los items existen y tienen stock suficiente
    for (const item of items) {
      const inventoryItem = await getLockedInventoryItem(client, item.item_id, fromBranchId);

      if (!inventoryItem) {
        await safeRollback(client);
        return res.status(400).json({ error: `Item ${item.item_id} no encontrado en tu sucursal` });
      }

      const requestedQuantity = item.quantity || 1;

      if ((inventoryItem.stock_actual || 0) < requestedQuantity) {
        await safeRollback(client);
        return res.status(400).json({ 
          error: `Stock insuficiente para ${inventoryItem.name || inventoryItem.sku}. Stock disponible: ${inventoryItem.stock_actual}, solicitado: ${requestedQuantity}` 
        });
      }
    }

    // Crear transferencia
    const transferResult = await client.query(
      `INSERT INTO inventory_transfers (from_branch_id, to_branch_id, status, notes, created_by)
       VALUES ($1, $2, 'pending', $3, $4)
       RETURNING *`,
      [fromBranchId, to_branch_id, notes, req.user.id]
    );

    const transfer = transferResult.rows[0];

    // Crear items de transferencia
    for (const item of items) {
      await client.query(
        `INSERT INTO inventory_transfer_items (transfer_id, item_id, quantity)
         VALUES ($1, $2, $3)`,
        [transfer.id, item.item_id, item.quantity || 1]
      );
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'create', 'inventory_transfer', $2, $3)`,
        [req.user.id, transfer.id, JSON.stringify({ from_branch_id: fromBranchId, to_branch_id, items_count: items.length })]
      );

      logTransferOperation('create_committed', {
        transferId: transfer.id,
        fromBranchId,
        toBranchId: to_branch_id,
        itemsCount: items.length
      });

      if (io) {
        emitTransferUpdate(io, fromBranchId, 'created', transfer);
        emitTransferUpdate(io, to_branch_id, 'created', transfer);
      }
    } catch (postCommitError) {
      logTransferOperation('create_post_commit_failed', {
        transferId: transfer.id,
        message: postCommitError.message
      });
      console.error('Transferencia creada pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(transfer);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logTransferOperation('create_failed', {
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error creando transferencia:', error);
    res.status(500).json({ error: 'Error al crear transferencia' });
  } finally {
    client.release();
  }
});

// Aprobar transferencia (solo admin o manager de la sucursal destino)
router.put('/:id/approve', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const transferResult = await query(
      'SELECT * FROM inventory_transfers WHERE id = $1',
      [id]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }

    const transfer = transferResult.rows[0];

    // Verificar que el usuario puede aprobar (debe ser de la sucursal destino o admin maestro)
    if (!req.user.isMasterAdmin && transfer.to_branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'Solo puedes aprobar transferencias hacia tu sucursal' });
    }

    if (transfer.status !== 'pending') {
      return res.status(400).json({ error: 'La transferencia ya fue procesada' });
    }

    const result = await query(
      `UPDATE inventory_transfers
       SET status = 'approved',
           approved_by = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.user.id, id]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'approve', 'inventory_transfer', $2, $3)`,
      [req.user.id, id, JSON.stringify({ transfer_id: id })]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitTransferUpdate(io, transfer.from_branch_id, 'sent', result.rows[0]);
      emitTransferUpdate(io, transfer.to_branch_id, 'received', result.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error aprobando transferencia:', error);
    res.status(500).json({ error: 'Error al aprobar transferencia' });
  }
});

// Completar transferencia (actualizar stock en ambas sucursales)
router.put('/:id/complete', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    logTransferOperation('complete_started', {
      transferId: id,
      userId: req.user.id
    });

    // Obtener transferencia
    const transferResult = await client.query(
      'SELECT * FROM inventory_transfers WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (transferResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }

    const transfer = transferResult.rows[0];

    // Verificar que el usuario puede completar (debe ser de la sucursal destino o admin maestro)
    if (!req.user.isMasterAdmin && transfer.to_branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'Solo puedes completar transferencias hacia tu sucursal' });
    }

    if (transfer.status !== 'approved') {
      await safeRollback(client);
      return res.status(400).json({ error: 'La transferencia debe estar aprobada para completarse' });
    }

    // Obtener items de la transferencia
    const itemsResult = await client.query(
      'SELECT * FROM inventory_transfer_items WHERE transfer_id = $1',
      [id]
    );

    // Procesar cada item
    for (const transferItem of itemsResult.rows) {
      // Reducir stock en sucursal origen
      const originInventoryItem = await getLockedInventoryItem(client, transferItem.item_id, transfer.from_branch_id);

      if (!originInventoryItem) {
        await safeRollback(client);
        return res.status(400).json({ error: `Item ${transferItem.item_id} no encontrado en sucursal origen` });
      }

      const currentStock = originInventoryItem.stock_actual || 0;
      if (currentStock < transferItem.quantity) {
        await safeRollback(client);
        return res.status(400).json({
          error: `Stock insuficiente en origen para ${originInventoryItem.name || originInventoryItem.sku}. Stock disponible: ${currentStock}, solicitado: ${transferItem.quantity}`
        });
      }
      const newStockOrigin = Math.max(0, currentStock - transferItem.quantity);

      await client.query(
        `UPDATE inventory_items
         SET stock_actual = $1,
             status = CASE WHEN $1 <= 0 THEN 'vendida' ELSE status END
         WHERE id = $2 AND branch_id = $3`,
        [newStockOrigin, transferItem.item_id, transfer.from_branch_id]
      );

      // Log en sucursal origen
      await client.query(
        `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
         VALUES ($1, 'transferencia_salida', $2, $3, $4, 'transferencia', $5, $6)`,
        [
          transferItem.item_id,
          transferItem.quantity,
          currentStock,
          newStockOrigin,
          `Transferencia a ${transfer.to_branch_id}`,
          req.user.id
        ]
      );

      // Aumentar stock en sucursal destino (o crear item si no existe)
      const destInventoryItem = await getLockedInventoryItem(client, transferItem.item_id, transfer.to_branch_id);

      if (destInventoryItem) {
        // Item existe, actualizar stock
        const destCurrentStock = destInventoryItem.stock_actual || 0;
        const newStockDest = destCurrentStock + transferItem.quantity;

        await client.query(
          `UPDATE inventory_items
           SET stock_actual = $1,
               status = CASE WHEN status = 'vendida' AND $1 > 0 THEN 'disponible' ELSE status END
           WHERE id = $2 AND branch_id = $3`,
          [newStockDest, transferItem.item_id, transfer.to_branch_id]
        );

        // Log en sucursal destino
        await client.query(
          `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
           VALUES ($1, 'transferencia_entrada', $2, $3, $4, 'transferencia', $5, $6)`,
          [
            transferItem.item_id,
            transferItem.quantity,
            destCurrentStock,
            newStockDest,
            `Transferencia desde ${transfer.from_branch_id}`,
            req.user.id
          ]
        );
      } else {
        // Item no existe en destino, crear copia
        const originItemData = originInventoryItem;
        await client.query(
          `INSERT INTO inventory_items (
            id, sku, barcode, name, description, category, metal, stone_type,
            stone_weight, weight, price, cost, stock_actual, stock_min, stock_max,
            status, branch_id, certificate_number, photos
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            originItemData.id, // Mantener mismo ID
            originItemData.sku,
            originItemData.barcode,
            originItemData.name,
            originItemData.description,
            originItemData.category,
            originItemData.metal,
            originItemData.stone_type,
            originItemData.stone_weight,
            originItemData.weight,
            originItemData.price,
            originItemData.cost,
            transferItem.quantity,
            originItemData.stock_min,
            originItemData.stock_max,
            'disponible',
            transfer.to_branch_id,
            originItemData.certificate_number,
            originItemData.photos || []
          ]
        );

        // Log en sucursal destino
        await client.query(
          `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
           VALUES ($1, 'transferencia_entrada', $2, 0, $2, 'transferencia', $3, $4)`,
          [
            transferItem.item_id,
            transferItem.quantity,
            `Transferencia desde ${transfer.from_branch_id}`,
            req.user.id
          ]
        );
      }
    }

    // Marcar transferencia como completada
    const result = await client.query(
      `UPDATE inventory_transfers
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    const completedTransfer = result.rows[0];

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'complete', 'inventory_transfer', $2, $3)`,
        [req.user.id, id, JSON.stringify({ transfer_id: id })]
      );

      logTransferOperation('complete_committed', {
        transferId: id,
        fromBranchId: completedTransfer.from_branch_id,
        toBranchId: completedTransfer.to_branch_id
      });

      if (io) {
        emitTransferUpdate(io, completedTransfer.from_branch_id, 'completed', completedTransfer);
        emitTransferUpdate(io, completedTransfer.to_branch_id, 'completed', completedTransfer);
      }
    } catch (postCommitError) {
      logTransferOperation('complete_post_commit_failed', {
        transferId: id,
        message: postCommitError.message
      });
      console.error('Transferencia completada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json(completedTransfer);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logTransferOperation('complete_failed', {
      transferId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error completando transferencia:', error);
    res.status(500).json({ error: 'Error al completar transferencia' });
  } finally {
    client.release();
  }
});

// Cancelar transferencia
router.put('/:id/cancel', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const transferResult = await query(
      'SELECT * FROM inventory_transfers WHERE id = $1',
      [id]
    );

    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }

    const transfer = transferResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin) {
      const userBranchId = req.user.branchId;
      if (transfer.from_branch_id !== userBranchId && transfer.to_branch_id !== userBranchId) {
        return res.status(403).json({ error: 'No tienes acceso a esta transferencia' });
      }
    }

    if (transfer.status === 'completed') {
      return res.status(400).json({ error: 'No se puede cancelar una transferencia completada' });
    }

    const result = await query(
      `UPDATE inventory_transfers
       SET status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'cancel', 'inventory_transfer', $2, $3)`,
      [req.user.id, id, JSON.stringify({ transfer_id: id })]
    );

    // Emitir actualización en tiempo real a origen y destino
    const updatedTransfer = result.rows[0];
    if (io && updatedTransfer) {
      if (updatedTransfer.from_branch_id) {
        emitTransferUpdate(io, updatedTransfer.from_branch_id, 'cancelled', updatedTransfer);
      }
      if (updatedTransfer.to_branch_id && updatedTransfer.to_branch_id !== updatedTransfer.from_branch_id) {
        emitTransferUpdate(io, updatedTransfer.to_branch_id, 'cancelled', updatedTransfer);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cancelando transferencia:', error);
    res.status(500).json({ error: 'Error al cancelar transferencia' });
  }
});

export default router;
