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
                { id: 'branch1', name: 'JOYERIA 1', address: '' },
                { id: 'branch2', name: 'MALECON', address: '' },
                { id: 'branch3', name: 'SAN SEBASTIAN', address: '' },
                { id: 'branch4', name: 'SAYULITA', address: '' }
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
            // NO retornar aquí - continuar con la creación de catálogos y reglas
        }

        console.log('📦 Creando datos iniciales...');

        // 1. Verificar si existe alguna sucursal, si no, crear las 4 sucursales
        // Crear tanto con IDs legacy (branch_joyeria1) como nuevos (branch1) para compatibilidad
        let existingBranch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
        
        if (!existingBranch) {
            console.log('📦 No hay sucursales. Creando sucursales iniciales...');
            const branches = [
                { id: 'branch1', name: 'JOYERIA 1', address: '', legacyId: 'branch_joyeria1' },
                { id: 'branch2', name: 'MALECON', address: '', legacyId: 'branch_malecon' },
                { id: 'branch3', name: 'SAN SEBASTIAN', address: '', legacyId: 'branch_sansebastian' },
                { id: 'branch4', name: 'SAYULITA', address: '', legacyId: 'branch_sayulita' }
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
        
        // CRÍTICO: Si no hay sucursales, crear las 4 sucursales
        if (!branchId) {
            console.log('⚠️ No hay sucursales. Creando sucursales...');
            const branches = [
                { id: 'branch1', name: 'JOYERIA 1' },
                { id: 'branch2', name: 'MALECON' },
                { id: 'branch3', name: 'SAN SEBASTIAN' },
                { id: 'branch4', name: 'SAYULITA' }
            ];
            
            for (const branchData of branches) {
                try {
                    const branch = await insert('catalog_branches', {
                        id: branchData.id,
                        name: branchData.name,
                        address: '',
                        phone: '',
                        email: '',
                        active: true
                    });
                    console.log('✅ Sucursal creada:', branch.name);
                    if (!existingBranch) {
                        existingBranch = branch;
                        branchId = branch.id;
                    }
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando sucursal:', error.message);
                    }
                }
            }
        }

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
            // Asegurar que el empleado tenga branch_id
            if (!employee.branch_id && branchId) {
                const { update } = await import('../config/database.js');
                await update('employees', employeeId, { branch_id: branchId });
                employee.branch_id = branchId;
                console.log('✅ Branch_id asignado al empleado admin');
            }
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
                
                // CRÍTICO: Asegurar que tenga branch_id válido (branch1)
                let finalBranchId = branchId;
                if (!finalBranchId) {
                    // Verificar que branch1 existe, si no, crearlo
                    let branch1 = await queryOne('SELECT id FROM catalog_branches WHERE id = $1', ['branch1']);
                    if (!branch1) {
                        branch1 = await insert('catalog_branches', {
                            id: 'branch1',
                            name: 'JOYERIA 1',
                            address: '',
                            phone: '',
                            email: '',
                            active: true
                        });
                    }
                    finalBranchId = 'branch1';
                }
                
                await update('users', existingUser.id, {
                    password_hash: passwordHash,
                    pin_hash: pinHash,
                    employee_id: employeeId,
                    branch_id: finalBranchId,
                    role: 'admin',
                    permissions: JSON.stringify(['all']),
                    active: true
                });
                console.log('✅ Credenciales del usuario admin actualizadas con branch_id:', finalBranchId);
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

        // 5. Crear agencias
        console.log('📦 Verificando agencias...');
        const agencies = [
            { id: 'agency_tanitours', name: 'TANITOURS', barcode: null, branch_id: null, active: true },
            { id: 'agency_travelex', name: 'TRAVELEX', barcode: null, branch_id: null, active: true },
            { id: 'agency_discovery', name: 'DISCOVERY', barcode: null, branch_id: null, active: true },
            { id: 'agency_veranos', name: 'VERANOS', barcode: null, branch_id: null, active: true },
            { id: 'agency_tb', name: 'TB', barcode: null, branch_id: null, active: true },
            { id: 'agency_ttf', name: 'TTF', barcode: null, branch_id: null, active: true }
        ];

        const createdAgencies = {};
        for (const agency of agencies) {
            try {
                const existing = await queryOne('SELECT * FROM catalog_agencies WHERE id = $1', [agency.id]);
                if (!existing) {
                    await insert('catalog_agencies', agency);
                    console.log('✅ Agencia creada:', agency.name);
                }
                createdAgencies[agency.name] = agency.id;
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando agencia:', error.message);
                }
            }
        }

        // 7. Crear vendedores
        console.log('📦 Verificando vendedores...');
        const sellers = [
            'SEBASTIAN', 'CALI', 'SAULA', 'ANDRES', 'ANGEL', 'SR ANGEL', 'RAMSES', 'ISAURA', 
            'CARLOS', 'PACO', 'FRANCISCO', 'OMAR', 'PANDA', 'KARLA', 'JUAN CARLOS', 'NADIA', 
            'JASON', 'ROBERTO', 'PEDRO', 'ANA', 'JOVA', 'EDITH', 'VERO', 'POCHIS', 'RAMON', 
            'ALDAIR', 'CLAUDIA', 'SERGIO', 'MANUEL'
        ];

        const createdSellers = {};
        for (const sellerName of sellers) {
            const sellerId = `seller_${sellerName.toLowerCase().replace(/\s+/g, '_')}`;
            try {
                const existing = await queryOne('SELECT * FROM catalog_sellers WHERE id = $1', [sellerId]);
                if (!existing) {
                    await insert('catalog_sellers', {
                        id: sellerId,
                        name: sellerName,
                        barcode: null,
                        branch_id: null,
                        active: true
                    });
                    console.log('✅ Vendedor creado:', sellerName);
                }
                createdSellers[sellerName] = sellerId;
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando vendedor:', error.message);
                }
            }
        }

        // 8. Crear guías
        console.log('📦 Verificando guías...');
        const guides = {
            'VERANOS': ['CARLOS SIS', 'MARIO RENDON', 'CHAVA', 'FREDY', 'NETO', 'EMMANUEL'],
            'TANITOURS': ['MARINA', 'GLORIA', 'DANIELA'],
            'DISCOVERY': ['RAMON', 'GUSTAVO SIS', 'GUSTAVO LEPE', 'NOVOA', 'ERIK', 'CHILO', 'FERMIN', 'EMMA', 'HERASMO'],
            'TRAVELEX': ['MIGUEL SUAREZ', 'SANTA', 'MIGUEL DELGADILLO', 'ANDRES CHAVEZ', 'SAREM', 'ZAVALA', 'TEMO', 'ROCIO', 'NETO', 'SEBASTIAN S'],
            'TB': ['MIGUEL IBARRA', 'ADAN', 'MIGUEL RAGA', 'GABINO', 'HECTOR SUAREZ', 'OSCAR', 'JOSE AVILES'],
            'TTF': ['HUGO', 'HILBERTO', 'JOSE MASIAS', 'DAVID BUSTOS', 'ALFONSO', 'DANIEL RIVERA', 'EDUARDO LEAL']
        };

        const createdGuides = {};
        for (const [agency, guideNames] of Object.entries(guides)) {
            for (const guideName of guideNames) {
                const guideId = `guide_${guideName.toLowerCase().replace(/\s+/g, '_')}`;
                try {
                    const existing = await queryOne('SELECT * FROM catalog_guides WHERE id = $1', [guideId]);
                    if (!existing) {
                        await insert('catalog_guides', {
                            id: guideId,
                            name: guideName,
                            barcode: null,
                            branch_id: null,
                            active: true
                        });
                        console.log('✅ Guía creada:', guideName, `(${agency})`);
                    }
                    createdGuides[guideName] = guideId;
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando guía:', error.message);
                    }
                }
            }
        }

        // 9. Crear reglas de comisión para vendedores
        console.log('📦 Creando reglas de comisión para vendedores...');
        
        // SEBASTIAN: *10 directo (discount_pct=0, multiplier=10)
        if (createdSellers['SEBASTIAN']) {
            try {
                await insert('commission_rules', {
                    id: 'commission_seller_sebastian',
                    entity_type: 'seller',
                    entity_id: createdSellers['SEBASTIAN'],
                    branch_id: null,
                    discount_pct: 0,
                    multiplier: 10,
                    active: true
                });
                console.log('✅ Regla de comisión creada: SEBASTIAN (*10)');
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando regla SEBASTIAN:', error.message);
                }
            }
        }

        // OMAR y JUAN CARLOS: -20% *7 (discount_pct=20, multiplier=7)
        for (const sellerName of ['OMAR', 'JUAN CARLOS']) {
            if (createdSellers[sellerName]) {
                try {
                    await insert('commission_rules', {
                        id: `commission_seller_${sellerName.toLowerCase().replace(/\s+/g, '_')}`,
                        entity_type: 'seller',
                        entity_id: createdSellers[sellerName],
                        branch_id: null,
                        discount_pct: 20,
                        multiplier: 7,
                        active: true
                    });
                    console.log(`✅ Regla de comisión creada: ${sellerName} (-20% *7)`);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error(`Error creando regla ${sellerName}:`, error.message);
                    }
                }
            }
        }

        // Default vendedores: -5% *9 (discount_pct=5, multiplier=9)
        try {
            await insert('commission_rules', {
                id: 'commission_seller_default',
                entity_type: 'seller',
                entity_id: null, // null = default para todos los que no tengan regla específica
                branch_id: null,
                discount_pct: 5,
                multiplier: 9,
                active: true
            });
            console.log('✅ Regla de comisión default para vendedores creada (-5% *9)');
        } catch (error) {
            if (error.code !== '23505') {
                console.error('Error creando regla default vendedores:', error.message);
            }
        }

        // 10. Crear reglas de comisión para guías
        console.log('📦 Creando reglas de comisión para guías...');
        
        // MARINA: *10 directo (discount_pct=0, multiplier=10)
        if (createdGuides['MARINA']) {
            try {
                await insert('commission_rules', {
                    id: 'commission_guide_marina',
                    entity_type: 'guide',
                    entity_id: createdGuides['MARINA'],
                    branch_id: null,
                    discount_pct: 0,
                    multiplier: 10,
                    active: true
                });
                console.log('✅ Regla de comisión creada: MARINA (*10)');
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando regla MARINA:', error.message);
                }
            }
        }

        // Default guías: -18% *10 (discount_pct=18, multiplier=10)
        try {
            await insert('commission_rules', {
                id: 'commission_guide_default',
                entity_type: 'guide',
                entity_id: null, // null = default para todos
                branch_id: null,
                discount_pct: 18,
                multiplier: 10,
                active: true
            });
            console.log('✅ Regla de comisión default para guías creada (-18% *10)');
        } catch (error) {
            if (error.code !== '23505') {
                console.error('Error creando regla default guías:', error.message);
            }
        }

        // 11. Crear reglas de tarifas de llegadas (arrival_rate_rules) para agencias
        console.log('📦 Creando reglas de tarifas de llegadas para agencias...');
        
        // TANITOURS
        if (createdAgencies['TANITOURS']) {
            const tanitoursRules = [
                { min_passengers: 11, max_passengers: 15, flat_fee: 1300, fee_type: 'flat' },
                { min_passengers: 16, max_passengers: 23, flat_fee: 1500, fee_type: 'flat' },
                { min_passengers: 24, max_passengers: 39, flat_fee: 2500, fee_type: 'flat' }
            ];
            for (const rule of tanitoursRules) {
                try {
                    await insert('arrival_rate_rules', {
                        id: `arrival_tanitours_${rule.min_passengers}_${rule.max_passengers}`,
                        agency_id: createdAgencies['TANITOURS'],
                        branch_id: null,
                        ...rule,
                        active_from: new Date().toISOString().split('T')[0],
                        active: true
                    });
                    console.log(`✅ Regla TANITOURS creada: ${rule.min_passengers}-${rule.max_passengers} = $${rule.flat_fee}`);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando regla TANITOURS:', error.message);
                    }
                }
            }
        }

        // TRAVELEX: $3,700 cualquier cantidad
        if (createdAgencies['TRAVELEX']) {
            try {
                await insert('arrival_rate_rules', {
                    id: 'arrival_travelex_all',
                    agency_id: createdAgencies['TRAVELEX'],
                    branch_id: null,
                    min_passengers: 1,
                    max_passengers: null,
                    flat_fee: 3700,
                    fee_type: 'flat',
                    active_from: new Date().toISOString().split('T')[0],
                    active: true
                });
                console.log('✅ Regla TRAVELEX creada: Cualquier cantidad = $3,700');
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando regla TRAVELEX:', error.message);
                }
            }
        }

        // DISCOVERY: CITY TOUR
        if (createdAgencies['DISCOVERY']) {
            const discoveryRules = [
                { branch_id: 'branch1', name: 'VALLARTA (Tienda 1 y 2)', flat_fee: 2000 },
                { branch_id: 'branch2', name: 'VALLARTA (Tienda 1 y 2)', flat_fee: 2000 },
                { branch_id: 'branch3', name: 'Tienda 3', flat_fee: 1000 },
                { branch_id: 'branch4', name: 'Tienda 4', flat_fee: 600 }
            ];
            for (const rule of discoveryRules) {
                try {
                    await insert('arrival_rate_rules', {
                        id: `arrival_discovery_${rule.branch_id}`,
                        agency_id: createdAgencies['DISCOVERY'],
                        branch_id: rule.branch_id,
                        min_passengers: 1,
                        max_passengers: null,
                        flat_fee: rule.flat_fee,
                        fee_type: 'flat',
                        active_from: new Date().toISOString().split('T')[0],
                        active: true
                    });
                    console.log(`✅ Regla DISCOVERY creada: ${rule.name} = $${rule.flat_fee}`);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando regla DISCOVERY:', error.message);
                    }
                }
            }
        }

        // VERANOS: $2,000 cualquier cantidad
        if (createdAgencies['VERANOS']) {
            try {
                await insert('arrival_rate_rules', {
                    id: 'arrival_veranos_all',
                    agency_id: createdAgencies['VERANOS'],
                    branch_id: null,
                    min_passengers: 1,
                    max_passengers: null,
                    flat_fee: 2000,
                    fee_type: 'flat',
                    active_from: new Date().toISOString().split('T')[0],
                    active: true
                });
                console.log('✅ Regla VERANOS creada: Cualquier cantidad = $2,000');
            } catch (error) {
                if (error.code !== '23505') {
                    console.error('Error creando regla VERANOS:', error.message);
                }
            }
        }

        // TB
        if (createdAgencies['TB']) {
            const tbRules = [
                { min_passengers: 1, max_passengers: 6, flat_fee: 300 },
                { min_passengers: 7, max_passengers: 14, flat_fee: 600 },
                { min_passengers: 15, max_passengers: 18, flat_fee: 800 },
                { min_passengers: 20, max_passengers: 30, flat_fee: 1000 },
                { min_passengers: 30, max_passengers: 45, flat_fee: 1200 }
            ];
            for (const rule of tbRules) {
                try {
                    await insert('arrival_rate_rules', {
                        id: `arrival_tb_${rule.min_passengers}_${rule.max_passengers}`,
                        agency_id: createdAgencies['TB'],
                        branch_id: null,
                        ...rule,
                        fee_type: 'flat',
                        extra_per_passenger: rule.max_passengers === 45 ? 20 : 0, // +20 pesos por pasajero extra después de 45
                        active_from: new Date().toISOString().split('T')[0],
                        active: true
                    });
                    console.log(`✅ Regla TB creada: ${rule.min_passengers}-${rule.max_passengers} = $${rule.flat_fee}${rule.max_passengers === 45 ? ' +$20/pasajero extra' : ''}`);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando regla TB:', error.message);
                    }
                }
            }
        }

        // TTF
        if (createdAgencies['TTF']) {
            const ttfRules = [
                { min_passengers: 1, max_passengers: 6, flat_fee: 300 },
                { min_passengers: 7, max_passengers: 14, flat_fee: 600 },
                { min_passengers: 15, max_passengers: 18, flat_fee: 800 },
                { min_passengers: 20, max_passengers: 30, flat_fee: 1000 },
                { min_passengers: 30, max_passengers: 45, flat_fee: 1200 }
            ];
            for (const rule of ttfRules) {
                try {
                    await insert('arrival_rate_rules', {
                        id: `arrival_ttf_${rule.min_passengers}_${rule.max_passengers}`,
                        agency_id: createdAgencies['TTF'],
                        branch_id: null,
                        ...rule,
                        fee_type: 'flat',
                        active_from: new Date().toISOString().split('T')[0],
                        active: true
                    });
                    console.log(`✅ Regla TTF creada: ${rule.min_passengers}-${rule.max_passengers} = $${rule.flat_fee}`);
                } catch (error) {
                    if (error.code !== '23505') {
                        console.error('Error creando regla TTF:', error.message);
                    }
                }
            }
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

