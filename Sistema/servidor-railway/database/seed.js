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
            
            // Verificar o crear sucursal si no existe
            let branch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
            if (!branch) {
                console.log('📦 No hay sucursales. Creando sucursales iniciales...');
                const branches = [
                    { id: 'branch1', name: 'L Vallarta', address: '' },
                    { id: 'branch2', name: 'Malecón', address: '' },
                    { id: 'branch3', name: 'San Sebastián', address: '' },
                    { id: 'branch4', name: 'Sayulita', address: '' }
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
                        console.log('✅ Sucursal creada:', branch.name);
                    } catch (error) {
                        if (error.code !== '23505') {
                            console.error('Error creando sucursal:', error.message);
                        }
                    }
                }
                branch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
            }
            
            const branchId = branch ? branch.id : existingAdmin.branch_id;
            
            // Verificar o crear empleado admin si no existe o está inactivo
            employeeId = existingAdmin.employee_id || 'emp_admin_001';
            let employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
            
            if (!employee || !employee.active) {
                console.log('⚠️  Empleado admin no existe o está inactivo. Creando/activando...');
                const { update } = await import('../config/database.js');
                
                if (employee && !employee.active) {
                    // Activar empleado existente
                    await update('employees', employeeId, {
                        active: true,
                        branch_id: branchId
                    });
                    console.log('✅ Empleado admin reactivado');
                } else {
                    // Crear nuevo empleado admin
                    try {
                        employee = await insert('employees', {
                            id: employeeId,
                            name: 'Administrador',
                            role: 'admin',
                            branch_id: branchId,
                            barcode: 'ADMIN001',
                            active: true
                        });
                        console.log('✅ Empleado admin creado:', employee.name);
                    } catch (error) {
                        if (error.code === '23505') {
                            // Ya existe, solo activarlo
                            const { update } = await import('../config/database.js');
                            await update('employees', employeeId, {
                                active: true,
                                branch_id: branchId
                            });
                            employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employeeId]);
                            console.log('✅ Empleado admin activado');
                        } else {
                            throw error;
                        }
                    }
                }
            } else {
                console.log('✅ Empleado admin ya existe y está activo');
            }
            
            // Verificar que tenga PIN hash (por si se creó antes sin PIN)
            if (!existingAdmin.pin_hash) {
                console.log('⚠️  Usuario admin existe pero no tiene PIN. Actualizando...');
                const pinHash = await bcrypt.hash('1234', 10);
                const { update } = await import('../config/database.js');
                await update('users', existingAdmin.id, { pin_hash: pinHash });
                console.log('✅ PIN agregado al usuario admin');
            }
            
            // Verificar que tenga password hash (por compatibilidad, aunque no se usa en login normal)
            if (!existingAdmin.password_hash) {
                console.log('⚠️  Usuario admin existe pero no tiene password_hash. Actualizando (no se usa en login)...');
                const passwordHash = await bcrypt.hash('admin123', 10);
                const { update } = await import('../config/database.js');
                await update('users', existingAdmin.id, { password_hash: passwordHash });
                console.log('✅ Password hash agregado al usuario admin');
            }
            
            // Actualizar usuario admin para asegurar que tenga employee_id y branch_id correctos
            const { update } = await import('../config/database.js');
            await update('users', existingAdmin.id, {
                employee_id: employeeId,
                branch_id: branchId,
                role: 'admin',
                permissions: JSON.stringify(['all']),
                active: true
            });
            console.log('✅ Usuario admin actualizado con employee_id y branch_id correctos');
            
            // Verificar y crear payment_methods y commission_rules si no existen
            console.log('📦 Verificando métodos de pago y reglas de comisión...');
            const existingPaymentMethods = await query('SELECT * FROM payment_methods LIMIT 1');
            if (existingPaymentMethods.length === 0) {
                console.log('📦 Creando métodos de pago iniciales...');
                const paymentMethods = [
                    { id: 'pm1', name: 'Efectivo USD', code: 'CASH_USD', active: true, order_index: 1 },
                    { id: 'pm2', name: 'Efectivo MXN', code: 'CASH_MXN', active: true, order_index: 2 },
                    { id: 'pm3', name: 'Efectivo EUR', code: 'CASH_EUR', active: true, order_index: 3 },
                    { id: 'pm4', name: 'Efectivo CAD', code: 'CASH_CAD', active: true, order_index: 4 },
                    { id: 'pm5', name: 'TPV Visa/MC', code: 'TPV_VISA', active: true, order_index: 5 },
                    { id: 'pm6', name: 'TPV Amex', code: 'TPV_AMEX', active: true, order_index: 6 }
                ];
                for (const pm of paymentMethods) {
                    try {
                        await insert('payment_methods', { ...pm, requires_bank: false, requires_type: false });
                        console.log('✅ Método de pago creado:', pm.name);
                    } catch (error) {
                        if (error.code !== '23505') console.error('Error creando método de pago:', error.message);
                    }
                }
            }
            
            const existingCommissionRules = await query('SELECT * FROM commission_rules LIMIT 1');
            if (existingCommissionRules.length === 0) {
                console.log('📦 Creando reglas de comisión por defecto...');
                const commissionRules = [
                    { id: 'seller_default', name: 'Comisión Vendedor Default', type: 'percentage', value: 5.0, entity_type: 'seller', entity_id: null, branch_id: null, active: true, conditions: null },
                    { id: 'guide_default', name: 'Comisión Guía Default', type: 'percentage', value: 18.0, entity_type: 'guide', entity_id: null, branch_id: null, active: true, conditions: null }
                ];
                for (const rule of commissionRules) {
                    try {
                        await insert('commission_rules', rule);
                        console.log('✅ Regla de comisión creada:', rule.name);
                    } catch (error) {
                        if (error.code !== '23505') console.error('Error creando regla de comisión:', error.message);
                    }
                }
            }
            
            console.log('✅ Usuario admin verificado correctamente');
            return;
        }

        console.log('📦 Creando datos iniciales...');

        // 1. Verificar si existe alguna sucursal, si no, crear las 4 sucursales
        // Crear tanto con IDs legacy (branch_joyeria1) como nuevos (branch1) para compatibilidad
        let existingBranch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
        
        if (!existingBranch) {
            console.log('📦 No hay sucursales. Creando sucursales iniciales...');
            const branches = [
                { id: 'branch1', name: 'L Vallarta', address: '', legacyId: 'branch_joyeria1' },
                { id: 'branch2', name: 'Malecón', address: '', legacyId: 'branch_malecon' },
                { id: 'branch3', name: 'San Sebastián', address: '', legacyId: 'branch_sansebastian' },
                { id: 'branch4', name: 'Sayulita', address: '', legacyId: 'branch_sayulita' }
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
                    console.log('✅ Sucursal creada:', branch.name, `(${branch.id})`);
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
                permissions: JSON.stringify(['all']),
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
                    permissions: JSON.stringify(['all']),
                    active: true
                });
                console.log('✅ Credenciales del usuario admin actualizadas');
            } else {
                throw error;
            }
        }

        // 4. Crear payment methods si no existen
        console.log('📦 Verificando métodos de pago...');
        const existingPaymentMethods = await query('SELECT * FROM payment_methods LIMIT 1');
        
        if (existingPaymentMethods.length === 0) {
            console.log('📦 Creando métodos de pago iniciales...');
            const paymentMethods = [
                { id: 'pm1', name: 'Efectivo USD', code: 'CASH_USD', active: true, order_index: 1 },
                { id: 'pm2', name: 'Efectivo MXN', code: 'CASH_MXN', active: true, order_index: 2 },
                { id: 'pm3', name: 'Efectivo EUR', code: 'CASH_EUR', active: true, order_index: 3 },
                { id: 'pm4', name: 'Efectivo CAD', code: 'CASH_CAD', active: true, order_index: 4 },
                { id: 'pm5', name: 'TPV Visa/MC', code: 'TPV_VISA', active: true, order_index: 5 },
                { id: 'pm6', name: 'TPV Amex', code: 'TPV_AMEX', active: true, order_index: 6 }
            ];

            for (const pm of paymentMethods) {
                try {
                    await insert('payment_methods', {
                        ...pm,
                        requires_bank: false,
                        requires_type: false
                    });
                    console.log('✅ Método de pago creado:', pm.name);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando método de pago:', error.message);
                    }
                }
            }
        } else {
            console.log('✅ Ya existen métodos de pago');
        }

        // 5. Crear commission rules por defecto si no existen
        console.log('📦 Verificando reglas de comisión...');
        const existingCommissionRules = await query('SELECT * FROM commission_rules LIMIT 1');
        
        if (existingCommissionRules.length === 0) {
            console.log('📦 Creando reglas de comisión por defecto...');
            const commissionRules = [
                {
                    id: 'seller_default',
                    name: 'Comisión Vendedor Default',
                    type: 'percentage',
                    value: 5.0,
                    entity_type: 'seller',
                    entity_id: null, // null = default para todos
                    branch_id: null, // null = global
                    active: true
                },
                {
                    id: 'guide_default',
                    name: 'Comisión Guía Default',
                    type: 'percentage',
                    value: 18.0,
                    entity_type: 'guide',
                    entity_id: null, // null = default para todos
                    branch_id: null, // null = global
                    active: true
                }
            ];

            for (const rule of commissionRules) {
                try {
                    await insert('commission_rules', {
                        ...rule,
                        conditions: null
                    });
                    console.log('✅ Regla de comisión creada:', rule.name);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando regla de comisión:', error.message);
                    }
                }
            }
        } else {
            console.log('✅ Ya existen reglas de comisión');
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ SEED COMPLETADO EXITOSAMENTE');
        console.log('═══════════════════════════════════════════════════════');
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

