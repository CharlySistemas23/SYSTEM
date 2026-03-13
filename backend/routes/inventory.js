import express from 'express';
import { query, getClient } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { emitInventoryUpdate } from '../socket/socketHandler.js';
import { createOperationLogger, safeRollback } from '../utils/operation-helpers.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const logInventoryOperation = createOperationLogger('inventory');

const router = express.Router();

// Obtener items de inventario
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const {
      branch_id, status, search, category, metal, stone_type, min_price, max_price,
      material, purity, plating, style, finish, theme, condition, location_detail,
      collection, updated_after
    } = req.query;

    // Sync incremental: solo cuando se envía updated_after se limita el resultado
    const syncLimit = (updated_after && req.query.limit)
      ? Math.min(parseInt(req.query.limit) || 500, 2000)
      : null;

    const normalizeBranchId = (id) => {
      if (id == null || id === '' || id === 'null' || id === 'undefined') return null;
      const s = String(id).trim();
      return s ? s.toLowerCase() : null;
    };

    // Resolver branch_id efectivo (ignorar "all" para devolver TODAS las piezas)
    let branchId = null;
    const branchVal = (branch_id && String(branch_id).trim().toLowerCase());
    if (branchVal && branchVal !== 'null' && branchVal !== 'undefined' && branchVal !== 'all') {
      branchId = normalizeBranchId(branch_id);
    }
    if (!req.user.isMasterAdmin) {
      const allowedBranchIds = (req.user.branchIds || []).map(b => normalizeBranchId(b)).filter(Boolean);
      const queryBranchOk = branchId && allowedBranchIds.includes(branchId);
      if (!queryBranchOk) branchId = normalizeBranchId(req.user.branchId);
      if (!branchId) {
        return res.status(400).json({
          error: 'Usuario sin sucursal asignada',
          code: 'NO_BRANCH_ASSIGNED',
          message: 'Asigne una sucursal al empleado en Administración para ver el inventario.'
        });
      }
    }

    // ── Construir cláusula WHERE compartida ─────────────────────────────
    // La misma WHERE se usa tanto para la query de ítems como para la de stats.
    // Esto evita el frágil regex de reemplazo de SQL anterior.
    const whereParts = ['1=1'];
    const whereParams = [];
    let p = 1;

    if (branchId) {
      whereParts.push(`i.branch_id = $${p}::uuid`);
      whereParams.push(branchId); p++;
    }
    if (status) {
      whereParts.push(`i.status = $${p}`);
      whereParams.push(status); p++;
    }
    if (search) {
      whereParts.push(`(i.name ILIKE $${p} OR i.sku ILIKE $${p} OR i.barcode ILIKE $${p})`);
      whereParams.push(`%${search}%`); p++;
    }
    if (category) {
      whereParts.push(`i.category = $${p}`);
      whereParams.push(category); p++;
    }
    if (metal) {
      whereParts.push(`i.metal = $${p}`);
      whereParams.push(metal); p++;
    }
    if (stone_type) {
      whereParts.push(`i.stone_type = $${p}`);
      whereParams.push(stone_type); p++;
    }
    if (min_price) {
      whereParts.push(`i.price >= $${p}`);
      whereParams.push(min_price); p++;
    }
    if (max_price) {
      whereParts.push(`i.price <= $${p}`);
      whereParams.push(max_price); p++;
    }
    if (material) {
      whereParts.push(`(i.material = $${p} OR i.metal ILIKE $${p})`);
      whereParams.push(`%${material}%`); p++;
    }
    if (purity) {
      whereParts.push(`(i.purity = $${p} OR i.metal ILIKE $${p})`);
      whereParams.push(`%${purity}%`); p++;
    }
    if (plating) {
      whereParts.push(`i.plating = $${p}`);
      whereParams.push(plating); p++;
    }
    if (style) {
      whereParts.push(`i.style = $${p}`);
      whereParams.push(style); p++;
    }
    if (finish) {
      whereParts.push(`i.finish_type = $${p}`);
      whereParams.push(finish); p++;
    }
    if (theme) {
      whereParts.push(`i.theme = $${p}`);
      whereParams.push(theme); p++;
    }
    if (condition) {
      whereParts.push(`i.condition = $${p}`);
      whereParams.push(condition); p++;
    }
    if (location_detail) {
      whereParts.push(`(i.location_detail = $${p} OR i.location = $${p})`);
      whereParams.push(location_detail); p++;
    }
    if (collection) {
      whereParts.push(`i.collection = $${p}`);
      whereParams.push(collection); p++;
    }
    if (updated_after) {
      whereParts.push(`i.updated_at > $${p}`);
      whereParams.push(updated_after); p++;
    }

    const whereClause = 'WHERE ' + whereParts.join(' AND ');

    // ── Query de estadísticas globales (KPIs) ───────────────────────────
    // Se ejecuta primero; si falla no bloquea la carga de ítems.
    let globalStats = null;
    try {
      const statsSql = `
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE i.status = 'disponible')  AS disponible,
          COUNT(*) FILTER (WHERE i.status = 'vendida')     AS vendida,
          COUNT(*) FILTER (WHERE i.status = 'apartada')    AS apartada,
          COUNT(*) FILTER (WHERE i.status = 'reparacion')  AS reparacion,
          COALESCE(SUM(COALESCE(i.cost,0) * GREATEST(COALESCE(i.stock_actual,0),1)),0) AS total_value,
          COALESCE(SUM(GREATEST(COALESCE(i.stock_actual,0),0)),0)                       AS total_stock
        FROM inventory_items i
        ${whereClause}
      `;
      const sr = (await query(statsSql, whereParams)).rows[0] || {};
      globalStats = {
        total:      parseInt(sr.total      || '0', 10),
        disponible: parseInt(sr.disponible || '0', 10),
        vendida:    parseInt(sr.vendida    || '0', 10),
        apartada:   parseInt(sr.apartada   || '0', 10),
        reparacion: parseInt(sr.reparacion || '0', 10),
        totalValue: parseFloat(sr.total_value || '0'),
        totalStock: parseInt(sr.total_stock   || '0', 10),
      };
    } catch (statsErr) {
      console.warn('Stats query failed (non-fatal):', statsErr.message);
      // globalStats stays null; frontend calculates from items array
    }

    // ── Query de ítems ──────────────────────────────────────────────────
    let itemsSql = `
      SELECT i.*,
             s.name AS supplier_name,
             s.code AS supplier_code
      FROM inventory_items i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      ${whereClause}
      ORDER BY i.created_at DESC
    `;
    const itemsParams = [...whereParams];
    if (syncLimit) {
      itemsSql += ` LIMIT $${p}`;
      itemsParams.push(syncLimit);
    }

    const result = await query(itemsSql, itemsParams);

    res.json({
      items: result.rows,
      total: globalStats?.total ?? result.rows.length,
      stats: globalStats
    });
  } catch (error) {
    console.error('Error obteniendo inventario:', error);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

// Obtener un item por ID
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT i.*, 
              s.name as supplier_name,
              s.code as supplier_code
       FROM inventory_items i
       LEFT JOIN suppliers s ON i.supplier_id = s.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const item = result.rows[0];

    // Verificar acceso a la sucursal
    if (!req.user.isMasterAdmin && item.branch_id && item.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este item' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error obteniendo item:', error);
    res.status(500).json({ error: 'Error al obtener item' });
  }
});

