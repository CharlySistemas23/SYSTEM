// Profit Calculation Module - Cálculo de Utilidad Diaria y Mensual

const ProfitCalculator = {
    initialized: false,
    
    init() {
        if (this.initialized) return;
        
        // Escuchar eventos para recalcular utilidad automáticamente
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.on('sale-completed', async (data) => {
                if (data.branchId) {
                    try {
                        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
                        await this.calculateDailyProfit(today, data.branchId);
                    } catch (error) {
                        console.error('Error recalculando utilidad diaria:', error);
                    }
                }
            });
        }
        
        this.initialized = true;
    },
    /**
     * Calcula la utilidad mensual para un mes y sucursal específica
     * @param {Date} monthDate - Fecha del mes (cualquier día del mes)
     * @param {string} branchId - ID de la sucursal (null para todas)
     * @returns {Promise<Object>} Objeto con todos los cálculos
     */
    async calculateMonthlyProfit(monthDate, branchId = null) {
        try {
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            
            const monthStartStr = Utils.formatDate(monthStart, 'YYYY-MM-DD');
            const monthEndStr = Utils.formatDate(monthEnd, 'YYYY-MM-DD');

            // 1. REVENUE: Suma de ventas del mes
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: branchId !== null,
                branchIdField: 'branch_id' 
            }) || [];
            
            const monthSales = allSales.filter(s => {
                if (!s.created_at || !(typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'))) return false;
                const saleDate = new Date(s.created_at);
                const saleMonth = saleDate.getMonth();
                const saleYear = saleDate.getFullYear();
                
                if (saleMonth !== month || saleYear !== year) return false;
                if (branchId && s.branch_id !== branchId) return false;
                return true;
            });

            const parseAmt = (x) => (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(x) : (parseFloat(x) || 0));
            const normalizeBranch = (x) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId ? Utils.normalizeBranchId(x) : String(x || '').trim().toLowerCase());
            const normCategory = (x) => (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey ? Utils.normalizeCategoryKey(x) : String(x || '').toLowerCase().replace(/\s+/g, '_'));
            const monthBranch = branchId ? normalizeBranch(branchId) : '';
            const revenue = monthSales.reduce((sum, s) => sum + parseAmt(s.total), 0);

            // 2. COGS: Costo de productos vendidos (usar cost en sale_items o inventory como fallback)
            let cogs = 0;
            const saleItems = await DB.getAll('sale_items') || [];
            const inventoryItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || [];
            for (const sale of monthSales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    const unitCost = (item.cost != null && item.cost !== '') ? Number(item.cost) : (inventoryItems.find(inv => inv.id === item.item_id)?.cost ?? 0);
                    cogs += unitCost * (item.quantity || 1);
                }
            }

            // 3. COMISIONES: Desde sale_items
            let commissions = 0;
            for (const sale of monthSales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    commissions += (typeof Utils !== 'undefined' && Utils.getSaleItemCommission)
                        ? Utils.getSaleItemCommission(item)
                        : (item.commission_amount != null && item.commission_amount !== ''
                            ? parseAmt(item.commission_amount)
                            : (parseAmt(item.seller_commission) + parseAmt(item.guide_commission)));
                }
            }

            // 4. COSTOS OPERATIVOS: Desde cost_entries
            let operatingCosts = 0;
            if (typeof Costs !== 'undefined') {
                const monthCosts = await Costs.getFilteredCosts({
                    branchId: branchId,
                    dateFrom: monthStartStr,
                    dateTo: monthEndStr
                });
                
                // Excluir COGS, comisiones y llegadas (ya están contabilizados)
                operatingCosts = monthCosts
                    .filter(c => {
                        if (typeof Utils !== 'undefined' && Utils.isOperationalCostCategory) {
                            return Utils.isOperationalCostCategory(c.category);
                        }
                        const key = normCategory(c.category);
                        return key !== 'costo_ventas' && key !== 'comisiones' && key !== 'pago_llegadas' && key !== 'comisiones_bancarias';
                    })
                    .reduce((sum, c) => sum + parseAmt(c.amount), 0);
            }

            // 5. LLEGADAS: Priorizar cost_entries (fuente autorizada), fallback agency_arrivals
            let arrivalCosts = 0;
            if (typeof Costs !== 'undefined') {
                const monthCostsForArrivals = await Costs.getFilteredCosts({
                    branchId: branchId,
                    dateFrom: monthStartStr,
                    dateTo: monthEndStr,
                    category: 'pago_llegadas'
                });
                arrivalCosts = monthCostsForArrivals.reduce((sum, c) => sum + parseAmt(c.amount), 0);
            }

            if (arrivalCosts === 0) {
                const arrivals = await DB.getAll('agency_arrivals') || [];
                const monthArrivals = arrivals.filter(a => {
                    if (!a.date) return false;
                    const arrivalDate = new Date(a.date);
                    const arrivalMonth = arrivalDate.getMonth();
                    const arrivalYear = arrivalDate.getFullYear();
                    
                    if (arrivalMonth !== month || arrivalYear !== year) return false;
                    if (branchId && normalizeBranch(a.branch_id) !== monthBranch) return false;
                    return true;
                });

                arrivalCosts = monthArrivals.reduce((sum, a) => sum + parseAmt(a.amount || a.arrival_fee || a.calculated_fee), 0);
            }

            // 6. COMISIONES BANCARIAS
            let bankCommissions = 0;
            const payments = await DB.getAll('payments') || [];
            const monthPayments = payments.filter(p => {
                if (!p.created_at) return false;
                const paymentDate = new Date(p.created_at);
                const paymentMonth = paymentDate.getMonth();
                const paymentYear = paymentDate.getFullYear();
                
                if (paymentMonth !== month || paymentYear !== year) return false;
                if (!branchId) return true;
                const sale = monthSales.find(s => s.id === p.sale_id);
                return !!sale;
            });
            
            bankCommissions = monthPayments.reduce((sum, p) => sum + parseAmt(p.bank_commission), 0);

            // Calcular utilidades
            const grossProfit = revenue - cogs - arrivalCosts - operatingCosts;
            const netProfit = grossProfit - commissions - bankCommissions;
            let profitMargin = revenue > 0 ? (netProfit / revenue * 100) : 0;
            // Garantizar que nunca devolvamos NaN ni undefined
            if (!Number.isFinite(profitMargin)) profitMargin = 0;

            return {
                revenue,
                cogs,
                commissions,
                operatingCosts,
                arrivalCosts,
                bankCommissions,
                grossProfit: Number.isFinite(grossProfit) ? grossProfit : 0,
                netProfit: Number.isFinite(netProfit) ? netProfit : 0,
                profitMargin,
                salesCount: monthSales.length,
                month: month + 1,
                year: year
            };
        } catch (error) {
            console.error('Error calculating monthly profit:', error);
            throw error;
        }
    },

    /**
     * Calcula la utilidad diaria antes de impuestos para una fecha y tienda específica
     * @param {string} dateYYYYMMDD - Fecha en formato YYYY-MM-DD
     * @param {string} branchId - ID de la tienda
     * @returns {Promise<Object>} Objeto con todos los cálculos y el reporte guardado
     */
    async calculateDailyProfit(dateYYYYMMDD, branchId) {
        try {
            // Validar que branchId exista
            if (!branchId) {
                throw new Error('branchId es requerido para calcular utilidad');
            }
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                throw new Error(`Sucursal ${branchId} no encontrada`);
            }
            const branchIdStr = String(branchId || '').trim();
            const normalizeBranch = (x) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId ? Utils.normalizeBranchId(x) : String(x || '').trim().toLowerCase());
            const normalizeDate = (x) => (typeof Utils !== 'undefined' && Utils.normalizeDateKey ? Utils.normalizeDateKey(x) : String(x || '').split('T')[0]);
            const normCategory = (x) => (typeof Utils !== 'undefined' && Utils.normalizeCategoryKey ? Utils.normalizeCategoryKey(x) : String(x || '').toLowerCase().replace(/\s+/g, '_'));
            const normalizedBranchId = normalizeBranch(branchIdStr);
            const parseCostAmt = (x) => (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(x) : (parseFloat(x) || 0));

            // 1. REVENUE: Suma de ventas completadas del día (filtradas por sucursal)
            // NOTA: Usamos filterByBranch: false porque necesitamos todas las ventas para filtrar por fecha
            // y luego aplicar el filtro de branch_id manualmente. Esto es necesario para cálculos precisos.
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: false, // Caso especial: necesitamos todas las ventas para filtrar por fecha
                branchIdField: 'branch_id' 
            }) || [];
            const daySales = allSales.filter(s => {
                if (!s.created_at) return false;
                  const saleDate = normalizeDate(s.created_at);
                  return saleDate === dateYYYYMMDD && 
                      normalizeBranch(s.branch_id) === normalizedBranchId && 
                       (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'));
            });
            
            const revenueSalesTotal = daySales.reduce((sum, s) => sum + parseCostAmt(s.total), 0);

            // 2. COGS: Costo de productos vendidos (filtrados por sucursal)
            let cogsTotal = 0;
            const saleItems = await DB.getAll('sale_items') || [];
            // NOTA: Usamos filterByBranch: false porque los items pueden estar en diferentes sucursales
            // y necesitamos acceder a todos para calcular COGS correctamente
            const inventoryItems = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: false, // Caso especial: items pueden estar en diferentes sucursales
                branchIdField: 'branch_id' 
            }) || [];
            
            for (const sale of daySales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    const invItem = inventoryItems.find(i => i.id === item.item_id);
                    const unitCost = (item.cost != null && item.cost !== '')
                        ? Number(item.cost)
                        : (invItem?.cost ?? 0);
                    cogsTotal += unitCost * (item.quantity || 1);
                }
            }

            // 3. COMISIONES: Sumar comisiones desde sale_items (homologado con POS y dashboard)
            let commissionsTotal = 0;
            
            // Validar que todas las ventas tengan branch_id
            const salesWithoutBranch = daySales.filter(s => !s.branch_id);
            if (salesWithoutBranch.length > 0) {
                console.warn(`${salesWithoutBranch.length} ventas sin branch_id encontradas. Asignando branch_id automáticamente...`);
                for (const sale of salesWithoutBranch) {
                    sale.branch_id = branchId;
                    await DB.put('sales', sale);
                }
            }

            // Obtener todos los sale_items de las ventas del día
            const allSaleItems = await DB.getAll('sale_items') || [];

            for (const sale of daySales) {
                const saleItems = allSaleItems.filter(si => si.sale_id === sale.id);
                
                // Sumar comisiones desde los items (ya calculadas en POS)
                for (const item of saleItems) {
                    commissionsTotal += (typeof Utils !== 'undefined' && Utils.getSaleItemCommission)
                        ? Utils.getSaleItemCommission(item)
                        : (item.commission_amount != null && item.commission_amount !== ''
                            ? parseCostAmt(item.commission_amount)
                            : (parseCostAmt(item.seller_commission) + parseCostAmt(item.guide_commission)));
                }
            }
            
            // Mantener compatibilidad con campos anteriores (pero usar el nuevo cálculo)
            const commissionsSellersTotal = commissionsTotal; // Todas las comisiones (vendedores + guías)
            const commissionsGuidesTotal = 0; // Ya están incluidas en commissionsTotal

            // 4. LLEGADAS: Costo de llegadas por agencia (solo llegadas válidas: pasajeros > 0 y unidades > 0)
            // 4. LLEGADAS: Costos de llegadas del día (filtradas por sucursal)
            // NOTA: Usamos filterByBranch: false porque necesitamos todas las llegadas para filtrar por fecha
            // y luego aplicar el filtro de branch_id manualmente
            const arrivals = await DB.query('agency_arrivals', 'date', dateYYYYMMDD, { 
                filterByBranch: false, // Caso especial: necesitamos todas las llegadas para filtrar por fecha
                branchIdField: 'branch_id' 
            }) || [];
            const dayArrivals = arrivals.filter(a => normalizeBranch(a.branch_id) === normalizedBranchId);
            
            // Validar que todas las llegadas tengan branch_id
            const arrivalsWithoutBranch = arrivals.filter(a => !a.branch_id && a.date === dateYYYYMMDD);
            if (arrivalsWithoutBranch.length > 0) {
                console.warn(`${arrivalsWithoutBranch.length} llegadas sin branch_id encontradas. Asignando branch_id automáticamente...`);
                for (const arrival of arrivalsWithoutBranch) {
                    arrival.branch_id = branchId;
                    await DB.put('agency_arrivals', arrival);
                    
                    // Registrar costo de pago de llegadas automáticamente
                    if (typeof Costs !== 'undefined' && arrival.arrival_fee > 0) {
                        await Costs.registerArrivalPayment(
                            arrival.id,
                            arrival.arrival_fee,
                            arrival.branch_id,
                            arrival.agency_id,
                            arrival.passengers,
                            arrival.date || dateYYYYMMDD // Pasar la fecha de la llegada
                        );
                    }
                }
            }
            
            // Solo llegadas válidas: pasajeros > 0 y unidades > 0
            const branchArrivals = dayArrivals.filter(a => 
                a.passengers > 0 &&
                a.units > 0
            );
            
            // 5. COSTOS OPERATIVOS: Costos del día (filtrados por sucursal)
            // NOTA: Usamos filterByBranch: false porque necesitamos todos los costos para calcular prorrateos
            // y luego aplicar el filtro de branch_id manualmente
            // IMPORTANTE: Declarar allCosts ANTES de usarlo en el cálculo de llegadas
            const allCosts = await DB.getAll('cost_entries', null, null, { 
                filterByBranch: false, // Caso especial: necesitamos todos los costos para prorrateos
                branchIdField: 'branch_id' 
            }) || [];

            // Calcular costos de llegadas desde cost_entries (fuente autorizada)
            // Si no hay costos registrados, calcular desde agency_arrivals como fallback
            let arrivalsTotal = 0;
            try {
                // Intentar obtener desde cost_entries primero
                const arrivalCostEntries = allCosts.filter(c => {
                          const costDate = c.date || c.created_at;
                          const costDateStr = normalizeDate(costDate);
                          const costBranch = normalizeBranch(c.branch_id);
                          return normCategory(c.category) === 'pago_llegadas' && 
                           costDateStr === dateYYYYMMDD &&
                              (costBranch === normalizedBranchId || !costBranch);
                });
                
                if (arrivalCostEntries.length > 0) {
                    // Usar costos registrados (fuente autorizada)
                    arrivalsTotal = arrivalCostEntries.reduce((sum, c) => sum + (typeof Utils !== 'undefined' && Utils.parseAmount ? Utils.parseAmount(c.amount) : (parseFloat(c.amount) || 0)), 0);
                } else {
                    // Fallback: calcular desde agency_arrivals si no hay costos registrados
                    arrivalsTotal = branchArrivals.reduce((sum, a) => sum + parseCostAmt(a.arrival_fee || a.calculated_fee), 0);
                    
                    // Registrar automáticamente si hay llegadas sin costo registrado
                    if (arrivalsTotal > 0 && typeof Costs !== 'undefined') {
                        for (const arrival of branchArrivals) {
                            if (arrival.arrival_fee > 0 || arrival.calculated_fee > 0) {
                                const fee = arrival.calculated_fee || arrival.arrival_fee || 0;
                                if (fee > 0) {
                                    try {
                                        await Costs.registerArrivalPayment(
                                            arrival.id,
                                            fee,
                                            arrival.branch_id,
                                            arrival.agency_id,
                                            arrival.passengers,
                                            arrival.date // Pasar la fecha de la llegada
                                        );
                                    } catch (e) {
                                        console.warn('Error registrando costo de llegada automáticamente:', e);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error calculando costos de llegadas:', e);
                // Fallback final: calcular desde agency_arrivals
                arrivalsTotal = branchArrivals.reduce((sum, a) => sum + parseCostAmt(a.arrival_fee || a.calculated_fee), 0);
            }
            
            const passengersTotal = branchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);

            // Inicializar acumulador (FIX: evitaba ReferenceError: fixedCostsDaily is not defined)
            let fixedCostsDaily = 0;
            
            // Costos mensuales prorrateados
            const monthlyCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return normalizeBranch(c.branch_id) === normalizedBranchId && 
                       c.period_type === 'monthly' && 
                       c.recurring === true &&
                       costDate.getMonth() === targetDate.getMonth() &&
                       costDate.getFullYear() === targetDate.getFullYear();
            });
            
            for (const cost of monthlyCosts) {
                // Usar 30 días fijos para prorrateo mensual (convención contable estándar)
                const DAYS_PER_MONTH = 30;
                fixedCostsDaily += parseCostAmt(cost.amount) / DAYS_PER_MONTH;
            }

            // Costos semanales prorrateados
            const weeklyCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return normalizeBranch(c.branch_id) === normalizedBranchId && 
                       c.period_type === 'weekly' && 
                       c.recurring === true &&
                       this.isSameWeek(costDate, targetDate);
            });
            
            for (const cost of weeklyCosts) {
                fixedCostsDaily += parseCostAmt(cost.amount) / 7;
            }

            // Costos anuales prorrateados
            const annualCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return normalizeBranch(c.branch_id) === normalizedBranchId && 
                       c.period_type === 'annual' && 
                       c.recurring === true &&
                       costDate.getFullYear() === targetDate.getFullYear();
            });
            
            for (const cost of annualCosts) {
                const daysInYear = this.isLeapYear(new Date(dateYYYYMMDD).getFullYear()) ? 366 : 365;
                fixedCostsDaily += parseCostAmt(cost.amount) / daysInYear;
            }

            // Costos variables/diarios del día específico (excluir recurrentes: ya se prorratean en fixedCostsDaily)
            const variableCostsDaily = allCosts
                .filter(c => {
                    const costDate = c.date || c.created_at;
                    const costDateStr = normalizeDate(costDate);
                    const categoryKey = normCategory(c.category);
                    return costDateStr === dateYYYYMMDD && 
                           normalizeBranch(c.branch_id) === normalizedBranchId &&
                           !c.recurring &&
                           (c.period_type === 'one_time' || c.period_type === 'daily' || !c.period_type) &&
                           categoryKey !== 'pago_llegadas' &&
                           categoryKey !== 'costo_ventas' &&
                           categoryKey !== 'comisiones' &&
                           categoryKey !== 'comisiones_bancarias';
                })
                .reduce((sum, c) => sum + parseCostAmt(c.amount), 0);

            // 5.1 COMISIONES BANCARIAS: pagos del día para ventas de la sucursal
            let bankCommissionsDaily = 0;
            const allPayments = await DB.getAll('payments') || [];
            for (const sale of daySales) {
                const salePayments = allPayments.filter(p => p.sale_id === sale.id);
                bankCommissionsDaily += salePayments.reduce((sum, p) => sum + parseCostAmt(p.bank_commission), 0);
            }

            // 6. UTILIDAD OPERATIVA ANTES DE IMPUESTOS
            const profitBeforeTaxes = revenueSalesTotal - 
                                     (cogsTotal + 
                                      commissionsSellersTotal + 
                                      commissionsGuidesTotal + 
                                      arrivalsTotal + 
                                      fixedCostsDaily + 
                                      variableCostsDaily +
                                      bankCommissionsDaily);

            // 7. MARGEN
            const profitMargin = revenueSalesTotal > 0 
                ? (profitBeforeTaxes / revenueSalesTotal) * 100 
                : 0;

            // 8. TIPO DE CAMBIO DEL DÍA (usar el tipo de cambio guardado para esa fecha)
            const exchangeRates = await ExchangeRates.getExchangeRate(dateYYYYMMDD);
            const exchangeRate = exchangeRates.usd;

            // 9. GUARDAR REPORTE (idempotente por date+branch_id)
            // NOTA: Usamos filterByBranch: false porque necesitamos todos los reportes para buscar el existente
            // y luego aplicar el filtro de branch_id manualmente
            const existingReports = await DB.query('daily_profit_reports', 'date', dateYYYYMMDD, { 
                filterByBranch: false, // Caso especial: necesitamos todos los reportes para buscar existente
                branchIdField: 'branch_id' 
            }) || [];
            const existingReport = existingReports.find(r => normalizeBranch(r.branch_id) === normalizedBranchId);

            const report = {
                id: existingReport?.id || Utils.generateId(),
                date: dateYYYYMMDD,
                branch_id: branchId,
                revenue_sales_total: revenueSalesTotal,
                cogs_total: cogsTotal,
                commissions_sellers_total: commissionsSellersTotal,
                commissions_guides_total: commissionsGuidesTotal,
                arrivals_total: arrivalsTotal,
                fixed_costs_daily: fixedCostsDaily,
                variable_costs_daily: variableCostsDaily,
                profit_before_taxes: profitBeforeTaxes,
                profit_margin: profitMargin,
                passengers_total: passengersTotal,
                bank_commissions: bankCommissionsDaily,
                exchange_rate: exchangeRate,
                created_at: existingReport?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('daily_profit_reports', report);
            await SyncManager.addToQueue('daily_profit_report', report.id);

            return {
                report,
                calculations: {
                    revenue: revenueSalesTotal,
                    cogs: cogsTotal,
                    commissionsSellers: commissionsSellersTotal,
                    commissionsGuides: commissionsGuidesTotal,
                    arrivals: arrivalsTotal,
                    fixedCosts: fixedCostsDaily,
                    variableCosts: variableCostsDaily,
                    bankCommissions: bankCommissionsDaily,
                    profit: profitBeforeTaxes,
                    margin: profitMargin,
                    passengers: passengersTotal
                }
            };
        } catch (e) {
            console.error('Error calculating daily profit:', e);
            throw e;
        }
    },

    /**
     * Verifica si dos fechas están en la misma semana
     */
    isSameWeek(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        d1.setHours(0, 0, 0, 0);
        d2.setHours(0, 0, 0, 0);
        
        const day1 = d1.getDay();
        const day2 = d2.getDay();
        const diff1 = d1.getDate() - day1;
        const diff2 = d2.getDate() - day2;
        
        const week1 = new Date(d1.setDate(diff1));
        const week2 = new Date(d2.setDate(diff2));
        
        return week1.getTime() === week2.getTime();
    },

    /**
     * Verifica si un año es bisiesto
     */
    isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    },

    /**
     * Obtiene un reporte de utilidad diaria existente
     */
    async getDailyProfitReport(dateYYYYMMDD, branchId) {
        const normalizeBranch = (x) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId ? Utils.normalizeBranchId(x) : String(x || '').trim().toLowerCase());
        const reports = await DB.query('daily_profit_reports', 'date', dateYYYYMMDD);
        const branchKey = normalizeBranch(branchId);
        return reports.find(r => normalizeBranch(r.branch_id) === branchKey) || null;
    },

    /**
     * Obtiene reportes de utilidad en un rango de fechas
     */
    async getProfitReportsRange(dateFrom, dateTo, branchId = null) {
        const normalizeBranch = (x) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId ? Utils.normalizeBranchId(x) : String(x || '').trim().toLowerCase());
        const allReports = await DB.getAll('daily_profit_reports', null, null, {
            filterByBranch: branchId !== null,
            branchIdField: 'branch_id'
        }) || [];
        const branchKey = branchId ? normalizeBranch(branchId) : null;
        return allReports.filter(r => {
            const reportDate = r.date;
            const matchesDate = reportDate >= dateFrom && reportDate <= dateTo;
            const matchesBranch = !branchKey || normalizeBranch(r.branch_id) === branchKey;
            return matchesDate && matchesBranch;
        }).sort((a, b) => a.date.localeCompare(b.date));
    },

    async collectHistoricalScope(options = {}) {
        const normalizeDate = (v) => (typeof Utils !== 'undefined' && Utils.normalizeDateKey)
            ? Utils.normalizeDateKey(v)
            : String(v || '').split('T')[0];
        const normalizeBranch = (v) => (typeof Utils !== 'undefined' && Utils.normalizeBranchId)
            ? Utils.normalizeBranchId(v)
            : String(v || '').trim().toLowerCase();

        const {
            dateFrom = null,
            dateTo = null,
            branchIds = null,
            includeReportsDates = true
        } = options;

        const branches = await DB.getAll('catalog_branches') || [];
        const catalogBranchIds = branches
            .map(b => b?.id)
            .filter(Boolean)
            .map(normalizeBranch)
            .filter(Boolean);

        let effectiveBranchIds;
        if (Array.isArray(branchIds) && branchIds.length > 0) {
            const requested = branchIds.map(normalizeBranch).filter(Boolean);
            effectiveBranchIds = requested.filter(id => catalogBranchIds.includes(id));
        } else {
            effectiveBranchIds = catalogBranchIds;
        }

        const allSales = await DB.getAll('sales', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || [];
        const allCosts = await DB.getAll('cost_entries', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || [];
        const allArrivals = await DB.getAll('agency_arrivals', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || [];
        const allReports = includeReportsDates ? (await DB.getAll('daily_profit_reports', null, null, { filterByBranch: false, branchIdField: 'branch_id' }) || []) : [];

        const dateSet = new Set();
        const pushDate = (raw) => {
            const d = normalizeDate(raw);
            if (d) dateSet.add(d);
        };

        allSales.forEach(s => pushDate(s?.created_at));
        allCosts.forEach(c => pushDate(c?.date || c?.created_at));
        allArrivals.forEach(a => pushDate(a?.date || a?.created_at));
        allReports.forEach(r => pushDate(r?.date));

        let dates = Array.from(dateSet).sort();
        if (dateFrom) {
            const from = normalizeDate(dateFrom);
            if (from) dates = dates.filter(d => d >= from);
        }
        if (dateTo) {
            const to = normalizeDate(dateTo);
            if (to) dates = dates.filter(d => d <= to);
        }

        return {
            dates,
            branchIds: effectiveBranchIds,
            stats: {
                dates: dates.length,
                branches: effectiveBranchIds.length,
                operations: dates.length * effectiveBranchIds.length
            }
        };
    },

    async rebuildHistoricalDailyReports(options = {}) {
        const {
            dateFrom = null,
            dateTo = null,
            branchIds = null,
            onProgress = null
        } = options;

        const scope = await this.collectHistoricalScope({
            dateFrom,
            dateTo,
            branchIds,
            includeReportsDates: true
        });

        const result = {
            startedAt: new Date().toISOString(),
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            scope: scope.stats,
            processed: 0,
            success: 0,
            failed: 0,
            errors: []
        };

        const totalOps = scope.stats.operations;
        if (totalOps === 0) {
            result.finishedAt = new Date().toISOString();
            return result;
        }

        for (const date of scope.dates) {
            for (const branchId of scope.branchIds) {
                try {
                    await this.calculateDailyProfit(date, branchId);
                    result.success += 1;
                } catch (error) {
                    result.failed += 1;
                    result.errors.push({
                        date,
                        branchId,
                        message: error?.message || String(error)
                    });
                } finally {
                    result.processed += 1;
                    if (typeof onProgress === 'function') {
                        try {
                            onProgress({
                                processed: result.processed,
                                total: totalOps,
                                percent: Math.round((result.processed / totalOps) * 100)
                            });
                        } catch (e) {
                            console.warn('onProgress callback error:', e);
                        }
                    }
                }
            }
        }

        result.finishedAt = new Date().toISOString();
        return result;
    }
};

window.ProfitCalculator = ProfitCalculator;

