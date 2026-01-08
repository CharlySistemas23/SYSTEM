// Branch Validator - Validaciones y utilidades para multisucursal

const BranchValidator = {
    /**
     * Valida que una sucursal exista y esté activa
     * @param {string} branchId - ID de la sucursal
     * @returns {Promise<Object|null>} Objeto de sucursal o null si no existe
     */
    async validateBranch(branchId) {
        if (!branchId) {
            console.warn('BranchValidator: branchId no proporcionado');
            return null;
        }

        try {
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                console.warn(`BranchValidator: Sucursal ${branchId} no encontrada`);
                return null;
            }

            if (!branch.active) {
                console.warn(`BranchValidator: Sucursal ${branchId} está inactiva`);
                // Aún así retornamos la sucursal, pero el sistema puede decidir qué hacer
            }

            return branch;
        } catch (e) {
            console.error('BranchValidator: Error validando sucursal:', e);
            return null;
        }
    },

    /**
     * Valida que el usuario actual tenga acceso a una sucursal
     * @param {string} branchId - ID de la sucursal
     * @returns {Promise<boolean>} true si tiene acceso, false si no
     */
    async validateUserAccess(branchId) {
        if (!branchId) return false;

        // Si es admin, tiene acceso a todas
        if (UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')) {
            return true;
        }

        // Verificar que el empleado tenga acceso a esta sucursal
        if (UserManager.currentEmployee) {
            return UserManager.currentEmployee.branch_id === branchId;
        }

        return false;
    },

    /**
     * Obtiene o asigna una sucursal por defecto si no existe
     * @returns {Promise<string|null>} ID de sucursal por defecto
     */
    async getOrCreateDefaultBranch() {
        try {
            const branches = await DB.getAll('catalog_branches') || [];
            const activeBranch = branches.find(b => b.active);

            if (activeBranch) {
                return activeBranch.id;
            }

            // Si no hay sucursales activas, crear una por defecto
            if (branches.length === 0) {
                const defaultBranch = {
                    id: 'branch1',
                    name: 'Sucursal Principal',
                    address: '',
                    phone: '',
                    active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                await DB.put('catalog_branches', defaultBranch);
                console.log('BranchValidator: Sucursal por defecto creada');
                return defaultBranch.id;
            }

            // Si hay sucursales pero ninguna activa, activar la primera
            if (branches.length > 0) {
                branches[0].active = true;
                branches[0].updated_at = new Date().toISOString();
                await DB.put('catalog_branches', branches[0]);
                console.log('BranchValidator: Primera sucursal activada');
                return branches[0].id;
            }

            return null;
        } catch (e) {
            console.error('BranchValidator: Error obteniendo sucursal por defecto:', e);
            return null;
        }
    },

    /**
     * Migra datos existentes sin branch_id asignándoles una sucursal por defecto
     * @param {string} storeName - Nombre del store de IndexedDB
     * @param {string} branchId - ID de sucursal a asignar
     * @returns {Promise<number>} Cantidad de registros migrados
     */
    async migrateDataWithoutBranch(storeName, branchId = null) {
        if (!branchId) {
            branchId = await this.getOrCreateDefaultBranch();
            if (!branchId) {
                console.error('BranchValidator: No se pudo obtener sucursal por defecto para migración');
                return 0;
            }
        }

        try {
            const allItems = await DB.getAll(storeName, null, null, { 
                filterByBranch: false 
            }) || [];
            
            const itemsWithoutBranch = allItems.filter(item => !item.branch_id);
            
            if (itemsWithoutBranch.length === 0) {
                return 0;
            }

            let migrated = 0;
            for (const item of itemsWithoutBranch) {
                item.branch_id = branchId;
                item.updated_at = new Date().toISOString();
                await DB.put(storeName, item);
                migrated++;
            }

            console.log(`BranchValidator: ${migrated} registros migrados en ${storeName}`);
            return migrated;
        } catch (e) {
            console.error(`BranchValidator: Error migrando ${storeName}:`, e);
            return 0;
        }
    },

    /**
     * Valida y corrige todos los datos del sistema
     * @returns {Promise<Object>} Reporte de validación
     */
    async validateAllData() {
        const report = {
            branches: { total: 0, active: 0, issues: [] },
            sales: { total: 0, withoutBranch: 0, fixed: 0 },
            inventory: { total: 0, withoutBranch: 0, fixed: 0 },
            arrivals: { total: 0, withoutBranch: 0, fixed: 0 },
            costs: { total: 0, withoutBranch: 0, fixed: 0 },
            employees: { total: 0, withoutBranch: 0, fixed: 0 }
        };

        try {
            // Validar sucursales
            const branches = await DB.getAll('catalog_branches') || [];
            report.branches.total = branches.length;
            report.branches.active = branches.filter(b => b.active).length;

            if (branches.length === 0) {
                report.branches.issues.push('No hay sucursales registradas');
                const defaultBranchId = await this.getOrCreateDefaultBranch();
                if (defaultBranchId) {
                    report.branches.issues.push(`Sucursal por defecto creada: ${defaultBranchId}`);
                }
            }

            // Obtener sucursal por defecto para migración
            const defaultBranchId = await this.getOrCreateDefaultBranch();

            // Validar y migrar ventas
            const sales = await DB.getAll('sales', null, null, { filterByBranch: false }) || [];
            report.sales.total = sales.length;
            report.sales.withoutBranch = sales.filter(s => !s.branch_id).length;
            if (report.sales.withoutBranch > 0 && defaultBranchId) {
                report.sales.fixed = await this.migrateDataWithoutBranch('sales', defaultBranchId);
            }

            // Validar y migrar inventario
            const inventory = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            report.inventory.total = inventory.length;
            report.inventory.withoutBranch = inventory.filter(i => !i.branch_id).length;
            if (report.inventory.withoutBranch > 0 && defaultBranchId) {
                report.inventory.fixed = await this.migrateDataWithoutBranch('inventory_items', defaultBranchId);
            }

            // Validar y migrar llegadas
            const arrivals = await DB.getAll('agency_arrivals', null, null, { filterByBranch: false }) || [];
            report.arrivals.total = arrivals.length;
            report.arrivals.withoutBranch = arrivals.filter(a => !a.branch_id).length;
            if (report.arrivals.withoutBranch > 0 && defaultBranchId) {
                report.arrivals.fixed = await this.migrateDataWithoutBranch('agency_arrivals', defaultBranchId);
            }

            // Validar y migrar costos
            const costs = await DB.getAll('cost_entries', null, null, { filterByBranch: false }) || [];
            report.costs.total = costs.length;
            report.costs.withoutBranch = costs.filter(c => !c.branch_id).length;
            if (report.costs.withoutBranch > 0 && defaultBranchId) {
                report.costs.fixed = await this.migrateDataWithoutBranch('cost_entries', defaultBranchId);
            }

            // Validar empleados
            const employees = await DB.getAll('employees', null, null, { filterByBranch: false }) || [];
            report.employees.total = employees.length;
            report.employees.withoutBranch = employees.filter(e => !e.branch_id).length;
            // Nota: Los empleados pueden no tener branch_id si son administradores

            return report;
        } catch (e) {
            console.error('BranchValidator: Error en validación completa:', e);
            report.error = e.message;
            return report;
        }
    },

    /**
     * Valida que el sistema esté configurado correctamente para multisucursal
     * @returns {Promise<Object>} Estado de la configuración
     */
    async validateSystemConfig() {
        const config = {
            hasBranches: false,
            hasActiveBranch: false,
            hasDefaultBranch: false,
            currentUserHasBranch: false,
            issues: [],
            recommendations: []
        };

        try {
            const branches = await DB.getAll('catalog_branches') || [];
            config.hasBranches = branches.length > 0;
            config.hasActiveBranch = branches.some(b => b.active);

            if (!config.hasBranches) {
                config.issues.push('No hay sucursales registradas. Crea al menos una sucursal en Configuración → Catálogos → Gestionar Sucursales');
                config.recommendations.push('Crear al menos una sucursal antes de usar el sistema');
            } else if (!config.hasActiveBranch) {
                config.issues.push('No hay sucursales activas. Activa al menos una sucursal');
                config.recommendations.push('Activar al menos una sucursal para que el sistema funcione correctamente');
            }

            const currentBranchId = BranchManager.getCurrentBranchId();
            config.hasDefaultBranch = !!currentBranchId;

            if (!currentBranchId) {
                const defaultBranchId = await this.getOrCreateDefaultBranch();
                if (defaultBranchId) {
                    await BranchManager.setCurrentBranch(defaultBranchId);
                    config.hasDefaultBranch = true;
                    config.recommendations.push(`Sucursal por defecto establecida: ${defaultBranchId}`);
                } else {
                    config.issues.push('No se pudo establecer una sucursal por defecto');
                }
            }

            if (UserManager.currentEmployee) {
                config.currentUserHasBranch = !!UserManager.currentEmployee.branch_id;
                if (!config.currentUserHasBranch && UserManager.currentUser?.role !== 'admin') {
                    config.issues.push('El empleado actual no tiene sucursal asignada');
                    config.recommendations.push('Asignar una sucursal al empleado en Configuración → Catálogos → Gestionar Sucursales → Asignar Empleados');
                }
            }

            return config;
        } catch (e) {
            console.error('BranchValidator: Error validando configuración:', e);
            config.error = e.message;
            return config;
        }
    }
};

window.BranchValidator = BranchValidator;

