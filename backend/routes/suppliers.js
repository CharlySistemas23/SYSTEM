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

// Función helper para verificar/crear tabla suppliers si no existe
async function ensureSuppliersTable() {
  try {
    // Verificar si la tabla existe
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'suppliers'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  Tabla suppliers no existe. Creándola desde schema.sql...');
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
      
      try {
        const schemaSQL = readFileSync(schemaPath, 'utf8');
        
        // Dividir el schema en statements individuales para ejecutarlos uno por uno
        // Esto evita errores si algunos objetos ya existen
        const statements = schemaSQL
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));
        
        let executed = 0;
        let errors = 0;
        
        for (const statement of statements) {
          try {
            // Solo ejecutar statements relacionados con suppliers o que sean seguros (IF NOT EXISTS)
            if (statement.includes('suppliers') || 
                statement.includes('IF NOT EXISTS') || 
                statement.includes('CREATE INDEX IF NOT EXISTS') ||
                statement.includes('CREATE OR REPLACE')) {
              await query(statement + ';');
              executed++;
            }
          } catch (stmtError) {
            // Ignorar errores de "already exists" pero loguear otros
            if (!stmtError.message.includes('already exists') && 
                !stmtError.message.includes('duplicate') &&
                !stmtError.message.includes('relation') && 
                !stmtError.message.includes('already exists')) {
              console.warn(`⚠️  Error en statement (continuando): ${stmtError.message.substring(0, 100)}`);
              errors++;
            }
          }
        }
        
        // Verificar nuevamente si la tabla se creó
        const verifyCheck = await query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'suppliers'
          );
        `);
        
        if (verifyCheck.rows[0].exists) {
          console.log(`✅ Tabla suppliers creada exitosamente (${executed} statements ejecutados)`);
        } else {
          // Si aún no existe, intentar ejecutar el schema completo
          console.log('⚠️  Tabla suppliers aún no existe después de ejecución selectiva. Ejecutando schema completo...');
          await query(schemaSQL);
          console.log('✅ Schema completo ejecutado');
        }
      } catch (error) {
        console.error('❌ Error creando tabla suppliers:', error.message);
        console.error('   Stack:', error.stack);
        // No lanzar error, solo loguear - el servidor puede continuar
      }
    } else {
      // Tabla existe, verificar que tenga las columnas necesarias
      try {
        const columnsCheck = await query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'suppliers'
          AND column_name IN ('code', 'name', 'barcode');
        `);
        
        if (columnsCheck.rows.length < 3) {
          console.warn('⚠️  Tabla suppliers existe pero le faltan columnas. Ejecutando schema.sql...');
          const { readFileSync } = await import('fs');
          const { join, dirname } = await import('path');
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
          const schemaSQL = readFileSync(schemaPath, 'utf8');
          await query(schemaSQL);
          console.log('✅ Schema ejecutado para actualizar columnas');
        }
      } catch (colError) {
        console.warn('⚠️  Error verificando columnas (no crítico):', colError.message);
      }
    }
  } catch (error) {
    console.error('⚠️  Error verificando tabla suppliers:', error.message);
    // No lanzar error, solo loguear
  }
}

