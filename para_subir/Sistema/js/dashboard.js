// Dashboard Module - Versión Avanzada

const Dashboard = {
    initialized: false,
    isExporting: false, // Flag para prevenir múltiples exportaciones simultáneas
    viewAllBranches: false, // Flag para vista consolidada
    autoRefreshInterval: null, // Intervalo para actualización automática
    isLoading: false,
    pendingLoad: false,
    nextAllowedLoadAt: 0,
    loadCooldownMs: 10000,

    safePercent(val) {
        const n = parseFloat(val);
        return (Number.isFinite(n) ? n : 0).toFixed(1);
    },

    async init() {
        try {
            // Verificar permiso
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('dashboard.view')) {
                const content = document.getElementById('module-content');
                if (content) {
                    content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver el dashboard</div>';
                }
                return;
            }

            if (this.initialized) return;
            await this.loadDashboard(this.viewAllBranches);
            this.setupEventBusListeners();
            this.setupAutoRefresh();
            this.initialized = true;
            
            // Escuchar cambios de sucursal para recargar datos
            window.addEventListener('branch-changed', async () => {
                if (this.initialized) {
                    await this.loadDashboard(this.viewAllBranches);
                }
            });
        } catch (error) {
            console.error('❌ Error inicializando módulo Dashboard:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Dashboard</h3>
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
    
    setupAutoRefresh() {
        // Limpiar intervalo anterior si existe
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        // Actualizar métricas cada 30 segundos desde el servidor
        this.autoRefreshInterval = setInterval(async () => {
            if (this.initialized && typeof API !== 'undefined' && API.baseURL && API.token) {
                try {
                    console.log('🔄 Dashboard: Actualización automática de métricas...');
                    await this.loadDashboard(this.viewAllBranches);
                } catch (error) {
                    console.warn('Error en actualización automática del dashboard:', error);
                }
            }
        }, 30000); // 30 segundos
        
        // Limpiar intervalo cuando se desmonte el módulo
        window.addEventListener('beforeunload', () => {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
            }
        });
    },

    setupEventBusListeners() {
        // Escuchar eventos para actualización en tiempo real
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            // Actualizar cuando hay una venta completada
            Utils.EventBus.on('sale-completed', async (data) => {
                if (this.initialized) {
                    // Recargar dashboard después de un pequeño delay
                    setTimeout(async () => {
                        await this.loadDashboard(this.viewAllBranches);
                    }, 500);
                }
            });

            // Actualizar cuando hay cambios en inventario
            Utils.EventBus.on('inventory-updated', async (data) => {
                if (this.initialized) {
                    setTimeout(async () => {
                        await this.loadDashboard(this.viewAllBranches);
                    }, 500);
                }
            });

            // Actualizar cuando hay cambios en costos
            Utils.EventBus.on('cost-updated', async (data) => {
                if (this.initialized) {
                    setTimeout(async () => {
                        await this.loadDashboard(this.viewAllBranches);
                    }, 500);
                }
            });

            // Actualizar cuando hay reparaciones completadas
            Utils.EventBus.on('repair-completed', async (data) => {
                if (this.initialized) {
                    setTimeout(async () => {
                        await this.loadDashboard(this.viewAllBranches);
                    }, 500);
                }
            });

            // Actualizar cuando hay transferencias completadas
            Utils.EventBus.on('transfer-completed', async (data) => {
                if (this.initialized) {
                    setTimeout(async () => {
                        await this.loadDashboard(this.viewAllBranches);
                    }, 500);
                }
            });
        }

        // Eventos por sucursal: reparaciones, clientes, transferencias, proveedores (todos los usuarios)
        const refreshDashboardIfBranchMatch = (e) => {
            if (!this.initialized) return;
            const { branchId } = e.detail || {};
            const currentBranchId = BranchManager?.getCurrentBranchId();
            if (!currentBranchId || branchId === currentBranchId || UserManager.currentUser?.is_master_admin) {
                setTimeout(async () => {
                    await this.loadDashboard(this.viewAllBranches);
                }, 300);
            }
        };
        window.addEventListener('repair-updated', refreshDashboardIfBranchMatch);
        window.addEventListener('customer-updated', refreshDashboardIfBranchMatch);
        window.addEventListener('transfer-updated', refreshDashboardIfBranchMatch);
        window.addEventListener('supplier-updated', refreshDashboardIfBranchMatch);

        // Escuchar eventos Socket.IO de todas las sucursales (solo para master admin)
        if (UserManager.currentUser?.is_master_admin) {
            // Eventos de inventario de todas las sucursales
            window.addEventListener('inventory-updated-all-branches', async (e) => {
                const { branchId, action, item } = e.detail;
                if (this.initialized) {
                    console.log(`🔄 Dashboard: Actualizando por cambio de inventario en sucursal ${branchId} (${action})`);
                    
                    // Si está en vista consolidada, actualizar todo
                    if (this.viewAllBranches) {
                        setTimeout(async () => {
                            await this.loadDashboard(true);
                        }, 300);
                    } else {
                        // Si está viendo una sucursal específica y el cambio es de esa sucursal, actualizar
                        const currentBranchId = BranchManager?.getCurrentBranchId();
                        if (branchId === currentBranchId) {
                            setTimeout(async () => {
                                await this.loadDashboard(false);
                            }, 300);
                        }
                    }
                }
            });

            // Eventos de ventas de todas las sucursales
            window.addEventListener('sale-updated-all-branches', async (e) => {
                const { branchId, action, sale } = e.detail;
                if (this.initialized) {
                    console.log(`💰 Dashboard: Actualizando por venta en sucursal ${branchId} (${action})`);
                    
                    // Si está en vista consolidada, actualizar todo
                    if (this.viewAllBranches) {
                        setTimeout(async () => {
                            await this.loadDashboard(true);
                        }, 300);
                    } else {
                        // Si está viendo una sucursal específica y el cambio es de esa sucursal, actualizar
                        const currentBranchId = BranchManager?.getCurrentBranchId();
                        if (branchId === currentBranchId) {
                            setTimeout(async () => {
                                await this.loadDashboard(false);
                            }, 300);
                        }
                    }
                }
            });
            
            // También escuchar eventos de ventas normales (para usuarios no master_admin)
            window.addEventListener('sale-updated', async (e) => {
                if (this.initialized && !this.viewAllBranches) {
                    const { sale } = e.detail || {};
                    const currentBranchId = BranchManager?.getCurrentBranchId();
                    if (sale && sale.branch_id === currentBranchId) {
                        console.log(`💰 Dashboard: Actualizando por venta local`);
                        setTimeout(async () => {
                            await this.loadDashboard(false);
                        }, 300);
                    }
                }
            });
            
            // Escuchar eventos de inventario normales también
            window.addEventListener('inventory-updated', async (e) => {
                if (this.initialized && !this.viewAllBranches) {
                    const { item } = e.detail || {};
                    const currentBranchId = BranchManager?.getCurrentBranchId();
                    if (item && item.branch_id === currentBranchId) {
                        console.log(`📦 Dashboard: Actualizando por inventario local`);
                        setTimeout(async () => {
                            await this.loadDashboard(false);
                        }, 300);
                    }
                }
            });

            // Eventos de reparaciones
            window.addEventListener('repair-updated-all-branches', async (e) => {
                const { branchId, action } = e.detail;
                if (this.initialized && this.viewAllBranches) {
                    setTimeout(async () => {
                        await this.loadDashboard(true);
                    }, 300);
                }
            });

            // Eventos de clientes
            window.addEventListener('customer-updated-all-branches', async (e) => {
                const { branchId, action } = e.detail;
                if (this.initialized && this.viewAllBranches) {
                    setTimeout(async () => {
                        await this.loadDashboard(true);
                    }, 300);
                }
            });

            // Eventos de transferencias
            window.addEventListener('transfer-updated-all-branches', async (e) => {
                const { branchId, action } = e.detail;
                if (this.initialized && this.viewAllBranches) {
                    setTimeout(async () => {
                        await this.loadDashboard(true);
                    }, 300);
                }
            });

            // Eventos de costos
            window.addEventListener('cost-updated-all-branches', async (e) => {
                const { branchId, action } = e.detail;
                if (this.initialized && this.viewAllBranches) {
                    setTimeout(async () => {
                        await this.loadDashboard(true);
                    }, 300);
                }
            });
        }
    },

    async setupBranchFilter() {
        const branchFilterContainer = document.getElementById('dashboard-branch-filter-container');
        const branchFilter = document.getElementById('dashboard-branch-filter');
        if (!branchFilterContainer || !branchFilter) return;

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

        // Si NO es master_admin, ocultar el dropdown
        if (!isMasterAdmin) {
            branchFilterContainer.style.display = 'none';
            // Forzar el filtro a la sucursal del usuario
            if (currentBranchId) {
                branchFilter.value = currentBranchId;
            }
        } else {
            // Master admin puede ver todas las sucursales
            branchFilterContainer.style.display = 'block';
            let branches = await DB.getAll('catalog_branches') || [];
            // Eliminar duplicados: si hay múltiples sucursales con el mismo nombre "Sucursal Principal", 
            // mantener solo la primera y eliminar las demás
            const seenNames = new Set();
            const seenIds = new Set();
            branches = branches.filter(b => {
                if (!b || !b.id || !b.name) return false;
                if (b.name === 'Sucursal Principal' && seenNames.has('Sucursal Principal')) {
                    return false; // Excluir duplicados de "Sucursal Principal"
                }
                if (seenIds.has(b.id)) {
                    return false; // Excluir duplicados por ID
                }
                seenNames.add(b.name);
                seenIds.add(b.id);
                return true;
            });
            branchFilter.innerHTML = '<option value="all">Todas las sucursales</option>' + 
                branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            // Establecer valor por defecto según sucursal actual
            if (currentBranchId) {
                branchFilter.value = currentBranchId;
            } else {
                branchFilter.value = 'all';
            }
            // Remover listeners previos y agregar uno nuevo (evitar duplicados)
            if (this._branchFilterChangeHandler) {
                branchFilter.removeEventListener('change', this._branchFilterChangeHandler);
            }
            this._branchFilterChangeHandler = async () => {
                console.log('🔄 Dashboard: Cambio de sucursal desde dropdown:', branchFilter.value);
                // Recargar dashboard con el nuevo filtro
                await this.loadDashboard();
            };
            branchFilter.addEventListener('change', this._branchFilterChangeHandler);
        }
        
        // Escuchar cambios de sucursal desde el header para sincronizar el dropdown
        // Remover listener anterior si existe para evitar duplicados
        if (this._branchChangedListener) {
            window.removeEventListener('branch-changed', this._branchChangedListener);
        }
        
        this._branchChangedListener = async (e) => {
            const updatedFilter = document.getElementById('dashboard-branch-filter');
            if (updatedFilter && e.detail && e.detail.branchId) {
                console.log(`🔄 Dashboard: Sincronizando dropdown con sucursal del header: ${e.detail.branchId}`);
                // CRÍTICO: Actualizar el dropdown PRIMERO, luego recargar
                updatedFilter.value = e.detail.branchId;
                // Pequeño delay para asegurar que el DOM se actualizó
                await new Promise(resolve => setTimeout(resolve, 50));
                // Recargar dashboard con el nuevo filtro
                await this.loadDashboard();
            }
        };
        window.addEventListener('branch-changed', this._branchChangedListener);
    },
    
    async loadDashboard(showAllBranches = false) {
        const now = Date.now();
        if (this.isLoading) {
            this.pendingLoad = true;
            return;
        }
        if (now < this.nextAllowedLoadAt) {
            return;
        }

        this.isLoading = true;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // Usar fecha local para que "hoy" y los filtros coincidan con el día del usuario (evitar UTC)
            const todayStr = typeof Utils !== 'undefined' && Utils.formatDate
                ? Utils.formatDate(today, 'YYYY-MM-DD')
                : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            
            // Verificar si es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener sucursal actual
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || null;
            
            // Configurar el filtro de sucursal primero si es master_admin (para asegurar que el dropdown esté disponible)
            if (isMasterAdmin) {
                await this.setupBranchFilter();
            }
            
            // Obtener filtro de sucursal del dropdown
            const branchFilterEl = document.getElementById('dashboard-branch-filter');
            const branchFilterValue = branchFilterEl?.value;
            
            // Determinar qué branch_id usar para el filtro
            let filterBranchId = null;
            let viewAllBranches = false;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                // Hay un filtro específico seleccionado
                filterBranchId = branchFilterValue;
                viewAllBranches = false;
            } else if (isMasterAdmin && (!branchFilterValue || branchFilterValue === 'all')) {
                // Master admin sin filtro = mostrar todas
                filterBranchId = null;
                viewAllBranches = true;
            } else {
                // Usuario normal o master_admin con sucursal actual = filtrar por currentBranchId
                filterBranchId = currentBranchId;
                viewAllBranches = false;
            }
            
            // Actualizar flag interno
            this.viewAllBranches = viewAllBranches;
            
            console.log(`[Dashboard] Vista consolidada: ${viewAllBranches} (Master Admin: ${isMasterAdmin}, Filtro: ${filterBranchId || 'todas'})`);
            
            const branchId = filterBranchId;
            
            let allSales = [];
            let todayArrivals = [];
            let todayPassengers = 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getDashboardMetrics;
            
            // CACHE-FIRST: leer de IndexedDB primero para mostrar al instante
            allSales = await DB.getAll('sales', null, null, { filterByBranch: !viewAllBranches, branchIdField: 'branch_id' }) || [];
            const arrivalsRaw = await DB.query('agency_arrivals', 'date', todayStr, { filterByBranch: false }) || [];
            todayArrivals = arrivalsRaw.filter(a => {
                if (!viewAllBranches && filterBranchId) {
                    if (!a.branch_id) return false;
                    return String(a.branch_id) === String(filterBranchId);
                }
                return (a.passengers > 0 && a.units > 0) || !viewAllBranches;
            });
            todayPassengers = todayArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            const hasCache = allSales.length > 0 || todayArrivals.length > 0;
            
            if (hasCache) {
                console.log(`⚡ [Cache-First] Dashboard: ${allSales.length} ventas, ${todayPassengers} pasajeros desde IndexedDB`);
            }
            
            if (hasApi) {
                Promise.resolve().then(async () => {
                    try {
                        const branchIdForAPI = viewAllBranches ? null : (filterBranchId || null);
                        const metrics = await API.getDashboardMetrics({ branch_id: branchIdForAPI, date: todayStr });
                        const freshSales = metrics.sales || [];
                        const freshArrivals = metrics.arrivals || [];
                        for (const sale of freshSales) { try { await DB.put('sales', sale); } catch (e) {} }
                        for (const arrival of freshArrivals) { try { await DB.put('agency_arrivals', arrival); } catch (e) {} }
                        // Evitar recursión: este sync corre dentro de loadDashboard().
                        // Recargar aquí puede entrar en bucle (cache local histórica vs respuesta parcial de API).
                        // Los cambios frescos se reflejan por auto-refresh/eventos o próxima navegación.
                    } catch (e) {
                        console.warn('Sync dashboard background:', e);
                        this.nextAllowedLoadAt = Date.now() + this.loadCooldownMs;
                    }
                }).catch(e => {
                    console.warn('Sync dashboard background:', e);
                    this.nextAllowedLoadAt = Date.now() + this.loadCooldownMs;
                });
            }
            
            if (!hasCache && hasApi) {
                try {
                    const branchIdForAPI = viewAllBranches ? null : (filterBranchId || null);
                    const metrics = await API.getDashboardMetrics({ branch_id: branchIdForAPI, date: todayStr });
                    allSales = metrics.sales || [];
                    todayArrivals = metrics.arrivals || [];
                    todayPassengers = metrics.totalPassengers || 0;
                    for (const sale of allSales) { try { await DB.put('sales', sale); } catch (e) {} }
                    for (const arrival of todayArrivals) { try { await DB.put('agency_arrivals', arrival); } catch (e) {} }
                    console.log(`✅ Métricas cargadas desde API: ${allSales.length} ventas, ${todayPassengers} pasajeros`);
                } catch (apiError) {
                    console.warn('⚠️ Error cargando métricas desde API:', apiError);
                    this.nextAllowedLoadAt = Date.now() + this.loadCooldownMs;
                }
            }
            
            // Filtrar ventas completadas (aceptar tanto 'completed' como 'completada')
            const completedSales = allSales.filter(s =>
                (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completed' || s.status === 'completada' || s.status === 'completado'))
            );
            
            // Todas las ventas de hoy por fecha local (mismo día calendario) — sin límite de cantidad
            const todaySales = completedSales.filter(s => {
                if (!s.created_at) return false;
                const saleDate = new Date(s.created_at);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate
                    ? Utils.formatDate(saleDate, 'YYYY-MM-DD')
                    : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr;
            });
            const thisMonthSales = completedSales.filter(s => {
                const saleDate = new Date(s.created_at);
                return saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear();
            });
            const lastMonthSales = completedSales.filter(s => {
                const saleDate = new Date(s.created_at);
                const lastMonth = new Date(today);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                return saleDate.getMonth() === lastMonth.getMonth() && saleDate.getFullYear() === lastMonth.getFullYear();
            });
            
            // Total del día = suma de TODAS las ventas del día (Utils.getSaleTotal unifica y evita strings)
            const todayTotal = todaySales.reduce((sum, s) => sum + (typeof Utils !== 'undefined' && Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            const todayTickets = todaySales.length;
            const exchangeRateUsd = parseFloat((await DB.get('settings', 'exchange_rate_usd'))?.value || '20.00');
            // Ticket promedio: si hay pasajeros, por pasajero (USD); si no, por venta (MXN)
            const avgTicket = todayPassengers > 0
                ? todayTotal / todayPassengers / exchangeRateUsd
                : (todayTickets > 0 ? todayTotal / todayTickets : 0);
            // % de Cierre = (Ventas / Pasajeros)*100 si hay pasajeros; si no, N/A (0)
            const closeRate = todayPassengers > 0 ? (todayTickets / todayPassengers) * 100 : 0;
            
            // Obtener utilidad diaria usando ProfitCalculator (centralizado)
            let dailyProfit = null;
            try {
                const normalizeBranch = (v) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId ? Utils.normalizeBranchId(v) : String(v || '').trim().toLowerCase());
                const normCategory = (v) => (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey ? Utils.normalizeCategoryKey(v) : String(v || '').toLowerCase().replace(/\s+/g, '_'));
                // Intentar obtener reporte existente primero
                const profitReports = await DB.query('daily_profit_reports', 'date', todayStr) || [];
                const todayProfit = !viewAllBranches
                    ? profitReports.find(p => normalizeBranch(p.branch_id) === normalizeBranch(branchId) || !p.branch_id)
                    : null; // Vista consolidada: no usar reporte de una sola sucursal
                
                const revenue = (todayProfit?.revenue_sales_total ?? todayProfit?.revenue) || 0;
                const operatingCosts = (todayProfit?.fixed_costs_daily || 0) + (todayProfit?.variable_costs_daily || 0);
                const isReportAnomalous = (revenue === 0 && operatingCosts > 0) ||
                    (revenue > 0 && operatingCosts > revenue * 3);

                if (isReportAnomalous && todayProfit?.id) {
                    try {
                        await DB.delete('daily_profit_reports', todayProfit.id);
                    } catch (e) {
                        console.warn('Error eliminando reporte anómalo:', e);
                    }
                }

                if (todayProfit && !viewAllBranches && !isReportAnomalous) {
                    // Usar reporte existente si está disponible y no es sospechoso
                    dailyProfit = {
                        revenue: todayProfit.revenue_sales_total || todayProfit.revenue || 0,
                        merchandise_cost: todayProfit.cogs_total || 0,
                        arrival_costs: todayProfit.arrivals_total || 0,
                        operating_costs: (todayProfit.fixed_costs_daily || 0) + (todayProfit.variable_costs_daily || 0),
                        commissions: (todayProfit.commissions_sellers_total || 0) + (todayProfit.commissions_guides_total || 0),
                        bank_commissions: todayProfit.bank_commissions || 0,
                        gross_profit: todayProfit.gross_profit || 0,
                        net_profit: todayProfit.profit_before_taxes || todayProfit.net_profit || 0,
                        total_passengers: todayProfit.passengers_total || 0
                    };
                }
                if (!dailyProfit && typeof ProfitCalculator !== 'undefined' && ProfitCalculator.calculateDailyProfit && branchId) {
                    // Calcular usando ProfitCalculator si no hay reporte
                    try {
                        const profitData = await ProfitCalculator.calculateDailyProfit(todayStr, branchId);
                        const calc = profitData.calculations;
                        dailyProfit = {
                            revenue: calc.revenue || 0,
                            merchandise_cost: calc.cogs || 0,
                            arrival_costs: calc.arrivals || 0,
                            operating_costs: (calc.fixedCosts || 0) + (calc.variableCosts || 0),
                            commissions: (calc.commissionsSellers || 0) + (calc.commissionsGuides || 0),
                            bank_commissions: calc.bankCommissions || 0,
                            gross_profit: calc.profit || 0,
                            net_profit: calc.profit || 0,
                            total_passengers: calc.passengers || 0
                        };
                    } catch (error) {
                        console.error('Error calculando utilidad diaria con ProfitCalculator:', error);
                        // Continuar con cálculo manual como fallback
                    }
                }
                
                // Fallback: calcular manualmente si ProfitCalculator no está disponible o falló
                // En vista consolidada, siempre calcular manualmente para agregar todas las sucursales
                if (!dailyProfit && (todaySales.length > 0 || viewAllBranches)) {
                    const saleItems = await DB.getAll('sale_items') || [];
                    const allPayments = await DB.getAll('payments') || [];
                    const inventoryItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || [];
                    let merchandiseCostRealTime = 0;
                    let commissionsRealTime = 0;
                    let bankCommissionsRealTime = 0;
                    const revenueRealTime = todaySales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
                    
                    for (const sale of todaySales) {
                        const items = saleItems.filter(si => si.sale_id === sale.id);
                        for (const item of items) {
                            const unitCost = item.cost != null && item.cost !== '' ? Number(item.cost) : (inventoryItems.find(inv => inv.id === item.item_id)?.cost ?? 0);
                            merchandiseCostRealTime += unitCost * (item.quantity || 1);
                            const commission = (typeof Utils !== 'undefined' && Utils.getSaleItemCommission)
                                ? Utils.getSaleItemCommission(item)
                                : (item.commission_amount ?? (item.guide_commission || 0) + (item.seller_commission || 0));
                            if (commission) commissionsRealTime += Number(commission);
                        }
                        
                        const salePayments = allPayments.filter(p => p.sale_id === sale.id);
                        for (const payment of salePayments) {
                            if (payment.bank_commission) {
                                bankCommissionsRealTime += Number(payment.bank_commission);
                            }
                        }
                    }
                    
                    // Calcular costos de llegadas desde cost_entries (fuente autorizada)
                    let arrivalCostsRealTime = 0;
                    let operatingCostsRealTime = 0;
                    
                    // Asegurar que todayArrivals esté definida y tenga datos
                    if (!todayArrivals || todayArrivals.length === 0) {
                        // Si no está definida o está vacía, obtenerla desde IndexedDB
                        try {
                            const arrivals = await DB.query('agency_arrivals', 'date', todayStr, { 
                                filterByBranch: !viewAllBranches, 
                                branchIdField: 'branch_id' 
                            }) || [];
                            todayArrivals = arrivals.filter(a => 
                                (viewAllBranches || a.branch_id === branchId || !a.branch_id) &&
                                (a.passengers > 0 && a.units > 0)
                            );
                        } catch (e) {
                            console.warn('Error obteniendo llegadas desde IndexedDB:', e);
                            todayArrivals = [];
                        }
                    }
                    
                    if (typeof Costs !== 'undefined') {
                        const todayCosts = await Costs.getFilteredCosts({ 
                            branchId: viewAllBranches ? null : branchId,
                            dateFrom: todayStr,
                            dateTo: todayStr
                        });
                        const isArrivalCost = (cat) => normCategory(cat) === 'pago_llegadas';
                        // Obtener costos de llegadas desde cost_entries
                        const arrivalCostsFromEntries = todayCosts
                            .filter(c => isArrivalCost(c.category))
                            .reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
                        
                        if (arrivalCostsFromEntries > 0) {
                            // Usar costos registrados (fuente autorizada)
                            arrivalCostsRealTime = arrivalCostsFromEntries;
                        } else {
                            // Fallback: calcular desde agency_arrivals si no hay costos registrados
                            arrivalCostsRealTime = (todayArrivals || []).reduce((sum, a) => sum + (a.arrival_fee || a.calculated_fee || 0), 0);
                        }
                        
                        // Calcular costos operativos (excluyendo llegadas que ya se contaron; insensible a mayúsculas)
                        operatingCostsRealTime = todayCosts
                            .filter(c => 
                                normCategory(c.category) !== 'costo_ventas' && 
                                normCategory(c.category) !== 'comisiones' && 
                                normCategory(c.category) !== 'comisiones_bancarias' &&
                                !isArrivalCost(c.category) // Ya se contaron arriba
                            )
                            .reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
                    } else {
                        // Fallback si Costs no está disponible
                        arrivalCostsRealTime = (todayArrivals || []).reduce((sum, a) => sum + (a.arrival_fee || a.calculated_fee || 0), 0);
                    }
                    
                    dailyProfit = {
                        revenue: revenueRealTime,
                        merchandise_cost: merchandiseCostRealTime,
                        arrival_costs: arrivalCostsRealTime,
                        operating_costs: operatingCostsRealTime,
                        commissions: commissionsRealTime,
                        bank_commissions: bankCommissionsRealTime,
                        // Utilidad Bruta = Ingresos - COGS - Comisiones (vendedores + guías)
                        gross_profit: revenueRealTime - merchandiseCostRealTime - commissionsRealTime,
                        // Utilidad Neta = Utilidad Bruta - Gastos Operativos (Costos de Llegadas + Costos Operativos + Comisiones Bancarias)
                        net_profit: (revenueRealTime - merchandiseCostRealTime - commissionsRealTime) - arrivalCostsRealTime - operatingCostsRealTime - bankCommissionsRealTime,
                        total_passengers: todayPassengers
                    };
                }
            } catch (e) {
                console.error('Error loading daily profit:', e);
                // Asegurar que dailyProfit tenga un valor por defecto si falló
                if (!dailyProfit) {
                    dailyProfit = {
                        revenue: 0,
                        merchandise_cost: 0,
                        arrival_costs: 0,
                        operating_costs: 0,
                        commissions: 0,
                        bank_commissions: 0,
                        gross_profit: 0,
                        net_profit: 0,
                        total_passengers: todayPassengers || 0
                    };
                }
            }
            
            // Asegurar que dailyProfit tenga un valor por defecto si es null
            if (!dailyProfit) {
                dailyProfit = {
                    revenue: 0,
                    merchandise_cost: 0,
                    arrival_costs: 0,
                    operating_costs: 0,
                    commissions: 0,
                    bank_commissions: 0,
                    gross_profit: 0,
                    net_profit: 0,
                    total_passengers: todayPassengers || 0
                };
            }
            
            const monthTotal = thisMonthSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            const lastMonthTotal = lastMonthSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            const monthGrowth = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;
            
            // Ventas últimos 30 días (solo completadas); usar fecha local en cada día
            const last30Days = [];
            for (let i = 29; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = typeof Utils !== 'undefined' && Utils.formatDate
                    ? Utils.formatDate(date, 'YYYY-MM-DD')
                    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const daySales = completedSales.filter(s => {
                    if (!s.created_at) return false;
                    const saleDate = new Date(s.created_at);
                    const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate
                        ? Utils.formatDate(saleDate, 'YYYY-MM-DD')
                        : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                    return saleDateStr === dateStr;
                });
                const dayTotal = daySales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
                last30Days.push({
                    date: Utils.formatDate(date, 'DD/MM'),
                    fullDate: dateStr,
                    total: dayTotal,
                    count: daySales.length
                });
            }
            
            // Top vendedores del mes
            const sellers = await DB.getAll('catalog_sellers') || [];
            const sellerStats = {};
            thisMonthSales.forEach(sale => {
                if (sale.seller_id) {
                    if (!sellerStats[sale.seller_id]) {
                        sellerStats[sale.seller_id] = { total: 0, count: 0 };
                    }
                    sellerStats[sale.seller_id].total += Utils.getSaleTotal ? Utils.getSaleTotal(sale) : (parseFloat(sale.total) || 0);
                    sellerStats[sale.seller_id].count += 1;
                }
            });
            
            const topSellers = Object.entries(sellerStats)
                .map(([id, stats]) => {
                    const seller = sellers.find(s => s.id === id);
                    return {
                        id,
                        name: seller?.name || 'N/A',
                        total: stats.total,
                        count: stats.count
                    };
                })
                .sort((a, b) => b.total - a.total)
                .slice(0, 5);
            
            // Top productos del mes (agrupar por item o por nombre si item_id no existe)
            const saleItems = await DB.getAll('sale_items') || [];
            const items = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: false, 
                branchIdField: 'branch_id' 
            }) || [];
            const productStats = {};
            thisMonthSales.forEach(sale => {
                const itemsForSale = saleItems.filter(si => si.sale_id === sale.id);
                itemsForSale.forEach(si => {
                    const item = items.find(i => i.id === si.item_id);
                    const productName = item?.name || si.name || 'Producto sin nombre';
                    const productKey = item ? `inv_${item.id}` : `name_${(si.name || 'unknown').replace(/\s+/g, '_')}`;
                    if (!productStats[productKey]) {
                        productStats[productKey] = { name: productName, qty: 0, revenue: 0 };
                    }
                    productStats[productKey].qty += si.quantity || 1;
                    productStats[productKey].revenue += (si.price || 0) * (si.quantity || 1);
                });
            });
            
            const topProducts = Object.values(productStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);
            
            // Ventas por día de la semana
            const dayOfWeekStats = {};
            thisMonthSales.forEach(sale => {
                const saleDate = new Date(sale.created_at);
                const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][saleDate.getDay()];
                if (!dayOfWeekStats[dayName]) {
                    dayOfWeekStats[dayName] = { total: 0, count: 0 };
                }
                dayOfWeekStats[dayName].total += Utils.getSaleTotal ? Utils.getSaleTotal(sale) : (parseFloat(sale.total) || 0);
                dayOfWeekStats[dayName].count += 1;
            });
            
            // Ventas por hora del día
            const hourStats = {};
            thisMonthSales.forEach(sale => {
                const saleDate = new Date(sale.created_at);
                const hour = saleDate.getHours();
                const hourKey = `${hour}:00`;
                if (!hourStats[hourKey]) {
                    hourStats[hourKey] = { total: 0, count: 0 };
                }
                hourStats[hourKey].total += Utils.getSaleTotal ? Utils.getSaleTotal(sale) : (parseFloat(sale.total) || 0);
                hourStats[hourKey].count += 1;
            });
            
            // Inventario con información de stock (filtrado por sucursal si no es vista consolidada)
            const inventoryItems = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            // Contar items disponibles (status disponible Y stock > 0)
            const availableItems = inventoryItems.filter(i => 
                i.status === 'disponible' && (i.stock_actual ?? 1) > 0
            ).length;
            // Contar items vendidos (status vendida O stock <= 0)
            const soldItems = inventoryItems.filter(i => 
                i.status === 'vendida' || (i.stock_actual ?? 0) <= 0
            ).length;
            const inventoryValue = inventoryItems
                .filter(i => i.status === 'disponible')
                .reduce((sum, i) => sum + ((i.cost || 0) * (i.stock_actual || 1)), 0);
            
            // Estadísticas de stock
            const stockStats = {
                total: inventoryItems.length,
                outOfStock: inventoryItems.filter(i => (i.stock_actual ?? 1) <= 0).length,
                lowStock: inventoryItems.filter(i => {
                    const actual = i.stock_actual ?? 1;
                    const min = i.stock_min ?? 1;
                    return actual > 0 && actual < min;
                }).length,
                overStock: inventoryItems.filter(i => {
                    const actual = i.stock_actual ?? 1;
                    const max = i.stock_max ?? 10;
                    return actual > max;
                }).length,
                totalStock: inventoryItems.reduce((sum, i) => sum + (i.stock_actual ?? 1), 0)
            };
            
            // Costos del mes usando el módulo Costs
            let totalCosts = 0;
            let costBreakdown = {
                fixed: 0,
                variable: 0,
                cogs: 0,
                commissions: 0,
                arrivals: 0,
                bankCommissions: 0
            };
            
            if (typeof Costs !== 'undefined') {
                const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                
                const thisMonthCosts = await Costs.getFilteredCosts({
                    branchId: viewAllBranches ? null : branchId,
                    dateFrom: Utils.formatDate(thisMonthStart, 'YYYY-MM-DD'),
                    dateTo: Utils.formatDate(thisMonthEnd, 'YYYY-MM-DD')
                });
                
                const parseAmt = (x) => (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(x) : (parseFloat(x) || 0));
                totalCosts = thisMonthCosts.reduce((sum, c) => sum + parseAmt(c.amount), 0);
                
                // Desglose de costos alineado con contrato canónico
                const norm = (v) => (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey)
                    ? Utils.normalizeCategoryKey(v)
                    : (v || '').toLowerCase().replace(/\s+/g, '_');
                const isOperational = (cat) => (typeof Utils !== 'undefined' && Utils.isOperationalCostCategory)
                    ? Utils.isOperationalCostCategory(cat)
                    : (norm(cat) !== 'costo_ventas' && norm(cat) !== 'comisiones' && norm(cat) !== 'comisiones_bancarias' && norm(cat) !== 'pago_llegadas');
                costBreakdown.fixed = thisMonthCosts
                    .filter(c => norm(c.type) === 'fijo' && isOperational(c.category))
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
                costBreakdown.variable = thisMonthCosts
                    .filter(c => norm(c.type) === 'variable' && isOperational(c.category))
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
                costBreakdown.cogs = thisMonthCosts
                    .filter(c => norm(c.category) === 'costo_ventas')
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
                costBreakdown.commissions = thisMonthCosts
                    .filter(c => norm(c.category) === 'comisiones')
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
                costBreakdown.arrivals = thisMonthCosts
                    .filter(c => norm(c.category) === 'pago_llegadas')
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
                costBreakdown.bankCommissions = thisMonthCosts
                    .filter(c => norm(c.category) === 'comisiones_bancarias')
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
            } else {
                // Fallback al método anterior
                const costs = await DB.getAll('cost_entries', null, null, { 
                    filterByBranch: !viewAllBranches, 
                    branchIdField: 'branch_id' 
                }) || [];
                const thisMonthCosts = costs.filter(c => {
                    const costDate = new Date(c.date || c.created_at);
                    return costDate.getMonth() === today.getMonth() && costDate.getFullYear() === today.getFullYear();
                });
                const parseAmt = (x) => (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(x) : (parseFloat(x) || 0));
                totalCosts = thisMonthCosts.reduce((sum, c) => sum + parseAmt(c.amount), 0);
            }
            
            // Calcular utilidad usando ProfitCalculator (centralizado)
            let profit = 0;
            let profitMargin = 0;
            try {
                if (typeof ProfitCalculator !== 'undefined' && ProfitCalculator.calculateMonthlyProfit) {
                    const profitData = await ProfitCalculator.calculateMonthlyProfit(today, viewAllBranches ? null : branchId);
                    profit = profitData.netProfit;
                    profitMargin = profitData.profitMargin;
                } else {
                    profit = monthTotal - totalCosts;
                    profitMargin = monthTotal > 0 ? (profit / monthTotal * 100) : 0;
                }
            } catch (error) {
                console.error('Error calculando utilidad:', error);
                profit = monthTotal - totalCosts;
                profitMargin = monthTotal > 0 ? (profit / monthTotal * 100) : 0;
            }
            // Si hay ingresos pero utilidad/margen son 0 o inválidos, usar fórmula directa para evitar mostrar $0 erróneo
            const simpleProfit = monthTotal - totalCosts;
            const simpleMargin = monthTotal > 0 ? (simpleProfit / monthTotal * 100) : 0;
            const isInvalid = profit == null || profit === undefined || !Number.isFinite(profit) ||
                profitMargin == null || profitMargin === undefined || !Number.isFinite(profitMargin);
            const isZeroSuspicious = profit === 0 && profitMargin === 0 && simpleProfit !== 0;
            if (monthTotal > 0 && (isInvalid || isZeroSuspicious)) {
                profit = simpleProfit;
                profitMargin = simpleMargin;
            }
            
            // Si es vista consolidada, agregar información por sucursal
            let branchBreakdown = null;
            const isAdmin = UserManager?.currentUser?.role === 'admin' || 
                          UserManager?.currentUser?.role === 'master_admin' ||
                          UserManager?.currentUser?.permissions?.includes('all') ||
                          (typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('all'));
            if (viewAllBranches && isAdmin) {
                const branches = await DB.getAll('catalog_branches') || [];
                // Usar la misma fuente que los KPIs (completedSales) para consistencia y tiempo real
                branchBreakdown = this.calculateBranchBreakdownFromSales(branches, completedSales, todayStr, today, todayArrivals || []);
            }
            
            // Cargar estadísticas de proveedores
            let suppliersStats = null;
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.getSuppliersStats) {
                    suppliersStats = await API.getSuppliersStats({
                        branch_id: viewAllBranches ? null : branchId
                    });
                } else {
                    // Fallback: calcular desde IndexedDB
                    const suppliers = await DB.getAll('suppliers') || [];
                    const activeSuppliers = suppliers.filter(s => s.status === 'active');
                    const recentSuppliers = activeSuppliers.filter(s => {
                        const createdDate = new Date(s.created_at);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        return createdDate >= thirtyDaysAgo;
                    });
                    
                    // Obtener costos con proveedores (últimos 30 días)
                    const costs = await DB.getAll('cost_entries') || [];
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const recentCosts = costs.filter(c => {
                        const costDate = new Date(c.date || c.created_at);
                        return costDate >= thirtyDaysAgo && c.supplier_id;
                    });
                    
                    // Top proveedores
                    const supplierTotals = {};
                    recentCosts.forEach(cost => {
                        if (!supplierTotals[cost.supplier_id]) {
                            supplierTotals[cost.supplier_id] = { count: 0, total: 0 };
                        }
                        supplierTotals[cost.supplier_id].count++;
                        supplierTotals[cost.supplier_id].total += typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(cost.amount) : (parseFloat(cost.amount) || 0);
                    });
                    
                    const topSuppliers = Object.entries(supplierTotals)
                        .map(([supplierId, stats]) => {
                            const supplier = suppliers.find(s => s.id === supplierId);
                            return supplier ? {
                                id: supplier.id,
                                name: supplier.name,
                                code: supplier.code,
                                purchase_count: stats.count,
                                total_amount: stats.total
                            } : null;
                        })
                        .filter(s => s !== null)
                        .sort((a, b) => b.total_amount - a.total_amount)
                        .slice(0, 5);
                    
                    suppliersStats = {
                        totalSuppliers: activeSuppliers.length,
                        recentSuppliers: recentSuppliers.length,
                        totalPurchases: recentCosts.length,
                        totalPurchaseAmount: recentCosts.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0),
                        topSuppliers: topSuppliers
                    };
                }
            } catch (error) {
                console.warn('Error cargando estadísticas de proveedores:', error);
                this.nextAllowedLoadAt = Date.now() + this.loadCooldownMs;
                suppliersStats = null;
            }
            
            this.renderDashboard({
                todayTotal,
                todayTickets,
                todayPassengers,
                avgTicket,
                closeRate,
                monthTotal,
                lastMonthTotal,
                monthGrowth,
                last30Days,
                topSellers,
                topProducts,
                dayOfWeekStats,
                hourStats,
                availableItems,
                soldItems,
                inventoryValue,
                totalCosts,
                costBreakdown,
                profit,
                profitMargin,
                dailyProfit,
                stockStats,
                viewAllBranches,
                branchBreakdown,
                suppliersStats
            });
            
        } catch (e) {
            console.error('Error loading dashboard:', e);
            const message = String(e?.message || e || '').toLowerCase();
            const isTransientAuthOrDbError =
                message.includes('autenticación') ||
                message.includes('authentication') ||
                message.includes('token') ||
                message.includes('timeout') ||
                message.includes('connection') ||
                message.includes('db_error') ||
                message.includes('503') ||
                message.includes('500');
            if (isTransientAuthOrDbError) {
                this.nextAllowedLoadAt = Date.now() + this.loadCooldownMs;
                console.warn(`⏳ Dashboard: cooldown activado por ${this.loadCooldownMs / 1000}s tras error transitorio`);
            }
            Utils.showNotification('Error al cargar dashboard', 'error');
        } finally {
            this.isLoading = false;
            if (this.pendingLoad) {
                this.pendingLoad = false;
                setTimeout(() => this.loadDashboard(this.viewAllBranches), 300);
            }
        }
    },
    
    async calculateBranchBreakdown(branches, todayStr, today) {
        const breakdown = [];
        
        for (const branch of branches.filter(b => b.active)) {
            // Ventas del día
            const branchSales = await DB.query('sales', 'branch_id', branch.id, { 
                filterByBranch: false 
            }) || [];
            const todayBranchSales = branchSales.filter(s => {
                if (!s.created_at) return false;
                const saleDate = new Date(s.created_at);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate ? Utils.formatDate(saleDate, 'YYYY-MM-DD') : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr && (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'));
            });
            const todayBranchTotal = todayBranchSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            
            // Ventas del mes
            const monthBranchSales = branchSales.filter(s => {
                const saleDate = new Date(s.created_at);
                return saleDate.getMonth() === today.getMonth() &&
                       saleDate.getFullYear() === today.getFullYear() &&
                       (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'));
            });
            const monthBranchTotal = monthBranchSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            
            // Llegadas del día
            const branchArrivals = await DB.query('agency_arrivals', 'date', todayStr, { 
                filterByBranch: false 
            }) || [];
            const todayBranchArrivals = branchArrivals.filter(a => 
                a.branch_id === branch.id && a.passengers > 0 && a.units > 0
            );
            const todayBranchPassengers = todayBranchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            
            breakdown.push({
                branch: branch,
                todaySales: todayBranchTotal,
                todayTickets: todayBranchSales.length,
                todayPassengers: todayBranchPassengers,
                monthSales: monthBranchTotal,
                monthTickets: monthBranchSales.length
            });
        }
        
        return breakdown;
    },

    /**
     * Desglose por sucursal a partir del array de ventas ya cargado (misma fuente que KPIs).
     * Garantiza consistencia en vista consolidada y tiempo real sin consultas extra por sucursal.
     */
    calculateBranchBreakdownFromSales(branches, completedSales, todayStr, today, todayArrivals = []) {
        const breakdown = [];
        for (const branch of (branches || []).filter(b => b && b.active)) {
            const todayBranchSales = completedSales.filter(s => {
                if (!s.branch_id || String(s.branch_id) !== String(branch.id) || !s.created_at) return false;
                const saleDate = new Date(s.created_at);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate ? Utils.formatDate(saleDate, 'YYYY-MM-DD') : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr;
            });
            const monthBranchSales = completedSales.filter(s => {
                if (!s.branch_id || String(s.branch_id) !== String(branch.id)) return false;
                const saleDate = new Date(s.created_at);
                return saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear();
            });
            const todayBranchArrivals = (todayArrivals || []).filter(a =>
                a.branch_id && String(a.branch_id) === String(branch.id) && a.passengers > 0 && a.units > 0
            );
            const todayBranchPassengers = todayBranchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            breakdown.push({
                branch,
                todaySales: todayBranchSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0),
                todayTickets: todayBranchSales.length,
                todayPassengers: todayBranchPassengers,
                monthSales: monthBranchSales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0),
                monthTickets: monthBranchSales.length
            });
        }
        return breakdown;
    },

    async renderDashboard(data) {
        const container = document.getElementById('module-dashboard');
        if (!container) return;
        
        const maxSales = Math.max(...data.last30Days.map(d => d.total), 1);
        const maxDayOfWeek = Math.max(...Object.values(data.dayOfWeekStats).map(s => s.total), 1);
        const maxHour = Math.max(...Object.values(data.hourStats).map(s => s.total), 1);
        
        // Agregar información de vista consolidada si aplica
        const viewAllInfo = data.viewAllBranches && data.branchBreakdown ? `
            <div class="db-chart-card" style="margin-bottom:0;">
                <div class="db-card-header">
                    <span class="db-card-title"><i class="fas fa-building"></i> Vista Consolidada — Todas las Sucursales</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 4px;">
                    ${data.branchBreakdown.map(b => `
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;">
                            <div style="font-size:12px;font-weight:700;color:var(--color-primary);margin-bottom:6px;">${b.branch.name}</div>
                            <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Hoy: <strong style="color:var(--color-text)">${Utils.formatCurrency(b.todaySales)}</strong> (${b.todayTickets})</div>
                            <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:2px;">Mes: <strong style="color:var(--color-text)">${Utils.formatCurrency(b.monthSales)}</strong></div>
                            <div style="font-size:11px;color:var(--color-text-tertiary);">PAX: ${b.todayPassengers}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';
        
        container.innerHTML = `
            ${viewAllInfo}
            <!-- Filtro de Sucursal oculto (no visible, solo funcional) -->
            <div id="dashboard-branch-filter-container" style="display: none; margin-bottom: var(--spacing-md);">
                <div class="form-group" style="margin-bottom: 0; max-width: 300px;">
                    <label style="font-size: 11px; margin-bottom: 4px;">Sucursal</label>
                    <select id="dashboard-branch-filter" class="form-select">
                        <option value="all">Todas las sucursales</option>
                    </select>
                </div>
            </div>

            <!-- KPIs PRINCIPALES -->
            <div class="db-kpi-grid">
                <div class="db-kpi-card">
                    <div class="db-kpi-icon icon-accent">
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Ventas Hoy</div>
                        <div class="db-kpi-value">${Utils.formatCurrency(data.todayTotal)}</div>
                        <div class="db-kpi-sub">${data.todayTickets} tickets · ${data.todayPassengers} pasajeros</div>
                    </div>
                </div>
                <div class="db-kpi-card">
                    <div class="db-kpi-icon icon-success">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Ventas del Mes</div>
                        <div class="db-kpi-value">${Utils.formatCurrency(data.monthTotal)}</div>
                        <div class="db-kpi-sub db-kpi-trend ${data.monthGrowth >= 0 ? 'up' : 'down'}">
                            <i class="fas fa-arrow-${data.monthGrowth >= 0 ? 'up' : 'down'}"></i>
                            ${this.safePercent(Math.abs(data.monthGrowth))}% vs mes anterior
                        </div>
                    </div>
                </div>
                <div class="db-kpi-card">
                    <div class="db-kpi-icon icon-info">
                        <i class="fas fa-receipt"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Ticket Promedio</div>
                        <div class="db-kpi-value">${Utils.formatCurrency(data.avgTicket)}</div>
                        <div class="db-kpi-sub">Cierre: ${this.safePercent(data.closeRate)}%</div>
                    </div>
                </div>
                <div class="db-kpi-card">
                    <div class="db-kpi-icon ${data.profit >= 0 ? 'icon-success' : 'icon-danger'}">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Utilidad del Mes</div>
                        <div class="db-kpi-value" style="color: ${data.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Utils.formatCurrency(data.profit)}</div>
                        <div class="db-kpi-sub">Margen: ${this.safePercent(data.profitMargin)}%</div>
                    </div>
                </div>
                <div class="db-kpi-card db-kpi-card--sm">
                    <div class="db-kpi-icon db-kpi-icon--sm icon-accent">
                        <i class="fas fa-gem"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Inventario</div>
                        <div class="db-kpi-value db-kpi-value--md">${data.availableItems} <span style="font-size:13px;font-weight:400;color:var(--color-text-secondary);">pzs</span></div>
                        <div class="db-kpi-sub">${Utils.formatCurrency(data.inventoryValue)}</div>
                    </div>
                </div>
                <div class="db-kpi-card db-kpi-card--sm">
                    <div class="db-kpi-icon db-kpi-icon--sm icon-danger">
                        <i class="fas fa-file-invoice-dollar"></i>
                    </div>
                    <div class="db-kpi-body">
                        <div class="db-kpi-label">Costos del Mes</div>
                        <div class="db-kpi-value db-kpi-value--md" style="color:var(--color-danger);">${Utils.formatCurrency(data.totalCosts)}</div>
                        ${data.costBreakdown ? `<div class="db-kpi-sub">F: ${Utils.formatCurrency(data.costBreakdown.fixed)} V: ${Utils.formatCurrency(data.costBreakdown.variable)}</div>` : '<div class="db-kpi-sub">—</div>'}
                    </div>
                </div>
            </div>
            
            ${data.dailyProfit ? `
            <!-- Utilidad Diaria -->
            <div class="db-profit-banner">
                <div class="db-profit-banner-header">
                    <span><i class="fas fa-chart-line"></i> Utilidad del Día</span>
                    <span class="db-profit-net" style="color:${data.dailyProfit.net_profit >= 0 ? '#4ade80' : '#f87171'}">
                        Neta: ${Utils.formatCurrency(data.dailyProfit.net_profit)}
                    </span>
                </div>
                <div class="db-profit-items">
                    <div class="db-profit-item">
                        <span class="db-profit-item-label">Ingresos</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.revenue)}</span>
                    </div>
                    <div class="db-profit-item db-profit-item--neg">
                        <span class="db-profit-item-label">Mercancía</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.merchandise_cost || 0)}</span>
                    </div>
                    <div class="db-profit-item db-profit-item--neg">
                        <span class="db-profit-item-label">Llegadas</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.arrival_costs)}</span>
                    </div>
                    <div class="db-profit-item db-profit-item--neg">
                        <span class="db-profit-item-label">Operativos</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.operating_costs)}</span>
                    </div>
                    <div class="db-profit-item db-profit-item--neg">
                        <span class="db-profit-item-label">Comisiones</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.commissions)}</span>
                    </div>
                    <div class="db-profit-item db-profit-item--highlight">
                        <span class="db-profit-item-label">Utilidad Bruta</span>
                        <span class="db-profit-item-val">${Utils.formatCurrency(data.dailyProfit.gross_profit)}</span>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- GRÁFICAS: Ventas por período + Donut vendedores -->
            <div class="db-charts-row">
                <div class="db-chart-card db-chart-card--lg">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-chart-bar"></i> Ventas por Período</span>
                        <div class="db-chart-tabs">
                            <button class="db-tab active" data-chart-range="7">7 días</button>
                            <button class="db-tab" data-chart-range="30">30 días</button>
                        </div>
                    </div>
                    <div style="height: 240px; position: relative; padding-top: 8px;">
                        <canvas id="dashboard-sales-chart-canvas"></canvas>
                    </div>
                </div>
                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-trophy"></i> Top Vendedores</span>
                    </div>
                    <div style="height: 240px; position: relative; padding-top: 8px;">
                        <canvas id="dashboard-donut-chart-canvas"></canvas>
                    </div>
                </div>
            </div>

            <!-- ANÁLISIS: Día de semana + Hora del día -->
            <div class="db-analysis-row">
                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-calendar-week"></i> Ventas por Día</span>
                    </div>
                    <div class="db-bar-list">
                        ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => {
                            const stats = data.dayOfWeekStats[day] || { total: 0, count: 0 };
                            const width = maxDayOfWeek > 0 ? (stats.total / maxDayOfWeek * 100) : 0;
                            return `
                                <div class="db-bar-row">
                                    <span class="db-bar-label">${day}</span>
                                    <div class="db-bar-track">
                                        <div class="db-bar-fill" style="width:${width}%"></div>
                                    </div>
                                    <span class="db-bar-val">${Utils.formatCurrency(stats.total)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-clock"></i> Ventas por Hora</span>
                    </div>
                    <div class="db-bar-list">
                        ${Array.from({length: 24}, (_, i) => {
                            const hourKey = `${i}:00`;
                            const stats = data.hourStats[hourKey] || { total: 0, count: 0 };
                            const width = maxHour > 0 ? (stats.total / maxHour * 100) : 0;
                            if (stats.total === 0) return '';
                            return `
                                <div class="db-bar-row">
                                    <span class="db-bar-label">${hourKey}</span>
                                    <div class="db-bar-track">
                                        <div class="db-bar-fill db-bar-fill--teal" style="width:${width}%"></div>
                                    </div>
                                    <span class="db-bar-val">${Utils.formatCurrency(stats.total)}</span>
                                </div>
                            `;
                        }).filter(h => h).join('')}
                    </div>
                </div>
            </div>

            <!-- TOP VENDEDORES + TOP PRODUCTOS -->
            <div class="db-analysis-row">
                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-user-tie"></i> Top Vendedores del Mes</span>
                    </div>
                    <div class="db-rank-list">
                        ${data.topSellers.length > 0 ? data.topSellers.map((seller, idx) => {
                            const maxSeller = data.topSellers[0].total;
                            const width = maxSeller > 0 ? (seller.total / maxSeller * 100) : 0;
                            return `
                                <div class="db-rank-item">
                                    <div class="db-rank-num" style="color:${idx===0?'#C9A14A':idx===1?'#9BA3B0':idx===2?'#CD7F32':'var(--color-text-tertiary)'}">${idx+1}</div>
                                    <div class="db-rank-info">
                                        <div class="db-rank-name">${seller.name}</div>
                                        <div class="db-rank-bar-track">
                                            <div class="db-rank-bar-fill" style="width:${width}%"></div>
                                        </div>
                                    </div>
                                    <div class="db-rank-val">
                                        <div>${Utils.formatCurrency(seller.total)}</div>
                                        <div class="db-rank-sub">${seller.count} ventas</div>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<div class="db-empty">Sin datos del mes</div>'}
                    </div>
                </div>

                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-gem"></i> Top Productos del Mes</span>
                    </div>
                    <div class="db-rank-list">
                        ${data.topProducts.length > 0 ? data.topProducts.map((product, idx) => {
                            const maxProduct = data.topProducts[0].revenue;
                            const width = maxProduct > 0 ? (product.revenue / maxProduct * 100) : 0;
                            return `
                                <div class="db-rank-item">
                                    <div class="db-rank-num" style="color:${idx===0?'#C9A14A':idx===1?'#9BA3B0':idx===2?'#CD7F32':'var(--color-text-tertiary)'}">${idx+1}</div>
                                    <div class="db-rank-info">
                                        <div class="db-rank-name">${product.name}</div>
                                        <div class="db-rank-bar-track">
                                            <div class="db-rank-bar-fill db-rank-bar-fill--alt" style="width:${width}%"></div>
                                        </div>
                                    </div>
                                    <div class="db-rank-val">
                                        <div>${Utils.formatCurrency(product.revenue)}</div>
                                        <div class="db-rank-sub">${product.qty} uds</div>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<div class="db-empty">Sin datos del mes</div>'}
                    </div>
                </div>
            </div>
            
            ${data.suppliersStats ? `
            <!-- Proveedores -->
            <div class="db-analysis-row">
                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-truck"></i> Estadísticas de Proveedores</span>
                    </div>
                    <div class="db-finance-grid" style="grid-template-columns: repeat(2,1fr);">
                        <div class="db-finance-item">
                            <div class="db-finance-icon" style="background:rgba(201,161,74,0.12);color:#C9A14A;"><i class="fas fa-building"></i></div>
                            <div class="db-finance-label">Activos</div>
                            <div class="db-finance-val">${data.suppliersStats.totalSuppliers || 0}</div>
                        </div>
                        <div class="db-finance-item">
                            <div class="db-finance-icon" style="background:rgba(45,155,111,0.12);color:#2D9B6F;"><i class="fas fa-user-plus"></i></div>
                            <div class="db-finance-label">Nuevos 30d</div>
                            <div class="db-finance-val">${data.suppliersStats.recentSuppliers || 0}</div>
                        </div>
                        <div class="db-finance-item">
                            <div class="db-finance-icon" style="background:rgba(74,144,201,0.12);color:#4A90C9;"><i class="fas fa-shopping-cart"></i></div>
                            <div class="db-finance-label">Compras 30d</div>
                            <div class="db-finance-val">${data.suppliersStats.totalPurchases || 0}</div>
                        </div>
                        <div class="db-finance-item">
                            <div class="db-finance-icon" style="background:rgba(212,160,23,0.12);color:#D4A017;"><i class="fas fa-dollar-sign"></i></div>
                            <div class="db-finance-label">Monto Total</div>
                            <div class="db-finance-val" style="font-size:14px;">${Utils.formatCurrency(data.suppliersStats.totalPurchaseAmount || 0)}</div>
                        </div>
                    </div>
                </div>
                <div class="db-chart-card">
                    <div class="db-card-header">
                        <span class="db-card-title"><i class="fas fa-trophy"></i> Top Proveedores (30 días)</span>
                    </div>
                    <div class="db-rank-list">
                        ${data.suppliersStats.topSuppliers && data.suppliersStats.topSuppliers.length > 0 ?
                            data.suppliersStats.topSuppliers.map((supplier, idx) => {
                                const maxSupplier = data.suppliersStats.topSuppliers[0].total_amount;
                                const width = maxSupplier > 0 ? (supplier.total_amount / maxSupplier * 100) : 0;
                                return `
                                    <div class="db-rank-item">
                                        <div class="db-rank-num" style="color:${idx===0?'#C9A14A':idx===1?'#9BA3B0':'var(--color-text-tertiary)'}">${idx+1}</div>
                                        <div class="db-rank-info">
                                            <div class="db-rank-name">${supplier.code ? supplier.code + ' · ' : ''}${supplier.name || 'Sin nombre'}</div>
                                            <div class="db-rank-bar-track">
                                                <div class="db-rank-bar-fill db-rank-bar-fill--alt" style="width:${width}%"></div>
                                            </div>
                                        </div>
                                        <div class="db-rank-val">
                                            <div>${Utils.formatCurrency(supplier.total_amount || 0)}</div>
                                            <div class="db-rank-sub">${supplier.purchase_count || 0} compras</div>
                                        </div>
                                    </div>
                                `;
                            }).join('') :
                            '<div class="db-empty">Sin compras registradas</div>'
                        }
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- RESUMEN FINANCIERO -->
            <div class="db-finance-card">
                <div class="db-card-header">
                    <span class="db-card-title"><i class="fas fa-dollar-sign"></i> Resumen Financiero del Mes</span>
                    <div class="db-finance-actions">
                        ${(UserManager.currentUser?.role === 'admin' || UserManager.currentUser?.permissions?.includes('all')) ? `
                        <button class="db-action-btn" id="dashboard-view-all-btn" onclick="window.Dashboard.toggleViewAll()">
                            <i class="fas fa-building"></i> <span id="dashboard-view-all-text">Ver Todas</span>
                        </button>
                        ` : ''}
                        <button class="db-action-btn" onclick="window.Dashboard.showPredictions()">
                            <i class="fas fa-wand-magic-sparkles"></i> Predicciones
                        </button>
                        <button class="db-action-btn" onclick="window.Dashboard.refresh()">
                            <i class="fas fa-rotate"></i> Actualizar
                        </button>
                        <button class="db-action-btn" onclick="window.Dashboard.exportDashboard()">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
                <div class="db-finance-grid">
                    <div class="db-finance-item">
                        <div class="db-finance-icon" style="background:rgba(45,155,111,0.12);color:#2D9B6F;">
                            <i class="fas fa-arrow-trend-up"></i>
                        </div>
                        <div class="db-finance-label">Ingresos</div>
                        <div class="db-finance-val" style="color:var(--color-success);">${Utils.formatCurrency(data.monthTotal)}</div>
                    </div>
                    <div class="db-finance-item">
                        <div class="db-finance-icon" style="background:rgba(196,69,69,0.12);color:#C44545;">
                            <i class="fas fa-arrow-trend-down"></i>
                        </div>
                        <div class="db-finance-label">Costos</div>
                        <div class="db-finance-val" style="color:var(--color-danger);">${Utils.formatCurrency(data.totalCosts)}</div>
                    </div>
                    <div class="db-finance-item">
                        <div class="db-finance-icon" style="background:rgba(201,161,74,0.12);color:#C9A14A;">
                            <i class="fas fa-chart-pie"></i>
                        </div>
                        <div class="db-finance-label">Utilidad</div>
                        <div class="db-finance-val" style="color:${data.profit>=0?'var(--color-success)':'var(--color-danger)'};">${Utils.formatCurrency(data.profit)}</div>
                    </div>
                    <div class="db-finance-item">
                        <div class="db-finance-icon" style="background:rgba(74,144,201,0.12);color:#4A90C9;">
                            <i class="fas fa-percent"></i>
                        </div>
                        <div class="db-finance-label">Margen</div>
                        <div class="db-finance-val" style="color:${data.profitMargin>=0?'var(--color-success)':'var(--color-danger)'};">${this.safePercent(data.profitMargin)}%</div>
                    </div>
                </div>
            </div>

            <!-- ALERTAS -->
            <div class="db-chart-card" id="dashboard-alerts-section">
                <div class="db-card-header">
                    <span class="db-card-title"><i class="fas fa-bell"></i> Alertas y Recomendaciones</span>
                </div>
                <div id="dashboard-alerts-content" style="padding: 4px 0;">
                    ${this.generateAlertsSync(data)}
                </div>
            </div>
        `;
        // Chart.js Prodex: renderizar gráficas
        this.renderSalesChart(data.last30Days, 7);
        this.renderDonutChart(data.topSellers);
        this.setupChartRangeTabs(data.last30Days);
        // Delegar clics en botones de alerta (Ver Inventario / Ver Alertas)
        const alertsContent = document.getElementById('dashboard-alerts-content');
        if (alertsContent) {
            alertsContent.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-alert-filter]');
                if (!btn) return;
                const filter = btn.getAttribute('data-alert-filter') || '';
                this.openInventoryWithFilter(filter);
            });
        }
    },

    renderSalesChart(last30Days, range = 7) {
        const canvas = document.getElementById('dashboard-sales-chart-canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        if (this._salesChartInstance) {
            this._salesChartInstance.destroy();
            this._salesChartInstance = null;
        }
        const days = range === 7 ? last30Days.slice(-7) : last30Days;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(201, 161, 74, 0.8)');
        gradient.addColorStop(1, 'rgba(201, 161, 74, 0.15)');
        this._salesChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: days.map(d => d.date),
                datasets: [{
                    label: 'Ventas',
                    data: days.map(d => d.total),
                    backgroundColor: gradient,
                    borderColor: '#C9A14A',
                    borderWidth: 0,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1A1A1E',
                        borderColor: 'rgba(201,161,74,0.3)',
                        borderWidth: 1,
                        titleColor: '#F0EDE8',
                        bodyColor: '#A09A8E',
                        callbacks: {
                            label: ctx => typeof Utils !== 'undefined' ? `  ${Utils.formatCurrency(ctx.raw)}` : ctx.raw
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#6B6660', font: { size: 10 } },
                        border: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: {
                            color: '#6B6660',
                            font: { size: 10 },
                            callback: v => typeof Utils !== 'undefined' && Utils.formatCurrency ? Utils.formatCurrency(v) : v
                        },
                        border: { display: false }
                    }
                }
            }
        });
    },

    renderDonutChart(topSellers) {
        const canvas = document.getElementById('dashboard-donut-chart-canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        if (this._donutChartInstance) {
            this._donutChartInstance.destroy();
            this._donutChartInstance = null;
        }
        const hasData = topSellers && topSellers.length > 0;
        const ctx = canvas.getContext('2d');
        const colors = ['#C9A14A', '#4A90C9', '#2D9B6F', '#D4A017', '#E07070'];
        this._donutChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: hasData ? topSellers.map(s => s.name) : ['Sin datos'],
                datasets: [{
                    data: hasData ? topSellers.map(s => s.total) : [1],
                    backgroundColor: hasData ? topSellers.map((_, i) => colors[i % colors.length]) : ['rgba(255,255,255,0.06)'],
                    borderWidth: 2,
                    borderColor: '#141416'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    tooltip: {
                        backgroundColor: '#1A1A1E',
                        borderColor: 'rgba(201,161,74,0.3)',
                        borderWidth: 1,
                        titleColor: '#F0EDE8',
                        bodyColor: '#A09A8E',
                        callbacks: {
                            label: ctx => typeof Utils !== 'undefined' ? `  ${Utils.formatCurrency(ctx.raw)}` : ctx.raw
                        }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#A09A8E',
                            font: { size: 11 },
                            boxWidth: 12,
                            padding: 12
                        }
                    }
                }
            }
        });
    },

    setupChartRangeTabs(last30Days) {
        document.querySelectorAll('[data-chart-range]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-chart-range]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const range = parseInt(btn.getAttribute('data-chart-range'), 10);
                this.renderSalesChart(last30Days, range);
            });
        });
    },

    /**
     * Abre el módulo Inventario y aplica el filtro de stock (out = agotados, low = bajo).
     * Usado por los botones de las alertas del dashboard.
     */
    openInventoryWithFilter(filter) {
        if (typeof UI !== 'undefined') UI.closeModal();
        window.location.hash = '#inventory';
        document.querySelector('[data-module="inventory"]')?.click();
        setTimeout(() => {
            const filterEl = document.getElementById('inventory-stock-alert-filter');
            if (filterEl && filter) {
                filterEl.value = filter;
                if (window.Inventory && typeof window.Inventory.loadInventory === 'function') {
                    window.Inventory.loadInventory();
                }
            }
        }, 600);
    },

    async refresh() {
        this.initialized = false;
        await this.loadDashboard(this.viewAllBranches);
        Utils.showNotification('Dashboard actualizado', 'success');
    },

    async toggleViewAll() {
        const isAdmin = UserManager.currentUser?.role === 'admin' || 
                       UserManager.currentUser?.permissions?.includes('all');
        if (!isAdmin) {
            Utils.showNotification('Solo administradores pueden ver todas las sucursales', 'warning');
            return;
        }
        
        this.viewAllBranches = !this.viewAllBranches;
        const btn = document.getElementById('dashboard-view-all-btn');
        const text = document.getElementById('dashboard-view-all-text');
        
        if (btn && text) {
            if (this.viewAllBranches) {
                btn.classList.add('active');
                text.textContent = 'Ver Actual';
            } else {
                btn.classList.remove('active');
                text.textContent = 'Ver Todas';
            }
        }
        
        await this.loadDashboard(this.viewAllBranches);
        Utils.showNotification(
            this.viewAllBranches ? 'Mostrando todas las sucursales' : 'Mostrando sucursal actual', 
            'info'
        );
    },
    
    async exportDashboard() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            // Recargar datos para exportación completa
            await this.loadDashboard();
            
            const today = new Date();
            // Obtener sucursal actual y filtrar ventas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            const viewAllBranches = isMasterAdmin;
            
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const todaySales = allSales.filter(s => {
                const saleDate = new Date(s.created_at);
                return saleDate.toDateString() === today.toDateString();
            });
            
            const dashboardData = {
                fecha: Utils.formatDate(new Date(), 'DD/MM/YYYY'),
                ventas_hoy: todaySales.reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0),
                tickets_hoy: todaySales.length,
                ventas_mes: allSales.filter(s => {
                    const saleDate = new Date(s.created_at);
                    return saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear();
                }).reduce((sum, s) => sum + (Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0)
            };
            
            const formatOptions = [
                { value: '1', label: 'PDF' },
                { value: '2', label: 'Excel' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Dashboard');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToPDF([dashboardData], `dashboard_${date}.pdf`, 'Dashboard');
            } else if (format === '2') {
                Utils.exportToExcel([dashboardData], `dashboard_${date}.xlsx`, 'Dashboard');
            }
        } catch (e) {
            console.error('Error exporting dashboard:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    // Predicción de ventas basada en tendencias
    async predictSales() {
        // Obtener sucursal actual y filtrar ventas
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
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
        const completedSales = sales.filter(s =>
            (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'))
        );
        
        // Calcular promedio de ventas por día de la semana
        const dayOfWeekAverages = {};
        completedSales.forEach(sale => {
            const saleDate = new Date(sale.created_at);
            const dayName = saleDate.getDay();
            if (!dayOfWeekAverages[dayName]) {
                dayOfWeekAverages[dayName] = { total: 0, count: 0 };
            }
            dayOfWeekAverages[dayName].total += sale.total || 0;
            dayOfWeekAverages[dayName].count += 1;
        });

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.getDay();
        const tomorrowAvg = dayOfWeekAverages[tomorrowDay] ? 
            dayOfWeekAverages[tomorrowDay].total / dayOfWeekAverages[tomorrowDay].count : 0;

        // Calcular promedio semanal
        const weeklyTotal = Object.values(dayOfWeekAverages).reduce((sum, day) => sum + day.total, 0);
        const weeklyAvg = weeklyTotal / 7;

        // Calcular promedio mensual
        const monthlySales = {};
        completedSales.forEach(sale => {
            const date = new Date(sale.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlySales[monthKey]) {
                monthlySales[monthKey] = { total: 0, count: 0 };
            }
            monthlySales[monthKey].total += sale.total || 0;
            monthlySales[monthKey].count += 1;
        });

        const monthlyValues = Object.values(monthlySales);
        const avgMonthly = monthlyValues.length > 0 ?
            monthlyValues.reduce((sum, m) => sum + m.total, 0) / monthlyValues.length : 0;

        return {
            tomorrow: tomorrowAvg,
            nextWeek: weeklyAvg * 7,
            nextMonth: avgMonthly,
            confidence: completedSales.length > 30 ? 85 : completedSales.length > 10 ? 70 : 50
        };
    },

    async showPredictions() {
        const predictions = await this.predictSales();
        
        const body = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-md);">
                <div class="kpi-card">
                    <div class="kpi-label">Predicción Mañana</div>
                    <div class="kpi-value" style="font-size: 20px;">${Utils.formatCurrency(predictions.tomorrow)}</div>
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Confianza: ${predictions.confidence}%
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Predicción Próxima Semana</div>
                    <div class="kpi-value" style="font-size: 20px;">${Utils.formatCurrency(predictions.nextWeek)}</div>
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Basado en promedios históricos
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Predicción Próximo Mes</div>
                    <div class="kpi-value" style="font-size: 20px;">${Utils.formatCurrency(predictions.nextMonth)}</div>
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Tendencia mensual
                    </div>
                </div>
            </div>
            <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                <p style="font-size: 12px; color: var(--color-text-secondary); margin: 0;">
                    <i class="fas fa-info-circle"></i> Las predicciones se basan en análisis de tendencias históricas y pueden variar según condiciones del mercado.
                </p>
            </div>
        `;

        UI.showModal('Predicciones de Ventas', body, [
            { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
        ]);
    },

    generateAlertsSync(data) {
        const alerts = [];
        
        // Alerta de margen bajo
        if (data.profitMargin < 10 && data.profitMargin > 0) {
            alerts.push({
                type: 'warning',
                icon: 'fa-exclamation-triangle',
                title: 'Margen de Utilidad Bajo',
                message: `El margen actual es ${this.safePercent(data.profitMargin)}%. Considera revisar costos o ajustar precios.`
            });
        }

        // Alerta de pérdidas
        if (data.profit < 0) {
            alerts.push({
                type: 'danger',
                icon: 'fa-times-circle',
                title: 'Pérdidas Detectadas',
                message: `Hay pérdidas de ${Utils.formatCurrency(Math.abs(data.profit))}. Revisa costos urgentemente.`
            });
        }

        // Alerta de inventario bajo
        if (data.availableItems < 20) {
            alerts.push({
                type: 'warning',
                icon: 'fa-box',
                title: 'Inventario Bajo',
                message: `Solo quedan ${data.availableItems} piezas disponibles. Considera reponer inventario.`
            });
        }
        
        // Alertas de Stock
        if (data.stockStats) {
            // Productos agotados (botón usa openInventoryWithFilter para que el click funcione)
            if (data.stockStats.outOfStock > 0) {
                alerts.push({
                    type: 'danger',
                    icon: 'fa-exclamation-circle',
                    title: 'Productos Agotados',
                    message: `${data.stockStats.outOfStock} producto(s) sin stock. Revisa el inventario urgentemente.`,
                    action: 'Ver Inventario',
                    actionFilter: 'out'
                });
            }
            
            // Stock bajo
            if (data.stockStats.lowStock > 0) {
                alerts.push({
                    type: 'warning',
                    icon: 'fa-arrow-down',
                    title: 'Stock Bajo',
                    message: `${data.stockStats.lowStock} producto(s) con stock por debajo del mínimo. Considera reabastecer.`,
                    action: 'Ver Alertas',
                    actionFilter: 'low'
                });
            }
            
            // Exceso de stock
            if (data.stockStats.overStock > 0) {
                alerts.push({
                    type: 'info',
                    icon: 'fa-arrow-up',
                    title: 'Exceso de Stock',
                    message: `${data.stockStats.overStock} producto(s) exceden el stock máximo. Considera promociones.`
                });
            }
        }

        // Alerta de ventas bajas
        if (data.todayTickets === 0) {
            alerts.push({
                type: 'info',
                icon: 'fa-info-circle',
                title: 'Sin Ventas Hoy',
                message: 'No se han registrado ventas hoy. Revisa estrategias de ventas.'
            });
        }

        // Alerta positiva de buen desempeño
        if (data.profitMargin > 30 && data.profit > 0) {
            alerts.push({
                type: 'success',
                icon: 'fa-check-circle',
                title: 'Excelente Desempeño',
                message: `Margen de ${this.safePercent(data.profitMargin)}% y utilidad de ${Utils.formatCurrency(data.profit)}. ¡Sigue así!`
            });
        }

        if (alerts.length === 0) {
            return '<p style="text-align: center; color: var(--color-success); padding: var(--spacing-md);"><i class="fas fa-check-circle"></i> Todo en orden</p>';
        }

        return alerts.map(alert => `
            <div style="padding: var(--spacing-sm); margin-bottom: var(--spacing-xs); background: var(--color-bg); border-left: 4px solid var(--color-${alert.type}); border-radius: var(--radius-sm);">
                <div style="display: flex; align-items: start; gap: var(--spacing-sm);">
                    <i class="fas ${alert.icon}" style="color: var(--color-${alert.type}); font-size: 18px; margin-top: 2px;"></i>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${alert.title}</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">${alert.message}</div>
                        ${alert.action ? `
                            <button class="btn-secondary btn-sm" data-alert-filter="${alert.actionFilter || ''}" type="button" style="margin-top: 8px; font-size: 10px; padding: 4px 8px;">
                                ${alert.action}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
};

window.Dashboard = Dashboard;
