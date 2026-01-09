// Script de Migración Automática de Base de Datos
// Se ejecuta automáticamente si las tablas no existen
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Orden de creación de tablas según dependencias (sin FK primero, luego con FK)
const TABLE_ORDER = [
    // Fase 1: Tablas base sin dependencias
    'catalog_branches',      // Sin dependencias
    
    // Fase 2: Tablas que dependen solo de catalog_branches
    'users',                 // Depende de catalog_branches
    'employees',             // Depende de catalog_branches
    'customers',             // Depende de catalog_branches
    'catalog_sellers',       // Depende de catalog_branches
    'catalog_guides',        // Depende de catalog_branches
    'catalog_agencies',      // Depende de catalog_branches
    'inventory_items',       // Depende de catalog_branches
    'commission_rules',      // Depende de catalog_branches
    'cost_entries',          // Depende de catalog_branches
    'exchange_rates_daily',  // Sin dependencias (tabla independiente)
    'settings',              // Sin dependencias (tabla independiente)
    'payment_methods',       // Sin dependencias (tabla independiente)
    
    // Fase 3: Tablas que dependen de catalog_branches y otras tablas
    'sales',                 // Depende de catalog_branches
    'sale_items',            // Depende de sales
    'sale_payments',         // Depende de sales
    'cash_sessions',         // Depende de catalog_branches y employees
    'arrival_rate_rules',    // Depende de catalog_agencies y catalog_branches
    'agency_arrivals',       // Depende de catalog_agencies y catalog_branches
    'repairs',               // Depende de inventory_items y catalog_branches
    'tourist_reports',       // Depende de catalog_branches
    'inventory_transfers',   // Depende de catalog_branches (from/to)
    'budget_entries',        // Depende de catalog_branches
    'daily_profit_reports',  // Depende de catalog_branches
    
    // Fase 4: Tablas que dependen de otras tablas
    'cash_movements',        // Depende de cash_sessions
    'repair_photos',         // Depende de repairs
    'inventory_transfer_items', // Depende de inventory_transfers e inventory_items
    'inventory_photos',      // Depende de inventory_items
    'inventory_certificates', // Depende de inventory_items
    'tourist_report_lines',  // Depende de tourist_reports y sales
];

