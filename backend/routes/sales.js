import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess, normalizeBranchId } from '../middleware/authOptional.js';
import { emitSaleUpdate, emitInventoryUpdate } from '../socket/socketHandler.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';
import { getLockedInventoryItem } from '../utils/inventory-helpers.js';
import { roundCurrency, calculateSaleItemSubtotal } from '../utils/recalculation-helpers.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const validateSalePayload = ({ items, payments, requirePayments = true }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 'La venta debe incluir al menos un item';
  }

  for (const item of items) {
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unit_price);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return `Cantidad inválida para ${item?.name || item?.sku || 'item sin nombre'}`;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return `Precio inválido para ${item?.name || item?.sku || 'item sin nombre'}`;
    }
  }

  if (payments === undefined) {
    return requirePayments ? 'La venta debe incluir pagos' : null;
  }

  if (!Array.isArray(payments)) {
    return 'El formato de pagos es inválido';
  }

  for (const payment of payments) {
    const amount = Number(payment?.amount);
    if (!payment?.method) {
      return 'Cada pago debe incluir método';
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return `Monto inválido para el pago ${payment?.method || 'sin método'}`;
    }
  }

  return null;
};

const logSaleOperation = createOperationLogger('sales');

const router = express.Router();

// Obtener ventas
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, start_date, end_date, status, seller_id, guide_id, agency_id } = req.query;
    const requestedBranchId = normalizeBranchId(branch_id);
    const userBranchId = normalizeBranchId(req.user.branchId);
    const branchId = requestedBranchId || userBranchId;

    let sql = `
      SELECT s.*,
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count
      FROM sales s
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND s.branch_id = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND s.branch_id = $${paramCount}`;
      params.push(userBranchId);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND s.created_at >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND s.created_at <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (status) {
      sql += ` AND s.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (seller_id) {
      sql += ` AND s.seller_id = $${paramCount}`;
      params.push(seller_id);
      paramCount++;
    }

    if (guide_id) {
      sql += ` AND s.guide_id = $${paramCount}`;
      params.push(guide_id);
      paramCount++;
    }

    if (agency_id) {
      sql += ` AND s.agency_id = $${paramCount}`;
      params.push(agency_id);
      paramCount++;
    }

    sql += ` ORDER BY s.created_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ventas:', error);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

// Obtener una venta con sus items y pagos
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const saleResult = await query(
      'SELECT * FROM sales WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const sale = saleResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && normalizeBranchId(sale.branch_id) !== normalizeBranchId(req.user.branchId)) {
      return res.status(403).json({ error: 'No tienes acceso a esta venta' });
    }

    // Obtener items
    const itemsResult = await query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [id]
    );

    // Obtener pagos
    const paymentsResult = await query(
      'SELECT * FROM payments WHERE sale_id = $1',
      [id]
    );

    res.json({
      ...sale,
      items: itemsResult.rows,
      payments: paymentsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo venta:', error);
    res.status(500).json({ error: 'Error al obtener venta' });
  }
});

