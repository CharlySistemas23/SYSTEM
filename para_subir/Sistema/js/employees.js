// Employees & Users Management Module

const Employees = {
    initialized: false,
    isExporting: false,
    _catalogsContentId: null,

    getCatalogContentId() {
        return this._catalogsContentId || 'employees-content';
    },

    async init() {
        try {
            if (this.initialized) {
                return;
            }
            this.setupUI();
            await this.loadEmployees();
            
            // Escuchar eventos Socket.IO para actualización en tiempo real
            if (typeof this.setupSocketListeners === 'function') {
                this.setupSocketListeners();
            }
            
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error inicializando módulo Employees:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Employees</h3>
                        <p style="color: var(--color-text-secondary); margin-top: var(--spacing-md);">
                            ${error.message || 'Error desconocido'}
                        </p>
                        <p style="color: var(--color-danger); font-size: 12px; margin-top: var(--spacing-sm);">
                            Por favor, abre la consola del navegador (F12) para ver más detalles.
                        </p>
                        <button class="btn-primary" onclick="location.reload()" style="margin-top: var(--spacing-md);">
                            Recargar página
                        </button>
                    </div>
                `;
            }
        }
    },

    setupUI() {
        // Asegurar que el placeholder esté visible
        const placeholder = document.getElementById('module-placeholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        }
        
        const content = document.getElementById('module-content');
        if (!content) {
            console.error('module-content not found in Employees.setupUI()');
            return;
        }

        this._catalogsContentId = null;
        content.innerHTML = `
            <div id="employees-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="employees"><i class="fas fa-user-tie"></i> Empleados</button>
                <button class="tab-btn" data-tab="users"><i class="fas fa-user-shield"></i> Usuarios</button>
            </div>
            <div id="employees-content"></div>
        `;
        
        // Asegurar que el contenido sea visible después de insertarlo
        content.style.display = 'block';
        content.style.visibility = 'visible';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.style.visibility = 'visible';
        }

        // Event listeners dinámicos
        document.getElementById('employee-add-btn')?.addEventListener('click', () => this.handleAddClick());
        document.getElementById('employee-export-btn')?.addEventListener('click', () => this.handleExportClick());
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const tab = e.target.dataset.tab;
                this.currentTab = tab;
                this.loadTab(tab);
            });
        });

        this.currentTab = 'employees';
        this.loadTab('employees');
    },

    setupCatalogsUI() {
        this._catalogsContentId = 'catalogs-content';
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div id="catalogs-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="sellers"><i class="fas fa-user-tag"></i> Vendedores</button>
                <button class="tab-btn" data-tab="guides"><i class="fas fa-suitcase"></i> Guías</button>
                <button class="tab-btn" data-tab="agencies"><i class="fas fa-building"></i> Agencias</button>
            </div>
            <div id="catalogs-content"></div>
        `;

        const placeholder = document.getElementById('module-placeholder');
        if (placeholder) placeholder.style.display = 'block';
        content.style.display = 'block';
        content.style.visibility = 'visible';

        document.querySelectorAll('#catalogs-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#catalogs-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                e.target.closest('.tab-btn').classList.add('active');
                const tab = e.target.closest('.tab-btn').dataset.tab;
                this.currentTab = tab;
                this.loadTab(tab);
            });
        });

        const subPage = (typeof localStorage !== 'undefined' && localStorage.getItem('current_subpage')) || '';
        this.currentTab = (subPage === 'agencies' || subPage === 'sellers' || subPage === 'guides') ? subPage : 'sellers';
        this.loadTab(this.currentTab);
    },

    handleAddClick() {
        const tab = this.currentTab || 'employees';
        switch(tab) {
            case 'employees':
                if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.add')) {
                    Utils.showNotification('No tienes permiso para agregar empleados', 'error');
                    return;
                }
                this.showAddEmployeeForm();
                break;
            case 'users':
                this.showAddUserForm();
                break;
            case 'sellers':
                this.showAddSellerForm();
                break;
            case 'guides':
                this.showAddGuideForm();
                break;
            case 'agencies':
                this.showAddAgencyForm();
                break;
        }
    },

    handleExportClick() {
        const tab = this.currentTab || 'employees';
        switch(tab) {
            case 'employees':
                this.exportEmployees();
                break;
            case 'users':
                this.exportUsers();
                break;
            case 'sellers':
                this.exportSellers();
                break;
            case 'guides':
                this.exportGuides();
                break;
            case 'agencies':
                this.exportAgencies();
                break;
        }
    },

    async loadTab(tab) {
        const tabNameEl = document.getElementById('employee-current-tab');
        if (tabNameEl) {
            const names = {
                'employees': 'Empleados',
                'users': 'Usuarios',
                'sellers': 'Vendedores',
                'guides': 'Guías',
                'agencies': 'Agencias'
            };
            tabNameEl.textContent = names[tab] || '';
        }

        switch(tab) {
            case 'employees':
                await this.loadEmployees();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'sellers':
                await this.loadSellers();
                break;
            case 'guides':
                await this.loadGuides();
                break;
            case 'agencies':
                await this.loadAgencies();
                break;
        }
    },

    /**
     * Abrir pestaña Usuarios y el formulario de edición de un usuario (para unificar flujo desde Configuración → Gestionar permisos).
     * @param {string} userId - ID del usuario a editar
     */
    async openUserEditor(userId) {
        this.currentTab = 'users';
        const tabsContainer = document.querySelector('#employees-tabs');
        if (tabsContainer) {
            tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const usersBtn = tabsContainer.querySelector('.tab-btn[data-tab="users"]');
            if (usersBtn) usersBtn.classList.add('active');
        }
        await this.loadTab('users');
        await this.showAddUserForm(userId || undefined);
    },

    async loadEmployees() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.view')) {
            const content = document.getElementById('employees-content') || document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver empleados</div>';
            }
            return;
        }
        const content = document.getElementById('employees-content') || document.getElementById('module-content');
        if (!content) {
            console.error('❌ No se encontró employees-content ni module-content');
            return;
        }

        try {
            // Obtener sucursal actual y filtrar empleados
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            const viewAllBranches = isMasterAdmin;
            
            // ========== SINCRONIZACIÓN BIDIRECCIONAL (en background, no bloquea) ==========
            const syncPromise = (async () => {
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.createEmployee && API.updateEmployee) {
                    console.log('📤 [Paso 1 Employees] Buscando empleados locales que no están en el servidor...');
                    
                    const allLocalEmployees = await DB.getAll('employees') || [];
                    const unsyncedEmployees = allLocalEmployees.filter(e => {
                        if (!e || !e.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(e.id));
                        return !isUUID || !e.server_id;
                    });
                    
                    const employeesToSync = unsyncedEmployees.filter(e => {
                        if (viewAllBranches) return true;
                        if (!currentBranchId) return false;
                        if (e.branch_id) return String(e.branch_id) === String(currentBranchId);
                        if (e.branch_ids && Array.isArray(e.branch_ids)) {
                            return e.branch_ids.some(id => String(id) === String(currentBranchId));
                        }
                        return false;
                    });
                    
                    console.log(`📊 [Paso 1 Employees] Encontrados ${employeesToSync.length} empleados locales sin sincronizar`);
                    
                    if (employeesToSync.length > 0) {
                        const employeesByKey = new Map();
                        for (const localEmployee of employeesToSync) {
                            const key = `${localEmployee.employee_number || localEmployee.id}_${localEmployee.branch_id || 'no-branch'}`;
                            if (!employeesByKey.has(key)) {
                                employeesByKey.set(key, localEmployee);
                            } else {
                                const existing = employeesByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localEmployee.updated_at ? new Date(localEmployee.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    employeesByKey.set(key, localEmployee);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localEmployee] of employeesByKey) {
                            try {
                                console.log(`📤 [Paso 1 Employees] Subiendo empleado local al servidor: ${localEmployee.id}`);
                                
                                let serverEmployee = null;
                                if (localEmployee.employee_number) {
                                    try {
                                        const serverEmployees = await API.getEmployees({ 
                                            branch_id: viewAllBranches ? null : currentBranchId,
                                            employee_number: localEmployee.employee_number
                                        });
                                        if (serverEmployees && serverEmployees.length > 0) {
                                            serverEmployee = serverEmployees[0];
                                        }
                                    } catch (e) {}
                                }
                                
                                if (serverEmployee && serverEmployee.id) {
                                    const updatedEmployee = await API.updateEmployee(serverEmployee.id, localEmployee);
                                    if (updatedEmployee && updatedEmployee.id) {
                                        const allLocalEmployees = await DB.getAll('employees') || [];
                                        const employeesToUpdate = allLocalEmployees.filter(e => {
                                            const eKey = `${e.employee_number || e.id}_${e.branch_id || 'no-branch'}`;
                                            return eKey === key;
                                        });
                                        
                                        for (const employeeToUpdate of employeesToUpdate) {
                                            employeeToUpdate.server_id = updatedEmployee.id;
                                            employeeToUpdate.id = updatedEmployee.id;
                                            employeeToUpdate.sync_status = 'synced';
                                            await DB.put('employees', employeeToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                } else {
                                    const createdEmployee = await API.createEmployee(localEmployee);
                                    if (createdEmployee && createdEmployee.id) {
                                        const allLocalEmployees = await DB.getAll('employees') || [];
                                        const employeesToUpdate = allLocalEmployees.filter(e => {
                                            const eKey = `${e.employee_number || e.id}_${e.branch_id || 'no-branch'}`;
                                            return eKey === key;
                                        });
                                        
                                        for (const employeeToUpdate of employeesToUpdate) {
                                            employeeToUpdate.server_id = createdEmployee.id;
                                            employeeToUpdate.id = createdEmployee.id;
                                            employeeToUpdate.sync_status = 'synced';
                                            await DB.put('employees', employeeToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Employees] Error subiendo empleado ${localEmployee.id}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Employees] Sincronización local→servidor completada: ${uploadedCount} empleados subidos`);
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Employees] Error sincronizando empleados locales al servidor:', error);
            }
            })();
            syncPromise.catch(e => console.error('Error sync employees:', e));

            // ========== CACHE-FIRST: Cargar desde IndexedDB primero ==========
            let employees = [];
            const fromIdb = await DB.getAll('employees', null, null, { filterByBranch: false }) || [];
            const norm = id => String(id || '').trim();
            let cachedFiltered = fromIdb;
            if (!viewAllBranches && currentBranchId) {
                const cb = norm(currentBranchId);
                cachedFiltered = fromIdb.filter(emp => {
                    if (emp.branch_id) return norm(emp.branch_id) === cb;
                    if (emp.branch_ids && Array.isArray(emp.branch_ids)) return emp.branch_ids.some(id => norm(id) === cb);
                    return false;
                });
            }
            const hasCache = cachedFiltered.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getEmployees;

            if (hasCache) {
                employees = cachedFiltered;
                console.log(`⚡ [Cache-First] Mostrando ${employees.length} empleados desde IndexedDB`);
                // API en background
                if (hasApi) {
                    Promise.resolve().then(async () => {
                        try {
                            const fresh = await API.getEmployees({ branch_id: viewAllBranches ? null : currentBranchId });
                            for (const e of fresh) {
                                try {
                                    const local = { ...e, server_id: e.id, sync_status: 'synced' };
                                    await DB.put('employees', local);
                                } catch (x) {}
                            }
                            const beforeIds = new Set(employees.map(e => e.id));
                            const afterIds = new Set(fresh.map(e => e.id));
                            const changed = beforeIds.size !== afterIds.size || [...beforeIds].some(id => !afterIds.has(id));
                            if (changed) await this.loadEmployees();
                        } catch (e) { console.warn('Sync background empleados:', e); }
                    }).catch(e => console.warn('Sync background empleados:', e));
                }
            } else if (hasApi) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center;"><i class="fas fa-spinner fa-spin"></i> Cargando empleados...</div>';
                try {
                    console.log('📥 [Paso 2 Employees] Sincronizando empleados desde el servidor...');
                    employees = await API.getEmployees({ branch_id: viewAllBranches ? null : currentBranchId });
                    console.log(`📥 [Paso 2 Employees] ${employees.length} empleados recibidos del servidor`);
                    
                    // Guardar/actualizar cada empleado en IndexedDB local
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverEmployee of employees) {
                        try {
                            const key = `${serverEmployee.employee_number || serverEmployee.id}_${serverEmployee.branch_id || 'no-branch'}`;
                            const existingLocalEmployees = await DB.getAll('employees') || [];
                            const existingEmployee = existingLocalEmployees.find(e => {
                                const eKey = `${e.employee_number || e.id}_${e.branch_id || 'no-branch'}`;
                                return eKey === key;
                            });
                            
                            const localEmployee = {
                                ...serverEmployee,
                                server_id: serverEmployee.id,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('employees', localEmployee);
                            
                            if (existingEmployee) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Employees] Error guardando empleado ${serverEmployee.id}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Employees] Sincronización servidor→local completada: ${savedCount} nuevos, ${updatedCount} actualizados`);
                } catch (apiError) {
                    console.warn('Error cargando empleados desde API, usando modo local:', apiError);
                    if (viewAllBranches && isMasterAdmin) {
                        employees = await DB.getAll('employees') || [];
                    } else {
                        employees = await DB.getAll('employees', null, null, { 
                            filterByBranch: !viewAllBranches, 
                            branchIdField: 'branch_id',
                            includeNull: true
                        }) || [];
                    }
                }
            } else {
                if (viewAllBranches && isMasterAdmin) {
                    employees = await DB.getAll('employees') || [];
                } else {
                    employees = await DB.getAll('employees', null, null, { 
                        filterByBranch: !viewAllBranches, 
                        branchIdField: 'branch_id',
                        includeNull: true
                    }) || [];
                }
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar
            const employeesByKey = new Map();
            for (const employee of employees) {
                const key = `${employee.employee_number || employee.id}_${employee.branch_id || 'no-branch'}`;
                if (!employeesByKey.has(key)) {
                    employeesByKey.set(key, employee);
                } else {
                    const existing = employeesByKey.get(key);
                    if (employee.server_id && !existing.server_id) {
                        employeesByKey.set(key, employee);
                    } else if (existing.server_id && !employee.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = employee.updated_at ? new Date(employee.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            employeesByKey.set(key, employee);
                        }
                    }
                }
            }
            employees = Array.from(employeesByKey.values());
            console.log(`🔍 [Paso 3 Employees] Deduplicación: ${employees.length} empleados únicos`);
            
            // Verificación adicional para no-master-admins (doble seguridad)
            if (!viewAllBranches && currentBranchId && !isMasterAdmin) {
                const normalizedBranchId = String(currentBranchId);
                employees = employees.filter(emp => {
                    // Si tiene branch_id, verificar
                    if (emp.branch_id) {
                        return String(emp.branch_id) === normalizedBranchId;
                    }
                    // Si tiene branch_ids (array), verificar si incluye la sucursal actual
                    if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                        return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                    }
                    // Si no tiene branch_id ni branch_ids, incluir (compatibilidad)
                    return true;
                });
            }
            
            const branches = await DB.getAll('catalog_branches') || [];
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Obtener estadísticas de ventas por empleado
            const employeesWithStats = employees.map(emp => {
                // Buscar ventas donde el empleado está relacionado
                // Buscar por employee_id si existe en las ventas
                const directSales = sales.filter(s => s.employee_id === emp.id);
                
                // También buscar por seller_id si coincide con algún vendedor relacionado
                // Por ahora solo buscamos ventas directas
                const allSales = directSales;
                
                const completedSales = allSales.filter(s => s && (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')));
                const totalSales = completedSales.reduce((sum, s) => sum + (s.total || 0), 0);
                const avgSale = completedSales.length > 0 ? totalSales / completedSales.length : 0;
                
                return {
                    ...emp,
                    salesCount: completedSales.length,
                    totalSales,
                    avgSale
                };
            });
            
            // Verificar que el contenedor exista
            if (!content) {
                console.error('❌ employees-content y module-content no encontrados en loadEmployees');
                // Intentar crear el contenedor
                const moduleContent = document.getElementById('module-content');
                if (moduleContent) {
                    // Si existe module-content pero no employees-content, crear la estructura
                    if (!document.getElementById('employees-content')) {
                        this.setupUI();
                        await Utils.delay(100);
                        const newContent = document.getElementById('employees-content') || document.getElementById('module-content');
                        if (newContent) {
                            content = newContent;
                        } else {
                            return;
                        }
                    }
                } else {
                    return;
                }
            }

            // Mostrar estadísticas generales
            await this.displayEmployeeStats(employeesWithStats);

            // Guardar para filtros
            this.currentEmployeesData = employeesWithStats;
            this.currentBranchesData = branches;

            // Asegurar que el contenido sea visible
            content.style.display = 'block';
            content.style.visibility = 'visible';

            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-users"></i> Lista de Empleados
                        </h3>
                        <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.add') ? `
                                <button class="btn-primary btn-sm" onclick="window.Employees.showAddEmployeeForm()">
                                    <i class="fas fa-plus"></i> Nuevo
                                </button>
                            ` : ''}
                            <button class="btn-secondary btn-sm" onclick="window.Employees.handleExportClick()">
                                <i class="fas fa-download"></i> Exportar
                            </button>
                            <button class="btn-secondary btn-sm" onclick="window.Employees.verifyEmployeesData()">
                                <i class="fas fa-check-circle"></i> Verificar
                            </button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                        <input type="text" id="employee-search-input" class="form-input" placeholder="Buscar por nombre, rol, código de barras..." 
                            onkeyup="window.Employees.filterEmployees(this.value)">
                    </div>
                    <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                        <button class="btn-secondary btn-sm active" data-filter="all" onclick="window.Employees.filterEmployees(document.getElementById('employee-search-input')?.value || '', 'all')" style="flex: 1; min-width: 100px;">
                            Todos (${employeesWithStats.length})
                        </button>
                        <button class="btn-secondary btn-sm" data-filter="active" onclick="window.Employees.filterEmployees(document.getElementById('employee-search-input')?.value || '', 'active')" style="flex: 1; min-width: 100px;">
                            Activos (${employeesWithStats.filter(e => e.active).length})
                        </button>
                        <button class="btn-secondary btn-sm" data-filter="inactive" onclick="window.Employees.filterEmployees(document.getElementById('employee-search-input')?.value || '', 'inactive')" style="flex: 1; min-width: 100px;">
                            Inactivos (${employeesWithStats.filter(e => !e.active).length})
                        </button>
                        <select id="employee-role-filter" class="form-select" style="flex: 1; min-width: 150px;" onchange="window.Employees.filterEmployees(document.getElementById('employee-search-input')?.value || '', document.querySelector('.btn-secondary.btn-sm.active')?.dataset.filter || 'all', this.value)">
                            <option value="">Todos los roles</option>
                            <option value="seller">Vendedor</option>
                            <option value="admin">Administrador</option>
                            <option value="manager">Gerente</option>
                        </select>
                        <select id="employee-branch-filter" class="form-select" style="flex: 1; min-width: 150px;" onchange="window.Employees.filterEmployees(document.getElementById('employee-search-input')?.value || '', document.querySelector('.btn-secondary.btn-sm.active')?.dataset.filter || 'all', document.getElementById('employee-role-filter')?.value || '', this.value)">
                            <option value="">Todas las sucursales</option>
                            ${branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table" id="employees-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 1000px;">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Sucursal</th>
                            <th>Ventas</th>
                            <th>Total Vendido</th>
                            <th>Barcode</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="employees-tbody">
                        ${employeesWithStats.map(emp => {
                            const branch = branches.find(b => b.id === emp.branch_id);
                            return `
                                <tr data-employee-id="${emp.id}" data-employee-active="${emp.active}" data-employee-role="${emp.role || ''}" data-branch-id="${emp.branch_id || ''}">
                                    <td><strong>${emp.name}</strong></td>
                                    <td><span class="status-badge" style="background: ${emp.role === 'admin' ? '#d32f2f' : emp.role === 'manager' ? '#1976d2' : '#388e3c'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${emp.role || 'N/A'}</span></td>
                                    <td>${branch?.name || 'N/A'}</td>
                                    <td style="text-align: center;"><strong>${emp.salesCount || 0}</strong></td>
                                    <td style="font-weight: 600;">${Utils.formatCurrency(emp.totalSales || 0)}</td>
                                    <td><small style="font-family: monospace; color: var(--color-text-secondary);">${emp.barcode || 'N/A'}</small></td>
                                    <td><span class="status-badge status-${emp.active ? 'disponible' : 'vendida'}">${emp.active ? 'Activo' : 'Inactivo'}</span></td>
                                    <td style="white-space: nowrap;">
                                        <button class="btn-secondary btn-sm" onclick="window.Employees.editEmployee('${emp.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-secondary btn-sm" onclick="window.Employees.generateBarcode('${emp.id}')" title="Ver Código de Barras">
                                            <i class="fas fa-barcode"></i>
                                        </button>
                                        ${emp.salesCount > 0 ? `
                                            <button class="btn-secondary btn-sm" onclick="window.Employees.showEmployeeStats('${emp.id}')" title="Estadísticas">
                                                <i class="fas fa-chart-line"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn-danger btn-sm" onclick="window.Employees.deleteEmployee('${emp.id}')" title="Eliminar">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                        ${employeesWithStats.length === 0 ? '<tr><td colspan="8" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">No hay empleados registrados</td></tr>' : ''}
                    </tbody>
                        </table>
                    </div>
                </div>
            `;
            // Verificar que el contenido se haya renderizado
            if (content && content.innerHTML.trim() === '') {
                console.warn('⚠️ El contenido se limpió después de renderizar, reintentando...');
                await Utils.delay(100);
                // Re-renderizar si el contenido está vacío
                if (content.innerHTML.trim() === '') {
                    console.error('❌ El contenido sigue vacío después de reintentar');
                }
            }
        } catch (e) {
            console.error('Error loading employees:', e);
            const errorMsg = e.message || 'Error desconocido al cargar empleados';
            Utils.showNotification(`Error al cargar empleados: ${errorMsg}`, 'error');
            // Mostrar error en el contenedor si existe
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center; color: var(--color-danger);">
                        <h3>Error al cargar empleados</h3>
                        <p>${errorMsg}</p>
                        <button class="btn-primary" onclick="window.Employees.loadEmployees()" style="margin-top: var(--spacing-md);">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            }
        }
        
        // Asegurar que el contenido sea visible después de cargar
        setTimeout(() => {
            const placeholder = document.getElementById('module-placeholder');
            const moduleContent = document.getElementById('module-content');
            const employeesContent = document.getElementById('employees-content');
            if (placeholder) {
                placeholder.style.display = 'block';
            }
            if (moduleContent) {
                moduleContent.style.display = 'block';
                moduleContent.style.visibility = 'visible';
            }
        }, 100);
    },

    filterEmployees(searchTerm = '', statusFilter = 'all', roleFilter = '', branchFilter = '') {
        const tbody = document.getElementById('employees-tbody');
        if (!tbody || !this.currentEmployeesData || !this.currentBranchesData) return;

        const employees = this.currentEmployeesData;
        const branches = this.currentBranchesData;
        const search = searchTerm.toLowerCase().trim();

        // Actualizar botones de estado activo
        const filterButtons = document.querySelectorAll('#employees-content .btn-secondary.btn-sm[data-filter]');
        filterButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === statusFilter) {
                btn.classList.add('active');
            }
        });

        const filtered = employees.filter(emp => {
            const branch = branches.find(b => b.id === emp.branch_id);
            
            // Búsqueda por texto
            const matchesSearch = !search ||
                (emp.name && emp.name.toLowerCase().includes(search)) ||
                (emp.role && emp.role.toLowerCase().includes(search)) ||
                (emp.barcode && emp.barcode.toLowerCase().includes(search)) ||
                (branch?.name && branch.name.toLowerCase().includes(search));

            // Filtro por estado
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && emp.active) ||
                (statusFilter === 'inactive' && !emp.active);

            // Filtro por rol
            const matchesRole = !roleFilter || emp.role === roleFilter;

            // Filtro por sucursal
            const matchesBranch = !branchFilter || emp.branch_id === branchFilter;

            return matchesSearch && matchesStatus && matchesRole && matchesBranch;
        });

        tbody.innerHTML = filtered.map(emp => {
            // Para admin/manager, mostrar todas las sucursales
            let branchDisplay = 'N/A';
            if (emp.role === 'admin' || emp.role === 'manager') {
                const branchIds = emp.branch_ids || (emp.branch_id ? [emp.branch_id] : []);
                if (branchIds.length > 0) {
                    const branchNames = branchIds.map(id => {
                        const b = branches.find(br => br.id === id);
                        return b?.name || id;
                    }).filter(Boolean);
                    branchDisplay = branchNames.length > 0 
                        ? branchNames.join(', ') + (branchIds.length > 1 ? ` (${branchIds.length})` : '')
                        : 'N/A';
                }
            } else {
                const branch = branches.find(b => b.id === emp.branch_id);
                branchDisplay = branch?.name || 'N/A';
            }
            
            return `
                <tr data-employee-id="${emp.id}" data-employee-active="${emp.active}" data-employee-role="${emp.role || ''}" data-branch-id="${emp.branch_id || ''}">
                    <td><strong>${emp.name}</strong></td>
                    <td><span class="status-badge" style="background: ${emp.role === 'admin' ? '#d32f2f' : emp.role === 'manager' ? '#1976d2' : '#388e3c'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${emp.role || 'N/A'}</span></td>
                    <td>${branchDisplay}</td>
                    <td style="text-align: center;"><strong>${emp.salesCount || 0}</strong></td>
                    <td style="font-weight: 600;">${Utils.formatCurrency(emp.totalSales || 0)}</td>
                    <td><small style="font-family: monospace; color: var(--color-text-secondary);">${emp.barcode || 'N/A'}</small></td>
                    <td><span class="status-badge status-${emp.active ? 'disponible' : 'vendida'}">${emp.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td style="white-space: nowrap;">
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.edit') ? `
                            <button class="btn-secondary btn-sm" onclick="window.Employees.editEmployee('${emp.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        <button class="btn-secondary btn-sm" onclick="window.Employees.generateBarcode('${emp.id}')" title="Ver Código de Barras">
                            <i class="fas fa-barcode"></i>
                        </button>
                        ${emp.salesCount > 0 ? `
                            <button class="btn-secondary btn-sm" onclick="window.Employees.showEmployeeStats('${emp.id}')" title="Estadísticas">
                                <i class="fas fa-chart-line"></i>
                            </button>
                        ` : ''}
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.delete') ? `
                            <button class="btn-danger btn-sm" onclick="window.Employees.deleteEmployee('${emp.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="8" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },
    
    
    async displayEmployeeStats(employees) {
        let statsContainer = document.getElementById('employees-stats');
        if (!statsContainer) {
            const content = document.getElementById('employees-content');
            if (content && content.parentNode) {
                statsContainer = document.createElement('div');
                statsContainer.id = 'employees-stats';
                statsContainer.style.marginBottom = 'var(--spacing-xl)';
                content.parentNode.insertBefore(statsContainer, content);
            }
        }
        
        if (!statsContainer) return;
        
        const activeEmployees = employees.filter(e => e.active).length;
        const totalSales = employees.reduce((sum, e) => sum + (e.totalSales || 0), 0);
        const totalSalesCount = employees.reduce((sum, e) => sum + (e.salesCount || 0), 0);
        const avgSalesPerEmployee = activeEmployees > 0 ? totalSales / activeEmployees : 0;
        
        // Top empleados por ventas
        const topEmployees = employees
            .filter(e => e.totalSales > 0)
            .sort((a, b) => b.totalSales - a.totalSales)
            .slice(0, 5);
        
        const maxEmployeeSales = Math.max(...topEmployees.map(e => e.totalSales), 1);
        
        statsContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                    <div class="kpi-label">Total Empleados</div>
                    <div class="kpi-value">${employees.length}</div>
                </div>
                <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                    <div class="kpi-label">Empleados Activos</div>
                    <div class="kpi-value">${activeEmployees}</div>
                </div>
                <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                    <div class="kpi-label">Total Ventas</div>
                    <div class="kpi-value">${totalSalesCount}</div>
                </div>
                <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                    <div class="kpi-label">Ingresos Totales</div>
                    <div class="kpi-value">${Utils.formatCurrency(totalSales)}</div>
                </div>
                <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                    <div class="kpi-label">Promedio por Empleado</div>
                    <div class="kpi-value">${Utils.formatCurrency(avgSalesPerEmployee)}</div>
                </div>
            </div>
            
            ${topEmployees.length > 0 ? `
                <div class="dashboard-section" style="width: 100%; max-width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">Top Empleados por Ventas</h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm); width: 100%; box-sizing: border-box;">
                        ${topEmployees.map((emp, idx) => {
                            const width = maxEmployeeSales > 0 ? (emp.totalSales / maxEmployeeSales * 100) : 0;
                            return `
                                <div style="margin-bottom: var(--spacing-sm); min-width: 0; width: 100%; box-sizing: border-box;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; min-width: 0;">
                                        <div style="min-width: 0; overflow: hidden; text-overflow: ellipsis;">
                                            <span style="font-weight: 600; color: var(--color-primary); font-size: 10px;">#${idx + 1}</span>
                                            <span style="margin-left: var(--spacing-xs); font-weight: 600; font-size: 11px;">${emp.name}</span>
                                            <div style="font-size: 9px; color: var(--color-text-secondary);">
                                                ${emp.salesCount} ventas • Prom: ${Utils.formatCurrency(emp.avgSale || 0)}
                                            </div>
                                        </div>
                                        <div style="font-size: 14px; font-weight: 600; white-space: nowrap; margin-left: var(--spacing-xs);">
                                            ${Utils.formatCurrency(emp.totalSales)}
                                        </div>
                                    </div>
                                    <div style="width: 100%; height: 18px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden; box-sizing: border-box;">
                                        <div style="width: ${width}%; height: 100%; background: var(--gradient-accent); transition: width 0.3s;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    },
    
    async showEmployeeStats(employeeId) {
        const employee = await DB.get('employees', employeeId);
        if (!employee) return;
        
        // Verificar si es master_admin
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        // Obtener sucursal actual (para usuarios no master_admin)
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        
        // Cargar ventas filtradas
        const viewAllBranches = isMasterAdmin;
        const allSales = await DB.getAll('sales', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Filtro estricto adicional si no es master_admin
        const sales = isMasterAdmin ? allSales : 
            allSales.filter(s => s.branch_id && String(s.branch_id) === String(currentBranchId));
        
        const employeeSales = sales.filter(s => {
            // Buscar ventas relacionadas con este empleado
            return s.employee_id === employeeId;
        });
        
        const completedSales = employeeSales.filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')));
        const totalSales = completedSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const avgSale = completedSales.length > 0 ? totalSales / completedSales.length : 0;
        
        // Ventas por mes
        const monthlyStats = {};
        completedSales.forEach(sale => {
            const saleDate = new Date(sale.created_at);
            const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { count: 0, total: 0 };
            }
            monthlyStats[monthKey].count += 1;
            monthlyStats[monthKey].total += sale.total || 0;
        });
        
        const monthlyData = Object.entries(monthlyStats)
            .map(([month, stats]) => ({ month, ...stats }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6);
        
        const maxMonthly = Math.max(...monthlyData.map(m => m.total), 1);
        
        const body = `
            <div class="dashboard-section">
                <h3>Estadísticas de ${employee.name}</h3>
                <div class="dashboard-grid" style="margin-bottom: var(--spacing-lg);">
                    <div class="kpi-card">
                        <div class="kpi-label">Total Ventas</div>
                        <div class="kpi-value">${completedSales.length}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Vendido</div>
                        <div class="kpi-value">${Utils.formatCurrency(totalSales)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Ticket Promedio</div>
                        <div class="kpi-value">${Utils.formatCurrency(avgSale)}</div>
                    </div>
                </div>
                
                ${monthlyData.length > 0 ? `
                    <h3>Ventas por Mes</h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-lg); border-radius: var(--radius-md); margin-top: var(--spacing-md);">
                        <div style="display: flex; align-items: flex-end; gap: 3px; height: 140px;">
                            ${monthlyData.map(month => {
                                const height = maxMonthly > 0 ? (month.total / maxMonthly * 100) : 0;
                                const monthName = new Date(month.month + '-01').toLocaleDateString('es', { month: 'short' });
                                return `
                                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                        <div style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                                            <div style="width: 100%; background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-accent) 100%); 
                                                border-radius: var(--radius-xs) var(--radius-xs) 0 0; 
                                                height: ${height}%; 
                                                min-height: ${month.total > 0 ? '3px' : '0'};"></div>
                                        </div>
                                        <div style="font-size: 9px; color: var(--color-text-secondary); text-align: center;">
                                            <div>${monthName}</div>
                                            <div style="font-weight: 600; color: var(--color-text); margin-top: 2px; font-size: 10px;">${Utils.formatCurrency(month.total)}</div>
                                            <div style="font-size: 8px; color: var(--color-text-secondary);">${month.count}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        UI.showModal(`Estadísticas: ${employee.name}`, body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
    },

    async loadUsers() {
        const content = document.getElementById('employees-content');
        if (!content) return;

        try {
            let users = [];
            let employees = [];
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' ||
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = !!isAdmin;

            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getEmployees) {
                try {
                    const apiEmployees = await API.getEmployees({ branch_id: viewAllBranches ? null : currentBranchId });
                    if (Array.isArray(apiEmployees)) {
                        employees = apiEmployees;
                        users = apiEmployees
                            .filter(row => row.user_id)
                            .map(row => ({
                                id: row.user_id,
                                username: row.username,
                                role: row.user_role || row.role,
                                permissions: row.user_permissions != null && Array.isArray(row.user_permissions) ? row.user_permissions : [],
                                permissions_by_branch: (row.user_permissions_by_branch != null && typeof row.user_permissions_by_branch === 'object') ? row.user_permissions_by_branch : {},
                                employee_id: row.id,
                                active: row.user_active !== false
                            }));
                        for (const u of users) {
                            try {
                                const existing = await DB.get('users', u.id);
                                await DB.put('users', { ...existing, ...u });
                            } catch (e) {
                                console.warn('No se pudo actualizar usuario en IndexedDB:', e);
                            }
                        }
                    }
                } catch (apiErr) {
                    console.warn('Error cargando usuarios desde API, usando IndexedDB:', apiErr);
                }
            }

            if (users.length === 0) {
                users = await DB.getAll('users') || [];
            }
            if (employees.length === 0) {
                employees = await DB.getAll('employees', null, null, {
                    filterByBranch: !viewAllBranches,
                    branchIdField: 'branch_id'
                }) || [];
                if (!viewAllBranches && currentBranchId) {
                    const normalizedBranchId = String(currentBranchId);
                    employees = employees.filter(emp => {
                        if (emp.branch_id) return String(emp.branch_id) === normalizedBranchId;
                        if (emp.branch_ids && Array.isArray(emp.branch_ids)) return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                        return true;
                    });
                }
            }

            this.currentUsersData = users;
            this.currentEmployeesForUsers = employees;

            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-user-shield"></i> Lista de Usuarios
                        </h3>
                        <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                            <button class="btn-primary btn-sm" onclick="window.Employees.showAddUserForm()">
                                <i class="fas fa-plus"></i> Nuevo
                            </button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                        <input type="text" id="user-search-input" class="form-input" placeholder="Buscar por username, nombre de empleado o rol..." 
                            onkeyup="window.Employees.filterUsers(this.value)">
                    </div>
                    <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                        <button class="btn-secondary btn-sm active" data-filter="all" onclick="window.Employees.filterUsers(document.getElementById('user-search-input')?.value || '', 'all')" style="flex: 1; min-width: 100px;">
                            Todos (${users.length})
                        </button>
                        <button class="btn-secondary btn-sm" data-filter="active" onclick="window.Employees.filterUsers(document.getElementById('user-search-input')?.value || '', 'active')" style="flex: 1; min-width: 100px;">
                            Activos (${users.filter(u => u.active).length})
                        </button>
                        <button class="btn-secondary btn-sm" data-filter="inactive" onclick="window.Employees.filterUsers(document.getElementById('user-search-input')?.value || '', 'inactive')" style="flex: 1; min-width: 100px;">
                            Inactivos (${users.filter(u => !u.active).length})
                        </button>
                        <select id="user-role-filter" class="form-select" style="flex: 1; min-width: 150px;" onchange="window.Employees.filterUsers(document.getElementById('user-search-input')?.value || '', document.querySelector('.btn-secondary.btn-sm.active')?.dataset.filter || 'all', this.value)">
                            <option value="">Todos los roles</option>
                            <option value="admin">Administrador</option>
                            <option value="manager">Gerente</option>
                            <option value="seller">Vendedor</option>
                            <option value="cashier">Cajero</option>
                        </select>
                    </div>
                </div>
                <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table" id="users-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Empleado</th>
                                <th>Rol</th>
                                <th>Permisos</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="users-tbody">
                            ${users.map(user => {
                                const emp = employees.find(e => e.id === user.employee_id);
                                return `
                                    <tr data-user-id="${user.id}" data-user-active="${user.active}" data-user-role="${user.role || ''}" data-username="${user.username?.toLowerCase() || ''}" data-employee-name="${emp?.name?.toLowerCase() || ''}">
                                        <td><strong>${user.username}</strong></td>
                                        <td>${emp?.name || '<span style="color: var(--color-danger);">Sin empleado</span>'}</td>
                                        <td><span class="status-badge" style="background: ${user.role === 'admin' ? '#d32f2f' : user.role === 'manager' ? '#1976d2' : '#388e3c'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${user.role || 'N/A'}</span></td>
                                        <td><small>${user.permissions?.length || 0} permiso${user.permissions?.length !== 1 ? 's' : ''}</small></td>
                                        <td><span class="status-badge status-${user.active ? 'disponible' : 'vendida'}">${user.active ? 'Activo' : 'Inactivo'}</span></td>
                                        <td style="white-space: nowrap;">
                                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.edit_users') ? `
                                                <button class="btn-secondary btn-sm" onclick="window.Employees.editUser('${user.id}')" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                            ` : ''}
                                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.reset_pin') ? `
                                                <button class="btn-secondary btn-sm" onclick="window.Employees.resetPin('${user.id}')" title="Restablecer PIN">
                                                    <i class="fas fa-key"></i>
                                                </button>
                                            ` : ''}
                                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.delete') ? `
                                                <button class="btn-danger btn-sm" onclick="window.Employees.deleteUser('${user.id}')" title="Eliminar">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            ` : ''}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            ${users.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">No hay usuarios registrados</td></tr>' : ''}
                        </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading users:', e);
            Utils.showNotification('Error al cargar usuarios: ' + e.message, 'error');
        }
    },

    filterUsers(searchTerm = '', statusFilter = 'all', roleFilter = '') {
        const tbody = document.getElementById('users-tbody');
        if (!tbody || !this.currentUsersData || !this.currentEmployeesForUsers) return;

        const users = this.currentUsersData;
        const employees = this.currentEmployeesForUsers;
        const search = searchTerm.toLowerCase().trim();

        // Actualizar botones de estado activo
        const filterButtons = document.querySelectorAll('#employees-content .btn-secondary.btn-sm[data-filter]');
        filterButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === statusFilter) {
                btn.classList.add('active');
            }
        });

        const filtered = users.filter(user => {
            const emp = employees.find(e => e.id === user.employee_id);
            
            // Búsqueda por texto
            const matchesSearch = !search ||
                (user.username && user.username.toLowerCase().includes(search)) ||
                (user.role && user.role.toLowerCase().includes(search)) ||
                (emp?.name && emp.name.toLowerCase().includes(search));

            // Filtro por estado
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && user.active) ||
                (statusFilter === 'inactive' && !user.active);

            // Filtro por rol
            const matchesRole = !roleFilter || user.role === roleFilter;

            return matchesSearch && matchesStatus && matchesRole;
        });

        tbody.innerHTML = filtered.map(user => {
            const emp = employees.find(e => e.id === user.employee_id);
            return `
                <tr data-user-id="${user.id}" data-user-active="${user.active}" data-user-role="${user.role || ''}" data-username="${user.username?.toLowerCase() || ''}" data-employee-name="${emp?.name?.toLowerCase() || ''}">
                    <td><strong>${user.username}</strong></td>
                    <td>${emp?.name || '<span style="color: var(--color-danger);">Sin empleado</span>'}</td>
                    <td><span class="status-badge" style="background: ${user.role === 'admin' ? '#d32f2f' : user.role === 'manager' ? '#1976d2' : '#388e3c'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${user.role || 'N/A'}</span></td>
                    <td><small>${user.permissions?.length || 0} permiso${user.permissions?.length !== 1 ? 's' : ''}</small></td>
                    <td><span class="status-badge status-${user.active ? 'disponible' : 'vendida'}">${user.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td style="white-space: nowrap;">
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.edit_users') ? `
                            <button class="btn-secondary btn-sm" onclick="window.Employees.editUser('${user.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.reset_pin') ? `
                            <button class="btn-secondary btn-sm" onclick="window.Employees.resetPin('${user.id}')" title="Restablecer PIN">
                                <i class="fas fa-key"></i>
                            </button>
                        ` : ''}
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('employees.delete') ? `
                            <button class="btn-danger btn-sm" onclick="window.Employees.deleteUser('${user.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },

    async showAddEmployeeForm(employeeId = null) {
        // Verificar permisos
        if (employeeId) {
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.edit')) {
                Utils.showNotification('No tienes permiso para editar empleados', 'error');
                return;
            }
        } else {
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.add')) {
                Utils.showNotification('No tienes permiso para agregar empleados', 'error');
                return;
            }
        }
        const employee = employeeId ? await DB.get('employees', employeeId) : null;
        const branches = await DB.getAll('catalog_branches') || [];

        if (branches.length === 0 && !employeeId) {
            Utils.showNotification('Debes crear al menos una sucursal primero', 'error');
            return;
        }

        const body = `
            <form id="employee-form" style="max-width: 600px;">
                <div class="form-group">
                    <label>Nombre Completo *</label>
                    <input type="text" id="emp-name" class="form-input" value="${employee?.name || ''}" required 
                        placeholder="Ej: Juan Pérez García" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Nombre completo del empleado</small>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
                    <div class="form-group">
                        <label>Rol *</label>
                        <select id="emp-role" class="form-select" required>
                            <option value="">Seleccionar rol...</option>
                            <option value="seller" ${employee?.role === 'seller' ? 'selected' : ''}>Vendedor</option>
                            <option value="admin" ${employee?.role === 'admin' ? 'selected' : ''}>Administrador</option>
                            <option value="manager" ${employee?.role === 'manager' ? 'selected' : ''}>Gerente</option>
                            <option value="cashier" ${employee?.role === 'cashier' ? 'selected' : ''}>Cajero</option>
                            <option value="master_admin" ${employee?.role === 'master_admin' ? 'selected' : ''}>Master Admin</option>
                        </select>
                        <small style="color: var(--color-text-secondary); font-size: 10px;">
                            Master Admin: Acceso completo a todas las sucursales
                        </small>
                    </div>
                    <div class="form-group" id="branch-single-container">
                        <label>Sucursal</label>
                        <select id="emp-branch" class="form-select">
                            <option value="">Sin sucursal</option>
                            ${branches.filter(b => b.active).map(b => `<option value="${b.id}" ${employee?.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="branch-multiple-container" style="display: none;">
                        <label>Sucursales Asignadas</label>
                        <div style="max-height: 150px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); padding: var(--spacing-xs);">
                            ${branches.filter(b => b.active).map(b => {
                                const isSelected = employee?.branch_ids?.includes(b.id) || employee?.branch_id === b.id;
                                return `
                                    <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); cursor: pointer; border-radius: var(--radius-xs); transition: background 0.2s;" 
                                           onmouseover="this.style.background='var(--color-bg-secondary)'" 
                                           onmouseout="this.style.background='transparent'">
                                        <input type="checkbox" class="branch-checkbox" value="${b.id}" ${isSelected ? 'checked' : ''}>
                                        <span style="font-size: 12px;">${b.name}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                        <small style="color: var(--color-text-secondary); font-size: 10px;">
                            Selecciona las sucursales a las que tendrá acceso este empleado
                        </small>
                    </div>
                </div>
                <div class="form-group">
                    <label>Código de Barras</label>
                    <div style="display: flex; gap: var(--spacing-xs);">
                        <input type="text" id="emp-barcode" class="form-input" value="${employee?.barcode || ''}" 
                            placeholder="Se generará automáticamente" maxlength="50" style="flex: 1;">
                        <button type="button" class="btn-secondary btn-sm" onclick="window.Employees.generateBarcodeForForm()" style="white-space: nowrap;">
                            <i class="fas fa-barcode"></i> Generar
                        </button>
                    </div>
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Código único para identificar al empleado</small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="emp-active" ${employee?.active !== false ? 'checked' : ''}>
                        <span>Empleado activo</span>
                    </label>
                </div>
                ${employee?.barcode ? `
                <div style="text-align: center; margin: var(--spacing-md) 0; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Vista Previa del Código de Barras</div>
                    <svg id="emp-barcode-preview" style="max-width: 100%;"></svg>
                </div>
                ` : ''}
                ${!employeeId ? `
                <div style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-top: var(--spacing-md); border-left: 3px solid var(--color-primary);">
                    <div style="font-size: 11px; font-weight: 600; margin-bottom: var(--spacing-xs); color: var(--color-primary);">
                        <i class="fas fa-info-circle"></i> Creación de Usuario (Login)
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); line-height: 1.4;">
                        Después de guardar el empleado, se te preguntará si deseas crear un usuario para que pueda iniciar sesión en el sistema.
                        <br><br>
                        El sistema generará automáticamente:
                        <br>• Username basado en el nombre
                        <br>• PIN inicial: <strong>1234</strong> (debe cambiarse después del primer login)
                        <br>• Permisos según el rol seleccionado
                    </div>
                </div>
                ` : ''}
            </form>
        `;

        UI.showModal(employeeId ? 'Editar Empleado' : 'Nuevo Empleado', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveEmployee(employeeId) }
        ]);

        // Configurar listener para mostrar/ocultar selectores según el rol
        setTimeout(() => {
            const roleInput = document.getElementById('emp-role');
            const singleContainer = document.getElementById('branch-single-container');
            const multipleContainer = document.getElementById('branch-multiple-container');
            
            const updateBranchSelectors = () => {
                if (!roleInput || !singleContainer || !multipleContainer) return;
                
                const role = roleInput.value;
                if (role === 'master_admin' || role === 'admin' || role === 'manager') {
                    singleContainer.style.display = 'none';
                    multipleContainer.style.display = 'block';
                } else {
                    singleContainer.style.display = 'block';
                    multipleContainer.style.display = 'none';
                }
            };
            
            if (roleInput) {
                roleInput.addEventListener('change', updateBranchSelectors);
                // Trigger inicial
                updateBranchSelectors();
            }
            
            // Focus en el nombre
            document.getElementById('emp-name')?.focus();
            if (employeeId && document.getElementById('emp-name')) {
                document.getElementById('emp-name').select();
            }
        }, 100);

        if (employee?.barcode) {
            setTimeout(() => {
                if (typeof BarcodeManager !== 'undefined') {
                    BarcodeManager.generateCode128(employee.barcode, 'emp-barcode-preview');
                }
            }, 100);
        }
    },

    generateBarcodeForForm() {
        const name = document.getElementById('emp-name').value;
        if (!name) {
            Utils.showNotification('Ingresa un nombre primero', 'error');
            return;
        }
        const barcode = `EMP${name.toUpperCase().replace(/\s+/g, '').substring(0, 6)}${Date.now().toString().slice(-4)}`;
        document.getElementById('emp-barcode').value = barcode;
    },

    async saveEmployee(employeeId) {
        try {
            const form = document.getElementById('employee-form');
            if (!form || !form.checkValidity()) {
                form?.reportValidity();
                return;
            }

            const nameInput = document.getElementById('emp-name');
            const roleInput = document.getElementById('emp-role');
            const barcodeInput = document.getElementById('emp-barcode');
            const branchInput = document.getElementById('emp-branch');
            const activeInput = document.getElementById('emp-active');

            if (!nameInput || !nameInput.value.trim()) {
                Utils.showNotification('El nombre es requerido', 'error');
                return;
            }

            if (!roleInput || !roleInput.value) {
                Utils.showNotification('El rol es requerido', 'error');
                return;
            }

            const name = nameInput.value.trim();
            const role = roleInput.value;
            const barcode = barcodeInput?.value.trim() || '';
            
            // Determinar branch_id y branch_ids según el rol
            let branchId = null;
            let branchIds = [];
            
            // Verificar si el contenedor de múltiples sucursales está visible
            const multipleContainer = document.getElementById('branch-multiple-container');
            const singleContainer = document.getElementById('branch-single-container');
            const isMultipleVisible = multipleContainer && multipleContainer.style.display !== 'none';
            
            // Si el rol permite múltiples sucursales, usar branch_ids
            if (role === 'master_admin' || role === 'admin' || role === 'manager') {
                // Intentar leer checkboxes primero
                const branchCheckboxes = document.querySelectorAll('.branch-checkbox:checked');
                if (branchCheckboxes.length > 0) {
                    branchIds = Array.from(branchCheckboxes).map(cb => cb.value).filter(id => id);
                    // Si tiene múltiples sucursales, usar la primera como branch_id principal
                    branchId = branchIds.length > 0 ? branchIds[0] : null;
                } else {
                    // Fallback: si no hay checkboxes marcadas, verificar el select simple
                    // Esto puede pasar si el UI no se actualizó correctamente
                    if (branchInput?.value) {
                        branchIds = [branchInput.value];
                        branchId = branchInput.value;
                        console.warn('⚠️ No se encontraron checkboxes marcadas, usando select simple');
                    }
                }
                
                // Validar que al menos una sucursal esté seleccionada (excepto master_admin)
                if (role !== 'master_admin' && branchIds.length === 0) {
                    Utils.showNotification('Debes seleccionar al menos una sucursal para este rol', 'error');
                    return;
                }
            } else {
                // Roles normales: solo una sucursal (usar el select simple)
                if (branchInput?.value) {
                    branchId = branchInput.value;
                    branchIds = [branchId];
                }
            }
            
            const active = activeInput ? activeInput.checked : true;

            // Validar que no haya duplicados (nombre + rol)
            if (!employeeId) {
                const existing = await DB.getAll('employees') || [];
                const duplicate = existing.find(e => 
                    e.name.toLowerCase() === name.toLowerCase() && 
                    e.role === role &&
                    e.id !== employeeId
                );
                if (duplicate) {
                    Utils.showNotification('Ya existe un empleado con ese nombre y rol', 'error');
                    return;
                }
            }

            // Generar código de barras si no existe
            let finalBarcode = barcode;
            if (!finalBarcode) {
                finalBarcode = `EMP${name.toUpperCase().replace(/\s+/g, '').substring(0, 6)}${Date.now().toString().slice(-4)}`;
            }

            // Generar código único si no existe
            let code = employeeId ? (await DB.get('employees', employeeId))?.code : null;
            if (!code) {
                code = `EMP${name.toUpperCase().replace(/\s+/g, '').substring(0, 6)}${Date.now().toString().slice(-4)}`;
            }

            const employee = {
                id: employeeId || Utils.generateId(),
                code: code,
                name: name,
                role: role,
                branch_id: branchId || null,
                branch_ids: branchIds.length > 0 ? branchIds : (branchId ? [branchId] : []),
                barcode: finalBarcode,
                active: active,
                created_at: employeeId ? (await DB.get('employees', employeeId))?.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Intentar guardar en el backend si está disponible
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token) {
                    if (employeeId) {
                        // Actualizar empleado existente
                        const updatedEmployee = await API.updateEmployee(employee.id, employee);
                        // Actualizar también en IndexedDB con los datos del servidor
                        await DB.put('employees', updatedEmployee);
                    } else {
                        // Crear nuevo empleado
                        const createdEmployee = await API.createEmployee(employee);
                        // Actualizar el ID del empleado con el del servidor
                        employee.id = createdEmployee.id;
                        await DB.put('employees', createdEmployee);
                    }
                } else {
                    // Sin conexión: guardar localmente y agregar a cola
                    await DB.put('employees', employee);
                    await SyncManager.addToQueue('employee', employee.id);
                }
            } catch (apiError) {
                console.warn('Error guardando empleado en API, guardando localmente:', apiError);
                // Fallback: guardar localmente y agregar a cola
                await DB.put('employees', employee);
                await SyncManager.addToQueue('employee', employee.id);
            }

            // Verificar que se guardó correctamente
            const savedEmployee = await DB.get('employees', employee.id);
            if (!savedEmployee || savedEmployee.name !== name) {
                throw new Error('Error al guardar el empleado');
            }

            // Si es un empleado nuevo, preguntar si quiere crear usuario automáticamente
            if (!employeeId) {
                const createUser = await Utils.confirm(
                    '¿Deseas crear un usuario (login) para este empleado ahora?\n\n' +
                    'El sistema creará:\n' +
                    '- Username: basado en el nombre\n' +
                    '- PIN inicial: 1234 (se puede cambiar después)\n' +
                    '- Rol: según el rol del empleado'
                );
                
                if (createUser) {
                    await this.createUserForEmployee(savedEmployee);
                }
            }

            // Generar nómina automática si el empleado tiene salario configurado y está activo
            if (typeof Costs !== 'undefined' && employee.active && employee.branch_id && employee.salary > 0) {
                try {
                    // Generar nómina semanal para la semana actual
                    await Costs.generateWeeklyPayroll(employee.branch_id);
                } catch (error) {
                    console.error('Error generando nómina automática:', error);
                    // No bloquear el guardado si falla la generación de nómina
                }
            }

            Utils.showNotification(employeeId ? 'Empleado actualizado correctamente' : 'Empleado agregado correctamente', 'success');
            UI.closeModal();
            await this.loadEmployees();
        } catch (e) {
            console.error('Error guardando empleado:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async editEmployee(employeeId) {
        await this.showAddEmployeeForm(employeeId);
    },

    async generateBarcode(employeeId) {
        const employee = await DB.get('employees', employeeId);
        if (!employee) return;

        if (!employee.barcode) {
            const barcode = `EMP${employee.name.toUpperCase().replace(/\s+/g, '').substring(0, 6)}${Date.now().toString().slice(-4)}`;
            employee.barcode = barcode;
            await DB.put('employees', employee);
        }

        await BarcodeManager.printBarcodeLabel({
            sku: employee.barcode,
            name: employee.name,
            barcode: employee.barcode,
            price: 0
        });
    },

    /**
     * Crear usuario automáticamente para un empleado
     * @param {Object} employee - Objeto empleado
     */
    async createUserForEmployee(employee) {
        try {
            // Verificar si ya existe un usuario para este empleado
            const existingUsers = await DB.getAll('users') || [];
            const existingUser = existingUsers.find(u => u.employee_id === employee.id);
            
            if (existingUser) {
                Utils.showNotification('Este empleado ya tiene un usuario asignado', 'warning');
                return;
            }

            // Generar username basado en el nombre
            const username = employee.name.toLowerCase()
                .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
                .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
                .replace(/\s+/g, '')
                .substring(0, 20);

            // Verificar que el username no esté en uso
            let finalUsername = username;
            let counter = 1;
            while (existingUsers.some(u => u.username === finalUsername)) {
                finalUsername = `${username}${counter}`;
                counter++;
            }

            // Crear PIN por defecto (1234)
            const pinHash = await Utils.hashPin('1234');

            // Determinar permisos según el rol usando PermissionManager
            let permissions = [];
            if (typeof PermissionManager !== 'undefined') {
                if (employee.role === 'admin' || employee.role === 'master_admin') {
                    permissions = ['all'];
                } else {
                    permissions = PermissionManager.getRolePermissions(employee.role) || [];
                }
            } else {
                // Fallback si PermissionManager no está disponible
                if (employee.role === 'admin' || employee.role === 'master_admin') {
                    permissions = ['all'];
                } else {
                    permissions = ['pos.view', 'inventory.view'];
                }
            }

            // El rol del usuario debe coincidir con el rol del empleado
            // Si el empleado es master_admin, el usuario también debe ser master_admin
            const userRole = employee.role === 'master_admin' ? 'master_admin' : (employee.role || 'seller');

            const user = {
                id: Utils.generateId(),
                username: finalUsername,
                employee_id: employee.id,
                role: userRole,
                pin_hash: pinHash,
                permissions: permissions,
                active: employee.active !== false,
                created_at: new Date().toISOString()
            };

            await DB.put('users', user);
            await SyncManager.addToQueue('user', user.id);

            // Mostrar notificación con detalles del usuario creado
            const notificationMessage = `✅ Usuario creado exitosamente\n\n` +
                `👤 Username: ${finalUsername}\n` +
                `🔐 PIN inicial: 1234\n` +
                `👔 Rol: ${employee.role || 'seller'}\n\n` +
                `⚠️ IMPORTANTE: Cambiar el PIN después del primer login`;
            
            await Utils.alert(notificationMessage, 'Usuario Creado');
            
            return user;
        } catch (e) {
            console.error('Error creando usuario para empleado:', e);
            Utils.showNotification('Error al crear usuario: ' + e.message, 'error');
        }
    },

    async showAddUserForm(userId = null) {
        // Verificar permisos
        if (userId) {
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.edit_users')) {
                Utils.showNotification('No tienes permiso para editar usuarios', 'error');
                return;
            }
        } else {
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.create_users')) {
                Utils.showNotification('No tienes permiso para crear usuarios', 'error');
                return;
            }
        }
        const user = userId ? await DB.get('users', userId) : null;
        this._editingPermissionsByBranch = (user?.permissions_by_branch && typeof user.permissions_by_branch === 'object') ? { ...user.permissions_by_branch } : {};

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' ||
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = !!isAdmin;

        let employees = await DB.getAll('employees', null, null, {
            filterByBranch: !viewAllBranches,
            branchIdField: 'branch_id'
        }) || [];
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            employees = employees.filter(emp => {
                if (emp.branch_id) return String(emp.branch_id) === normalizedBranchId;
                if (emp.branch_ids && Array.isArray(emp.branch_ids)) return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                return true;
            });
        }

        let branches = [];
        if (typeof API !== 'undefined' && API.baseURL && API.token && API.getBranches) {
            try {
                branches = await API.getBranches() || [];
            } catch (e) {
                console.warn('No se pudieron cargar sucursales para permisos por sucursal:', e);
            }
        }
        if (branches.length === 0 && typeof DB !== 'undefined') {
            try {
                branches = await DB.getAll('catalog_branches') || await DB.getAll('branches') || [];
            } catch (e) {}
        }

        const permissions = [
            'descuentos', 'cancelaciones', 'devoluciones', 'editar_costo',
            'export', 'tipo_cambio', 'catalogos', 'ver_utilidades'
        ];

        const branchPermsSection = userId && branches.length > 0 ? `
                <div class="form-group" style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                    <label><i class="fas fa-store"></i> Permisos por sucursal</label>
                    <p style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">Asigna permisos distintos por sucursal. Si no defines ninguno para una sucursal, se usan los permisos generales de arriba.</p>
                    <select id="user-branch-for-perms" class="form-select" style="margin-bottom: var(--spacing-sm);" onchange="window.Employees.refreshBranchPermsCheckboxes()">
                        <option value="">Elegir sucursal...</option>
                        ${branches.map(b => `<option value="${b.id}">${b.name || b.code || b.id}</option>`).join('')}
                    </select>
                    <div id="branch-perms-checkboxes" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">
                        ${permissions.map(perm => `
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" class="branch-perm-cb" data-perm-type="branch" value="${perm}">
                                ${perm.replace(/_/g, ' ')}
                            </label>
                        `).join('')}
                    </div>
                    <button type="button" class="btn-secondary btn-sm" onclick="window.Employees.applyBranchPerms()">
                        <i class="fas fa-check"></i> Aplicar a esta sucursal
                    </button>
                </div>
        ` : '';

        const body = `
            <form id="user-form">
                <div class="form-group">
                    <label>Username *</label>
                    <input type="text" id="user-username" class="form-input" value="${user?.username || ''}" required>
                </div>
                <div class="form-group">
                    <label>Empleado</label>
                    <select id="user-employee" class="form-select">
                        <option value="">Seleccionar...</option>
                        ${employees.map(e => `<option value="${e.id}" ${user?.employee_id === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Rol</label>
                    <select id="user-role" class="form-select">
                        <option value="seller" ${user?.role === 'seller' ? 'selected' : ''}>Vendedor</option>
                        <option value="manager" ${user?.role === 'manager' ? 'selected' : ''}>Gerente</option>
                        <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
                        ${(typeof UserManager !== 'undefined' && UserManager.currentUser?.role === 'master_admin') ? `<option value="master_admin" ${user?.role === 'master_admin' ? 'selected' : ''}>Administrador maestro</option>` : ''}
                    </select>
                </div>
                <div class="form-group">
                    <label>PIN (dejar vacío para mantener actual)</label>
                    <input type="password" id="user-pin" class="form-input" maxlength="6" placeholder="6 dígitos">
                </div>
                <div class="form-group">
                    <label>Permisos (generales)</label>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
                        ${permissions.map(perm => `
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" data-perm-type="global" value="${perm}" ${user?.permissions?.includes(perm) ? 'checked' : ''}>
                                ${perm.replace(/_/g, ' ')}
                            </label>
                        `).join('')}
                    </div>
                </div>
                ${branchPermsSection}
                <div class="form-group">
                    <label>Estado</label>
                    <select id="user-active" class="form-select">
                        <option value="true" ${user?.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${user?.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveUser('${userId || ''}')">Guardar</button>
        `;

        UI.showModal(userId ? 'Editar Usuario' : 'Nuevo Usuario', body, footer);
        if (userId && document.getElementById('user-branch-for-perms')) {
            setTimeout(() => this.refreshBranchPermsCheckboxes(), 50);
        }
    },

    refreshBranchPermsCheckboxes() {
        const sel = document.getElementById('user-branch-for-perms');
        const branchId = sel?.value;
        if (!branchId || !this._editingPermissionsByBranch) return;
        const perms = this._editingPermissionsByBranch[branchId];
        const arr = Array.isArray(perms) ? perms : [];
        document.querySelectorAll('#user-form .branch-perm-cb').forEach(cb => {
            cb.checked = arr.includes(cb.value);
        });
    },

    applyBranchPerms() {
        const sel = document.getElementById('user-branch-for-perms');
        const branchId = sel?.value;
        if (!branchId) {
            Utils.showNotification('Elige una sucursal', 'warning');
            return;
        }
        const checkboxes = document.querySelectorAll('#user-form .branch-perm-cb:checked');
        const perms = Array.from(checkboxes).map(cb => cb.value);
        if (!this._editingPermissionsByBranch) this._editingPermissionsByBranch = {};
        this._editingPermissionsByBranch[branchId] = perms;
        Utils.showNotification('Permisos aplicados a esta sucursal. Guarda el usuario para enviar los cambios.', 'success');
    },

    async saveUser(userId) {
        const form = document.getElementById('user-form');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const pinInput = document.getElementById('user-pin').value;
        let pinHash = null;
        if (pinInput && pinInput.length >= 4) {
            pinHash = await Utils.hashPin(pinInput);
        } else if (userId) {
            const existing = await DB.get('users', userId);
            pinHash = existing?.pin_hash;
        }

        const globalCheckboxes = document.querySelectorAll('#user-form input[data-perm-type="global"]:checked');
        const permissions = Array.from(globalCheckboxes).map(cb => cb.value);
        const username = document.getElementById('user-username').value.trim();
        const employeeId = document.getElementById('user-employee').value || null;
        const role = document.getElementById('user-role').value;
        const active = document.getElementById('user-active').value === 'true';

        const hasApi = typeof API !== 'undefined' && API.baseURL && API.token;

        const payload = { role, permissions };
        if (userId) {
            const permissionsByBranch = (typeof this._editingPermissionsByBranch === 'object' && this._editingPermissionsByBranch !== null)
                ? this._editingPermissionsByBranch
                : (await DB.get('users', userId))?.permissions_by_branch;
            if (permissionsByBranch != null) payload.permissions_by_branch = permissionsByBranch;
        }

        if (userId && hasApi && API.updateUser) {
            try {
                const updated = await API.updateUser(userId, payload);
                const existing = await DB.get('users', userId);
                const user = {
                    ...existing,
                    id: updated.id,
                    username: updated.username || username,
                    role: updated.role,
                    permissions: updated.permissions != null && Array.isArray(updated.permissions) ? updated.permissions : permissions,
                    permissions_by_branch: (updated.permissions_by_branch != null && typeof updated.permissions_by_branch === 'object') ? updated.permissions_by_branch : {},
                    pin_hash: pinHash ?? existing?.pin_hash,
                    active,
                    employee_id: employeeId || existing?.employee_id
                };
                await DB.put('users', user);
                this._editingPermissionsByBranch = null;
                if (typeof SyncManager !== 'undefined') SyncManager.addToQueue('user', user.id);
                Utils.showNotification('Usuario actualizado', 'success');
                UI.closeModal();
                this.loadUsers();
                return;
            } catch (e) {
                console.warn('Error actualizando usuario en servidor, guardando solo en local:', e);
                Utils.showNotification('Cambios guardados solo en este dispositivo. Servidor no disponible.', 'warning');
            }
        }

        if (!userId && employeeId && hasApi && API.createUserForEmployee) {
            try {
                const password = pinInput && pinInput.length >= 4 ? pinInput : '1234';
                const created = await API.createUserForEmployee(employeeId, { username, password, role, permissions });
                const user = {
                    id: created.id,
                    username: created.username || username,
                    employee_id: employeeId,
                    role: created.role || role,
                    permissions: created.permissions != null && Array.isArray(created.permissions) ? created.permissions : permissions,
                    pin_hash: pinInput && pinInput.length >= 4 ? await Utils.hashPin(pinInput) : await Utils.hashPin('1234'),
                    active,
                    created_at: new Date().toISOString()
                };
                await DB.put('users', user);
                if (typeof SyncManager !== 'undefined') SyncManager.addToQueue('user', user.id);
                Utils.showNotification('Usuario creado en el servidor', 'success');
                UI.closeModal();
                this.loadUsers();
                return;
            } catch (e) {
                console.warn('Error creando usuario en servidor, creando solo en local:', e);
                Utils.showNotification('Usuario creado solo en este dispositivo. Servidor no disponible.', 'warning');
            }
        }

        const user = {
            id: userId || Utils.generateId(),
            username,
            employee_id: employeeId || null,
            role,
            pin_hash: pinHash,
            permissions,
            active,
            created_at: userId ? (await DB.get('users', userId))?.created_at : new Date().toISOString()
        };
        await DB.put('users', user);
        if (typeof SyncManager !== 'undefined') await SyncManager.addToQueue('user', user.id);
        Utils.showNotification(userId ? 'Usuario actualizado' : 'Usuario agregado', 'success');
        UI.closeModal();
        this.loadUsers();
    },

    async editUser(userId) {
        await this.showAddUserForm(userId);
    },

    async resetPin(userId) {
        if (!await Utils.confirm('¿Resetear PIN de este usuario?')) return;

        const newPin = await Utils.prompt('Ingresa nuevo PIN (4-6 dígitos):', '', 'Resetear PIN');
        if (!newPin || newPin.length < 4) {
            Utils.showNotification('PIN inválido', 'error');
            return;
        }

        const user = await DB.get('users', userId);
        if (!user) return;

        user.pin_hash = await Utils.hashPin(newPin);
        await DB.put('users', user);

        Utils.showNotification('PIN actualizado', 'success');
    },

    async deleteEmployee(employeeId) {
        try {
            const employee = await DB.get('employees', employeeId);
            if (!employee) {
                Utils.showNotification('Empleado no encontrado', 'error');
                return;
            }

            // Verificar si tiene ventas asociadas
            const sales = await DB.getAll('sales') || [];
            const employeeSales = sales.filter(s => s.employee_id === employeeId);
            
            if (employeeSales.length > 0) {
                const confirmed = await Utils.confirm(
                    `⚠️ ADVERTENCIA\n\n` +
                    `Este empleado tiene ${employeeSales.length} venta(s) asociada(s).\n\n` +
                    `¿Estás seguro de que deseas eliminar este empleado?\n\n` +
                    `NOTA: Esto NO eliminará las ventas, solo el registro del empleado.`,
                    'Confirmar Eliminación'
                );
                
                if (!confirmed) return;
            } else {
                const confirmed = await Utils.confirm(
                    `¿Estás seguro de que deseas eliminar al empleado "${employee.name}"?\n\n` +
                    `Esta acción NO se puede deshacer.`,
                    'Confirmar Eliminación'
                );
                
                if (!confirmed) return;
            }

            // Verificar si tiene un usuario asociado: NUNCA eliminar el usuario, solo desvincular
            const users = await DB.getAll('users') || [];
            const associatedUser = users.find(u => u.employee_id === employeeId);
            
            if (associatedUser) {
                // Principio: no borrar usuarios. Solo desvincular del empleado (el usuario sigue existiendo)
                associatedUser.employee_id = null;
                await DB.put('users', associatedUser);
                if (typeof SyncManager !== 'undefined') {
                    await SyncManager.addToQueue('user', associatedUser.id);
                }
                Utils.showNotification('Usuario desvinculado del empleado (el usuario se conserva)', 'info');
            }

            // Guardar metadata del empleado antes de eliminarlo para sincronización
            const employeeMetadata = {
                id: employee.id,
                name: employee.name,
                branch_id: employee.branch_id || employee.branch_ids?.[0] || null,
                deleted_at: new Date().toISOString()
            };
            
            // Intentar eliminar en el servidor primero (si está disponible)
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteEmployee) {
                try {
                    await API.deleteEmployee(employeeId);
                    console.log('✅ Empleado eliminado en Railway:', employeeId);
                } catch (apiError) {
                    // Si falla, agregar a cola de sincronización para intentar más tarde
                    console.warn('Error eliminando empleado en servidor, agregando a cola:', apiError);
                    if (typeof SyncManager !== 'undefined') {
                        try {
                            await DB.put('sync_deleted_items', {
                                id: employeeId,
                                entity_type: 'employee',
                                metadata: employeeMetadata,
                                deleted_at: new Date().toISOString()
                            });
                            await SyncManager.addToQueue('employee', employeeId, 'delete');
                        } catch (syncError) {
                            console.warn('Error guardando metadata para sincronización (continuando):', syncError);
                        }
                    }
                }
            } else {
                // Modo offline - agregar a cola de sincronización
                if (typeof SyncManager !== 'undefined') {
                    try {
                        await DB.put('sync_deleted_items', {
                            id: employeeId,
                            entity_type: 'employee',
                            metadata: employeeMetadata,
                            deleted_at: new Date().toISOString()
                        });
                        await SyncManager.addToQueue('employee', employeeId, 'delete');
                    } catch (syncError) {
                        console.warn('Error guardando metadata para sincronización (continuando):', syncError);
                    }
                }
            }
            
            // Eliminar el empleado de la base de datos
            try {
                await DB.delete('employees', employeeId);
                
                // Verificar que realmente se eliminó
                let verifyDeleted = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
                    verifyDeleted = await DB.get('employees', employeeId);
                    if (!verifyDeleted) break;
                }
                
                if (verifyDeleted) {
                    console.error('⚠️ ERROR: El empleado aún existe después de eliminarlo. ID:', employeeId);
                    Utils.showNotification('Advertencia: La eliminación puede no haberse completado. Recarga la página si el empleado sigue apareciendo.', 'warning');
                }
            } catch (deleteError) {
                console.error('Error eliminando empleado de la BD:', deleteError);
                Utils.showNotification('Error al eliminar el empleado de la base de datos: ' + deleteError.message, 'error');
                return;
            }

            Utils.showNotification('Empleado eliminado correctamente', 'success');
            await this.loadEmployees();
        } catch (e) {
            console.error('Error eliminando empleado:', e);
            Utils.showNotification('Error al eliminar: ' + e.message, 'error');
        }
    },

    async deleteUser(userId) {
        try {
            const user = await DB.get('users', userId);
            if (!user) {
                Utils.showNotification('Usuario no encontrado', 'error');
                return;
            }

            // Verificar si es el último usuario administrador
            if (user.role === 'admin') {
                const allUsers = await DB.getAll('users') || [];
                const adminUsers = allUsers.filter(u => u.role === 'admin' && u.active && u.id !== userId);
                
                if (adminUsers.length === 0) {
                    Utils.showNotification('No se puede eliminar el último administrador activo', 'error');
                    return;
                }
            }

            const confirmed = await Utils.confirm(
                `¿Estás seguro de que deseas eliminar el usuario "${user.username}"?\n\n` +
                `Esta acción NO se puede deshacer y el usuario se borrará del sistema.\n\n` +
                `Recomendación: si solo quiere impedir acceso, use "Editar" y ponga Estado = Inactivo (así no se pierde el usuario).\n\n` +
                `El empleado asociado NO será eliminado, solo se desvinculará.`,
                'Confirmar Eliminación'
            );

            if (!confirmed) return;

            // Eliminar el usuario (uso excepcional; preferir desactivar en lugar de eliminar)
            await DB.delete('users', userId);
            await SyncManager.addToQueue('user', userId, 'delete');

            Utils.showNotification('Usuario eliminado correctamente', 'success');
            await this.loadUsers();
        } catch (e) {
            console.error('Error eliminando usuario:', e);
            Utils.showNotification('Error al eliminar: ' + e.message, 'error');
        }
    },

    // ========== VENDEDORES ==========
    async loadSellers() {
        const content = document.getElementById(this.getCatalogContentId());
        if (!content) return;

        try {
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir vendedores locales que NO están en el servidor (solo master_admin; el backend rechaza 403 a otros roles)
            try {
                if (!isMasterAdmin && typeof API !== 'undefined' && API.baseURL) {
                    console.log('📋 [Paso 1 Sellers] Omitido (solo master_admin puede subir vendedores al servidor). Se descargarán del servidor.');
                }
                if (isMasterAdmin && typeof API !== 'undefined' && API.baseURL && API.token && API.createSeller && API.updateSeller) {
                    console.log('📤 [Paso 1 Sellers] Buscando vendedores locales que no están en el servidor...');
                    
                    const allLocalSellers = await DB.getAll('catalog_sellers') || [];
                    const unsyncedSellers = allLocalSellers.filter(s => {
                        if (!s || !s.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s.id));
                        return !isUUID || !s.server_id;
                    });
                    
                    console.log(`📊 [Paso 1 Sellers] Encontrados ${unsyncedSellers.length} vendedores locales sin sincronizar`);
                    
                    if (unsyncedSellers.length > 0) {
                        const sellersByKey = new Map();
                        for (const localSeller of unsyncedSellers) {
                            const key = `${localSeller.name || localSeller.id}`;
                            if (!sellersByKey.has(key)) {
                                sellersByKey.set(key, localSeller);
                            } else {
                                const existing = sellersByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localSeller.updated_at ? new Date(localSeller.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    sellersByKey.set(key, localSeller);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localSeller] of sellersByKey) {
                            try {
                                console.log(`📤 [Paso 1 Sellers] Subiendo vendedor local al servidor: ${localSeller.id}`);
                                
                                let serverSeller = null;
                                try {
                                    if (localSeller.barcode && API.getSellerByBarcode) {
                                        try { serverSeller = await API.getSellerByBarcode(localSeller.barcode); } catch (e) {}
                                    }
                                    if (!serverSeller && localSeller.code) {
                                        const serverSellers = await API.getSellers();
                                        if (serverSellers && serverSellers.length > 0) {
                                            serverSeller = serverSellers.find(s => (s.code || '').toString().trim() === (localSeller.code || '').toString().trim());
                                        }
                                    }
                                    if (!serverSeller && localSeller.name) {
                                        const serverSellers = await API.getSellers();
                                        if (serverSellers && serverSellers.length > 0) {
                                            serverSeller = serverSellers.find(s => s.name === localSeller.name);
                                        }
                                    }
                                } catch (e) {}
                                
                                if (serverSeller && serverSeller.id) {
                                    const updatedSeller = await API.updateSeller(serverSeller.id, localSeller);
                                    if (updatedSeller && updatedSeller.id) {
                                        const allLocalSellers = await DB.getAll('catalog_sellers') || [];
                                        const sellersToUpdate = allLocalSellers.filter(s => {
                                            const sKey = `${s.name || s.id}`;
                                            return sKey === key;
                                        });
                                        
                                        for (const sellerToUpdate of sellersToUpdate) {
                                            sellerToUpdate.server_id = updatedSeller.id;
                                            sellerToUpdate.id = updatedSeller.id;
                                            sellerToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_sellers', sellerToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                } else {
                                    let createdSeller = null;
                                    try {
                                        createdSeller = await API.createSeller(localSeller);
                                    } catch (createErr) {
                                        const msg = (createErr && createErr.message) ? String(createErr.message) : '';
                                        if (msg.includes('código') && msg.includes('ya existe') && (localSeller.barcode || localSeller.code)) {
                                            try {
                                                if (localSeller.barcode && API.getSellerByBarcode) {
                                                    serverSeller = await API.getSellerByBarcode(localSeller.barcode);
                                                }
                                                if (!serverSeller && localSeller.code) {
                                                    const serverSellers = await API.getSellers();
                                                    if (serverSellers && serverSellers.length > 0) {
                                                        serverSeller = serverSellers.find(s => (s.code || '').toString().trim() === (localSeller.code || '').toString().trim());
                                                    }
                                                }
                                                if (serverSeller && serverSeller.id) {
                                                    createdSeller = await API.updateSeller(serverSeller.id, localSeller);
                                                }
                                            } catch (e) {}
                                        }
                                        if (!createdSeller) throw createErr;
                                    }
                                    if (createdSeller && createdSeller.id) {
                                        const allLocalSellers = await DB.getAll('catalog_sellers') || [];
                                        const sellersToUpdate = allLocalSellers.filter(s => {
                                            const sKey = `${s.name || s.id}`;
                                            return sKey === key;
                                        });
                                        
                                        for (const sellerToUpdate of sellersToUpdate) {
                                            sellerToUpdate.server_id = createdSeller.id;
                                            sellerToUpdate.id = createdSeller.id;
                                            sellerToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_sellers', sellerToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Sellers] Error subiendo vendedor ${localSeller.id}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Sellers] Sincronización local→servidor completada: ${uploadedCount} vendedores subidos`);
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Sellers] Error sincronizando vendedores locales al servidor:', error);
            }

            // PASO 2: Descargar vendedores del servidor
            let sellers = [];
            
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getSellers) {
                try {
                    console.log('📥 [Paso 2 Sellers] Sincronizando vendedores desde el servidor...');
                    sellers = await API.getSellers();
                    console.log(`📥 [Paso 2 Sellers] ${sellers.length} vendedores recibidos del servidor`);
                    
                    // Guardar/actualizar cada vendedor en IndexedDB local
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverSeller of sellers) {
                        try {
                            const key = `${serverSeller.name || serverSeller.id}`;
                            const existingLocalSellers = await DB.getAll('catalog_sellers') || [];
                            const existingSeller = existingLocalSellers.find(s => {
                                const sKey = `${s.name || s.id}`;
                                return sKey === key;
                            });
                            
                            const localSeller = {
                                ...serverSeller,
                                server_id: serverSeller.id,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('catalog_sellers', localSeller);
                            
                            if (existingSeller) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Sellers] Error guardando vendedor ${serverSeller.id}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Sellers] Sincronización servidor→local completada: ${savedCount} nuevos, ${updatedCount} actualizados`);
                } catch (apiError) {
                    console.warn('Error cargando vendedores desde API, usando modo local:', apiError);
                    sellers = await DB.getAll('catalog_sellers') || [];
                }
            } else {
                sellers = await DB.getAll('catalog_sellers') || [];
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar
            const sellersByKey = new Map();
            for (const seller of sellers) {
                const key = `${seller.name || seller.id}`;
                if (!sellersByKey.has(key)) {
                    sellersByKey.set(key, seller);
                } else {
                    const existing = sellersByKey.get(key);
                    if (seller.server_id && !existing.server_id) {
                        sellersByKey.set(key, seller);
                    } else if (existing.server_id && !seller.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = seller.updated_at ? new Date(seller.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            sellersByKey.set(key, seller);
                        }
                    }
                }
            }
            sellers = Array.from(sellersByKey.values());
            console.log(`🔍 [Paso 3 Sellers] Deduplicación: ${sellers.length} vendedores únicos`);
            
            // Verificar que los códigos de barras se lean correctamente
            sellers.forEach(seller => {
                if (Utils.isBarcodeEmpty(seller.barcode)) {
                    console.log(`Vendedor ${seller.id} (${seller.name}) sin código de barras`);
                }
            });

            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-user-tag"></i> Lista de Vendedores
                        </h3>
                        <button class="btn-primary btn-sm" onclick="window.Employees.showAddSellerForm()">
                            <i class="fas fa-plus"></i> Nuevo
                        </button>
                    </div>
                </div>
                <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Regla Comisión</th>
                                    <th>Barcode</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sellers.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md);">No hay vendedores</td></tr>' : sellers.map(seller => {
                            const barcode = Utils.isBarcodeEmpty(seller.barcode) ? 'Sin código' : seller.barcode;
                            return `
                            <tr>
                                <td>${seller.name || 'N/A'}</td>
                                <td>${seller.commission_rule || 'N/A'}</td>
                                <td>${barcode}</td>
                                <td>${seller.active !== false ? 'Activo' : 'Inactivo'}</td>
                                <td>
                                    <button class="btn-secondary btn-sm" data-id="${String(seller.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.editSeller(this.getAttribute('data-id'))">Editar</button>
                                    <button class="btn-secondary btn-sm" data-id="${String(seller.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.generateSellerBarcode(this.getAttribute('data-id'))">Barcode</button>
                                </td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Error loading sellers:', e);
            content.innerHTML = '<p style="text-align: center; padding: var(--spacing-md);">Error al cargar vendedores</p>';
        }
    },

    async showAddSellerForm(sellerId = null) {
        const seller = sellerId ? await DB.get('catalog_sellers', sellerId) : null;
        const commissionRules = await DB.getAll('commission_rules') || [];
        const sellerRules = commissionRules.filter(r => r.entity_type === 'seller');

        const body = `
            <form id="seller-form">
                <div class="form-group">
                    <label>Nombre *</label>
                    <input type="text" id="seller-name" class="form-input" value="${seller?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Regla de Comisión</label>
                    <select id="seller-commission-rule" class="form-select">
                        <option value="">Sin regla</option>
                        ${sellerRules.map(rule => `
                            <option value="${rule.id}" ${seller?.commission_rule === rule.id ? 'selected' : ''}>
                                ${rule.id} (${rule.discount_pct}% desc, ${rule.multiplier}x)
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Código de Barras</label>
                    <input type="text" id="seller-barcode" class="form-input" value="${seller?.barcode || ''}">
                    <button type="button" class="btn-secondary" onclick="window.Employees.generateSellerBarcodeForForm()" style="margin-top: 5px;">Generar</button>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="seller-active" class="form-select">
                        <option value="true" ${seller?.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${seller?.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                </div>
                ${seller?.barcode ? `
                <div style="text-align: center; margin: var(--spacing-md) 0;">
                    <svg id="seller-barcode-preview"></svg>
                </div>
                ` : ''}
            </form>
        `;

        const sellerIdSafe = String(sellerId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveSeller('${sellerIdSafe}')">Guardar</button>
        `;

        UI.showModal(sellerId ? 'Editar Vendedor' : 'Nuevo Vendedor', body, footer);

        if (seller?.barcode) {
            setTimeout(() => {
                BarcodeManager.generateCode128(seller.barcode, 'seller-barcode-preview');
            }, 100);
        }
    },

    generateSellerBarcodeForForm() {
        const name = document.getElementById('seller-name').value;
        if (!name) {
            Utils.showNotification('Ingresa un nombre primero', 'error');
            return;
        }
        const seller = { name: name };
        const barcode = Utils.generateSellerBarcode(seller);
        document.getElementById('seller-barcode').value = barcode;
    },

    async saveSeller(sellerId) {
        const form = document.getElementById('seller-form');
        if (!form) return;

        const name = document.getElementById('seller-name')?.value.trim();
        if (!name) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        try {
            // Obtener el registro existente si existe para preservar todas las propiedades
            const existing = sellerId ? await DB.get('catalog_sellers', sellerId) : null;
            
            const seller = existing ? {
                ...existing, // Preservar todas las propiedades existentes
                id: sellerId,
                name: name,
                commission_rule: document.getElementById('seller-commission-rule')?.value || null,
                active: document.getElementById('seller-active')?.value === 'true',
                updated_at: new Date().toISOString()
            } : {
                id: sellerId || `seller_${Date.now()}`,
                name: name,
                commission_rule: document.getElementById('seller-commission-rule')?.value || null,
                active: document.getElementById('seller-active')?.value === 'true',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Manejar código de barras: usar el del formulario o generar uno nuevo
            const formBarcode = document.getElementById('seller-barcode')?.value.trim();
            if (formBarcode && formBarcode !== '') {
                seller.barcode = formBarcode;
            } else if (!seller.barcode || Utils.isBarcodeEmpty(seller.barcode)) {
                // Generar código usando la función centralizada
                seller.barcode = Utils.generateSellerBarcode(seller);
            }

            console.log('Guardando vendedor:', seller);
            await DB.put('catalog_sellers', seller);
            
            // Verificar que se guardó correctamente
            const saved = await DB.get('catalog_sellers', seller.id);
            if (!saved || saved.barcode !== seller.barcode) {
                console.error('Error: El código de barras no se guardó correctamente', { saved, expected: seller.barcode });
                throw new Error('Error al guardar código de barras');
            }
            Utils.showNotification(sellerId ? 'Vendedor actualizado' : 'Vendedor creado', 'success');
            UI.closeModal();
            await this.loadSellers();
            
            // Agregar a cola de sincronización
            await SyncManager.addToQueue('catalog_seller', seller.id);
        } catch (e) {
            console.error('Error saving seller:', e);
            Utils.showNotification('Error al guardar vendedor', 'error');
        }
    },

    async editSeller(sellerId) {
        await this.showAddSellerForm(sellerId);
    },

    async generateSellerBarcode(sellerId) {
        try {
            const seller = await DB.get('catalog_sellers', sellerId);
            if (!seller) {
                Utils.showNotification('Vendedor no encontrado', 'error');
                return;
            }

            seller.barcode = Utils.generateSellerBarcode(seller);
            await DB.put('catalog_sellers', seller);
            Utils.showNotification('Código de barras generado', 'success');
            await this.loadSellers();
        } catch (e) {
            console.error('Error generating seller barcode:', e);
            Utils.showNotification('Error al generar código de barras', 'error');
        }
    },

    async exportSellers() {
        try {
            const sellers = await DB.getAll('catalog_sellers') || [];
            const exportData = sellers.map(s => ({
                'ID': s.id,
                'Nombre': s.name,
                'Regla Comisión': s.commission_rule || 'N/A',
                'Código de Barras': s.barcode || 'Sin código',
                'Estado': s.active !== false ? 'Activo' : 'Inactivo',
                'Creado': Utils.formatDate(s.created_at, 'DD/MM/YYYY HH:mm'),
                'Actualizado': Utils.formatDate(s.updated_at, 'DD/MM/YYYY HH:mm')
            }));

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Vendedores');
            if (!format) return;
            
            const date = new Date().toISOString().split('T')[0];
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `vendedores_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `vendedores_${date}.xlsx`);
            } else {
                Utils.exportToPDF(exportData, `vendedores_${date}.pdf`, 'Vendedores');
            }
        } catch (e) {
            console.error('Error exporting sellers:', e);
            Utils.showNotification('Error al exportar', 'error');
        }
    },

    // ========== GUÍAS ==========
    async loadGuides() {
        const content = document.getElementById(this.getCatalogContentId());
        if (!content) return;

        try {
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir guías locales que NO están en el servidor (solo master_admin; el backend rechaza 403 a otros roles)
            try {
                if (!isMasterAdmin && typeof API !== 'undefined' && API.baseURL) {
                    console.log('📋 [Paso 1 Guides] Omitido (solo master_admin puede subir guías al servidor). Se descargarán del servidor.');
                }
                if (isMasterAdmin && typeof API !== 'undefined' && API.baseURL && API.token && API.createGuide && API.updateGuide) {
                    console.log('📤 [Paso 1 Guides] Buscando guías locales que no están en el servidor...');
                    
                    const allLocalGuides = await DB.getAll('catalog_guides') || [];
                    const unsyncedGuides = allLocalGuides.filter(g => {
                        if (!g || !g.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(g.id));
                        return !isUUID || !g.server_id;
                    });
                    
                    console.log(`📊 [Paso 1 Guides] Encontradas ${unsyncedGuides.length} guías locales sin sincronizar`);
                    
                    if (unsyncedGuides.length > 0) {
                        const guidesByKey = new Map();
                        for (const localGuide of unsyncedGuides) {
                            const key = `${localGuide.name || localGuide.id}_${localGuide.agency_id || 'no-agency'}`;
                            if (!guidesByKey.has(key)) {
                                guidesByKey.set(key, localGuide);
                            } else {
                                const existing = guidesByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localGuide.updated_at ? new Date(localGuide.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    guidesByKey.set(key, localGuide);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localGuide] of guidesByKey) {
                            try {
                                console.log(`📤 [Paso 1 Guides] Subiendo guía local al servidor: ${localGuide.id}`);
                                
                                let serverGuide = null;
                                // Buscar en servidor: 1) por barcode, 2) por code, 3) por name+agency_id
                                try {
                                    if (localGuide.barcode && API.getGuideByBarcode) {
                                        try {
                                            serverGuide = await API.getGuideByBarcode(localGuide.barcode);
                                        } catch (e) { /* no encontrada por barcode */ }
                                    }
                                    if (!serverGuide && localGuide.code) {
                                        const serverGuides = await API.getGuides({ search: String(localGuide.code).trim() });
                                        if (serverGuides && serverGuides.length > 0) {
                                            serverGuide = serverGuides.find(g => (g.code || '').toString().trim() === (localGuide.code || '').toString().trim());
                                        }
                                    }
                                    if (!serverGuide && localGuide.name && localGuide.agency_id) {
                                        const serverGuides = await API.getGuides({ agency_id: localGuide.agency_id });
                                        if (serverGuides && serverGuides.length > 0) {
                                            serverGuide = serverGuides.find(g => g.name === localGuide.name);
                                        }
                                    }
                                } catch (e) { /* fallback */ }
                                
                                if (serverGuide && serverGuide.id) {
                                    const updatedGuide = await API.updateGuide(serverGuide.id, localGuide);
                                    if (updatedGuide && updatedGuide.id) {
                                        const allLocalGuides = await DB.getAll('catalog_guides') || [];
                                        const guidesToUpdate = allLocalGuides.filter(g => {
                                            const gKey = `${g.name || g.id}_${g.agency_id || 'no-agency'}`;
                                            return gKey === key;
                                        });
                                        
                                        for (const guideToUpdate of guidesToUpdate) {
                                            guideToUpdate.server_id = updatedGuide.id;
                                            guideToUpdate.id = updatedGuide.id;
                                            guideToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_guides', guideToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                } else {
                                    let createdGuide = null;
                                    try {
                                        createdGuide = await API.createGuide(localGuide);
                                    } catch (createErr) {
                                        const msg = (createErr && createErr.message) ? String(createErr.message) : '';
                                        if (msg.includes('código') && msg.includes('ya existe') && (localGuide.barcode || localGuide.code)) {
                                            try {
                                                if (localGuide.barcode && API.getGuideByBarcode) {
                                                    serverGuide = await API.getGuideByBarcode(localGuide.barcode);
                                                }
                                                if (!serverGuide && localGuide.code) {
                                                    const serverGuides = await API.getGuides({ search: String(localGuide.code).trim() });
                                                    if (serverGuides && serverGuides.length > 0) {
                                                        serverGuide = serverGuides.find(g => (g.code || '').toString().trim() === (localGuide.code || '').toString().trim());
                                                    }
                                                }
                                                if (serverGuide && serverGuide.id) {
                                                    createdGuide = await API.updateGuide(serverGuide.id, localGuide);
                                                }
                                            } catch (e) { /* no recuperable */ }
                                        }
                                        if (!createdGuide) throw createErr;
                                    }
                                    if (createdGuide && createdGuide.id) {
                                        const allLocalGuides = await DB.getAll('catalog_guides') || [];
                                        const guidesToUpdate = allLocalGuides.filter(g => {
                                            const gKey = `${g.name || g.id}_${g.agency_id || 'no-agency'}`;
                                            return gKey === key;
                                        });
                                        
                                        for (const guideToUpdate of guidesToUpdate) {
                                            guideToUpdate.server_id = createdGuide.id;
                                            guideToUpdate.id = createdGuide.id;
                                            guideToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_guides', guideToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Guides] Error subiendo guía ${localGuide.id}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Guides] Sincronización local→servidor completada: ${uploadedCount} guías subidas`);
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Guides] Error sincronizando guías locales al servidor:', error);
            }

            // PASO 2: Descargar guías del servidor
            let guides = [];
            
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getGuides) {
                try {
                    console.log('📥 [Paso 2 Guides] Sincronizando guías desde el servidor...');
                    guides = await API.getGuides();
                    console.log(`📥 [Paso 2 Guides] ${guides.length} guías recibidas del servidor`);
                    
                    // Guardar/actualizar cada guía en IndexedDB local
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverGuide of guides) {
                        try {
                            const key = `${serverGuide.name || serverGuide.id}_${serverGuide.agency_id || 'no-agency'}`;
                            const existingLocalGuides = await DB.getAll('catalog_guides') || [];
                            const existingGuide = existingLocalGuides.find(g => {
                                const gKey = `${g.name || g.id}_${g.agency_id || 'no-agency'}`;
                                return gKey === key;
                            });
                            
                            const localGuide = {
                                ...serverGuide,
                                server_id: serverGuide.id,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('catalog_guides', localGuide);
                            
                            if (existingGuide) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Guides] Error guardando guía ${serverGuide.id}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Guides] Sincronización servidor→local completada: ${savedCount} nuevas, ${updatedCount} actualizadas`);
                } catch (apiError) {
                    console.warn('Error cargando guías desde API, usando modo local:', apiError);
                    guides = await DB.getAll('catalog_guides') || [];
                }
            } else {
                guides = await DB.getAll('catalog_guides') || [];
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar
            const guidesByKey = new Map();
            for (const guide of guides) {
                const key = `${guide.name || guide.id}_${guide.agency_id || 'no-agency'}`;
                if (!guidesByKey.has(key)) {
                    guidesByKey.set(key, guide);
                } else {
                    const existing = guidesByKey.get(key);
                    if (guide.server_id && !existing.server_id) {
                        guidesByKey.set(key, guide);
                    } else if (existing.server_id && !guide.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = guide.updated_at ? new Date(guide.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            guidesByKey.set(key, guide);
                        }
                    }
                }
            }
            guides = Array.from(guidesByKey.values());
            console.log(`🔍 [Paso 3 Guides] Deduplicación: ${guides.length} guías únicas`);
            
            const agencies = await DB.getAll('catalog_agencies') || [];
            
            // Verificar que los códigos de barras se lean correctamente
            guides.forEach(guide => {
                if (Utils.isBarcodeEmpty(guide.barcode)) {
                    console.log(`Guía ${guide.id} (${guide.name}) sin código de barras`);
                }
            });

            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-suitcase"></i> Lista de Guías
                        </h3>
                        <button class="btn-primary btn-sm" onclick="window.Employees.showAddGuideForm()">
                            <i class="fas fa-plus"></i> Nuevo
                        </button>
                    </div>
                </div>
                <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Agencia</th>
                                    <th>Regla Comisión</th>
                                    <th>Barcode</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${guides.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-md);">No hay guías</td></tr>' : guides.map(guide => {
                            const agency = agencies.find(a => a.id === guide.agency_id);
                            const barcode = Utils.isBarcodeEmpty(guide.barcode) ? 'Sin código' : guide.barcode;
                            return `
                                <tr>
                                    <td>${guide.name || 'N/A'}</td>
                                    <td>${agency?.name || 'N/A'}</td>
                                    <td>${guide.commission_rule || 'N/A'}</td>
                                    <td>${barcode}</td>
                                    <td>${guide.active !== false ? 'Activo' : 'Inactivo'}</td>
                                    <td>
                                        <button class="btn-secondary btn-sm" data-id="${String(guide.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.editGuide(this.getAttribute('data-id'))">Editar</button>
                                        <button class="btn-secondary btn-sm" data-id="${String(guide.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.generateGuideBarcode(this.getAttribute('data-id'))">Barcode</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading guides:', e);
            content.innerHTML = '<p style="text-align: center; padding: var(--spacing-md);">Error al cargar guías</p>';
        }
    },

    async showAddGuideForm(guideId = null) {
        const guide = guideId ? await DB.get('catalog_guides', guideId) : null;
        const agencies = await DB.getAll('catalog_agencies') || [];
        const commissionRules = await DB.getAll('commission_rules') || [];
        const guideRules = commissionRules.filter(r => r.entity_type === 'guide');

        const body = `
            <form id="guide-form">
                <div class="form-group">
                    <label>Nombre *</label>
                    <input type="text" id="guide-name" class="form-input" value="${guide?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Agencia *</label>
                    <select id="guide-agency-id" class="form-select" required>
                        <option value="">Seleccionar agencia</option>
                        ${agencies.filter(a => a.active !== false).map(agency => `
                            <option value="${agency.id}" ${guide?.agency_id === agency.id ? 'selected' : ''}>
                                ${agency.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Regla de Comisión</label>
                    <select id="guide-commission-rule" class="form-select">
                        <option value="">Sin regla</option>
                        ${guideRules.map(rule => `
                            <option value="${rule.id}" ${guide?.commission_rule === rule.id ? 'selected' : ''}>
                                ${rule.id} (${rule.discount_pct}% desc, ${rule.multiplier}x)
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Código de Barras</label>
                    <input type="text" id="guide-barcode" class="form-input" value="${guide?.barcode || ''}">
                    <button type="button" class="btn-secondary" onclick="window.Employees.generateGuideBarcodeForForm()" style="margin-top: 5px;">Generar</button>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="guide-active" class="form-select">
                        <option value="true" ${guide?.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${guide?.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                </div>
                ${guide?.barcode ? `
                <div style="text-align: center; margin: var(--spacing-md) 0;">
                    <svg id="guide-barcode-preview"></svg>
                </div>
                ` : ''}
            </form>
        `;

        const guideIdSafe = String(guideId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveGuide('${guideIdSafe}')">Guardar</button>
        `;

        UI.showModal(guideId ? 'Editar Guía' : 'Nuevo Guía', body, footer);

        if (guide?.barcode) {
            setTimeout(() => {
                BarcodeManager.generateCode128(guide.barcode, 'guide-barcode-preview');
            }, 100);
        }
    },

    generateGuideBarcodeForForm() {
        const name = document.getElementById('guide-name').value;
        if (!name) {
            Utils.showNotification('Ingresa un nombre primero', 'error');
            return;
        }
        const guide = { name: name };
        const barcode = Utils.generateGuideBarcode(guide);
        document.getElementById('guide-barcode').value = barcode;
    },

    async saveGuide(guideId) {
        const form = document.getElementById('guide-form');
        if (!form) return;

        const name = document.getElementById('guide-name')?.value.trim();
        const agencyId = document.getElementById('guide-agency-id')?.value;
        
        if (!name) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }
        if (!agencyId) {
            Utils.showNotification('La agencia es requerida', 'error');
            return;
        }

        try {
            // Obtener el registro existente si existe para preservar todas las propiedades
            const existing = guideId ? await DB.get('catalog_guides', guideId) : null;
            
            const guide = existing ? {
                ...existing, // Preservar todas las propiedades existentes
                id: guideId,
                name: name,
                agency_id: agencyId,
                commission_rule: document.getElementById('guide-commission-rule')?.value || null,
                active: document.getElementById('guide-active')?.value === 'true',
                updated_at: new Date().toISOString()
            } : {
                id: guideId || `guide_${Date.now()}`,
                name: name,
                agency_id: agencyId,
                commission_rule: document.getElementById('guide-commission-rule')?.value || null,
                active: document.getElementById('guide-active')?.value === 'true',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Manejar código de barras: usar el del formulario o generar uno nuevo
            const formBarcode = document.getElementById('guide-barcode')?.value.trim();
            if (formBarcode && formBarcode !== '') {
                guide.barcode = formBarcode;
            } else if (!guide.barcode || Utils.isBarcodeEmpty(guide.barcode)) {
                // Generar código usando la función centralizada
                guide.barcode = Utils.generateGuideBarcode(guide);
            }

            console.log('Guardando guía:', guide);
            await DB.put('catalog_guides', guide);
            
            // Verificar que se guardó correctamente
            const saved = await DB.get('catalog_guides', guide.id);
            if (!saved || saved.barcode !== guide.barcode) {
                console.error('Error: El código de barras no se guardó correctamente', { saved, expected: guide.barcode });
                throw new Error('Error al guardar código de barras');
            }
            Utils.showNotification(guideId ? 'Guía actualizado' : 'Guía creado', 'success');
            UI.closeModal();
            await this.loadGuides();
            
            // Agregar a cola de sincronización
            await SyncManager.addToQueue('catalog_guide', guide.id);
        } catch (e) {
            console.error('Error saving guide:', e);
            Utils.showNotification('Error al guardar guía', 'error');
        }
    },

    async editGuide(guideId) {
        await this.showAddGuideForm(guideId);
    },

    async generateGuideBarcode(guideId) {
        try {
            const guide = await DB.get('catalog_guides', guideId);
            if (!guide) {
                Utils.showNotification('Guía no encontrado', 'error');
                return;
            }

            guide.barcode = Utils.generateGuideBarcode(guide);
            await DB.put('catalog_guides', guide);
            Utils.showNotification('Código de barras generado', 'success');
            await this.loadGuides();
        } catch (e) {
            console.error('Error generating guide barcode:', e);
            Utils.showNotification('Error al generar código de barras', 'error');
        }
    },

    async exportGuides() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            const guides = await DB.getAll('catalog_guides') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];
            const exportData = guides.map(g => {
                const agency = agencies.find(a => a.id === g.agency_id);
                return {
                    'ID': g.id,
                    'Nombre': g.name,
                    'Agencia': agency?.name || 'N/A',
                    'Regla Comisión': g.commission_rule || 'N/A',
                    'Código de Barras': g.barcode || 'Sin código',
                    'Estado': g.active !== false ? 'Activo' : 'Inactivo',
                    'Creado': Utils.formatDate(g.created_at, 'DD/MM/YYYY HH:mm'),
                    'Actualizado': Utils.formatDate(g.updated_at, 'DD/MM/YYYY HH:mm')
                };
            });

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Guías');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = new Date().toISOString().split('T')[0];
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `guias_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `guias_${date}.xlsx`);
            } else {
                Utils.exportToPDF(exportData, `guias_${date}.pdf`, 'Guías');
            }
        } catch (e) {
            console.error('Error exporting guides:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    // ========== AGENCIAS ==========
    async loadAgencies() {
        const content = document.getElementById(this.getCatalogContentId());
        if (!content) return;

        try {
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir agencias locales que NO están en el servidor (solo master_admin; el backend rechaza 403 a otros roles)
            try {
                if (!isMasterAdmin && typeof API !== 'undefined' && API.baseURL) {
                    console.log('📋 [Paso 1 Agencies] Omitido (solo master_admin puede subir agencias al servidor). Se descargarán del servidor.');
                }
                if (isMasterAdmin && typeof API !== 'undefined' && API.baseURL && API.token && API.createAgency && API.updateAgency) {
                    console.log('📤 [Paso 1 Agencies] Buscando agencias locales que no están en el servidor...');
                    
                    const allLocalAgencies = await DB.getAll('catalog_agencies') || [];
                    const unsyncedAgencies = allLocalAgencies.filter(a => {
                        if (!a || !a.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(a.id));
                        return !isUUID || !a.server_id;
                    });
                    
                    console.log(`📊 [Paso 1 Agencies] Encontradas ${unsyncedAgencies.length} agencias locales sin sincronizar`);
                    
                    if (unsyncedAgencies.length > 0) {
                        const agenciesByKey = new Map();
                        for (const localAgency of unsyncedAgencies) {
                            const key = `${localAgency.name || localAgency.id}`;
                            if (!agenciesByKey.has(key)) {
                                agenciesByKey.set(key, localAgency);
                            } else {
                                const existing = agenciesByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localAgency.updated_at ? new Date(localAgency.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    agenciesByKey.set(key, localAgency);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localAgency] of agenciesByKey) {
                            try {
                                console.log(`📤 [Paso 1 Agencies] Subiendo agencia local al servidor: ${localAgency.id}`);
                                
                                let serverAgency = null;
                                try {
                                    if (localAgency.barcode && API.getAgencyByBarcode) {
                                        try { serverAgency = await API.getAgencyByBarcode(localAgency.barcode); } catch (e) {}
                                    }
                                    if (!serverAgency && localAgency.code) {
                                        const serverAgencies = await API.getAgencies();
                                        if (serverAgencies && serverAgencies.length > 0) {
                                            serverAgency = serverAgencies.find(a => (a.code || '').toString().trim() === (localAgency.code || '').toString().trim());
                                        }
                                    }
                                    if (!serverAgency && localAgency.name) {
                                        const serverAgencies = await API.getAgencies();
                                        if (serverAgencies && serverAgencies.length > 0) {
                                            serverAgency = serverAgencies.find(a => a.name === localAgency.name);
                                        }
                                    }
                                } catch (e) {}
                                
                                if (serverAgency && serverAgency.id) {
                                    const updatedAgency = await API.updateAgency(serverAgency.id, localAgency);
                                    if (updatedAgency && updatedAgency.id) {
                                        const allLocalAgencies = await DB.getAll('catalog_agencies') || [];
                                        const agenciesToUpdate = allLocalAgencies.filter(a => {
                                            const aKey = `${a.name || a.id}`;
                                            return aKey === key;
                                        });
                                        
                                        for (const agencyToUpdate of agenciesToUpdate) {
                                            agencyToUpdate.server_id = updatedAgency.id;
                                            agencyToUpdate.id = updatedAgency.id;
                                            agencyToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_agencies', agencyToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                } else {
                                    let createdAgency = null;
                                    try {
                                        createdAgency = await API.createAgency(localAgency);
                                    } catch (createErr) {
                                        const msg = (createErr && createErr.message) ? String(createErr.message) : '';
                                        if (msg.includes('código') && msg.includes('ya existe') && (localAgency.barcode || localAgency.code)) {
                                            try {
                                                if (localAgency.barcode && API.getAgencyByBarcode) {
                                                    serverAgency = await API.getAgencyByBarcode(localAgency.barcode);
                                                }
                                                if (!serverAgency && localAgency.code) {
                                                    const serverAgencies = await API.getAgencies();
                                                    if (serverAgencies && serverAgencies.length > 0) {
                                                        serverAgency = serverAgencies.find(a => (a.code || '').toString().trim() === (localAgency.code || '').toString().trim());
                                                    }
                                                }
                                                if (serverAgency && serverAgency.id) {
                                                    createdAgency = await API.updateAgency(serverAgency.id, localAgency);
                                                }
                                            } catch (e) {}
                                        }
                                        if (!createdAgency) throw createErr;
                                    }
                                    if (createdAgency && createdAgency.id) {
                                        const allLocalAgencies = await DB.getAll('catalog_agencies') || [];
                                        const agenciesToUpdate = allLocalAgencies.filter(a => {
                                            const aKey = `${a.name || a.id}`;
                                            return aKey === key;
                                        });
                                        
                                        for (const agencyToUpdate of agenciesToUpdate) {
                                            agencyToUpdate.server_id = createdAgency.id;
                                            agencyToUpdate.id = createdAgency.id;
                                            agencyToUpdate.sync_status = 'synced';
                                            await DB.put('catalog_agencies', agencyToUpdate);
                                        }
                                        uploadedCount++;
                                    }
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Agencies] Error subiendo agencia ${localAgency.id}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Agencies] Sincronización local→servidor completada: ${uploadedCount} agencias subidas`);
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Agencies] Error sincronizando agencias locales al servidor:', error);
            }

            // PASO 2: Descargar agencias del servidor
            let agencies = [];
            
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getAgencies) {
                try {
                    console.log('📥 [Paso 2 Agencies] Sincronizando agencias desde el servidor...');
                    agencies = await API.getAgencies();
                    console.log(`📥 [Paso 2 Agencies] ${agencies.length} agencias recibidas del servidor`);
                    
                    // Guardar/actualizar cada agencia en IndexedDB local
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverAgency of agencies) {
                        try {
                            const key = `${serverAgency.name || serverAgency.id}`;
                            const existingLocalAgencies = await DB.getAll('catalog_agencies') || [];
                            const existingAgency = existingLocalAgencies.find(a => {
                                const aKey = `${a.name || a.id}`;
                                return aKey === key;
                            });
                            
                            const localAgency = {
                                ...serverAgency,
                                server_id: serverAgency.id,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('catalog_agencies', localAgency);
                            
                            if (existingAgency) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Agencies] Error guardando agencia ${serverAgency.id}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Agencies] Sincronización servidor→local completada: ${savedCount} nuevas, ${updatedCount} actualizadas`);
                } catch (apiError) {
                    console.warn('Error cargando agencias desde API, usando modo local:', apiError);
                    agencies = await DB.getAll('catalog_agencies') || [];
                }
            } else {
                agencies = await DB.getAll('catalog_agencies') || [];
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar
            const agenciesByKey = new Map();
            for (const agency of agencies) {
                const key = `${agency.name || agency.id}`;
                if (!agenciesByKey.has(key)) {
                    agenciesByKey.set(key, agency);
                } else {
                    const existing = agenciesByKey.get(key);
                    if (agency.server_id && !existing.server_id) {
                        agenciesByKey.set(key, agency);
                    } else if (existing.server_id && !agency.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = agency.updated_at ? new Date(agency.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            agenciesByKey.set(key, agency);
                        }
                    }
                }
            }
            agencies = Array.from(agenciesByKey.values());
            console.log(`🔍 [Paso 3 Agencies] Deduplicación: ${agencies.length} agencias únicas`);
            
            // Verificar que los códigos de barras se lean correctamente
            agencies.forEach(agency => {
                if (Utils.isBarcodeEmpty(agency.barcode)) {
                    console.log(`Agencia ${agency.id} (${agency.name}) sin código de barras`);
                }
            });

            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-building"></i> Lista de Agencias
                        </h3>
                        <button class="btn-primary btn-sm" onclick="window.Employees.showAddAgencyForm()">
                            <i class="fas fa-plus"></i> Nuevo
                        </button>
                    </div>
                </div>
                <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Barcode</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${agencies.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: var(--spacing-md);">No hay agencias</td></tr>' : agencies.map(agency => {
                                    const barcode = Utils.isBarcodeEmpty(agency.barcode) ? 'Sin código' : agency.barcode;
                                    return `
                                    <tr>
                                        <td>${agency.name || 'N/A'}</td>
                                        <td>${barcode}</td>
                                        <td>${agency.active !== false ? 'Activo' : 'Inactivo'}</td>
                                        <td>
                                            <button class="btn-secondary btn-sm" data-id="${String(agency.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.editAgency(this.getAttribute('data-id'))">Editar</button>
                                            <button class="btn-secondary btn-sm" data-id="${String(agency.id || '').replace(/"/g, '&quot;')}" onclick="window.Employees.generateAgencyBarcode(this.getAttribute('data-id'))">Barcode</button>
                                        </td>
                                    </tr>
                                `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading agencies:', e);
            content.innerHTML = '<p style="text-align: center; padding: var(--spacing-md);">Error al cargar agencias</p>';
        }
    },

    async showAddAgencyForm(agencyId = null) {
        const agency = agencyId ? await DB.get('catalog_agencies', agencyId) : null;

        const body = `
            <form id="agency-form">
                <div class="form-group">
                    <label>Nombre *</label>
                    <input type="text" id="agency-name" class="form-input" value="${agency?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Código de Barras</label>
                    <input type="text" id="agency-barcode" class="form-input" value="${agency?.barcode || ''}">
                    <button type="button" class="btn-secondary" onclick="window.Employees.generateAgencyBarcodeForForm()" style="margin-top: 5px;">Generar</button>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="agency-active" class="form-select">
                        <option value="true" ${agency?.active !== false ? 'selected' : ''}>Activo</option>
                        <option value="false" ${agency?.active === false ? 'selected' : ''}>Inactivo</option>
                    </select>
                </div>
                ${agency?.barcode ? `
                <div style="text-align: center; margin: var(--spacing-md) 0;">
                    <svg id="agency-barcode-preview"></svg>
                </div>
                ` : ''}
            </form>
        `;

        const agencyIdSafe = String(agencyId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveAgency('${agencyIdSafe}')">Guardar</button>
        `;

        UI.showModal(agencyId ? 'Editar Agencia' : 'Nueva Agencia', body, footer);

        if (agency?.barcode) {
            setTimeout(() => {
                BarcodeManager.generateCode128(agency.barcode, 'agency-barcode-preview');
            }, 100);
        }
    },

    generateAgencyBarcodeForForm() {
        const name = document.getElementById('agency-name').value;
        if (!name) {
            Utils.showNotification('Ingresa un nombre primero', 'error');
            return;
        }
        const agency = { name: name };
        const barcode = Utils.generateAgencyBarcode(agency);
        document.getElementById('agency-barcode').value = barcode;
    },

    async saveAgency(agencyId) {
        const form = document.getElementById('agency-form');
        if (!form) return;

        const name = document.getElementById('agency-name')?.value.trim();
        if (!name) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        try {
            // Obtener el registro existente si existe para preservar todas las propiedades
            const existing = agencyId ? await DB.get('catalog_agencies', agencyId) : null;
            
            const agency = existing ? {
                ...existing, // Preservar todas las propiedades existentes
                id: agencyId,
                name: name,
                active: document.getElementById('agency-active')?.value === 'true',
                updated_at: new Date().toISOString()
            } : {
                id: agencyId || `ag${Date.now()}`,
                name: name,
                active: document.getElementById('agency-active')?.value === 'true',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Manejar código de barras: usar el del formulario o generar uno nuevo
            const formBarcode = document.getElementById('agency-barcode')?.value.trim();
            if (formBarcode && formBarcode !== '') {
                agency.barcode = formBarcode;
            } else if (!agency.barcode || Utils.isBarcodeEmpty(agency.barcode)) {
                // Generar código usando la función centralizada
                agency.barcode = Utils.generateAgencyBarcode(agency);
            }

            console.log('Guardando agencia:', agency);
            await DB.put('catalog_agencies', agency);
            
            // Verificar que se guardó correctamente
            const saved = await DB.get('catalog_agencies', agency.id);
            if (!saved || saved.barcode !== agency.barcode) {
                console.error('Error: El código de barras no se guardó correctamente', { saved, expected: agency.barcode });
                throw new Error('Error al guardar código de barras');
            }
            Utils.showNotification(agencyId ? 'Agencia actualizada' : 'Agencia creada', 'success');
            UI.closeModal();
            await this.loadAgencies();
            
            // Agregar a cola de sincronización
            await SyncManager.addToQueue('catalog_agency', agency.id);
        } catch (e) {
            console.error('Error saving agency:', e);
            Utils.showNotification('Error al guardar agencia', 'error');
        }
    },

    async editAgency(agencyId) {
        await this.showAddAgencyForm(agencyId);
    },

    async generateAgencyBarcode(agencyId) {
        try {
            const agency = await DB.get('catalog_agencies', agencyId);
            if (!agency) {
                Utils.showNotification('Agencia no encontrada', 'error');
                return;
            }

            agency.barcode = Utils.generateAgencyBarcode(agency);
            await DB.put('catalog_agencies', agency);
            Utils.showNotification('Código de barras generado', 'success');
            await this.loadAgencies();
        } catch (e) {
            console.error('Error generating agency barcode:', e);
            Utils.showNotification('Error al generar código de barras', 'error');
        }
    },

    async exportAgencies() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            const agencies = await DB.getAll('catalog_agencies') || [];
            const exportData = agencies.map(a => ({
                'ID': a.id,
                'Nombre': a.name,
                'Código de Barras': a.barcode || 'Sin código',
                'Estado': a.active !== false ? 'Activo' : 'Inactivo',
                'Creado': Utils.formatDate(a.created_at, 'DD/MM/YYYY HH:mm'),
                'Actualizado': Utils.formatDate(a.updated_at, 'DD/MM/YYYY HH:mm')
            }));

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Agencias');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = new Date().toISOString().split('T')[0];
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `agencias_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `agencias_${date}.xlsx`);
            } else {
                Utils.exportToPDF(exportData, `agencias_${date}.pdf`, 'Agencias');
            }
        } catch (e) {
            console.error('Error exporting agencies:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    async exportEmployees() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            // Para exportar, los admins pueden exportar todos, otros solo su sucursal
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            let employees = await DB.getAll('employees', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Si no es admin, filtrar manualmente también
            if (!viewAllBranches && currentBranchId) {
                const normalizedBranchId = String(currentBranchId);
                employees = employees.filter(emp => {
                    if (emp.branch_id) {
                        return String(emp.branch_id) === normalizedBranchId;
                    }
                    if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                        return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                    }
                    return true;
                });
            }
            
            const branches = await DB.getAll('catalog_branches');
            
            const exportData = employees.map(emp => {
                const branch = branches.find(b => b.id === emp.branch_id);
                return {
                    Nombre: emp.name,
                    Rol: emp.role,
                    Sucursal: branch?.name || '',
                    Barcode: emp.barcode || '',
                    Estado: emp.active ? 'Activo' : 'Inactivo'
                };
            });

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Empleados');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `empleados_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `empleados_${date}.xlsx`, 'Empleados');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `empleados_${date}.pdf`, 'Empleados');
            }
        } catch (e) {
            console.error('Error exporting employees:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    // ========================================
    // FUNCIONALIDADES AVANZADAS EMPLEADOS
    // ========================================

    async showEmployeePerformance(employeeId) {
        const employee = await DB.get('employees', employeeId);
        if (!employee) {
            Utils.showNotification('Empleado no encontrado', 'error');
            return;
        }

        const sales = await DB.getAll('sales') || [];
        const employeeSales = sales.filter(s => s.employee_id === employeeId && (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')));
        
        // Calcular métricas de desempeño
        const totalSales = employeeSales.length;
        const totalRevenue = employeeSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
        
        // Ventas por mes (últimos 6 meses)
        const monthlySales = {};
        employeeSales.forEach(sale => {
            const date = new Date(sale.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlySales[monthKey]) {
                monthlySales[monthKey] = { count: 0, revenue: 0 };
            }
            monthlySales[monthKey].count += 1;
            monthlySales[monthKey].revenue += sale.total || 0;
        });

        const monthlyData = Object.entries(monthlySales)
            .map(([month, stats]) => ({ month, ...stats }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6);

        // Calcular comisiones
        const commissionRules = await DB.getAll('commission_rules');
        const employeeRule = commissionRules.find(r => r.entity_type === 'employee' && r.entity_id === employeeId);
        let totalCommissions = 0;
        if (employeeRule) {
            employeeSales.forEach(sale => {
                const commission = (sale.total || 0) * (employeeRule.discount_pct || 0) / 100;
                totalCommissions += commission;
            });
        }

        const body = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-lg);">
                <div>
                    <h4 style="margin-bottom: var(--spacing-sm);">Métricas de Desempeño</h4>
                    <div class="dashboard-grid" style="margin-bottom: var(--spacing-md);">
                        <div class="kpi-card">
                            <div class="kpi-label">Total Ventas</div>
                            <div class="kpi-value">${totalSales}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">Ingresos Generados</div>
                            <div class="kpi-value" style="font-size: 18px;">${Utils.formatCurrency(totalRevenue)}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">Ticket Promedio</div>
                            <div class="kpi-value" style="font-size: 18px;">${Utils.formatCurrency(avgTicket)}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">Comisiones</div>
                            <div class="kpi-value" style="font-size: 18px; color: var(--color-success);">${Utils.formatCurrency(totalCommissions)}</div>
                        </div>
                    </div>

                    <h4 style="margin-bottom: var(--spacing-sm);">Información del Empleado</h4>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md);">
                        <p><strong>Nombre:</strong> ${employee.name}</p>
                        <p><strong>Rol:</strong> ${employee.role || 'N/A'}</p>
                        <p><strong>Estado:</strong> <span class="status-badge status-${employee.active ? 'activo' : 'inactivo'}">${employee.active ? 'Activo' : 'Inactivo'}</span></p>
                        ${employee.barcode ? `<p><strong>Código de Barras:</strong> ${employee.barcode}</p>` : ''}
                    </div>
                </div>

                <div>
                    <h4 style="margin-bottom: var(--spacing-sm);">Tendencia de Ventas</h4>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                        ${monthlyData.length > 0 ? `
                            <div style="display: flex; align-items: flex-end; gap: 4px; height: 150px;">
                                ${monthlyData.map(month => {
                                    const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1);
                                    const height = (month.revenue / maxRevenue) * 100;
                                    const monthName = new Date(month.month + '-01').toLocaleDateString('es', { month: 'short' });
                                    return `
                                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                            <div style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                                                <div style="width: 100%; background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-accent) 100%); 
                                                    border-radius: var(--radius-xs) var(--radius-xs) 0 0; height: ${height}%; min-height: ${month.revenue > 0 ? '4px' : '0'};"></div>
                                            </div>
                                            <div style="font-size: 9px; color: var(--color-text-secondary); text-align: center;">
                                                <div>${monthName}</div>
                                                <div style="font-weight: 600; margin-top: 2px;">${month.count}</div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>'}
                    </div>
                </div>
            </div>
        `;

        const self = this;
        UI.showModal(`Desempeño: ${employee.name}`, body, [
            { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
        ]);
    },

    async calculateEmployeeCommissions(employeeId, startDate, endDate) {
        const sales = await DB.getAll('sales');
        const filteredSales = sales.filter(s => {
            const saleDate = new Date(s.created_at);
            return s.seller_id === employeeId &&
                   (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')) &&
                   saleDate >= new Date(startDate) &&
                   saleDate <= new Date(endDate);
        });

        const commissionRules = await DB.getAll('commission_rules');
        const employeeRule = commissionRules.find(r => r.entity_type === 'employee' && r.entity_id === employeeId);
        
        let totalCommissions = 0;
        const commissionDetails = [];

        filteredSales.forEach(sale => {
            let commission = 0;
            if (employeeRule) {
                commission = (sale.total || 0) * (employeeRule.discount_pct || 0) / 100;
            }
            totalCommissions += commission;
            commissionDetails.push({
                folio: sale.folio,
                date: sale.created_at,
                amount: sale.total,
                commission: commission
            });
        });

        return { totalCommissions, commissionDetails, salesCount: filteredSales.length };
    },

    async verifyEmployeesData() {
        try {
            Utils.showNotification('Verificando datos de empleados...', 'info');
            
            const issues = [];
            const warnings = [];
            const successes = [];

            // Obtener sucursal actual y filtrar empleados
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            let employees = await DB.getAll('employees', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Si no es admin, filtrar manualmente también
            if (!viewAllBranches && currentBranchId) {
                const normalizedBranchId = String(currentBranchId);
                employees = employees.filter(emp => {
                    if (emp.branch_id) {
                        return String(emp.branch_id) === normalizedBranchId;
                    }
                    if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                        return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                    }
                    return true;
                });
            }
            
            const users = await DB.getAll('users') || [];
            const branches = await DB.getAll('catalog_branches') || [];

            // Verificar empleados
            if (employees.length === 0) {
                warnings.push('No hay empleados registrados');
            } else {
                successes.push(`${employees.length} empleados encontrados`);
                
                employees.forEach(emp => {
                    if (!emp.name || emp.name.trim() === '') {
                        issues.push(`Empleado ${emp.id}: Falta nombre`);
                    }
                    if (!emp.role) {
                        issues.push(`Empleado ${emp.name || emp.id}: Falta rol`);
                    }
                    if (emp.branch_id) {
                        const branch = branches.find(b => b.id === emp.branch_id);
                        if (!branch) {
                            issues.push(`Empleado ${emp.name || emp.id}: Sucursal asignada no existe (${emp.branch_id})`);
                        } else if (!branch.active) {
                            warnings.push(`Empleado ${emp.name || emp.id}: Asignado a sucursal inactiva (${branch.name})`);
                        }
                    }
                    if (!emp.barcode || emp.barcode.trim() === '') {
                        warnings.push(`Empleado ${emp.name || emp.id}: Falta código de barras`);
                    }
                });
            }

            // Verificar usuarios
            if (users.length === 0) {
                warnings.push('No hay usuarios registrados');
            } else {
                successes.push(`${users.length} usuarios encontrados`);
                
                users.forEach(user => {
                    if (!user.username || user.username.trim() === '') {
                        issues.push(`Usuario ${user.id}: Falta username`);
                    }
                    if (!user.employee_id) {
                        issues.push(`Usuario ${user.username || user.id}: No está vinculado a un empleado`);
                    } else {
                        const emp = employees.find(e => e.id === user.employee_id);
                        if (!emp) {
                            issues.push(`Usuario ${user.username || user.id}: Empleado vinculado no existe (${user.employee_id})`);
                        }
                    }
                    if (!user.role) {
                        issues.push(`Usuario ${user.username || user.id}: Falta rol`);
                    }
                    if (!user.pin_hash) {
                        warnings.push(`Usuario ${user.username || user.id}: No tiene PIN configurado`);
                    }
                });
            }

            // Verificar consistencia empleado-usuario
            employees.forEach(emp => {
                const user = users.find(u => u.employee_id === emp.id);
                if (!user && emp.active) {
                    warnings.push(`Empleado ${emp.name || emp.id}: Activo pero sin usuario asociado`);
                }
            });

            // Generar reporte
            const reportHTML = `
                <div style="max-width: 600px;">
                    <h4 style="margin-bottom: var(--spacing-md);">Resultado de Verificación</h4>
                    
                    ${issues.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #ffebee; border-left: 4px solid #d32f2f; border-radius: var(--radius-sm);">
                            <h5 style="color: #d32f2f; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-circle"></i> Problemas Encontrados (${issues.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px; max-height: 200px; overflow-y: auto;">
                                ${issues.map(issue => `<li style="margin-bottom: var(--spacing-xs);">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${warnings.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #fff3e0; border-left: 4px solid #f57c00; border-radius: var(--radius-sm);">
                            <h5 style="color: #f57c00; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-triangle"></i> Advertencias (${warnings.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px; max-height: 200px; overflow-y: auto;">
                                ${warnings.map(warning => `<li style="margin-bottom: var(--spacing-xs);">${warning}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${successes.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm);">
                            <h5 style="color: #388e3c; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-check-circle"></i> Verificaciones Exitosas
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${successes.map(success => `<li style="margin-bottom: var(--spacing-xs);">${success}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${issues.length === 0 && warnings.length === 0 ? `
                        <div style="padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm); text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 32px; color: #388e3c; margin-bottom: var(--spacing-sm);"></i>
                            <p style="font-weight: 600; color: #388e3c;">¡Todos los datos están correctos!</p>
                        </div>
                    ` : ''}
                </div>
            `;

            UI.showModal('Verificación de Empleados y Usuarios', reportHTML, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);

            if (issues.length > 0) {
                Utils.showNotification(`Se encontraron ${issues.length} problemas en los datos`, 'error');
            } else if (warnings.length > 0) {
                Utils.showNotification(`Verificación completada con ${warnings.length} advertencias`, 'info');
            } else {
                Utils.showNotification('Verificación completada: Todos los datos están correctos', 'success');
            }

        } catch (e) {
            console.error('Error verificando empleados:', e);
            Utils.showNotification('Error al verificar: ' + e.message, 'error');
        }
    },

    setupSocketListeners() {
        // Escuchar eventos Socket.IO para actualización en tiempo real
        // Eventos de empleados de todas las sucursales (master_admin)
        if (typeof UserManager !== 'undefined' && UserManager.currentUser?.is_master_admin) {
            window.addEventListener('employee-updated-all-branches', async (e) => {
                const { branchId, action, employee } = e.detail;
                if (this.initialized) {
                    console.log(`👤 Employees: Empleado actualizado en sucursal ${branchId} (${action})`);
                    // Recargar empleados después de un pequeño delay
                    setTimeout(async () => {
                        await this.loadEmployees();
                    }, 300);
                }
            });
        }
        
        // Eventos de empleados locales (para usuarios normales o master_admin viendo su sucursal)
        window.addEventListener('employee-updated', async (e) => {
            if (this.initialized) {
                const { employee } = e.detail || {};
                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                // Solo actualizar si el empleado es de la sucursal actual
                if (employee && (!currentBranchId || employee.branch_id === currentBranchId)) {
                    console.log(`👤 Employees: Empleado actualizado localmente`);
                    setTimeout(async () => {
                        await this.loadEmployees();
                    }, 300);
                }
            }
        });
        
        // Eventos de usuarios
        window.addEventListener('user-updated', async (e) => {
            if (this.initialized) {
                console.log(`👤 Employees: Usuario actualizado`);
                setTimeout(async () => {
                    await this.loadEmployees();
                }, 300);
            }
        });
    }
};

// Exponer al scope global inmediatamente
try {
    window.Employees = Employees;
} catch(e) {
    console.error('Error exposing Employees to window:', e);
}

