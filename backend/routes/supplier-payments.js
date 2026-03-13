import express from 'express';
import { query } from '../config/database.js';
import { requireBranchAccess } from '../middleware/authOptional.js';
import { emitSupplierUpdate } from '../socket/socketHandler.js';

// Importar io desde el módulo principal
let io;
export const setIO = (socketIO) => {
  io = socketIO;
};

const router = express.Router();

// Listar pagos de proveedores
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, status, supplier_id, payment_type, start_date, end_date, overdue_only } = req.query;
    
    // Manejar branch_id cuando viene como string "null"
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT sp.*, 
             s.name as supplier_name,
             s.code as supplier_code,
             b.name as branch_name,
             po.order_number as purchase_order_number,
             (sp.total_amount - sp.paid_amount) as pending_amount
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON sp.supplier_id = s.id
      LEFT JOIN branches b ON sp.branch_id = b.id
      LEFT JOIN purchase_orders po ON sp.purchase_order_id = po.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND sp.branch_id = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND sp.branch_id = $${paramCount}`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtros adicionales
    if (status) {
      sql += ` AND sp.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (supplier_id) {
      sql += ` AND sp.supplier_id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }

    if (payment_type) {
      sql += ` AND sp.payment_type = $${paramCount}`;
      params.push(payment_type);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND sp.issue_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND sp.issue_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (overdue_only === 'true') {
      sql += ` AND sp.due_date < CURRENT_DATE AND sp.status != 'paid' AND sp.status != 'cancelled'`;
    }

    sql += ` ORDER BY sp.due_date ASC, sp.created_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// Obtener pago por ID
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener pago
    const paymentResult = await query(
      `SELECT sp.*, 
              s.name as supplier_name,
              s.code as supplier_code,
              b.name as branch_name,
              po.order_number as purchase_order_number
       FROM supplier_payments sp
       LEFT JOIN suppliers s ON sp.supplier_id = s.id
       LEFT JOIN branches b ON sp.branch_id = b.id
       LEFT JOIN purchase_orders po ON sp.purchase_order_id = po.id
       WHERE sp.id = $1`,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const payment = paymentResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (payment.branch_id !== req.user.branchId) {
        return res.status(403).json({ error: 'No tienes acceso a este pago' });
      }
    }

    // Obtener historial de pagos
    const invoicesResult = await query(
      `SELECT * FROM payment_invoices 
       WHERE supplier_payment_id = $1 
       ORDER BY payment_date DESC, created_at DESC`,
      [id]
    );

    payment.payment_history = invoicesResult.rows;
    payment.pending_amount = parseFloat(payment.total_amount) - parseFloat(payment.paid_amount || 0);

    res.json(payment);
  } catch (error) {
    console.error('Error obteniendo pago:', error);
    res.status(500).json({ error: 'Error al obtener pago' });
  }
});

