// Script de Migración Automática de Base de Datos
// Se ejecuta automáticamente si las tablas no existen
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrate() {
    try {
        console.log('🔄 Iniciando migración automática de base de datos...');

        // Leer archivo SQL
        const sqlPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Archivo schema.sql no encontrado en: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Dividir en statements individuales
        // PostgreSQL necesita ejecutar cada statement por separado
        let allStatements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => {
                // Filtrar comentarios y líneas vacías
                const trimmed = s.trim();
                return trimmed.length > 0 && 
                       !trimmed.startsWith('--') && 
                       !trimmed.startsWith('/*') &&
                       trimmed !== '';
            })
            .filter(s => s.length >= 10); // Filtrar statements muy cortos

        // Separar CREATE TABLE y CREATE INDEX
        const createTables = allStatements.filter(s => s.toUpperCase().startsWith('CREATE TABLE'));
        const createIndexes = allStatements.filter(s => s.toUpperCase().startsWith('CREATE INDEX'));
        
        console.log(`📝 Encontrados ${createTables.length} tablas y ${createIndexes.length} índices para crear...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // PRIMERO: Crear todas las tablas
        console.log('');
        console.log('📋 Fase 1: Creando tablas...');
        for (let i = 0; i < createTables.length; i++) {
            const statement = createTables[i];
            const tableName = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1] || 'desconocida';
            
            try {
                await query(statement);
                successCount++;
                console.log(`   ✅ Tabla creada: ${tableName}`);
            } catch (error) {
                // Ignorar errores de "ya existe"
                if (error.code === '42P07' || error.message.includes('already exists')) {
                    skippedCount++;
                    console.log(`   ⏭️  Tabla ya existe: ${tableName}`);
                } else {
                    errorCount++;
                    console.error(`   ❌ Error creando tabla ${tableName}:`, error.message);
                    // Continuar con el siguiente
                }
            }
        }

        // SEGUNDO: Crear todos los índices (después de que las tablas existan)
        console.log('');
        console.log('📋 Fase 2: Creando índices...');
        for (let i = 0; i < createIndexes.length; i++) {
            const statement = createIndexes[i];
            const indexName = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/i)?.[1] || 'desconocido';
            
            try {
                await query(statement);
                successCount++;
                // Log solo algunos índices para no saturar
                if (i < 5 || i === createIndexes.length - 1) {
                    console.log(`   ✅ Índice creado: ${indexName}`);
                }
            } catch (error) {
                // Ignorar errores de "ya existe" o "tabla no existe" (si la tabla aún no se creó)
                if (error.code === '42P07' || 
                    error.code === '42710' ||
                    error.code === '42P01' || // relation does not exist
                    error.message.includes('already exists') || 
                    error.message.includes('duplicate key')) {
                    skippedCount++;
                    // Solo log si es error de "ya existe", no si es "tabla no existe"
                    if (!error.message.includes('does not exist')) {
                        console.log(`   ⏭️  Índice ya existe: ${indexName}`);
                    }
                } else {
                    errorCount++;
                    console.error(`   ❌ Error creando índice ${indexName}:`, error.message);
                }
            }
        }

        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('✅ MIGRACIÓN COMPLETADA');
        console.log('═══════════════════════════════════════════');
        console.log(`   ✅ Exitosos: ${successCount}`);
        console.log(`   ⏭️  Omitidos (ya existían): ${skippedCount}`);
        if (errorCount > 0) {
            console.log(`   ❌ Errores: ${errorCount}`);
        }
        console.log('═══════════════════════════════════════════');
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
        console.error('');
        console.error('💡 Si el error persiste, ejecuta manualmente:');
        console.error('   npm run migrate');
        console.error('═══════════════════════════════════════════');
        console.error('');
        throw error;
    }
}