// Crear item
router.post('/', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;

  try {
    await client.query('BEGIN');

    const {
      sku, barcode, name, description, category, subcategory, collection, metal, material, purity, plating,
      stone_type, stone_weight, stones, weight, measurements, price, sale_price, cost, discount, discount_amount,
      currency, margin_percent, stock_actual, stock_min, stock_max, status, condition, location_detail,
      style, finish_type, theme, branch_id, certificate_number, certificate_details, supplier, supplier_code,
      supplier_id, notes, photos
    } = req.body;

    const finalBranchId = branch_id || req.user.branchId;
    logInventoryOperation('create_started', {
      branchId: finalBranchId,
      userId: req.user.id,
      sku,
      name
    });

    const result = await client.query(
      `INSERT INTO inventory_items (
        sku, barcode, name, description, category, subcategory, collection, metal, material, purity, plating,
        stone_type, stone_weight, stones, weight, measurements, price, sale_price, cost, discount, discount_amount,
        currency, margin_percent, stock_actual, stock_min, stock_max, status, condition, location_detail,
        style, finish_type, theme, branch_id, certificate_number, certificate_details, supplier, supplier_code,
        supplier_id, notes, photos
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
      RETURNING *`,
      [
        sku, barcode, name, description || name, category, subcategory || null, collection || null, metal, material || null, purity || null, plating || null,
        stone_type || null, stone_weight || null, stones || null, weight || 0, measurements || null, price || null, sale_price || null, cost || 0, discount || null, discount_amount || null,
        currency || 'MXN', margin_percent || null, stock_actual || 0, stock_min || 0, stock_max || 0,
        status || 'disponible', condition || null, location_detail || null,
        style || null, finish_type || null, theme || null, finalBranchId, certificate_number || null, certificate_details || null, supplier || null, supplier_code || null,
        supplier_id || null, notes || null, photos || []
      ]
    );

    const item = result.rows[0];

    // Log de inventario
    await client.query(
      `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
       VALUES ($1, 'entrada', $2, 0, $2, 'creacion', 'Item creado', $3)`,
      [item.id, stock_actual || 0, req.user.id]
    );

    // Registrar en audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'inventory_item', $2, $3)`,
      [req.user.id, item.id, JSON.stringify({ sku, name })]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logInventoryOperation('create_committed', {
        itemId: item.id,
        branchId: finalBranchId,
        sku
      });

      if (io) {
        emitInventoryUpdate(io, finalBranchId, 'created', item);
      }
    } catch (postCommitError) {
      logInventoryOperation('create_post_commit_failed', {
        itemId: item.id,
        message: postCommitError.message
      });
      console.error('Item creado pero fallaron efectos post-commit:', postCommitError);
    }

    res.status(201).json(item);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      if (!transactionCommitted) {
        await safeRollback(client);
      }
      // Determinar qué campo está duplicado
      // Usar req.body para obtener sku y barcode de forma segura
      const skuValue = req.body?.sku || 'desconocido';
      const barcodeValue = req.body?.barcode || 'desconocido';
      
      let errorMessage = 'El SKU o código de barras ya existe';
      if (error.constraint === 'inventory_items_sku_key') {
        errorMessage = `El SKU "${skuValue}" ya existe. Si estás creando en una sucursal diferente, el sistema agregará automáticamente el prefijo de sucursal.`;
      } else if (error.constraint === 'inventory_items_barcode_key') {
        errorMessage = `El código de barras "${barcodeValue}" ya existe`;
      }
      return res.status(400).json({ 
        error: errorMessage,
        code: 'DUPLICATE_SKU',
        duplicateField: error.constraint === 'inventory_items_sku_key' ? 'sku' : 'barcode',
        suggestedFix: error.constraint === 'inventory_items_sku_key' ? 'add_branch_prefix' : null
      });
    }
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logInventoryOperation('create_failed', {
      userId: req.user.id,
      code: error?.code,
      message: error?.message,
      sku: req.body?.sku
    });
    console.error('Error creando item:', error);
    res.status(500).json({ error: 'Error al crear item' });
  } finally {
    client.release();
  }
});

