// Script de Inicialización de Datos (Seed)
// Crea datos iniciales: sucursal, empleado admin, usuario admin
import { query, queryOne, insert } from '../config/database.js';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
    try {
        console.log('🌱 Iniciando seed de base de datos...');

        // Verificar si ya existe el usuario admin
        const existingAdmin = await queryOne("SELECT * FROM users WHERE username = 'admin'");
        
        let branchId;
        let employeeId;
        let userId = 'user_admin_001';

        // Si ya existe el usuario admin, verificar que tenga todo correcto
        if (existingAdmin) {
            console.log('✅ Usuario admin ya existe. Verificando configuración...');
            
            // Verificar que tenga PIN hash (por si se creó antes sin PIN)
            if (!existingAdmin.pin_hash) {
                console.log('⚠️  Usuario admin existe pero no tiene PIN. Actualizando...');
                const pinHash = await bcrypt.hash('1234', 10);
                const { update } = await import('../config/database.js');
                await update('users', existingAdmin.id, { pin_hash: pinHash });
                console.log('✅ PIN agregado al usuario admin');
            }
            
            // Verificar que tenga password hash
            if (!existingAdmin.password_hash) {
                console.log('⚠️  Usuario admin existe pero no tiene password. Actualizando...');
                const passwordHash = await bcrypt.hash('admin123', 10);
                const { update } = await import('../config/database.js');
                await update('users', existingAdmin.id, { password_hash: passwordHash });
                console.log('✅ Password agregado al usuario admin');
            }
            
            console.log('✅ Usuario admin verificado correctamente');
            return;
        }

        console.log('📦 Creando datos iniciales...');

        // 1. Verificar si existe alguna sucursal, si no, crear las 4 sucursales
        let existingBranch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
        
        if (!existingBranch) {
            console.log('📦 No hay sucursales. Creando sucursales iniciales...');
            const branches = [
                { id: 'branch_joyeria1', name: 'JOYERIA 1', address: '' },
                { id: 'branch_malecon', name: 'MALECON', address: '' },
                { id: 'branch_sansebastian', name: 'SAN SEBASTIAN', address: '' },
                { id: 'branch_sayulita', name: 'SAYULITA', address: '' }
            ];

            for (const branchData of branches) {
                try {
                    const branch = await insert('catalog_branches', {
                        id: branchData.id,
                        name: branchData.name,
                        address: branchData.address,
                        phone: '',
                        email: '',
                        active: true
                    });
                    console.log('✅ Sucursal creada:', branch.name);
                    if (!existingBranch) {
                        existingBranch = branch; // Usar la primera como default
                    }
                } catch (error) {
                    if (error.code !== '23505') { // Duplicate key error
                        console.error('Error creando sucursal:', error.message);
                    }
                }
            }
        } else {
            console.log('✅ Ya existen sucursales. Usando la primera encontrada:', existingBranch.name);
        }

        // Usar la primera sucursal disponible
        branchId = existingBranch.id;

        // 2. Verificar o crear empleado admin
        employeeId = 'emp_admin_001';
        let employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
        
        if (!employee) {
            try {
                employee = await insert('employees', {
                    id: employeeId,
                    name: 'Administrador',
                    role: 'admin',
                    branch_id: branchId,
                    phone: '',
                    email: '',
                    barcode: 'ADMIN001',
                    active: true
                });
                console.log('✅ Empleado admin creado:', employee.name);
            } catch (error) {
                if (error.code === '23505') { // Duplicate key
                    employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
                    console.log('✅ Empleado admin ya existe');
                } else {
                    throw error;
                }
            }
        } else {
            console.log('✅ Empleado admin ya existe');
        }

        // 3. Crear usuario admin
        // Password por defecto: "admin123"
        const passwordHash = await bcrypt.hash('admin123', 10);
        // PIN por defecto: "1234"
        const pinHash = await bcrypt.hash('1234', 10);

        try {
            const user = await insert('users', {
                id: userId,
                username: 'admin',
                password_hash: passwordHash,
                pin_hash: pinHash,
                employee_id: employeeId,
                branch_id: branchId,
                role: 'admin',
                permissions: ['all'],
                active: true
            });
            console.log('✅ Usuario admin creado:', user.username);
        } catch (error) {
            if (error.code === '23505') { // Duplicate key - usuario ya existe
                console.log('⚠️  Usuario admin ya existe. Actualizando credenciales...');
                const { update } = await import('../config/database.js');
                const existingUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
                await update('users', existingUser.id, {
                    password_hash: passwordHash,
                    pin_hash: pinHash,
                    employee_id: employeeId,
                    branch_id: branchId,
                    role: 'admin',
                    permissions: ['all'],
                    active: true
                });
                console.log('✅ Credenciales del usuario admin actualizadas');
            } else {
                throw error;
            }
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ SEED COMPLETADO EXITOSAMENTE');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('📋 CREDENCIALES POR DEFECTO:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   PIN: 1234');
        console.log('');
        console.log('⚠️  IMPORTANTE: Cambia estas credenciales después del primer login');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');

        // Obtener el usuario creado/actualizado para retornarlo
        const finalUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
        const finalEmployee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
        const finalBranch = await queryOne('SELECT * FROM catalog_branches WHERE id = $1', [branchId]);

        return {
            branch: finalBranch,
            employee: finalEmployee,
            user: finalUser
        };
    } catch (error) {
        console.error('❌ Error en seed:', error);
        throw error;
    }
}

// Ejecutar si se llama directamente
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && process.argv[1].endsWith('seed.js');

if (isMainModule) {
    import('../config/database.js').then(async ({ initDatabase }) => {
        await initDatabase();
        await seedDatabase();
        process.exit(0);
    }).catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

