import express from 'express';
import { query } from '../config/database.js';
import { requireMasterAdmin } from '../middleware/authOptional.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

const columnExistenceCache = new Map();

async function tableHasColumn(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (columnExistenceCache.has(cacheKey)) {
    return columnExistenceCache.get(cacheKey);
  }

  try {
    const result = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
       LIMIT 1`,
      [tableName, columnName]
    );
    const exists = result.rows.length > 0;
    columnExistenceCache.set(cacheKey, exists);
    return exists;
  } catch (error) {
    console.warn(`No se pudo verificar columna ${cacheKey}:`, error.message);
    return false;
  }
}

// Resuelve agency_id: si no es UUID, busca por code en catalog_agencies
async function resolveAgencyId(agencyId) {
  if (!agencyId) return null;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(agencyId).trim());
  if (isUUID) return agencyId;
  const r = await query('SELECT id FROM catalog_agencies WHERE code = $1', [String(agencyId).trim()]);
  return r.rows.length ? r.rows[0].id : null;
}

// ============================================
// AGENCIAS
// ============================================

// Listar agencias
router.get('/agencies', async (req, res) => {
  try {
    const { search, active } = req.query;
    const agenciesHasBranchId = await tableHasColumn('catalog_agencies', 'branch_id');
    
    let sql = 'SELECT * FROM catalog_agencies WHERE 1=1';
    const params = [];
    let paramCount = 1;

    // ✅ NUEVO: Filtrar por sucursal del usuario si no es master_admin
    if (agenciesHasBranchId && !req.user?.isMasterAdmin && req.user?.branchId) {
      sql += ` AND (branch_id = $${paramCount} OR branch_id IS NULL)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    if (active !== undefined) {
      sql += ` AND active = $${paramCount}`;
      params.push(active === 'true');
      paramCount++;
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount} OR barcode ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ' ORDER BY name';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo agencias:', error);
    res.status(500).json({ error: 'Error al obtener agencias' });
  }
});

// Obtener agencia por ID
router.get('/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM catalog_agencies WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo agencia:', error);
    res.status(500).json({ error: 'Error al obtener agencia' });
  }
});

// Buscar agencia por código de barras
router.get('/agencies/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const result = await query(
      'SELECT * FROM catalog_agencies WHERE barcode = $1 AND active = true',
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error buscando agencia por barcode:', error);
    res.status(500).json({ error: 'Error al buscar agencia' });
  }
});