// Crear pago/factura
router.post('/', requireBranchAccess, async (req, res) => {
  try {
    const {
      supplier_id, purchase_order_id,
      payment_type, reference_number,
      amount, tax_amount, discount_amount, total_amount, currency,
      issue_date, due_date,
      status, notes, document_urls,
      branch_id
    } = req.body;

    if (!supplier_id || !payment_type || !reference_number || !total_amount || !issue_date || !due_date) {
      return res.status(400).json({ error: 'Campos requeridos: supplier_id, payment_type, reference_number, total_amount, issue_date, due_date' });
    }

    // Verificar que el proveedor existe
    const supplierResult = await query(
      'SELECT id, branch_id, is_shared FROM suppliers WHERE id = $1',
      [supplier_id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    // Verificar permisos del proveedor
    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Verificar que el número de referencia no exista
    const existingPayment = await query(
      'SELECT id FROM supplier_payments WHERE reference_number = $1',
      [reference_number]
    );
    if (existingPayment.rows.length > 0) {
      return res.status(400).json({ error: 'El número de referencia ya existe' });
    }

    // Verificar orden de compra si se especifica
    if (purchase_order_id) {
      const poResult = await query(
        'SELECT id FROM purchase_orders WHERE id = $1',
        [purchase_order_id]
      );
      if (poResult.rows.length === 0) {
        return res.status(404).json({ error: 'Orden de compra no encontrada' });
      }
    }

    const finalBranchId = branch_id || req.user.branchId;
    const finalAmount = amount || total_amount;
    const finalTaxAmount = tax_amount || 0;
    const finalDiscountAmount = discount_amount || 0;
    const finalTotalAmount = total_amount || (finalAmount + finalTaxAmount - finalDiscountAmount);

    const result = await query(
      `INSERT INTO supplier_payments (
        supplier_id, purchase_order_id,
        payment_type, reference_number,
        amount, tax_amount, discount_amount, total_amount, currency,
        issue_date, due_date,
        status, notes, document_urls,
        branch_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        supplier_id, purchase_order_id || null,
        payment_type, reference_number,
        finalAmount, finalTaxAmount, finalDiscountAmount, finalTotalAmount, currency || 'MXN',
        issue_date, due_date,
        status || 'pending', notes || null, document_urls || [],
        finalBranchId, req.user.id || null
      ]
    );

    const payment = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      emitSupplierUpdate(io, 'updated', supplier, req.user);
    }

    res.status(201).json(payment);
  } catch (error) {
    console.error('Error creando pago:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de referencia ya existe' });
    }
    res.status(500).json({ error: 'Error al crear pago' });
  }
});

// Actualizar pago
router.put('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      payment_type, reference_number,
      amount, tax_amount, discount_amount, total_amount, currency,
      issue_date, due_date, payment_date,
      status, payment_method, payment_reference,
      bank_reconciliation_date, bank_reconciliation_reference, is_reconciled,
      notes, document_urls
    } = req.body;

    // Verificar que el pago existe
    const existingResult = await query(
      'SELECT * FROM supplier_payments WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId) {
        return res.status(403).json({ error: 'No tienes permisos para editar este pago' });
      }
    }

    // Verificar que el número de referencia no esté en uso por otro pago
    if (reference_number && reference_number !== existing.reference_number) {
      const codeCheck = await query(
        'SELECT id FROM supplier_payments WHERE reference_number = $1 AND id != $2',
        [reference_number, id]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ error: 'El número de referencia ya está en uso' });
      }
    }

    // Calcular montos
    const finalAmount = amount || existing.amount;
    const finalTaxAmount = tax_amount !== undefined ? tax_amount : existing.tax_amount;
    const finalDiscountAmount = discount_amount !== undefined ? discount_amount : existing.discount_amount;
    const finalTotalAmount = total_amount || (finalAmount + finalTaxAmount - finalDiscountAmount);

    // Actualizar estado si se marca como pagado
    let finalStatus = status || existing.status;
    if (payment_date && !existing.payment_date) {
      if (finalStatus === 'pending' || finalStatus === 'partial') {
        finalStatus = 'paid';
      }
    }

    const result = await query(
      `UPDATE supplier_payments SET
        payment_type = COALESCE($1, payment_type),
        reference_number = COALESCE($2, reference_number),
        amount = COALESCE($3, amount),
        tax_amount = COALESCE($4, tax_amount),
        discount_amount = COALESCE($5, discount_amount),
        total_amount = COALESCE($6, total_amount),
        currency = COALESCE($7, currency),
        issue_date = COALESCE($8, issue_date),
        due_date = COALESCE($9, due_date),
        payment_date = COALESCE($10, payment_date),
        status = COALESCE($11, status),
        payment_method = COALESCE($12, payment_method),
        payment_reference = COALESCE($13, payment_reference),
        bank_reconciliation_date = COALESCE($14, bank_reconciliation_date),
        bank_reconciliation_reference = COALESCE($15, bank_reconciliation_reference),
        is_reconciled = COALESCE($16, is_reconciled),
        notes = COALESCE($17, notes),
        document_urls = COALESCE($18, document_urls),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *`,
      [
        payment_type, reference_number,
        finalAmount, finalTaxAmount, finalDiscountAmount, finalTotalAmount, currency,
        issue_date, due_date, payment_date,
        finalStatus, payment_method, payment_reference,
        bank_reconciliation_date, bank_reconciliation_reference, is_reconciled,
        notes, document_urls, id
      ]
    );

    const payment = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const supplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [payment.supplier_id]
      );
      if (supplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', supplier.rows[0], req.user);
      }
    }

    res.json(payment);
  } catch (error) {
    console.error('Error actualizando pago:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de referencia ya existe' });
    }
    res.status(500).json({ error: 'Error al actualizar pago' });
  }
});

// Registrar pago parcial/total
router.post('/:id/pay', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      payment_amount, payment_date, payment_method, payment_reference, notes, receipt_number
    } = req.body;

    if (!payment_amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: 'payment_amount, payment_date y payment_method son requeridos' });
    }

    // Obtener pago
    const paymentResult = await query(
      'SELECT * FROM supplier_payments WHERE id = $1',
      [id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const payment = paymentResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (payment.branch_id !== req.user.branchId) {
        return res.status(403).json({ error: 'No tienes acceso a este pago' });
      }
    }

    const paymentAmount = parseFloat(payment_amount);
    const currentPaidAmount = parseFloat(payment.paid_amount || 0);
    const totalAmount = parseFloat(payment.total_amount);
    const newPaidAmount = currentPaidAmount + paymentAmount;

    // Validar que no se pague más de lo debido
    if (newPaidAmount > totalAmount) {
      return res.status(400).json({ error: 'El monto del pago excede el total adeudado' });
    }

    // Determinar nuevo estado
    let newStatus = payment.status;
    if (newPaidAmount >= totalAmount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    // Verificar que el receipt_number no exista si se proporciona
    if (receipt_number) {
      const existingReceipt = await query(
        'SELECT id FROM payment_invoices WHERE receipt_number = $1',
        [receipt_number]
      );
      if (existingReceipt.rows.length > 0) {
        return res.status(400).json({ error: 'El número de folio del recibo ya existe' });
      }
    }

    // Registrar pago en historial
    const branchId = payment.branch_id || req.user.branchId;
    await query(
      `INSERT INTO payment_invoices (
        supplier_payment_id, payment_date, payment_amount, payment_method, payment_reference, receipt_number, notes, branch_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, payment_date, paymentAmount, payment_method, payment_reference || null, receipt_number || null, notes || null, branchId, req.user.id || null]
    );

    // Actualizar pago (incluyendo receipt_number si se proporciona)
    const result = await query(
      `UPDATE supplier_payments SET
        paid_amount = $1,
        status = $2,
        payment_date = CASE WHEN $2 = 'paid' THEN COALESCE($3, payment_date) ELSE payment_date END,
        receipt_number = CASE WHEN $5 IS NOT NULL THEN $5 ELSE receipt_number END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *`,
      [newPaidAmount, newStatus, payment_date, id, receipt_number || null]
    );

    const updatedPayment = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const supplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [payment.supplier_id]
      );
      if (supplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', supplier.rows[0], req.user);
      }
    }

    res.json(updatedPayment);
  } catch (error) {
    console.error('Error registrando pago:', error);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

// Eliminar pago
router.delete('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el pago existe
    const existingResult = await query(
      'SELECT * FROM supplier_payments WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar este pago' });
      }
    }

    // Solo permitir eliminar si está en pending o cancelled
    if (existing.status !== 'pending' && existing.status !== 'cancelled') {
      return res.status(400).json({ error: 'Solo se pueden eliminar pagos en estado pending o cancelled' });
    }

    await query('DELETE FROM supplier_payments WHERE id = $1', [id]);

    res.json({ message: 'Pago eliminado' });
  } catch (error) {
    console.error('Error eliminando pago:', error);
    res.status(500).json({ error: 'Error al eliminar pago' });
  }
});