// Listar proveedores
router.get('/', requireBranchAccess, async (req, res) => {
  try {
    // Asegurar que la tabla existe antes de usarla
    await ensureSuppliersTable();
    
    const { branch_id, status, search, supplier_type, category } = req.query;
    
    // Manejar branch_id cuando viene como string "null" desde el frontend
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT s.*, 
             b.name as branch_name,
             COUNT(DISTINCT sc.id) as contacts_count
      FROM suppliers s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN supplier_contacts sc ON s.id = sc.supplier_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtros adicionales
    if (status) {
      sql += ` AND s.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (supplier_type) {
      sql += ` AND s.supplier_type = $${paramCount}`;
      params.push(supplier_type);
      paramCount++;
    }

    if (category) {
      sql += ` AND s.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (search) {
      sql += ` AND (s.name ILIKE $${paramCount} OR s.code ILIKE $${paramCount} OR s.legal_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ` GROUP BY s.id, b.name ORDER BY s.name ASC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo proveedores:', error);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// Obtener proveedor por ID
router.get('/:id', requireBranchAccess, async (req, res) => {
  try {
    // Asegurar que la tabla existe antes de usarla
    await ensureSuppliersTable();
    
    const { id } = req.params;

    // Obtener proveedor
    const supplierResult = await query(
      `SELECT s.*, b.name as branch_name
       FROM suppliers s
       LEFT JOIN branches b ON s.branch_id = b.id
       WHERE s.id = $1`,
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Obtener contactos
    const contactsResult = await query(
      `SELECT * FROM supplier_contacts WHERE supplier_id = $1 ORDER BY is_primary DESC, name ASC`,
      [id]
    );

    supplier.contacts = contactsResult.rows;

    res.json(supplier);
  } catch (error) {
    console.error('Error obteniendo proveedor:', error);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

// Crear proveedor
router.post('/', requireBranchAccess, async (req, res) => {
  try {
    // Asegurar que la tabla existe antes de usarla
    await ensureSuppliersTable();
    
    const {
      code, name, legal_name, tax_id, barcode,
      contact_person, email, phone, mobile, website,
      address, city, state, country, postal_code,
      supplier_type, category, payment_terms, credit_limit, currency,
      status, notes, tags, branch_id, is_shared
    } = req.body;

    // Validaciones
    if (!code || !name) {
      return res.status(400).json({ error: 'Código y nombre son requeridos' });
    }

    // Verificar que el código no exista
    const existingCode = await query(
      'SELECT id FROM suppliers WHERE code = $1',
      [code]
    );
    if (existingCode.rows.length > 0) {
      return res.status(400).json({ error: 'El código de proveedor ya existe' });
    }

    // Determinar branch_id
    const finalBranchId = branch_id || req.user.branchId;
    const finalIsShared = is_shared !== undefined ? is_shared : true;

    const result = await query(
      `INSERT INTO suppliers (
        code, name, legal_name, tax_id, barcode,
        contact_person, email, phone, mobile, website,
        address, city, state, country, postal_code,
        supplier_type, category, payment_terms, credit_limit, currency,
        status, notes, tags, branch_id, is_shared, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        code, name, legal_name || null, tax_id || null, barcode || null,
        contact_person || null, email || null, phone || null, mobile || null, website || null,
        address || null, city || null, state || null, country || 'México', postal_code || null,
        supplier_type || null, category || null, payment_terms || null, credit_limit || null, currency || 'MXN',
        status || 'active', notes || null, tags || null, finalBranchId, finalIsShared, req.user.id || null
      ]
    );

    const supplier = result.rows[0];

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'supplier', $2, $3)`,
      [req.user.id, supplier.id, JSON.stringify({ code, name })]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitSupplierUpdate(io, 'created', supplier, req.user);
    }

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creando proveedor:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// Actualizar proveedor
router.put('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code, name, legal_name, tax_id, barcode,
      contact_person, email, phone, mobile, website,
      address, city, state, country, postal_code,
      supplier_type, category, payment_terms, credit_limit, currency,
      status, notes, tags, is_shared
    } = req.body;

    // Verificar que el proveedor existe y tiene permisos
    const existingResult = await query(
      'SELECT * FROM suppliers WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId && !existing.is_shared) {
        return res.status(403).json({ error: 'No tienes permisos para editar este proveedor' });
      }
    }

    // Verificar que el código no esté en uso por otro proveedor
    if (code && code !== existing.code) {
      const codeCheck = await query(
        'SELECT id FROM suppliers WHERE code = $1 AND id != $2',
        [code, id]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ error: 'El código ya está en uso por otro proveedor' });
      }
    }

    const result = await query(
      `UPDATE suppliers SET
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        legal_name = COALESCE($3, legal_name),
        tax_id = COALESCE($4, tax_id),
        barcode = COALESCE($5, barcode),
        contact_person = COALESCE($6, contact_person),
        email = COALESCE($7, email),
        phone = COALESCE($8, phone),
        mobile = COALESCE($9, mobile),
        website = COALESCE($10, website),
        address = COALESCE($11, address),
        city = COALESCE($12, city),
        state = COALESCE($13, state),
        country = COALESCE($14, country),
        postal_code = COALESCE($15, postal_code),
        supplier_type = COALESCE($16, supplier_type),
        category = COALESCE($17, category),
        payment_terms = COALESCE($18, payment_terms),
        credit_limit = COALESCE($19, credit_limit),
        currency = COALESCE($20, currency),
        status = COALESCE($21, status),
        notes = COALESCE($22, notes),
        tags = COALESCE($23, tags),
        is_shared = COALESCE($24, is_shared),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $25
      RETURNING *`,
      [
        code, name, legal_name, tax_id, barcode,
        contact_person, email, phone, mobile, website,
        address, city, state, country, postal_code,
        supplier_type, category, payment_terms, credit_limit, currency,
        status, notes, tags, is_shared, id
      ]
    );

    const supplier = result.rows[0];

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'supplier', $2, $3)`,
      [req.user.id, supplier.id, JSON.stringify({ code, name })]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitSupplierUpdate(io, 'updated', supplier, req.user);
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error actualizando proveedor:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// Eliminar proveedor (soft delete)
router.delete('/:id', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el proveedor existe
    const existingResult = await query(
      'SELECT * FROM suppliers WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const existing = existingResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (existing.branch_id !== req.user.branchId && !existing.is_shared) {
        return res.status(403).json({ error: 'No tienes permisos para eliminar este proveedor' });
      }
    }

    // Soft delete: cambiar status a 'inactive'
    const result = await query(
      `UPDATE suppliers SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const supplier = result.rows[0];

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'supplier', $2, $3)`,
      [req.user.id, supplier.id, JSON.stringify({ code: supplier.code, name: supplier.name })]
    );

    // Emitir actualización en tiempo real
    if (io) {
      emitSupplierUpdate(io, 'deleted', supplier, req.user);
    }

    res.json({ message: 'Proveedor eliminado', supplier });
  } catch (error) {
    console.error('Error eliminando proveedor:', error);
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// Obtener items de inventario del proveedor
router.get('/:id/items', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    const result = await query(
      `SELECT * FROM inventory_items
       WHERE supplier_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo items del proveedor:', error);
    res.status(500).json({ error: 'Error al obtener items' });
  }
});

// Obtener costos asociados al proveedor
router.get('/:id/costs', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, limit = 100 } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    let sql = `SELECT * FROM cost_entries WHERE supplier_id = $1`;
    const params = [id];
    let paramCount = 2;

    if (start_date) {
      sql += ` AND date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ` ORDER BY date DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo costos del proveedor:', error);
    res.status(500).json({ error: 'Error al obtener costos' });
  }
});

// Obtener estadísticas del proveedor
router.get('/:id/stats', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Obtener estadísticas
    const itemsResult = await query(
      `SELECT COUNT(*) as total_items, 
              SUM(stock_actual * cost) as total_inventory_value
       FROM inventory_items
       WHERE supplier_id = $1`,
      [id]
    );

    const costsResult = await query(
      `SELECT COUNT(*) as total_costs,
              SUM(amount) as total_cost_amount
       FROM cost_entries
       WHERE supplier_id = $1`,
      [id]
    );

    const stats = {
      total_items: parseInt(itemsResult.rows[0].total_items) || 0,
      total_inventory_value: parseFloat(itemsResult.rows[0].total_inventory_value) || 0,
      total_costs: parseInt(costsResult.rows[0].total_costs) || 0,
      total_cost_amount: parseFloat(costsResult.rows[0].total_cost_amount) || 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Calificar proveedor
router.post('/:id/rate', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 0 || rating > 5) {
      return res.status(400).json({ error: 'La calificación debe estar entre 0 y 5' });
    }

    // Actualizar rating del proveedor (promedio simple por ahora)
    const result = await query(
      `UPDATE suppliers 
       SET rating = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [rating, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      emitSupplierUpdate(io, 'updated', supplier, req.user);
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error calificando proveedor:', error);
    res.status(500).json({ error: 'Error al calificar proveedor' });
  }
});

// Calificar proveedor (avanzado)
router.post('/:id/rate-advanced', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rating, quality_rating, delivery_rating, price_rating,
      communication_rating, service_rating, comment, purchase_order_id
    } = req.body;

    if (!rating || rating < 0 || rating > 5) {
      return res.status(400).json({ error: 'Rating debe estar entre 0 y 5' });
    }

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    const result = await query(
      `INSERT INTO supplier_ratings (
        supplier_id, purchase_order_id, rating,
        quality_rating, delivery_rating, price_rating,
        communication_rating, service_rating, comment, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id, purchase_order_id || null, rating,
        quality_rating || null, delivery_rating || null, price_rating || null,
        communication_rating || null, service_rating || null,
        comment || null, req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error calificando proveedor (avanzado):', error);
    res.status(500).json({ error: 'Error al calificar proveedor' });
  }
});

// ========== GESTIÓN DE CONTACTOS ==========

// Listar contactos de un proveedor
router.get('/:id/contacts', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    const result = await query(
      `SELECT * FROM supplier_contacts 
       WHERE supplier_id = $1 
       ORDER BY is_primary DESC, name ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

// Crear contacto
router.post('/:id/contacts', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, position, department, email, phone, mobile,
      is_primary, contact_hours, communication_preference, notes
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre del contacto es requerido' });
    }

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Si se marca como primario, desmarcar otros
    if (is_primary) {
      await query(
        'UPDATE supplier_contacts SET is_primary = false WHERE supplier_id = $1',
        [id]
      );
    }

    const result = await query(
      `INSERT INTO supplier_contacts (
        supplier_id, name, position, department, email, phone, mobile,
        is_primary, contact_hours, communication_preference, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id, name, position || null, department || null, email || null,
        phone || null, mobile || null, is_primary || false,
        contact_hours || null, communication_preference || null, notes || null
      ]
    );

    const contact = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creando contacto:', error);
    res.status(500).json({ error: 'Error al crear contacto' });
  }
});

// Actualizar contacto
router.put('/contacts/:contactId', requireBranchAccess, async (req, res) => {
  try {
    const { contactId } = req.params;
    const {
      name, position, department, email, phone, mobile,
      is_primary, contact_hours, communication_preference, notes
    } = req.body;

    // Obtener contacto y verificar permisos
    const contactResult = await query(
      `SELECT sc.*, s.branch_id, s.is_shared
       FROM supplier_contacts sc
       JOIN suppliers s ON sc.supplier_id = s.id
       WHERE sc.id = $1`,
      [contactId]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const contact = contactResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (contact.branch_id !== req.user.branchId && !contact.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este contacto' });
      }
    }

    // Si se marca como primario, desmarcar otros
    if (is_primary) {
      await query(
        'UPDATE supplier_contacts SET is_primary = false WHERE supplier_id = $1 AND id != $2',
        [contact.supplier_id, contactId]
      );
    }

    const result = await query(
      `UPDATE supplier_contacts SET
        name = COALESCE($1, name),
        position = COALESCE($2, position),
        department = COALESCE($3, department),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        mobile = COALESCE($6, mobile),
        is_primary = COALESCE($7, is_primary),
        contact_hours = COALESCE($8, contact_hours),
        communication_preference = COALESCE($9, communication_preference),
        notes = COALESCE($10, notes)
      WHERE id = $11
      RETURNING *`,
      [
        name, position, department, email, phone, mobile,
        is_primary, contact_hours, communication_preference, notes, contactId
      ]
    );

    const updatedContact = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [contact.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json(updatedContact);
  } catch (error) {
    console.error('Error actualizando contacto:', error);
    res.status(500).json({ error: 'Error al actualizar contacto' });
  }
});

// Eliminar contacto
router.delete('/contacts/:contactId', requireBranchAccess, async (req, res) => {
  try {
    const { contactId } = req.params;

    // Obtener contacto y verificar permisos
    const contactResult = await query(
      `SELECT sc.*, s.branch_id, s.is_shared
       FROM supplier_contacts sc
       JOIN suppliers s ON sc.supplier_id = s.id
       WHERE sc.id = $1`,
      [contactId]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    const contact = contactResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (contact.branch_id !== req.user.branchId && !contact.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este contacto' });
      }
    }

    await query('DELETE FROM supplier_contacts WHERE id = $1', [contactId]);

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [contact.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json({ message: 'Contacto eliminado' });
  } catch (error) {
    console.error('Error eliminando contacto:', error);
    res.status(500).json({ error: 'Error al eliminar contacto' });
  }
});

// ========== GESTIÓN DE CONTRATOS ==========

// Listar contratos de un proveedor
router.get('/:id/contracts', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    let sql = `SELECT * FROM supplier_contracts WHERE supplier_id = $1`;
    const params = [id];
    let paramCount = 2;

    if (status) {
      sql += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    sql += ` ORDER BY start_date DESC, created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo contratos:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

// Crear contrato
router.post('/:id/contracts', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contract_number, contract_type, title, description,
      start_date, end_date, renewal_date, auto_renew,
      terms_and_conditions, payment_terms, delivery_terms,
      minimum_order_amount, discount_percentage,
      status, is_exclusive, document_urls, branch_id
    } = req.body;

    if (!contract_number || !contract_type || !title || !start_date) {
      return res.status(400).json({ error: 'Campos requeridos: contract_number, contract_type, title, start_date' });
    }

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Verificar que el número de contrato no exista
    const existingContract = await query(
      'SELECT id FROM supplier_contracts WHERE contract_number = $1',
      [contract_number]
    );
    if (existingContract.rows.length > 0) {
      return res.status(400).json({ error: 'El número de contrato ya existe' });
    }

    const finalBranchId = branch_id || req.user.branchId;

    const result = await query(
      `INSERT INTO supplier_contracts (
        supplier_id, contract_number, contract_type, title, description,
        start_date, end_date, renewal_date, auto_renew,
        terms_and_conditions, payment_terms, delivery_terms,
        minimum_order_amount, discount_percentage,
        status, is_exclusive, document_urls, branch_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        id, contract_number, contract_type, title, description || null,
        start_date, end_date || null, renewal_date || null, auto_renew || false,
        terms_and_conditions || null, payment_terms || null, delivery_terms || null,
        minimum_order_amount || null, discount_percentage || null,
        status || 'active', is_exclusive || false, document_urls || [], finalBranchId, req.user.id || null
      ]
    );

    const contract = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.status(201).json(contract);
  } catch (error) {
    console.error('Error creando contrato:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de contrato ya existe' });
    }
    res.status(500).json({ error: 'Error al crear contrato' });
  }
});