// Crear agencia (solo admin maestro)
router.post('/agencies', requireMasterAdmin, [
  body('name').notEmpty().withMessage('Nombre requerido')
], async (req, res) => {
  try {
    const code = req.body.code || req.body.codigo;
    if (!code) {
      return res.status(400).json({ errors: [{ msg: 'Código requerido' }] });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, barcode, active = true } = req.body;

    const result = await query(
      `INSERT INTO catalog_agencies (code, name, barcode, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code, name, barcode, active]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'catalog_agency', $2, $3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ code, name })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error creando agencia:', error);
    res.status(500).json({ error: 'Error al crear agencia' });
  }
});

// Actualizar agencia (solo admin maestro)
router.put('/agencies/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, barcode, active } = req.body;

    const result = await query(
      `UPDATE catalog_agencies
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           barcode = COALESCE($3, barcode),
           active = COALESCE($4, active)
       WHERE id = $5
       RETURNING *`,
      [code, name, barcode, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'catalog_agency', $2, $3)`,
      [req.user.id, id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error actualizando agencia:', error);
    res.status(500).json({ error: 'Error al actualizar agencia' });
  }
});

// Eliminar agencia (solo admin maestro)
router.delete('/agencies/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no tenga guías asociadas
    const guidesResult = await query(
      'SELECT COUNT(*) as count FROM catalog_guides WHERE agency_id = $1',
      [id]
    );

    if (parseInt(guidesResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar la agencia porque tiene guías asociadas' 
      });
    }

    const result = await query(
      'DELETE FROM catalog_agencies WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agencia no encontrada' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'catalog_agency', $2, $3)`,
      [req.user.id, id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Agencia eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando agencia:', error);
    res.status(500).json({ error: 'Error al eliminar agencia' });
  }
});

// ============================================
// GUÍAS
// ============================================

// Listar guías
router.get('/guides', async (req, res) => {
  try {
    const { search, agency_id: rawAgencyId, active } = req.query;
    const agency_id = rawAgencyId ? await resolveAgencyId(rawAgencyId) : null;
    const guidesHasBranchId = await tableHasColumn('catalog_guides', 'branch_id');

    let sql = `
      SELECT g.*, a.name as agency_name
      FROM catalog_guides g
      LEFT JOIN catalog_agencies a ON g.agency_id = a.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // ✅ NUEVO: Filtrar por sucursal del usuario si no es master_admin
    if (guidesHasBranchId && !req.user?.isMasterAdmin && req.user?.branchId) {
      sql += ` AND (g.branch_id = $${paramCount} OR g.branch_id IS NULL)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    if (agency_id) {
      sql += ` AND g.agency_id = $${paramCount}`;
      params.push(agency_id);
      paramCount++;
    }

    if (active !== undefined) {
      sql += ` AND g.active = $${paramCount}`;
      params.push(active === 'true');
      paramCount++;
    }

    if (search) {
      sql += ` AND (g.name ILIKE $${paramCount} OR g.code ILIKE $${paramCount} OR g.barcode ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ' ORDER BY g.name';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo guías:', error);
    res.status(500).json({ error: 'Error al obtener guías' });
  }
});

// Obtener guía por ID
router.get('/guides/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT g.*, a.name as agency_name
       FROM catalog_guides g
       LEFT JOIN catalog_agencies a ON g.agency_id = a.id
       WHERE g.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo guía:', error);
    res.status(500).json({ error: 'Error al obtener guía' });
  }
});

// Buscar guía por código de barras
router.get('/guides/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const result = await query(
      `SELECT g.*, a.name as agency_name
       FROM catalog_guides g
       LEFT JOIN catalog_agencies a ON g.agency_id = a.id
       WHERE g.barcode = $1 AND g.active = true`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error buscando guía por barcode:', error);
    res.status(500).json({ error: 'Error al buscar guía' });
  }
});

