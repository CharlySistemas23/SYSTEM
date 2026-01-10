// Inicialización del esquema de base de datos
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function initialize() {
  try {
    console.log('📊 Inicializando esquema de base de datos...');
    
    // Leer archivo SQL
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Ejecutar SQL (dividido por ;)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          await db.query(statement);
        } catch (error) {
          // Ignorar errores de "ya existe" para tablas e índices
          if (!error.message.includes('already exists') && 
              !error.message.includes('duplicate')) {
            console.warn('⚠️ Advertencia al ejecutar statement:', error.message);
          }
        }
      }
    }
    
    console.log('✅ Esquema de base de datos inicializado correctamente');
    
    // Verificar si hay sucursales, si no, crear una por defecto
    const branchesResult = await db.query('SELECT COUNT(*) as count FROM catalog_branches');
    if (parseInt(branchesResult.rows[0].count) === 0) {
      console.log('📝 Creando sucursal por defecto...');
      await db.query(
        `INSERT INTO catalog_branches (id, name, active) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO NOTHING`,
        ['branch1', 'Tienda Principal', true]
      );
      console.log('✅ Sucursal por defecto creada');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error inicializando esquema:', error);
    throw error;
  }
}

module.exports = { initialize };