// Actualizar contrato
router.put('/contracts/:contractId', requireBranchAccess, async (req, res) => {
  try {
    const { contractId } = req.params;
    const {
      contract_number, contract_type, title, description,
      start_date, end_date, renewal_date, auto_renew,
      terms_and_conditions, payment_terms, delivery_terms,
      minimum_order_amount, discount_percentage,
      status, is_exclusive, document_urls
    } = req.body;

    // Obtener contrato y verificar permisos
    const contractResult = await query(
      `SELECT sc.*, s.branch_id, s.is_shared
       FROM supplier_contracts sc
       JOIN suppliers s ON sc.supplier_id = s.id
       WHERE sc.id = $1`,
      [contractId]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const contract = contractResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (contract.branch_id !== req.user.branchId && !contract.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este contrato' });
      }
    }

    // Verificar que el número de contrato no esté en uso por otro contrato
    if (contract_number && contract_number !== contract.contract_number) {
      const codeCheck = await query(
        'SELECT id FROM supplier_contracts WHERE contract_number = $1 AND id != $2',
        [contract_number, contractId]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({ error: 'El número de contrato ya está en uso' });
      }
    }

    const result = await query(
      `UPDATE supplier_contracts SET
        contract_number = COALESCE($1, contract_number),
        contract_type = COALESCE($2, contract_type),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        start_date = COALESCE($5, start_date),
        end_date = COALESCE($6, end_date),
        renewal_date = COALESCE($7, renewal_date),
        auto_renew = COALESCE($8, auto_renew),
        terms_and_conditions = COALESCE($9, terms_and_conditions),
        payment_terms = COALESCE($10, payment_terms),
        delivery_terms = COALESCE($11, delivery_terms),
        minimum_order_amount = COALESCE($12, minimum_order_amount),
        discount_percentage = COALESCE($13, discount_percentage),
        status = COALESCE($14, status),
        is_exclusive = COALESCE($15, is_exclusive),
        document_urls = COALESCE($16, document_urls),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *`,
      [
        contract_number, contract_type, title, description,
        start_date, end_date, renewal_date, auto_renew,
        terms_and_conditions, payment_terms, delivery_terms,
        minimum_order_amount, discount_percentage,
        status, is_exclusive, document_urls, contractId
      ]
    );

    const updatedContract = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [contract.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json(updatedContract);
  } catch (error) {
    console.error('Error actualizando contrato:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número de contrato ya existe' });
    }
    res.status(500).json({ error: 'Error al actualizar contrato' });
  }
});

