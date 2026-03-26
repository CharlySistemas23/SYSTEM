import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { emitSupplierUpdate } from '../socket/socketHandler.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';
import { recalculatePurchaseOrderTotals } from '../utils/recalculation-helpers.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const logPurchaseOrderOperation = createOperationLogger('purchase_orders');

const router = express.Router();

// Listar órdenes de compra
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, status, supplier_id, start_date, end_date, search } = req.query;
    
    // Manejar branch_id cuando viene como string "null"
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT po.*, 
             s.name as supplier_name,
             s.code as supplier_code,
             b.name as branch_name,
             COUNT(DISTINCT poi.id) as items_count
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN branches b ON po.branch_id = b.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND po.branch_id = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND po.branch_id = $${paramCount}`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtros adicionales
    if (status) {
      sql += ` AND po.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (supplier_id) {
      sql += ` AND po.supplier_id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND po.order_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND po.order_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (search) {
      sql += ` AND (po.order_number ILIKE $${paramCount} OR po.reference_number ILIKE $${paramCount} OR s.name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ` GROUP BY po.id, s.name, s.code, b.name ORDER BY po.order_date DESC, po.created_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo órdenes de compra:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de compra' });
  }
});

// Obtener orden de compra por ID
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener orden
    const orderResult = await query(
      `SELECT po.*, 
              s.name as supplier_name,
              s.code as supplier_code,
              b.name as branch_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN branches b ON po.branch_id = b.id
       WHERE po.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    const order = orderResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (order.branch_id !== req.user.branchId) {
        return res.status(403).json({ error: 'No tienes acceso a esta orden de compra' });
      }
    }

    // Obtener items
    const itemsResult = await query(
      `SELECT poi.*, 
              ii.name as inventory_item_name,
              ii.sku as inventory_item_sku
       FROM purchase_order_items poi
       LEFT JOIN inventory_items ii ON poi.inventory_item_id = ii.id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.created_at ASC`,
      [id]
    );

    order.items = itemsResult.rows;

    res.json(order);
  } catch (error) {
    console.error('Error obteniendo orden de compra:', error);
    res.status(500).json({ error: 'Error al obtener orden de compra' });
  }
});

