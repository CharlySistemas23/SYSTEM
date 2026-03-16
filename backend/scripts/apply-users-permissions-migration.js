// Migración: añadir columna permissions a users (solo ADD COLUMN, no elimina datos)
// Ejecutar: node scripts/apply-users-permissions-migration.js

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Verificando si la columna permissions existe en users...');

    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'permissions'
      );
    `);

    if (checkResult.rows[0].exists) {
      console.log('La columna permissions ya existe en users.');
      return;
    }

    console.log('Añadiendo columna permissions (JSONB) a users...');
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN permissions JSONB DEFAULT NULL;
    `);
    console.log('Migración completada. Columna permissions añadida.');
  } catch (error) {
    if (error.code === '42701') {
      console.log('La columna permissions ya existe.');
    } else {
      console.error('Error aplicando migración:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

applyMigration();