// Crear guía (solo admin maestro)
router.post('/guides', requireMasterAdmin, [
  body('name').notEmpty().withMessage('Nombre requerido')
], async (req, res) => {
  try {
    const code = req.body.code || req.body.codigo;
    if (!code) {
      return res.status(400).json({ errors: [{ msg: 'Código requerido' }] });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const resolvedAgencyId = req.body.agency_id ? await resolveAgencyId(req.body.agency_id) : null;
    const { name, barcode, active = true } = req.body;

    const result = await query(
      `INSERT INTO catalog_guides (code, name, barcode, agency_id, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code, name, barcode, resolvedAgencyId, active]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'catalog_guide', $2, $3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ code, name, agency_id: resolvedAgencyId })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error creando guía:', error);
    res.status(500).json({ error: 'Error al crear guía' });
  }
});

// Actualizar guía (solo admin maestro)
router.put('/guides/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const code = req.body.code || req.body.codigo;
    const { name, barcode, active } = req.body;
    const resolvedAgencyId = req.body.agency_id !== undefined
      ? await resolveAgencyId(req.body.agency_id)
      : undefined;

    const result = await query(
      `UPDATE catalog_guides
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           barcode = COALESCE($3, barcode),
           agency_id = COALESCE($4, agency_id),
           active = COALESCE($5, active)
       WHERE id = $6
       RETURNING *`,
      [code, name, barcode, resolvedAgencyId, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'catalog_guide', $2, $3)`,
      [req.user.id, id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error actualizando guía:', error);
    res.status(500).json({ error: 'Error al actualizar guía' });
  }
});

// Eliminar guía (solo admin maestro)
router.delete('/guides/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no tenga ventas asociadas
    const salesResult = await query(
      'SELECT COUNT(*) as count FROM sales WHERE guide_id = $1',
      [id]
    );

    if (parseInt(salesResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar la guía porque tiene ventas asociadas' 
      });
    }

    const result = await query(
      'DELETE FROM catalog_guides WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'catalog_guide', $2, $3)`,
      [req.user.id, id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Guía eliminada correctamente' });
  } catch (error) {
    console.error('Error eliminando guía:', error);
    res.status(500).json({ error: 'Error al eliminar guía' });
  }
});

// ============================================
// VENDEDORES
// ============================================

// Listar vendedores
router.get('/sellers', async (req, res) => {
  try {
    const { search, active } = req.query;
    const sellersHasBranchId = await tableHasColumn('catalog_sellers', 'branch_id');
    
    let sql = 'SELECT * FROM catalog_sellers WHERE 1=1';
    const params = [];
    let paramCount = 1;

    // ✅ NUEVO: Filtrar por sucursal del usuario si no es master_admin
    if (sellersHasBranchId && !req.user?.isMasterAdmin && req.user?.branchId) {
      sql += ` AND (branch_id = $${paramCount} OR branch_id IS NULL)`;
      params.push(req.user.branchId);
      paramCount++;
    }

    if (active !== undefined) {
      sql += ` AND active = $${paramCount}`;
      params.push(active === 'true');
      paramCount++;
    }

    if (search) {
      sql += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount} OR barcode ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    sql += ' ORDER BY name';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo vendedores:', error);
    res.status(500).json({ error: 'Error al obtener vendedores' });
  }
});

// Obtener vendedor por ID
router.get('/sellers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM catalog_sellers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo vendedor:', error);
    res.status(500).json({ error: 'Error al obtener vendedor' });
  }
});

// Buscar vendedor por código de barras
router.get('/sellers/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const result = await query(
      'SELECT * FROM catalog_sellers WHERE barcode = $1 AND active = true',
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error buscando vendedor por barcode:', error);
    res.status(500).json({ error: 'Error al buscar vendedor' });
  }
});

// Crear vendedor (solo admin maestro)
router.post('/sellers', requireMasterAdmin, [
  body('name').notEmpty().withMessage('Nombre requerido')
], async (req, res) => {
  try {
    const code = req.body.code || req.body.codigo;
    if (!code) {
      return res.status(400).json({ errors: [{ msg: 'Código requerido' }] });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, barcode, active = true } = req.body;

    const result = await query(
      `INSERT INTO catalog_sellers (code, name, barcode, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code, name, barcode, active]
    );

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'create', 'catalog_seller', $2, $3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({ code, name })]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error creando vendedor:', error);
    res.status(500).json({ error: 'Error al crear vendedor' });
  }
});

// Actualizar vendedor (solo admin maestro)
router.put('/sellers/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, barcode, active } = req.body;

    const result = await query(
      `UPDATE catalog_sellers
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           barcode = COALESCE($3, barcode),
           active = COALESCE($4, active)
       WHERE id = $5
       RETURNING *`,
      [code, name, barcode, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update', 'catalog_seller', $2, $3)`,
      [req.user.id, id, JSON.stringify(req.body)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El código o código de barras ya existe' });
    }
    console.error('Error actualizando vendedor:', error);
    res.status(500).json({ error: 'Error al actualizar vendedor' });
  }
});

// Eliminar vendedor (solo admin maestro)
router.delete('/sellers/:id', requireMasterAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que no tenga ventas asociadas
    const salesResult = await query(
      'SELECT COUNT(*) as count FROM sales WHERE seller_id = $1',
      [id]
    );

    if (parseInt(salesResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el vendedor porque tiene ventas asociadas' 
      });
    }

    const result = await query(
      'DELETE FROM catalog_sellers WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    // Registrar en audit log
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete', 'catalog_seller', $2, $3)`,
      [req.user.id, id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Vendedor eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando vendedor:', error);
    res.status(500).json({ error: 'Error al eliminar vendedor' });
  }
});

export default router;
