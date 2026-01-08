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
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => {
                // Filtrar comentarios y líneas vacías
                const trimmed = s.trim();
                return trimmed.length > 0 && 
                       !trimmed.startsWith('--') && 
                       !trimmed.startsWith('/*') &&
                       trimmed !== '';
            });

        console.log(`📝 Ejecutando ${statements.length} statements...`);

        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            
            // Saltar statements muy cortos (probablemente solo espacios)
            if (statement.length < 10) {
                continue;
            }

            try {
                await query(statement);
                successCount++;
                
                // Log cada 10 statements para no saturar la consola
                if ((i + 1) % 10 === 0 || i === statements.length - 1) {
                    console.log(`✅ Progreso: ${i + 1}/${statements.length} statements procesados`);
                }
            } catch (error) {
                // Ignorar errores de "ya existe" (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
                if (error.code === '42P07' || 
                    error.code === '42710' ||
                    error.message.includes('already exists') ||
                    error.message.includes('duplicate key')) {
                    skippedCount++;
                    // Silenciar estos errores, son normales en migraciones
                } else {
                    errorCount++;
                    console.error(`❌ Error en statement ${i + 1}:`, error.message);
                    console.error(`   SQL: ${statement.substring(0, 100)}...`);
                    // Continuar con el siguiente statement en lugar de fallar completamente
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