// Actualizar item
router.put('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let existingItem = null; // Declarar fuera del try para que esté disponible en el catch
  let transactionCommitted = false;
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updateData = req.body;
    logInventoryOperation('update_started', {
      itemId: id,
      userId: req.user.id
    });

    // Verificar que el item existe y tiene acceso
    const existingResult = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    existingItem = existingResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && existingItem.branch_id && existingItem.branch_id !== req.user.branchId) {
      return res.status(403).json({ error: 'No tienes acceso a este item' });
    }

    // Si cambió el stock, registrar en log
    if (updateData.stock_actual !== undefined && updateData.stock_actual !== existingItem.stock_actual) {
      const stockDiff = updateData.stock_actual - existingItem.stock_actual;
      const userId = req.user?.id || req.user?.userId || null;
      if (userId) {
        await client.query(
          `INSERT INTO inventory_logs (item_id, action, quantity, stock_before, stock_after, reason, notes, user_id)
           VALUES ($1, $2, $3, $4, $5, 'edicion', 'Stock modificado', $6)`,
          [
            id,
            stockDiff > 0 ? 'entrada' : 'salida',
            Math.abs(stockDiff),
            existingItem.stock_actual,
            updateData.stock_actual,
            userId
          ]
        );
      }
    }

    // Validar duplicados de SKU y barcode ANTES de actualizar
    if (updateData.sku !== undefined && updateData.sku !== existingItem.sku) {
      const skuCheck = await client.query(
        'SELECT id FROM inventory_items WHERE sku = $1 AND id != $2',
        [updateData.sku, id]
      );
      if (skuCheck.rows.length > 0) {
        return res.status(400).json({ 
          error: `El SKU "${updateData.sku}" ya existe en otro item`,
          code: 'DUPLICATE_SKU',
          duplicateField: 'sku'
        });
      }
    }

    if (updateData.barcode !== undefined && updateData.barcode !== existingItem.barcode) {
      // Solo validar si el barcode no está vacío
      if (updateData.barcode && updateData.barcode.trim() !== '') {
        const barcodeCheck = await client.query(
          'SELECT id FROM inventory_items WHERE barcode = $1 AND id != $2',
          [updateData.barcode, id]
        );
        if (barcodeCheck.rows.length > 0) {
          return res.status(400).json({ 
            error: `El código de barras "${updateData.barcode}" ya existe en otro item`,
            code: 'DUPLICATE_BARCODE',
            duplicateField: 'barcode'
          });
        }
      }
    }

    // Construir query de actualización dinámica
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Solo campos que existen en la tabla inventory_items del esquema
    const allowedFields = [
      'subcategory',
      'collection',
      'material',
      'purity',
      'plating',
      'stones',
      'measurements',
      'sale_price',
      'discount',
      'discount_amount',
      'currency',
      'margin_percent',
      'condition',
      'location_detail',
      'style',
      'finish_type',
      'theme',
      'certificate_details',
      'supplier',
      'supplier_code',
      'supplier_id',
      'notes',
      'name', 'description', 'category', 'metal', 'stone_type', 'stone_weight',
      'weight', 'price', 'cost', 'stock_actual', 'stock_min', 'stock_max',
      'status', 'certificate_number', 'photos', 'barcode', 'sku'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);
    const sql = `UPDATE inventory_items SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await client.query(sql, values);

    const updatedItem = result.rows[0];

    // Registrar en audit log
    const userId = req.user?.id || req.user?.userId || null;
    if (userId) {
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'update', 'inventory_item', $2, $3)`,
        [userId, id, JSON.stringify(updateData)]
      );
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logInventoryOperation('update_committed', {
        itemId: id,
        branchId: updatedItem.branch_id || req.user.branchId,
        stockActual: updatedItem.stock_actual
      });

      if (io) {
        emitInventoryUpdate(io, updatedItem.branch_id || req.user.branchId, 'updated', updatedItem);
      }
    } catch (postCommitError) {
      logInventoryOperation('update_post_commit_failed', {
        itemId: id,
        message: postCommitError.message
      });
      console.error('Item actualizado pero fallaron efectos post-commit:', postCommitError);
    }

    res.json(updatedItem);
  } catch (error) {
    // Manejar errores específicos PRIMERO (antes de loguear)
    if (error.code === '23505') { // Unique violation
      if (!transactionCommitted) {
        await safeRollback(client);
      }
      const skuValue = req.body?.sku || existingItem?.sku || 'desconocido';
      const barcodeValue = req.body?.barcode || existingItem?.barcode || 'desconocido';
      
      let errorMessage = 'El SKU o código de barras ya existe';
      if (error.constraint === 'inventory_items_sku_key') {
        errorMessage = `El SKU "${skuValue}" ya existe en otro item. No se puede actualizar.`;
      } else if (error.constraint === 'inventory_items_barcode_key') {
        errorMessage = `El código de barras "${barcodeValue}" ya existe en otro item. No se puede actualizar.`;
      }
      
      // Solo loguear como warning, no como error (ya que lo estamos manejando)
      console.warn(`⚠️ Intento de actualizar con ${error.constraint === 'inventory_items_sku_key' ? 'SKU' : 'barcode'} duplicado:`, {
        itemId: id,
        value: error.constraint === 'inventory_items_sku_key' ? skuValue : barcodeValue,
        constraint: error.constraint
      });
      
      return res.status(400).json({ 
        error: errorMessage,
        code: 'DUPLICATE_KEY',
        duplicateField: error.constraint === 'inventory_items_sku_key' ? 'sku' : 'barcode',
        constraint: error.constraint
      });
    }

    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logInventoryOperation('update_failed', {
      itemId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    
    // Para otros errores, loguear como error
    console.error('Error actualizando item:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'Error al actualizar item',
      details: error.message,
      code: error.code
    });
  } finally {
    client.release();
  }
});

