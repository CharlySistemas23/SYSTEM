import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Iniciando migración de base de datos...');

    // Leer archivo SQL
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf8');

    // Dividir el SQL en statements individuales
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // Ejecutar statements uno por uno
    for (const statement of statements) {
      try {
        if (statement.trim().length > 0) {
          await pool.query(statement + ';');
        }
      } catch (error) {
        // Si es un error de "ya existe", ignorarlo
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`⚠️  Tabla/objeto ya existe, continuando...`);
        } else {
          console.error(`❌ Error ejecutando statement:`, error.message);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }

    console.log('✅ Migración completada exitosamente');

    // Verificar tablas creadas
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n📊 Tablas creadas:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
