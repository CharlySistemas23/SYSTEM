import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function cleanupUsers() {
  try {
    console.log('🧹 Eliminando todos los usuarios...');
    await pool.query('DELETE FROM users;');
    
    console.log('✅ Asegurando empleado ADMIN...');
    await pool.query(`
      INSERT INTO employees (id, code, name, role, branch_id, active)
      VALUES (
        '00000000-0000-0000-0000-000000000002',
        'ADMIN',
        'Administrador Maestro',
        'master_admin',
        NULL,
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        role = 'master_admin',
        branch_id = NULL,
        active = true
    `);
    
    console.log('✅ Creando usuario master_admin...');
    await pool.query(`
      INSERT INTO users (id, username, password_hash, employee_id, role, active)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'master_admin',
        '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        '00000000-0000-0000-0000-000000000002',
        'master_admin',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        username = 'master_admin',
        password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        employee_id = '00000000-0000-0000-0000-000000000002',
        role = 'master_admin',
        active = true
    `);
    
    const result = await pool.query('SELECT id, username, role, active FROM users;');
    console.log('\n✅ Usuarios restantes:');
    result.rows.forEach(user => {
      console.log(`   - ${user.username} (${user.role})`);
    });
    
    console.log('\n✅ Proceso completado exitosamente!');
    console.log('📋 Credenciales:');
    console.log('   Usuario: master_admin');
    console.log('   PIN: 1234');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanupUsers();
