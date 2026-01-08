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
                if (!s.created_at || s.status !== 'completada') return false;
                const saleDate = new Date(s.created_at);
                const saleMonth = saleDate.getMonth();
                const saleYear = saleDate.getFullYear();
                
                if (saleMonth !== month || saleYear !== year) return false;
                if (branchId && s.branch_id !== branchId) return false;
                return true;
            });
            
            const revenue = monthSales.reduce((sum, s) => sum + (s.total || 0), 0);

            // 2. COGS: Costo de productos vendidos
            let cogs = 0;
            const saleItems = await DB.getAll('sale_items') || [];
            for (const sale of monthSales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    if (item.cost) {
                        cogs += (item.cost || 0) * (item.quantity || 1);
                    }
                }
            }

            // 3. COMISIONES: Desde sale_items
            let commissions = 0;
            for (const sale of monthSales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    if (item.commission_amount) {
                        commissions += item.commission_amount;
                    }
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
                    .filter(c => 
                        c.category !== 'costo_ventas' && 
                        c.category !== 'comisiones' && 
                        c.category !== 'pago_llegadas' &&
                        c.category !== 'comisiones_bancarias'
                    )
                    .reduce((sum, c) => sum + (c.amount || 0), 0);
            }

            // 5. LLEGADAS: Costos de llegadas
            let arrivalCosts = 0;
            const arrivals = await DB.getAll('agency_arrivals') || [];
            const monthArrivals = arrivals.filter(a => {
                if (!a.date) return false;
                const arrivalDate = new Date(a.date);
                const arrivalMonth = arrivalDate.getMonth();
                const arrivalYear = arrivalDate.getFullYear();
                
                if (arrivalMonth !== month || arrivalYear !== year) return false;
                if (branchId && a.branch_id !== branchId) return false;
                return true;
            });
            
            arrivalCosts = monthArrivals.reduce((sum, a) => sum + (a.amount || 0), 0);

            // 6. COMISIONES BANCARIAS
            let bankCommissions = 0;
            const payments = await DB.getAll('payments') || [];
            const monthPayments = payments.filter(p => {
                if (!p.created_at) return false;
                const paymentDate = new Date(p.created_at);
                const paymentMonth = paymentDate.getMonth();
                const paymentYear = paymentDate.getFullYear();
                
                if (paymentMonth !== month || paymentYear !== year) return false;
                return true;
            });
            
            bankCommissions = monthPayments.reduce((sum, p) => sum + (p.bank_commission || 0), 0);

            // Calcular utilidades
            const grossProfit = revenue - cogs - arrivalCosts - operatingCosts;
            const netProfit = grossProfit - commissions - bankCommissions;
            const profitMargin = revenue > 0 ? (netProfit / revenue * 100) : 0;

            return {
                revenue,
                cogs,
                commissions,
                operatingCosts,
                arrivalCosts,
                bankCommissions,
                grossProfit,
                netProfit,
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

            // 1. REVENUE: Suma de ventas completadas del día (filtradas por sucursal)
            // NOTA: Usamos filterByBranch: false porque necesitamos todas las ventas para filtrar por fecha
            // y luego aplicar el filtro de branch_id manualmente. Esto es necesario para cálculos precisos.
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: false, // Caso especial: necesitamos todas las ventas para filtrar por fecha
                branchIdField: 'branch_id' 
            }) || [];
            const daySales = allSales.filter(s => {
                if (!s.created_at) return false;
                const saleDate = s.created_at.split('T')[0];
                return saleDate === dateYYYYMMDD && 
                       s.branch_id === branchId && 
                       s.status === 'completada';
            });
            
            const revenueSalesTotal = daySales.reduce((sum, s) => sum + (s.total || 0), 0);

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
                    if (invItem && invItem.cost) {
                        cogsTotal += (invItem.cost || 0) * (item.quantity || 1);
                    } else {
                        console.warn(`Costo faltante para item ${item.item_id} en venta ${sale.id}`);
                    }
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
                    if (item.commission_amount) {
                        commissionsTotal += item.commission_amount;
                    }
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
            const dayArrivals = arrivals.filter(a => a.branch_id === branchId);
            
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
                            arrival.passengers
                        );
                    }
                }
            }
            
            // Solo llegadas válidas: pasajeros > 0 y unidades > 0
            const branchArrivals = dayArrivals.filter(a => 
                a.passengers > 0 &&
                a.units > 0
            );
            
            const arrivalsTotal = branchArrivals.reduce((sum, a) => sum + (a.arrival_fee || 0), 0);
            const passengersTotal = branchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);

            // 5. COSTOS OPERATIVOS: Costos del día (filtrados por sucursal)
            // NOTA: Usamos filterByBranch: false porque necesitamos todos los costos para calcular prorrateos
            // y luego aplicar el filtro de branch_id manualmente
            const allCosts = await DB.getAll('cost_entries', null, null, { 
                filterByBranch: false, // Caso especial: necesitamos todos los costos para prorrateos
                branchIdField: 'branch_id' 
            }) || [];
            
            // Costos mensuales prorrateados
            const monthlyCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return c.branch_id === branchId && 
                       c.period_type === 'monthly' && 
                       c.recurring === true &&
                       costDate.getMonth() === targetDate.getMonth() &&
                       costDate.getFullYear() === targetDate.getFullYear();
            });
            
            for (const cost of monthlyCosts) {
                const costDate = new Date(cost.date || cost.created_at);
                const daysInMonth = new Date(costDate.getFullYear(), costDate.getMonth() + 1, 0).getDate();
                fixedCostsDaily += (cost.amount || 0) / daysInMonth;
            }

            // Costos semanales prorrateados
            const weeklyCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return c.branch_id === branchId && 
                       c.period_type === 'weekly' && 
                       c.recurring === true &&
                       this.isSameWeek(costDate, targetDate);
            });
            
            for (const cost of weeklyCosts) {
                fixedCostsDaily += (cost.amount || 0) / 7;
            }

            // Costos anuales prorrateados
            const annualCosts = allCosts.filter(c => {
                const costDate = new Date(c.date || c.created_at);
                const targetDate = new Date(dateYYYYMMDD);
                return c.branch_id === branchId && 
                       c.period_type === 'annual' && 
                       c.recurring === true &&
                       costDate.getFullYear() === targetDate.getFullYear();
            });
            
            for (const cost of annualCosts) {
                const daysInYear = this.isLeapYear(new Date(dateYYYYMMDD).getFullYear()) ? 366 : 365;
                fixedCostsDaily += (cost.amount || 0) / daysInYear;
            }

            // Costos variables/diarios del día específico
            const variableCostsDaily = allCosts
                .filter(c => {
                    const costDate = c.date || c.created_at;
                    const costDateStr = costDate.split('T')[0];
                    return costDateStr === dateYYYYMMDD && 
                           c.branch_id === branchId &&
                           (c.period_type === 'one_time' || c.period_type === 'daily' || !c.period_type);
                })
                .reduce((sum, c) => sum + (c.amount || 0), 0);

            // 6. UTILIDAD OPERATIVA ANTES DE IMPUESTOS
            const profitBeforeTaxes = revenueSalesTotal - 
                                     (cogsTotal + 
                                      commissionsSellersTotal + 
                                      commissionsGuidesTotal + 
                                      arrivalsTotal + 
                                      fixedCostsDaily + 
                                      variableCostsDaily);

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
            const existingReport = existingReports.find(r => r.branch_id === branchId);

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
        const reports = await DB.query('daily_profit_reports', 'date', dateYYYYMMDD);
        return reports.find(r => r.branch_id === branchId) || null;
    },

    /**
     * Obtiene reportes de utilidad en un rango de fechas
     */
    async getProfitReportsRange(dateFrom, dateTo, branchId = null) {
        const allReports = await DB.getAll('daily_profit_reports', null, null, {
            filterByBranch: branchId !== null,
            branchIdField: 'branch_id'
        }) || [];
        return allReports.filter(r => {
            const reportDate = r.date;
            const matchesDate = reportDate >= dateFrom && reportDate <= dateTo;
            const matchesBranch = !branchId || r.branch_id === branchId;
            return matchesDate && matchesBranch;
        }).sort((a, b) => a.date.localeCompare(b.date));
    }
};

window.ProfitCalculator = ProfitCalculator;

