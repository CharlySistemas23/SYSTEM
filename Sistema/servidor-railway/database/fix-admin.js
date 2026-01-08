// Script de Diagnóstico y Reparación del Usuario Admin
// Ejecutar desde Railway Console: node database/fix-admin.js

import { queryOne, query, insert, update } from '../config/database.js';
import bcrypt from 'bcryptjs';

async function fixAdmin() {
    try {
        console.log('🔍 DIAGNÓSTICO DEL USUARIO ADMIN');
        console.log('═══════════════════════════════════════════');
        console.log('');

        // 1. Verificar usuario admin (solo para logging, no retornar si no existe)
        console.log('1️⃣  Verificando usuario admin...');
        let adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
        
        if (adminUser) {
            console.log('✅ Usuario admin existe:');
            console.log(`   - ID: ${adminUser.id}`);
            console.log(`   - Username: ${adminUser.username}`);
            console.log(`   - Employee ID: ${adminUser.employee_id || '(ninguno)'}`);
            console.log(`   - Branch ID: ${adminUser.branch_id || '(ninguno)'}`);
            console.log(`   - Role: ${adminUser.role}`);
            console.log(`   - Active: ${adminUser.active}`);
            console.log(`   - Tiene PIN hash: ${adminUser.pin_hash ? 'Sí' : '❌ NO'}`);
            console.log(`   - Tiene Password hash: ${adminUser.password_hash ? 'Sí' : '❌ NO'}`);
        } else {
            console.log('⚠️  Usuario admin NO existe. Se creará después de verificar sucursal y empleado.');
        }
        console.log('');

        // 2. Verificar sucursal (necesaria antes de crear usuario)
        console.log('2️⃣  Verificando sucursal...');
        let branch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
        
        if (!branch) {
            console.log('⚠️  No hay sucursales. Creando sucursales por defecto...');
            const branches = [
                { id: 'branch_joyeria1', name: 'JOYERIA 1', address: '' },
                { id: 'branch_malecon', name: 'MALECON', address: '' },
                { id: 'branch_sansebastian', name: 'SAN SEBASTIAN', address: '' },
                { id: 'branch_sayulita', name: 'SAYULITA', address: '' }
            ];

            for (const branchData of branches) {
                try {
                    branch = await insert('catalog_branches', {
                        id: branchData.id,
                        name: branchData.name,
                        address: branchData.address,
                        phone: '',
                        email: '',
                        active: true
                    });
                    console.log(`   ✅ Sucursal creada: ${branch.name}`);
                    break; // Usar la primera como default
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error(`   ❌ Error creando sucursal ${branchData.name}:`, error.message);
                    }
                }
            }
            
            if (!branch) {
                console.log('❌ No se pudo crear ninguna sucursal');
                return;
            }
        } else {
            console.log(`✅ Sucursal encontrada: ${branch.name} (${branch.id})`);
        }
        console.log('');

        // 3. Verificar empleado admin
        console.log('3️⃣  Verificando empleado admin...');
        const employeeId = adminUser?.employee_id || 'emp_admin_001';
        let employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
        
        if (!employee) {
            console.log('⚠️  Empleado admin NO existe. Creando...');
            try {
                employee = await insert('employees', {
                    id: employeeId,
                    name: 'Administrador',
                    role: 'admin',
                    branch_id: branch.id,
                    barcode: 'ADMIN001',
                    active: true
                });
                console.log(`   ✅ Empleado admin creado: ${employee.name}`);
            } catch (error) {
                console.error(`   ❌ Error creando empleado:`, error.message);
                return;
            }
        } else {
            console.log(`✅ Empleado admin existe: ${employee.name}`);
            console.log(`   - ID: ${employee.id}`);
            console.log(`   - Active: ${employee.active}`);
            console.log(`   - Branch ID: ${employee.branch_id || '(ninguno)'}`);
            
            if (!employee.active) {
                console.log('⚠️  Empleado está INACTIVO. Activando...');
                await update('employees', employeeId, { active: true });
                console.log('   ✅ Empleado activado');
            }
            
            if (employee.branch_id !== branch.id) {
                console.log(`⚠️  Empleado tiene branch_id diferente. Actualizando a ${branch.id}...`);
                await update('employees', employeeId, { branch_id: branch.id });
                console.log('   ✅ Branch ID actualizado');
            }
        }
        console.log('');

        // 4. Crear o actualizar usuario admin
        console.log('4️⃣  Verificando y corrigiendo usuario admin...');
        
        // Generar hashes de credenciales
        const pinHash = await bcrypt.hash('1234', 10);
        const passwordHash = await bcrypt.hash('admin123', 10);
        
        if (!adminUser) {
            // CREAR usuario admin si no existe
            console.log('⚠️  Usuario admin NO existe. Creando...');
            try {
                const userId = 'user_admin_001';
                adminUser = await insert('users', {
                    id: userId,
                    username: 'admin',
                    password_hash: passwordHash,
                    pin_hash: pinHash,
                    employee_id: employeeId,
                    branch_id: branch.id,
                    role: 'admin',
                    permissions: ['all'],
                    active: true
                });
                console.log('✅ Usuario admin creado exitosamente');
                
                // VERIFICAR que el usuario realmente existe después de crearlo
                const verifyUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
                if (!verifyUser) {
                    throw new Error('Usuario admin no se pudo crear - verificación falló después de insert');
                }
                
                adminUser = verifyUser;
            } catch (error) {
                if (error.code === '23505') {
                    // Usuario ya existe (race condition), obtenerlo
                    console.log('⚠️  Usuario ya existe (posible condición de carrera). Obteniendo...');
                    adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
                    if (!adminUser) {
                        throw new Error('Usuario admin debería existir pero no se encontró después de error de duplicado');
                    }
                } else {
                    console.error('❌ Error creando usuario admin:', error.message);
                    throw error;
                }
            }
        } else {
            // ACTUALIZAR usuario admin si existe
            let needsUpdate = false;
            const updates = {};
            
            if (!adminUser.pin_hash) {
                console.log('⚠️  PIN hash faltante. Generando PIN: 1234...');
                updates.pin_hash = pinHash;
                needsUpdate = true;
            }
            
            if (!adminUser.password_hash) {
                console.log('⚠️  Password hash faltante. Generando (no se usa en login)...');
                updates.password_hash = passwordHash;
                needsUpdate = true;
            }
            
            // Actualizar employee_id y branch_id si no están correctos
            if (adminUser.employee_id !== employeeId) {
                console.log(`⚠️  Employee ID incorrecto. Actualizando a ${employeeId}...`);
                updates.employee_id = employeeId;
                needsUpdate = true;
            }
            
            if (adminUser.branch_id !== branch.id) {
                console.log(`⚠️  Branch ID incorrecto. Actualizando a ${branch.id}...`);
                updates.branch_id = branch.id;
                needsUpdate = true;
            }
            
            if (adminUser.role !== 'admin') {
                console.log('⚠️  Role incorrecto. Actualizando a admin...');
                updates.role = 'admin';
                needsUpdate = true;
            }
            
            if (!adminUser.active) {
                console.log('⚠️  Usuario está inactivo. Activando...');
                updates.active = true;
                needsUpdate = true;
            }
            
             // Asegurar que el PIN hash sea correcto (por si acaso)
             if (adminUser.pin_hash) {
                 // Verificar que el PIN hash funcione con '1234'
                 const pinValid = await bcrypt.compare('1234', adminUser.pin_hash);
                 
                 if (!pinValid) {
                     console.log('⚠️  PIN hash no coincide con "1234". Regenerando...');
                     updates.pin_hash = pinHash;
                     needsUpdate = true;
                 }
             }
            
            if (needsUpdate) {
                console.log('💾 Aplicando correcciones...');
                await update('users', adminUser.id, updates);
                console.log('✅ Correcciones aplicadas');
                // Recargar usuario actualizado
                adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
            } else {
                console.log('✅ Todas las credenciales están correctas');
            }
        }
        console.log('');

        // 5. Verificación final
        console.log('5️⃣  Verificación final...');
        adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
        employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
        
        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('✅ DIAGNÓSTICO COMPLETADO');
        console.log('═══════════════════════════════════════════');
        console.log('');
        console.log('📋 CREDENCIALES PARA LOGIN:');
        console.log('');
        console.log('   1️⃣  CÓDIGO DE EMPRESA (primera pantalla):');
        console.log('      Código: OPAL2024');
        console.log('');
        console.log('   2️⃣  USUARIO Y PIN (segunda pantalla):');
        console.log('      Usuario: admin');
        console.log('      PIN: 1234');
        console.log('');
        console.log('📊 ESTADO FINAL:');
        console.log(`   ✅ Usuario existe: ${adminUser ? 'Sí' : 'No'}`);
        console.log(`   ✅ Usuario activo: ${adminUser?.active ? 'Sí' : 'No'}`);
        console.log(`   ✅ Empleado asociado: ${employee?.name || 'No'}`);
        console.log(`   ✅ Empleado activo: ${employee?.active ? 'Sí' : 'No'}`);
        console.log(`   ✅ Sucursal: ${branch?.name || 'No'}`);
        console.log(`   ✅ Tiene PIN hash: ${adminUser?.pin_hash ? 'Sí' : 'No'}`);
        console.log('');
        console.log('💡 PASOS PARA LOGIN:');
        console.log('   1. Ingresa el código de empresa: OPAL2024');
        console.log('   2. Ingresa el usuario: admin');
        console.log('   3. Ingresa el PIN: 1234');
        console.log('═══════════════════════════════════════════');
        console.log('');
        
    } catch (error) {
        console.error('');
        console.error('❌ ERROR EN DIAGNÓSTICO:');
        console.error('═══════════════════════════════════════════');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        console.error('═══════════════════════════════════════════');
        console.error('');
        throw error;
    }
}

// Ejecutar si se llama directamente
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && process.argv[1].endsWith('fix-admin.js');

if (isMainModule) {
    import('../config/database.js').then(async ({ initDatabase }) => {
        await initDatabase();
        await fixAdmin();
        process.exit(0);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

export { fixAdmin };

