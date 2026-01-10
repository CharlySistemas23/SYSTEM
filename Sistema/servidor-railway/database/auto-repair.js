// Sistema de Auto-Reparación Completo
// Verifica y repara automáticamente tablas, datos críticos e integridad
import { query, queryOne, insert, update } from '../config/database.js';
import { migrate } from './migrate-auto.js';
import { seedDatabase } from './seed.js';
import { fixAdmin } from './fix-admin.js';
import bcrypt from 'bcryptjs';

let repairInProgress = false;
let lastRepairTime = null;
const REPAIR_COOLDOWN = 60000; // 1 minuto entre reparaciones automáticas

/**
 * Verifica y repara todas las tablas
 */
async function verifyAndRepairTables() {
    const report = {
        tablesCreated: [],
        tablesSkipped: [],
        tablesErrors: []
    };

    try {
        // Verificar tablas críticas
        const criticalTables = [
            'catalog_branches', 'users', 'employees', 'customers',
            'catalog_sellers', 'catalog_guides', 'catalog_agencies',
            'inventory_items', 'sales', 'sale_items', 'sale_payments',
            'cash_sessions', 'cash_movements', 'arrival_rate_rules',
            'agency_arrivals', 'repairs', 'tourist_reports',
            'inventory_transfers', 'cost_entries', 'exchange_rates_daily',
            'settings', 'payment_methods', 'commission_rules'
        ];

        const missingTables = [];
        
        for (const tableName of criticalTables) {
            try {
                await query(`SELECT 1 FROM ${tableName} LIMIT 1`);
            } catch (error) {
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    missingTables.push(tableName);
                }
            }
        }

        if (missingTables.length > 0) {
            console.log(`🔄 Reparando ${missingTables.length} tablas faltantes...`);
            await migrate();
            
            // Verificar nuevamente
            for (const tableName of missingTables) {
                try {
                    await query(`SELECT 1 FROM ${tableName} LIMIT 1`);
                    report.tablesCreated.push(tableName);
                } catch (error) {
                    report.tablesErrors.push({ table: tableName, error: error.message });
                }
            }
        }

        return report;
    } catch (error) {
        console.error('Error en verifyAndRepairTables:', error);
        throw error;
    }
}

/**
 * Verifica y repara datos críticos
 */
async function verifyAndRepairData() {
    const report = {
        branchesCreated: [],
        branchesFixed: [],
        usersFixed: [],
        employeesFixed: [],
        catalogsChecked: []
    };

    try {
        // 1. Verificar y crear sucursales
        const branches = await query('SELECT * FROM catalog_branches');
        const requiredBranches = [
            { id: 'branch1', name: 'JOYERIA 1' },
            { id: 'branch2', name: 'MALECON' },
            { id: 'branch3', name: 'SAN SEBASTIAN' },
            { id: 'branch4', name: 'SAYULITA' }
        ];

        for (const requiredBranch of requiredBranches) {
            // Verificar por ID
            const existsById = branches.find(b => b.id === requiredBranch.id);
            // Verificar por nombre (case-insensitive)
            const existsByName = branches.find(b => 
                b.name && b.name.toLowerCase().trim() === requiredBranch.name.toLowerCase().trim()
            );
            
            if (!existsById && !existsByName) {
                try {
                    await insert('catalog_branches', {
                        id: requiredBranch.id,
                        name: requiredBranch.name,
                        address: '',
                        phone: '',
                        email: '',
                        active: true
                    });
                    report.branchesCreated.push(requiredBranch.name);
                    console.log(`✅ Sucursal creada: ${requiredBranch.name}`);
                } catch (error) {
                    if (error.code !== '23505' && error.code !== '23514') {
                        console.error(`Error creando sucursal ${requiredBranch.name}:`, error.message);
                    } else {
                        console.log(`⏭️ Sucursal ${requiredBranch.name} ya existe (duplicado evitado)`);
                    }
                }
            } else if (existsByName && existsByName.id !== requiredBranch.id) {
                console.warn(`⚠️ Existe una sucursal con el nombre "${requiredBranch.name}" pero diferente ID: ${existsByName.id}`);
            }
        }

        // 2. Verificar que todas las sucursales estén activas
        for (const branch of branches) {
            if (!branch.active) {
                await update('catalog_branches', branch.id, { active: true });
                report.branchesFixed.push(branch.name);
            }
        }

        // 3. Verificar y reparar usuarios sin branch_id
        const usersWithoutBranch = await query('SELECT * FROM users WHERE (branch_id IS NULL OR branch_id = \'\') AND active = true');
        const defaultBranch = await queryOne('SELECT id FROM catalog_branches WHERE active = true LIMIT 1');
        
        if (defaultBranch && usersWithoutBranch.length > 0) {
            for (const user of usersWithoutBranch) {
                await update('users', user.id, { branch_id: defaultBranch.id });
                report.usersFixed.push(user.username);
            }
        }

        // 4. Verificar y reparar empleados sin branch_id
        const employeesWithoutBranch = await query('SELECT * FROM employees WHERE (branch_id IS NULL OR branch_id = \'\') AND active = true');
        
        if (defaultBranch && employeesWithoutBranch.length > 0) {
            for (const employee of employeesWithoutBranch) {
                await update('employees', employee.id, { branch_id: defaultBranch.id });
                report.employeesFixed.push(employee.name);
            }
        }

        // 5. Verificar catálogos (no crear, solo verificar que existan)
        const sellers = await query('SELECT COUNT(*) as count FROM catalog_sellers');
        const guides = await query('SELECT COUNT(*) as count FROM catalog_guides');
        const agencies = await query('SELECT COUNT(*) as count FROM catalog_agencies');
        
        report.catalogsChecked = {
            sellers: parseInt(sellers[0]?.count || 0),
            guides: parseInt(guides[0]?.count || 0),
            agencies: parseInt(agencies[0]?.count || 0)
        };

        return report;
    } catch (error) {
        console.error('Error en verifyAndRepairData:', error);
        throw error;
    }
}

