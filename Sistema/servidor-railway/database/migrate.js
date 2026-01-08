// Script de Migración Manual de Base de Datos
// Ejecuta: npm run migrate
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initDatabase } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Orden de creación de tablas según dependencias
const TABLE_ORDER = [
    'catalog_branches',  // Sin dependencias
    'users',             // Depende de catalog_branches
    'employees',         // Depende de catalog_branches
    'customers',         // Depende de catalog_branches
    'catalog_sellers',   // Depende de catalog_branches
    'catalog_guides',    // Depende de catalog_branches
    'catalog_agencies',  // Depende de catalog_branches
    'sales',             // Depende de catalog_branches
    'sale_items',        // Depende de sales
    'sale_payments',     // Depende de sales
    'inventory_items',   // Depende de catalog_branches
    'commission_rules',  // Depende de catalog_branches
    'cost_entries',      // Depende de catalog_branches
    'cash_sessions',     // Depende de catalog_branches y employees
];

async function migrate() {
    try {
        console.log('🔄 Iniciando migración manual de base de datos...');
        console.log('');

        // Inicializar conexión y verificar
        initDatabase();
        // Verificar conexión con una query simple
        try {
            await query('SELECT NOW()');
            console.log('✅ Conectado a la base de datos');
        } catch (error) {
            throw new Error(`No se pudo conectar a la base de datos: ${error.message}`);
        }
        console.log('');

        // Leer archivo SQL
        const sqlPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Archivo schema.sql no encontrado en: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Función para extraer statements SQL
        function extractSQLStatements(sqlText) {
            const statements = [];
            let currentStatement = '';
            let inComment = false;
            
            const lines = sqlText.split('\n');
            
            for (let line of lines) {
                if (line.trim().startsWith('--')) {
                    continue;
                }
                
                const blockCommentStart = line.indexOf('/*');
                const blockCommentEnd = line.indexOf('*/');
                
                if (blockCommentStart !== -1) {
                    if (blockCommentEnd !== -1) {
                        line = line.substring(0, blockCommentStart) + line.substring(blockCommentEnd + 2);
                    } else {
                        inComment = true;
                        line = line.substring(0, blockCommentStart);
                    }
                } else if (inComment && blockCommentEnd !== -1) {
                    inComment = false;
                    line = line.substring(blockCommentEnd + 2);
                } else if (inComment) {
                    continue;
                }
                
                currentStatement += line + '\n';
                
                if (line.trim().endsWith(';')) {
                    const trimmed = currentStatement.trim();
                    if (trimmed.length > 10 && !trimmed.startsWith('--')) {
                        statements.push(trimmed);
                    }
                    currentStatement = '';
                }
            }
            
            if (currentStatement.trim().length > 10) {
                statements.push(currentStatement.trim());
            }
            
            return statements;
        }

        const allStatements = extractSQLStatements(sql);
        const createTables = allStatements.filter(s => s.toUpperCase().trim().startsWith('CREATE TABLE'));
        const createIndexes = allStatements.filter(s => s.toUpperCase().trim().startsWith('CREATE INDEX'));
        
        console.log(`📝 Encontrados ${createTables.length} tablas y ${createIndexes.length} índices`);
        console.log('');

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Mapa de tablas por nombre
        const tablesMap = new Map();
        createTables.forEach(stmt => {
            const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
            if (match) {
                tablesMap.set(match[1], stmt);
            }
        });

        // Crear tablas en orden de dependencias
        console.log('📋 Fase 1: Creando tablas...');
        console.log('');
        
        for (const tableName of TABLE_ORDER) {
            const statement = tablesMap.get(tableName);
            if (!statement) {
                continue;
            }
            
            try {
                await query(statement);
                successCount++;
                console.log(`   ✅ ${tableName}`);
            } catch (error) {
                if (error.code === '42P07' || error.message.includes('already exists')) {
                    skippedCount++;
                    console.log(`   ⏭️  ${tableName} (ya existe)`);
                } else {
                    errorCount++;
                    console.error(`   ❌ ${tableName}:`, error.message);
                    throw error;
                }
            }
        }

        // Crear tablas adicionales
        for (const [tableName, statement] of tablesMap.entries()) {
            if (!TABLE_ORDER.includes(tableName)) {
                try {
                    await query(statement);
                    successCount++;
                    console.log(`   ✅ ${tableName}`);
                } catch (error) {
                    if (error.code === '42P07' || error.message.includes('already exists')) {
                        skippedCount++;
                        console.log(`   ⏭️  ${tableName} (ya existe)`);
                    } else {
                        errorCount++;
                        console.error(`   ❌ ${tableName}:`, error.message);
                        throw error;
                    }
                }
            }
        }

        // Crear índices
        console.log('');
        console.log('📋 Fase 2: Creando índices...');
        console.log('');
        
        for (let i = 0; i < createIndexes.length; i++) {
            const statement = createIndexes[i];
            const indexName = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/i)?.[1] || `idx_${i}`;
            
            try {
                await query(statement);
                successCount++;
                if (i < 3 || i === createIndexes.length - 1) {
                    console.log(`   ✅ ${indexName}`);
                } else if (i === 3) {
                    console.log(`   ... ${createIndexes.length - 3} más ...`);
                }
            } catch (error) {
                if (error.code === '42P07' || error.code === '42710' || error.message.includes('already exists')) {
                    skippedCount++;
                } else {
                    errorCount++;
                    console.error(`   ❌ ${indexName}:`, error.message);
                }
            }
        }

        // Verificar tablas críticas
        console.log('');
        console.log('🔍 Verificando tablas críticas...');
        const criticalTables = ['catalog_branches', 'users', 'employees'];
        
        for (const tableName of criticalTables) {
            try {
                await query(`SELECT 1 FROM ${tableName} LIMIT 1`);
                console.log(`   ✅ ${tableName}`);
            } catch (error) {
                console.error(`   ❌ ${tableName} NO existe`);
                throw new Error(`Tabla crítica ${tableName} no existe`);
            }
        }

        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('✅ MIGRACIÓN COMPLETADA');
        console.log('═══════════════════════════════════════════');
        console.log(`   ✅ Exitosos: ${successCount}`);
        console.log(`   ⏭️  Omitidos: ${skippedCount}`);
        if (errorCount > 0) {
            console.log(`   ⚠️  Errores: ${errorCount}`);
        }
        console.log('═══════════════════════════════════════════');
        console.log('');

        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('❌ ERROR EN MIGRACIÓN');
        console.error('═══════════════════════════════════════════');
        console.error('Mensaje:', error.message);
        if (error.code) {
            console.error('Código:', error.code);
        }
        console.error('═══════════════════════════════════════════');
        console.error('');
        process.exit(1);
    }
}

migrate();

