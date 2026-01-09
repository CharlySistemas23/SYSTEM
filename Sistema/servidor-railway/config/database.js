// Configuración de Base de Datos PostgreSQL
import pg from 'pg';
const { Pool } = pg;

let pool = null;

export function initDatabase() {
    if (pool) {
        return pool;
    }

    // Railway provee DATABASE_URL automáticamente
    const connectionString = process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;

    pool = new Pool({
        connectionString: connectionString,
        ssl: process.env.DATABASE_URL ? {
            rejectUnauthorized: false
        } : false,
        max: 20, // Máximo de conexiones
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

    // Manejo de errores
    pool.on('error', (err) => {
        console.error('❌ Error inesperado en pool de base de datos:', err);
    });

    // Verificar conexión en background (no bloquear)
    pool.query('SELECT NOW()')
        .then(() => {
            // Conexión exitosa - el log se mostrará cuando se use
        })
        .catch((err) => {
            // Error silencioso aquí - se manejará en startServer()
        });

    return pool;
}

export function getPool() {
    if (!pool) {
        return initDatabase();
    }
    return pool;
}

// Helper para ejecutar queries
export async function query(text, params) {
    const db = getPool();
    try {
        const result = await db.query(text, params);
        return result.rows;
    } catch (error) {
        console.error('Error ejecutando query:', text, error);
        throw error;
    }
}

// Helper para obtener un solo registro
export async function queryOne(text, params) {
    const rows = await query(text, params);
    return rows[0] || null;
}

// Helper para insertar y obtener el registro insertado
export async function insert(table, data) {
    // Filtrar campos válidos según la tabla (evitar errores de columnas inexistentes)
    const validFields = getValidFieldsForTable(table);
    const filteredData = {};
    
    // Solo incluir campos que existen en la tabla
    for (const key of Object.keys(data)) {
        if (validFields.includes(key) || !validFields.length) {
            filteredData[key] = data[key];
        } else {
            // Ignorar campos que no existen en la tabla (como weight_g, stock_actual, etc.)
            console.warn(`⚠️ Campo '${key}' ignorado al insertar en ${table} (no existe en la tabla)`);
        }
    }
    
    if (Object.keys(filteredData).length === 0) {
        throw new Error(`No hay campos válidos para insertar en ${table}`);
    }
    
    const columns = Object.keys(filteredData).join(', ');
    // Convertir arrays y objetos a JSON string para campos JSONB
    const values = Object.values(filteredData).map(val => {
        if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
            return JSON.stringify(val);
        }
        return val;
    });
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const queryText = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
    return await queryOne(queryText, values);
}

// Helper para obtener campos válidos de una tabla
function getValidFieldsForTable(table) {
    // Mapeo de tablas a sus campos válidos (según schema.sql)
    const tableFields = {
        'inventory_items': [
            'id', 'sku', 'barcode', 'name', 'description', 'metal', 'stone', 'size', 
            'weight', 'dimensions', 'cost', 'price', 'stock', 'branch_id', 'location', 
            'status', 'device_id', 'sync_status', 'created_at', 'updated_at'
        ],
        'customers': [
            'id', 'name', 'email', 'phone', 'address', 'notes', 'branch_id', 
            'sync_status', 'created_at', 'updated_at'
        ],
        'employees': [
            'id', 'name', 'role', 'branch_id', 'barcode', 'employee_code', 
            'active', 'salary', 'created_at', 'updated_at'
        ],
        'sales': [
            'id', 'folio', 'branch_id', 'employee_id', 'seller_id', 'guide_id', 
            'agency_id', 'customer_id', 'passengers', 'currency', 'exchange_rate', 
            'subtotal', 'discount', 'total', 'seller_commission', 'guide_commission', 
            'status', 'notes', 'cart_data', 'device_id', 'sync_status', 'created_at', 'updated_at'
        ],
        'cost_entries': [
            'id', 'type', 'category', 'amount', 'branch_id', 'date', 'notes', 
            'created_at', 'updated_at'
        ],
        'repairs': [
            'id', 'folio', 'inventory_item_id', 'branch_id', 'customer_name', 
            'customer_phone', 'customer_email', 'description', 'cost', 'status', 
            'received_at', 'completed_at', 'notes', 'created_at', 'updated_at'
        ]
    };
    
    return tableFields[table] || []; // Si no está en la lista, retornar array vacío (permitir todos)
}

// Helper para actualizar
export async function update(table, id, data) {
    // Remover updated_at del data si viene del cliente - se establece automáticamente
    const { updated_at, ...cleanData } = data;
    
    // Filtrar campos válidos según la tabla
    const validFields = getValidFieldsForTable(table);
    const filteredData = {};
    
    // Solo incluir campos que existen en la tabla
    for (const key of Object.keys(cleanData)) {
        if (validFields.includes(key) || !validFields.length) {
            filteredData[key] = cleanData[key];
        } else {
            // Ignorar campos que no existen en la tabla
            console.warn(`⚠️ Campo '${key}' ignorado al actualizar en ${table} (no existe en la tabla)`);
        }
    }
    
    if (Object.keys(filteredData).length === 0) {
        throw new Error(`No hay campos válidos para actualizar en ${table}`);
    }
    
    const columns = Object.keys(filteredData);
    // Convertir arrays y objetos a JSON string para campos JSONB
    const values = Object.values(filteredData).map(val => {
        if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
            return JSON.stringify(val);
        }
        return val;
    });
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    const allValues = [...values, id];
    // updated_at siempre se establece automáticamente, no se acepta del cliente
    const queryText = `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${allValues.length} RETURNING *`;
    return await queryOne(queryText, allValues);
}

// Helper para eliminar
export async function remove(table, id) {
    const queryText = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
    return await queryOne(queryText, [id]);
}

// Helper para obtener por ID
export async function getById(table, id) {
    const queryText = `SELECT * FROM ${table} WHERE id = $1`;
    return await queryOne(queryText, [id]);
}

// Helper para obtener todos con filtro opcional por branch_id
export async function getAll(table, branchId = null, filters = {}) {
    let queryText = `SELECT * FROM ${table}`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (branchId) {
        conditions.push(`branch_id = $${paramIndex}`);
        params.push(branchId);
        paramIndex++;
    }

    // Aplicar filtros adicionales
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            conditions.push(`${key} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        }
    });

    if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ' ORDER BY created_at DESC';

    return await query(queryText, params);
}

// Helper para obtener por branch_id
export async function getByBranchId(table, branchId, additionalFilters = {}) {
    return await getAll(table, branchId, additionalFilters);
}

// Cerrar pool (útil para tests o shutdown)
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
