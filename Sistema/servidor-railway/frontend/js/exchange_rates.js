// Exchange Rates Manager - Gestión Automática de Tipos de Cambio

const ExchangeRates = {
    /**
     * Obtener tipo de cambio para una fecha específica
     * @param {string} dateStr - Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)
     * @returns {Promise<{usd: number, cad: number, date: string}>}
     */
    async getExchangeRate(dateStr = null) {
        try {
            const date = dateStr || Utils.formatDate(new Date(), 'YYYY-MM-DD');
            
            // Buscar en exchange_rates_daily
            const rates = await DB.query('exchange_rates_daily', 'date', date);
            if (rates && rates.length > 0) {
                const rate = rates[0];
                return {
                    usd: parseFloat(rate.usd || 20.00),
                    cad: parseFloat(rate.cad || 15.00),
                    date: rate.date,
                    source: 'stored'
                };
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
            
            // Verificar si ya existe
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
            });
            
            // También actualizar settings para compatibilidad
            await DB.put('settings', { key: 'exchange_rate_usd', value: usd, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'exchange_rate_cad', value: cad, updated_at: new Date().toISOString() });
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
            const allRates = await DB.getAll('exchange_rates_daily') || [];
            const sortedRates = allRates
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, days);
            
            return sortedRates;
        } catch (e) {
            console.error('Error getting exchange rate history:', e);
            return [];
        }
    }
};

