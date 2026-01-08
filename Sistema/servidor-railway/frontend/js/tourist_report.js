// Arrivals Module - Gestión de Llegadas por Pasajeros por Día
// Módulo simplificado: solo maneja llegadas, las ventas se registran en el módulo POS

const TouristReport = {
    initialized: false,

    async init() {
        if (this.initialized) {
            await this.displayArrivals();
            return;
        }
        this.setupUI();
        await this.displayArrivals();
        this.initialized = true;
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        // Estructura simplificada - solo llegadas
        content.innerHTML = '<div id="arrivals-container"></div>';
    },

    async getOverviewTab() {
        const stats = await this.getReportStats();
        const recentReports = await this.getRecentReports(5);
        const topSellers = await this.getTopSellers(5);
        const topAgencies = await this.getTopAgencies(5);

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="kpi-card">
                    <div class="kpi-label">Reportes Totales</div>
                    <div class="kpi-value">${stats.totalReports}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.openReports} abiertos
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Total Vendido</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.totalSales)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.totalLines} renglones
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Comisiones Totales</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.totalCommissions)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Vendedores: ${Utils.formatCurrency(stats.commSellers)}
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Promedio por Reporte</div>
                    <div class="kpi-value">${Utils.formatCurrency(stats.avgPerReport)}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.avgLinesPerReport} renglones/reporte
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-clock"></i> Reportes Recientes
                    </h3>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${recentReports.length === 0 ? 
                            '<p style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay reportes</p>' :
                            recentReports.map(report => `
                                <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 11px; cursor: pointer;" onclick="window.TouristReport.viewReport('${report.id}')">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span><strong>${Utils.formatDate(report.date, 'DD/MM/YYYY')}</strong></span>
                                        <span style="color: var(--color-text-secondary);">${Utils.formatCurrency(report.total)}</span>
                                    </div>
                                    <div style="color: var(--color-text-secondary); font-size: 10px; margin-top: 2px;">
                                        ${report.status === 'cerrado' ? '<span class="status-badge status-disponible">Cerrado</span>' : '<span class="status-badge status-reservado">Abierto</span>'} • ${report.lineCount || 0} renglones
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-user-tag"></i> Top Vendedores
                    </h3>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${topSellers.length === 0 ? 
                            '<p style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay datos</p>' :
                            topSellers.map(seller => `
                                <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 11px;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span><strong>${seller.name}</strong></span>
                                        <span style="font-weight: 600;">${Utils.formatCurrency(seller.total)}</span>
                                    </div>
                                    <div style="color: var(--color-text-secondary); font-size: 10px; margin-top: 2px;">
                                        ${seller.count} ventas • ${Utils.formatCurrency(seller.commission)} comisión
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-building"></i> Top Agencias
                    </h3>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${topAgencies.length === 0 ? 
                            '<p style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay datos</p>' :
                            topAgencies.map(agency => `
                                <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 11px;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span><strong>${agency.name}</strong></span>
                                        <span style="font-weight: 600;">${Utils.formatCurrency(agency.total)}</span>
                                    </div>
                                    <div style="color: var(--color-text-secondary); font-size: 10px; margin-top: 2px;">
                                        ${agency.count} reportes • ${agency.guideCount} guías
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    },

    async getHistoryTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md);">
                <div class="form-group" style="flex: 1;">
                    <input type="text" id="history-search" class="form-input" placeholder="Buscar por fecha, sucursal...">
                </div>
                <div class="form-group" style="width: 150px;">
                    <select id="history-status-filter" class="form-select">
                        <option value="all">Todos</option>
                        <option value="abierto">Abiertos</option>
                        <option value="cerrado">Cerrados</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px;">
                    <input type="date" id="history-date-from" class="form-input" placeholder="Desde">
                </div>
                <div class="form-group" style="width: 150px;">
                    <input type="date" id="history-date-to" class="form-input" placeholder="Hasta">
                </div>
                <button class="btn-secondary btn-sm" id="history-export"><i class="fas fa-download"></i> Exportar</button>
            </div>
            <div id="history-list" style="max-height: 600px; overflow-y: auto;">
                <div class="empty-state">Cargando historial...</div>
            </div>
        `;
    },

    async getAnalyticsTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-line"></i> Tendencia de Ventas
                    </h3>
                    <div id="sales-trend-chart" style="height: 250px; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary);">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-pie"></i> Distribución por Moneda
                    </h3>
                    <div id="currency-distribution-chart" style="height: 250px; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-bar"></i> Ventas por Día de la Semana
                    </h3>
                    <div id="day-of-week-chart" style="height: 250px; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); width: 100%; overflow: hidden;">
                        Cargando gráfico...
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-percentage"></i> Análisis de Comisiones
                    </h3>
                    <div id="commission-analysis" style="min-height: 250px; width: 100%; overflow: hidden;">
                        Cargando análisis...
                    </div>
                </div>
            </div>
        `;
    },

    async getReconciliationTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md); width: 100%; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <label>Fecha del Reporte</label>
                    <input type="date" id="recon-date" class="form-input" value="${Utils.formatDate(new Date(), 'YYYY-MM-DD')}" style="width: 100%;">
                </div>
                <div class="form-group" style="flex-shrink: 0;">
                    <label>&nbsp;</label>
                    <button class="btn-primary" onclick="window.TouristReport.runReconciliation()" style="white-space: nowrap;">
                        <i class="fas fa-balance-scale"></i> Ejecutar Conciliación
                    </button>
                </div>
            </div>
            <div id="reconciliation-results" style="min-height: 400px; width: 100%; overflow-x: auto;">
                <div class="empty-state">Selecciona una fecha y ejecuta la conciliación</div>
            </div>
        `;
    },

    async displayArrivals() {
        const container = document.getElementById('arrivals-container');
        if (!container) return;

        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        const branch = branchId ? await DB.get('catalog_branches', branchId) : null;
        const branchName = branch?.name || 'Tienda 1';

        container.innerHTML = `
            <div style="max-width: 100%;">
                <!-- HEADER -->
                <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-bottom: var(--spacing-lg); border: 1px solid var(--color-border-light); width: 100%; box-sizing: border-box;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); align-items: end; width: 100%;">
                        <div class="form-group" style="margin-bottom: 0; min-width: 0;">
                            <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: var(--spacing-xs);">DÍA</label>
                            <input type="date" id="arrivals-date" class="form-input" value="${today}" style="font-size: 13px; width: 100%;" onchange="window.TouristReport.changeDate(this.value)">
                        </div>
                        <div class="form-group" style="margin-bottom: 0; min-width: 0;">
                            <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: var(--spacing-xs);">TIENDA</label>
                            <input type="text" class="form-input" value="${branchName}" readonly style="font-size: 13px; width: 100%;">
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN DE LLEGADAS / PAX POR AGENCIA -->
                <div class="arrivals-section" style="background: var(--color-bg-card); padding: var(--spacing-lg); border-radius: var(--radius-md); margin-bottom: var(--spacing-lg); border: 2px solid var(--color-primary); width: 100%; box-sizing: border-box;">
                    <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-md); flex-wrap: wrap;">
                        <h3 style="margin: 0; font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">
                            <i class="fas fa-plane-arrival"></i> LLEGADAS / PASAJEROS POR AGENCIA
                        </h3>
                        <div style="flex: 1; height: 1px; background: var(--color-border); min-width: 100px;"></div>
                    </div>
                    <div id="arrivals-table-container" style="width: 100%; overflow-x: auto;">
                        ${await this.getArrivalsTableHTML(branchId, today)}
                    </div>
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-sm); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-sm);">
                        <div style="text-align: center;">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">TOTAL PAX GENERAL</div>
                            <div style="font-size: 18px; font-weight: 700; color: var(--color-primary);" id="arrivals-total-pax">0</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">TOTAL $ LLEGADAS</div>
                            <div style="font-size: 18px; font-weight: 700; color: var(--color-accent);" id="arrivals-total-fee">$0.00</div>
                        </div>
                    </div>
                </div>

                <!-- NOTA INFORMATIVA -->
                <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary); margin-top: var(--spacing-lg);">
                    <p style="margin: 0; font-size: 12px; color: var(--color-text-secondary);">
                        <i class="fas fa-info-circle"></i> <strong>Nota:</strong> Las ventas se registran automáticamente en el módulo POS al escanear piezas, guías y vendedores. Este módulo solo maneja el registro de llegadas por pasajeros por día.
                    </p>
                </div>
            </div>
        `;

        // Setup event listeners
        this.setupArrivalsListeners();
        await this.recalculateArrivalsOnLoad();
    },

    async changeDate(date) {
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const container = document.getElementById('arrivals-table-container');
        if (container) {
            container.innerHTML = await this.getArrivalsTableHTML(branchId, date);
            await this.recalculateArrivalsOnLoad();
        }
    },

    setupArrivalsListeners() {
        // Los listeners de la tabla de llegadas se configuran en getArrivalsTableHTML
        // Solo necesitamos recalcular totales después de cargar
        setTimeout(async () => {
            await this.updateArrivalsTotals();
        }, 200);
    },

    setupTotalsListeners() {
        // Recalculate when additional changes
        document.getElementById('tr-additional')?.addEventListener('input', () => {
            this.calculateTotals();
        });

        // Recalculate when observations change
        document.getElementById('tr-observations')?.addEventListener('blur', () => {
            this.calculateTotals();
        });

        // Recalculate when card totals change
        document.getElementById('tr-total-amex')?.addEventListener('input', () => {
            this.calculateTotals();
        });

        document.getElementById('tr-total-discovery')?.addEventListener('input', () => {
            this.calculateTotals();
        });
        
        // Recalcular costos de llegadas después de renderizar
        setTimeout(async () => {
            await this.recalculateArrivalsOnLoad();
        }, 200);
    },

    setupMasterFormListeners(exchangeRateUsd, exchangeRateCad) {
        const masterInput = document.getElementById('tr-master-input');
        
        if (!masterInput) return;

        // Enter key to parse and add line
        masterInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await this.parseAndAddLine(masterInput.value, exchangeRateUsd, exchangeRateCad);
                masterInput.value = '';
                masterInput.focus();
            }
        });

        // Focus on load
        setTimeout(() => masterInput.focus(), 100);
    },

    async parseAndAddLine(inputText, exchangeRateUsd, exchangeRateCad) {
        if (!this.currentReport) {
            Utils.showNotification('No hay reporte activo', 'error');
            return;
        }

        if (!inputText || !inputText.trim()) {
            Utils.showNotification('Ingresa datos en el cuadro maestro', 'error');
            return;
        }

        // Parse input: "carlos, sebastian, travelex, 12, anillo de diamantes, 120 mxn, 12 gramos"
        const parts = inputText.split(',').map(p => p.trim()).filter(p => p);
        
        if (parts.length < 4) {
            Utils.showNotification('Formato incorrecto. Usa: Vendedor, Guía, Agencia, Cantidad, Productos, Precio [Moneda], Peso', 'error');
            return;
        }

        // Get catalogs
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];

        // Parse fields
        let sellerName = parts[0] || '';
        let guideName = parts[1] || '';
        let agencyName = parts[2] || '';
        let quantity = parseInt(parts[3]) || 1;
        let products = parts[4] || '';
        let priceText = parts[5] || '0';
        let weightText = parts[6] || '0';

        // Extract price and currency from priceText (e.g., "120 mxn", "120000mxn", "50 usd", "30 cad")
        // Mejorado para aceptar formato con o sin espacio entre número y moneda
        let price = 0;
        let currency = 'MXN';
        
        // Primero intentar extraer número y moneda juntos (con o sin espacio)
        // Patrón: número seguido opcionalmente de espacio y luego moneda
        const priceMatchWithCurrency = priceText.match(/([\d,]+\.?[\d]*)\s*(mxn|usd|cad)/i);
        if (priceMatchWithCurrency) {
            // Remover comas de miles y convertir a número
            const priceStr = priceMatchWithCurrency[1].replace(/,/g, '');
            price = parseFloat(priceStr) || 0;
            currency = priceMatchWithCurrency[2].toUpperCase();
        } else {
            // Si no hay moneda, intentar extraer solo el número
            const numberMatch = priceText.match(/([\d,]+\.?[\d]*)/);
            if (numberMatch) {
                const priceStr = numberMatch[1].replace(/,/g, '');
                price = parseFloat(priceStr) || 0;
            } else {
                price = parseFloat(priceText.replace(/,/g, '')) || 0;
            }
        }

        // Extract weight (remove "gramos" or "g" if present)
        // Mejorado para manejar diferentes formatos: "5g", "5 gramos", "5.5g", etc.
        let weight = 0;
        const weightMatch = weightText.match(/([\d,]+\.?[\d]*)\s*(g|gramos|gramo)?/i);
        if (weightMatch) {
            const weightStr = weightMatch[1].replace(/,/g, '');
            weight = parseFloat(weightStr) || 0;
        } else {
            // Si no hay match, intentar extraer solo el número
            const numberMatch = weightText.match(/([\d,]+\.?[\d]*)/);
            if (numberMatch) {
                const weightStr = numberMatch[1].replace(/,/g, '');
                weight = parseFloat(weightStr) || 0;
            } else {
                weight = parseFloat(weightText.replace(/,/g, '')) || 0;
            }
        }

        // Find IDs by name (case insensitive, partial match)
        const seller = sellers.find(s => s.name.toLowerCase().includes(sellerName.toLowerCase()) || sellerName.toLowerCase().includes(s.name.toLowerCase()));
        const guide = guides.find(g => g.name.toLowerCase().includes(guideName.toLowerCase()) || guideName.toLowerCase().includes(g.name.toLowerCase()));
        const agency = agencies.find(a => a.name.toLowerCase().includes(agencyName.toLowerCase()) || agencyName.toLowerCase().includes(a.name.toLowerCase()));

        if (!seller) {
            Utils.showNotification(`Vendedor "${sellerName}" no encontrado`, 'error');
            return;
        }

        if (!guide) {
            Utils.showNotification(`Guía "${guideName}" no encontrado`, 'error');
            return;
        }

        if (!agency) {
            Utils.showNotification(`Agencia "${agencyName}" no encontrada`, 'error');
            return;
        }

        if (!products) {
            Utils.showNotification('Ingresa la descripción de los productos', 'error');
            return;
        }

        if (price <= 0) {
            Utils.showNotification('Ingresa un precio válido', 'error');
            return;
        }

        // Calculate amounts in each currency (solo USD y CAD)
        let cashCad = 0;
        let cashUsd = 0;
        let cashMxn = 0;
        let total = 0;

        if (currency === 'CAD') {
            cashCad = price * quantity;
            total = cashCad * exchangeRateCad;
        } else if (currency === 'USD') {
            cashUsd = price * quantity;
            total = cashUsd * exchangeRateUsd;
        } else { // MXN
            cashMxn = price * quantity;
            total = cashMxn;
        }

        const line = {
            id: Utils.generateId(),
            report_id: this.currentReport.id,
            sale_id: null,
            identification: '',
            seller_id: seller.id,
            guide_id: guide.id,
            agency_id: agency.id,
            quantity: quantity,
            weight_g: weight,
            products: products,
            exchange_rate: exchangeRateUsd,
            cash_eur: 0,
            cash_cad: cashCad,
            cash_usd: cashUsd,
            cash_mxn: cashMxn,
            tpv_visa_mc: 0,
            tpv_amex: 0,
            total: total,
            created_at: new Date().toISOString()
        };

        await DB.add('tourist_report_lines', line);
        this.loadLines();
        Utils.showNotification('Renglón agregado correctamente', 'success');
    },


    async loadLines() {
        if (!this.currentReport) return;

        try {
            const lines = await DB.query('tourist_report_lines', 'report_id', this.currentReport.id);
            const tbody = document.getElementById('tr-lines-tbody');
            if (!tbody) return;

            if (lines.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No hay renglones. Agrega uno desde el formulario superior.</td></tr>';
                this.calculateTotals();
                return;
            }

            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];

            // Función helper para escape HTML
            const escapeHtml = (text) => {
                if (!text) return '';
                const map = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;'
                };
                return String(text).replace(/[&<>"']/g, (m) => map[m]);
            };

            tbody.innerHTML = lines.map((line, idx) => {
                const seller = sellers.find(s => s.id === line.seller_id);
                const guide = guides.find(g => g.id === line.guide_id);
                const agency = agencies.find(a => a.id === line.agency_id);

                return `
                    <tr class="tourist-line" data-line-id="${line.id}" style="border-bottom: 1px solid var(--color-border-light);">
                        <td style="padding: 10px 8px; font-size: 12px;">${escapeHtml(seller?.name || '-')}</td>
                        <td style="padding: 10px 8px; font-size: 12px;">${escapeHtml(guide?.name || '-')}</td>
                        <td style="padding: 10px 8px; font-size: 12px;">${escapeHtml(agency?.name || '-')}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: center;">${line.quantity || 0}</td>
                        <td style="padding: 10px 8px; font-size: 12px;">${escapeHtml(line.products || '')}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right;">${line.cash_cad > 0 ? Utils.formatCurrency(line.cash_cad, 'CAD') : '-'}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right;">${line.cash_usd > 0 ? Utils.formatCurrency(line.cash_usd, 'USD') : '-'}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right;">${line.cash_mxn > 0 ? Utils.formatCurrency(line.cash_mxn) : '-'}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right;">${line.tpv_visa_mc > 0 ? Utils.formatCurrency(line.tpv_visa_mc) : '-'}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right;">${line.tpv_amex > 0 ? Utils.formatCurrency(line.tpv_amex) : '-'}</td>
                        <td style="padding: 10px 8px; font-size: 12px; text-align: right; font-weight: 600; border-left: 2px solid var(--color-border);">${Utils.formatCurrency(line.total || 0)}</td>
                        <td style="padding: 10px 8px;">
                            <button class="btn-secondary" onclick="window.TouristReport.editLine('${line.id}')" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;">Editar</button>
                            <button class="btn-danger" onclick="window.TouristReport.deleteLine('${line.id}')" style="padding: 4px 8px; font-size: 11px;">X</button>
                        </td>
                    </tr>
                `;
            }).join('');

            this.calculateTotals();
        } catch (e) {
            console.error('Error loading lines:', e);
        }
    },

    async editLine(lineId) {
        const line = await DB.get('tourist_report_lines', lineId);
        if (!line) return;

        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];

        // Get exchange rates
        const exchangeUsd = await DB.get('settings', 'exchange_rate_usd');
        const exchangeEur = await DB.get('settings', 'exchange_rate_eur');
        const exchangeCad = await DB.get('settings', 'exchange_rate_cad');
        
        const exchangeRateUsd = parseFloat(exchangeUsd?.value || '20.00');
        const exchangeRateEur = parseFloat(exchangeEur?.value || '22.00');
        const exchangeRateCad = parseFloat(exchangeCad?.value || '15.00');

        const body = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="form-group" style="min-width: 0;">
                    <label>Vendedor</label>
                    <select id="line-seller" class="form-select" style="width: 100%;">
                        <option value="">Seleccionar...</option>
                        ${sellers.filter(s => s.active).map(s => `<option value="${s.id}" ${line.seller_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Guía</label>
                    <select id="line-guide" class="form-select" style="width: 100%;">
                        <option value="">Seleccionar...</option>
                        ${guides.filter(g => g.active).map(g => `<option value="${g.id}" ${line.guide_id === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Agencia</label>
                    <select id="line-agency" class="form-select" style="width: 100%;">
                        <option value="">Seleccionar...</option>
                        ${agencies.filter(a => a.active).map(a => `<option value="${a.id}" ${line.agency_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Cantidad</label>
                    <input type="number" id="line-quantity" class="form-input" value="${line.quantity || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Peso (g)</label>
                    <input type="number" id="line-weight" class="form-input" step="0.01" value="${line.weight_g || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0; grid-column: 1 / -1;">
                    <label>Productos</label>
                    <input type="text" id="line-products" class="form-input" value="${(line.products || '').replace(/"/g, '&quot;')}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Cash CAD</label>
                    <input type="number" id="line-cash-cad" class="form-input" step="0.01" value="${line.cash_cad || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Cash USD</label>
                    <input type="number" id="line-cash-usd" class="form-input" step="0.01" value="${line.cash_usd || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>Cash PESOS</label>
                    <input type="number" id="line-cash-mxn" class="form-input" step="0.01" value="${line.cash_mxn || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>TPV VISA-MC</label>
                    <input type="number" id="line-tpv-visa" class="form-input" step="0.01" value="${line.tpv_visa_mc || 0}" style="width: 100%;">
                </div>
                <div class="form-group" style="min-width: 0;">
                    <label>TPV AMEX</label>
                    <input type="number" id="line-tpv-amex" class="form-input" step="0.01" value="${line.tpv_amex || 0}" style="width: 100%;">
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.TouristReport.saveLine('${lineId}')">Guardar</button>
        `;

        UI.showModal('Editar Renglón', body, footer);
    },

    async saveLine(lineId) {
        const line = await DB.get('tourist_report_lines', lineId);
        if (!line) return;

        const cashCad = parseFloat(document.getElementById('line-cash-cad')?.value || 0);
        const cashUsd = parseFloat(document.getElementById('line-cash-usd')?.value || 0);
        const cashMxn = parseFloat(document.getElementById('line-cash-mxn')?.value || 0);
        const tpvVisaMc = parseFloat(document.getElementById('line-tpv-visa')?.value || 0);
        const tpvAmex = parseFloat(document.getElementById('line-tpv-amex')?.value || 0);

        // Get exchange rates (solo USD y CAD)
        const exchangeUsd = await DB.get('settings', 'exchange_rate_usd');
        const exchangeCad = await DB.get('settings', 'exchange_rate_cad');
        
        const exchangeRateUsd = parseFloat(exchangeUsd?.value || '20.00');
        const exchangeRateCad = parseFloat(exchangeCad?.value || '15.00');

        // Calculate total
        const total = (cashCad * exchangeRateCad) + (cashUsd * exchangeRateUsd) + 
                     cashMxn + tpvVisaMc + tpvAmex;

        line.seller_id = document.getElementById('line-seller')?.value || null;
        line.guide_id = document.getElementById('line-guide')?.value || null;
        line.agency_id = document.getElementById('line-agency')?.value || null;
        line.quantity = parseInt(document.getElementById('line-quantity')?.value || 0);
        line.weight_g = parseFloat(document.getElementById('line-weight')?.value || 0);
        line.products = document.getElementById('line-products')?.value || '';
        line.cash_eur = 0;
        line.cash_cad = cashCad;
        line.cash_usd = cashUsd;
        line.cash_mxn = cashMxn;
        line.tpv_visa_mc = tpvVisaMc;
        line.tpv_amex = tpvAmex;
        line.total = total;
        line.exchange_rate = exchangeRateUsd;

        await DB.put('tourist_report_lines', line);
        UI.closeModal();
        this.loadLines();
    },

    async deleteLine(lineId) {
        if (await Utils.confirm('¿Eliminar este renglón?')) {
            await DB.delete('tourist_report_lines', lineId);
            this.loadLines();
        }
    },

    async calculateTotals() {
        if (!this.currentReport) return;

        try {
            const lines = await DB.query('tourist_report_lines', 'report_id', this.currentReport.id);
            
            let totalCashUsd = 0;
            let totalCashMxn = 0;
            let totalCashCad = 0;
            let totalTpvVisaMc = 0;
            let totalTpvAmex = 0;
            let subtotal = 0;

            lines.forEach(line => {
                totalCashUsd += (line.cash_usd || 0);
                totalCashMxn += (line.cash_mxn || 0);
                totalCashCad += (line.cash_cad || 0);
                totalTpvVisaMc += (line.tpv_visa_mc || 0);
                totalTpvAmex += (line.tpv_amex || 0);
                subtotal += (line.total || 0);
            });

            // Calculate commissions
            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const commissionRules = await DB.getAll('commission_rules') || [];

            let commSellers = 0;
            let commGuides = 0;

            for (const line of lines) {
                if (line.seller_id) {
                    const seller = sellers.find(s => s.id === line.seller_id);
                    if (seller) {
                        const rule = commissionRules.find(r => r.entity_type === 'seller' && r.entity_id === seller.id);
                        if (rule) {
                            commSellers += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                        }
                    }
                }
                if (line.guide_id) {
                    const guide = guides.find(g => g.id === line.guide_id);
                    if (guide) {
                        const rule = commissionRules.find(r => r.entity_type === 'guide' && r.entity_id === guide.id);
                        if (rule) {
                            commGuides += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                        }
                    }
                }
            }

            // Update display
            const additional = parseFloat(document.getElementById('tr-additional')?.value || 0);
            const total = subtotal + additional;

            const commSellersEl = document.getElementById('tr-comm-sellers');
            const commGuidesEl = document.getElementById('tr-comm-guides');
            const totalCashUsdEl = document.getElementById('tr-total-cash-usd');
            const totalCashMxnEl = document.getElementById('tr-total-cash-mxn');
            const subtotalEl = document.getElementById('tr-subtotal');
            const totalEl = document.getElementById('tr-total');

            if (commSellersEl) commSellersEl.value = Utils.formatCurrency(commSellers);
            if (commGuidesEl) commGuidesEl.value = Utils.formatCurrency(commGuides);
            if (totalCashUsdEl) totalCashUsdEl.value = Utils.formatCurrency(totalCashUsd, 'USD');
            if (totalCashMxnEl) totalCashMxnEl.value = Utils.formatCurrency(totalCashMxn);
            if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
            if (totalEl) totalEl.textContent = Utils.formatCurrency(total);

            // Obtener Total PAX de llegadas para métricas (desde inputs visibles, no datos guardados)
            let totalPaxGeneral = 0;
            const tbody = document.getElementById('arrivals-tbody');
            if (tbody) {
                const rows = tbody.querySelectorAll('tr[data-agency-id]');
                rows.forEach(row => {
                    const paxInput = row.querySelector('.arrival-pax');
                    const unitsInput = row.querySelector('.arrival-units');
                    const pax = parseInt(paxInput?.value || 0);
                    const units = parseInt(unitsInput?.value || 0);
                    // Solo contar si hay pasajeros Y unidades válidas
                    if (pax > 0 && units > 0) {
                        totalPaxGeneral += pax;
                    }
                });
            }
            
            // Calcular Ticket Promedio y % Cierre usando Total PAX de llegadas
            const exchangeRateUsd = parseFloat(this.currentReport.exchange_rate_usd || localStorage.getItem('daily_exchange_rate') || '20.00');
            const ticketPromedio = totalPaxGeneral > 0 ? total / totalPaxGeneral / exchangeRateUsd : 0;
            const cierrePct = totalPaxGeneral > 0 ? (lines.length / totalPaxGeneral) * 100 : 0;

            // Update report
            this.currentReport.total_cash_usd = totalCashUsd;
            this.currentReport.total_cash_mxn = totalCashMxn;
            this.currentReport.total_cash_cad = totalCashCad;
            this.currentReport.subtotal = subtotal;
            this.currentReport.additional = additional;
            this.currentReport.total = total;
            this.currentReport.observations = document.getElementById('tr-observations')?.value || '';
            this.currentReport.total_pax_general = totalPaxGeneral;
            this.currentReport.ticket_promedio = ticketPromedio;
            this.currentReport.cierre_pct = cierrePct;
            this.currentReport.updated_at = new Date().toISOString();
            
            await DB.put('tourist_reports', this.currentReport);
        } catch (e) {
            console.error('Error calculating totals:', e);
        }
    },

    async closeReport() {
        if (this.currentReport.status === 'cerrado') {
            Utils.showNotification('El reporte ya está cerrado', 'info');
            return;
        }

        // Save observations and additional
        this.currentReport.observations = document.getElementById('tr-observations')?.value || '';
        this.currentReport.additional = parseFloat(document.getElementById('tr-additional')?.value || 0);
        await this.calculateTotals();

        this.currentReport.status = 'cerrado';
        this.currentReport.updated_at = new Date().toISOString();
        await DB.put('tourist_reports', this.currentReport);
        await SyncManager.addToQueue('tourist_report', this.currentReport.id);
        
        Utils.showNotification('Reporte cerrado', 'success');
        this.displayReport();
    },

    async reconcile() {
        if (!this.currentReport) return;

        try {
            const today = this.currentReport.date;
            const branchId = this.currentReport.branch_id;
            
            // Obtener ventas filtradas por sucursal
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Normalizar branch_id para comparación
            const normalizedBranchId = branchId ? String(branchId) : null;
            const todaySales = sales.filter(s => {
                if (!s.created_at?.startsWith(today) || s.status !== 'completada') return false;
                if (!normalizedBranchId) return true;
                const saleBranchId = s.branch_id != null ? String(s.branch_id) : null;
                return saleBranchId === normalizedBranchId;
            });

            const lines = await DB.query('tourist_report_lines', 'report_id', this.currentReport.id);
            
            let posCashUsd = 0, posCashMxn = 0, posCashCad = 0;
            let posTpvVisaMc = 0, posTpvAmex = 0;

            for (const sale of todaySales) {
                const payments = await DB.query('payments', 'sale_id', sale.id);
                payments.forEach(p => {
                    if (p.currency === 'USD') posCashUsd += p.amount;
                    if (p.currency === 'MXN' && p.method_id?.includes('CASH')) posCashMxn += p.amount;
                    if (p.currency === 'CAD') posCashCad += p.amount;
                    if (p.method_id?.includes('VISA')) posTpvVisaMc += p.amount;
                    if (p.method_id?.includes('AMEX')) posTpvAmex += p.amount;
                });
            }

            let reportCashUsd = 0, reportCashMxn = 0, reportCashCad = 0;
            let reportTpvVisaMc = 0, reportTpvAmex = 0;

            lines.forEach(line => {
                reportCashUsd += (line.cash_usd || 0);
                reportCashMxn += (line.cash_mxn || 0);
                reportCashCad += (line.cash_cad || 0);
                reportTpvVisaMc += (line.tpv_visa_mc || 0);
                reportTpvAmex += (line.tpv_amex || 0);
            });

            const body = `
                <h4>Conciliación: Reporte Turistas vs POS</h4>
                <table class="cart-table" style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Reporte Turistas</th>
                            <th>POS</th>
                            <th>Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Cash USD</td>
                            <td>${Utils.formatCurrency(reportCashUsd, 'USD')}</td>
                            <td>${Utils.formatCurrency(posCashUsd, 'USD')}</td>
                            <td style="color: ${Math.abs(reportCashUsd - posCashUsd) > 0.01 ? 'red' : 'green'}">${Utils.formatCurrency(Math.abs(reportCashUsd - posCashUsd), 'USD')}</td>
                        </tr>
                        <tr>
                            <td>Cash MXN</td>
                            <td>${Utils.formatCurrency(reportCashMxn)}</td>
                            <td>${Utils.formatCurrency(posCashMxn)}</td>
                            <td style="color: ${Math.abs(reportCashMxn - posCashMxn) > 0.01 ? 'red' : 'green'}">${Utils.formatCurrency(Math.abs(reportCashMxn - posCashMxn))}</td>
                        </tr>
                        <tr>
                            <td>TPV Visa/MC</td>
                            <td>${Utils.formatCurrency(reportTpvVisaMc)}</td>
                            <td>${Utils.formatCurrency(posTpvVisaMc)}</td>
                            <td style="color: ${Math.abs(reportTpvVisaMc - posTpvVisaMc) > 0.01 ? 'red' : 'green'}">${Utils.formatCurrency(Math.abs(reportTpvVisaMc - posTpvVisaMc))}</td>
                        </tr>
                        <tr>
                            <td>TPV Amex</td>
                            <td>${Utils.formatCurrency(reportTpvAmex)}</td>
                            <td>${Utils.formatCurrency(posTpvAmex)}</td>
                            <td style="color: ${Math.abs(reportTpvAmex - posTpvAmex) > 0.01 ? 'red' : 'green'}">${Utils.formatCurrency(Math.abs(reportTpvAmex - posTpvAmex))}</td>
                        </tr>
                    </tbody>
                </table>
                <p style="margin-top: 20px;"><strong>Ventas POS del día:</strong> ${todaySales.length}</p>
                <p><strong>Renglones en Reporte:</strong> ${lines.length}</p>
            `;

            UI.showModal('Conciliación Reporte Turistas vs POS', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        } catch (e) {
            console.error('Error in reconciliation:', e);
            Utils.showNotification('Error en conciliación', 'error');
        }
    },

    async exportReport() {
        if (!this.currentReport) {
            Utils.showNotification('No hay reporte para exportar', 'error');
            return;
        }

        try {
            const lines = await DB.query('tourist_report_lines', 'report_id', this.currentReport.id);
            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];

            // Obtener llegadas del día (solo válidas: passengers > 0 && units > 0)
            const arrivals = await DB.query('agency_arrivals', 'date', this.currentReport.date);
            const branchArrivals = arrivals.filter(a => 
                a.branch_id === this.currentReport.branch_id &&
                a.passengers > 0 &&
                a.units > 0
            );
            const totalPaxGeneral = branchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
            const totalArrivalsFee = branchArrivals.reduce((sum, a) => sum + (a.arrival_fee || 0), 0);

            const exportData = lines.map(line => {
                const seller = sellers.find(s => s.id === line.seller_id);
                const guide = guides.find(g => g.id === line.guide_id);
                const agency = agencies.find(a => a.id === line.agency_id);
                return {
                    ID: line.identification || '',
                    Vendedor: seller?.name || '',
                    Guía: guide?.name || '',
                    Agencia: agency?.name || '',
                    Cantidad: line.quantity || 0,
                    'Peso (g)': line.weight_g || 0,
                    Productos: line.products || '',
                    'Tipo Cambio': line.exchange_rate || 0,
                    'Cash CAD': line.cash_cad || 0,
                    'Cash USD': line.cash_usd || 0,
                    'Cash PESOS': line.cash_mxn || 0,
                    'TPV VISA-MC': line.tpv_visa_mc || 0,
                    'TPV AMEX': line.tpv_amex || 0,
                    Total: line.total || 0
                };
            });

            // Agregar sección de llegadas
            const arrivalsData = branchArrivals.map(arrival => {
                const agency = agencies.find(a => a.id === arrival.agency_id);
                return {
                    Agencia: agency?.name || '',
                    PAX: arrival.passengers || 0,
                    Unidades: arrival.units || 1,
                    'Tipo Unidad': arrival.unit_type || '-',
                    'Costo Calculado': arrival.calculated_fee || 0,
                    'Override': arrival.override ? 'Sí' : 'No',
                    'Monto Override': arrival.override_amount || 0,
                    'Motivo Override': arrival.override_reason || '',
                    'Costo Total': arrival.arrival_fee || 0,
                    Notas: arrival.notes || ''
                };
            });

            // Agregar totales de llegadas
            if (arrivalsData.length > 0) {
                exportData.push({});
                exportData.push({
                    '---': '--- LLEGADAS / PASAJEROS POR AGENCIA ---',
                    '---2': '',
                    '---3': '',
                    '---4': '',
                    '---5': '',
                    '---6': '',
                    '---7': '',
                    '---8': '',
                    '---9': '',
                    '---10': ''
                });
                exportData.push(...arrivalsData);
                exportData.push({});
                exportData.push({
                    '---': 'TOTAL PAX GENERAL',
                    '---2': totalPaxGeneral,
                    '---3': '',
                    '---4': '',
                    '---5': '',
                    '---6': '',
                    '---7': '',
                    '---8': '',
                    '---9': '',
                    '---10': ''
                });
                exportData.push({
                    '---': 'TOTAL $ LLEGADAS',
                    '---2': totalArrivalsFee,
                    '---3': '',
                    '---4': '',
                    '---5': '',
                    '---6': '',
                    '---7': '',
                    '---8': '',
                    '---9': '',
                    '---10': ''
                });
            }

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Reporte');
            if (!format) return;
            
            const date = Utils.formatDate(new Date(this.currentReport.date), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `reporte_turistas_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `reporte_turistas_${date}.xlsx`, 'Reporte Turistas');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `reporte_turistas_${date}.pdf`, `Reporte Turistas - ${Utils.formatDate(this.currentReport.date, 'DD/MM/YYYY')}`, {
                    orientation: 'landscape',
                    format: 'a4'
                });
            }

            Utils.showNotification('Reporte exportado', 'success');
        } catch (e) {
            console.error('Error exporting report:', e);
            Utils.showNotification('Error al exportar', 'error');
        }
    },

    async getReportStats() {
        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }
        
        const lines = await DB.getAll('tourist_report_lines') || [];
        
        const totalReports = reports.length;
        const openReports = reports.filter(r => r.status === 'abierto').length;
        const totalSales = reports.reduce((sum, r) => sum + (r.total || 0), 0);
        const totalLines = lines.length;
        const avgPerReport = totalReports > 0 ? totalSales / totalReports : 0;
        const avgLinesPerReport = totalReports > 0 ? totalLines / totalReports : 0;

        // Calcular comisiones
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const commissionRules = await DB.getAll('commission_rules') || [];

        let commSellers = 0;
        let commGuides = 0;

        for (const line of lines) {
            if (line.seller_id) {
                const seller = sellers.find(s => s.id === line.seller_id);
                if (seller) {
                    const rule = commissionRules.find(r => r.entity_type === 'seller' && r.entity_id === seller.id);
                    if (rule) {
                        commSellers += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                    }
                }
            }
            if (line.guide_id) {
                const guide = guides.find(g => g.id === line.guide_id);
                if (guide) {
                    const rule = commissionRules.find(r => r.entity_type === 'guide' && r.entity_id === guide.id);
                    if (rule) {
                        commGuides += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                    }
                }
            }
        }

        return {
            totalReports,
            openReports,
            totalSales,
            totalLines,
            avgPerReport,
            avgLinesPerReport,
            commSellers,
            commGuides,
            totalCommissions: commSellers + commGuides
        };
    },

    async getRecentReports(limit = 5) {
        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }
        
        const lines = await DB.getAll('tourist_report_lines') || [];

        return reports
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit)
            .map(report => {
                const reportLines = lines.filter(l => l.report_id === report.id);
                return {
                    ...report,
                    lineCount: reportLines.length
                };
            });
    },

    async getTopSellers(limit = 5) {
        const lines = await DB.getAll('tourist_report_lines') || [];
        const sellers = await DB.getAll('catalog_sellers') || [];
        const commissionRules = await DB.getAll('commission_rules') || [];

        const sellerMap = {};

        lines.forEach(line => {
            if (line.seller_id) {
                if (!sellerMap[line.seller_id]) {
                    sellerMap[line.seller_id] = {
                        id: line.seller_id,
                        total: 0,
                        count: 0,
                        commission: 0
                    };
                }
                sellerMap[line.seller_id].total += line.total || 0;
                sellerMap[line.seller_id].count += 1;

                const seller = sellers.find(s => s.id === line.seller_id);
                if (seller) {
                    const rule = commissionRules.find(r => r.entity_type === 'seller' && r.entity_id === seller.id);
                    if (rule) {
                        sellerMap[line.seller_id].commission += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                    }
                }
            }
        });

        return Object.values(sellerMap)
            .map(s => ({
                ...s,
                name: sellers.find(seller => seller.id === s.id)?.name || 'Desconocido'
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    },

    async getTopAgencies(limit = 5) {
        const lines = await DB.getAll('tourist_report_lines') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];
        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }

        const agencyMap = {};

        lines.forEach(line => {
            if (line.agency_id) {
                if (!agencyMap[line.agency_id]) {
                    agencyMap[line.agency_id] = {
                        id: line.agency_id,
                        total: 0,
                        count: 0,
                        guideIds: new Set()
                    };
                }
                agencyMap[line.agency_id].total += line.total || 0;
                if (line.guide_id) {
                    agencyMap[line.agency_id].guideIds.add(line.guide_id);
                }
            }
        });

        // Contar reportes únicos por agencia
        const agencyReports = {};
        reports.forEach(report => {
            const reportLines = lines.filter(l => l.report_id === report.id);
            reportLines.forEach(line => {
                if (line.agency_id) {
                    if (!agencyReports[line.agency_id]) {
                        agencyReports[line.agency_id] = new Set();
                    }
                    agencyReports[line.agency_id].add(report.id);
                }
            });
        });

        return Object.values(agencyMap)
            .map(a => ({
                ...a,
                name: agencies.find(agency => agency.id === a.id)?.name || 'Desconocida',
                count: agencyReports[a.id]?.size || 0,
                guideCount: a.guideIds.size
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, limit);
    },

    async loadHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;

        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('history-status-filter')?.value || 'all';
        const dateFrom = document.getElementById('history-date-from')?.value || '';
        const dateTo = document.getElementById('history-date-to')?.value || '';

        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }
        
        const lines = await DB.getAll('tourist_report_lines') || [];

        // Aplicar filtros
        if (statusFilter !== 'all') {
            reports = reports.filter(r => r.status === statusFilter);
        }

        if (dateFrom) {
            reports = reports.filter(r => r.date >= dateFrom);
        }

        if (dateTo) {
            reports = reports.filter(r => r.date <= dateTo);
        }

        if (search) {
            reports = reports.filter(r => 
                r.date.includes(search) ||
                r.observations?.toLowerCase().includes(search)
            );
        }

        reports.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (reports.length === 0) {
            container.innerHTML = '<div class="empty-state">No se encontraron reportes</div>';
            return;
        }

        const branches = await DB.getAll('catalog_branches') || [];

        container.innerHTML = `
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Sucursal</th>
                        <th>Estado</th>
                        <th>Renglones</th>
                        <th>Total</th>
                        <th>Comisiones</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(await Promise.all(reports.map(async (report) => {
                        const reportLines = lines.filter(l => l.report_id === report.id);
                        const branch = branches.find(b => b.id === report.branch_id);
                        
                        // Calcular comisiones
                        const sellers = await DB.getAll('catalog_sellers') || [];
                        const guides = await DB.getAll('catalog_guides') || [];
                        const commissionRules = await DB.getAll('commission_rules') || [];
                        
                        let commTotal = 0;
                        reportLines.forEach(line => {
                            if (line.seller_id) {
                                const seller = sellers.find(s => s.id === line.seller_id);
                                if (seller) {
                                    const rule = commissionRules.find(r => r.entity_type === 'seller' && r.entity_id === seller.id);
                                    if (rule) {
                                        commTotal += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                                    }
                                }
                            }
                            if (line.guide_id) {
                                const guide = guides.find(g => g.id === line.guide_id);
                                if (guide) {
                                    const rule = commissionRules.find(r => r.entity_type === 'guide' && r.entity_id === guide.id);
                                    if (rule) {
                                        commTotal += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                                    }
                                }
                            }
                        });

                        return `
                            <tr>
                                <td>${Utils.formatDate(report.date, 'DD/MM/YYYY')}</td>
                                <td>${branch?.name || 'N/A'}</td>
                                <td><span class="status-badge status-${report.status === 'cerrado' ? 'disponible' : 'reservado'}">${report.status === 'cerrado' ? 'Cerrado' : 'Abierto'}</span></td>
                                <td>${reportLines.length}</td>
                                <td style="font-weight: 600;">${Utils.formatCurrency(report.total || 0)}</td>
                                <td>${Utils.formatCurrency(commTotal)}</td>
                                <td>
                                    <button class="btn-secondary btn-xs" onclick="window.TouristReport.viewReport('${report.id}')">
                                        <i class="fas fa-eye"></i> Ver
                                    </button>
                                    <button class="btn-secondary btn-xs" onclick="window.TouristReport.exportReportById('${report.id}')">
                                        <i class="fas fa-download"></i> Exportar
                                    </button>
                                </td>
                            </tr>
                        `;
                    }))).join('')}
                </tbody>
            </table>
        `;

        // Event listeners
        document.getElementById('history-search')?.addEventListener('input', Utils.debounce(() => this.loadHistory(), 300));
        document.getElementById('history-status-filter')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-date-from')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-date-to')?.addEventListener('change', () => this.loadHistory());
        document.getElementById('history-export')?.addEventListener('click', () => this.exportHistory());
    },

    async loadAnalytics() {
        await this.renderSalesTrend();
        await this.renderCurrencyDistribution();
        await this.renderDayOfWeekChart();
        await this.renderCommissionAnalysis();
    },

    async renderSalesTrend() {
        const container = document.getElementById('sales-trend-chart');
        if (!container) return;

        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }
        
        const last30Days = reports
            .filter(r => {
                const reportDate = new Date(r.date);
                const daysAgo = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24);
                return daysAgo <= 30;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const dailyTotals = {};
        last30Days.forEach(report => {
            if (!dailyTotals[report.date]) {
                dailyTotals[report.date] = 0;
            }
            dailyTotals[report.date] += report.total || 0;
        });

        const dates = Object.keys(dailyTotals).sort();
        const maxValue = Math.max(...Object.values(dailyTotals), 1);

        if (dates.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        container.innerHTML = `
            <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: var(--spacing-xs); overflow-y: auto; max-height: 250px;">
                ${dates.map(date => {
                    const value = dailyTotals[date];
                    const percentage = (value / maxValue) * 100;
                    return `
                        <div style="display: flex; align-items: center; gap: var(--spacing-xs); font-size: 10px; min-width: 0; width: 100%;">
                            <div style="width: 60px; text-align: right; flex-shrink: 0;">${Utils.formatDate(date, 'DD/MM')}</div>
                            <div style="flex: 1; height: 20px; background: var(--color-bg-secondary); border-radius: 4px; overflow: hidden; position: relative; min-width: 0;">
                                <div style="height: 100%; width: ${percentage}%; background: var(--gradient-accent); transition: width 0.3s;"></div>
                                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 0 var(--spacing-xs); font-size: 9px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${Utils.formatCurrency(value)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderCurrencyDistribution() {
        const container = document.getElementById('currency-distribution-chart');
        if (!container) return;

        const lines = await DB.getAll('tourist_report_lines') || [];
        
        let totalCad = 0, totalUsd = 0, totalMxn = 0, totalTpv = 0;

        lines.forEach(line => {
            totalCad += (line.cash_cad || 0);
            totalUsd += (line.cash_usd || 0);
            totalMxn += (line.cash_mxn || 0);
            totalTpv += (line.tpv_visa_mc || 0) + (line.tpv_amex || 0);
        });

        const total = totalCad + totalUsd + totalMxn + totalTpv;
        if (total === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';
            return;
        }

        const percentages = {
            CAD: (totalCad / total) * 100,
            USD: (totalUsd / total) * 100,
            MXN: (totalMxn / total) * 100,
            TPV: (totalTpv / total) * 100
        };

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm);">
                ${Object.entries(percentages).map(([currency, pct]) => {
                    if (pct === 0) return '';
                    return `
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs); font-size: 11px;">
                                <span><strong>${currency}</strong></span>
                                <span>${pct.toFixed(1)}%</span>
                            </div>
                            <div style="height: 8px; background: var(--color-bg-secondary); border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; width: ${pct}%; background: ${currency === 'CAD' ? 'var(--color-info)' : currency === 'USD' ? 'var(--color-success)' : currency === 'MXN' ? 'var(--color-accent)' : 'var(--color-warning)'}; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderDayOfWeekChart() {
        const container = document.getElementById('day-of-week-chart');
        if (!container) return;

        // Obtener sucursal actual y filtrar reportes
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'admin' || 
            UserManager.currentUser?.permissions?.includes('all')
        );
        const viewAllBranches = isAdmin;
        
        let reports = await DB.getAll('tourist_reports', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && currentBranchId) {
            const normalizedBranchId = String(currentBranchId);
            reports = reports.filter(r => {
                if (!r.branch_id) return true;
                return String(r.branch_id) === normalizedBranchId;
            });
        }
        
        const dayTotals = {
            'Lunes': 0, 'Martes': 0, 'Miércoles': 0, 'Jueves': 0,
            'Viernes': 0, 'Sábado': 0, 'Domingo': 0
        };

        reports.forEach(report => {
            const date = new Date(report.date);
            const dayOfWeek = date.getDay();
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            dayTotals[dayNames[dayOfWeek]] += report.total || 0;
        });

        const maxValue = Math.max(...Object.values(dayTotals), 1);

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                ${Object.entries(dayTotals).map(([day, value]) => {
                    const percentage = (value / maxValue) * 100;
                    return `
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 10px;">
                                <span>${day.substring(0, 3)}</span>
                                <span style="font-weight: 600;">${Utils.formatCurrency(value)}</span>
                            </div>
                            <div style="height: 6px; background: var(--color-bg-secondary); border-radius: 3px; overflow: hidden;">
                                <div style="height: 100%; width: ${percentage}%; background: var(--gradient-accent); transition: width 0.3s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderCommissionAnalysis() {
        const container = document.getElementById('commission-analysis');
        if (!container) return;

        const lines = await DB.getAll('tourist_report_lines') || [];
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const commissionRules = await DB.getAll('commission_rules') || [];

        let totalSales = 0;
        let totalCommissions = 0;

        lines.forEach(line => {
            totalSales += line.total || 0;
            
            if (line.seller_id) {
                const seller = sellers.find(s => s.id === line.seller_id);
                if (seller) {
                    const rule = commissionRules.find(r => r.entity_type === 'seller' && r.entity_id === seller.id);
                    if (rule) {
                        totalCommissions += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                    }
                }
            }
            if (line.guide_id) {
                const guide = guides.find(g => g.id === line.guide_id);
                if (guide) {
                    const rule = commissionRules.find(r => r.entity_type === 'guide' && r.entity_id === guide.id);
                    if (rule) {
                        totalCommissions += Utils.calculateCommission(line.total, rule.discount_pct, rule.multiplier);
                    }
                }
            }
        });

        const commissionRate = totalSales > 0 ? (totalCommissions / totalSales) * 100 : 0;

        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
                <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Tasa de Comisión</div>
                    <div style="font-size: 24px; font-weight: 700; color: var(--color-accent);">${commissionRate.toFixed(2)}%</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm);">
                    <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); text-align: center;">
                        <div style="font-size: 10px; color: var(--color-text-secondary);">Ventas Totales</div>
                        <div style="font-size: 14px; font-weight: 600;">${Utils.formatCurrency(totalSales)}</div>
                    </div>
                    <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); text-align: center;">
                        <div style="font-size: 10px; color: var(--color-text-secondary);">Comisiones</div>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-success);">${Utils.formatCurrency(totalCommissions)}</div>
                    </div>
                </div>
            </div>
        `;
    },

    async loadReconciliation() {
        // Esta función se ejecuta cuando el usuario hace clic en "Ejecutar Conciliación"
    },

    async runReconciliation() {
        const date = document.getElementById('recon-date')?.value;
        if (!date) {
            Utils.showNotification('Selecciona una fecha', 'warning');
            return;
        }

        await this.reconcileForDate(date);
    },

    async reconcileForDate(date) {
        const container = document.getElementById('reconciliation-results');
        if (!container) return;

        try {
            const reports = await DB.query('tourist_reports', 'date', date);
            const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
            const report = reports.find(r => r.branch_id === branchId);

            if (!report) {
                container.innerHTML = '<div class="empty-state">No hay reporte para esta fecha</div>';
                return;
            }

            const lines = await DB.query('tourist_report_lines', 'report_id', report.id);
            const sales = await DB.getAll('sales') || [];
            const todaySales = sales.filter(s => 
                s.created_at?.startsWith(date) && 
                s.branch_id === branchId &&
                s.status === 'completada'
            );

            let reportCashUsd = 0, reportCashMxn = 0, reportCashCad = 0;
            let reportTpvVisaMc = 0, reportTpvAmex = 0;

            lines.forEach(line => {
                reportCashUsd += (line.cash_usd || 0);
                reportCashMxn += (line.cash_mxn || 0);
                reportCashCad += (line.cash_cad || 0);
                reportTpvVisaMc += (line.tpv_visa_mc || 0);
                reportTpvAmex += (line.tpv_amex || 0);
            });

            let posCashUsd = 0, posCashMxn = 0, posCashCad = 0;
            let posTpvVisaMc = 0, posTpvAmex = 0;

            for (const sale of todaySales) {
                const payments = await DB.query('payments', 'sale_id', sale.id);
                payments.forEach(p => {
                    if (p.currency === 'USD') posCashUsd += p.amount;
                    if (p.currency === 'MXN' && p.method_id?.includes('CASH')) posCashMxn += p.amount;
                    if (p.currency === 'CAD') posCashCad += p.amount;
                    if (p.method_id?.includes('VISA') || p.method_id?.includes('MC')) posTpvVisaMc += p.amount;
                    if (p.method_id?.includes('AMEX')) posTpvAmex += p.amount;
                });
            }

            const differences = {
                cashUsd: reportCashUsd - posCashUsd,
                cashMxn: reportCashMxn - posCashMxn,
                cashCad: reportCashCad - posCashCad,
                tpvVisaMc: reportTpvVisaMc - posTpvVisaMc,
                tpvAmex: reportTpvAmex - posTpvAmex
            };

            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                    <div class="kpi-card" style="min-width: 0;">
                        <div class="kpi-label">Ventas POS</div>
                        <div class="kpi-value">${todaySales.length}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0;">
                        <div class="kpi-label">Renglones Reporte</div>
                        <div class="kpi-value">${lines.length}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0;">
                        <div class="kpi-label">Diferencia Total</div>
                        <div class="kpi-value" style="color: ${Math.abs(differences.cashUsd + differences.cashMxn + differences.cashCad + differences.tpvVisaMc + differences.tpvAmex) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                            ${Utils.formatCurrency(Math.abs(differences.cashUsd + differences.cashMxn + differences.cashCad + differences.tpvVisaMc + differences.tpvAmex))}
                        </div>
                    </div>
                </div>

                <table class="cart-table" style="width: 100%; min-width: 600px;">
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Reporte Turistas</th>
                            <th>POS</th>
                            <th>Diferencia</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Cash USD</strong></td>
                            <td>${Utils.formatCurrency(reportCashUsd, 'USD')}</td>
                            <td>${Utils.formatCurrency(posCashUsd, 'USD')}</td>
                            <td style="font-weight: 600; color: ${Math.abs(differences.cashUsd) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ${Utils.formatCurrency(Math.abs(differences.cashUsd), 'USD')}
                            </td>
                            <td>${Math.abs(differences.cashUsd) > 0.01 ? '<span class="status-badge status-reservado">Desajuste</span>' : '<span class="status-badge status-disponible">OK</span>'}</td>
                        </tr>
                        <tr>
                            <td><strong>Cash MXN</strong></td>
                            <td>${Utils.formatCurrency(reportCashMxn)}</td>
                            <td>${Utils.formatCurrency(posCashMxn)}</td>
                            <td style="font-weight: 600; color: ${Math.abs(differences.cashMxn) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ${Utils.formatCurrency(Math.abs(differences.cashMxn))}
                            </td>
                            <td>${Math.abs(differences.cashMxn) > 0.01 ? '<span class="status-badge status-reservado">Desajuste</span>' : '<span class="status-badge status-disponible">OK</span>'}</td>
                        </tr>
                        <tr>
                            <td><strong>Cash CAD</strong></td>
                            <td>${Utils.formatCurrency(reportCashCad, 'CAD')}</td>
                            <td>${Utils.formatCurrency(posCashCad, 'CAD')}</td>
                            <td style="font-weight: 600; color: ${Math.abs(differences.cashCad) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ${Utils.formatCurrency(Math.abs(differences.cashCad), 'CAD')}
                            </td>
                            <td>${Math.abs(differences.cashCad) > 0.01 ? '<span class="status-badge status-reservado">Desajuste</span>' : '<span class="status-badge status-disponible">OK</span>'}</td>
                        </tr>
                        <tr>
                            <td><strong>TPV Visa/MC</strong></td>
                            <td>${Utils.formatCurrency(reportTpvVisaMc)}</td>
                            <td>${Utils.formatCurrency(posTpvVisaMc)}</td>
                            <td style="font-weight: 600; color: ${Math.abs(differences.tpvVisaMc) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ${Utils.formatCurrency(Math.abs(differences.tpvVisaMc))}
                            </td>
                            <td>${Math.abs(differences.tpvVisaMc) > 0.01 ? '<span class="status-badge status-reservado">Desajuste</span>' : '<span class="status-badge status-disponible">OK</span>'}</td>
                        </tr>
                        <tr>
                            <td><strong>TPV Amex</strong></td>
                            <td>${Utils.formatCurrency(reportTpvAmex)}</td>
                            <td>${Utils.formatCurrency(posTpvAmex)}</td>
                            <td style="font-weight: 600; color: ${Math.abs(differences.tpvAmex) > 0.01 ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ${Utils.formatCurrency(Math.abs(differences.tpvAmex))}
                            </td>
                            <td>${Math.abs(differences.tpvAmex) > 0.01 ? '<span class="status-badge status-reservado">Desajuste</span>' : '<span class="status-badge status-disponible">OK</span>'}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Error in reconciliation:', e);
            container.innerHTML = '<div class="empty-state">Error al ejecutar conciliación</div>';
        }
    },

    async viewReport(reportId) {
        const report = await DB.get('tourist_reports', reportId);
        if (!report) {
            Utils.showNotification('Reporte no encontrado', 'error');
            return;
        }

        this.currentReport = report;
        await this.loadTab('report');
    },

    async exportReportById(reportId) {
        const report = await DB.get('tourist_reports', reportId);
        if (!report) {
            Utils.showNotification('Reporte no encontrado', 'error');
            return;
        }

        this.currentReport = report;
        await this.exportReport();
    },

    async exportHistory() {
        const search = document.getElementById('history-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('history-status-filter')?.value || 'all';
        const dateFrom = document.getElementById('history-date-from')?.value || '';
        const dateTo = document.getElementById('history-date-to')?.value || '';

        let reports = await DB.getAll('tourist_reports') || [];
        const lines = await DB.getAll('tourist_report_lines') || [];
        const branches = await DB.getAll('catalog_branches') || [];

        // Aplicar mismos filtros que en loadHistory
        if (statusFilter !== 'all') {
            reports = reports.filter(r => r.status === statusFilter);
        }
        if (dateFrom) {
            reports = reports.filter(r => r.date >= dateFrom);
        }
        if (dateTo) {
            reports = reports.filter(r => r.date <= dateTo);
        }
        if (search) {
            reports = reports.filter(r => 
                r.date.includes(search) ||
                r.observations?.toLowerCase().includes(search)
            );
        }

        const exportData = reports.map(report => {
            const reportLines = lines.filter(l => l.report_id === report.id);
            const branch = branches.find(b => b.id === report.branch_id);
            return {
                'Fecha': Utils.formatDate(report.date, 'DD/MM/YYYY'),
                'Sucursal': branch?.name || 'N/A',
                'Estado': report.status === 'cerrado' ? 'Cerrado' : 'Abierto',
                'Renglones': reportLines.length,
                'Total': report.total || 0,
                'Cash USD': report.total_cash_usd || 0,
                'Cash MXN': report.total_cash_mxn || 0,
                'Cash CAD': report.total_cash_cad || 0,
                'Observaciones': report.observations || ''
            };
        });

        const date = Utils.formatDate(new Date(), 'YYYYMMDD');
        Utils.exportToExcel(exportData, `historial_reportes_turistas_${date}.xlsx`, 'Historial Reportes');
        Utils.showNotification(`Exportados ${exportData.length} reportes`, 'success');
    },

    /**
     * Genera el HTML de la tabla de llegadas por agencia
     */
    async getArrivalsTableHTML(branchId, date) {
        const agencies = await DB.getAll('catalog_agencies') || [];
        const targetAgencies = ['TRAVELEX', 'VERANOS', 'TANITOURS', 'DISCOVERY', 'TB', 'TTF'];
        const filteredAgencies = agencies.filter(a => targetAgencies.includes(a.name.toUpperCase()));
        
        // Limpiar llegadas inválidas antes de cargar
        await this.cleanupInvalidArrivals(branchId, date);
        
        // Cargar llegadas existentes del día
        const existingArrivals = await DB.query('agency_arrivals', 'date', date);
        const branchArrivals = existingArrivals.filter(a => a.branch_id === branchId);
        
        const branch = await DB.get('catalog_branches', branchId);
        const branchName = branch?.name || '';
        const isDiscoveryBranch34 = branchName.includes('San Sebastián') || branchName.includes('Sayulita');

        return `
            <table class="cart-table" style="width: 100%; min-width: 800px; font-size: 12px;">
                <thead>
                    <tr style="background: var(--color-bg-secondary);">
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">AGENCIA</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">PAX</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">UNIDADES</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">TIPO UNIDAD</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">COSTO</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">NOTAS</th>
                        <th style="padding: 8px; font-size: 10px; text-transform: uppercase;">ACCIONES</th>
                    </tr>
                </thead>
                <tbody id="arrivals-tbody">
                    ${filteredAgencies.map(agency => {
                        // Buscar la llegada más reciente de esta agencia (puede tener o no unit_type)
                        const agencyArrivals = branchArrivals.filter(a => a.agency_id === agency.id);
                        const arrival = agencyArrivals.length > 0 ? agencyArrivals[agencyArrivals.length - 1] : null;
                        const agencyName = agency.name.toUpperCase();
                        const isDiscoveryBranch12 = agencyName === 'DISCOVERY' && (branchName.includes('Vallarta') || branchName.includes('Malecón'));
                        
                        // Validar: solo usar valores guardados si tienen pasajeros y unidades > 0
                        const validPassengers = (arrival?.passengers > 0 && arrival?.units > 0) ? arrival.passengers : 0;
                        const validUnits = (arrival?.passengers > 0 && arrival?.units > 0) ? arrival.units : 0;
                        const validUnitType = (arrival?.passengers > 0 && arrival?.units > 0) ? (arrival.unit_type || null) : null;
                        const validNotes = (arrival?.passengers > 0 && arrival?.units > 0) ? (arrival.notes || '') : '';
                        const initialFee = 0; // Se calculará después de cargar la tabla
                        
                        return `
                            <tr data-agency-id="${agency.id}" data-unit-type="">
                                <td style="padding: 8px; font-weight: 600;">${agency.name}</td>
                                <td style="padding: 8px;">
                                    <input type="number" 
                                           class="arrival-pax form-input" 
                                           data-agency-id="${agency.id}"
                                           value="${validPassengers}" 
                                           min="0" 
                                           style="width: 80px; text-align: center;"
                                           onchange="window.TouristReport.updateArrival('${agency.id}', null)">
                                </td>
                                <td style="padding: 8px;">
                                    <input type="number" 
                                           class="arrival-units form-input" 
                                           data-agency-id="${agency.id}"
                                           value="${validUnits}" 
                                           min="0" 
                                           style="width: 80px; text-align: center;"
                                           onchange="window.TouristReport.updateArrival('${agency.id}', null)">
                                </td>
                                <td style="padding: 8px;">
                                    ${isDiscoveryBranch12 ? `
                                        <input type="text" 
                                               class="form-input" 
                                               value="City Tour" 
                                               readonly 
                                               style="width: 120px; text-align: center; background: var(--color-bg-secondary);">
                                    ` : `
                                        <select class="arrival-unit-type form-select" 
                                                data-agency-id="${agency.id}"
                                                style="width: 120px;"
                                                onchange="window.TouristReport.updateArrival('${agency.id}', this.value)">
                                            ${typeof ArrivalRules !== 'undefined' && ArrivalRules.UNIT_TYPE_OPTIONS 
                                                ? ArrivalRules.UNIT_TYPE_OPTIONS.map(opt => 
                                                    `<option value="${opt.value}" ${validUnitType === opt.value || (!validUnitType && opt.value === '') ? 'selected' : ''}>${opt.label}</option>`
                                                ).join('')
                                                : `
                                                    <option value="">Cualquiera</option>
                                                    <option value="city_tour" ${validUnitType === 'city_tour' ? 'selected' : ''}>City Tour</option>
                                                    <option value="sprinter" ${validUnitType === 'sprinter' ? 'selected' : ''}>Sprinter</option>
                                                    <option value="van" ${validUnitType === 'van' ? 'selected' : ''}>Van</option>
                                                    <option value="truck" ${validUnitType === 'truck' ? 'selected' : ''}>Camiones</option>
                                                `
                                            }
                                        </select>
                                    `}
                                </td>
                                <td style="padding: 8px;">
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <input type="text" 
                                               class="arrival-fee form-input" 
                                               data-agency-id="${agency.id}"
                                               value="${Utils.formatCurrency(initialFee)}" 
                                               readonly 
                                               style="width: 100px; text-align: right; background: var(--color-bg-secondary); font-weight: 600;">
                                        <button class="btn-secondary btn-xs" 
                                                onclick="window.TouristReport.showOverrideModal('${agency.id}', null)"
                                                title="Override manual"
                                                style="padding: 2px 6px; font-size: 10px;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </div>
                                </td>
                                <td style="padding: 8px;">
                                    <input type="text" 
                                           class="arrival-notes form-input" 
                                           data-agency-id="${agency.id}"
                                           value="${validNotes}" 
                                           placeholder="Notas..."
                                           style="width: 150px; font-size: 11px;"
                                           onblur="window.TouristReport.updateArrival('${agency.id}', null)">
                                </td>
                                <td style="padding: 8px;">
                                    <button class="btn-primary btn-xs" 
                                            onclick="window.TouristReport.saveArrivalRow('${agency.id}', null)"
                                            style="padding: 4px 8px; font-size: 11px;">
                                        <i class="fas fa-save"></i> Guardar
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    /**
     * Limpia llegadas inválidas (con 0 pasajeros o 0 unidades)
     */
    async cleanupInvalidArrivals(branchId, date) {
        try {
            const existingArrivals = await DB.query('agency_arrivals', 'date', date);
            const branchArrivals = existingArrivals.filter(a => a.branch_id === branchId);
            
            for (const arrival of branchArrivals) {
                if (!arrival.passengers || arrival.passengers === 0 || !arrival.units || arrival.units === 0) {
                    // Eliminar llegada inválida
                    await DB.delete('agency_arrivals', arrival.id);
                }
            }
        } catch (e) {
            console.error('Error cleaning up invalid arrivals:', e);
        }
    },

    /**
     * Recalcula costos de llegadas al cargar la tabla
     */
    async recalculateArrivalsOnLoad() {
        try {
            const tbody = document.getElementById('arrivals-tbody');
            if (!tbody) return;
            
            const rows = tbody.querySelectorAll('tr[data-agency-id]');
            for (const row of rows) {
                const paxInput = row.querySelector('.arrival-pax');
                const unitsInput = row.querySelector('.arrival-units');
                const pax = parseInt(paxInput?.value || 0);
                const units = parseInt(unitsInput?.value || 0);
                
                // Solo recalcular si hay pasajeros y unidades válidas
                if (pax > 0 && units > 0) {
                    const agencyId = row.getAttribute('data-agency-id');
                    await this.updateArrival(agencyId, null);
                } else {
                    // Si no hay pasajeros o unidades, asegurar que el costo sea 0
                    const feeInput = row.querySelector('.arrival-fee');
                    if (feeInput) {
                        feeInput.value = Utils.formatCurrency(0);
                        feeInput.style.color = 'var(--color-text-secondary)';
                    }
                }
            }
            // Actualizar totales después de recalcular (esto debe calcularse solo desde inputs)
            await this.updateArrivalsTotals();
        } catch (e) {
            console.error('Error recalculating arrivals on load:', e);
        }
    },

    /**
     * Actualiza una llegada cuando cambian los campos
     */
    async updateArrival(agencyId, unitType) {
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const dateInput = document.getElementById('arrivals-date');
        const date = dateInput ? dateInput.value : Utils.formatDate(new Date(), 'YYYY-MM-DD');
        
        // Buscar la fila por agency_id (más flexible)
        const row = document.querySelector(`tr[data-agency-id="${agencyId}"]`);
        if (!row) return;

        const passengers = parseInt(row.querySelector('.arrival-pax')?.value || 0);
        const units = parseInt(row.querySelector('.arrival-units')?.value || 0);
        const selectedUnitType = row.querySelector('.arrival-unit-type')?.value || unitType || null;
        
        // Validar: si no hay pasajeros o unidades, el costo es 0
        if (passengers === 0 || units === 0) {
            const feeInput = row.querySelector('.arrival-fee');
            if (feeInput) {
                feeInput.value = Utils.formatCurrency(0);
                feeInput.style.color = 'var(--color-text-secondary)';
            }
            this.updateArrivalsTotals();
            return;
        }
        
        // REGLA ESPECIAL: Para DISCOVERY en sucursales Vallarta/Malecón, forzar city_tour
        // Esto asegura que las llegadas de DISCOVERY en estas sucursales siempre usen el tipo 'city_tour'
        // independientemente de lo que el usuario seleccione, para que coincidan con las reglas configuradas
        const branch = await DB.get('catalog_branches', branchId);
        const branchName = branch?.name || '';
        const agency = await DB.get('catalog_agencies', agencyId);
        const agencyName = agency?.name.toUpperCase() || '';
        
        let finalUnitType = selectedUnitType;
        if (agencyName === 'DISCOVERY' && (branchName.includes('Vallarta') || branchName.includes('Malecón'))) {
            finalUnitType = 'city_tour';
        }

        // Calcular costo
        const calculation = await ArrivalRules.calculateArrivalFee(agencyId, branchId, passengers, finalUnitType, date);
        
        const feeInput = row.querySelector('.arrival-fee');
        if (feeInput) {
            if (calculation.overrideRequired && !calculation.calculatedFee) {
                feeInput.value = 'Requiere Override';
                feeInput.style.color = 'var(--color-danger)';
            } else {
                feeInput.value = Utils.formatCurrency(calculation.calculatedFee);
                feeInput.style.color = 'var(--color-text)';
            }
        }

        // Actualizar totales
        this.updateArrivalsTotals();
    },

    /**
     * Guarda una fila de llegada
     */
    async saveArrivalRow(agencyId, unitType) {
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const dateInput = document.getElementById('arrivals-date');
        const date = dateInput ? dateInput.value : Utils.formatDate(new Date(), 'YYYY-MM-DD');
        
        // Buscar la fila por agency_id (más flexible)
        const row = document.querySelector(`tr[data-agency-id="${agencyId}"]`);
        if (!row) return;

        const passengers = parseInt(row.querySelector('.arrival-pax')?.value || 0);
        const units = parseInt(row.querySelector('.arrival-units')?.value || 0);
        const selectedUnitType = row.querySelector('.arrival-unit-type')?.value || unitType || null;
        const notes = row.querySelector('.arrival-notes')?.value || '';
        
        // Validar: si no hay pasajeros o unidades, no guardar
        if (passengers === 0 || units === 0) {
            Utils.showNotification('Debe ingresar pasajeros y unidades mayores a 0', 'warning');
            return;
        }
        
        // REGLA ESPECIAL: Para DISCOVERY en sucursales Vallarta/Malecón, forzar city_tour
        // Esto asegura que las llegadas de DISCOVERY en estas sucursales siempre usen el tipo 'city_tour'
        // independientemente de lo que el usuario seleccione, para que coincidan con las reglas configuradas
        const branch = await DB.get('catalog_branches', branchId);
        const branchName = branch?.name || '';
        const agency = await DB.get('catalog_agencies', agencyId);
        const agencyName = agency?.name.toUpperCase() || '';
        
        let finalUnitType = selectedUnitType;
        if (agencyName === 'DISCOVERY' && (branchName.includes('Vallarta') || branchName.includes('Malecón'))) {
            finalUnitType = 'city_tour';
        }

        // Calcular costo
        const calculation = await ArrivalRules.calculateArrivalFee(agencyId, branchId, passengers, finalUnitType, date);
        
        if (calculation.overrideRequired && !calculation.calculatedFee) {
            // Mostrar modal de override
            await this.showOverrideModal(agencyId, finalUnitType);
            return;
        }

        // Guardar llegada
        const arrival = await ArrivalRules.saveArrival({
            date,
            branch_id: branchId,
            agency_id: agencyId,
            passengers,
            units,
            unit_type: finalUnitType,
            calculated_fee: calculation.calculatedFee,
            override: false,
            notes
        });

        Utils.showNotification('Llegada guardada', 'success');
        this.updateArrivalsTotals();
    },

    /**
     * Muestra modal para override manual
     */
    async showOverrideModal(agencyId, unitType) {
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const dateInput = document.getElementById('arrivals-date');
        const date = dateInput ? dateInput.value : Utils.formatDate(new Date(), 'YYYY-MM-DD');
        
        const row = document.querySelector(`tr[data-agency-id="${agencyId}"][data-unit-type="${unitType || ''}"]`);
        if (!row) return;

        const passengers = parseInt(row.querySelector('.arrival-pax')?.value || 0);
        const agency = await DB.get('catalog_agencies', agencyId);
        
        const body = `
            <div style="padding: var(--spacing-md);">
                <p style="margin-bottom: var(--spacing-md); color: var(--color-warning);">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Tarifa no definida para ${agency?.name} con ${passengers} PAX
                </p>
                <div class="form-group">
                    <label>Monto Manual (MXN) *</label>
                    <input type="number" id="override-amount" class="form-input" step="0.01" min="0" required style="width: 100%;">
                </div>
                <div class="form-group">
                    <label>Motivo del Override *</label>
                    <textarea id="override-reason" class="form-textarea" rows="3" required style="width: 100%;" placeholder="Explica por qué se requiere override manual..."></textarea>
                </div>
            </div>
        `;

        const footer = [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { 
                text: 'Guardar Override', 
                class: 'btn-primary', 
                onclick: async () => {
                    const amount = parseFloat(document.getElementById('override-amount')?.value || 0);
                    const reason = document.getElementById('override-reason')?.value || '';
                    
                    if (!amount || !reason) {
                        Utils.showNotification('Completa todos los campos', 'error');
                        return;
                    }

                    const arrival = await ArrivalRules.saveArrival({
                        date,
                        branch_id: branchId,
                        agency_id: agencyId,
                        passengers,
                        units: parseInt(row.querySelector('.arrival-units')?.value || 1),
                        unit_type: unitType,
                        calculated_fee: 0,
                        override: true,
                        override_amount: amount,
                        override_reason: reason,
                        notes: row.querySelector('.arrival-notes')?.value || ''
                    });

                    // Actualizar UI
                    const feeInput = row.querySelector('.arrival-fee');
                    if (feeInput) {
                        feeInput.value = Utils.formatCurrency(amount);
                        feeInput.style.color = 'var(--color-warning)';
                    }

                    UI.closeModal();
                    Utils.showNotification('Override guardado', 'success');
                    this.updateArrivalsTotals();
                }
            }
        ];

        UI.showModal('Override Manual de Tarifa', body, footer);
    },

    /**
     * Actualiza los totales de llegadas
     */
    async updateArrivalsTotals() {
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        const dateInput = document.getElementById('arrivals-date');
        const date = dateInput ? dateInput.value : Utils.formatDate(new Date(), 'YYYY-MM-DD');
        
        // Calcular totales SOLO desde los inputs de la tabla (valores actuales visibles)
        const tbody = document.getElementById('arrivals-tbody');
        let totalPax = 0;
        let totalFee = 0;
        
        if (tbody) {
            const rows = tbody.querySelectorAll('tr[data-agency-id]');
            rows.forEach(row => {
                const paxInput = row.querySelector('.arrival-pax');
                const unitsInput = row.querySelector('.arrival-units');
                const feeInput = row.querySelector('.arrival-fee');
                
                const pax = parseInt(paxInput?.value || 0);
                const units = parseInt(unitsInput?.value || 0);
                
                // Solo contar si hay pasajeros Y unidades válidas (ambos > 0)
                if (pax > 0 && units > 0) {
                    totalPax += pax;
                    
                    if (feeInput) {
                        // Extraer el valor numérico del texto formateado
                        const feeText = feeInput.value.replace(/[^0-9.-]/g, '');
                        const fee = parseFloat(feeText) || 0;
                        // Solo sumar si el fee es mayor a 0
                        if (fee > 0) {
                            totalFee += fee;
                        }
                    }
                }
            });
        }
        
        // NO usar fallback de datos guardados - solo usar valores visibles en la tabla
        // Si todos los inputs son 0, los totales deben ser 0
        
        const totalPaxEl = document.getElementById('arrivals-total-pax');
        const totalFeeEl = document.getElementById('arrivals-total-fee');
        
        if (totalPaxEl) totalPaxEl.textContent = totalPax;
        if (totalFeeEl) totalFeeEl.textContent = Utils.formatCurrency(totalFee);
    }
};

window.TouristReport = TouristReport;
