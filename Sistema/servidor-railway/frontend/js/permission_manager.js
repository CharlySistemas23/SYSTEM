// Permission Manager - Sistema de Permisos por Categorías

const PermissionManager = {
    // Definición de permisos por categoría
    PERMISSIONS: {
        // OPERACIONES
        OPERATIONS: {
            POS_VIEW: 'pos.view',
            POS_CREATE_SALE: 'pos.create_sale',
            POS_EDIT_SALE: 'pos.edit_sale',
            POS_CANCEL_SALE: 'pos.cancel_sale',
            POS_APPLY_DISCOUNT: 'pos.apply_discount',
            CASH_VIEW: 'cash.view',
            CASH_OPEN_SESSION: 'cash.open_session',
            CASH_CLOSE_SESSION: 'cash.close_session',
            CASH_VIEW_REPORTS: 'cash.view_reports',
            BARCODES_GENERATE: 'barcodes.generate',
            BARCODES_PRINT: 'barcodes.print'
        },
        // INVENTARIO
        INVENTORY: {
            VIEW: 'inventory.view',
            ADD: 'inventory.add',
            EDIT: 'inventory.edit',
            DELETE: 'inventory.delete',
            UPDATE_STOCK: 'inventory.update_stock',
            VIEW_COST: 'inventory.view_cost',
            EDIT_COST: 'inventory.edit_cost',
            TRANSFERS_VIEW: 'transfers.view',
            TRANSFERS_CREATE: 'transfers.create',
            TRANSFERS_APPROVE: 'transfers.approve'
        },
        // CLIENTES Y SERVICIOS
        CUSTOMERS_SERVICES: {
            CUSTOMERS_VIEW: 'customers.view',
            CUSTOMERS_ADD: 'customers.add',
            CUSTOMERS_EDIT: 'customers.edit',
            CUSTOMERS_DELETE: 'customers.delete',
            REPAIRS_VIEW: 'repairs.view',
            REPAIRS_CREATE: 'repairs.create',
            REPAIRS_EDIT: 'repairs.edit',
            REPAIRS_COMPLETE: 'repairs.complete',
            ARRIVALS_VIEW: 'arrivals.view',
            ARRIVALS_REGISTER: 'arrivals.register',
            ARRIVALS_EDIT: 'arrivals.edit'
        },
        // ADMINISTRACIÓN
        ADMINISTRATION: {
            EMPLOYEES_VIEW: 'employees.view',
            EMPLOYEES_ADD: 'employees.add',
            EMPLOYEES_EDIT: 'employees.edit',
            EMPLOYEES_DELETE: 'employees.delete',
            EMPLOYEES_VIEW_USERS: 'employees.view_users',
            EMPLOYEES_CREATE_USERS: 'employees.create_users',
            EMPLOYEES_EDIT_USERS: 'employees.edit_users',
            EMPLOYEES_RESET_PIN: 'employees.reset_pin',
            BRANCHES_VIEW: 'branches.view',
            BRANCHES_MANAGE: 'branches.manage'
        },
        // REPORTES Y ANÁLISIS
        REPORTS_ANALYSIS: {
            REPORTS_VIEW: 'reports.view',
            REPORTS_GENERATE: 'reports.generate',
            REPORTS_EXPORT: 'reports.export',
            REPORTS_VIEW_PROFITS: 'reports.view_profits',
            REPORTS_VIEW_COSTS: 'reports.view_costs',
            REPORTS_VIEW_ANALYTICS: 'reports.view_analytics',
            COSTS_VIEW: 'costs.view',
            COSTS_ADD: 'costs.add',
            COSTS_EDIT: 'costs.edit',
            COSTS_DELETE: 'costs.delete',
            DASHBOARD_VIEW: 'dashboard.view',
            DASHBOARD_VIEW_ALL_BRANCHES: 'dashboard.view_all_branches'
        },
        // CONFIGURACIÓN
        CONFIGURATION: {
            SETTINGS_VIEW: 'settings.view',
            SETTINGS_EDIT_GENERAL: 'settings.edit_general',
            SETTINGS_EDIT_FINANCIAL: 'settings.edit_financial',
            SETTINGS_MANAGE_CATALOGS: 'settings.manage_catalogs',
            SETTINGS_MANAGE_PERMISSIONS: 'settings.manage_permissions',
            SETTINGS_VIEW_AUDIT: 'settings.view_audit',
            SETTINGS_SYNC: 'settings.sync',
            SETTINGS_QA: 'settings.qa'
        }
    },

    // Perfiles predefinidos de permisos
    ROLE_PROFILES: {
        admin: ['all'], // Acceso total
        manager: [
            // OPERACIONES
            'pos.view', 'pos.create_sale', 'pos.edit_sale', 'pos.apply_discount',
            'cash.view', 'cash.open_session', 'cash.close_session', 'cash.view_reports',
            'barcodes.generate', 'barcodes.print',
            // INVENTARIO
            'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.update_stock',
            'inventory.view_cost', 'inventory.edit_cost',
            'transfers.view', 'transfers.create', 'transfers.approve',
            // CLIENTES Y SERVICIOS
            'customers.view', 'customers.add', 'customers.edit', 'customers.delete',
            'repairs.view', 'repairs.create', 'repairs.edit', 'repairs.complete',
            'arrivals.view', 'arrivals.register', 'arrivals.edit',
            // ADMINISTRACIÓN
            'employees.view', 'employees.view_users', 'branches.view',
            // REPORTES Y ANÁLISIS
            'reports.view', 'reports.generate', 'reports.export',
            'reports.view_profits', 'reports.view_costs', 'reports.view_analytics',
            'costs.view', 'costs.add', 'costs.edit', 'costs.delete',
            'dashboard.view', 'dashboard.view_all_branches',
            // CONFIGURACIÓN
            'settings.view', 'settings.edit_general', 'settings.manage_catalogs',
            'settings.view_audit', 'settings.sync'
        ],
        seller: [
            // OPERACIONES
            'pos.view', 'pos.create_sale', 'pos.apply_discount',
            // INVENTARIO
            'inventory.view',
            // CLIENTES Y SERVICIOS
            'customers.view', 'customers.add', 'repairs.view',
            // REPORTES Y ANÁLISIS
            'reports.view', 'dashboard.view'
        ],
        cashier: [
            // OPERACIONES
            'pos.view', 'pos.create_sale', 'cash.view',
            // INVENTARIO
            'inventory.view',
            // CLIENTES Y SERVICIOS
            'customers.view', 'customers.add',
            // REPORTES Y ANÁLISIS
            'cash.view_reports', 'dashboard.view'
        ]
    },

    /**
     * Verificar si el usuario tiene un permiso específico
     * @param {string} permission - Permiso a verificar
     * @returns {boolean}
     */
    hasPermission(permission) {
        const user = typeof UserManager !== 'undefined' ? UserManager.currentUser : null;
        if (!user) return false;
        
        // Admin tiene acceso a todo
        if (user.role === 'admin' || user.permissions?.includes('all')) {
            return true;
        }
        
        // Verificar permiso específico
        if (user.permissions && Array.isArray(user.permissions)) {
            return user.permissions.includes(permission);
        }
        
        // Si no tiene permisos definidos, usar perfil predefinido del rol
        return this.hasPermissionFromRole(user.role, permission);
    },

    /**
     * Verificar permiso desde el perfil predefinido del rol
     * @param {string} role - Rol del usuario
     * @param {string} permission - Permiso a verificar
     * @returns {boolean}
     */
    hasPermissionFromRole(role, permission) {
        const profile = this.ROLE_PROFILES[role] || [];
        return profile.includes(permission) || profile.includes('all');
    },

    /**
     * Verificar si tiene alguno de los permisos
     * @param {string[]} permissions - Array de permisos
     * @returns {boolean}
     */
    hasAnyPermission(permissions) {
        if (!Array.isArray(permissions) || permissions.length === 0) return false;
        return permissions.some(p => this.hasPermission(p));
    },

    /**
     * Verificar si tiene todos los permisos
     * @param {string[]} permissions - Array de permisos
     * @returns {boolean}
     */
    hasAllPermissions(permissions) {
        if (!Array.isArray(permissions) || permissions.length === 0) return false;
        return permissions.every(p => this.hasPermission(p));
    },

    /**
     * Obtener todos los permisos disponibles
     * @returns {string[]}
     */
    getAllPermissions() {
        const all = [];
        Object.values(this.PERMISSIONS).forEach(category => {
            Object.values(category).forEach(permission => {
                all.push(permission);
            });
        });
        return all;
    },

    /**
     * Obtener permisos predefinidos de un rol
     * @param {string} role - Rol
     * @returns {string[]}
     */
    getRolePermissions(role) {
        return this.ROLE_PROFILES[role] || [];
    },

    /**
     * Agregar permisos a un usuario según su rol (si no tiene permisos personalizados)
     * @param {Object} user - Objeto usuario
     * @returns {Object} Usuario con permisos
     */
    async ensureUserPermissions(user) {
        if (!user) return user;
        
        // Si es admin, siempre asignar 'all'
        if (user.role === 'admin') {
            user.permissions = ['all'];
            // Guardar en DB si el usuario ya existe
            if (user.id && typeof DB !== 'undefined') {
                try {
                    await DB.put('users', user);
                } catch (e) {
                    console.warn('No se pudo actualizar permisos del usuario:', e);
                }
            }
            return user;
        }
        
        // Verificar si los permisos actuales son válidos (formato nuevo)
        const validPermissions = this.getAllPermissions();
        const hasValidPermissions = user.permissions && 
                                   Array.isArray(user.permissions) && 
                                   user.permissions.length > 0 &&
                                   user.permissions.some(p => validPermissions.includes(p) || p === 'all');
        
        // Si no tiene permisos válidos, asignar permisos predefinidos del rol
        if (!hasValidPermissions) {
            user.permissions = this.getRolePermissions(user.role) || [];
            // Guardar en DB si el usuario ya existe
            if (user.id && typeof DB !== 'undefined') {
                try {
                    await DB.put('users', user);
                    console.log(`Permisos actualizados para usuario ${user.username} (rol: ${user.role})`);
                } catch (e) {
                    console.warn('No se pudo actualizar permisos del usuario:', e);
                }
            }
        }
        
        return user;
    },

    /**
     * Agrupar permisos por categoría
     * @param {string[]} permissions - Array de permisos
     * @returns {Object} Permisos agrupados por categoría
     */
    groupPermissionsByCategory(permissions = null) {
        const perms = permissions || this.getAllPermissions();
        const grouped = {
            operations: [],
            inventory: [],
            customers_services: [],
            administration: [],
            reports_analysis: [],
            configuration: []
        };

        perms.forEach(perm => {
            if (perm.startsWith('pos.') || perm.startsWith('cash.') || perm.startsWith('barcodes.')) {
                grouped.operations.push(perm);
            } else if (perm.startsWith('inventory.') || perm.startsWith('transfers.')) {
                grouped.inventory.push(perm);
            } else if (perm.startsWith('customers.') || perm.startsWith('repairs.') || perm.startsWith('arrivals.')) {
                grouped.customers_services.push(perm);
            } else if (perm.startsWith('employees.') || perm.startsWith('branches.')) {
                grouped.administration.push(perm);
            } else if (perm.startsWith('reports.') || perm.startsWith('costs.') || perm.startsWith('dashboard.')) {
                grouped.reports_analysis.push(perm);
            } else if (perm.startsWith('settings.')) {
                grouped.configuration.push(perm);
            }
        });

        return grouped;
    }
};

// Hacer disponible globalmente
window.PermissionManager = PermissionManager;

