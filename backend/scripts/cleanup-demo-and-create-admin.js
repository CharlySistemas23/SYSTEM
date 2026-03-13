// Script para limpiar usuarios demo y crear master_admin
// Ejecutar: node backend/scripts/cleanup-demo-and-create-admin.js

import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function cleanupAndCreateAdmin() {
  try {
    console.log('🧹 Limpiando usuarios demo y creando master_admin...\n');

    // 1. Listar todos los usuarios actuales
    console.log('1️⃣ Listando usuarios actuales...');
    const allUsers = await query(`
      SELECT id, username, role, active 
      FROM users 
      ORDER BY created_at
    `);
    
    console.log(`   Encontrados ${allUsers.rows.length} usuario(s):`);
    allUsers.rows.forEach(user => {
      console.log(`   - ${user.username} (${user.role}) - ${user.active ? 'ACTIVO' : 'INACTIVO'}`);
    });

    // 2. Eliminar TODOS los usuarios (incluyendo demo)
    console.log('\n2️⃣ Eliminando todos los usuarios...');
    const deleteResult = await query('DELETE FROM users RETURNING id, username, role');
    console.log(`   ✅ ${deleteResult.rows.length} usuario(s) eliminado(s)`);

    // 3. Verificar/crear empleado ADMIN (master_admin)
    console.log('\n3️⃣ Verificando empleado ADMIN...');
    let employeeResult = await query(`
      SELECT id FROM employees 
      WHERE code = 'ADMIN' OR role = 'master_admin' 
      LIMIT 1
    `);
    
    let employeeId;
    if (employeeResult.rows.length === 0) {
      console.log('   Creando empleado Administrador Maestro...');
      await query(`
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
      employeeId = '00000000-0000-0000-0000-000000000002';
      console.log('   ✅ Empleado creado');
    } else {
      employeeId = employeeResult.rows[0].id;
      // Asegurar que el empleado sea master_admin
      await query(`
        UPDATE employees 
        SET role = 'master_admin',
            branch_id = NULL,
            active = true
        WHERE id = $1
      `, [employeeId]);
      console.log('   ✅ Empleado verificado y actualizado');
    }

    // 4. Crear usuario master_admin
    console.log('\n4️⃣ Creando usuario master_admin...');
    const passwordHash = await bcrypt.hash('1234', 10);
    
    await query(`
      INSERT INTO users (id, username, password_hash, employee_id, role, active)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'master_admin',
        $1,
        $2,
        'master_admin',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        username = 'master_admin',
        password_hash = EXCLUDED.password_hash,
        employee_id = EXCLUDED.employee_id,
        role = 'master_admin',
        active = true
    `, [passwordHash, employeeId]);

    console.log('   ✅ Usuario master_admin creado/actualizado');

    // 5. Verificar resultado
    console.log('\n5️⃣ Verificando resultado...');
    const finalUsers = await query(`
      SELECT u.id, u.username, u.role, u.active, e.name as employee_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.created_at
    `);
    
    console.log(`\n✅ Proceso completado. Usuarios en el sistema: ${finalUsers.rows.length}`);
    finalUsers.rows.forEach(user => {
      console.log(`   - ${user.username} (${user.role}) - ${user.employee_name || 'Sin empleado'}`);
    });

    console.log('\n📋 Credenciales de acceso:');
    console.log('   Username: master_admin');
    console.log('   PIN: 1234');
    console.log('\n⚠️  IMPORTANTE: Cambia el PIN después del primer inicio de sesión');

  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  }
}

cleanupAndCreateAdmin()
  .then(() => {
    console.log('\n🎉 Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