export async function migrate() {
    try {
        console.log('🔄 Iniciando migración automática de base de datos...');
        console.log('');

        // Leer archivo SQL
        const sqlPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Archivo schema.sql no encontrado en: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Función mejorada para extraer statements SQL
        function extractSQLStatements(sqlText) {
            const statements = [];
            let currentStatement = '';
            let inComment = false;
            
            const lines = sqlText.split('\n');
            
            for (let line of lines) {
                // Manejar comentarios de línea (--)
                if (line.trim().startsWith('--')) {
                    continue;
                }
                
                // Manejar comentarios de bloque (/* ... */)
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

        // Separar CREATE TABLE y CREATE INDEX
        const createTables = allStatements.filter(s => s.toUpperCase().trim().startsWith('CREATE TABLE'));
        const createIndexes = allStatements.filter(s => s.toUpperCase().trim().startsWith('CREATE INDEX'));
        
        console.log(`📝 Encontrados ${createTables.length} tablas y ${createIndexes.length} índices para procesar...`);
        console.log('');

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Crear un mapa de tablas por nombre
        const tablesMap = new Map();
        createTables.forEach(stmt => {
            const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
            if (match) {
                tablesMap.set(match[1], stmt);
            }
        });

        // PRIMERO: Crear tablas en el orden correcto de dependencias
        console.log('📋 Fase 1: Creando tablas (en orden de dependencias)...');
        console.log('');
        
        for (const tableName of TABLE_ORDER) {
            const statement = tablesMap.get(tableName);
            if (!statement) {
                console.log(`   ⚠️  Tabla ${tableName} no encontrada en schema.sql, saltando...`);
                continue;
            }
            
            try {
                await query(statement);
                successCount++;
                console.log(`   ✅ Tabla creada: ${tableName}`);
            } catch (error) {
                if (error.code === '42P07' || error.message.includes('already exists')) {
                    skippedCount++;
                    console.log(`   ⏭️  Tabla ya existe: ${tableName}`);
                } else {
                    errorCount++;
                    console.error(`   ❌ Error creando tabla ${tableName}:`, error.message);
                    if (error.code === '42P01' && error.message.includes('does not exist')) {
                        console.error(`   ⚠️  ERROR CRÍTICO: La tabla ${tableName} requiere una tabla que no existe`);
                        throw error;
                    }
                }
            }
        }

        // Crear cualquier tabla que no esté en TABLE_ORDER
        console.log('');
        console.log('📋 Creando tablas adicionales...');
        for (const [tableName, statement] of tablesMap.entries()) {
            if (!TABLE_ORDER.includes(tableName)) {
                try {
                    await query(statement);
                    successCount++;
                    console.log(`   ✅ Tabla creada: ${tableName}`);
                } catch (error) {
                    if (error.code === '42P07' || error.message.includes('already exists')) {
                        skippedCount++;
                        console.log(`   ⏭️  Tabla ya existe: ${tableName}`);
                    } else {
                        errorCount++;
                        console.error(`   ❌ Error creando tabla ${tableName}:`, error.message);
                    }
                }
            }
        }

        // SEGUNDO: Crear todos los índices
        console.log('');
        console.log('📋 Fase 2: Creando índices...');
        console.log('');
        
        let indexCount = 0;
        for (let i = 0; i < createIndexes.length; i++) {
            const statement = createIndexes[i];
            const indexName = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/i)?.[1] || `idx_${i}`;
            
            try {
                await query(statement);
                successCount++;
                indexCount++;
                if (i < 3 || i === createIndexes.length - 1) {
                    console.log(`   ✅ Índice creado: ${indexName}`);
                } else if (i === 3) {
                    console.log(`   ... creando ${createIndexes.length - 3} índices más ...`);
                }
            } catch (error) {
                if (error.code === '42P07' || 
                    error.code === '42710' ||
                    error.message.includes('already exists') || 
                    error.message.includes('duplicate key')) {
                    skippedCount++;
                } else if (error.code === '42P01' || error.message.includes('does not exist')) {
                    errorCount++;
                    console.error(`   ⚠️  Índice ${indexName}: tabla referenciada no existe`);
                } else {
                    errorCount++;
                    console.error(`   ❌ Error creando índice ${indexName}:`, error.message);
                }
            }
        }
        
        if (indexCount > 0) {
            console.log(`   ✅ Total de índices procesados: ${indexCount}`);
        }

        // Resumen final
        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('✅ MIGRACIÓN COMPLETADA');
        console.log('═══════════════════════════════════════════');
        console.log(`   ✅ Exitosos: ${successCount}`);
        console.log(`   ⏭️  Omitidos (ya existían): ${skippedCount}`);
        if (errorCount > 0) {
            console.log(`   ⚠️  Errores no críticos: ${errorCount}`);
        }
        console.log('═══════════════════════════════════════════');
        console.log('');

        // Verificar que las tablas críticas existan
        console.log('🔍 Verificando tablas críticas...');
        const { query: verifyQuery } = await import('../config/database.js');
        const criticalTables = [
            'catalog_branches', 'users', 'employees',
            'catalog_sellers', 'catalog_guides', 'catalog_agencies',
            'sales', 'inventory_items', 'customers', 'repairs',
            'arrival_rate_rules', 'exchange_rates_daily'
        ];
        let allCriticalExist = true;
        const missingTables = [];
        
        for (const tableName of criticalTables) {
            try {
                await verifyQuery(`SELECT 1 FROM ${tableName} LIMIT 1`);
                console.log(`   ✅ ${tableName} existe`);
            } catch (error) {
                if (error.code === '42P01' || error.message.includes('does not exist')) {
                    console.error(`   ❌ ${tableName} NO existe`);
                    missingTables.push(tableName);
                    allCriticalExist = false;
                } else {
                    throw error;
                }
            }
        }
        
        if (!allCriticalExist) {
            console.error('');
            console.error(`❌ ERROR: ${missingTables.length} tablas críticas faltantes: ${missingTables.join(', ')}`);
            throw new Error(`Algunas tablas críticas no se crearon correctamente: ${missingTables.join(', ')}`);
        }
        
        console.log('');
        console.log(`✅ Todas las ${criticalTables.length} tablas críticas verificadas`);
        console.log('');

        return true;
    } catch (error) {
        console.error('');
        console.error('❌ ERROR EN MIGRACIÓN AUTOMÁTICA');
        console.error('═══════════════════════════════════════════');
        console.error('Mensaje:', error.message);
        if (error.code) {
            console.error('Código:', error.code);
        }
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        console.error('');
        console.error('💡 Si el error persiste:');
        console.error('   1. Verifica que DATABASE_URL esté configurada en Railway');
        console.error('   2. Ejecuta manualmente desde Railway Console: npm run migrate');
        console.error('═══════════════════════════════════════════');
        console.error('');
        throw error;
    }
}
