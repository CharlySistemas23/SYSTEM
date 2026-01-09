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
    const columns = Object.keys(data).join(', ');
    // Convertir arrays y objetos a JSON string para campos JSONB
    const values = Object.values(data).map(val => {
        if (Array.isArray(val) || (typeof val === 'object' && val !== null && !(val instanceof Date))) {
            return JSON.stringify(val);
        }
        return val;
    });
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const queryText = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
    return await queryOne(queryText, values);
}

// Helper para actualizar
export async function update(table, id, data) {
    // Remover updated_at del data si viene del cliente - se establece automáticamente
    const { updated_at, ...cleanData } = data;
    
    const columns = Object.keys(cleanData);
    // Convertir arrays y objetos a JSON string para campos JSONB
    const values = Object.values(cleanData).map(val => {
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
