// Script para verificar y crear usuario admin correcto
// Ejecutar: node scripts/verify-admin-user.js

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function verifyAndCreateAdmin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Verificando usuarios existentes...\n');
    
    // Verificar usuarios existentes
    const usersResult = await pool.query(`
      SELECT u.id, u.username, u.role, u.active, e.code as employee_code, e.role as employee_role
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.username
    `);
    
    console.log(`📋 Usuarios encontrados en la base de datos: ${usersResult.rows.length}`);
    usersResult.rows.forEach(user => {
      console.log(`   - Username: ${user.username}, Rol: ${user.role || user.employee_role}, Activo: ${user.active}`);
    });
    console.log('');
    
    // Verificar sucursal MAIN
    let branchResult = await pool.query(`SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`);
    let branchId;
    
    if (branchResult.rows.length === 0) {
      console.log('🏢 Creando sucursal MAIN...');
      await pool.query(`
        INSERT INTO branches (id, name, code, address, phone, email, active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Sucursal Principal',
          'MAIN',
          'Dirección principal',
          '1234567890',
          'admin@opalco.com',
          true
        )
        ON CONFLICT (id) DO NOTHING
      `);
      branchResult = await pool.query(`SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`);
    }
    
    branchId = branchResult.rows[0]?.id;
    console.log(`✅ Sucursal MAIN: ${branchId || 'No encontrada'}\n`);
    
    // Verificar/crear empleado ADMIN
    let employeeResult = await pool.query(`SELECT id, code, role FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    let employeeId;
    
    if (employeeResult.rows.length === 0) {
      console.log('👤 Creando empleado ADMIN...');
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
          branch_id = NULL
      `);
      employeeResult = await pool.query(`SELECT id, code, role FROM employees WHERE code = 'ADMIN' LIMIT 1`);
    } else {
      // Asegurar que el empleado master_admin tenga branch_id NULL
      await pool.query(`
        UPDATE employees 
        SET role = 'master_admin', branch_id = NULL 
        WHERE code = 'ADMIN' AND role = 'master_admin'
      `);
    }
    
    employeeId = employeeResult.rows[0]?.id;
    console.log(`✅ Empleado ADMIN: ${employeeId || 'No encontrado'}, Rol: ${employeeResult.rows[0]?.role || 'N/A'}\n`);
    
    // Verificar si existe usuario admin
    const adminCheck = await pool.query(`SELECT id, username, role, active FROM users WHERE username = 'master_admin' LIMIT 1`);
    
    if (adminCheck.rows.length === 0) {
      console.log('🔨 Creando usuario master_admin...');
      const passwordHash = await bcrypt.hash('1234', 10);
      
      await pool.query(`
        INSERT INTO users (id, username, password_hash, employee_id, role, active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'master_admin',
          $1,
          $2,
          'master_admin',
          true
        )
      `, [passwordHash, employeeId]);
      
      console.log('✅ Usuario master_admin creado exitosamente\n');
    } else {
      const adminUser = adminCheck.rows[0];
      console.log(`ℹ️  Usuario master_admin ya existe:`);
      console.log(`   - ID: ${adminUser.id}`);
      console.log(`   - Username: ${adminUser.username}`);
      console.log(`   - Rol: ${adminUser.role}`);
      console.log(`   - Activo: ${adminUser.active}\n`);
      
      // Actualizar si es necesario
      if (adminUser.role !== 'master_admin' || !adminUser.active) {
        console.log('🔄 Actualizando usuario master_admin...');
        await pool.query(`
          UPDATE users 
          SET role = 'master_admin', 
              active = true,
              employee_id = $1
          WHERE username = 'master_admin'
        `, [employeeId]);
        console.log('✅ Usuario master_admin actualizado\n');
      }
      
      // Resetear password a 1234
      console.log('🔄 Reseteando PIN a "1234"...');
      const passwordHash = await bcrypt.hash('1234', 10);
      await pool.query(`
        UPDATE users 
        SET password_hash = $1
        WHERE username = 'master_admin'
      `, [passwordHash]);
      console.log('✅ PIN reseteado a "1234"\n');
    }
    
    console.log('═══════════════════════════════════════');
    console.log('📋 CREDENCIALES PARA INICIAR SESIÓN:');
    console.log('═══════════════════════════════════════');
    console.log('   Username: master_admin');
    console.log('   PIN: 1234');
    console.log('═══════════════════════════════════════\n');
    
    // Verificar que el usuario puede hacer login
    const finalCheck = await pool.query(`
      SELECT u.id, u.username, u.role, u.active, e.role as employee_role
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      WHERE u.username = 'master_admin' AND u.active = true
    `);
    
    if (finalCheck.rows.length > 0) {
      const user = finalCheck.rows[0];
      const effectiveRole = user.role || user.employee_role;
      console.log('✅ Verificación final:');
      console.log(`   - Usuario existe y está activo`);
      console.log(`   - Rol efectivo: ${effectiveRole}`);
      console.log(`   - ¿Es master_admin?: ${effectiveRole === 'master_admin' ? 'Sí ✅' : 'No ❌'}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyAndCreateAdmin()
  .then(() => {
    console.log('✅ Proceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