// Eliminar item
router.delete('/:id', requireBranchAccess, async (req, res) => {
  const client = await getClient();
  let transactionCommitted = false;
  
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    logInventoryOperation('delete_started', {
      itemId: id,
      userId: req.user.id
    });

    // Verificar que existe y tiene acceso
    const existingResult = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await safeRollback(client);
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    const item = existingResult.rows[0];

    // Verificar acceso
    if (!req.user.isMasterAdmin && item.branch_id && item.branch_id !== req.user.branchId) {
      await safeRollback(client);
      return res.status(403).json({ error: 'No tienes acceso a este item' });
    }

    // Verificar si hay referencias en sale_items
    const saleItemsCheck = await client.query(
      'SELECT COUNT(*) as count FROM sale_items WHERE item_id = $1',
      [id]
    );

    if (parseInt(saleItemsCheck.rows[0].count) > 0) {
      // Si tiene ventas asociadas, no eliminar físicamente, solo marcar como eliminado
      await client.query(
        `UPDATE inventory_items 
         SET status = 'eliminado', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );
    } else {
      // Si no tiene referencias, eliminar físicamente
      // Primero eliminar logs de inventario relacionados
      await client.query('DELETE FROM inventory_logs WHERE item_id = $1', [id]);
      
      // Luego eliminar el item
      await client.query('DELETE FROM inventory_items WHERE id = $1', [id]);
    }

    // Registrar en audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'inventory_item', $2, $3)`,
      [req.user.id, id, JSON.stringify({ sku: item.sku, name: item.name })]
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    try {
      logInventoryOperation('delete_committed', {
        itemId: id,
        branchId: item.branch_id || req.user.branchId,
        sku: item.sku
      });

      if (io) {
        emitInventoryUpdate(io, item.branch_id || req.user.branchId, 'deleted', { id });
      }
    } catch (postCommitError) {
      logInventoryOperation('delete_post_commit_failed', {
        itemId: id,
        message: postCommitError.message
      });
      console.error('Item eliminado pero fallaron efectos post-commit:', postCommitError);
    }

    res.json({ message: 'Item eliminado correctamente' });
  } catch (error) {
    if (!transactionCommitted) {
      await safeRollback(client);
    }
    logInventoryOperation('delete_failed', {
      itemId: req.params?.id,
      userId: req.user.id,
      code: error?.code,
      message: error?.message
    });
    console.error('Error eliminando item:', error);
    
    // Mensaje de error más específico
    let errorMessage = 'Error al eliminar item';
    if (error.code === '23503') { // Foreign key violation
      errorMessage = 'No se puede eliminar el item porque tiene ventas asociadas';
    } else if (error.code === '23505') { // Unique violation
      errorMessage = 'Error de integridad de datos';
    }
    
    res.status(500).json({ error: errorMessage });
  } finally {
    client.release();
  }
});

export default router;
