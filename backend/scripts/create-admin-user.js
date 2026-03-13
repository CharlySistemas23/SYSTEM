// Script para crear usuario administrador inicial
import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function createAdminUser() {
  try {
    console.log('🔧 Creando usuario administrador inicial...\n');

    // 1. Crear sucursal principal si no existe
    console.log('1️⃣ Verificando sucursal principal...');
    const branchCheck = await query(
      `SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`
    );

    let branchId;
    if (branchCheck.rows.length === 0) {
      console.log('   Creando sucursal principal...');
      const branchResult = await query(
        `INSERT INTO branches (id, name, code, address, phone, email, active)
         VALUES (
           '00000000-0000-0000-0000-000000000001',
           'Sucursal Principal',
           'MAIN',
           'Dirección principal',
           '1234567890',
           'admin@opalco.com',
           true
         )
         RETURNING id`,
        []
      );
      branchId = branchResult.rows[0].id;
      console.log('   ✅ Sucursal principal creada');
    } else {
      branchId = branchCheck.rows[0].id;
      console.log('   ✅ Sucursal principal ya existe');
    }

    // 2. Crear usuario administrador si no existe
    console.log('\n2️⃣ Verificando usuario administrador...');
    const userCheck = await query(
      `SELECT id FROM users WHERE username = 'master_admin' LIMIT 1`
    );

    if (userCheck.rows.length === 0) {
      console.log('   Creando empleado administrador...');
      
      // Crear empleado primero (master_admin NO debe tener branch_id para acceder a todas las sucursales)
      const employeeResult = await query(
        `INSERT INTO employees (id, code, name, role, branch_id, active)
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
         RETURNING id`
      );
      
      const employeeId = employeeResult.rows.length > 0 
        ? employeeResult.rows[0].id 
        : '00000000-0000-0000-0000-000000000002';
      
      console.log('   Creando usuario administrador...');
      
      // PIN por defecto: 1234
      // Hash bcrypt de "1234" (compatible con auth.js)
      const passwordHash = await bcrypt.hash('1234', 10);
      
      await query(
        `INSERT INTO users (id, username, password_hash, employee_id, role, active)
         VALUES (
           '00000000-0000-0000-0000-000000000001',
           'master_admin',
           $1,
           $2,
           'master_admin',
           true
         )`,
        [passwordHash, employeeId]
      );
      
      console.log('   ✅ Usuario administrador creado');
      console.log('\n📋 Credenciales de acceso:');
      console.log('   Username: master_admin');
      console.log('   PIN: 1234');
      console.log('\n⚠️  IMPORTANTE: Cambia el PIN después del primer inicio de sesión');
    } else {
      console.log('   ✅ Usuario administrador ya existe');
    }

    console.log('\n✅ Proceso completado exitosamente');
  } catch (error) {
    console.error('❌ Error creando usuario administrador:', error);
    process.exit(1);
  }
}

createAdminUser()
  .then(() => {
    console.log('\n🎉 Usuario administrador listo para usar');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