// Eliminar contrato
router.delete('/contracts/:contractId', requireBranchAccess, async (req, res) => {
  try {
    const { contractId } = req.params;

    // Obtener contrato y verificar permisos
    const contractResult = await query(
      `SELECT sc.*, s.branch_id, s.is_shared
       FROM supplier_contracts sc
       JOIN suppliers s ON sc.supplier_id = s.id
       WHERE sc.id = $1`,
      [contractId]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const contract = contractResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (contract.branch_id !== req.user.branchId && !contract.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este contrato' });
      }
    }

    await query('DELETE FROM supplier_contracts WHERE id = $1', [contractId]);

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [contract.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json({ message: 'Contrato eliminado' });
  } catch (error) {
    console.error('Error eliminando contrato:', error);
    res.status(500).json({ error: 'Error al eliminar contrato' });
  }
});

// ========== GESTIÓN DE DOCUMENTOS ==========

// Listar documentos de un proveedor
router.get('/:id/documents', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { document_type, contract_id, status } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    let sql = `SELECT * FROM supplier_documents WHERE supplier_id = $1`;
    const params = [id];
    let paramCount = 2;

    if (document_type) {
      sql += ` AND document_type = $${paramCount}`;
      params.push(document_type);
      paramCount++;
    }

    if (contract_id) {
      sql += ` AND contract_id = $${paramCount}`;
      params.push(contract_id);
      paramCount++;
    }

    if (status) {
      sql += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
});

// Crear documento
router.post('/:id/documents', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contract_id, document_type, title, description,
      file_name, file_url, file_type, file_size, mime_type,
      issue_date, expiration_date, document_number,
      status, branch_id
    } = req.body;

    if (!document_type || !title || !file_name || !file_url) {
      return res.status(400).json({ error: 'Campos requeridos: document_type, title, file_name, file_url' });
    }

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Verificar contrato si se especifica
    if (contract_id) {
      const contractResult = await query(
        'SELECT id FROM supplier_contracts WHERE id = $1 AND supplier_id = $2',
        [contract_id, id]
      );
      if (contractResult.rows.length === 0) {
        return res.status(404).json({ error: 'Contrato no encontrado o no pertenece a este proveedor' });
      }
    }

    const finalBranchId = branch_id || req.user.branchId;

    const result = await query(
      `INSERT INTO supplier_documents (
        supplier_id, contract_id, document_type, title, description,
        file_name, file_url, file_type, file_size, mime_type,
        issue_date, expiration_date, document_number,
        status, branch_id, uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        id, contract_id || null, document_type, title, description || null,
        file_name, file_url, file_type || null, file_size || null, mime_type || null,
        issue_date || null, expiration_date || null, document_number || null,
        status || 'active', finalBranchId, req.user.id || null
      ]
    );

    const document = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.status(201).json(document);
  } catch (error) {
    console.error('Error creando documento:', error);
    res.status(500).json({ error: 'Error al crear documento' });
  }
});

// Actualizar documento
router.put('/documents/:documentId', requireBranchAccess, async (req, res) => {
  try {
    const { documentId } = req.params;
    const {
      document_type, title, description,
      file_name, file_url, file_type, file_size, mime_type,
      issue_date, expiration_date, document_number,
      status
    } = req.body;

    // Obtener documento y verificar permisos
    const documentResult = await query(
      `SELECT sd.*, s.branch_id, s.is_shared
       FROM supplier_documents sd
       JOIN suppliers s ON sd.supplier_id = s.id
       WHERE sd.id = $1`,
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const document = documentResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (document.branch_id !== req.user.branchId && !document.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este documento' });
      }
    }

    const result = await query(
      `UPDATE supplier_documents SET
        document_type = COALESCE($1, document_type),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        file_name = COALESCE($4, file_name),
        file_url = COALESCE($5, file_url),
        file_type = COALESCE($6, file_type),
        file_size = COALESCE($7, file_size),
        mime_type = COALESCE($8, mime_type),
        issue_date = COALESCE($9, issue_date),
        expiration_date = COALESCE($10, expiration_date),
        document_number = COALESCE($11, document_number),
        status = COALESCE($12, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *`,
      [
        document_type, title, description,
        file_name, file_url, file_type, file_size, mime_type,
        issue_date, expiration_date, document_number,
        status, documentId
      ]
    );

    const updatedDocument = result.rows[0];

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [document.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json(updatedDocument);
  } catch (error) {
    console.error('Error actualizando documento:', error);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
});

// Eliminar documento
router.delete('/documents/:documentId', requireBranchAccess, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Obtener documento y verificar permisos
    const documentResult = await query(
      `SELECT sd.*, s.branch_id, s.is_shared
       FROM supplier_documents sd
       JOIN suppliers s ON sd.supplier_id = s.id
       WHERE sd.id = $1`,
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const document = documentResult.rows[0];

    // Verificar permisos
    if (!req.user.isMasterAdmin) {
      if (document.branch_id !== req.user.branchId && !document.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este documento' });
      }
    }

    await query('DELETE FROM supplier_documents WHERE id = $1', [documentId]);

    // Emitir actualización en tiempo real
    if (io) {
      const updatedSupplier = await query(
        'SELECT * FROM suppliers WHERE id = $1',
        [document.supplier_id]
      );
      if (updatedSupplier.rows.length > 0) {
        emitSupplierUpdate(io, 'updated', updatedSupplier.rows[0], req.user);
      }
    }

    res.json({ message: 'Documento eliminado' });
  } catch (error) {
    console.error('Error eliminando documento:', error);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
});

// Obtener estadísticas avanzadas del proveedor
router.get('/:id/stats-advanced', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    // Construir filtro de fecha
    let dateFilter = '';
    const params = [id];
    if (start_date) {
      dateFilter += ` AND po.order_date >= $${params.length + 1}`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND po.order_date <= $${params.length + 1}`;
      params.push(end_date);
    }

    // Estadísticas de órdenes de compra
    const ordersStats = await query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'pending' OR status = 'in_transit' THEN 1 ELSE 0 END) as pending_orders,
        SUM(total_amount) as total_spent,
        AVG(total_amount) as avg_order_amount,
        MIN(order_date) as first_order_date,
        MAX(order_date) as last_order_date
       FROM purchase_orders
       WHERE supplier_id = $1 ${dateFilter}`,
      params
    );

    // Estadísticas de pagos
    const paymentsStats = await query(
      `SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_payments,
        SUM(CASE WHEN status = 'pending' OR status = 'partial' THEN 1 ELSE 0 END) as pending_payments,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_payments,
        SUM(total_amount) as total_invoiced,
        SUM(paid_amount) as total_paid,
        SUM(total_amount - paid_amount) as total_pending
       FROM supplier_payments
       WHERE supplier_id = $1 ${dateFilter.replace('po.order_date', 'issue_date')}`,
      params
    );

    // Estadísticas de calificaciones
    const ratingsStats = await query(
      `SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as avg_rating,
        AVG(quality_rating) as avg_quality,
        AVG(delivery_rating) as avg_delivery,
        AVG(price_rating) as avg_price,
        AVG(communication_rating) as avg_communication,
        AVG(service_rating) as avg_service
       FROM supplier_ratings
       WHERE supplier_id = $1`,
      [id]
    );

    // Historial de precios (últimos 12 meses)
    const priceHistory = await query(
      `SELECT 
        DATE_TRUNC('month', price_date) as month,
        AVG(unit_price) as avg_price,
        MIN(unit_price) as min_price,
        MAX(unit_price) as max_price,
        COUNT(*) as price_records
       FROM supplier_price_history
       WHERE supplier_id = $1
         AND price_date >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', price_date)
       ORDER BY month DESC
       LIMIT 12`,
      [id]
    );

    const stats = {
      orders: ordersStats.rows[0] || {},
      payments: paymentsStats.rows[0] || {},
      ratings: ratingsStats.rows[0] || {},
      price_history: priceHistory.rows || []
    };

    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas avanzadas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ========== HISTORIAL DE PRECIOS ==========

// Listar historial de precios
router.get('/:id/price-history', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, inventory_item_id } = req.query;

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    let sql = `SELECT * FROM supplier_price_history WHERE supplier_id = $1`;
    const params = [id];
    let paramCount = 2;

    if (start_date) {
      sql += ` AND price_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND price_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (inventory_item_id) {
      sql += ` AND inventory_item_id = $${paramCount}`;
      params.push(inventory_item_id);
      paramCount++;
    }

    sql += ` ORDER BY price_date DESC, created_at DESC LIMIT 1000`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial de precios:', error);
    res.status(500).json({ error: 'Error al obtener historial de precios' });
  }
});

