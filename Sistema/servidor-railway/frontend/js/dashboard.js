// Dashboard Module - Versión Avanzada

const Dashboard = {
    initialized: false,
    viewAllBranches: false, // Flag para vista consolidada
    
    async init() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('dashboard.view')) {
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver el dashboard</div>';
            }
            return;
        }

        if (this.initialized) return;
        
        // Verificar que los catálogos estén cargados antes de inicializar
        let catalogsLoaded = false;
        let attempts = 0;
        const maxAttempts = 10; // Máximo 5 segundos de espera
        
        while (!catalogsLoaded && attempts < maxAttempts) {
            try {
                const branches = await DB.getAll('catalog_branches') || [];
                const sellers = await DB.getAll('catalog_sellers') || [];
                
                // Si hay al menos algunos datos, considerar que están cargados
                if (branches.length > 0 || sellers.length > 0) {
                    catalogsLoaded = true;
                    break;
                }
                
                // Si no hay datos, esperar un poco y reintentar
                if (attempts < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                } else {
                    // Último intento: continuar de todas formas
                    console.log('⚠️ Catálogos no cargados en Dashboard, continuando...');
                    catalogsLoaded = true;
                }
            } catch (e) {
                console.error('Error verificando catálogos en Dashboard:', e);
                catalogsLoaded = true;
                break;
            }
        }
        
        await this.loadDashboard(this.viewAllBranches);
        this.setupEventBusListeners();
        this.initialized = true;
        
        // Escuchar cambios de sucursal para recargar datos
        window.addEventListener('branch-changed', async () => {
            if (this.initialized) {
                await this.loadDashboard(this.viewAllBranches);
            }
        });
        
        // Escuchar cambios en el filtro de sucursal (para admin)
        window.addEventListener('branch-filter-changed', async () => {
            if (this.initialized) {
                await this.loadDashboard(this.viewAllBranches);
            }
        });
        
        // Escuchar eventos WebSocket para actualización en tiempo real
        this.setupWebSocketListeners();
    },
    
    // Configurar listeners de WebSocket
    setupWebSocketListeners() {
        if (typeof SocketManager === 'undefined') return;
        
        SocketManager.on('sale-created', (data) => {
            if (this.shouldShowData(data)) {
                this.loadDashboard(this.viewAllBranches);
            }
        });
        
        SocketManager.on('sale-updated', (data) => {
            if (this.shouldShowData(data)) {
                this.loadDashboard(this.viewAllBranches);
            }
        });
        
        SocketManager.on('inventory-item-created', (data) => {
            if (this.shouldShowData(data)) {
                this.loadDashboard(this.viewAllBranches);
            }
        });
        
        SocketManager.on('inventory-item-updated', (data) => {
            if (this.shouldShowData(data)) {
                this.loadDashboard(this.viewAllBranches);
            }
        });
    },
    
    // Verificar si los datos deben mostrarse según el filtro de sucursal activo
    shouldShowData(data) {
        if (typeof BranchSelector !== 'undefined' && BranchSelector.isAdmin && BranchSelector.selectedBranchId) {
            return data.branch_id === BranchSelector.selectedBranchId;
        }
        return true;
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
    },
    
    async loadDashboard(showAllBranches = false) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];
            
            // Verificar si puede ver todas las sucursales
            const canViewAllBranches = typeof PermissionManager !== 'undefined' 
                ? PermissionManager.hasPermission('dashboard.view_all_branches')
                : (UserManager.currentUser?.role === 'admin' || UserManager.currentUser?.permissions?.includes('all'));
            
            // Si es admin, SIEMPRE mostrar todas las sucursales por defecto
            // Si no es admin pero showAllBranches es true, también mostrar todas
            const viewAllBranches = canViewAllBranches || showAllBranches;
            
            // Actualizar flag interno
            this.viewAllBranches = viewAllBranches;
            
            console.log(`[Dashboard] Vista consolidada: ${viewAllBranches} (Admin: ${canViewAllBranches})`);
            
            // Obtener todas las ventas (filtradas por sucursal automáticamente o todas si es admin)
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const todaySales = allSales.filter(s => s.created_at && s.created_at.startsWith(todayStr));
            const thisMonthSales = allSales.filter(s => {
                const saleDate = new Date(s.created_at);
                return saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear();
            });
            const lastMonthSales = allSales.filter(s => {
                const saleDate = new Date(s.created_at);
                const lastMonth = new Date(today);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                return saleDate.getMonth() === lastMonth.getMonth() && saleDate.getFullYear() === lastMonth.getFullYear();
            });
            
            // Obtener Total PAX de llegadas del día (solo llegadas válidas: pasajeros > 0 y unidades > 0)
            const branchId = viewAllBranches ? null : (typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || 'branch1');
            const arrivals = await DB.query('agency_arrivals', 'date', todayStr, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const todayArrivals = arrivals.filter(a => 
                (viewAllBranches || a.branch_id === branchId || !a.branch_id) &&
                (a.passengers > 0 && a.units > 0) // Solo llegadas válidas
            );
            const todayPassengers = todayArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            
            // Calcular KPIs
            const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
            const todayTickets = todaySales.length;
            // Ticket promedio = Venta Total / Número de Pasajeros / Tipo de Cambio
            const exchangeRateUsd = parseFloat((await DB.get('settings', 'exchange_rate_usd'))?.value || '20.00');
            const avgTicket = todayPassengers > 0 ? todayTotal / todayPassengers / exchangeRateUsd : 0;
            // % de Cierre = (Número de Ventas Totales / Número de Pasajeros) * 100
            const closeRate = todayPassengers > 0 ? (todayTickets / todayPassengers) * 100 : 0;
            
            // Obtener utilidad diaria usando ProfitCalculator (centralizado)
            let dailyProfit = null;
            try {
                // Intentar obtener reporte existente primero
                const profitReports = await DB.query('daily_profit_reports', 'date', todayStr) || [];
                const todayProfit = profitReports.find(p => 
                    (viewAllBranches || p.branch_id === branchId || !p.branch_id)
                );
                
                if (todayProfit && !viewAllBranches) {
                    // Usar reporte existente si está disponible
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
                } else if (typeof ProfitCalculator !== 'undefined' && ProfitCalculator.calculateDailyProfit && branchId) {
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
                            bank_commissions: 0, // Se calcula en calculateDailyProfit pero no está en calculations
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
                if (!dailyProfit && todaySales.length > 0) {
                    const saleItems = await DB.getAll('sale_items') || [];
                    const allPayments = await DB.getAll('payments') || [];
                    let merchandiseCostRealTime = 0;
                    let commissionsRealTime = 0;
                    let bankCommissionsRealTime = 0;
                    const revenueRealTime = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
                    
                    for (const sale of todaySales) {
                        const items = saleItems.filter(si => si.sale_id === sale.id);
                        for (const item of items) {
                            merchandiseCostRealTime += (item.cost || 0) * (item.quantity || 1);
                            if (item.commission_amount) {
                                commissionsRealTime += item.commission_amount;
                            }
                        }
                        
                        const salePayments = allPayments.filter(p => p.sale_id === sale.id);
                        for (const payment of salePayments) {
                            if (payment.bank_commission) {
                                bankCommissionsRealTime += payment.bank_commission;
                            }
                        }
                    }
                    
                    const arrivalCostsRealTime = todayArrivals.reduce((sum, a) => sum + (a.arrival_fee || 0), 0);
                    
                    let operatingCostsRealTime = 0;
                    if (typeof Costs !== 'undefined') {
                        const todayCosts = await Costs.getFilteredCosts({ 
                            branchId: viewAllBranches ? null : branchId,
                            dateFrom: todayStr,
                            dateTo: todayStr
                        });
                        operatingCostsRealTime = todayCosts
                            .filter(c => 
                                c.category !== 'costo_ventas' && 
                                c.category !== 'comisiones' && 
                                c.category !== 'comisiones_bancarias' &&
                                c.category !== 'pago_llegadas'
                            )
                            .reduce((sum, c) => sum + (c.amount || 0), 0);
                    }
                    
                    dailyProfit = {
                        revenue: revenueRealTime,
                        merchandise_cost: merchandiseCostRealTime,
                        arrival_costs: arrivalCostsRealTime,
                        operating_costs: operatingCostsRealTime,
                        commissions: commissionsRealTime,
                        bank_commissions: bankCommissionsRealTime,
                        gross_profit: revenueRealTime - merchandiseCostRealTime - arrivalCostsRealTime - operatingCostsRealTime,
                        net_profit: (revenueRealTime - merchandiseCostRealTime - arrivalCostsRealTime - operatingCostsRealTime) - commissionsRealTime - bankCommissionsRealTime,
                        total_passengers: todayPassengers
                    };
                }
            } catch (e) {
                console.error('Error loading daily profit:', e);
            }
            
            const monthTotal = thisMonthSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const lastMonthTotal = lastMonthSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const monthGrowth = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal * 100) : 0;
            
            // Ventas últimos 30 días
            const last30Days = [];
            for (let i = 29; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const daySales = allSales.filter(s => s.created_at && s.created_at.startsWith(dateStr));
                const dayTotal = daySales.reduce((sum, s) => sum + (s.total || 0), 0);
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
                    sellerStats[sale.seller_id].total += sale.total || 0;
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
            
            // Top productos del mes
            const saleItems = await DB.getAll('sale_items') || [];
            // Obtener items filtrados por sucursal
            const items = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const productStats = {};
            thisMonthSales.forEach(sale => {
                const itemsForSale = saleItems.filter(si => si.sale_id === sale.id);
                itemsForSale.forEach(si => {
                    const item = items.find(i => i.id === si.item_id);
                    if (item) {
                        if (!productStats[item.id]) {
                            productStats[item.id] = { name: item.name, qty: 0, revenue: 0 };
                        }
                        productStats[item.id].qty += si.quantity || 1;
                        productStats[item.id].revenue += (si.price || 0) * (si.quantity || 1);
                    }
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
                dayOfWeekStats[dayName].total += sale.total || 0;
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
                hourStats[hourKey].total += sale.total || 0;
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
                
                totalCosts = thisMonthCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
                
                // Desglose de costos
                costBreakdown.fixed = thisMonthCosts
                    .filter(c => c.type === 'fijo')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
                costBreakdown.variable = thisMonthCosts
                    .filter(c => c.type === 'variable' && c.category !== 'costo_ventas' && c.category !== 'comisiones' && c.category !== 'comisiones_bancarias' && c.category !== 'pago_llegadas')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
                costBreakdown.cogs = thisMonthCosts
                    .filter(c => c.category === 'costo_ventas')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
                costBreakdown.commissions = thisMonthCosts
                    .filter(c => c.category === 'comisiones')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
                costBreakdown.arrivals = thisMonthCosts
                    .filter(c => c.category === 'pago_llegadas')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
                costBreakdown.bankCommissions = thisMonthCosts
                    .filter(c => c.category === 'comisiones_bancarias')
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
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
                totalCosts = thisMonthCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
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
                    // Fallback al cálculo manual
                    profit = monthTotal - totalCosts;
                    profitMargin = monthTotal > 0 ? (profit / monthTotal * 100) : 0;
                }
            } catch (error) {
                console.error('Error calculando utilidad:', error);
                // Fallback al cálculo manual
                profit = monthTotal - totalCosts;
                profitMargin = monthTotal > 0 ? (profit / monthTotal * 100) : 0;
            }
            
            // Si es vista consolidada, agregar información por sucursal
            let branchBreakdown = null;
            if (viewAllBranches && isAdmin) {
                const branches = await DB.getAll('catalog_branches') || [];
                branchBreakdown = await this.calculateBranchBreakdown(branches, todayStr, today);
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
                branchBreakdown
            });
            
        } catch (e) {
            console.error('Error loading dashboard:', e);
            Utils.showNotification('Error al cargar dashboard', 'error');
        }
    },
    
    async calculateBranchBreakdown(branches, todayStr, today) {
        const breakdown = [];
        
        for (const branch of branches.filter(b => b.active)) {
            // Ventas del día
            const branchSales = await DB.query('sales', 'branch_id', branch.id, { 
                filterByBranch: false 
            }) || [];
            const todayBranchSales = branchSales.filter(s => 
                s.created_at && s.created_at.startsWith(todayStr) && s.status === 'completada'
            );
            const todayBranchTotal = todayBranchSales.reduce((sum, s) => sum + (s.total || 0), 0);
            
            // Ventas del mes
            const monthBranchSales = branchSales.filter(s => {
                const saleDate = new Date(s.created_at);
                return saleDate.getMonth() === today.getMonth() && 
                       saleDate.getFullYear() === today.getFullYear() &&
                       s.status === 'completada';
            });
            const monthBranchTotal = monthBranchSales.reduce((sum, s) => sum + (s.total || 0), 0);
            
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

    renderDashboard(data) {
        const container = document.getElementById('module-dashboard');
        if (!container) return;
        
        const maxSales = Math.max(...data.last30Days.map(d => d.total), 1);
        const maxDayOfWeek = Math.max(...Object.values(data.dayOfWeekStats).map(s => s.total), 1);
        const maxHour = Math.max(...Object.values(data.hourStats).map(s => s.total), 1);
        
        // Agregar información de vista consolidada si aplica
        const viewAllInfo = data.viewAllBranches && data.branchBreakdown ? `
            <div class="module" style="padding: var(--spacing-md); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg); color: white;">
                <h3 style="color: white; margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fas fa-building"></i> Vista Consolidada - Todas las Sucursales
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    ${data.branchBreakdown.map(b => `
                        <div style="background: rgba(255,255,255,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px);">
                            <div style="font-size: 11px; opacity: 0.9; margin-bottom: 4px; font-weight: 600;">${b.branch.name}</div>
                            <div style="font-size: 10px; opacity: 0.8; margin-bottom: 2px;">Hoy: ${Utils.formatCurrency(b.todaySales)} (${b.todayTickets} ventas)</div>
                            <div style="font-size: 10px; opacity: 0.8; margin-bottom: 2px;">Mes: ${Utils.formatCurrency(b.monthSales)} (${b.monthTickets} ventas)</div>
                            <div style="font-size: 10px; opacity: 0.8;">PAX Hoy: ${b.todayPassengers}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';
        
        container.innerHTML = `
            ${viewAllInfo}
            <!-- KPIs Principales -->
            <div class="dashboard-grid" style="margin-bottom: var(--spacing-lg);">
                <div class="kpi-card" style="position: relative; overflow: hidden;">
                    <div class="kpi-label">Ventas Hoy</div>
                    <div class="kpi-value">${Utils.formatCurrency(data.todayTotal)}</div>
                    <div style="position: absolute; top: var(--spacing-xs); right: var(--spacing-xs); font-size: 24px; opacity: 0.1;">
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Tickets Hoy</div>
                    <div class="kpi-value">${data.todayTickets}</div>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${data.todayPassengers} pasajeros
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ticket Promedio</div>
                    <div class="kpi-value">${Utils.formatCurrency(data.avgTicket)}</div>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        % Cierre: ${data.closeRate.toFixed(1)}%
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ventas del Mes</div>
                    <div class="kpi-value">${Utils.formatCurrency(data.monthTotal)}</div>
                    <div style="font-size: 12px; color: ${data.monthGrowth >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; margin-top: var(--spacing-xs);">
                        ${data.monthGrowth >= 0 ? '+' : ''}${data.monthGrowth.toFixed(1)}% vs mes anterior
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Utilidad del Mes</div>
                    <div class="kpi-value" style="color: ${data.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                        ${Utils.formatCurrency(data.profit)}
                    </div>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Margen: ${data.profitMargin.toFixed(1)}%
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Inventario Disponible</div>
                    <div class="kpi-value">${data.availableItems}</div>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Valor: ${Utils.formatCurrency(data.inventoryValue)}
                    </div>
                    ${data.stockStats ? `
                        <div style="font-size: 10px; color: var(--color-text-tertiary); margin-top: 4px;">
                            Stock Total: ${data.stockStats.totalStock} unidades
                        </div>
                    ` : ''}
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Costos del Mes</div>
                    <div class="kpi-value" style="color: var(--color-danger);">${Utils.formatCurrency(data.totalCosts)}</div>
                    ${data.costBreakdown ? `
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            Fijos: ${Utils.formatCurrency(data.costBreakdown.fixed)} | Variables: ${Utils.formatCurrency(data.costBreakdown.variable)}
                        </div>
                    ` : ''}
                </div>
            </div>
            
            ${data.dailyProfit ? `
            <!-- Utilidad Diaria -->
            <div class="module" style="padding: var(--spacing-md); background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg); color: white; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
                <h3 style="color: white; margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fas fa-chart-line"></i> Utilidad Diaria (Antes de Impuestos)
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--spacing-sm);">
                    <div style="background: rgba(255,255,255,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Ingresos</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.revenue)}</div>
                    </div>
                    <div style="background: rgba(255,100,100,0.2); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Costo Mercancía</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.merchandise_cost || 0)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Costos Llegadas</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.arrival_costs)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Costos Operativos</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.operating_costs)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Comisiones</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.commissions)}</div>
                    </div>
                    <div style="background: rgba(255,100,100,0.15); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Comisiones Bancarias</div>
                        <div style="font-size: 16px; font-weight: 600;">${Utils.formatCurrency(data.dailyProfit.bank_commissions || 0)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.25); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px); border: 2px solid rgba(255,255,255,0.3);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Utilidad Bruta</div>
                        <div style="font-size: 18px; font-weight: 700;">${Utils.formatCurrency(data.dailyProfit.gross_profit)}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.3); padding: var(--spacing-sm); border-radius: var(--radius-sm); backdrop-filter: blur(10px); border: 2px solid rgba(255,255,255,0.5);">
                        <div style="font-size: 10px; opacity: 0.9; margin-bottom: 4px;">Utilidad Neta</div>
                        <div style="font-size: 20px; font-weight: 700; color: ${data.dailyProfit.net_profit >= 0 ? '#4ade80' : '#f87171'};">${Utils.formatCurrency(data.dailyProfit.net_profit)}</div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- Gráfico de Ventas Últimos 30 Días -->
            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg);">
                <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fas fa-chart-bar"></i> Ventas Últimos 30 Días
                </h3>
                <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                    <div style="display: flex; align-items: flex-end; gap: 3px; height: 160px; position: relative;">
                        ${data.last30Days.map((day, idx) => {
                            const height = maxSales > 0 ? (day.total / maxSales * 100) : 0;
                            const isToday = idx === data.last30Days.length - 1;
                            return `
                                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative;">
                                    <div style="flex: 1; display: flex; align-items: flex-end; width: 100%; position: relative;">
                                        <div style="width: 100%; background: ${isToday ? 'linear-gradient(180deg, var(--color-primary) 0%, var(--color-accent) 100%)' : 'linear-gradient(180deg, var(--color-accent) 0%, var(--color-primary) 100%)'}; 
                                            border-radius: var(--radius-xs) var(--radius-xs) 0 0; 
                                            height: ${height}%; 
                                            min-height: ${day.total > 0 ? '4px' : '0'}; 
                                            transition: all 0.3s;
                                            cursor: pointer;
                                            position: relative;"
                                            onmouseover="this.style.opacity='0.8'; this.nextElementSibling.style.display='block';"
                                            onmouseout="this.style.opacity='1'; this.nextElementSibling.style.display='none';">
                                        </div>
                                        <div style="position: absolute; top: -30px; left: 50%; transform: translateX(-50%); 
                                            background: var(--color-text); color: white; padding: 4px 8px; 
                                            border-radius: var(--radius-xs); font-size: 10px; white-space: nowrap; 
                                            display: none; z-index: 10; pointer-events: none;">
                                            ${Utils.formatCurrency(day.total)}<br>
                                            <small>${day.count} ventas</small>
                                        </div>
                                    </div>
                                    <div style="font-size: 8px; color: var(--color-text-secondary); text-align: center; transform: rotate(-45deg); transform-origin: center; white-space: nowrap;">
                                        ${day.date}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Gráficos Comparativos -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-calendar-week"></i> Ventas por Día de la Semana
                    </h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                        <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                            ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => {
                                const stats = data.dayOfWeekStats[day] || { total: 0, count: 0 };
                                const width = maxDayOfWeek > 0 ? (stats.total / maxDayOfWeek * 100) : 0;
                                return `
                                    <div>
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                            <span style="font-size: 10px; font-weight: 600;">${day}</span>
                                            <span style="font-size: 10px; color: var(--color-text-secondary);">
                                                ${Utils.formatCurrency(stats.total)} (${stats.count})
                                            </span>
                                        </div>
                                        <div style="width: 100%; height: 16px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden;">
                                            <div style="width: ${width}%; height: 100%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 100%); transition: width 0.5s;"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-clock"></i> Ventas por Hora del Día
                    </h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                        <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                            ${Array.from({length: 24}, (_, i) => {
                                const hourKey = `${i}:00`;
                                const stats = data.hourStats[hourKey] || { total: 0, count: 0 };
                                const width = maxHour > 0 ? (stats.total / maxHour * 100) : 0;
                                if (stats.total === 0) return '';
                                return `
                                    <div>
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                            <span style="font-size: 10px; font-weight: 600;">${hourKey}</span>
                                            <span style="font-size: 10px; color: var(--color-text-secondary);">
                                                ${Utils.formatCurrency(stats.total)}
                                            </span>
                                        </div>
                                        <div style="width: 100%; height: 14px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden;">
                                            <div style="width: ${width}%; height: 100%; background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-primary) 100%); transition: width 0.5s;"></div>
                                        </div>
                                    </div>
                                `;
                            }).filter(h => h).join('')}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Top Vendedores y Productos -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--spacing-lg); margin-bottom: var(--spacing-lg);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-user-tie"></i> Top Vendedores del Mes
                    </h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                        ${data.topSellers.length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                                ${data.topSellers.map((seller, idx) => {
                                    const maxSeller = data.topSellers[0].total;
                                    const width = maxSeller > 0 ? (seller.total / maxSeller * 100) : 0;
                                    return `
                                        <div>
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                                <div>
                                                    <span style="font-weight: 600; color: var(--color-primary); font-size: 10px;">#${idx + 1}</span>
                                                    <span style="margin-left: var(--spacing-xs); font-weight: 600; font-size: 11px;">${seller.name}</span>
                                                </div>
                                                <span style="font-size: 12px; font-weight: 600;">${Utils.formatCurrency(seller.total)}</span>
                                            </div>
                                            <div style="width: 100%; height: 18px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden; position: relative;">
                                                <div style="width: ${width}%; height: 100%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 100%); transition: width 0.5s;"></div>
                                                <div style="position: absolute; right: var(--spacing-xs); top: 50%; transform: translateY(-50%); font-size: 9px; color: var(--color-text-secondary);">
                                                    ${seller.count} ventas
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md); font-size: 11px;">No hay datos</p>'}
                    </div>
                </div>
                
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-box"></i> Top Productos del Mes
                    </h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                        ${data.topProducts.length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                                ${data.topProducts.map((product, idx) => {
                                    const maxProduct = data.topProducts[0].revenue;
                                    const width = maxProduct > 0 ? (product.revenue / maxProduct * 100) : 0;
                                    return `
                                        <div>
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                                <div>
                                                    <span style="font-weight: 600; color: var(--color-accent); font-size: 10px;">#${idx + 1}</span>
                                                    <span style="margin-left: var(--spacing-xs); font-weight: 600; font-size: 11px;">${product.name}</span>
                                                </div>
                                                <span style="font-size: 12px; font-weight: 600;">${Utils.formatCurrency(product.revenue)}</span>
                                            </div>
                                            <div style="width: 100%; height: 18px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden; position: relative;">
                                                <div style="width: ${width}%; height: 100%; background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-primary) 100%); transition: width 0.5s;"></div>
                                                <div style="position: absolute; right: var(--spacing-xs); top: 50%; transform: translateY(-50%); font-size: 9px; color: var(--color-text-secondary);">
                                                    ${product.qty} unidades
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md); font-size: 11px;">No hay datos</p>'}
                    </div>
                </div>
            </div>
            
            <!-- Resumen Financiero -->
            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                        <i class="fas fa-dollar-sign"></i> Resumen Financiero del Mes
                    </h3>
                    <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                         ${(UserManager.currentUser?.role === 'admin' || UserManager.currentUser?.permissions?.includes('all')) ? `
                         <button class="btn-secondary btn-sm" id="dashboard-view-all-btn" onclick="window.Dashboard.toggleViewAll()" title="Ver todas las sucursales">
                             <i class="fas fa-building"></i> <span id="dashboard-view-all-text">Ver Todas</span>
                         </button>
                         ` : ''}
                         <button class="btn-secondary btn-sm" onclick="window.Dashboard.showPredictions()">
                             <i class="fas fa-crystal-ball"></i> Predicciones
                         </button>
                         <button class="btn-secondary btn-sm" onclick="window.Dashboard.refresh()">
                             <i class="fas fa-sync"></i> Actualizar
                         </button>
                         <button class="btn-secondary btn-sm" onclick="window.Dashboard.exportDashboard()">
                             <i class="fas fa-download"></i> Exportar
                         </button>
                     </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            <i class="fas fa-arrow-up"></i> Ingresos
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--color-success);">${Utils.formatCurrency(data.monthTotal)}</div>
                    </div>
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            <i class="fas fa-arrow-down"></i> Costos
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: var(--color-danger);">${Utils.formatCurrency(data.totalCosts)}</div>
                    </div>
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            <i class="fas fa-chart-line"></i> Utilidad
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: ${data.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                            ${Utils.formatCurrency(data.profit)}
                        </div>
                    </div>
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                            <i class="fas fa-percentage"></i> Margen
                        </div>
                        <div style="font-size: 18px; font-weight: 700; color: ${data.profitMargin >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                            ${data.profitMargin.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            <!-- Alertas Inteligentes -->
            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);" id="dashboard-alerts-section">
                <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fas fa-bell"></i> Alertas y Recomendaciones
                </h3>
                <div id="dashboard-alerts-content" style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                    ${this.generateAlertsSync(data)}
                </div>
            </div>
        `;
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
        try {
            // Recargar datos para exportación completa
            await this.loadDashboard();
            
            const today = new Date();
            // Obtener sucursal actual y filtrar ventas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
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
                ventas_hoy: todaySales.reduce((sum, s) => sum + (s.total || 0), 0),
                tickets_hoy: todaySales.length,
                ventas_mes: allSales.filter(s => {
                    const saleDate = new Date(s.created_at);
                    return saleDate.getMonth() === today.getMonth() && saleDate.getFullYear() === today.getFullYear();
                }).reduce((sum, s) => sum + (s.total || 0), 0)
            };
            
            const formatOptions = [
                { value: '1', label: 'PDF' },
                { value: '2', label: 'Excel' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Dashboard');
            if (!format) return;
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToPDF([dashboardData], `dashboard_${date}.pdf`, 'Dashboard');
            } else if (format === '2') {
                Utils.exportToExcel([dashboardData], `dashboard_${date}.xlsx`, 'Dashboard');
            }
        } catch (e) {
            console.error('Error exporting dashboard:', e);
            Utils.showNotification('Error al exportar', 'error');
        }
    },

    // Predicción de ventas basada en tendencias
    async predictSales() {
        // Obtener sucursal actual y filtrar ventas
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
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
                message: `El margen actual es ${data.profitMargin.toFixed(1)}%. Considera revisar costos o ajustar precios.`
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
            // Productos agotados
            if (data.stockStats.outOfStock > 0) {
                alerts.push({
                    type: 'danger',
                    icon: 'fa-exclamation-circle',
                    title: 'Productos Agotados',
                    message: `${data.stockStats.outOfStock} producto(s) sin stock. Revisa el inventario urgentemente.`,
                    action: 'Ver Inventario',
                    onclick: () => {
                        UI.closeModal();
                        window.location.hash = '#inventory';
                        document.querySelector('[data-module="inventory"]')?.click();
                    }
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
                    onclick: () => {
                        UI.closeModal();
                        window.location.hash = '#inventory';
                        document.querySelector('[data-module="inventory"]')?.click();
                        setTimeout(() => {
                            document.getElementById('inventory-stock-alert-filter').value = 'low';
                            window.Inventory?.loadInventory();
                        }, 500);
                    }
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
                message: `Margen de ${data.profitMargin.toFixed(1)}% y utilidad de ${Utils.formatCurrency(data.profit)}. ¡Sigue así!`
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
                            <button class="btn-secondary btn-sm" onclick="${alert.onclick ? alert.onclick.toString() : '() => {}'}" style="margin-top: 8px; font-size: 10px; padding: 4px 8px;">
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

window.Dashboard = Dashboard;

