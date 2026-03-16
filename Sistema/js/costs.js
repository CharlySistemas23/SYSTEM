// Costs Module - Gestión Avanzada de Costos

const Costs = {
    initialized: false,
    isExporting: false,
    _lastBackgroundRefreshTime: 0,
    _costsPaso1InProgress: false,
    currentTab: 'costs',
    salesCostCategories: ['costo_ventas', 'comisiones', 'comisiones_bancarias'],

    isSalesCostCategory(category) {
        return this.salesCostCategories.includes((category || '').toLowerCase());
    },

    getOperationalCosts(costs = []) {
        return costs.filter(c => !this.isSalesCostCategory(c.category));
    },

    getSalesCosts(costs = []) {
        return costs.filter(c => this.isSalesCostCategory(c.category));
    },
    
    // Helper para obtener costos filtrados por sucursal
    async getFilteredCosts(options = {}) {
        const {
            branchId = null,
            dateFrom = null,
            dateTo = null,
            type = null,
            category = null
        } = options;

        // Obtener TODOS los costos sin filtro de sucursal desde DB
        // Luego aplicaremos el filtro manualmente para tener control total
        let costs = await DB.getAll('cost_entries') || [];

        // Normalizar branch_id para comparación flexible (case-insensitive para compatibilidad)
        const normalizedBranchId = branchId
            ? (typeof Utils !== 'undefined' && Utils.normalizeBranchId
                ? Utils.normalizeBranchId(branchId)
                : String(branchId).trim().toLowerCase())
            : null;

        // Aplicar filtro de sucursal
        if (normalizedBranchId && normalizedBranchId !== '') {
            // Filtrar por sucursal específica (comparación case-insensitive)
            costs = costs.filter(c => {
                const costBranchId = c.branch_id
                    ? (typeof Utils !== 'undefined' && Utils.normalizeBranchId
                        ? Utils.normalizeBranchId(c.branch_id)
                        : String(c.branch_id).trim().toLowerCase())
                    : null;
                if (!costBranchId) return false;
                return costBranchId === normalizedBranchId;
            });
        } else {
            // Si no hay branchId, mostrar todos los costos (para admin o cuando se selecciona "Todas")
            // No filtrar por sucursal
        }

        const toYYYYMMDD = (val) => {
            if (typeof Utils !== 'undefined' && Utils.normalizeDateKey) {
                return Utils.normalizeDateKey(val);
            }
            if (!val) return '';
            if (typeof val === 'string') {
                if (val.includes('T')) return val.split('T')[0];
                if (val.includes(' ')) return val.split(' ')[0];
                return val;
            }
            return new Date(val).toISOString().split('T')[0];
        };
        if (dateFrom) {
            const fromStr = toYYYYMMDD(dateFrom);
            costs = costs.filter(c => toYYYYMMDD(c.date || c.created_at) >= fromStr);
        }
        if (dateTo) {
            const toStr = toYYYYMMDD(dateTo);
            costs = costs.filter(c => toYYYYMMDD(c.date || c.created_at) <= toStr);
        }
        if (type) {
            const normalizedType = (typeof Utils !== 'undefined' && Utils.normalizeCostType)
                ? Utils.normalizeCostType(type)
                : String(type).trim().toLowerCase();
            costs = costs.filter(c => {
                const cType = (typeof Utils !== 'undefined' && Utils.normalizeCostType)
                    ? Utils.normalizeCostType(c.type)
                    : String(c.type || '').trim().toLowerCase();
                return cType === normalizedType;
            });
        }
        if (category) {
            const normalizedCategory = (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey)
                ? Utils.normalizeCategoryKey(category)
                : String(category || '').toLowerCase().replace(/\s+/g, '_');
            costs = costs.filter(c => {
                const cCategory = (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey)
                    ? Utils.normalizeCategoryKey(c.category)
                    : String(c.category || '').toLowerCase().replace(/\s+/g, '_');
                return cCategory === normalizedCategory;
            });
        }

        return costs;
    },
    
    async init() {
        try {
            // Verificar permiso
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('costs.view')) {
                const content = document.getElementById('module-content');
                if (content) {
                    content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver costos</div>';
                }
                return;
            }

            if (this.initialized) {
                const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
                await this.loadTab(activeTab);
                return;
            }
            
            this.setupUI();
            await this.loadTab('costs');
            this.initialized = true;
        
        // Escuchar cambios de sucursal para recargar costos
        window.addEventListener('branch-changed', async () => {
            if (this.initialized) {
                // Pequeño delay para asegurar que BranchManager se actualizó
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Actualizar filtros de sucursal con la nueva sucursal actual
                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                
                // Actualizar filtro de costos
                const costBranchFilter = document.getElementById('cost-branch-filter');
                if (costBranchFilter) {
                    await this.loadBranchFilter();
                    // Si no hay selección manual, usar la sucursal actual
                    if (!costBranchFilter.dataset.manualSelection) {
                        costBranchFilter.value = currentBranchId || '';
                    }
                }
                
                // Actualizar filtro de recurrentes
                const recurringBranchFilter = document.getElementById('recurring-branch-filter');
                if (recurringBranchFilter) {
                    await this.loadRecurringBranchFilter();
                    // Si no hay selección manual, usar la sucursal actual
                    if (!recurringBranchFilter.dataset.manualSelection) {
                        recurringBranchFilter.value = currentBranchId || '';
                    }
                }
                
                // Recargar la pestaña activa
                const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
                await this.loadTab(activeTab);
            }
        });
        
            // Escuchar eventos Socket.IO para actualización en tiempo real
            this.setupSocketListeners();
        } catch (error) {
            console.error('❌ Error inicializando módulo de Costos:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3>Error cargando módulo de Costos</h3>
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
        const content = document.getElementById('module-content');
        if (!content) return;

        // Crear estructura de tabs
        content.innerHTML = `
            <div id="costs-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="costs"><i class="fas fa-dollar-sign"></i> Costos</button>
                <button class="tab-btn" data-tab="sales_costs"><i class="fas fa-cash-register"></i> Costo de Ventas</button>
                <button class="tab-btn" data-tab="arrivals"><i class="fas fa-plane"></i> Llegadas</button>
                <button class="tab-btn" data-tab="recurring"><i class="fas fa-sync-alt"></i> Recurrentes</button>
                <button class="tab-btn" data-tab="overview"><i class="fas fa-chart-line"></i> Resumen</button>
                <button class="tab-btn" data-tab="analysis"><i class="fas fa-chart-bar"></i> Análisis</button>
                <button class="tab-btn" data-tab="history"><i class="fas fa-history"></i> Historial</button>
                <button class="tab-btn" data-tab="budget"><i class="fas fa-calculator"></i> Presupuestos</button>
            </div>
            <div id="costs-content"></div>
        `;

        // Event listeners para tabs
        document.querySelectorAll('#costs-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const clickedBtn = e.target.closest('.tab-btn');
                if (!clickedBtn) return;
                
                document.querySelectorAll('#costs-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                clickedBtn.classList.add('active');
                const tab = clickedBtn.dataset.tab;
                this.loadTab(tab);
            });
        });
    },

    async loadTab(tab) {
        const content = document.getElementById('costs-content');
        if (!content) return;

        this.currentTab = tab;

        try {
            content.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

            switch(tab) {
                case 'costs':
                    content.innerHTML = await this.getCostsTab();
                    await this.loadCosts();
                    break;
                case 'sales_costs':
                    content.innerHTML = await this.getSalesCostsTab();
                    await this.loadCosts();
                    break;
                case 'cogs': // compatibilidad con tabs antiguas
                    this.currentTab = 'sales_costs';
                    content.innerHTML = await this.getSalesCostsTab();
                    await this.loadCosts();
                    break;
                case 'arrivals':
                    content.innerHTML = await this.getArrivalsTab();
                    await this.loadArrivals();
                    break;
                case 'recurring':
                    content.innerHTML = await this.getRecurringTab();
                    await this.loadRecurring();
                    break;
                case 'overview':
                    content.innerHTML = await this.getOverviewTab();
                    await this.loadOverview();
                    break;
                case 'analysis':
                    content.innerHTML = await this.getAnalysisTab();
                    await this.loadAnalysis();
                    break;
                case 'history':
                    content.innerHTML = await this.getHistoryTab();
                    await this.loadHistory();
                    break;
                case 'budget':
                    content.innerHTML = await this.getBudgetTab();
                    await this.loadBudget();
                    break;
                default:
                    content.innerHTML = '<p>Pestaña no encontrada</p>';
            }
        } catch (e) {
            console.error(`Error loading tab ${tab}:`, e);
            content.innerHTML = `
                <div style="padding: var(--spacing-md); background: var(--color-danger); color: white; border-radius: var(--radius-md);">
                    <strong>Error al cargar:</strong> ${e.message}
                </div>
            `;
        }
    },

    async getCostsTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="cost-branch-filter" class="form-select" style="width: 100%;">
                        <option value="">Todas las sucursales</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <input type="text" id="cost-search" class="form-input" placeholder="Buscar por categoría, notas..." style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <select id="cost-type-filter" class="form-select" style="width: 100%;">
                        <option value="">Todos los tipos</option>
                        <option value="variable">Variable</option>
                        <option value="fijo">Fijo</option>
                    </select>
                </div>
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="cost-category-filter" class="form-select" style="width: 100%;">
                        <option value="">Todas las categorías</option>
                        <option value="luz">Luz</option>
                        <option value="agua">Agua</option>
                        <option value="renta">Renta</option>
                        <option value="nomina">Nómina</option>
                        <option value="comisiones">Comisiones</option>
                        <option value="despensa">Despensa</option>
                        <option value="linea_amarilla">Línea Amarilla</option>
                        <option value="licencias">Licencias y Permisos</option>
                        <option value="pago_llegadas">Pago de Llegadas</option>
                        <option value="adquisicion">Adquisición de Productos</option>
                        <option value="reparacion">Reparaciones</option>
                    </select>
                </div>
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="cost-supplier-filter" class="form-select" style="width: 100%;">
                        <option value="">Todos los proveedores</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="cost-date-from" class="form-input" placeholder="Desde" style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="cost-date-to" class="form-input" placeholder="Hasta" style="width: 100%;">
                </div>
                <button class="btn-primary btn-sm" id="cost-add-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-plus"></i> Nuevo</button>
                <button class="btn-secondary btn-sm" id="cost-export-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="costs-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;
    },

    async getSalesCostsTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="cost-branch-filter" class="form-select" style="width: 100%;">
                        <option value="">Todas las sucursales</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <input type="text" id="cost-search" class="form-input" placeholder="Buscar por venta, categoría, notas..." style="width: 100%;">
                </div>
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="cost-category-filter" class="form-select" style="width: 100%;">
                        <option value="">Todos los costos de venta</option>
                        <option value="costo_ventas">Mercancía Vendida (COGS)</option>
                        <option value="comisiones">Comisiones</option>
                        <option value="comisiones_bancarias">Comisiones Bancarias</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="cost-date-from" class="form-input" placeholder="Desde" style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="cost-date-to" class="form-input" placeholder="Hasta" style="width: 100%;">
                </div>
                <button class="btn-secondary btn-sm" id="cost-export-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="costs-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;
    },

    async getArrivalsTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="arrivals-branch-filter" class="form-select" style="width: 100%;">
                        <option value="">Todas las sucursales</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="arrivals-date-from" class="form-input" placeholder="Desde" style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="arrivals-date-to" class="form-input" placeholder="Hasta" style="width: 100%;">
                </div>
                <div class="form-group" style="flex: 1;"></div>
                <button class="btn-secondary btn-sm" id="arrivals-export-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="arrivals-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;
    },

    async loadArrivals() {
        // Setup event listeners
        document.getElementById('arrivals-export-btn')?.addEventListener('click', () => this.exportArrivals());
        document.getElementById('arrivals-branch-filter')?.addEventListener('change', () => this.loadArrivals());
        document.getElementById('arrivals-date-from')?.addEventListener('change', () => this.loadArrivals());
        document.getElementById('arrivals-date-to')?.addEventListener('change', () => this.loadArrivals());

        // Cargar opciones de sucursales en el filtro
        await this.loadArrivalsBranchFilter();

        try {
            // Obtener sucursal seleccionada
            const branchFilter = document.getElementById('arrivals-branch-filter');
            const branchFilterValue = branchFilter?.value || '';
            
            // Verificar si el usuario es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id');
            
            const selectedBranchId = !isMasterAdmin ? currentBranchId : (branchFilterValue || null);
            
            // Obtener solo costos de llegadas
            const allCosts = await DB.getAll('cost_entries') || [];
            let arrivalCosts = allCosts.filter(c => c.category === 'pago_llegadas');
            
            // Aplicar filtro de sucursal
            if (selectedBranchId) {
                arrivalCosts = arrivalCosts.filter(c => {
                    if (!c.branch_id) return false;
                    return String(c.branch_id) === String(selectedBranchId);
                });
            }
            
            // Aplicar filtros de fecha
            const dateFrom = document.getElementById('arrivals-date-from')?.value;
            const dateTo = document.getElementById('arrivals-date-to')?.value;
            
            if (dateFrom) {
                arrivalCosts = arrivalCosts.filter(c => (c.date || c.created_at) >= dateFrom);
            }
            if (dateTo) {
                arrivalCosts = arrivalCosts.filter(c => (c.date || c.created_at) <= dateTo);
            }
            
            // Eliminar duplicados ANTES de agrupar por día
            // Agrupar por arrival_id primero (más confiable)
            const uniqueCosts = new Map();
            arrivalCosts.forEach(cost => {
                const amount = typeof cost.amount === 'number' ? cost.amount : parseFloat(cost.amount || 0) || 0;
                
                // Si tiene arrival_id, usar como clave única
                if (cost.arrival_id) {
                    const existing = uniqueCosts.get(cost.arrival_id);
                    if (!existing || amount > (existing.amount || 0)) {
                        uniqueCosts.set(cost.arrival_id, cost);
                    }
                } else {
                    // Si no tiene arrival_id, usar combinación de fecha+agencia+sucursal+monto
                    const key = `${cost.date || cost.created_at || ''}_${cost.agency_id || ''}_${cost.branch_id || ''}_${amount}`;
                    if (!uniqueCosts.has(key)) {
                        uniqueCosts.set(key, cost);
                    }
                }
            });
            
            // Convertir Map a array
            const uniqueArrivalCosts = Array.from(uniqueCosts.values());
            
            // Agrupar por día (solo costos únicos)
            const costsByDate = {};
            uniqueArrivalCosts.forEach(cost => {
                const dateStr = (cost.date || cost.created_at).split('T')[0];
                if (!costsByDate[dateStr]) {
                    costsByDate[dateStr] = [];
                }
                costsByDate[dateStr].push(cost);
            });
            
            // Ordenar fechas descendente
            const sortedDates = Object.keys(costsByDate).sort((a, b) => b.localeCompare(a));
            
            // Mostrar agrupado por día
            this.displayArrivalsByDate(costsByDate, sortedDates, selectedBranchId);
            
        } catch (e) {
            console.error('Error loading arrivals:', e);
            Utils.showNotification('Error al cargar llegadas', 'error');
        }
    },

    async loadArrivalsBranchFilter() {
        const branchFilter = document.getElementById('arrivals-branch-filter');
        if (!branchFilter) return;

        // Verificar si el usuario es master_admin
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        
        if (!isMasterAdmin) {
            // Ocultar el dropdown y forzar filtro a su sucursal
            const branchFilterContainer = branchFilter.parentElement;
            if (branchFilterContainer && branchFilterContainer.style) {
                branchFilterContainer.style.display = 'none';
            }
            branchFilter.innerHTML = currentBranchId 
                ? `<option value="${currentBranchId}">${(await DB.get('catalog_branches', currentBranchId))?.name || 'Mi Sucursal'}</option>`
                : '<option value="">Sin sucursal</option>';
            branchFilter.value = currentBranchId || '';
        } else {
            // Master admin puede ver todas las sucursales
            const branches = await DB.getAll('catalog_branches') || [];
            const uniqueBranches = branches.filter((b, index, self) => 
                index === self.findIndex(br => br.id === b.id)
            );
            
            branchFilter.innerHTML = '<option value="">Todas las sucursales</option>' +
                uniqueBranches.map(branch => 
                    `<option value="${branch.id}">${branch.name}</option>`
                ).join('');
            
            // Si no hay selección manual, usar la sucursal actual
            if (!branchFilter.dataset.manualSelection) {
                branchFilter.value = currentBranchId || '';
            }
        }
    },

    async displayArrivalsByDate(costsByDate, sortedDates, selectedBranchId) {
        const container = document.getElementById('arrivals-list');
        if (!container) return;

        if (sortedDates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-plane" style="font-size: 48px; opacity: 0.3; margin-bottom: var(--spacing-md);"></i>
                    <p>No hay costos de llegadas registrados</p>
                    <p style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Los costos de llegadas se crean automáticamente al registrar llegadas en el módulo de Reportes
                    </p>
                </div>
            `;
            return;
        }

        const branches = await DB.getAll('catalog_branches') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const allArrivals = await DB.getAll('agency_arrivals') || [];
        
        let html = '';
        let grandTotal = 0;
        let totalArrivals = 0;

        sortedDates.forEach(dateStr => {
            const dayCosts = costsByDate[dateStr];
            
            // Eliminar duplicados dentro del día (por arrival_id o por combinación única)
            const uniqueDayCosts = new Map();
            dayCosts.forEach(cost => {
                const amount = typeof cost.amount === 'number' ? cost.amount : parseFloat(cost.amount || 0) || 0;
                if (cost.arrival_id) {
                    const existing = uniqueDayCosts.get(cost.arrival_id);
                    if (!existing || amount > (existing.amount || 0)) {
                        uniqueDayCosts.set(cost.arrival_id, cost);
                    }
                } else {
                    const key = `${cost.agency_id || ''}_${cost.branch_id || ''}_${amount}`;
                    if (!uniqueDayCosts.has(key)) {
                        uniqueDayCosts.set(key, cost);
                    }
                }
            });
            const finalDayCosts = Array.from(uniqueDayCosts.values());
            
            const dayTotal = finalDayCosts.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
            const dayCount = finalDayCosts.length;
            grandTotal += dayTotal;
            totalArrivals += dayCount;
            
            const date = new Date(dateStr + 'T00:00:00');
            const formattedDate = Utils.formatDate(date, 'DD/MM/YYYY');
            const dayName = Utils.formatDate(date, 'dddd', 'es-MX');
            
            html += `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0 0 var(--spacing-xs) 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-plane"></i> ${dayName}, ${formattedDate}
                            </h3>
                            <div style="font-size: 11px; opacity: 0.9;">
                                ${dayCount} llegada(s) registrada(s)
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 16px; font-weight: 700;">
                                ${Utils.formatCurrency(dayTotal)}
                            </div>
                        </div>
                    </div>
                    <div style="padding: var(--spacing-md);">
                        <div style="display: grid; gap: var(--spacing-sm);">
            `;
            
            // Ordenar llegadas del día por hora (si tienen) o por monto descendente
            finalDayCosts.sort((a, b) => {
                // Intentar ordenar por hora si existe
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime; // Más recientes primero
            });
            
            finalDayCosts.forEach(cost => {
                const linkedArrival = cost.arrival_id
                    ? allArrivals.find(a => String(a.id) === String(cost.arrival_id) || String(a.server_id || '') === String(cost.arrival_id))
                    : null;

                const branch = cost.branch_id ? branches.find(b => b.id === cost.branch_id) : null;
                const agency = cost.agency_id ? agencies.find(a => a.id === cost.agency_id) : null;
                const branchName = branch?.name || 'Sin sucursal';
                const agencyName = cost.agency_name || agency?.name || cost.notes || 'Agencia desconocida';
                const guideName = cost.guide_name
                    || (cost.guide_id ? guides.find(g => String(g.id) === String(cost.guide_id))?.name : null)
                    || (linkedArrival?.guide_id ? guides.find(g => String(g.id) === String(linkedArrival.guide_id))?.name : null)
                    || '-';
                const passengers = parseInt(cost.passengers || linkedArrival?.passengers || 0, 10) || 0;
                const units = parseInt(cost.units || linkedArrival?.units || 0, 10) || 0;
                const unitType = cost.unit_type || linkedArrival?.unit_type || '-';
                const timeStr = cost.created_at ? Utils.formatDate(cost.created_at, 'HH:mm') : '';
                
                html += `
                    <div class="cost-item" data-cost-id="${cost.id}" data-cost-amount="${cost.amount || 0}" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid #667eea;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">
                                ${agencyName}
                                ${passengers > 0 ? ` - ${passengers} pasajeros` : ''}
                            </div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">
                                ${branchName}${timeStr ? ` • ${timeStr}` : ''}
                            </div>
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
                                Guía: ${guideName} • Transporte: ${unitType} • Unidades: ${units > 0 ? units : '-'}
                            </div>
                            ${cost.notes && cost.notes !== agencyName ? `<div style="font-size: 10px; color: var(--color-text-secondary); margin-top: 2px;">${cost.notes}</div>` : ''}
                        </div>
                        <div style="text-align: right; margin-left: var(--spacing-md);">
                            <div style="font-weight: 700; font-size: 14px; color: #667eea;">${Utils.formatCurrency(cost.amount || 0)}</div>
                        </div>
                        <div style="margin-left: var(--spacing-sm); display: flex; gap: var(--spacing-xs);">
                            <button class="btn-icon btn-sm" onclick="window.Costs.editCost('${cost.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-sm" onclick="window.Costs.deleteCost('${cost.id}')" title="Eliminar" style="color: var(--color-danger);">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        // Agregar resumen general al inicio
        const summaryHtml = `
            <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: var(--radius-md); color: white;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    <div>
                        <div style="font-size: 11px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-xs);">
                            Total de Llegadas
                        </div>
                        <div style="font-size: 24px; font-weight: 700;">
                            ${totalArrivals}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 11px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-xs);">
                            Total Pagado
                        </div>
                        <div style="font-size: 24px; font-weight: 700;">
                            ${Utils.formatCurrency(grandTotal)}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 11px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-xs);">
                            Promedio por Llegada
                        </div>
                        <div style="font-size: 24px; font-weight: 700;">
                            ${totalArrivals > 0 ? Utils.formatCurrency(grandTotal / totalArrivals) : '$0.00'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = summaryHtml + html;
    },

    async exportArrivals() {
        try {
            // Prevenir múltiples ejecuciones simultáneas
            if (this.isExporting) {
                console.warn('Exportación ya en progreso, ignorando llamada duplicada');
                return;
            }
            
            this.isExporting = true;
            
            // Verificar jsPDF
            const jspdfLib = Utils.checkJsPDF();
            if (!jspdfLib) {
                Utils.showNotification('jsPDF no está disponible. Por favor, recarga la página.', 'error');
                this.isExporting = false;
                return;
            }

            const { jsPDF } = jspdfLib;
            
            // Obtener filtros actuales
            const branchFilter = document.getElementById('arrivals-branch-filter');
            const dateFrom = document.getElementById('arrivals-date-from')?.value;
            const dateTo = document.getElementById('arrivals-date-to')?.value;
            
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id');
            
            const selectedBranchId = !isMasterAdmin ? currentBranchId : (branchFilter?.value || null);
            
            // Obtener llegadas desde agency_arrivals (no solo costos)
            const allArrivals = await DB.getAll('agency_arrivals') || [];
            let filteredArrivals = allArrivals.filter(a => {
                // Filtrar por sucursal
                if (selectedBranchId) {
                    if (!a.branch_id || String(a.branch_id) !== String(selectedBranchId)) {
                        return false;
                    }
                }
                // Filtrar por fecha
                if (dateFrom && a.date < dateFrom) return false;
                if (dateTo && a.date > dateTo) return false;
                return true;
            });
            
            // Obtener costos relacionados para tener el monto pagado
            const allCosts = await DB.getAll('cost_entries') || [];
            const arrivalCosts = allCosts.filter(c => c.category === 'pago_llegadas');
            
            // Obtener catálogos
            const agencies = await DB.getAll('catalog_agencies') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            
            if (filteredArrivals.length === 0) {
                Utils.showNotification('No hay llegadas para exportar con los filtros seleccionados', 'warning');
                this.isExporting = false;
                return;
            }
            
            // Crear PDF
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            let y = margin;
            
            // ========== HEADER ==========
            doc.setFillColor(52, 73, 94);
            doc.rect(0, 0, pageWidth, 35, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text('OPAL & CO', margin, 15);
            
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text('Reporte de Llegadas', margin, 22);
            
            doc.setFontSize(10);
            doc.setTextColor(220, 220, 220);
            const dateStr = typeof Utils !== 'undefined' && Utils.formatDate 
                ? Utils.formatDate(new Date(), 'DD/MM/YYYY HH:mm')
                : new Date().toLocaleString('es-MX');
            doc.text(dateStr, pageWidth - margin, 15, { align: 'right' });
            
            // Rango de fechas
            if (dateFrom || dateTo) {
                const dateRange = `${dateFrom ? Utils.formatDate(dateFrom, 'DD/MM/YYYY') : 'Inicio'} - ${dateTo ? Utils.formatDate(dateTo, 'DD/MM/YYYY') : 'Fin'}`;
                doc.text(`Período: ${dateRange}`, pageWidth - margin, 22, { align: 'right' });
            }
            
            y = 45;
            
            // ========== RESUMEN ==========
            const totalArrivals = filteredArrivals.length;
            const totalPassengers = filteredArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            const totalAmount = filteredArrivals.reduce((sum, a) => {
                const cost = arrivalCosts.find(c => c.arrival_id === a.id);
                return sum + (cost?.amount || a.arrival_fee || 0);
            }, 0);
            
            doc.setFillColor(240, 248, 255);
            doc.rect(margin, y, pageWidth - (margin * 2), 25, 'F');
            doc.setDrawColor(200, 200, 200);
            doc.rect(margin, y, pageWidth - (margin * 2), 25);
            
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('RESUMEN', margin + 5, y + 8);
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const branchName = selectedBranchId 
                ? (branches.find(b => b.id === selectedBranchId)?.name || 'Sucursal seleccionada')
                : 'Todas las sucursales';
            doc.text(`Sucursal(es): ${branchName}`, margin + 5, y + 15);
            
            doc.setFontSize(10);
            doc.text(`Total Llegadas: ${totalArrivals}`, margin + 5, y + 22);
            doc.text(`Total Pasajeros: ${totalPassengers}`, margin + 60, y + 22);
            doc.text(`Total Pagado: $${totalAmount.toFixed(2)}`, margin + 120, y + 22);
            
            y += 32;
            
            // ========== TABLA DE LLEGADAS ==========
            if (y + 30 > pageHeight - 30) {
                doc.addPage();
                y = margin;
            }
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DE LLEGADAS', margin, y);
            y += 8;
            
            // Encabezados de tabla
            const col1X = margin + 2;      // Fecha
            const col2X = margin + 30;    // Agencia
            const col3X = margin + 80;    // Guía
            const col4X = margin + 110;   // Pasajeros
            const col5X = margin + 130;   // Unidades
            const col6X = margin + 145;   // Tipo Unidad
            const col7X = pageWidth - margin - 30; // Monto
            
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
            doc.setDrawColor(200, 200, 200);
            doc.rect(margin, y, pageWidth - (margin * 2), 8);
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.text('Fecha', col1X, y + 5.5);
            doc.text('Agencia', col2X, y + 5.5);
            doc.text('Guía', col3X, y + 5.5);
            doc.text('PAX', col4X, y + 5.5, { align: 'center' });
            doc.text('Unid.', col5X, y + 5.5, { align: 'center' });
            doc.text('Tipo', col6X, y + 5.5, { align: 'center' });
            doc.text('Monto', col7X, y + 5.5, { align: 'right' });
            
            y += 8;
            
            // Ordenar llegadas por fecha descendente
            filteredArrivals.sort((a, b) => {
                const dateA = new Date(a.date || a.created_at);
                const dateB = new Date(b.date || b.created_at);
                return dateB - dateA;
            });
            
            // Obtener todas las ventas de una vez para buscar guías
            const allSales = await DB.getAll('sales') || [];
            
            // Filas de llegadas
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            for (const arrival of filteredArrivals) {
                if (y + 7 > pageHeight - 30) {
                    doc.addPage();
                    y = margin;
                    // Re-dibujar encabezados
                    doc.setFillColor(245, 245, 245);
                    doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
                    doc.setDrawColor(200, 200, 200);
                    doc.rect(margin, y, pageWidth - (margin * 2), 8);
                    
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Fecha', col1X, y + 5.5);
                    doc.text('Agencia', col2X, y + 5.5);
                    doc.text('Guía', col3X, y + 5.5);
                    doc.text('PAX', col4X, y + 5.5, { align: 'center' });
                    doc.text('Unid.', col5X, y + 5.5, { align: 'center' });
                    doc.text('Tipo', col6X, y + 5.5, { align: 'center' });
                    doc.text('Monto', col7X, y + 5.5, { align: 'right' });
                    y += 8;
                }
                
                const agency = agencies.find(a => a.id === arrival.agency_id);
                const agencyName = agency?.name || 'Desconocida';
                
                // Buscar guía que trajo los pasajeros:
                // 1. Buscar en ventas del día con la misma agencia y fecha
                // 2. Si no hay ventas, buscar guías de la agencia
                let guideName = '-';
                const arrivalDateStr = arrival.date || arrival.created_at;
                if (arrivalDateStr) {
                    const dateStr = arrivalDateStr.split('T')[0];
                    const daySales = allSales.filter(s => {
                        const saleDate = s.created_at ? s.created_at.split('T')[0] : null;
                        return saleDate === dateStr && 
                               s.agency_id === arrival.agency_id &&
                               s.branch_id === arrival.branch_id &&
                               s.guide_id;
                    });
                    
                    if (daySales.length > 0) {
                        // Usar la guía de la primera venta del día de esa agencia
                        const guideId = daySales[0].guide_id;
                        const guide = guides.find(g => g.id === guideId);
                        guideName = guide?.name || '-';
                    } else {
                        // Si no hay ventas, buscar guías de la agencia
                        const agencyGuides = guides.filter(g => g.agency_id === arrival.agency_id);
                        if (agencyGuides.length > 0) {
                            guideName = agencyGuides[0].name;
                        }
                    }
                }
                
                const cost = arrivalCosts.find(c => c.arrival_id === arrival.id);
                const amount = parseFloat(cost?.amount ?? arrival.arrival_fee ?? 0) || 0;
                
                const formattedDate = arrivalDateStr ? Utils.formatDate(arrivalDateStr, 'DD/MM/YYYY') : '-';
                
                doc.setDrawColor(220, 220, 220);
                doc.rect(margin, y, pageWidth - (margin * 2), 7);
                
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(formattedDate, col1X, y + 5);
                doc.text(agencyName.substring(0, 20), col2X, y + 5);
                doc.text(guideName.substring(0, 15), col3X, y + 5);
                doc.text((arrival.passengers || 0).toString(), col4X, y + 5, { align: 'center' });
                doc.text((arrival.units || 1).toString(), col5X, y + 5, { align: 'center' });
                doc.text((arrival.unit_type || '-').substring(0, 8), col6X, y + 5, { align: 'center' });
                doc.setFont('helvetica', 'bold');
                doc.text(`$${amount.toFixed(2)}`, col7X, y + 5, { align: 'right' });
                doc.setFont('helvetica', 'normal');
                
                y += 7;
            }
            
            // Guardar PDF
            const dateRangeStr = dateFrom && dateTo 
                ? `${Utils.formatDate(dateFrom, 'YYYYMMDD')}_${Utils.formatDate(dateTo, 'YYYYMMDD')}`
                : Utils.formatDate(new Date(), 'YYYYMMDD');
            const filename = `reporte_llegadas_${dateRangeStr}_${Date.now()}.pdf`;
            doc.save(filename);
            
            Utils.showNotification('Reporte de llegadas exportado correctamente', 'success');
        } catch (error) {
            console.error('Error exportando llegadas:', error);
            Utils.showNotification(`Error al exportar: ${error.message}`, 'error');
        } finally {
            this.isExporting = false;
        }
    },

    async getRecurringTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="form-group" style="width: 180px; min-width: 150px;">
                    <select id="recurring-branch-filter" class="form-select" style="width: 100%;">
                        <option value="">Todas las sucursales</option>
                    </select>
                </div>
                <div style="flex: 1;"></div>
                <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                    <button class="btn-primary btn-sm" id="recurring-generate-btn">
                        <i class="fas fa-magic"></i> Generar Faltantes
                    </button>
                    <button class="btn-secondary btn-sm" id="recurring-add-btn">
                        <i class="fas fa-plus"></i> Nuevo
                    </button>
                </div>
            </div>
            <div id="recurring-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;
    },

    async loadRecurring() {
        document.getElementById('recurring-generate-btn')?.addEventListener('click', () => this.generateRecurringCosts());
        document.getElementById('recurring-add-btn')?.addEventListener('click', () => this.showAddRecurringForm());
        document.getElementById('recurring-branch-filter')?.addEventListener('change', (e) => {
            // Marcar que el usuario seleccionó manualmente
            if (e.target) {
                e.target.dataset.manualSelection = 'true';
            }
            this.loadRecurring();
        });

        // Cargar opciones de sucursales en el filtro (solo si no está cargado)
        const branchFilterEl = document.getElementById('recurring-branch-filter');
        if (branchFilterEl && branchFilterEl.options.length <= 1) {
            await this.loadRecurringBranchFilter();
        }

        try {
            // Obtener sucursal seleccionada en el filtro, o la actual si no hay filtro
            const branchFilter = document.getElementById('recurring-branch-filter');
            const branchFilterValue = branchFilter?.value || '';
            
            // Si el filtro está vacío (Todas las sucursales), usar null
            // Si tiene un valor, usar ese valor
            const selectedBranchId = branchFilterValue === '' ? null : branchFilterValue;
            
            const allCosts = await this.getFilteredCosts({ branchId: selectedBranchId });
            let recurringCosts = allCosts.filter(c => c.recurring === true);
            
            // Deduplicar gastos recurrentes (bug: se crearon muchos duplicados)
            const seenKeys = new Map();
            recurringCosts = recurringCosts.filter(c => {
                const key = `${c.branch_id || ''}_${c.category || ''}_${c.period_type || ''}_${parseFloat(c.amount) || 0}_${(c.notes || '').slice(0, 80)}`;
                if (seenKeys.has(key)) return false;
                seenKeys.set(key, c);
                return true;
            });
            
            // Ordenar por período y categoría
            recurringCosts.sort((a, b) => {
                const periodOrder = { 'daily': 1, 'weekly': 2, 'monthly': 3, 'annual': 4 };
                const aOrder = periodOrder[a.period_type] || 99;
                const bOrder = periodOrder[b.period_type] || 99;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return (a.category || '').localeCompare(b.category || '');
            });

            this.displayRecurringCosts(recurringCosts);
        } catch (e) {
            console.error('Error loading recurring costs:', e);
            Utils.showNotification('Error al cargar costos recurrentes', 'error');
        }
    },

    async loadRecurringBranchFilter() {
        const branchFilter = document.getElementById('recurring-branch-filter');
        if (!branchFilter) return;

        const branches = await DB.getAll('catalog_branches') || [];
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        
        // Guardar la selección actual antes de actualizar
        const currentValue = branchFilter.value;
        const wasManualSelection = branchFilter.dataset.manualSelection === 'true';
        
        branchFilter.innerHTML = '<option value="">Todas las sucursales</option>' +
            branches.map(branch => 
                `<option value="${branch.id}">${branch.name}</option>`
            ).join('');
        
        // Restaurar la selección: si fue manual, mantenerla; si no, usar la sucursal actual
        if (wasManualSelection && currentValue) {
            branchFilter.value = currentValue;
            branchFilter.dataset.manualSelection = 'true';
        } else {
            branchFilter.value = currentBranchId || '';
            delete branchFilter.dataset.manualSelection;
        }
    },

    async displayRecurringCosts(costs) {
        const container = document.getElementById('recurring-list');
        if (!container) return;

        if (costs.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay costos recurrentes registrados</div>';
            return;
        }

        const branches = await DB.getAll('catalog_branches') || [];
        
        // Agrupar costos por sucursal
        const costsByBranch = {};
        costs.forEach(cost => {
            const branchId = cost.branch_id || 'sin_sucursal';
            if (!costsByBranch[branchId]) {
                costsByBranch[branchId] = [];
            }
            costsByBranch[branchId].push(cost);
        });

        // Ordenar sucursales
        const branchOrder = branches.map(b => b.id);
        const sortedBranchIds = Object.keys(costsByBranch).sort((a, b) => {
            const aIndex = branchOrder.indexOf(a);
            const bIndex = branchOrder.indexOf(b);
            if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

        let html = '';
        
        sortedBranchIds.forEach(branchId => {
            const branchCosts = costsByBranch[branchId];
            const branch = branches.find(b => b.id === branchId);
            const branchName = branch?.name || 'Sin Sucursal';
            
            // Calcular total de la sucursal
            const branchTotal = branchCosts.reduce((sum, cost) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0)), 0);
            
            // Ordenar por período y categoría
            branchCosts.sort((a, b) => {
                const periodOrder = { 'daily': 1, 'weekly': 2, 'monthly': 3, 'annual': 4 };
                const aOrder = periodOrder[a.period_type] || 99;
                const bOrder = periodOrder[b.period_type] || 99;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return (a.category || '').localeCompare(b.category || '');
            });

            const periodLabels = {
                'daily': 'Diario',
                'weekly': 'Semanal',
                'monthly': 'Mensual',
                'annual': 'Anual'
            };
            
            html += `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-store"></i> ${branchName}
                        </h3>
                        <div style="font-size: 16px; font-weight: 700;" data-cost-total>
                            Total: ${Utils.formatCurrency(branchTotal)}
                        </div>
                    </div>
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                    <th>Prorrateo Diario</th>
                                    <th>Auto-Generar</th>
                                    <th>Última Generación</th>
                                    <th>Notas</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${branchCosts.map(cost => {
                                    // Calcular prorrateo diario
                                    let dailyProrate = 0;
                                    if (cost.period_type === 'daily') {
                                        dailyProrate = cost.amount || 0;
                                    } else if (cost.period_type === 'weekly') {
                                        dailyProrate = (cost.amount || 0) / 7;
                                    } else if (cost.period_type === 'monthly') {
                                        // Usar 30 días fijos para prorrateo mensual (convención contable estándar)
                                        const DAYS_PER_MONTH = 30;
                                        dailyProrate = (cost.amount || 0) / DAYS_PER_MONTH;
                                    } else if (cost.period_type === 'annual') {
                                        const year = new Date(cost.date || cost.created_at).getFullYear();
                                        const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 366 : 365;
                                        dailyProrate = (cost.amount || 0) / daysInYear;
                                    }

                                    return `
                                        <tr data-cost-id="${cost.id}" data-cost-amount="${cost.amount || 0}">
                                            <td><span class="status-badge status-${cost.period_type === 'monthly' ? 'disponible' : 'reservado'}">${periodLabels[cost.period_type] || 'Una Vez'}</span></td>
                                            <td>${cost.category || 'N/A'}</td>
                                            <td style="font-weight: 600;">${Utils.formatCurrency(cost.amount)}</td>
                                            <td style="font-weight: 600; color: var(--color-accent);">${Utils.formatCurrency(dailyProrate)}</td>
                                            <td>${cost.auto_generate ? '<span class="status-badge status-disponible">Sí</span>' : '<span class="status-badge status-reservado">No</span>'}</td>
                                            <td style="font-size: 11px;">${Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY')}</td>
                                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cost.notes || '-'}</td>
                                            <td style="white-space: nowrap;">
                                                <button class="btn-secondary btn-xs" onclick="window.Costs.editCost('${cost.id}')">
                                                    <i class="fas fa-edit"></i> Editar
                                                </button>
                                                <button class="btn-danger btn-xs" onclick="window.Costs.deleteCost('${cost.id}')">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    async generateRecurringCosts() {
        try {
            Utils.showNotification('Generando costos recurrentes faltantes...', 'info');
            
            const allCosts = await DB.getAll('cost_entries') || [];
            const today = new Date();
            const todayStr = Utils.formatDate(today, 'YYYY-MM-DD');
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            // Obtener costos recurrentes
            const recurringCosts = allCosts.filter(c => c.recurring === true && c.auto_generate === true);
            
            let generated = 0;
            
            for (const cost of recurringCosts) {
                const costDate = new Date(cost.date || cost.created_at);
                const costMonth = costDate.getMonth();
                const costYear = costDate.getFullYear();
                
                if (cost.period_type === 'monthly') {
                    // Verificar si ya existe el costo del mes actual
                    const existing = allCosts.find(c => 
                        c.category === cost.category &&
                        c.branch_id === cost.branch_id &&
                        c.period_type === 'monthly' &&
                        c.recurring === true &&
                        c.auto_generate === true
                    );
                    
                    if (!existing || (existing && new Date(existing.date || existing.created_at).getMonth() !== currentMonth)) {
                        // Generar costo del mes actual
                        const newCost = {
                            id: Utils.generateId(),
                            type: cost.type,
                            category: cost.category,
                            amount: cost.amount,
                            branch_id: cost.branch_id,
                            date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
                            period_type: 'monthly',
                            recurring: true,
                            auto_generate: true,
                            notes: cost.notes || '',
                            created_at: new Date().toISOString(),
                            sync_status: 'pending'
                        };
                        await DB.add('cost_entries', newCost);
                        await SyncManager.addToQueue('cost_entry', newCost.id);
                        generated++;
                    }
                } else if (cost.period_type === 'weekly') {
                    // Verificar si ya existe el costo de la semana actual
                    const weekStart = this.getWeekStart(today);
                    const weekStartStr = Utils.formatDate(weekStart, 'YYYY-MM-DD');
                    
                    const existing = allCosts.find(c => {
                        const cDate = new Date(c.date || c.created_at);
                        const cWeekStart = this.getWeekStart(cDate);
                        return c.category === cost.category &&
                               c.branch_id === cost.branch_id &&
                               c.period_type === 'weekly' &&
                               c.recurring === true &&
                               Utils.formatDate(cWeekStart, 'YYYY-MM-DD') === weekStartStr;
                    });
                    
                    if (!existing) {
                        const newCost = {
                            id: Utils.generateId(),
                            type: cost.type,
                            category: cost.category,
                            amount: cost.amount,
                            branch_id: cost.branch_id,
                            date: weekStartStr,
                            period_type: 'weekly',
                            recurring: true,
                            auto_generate: true,
                            notes: cost.notes || '',
                            created_at: new Date().toISOString(),
                            sync_status: 'pending'
                        };
                        await DB.add('cost_entries', newCost);
                        await SyncManager.addToQueue('cost_entry', newCost.id);
                        generated++;
                    }
                }
            }
            
            Utils.showNotification(`${generated} costos recurrentes generados`, 'success');
            await this.loadRecurring();
        } catch (e) {
            console.error('Error generating recurring costs:', e);
            Utils.showNotification('Error al generar costos recurrentes', 'error');
        }
    },

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
        return new Date(d.setDate(diff));
    },

    async showAddRecurringForm() {
        await this.showAddForm();
        // Pre-seleccionar campos para recurrente
        setTimeout(() => {
            const periodSelect = document.getElementById('cost-period-type');
            const recurringCheck = document.getElementById('cost-recurring');
            const autoGenCheck = document.getElementById('cost-auto-generate');
            const recurringGroup = document.getElementById('cost-recurring-group');
            const autoGenGroup = document.getElementById('cost-auto-generate-group');
            
            if (periodSelect) {
                periodSelect.value = 'monthly';
                periodSelect.dispatchEvent(new Event('change'));
            }
            if (recurringCheck) recurringCheck.checked = true;
            if (autoGenCheck) autoGenCheck.checked = true;
            if (recurringGroup) recurringGroup.style.display = 'block';
            if (autoGenGroup) autoGenGroup.style.display = 'block';
        }, 100);
    },

    async getOverviewTab() {
        const stats = await this.getCostStats();
        
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="kpi-card">
                    <div class="kpi-label">Total Costos</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.totalCosts)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.totalEntries} registros
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Costos Variables</div>
                    <div class="kpi-value" style="color: var(--color-warning);">${Utils.formatCurrency(stats.variableCosts)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.totalCosts > 0 ? ((stats.variableCosts / stats.totalCosts) * 100).toFixed(1) : 0}% del total
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Costos Fijos</div>
                    <div class="kpi-value" style="color: var(--color-danger);">${Utils.formatCurrency(stats.fixedCosts)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.totalCosts > 0 ? ((stats.fixedCosts / stats.totalCosts) * 100).toFixed(1) : 0}% del total
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Este Mes</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.thisMonth)}</div>
                    <div style="font-size: 10px; color: ${stats.monthChange >= 0 ? 'var(--color-danger)' : 'var(--color-success)'}; margin-top: var(--spacing-xs);">
                        ${stats.monthChange >= 0 ? '+' : ''}${stats.monthChange.toFixed(1)}% vs mes anterior
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Promedio Mensual</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.avgMonthly)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Últimos 6 meses
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Utilidad Neta</div>
                    <div class="kpi-value" style="color: ${stats.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                        ${Utils.formatCurrency(stats.profit)}
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Margen: ${stats.margin.toFixed(1)}%
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box; overflow: hidden;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-pie"></i> Costos por Categoría
                    </h3>
                    <div id="category-chart" style="min-height: 300px; width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box; overflow: hidden;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-line"></i> Tendencia Mensual
                    </h3>
                    <div id="monthly-trend-chart" style="min-height: 300px; width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box; overflow: hidden;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-balance-scale"></i> Variable vs Fijo
                    </h3>
                    <div id="type-distribution-chart" style="min-height: 200px; width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box; overflow: hidden;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-building"></i> Costos por Sucursal
                    </h3>
                    <div id="branch-chart" style="min-height: 200px; width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>
            </div>
        `;
    },

    async getAnalysisTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <label>Período de Análisis</label>
                    <select id="analysis-period" class="form-select" style="width: 100%;">
                        <option value="last3months">Últimos 3 meses</option>
                        <option value="last6months" selected>Últimos 6 meses</option>
                        <option value="last12months">Últimos 12 meses</option>
                        <option value="thisyear">Este año</option>
                        <option value="lastyear">Año pasado</option>
                    </select>
                </div>
                <div class="form-group" style="flex-shrink: 0;">
                    <label>&nbsp;</label>
                    <button class="btn-primary" onclick="window.Costs.runAnalysis()" style="white-space: nowrap;">
                        <i class="fas fa-chart-bar"></i> Ejecutar Análisis
                    </button>
                </div>
            </div>
            <div id="analysis-results" style="min-height: 400px; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: auto;">
                <div class="empty-state">Selecciona un período y ejecuta el análisis</div>
            </div>
        `;
    },

    async getHistoryTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <input type="text" id="history-search" class="form-input" placeholder="Buscar por categoría, notas, sucursal..." style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <select id="history-type-filter" class="form-select" style="width: 100%;">
                        <option value="">Todos</option>
                        <option value="variable">Variable</option>
                        <option value="fijo">Fijo</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="history-date-from" class="form-input" placeholder="Desde" style="width: 100%;">
                </div>
                <div class="form-group" style="width: 150px; min-width: 120px;">
                    <input type="date" id="history-date-to" class="form-input" placeholder="Hasta" style="width: 100%;">
                </div>
                <button class="btn-secondary btn-sm" id="history-export" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="history-list" style="max-height: 600px; overflow-y: auto; width: 100%; overflow-x: auto;">
                <div class="empty-state">Cargando historial...</div>
            </div>
        `;
    },

    async getBudgetTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-calendar-alt"></i> Presupuesto Mensual
                    </h3>
                    <div class="form-group">
                        <label>Mes *</label>
                        <input type="month" id="budget-month" class="form-input" value="${Utils.formatDate(new Date(), 'YYYY-MM')}" required style="width: 100%;">
                    </div>
                    <div class="form-group">
                        <label>Presupuesto Total *</label>
                        <input type="number" id="budget-amount" class="form-input" step="0.01" placeholder="0.00" required style="width: 100%;">
                    </div>
                    <div class="form-group">
                        <label>Sucursal</label>
                        <select id="budget-branch" class="form-select" style="width: 100%;">
                            <option value="">Todas</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Notas</label>
                        <textarea id="budget-notes" class="form-textarea" rows="2" style="width: 100%; resize: vertical;"></textarea>
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Costs.saveBudget()" style="width: 100%;">
                        <i class="fas fa-save"></i> Guardar Presupuesto
                    </button>
                </div>
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-area"></i> Proyección Anual
                    </h3>
                    <div id="annual-projection" style="min-height: 200px; width: 100%; overflow: hidden;">
                        Cargando proyección...
                    </div>
                </div>
            </div>
            <div id="budget-list" style="margin-top: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="empty-state">Cargando presupuestos...</div>
            </div>
        `;
    },

    async loadCosts() {
        // Setup event listeners
        document.getElementById('cost-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('cost-export-btn')?.addEventListener('click', () => this.exportCosts());
        document.getElementById('cost-search')?.addEventListener('input', Utils.debounce(() => this.loadCosts(), 300));
        document.getElementById('cost-branch-filter')?.addEventListener('change', Utils.debounce((e) => {
            // Marcar que el usuario seleccionó manualmente
            if (e && e.target) {
                e.target.dataset.manualSelection = 'true';
            }
            this.loadCosts();
        }, 350));
        document.getElementById('cost-type-filter')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-category-filter')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-supplier-filter')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-date-from')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-date-to')?.addEventListener('change', () => this.loadCosts());

        // Cargar opciones de sucursales y proveedores en los filtros
        await this.loadBranchFilter();
        await this.loadSupplierFilterDropdown();

        try {
        // Verificar si el usuario es master_admin
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        // Obtener sucursal actual del usuario
        const currentBranchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        
        // Obtener sucursal seleccionada en el filtro (solo para master_admin)
        const branchFilter = document.getElementById('cost-branch-filter');
        const branchFilterValue = branchFilter?.value || '';
        
        // Determinar qué branch_id usar para el filtro
        let selectedBranchId = null;
        let viewAllBranches = false;
        
        if (!isMasterAdmin) {
            // Usuario normal: SIEMPRE usar su sucursal actual (no puede ver otras)
            selectedBranchId = currentBranchId;
            viewAllBranches = false;
        } else {
            // Master admin: puede elegir "Todas" o una sucursal específica
            if (branchFilterValue === '' || branchFilterValue === 'all') {
                // Filtro vacío o "Todas" = mostrar todas
                selectedBranchId = null;
                viewAllBranches = true;
            } else {
                // Filtro específico = mostrar solo esa sucursal
                selectedBranchId = branchFilterValue;
                viewAllBranches = false;
            }
        }
            
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir costos locales que NO están en el servidor
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.createCost && API.updateCost) {
                    if (this._costsPaso1InProgress) return;
                    this._costsPaso1InProgress = true;
                    try {
                    console.log('📤 [Paso 1 Costs] Buscando costos locales que no están en el servidor...');
                    
                    const allLocalCosts = await DB.getAll('cost_entries') || [];
                    const unsyncedCosts = allLocalCosts.filter(c => {
                        if (!c || !c.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(c.id));
                        return !isUUID || !c.server_id;
                    });
                    
                    const costsToSync = unsyncedCosts.filter(c => {
                        if (!selectedBranchId) return true;
                        return c.branch_id === selectedBranchId;
                    });
                    
                    console.log(`📊 [Paso 1 Costs] Encontrados ${costsToSync.length} costos locales sin sincronizar`);
                    
                    if (costsToSync.length > 0) {
                        const costsByKey = new Map();
                        for (const localCost of costsToSync) {
                            const key = `${localCost.date || localCost.created_at || ''}_${localCost.category || ''}_${localCost.branch_id || 'no-branch'}_${localCost.amount || 0}`;
                            if (!costsByKey.has(key)) {
                                costsByKey.set(key, localCost);
                            } else {
                                const existing = costsByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localCost.updated_at ? new Date(localCost.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    costsByKey.set(key, localCost);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localCost] of costsByKey) {
                            try {
                                // Validar monto: el backend requiere amount > 0 (número)
                                const amountNum = parseFloat(localCost.amount ?? localCost.monto ?? 0);
                                if (isNaN(amountNum) || amountNum <= 0) {
                                    console.warn(`⚠️ [Paso 1 Costs] Omitiendo costo ${localCost.id}: monto inválido (${localCost.amount ?? localCost.monto})`);
                                    continue;
                                }
                                const payloadToSync = { ...localCost, amount: amountNum };
                                console.log(`📤 [Paso 1 Costs] Subiendo costo local al servidor: ${localCost.id}`);
                                
                                const createdCost = await API.createCost(payloadToSync);
                                if (createdCost && createdCost.id) {
                                    const allLocalCosts = await DB.getAll('cost_entries') || [];
                                    const costsToUpdate = allLocalCosts.filter(c => {
                                        const cKey = `${c.date || c.created_at || ''}_${c.category || ''}_${c.branch_id || 'no-branch'}_${c.amount || 0}`;
                                        return cKey === key;
                                    });
                                    
                                    // Eliminar registros antiguos antes de actualizar (evita bucle: put con nuevo id crea fila nueva sin borrar la antigua)
                                    const idsToDelete = [...new Set(costsToUpdate.map(c => c.id).filter(id => id && id !== createdCost.id))];
                                    for (const oldId of idsToDelete) {
                                        try { await DB.delete('cost_entries', oldId); } catch (_) {}
                                    }
                                    const canonical = costsToUpdate[0];
                                    canonical.server_id = createdCost.id;
                                    canonical.id = createdCost.id;
                                    canonical.sync_status = 'synced';
                                    await DB.put('cost_entries', canonical, { autoBranchId: false });
                                    uploadedCount++;
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Costs] Error subiendo costo ${localCost.id}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Costs] Sincronización local→servidor completada: ${uploadedCount} costos subidos`);
                    }
                    } finally {
                        this._costsPaso1InProgress = false;
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Costs] Error sincronizando costos locales al servidor:', error);
                this._costsPaso1InProgress = false;
            }

            // CACHE-FIRST: leer de IndexedDB primero
            const filters = {
                branch_id: selectedBranchId,
                type: document.getElementById('cost-type-filter')?.value || undefined,
                category: document.getElementById('cost-category-filter')?.value || undefined,
                start_date: document.getElementById('cost-date-from')?.value || undefined,
                end_date: document.getElementById('cost-date-to')?.value || undefined
            };
            const norm = (id) => String(id || '').trim().toLowerCase();
            const fromIdb = await DB.getAll('cost_entries', null, null, { filterByBranch: false }) || [];
            let cachedFiltered = fromIdb;
            if (selectedBranchId) {
                const fb = norm(selectedBranchId);
                cachedFiltered = fromIdb.filter(c => c.branch_id && norm(c.branch_id) === fb);
            } else if (!viewAllBranches) {
                const cb = norm(selectedBranchId || currentBranchId);
                if (cb) cachedFiltered = fromIdb.filter(c => c.branch_id && norm(c.branch_id) === cb);
            }
            if (filters.type) cachedFiltered = cachedFiltered.filter(c => (c.type || c.category) === filters.type);
            if (filters.category) cachedFiltered = cachedFiltered.filter(c => (c.category || '') === filters.category);
            if (filters.start_date) cachedFiltered = cachedFiltered.filter(c => (c.date || c.created_at || '') >= filters.start_date);
            if (filters.end_date) cachedFiltered = cachedFiltered.filter(c => (c.date || c.created_at || '') <= filters.end_date);
            const hasCache = cachedFiltered.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getCosts;

            let costs = [];
            
            if (hasCache) {
                costs = cachedFiltered;
                console.log(`⚡ [Cache-First] ${costs.length} costos desde IndexedDB`);
                if (hasApi) {
                    const _lastRefresh = this._lastBackgroundRefreshTime || 0;
                    Promise.resolve().then(async () => {
                        try {
                            const fresh = await API.getCosts(filters);
                            const deletedCostIds = new Set();
                            const deletedLogicalKeys = new Set();
                            try {
                                const deletedItems = await DB.getAll('sync_deleted_items') || [];
                                for (const d of deletedItems) {
                                    if (d.entity_type === 'cost_entry' && d.metadata) {
                                        if (d.metadata.server_id) deletedCostIds.add(String(d.metadata.server_id));
                                        if (d.id) deletedCostIds.add(String(d.id));
                                        if (d.metadata.logical_key) deletedLogicalKeys.add(String(d.metadata.logical_key));
                                    }
                                }
                            } catch (_) {}
                            const buildLogicalKey = (c) => `${c.date || c.created_at || ''}_${c.category || ''}_${c.branch_id || 'no-branch'}_${c.amount || 0}_${(c.description || c.notes || '').slice(0, 100)}`;
                            for (const c of fresh) {
                                if (deletedCostIds.has(String(c.id)) || (c.server_id && deletedCostIds.has(String(c.server_id)))) continue;
                                if (deletedLogicalKeys.has(buildLogicalKey(c))) continue;
                                try { await DB.put('cost_entries', { ...c, server_id: c.id, sync_status: 'synced' }, { autoBranchId: false }); } catch (e) {}
                            }
                            const beforeIds = new Set((costs || []).map(c => c.id));
                            const afterIds = new Set(fresh.map(c => c.id));
                            if (beforeIds.size !== afterIds.size || [...beforeIds].some(id => !afterIds.has(id))) {
                                if (Date.now() - _lastRefresh >= 3000) {
                                    this._lastBackgroundRefreshTime = Date.now();
                                    await this.loadCosts();
                                }
                            }
                        } catch (e) { console.warn('Sync costs background:', e); }
                    }).catch(e => console.warn('Sync costs background:', e));
                }
            } else if (hasApi) {
                try {
                    console.log('📥 [Paso 2 Costs] Sincronizando costos desde el servidor...');
                    costs = await API.getCosts(filters);
                    console.log(`📥 [Paso 2 Costs] ${costs.length} costos recibidos del servidor`);
                    
                    const deletedCostIds = new Set();
                    const deletedLogicalKeys = new Set();
                    try {
                        const deletedItems = await DB.getAll('sync_deleted_items') || [];
                        for (const d of deletedItems) {
                            if (d.entity_type === 'cost_entry' && d.metadata) {
                                if (d.metadata.server_id) deletedCostIds.add(String(d.metadata.server_id));
                                if (d.id) deletedCostIds.add(String(d.id));
                                if (d.metadata.logical_key) deletedLogicalKeys.add(String(d.metadata.logical_key));
                            }
                        }
                    } catch (_) {}
                    
                    const buildLogicalKey = (c) => `${c.date || c.created_at || ''}_${c.category || ''}_${c.branch_id || 'no-branch'}_${c.amount || 0}_${(c.description || c.notes || '').slice(0, 100)}`;
                    // Guardar/actualizar cada costo en IndexedDB local (excluir eliminados localmente)
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverCost of costs) {
                        if (deletedCostIds.has(String(serverCost.id)) || (serverCost.server_id && deletedCostIds.has(String(serverCost.server_id)))) continue;
                        if (deletedLogicalKeys.has(buildLogicalKey(serverCost))) continue;
                        try {
                            const key = `${serverCost.date || serverCost.created_at || ''}_${serverCost.category || ''}_${serverCost.branch_id || 'no-branch'}_${serverCost.amount || 0}`;
                            const existingLocalCosts = await DB.getAll('cost_entries') || [];
                            const existingCost = existingLocalCosts.find(c => {
                                const cKey = `${c.date || c.created_at || ''}_${c.category || ''}_${c.branch_id || 'no-branch'}_${c.amount || 0}`;
                                return cKey === key;
                            });
                            
                            const localCost = {
                                ...serverCost,
                                server_id: serverCost.id,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('cost_entries', localCost, { autoBranchId: false });
                            
                            if (existingCost) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Costs] Error guardando costo ${serverCost.id}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Costs] Sincronización servidor→local completada: ${savedCount} nuevos, ${updatedCount} actualizados`);
                    
                    // CRÍTICO: Aplicar filtro estricto DESPUÉS de recibir de API
                    if (selectedBranchId) {
                        const beforeStrictFilter = costs.length;
                        costs = costs.filter(c => {
                            if (!c.branch_id) return false;
                            return String(c.branch_id) === String(selectedBranchId);
                        });
                        console.log(`📍 Costs: Filtrado estricto API: ${beforeStrictFilter} → ${costs.length} (sucursal: ${selectedBranchId})`);
                    }
                } catch (apiError) {
                    console.warn('Error cargando costos desde API, usando modo local:', apiError);
                    costs = await DB.getAll('cost_entries', null, null, { 
                        filterByBranch: !viewAllBranches, 
                        branchIdField: 'branch_id' 
                    }) || [];
                    
                    if (selectedBranchId) {
                        const beforeStrictFilter = costs.length;
                        costs = costs.filter(c => {
                            if (!c.branch_id) return false;
                            return String(c.branch_id) === String(selectedBranchId);
                        });
                        console.log(`📍 Costs: Filtrado estricto IndexedDB: ${beforeStrictFilter} → ${costs.length} (sucursal: ${selectedBranchId})`);
                    }
                }
            } else {
                costs = await DB.getAll('cost_entries', null, null, { 
                    filterByBranch: !viewAllBranches, 
                    branchIdField: 'branch_id' 
                }) || [];
                
                if (selectedBranchId) {
                    const beforeStrictFilter = costs.length;
                    costs = costs.filter(c => {
                        if (!c.branch_id) return false;
                        return String(c.branch_id) === String(selectedBranchId);
                    });
                    console.log(`📍 Costs: Filtrado estricto offline: ${beforeStrictFilter} → ${costs.length} (sucursal: ${selectedBranchId})`);
                }
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar
            const costsBeforeDedup = costs;
            const costsByKey = new Map();
            for (const cost of costs) {
                const key = `${cost.date || cost.created_at || ''}_${cost.category || ''}_${cost.branch_id || 'no-branch'}_${cost.amount || 0}`;
                if (!costsByKey.has(key)) {
                    costsByKey.set(key, cost);
                } else {
                    const existing = costsByKey.get(key);
                    if (cost.server_id && !existing.server_id) {
                        costsByKey.set(key, cost);
                    } else if (existing.server_id && !cost.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = cost.updated_at ? new Date(cost.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            costsByKey.set(key, cost);
                        }
                    }
                }
            }
            costs = Array.from(costsByKey.values());
            const keptIds = new Set(costs.map(c => c.id));
            console.log(`🔍 [Paso 3 Costs] Deduplicación: ${costs.length} costos únicos`);

            // Filtrar por tab:
            // - Costos: solo costos operativos (sin costos ligados a ventas)
            // - Costo de Ventas: costos de mercancía + comisiones de ventas
            if (this.currentTab === 'costs') {
                costs = this.getOperationalCosts(costs);
            } else if (this.currentTab === 'sales_costs' || this.currentTab === 'cogs') {
                costs = this.getSalesCosts(costs);
            }

            // Opcional: limpiar duplicados de IndexedDB cuando hay muchos (bug de sincronización previo)
            if (costsBeforeDedup.length >= costs.length * 2) {
                let cleaned = 0;
                for (const c of costsBeforeDedup) {
                    if (c && c.id && !keptIds.has(c.id)) {
                        try { await DB.delete('cost_entries', c.id); cleaned++; } catch (_) {}
                    }
                }
                if (cleaned > 0) console.log(`🧹 [Costs] Limpieza IndexedDB: ${cleaned} duplicados eliminados`);
            }
            
            const typeFilter = document.getElementById('cost-type-filter')?.value;
            const categoryFilter = document.getElementById('cost-category-filter')?.value;
            const search = document.getElementById('cost-search')?.value.toLowerCase() || '';
            const dateFrom = document.getElementById('cost-date-from')?.value;
            const dateTo = document.getElementById('cost-date-to')?.value;
            
            // Si aún no hay costos, usar getFilteredCosts como último recurso
            if (costs.length === 0 && selectedBranchId === null) {
                costs = await this.getFilteredCosts({
                    branchId: selectedBranchId,
                    dateFrom: dateFrom || null,
                    dateTo: dateTo || null,
                    type: typeFilter || null,
                    category: categoryFilter || null
                });
            }

            if (typeFilter) {
                const typeNorm = String(typeFilter).toLowerCase();
                costs = costs.filter(c => (c.type || '').toLowerCase() === typeNorm);
            }
            if (categoryFilter) {
                const catNorm = String(categoryFilter).toLowerCase();
                costs = costs.filter(c => (c.category || '').toLowerCase() === catNorm);
            }
            if (search) {
                costs = costs.filter(c => 
                    (c.category || '').toLowerCase().includes(search) ||
                    (c.notes || '').toLowerCase().includes(search)
                );
            }
            if (dateFrom) {
                costs = costs.filter(c => (c.date || c.created_at) >= dateFrom);
            }
            if (dateTo) {
                costs = costs.filter(c => (c.date || c.created_at) <= dateTo);
            }

            // Filtro por proveedor
            const supplierFilter = document.getElementById('cost-supplier-filter')?.value;
            if (supplierFilter) {
                costs = costs.filter(c => {
                    const costSupplierId = c.supplier_id || c.supplier_id;
                    return String(costSupplierId) === String(supplierFilter);
                });
            }

            // Excluir costos de llegadas solo en pestaña de costos operativos
            if (this.currentTab === 'costs') {
                const beforeFilter = costs.length;
                costs = costs.filter(c => c.category !== 'pago_llegadas');
                const filteredCount = beforeFilter - costs.length;
                if (filteredCount > 0) {
                    console.log(`📋 Costos de llegadas excluidos: ${filteredCount} (ver en pestaña "Llegadas")`);
                }
            }

            // Ordenar por fecha descendente
            costs.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

            this.displayCosts(costs, 0);
        } catch (e) {
            console.error('Error loading costs:', e);
            Utils.showNotification('Error al cargar costos', 'error');
        }
    },

    async loadBranchFilter() {
        const branchFilter = document.getElementById('cost-branch-filter');
        if (!branchFilter) return;

        // Verificar si el usuario es master_admin
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        
        // Si NO es master_admin, ocultar el dropdown y forzar filtro a su sucursal
        if (!isMasterAdmin) {
            // Ocultar el dropdown (buscar el contenedor si existe)
            const branchFilterContainer = branchFilter.parentElement;
            if (branchFilterContainer && branchFilterContainer.style) {
                branchFilterContainer.style.display = 'none';
            }
            // Forzar el filtro a la sucursal del usuario (solo esta opción)
            branchFilter.innerHTML = currentBranchId 
                ? `<option value="${currentBranchId}">${(await DB.get('catalog_branches', currentBranchId))?.name || 'Mi Sucursal'}</option>`
                : '<option value="">Sin sucursal</option>';
            branchFilter.value = currentBranchId || '';
        } else {
            // Master admin puede ver todas las sucursales
            const branches = await DB.getAll('catalog_branches') || [];
            
            // Eliminar duplicados
            const seenNames = new Set();
            const seenIds = new Set();
            const uniqueBranches = branches.filter(b => {
                if (!b || !b.id || !b.name) return false;
                if (b.name === 'Sucursal Principal' && seenNames.has('Sucursal Principal')) {
                    return false;
                }
                if (seenIds.has(b.id)) {
                    return false;
                }
                seenNames.add(b.name);
                seenIds.add(b.id);
                return true;
            });
            
            // Guardar la selección actual antes de actualizar
            const currentValue = branchFilter.value;
            const wasManualSelection = branchFilter.dataset.manualSelection === 'true';
            
            branchFilter.innerHTML = '<option value="">Todas las sucursales</option>' +
                uniqueBranches.map(branch => 
                    `<option value="${branch.id}">${branch.name}</option>`
                ).join('');
            
            // Mostrar el contenedor
            const branchFilterContainer = branchFilter.parentElement;
            if (branchFilterContainer && branchFilterContainer.style) {
                branchFilterContainer.style.display = '';
            }
            
            // Restaurar la selección: si fue manual, mantenerla; si no, usar la sucursal actual
            if (wasManualSelection && currentValue) {
                branchFilter.value = currentValue;
                branchFilter.dataset.manualSelection = 'true';
            } else {
                // Si no hay selección manual, usar la sucursal actual o dejar vacío para ver todas
                branchFilter.value = currentBranchId || '';
                delete branchFilter.dataset.manualSelection;
            }
        }
    },

    async displayCosts(costs, hiddenArrivalCostsCount = 0) {
        const container = document.getElementById('costs-list');
        if (!container) return;

        // Agregar nota informativa si hay costos de llegadas ocultos
        let infoMessage = '';
        if (hiddenArrivalCostsCount > 0) {
            infoMessage = `
                <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm) var(--spacing-md); background: var(--color-bg-secondary); border-left: 4px solid var(--color-info); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <i class="fas fa-info-circle"></i> 
                    <strong>${hiddenArrivalCostsCount}</strong> costo(s) de llegadas oculto(s). 
                    Los costos de llegadas se calculan automáticamente desde las llegadas y pueden hacer la lista muy larga. 
                    Usa el checkbox "Mostrar llegadas" arriba para verlos.
                </div>
            `;
        }

        if (costs.length === 0) {
            container.innerHTML = infoMessage + '<div class="empty-state">No hay costos registrados</div>';
            return;
        }

        const branches = await DB.getAll('catalog_branches') || [];
        const branchFilter = document.getElementById('cost-branch-filter');
        const isFilteredByBranch = branchFilter?.value && branchFilter.value !== '';
        
        // Si está filtrado por una sucursal específica, mostrar sin agrupar
        // Si muestra todas las sucursales, agrupar por sucursal
        if (isFilteredByBranch) {
            // Mostrar costos de una sola sucursal sin agrupar
            const branchId = branchFilter.value;
            const branch = branches.find(b => b.id === branchId);
            const branchName = branch?.name || 'Sucursal Desconocida';
            
            // Ordenar por fecha descendente
            costs.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
            
            const total = costs.reduce((sum, cost) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0)), 0);
            
            let html = `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-store"></i> ${branchName}
                        </h3>
                        <div style="font-size: 16px; font-weight: 700;" data-cost-total>
                            ${Utils.formatCurrency(total)}
                        </div>
                    </div>
                    <div style="padding: var(--spacing-md);">
                        <div style="display: grid; gap: var(--spacing-sm);">
            `;
            
            costs.forEach(cost => {
                const costDate = Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY');
                html += `
                    <div class="cost-item" data-cost-id="${cost.id}" data-cost-amount="${cost.amount || 0}" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid var(--color-primary);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${cost.category || 'Sin categoría'}</div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">${costDate} • ${cost.type === 'fijo' ? 'Fijo' : 'Variable'}</div>
                            ${cost.supplier_name || cost.supplier_code ? `
                            <div style="font-size: 10px; color: var(--color-primary); margin-top: 2px;">
                                <i class="fas fa-truck" style="margin-right: 4px;"></i>
                                ${cost.supplier_code || ''} ${cost.supplier_code && cost.supplier_name ? '- ' : ''}${cost.supplier_name || ''}
                            </div>
                            ` : ''}
                            ${cost.notes ? `<div style="font-size: 10px; color: var(--color-text-secondary); margin-top: 2px;">${cost.notes}</div>` : ''}
                        </div>
                        <div style="text-align: right; margin-left: var(--spacing-md);">
                            <div style="font-weight: 700; font-size: 14px; color: var(--color-primary);">${Utils.formatCurrency(cost.amount || 0)}</div>
                        </div>
                        <div style="margin-left: var(--spacing-sm); display: flex; gap: var(--spacing-xs);">
                            <button class="btn-icon btn-sm" onclick="window.Costs.editCost('${cost.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-sm" onclick="window.Costs.deleteCost('${cost.id}')" title="Eliminar" style="color: var(--color-danger);">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                        </div>
                    </div>
                </div>
            `;
            
            container.innerHTML = infoMessage + html;
            return;
        }
        
        // Agrupar costos por sucursal cuando se muestran todas
        const costsByBranch = {};
        costs.forEach(cost => {
            const branchId = cost.branch_id || 'sin_sucursal';
            if (!costsByBranch[branchId]) {
                costsByBranch[branchId] = [];
            }
            costsByBranch[branchId].push(cost);
        });

        // Ordenar sucursales
        const branchOrder = branches.map(b => b.id);
        const sortedBranchIds = Object.keys(costsByBranch).sort((a, b) => {
            const aIndex = branchOrder.indexOf(a);
            const bIndex = branchOrder.indexOf(b);
            if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

        let html = '';
        
        sortedBranchIds.forEach(branchId => {
            const branchCosts = costsByBranch[branchId];
            const branch = branches.find(b => b.id === branchId);
            const branchName = branch?.name || 'Sin Sucursal';
            
            // Calcular total de la sucursal
            const branchTotal = branchCosts.reduce((sum, cost) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0)), 0);
            
            // Ordenar costos por fecha descendente
            branchCosts.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
            
            html += `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-store"></i> ${branchName}
                        </h3>
                        <div style="font-size: 16px; font-weight: 700;" data-cost-total>
                            Total: ${Utils.formatCurrency(branchTotal)}
                        </div>
                    </div>
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                    <th>Notas</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${branchCosts.map(cost => {
                                    return `
                                        <tr data-cost-id="${cost.id}" data-cost-amount="${cost.amount || 0}">
                                            <td>${Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY')}</td>
                                            <td><span class="status-badge status-${cost.type === 'variable' ? 'reservado' : 'disponible'}">${cost.type === 'variable' ? 'Variable' : 'Fijo'}</span></td>
                                            <td>${cost.category || 'N/A'}</td>
                                            <td style="font-weight: 600;">${Utils.formatCurrency(cost.amount)}</td>
                                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cost.notes || '-'}</td>
                                            <td style="white-space: nowrap;">
                                                <button class="btn-secondary btn-sm" onclick="window.Costs.editCost('${cost.id}')" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn-danger btn-sm" onclick="window.Costs.deleteCost('${cost.id}')" title="Eliminar">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = infoMessage + html;
    },

    async loadOverview() {
        await this.renderCategoryChart();
        await this.renderMonthlyTrend();
        await this.renderTypeDistribution();
        await this.renderBranchChart();
    },

    async renderCategoryChart() {
        const container = document.getElementById('category-chart');
        if (!container) return;

        const branchFilter = document.getElementById('cost-branch-filter');
        const currentBranchId = branchFilter?.value && branchFilter.value !== ''
            ? branchFilter.value
            : (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
        const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
        const categoryStats = {};

        costs.forEach(cost => {
            const category = cost.category || 'Otros';
            if (!categoryStats[category]) {
                categoryStats[category] = 0;
            }
            categoryStats[category] += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
        });

        const categoryData = Object.entries(categoryStats)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);

        const maxCategory = Math.max(...categoryData.map(c => c.total), 1);
        const total = categoryData.reduce((sum, c) => sum + c.total, 0);

        if (categoryData.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm); width: 100%; min-width: 0;">
                ${categoryData.map(category => {
                    const percentage = (category.total / maxCategory) * 100;
                    const pctOfTotal = total > 0 ? (category.total / total * 100) : 0;
                    return `
                        <div style="min-width: 0; width: 100%;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs); font-size: 11px; min-width: 0;">
                                <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>${category.name}</strong></span>
                                <span style="font-weight: 600; white-space: nowrap; margin-left: var(--spacing-xs);">${Utils.formatCurrency(category.total)} (${pctOfTotal.toFixed(1)}%)</span>
                            </div>
                            <div style="height: 8px; background: var(--color-bg-secondary); border-radius: 4px; overflow: hidden; width: 100%;">
                                <div style="height: 100%; width: ${percentage}%; background: var(--gradient-accent); transition: width 0.3s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderMonthlyTrend() {
        const container = document.getElementById('monthly-trend-chart');
        if (!container) return;

        const branchFilter = document.getElementById('cost-branch-filter');
        const currentBranchId = branchFilter?.value && branchFilter.value !== ''
            ? branchFilter.value
            : (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
        const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
        const monthlyStats = {};

        costs.forEach(cost => {
            const costDate = new Date(cost.date || cost.created_at);
            const monthKey = `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = 0;
            }
            monthlyStats[monthKey] += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
        });

        const monthlyData = Object.entries(monthlyStats)
            .map(([month, total]) => ({ month, total }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6);

        const maxMonthly = Math.max(...monthlyData.map(m => m.total), 1);

        if (monthlyData.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        container.innerHTML = `
            <div style="display: flex; align-items: flex-end; gap: 4px; height: 250px; width: 100%; min-width: 0; overflow-x: auto;">
                ${monthlyData.map(month => {
                    const height = (month.total / maxMonthly) * 100;
                    const monthName = new Date(month.month + '-01').toLocaleDateString('es', { month: 'short' });
                    return `
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; flex-shrink: 0;">
                            <div style="flex: 1; display: flex; align-items: flex-end; width: 100%; min-width: 0;">
                                <div style="width: 100%; background: var(--gradient-accent); 
                                    border-radius: var(--radius-xs) var(--radius-xs) 0 0; 
                                    height: ${height}%; 
                                    min-height: ${month.total > 0 ? '3px' : '0'};"></div>
                            </div>
                            <div style="font-size: 9px; color: var(--color-text-secondary); text-align: center; white-space: nowrap;">
                                <div>${monthName}</div>
                                <div style="font-weight: 600; color: var(--color-text); margin-top: 2px; font-size: 10px;">${Utils.formatCurrency(month.total)}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderTypeDistribution() {
        const container = document.getElementById('type-distribution-chart');
        if (!container) return;

        const branchFilter = document.getElementById('cost-branch-filter');
        const currentBranchId = branchFilter?.value && branchFilter.value !== ''
            ? branchFilter.value
            : (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
        const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
        const variable = costs.filter(c => (c.type || '').toLowerCase() === 'variable').reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const fixed = costs.filter(c => (c.type || '').toLowerCase() === 'fijo').reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const total = variable + fixed;

        if (total === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        const variablePct = (variable / total) * 100;
        const fixedPct = (fixed / total) * 100;

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); min-width: 0; width: 100%; box-sizing: border-box;">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Variables</div>
                    <div style="font-size: 24px; font-weight: 700; color: var(--color-warning);">${Utils.formatCurrency(variable)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">${variablePct.toFixed(1)}%</div>
                </div>
                <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); min-width: 0; width: 100%; box-sizing: border-box;">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Fijos</div>
                    <div style="font-size: 24px; font-weight: 700; color: var(--color-danger);">${Utils.formatCurrency(fixed)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">${fixedPct.toFixed(1)}%</div>
                </div>
            </div>
        `;
    },

    async renderBranchChart() {
        const container = document.getElementById('branch-chart');
        if (!container) return;

        const branchFilter = document.getElementById('cost-branch-filter');
        const currentBranchId = branchFilter?.value && branchFilter.value !== ''
            ? branchFilter.value
            : (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
        const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
        const branches = await DB.getAll('catalog_branches') || [];
        const branchStats = {};

        costs.forEach(cost => {
            const branchId = cost.branch_id || 'all';
            if (!branchStats[branchId]) {
                branchStats[branchId] = 0;
            }
            branchStats[branchId] += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
        });

        const branchData = Object.entries(branchStats)
            .map(([id, total]) => ({
                name: id === 'all' ? 'Todas' : branches.find(b => b.id === id)?.name || 'Desconocida',
                total
            }))
            .sort((a, b) => b.total - a.total);

        const maxBranch = Math.max(...branchData.map(b => b.total), 1);

        if (branchData.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-xs); width: 100%; min-width: 0;">
                ${branchData.map(branch => {
                    const percentage = (branch.total / maxBranch) * 100;
                    return `
                        <div style="min-width: 0; width: 100%;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px; min-width: 0;">
                                <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis;">${branch.name}</span>
                                <span style="font-weight: 600; white-space: nowrap; margin-left: var(--spacing-xs);">${Utils.formatCurrency(branch.total)}</span>
                            </div>
                            <div style="height: 6px; background: var(--color-bg-secondary); border-radius: 3px; overflow: hidden; width: 100%;">
                                <div style="height: 100%; width: ${percentage}%; background: var(--gradient-accent); transition: width 0.3s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async getCostStats() {
        // Obtener sucursal actual y filtrar datos
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
        
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        const sales = await DB.getAll('sales', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        const completedSales = sales.filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')));

        const today = new Date();
        const thisMonth = costs.filter(c => {
            const costDate = new Date(c.date || c.created_at);
            return costDate.getMonth() === today.getMonth() && costDate.getFullYear() === today.getFullYear();
        });
        const lastMonth = costs.filter(c => {
            const costDate = new Date(c.date || c.created_at);
            const lastMonthDate = new Date(today);
            lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
            return costDate.getMonth() === lastMonthDate.getMonth() && costDate.getFullYear() === lastMonthDate.getFullYear();
        });

        const totalCosts = costs.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const variableCosts = costs.filter(c => (c.type || '').toLowerCase() === 'variable').reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const fixedCosts = costs.filter(c => (c.type || '').toLowerCase() === 'fijo').reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const thisMonthTotal = thisMonth.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const lastMonthTotal = lastMonth.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
        const monthChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;

        // Promedio mensual últimos 6 meses
        const monthlyStats = {};
        costs.forEach(cost => {
            const costDate = new Date(cost.date || cost.created_at);
            const monthKey = `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = 0;
            }
            monthlyStats[monthKey] += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
        });
        const monthlyData = Object.values(monthlyStats).slice(-6);
        const avgMonthly = monthlyData.length > 0 ? monthlyData.reduce((sum, val) => sum + val, 0) / monthlyData.length : 0;

        // Utilidad y margen
        const totalRevenue = completedSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const profit = totalRevenue - totalCosts;
        const margin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;

        return {
            totalCosts,
            variableCosts,
            fixedCosts,
            thisMonth: thisMonthTotal,
            lastMonth: lastMonthTotal,
            monthChange,
            avgMonthly,
            totalEntries: costs.length,
            profit,
            margin
        };
    },

    async loadAnalysis() {
        // Esta función se ejecuta cuando el usuario hace clic en "Ejecutar Análisis"
    },

    async runAnalysis() {
        const period = document.getElementById('analysis-period')?.value || 'last6months';
        const container = document.getElementById('analysis-results');
        if (!container) return;

        try {
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const costs = this.getOperationalCosts(await this.getFilteredCosts({ branchId: currentBranchId }));
            
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            const viewAllBranches = isMasterAdmin;
            
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const completedSales = sales.filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')));

            // Filtrar por período
            let filteredCosts = costs;
            const today = new Date();
            const cutoffDate = new Date();

            switch(period) {
                case 'last3months':
                    cutoffDate.setMonth(cutoffDate.getMonth() - 3);
                    break;
                case 'last6months':
                    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
                    break;
                case 'last12months':
                    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
                    break;
                case 'thisyear':
                    cutoffDate.setMonth(0);
                    cutoffDate.setDate(1);
                    break;
                case 'lastyear':
                    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
                    cutoffDate.setMonth(0);
                    cutoffDate.setDate(1);
                    const endDate = new Date(cutoffDate);
                    endDate.setFullYear(endDate.getFullYear() + 1);
                    filteredCosts = costs.filter(c => {
                        const costDate = new Date(c.date || c.created_at);
                        return costDate >= cutoffDate && costDate < endDate;
                    });
                    break;
            }

            if (period !== 'lastyear') {
                filteredCosts = filteredCosts.filter(c => {
                    const costDate = new Date(c.date || c.created_at);
                    return costDate >= cutoffDate;
                });
            }

            const totalCosts = filteredCosts.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
            const totalRevenue = completedSales.reduce((sum, s) => {
                const saleDate = new Date(s.created_at);
                return saleDate >= cutoffDate ? sum + (s.total || 0) : sum;
            }, 0);
            const profit = totalRevenue - totalCosts;
            const margin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;

            // Análisis por categoría
            const categoryAnalysis = {};
            filteredCosts.forEach(cost => {
                const category = cost.category || 'Otros';
                if (!categoryAnalysis[category]) {
                    categoryAnalysis[category] = { variable: 0, fijo: 0, total: 0 };
                }
                if (cost.type === 'variable') {
                    categoryAnalysis[category].variable += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
                } else {
                    categoryAnalysis[category].fijo += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
                }
                categoryAnalysis[category].total += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
            });

            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Ingresos</div>
                        <div class="kpi-value" style="color: var(--color-success);">${Utils.formatCurrency(totalRevenue)}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Costos</div>
                        <div class="kpi-value" style="color: var(--color-danger);">${Utils.formatCurrency(totalCosts)}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Utilidad Neta</div>
                        <div class="kpi-value" style="color: ${profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                            ${Utils.formatCurrency(profit)}
                        </div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Margen</div>
                        <div class="kpi-value">${margin.toFixed(1)}%</div>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        Análisis por Categoría
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: var(--spacing-sm); width: 100%;">
                        ${Object.entries(categoryAnalysis)
                            .sort((a, b) => b[1].total - a[1].total)
                            .map(([category, stats]) => {
                                const percentage = totalCosts > 0 ? (stats.total / totalCosts * 100) : 0;
                                return `
                                    <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs);">
                                            <div>
                                                <strong style="font-size: 12px;">${category}</strong>
                                                <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: 2px;">
                                                    Variable: ${Utils.formatCurrency(stats.variable)} | Fijo: ${Utils.formatCurrency(stats.fijo)}
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="font-weight: 600;">${Utils.formatCurrency(stats.total)}</div>
                                                <div style="font-size: 10px; color: var(--color-text-secondary);">${percentage.toFixed(1)}%</div>
                                            </div>
                                        </div>
                                        <div style="width: 100%; height: 6px; background: var(--color-border-light); border-radius: 3px; overflow: hidden;">
                                            <div style="width: ${percentage}%; height: 100%; background: var(--gradient-accent);"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error running analysis:', e);
            container.innerHTML = '<div class="empty-state">Error al ejecutar análisis</div>';
        }
    },

    async loadHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;

        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('history-type-filter')?.value || '';
        const dateFrom = document.getElementById('history-date-from')?.value || '';
        const dateTo = document.getElementById('history-date-to')?.value || '';

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        let costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const branches = await DB.getAll('catalog_branches') || [];

        // Aplicar filtros
        if (typeFilter) {
            costs = costs.filter(c => c.type === typeFilter);
        }
        if (search) {
            costs = costs.filter(c => 
                (c.category || '').toLowerCase().includes(search) ||
                (c.notes || '').toLowerCase().includes(search) ||
                branches.find(b => b.id === c.branch_id)?.name?.toLowerCase().includes(search)
            );
        }
        if (dateFrom) {
            costs = costs.filter(c => (c.date || c.created_at) >= dateFrom);
        }
        if (dateTo) {
            costs = costs.filter(c => (c.date || c.created_at) <= dateTo);
        }

        costs.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

        if (costs.length === 0) {
            container.innerHTML = '<div class="empty-state">No se encontraron costos</div>';
            return;
        }

        container.innerHTML = `
            <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Categoría</th>
                        <th>Monto</th>
                        <th>Sucursal</th>
                        <th>Notas</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${costs.map(cost => {
                        const branch = branches.find(b => b.id === cost.branch_id);
                        return `
                            <tr>
                                <td>${Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY')}</td>
                                <td><span class="status-badge status-${cost.type === 'variable' ? 'reservado' : 'disponible'}">${cost.type === 'variable' ? 'Variable' : 'Fijo'}</span></td>
                                <td>${cost.category || 'N/A'}</td>
                                <td style="font-weight: 600;">${Utils.formatCurrency(cost.amount)}</td>
                                <td>${branch?.name || 'Todas'}</td>
                                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cost.notes || '-'}</td>
                                <td style="white-space: nowrap;">
                                    <button class="btn-secondary btn-xs" onclick="window.Costs.editCost('${cost.id}')">
                                        <i class="fas fa-edit"></i> Editar
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        // Event listeners
        document.getElementById('history-search')?.addEventListener('input', Utils.debounce(() => this.loadHistory(), 300));
        document.getElementById('history-type-filter')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-date-from')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-date-to')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-export')?.addEventListener('click', () => this.exportHistory());
    },

    async loadBudget() {
        // Cargar opciones de sucursales en el selector de presupuesto
        const budgetBranchSelect = document.getElementById('budget-branch');
        if (budgetBranchSelect) {
            const branches = await DB.getAll('catalog_branches') || [];
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            
            budgetBranchSelect.innerHTML = '<option value="">Todas</option>' +
                branches.map(b => 
                    `<option value="${b.id}" ${b.id === currentBranchId ? 'selected' : ''}>${b.name}</option>`
                ).join('');
        }
        
        await this.loadBudgetList();
        await this.renderAnnualProjection();
    },

    async loadBudgetList() {
        const container = document.getElementById('budget-list');
        if (!container) return;

        try {
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const budgets = await DB.getAll('budget_entries') || [];
            
            // Filtrar por sucursal si no es admin
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            
            let filteredBudgets = budgets;
            if (!isAdmin && currentBranchId) {
                filteredBudgets = budgets.filter(b => b.branch_id === currentBranchId || !b.branch_id);
            }
            
            // Ordenar por mes descendente
            filteredBudgets.sort((a, b) => {
                const aDate = new Date(a.month + '-01');
                const bDate = new Date(b.month + '-01');
                return bDate - aDate;
            });

            if (filteredBudgets.length === 0) {
                container.innerHTML = `
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                            Presupuestos Registrados
                        </h3>
                        <div class="empty-state">No hay presupuestos registrados. Crea uno usando el formulario superior.</div>
                    </div>
                `;
                return;
            }

            // Obtener costos reales para comparar
            const branches = await DB.getAll('catalog_branches') || [];
            const today = new Date();
            
            let html = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-md);">
                        <i class="fas fa-balance-scale"></i> Comparación Presupuesto vs Real
                    </h3>
                    <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                        <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 1000px;">
                            <thead>
                                <tr>
                                    <th>Mes</th>
                                    <th>Sucursal</th>
                                    <th>Presupuesto</th>
                                    <th>Costos Reales</th>
                                    <th>Diferencia</th>
                                    <th>% Ejecutado</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            for (const budget of filteredBudgets) {
                const monthDate = new Date(budget.month + '-01');
                const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
                
                // Obtener costos reales del mes
                const realCosts = await this.getFilteredCosts({
                    branchId: budget.branch_id || null,
                    dateFrom: Utils.formatDate(monthStart, 'YYYY-MM-DD'),
                    dateTo: Utils.formatDate(monthEnd, 'YYYY-MM-DD')
                });
                
                const realTotal = realCosts.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
                const difference = realTotal - budget.amount;
                const percentage = budget.amount > 0 ? (realTotal / budget.amount * 100) : 0;
                
                const branch = branches.find(b => b.id === budget.branch_id);
                const branchName = branch?.name || 'Todas';
                
                let statusColor = 'var(--color-success)';
                let statusText = 'Dentro del presupuesto';
                if (percentage > 100) {
                    statusColor = 'var(--color-danger)';
                    statusText = 'Excedido';
                } else if (percentage > 90) {
                    statusColor = 'var(--color-warning)';
                    statusText = 'Cerca del límite';
                }
                
                const monthName = monthDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });
                
                html += `
                    <tr>
                        <td style="text-transform: capitalize;">${monthName}</td>
                        <td>${branchName}</td>
                        <td style="font-weight: 600;">${Utils.formatCurrency(budget.amount)}</td>
                        <td style="font-weight: 600;">${Utils.formatCurrency(realTotal)}</td>
                        <td style="font-weight: 600; color: ${difference >= 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                            ${difference >= 0 ? '+' : ''}${Utils.formatCurrency(difference)}
                        </td>
                        <td style="font-weight: 600; color: ${percentage > 100 ? 'var(--color-danger)' : percentage > 90 ? 'var(--color-warning)' : 'var(--color-success)'};">
                            ${percentage.toFixed(1)}%
                        </td>
                        <td>
                            <span class="status-badge" style="background: ${statusColor}; color: white;">
                                ${statusText}
                            </span>
                        </td>
                        <td style="white-space: nowrap;">
                            <button class="btn-secondary btn-xs" onclick="window.Costs.editBudget('${budget.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-secondary btn-xs" onclick="window.Costs.deleteBudget('${budget.id}')" style="color: var(--color-danger); margin-left: var(--spacing-xs);">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        } catch (e) {
            console.error('Error loading budget list:', e);
            container.innerHTML = '<div class="empty-state">Error al cargar presupuestos</div>';
        }
    },

    async renderAnnualProjection() {
        const container = document.getElementById('annual-projection');
        if (!container) return;

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const today = new Date();
        const currentYear = today.getFullYear();

        // Calcular promedio mensual del año actual
        const monthlyStats = {};
        costs.forEach(cost => {
            const costDate = new Date(cost.date || cost.created_at);
            if (costDate.getFullYear() === currentYear) {
                const monthKey = costDate.getMonth();
                if (!monthlyStats[monthKey]) {
                    monthlyStats[monthKey] = 0;
                }
                monthlyStats[monthKey] += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
            }
        });

        const monthlyData = Object.values(monthlyStats);
        const avgMonthly = monthlyData.length > 0 ? monthlyData.reduce((sum, val) => sum + val, 0) / monthlyData.length : 0;
        const projectedAnnual = avgMonthly * 12;

        container.innerHTML = `
            <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Proyección Anual</div>
                <div style="font-size: 24px; font-weight: 700; color: var(--color-accent);">${Utils.formatCurrency(projectedAnnual)}</div>
                <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                    Basado en promedio mensual: ${Utils.formatCurrency(avgMonthly)}
                </div>
            </div>
        `;
    },

    async saveBudget(budgetId = null) {
        const month = document.getElementById('budget-month')?.value;
        const amount = parseFloat(document.getElementById('budget-amount')?.value || 0);
        const branchId = document.getElementById('budget-branch')?.value || 
                        (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);

        if (!month || amount <= 0) {
            Utils.showNotification('Ingresa mes y monto válidos', 'warning');
            return;
        }

        try {
            const monthDate = new Date(month + '-01');
            const year = monthDate.getFullYear();
            
            const budget = {
                id: budgetId || Utils.generateId(),
                month: month,
                year: year,
                amount: amount,
                branch_id: branchId,
                notes: document.getElementById('budget-notes')?.value || '',
                created_at: budgetId ? (await DB.get('budget_entries', budgetId))?.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('budget_entries', budget);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('budget_entry', budget.id);
            }

            Utils.showNotification(budgetId ? 'Presupuesto actualizado' : 'Presupuesto guardado', 'success');
            UI.closeModal();
            await this.loadBudget();
        } catch (e) {
            console.error('Error saving budget:', e);
            Utils.showNotification('Error al guardar presupuesto', 'error');
        }
    },

    async editBudget(budgetId) {
        const budget = await DB.get('budget_entries', budgetId);
        if (!budget) {
            Utils.showNotification('Presupuesto no encontrado', 'error');
            return;
        }

        const branches = await DB.getAll('catalog_branches') || [];
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;

        const body = `
            <form id="budget-form" style="width: 100%; max-width: 100%; box-sizing: border-box;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); width: 100%; box-sizing: border-box;">
                    <div class="form-group" style="min-width: 0;">
                        <label>Mes *</label>
                        <input type="month" id="budget-month" class="form-input" value="${budget.month}" required style="width: 100%;">
                    </div>
                    <div class="form-group" style="min-width: 0;">
                        <label>Monto *</label>
                        <input type="number" id="budget-amount" class="form-input" step="0.01" value="${budget.amount}" required style="width: 100%;">
                    </div>
                    <div class="form-group" style="min-width: 0; grid-column: 1 / -1;">
                        <label>Sucursal</label>
                        <select id="budget-branch" class="form-select" style="width: 100%;">
                            <option value="">Todas</option>
                            ${branches.map(b => 
                                `<option value="${b.id}" ${budget.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0; grid-column: 1 / -1;">
                        <label>Notas</label>
                        <textarea id="budget-notes" class="form-textarea" rows="3" style="width: 100%; resize: vertical;">${budget.notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;

        const footer = [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveBudget(budgetId) }
        ];

        UI.showModal('Editar Presupuesto', body, footer);
    },

    async deleteBudget(budgetId) {
        if (!await Utils.confirm('¿Eliminar este presupuesto?')) return;

        try {
            await DB.delete('budget_entries', budgetId);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('budget_entry', budgetId, 'delete');
            }
            Utils.showNotification('Presupuesto eliminado', 'success');
            await this.loadBudget();
        } catch (e) {
            console.error('Error deleting budget:', e);
            Utils.showNotification('Error al eliminar presupuesto', 'error');
        }
    },

    async exportHistory() {
        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('history-type-filter')?.value || '';
        const dateFrom = document.getElementById('history-date-from')?.value || '';
        const dateTo = document.getElementById('history-date-to')?.value || '';

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        let costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const branches = await DB.getAll('catalog_branches') || [];

        // Aplicar mismos filtros que en loadHistory
        if (typeFilter) {
            costs = costs.filter(c => c.type === typeFilter);
        }
        if (search) {
            costs = costs.filter(c => 
                (c.category || '').toLowerCase().includes(search) ||
                (c.notes || '').toLowerCase().includes(search) ||
                branches.find(b => b.id === c.branch_id)?.name?.toLowerCase().includes(search)
            );
        }
        if (dateFrom) {
            costs = costs.filter(c => (c.date || c.created_at) >= dateFrom);
        }
        if (dateTo) {
            costs = costs.filter(c => (c.date || c.created_at) <= dateTo);
        }

        const exportData = costs.map(cost => {
            const branch = branches.find(b => b.id === cost.branch_id);
            return {
                'Fecha': Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY'),
                'Tipo': cost.type,
                'Categoría': cost.category,
                'Monto': cost.amount,
                'Sucursal': branch?.name || '',
                'Notas': cost.notes || ''
            };
        });

        const date = Utils.formatDate(new Date(), 'YYYYMMDD');
        Utils.exportToExcel(exportData, `historial_costos_${date}.xlsx`, 'Historial Costos');
        Utils.showNotification(`Exportados ${exportData.length} costos`, 'success');
    },

    async showAddForm(costId = null) {
        const cost = costId ? await DB.get('cost_entries', costId) : null;
        const branches = await DB.getAll('catalog_branches') || [];

        const body = `
            <form id="cost-form" style="width: 100%; max-width: 100%; box-sizing: border-box;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); width: 100%; box-sizing: border-box;">
                    <div class="form-group" style="min-width: 0;">
                        <label>Fecha *</label>
                        <input type="date" id="cost-date" class="form-input" value="${cost ? Utils.formatDate(cost.date || cost.created_at, 'YYYY-MM-DD') : Utils.formatDate(new Date(), 'YYYY-MM-DD')}" required style="width: 100%;">
                    </div>
                    <div class="form-group" style="min-width: 0;">
                        <label>Tipo *</label>
                        <select id="cost-type" class="form-select" required style="width: 100%;">
                            <option value="variable" ${cost?.type === 'variable' ? 'selected' : ''}>Variable</option>
                            <option value="fijo" ${cost?.type === 'fijo' ? 'selected' : ''}>Fijo</option>
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0;">
                        <label>Categoría *</label>
                        <select id="cost-category" class="form-select" required style="width: 100%;">
                            <option value="luz" ${cost?.category === 'luz' ? 'selected' : ''}>Luz</option>
                            <option value="agua" ${cost?.category === 'agua' ? 'selected' : ''}>Agua</option>
                            <option value="renta" ${cost?.category === 'renta' ? 'selected' : ''}>Renta</option>
                            <option value="nomina" ${cost?.category === 'nomina' ? 'selected' : ''}>Nómina</option>
                            <option value="comisiones" ${cost?.category === 'comisiones' ? 'selected' : ''}>Comisiones</option>
                            <option value="despensa" ${cost?.category === 'despensa' ? 'selected' : ''}>Despensa</option>
                            <option value="linea_amarilla" ${cost?.category === 'linea_amarilla' ? 'selected' : ''}>Línea Amarilla</option>
                            <option value="licencias" ${cost?.category === 'licencias' ? 'selected' : ''}>Licencias y Permisos</option>
                            <option value="pago_llegadas" ${cost?.category === 'pago_llegadas' ? 'selected' : ''}>Pago de Llegadas</option>
                            <option value="costo_ventas" ${cost?.category === 'costo_ventas' ? 'selected' : ''}>Costo de Ventas (COGS)</option>
                            <option value="comisiones" ${cost?.category === 'comisiones' ? 'selected' : ''}>Comisiones</option>
                            <option value="comisiones_bancarias" ${cost?.category === 'comisiones_bancarias' ? 'selected' : ''}>Comisiones Bancarias</option>
                            <option value="adquisicion" ${cost?.category === 'adquisicion' ? 'selected' : ''}>Adquisición de Productos</option>
                            <option value="reparacion" ${cost?.category === 'reparacion' ? 'selected' : ''}>Reparaciones</option>
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0;">
                        <label>Monto *</label>
                        <input type="number" id="cost-amount" class="form-input" step="0.01" value="${cost?.amount || 0}" required style="width: 100%;">
                    </div>
                    <div class="form-group" style="min-width: 0;">
                        <label>Período</label>
                        <select id="cost-period-type" class="form-select" style="width: 100%;" onchange="this.nextElementSibling.style.display = this.value !== 'one_time' ? 'block' : 'none';">
                            <option value="one_time" ${cost?.period_type === 'one_time' || !cost?.period_type ? 'selected' : ''}>Una Vez</option>
                            <option value="daily" ${cost?.period_type === 'daily' ? 'selected' : ''}>Diario</option>
                            <option value="weekly" ${cost?.period_type === 'weekly' ? 'selected' : ''}>Semanal</option>
                            <option value="monthly" ${cost?.period_type === 'monthly' ? 'selected' : ''}>Mensual</option>
                            <option value="annual" ${cost?.period_type === 'annual' ? 'selected' : ''}>Anual</option>
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0; ${cost?.recurring ? '' : 'display: none;'}" id="cost-recurring-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="cost-recurring" ${cost?.recurring ? 'checked' : ''} style="width: auto;">
                            <span>Recurrente</span>
                        </label>
                    </div>
                    <div class="form-group" style="min-width: 0; ${cost?.auto_generate ? '' : 'display: none;'}" id="cost-auto-generate-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="cost-auto-generate" ${cost?.auto_generate ? 'checked' : ''} style="width: auto;">
                            <span>Generar Automáticamente</span>
                        </label>
                    </div>
                    <div class="form-group" style="min-width: 0; grid-column: 1 / -1;">
                        <label>Sucursal</label>
                        <select id="cost-branch" class="form-select" style="width: 100%;">
                            <option value="">Todas</option>
                            ${branches.map(b => {
                                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                                const isSelected = cost?.branch_id === b.id || (!cost && b.id === currentBranchId);
                                return `<option value="${b.id}" ${isSelected ? 'selected' : ''}>${b.name}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0; grid-column: 1 / -1;">
                        <label>Notas</label>
                        <textarea id="cost-notes" class="form-textarea" rows="3" style="width: 100%; resize: vertical;">${cost?.notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;

        const footer = [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveCost(costId || '') }
        ];

        UI.showModal(costId ? 'Editar Costo' : 'Nuevo Costo', body, footer);
    },

    async saveCost(costId) {
        const form = document.getElementById('cost-form');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const periodType = document.getElementById('cost-period-type')?.value || 'one_time';
        const recurring = document.getElementById('cost-recurring')?.checked || false;
        const autoGenerate = document.getElementById('cost-auto-generate')?.checked || false;

        // Obtener branch_id del formulario, o usar la sucursal actual si está vacío
        let branchId = document.getElementById('cost-branch')?.value || '';
        if (!branchId) {
            branchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        }
        if (branchId === '') {
            branchId = null;
        }

        const amount = parseFloat(document.getElementById('cost-amount').value);
        if (isNaN(amount) || amount <= 0) {
            Utils.showNotification('El monto debe ser un número mayor a 0', 'error');
            return;
        }

        const cost = {
            id: costId || Utils.generateId(),
            type: document.getElementById('cost-type').value,
            category: document.getElementById('cost-category').value,
            amount: amount,
            branch_id: branchId,
            date: document.getElementById('cost-date').value,
            period_type: periodType,
            recurring: recurring,
            auto_generate: autoGenerate,
            notes: document.getElementById('cost-notes').value || '',
            created_at: costId ? (await DB.get('cost_entries', costId))?.created_at : new Date().toISOString(),
            sync_status: 'pending'
        };

        try {
            // SINCRONIZACIÓN BIDIRECCIONAL: Guardar en ambos lados (Backend y Frontend)
            let savedWithAPI = false;
            if (typeof API !== 'undefined' && API.baseURL && API.token) {
                try {
                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                    
                    // Sanitizar branch_id antes de enviar
                    const payload = { ...cost };
                    if (payload.branch_id && !isUUID(payload.branch_id)) {
                        payload.branch_id = null;
                    }
                    
                    if (costId) {
                        // Actualizar costo existente
                        console.log('💰 Actualizando costo en servidor...');
                        const updatedCost = await API.updateCost(costId, payload);
                        // Actualizar con datos del servidor
                        Object.assign(cost, updatedCost);
                        savedWithAPI = true;
                        console.log('✅ Costo actualizado en servidor');
                    } else {
                        // Crear nuevo costo
                        console.log('💰 Creando costo en servidor...');
                        const createdCost = await API.createCost(payload);
                        // Si el servidor generó un ID diferente, actualizar el local
                        if (createdCost && createdCost.id && createdCost.id !== cost.id) {
                            console.log(`🔄 Actualizando ID local: ${cost.id} → ${createdCost.id}`);
                            await DB.delete('cost_entries', cost.id);
                            cost.id = createdCost.id;
                        }
                        Object.assign(cost, createdCost);
                        savedWithAPI = true;
                        console.log('✅ Costo creado en servidor');
                    }
                } catch (apiError) {
                    console.warn('⚠️ Error guardando costo en servidor (continuando con modo local):', apiError);
                    // Continuar con guardado local aunque falle el backend
                }
            }

            // GUARDAR EN INDEXEDDB (siempre, para sincronización bidireccional)
            await DB.put('cost_entries', cost);
            console.log('✅ Costo guardado en IndexedDB');
            
            // Agregar a cola de sincronización (siempre, para otros clientes)
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('cost_entry', cost.id);
                } catch (syncError) {
                    console.error('Error agregando cost_entry a cola:', syncError);
                }
            }

            // Emitir evento de actualización de costo
            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('cost-updated', { cost, isNew: !costId });
            }

            Utils.showNotification(costId ? 'Costo actualizado' : 'Costo agregado', 'success');
            UI.closeModal();
            
            // Recargar costos después de guardar
            const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
            await this.loadTab(activeTab);
        } catch (error) {
            console.error('Error saving cost:', error);
            Utils.showNotification('Error al guardar el costo', 'error');
        }
    },

    async editCost(costId) {
        await this.showAddForm(costId);
    },

    removeCostFromDOM(costId, amount) {
        const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(costId)) : String(costId).replace(/"/g, '\\"');
        const el = document.querySelector(`[data-cost-id="${safeId}"]`);
        if (!el) return;
        const amt = parseFloat(amount) || 0;
        const module = el.closest('.module');
        el.remove();
        if (module) {
            const totalEl = module.querySelector('[data-cost-total]');
            if (totalEl) {
                const txt = totalEl.textContent || '';
                const num = parseFloat(txt.replace(/[^0-9.-]/g, '')) || 0;
                const newTotal = Math.max(0, num - amt);
                const prefix = txt.includes('Total:') ? 'Total: ' : '';
                totalEl.textContent = prefix + (typeof Utils !== 'undefined' && Utils.formatCurrency ? Utils.formatCurrency(newTotal) : newTotal.toFixed(2));
            }
            const remaining = module.querySelectorAll('tbody tr, .cost-item');
            if (remaining.length === 0) {
                module.remove();
                const container = document.getElementById('costs-list');
                if (container && container.querySelectorAll('.module').length === 0) {
                    container.innerHTML = '<div class="empty-state">No hay costos registrados</div>';
                }
            }
        }
    },

    async deleteCost(costId) {
        if (!await Utils.confirm('¿Eliminar este costo?')) return;

        const cost = await DB.get('cost_entries', costId);
        if (!cost) {
            Utils.showNotification('Costo no encontrado', 'error');
            return;
        }

        const serverId = cost.server_id || (cost.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(cost.id)) ? cost.id : null);
        const apiIdToDelete = serverId || costId;

        // CRÍTICO: Registrar eliminación INMEDIATAMENTE para evitar que el sync en background re-inserte el costo
        // (race: API.deleteCost puede no haber terminado cuando el refresh trae datos del servidor)
        const logicalKey = `${cost.date || cost.created_at || ''}_${cost.category || ''}_${cost.branch_id || 'no-branch'}_${cost.amount || 0}_${(cost.description || cost.notes || '').slice(0, 100)}`;
        const costMetadata = {
            id: cost.id,
            server_id: apiIdToDelete,
            logical_key: logicalKey,
            type: cost.type,
            category: cost.category,
            branch_id: cost.branch_id,
            deleted_at: new Date().toISOString()
        };
        try {
            await DB.put('sync_deleted_items', {
                id: costId,
                entity_type: 'cost_entry',
                metadata: costMetadata,
                deleted_at: new Date().toISOString()
            });
        } catch (e) { console.warn('Error guardando sync_deleted_items:', e); }

        // Encontrar todos los duplicados (mismo costo lógico con distintos ids por bug de sincronización)
        const allCosts = await DB.getAll('cost_entries', null, null, { filterByBranch: false }) || [];
        const idsToDelete = new Set();
        idsToDelete.add(costId);
        for (const c of allCosts) {
            if (!c || !c.id) continue;
            if (c.id === costId) continue;
            const sameServer = serverId && (c.server_id === serverId || c.id === serverId);
            const sameLogical = `${c.date || c.created_at || ''}_${c.category || ''}_${c.branch_id || 'no-branch'}_${c.amount || 0}_${(c.description || c.notes || '').slice(0, 100)}` === logicalKey;
            if (sameServer || sameLogical) idsToDelete.add(c.id);
        }

        this.removeCostFromDOM(costId, cost.amount || 0);
        Utils.showNotification('Costo eliminado', 'success');

        try {
            // Si es un costo de llegada, también eliminar la llegada asociada
            let arrivalApiDeleted = false;
            if (cost.category === 'pago_llegadas' && cost.arrival_id) {
                const arrival = await DB.get('agency_arrivals', cost.arrival_id);
                if (arrival) {
                    const arrivalApiId = arrival.server_id || arrival.id;
                    const isUuid = arrivalApiId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(arrivalApiId));
                    if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteArrival && isUuid) {
                        try {
                            console.log('🗑️ Eliminando llegada asociada con API...');
                            await API.deleteArrival(arrivalApiId);
                            console.log('✅ Llegada eliminada con API en servidor');
                            arrivalApiDeleted = true;
                        } catch (arrivalApiError) {
                            console.warn('⚠️ Error eliminando llegada con API (puede que no exista en servidor):', arrivalApiError.message);
                        }
                    }
                    
                    // Eliminar llegada local
                    await DB.delete('agency_arrivals', cost.arrival_id);
                    
                    // Agregar a cola de sincronización si NO se eliminó con API exitosamente
                    if (typeof SyncManager !== 'undefined' && !arrivalApiDeleted) {
                        await SyncManager.addToQueue('agency_arrival', cost.arrival_id, 'delete');
                        console.log('📤 Llegada agregada a cola de sincronización para eliminar en servidor');
                    }
                }
            }

            // ELIMINAR EN AMBOS LADOS: Backend (Railway) y Frontend (IndexedDB)
            let costApiDeleted = false;
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteCost) {
                try {
                    console.log('🗑️ Eliminando costo del servidor...');
                    await API.deleteCost(apiIdToDelete);
                    costApiDeleted = true;
                    console.log('✅ Costo eliminado del servidor');
                } catch (apiError) {
                    console.warn('⚠️ Error eliminando del servidor (continuando con eliminación local):', apiError);
                }
            }

            // Cola de sincronización para eliminar en servidor (si falló la API)
            if (typeof SyncManager !== 'undefined' && !costApiDeleted) {
                try {
                    await SyncManager.addToQueue('cost_entry', apiIdToDelete, 'delete');
                } catch (syncError) {
                    console.error('Error agregando eliminación a cola de sync:', syncError);
                }
            }

            // Eliminar el costo y todos sus duplicados de IndexedDB
            try {
                for (const id of idsToDelete) {
                    try { await DB.delete('cost_entries', id); } catch (_) {}
                }
                let verifyDeleted = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
                    verifyDeleted = await DB.get('cost_entries', costId);
                    if (!verifyDeleted) break;
                }
                if (verifyDeleted) {
                    console.error('⚠️ ERROR: El costo aún existe después de eliminarlo. ID:', costId);
                    Utils.showNotification('Advertencia: La eliminación puede no haberse completado. Recarga la página si el costo sigue apareciendo.', 'warning');
                }
            } catch (deleteError) {
                console.error('Error eliminando costo de la BD:', deleteError);
                Utils.showNotification('Error al eliminar el costo de la base de datos: ' + deleteError.message, 'error');
                await this.loadCosts();
                return;
            }
        } catch (e) {
            console.error('Error eliminando costo:', e);
            Utils.showNotification('Error al eliminar costo: ' + e.message, 'error');
            await this.loadCosts();
        }
    },

    async exportCosts() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            let costs = await this.getFilteredCosts({ branchId: currentBranchId });
            if (this.currentTab === 'sales_costs' || this.currentTab === 'cogs') {
                costs = this.getSalesCosts(costs);
            } else {
                costs = this.getOperationalCosts(costs).filter(c => c.category !== 'pago_llegadas');
            }
            const branches = await DB.getAll('catalog_branches') || [];

            const exportData = costs.map(cost => {
                const branch = branches.find(b => b.id === cost.branch_id);
                return {
                    Fecha: Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY'),
                    Tipo: cost.type,
                    Categoría: cost.category,
                    Monto: cost.amount,
                    Sucursal: branch?.name || '',
                    Notas: cost.notes || ''
                };
            });

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Costos');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `costos_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `costos_${date}.xlsx`, 'Costos');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `costos_${date}.pdf`, 'Costos');
            }

            Utils.showNotification('Costos exportados', 'success');
        } catch (e) {
            console.error('Error exporting costs:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    // ==================== FUNCIONES DE INTEGRACIÓN AUTOMÁTICA ====================

    /**
     * Registrar costo de COGS (Costo de Ventas) automáticamente
     * @param {string} saleId - ID de la venta
     * @param {number} cogsAmount - Monto del costo de ventas
     * @param {string} branchId - ID de la sucursal
     * @param {string} saleFolio - Folio de la venta (para referencia)
     */
    async registerCOGS(saleId, cogsAmount, branchId, saleFolio) {
        if (!cogsAmount || cogsAmount <= 0) return;

        try {
            const cost = {
                id: Utils.generateId(),
                type: 'variable',
                category: 'costo_ventas',
                amount: cogsAmount,
                branch_id: branchId,
                date: Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: `COGS - Venta ${saleFolio || saleId}`,
                sale_id: saleId, // Referencia a la venta
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
            }
        } catch (e) {
            console.error('Error registering COGS:', e);
        }
    },

    /**
     * Registrar costo de comisiones automáticamente
     * @param {string} saleId - ID de la venta
     * @param {number} commissionAmount - Monto de la comisión
     * @param {string} branchId - ID de la sucursal
     * @param {string} saleFolio - Folio de la venta
     * @param {string} entityType - 'seller' o 'guide'
     * @param {string} entityId - ID del vendedor o guía
     */
    async registerCommission(saleId, commissionAmount, branchId, saleFolio, entityType, entityId) {
        if (!commissionAmount || commissionAmount <= 0) return;

        try {
            const cost = {
                id: Utils.generateId(),
                type: 'variable',
                category: 'comisiones',
                amount: commissionAmount,
                branch_id: branchId,
                date: Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: `Comisión ${entityType === 'seller' ? 'Vendedor' : 'Guía'} - Venta ${saleFolio || saleId}`,
                sale_id: saleId,
                entity_type: entityType,
                entity_id: entityId,
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
            }
        } catch (e) {
            console.error('Error registering commission:', e);
        }
    },

    /**
     * Registrar costo de comisión bancaria automáticamente
     * @param {string} saleId - ID de la venta
     * @param {number} commissionAmount - Monto de la comisión bancaria
     * @param {string} branchId - ID de la sucursal
     * @param {string} bank - Banco (banamex, santander)
     * @param {string} paymentType - Tipo de pago (national, international)
     * @param {string} saleFolio - Folio de la venta
     */
    async registerBankCommission(saleId, commissionAmount, branchId, bank, paymentType, saleFolio) {
        if (!commissionAmount || commissionAmount <= 0) return;

        try {
            const cost = {
                id: Utils.generateId(),
                type: 'variable',
                category: 'comisiones_bancarias',
                amount: commissionAmount,
                branch_id: branchId,
                date: Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: `Comisión bancaria ${bank} (${paymentType}) - Venta ${saleFolio || saleId}`,
                sale_id: saleId,
                bank: bank,
                payment_type: paymentType,
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
            }
        } catch (e) {
            console.error('Error registering bank commission:', e);
        }
    },

    /**
     * Registrar costo de pago de llegadas automáticamente
     * @param {string} arrivalId - ID de la llegada
     * @param {number} amount - Monto del pago
     * @param {string} branchId - ID de la sucursal
     * @param {string} agencyId - ID de la agencia
     * @param {number} passengers - Número de pasajeros
     */
    /**
     * Registrar un costo genérico (para uso desde otros módulos)
     * @param {Object} costData - Datos del costo
     * @returns {Promise<string>} ID del costo registrado
     */
    async registerCost(costData) {
        const {
            amount,
            category,
            type = 'variable',
            description = '',
            date = null,
            branch_id = null,
            notes = '',
            ...extraFields
        } = costData;

        if (!amount || amount <= 0) return null;

        try {
            const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
            const currentBranch = (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
            const finalBranchId = isUUID(branch_id) ? branch_id : (isUUID(currentBranch) ? currentBranch : null);

            const cost = {
                id: Utils.generateId(),
                type: type,
                category: category,
                amount: amount,
                // IMPORTANTE: en el backend branch_id es UUID. Si no es UUID, dejar null.
                branch_id: finalBranchId,
                date: date || Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: notes || description,
                created_at: new Date().toISOString(),
                sync_status: 'pending',
                ...extraFields
            };

            // SINCRONIZACIÓN BIDIRECCIONAL: Guardar en ambos lados (Backend y Frontend)
            let savedWithAPI = false;
            if (typeof API !== 'undefined' && API.baseURL && API.token) {
                try {
                    console.log('💰 Registrando costo en servidor...');
                    const createdCost = await API.createCost(cost);
                    // Si el servidor generó un ID diferente, actualizar el local
                    if (createdCost && createdCost.id && createdCost.id !== cost.id) {
                        console.log(`🔄 Actualizando ID local: ${cost.id} → ${createdCost.id}`);
                        await DB.delete('cost_entries', cost.id);
                        cost.id = createdCost.id;
                    }
                    Object.assign(cost, createdCost);
                    savedWithAPI = true;
                    console.log('✅ Costo registrado en servidor');
                } catch (apiError) {
                    console.warn('⚠️ Error registrando costo en servidor (continuando con modo local):', apiError);
                    // Continuar con guardado local aunque falle el backend
                }
            }

            // GUARDAR EN INDEXEDDB (siempre, para sincronización bidireccional)
            // Nota: NO auto-inyectar branch_id local (branch1/branch2...) porque el backend espera UUID
            await DB.put('cost_entries', cost, { autoBranchId: false });
            console.log('✅ Costo guardado en IndexedDB');
            
            // Agregar a cola de sincronización (siempre, para otros clientes)
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('cost_entry', cost.id);
                } catch (syncError) {
                    console.error('Error agregando cost_entry a cola:', syncError);
                }
            }
            
            // Emitir evento de actualización de costo
            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('cost-updated', { cost, isNew: true });
            }
            
            return cost.id;
        } catch (error) {
            console.error('Error registrando costo:', error);
            throw error;
        }
    },

    async registerArrivalPayment(arrivalId, amount, branchId, agencyId, passengers, arrivalDate = null, metadata = {}) {
        if (!amount || amount <= 0) return;

        try {
            // Obtener fecha de la llegada si no se proporciona
            let costDate = arrivalDate;
            if (!costDate && arrivalId) {
                const arrival = await DB.get('agency_arrivals', arrivalId);
                if (arrival && arrival.date) {
                    costDate = arrival.date;
                }
            }
            if (!costDate) {
                costDate = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            }
            
            // Verificar si ya existe un costo para esta llegada para evitar duplicados
            // ESTRATEGIA: Buscar de más específico a menos específico
            const allCosts = await DB.getAll('cost_entries') || [];
            const dateStr = costDate ? costDate.split('T')[0] : null; // Normalizar fecha
            
            let existingCost = null;
            
            // 1. Buscar por arrival_id PRIMERO (más específico y confiable)
            if (arrivalId) {
                existingCost = allCosts.find(c => 
                    c.category === 'pago_llegadas' && 
                    c.arrival_id === arrivalId
                );
            }
            
            // 2. Si no se encuentra por arrival_id, buscar por fecha, agencia, sucursal y monto
            // (para evitar duplicados cuando se crean llegadas con IDs diferentes o se sincronizan)
            if (!existingCost && dateStr && agencyId && branchId) {
                existingCost = allCosts.find(c => {
                    if (c.category !== 'pago_llegadas') return false;
                    if (c.agency_id !== agencyId) return false;
                    if (c.branch_id !== branchId) return false;
                    
                    // Comparar fechas (normalizadas)
                    const cDateStr = c.date ? c.date.split('T')[0] : null;
                    if (cDateStr !== dateStr) return false;
                    
                    // Comparar montos (con tolerancia de 0.01 para errores de redondeo)
                    if (Math.abs((c.amount || 0) - amount) >= 0.01) return false;
                    
                    return true;
                });
            }
            
            // 3. Si aún no se encuentra, buscar por fecha, agencia y sucursal (sin monto)
            // (para casos donde el monto puede haber cambiado pero es la misma llegada)
            if (!existingCost && dateStr && agencyId && branchId && arrivalId) {
                // Solo hacer esta búsqueda más amplia si tenemos arrival_id
                // para evitar falsos positivos
                existingCost = allCosts.find(c => {
                    if (c.category !== 'pago_llegadas') return false;
                    if (c.agency_id !== agencyId) return false;
                    if (c.branch_id !== branchId) return false;
                    
                    const cDateStr = c.date ? c.date.split('T')[0] : null;
                    if (cDateStr !== dateStr) return false;
                    
                    // Si el costo existente no tiene arrival_id, actualizarlo
                    if (!c.arrival_id && arrivalId) {
                        return true; // Encontrado, se actualizará con arrival_id
                    }
                    
                    return false;
                });
            }
            
            if (existingCost) {
                // Costo existente encontrado - actualizar o mantener según corresponda
                let needsUpdate = false;
                
                // 1. Actualizar arrival_id si no lo tiene (importante para futuras búsquedas)
                if (!existingCost.arrival_id && arrivalId) {
                    existingCost.arrival_id = arrivalId;
                    needsUpdate = true;
                }
                
                // 2. Actualizar monto si es diferente (con tolerancia de 0.01)
                const amountDiff = Math.abs((existingCost.amount || 0) - amount);
                if (amountDiff > 0.01) {
                    existingCost.amount = amount;
                    existingCost.updated_at = new Date().toISOString();
                    needsUpdate = true;
                    console.log(`✅ Costo de llegada actualizado: $${amount.toFixed(2)} (antes: $${(existingCost.amount || 0).toFixed(2)}) para llegada ${arrivalId || 'N/A'}`);
                }
                
                // 3. Actualizar pasajeros si es diferente
                if (passengers && existingCost.passengers !== passengers) {
                    existingCost.passengers = passengers;
                    existingCost.notes = `Pago llegadas ${existingCost.notes?.split(' - ')[0] || 'Agencia'} - ${passengers} pasajeros`;
                    needsUpdate = true;
                }

                // 4. Actualizar metadata de llegada si viene disponible
                const metadataFields = ['guide_id', 'guide_name', 'unit_type', 'units', 'agency_name'];
                metadataFields.forEach(field => {
                    if (metadata[field] !== undefined && metadata[field] !== null && existingCost[field] !== metadata[field]) {
                        existingCost[field] = metadata[field];
                        needsUpdate = true;
                    }
                });

                if (metadata.notes && existingCost.notes !== metadata.notes) {
                    existingCost.notes = metadata.notes;
                    needsUpdate = true;
                }
                
                // Guardar actualización si es necesaria
                if (needsUpdate) {
                    await DB.put('cost_entries', existingCost);
                    if (typeof SyncManager !== 'undefined') {
                        await SyncManager.addToQueue('cost_entry', existingCost.id);
                    }
                } else {
                    console.log(`ℹ️ Costo de llegada ya existe (duplicado evitado): $${amount.toFixed(2)} para llegada ${arrivalId || 'N/A'}`);
                }
                
                // Siempre retornar para evitar crear duplicado
                return;
            }
            
            const agency = await DB.get('catalog_agencies', agencyId);
            const agencyName = agency?.name || 'Desconocida';

            const cost = {
                id: Utils.generateId(),
                type: 'variable',
                category: 'pago_llegadas',
                amount: amount,
                branch_id: branchId,
                arrival_id: arrivalId,
                agency_id: agencyId,
                agency_name: metadata.agency_name || null,
                guide_id: metadata.guide_id || null,
                guide_name: metadata.guide_name || null,
                passengers: passengers,
                units: metadata.units || null,
                unit_type: metadata.unit_type || null,
                date: costDate,
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: metadata.notes || `Pago llegadas ${agencyName} - ${passengers || 0} pasajeros`,
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            // SINCRONIZACIÓN BIDIRECCIONAL: Guardar en ambos lados (Backend y Frontend)
            let savedWithAPI = false;
            if (typeof API !== 'undefined' && API.baseURL && API.token) {
                try {
                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                    
                    // Sanitizar branch_id y agency_id antes de enviar
                    const payload = { ...cost };
                    if (payload.branch_id && !isUUID(payload.branch_id)) {
                        payload.branch_id = null;
                    }
                    if (payload.agency_id && !isUUID(payload.agency_id)) {
                        payload.agency_id = null;
                    }
                    
                    console.log('💰 Registrando pago de llegada en servidor...');
                    const createdCost = await API.createCost(payload);
                    // Si el servidor generó un ID diferente, actualizar el local
                    if (createdCost && createdCost.id && createdCost.id !== cost.id) {
                        console.log(`🔄 Actualizando ID local: ${cost.id} → ${createdCost.id}`);
                        await DB.delete('cost_entries', cost.id);
                        cost.id = createdCost.id;
                    }
                    Object.assign(cost, createdCost);
                    // Preservar branch_id si el servidor devolvió null (p.ej. por sanitización de UUID)
                    if ((createdCost?.branch_id == null || createdCost?.branch_id === '') && branchId) {
                        cost.branch_id = branchId;
                    }
                    savedWithAPI = true;
                    console.log('✅ Pago de llegada registrado en servidor');
                } catch (apiError) {
                    console.warn('⚠️ Error registrando pago de llegada en servidor (continuando con modo local):', apiError);
                    // Continuar con guardado local aunque falle el backend
                }
            }

            // GUARDAR EN INDEXEDDB (siempre, para sincronización bidireccional)
            await DB.put('cost_entries', cost, { autoBranchId: false });
            console.log('✅ Pago de llegada guardado en IndexedDB');
            
            // Agregar a cola de sincronización (siempre, para otros clientes)
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('cost_entry', cost.id);
                } catch (syncError) {
                    console.error('Error agregando cost_entry a cola:', syncError);
                }
            }
        } catch (e) {
            console.error('Error registering arrival payment:', e);
        }
    },

    /**
     * Generar costos de nómina semanal automáticamente
     * @param {string} branchId - ID de la sucursal
     * @param {Date} weekDate - Fecha de la semana
     */
    async generateWeeklyPayroll(branchId, weekDate = new Date()) {
        try {
            // Verificar si ya existe nómina para esta semana
            const weekStart = new Date(weekDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Domingo
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6); // Sábado

            const weekStartStr = Utils.formatDate(weekStart, 'YYYY-MM-DD');
            const weekEndStr = Utils.formatDate(weekEnd, 'YYYY-MM-DD');

            const existingPayroll = await DB.getAll('cost_entries') || [];
            const hasPayroll = existingPayroll.some(c => 
                c.category === 'nomina' && 
                c.branch_id === branchId &&
                c.period_type === 'weekly' &&
                c.recurring === true &&
                c.auto_generate === true &&
                c.date >= weekStartStr &&
                c.date <= weekEndStr
            );

            if (hasPayroll) {
                return; // Ya existe nómina para esta semana
            }

            // Obtener empleados de la sucursal
            const employees = await DB.getAll('employees') || [];
            const branchEmployees = employees.filter(e => 
                e.branch_id === branchId && 
                e.active && 
                e.salary && 
                e.salary > 0
            );

            if (branchEmployees.length === 0) {
                return; // No hay empleados con salario
            }

            // Calcular total de nómina semanal
            const weeklyTotal = branchEmployees.reduce((sum, emp) => {
                const monthlySalary = emp.salary || 0;
                const weeklySalary = monthlySalary / 4.33; // Aproximación semanal
                return sum + weeklySalary;
            }, 0);

            if (weeklyTotal <= 0) return;

            const employeeNames = branchEmployees.map(e => e.name).join(', ');

            const cost = {
                id: Utils.generateId(),
                type: 'fijo',
                category: 'nomina',
                amount: Math.round(weeklyTotal * 100) / 100, // Redondear a 2 decimales
                branch_id: branchId,
                date: weekStartStr,
                period_type: 'weekly',
                recurring: true,
                auto_generate: true,
                notes: `Nómina semanal automática: ${employeeNames}`,
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
            }

            // Emitir evento de actualización de costo
            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('cost-updated', { cost, isNew: true });
            }

            console.log(`✅ Nómina semanal generada para sucursal ${branchId}: ${Utils.formatCurrency(weeklyTotal)}`);
            return cost.id;
        } catch (e) {
            console.error('Error generating weekly payroll:', e);
            throw e;
        }
    },

    /**
     * Generar nómina semanal para todas las sucursales activas
     * Se ejecuta automáticamente al inicio de cada semana
     */
    async generateAllWeeklyPayrolls() {
        try {
            const branches = await DB.getAll('catalog_branches') || [];
            const activeBranches = branches.filter(b => b.active);
            
            let generated = 0;
            for (const branch of activeBranches) {
                try {
                    const costId = await this.generateWeeklyPayroll(branch.id);
                    if (costId) generated++;
                } catch (error) {
                    console.error(`Error generando nómina para ${branch.name}:`, error);
                }
            }
            
            if (generated > 0) {
                console.log(`✅ Nómina semanal generada para ${generated} sucursal(es)`);
            }
            return generated;
        } catch (e) {
            console.error('Error generating all weekly payrolls:', e);
            return 0;
        }
    },

    setupSocketListeners() {
        // Escuchar eventos Socket.IO para actualización en tiempo real
        // Eventos de costos de todas las sucursales (master_admin)
        if (typeof UserManager !== 'undefined' && UserManager.currentUser?.is_master_admin) {
            window.addEventListener('cost-updated-all-branches', async (e) => {
                const { branchId, action, cost } = e.detail || {};
                if (!this.initialized) return;
                const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
                if (activeTab !== 'costs') return;
                console.log(`💵 Costs: Costo actualizado en sucursal ${branchId} (${action})`);
                // Para deletes: actualizar DOM sin recargar pestaña (evita área vacía/parpadeo)
                if (action === 'deleted' && cost?.id) {
                    this.removeCostFromDOM(cost.id, cost.amount || 0);
                    return;
                }
                setTimeout(async () => await this.loadTab(activeTab), 300);
            });
        }
        
        // Eventos de costos locales (para usuarios normales o master_admin viendo su sucursal)
        window.addEventListener('cost-updated', async (e) => {
            if (!this.initialized) return;
            const { action, cost } = e.detail || {};
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            if (!cost || (currentBranchId && cost.branch_id !== currentBranchId)) return;
            const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
            if (activeTab !== 'costs') return;
            console.log(`💵 Costs: Costo actualizado localmente (${action})`);
            // Para deletes: actualizar DOM sin recargar pestaña (evita área vacía/parpadeo)
            if (action === 'deleted' && cost.id) {
                this.removeCostFromDOM(cost.id, cost.amount || 0);
                return;
            }
            setTimeout(async () => await this.loadTab(activeTab), 300);
        });
    },

    async showAddForm(costId = null) {
        const cost = costId ? await DB.get('cost_entries', costId) : null;
        const isEdit = !!cost;
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin
        );

        UI.showModal({
            title: isEdit ? 'Editar Costo' : 'Nuevo Costo',
            content: `
                <form id="cost-form" class="cost-form">
                    <div class="form-section">
                        <h3>Información Básica</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Tipo *</label>
                                <select id="cost-type" class="form-select" required>
                                    <option value="variable" ${cost?.type === 'variable' ? 'selected' : ''}>Variable</option>
                                    <option value="fijo" ${cost?.type === 'fijo' ? 'selected' : ''}>Fijo</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Categoría *</label>
                                <select id="cost-category" class="form-select" required>
                                    <option value="">Seleccionar...</option>
                                    <option value="luz" ${cost?.category === 'luz' ? 'selected' : ''}>Luz</option>
                                    <option value="agua" ${cost?.category === 'agua' ? 'selected' : ''}>Agua</option>
                                    <option value="renta" ${cost?.category === 'renta' ? 'selected' : ''}>Renta</option>
                                    <option value="nomina" ${cost?.category === 'nomina' ? 'selected' : ''}>Nómina</option>
                                    <option value="comisiones" ${cost?.category === 'comisiones' ? 'selected' : ''}>Comisiones</option>
                                    <option value="despensa" ${cost?.category === 'despensa' ? 'selected' : ''}>Despensa</option>
                                    <option value="linea_amarilla" ${cost?.category === 'linea_amarilla' ? 'selected' : ''}>Línea Amarilla</option>
                                    <option value="licencias" ${cost?.category === 'licencias' ? 'selected' : ''}>Licencias y Permisos</option>
                                    <option value="costo_ventas" ${cost?.category === 'costo_ventas' ? 'selected' : ''}>Costo de Ventas (COGS)</option>
                                    <option value="comisiones_bancarias" ${cost?.category === 'comisiones_bancarias' ? 'selected' : ''}>Comisiones Bancarias</option>
                                    <option value="otros" ${cost?.category === 'otros' ? 'selected' : ''}>Otros</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Monto *</label>
                                <input type="number" id="cost-amount" class="form-input" step="0.01" value="${cost?.amount || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Fecha *</label>
                                <input type="date" id="cost-date" class="form-input" value="${cost?.date || Utils.formatDate(new Date(), 'YYYY-MM-DD')}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Proveedor</label>
                                <select id="cost-supplier" class="form-select">
                                    <option value="">Seleccionar proveedor...</option>
                                </select>
                                <small style="color: var(--color-text-secondary); font-size: 11px;">Proveedor asociado a este costo</small>
                            </div>
                            ${isMasterAdmin ? `
                            <div class="form-group">
                                <label>Sucursal</label>
                                <select id="cost-branch" class="form-select">
                                    <option value="">Seleccionar...</option>
                                </select>
                            </div>
                            ` : ''}
                        </div>
                        <div class="form-group">
                            <label>Notas</label>
                            <textarea id="cost-notes" class="form-input" rows="3" placeholder="Notas adicionales...">${cost?.notes || ''}</textarea>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Configuración Recurrente</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="cost-recurring" ${cost?.recurring ? 'checked' : ''}>
                                Es un costo recurrente
                            </label>
                        </div>
                        <div id="cost-recurring-group" style="display: ${cost?.recurring ? 'block' : 'none'};">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Período</label>
                                    <select id="cost-period-type" class="form-select">
                                        <option value="daily" ${cost?.period_type === 'daily' ? 'selected' : ''}>Diario</option>
                                        <option value="weekly" ${cost?.period_type === 'weekly' ? 'selected' : ''}>Semanal</option>
                                        <option value="monthly" ${cost?.period_type === 'monthly' ? 'selected' : ''}>Mensual</option>
                                        <option value="annual" ${cost?.period_type === 'annual' ? 'selected' : ''}>Anual</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="cost-auto-generate" ${cost?.auto_generate ? 'checked' : ''}>
                                        Auto-generar automáticamente
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            `,
            buttons: [
                { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                { 
                    text: isEdit ? 'Actualizar' : 'Crear', 
                    class: 'btn-primary', 
                    onclick: () => this.saveCost(costId) 
                }
            ]
        });

        // Cargar dropdowns después de mostrar el modal
        setTimeout(async () => {
            await this.loadSupplierDropdown(cost?.supplier_id);
            if (isMasterAdmin) {
                await this.loadBranchDropdown(cost?.branch_id);
            }
            
            // Event listeners para campos recurrentes
            const recurringCheck = document.getElementById('cost-recurring');
            const recurringGroup = document.getElementById('cost-recurring-group');
            if (recurringCheck && recurringGroup) {
                recurringCheck.addEventListener('change', () => {
                    recurringGroup.style.display = recurringCheck.checked ? 'block' : 'none';
                });
            }
        }, 100);
    },

    async loadSupplierDropdown(selectedSupplierId = null) {
        const supplierSelect = document.getElementById('cost-supplier');
        if (!supplierSelect) return;
        
        try {
            let suppliers = await DB.getAll('suppliers') || [];
            if (suppliers.length === 0 && typeof API !== 'undefined' && API.baseURL && API.getSuppliers) {
                try {
                    suppliers = await API.getSuppliers() || [];
                    for (const s of suppliers) { try { await DB.put('suppliers', { ...s, server_id: s.id }); } catch (e) {} }
                } catch (e) { console.warn('Error cargando proveedores:', e); }
            }
            suppliers = suppliers.filter(s => s && (s.status === 'active' || !s.status));
            
            supplierSelect.innerHTML = '<option value="">Seleccionar proveedor...</option>';
            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = `${supplier.code || ''} - ${supplier.name || 'Sin nombre'}`.trim();
                if (selectedSupplierId && supplier.id === selectedSupplierId) {
                    option.selected = true;
                }
                supplierSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando proveedores:', error);
        }
    },

    // Cargar dropdown de proveedores (para filtros)
    async loadSupplierFilterDropdown() {
        const supplierFilter = document.getElementById('cost-supplier-filter');
        if (!supplierFilter) return;
        
        try {
            let suppliers = await DB.getAll('suppliers') || [];
            if (suppliers.length === 0 && typeof API !== 'undefined' && API.baseURL && API.getSuppliers) {
                suppliers = await API.getSuppliers() || [];
                for (const s of suppliers) { try { await DB.put('suppliers', s); } catch (e) {} }
            }
            suppliers = suppliers.filter(s => s && (s.status === 'active' || !s.status));
            
            supplierFilter.innerHTML = '<option value="">Todos los proveedores</option>';
            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = `${supplier.code || ''} - ${supplier.name || 'Sin nombre'}`.trim();
                supplierFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando proveedores para filtro:', error);
        }
    },

    async loadBranchDropdown(selectedBranchId = null) {
        const branchSelect = document.getElementById('cost-branch');
        if (!branchSelect) return;
        
        try {
            const branches = await DB.getAll('catalog_branches') || [];
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            
            branchSelect.innerHTML = '<option value="">Seleccionar...</option>';
            branches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.name || 'Sin nombre';
                if (selectedBranchId && branch.id === selectedBranchId) {
                    option.selected = true;
                } else if (!selectedBranchId && branch.id === currentBranchId) {
                    option.selected = true;
                }
                branchSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando sucursales:', error);
        }
    },

    async saveCost(costId) {
        try {
            const form = document.getElementById('cost-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin
            );

            const costData = {
                type: document.getElementById('cost-type').value,
                category: document.getElementById('cost-category').value,
                amount: parseFloat(document.getElementById('cost-amount').value),
                date: document.getElementById('cost-date').value,
                notes: document.getElementById('cost-notes').value.trim() || null,
                supplier_id: document.getElementById('cost-supplier')?.value || null,
                branch_id: isMasterAdmin ? (document.getElementById('cost-branch')?.value || currentBranchId) : currentBranchId,
                recurring: document.getElementById('cost-recurring')?.checked || false,
                period_type: document.getElementById('cost-period-type')?.value || null,
                auto_generate: document.getElementById('cost-auto-generate')?.checked || false
            };

            // Si hay supplier_id, obtener datos del proveedor
            if (costData.supplier_id) {
                try {
                    const supplier = await DB.get('suppliers', costData.supplier_id);
                    if (supplier) {
                        costData.supplier = supplier.name || null;
                        costData.supplier_code = supplier.code || null;
                    }
                } catch (e) {
                    console.warn('Error obteniendo proveedor:', e);
                }
            }

            let savedCost = null;
            let savedWithAPI = false;

            // Intentar guardar en backend
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token) {
                    if (costId && API.updateCost) {
                        savedCost = await API.updateCost(costId, costData);
                        savedWithAPI = true;
                    } else if (!costId && API.createCost) {
                        savedCost = await API.createCost(costData);
                        savedWithAPI = true;
                    }
                }
            } catch (apiError) {
                console.warn('⚠️ Error guardando en API, guardando localmente:', apiError);
            }

            // Si no se guardó con API, generar ID local
            if (!savedCost) {
                savedCost = {
                    ...costData,
                    id: costId || Utils.generateId(),
                    created_at: costId ? undefined : new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
            } else {
                savedCost = { ...costData, ...savedCost };
            }

            // Guardar en IndexedDB (siempre)
            await DB.put('cost_entries', savedCost);

            // Agregar a cola de sincronización si no se guardó con API
            if (!savedWithAPI && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', savedCost.id);
            }

            UI.closeModal();
            Utils.showNotification(
                costId ? 'Costo actualizado correctamente' : 'Costo creado correctamente',
                'success'
            );
            
            // Recargar la pestaña activa
            const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
            await this.loadTab(activeTab);
        } catch (error) {
            console.error('Error saving cost:', error);
            Utils.showNotification(`Error al guardar costo: ${error.message}`, 'error');
        }
    },

};

window.Costs = Costs;