// Crear registro de precio
router.post('/:id/price-history', requireBranchAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      inventory_item_id, purchase_order_id,
      sku, item_name, unit_price, quantity, total_amount, currency, price_date
    } = req.body;

    if (!unit_price || !item_name) {
      return res.status(400).json({ error: 'unit_price y item_name son requeridos' });
    }

    // Verificar permisos del proveedor
    const supplierResult = await query(
      'SELECT branch_id, is_shared FROM suppliers WHERE id = $1',
      [id]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    const supplier = supplierResult.rows[0];

    if (!req.user.isMasterAdmin) {
      if (supplier.branch_id !== req.user.branchId && !supplier.is_shared) {
        return res.status(403).json({ error: 'No tienes acceso a este proveedor' });
      }
    }

    const finalQuantity = quantity || 1;
    const finalTotalAmount = total_amount || (unit_price * finalQuantity);
    const finalPriceDate = price_date || new Date().toISOString().split('T')[0];

    const result = await query(
      `INSERT INTO supplier_price_history (
        supplier_id, inventory_item_id, purchase_order_id,
        sku, item_name, unit_price, quantity, total_amount, currency, price_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id, inventory_item_id || null, purchase_order_id || null,
        sku || null, item_name, unit_price, finalQuantity, finalTotalAmount,
        currency || 'MXN', finalPriceDate
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando registro de precio:', error);
    res.status(500).json({ error: 'Error al crear registro de precio' });
  }
});

// Reporte de compras por proveedor
router.get('/reports/purchases', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, supplier_id, start_date, end_date } = req.query;
    
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT 
        s.id as supplier_id,
        s.name as supplier_name,
        s.code as supplier_code,
        COUNT(ce.id) as purchase_count,
        COALESCE(SUM(ce.amount), 0) as total_amount,
        MIN(ce.date) as first_purchase,
        MAX(ce.date) as last_purchase
      FROM suppliers s
      LEFT JOIN cost_entries ce ON s.id = ce.supplier_id
      WHERE s.status = 'active'
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtro por proveedor
    if (supplier_id) {
      sql += ` AND s.id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }

    // Filtro por fechas en costos
    if (start_date) {
      sql += ` AND ce.date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND ce.date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ` GROUP BY s.id, s.name, s.code ORDER BY total_amount DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reporte de compras:', error);
    res.status(500).json({ error: 'Error al obtener reporte de compras' });
  }
});

