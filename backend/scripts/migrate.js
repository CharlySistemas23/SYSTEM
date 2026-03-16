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

    // Ejecutar migración
    await pool.query(schemaSQL);

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

    // Verificar usuario maestro
    const userResult = await pool.query(
      "SELECT username, role FROM users WHERE username = 'master_admin'"
    );

    if (userResult.rows.length > 0) {
      console.log('\n👤 Usuario maestro creado:');
      console.log(`  - Username: master_admin`);
      console.log(`  - Password: admin123 (⚠️ CAMBIAR EN PRODUCCIÓN)`);
      console.log(`  - Role: ${userResult.rows[0].role}`);
    }

  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