/**
 * Repara integridad de datos
 */
async function repairDataIntegrity() {
    const report = {
        foreignKeysFixed: [],
        orphanedRecords: [],
        invalidReferences: []
    };

    try {
        // 1. Verificar usuarios con employee_id inválido
        const usersWithInvalidEmployee = await query(`
            SELECT u.* FROM users u 
            LEFT JOIN employees e ON u.employee_id = e.id 
            WHERE u.employee_id IS NOT NULL AND e.id IS NULL
        `);

        for (const user of usersWithInvalidEmployee) {
            // Si es admin, intentar crear empleado si no existe
            if (user.role === 'admin') {
                const defaultBranch = await queryOne('SELECT id FROM catalog_branches WHERE active = true LIMIT 1');
                if (defaultBranch) {
                    try {
                        const employeeId = user.employee_id || 'emp_admin_001';
                        await insert('employees', {
                            id: employeeId,
                            name: 'Administrador',
                            role: 'admin',
                            branch_id: defaultBranch.id,
                            barcode: 'ADMIN001',
                            active: true
                        });
                        report.foreignKeysFixed.push(`Empleado creado para usuario ${user.username}`);
                    } catch (error) {
                        if (error.code !== '23505') {
                            report.invalidReferences.push(`Usuario ${user.username}: ${error.message}`);
                        }
                    }
                }
            } else {
                // Para usuarios no admin, limpiar employee_id inválido
                await update('users', user.id, { employee_id: null });
                report.orphanedRecords.push(`Usuario ${user.username}: employee_id limpiado`);
            }
        }

        // 2. Verificar empleados con branch_id inválido
        const employeesWithInvalidBranch = await query(`
            SELECT e.* FROM employees e 
            LEFT JOIN catalog_branches b ON e.branch_id = b.id 
            WHERE e.branch_id IS NOT NULL AND b.id IS NULL
        `);

        const defaultBranch = await queryOne('SELECT id FROM catalog_branches WHERE active = true LIMIT 1');
        if (defaultBranch) {
            for (const employee of employeesWithInvalidBranch) {
                await update('employees', employee.id, { branch_id: defaultBranch.id });
                report.foreignKeysFixed.push(`Branch_id corregido para empleado ${employee.name}`);
            }
        }

        return report;
    } catch (error) {
        console.error('Error en repairDataIntegrity:', error);
        throw error;
    }
}

/**
 * Reparación completa del sistema
 */