// Crear venta
router.post('/', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');

    const {
      folio, branch_id, seller_id, guide_id, agency_id, customer_id,
      items, payments, discount_percent = 0, discount_amount = 0
    } = req.body;

    const validationError = validateSalePayload({ items, payments, requirePayments: true });
    if (validationError) {
      await safeRollback(client);
      return res.status(400).json({ error: validationError });
    }

    const finalBranchId = normalizeBranchId(branch_id) || normalizeBranchId(req.user.branchId);
    if (!req.user.isMasterAdmin) {
      const allowedBranchIds = (req.user.branchIds || []).map(b => normalizeBranchId(b)).filter(Boolean);
      if (!finalBranchId || !allowedBranchIds.includes(finalBranchId)) {
        await safeRollback(client);
        return res.status(403).json({ error: 'No tienes acceso a esta sucursal' });
      }
    }
    logSaleOperation('create_started', {
      branchId: finalBranchId,
      userId: req.user.id,
      itemsCount: items.length,
      paymentsCount: payments.length
    });

    // Calcular totales
    let subtotal = 0;
    items.forEach(item => {
      subtotal += calculateSaleItemSubtotal(item);
    });

    subtotal = roundCurrency(subtotal);
    const total = roundCurrency(subtotal - (Number(discount_amount) || 0));
    const paymentsTotal = roundCurrency(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));

    if (paymentsTotal !== total) {
      await safeRollback(client);
      return res.status(400).json({
        error: `El total de pagos (${paymentsTotal}) no coincide con el total de la venta (${total})`
      });
    }

    // Crear venta
    const saleResult = await client.query(
      `INSERT INTO sales (
        folio, branch_id, seller_id, guide_id, agency_id, customer_id,
        subtotal, discount_percent, discount_amount, total, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        folio || `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        finalBranchId,
        seller_id,
        guide_id,
        agency_id,
        customer_id,
        subtotal,
        discount_percent,
        discount_amount,
        total,
        'completed',
        req.user.id
      ]
    );

    const sale = saleResult.rows[0];

    // Array para almacenar items de inventario actualizados (para emitir eventos después del COMMIT)
    const updatedInventoryItems = [];

    // Crear items de venta y actualizar inventario
    for (const item of items) {
      // Validar stock antes de crear la venta
      if (item.item_id) {
        const inventoryItem = await getLockedInventoryItem(client, item.item_id);

        if (!inventoryItem) {
          await safeRollback(client);
          return res.status(400).json({ error: `Item ${item.item_id} no encontrado` });
        }

        const currentStock = inventoryItem.stock_actual || 0;
        const requestedQuantity = Number(item.quantity) || 1;

        if (inventoryItem.branch_id && normalizeBranchId(inventoryItem.branch_id) !== normalizeBranchId(finalBranchId)) {
          await safeRollback(client);
          return res.status(400).json({ error: `El item ${item.name || item.sku || item.item_id} no pertenece a la sucursal de la venta` });
        }

        if (currentStock < requestedQuantity) {
          await safeRollback(client);
          return res.status(400).json({ 
            error: `Stock insuficiente para ${item.name || item.sku}. Stock disponible: ${currentStock}, solicitado: ${requestedQuantity}` 
          });
        }

        if (inventoryItem.status !== 'disponible') {
          await safeRollback(client);
          return res.status(400).json({ 
            error: `El item ${item.name || item.sku} no está disponible para venta` 
          });
        }

        item._lockedInventory = inventoryItem;
      }

      const saleItemSubtotal = calculateSaleItemSubtotal(item);

      // Crear sale_item
      await client.query(
        `INSERT INTO sale_items (
          sale_id, item_id, sku, name, quantity, unit_price,
          discount_percent, subtotal, guide_commission, seller_commission
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sale.id,
          item.item_id,
          item.sku,
          item.name,
          item.quantity || 1,
          item.unit_price,
          item.discount_percent || 0,
          saleItemSubtotal,
          item.guide_commission || 0,
          item.seller_commission || 0
        ]
      );

      // Actualizar stock del inventario
      if (item.item_id) {
        const inventoryItem = item._lockedInventory;

        if (inventoryItem) {
          const currentStock = inventoryItem.stock_actual || 0;
          const newStock = Math.max(0, currentStock - (Number(item.quantity) || 1));
          const newStatus = newStock <= 0 ? 'vendida' : 'disponible';
          const itemBranchId = inventoryItem.branch_id || finalBranchId;

          await client.query(
            `UPDATE inventory_items
             SET stock_actual = $1, status = $2
             WHERE id = $3`,
            [newStock, newStatus, item.item_id]
          );

          // Log de inventario
          await client.query(
            `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
             VALUES ($1, 'vendida', $2, $3, $4, 'venta', $5, $6)`,
            [
              item.item_id,
              item.quantity || 1,
              currentStock,
              newStock,
              `Venta ${sale.folio}`,
              req.user.id
            ]
          );
          
          // Guardar referencia para emitir evento después del COMMIT
          updatedInventoryItems.push({
            itemId: item.item_id,
            branchId: itemBranchId
          });
        }
      }
    }

    // Crear pagos
    for (const payment of payments) {
      await client.query(
        `INSERT INTO payments (sale_id, method, amount, currency, bank, card_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sale.id,
          payment.method,
          payment.amount,
          payment.currency || 'MXN',
          payment.bank,
          payment.card_type
        ]
      );
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    // Obtener venta completa
    const fullSaleResult = await query(
      `SELECT s.*,
              (SELECT json_agg(json_build_object(
                'id', si.id,
                'item_id', si.item_id,
                'sku', si.sku,
                'name', si.name,
                'quantity', si.quantity,
                'unit_price', si.unit_price,
                'subtotal', si.subtotal
              )) FROM sale_items si WHERE si.sale_id = s.id) as items,
              (SELECT json_agg(json_build_object(
                'id', p.id,
                'method', p.method,
                'amount', p.amount,
                'currency', p.currency
              )) FROM payments p WHERE p.sale_id = s.id) as payments
       FROM sales s
       WHERE s.id = $1`,
      [sale.id]
    );

    const fullSale = fullSaleResult.rows[0];

    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'create', 'sale', $2, $3)`,
        [req.user.id, sale.id, JSON.stringify({ folio: sale.folio, total })]
      );

      logSaleOperation('create_committed', {
        saleId: sale.id,
        folio: sale.folio,
        branchId: finalBranchId,
        total
      });

      if (io) {
        emitSaleUpdate(io, finalBranchId, 'created', fullSale);

        for (const { itemId, branchId } of updatedInventoryItems) {
          const inventoryResult = await query(
            'SELECT * FROM inventory_items WHERE id = $1',
            [itemId]
          );
          if (inventoryResult.rows.length > 0) {
            emitInventoryUpdate(io, branchId, 'stock_changed', inventoryResult.rows[0]);
          }
        }
      }
    } catch (postCommitError) {
      logSaleOperation('create_post_commit_failed', {
        saleId: sale.id,
        folio: sale.folio,
        message: postCommitError.message
      });
      console.error('Venta creada pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(fullSale);
  } catch (error) {
    // Errores comunes: UUID inválido / not-null / unique
    if (error && error.code === '22P02') {
      if (!transactionCommitted) await safeRollback(client);
      return res.status(400).json({ error: 'Datos inválidos (UUID). Verifica sucursal, vendedor/guía/agencia y items.' });
    }
    if (error && error.code === '23502') {
      if (!transactionCommitted) await safeRollback(client);
      return res.status(400).json({ error: 'Faltan campos requeridos para la venta (unit_price/subtotal/items).' });
    }
    if (error && error.code === '23505') {
      if (!transactionCommitted) await safeRollback(client);
      return res.status(400).json({ error: 'El folio de la venta ya existe' });
    }
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logSaleOperation('create_failed', {
      branchId: req.body?.branch_id || req.user.branchId,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error creando venta:', error);
    res.status(500).json({ error: 'Error al crear venta' });
  } finally {
    client.release();
  }
});

// Actualizar venta (solo master_admin, solo ventas del día actual)
router.put('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    logSaleOperation('update_started', {
      saleId: id,
      userId: req.user.id
    });

    // Verificar que existe y tiene acceso
    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const originalSale = saleResult.rows[0];

    // Verificar acceso (solo master_admin puede editar)
    if (!req.user.isMasterAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo el administrador maestro puede editar ventas' });
    }

    // Verificar que la venta sea del día actual (seguridad)
    const saleDate = new Date(originalSale.created_at);
    const today = new Date();
    if (saleDate.toDateString() !== today.toDateString()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se pueden editar ventas del día actual' });
    }

    // Obtener datos de actualización
    const {
      items, payments, discount_percent, discount_amount,
      subtotal, total, seller_id, guide_id, agency_id, customer_id
    } = req.body;

    const validationError = validateSalePayload({
      items,
      payments: payments === undefined ? [] : payments,
      requirePayments: false
    });
    if (validationError) {
      await safeRollback(client);
      return res.status(400).json({ error: validationError });
    }

    // Obtener items originales
    const originalItemsResult = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [id]
    );
    const originalItems = originalItemsResult.rows;

    // Calcular nuevos totales si no vienen en el request
    let newSubtotal = subtotal;
    let newDiscountAmount = discount_amount || 0;
    let newTotal = total;
    
    if (!newSubtotal && items) {
      newSubtotal = items.reduce((sum, item) => {
        return sum + ((item.unit_price || 0) * (item.quantity || 1));
      }, 0);
    }
    
    if (!newTotal) {
      newTotal = newSubtotal - newDiscountAmount;
    }

    // 1. Ajustar stock: revertir items eliminados/reducidos, descontar items nuevos/aumentados
    // Revertir stock de items eliminados o con cantidad reducida
    for (const originalItem of originalItems) {
      const newItem = items.find(it => it.id === originalItem.id);
      const quantityDiff = newItem ? (originalItem.quantity - newItem.quantity) : originalItem.quantity;
      
      if (quantityDiff > 0 && originalItem.item_id) {
        const inventoryItem = await getLockedInventoryItem(client, originalItem.item_id);

        if (inventoryItem) {
          const currentStock = inventoryItem.stock_actual || 0;
          const restoredStock = currentStock + quantityDiff;
          const newStatus = restoredStock > 0 ? 'disponible' : inventoryItem.status;

          await client.query(
            `UPDATE inventory_items
             SET stock_actual = $1, status = $2
             WHERE id = $3`,
            [restoredStock, newStatus, originalItem.item_id]
          );

          // Log de inventario
          await client.query(
            `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
             VALUES ($1, 'ajuste_edicion_venta', $2, $3, $4, 'edicion_venta', $5, $6)`,
            [
              originalItem.item_id,
              quantityDiff,
              currentStock,
              restoredStock,
              `Ajuste por edición de venta ${originalSale.folio}`,
              req.user.id
            ]
          );
        }
      }
    }

    // Descontar stock de items nuevos o con cantidad aumentada
    for (const newItem of items) {
      const originalItem = originalItems.find(oi => oi.id === newItem.id);
      const quantityDiff = originalItem ? (newItem.quantity - originalItem.quantity) : newItem.quantity;

      if (quantityDiff > 0 && newItem.item_id) {
        // Validar stock disponible
        const inventoryItem = await getLockedInventoryItem(client, newItem.item_id);

        if (!inventoryItem) {
          await safeRollback(client);
          return res.status(400).json({ error: `Item ${newItem.item_id} no encontrado` });
        }

        if (inventoryItem.branch_id && normalizeBranchId(inventoryItem.branch_id) !== normalizeBranchId(originalSale.branch_id || req.user.branchId)) {
          await safeRollback(client);
          return res.status(400).json({ error: `El item ${newItem.name || newItem.sku || newItem.item_id} no pertenece a la sucursal de la venta` });
        }

        const currentStock = inventoryItem.stock_actual || 0;
        
        if (currentStock < quantityDiff) {
          await safeRollback(client);
          return res.status(400).json({
            error: `Stock insuficiente. Stock disponible: ${currentStock}, solicitado: ${quantityDiff}`
          });
        }

        const newStock = Math.max(0, currentStock - quantityDiff);
        const newStatus = newStock <= 0 ? 'vendida' : 'disponible';

        await client.query(
          `UPDATE inventory_items
           SET stock_actual = $1, status = $2
           WHERE id = $3`,
          [newStock, newStatus, newItem.item_id]
        );

        // Log de inventario
        await client.query(
          `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
           VALUES ($1, 'venta_edicion', $2, $3, $4, 'edicion_venta', $5, $6)`,
          [
            newItem.item_id,
            quantityDiff,
            currentStock,
            newStock,
            `Ajuste por edición de venta ${originalSale.folio}`,
            req.user.id
          ]
        );
      }
    }

    // 2. Eliminar sale_items que ya no están
    for (const originalItem of originalItems) {
      if (!items.find(it => it.id === originalItem.id)) {
        await client.query('DELETE FROM sale_items WHERE id = $1', [originalItem.id]);
      }
    }

    // 3. Actualizar o crear sale_items
    for (const item of items) {
      const saleItemData = {
        sale_id: id,
        item_id: item.item_id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity || 1,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent || 0,
        subtotal: calculateSaleItemSubtotal(item),
        guide_commission: item.guide_commission || 0,
        seller_commission: item.seller_commission || 0
      };

      if (item.id && originalItems.find(oi => oi.id === item.id)) {
        // Actualizar existente
        await client.query(
          `UPDATE sale_items
           SET item_id = $1, sku = $2, name = $3, quantity = $4, unit_price = $5,
               discount_percent = $6, subtotal = $7, guide_commission = $8, seller_commission = $9
           WHERE id = $10`,
          [
            saleItemData.item_id,
            saleItemData.sku,
            saleItemData.name,
            saleItemData.quantity,
            saleItemData.unit_price,
            saleItemData.discount_percent,
            saleItemData.subtotal,
            saleItemData.guide_commission,
            saleItemData.seller_commission,
            item.id
          ]
        );
      } else {
        // Crear nuevo
        await client.query(
          `INSERT INTO sale_items (
            sale_id, item_id, sku, name, quantity, unit_price,
            discount_percent, subtotal, guide_commission, seller_commission
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            saleItemData.sale_id,
            saleItemData.item_id,
            saleItemData.sku,
            saleItemData.name,
            saleItemData.quantity,
            saleItemData.unit_price,
            saleItemData.discount_percent,
            saleItemData.subtotal,
            saleItemData.guide_commission,
            saleItemData.seller_commission
          ]
        );
      }
    }

    // 4. Actualizar payments si vienen en el request
    if (payments !== undefined) {
      const paymentsTotal = roundCurrency((payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
      if (paymentsTotal !== roundCurrency(newTotal)) {
        await safeRollback(client);
        return res.status(400).json({
          error: `El total de pagos (${paymentsTotal}) no coincide con el total de la venta (${roundCurrency(newTotal)})`
        });
      }

      // Eliminar pagos existentes
      await client.query('DELETE FROM payments WHERE sale_id = $1', [id]);
      
      // Crear nuevos pagos
      for (const payment of payments || []) {
        await client.query(
          `INSERT INTO payments (sale_id, method, amount, currency, bank, card_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            payment.method,
            payment.amount,
            payment.currency || 'MXN',
            payment.bank,
            payment.card_type
          ]
        );
      }
    }

    // 5. Actualizar la venta
    await client.query(
      `UPDATE sales
       SET subtotal = $1, discount_percent = $2, discount_amount = $3, total = $4,
           seller_id = $5, guide_id = $6, agency_id = $7, customer_id = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [
        newSubtotal,
        discount_percent || 0,
        newDiscountAmount,
        newTotal,
        seller_id || originalSale.seller_id,
        guide_id || originalSale.guide_id,
        agency_id || originalSale.agency_id,
        customer_id || originalSale.customer_id,
        id
      ]
    );

    // Registrar en audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'sale', $2, $3)`,
      [req.user.id, id, JSON.stringify({ 
        folio: originalSale.folio, 
        old_total: originalSale.total, 
        new_total: newTotal,
        items_changed: items.length - originalItems.length
      })]
    );

    await client.query('COMMIT');
  transactionCommitted = true;

    // Obtener venta completa actualizada
    const fullSaleResult = await query(
      `SELECT s.*,
              (SELECT json_agg(json_build_object(
                'id', si.id,
                'item_id', si.item_id,
                'sku', si.sku,
                'name', si.name,
                'quantity', si.quantity,
                'unit_price', si.unit_price,
                'subtotal', si.subtotal
              )) FROM sale_items si WHERE si.sale_id = s.id) as items,
              (SELECT json_agg(json_build_object(
                'id', p.id,
                'method', p.method,
                'amount', p.amount,
                'currency', p.currency
              )) FROM payments p WHERE p.sale_id = s.id) as payments
       FROM sales s
       WHERE s.id = $1`,
      [id]
    );

    const fullSale = fullSaleResult.rows[0];

    try {
      logSaleOperation('update_committed', {
        saleId: id,
        branchId: originalSale.branch_id || req.user.branchId,
        total: newTotal
      });

      if (io) {
        emitSaleUpdate(io, originalSale.branch_id || req.user.branchId, 'updated', fullSale);
        for (const item of items) {
          if (item.item_id) {
            const inventoryResult = await query(
              'SELECT * FROM inventory_items WHERE id = $1',
              [item.item_id]
            );
            if (inventoryResult.rows.length > 0) {
              emitInventoryUpdate(io, originalSale.branch_id || req.user.branchId, 'stock_changed', inventoryResult.rows[0]);
            }
          }
        }
      }
    } catch (postCommitError) {
      logSaleOperation('update_post_commit_failed', {
        saleId: id,
        message: postCommitError.message
      });
      console.error('Venta actualizada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json(fullSale);
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logSaleOperation('update_failed', {
      saleId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error actualizando venta:', error);
    res.status(500).json({ error: 'Error al actualizar venta' });
  } finally {
    client.release();
  }
});

// Eliminar venta (solo para reversión/corrección)
router.delete('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    logSaleOperation('delete_started', {
      saleId: id,
      userId: req.user.id
    });

    // Verificar que existe y tiene acceso
    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1',
      [id]
    );

    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    const sale = saleResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && normalizeBranchId(sale.branch_id) !== normalizeBranchId(req.user.branchId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes acceso a esta venta' });
    }

    // Obtener items de la venta para reversión de stock
    const itemsResult = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [id]
    );

    // Revertir stock del inventario
    for (const saleItem of itemsResult.rows) {
      if (saleItem.item_id) {
        // Obtener stock actual
        const inventoryItem = await getLockedInventoryItem(client, saleItem.item_id);

        if (inventoryItem) {
          const currentStock = inventoryItem.stock_actual || 0;
          const quantityToRestore = saleItem.quantity || 1;
          const newStock = currentStock + quantityToRestore;

          await client.query(
            `UPDATE inventory_items
             SET stock_actual = $1,
                 status = CASE 
                   WHEN $1 > 0 THEN 'disponible'
                   ELSE status
                 END
             WHERE id = $2`,
            [newStock, saleItem.item_id]
          );

          // Log de inventario
          await client.query(
            `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
             VALUES ($1, 'devolucion', $2, $3, $4, 'venta_eliminada', $5, $6)`,
            [
              saleItem.item_id,
              quantityToRestore,
              currentStock,
              newStock,
              `Venta ${sale.folio} eliminada`,
              req.user.id
            ]
          );
        }
      }
    }

    // Eliminar sale_items
    await client.query('DELETE FROM sale_items WHERE sale_id = $1', [id]);
    
    // Eliminar payments
    await client.query('DELETE FROM payments WHERE sale_id = $1', [id]);

    // Eliminar la venta
    await client.query('DELETE FROM sales WHERE id = $1', [id]);

    // Registrar en audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'sale', $2, $3)`,
      [req.user.id, id, JSON.stringify({ folio: sale.folio, total: sale.total })]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logSaleOperation('delete_committed', {
        saleId: id,
        folio: sale.folio,
        branchId: sale.branch_id || req.user.branchId
      });

      if (io) {
        emitSaleUpdate(io, sale.branch_id || req.user.branchId, 'deleted', { id });
      }
    } catch (postCommitError) {
      logSaleOperation('delete_post_commit_failed', {
        saleId: id,
        message: postCommitError.message
      });
      console.error('Venta eliminada pero fallaron efectos post-commit:', postCommitError);
    }

    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logSaleOperation('delete_failed', {
      saleId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando venta:', error);
    res.status(500).json({ error: 'Error al eliminar venta' });
  } finally {
    client.release();
  }
});

export default router;
