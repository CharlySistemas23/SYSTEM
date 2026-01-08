// Employees & Users Management Module

// #region agent log
try {
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:1',message:'employees.js script START loading',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
} catch(e) { console.error('Log error:', e); }
// #endregion

const Employees = {
    initialized: false,
    
    async init() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:6',message:'Employees.init() called',data:{initialized:this.initialized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (this.initialized) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:8',message:'Employees already initialized, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return;
        }
        try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:12',message:'Calling setupUI()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            this.setupUI();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:15',message:'setupUI() completed, calling loadEmployees()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            await this.loadEmployees();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:17',message:'loadEmployees() completed, setting initialized=true',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            this.initialized = true;
        } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:20',message:'Error in Employees.init()',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.error('Error in Employees.init():', e);
            throw e;
        }
    },

    setupUI() {
        console.log('🔧 Employees.setupUI() called');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:44',message:'setupUI() called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Asegurar que el placeholder esté visible
        const placeholder = document.getElementById('module-placeholder');
        if (placeholder) {
            placeholder.style.display = 'block';
            console.log('✅ module-placeholder set to block');
        } else {
            console.error('❌ module-placeholder not found!');
        }
        
        const content = document.getElementById('module-content');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:52',message:'module-content element check',data:{found:!!content,placeholderDisplay:placeholder?.style.display||'N/A',contentParent:content?.parentElement?.id||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!content) {
            console.error('❌ module-content not found in Employees.setupUI()');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:62',message:'module-content not found, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            return;
        }
        console.log('✅ module-content found, setting innerHTML');

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:61',message:'Setting innerHTML',data:{contentExists:!!content,placeholderDisplay:placeholder?.style.display||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        content.innerHTML = `
            <div id="employees-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="employees"><i class="fas fa-user-tie"></i> Empleados</button>
                <button class="tab-btn" data-tab="users"><i class="fas fa-user-shield"></i> Usuarios</button>
                <button class="tab-btn" data-tab="sellers"><i class="fas fa-user-tag"></i> Vendedores</button>
                <button class="tab-btn" data-tab="guides"><i class="fas fa-suitcase"></i> Guías</button>
                <button class="tab-btn" data-tab="agencies"><i class="fas fa-building"></i> Agencias</button>
            </div>
            <div id="employees-content"></div>
        `;
        
        console.log('✅ innerHTML set, content length:', content.innerHTML.length);
        console.log('✅ employees-tabs exists:', !!document.getElementById('employees-tabs'));
        
        // Asegurar que el contenido sea visible después de insertarlo
        content.style.display = 'block';
        content.style.visibility = 'visible';
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.style.visibility = 'visible';
            console.log('✅ Placeholder visibility ensured');
        }
        
        // #region agent log
        const tabsAfter = document.getElementById('employees-tabs');
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:106',message:'innerHTML set, checking elements',data:{tabsExists:!!tabsAfter,contentLength:content.innerHTML.length,placeholderDisplay:placeholder?.style.display||'N/A',contentDisplay:content.style.display||'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

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
        // Cargar la pestaña inicial
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:58',message:'setupUI() completed, about to load initial tab',data:{currentTab:this.currentTab},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        this.loadTab('employees');
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

    async loadEmployees() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('employees.view')) {
            const content = document.getElementById('employees-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver empleados</div>';
            }
            return;
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:126',message:'loadEmployees() called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const content = document.getElementById('employees-content');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:128',message:'employees-content element check',data:{found:!!content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (!content) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:130',message:'employees-content not found, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return;
        }

        try {
            // Obtener sucursal actual y filtrar empleados
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            // Para admins, SIEMPRE obtener todos los empleados sin filtrar por sucursal
            // Para no-admins, filtrar por sucursal actual
            let employees = [];
            if (viewAllBranches && isAdmin) {
                // Admin: obtener TODOS los empleados sin filtrar
                employees = await DB.getAll('employees') || [];
                console.log(`[Employees] Admin view: Obteniendo todos los empleados (${employees.length} total)`);
            } else {
                // No-admin o admin con filtro: obtener solo empleados de la sucursal actual
                employees = await DB.getAll('employees', null, null, { 
                    filterByBranch: !viewAllBranches, 
                    branchIdField: 'branch_id',
                    includeNull: true // Incluir empleados sin sucursal asignada
                }) || [];
                console.log(`[Employees] Filtrando por sucursal ${currentBranchId}: ${employees.length} empleados`);
            }
            
            // Verificación adicional para no-admins (doble seguridad)
            if (!viewAllBranches && currentBranchId && !isAdmin) {
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
                
                const completedSales = allSales.filter(s => s && s.status === 'completada');
                const totalSales = completedSales.reduce((sum, s) => sum + (s.total || 0), 0);
                const avgSale = completedSales.length > 0 ? totalSales / completedSales.length : 0;
                
                return {
                    ...emp,
                    salesCount: completedSales.length,
                    totalSales,
                    avgSale
                };
            });
            
            // Mostrar estadísticas generales
            await this.displayEmployeeStats(employeesWithStats);

            // Guardar para filtros
            this.currentEmployeesData = employeesWithStats;
            this.currentBranchesData = branches;

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
        } catch (e) {
            console.error('Error loading employees:', e);
            Utils.showNotification('Error al cargar empleados: ' + e.message, 'error');
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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:335',message:'Visibility check after loadEmployees',data:{placeholderDisplay:placeholder?.style.display||'N/A',moduleContentDisplay:moduleContent?.style.display||'N/A',employeesContentExists:!!employeesContent,employeesContentLength:employeesContent?.innerHTML.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
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
        
        const sales = await DB.getAll('sales') || [];
        const employeeSales = sales.filter(s => {
            // Buscar ventas relacionadas con este empleado
            return s.employee_id === employeeId;
        });
        
        const completedSales = employeeSales.filter(s => s.status === 'completada');
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
            const users = await DB.getAll('users') || [];
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

            // Guardar para filtros
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
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Sucursal</label>
                        <select id="emp-branch" class="form-select">
                            <option value="">Sin sucursal</option>
                            ${branches.filter(b => b.active).map(b => `<option value="${b.id}" ${employee?.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                        </select>
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

        // Focus en el nombre
        setTimeout(() => {
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
            const branchId = branchInput?.value || null;
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

            const employee = {
                id: employeeId || Utils.generateId(),
                name: name,
                role: role,
                branch_id: branchId || null,
                barcode: finalBarcode,
                active: active,
                created_at: employeeId ? (await DB.get('employees', employeeId))?.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await DB.put('employees', employee);
            await SyncManager.addToQueue('employee', employee.id);

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
                if (employee.role === 'admin') {
                    permissions = ['all'];
                } else {
                    permissions = PermissionManager.getRolePermissions(employee.role) || [];
                }
            } else {
                // Fallback si PermissionManager no está disponible
                if (employee.role === 'admin') {
                    permissions = ['all'];
                } else {
                    permissions = ['pos.view', 'inventory.view'];
                }
            }

            const user = {
                id: Utils.generateId(),
                username: finalUsername,
                employee_id: employee.id,
                role: employee.role || 'seller',
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

        const permissions = [
            'descuentos', 'cancelaciones', 'devoluciones', 'editar_costo',
            'export', 'tipo_cambio', 'catalogos', 'ver_utilidades'
        ];

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
                        <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
                        <option value="manager" ${user?.role === 'manager' ? 'selected' : ''}>Gerente</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>PIN (dejar vacío para mantener actual)</label>
                    <input type="password" id="user-pin" class="form-input" maxlength="6" placeholder="6 dígitos">
                </div>
                <div class="form-group">
                    <label>Permisos</label>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
                        ${permissions.map(perm => `
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" value="${perm}" ${user?.permissions?.includes(perm) ? 'checked' : ''}>
                                ${perm.replace(/_/g, ' ')}
                            </label>
                        `).join('')}
                    </div>
                </div>
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
            pinHash = existing.pin_hash;
        }

        const checkboxes = document.querySelectorAll('#user-form input[type="checkbox"]:checked');
        const permissions = Array.from(checkboxes).map(cb => cb.value);

        const user = {
            id: userId || Utils.generateId(),
            username: document.getElementById('user-username').value,
            employee_id: document.getElementById('user-employee').value || null,
            role: document.getElementById('user-role').value,
            pin_hash: pinHash,
            permissions: permissions,
            active: document.getElementById('user-active').value === 'true',
            created_at: userId ? (await DB.get('users', userId))?.created_at : new Date().toISOString()
        };

        await DB.put('users', user);
        await SyncManager.addToQueue('user', user.id);

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

            // Verificar si tiene un usuario asociado
            const users = await DB.getAll('users') || [];
            const associatedUser = users.find(u => u.employee_id === employeeId);
            
            if (associatedUser) {
                const deleteUserToo = await Utils.confirm(
                    `Este empleado tiene un usuario asociado (${associatedUser.username}).\n\n` +
                    `¿Deseas eliminar también el usuario?`,
                    'Eliminar Usuario También'
                );
                
                if (deleteUserToo) {
                    await DB.delete('users', associatedUser.id);
                    await SyncManager.addToQueue('user', associatedUser.id, 'delete');
                    Utils.showNotification('Usuario eliminado', 'info');
                } else {
                    // Desvincular el usuario del empleado
                    associatedUser.employee_id = null;
                    await DB.put('users', associatedUser);
                    Utils.showNotification('Usuario desvinculado del empleado', 'info');
                }
            }

            // Guardar metadata del empleado antes de eliminarlo para sincronización
            const employeeMetadata = {
                id: employee.id,
                name: employee.name,
                branch_id: employee.branch_id || employee.branch_ids?.[0] || null,
                deleted_at: new Date().toISOString()
            };
            
            // Agregar a cola de sincronización ANTES de eliminar
            if (typeof SyncManager !== 'undefined') {
                try {
                    await DB.add('sync_deleted_items', {
                        id: employeeId,
                        entity_type: 'employee',
                        metadata: employeeMetadata,
                        deleted_at: new Date().toISOString()
                    });
            await SyncManager.addToQueue('employee', employeeId, 'delete');
                } catch (syncError) {
                    console.error('Error guardando metadata para sincronización:', syncError);
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
                `Esta acción NO se puede deshacer.\n\n` +
                `El empleado asociado NO será eliminado, solo se desvinculará.`,
                'Confirmar Eliminación'
            );

            if (!confirmed) return;

            // Eliminar el usuario
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
        const content = document.getElementById('employees-content');
        if (!content) return;

        try {
            const sellers = await DB.getAll('catalog_sellers') || [];
            
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
                                    <button class="btn-secondary btn-sm" onclick="window.Employees.editSeller('${seller.id}')">Editar</button>
                                    <button class="btn-secondary btn-sm" onclick="window.Employees.generateSellerBarcode('${seller.id}')">Barcode</button>
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

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveSeller('${sellerId || ''}')">Guardar</button>
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
        const content = document.getElementById('employees-content');
        if (!content) return;

        try {
            const guides = await DB.getAll('catalog_guides') || [];
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
                                        <button class="btn-secondary btn-sm" onclick="window.Employees.editGuide('${guide.id}')">Editar</button>
                                        <button class="btn-secondary btn-sm" onclick="window.Employees.generateGuideBarcode('${guide.id}')">Barcode</button>
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

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveGuide('${guideId || ''}')">Guardar</button>
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
            if (!format) return;
            
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
        }
    },

    // ========== AGENCIAS ==========
    async loadAgencies() {
        const content = document.getElementById('employees-content');
        if (!content) return;

        try {
            const agencies = await DB.getAll('catalog_agencies') || [];
            
            // Verificar que los códigos de barras se lean correctamente
            agencies.forEach(agency => {
                if (Utils.isBarcodeEmpty(agency.barcode)) {
                    console.log(`Agencia ${agency.id} (${agency.name}) sin código de barras`);
                }
            });

            content.innerHTML = `
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
                                    <button class="btn-secondary btn-sm" onclick="window.Employees.editAgency('${agency.id}')">Editar</button>
                                    <button class="btn-secondary btn-sm" onclick="window.Employees.generateAgencyBarcode('${agency.id}')">Barcode</button>
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

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Employees.saveAgency('${agencyId || ''}')">Guardar</button>
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
            if (!format) return;
            
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
        }
    },

    async exportEmployees() {
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
            if (!format) return;
            
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
        const employeeSales = sales.filter(s => s.employee_id === employeeId && s.status === 'completada');
        
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
                   s.status === 'completada' &&
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
    }
};

// Exponer al scope global inmediatamente
try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:2048',message:'Exposing Employees to window',data:{employeesDefined:typeof Employees!=='undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    window.Employees = Employees;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:2052',message:'Employees exposed to window successfully',data:{windowEmployeesDefined:typeof window.Employees!=='undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.log('✅ Employees module loaded and exposed to window');
} catch(e) {
    console.error('❌ Error exposing Employees to window:', e);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employees.js:2057',message:'ERROR exposing Employees',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
}