export async function verifyAndRepairAll() {
    // Prevenir múltiples reparaciones simultáneas
    if (repairInProgress) {
        console.log('⚠️ Reparación ya en progreso, esperando...');
        return { message: 'Reparación ya en progreso' };
    }

    // Cooldown para evitar reparaciones muy frecuentes
    if (lastRepairTime && Date.now() - lastRepairTime < REPAIR_COOLDOWN) {
        const waitTime = Math.ceil((REPAIR_COOLDOWN - (Date.now() - lastRepairTime)) / 1000);
        console.log(`⚠️ Cooldown activo, espera ${waitTime} segundos antes de reparar nuevamente`);
        return { message: `Cooldown activo, espera ${waitTime} segundos` };
    }

    repairInProgress = true;
    lastRepairTime = Date.now();

    const fullReport = {
        timestamp: new Date().toISOString(),
        tables: null,
        data: null,
        integrity: null,
        admin: null,
        errors: []
    };

    try {
        console.log('');
        console.log('🔧 INICIANDO AUTO-REPARACIÓN DEL SISTEMA');
        console.log('═══════════════════════════════════════════');
        console.log('');

        // 1. Verificar y reparar tablas
        console.log('1️⃣ Verificando tablas...');
        try {
            fullReport.tables = await verifyAndRepairTables();
            console.log('✅ Verificación de tablas completada');
        } catch (error) {
            fullReport.errors.push({ step: 'tables', error: error.message });
            console.error('❌ Error verificando tablas:', error.message);
        }
        console.log('');

        // 2. Verificar y reparar datos críticos
        console.log('2️⃣ Verificando datos críticos...');
        try {
            fullReport.data = await verifyAndRepairData();
            console.log('✅ Verificación de datos completada');
        } catch (error) {
            fullReport.errors.push({ step: 'data', error: error.message });
            console.error('❌ Error verificando datos:', error.message);
        }
        console.log('');

        // 3. Reparar integridad de datos
        console.log('3️⃣ Reparando integridad de datos...');
        try {
            fullReport.integrity = await repairDataIntegrity();
            console.log('✅ Reparación de integridad completada');
        } catch (error) {
            fullReport.errors.push({ step: 'integrity', error: error.message });
            console.error('❌ Error reparando integridad:', error.message);
        }
        console.log('');

        // 4. Verificar y reparar admin
        console.log('4️⃣ Verificando usuario admin...');
        try {
            await fixAdmin();
            fullReport.admin = { status: 'verified' };
            console.log('✅ Usuario admin verificado');
        } catch (error) {
            fullReport.errors.push({ step: 'admin', error: error.message });
            console.error('❌ Error verificando admin:', error.message);
        }
        console.log('');

        console.log('═══════════════════════════════════════════');
        console.log('✅ AUTO-REPARACIÓN COMPLETADA');
        console.log('═══════════════════════════════════════════');
        console.log('');

        return fullReport;
    } catch (error) {
        fullReport.errors.push({ step: 'general', error: error.message });
        console.error('❌ Error en auto-reparación:', error);
        throw error;
    } finally {
        repairInProgress = false;
    }
}

/**
 * Reparación rápida para errores específicos
 */
export async function repairOnDemand(error) {
    try {
        // Si es error de tabla faltante
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            const tableName = error.message?.match(/relation "([^"]+)" does not exist/i)?.[1];
            if (tableName) {
                console.log(`🔄 Reparando tabla faltante: ${tableName}`);
                await migrate();
                return { repaired: true, table: tableName };
            }
        }

        // Si es error de branch_id faltante
        if (error.message?.includes('Branch ID no encontrado') || error.message?.includes('branch_id')) {
            console.log('🔄 Reparando branch_id faltante...');
            const defaultBranch = await queryOne('SELECT id FROM catalog_branches WHERE active = true LIMIT 1');
            if (defaultBranch) {
                // Esto se maneja mejor en el middleware de auth
                return { repaired: false, message: 'Requiere actualización de usuario' };
            }
        }

        return { repaired: false, message: 'Error no reparable automáticamente' };
    } catch (repairError) {
        console.error('Error en repairOnDemand:', repairError);
        return { repaired: false, error: repairError.message };
    }
}
