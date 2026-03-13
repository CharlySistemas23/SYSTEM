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
            const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

            // Migración automática: si localStorage tiene branch legacy (branch1/2/3/4) y ya hay API,
            // mapearlo a UUID real del servidor por nombre/code y migrar datos locales.
            try {
                const migratedFlag = await DB.get('settings', 'branch_uuid_migrated');
                const alreadyMigrated = migratedFlag?.value === 'true';
                const savedBranchId = localStorage.getItem('current_branch_id');

                if (!alreadyMigrated && savedBranchId && !isUUID(savedBranchId) &&
                    typeof API !== 'undefined' && API.baseURL && API.token && typeof API.getBranches === 'function') {
                    const localBranch = await DB.get('catalog_branches', savedBranchId);
                    const serverBranches = await API.getBranches();

                    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').trim();
                    const targetName = norm(localBranch?.name);
                    const targetCode = norm(localBranch?.code);

                    const match = (serverBranches || []).find(b => {
                        if (!b) return false;
                        if (targetCode && norm(b.code) === targetCode) return true;
                        if (targetName && norm(b.name) === targetName) return true;
                        return false;
                    });

                    if (match?.id && isUUID(match.id)) {
                        // Guardar mapping
                        await DB.put('settings', { key: 'branch_id_map', value: JSON.stringify({ [savedBranchId]: match.id }), updated_at: new Date().toISOString() });

                        // Migrar datos locales principales
                        const branchIdMap = { [savedBranchId]: match.id };
                        const migrateStore = async (storeName, field = 'branch_id') => {
                            try {
                                const rows = await DB.getAll(storeName, null, null, { filterByBranch: false }) || [];
                                for (const r of rows) {
                                    const old = r?.[field];
                                    if (old && branchIdMap[old]) {
                                        await DB.put(storeName, { ...r, [field]: branchIdMap[old] }, { autoBranchId: false });
                                    }
                                }
                            } catch (e) {}
                        };

                        await migrateStore('inventory_items', 'branch_id');
                        await migrateStore('cost_entries', 'branch_id');
                        await migrateStore('customers', 'branch_id');
                        await migrateStore('sales', 'branch_id');
                        await migrateStore('repairs', 'branch_id');
                        // transferencias tienen campos distintos
                        try {
                            const transfers = await DB.getAll('inventory_transfers', null, null, { filterByBranch: false }) || [];
                            for (const t of transfers) {
                                const fromB = t?.from_branch_id;
                                const toB = t?.to_branch_id;
                                const updated = { ...t };
                                if (fromB && branchIdMap[fromB]) updated.from_branch_id = branchIdMap[fromB];
                                if (toB && branchIdMap[toB]) updated.to_branch_id = branchIdMap[toB];
                                if (updated.from_branch_id !== fromB || updated.to_branch_id !== toB) {
                                    await DB.put('inventory_transfers', updated, { autoBranchId: false });
                                }
                            }
                        } catch (e) {}

                        // Cambiar sucursal actual a UUID real
                        localStorage.setItem('current_branch_id', match.id);
                        await DB.put('settings', { key: 'branch_uuid_migrated', value: 'true', updated_at: new Date().toISOString() });
                    }
                }
            } catch (e) {
                // No bloquear init por migración
            }

            // Verificar si es master_admin
            const isMasterAdmin = UserManager.currentUser?.role === 'master_admin' ||
                                 UserManager.currentUser?.is_master_admin ||
                                 UserManager.currentUser?.isMasterAdmin ||
                                 (UserManager.currentEmployee && UserManager.currentEmployee.role === 'master_admin');
            
            // Obtener sucursal del usuario logueado
            if (UserManager.currentUser && UserManager.currentEmployee) {
                const employee = UserManager.currentEmployee;
                
                // Master admin: puede acceder a todas las sucursales, usar la guardada o la primera activa
                if (isMasterAdmin) {
                    const savedBranchId = localStorage.getItem('current_branch_id');
                    if (savedBranchId) {
                        const branch = await DB.get('catalog_branches', savedBranchId);
                        if (branch && branch.active) {
                            await this.setCurrentBranch(savedBranchId);
                            return;
                        }
                    }
                    // Si no hay guardada o no es válida, usar la primera activa
                    const branches = await DB.getAll('catalog_branches') || [];
                    const activeBranch = branches.find(b => b.active);
                    if (activeBranch) {
                        await this.setCurrentBranch(activeBranch.id);
                    }
                    return;
                }
                
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
            
            // Asegurar que los botones de sucursales se actualicen después de inicializar
            // Esto es importante cuando se recarga la página
            if (UserManager.currentUser) {
                await this.updateBranchSelector();
            }
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
            
            // Actualizar UI (esto también actualiza los botones)
            await this.updateBranchUI();
            
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
        // Si es admin o master_admin, tiene acceso a todas
        if (UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.permissions?.includes('all')) {
            return true;
        }
        
        const employee = UserManager.currentEmployee;
        if (!employee) return false;
        
        // Si es admin, master_admin o manager, puede tener múltiples sucursales (branch_ids)
        if (employee.role === 'admin' || employee.role === 'master_admin' || employee.role === 'manager') {
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
            
            // Verificar si es master_admin
            const isMasterAdmin = UserManager.currentUser?.role === 'master_admin' ||
                                 UserManager.currentUser?.is_master_admin ||
                                 UserManager.currentUser?.isMasterAdmin ||
                                 (employee && employee.role === 'master_admin');
            
            // Si es master_admin o admin, puede ver todas
            if (isMasterAdmin || 
                UserManager.currentUser?.role === 'admin' || 
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
        
        // Actualizar botones de sucursal si es admin
        await this.updateBranchSelector();
        // updateBranchButtons se llama dentro de updateBranchSelector después de crear los botones
    },

    /**
     * Actualizar botones de sucursal en topbar (SOLO para master_admin)
     */
    async updateBranchSelector() {
        const container = document.getElementById('branch-buttons-container');
        
        if (!container) return;
        
        // SOLO mostrar para master_admin
        const isMasterAdmin = UserManager.currentUser?.role === 'master_admin' ||
                             UserManager.currentUser?.is_master_admin ||
                             UserManager.currentUser?.isMasterAdmin ||
                             UserManager.currentEmployee?.role === 'master_admin';
        
        if (isMasterAdmin) {
            // Intentar cargar sucursales desde API si está disponible
            let branches = [];
            if (typeof API !== 'undefined' && API.baseURL && API.token) {
                try {
                    branches = await API.getBranches() || [];
                    // Guardar en IndexedDB como caché
                    for (const branch of branches) {
                        await DB.put('catalog_branches', branch);
                    }
                } catch (apiError) {
                    console.warn('Error cargando sucursales desde API, usando local:', apiError);
                    branches = await DB.getAll('catalog_branches') || [];
                }
            } else {
                branches = await DB.getAll('catalog_branches') || [];
            }
            
            const activeBranches = branches.filter(b => b.active !== false);
            
            // Mostrar botones siempre para master_admin (incluso si solo hay 1)
            if (activeBranches.length > 0) {
                // Remover listener anterior si existe para evitar duplicados
                if (container._branchClickHandler) {
                    container.removeEventListener('click', container._branchClickHandler, true);
                }
                
                // Mostrar botones para master_admin
                container.style.display = 'flex';
                container.innerHTML = activeBranches.map(b => {
                    const isActive = b.id === this.currentBranchId;
                    return `
                        <button 
                            class="branch-btn ${isActive ? 'active' : ''}" 
                            data-branch-id="${b.id}"
                            title="${b.name}"
                            type="button"
                        >
                            ${b.name}
                        </button>
                    `;
                }).join('');
                
                // Configurar event listener usando event delegation
                container._branchClickHandler = async (e) => {
                    const btn = e.target.closest('.branch-btn');
                    if (!btn) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    const branchId = btn.getAttribute('data-branch-id');
                    if (branchId && branchId !== this.currentBranchId) {
                        await this.handleBranchChange(branchId);
                    }
                };
                
                // Usar capture phase para interceptar antes que otros listeners
                container.addEventListener('click', container._branchClickHandler, true);
                
                // Actualizar estado visual de los botones
                this.updateBranchButtons();
            } else {
                // Si no hay sucursales, ocultar los botones
                container.style.display = 'none';
                // Remover listener si existe
                if (container._branchClickHandler) {
                    container.removeEventListener('click', container._branchClickHandler, true);
                    container._branchClickHandler = null;
                }
            }
        } else {
            // No es master_admin, ocultar el selector
            container.style.display = 'none';
            // Remover listener si existe
            if (container._branchClickHandler) {
                container.removeEventListener('click', container._branchClickHandler, true);
                container._branchClickHandler = null;
            }
        }
    },

    /**
     * Manejar cambio de sucursal desde los botones
     */
    async handleBranchChange(branchId) {
        if (!branchId) {
            console.warn('handleBranchChange: branchId es requerido');
            return;
        }
        
        if (branchId === this.currentBranchId) {
            console.log('handleBranchChange: Ya está en esta sucursal');
            return;
        }
        
        console.log(`Cambiando de sucursal: ${this.currentBranchId} -> ${branchId}`);
        
        const oldBranchId = this.currentBranchId;
        const success = await this.setCurrentBranch(branchId);
        
        if (!success) {
            console.error('handleBranchChange: Error al establecer la sucursal');
            Utils.showNotification('Error al cambiar de sucursal', 'error');
            return;
        }
        
        // Actualizar estado visual de los botones
        this.updateBranchButtons();
        
        // Actualizar suscripciones de Socket.IO para recibir actualizaciones en tiempo real
        if (typeof API !== 'undefined' && API.socket && API.socket.connected) {
            // Si es master admin, NO necesita suscribirse/desuscribirse porque ya está suscrito a todas
            // Solo los usuarios normales necesitan cambiar suscripciones
            if (!UserManager.currentUser?.is_master_admin) {
                // Desuscribirse de la sucursal anterior
                if (oldBranchId) {
                    API.socket.emit('unsubscribe_inventory', { branchId: oldBranchId });
                    API.socket.emit('unsubscribe_sales', { branchId: oldBranchId });
                }
                
                // Suscribirse a la nueva sucursal
                API.socket.emit('subscribe_inventory', { branchId });
                API.socket.emit('subscribe_sales', { branchId });
            }
            // Master admin ya recibe eventos de todas las sucursales automáticamente
        }
        
        // Recargar módulo actual para mostrar datos de la nueva sucursal
        const currentModule = UI.currentModule || localStorage.getItem('current_module');
        if (currentModule && window.App && window.App.loadModule) {
            await window.App.loadModule(currentModule);
        }
        
        Utils.showNotification(`Sucursal cambiada a: ${this.currentBranch?.name}`, 'success');
    },

    /**
     * Actualizar estado visual de los botones de sucursal
     */
    updateBranchButtons() {
        const container = document.getElementById('branch-buttons-container');
        if (!container) return;
        
        const buttons = container.querySelectorAll('.branch-btn');
        buttons.forEach(btn => {
            const branchId = btn.getAttribute('data-branch-id');
            if (branchId === this.currentBranchId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
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

