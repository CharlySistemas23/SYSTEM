// Branch Manager - Gestión de Sucursales Multisucursal

const BranchManager = {
    currentBranchId: null,
    currentBranch: null,
    userBranches: [], // Sucursales a las que tiene acceso el usuario

    /**
     * Inicializar BranchManager
     * Establece la sucursal actual basada en el usuario logueado
     */
    async init() {
        try {
            // Obtener sucursal del usuario logueado
            if (UserManager.currentUser && UserManager.currentEmployee) {
                const employee = UserManager.currentEmployee;
                
                // Si es admin o manager, puede tener múltiples sucursales
                if (employee.role === 'admin' || employee.role === 'manager') {
                    // Intentar usar la sucursal guardada si está en sus branch_ids
                    const savedBranchId = localStorage.getItem('current_branch_id');
                    if (savedBranchId) {
                        const branchIds = employee.branch_ids || (employee.branch_id ? [employee.branch_id] : []);
                        if (branchIds.includes(savedBranchId)) {
                            await this.setCurrentBranch(savedBranchId);
                            return;
                        }
                    }
                    
                    // Usar la primera sucursal de sus branch_ids
                    const branchIds = employee.branch_ids || (employee.branch_id ? [employee.branch_id] : []);
                    if (branchIds.length > 0) {
                        await this.setCurrentBranch(branchIds[0]);
                    } else {
                        // Si no tiene sucursales, usar la primera activa disponible
                        const branches = await DB.getAll('catalog_branches') || [];
                        const activeBranch = branches.find(b => b.active);
                        if (activeBranch) {
                            await this.setCurrentBranch(activeBranch.id);
                        }
                    }
                } else {
                    // Otros roles: solo una sucursal (branch_id)
                    if (employee.branch_id) {
                        await this.setCurrentBranch(employee.branch_id);
                    } else {
                        // Si no tiene, usar la primera sucursal disponible o la guardada
                        const savedBranchId = localStorage.getItem('current_branch_id');
                        if (savedBranchId) {
                            await this.setCurrentBranch(savedBranchId);
                        } else {
                            // Obtener primera sucursal activa
                            const branches = await DB.getAll('catalog_branches') || [];
                            const activeBranch = branches.find(b => b.active);
                            if (activeBranch) {
                                await this.setCurrentBranch(activeBranch.id);
                            }
                        }
                    }
                }
            } else {
                // Si no hay usuario, usar la guardada
                const savedBranchId = localStorage.getItem('current_branch_id');
                if (savedBranchId) {
                    await this.setCurrentBranch(savedBranchId);
                }
            }
            
            console.log('BranchManager initialized:', this.currentBranchId);
        } catch (e) {
            console.error('Error initializing BranchManager:', e);
        }
    },

    /**
     * Establecer sucursal actual
     * @param {string} branchId - ID de la sucursal
     */
    async setCurrentBranch(branchId) {
        try {
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                console.warn(`Branch ${branchId} not found`);
                return false;
            }
            
            this.currentBranchId = branchId;
            this.currentBranch = branch;
            localStorage.setItem('current_branch_id', branchId);
            
            // Actualizar UI
            this.updateBranchUI();
            
            // Disparar evento para que otros módulos se actualicen
            window.dispatchEvent(new CustomEvent('branch-changed', { 
                detail: { branchId, branch } 
            }));
            
            console.log(`Current branch set to: ${branch.name} (${branchId})`);
            return true;
        } catch (e) {
            console.error('Error setting current branch:', e);
            return false;
        }
    },

    /**
     * Obtener sucursal actual
     * @returns {string|null} ID de la sucursal actual
     */
    getCurrentBranchId() {
        return this.currentBranchId || localStorage.getItem('current_branch_id');
    },

    /**
     * Obtener objeto de sucursal actual
     * @returns {Promise<Object|null>}
     */
    async getCurrentBranch() {
        if (this.currentBranch) {
            return this.currentBranch;
        }
        
        const branchId = this.getCurrentBranchId();
        if (branchId) {
            this.currentBranch = await DB.get('catalog_branches', branchId);
            return this.currentBranch;
        }
        
        return null;
    },

    /**
     * Verificar si el usuario tiene acceso a una sucursal
     * @param {string} branchId - ID de la sucursal
     * @returns {boolean}
     */
    hasAccessToBranch(branchId) {
        // Si es admin, tiene acceso a todas
        if (UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')) {
            return true;
        }
        
        const employee = UserManager.currentEmployee;
        if (!employee) return false;
        
        // Si es admin o manager, puede tener múltiples sucursales (branch_ids)
        if (employee.role === 'admin' || employee.role === 'manager') {
            if (employee.branch_ids && Array.isArray(employee.branch_ids)) {
                return employee.branch_ids.includes(branchId);
            }
            // Fallback a branch_id si no tiene branch_ids
            if (employee.branch_id) {
                return employee.branch_id === branchId;
            }
            // Si no tiene sucursales asignadas, permitir acceso (admin/manager)
            return true;
        }
        
        // Otros roles: solo una sucursal (branch_id)
        if (employee.branch_id) {
            return employee.branch_id === branchId;
        }
        
        // Por defecto, no permitir acceso
        return false;
    },

    /**
     * Obtener sucursales a las que el usuario tiene acceso
     * @returns {Promise<Array>}
     */
    async getUserBranches() {
        try {
            const allBranches = await DB.getAll('catalog_branches') || [];
            const employee = UserManager.currentEmployee;
            
            // Si es admin, puede ver todas
            if (UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')) {
                return allBranches.filter(b => b.active);
            }
            
            if (!employee) return [];
            
            // Si es admin o manager, puede tener múltiples sucursales (branch_ids)
            if (employee.role === 'admin' || employee.role === 'manager') {
                if (employee.branch_ids && Array.isArray(employee.branch_ids) && employee.branch_ids.length > 0) {
                    // Filtrar sucursales activas que están en branch_ids
                    return allBranches.filter(b => 
                        b.active && employee.branch_ids.includes(b.id)
                    );
                }
                // Fallback a branch_id si no tiene branch_ids
                if (employee.branch_id) {
                    const userBranch = allBranches.find(b => 
                        b.id === employee.branch_id && b.active
                    );
                    return userBranch ? [userBranch] : [];
                }
                // Si no tiene sucursales asignadas pero es admin/manager, mostrar todas
                return allBranches.filter(b => b.active);
            }
            
            // Otros roles: solo una sucursal (branch_id)
            if (employee.branch_id) {
                const userBranch = allBranches.find(b => 
                    b.id === employee.branch_id && b.active
                );
                return userBranch ? [userBranch] : [];
            }
            
            // Sin sucursales asignadas
            return [];
        } catch (e) {
            console.error('Error getting user branches:', e);
            return [];
        }
    },

    /**
     * Obtener datos empresariales de la sucursal actual (o una específica)
     * @param {string|null} branchId - ID de sucursal (null para usar la actual)
     * @returns {Promise<Object>} Objeto con datos empresariales
     */
    async getBranchBusinessData(branchId = null) {
        try {
            const branch = branchId 
                ? await DB.get('catalog_branches', branchId)
                : await this.getCurrentBranch();
            
            if (!branch) {
                // Fallback a configuración global si no hay sucursal
                const businessName = await DB.get('settings', 'business_name');
                const businessAddress = await DB.get('settings', 'business_address');
                const businessPhone = await DB.get('settings', 'business_phone');
                
                return {
                    name: businessName?.value || 'Opal & Co',
                    address: businessAddress?.value || '',
                    phone: businessPhone?.value || '',
                    email: '',
                    rfc: '',
                    footer: '',
                    logo: ''
                };
            }
            
            // Retornar datos empresariales de la sucursal, con fallback a datos básicos
            return {
                name: branch.business_name || branch.name || 'Opal & Co',
                address: branch.business_address || branch.address || '',
                phone: branch.business_phone || branch.phone || '',
                email: branch.business_email || '',
                rfc: branch.business_rfc || '',
                footer: branch.business_footer || '',
                logo: branch.business_logo || ''
            };
        } catch (e) {
            console.error('Error getting branch business data:', e);
            return {
                name: 'Opal & Co',
                address: '',
                phone: '',
                email: '',
                rfc: '',
                footer: '',
                logo: ''
            };
        }
    },

    /**
     * Actualizar UI con la sucursal actual
     */
    async updateBranchUI() {
        const branchEl = document.getElementById('current-branch');
        if (branchEl && this.currentBranch) {
            branchEl.textContent = this.currentBranch.name;
        }
        
        // Actualizar selector de sucursal si es admin
        await this.updateBranchSelector();
    },

    /**
     * Actualizar selector de sucursal en topbar (solo para administradores)
     */
    async updateBranchSelector() {
        const container = document.getElementById('branch-selector-container');
        const selector = document.getElementById('branch-selector');
        
        if (!container || !selector) return;
        
        // Solo mostrar para administradores
        const isAdmin = UserManager.currentUser?.role === 'admin' || 
                       UserManager.currentUser?.permissions?.includes('all');
        
        if (isAdmin) {
            container.style.display = 'inline-block';
            
            // Obtener todas las sucursales activas
            const branches = await DB.getAll('catalog_branches') || [];
            const activeBranches = branches.filter(b => b.active);
            
            // Actualizar opciones
            selector.innerHTML = activeBranches.map(b => 
                `<option value="${b.id}" ${b.id === this.currentBranchId ? 'selected' : ''}>${b.name}</option>`
            ).join('');
        } else {
            container.style.display = 'none';
        }
    },

    /**
     * Manejar cambio de sucursal desde el selector
     */
    async handleBranchChange(branchId) {
        if (!branchId) return;
        
        const success = await this.setCurrentBranch(branchId);
        if (success) {
            // Recargar módulo actual
            const currentModule = UI.currentModule || localStorage.getItem('current_module');
            if (currentModule && window.App && window.App.loadModule) {
                await window.App.loadModule(currentModule);
            }
            
            Utils.showNotification(`Sucursal cambiada a: ${this.currentBranch?.name}`, 'success');
        }
    },

    /**
     * Filtrar datos por sucursal actual
     * Helper para usar en consultas
     * @param {Array} data - Array de datos a filtrar
     * @param {string} branchIdField - Nombre del campo que contiene branch_id (default: 'branch_id')
     * @param {boolean} includeNull - Si incluir registros sin branch_id (default: false)
     * @returns {Array}
     */
    filterByCurrentBranch(data, branchIdField = 'branch_id', includeNull = false) {
        if (!data || !Array.isArray(data)) return [];
        
        const currentBranchId = this.getCurrentBranchId();
        
        // Si es admin, puede ver todos (pero aún así filtrar por sucursal seleccionada si hay)
        if (UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')) {
            // Admin puede ver todos, pero si hay una sucursal seleccionada, filtrar por esa
            if (currentBranchId) {
                return data.filter(item => 
                    !item[branchIdField] || 
                    item[branchIdField] === currentBranchId ||
                    (includeNull && !item[branchIdField])
                );
            }
            return data;
        }
        
        // Usuario normal: solo su sucursal
        if (currentBranchId) {
            return data.filter(item => 
                item[branchIdField] === currentBranchId ||
                (includeNull && !item[branchIdField])
            );
        }
        
        // Si no hay sucursal, no mostrar nada
        return [];
    }
};

