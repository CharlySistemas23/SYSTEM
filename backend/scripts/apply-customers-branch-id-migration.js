// Script para aplicar migración de branch_id a customers
// Ejecutar: node scripts/apply-customers-branch-id-migration.js

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
    console.log('🔄 Verificando si branch_id existe en customers...');
    
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'customers' 
        AND column_name = 'branch_id'
      );
    `);

    if (checkResult.rows[0].exists) {
      console.log('✅ La columna branch_id ya existe en customers');
      return;
    }

    console.log('🔄 Agregando branch_id a customers...');
    
    await pool.query(`
      ALTER TABLE customers 
      ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
    `);
    
    console.log('✅ Migración completada exitosamente');
    console.log('✅ Columna branch_id agregada a customers');
    console.log('✅ Índice idx_customers_branch_id creado');
  } catch (error) {
    if (error.code === '42701') {
      console.log('ℹ️  La columna branch_id ya existe');
    } else {
      console.error('❌ Error aplicando migración:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