// Reporte de pagos a proveedores
router.get('/reports/payments', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, supplier_id, start_date, end_date } = req.query;
    
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT 
        s.id as supplier_id,
        s.name as supplier_name,
        s.code as supplier_code,
        COUNT(sp.id) as payment_count,
        COALESCE(SUM(sp.amount), 0) as total_paid,
        COALESCE(SUM(sp.pending_amount), 0) as total_pending,
        MIN(sp.payment_date) as first_payment,
        MAX(sp.payment_date) as last_payment
      FROM suppliers s
      LEFT JOIN supplier_payments sp ON s.id = sp.supplier_id
      WHERE s.status = 'active'
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtro por proveedor
    if (supplier_id) {
      sql += ` AND s.id = $${paramCount}`;
      params.push(supplier_id);
      paramCount++;
    }

    // Filtro por fechas
    if (start_date) {
      sql += ` AND sp.payment_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND sp.payment_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ` GROUP BY s.id, s.name, s.code ORDER BY total_paid DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reporte de pagos:', error);
    res.status(500).json({ error: 'Error al obtener reporte de pagos' });
  }
});

// Reporte de análisis de proveedores
router.get('/reports/analysis', requireBranchAccess, async (req, res) => {
  try {
    const { branch_id, start_date, end_date } = req.query;
    
    let branchId = null;
    if (branch_id && branch_id !== 'null' && branch_id !== 'undefined') {
      branchId = branch_id;
    } else if (!req.user.isMasterAdmin) {
      branchId = req.user.branchId;
    }

    let sql = `
      SELECT 
        s.id,
        s.name,
        s.code,
        s.rating,
        s.status,
        COUNT(DISTINCT ce.id) as total_purchases,
        COALESCE(SUM(ce.amount), 0) as total_purchase_amount,
        COUNT(DISTINCT sp.id) as total_payments,
        COALESCE(SUM(sp.amount), 0) as total_paid_amount,
        COALESCE(SUM(sp.pending_amount), 0) as total_pending_amount,
        COUNT(DISTINCT i.id) as inventory_items_count,
        MIN(ce.date) as first_purchase_date,
        MAX(ce.date) as last_purchase_date
      FROM suppliers s
      LEFT JOIN cost_entries ce ON s.id = ce.supplier_id
      LEFT JOIN supplier_payments sp ON s.id = sp.supplier_id
      LEFT JOIN inventory_items i ON s.id = i.supplier_id
      WHERE s.status = 'active'
    `;
    const params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (req.user.isMasterAdmin) {
      if (branchId) {
        sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
        params.push(branchId);
        paramCount++;
      }
    } else {
      sql += ` AND (s.branch_id = $${paramCount} OR s.is_shared = true)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    // Filtro por fechas
    if (start_date) {
      sql += ` AND (ce.date >= $${paramCount} OR ce.date IS NULL)`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND (ce.date <= $${paramCount} OR ce.date IS NULL)`;
      params.push(end_date);
      paramCount++;
    }

    sql += ` GROUP BY s.id, s.name, s.code, s.rating, s.status ORDER BY total_purchase_amount DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo análisis de proveedores:', error);
    res.status(500).json({ error: 'Error al obtener análisis de proveedores' });
  }
});

export default router;
