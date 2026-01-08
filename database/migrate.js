// Script de Migración de Base de Datos
// Ejecuta el esquema SQL en PostgreSQL
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';
import { initDatabase } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
    try {
        console.log('🔄 Iniciando migración de base de datos...');

        // Inicializar conexión
        initDatabase();

        // Leer archivo SQL
        const sqlPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Ejecutar cada statement por separado (PostgreSQL no permite múltiples statements en una query)
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📝 Ejecutando ${statements.length} statements...`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            try {
                await query(statement);
                console.log(`✅ Statement ${i + 1}/${statements.length} ejecutado`);
            } catch (error) {
                // Ignorar errores de "ya existe" (CREATE TABLE IF NOT EXISTS)
                if (error.code === '42P07' || error.message.includes('already exists')) {
                    console.log(`⚠️  Statement ${i + 1} ya existe (ignorado)`);
                } else {
                    console.error(`❌ Error en statement ${i + 1}:`, error.message);
                    throw error;
                }
            }
        }

        console.log('✅ Migración completada exitosamente');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error en migración:', error);
        process.exit(1);
    }
}

migrate();