// Obtener recibos de pago (payment_invoices) con filtrado por sucursal
router.get('/receipts/list', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, supplier_id, payment_id, start_date, end_date } = req.query;
    
    // Manejar branch_id cuando viene como string "null"
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT pi.*, 
             sp.reference_number as payment_reference_number,
             sp.supplier_id,
             sp.branch_id as payment_branch_id,
             s.name as supplier_name,
             s.code as supplier_code,
             b.name as branch_name
      FROM payment_invoices pi
      LEFT JOIN supplier_payments sp ON pi.supplier_payment_id = sp.id
      LEFT JOIN suppliers s ON sp.supplier_id = s.id
      LEFT JOIN branches b ON COALESCE(pi.branch_id, sp.branch_id) = b.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal (usar pi.branch_id si existe, sino sp.branch_id)
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND COALESCE(pi.branch_id, sp.branch_id) = $${paramCount}`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND COALESCE(pi.branch_id, sp.branch_id) = $${paramCount}`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtros adicionales
    if (supplier_id) {
      sql += ` AND sp.supplier_id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }

    if (payment_id) {
      sql += ` AND pi.supplier_payment_id = $${paramCount}`;
      params.push(payment_id);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND pi.payment_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND pi.payment_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ` ORDER BY pi.payment_date DESC, pi.created_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo recibos:', error);
    res.status(500).json({ error: 'Error al obtener recibos' });
  }
});

export default router;
