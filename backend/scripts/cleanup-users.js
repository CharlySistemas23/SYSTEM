import { query } from '../config/database.js';

async function cleanupUsers() {
  try {
    console.log('🧹 Limpiando usuarios (excepto master_admin)...\n');
    
    // Obtener todos los usuarios
    const allUsers = await query('SELECT id, username, role FROM users ORDER BY username');
    
    console.log(`📊 Total de usuarios encontrados: ${allUsers.rows.length}\n`);
    
    if (allUsers.rows.length === 0) {
      console.log('⚠️ No hay usuarios en la base de datos.');
      return;
    }
    
    // Identificar usuarios a eliminar (todos excepto master_admin)
    const usersToDelete = allUsers.rows.filter(user => user.role !== 'master_admin');
    
    if (usersToDelete.length === 0) {
      console.log('✅ No hay usuarios para eliminar. Solo existe master_admin.');
      return;
    }
    
    console.log('📋 Usuarios a eliminar:');
    usersToDelete.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.role}) - ID: ${user.id}`);
    });
    console.log('');
    
    // Eliminar usuarios
    let deletedCount = 0;
    for (const user of usersToDelete) {
      try {
        await query('DELETE FROM users WHERE id = $1', [user.id]);
        console.log(`✅ Usuario eliminado: ${user.username}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Error eliminando usuario ${user.username}:`, error.message);
      }
    }
    
    console.log(`\n✅ Proceso completado: ${deletedCount} usuario(s) eliminado(s)`);
    
    // Mostrar usuarios restantes
    const remainingUsers = await query('SELECT id, username, role FROM users ORDER BY username');
    console.log(`\n📊 Usuarios restantes: ${remainingUsers.rows.length}`);
    remainingUsers.rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.role})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error limpiando usuarios:', error);
    process.exit(1);
  }
}

cleanupUsers();