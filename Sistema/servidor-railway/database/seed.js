// Script de Inicialización de Datos (Seed)
// Crea datos iniciales: sucursal, empleado admin, usuario admin
import { query, queryOne, insert } from '../config/database.js';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
    try {
        console.log('🌱 Iniciando seed de base de datos...');

        // Verificar si ya existe una sucursal
        const existingBranch = await queryOne('SELECT * FROM catalog_branches LIMIT 1');
        
        if (existingBranch) {
            console.log('✅ Ya existen datos en la base de datos. Saltando seed.');
            return;
        }

        console.log('📦 Creando datos iniciales...');

        // 1. Crear las 4 sucursales
        const branches = [
            { id: 'branch_joyeria1', name: 'JOYERIA 1', address: '' },
            { id: 'branch_malecon', name: 'MALECON', address: '' },
            { id: 'branch_sansebastian', name: 'SAN SEBASTIAN', address: '' },
            { id: 'branch_sayulita', name: 'SAYULITA', address: '' }
        ];

        const createdBranches = [];
        for (const branchData of branches) {
            const branch = await insert('catalog_branches', {
                id: branchData.id,
                name: branchData.name,
                address: branchData.address,
                phone: '',
                email: '',
                active: true
            });
            createdBranches.push(branch);
            console.log('✅ Sucursal creada:', branch.name);
        }

        // Usar la primera sucursal (JOYERIA 1) para el usuario admin
        const branchId = createdBranches[0].id;

        // 2. Crear empleado admin
        const employeeId = 'emp_admin_001';
        const employee = await insert('employees', {
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

        // 3. Crear usuario admin
        // Password por defecto: "admin123"
        const passwordHash = await bcrypt.hash('admin123', 10);
        // PIN por defecto: "1234"
        const pinHash = await bcrypt.hash('1234', 10);

        const userId = 'user_admin_001';
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

        return {
            branch,
            employee,
            user
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

