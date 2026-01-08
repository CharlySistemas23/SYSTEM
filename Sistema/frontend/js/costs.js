// Costs Module - Gestión Avanzada de Costos

const Costs = {
    initialized: false,
    currentTab: 'costs',
    
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

        // Normalizar branch_id para comparación flexible
        const normalizedBranchId = branchId ? String(branchId).trim() : null;

        // Aplicar filtro de sucursal
        if (normalizedBranchId && normalizedBranchId !== '') {
            // Filtrar por sucursal específica
            costs = costs.filter(c => {
                const costBranchId = c.branch_id ? String(c.branch_id).trim() : null;
                // Si el costo no tiene branch_id, excluirlo cuando se filtra por sucursal específica
                if (!costBranchId) return false;
                return costBranchId === normalizedBranchId;
            });
        } else {
            // Si no hay branchId, mostrar todos los costos (para admin o cuando se selecciona "Todas")
            // No filtrar por sucursal
        }

        if (dateFrom) {
            costs = costs.filter(c => {
                const costDate = c.date || c.created_at;
                return costDate >= dateFrom;
            });
        }
        if (dateTo) {
            costs = costs.filter(c => {
                const costDate = c.date || c.created_at;
                return costDate <= dateTo + 'T23:59:59';
            });
        }
        if (type) {
            costs = costs.filter(c => c.type === type);
        }
        if (category) {
            costs = costs.filter(c => c.category === category);
        }

        return costs;
    },
    
    async init() {
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
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        // Crear estructura de tabs
        content.innerHTML = `
            <div id="costs-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="costs"><i class="fas fa-dollar-sign"></i> Costos</button>
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
                            <option value="costo_ventas">Costo de Ventas (COGS)</option>
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
                <button class="btn-primary btn-sm" id="cost-add-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-plus"></i> Nuevo</button>
                <button class="btn-secondary btn-sm" id="cost-export-btn" style="white-space: nowrap; flex-shrink: 0;"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="costs-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;
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
            const recurringCosts = allCosts.filter(c => c.recurring === true);
            
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
            const branchTotal = branchCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
            
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
                        <div style="font-size: 16px; font-weight: 700;">
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
                                        const costDate = new Date(cost.date || cost.created_at);
                                        const daysInMonth = new Date(costDate.getFullYear(), costDate.getMonth() + 1, 0).getDate();
                                        dailyProrate = (cost.amount || 0) / daysInMonth;
                                    } else if (cost.period_type === 'annual') {
                                        const year = new Date(cost.date || cost.created_at).getFullYear();
                                        const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 366 : 365;
                                        dailyProrate = (cost.amount || 0) / daysInYear;
                                    }

                                    return `
                                        <tr>
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
        document.getElementById('cost-branch-filter')?.addEventListener('change', (e) => {
            // Marcar que el usuario seleccionó manualmente
            if (e.target) {
                e.target.dataset.manualSelection = 'true';
            }
            this.loadCosts();
        });
        document.getElementById('cost-type-filter')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-category-filter')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-date-from')?.addEventListener('change', () => this.loadCosts());
        document.getElementById('cost-date-to')?.addEventListener('change', () => this.loadCosts());

        // Cargar opciones de sucursales en el filtro
        await this.loadBranchFilter();

        try {
        // Obtener sucursal seleccionada en el filtro
        const branchFilter = document.getElementById('cost-branch-filter');
        const branchFilterValue = branchFilter?.value || '';
        
        // Si el filtro está vacío (Todas las sucursales), usar null
        // Si tiene un valor, usar ese valor
        const selectedBranchId = branchFilterValue === '' ? null : branchFilterValue;
            
            const typeFilter = document.getElementById('cost-type-filter')?.value;
            const categoryFilter = document.getElementById('cost-category-filter')?.value;
            const search = document.getElementById('cost-search')?.value.toLowerCase() || '';
            const dateFrom = document.getElementById('cost-date-from')?.value;
            const dateTo = document.getElementById('cost-date-to')?.value;
            
            let costs = await this.getFilteredCosts({
                branchId: selectedBranchId,
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                type: typeFilter || null,
                category: categoryFilter || null
            });

            if (typeFilter) {
                costs = costs.filter(c => c.type === typeFilter);
            }
            if (categoryFilter) {
                costs = costs.filter(c => c.category === categoryFilter);
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

            // Ordenar por fecha descendente
            costs.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

            this.displayCosts(costs);
        } catch (e) {
            console.error('Error loading costs:', e);
            Utils.showNotification('Error al cargar costos', 'error');
        }
    },

    async loadBranchFilter() {
        const branchFilter = document.getElementById('cost-branch-filter');
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
            // Si no hay selección manual, usar la sucursal actual o dejar vacío para ver todas
            branchFilter.value = currentBranchId || '';
            delete branchFilter.dataset.manualSelection;
        }
    },

    async displayCosts(costs) {
        const container = document.getElementById('costs-list');
        if (!container) return;

        if (costs.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay costos registrados</div>';
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
            
            const total = costs.reduce((sum, cost) => sum + (cost.amount || 0), 0);
            
            let html = `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-store"></i> ${branchName}
                        </h3>
                        <div style="font-size: 16px; font-weight: 700;">
                            ${Utils.formatCurrency(total)}
                        </div>
                    </div>
                    <div style="padding: var(--spacing-md);">
                        <div style="display: grid; gap: var(--spacing-sm);">
            `;
            
            costs.forEach(cost => {
                const costDate = Utils.formatDate(cost.date || cost.created_at, 'DD/MM/YYYY');
                html += `
                    <div class="cost-item" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid var(--color-primary);">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${cost.category || 'Sin categoría'}</div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">${costDate} • ${cost.type === 'fijo' ? 'Fijo' : 'Variable'}</div>
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
            
            container.innerHTML = html;
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
            const branchTotal = branchCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
            
            // Ordenar costos por fecha descendente
            branchCosts.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
            
            html += `
                <div class="module" style="margin-bottom: var(--spacing-md); padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); color: white; padding: var(--spacing-md); display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-store"></i> ${branchName}
                        </h3>
                        <div style="font-size: 16px; font-weight: 700;">
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
                                        <tr>
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

        container.innerHTML = html;
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

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const categoryStats = {};

        costs.forEach(cost => {
            const category = cost.category || 'Otros';
            if (!categoryStats[category]) {
                categoryStats[category] = 0;
            }
            categoryStats[category] += cost.amount || 0;
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

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const monthlyStats = {};

        costs.forEach(cost => {
            const costDate = new Date(cost.date || cost.created_at);
            const monthKey = `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = 0;
            }
            monthlyStats[monthKey] += cost.amount || 0;
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

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const variable = costs.filter(c => c.type === 'variable').reduce((sum, c) => sum + (c.amount || 0), 0);
        const fixed = costs.filter(c => c.type === 'fijo').reduce((sum, c) => sum + (c.amount || 0), 0);
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

        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        const branches = await DB.getAll('catalog_branches') || [];
        const branchStats = {};

        costs.forEach(cost => {
            const branchId = cost.branch_id || 'all';
            if (!branchStats[branchId]) {
                branchStats[branchId] = 0;
            }
            branchStats[branchId] += cost.amount || 0;
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
        const costs = await this.getFilteredCosts({ branchId: currentBranchId });
        
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        const sales = await DB.getAll('sales', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        const completedSales = sales.filter(s => s.status === 'completada');

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

        const totalCosts = costs.reduce((sum, c) => sum + (c.amount || 0), 0);
        const variableCosts = costs.filter(c => c.type === 'variable').reduce((sum, c) => sum + (c.amount || 0), 0);
        const fixedCosts = costs.filter(c => c.type === 'fijo').reduce((sum, c) => sum + (c.amount || 0), 0);
        const thisMonthTotal = thisMonth.reduce((sum, c) => sum + (c.amount || 0), 0);
        const lastMonthTotal = lastMonth.reduce((sum, c) => sum + (c.amount || 0), 0);
        const monthChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;

        // Promedio mensual últimos 6 meses
        const monthlyStats = {};
        costs.forEach(cost => {
            const costDate = new Date(cost.date || cost.created_at);
            const monthKey = `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = 0;
            }
            monthlyStats[monthKey] += cost.amount || 0;
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
            const costs = await this.getFilteredCosts({ branchId: currentBranchId });
            
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const completedSales = sales.filter(s => s.status === 'completada');

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

            const totalCosts = filteredCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
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
                    categoryAnalysis[category].variable += cost.amount || 0;
                } else {
                    categoryAnalysis[category].fijo += cost.amount || 0;
                }
                categoryAnalysis[category].total += cost.amount || 0;
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
                
                const realTotal = realCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
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
                monthlyStats[monthKey] += cost.amount || 0;
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

        const cost = {
            id: costId || Utils.generateId(),
            type: document.getElementById('cost-type').value,
            category: document.getElementById('cost-category').value,
            amount: parseFloat(document.getElementById('cost-amount').value),
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
            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
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

    async deleteCost(costId) {
        if (!await Utils.confirm('¿Eliminar este costo?')) return;

        try {
            const cost = await DB.get('cost_entries', costId);
            if (!cost) {
                Utils.showNotification('Costo no encontrado', 'error');
                return;
            }
            
            // Guardar metadata del costo antes de eliminarlo para sincronización
            const costMetadata = {
                id: cost.id,
                type: cost.type,
                category: cost.category,
                branch_id: cost.branch_id,
                deleted_at: new Date().toISOString()
            };
            
            // Agregar a cola de sincronización ANTES de eliminar
            if (typeof SyncManager !== 'undefined') {
                try {
                    await DB.add('sync_deleted_items', {
                        id: costId,
                        entity_type: 'cost_entry',
                        metadata: costMetadata,
                        deleted_at: new Date().toISOString()
                    });
                    await SyncManager.addToQueue('cost_entry', costId, 'delete');
                } catch (syncError) {
                    console.error('Error guardando metadata para sincronización:', syncError);
                }
            }
            
            // Eliminar el costo de la base de datos
            try {
                await DB.delete('cost_entries', costId);
                
                // Verificar que realmente se eliminó
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
                return;
            }
            
            Utils.showNotification('Costo eliminado', 'success');
            await this.loadCosts();
        } catch (e) {
            console.error('Error eliminando costo:', e);
            Utils.showNotification('Error al eliminar costo: ' + e.message, 'error');
        }
    },

    async exportCosts() {
        try {
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const costs = await this.getFilteredCosts({ branchId: currentBranchId });
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
            if (!format) return;
            
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
            const cost = {
                id: Utils.generateId(),
                type: type,
                category: category,
                amount: amount,
                branch_id: branch_id || (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null),
                date: date || Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: notes || description,
                created_at: new Date().toISOString(),
                sync_status: 'pending',
                ...extraFields
            };

            await DB.put('cost_entries', cost);
            await SyncManager.addToQueue('cost_entry', cost.id);
            
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

    async registerArrivalPayment(arrivalId, amount, branchId, agencyId, passengers) {
        if (!amount || amount <= 0) return;

        try {
            const agency = await DB.get('catalog_agencies', agencyId);
            const agencyName = agency?.name || 'Desconocida';

            const cost = {
                id: Utils.generateId(),
                type: 'variable',
                category: 'pago_llegadas',
                amount: amount,
                branch_id: branchId,
                date: Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                period_type: 'one_time',
                recurring: false,
                auto_generate: true,
                notes: `Pago llegadas ${agencyName} - ${passengers} pasajeros`,
                arrival_id: arrivalId,
                agency_id: agencyId,
                passengers: passengers,
                created_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('cost_entries', cost);
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('cost_entry', cost.id);
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
    }
};

window.Costs = Costs;
