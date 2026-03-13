import { query } from '../config/database.js';

async function checkBranches() {
  try {
    console.log('🔍 Verificando sucursales en la base de datos...\n');
    
    const result = await query('SELECT id, code, name, active, created_at FROM branches ORDER BY name');
    
    console.log(`📊 Total de sucursales encontradas: ${result.rows.length}\n`);
    
    if (result.rows.length === 0) {
      console.log('⚠️ No hay sucursales en la base de datos.');
      return;
    }
    
    console.log('📋 Lista de sucursales:');
    console.log('─'.repeat(80));
    result.rows.forEach((branch, index) => {
      console.log(`${index + 1}. ${branch.name} (${branch.code})`);
      console.log(`   ID: ${branch.id}`);
      console.log(`   Estado: ${branch.active ? '✅ Activa' : '❌ Inactiva'}`);
      console.log(`   Creada: ${branch.created_at}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error verificando sucursales:', error);
    process.exit(1);
  }
}

checkBranches();