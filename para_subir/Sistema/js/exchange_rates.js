// Exchange Rates Manager - Gestión Automática de Tipos de Cambio
//
// IMPORTANTE: usar `var` + `window` para evitar "Identifier 'ExchangeRates' has already been declared"
// si el script se carga dos veces por cache/reintentos del navegador.

var ExchangeRates = window.ExchangeRates || {
    /**
     * Obtener tipo de cambio para una fecha específica
     * @param {string} dateStr - Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)
     * @returns {Promise<{usd: number, cad: number, date: string}>}
     */
    async getExchangeRate(dateStr = null) {
        try {
            const date = dateStr || Utils.formatDate(new Date(), 'YYYY-MM-DD');
            
            // CACHE-FIRST: leer de IndexedDB primero
            const rates = await DB.query('exchange_rates_daily', 'date', date);
            if (rates && rates.length > 0) {
                const rate = rates[0];
                const result = {
                    usd: parseFloat(rate.usd_to_mxn || rate.usd || 20.00),
                    cad: parseFloat(rate.cad_to_mxn || rate.cad || 15.00),
                    date: rate.date,
                    source: 'stored'
                };
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRateByDate) {
                    Promise.resolve().then(async () => {
                        try {
                            const apiRate = await API.getExchangeRateByDate(date);
                            if (apiRate) {
                                const keyDate = apiRate.date || date;
                                const existing = await DB.query('exchange_rates_daily', 'date', keyDate);
                                const recordId = (existing && existing[0]?.id) || apiRate.id || Utils.generateId();
                                await DB.put('exchange_rates_daily', {
                                    ...apiRate, id: recordId, server_id: apiRate.id || null, date: keyDate
                                }, { autoBranchId: false });
                            }
                        } catch (e) { /* ignore */ }
                    }).catch(() => {});
                }
                return result;
            }
            
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRateByDate) {
                try {
                    const rate = await API.getExchangeRateByDate(date);
                    if (rate) {
                        const keyDate = rate.date || date;
                        const existing = await DB.query('exchange_rates_daily', 'date', keyDate);
                        const recordId = (existing && existing[0]?.id) || rate.id || Utils.generateId();
                        await DB.put('exchange_rates_daily', { ...rate, id: recordId, server_id: rate.id || null, date: keyDate }, { autoBranchId: false });
                        return { usd: parseFloat(rate.usd_to_mxn || rate.usd || 20.00), cad: parseFloat(rate.cad_to_mxn || rate.cad || 15.00), date: rate.date, source: 'api' };
                    }
                } catch (apiError) { console.warn('Error obteniendo tipo de cambio desde API:', apiError); }
            }
            
            // Si no existe, buscar en settings (fallback)
            const usdSetting = await DB.get('settings', 'exchange_rate_usd');
            const cadSetting = await DB.get('settings', 'exchange_rate_cad');
            
            return {
                usd: parseFloat(usdSetting?.value || localStorage.getItem('daily_exchange_rate') || 20.00),
                cad: parseFloat(cadSetting?.value || 15.00),
                date: date,
                source: 'fallback'
            };
        } catch (e) {
            console.error('Error getting exchange rate:', e);
            return {
                usd: 20.00,
                cad: 15.00,
                date: dateStr || Utils.formatDate(new Date(), 'YYYY-MM-DD'),
                source: 'default'
            };
        }
    },

    /**
     * Guardar tipo de cambio para una fecha específica
     * @param {string} dateStr - Fecha en formato YYYY-MM-DD
     * @param {number} usd - Tipo de cambio USD
     * @param {number} cad - Tipo de cambio CAD
     * @returns {Promise<void>}
     */
    async saveExchangeRate(dateStr, usd, cad) {
        try {
            const date = dateStr || Utils.formatDate(new Date(), 'YYYY-MM-DD');
            let apiSaved = false;
            
            // Intentar guardar con API si está disponible
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.setExchangeRate) {
                try {
                    console.log('💱 Guardando tipo de cambio con API...');
                    const rateData = await API.setExchangeRate({
                        date: date,
                        usd_to_mxn: usd,
                        cad_to_mxn: cad
                    });
                    console.log('✅ Tipo de cambio guardado con API');
                    
                    // Guardar en IndexedDB como caché (evitar violar índice único por date)
                    const existingByDate = await DB.query('exchange_rates_daily', 'date', rateData.date || date);
                    const recordId = (existingByDate && existingByDate[0]?.id) || rateData.id || Utils.generateId();
                    await DB.put('exchange_rates_daily', {
                        id: recordId,
                        server_id: rateData.id || null,
                        date: rateData.date || date,
                        usd: rateData.usd_to_mxn || rateData.usd,
                        cad: rateData.cad_to_mxn || rateData.cad,
                        created_at: (existingByDate && existingByDate[0]?.created_at) || rateData.created_at || new Date().toISOString(),
                        updated_at: rateData.updated_at || new Date().toISOString()
                    }, { autoBranchId: false });
                    apiSaved = true;
                } catch (apiError) {
                    console.warn('Error guardando tipo de cambio con API, usando modo local:', apiError);
                    // Continuar con guardado local como fallback
                }
            }

            // Si el API guardó bien, no duplicar registro local (el índice date es único).
            if (apiSaved) {
                await DB.put('settings', { key: 'exchange_rate_usd', value: usd, updated_at: new Date().toISOString() }, { autoBranchId: false });
                await DB.put('settings', { key: 'exchange_rate_cad', value: cad, updated_at: new Date().toISOString() }, { autoBranchId: false });
                localStorage.setItem('daily_exchange_rate', usd.toString());
                console.log(`Exchange rates saved for ${date}: USD ${usd}, CAD ${cad}`);
                return;
            }
            
            // Verificar si ya existe (puede haber sido guardado por API)
            const existing = await DB.query('exchange_rates_daily', 'date', date);
            let recordId;
            
            if (existing && existing.length > 0) {
                // Actualizar existente
                recordId = existing[0].id;
            } else {
                // Generar ID para nuevo registro
                recordId = Utils.generateId();
            }
            
            // Usar put en lugar de add para evitar errores de unicidad
            // put actualiza si existe o crea si no existe
            await DB.put('exchange_rates_daily', {
                id: recordId,
                date: date,
                usd: usd,
                cad: cad,
                created_at: existing && existing.length > 0 ? existing[0].created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { autoBranchId: false });
            
            // También actualizar settings para compatibilidad
            await DB.put('settings', { key: 'exchange_rate_usd', value: usd, updated_at: new Date().toISOString() }, { autoBranchId: false });
            await DB.put('settings', { key: 'exchange_rate_cad', value: cad, updated_at: new Date().toISOString() }, { autoBranchId: false });
            localStorage.setItem('daily_exchange_rate', usd.toString());
            
            console.log(`Exchange rates saved for ${date}: USD ${usd}, CAD ${cad}`);
        } catch (e) {
            console.error('Error saving exchange rate:', e);
            throw e;
        }
    },

    /**
     * Actualizar automáticamente el tipo de cambio del día actual
     * Solo actualiza si no existe o si es necesario
     * @param {boolean} force - Forzar actualización incluso si ya existe
     * @returns {Promise<{usd: number, cad: number, date: string, updated: boolean}>}
     */
    async updateTodayExchangeRate(force = false) {
        try {
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            
            // Verificar si ya existe para hoy
            if (!force) {
                const existing = await DB.query('exchange_rates_daily', 'date', today);
                if (existing && existing.length > 0) {
                    console.log(`Exchange rate for today (${today}) already exists: USD ${existing[0].usd}, CAD ${existing[0].cad}`);
                    return {
                        usd: parseFloat(existing[0].usd),
                        cad: parseFloat(existing[0].cad),
                        date: today,
                        updated: false
                    };
                }
            }
            
            // Obtener desde internet
            console.log('Fetching exchange rates from internet...');
            const rates = await Utils.fetchExchangeRates();
            
            if (rates && rates.usd && rates.cad) {
                await this.saveExchangeRate(today, rates.usd, rates.cad);
                console.log(`Exchange rates updated for ${today}: USD ${rates.usd}, CAD ${rates.cad}`);
                return {
                    usd: rates.usd,
                    cad: rates.cad,
                    date: today,
                    updated: true
                };
            } else {
                // Si falla, usar valores guardados
                const fallback = await this.getExchangeRate(today);
                console.warn('Failed to fetch exchange rates, using stored values');
                return {
                    ...fallback,
                    updated: false
                };
            }
        } catch (e) {
            console.error('Error updating exchange rate:', e);
            // En caso de error, devolver valores por defecto
            const fallback = await this.getExchangeRate();
            return {
                ...fallback,
                updated: false
            };
        }
    },

    /**
     * Inicializar tipos de cambio al iniciar la aplicación
     * Se llama automáticamente desde App.init()
     * Actualiza automáticamente el tipo de cambio del día si no existe
     */
    async init() {
        try {
            console.log('Initializing exchange rates...');
            const result = await this.updateTodayExchangeRate(false);
            
            if (result.updated) {
                console.log(`Exchange rates updated for ${result.date}: USD ${result.usd}, CAD ${result.cad}`);
            } else {
                console.log(`Exchange rates for ${result.date} already exist: USD ${result.usd}, CAD ${result.cad}`);
            }
            
            console.log('Exchange rates initialized');
        } catch (e) {
            console.error('Error initializing exchange rates:', e);
        }
    },

    /**
     * Obtener historial de tipos de cambio
     * @param {number} days - Número de días hacia atrás (por defecto 30)
     * @returns {Promise<Array>}
     */
    async getHistory(days = 30) {
        try {
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir tipos de cambio locales que NO están en el servidor
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.setExchangeRate) {
                    console.log('📤 [Paso 1 Exchange Rates] Buscando tipos de cambio locales que no están en el servidor...');
                    
                    const allLocalRates = await DB.getAll('exchange_rates_daily') || [];
                    const unsyncedRates = allLocalRates.filter(r => {
                        if (!r || !r.date) return false;
                        return !r.server_id;
                    });
                    
                    console.log(`📊 [Paso 1 Exchange Rates] Encontrados ${unsyncedRates.length} tipos de cambio locales sin sincronizar`);
                    
                    if (unsyncedRates.length > 0) {
                        let uploadedCount = 0;
                        for (const localRate of unsyncedRates) {
                            try {
                                console.log(`📤 [Paso 1 Exchange Rates] Subiendo tipo de cambio local al servidor: ${localRate.date}`);
                                
                                const rateData = await API.setExchangeRate({
                                    date: localRate.date,
                                    usd_to_mxn: localRate.usd || localRate.usd_to_mxn,
                                    cad_to_mxn: localRate.cad || localRate.cad_to_mxn
                                });
                                
                                if (rateData && rateData.id) {
                                    localRate.server_id = rateData.id;
                                    localRate.sync_status = 'synced';
                                    await DB.put('exchange_rates_daily', localRate, { autoBranchId: false });
                                    uploadedCount++;
                                }
                            } catch (uploadError) {
                                console.error(`❌ [Paso 1 Exchange Rates] Error subiendo tipo de cambio ${localRate.date}:`, uploadError);
                            }
                        }
                        
                        console.log(`✅ [Paso 1 Exchange Rates] Sincronización local→servidor completada: ${uploadedCount} tipos de cambio subidos`);
                    }
                }
            } catch (error) {
                console.error('❌ [Paso 1 Exchange Rates] Error sincronizando tipos de cambio locales al servidor:', error);
            }

            // PASO 2: Descargar tipos de cambio del servidor
            let allRates = [];
            
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRates) {
                try {
                    console.log('📥 [Paso 2 Exchange Rates] Sincronizando tipos de cambio desde el servidor...');
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    
                    allRates = await API.getExchangeRates({ start_date: startDate, end_date: endDate });
                    console.log(`📥 [Paso 2 Exchange Rates] ${allRates.length} tipos de cambio recibidos del servidor`);
                    
                    // Guardar/actualizar cada tipo de cambio en IndexedDB local
                    let savedCount = 0;
                    let updatedCount = 0;
                    for (const serverRate of allRates) {
                        try {
                            const existing = await DB.query('exchange_rates_daily', 'date', serverRate.date || serverRate.date);
                            const existingRate = existing && existing.length > 0 ? existing[0] : null;
                            
                            const localRate = {
                                ...serverRate,
                                id: existingRate?.id || serverRate.id || Utils.generateId(),
                                server_id: serverRate.id,
                                date: serverRate.date || serverRate.date,
                                usd: serverRate.usd_to_mxn || serverRate.usd,
                                cad: serverRate.cad_to_mxn || serverRate.cad,
                                sync_status: 'synced'
                            };
                            
                            await DB.put('exchange_rates_daily', localRate, { autoBranchId: false });
                            
                            if (existingRate) {
                                updatedCount++;
                            } else {
                                savedCount++;
                            }
                        } catch (error) {
                            console.warn(`⚠️ [Paso 2 Exchange Rates] Error guardando tipo de cambio ${serverRate.date}:`, error);
                        }
                    }
                    
                    console.log(`✅ [Paso 2 Exchange Rates] Sincronización servidor→local completada: ${savedCount} nuevos, ${updatedCount} actualizados`);
                } catch (apiError) {
                    console.warn('Error cargando tipos de cambio desde API, usando modo local:', apiError);
                    allRates = await DB.getAll('exchange_rates_daily') || [];
                }
            } else {
                allRates = await DB.getAll('exchange_rates_daily') || [];
            }
            
            // PASO 3: Eliminar duplicados antes de mostrar (por fecha)
            const ratesByDate = new Map();
            for (const rate of allRates) {
                const date = rate.date || rate.date;
                if (!date) continue;
                
                if (!ratesByDate.has(date)) {
                    ratesByDate.set(date, rate);
                } else {
                    const existing = ratesByDate.get(date);
                    if (rate.server_id && !existing.server_id) {
                        ratesByDate.set(date, rate);
                    } else if (existing.server_id && !rate.server_id) {
                        // Mantener el existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = rate.updated_at ? new Date(rate.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            ratesByDate.set(date, rate);
                        }
                    }
                }
            }
            allRates = Array.from(ratesByDate.values());
            console.log(`🔍 [Paso 3 Exchange Rates] Deduplicación: ${allRates.length} tipos de cambio únicos`);
            
            const sortedRates = allRates
                .sort((a, b) => new Date(b.date || b.date) - new Date(a.date || a.date))
                .slice(0, days);
            
            return sortedRates;
        } catch (e) {
            console.error('Error getting exchange rate history:', e);
            return [];
        }
    }
};

// Exponer global (y mantener compatibilidad con otros módulos que usan `ExchangeRates`)
window.ExchangeRates = ExchangeRates;