// Crear orden de compra
router.post('/', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const {
      supplier_id, order_number, reference_number,
      order_date, expected_delivery_date,
      status, priority,
      subtotal, tax_amount, discount_amount, shipping_cost, total_amount, currency,
      tracking_number, carrier, shipping_method,
      notes, internal_notes,
      branch_id, items
    } = req.body;

    logPurchaseOrderOperation('create_started', {
      orderNumber: order_number,
      supplierId: supplier_id,
      userId: req.user.id,
      itemsCount: Array.isArray(items) ? items.length : 0
    });

    if (!supplier_id || !order_number) {
      await safeRollback(client);
      return res.status(400).json({ error: 'supplier_id y order_number son requeridos' });
    }

    // Verificar que el proveedor existe
    const supplierResult = await client.query(
      'SELECT id, branch_id, is_shared FROM suppliers WHERE id = $1',
      [supplier_id]
    );

    if (supplierResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    // Verificar permisos del proveedor
    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Verificar que el número de orden no exista
    const existingOrder = await client.query(
      'SELECT id FROM purchase_orders WHERE order_number = $1',
      [order_number]
    );
    if (existingOrder.rows.length > 0) {
      await safeRollback(client);
      return res.status(400).json({ error: 'El número de orden ya existe' });
    }

    const finalBranchId = branch_id || req.user.branchId;
    const finalOrderDate = order_date || new Date().toISOString().split('T')[0];

    // Calcular totales si no se proporcionan
    let finalSubtotal = subtotal || 0;
    let finalTaxAmount = tax_amount || 0;
    let finalDiscountAmount = discount_amount || 0;
    let finalShippingCost = shipping_cost || 0;
    let finalTotalAmount = total_amount || 0;

    if (items && items.length > 0) {
      finalSubtotal = items.reduce((sum, item) => {
        const lineTotal = (item.quantity_ordered * item.unit_price) - (item.discount_amount || 0);
        return sum + lineTotal;
      }, 0);
      finalTotalAmount = finalSubtotal + finalTaxAmount - finalDiscountAmount + finalShippingCost;
    }

    // Crear orden
    const orderResult = await client.query(
      `INSERT INTO purchase_orders (
        supplier_id, order_number, reference_number,
        order_date, expected_delivery_date,
        status, priority,
        subtotal, tax_amount, discount_amount, shipping_cost, total_amount, currency,
        tracking_number, carrier, shipping_method,
        notes, internal_notes,
        branch_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        supplier_id, order_number, reference_number || null,
        finalOrderDate, expected_delivery_date || null,
        status || 'draft', priority || 'normal',
        finalSubtotal, finalTaxAmount, finalDiscountAmount, finalShippingCost, finalTotalAmount, currency || 'MXN',
        tracking_number || null, carrier || null, shipping_method || null,
        notes || null, internal_notes || null,
        finalBranchId, req.user.id || null
      ]
    );

    const order = orderResult.rows[0];

    // Crear items si se proporcionan
    if (items && items.length > 0) {
      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (
            purchase_order_id, inventory_item_id, sku, name, description,
            quantity_ordered, unit_price, discount_percentage, discount_amount,
            status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            order.id,
            item.inventory_item_id || null,
            item.sku || null,
            item.name,
            item.description || null,
            item.quantity_ordered,
            item.unit_price,
            item.discount_percentage || 0,
            item.discount_amount || 0,
            item.status || 'pending',
            item.notes || null
          ]
        );
      }
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logPurchaseOrderOperation('create_committed', {
        orderId: order.id,
        orderNumber: order.order_number,
        branchId: order.branch_id,
        itemsCount: Array.isArray(items) ? items.length : 0
      });

      if (io) {
        emitSupplierUpdate(io, 'updated', supplier, req.user);
      }
    } catch (postCommitError) {
      logPurchaseOrderOperation('create_post_commit_failed', {
        orderId: order.id,
        message: postCommitError.message
      });
      console.error('Orden de compra creada pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(order);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('create_failed', {
      orderNumber: req.body?.order_number,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error creando orden de compra:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de orden ya existe' });
    }
    res.status(500).json({ error: 'Error al crear orden de compra' });
  } finally {
    client.release();
  }
});

// Actualizar orden de compra
router.put('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      supplier_id, order_number, reference_number,
      order_date, expected_delivery_date, actual_delivery_date,
      status, priority,
      subtotal, tax_amount, discount_amount, shipping_cost, total_amount, currency,
      tracking_number, carrier, shipping_method,
      notes, internal_notes,
      approved_by
    } = req.body;

    logPurchaseOrderOperation('update_started', {
      orderId: id,
      userId: req.user.id,
      status
    });

    // Verificar que la orden existe
    const existingResult = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes permisos para editar esta orden' });
      }
    }

    // Verificar que el número de orden no esté en uso por otra orden
    if (order_number && order_number !== existing.order_number) {
      const codeCheck = await client.query(
        'SELECT id FROM purchase_orders WHERE order_number = $1 AND id != $2',
        [order_number, id]
      );
      if (codeCheck.rows.length > 0) {
        await safeRollback(client);
        return res.status(400).json({ error: 'El número de orden ya está en uso' });
      }
    }

    // Si se aprueba, registrar aprobación
    let approvedAt = existing.approved_at;
    let finalApprovedBy = existing.approved_by;
    if (status === 'confirmed' && !existing.approved_at) {
      approvedAt = new Date().toISOString();
      finalApprovedBy = approved_by || req.user.id;
    }

    const result = await client.query(
      `UPDATE purchase_orders SET
        supplier_id = COALESCE($1, supplier_id),
        order_number = COALESCE($2, order_number),
        reference_number = COALESCE($3, reference_number),
        order_date = COALESCE($4, order_date),
        expected_delivery_date = COALESCE($5, expected_delivery_date),
        actual_delivery_date = COALESCE($6, actual_delivery_date),
        status = COALESCE($7, status),
        priority = COALESCE($8, priority),
        subtotal = COALESCE($9, subtotal),
        tax_amount = COALESCE($10, tax_amount),
        discount_amount = COALESCE($11, discount_amount),
        shipping_cost = COALESCE($12, shipping_cost),
        total_amount = COALESCE($13, total_amount),
        currency = COALESCE($14, currency),
        tracking_number = COALESCE($15, tracking_number),
        carrier = COALESCE($16, carrier),
        shipping_method = COALESCE($17, shipping_method),
        notes = COALESCE($18, notes),
        internal_notes = COALESCE($19, internal_notes),
        approved_by = COALESCE($20, approved_by),
        approved_at = COALESCE($21, approved_at),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $22
      RETURNING *`,
      [
        supplier_id, order_number, reference_number,
        order_date, expected_delivery_date, actual_delivery_date,
        status, priority,
        subtotal, tax_amount, discount_amount, shipping_cost, total_amount, currency,
        tracking_number, carrier, shipping_method,
        notes, internal_notes,
        finalApprovedBy, approvedAt, id
      ]
    );

    const order = result.rows[0];

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logPurchaseOrderOperation('update_committed', {
        orderId: id,
        orderNumber: order.order_number,
        status: order.status
      });

      if (io) {
        const supplier = await query(
          'SELECT * FROM suppliers WHERE id = $1',
          [order.supplier_id]
        );
        if (supplier.rows.length > 0) {
          emitSupplierUpdate(io, 'updated', supplier.rows[0], req.user);
        }
      }
    } catch (postCommitError) {
      logPurchaseOrderOperation('update_post_commit_failed', {
        orderId: id,
        message: postCommitError.message
      });
      console.error('Orden de compra actualizada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json(order);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('update_failed', {
      orderId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error actualizando orden de compra:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de orden ya existe' });
    }
    res.status(500).json({ error: 'Error al actualizar orden de compra' });
  } finally {
    client.release();
  }
});

// Eliminar orden de compra
router.delete('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    const { id } = req.params;
    await client.query('BEGIN');
    logPurchaseOrderOperation('delete_started', {
      orderId: id,
      userId: req.user.id
    });

    // Verificar que la orden existe
    const existingResult = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes permisos para eliminar esta orden' });
      }
    }

    // Solo permitir eliminar si está en draft o cancelled
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      await safeRollback(client);
      return res.status(400).json({ error: 'Solo se pueden eliminar órdenes en estado draft o cancelled' });
    }

    await client.query('DELETE FROM purchase_orders WHERE id = $1', [id]);

    await client.query('COMMIT');
    transactionCommitted = true;

    logPurchaseOrderOperation('delete_committed', {
      orderId: id,
      orderNumber: existing.order_number,
      branchId: existing.branch_id
    });

    res.json({ message: 'Orden de compra eliminada' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('delete_failed', {
      orderId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando orden de compra:', error);
    res.status(500).json({ error: 'Error al eliminar orden de compra' });
  } finally {
    client.release();
  }
});

// ========== GESTIÓN DE ITEMS DE ORDEN ==========

// Agregar item a orden
router.post('/:id/items', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      inventory_item_id, sku, name, description,
      quantity_ordered, unit_price,
      discount_percentage, discount_amount,
      status, notes
    } = req.body;

    logPurchaseOrderOperation('item_create_started', {
      orderId: id,
      userId: req.user.id,
      sku,
      name
    });

    if (!name || !quantity_ordered || !unit_price) {
      await safeRollback(client);
      return res.status(400).json({ error: 'name, quantity_ordered y unit_price son requeridos' });
    }

    // Verificar que la orden existe
    const orderResult = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (orderResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    const order = orderResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (order.branch_id !== req.user.branchId) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes acceso a esta orden' });
      }
    }

    const result = await client.query(
      `INSERT INTO purchase_order_items (
        purchase_order_id, inventory_item_id, sku, name, description,
        quantity_ordered, unit_price, discount_percentage, discount_amount,
        status, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        inventory_item_id || null,
        sku || null,
        name,
        description || null,
        quantity_ordered,
        unit_price,
        discount_percentage || 0,
        discount_amount || 0,
        status || 'pending',
        notes || null
      ]
    );

    const totals = await recalculatePurchaseOrderTotals(client, id);

    await client.query('COMMIT');
    transactionCommitted = true;

    logPurchaseOrderOperation('item_create_committed', {
      orderId: id,
      itemId: result.rows[0].id,
      subtotal: totals.subtotal,
      total: totals.total
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('item_create_failed', {
      orderId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error agregando item a orden:', error);
    res.status(500).json({ error: 'Error al agregar item' });
  } finally {
    client.release();
  }
});

// Actualizar item de orden
router.put('/items/:itemId', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { itemId } = req.params;
    const {
      quantity_ordered, quantity_received,
      unit_price, discount_percentage, discount_amount,
      status, notes
    } = req.body;

    logPurchaseOrderOperation('item_update_started', {
      itemId,
      userId: req.user.id
    });

    // Obtener item y verificar permisos
    const itemResult = await client.query(
      `SELECT poi.*, po.branch_id
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.purchase_order_id = po.id
       WHERE poi.id = $1
       FOR UPDATE`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const item = itemResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (item.branch_id !== req.user.branchId) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes acceso a este item' });
      }
    }

    const result = await client.query(
      `UPDATE purchase_order_items SET
        quantity_ordered = COALESCE($1, quantity_ordered),
        quantity_received = COALESCE($2, quantity_received),
        unit_price = COALESCE($3, unit_price),
        discount_percentage = COALESCE($4, discount_percentage),
        discount_amount = COALESCE($5, discount_amount),
        status = COALESCE($6, status),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *`,
      [
        quantity_ordered, quantity_received,
        unit_price, discount_percentage, discount_amount,
        status, notes, itemId
      ]
    );

    const totals = await recalculatePurchaseOrderTotals(client, item.purchase_order_id);

    await client.query('COMMIT');
    transactionCommitted = true;

    logPurchaseOrderOperation('item_update_committed', {
      itemId,
      orderId: item.purchase_order_id,
      subtotal: totals.subtotal,
      total: totals.total
    });

    res.json(result.rows[0]);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('item_update_failed', {
      itemId: req.params?.itemId,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error actualizando item:', error);
    res.status(500).json({ error: 'Error al actualizar item' });
  } finally {
    client.release();
  }
});

// Eliminar item de orden
router.delete('/items/:itemId', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const { itemId } = req.params;
    logPurchaseOrderOperation('item_delete_started', {
      itemId,
      userId: req.user.id
    });

    // Obtener item y verificar permisos
    const itemResult = await client.query(
      `SELECT poi.*, po.branch_id
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.purchase_order_id = po.id
       WHERE poi.id = $1
       FOR UPDATE`,
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const item = itemResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (item.branch_id !== req.user.branchId) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes acceso a este item' });
      }
    }

    await client.query('DELETE FROM purchase_order_items WHERE id = $1', [itemId]);

    const totals = await recalculatePurchaseOrderTotals(client, item.purchase_order_id);

    await client.query('COMMIT');
    transactionCommitted = true;

    logPurchaseOrderOperation('item_delete_committed', {
      itemId,
      orderId: item.purchase_order_id,
      subtotal: totals.subtotal,
      total: totals.total
    });

    res.json({ message: 'Item eliminado' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logPurchaseOrderOperation('item_delete_failed', {
      itemId: req.params?.itemId,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando item:', error);
    res.status(500).json({ error: 'Error al eliminar item' });
  } finally {
    client.release();
  }
});

export default router;
