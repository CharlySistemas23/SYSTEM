// Cash Register Module - Módulo de Caja

const Cash = {
    initialized: false,
    currentSession: null,
    
    async init() {
        if (this.initialized) return;
        this.setupUI();
        // Esperar a que el DOM se actualice antes de cargar la sesión
        await new Promise(resolve => setTimeout(resolve, 50));
        await this.loadCurrentSession();
        this.setupEventListeners();
        this.setupEventBusListeners();
        this.initialized = true;
    },

    setupEventBusListeners() {
        // Escuchar eventos de ventas completadas para actualizar caja automáticamente
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.on('sale-completed', async (data) => {
                // Solo actualizar si hay una sesión de caja abierta
                if (this.currentSession && this.currentSession.status === 'abierta') {
                    // Recargar sesión para actualizar totales
                    await this.loadCurrentSession();
                }
            });
        }
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div class="cash-container">
                <!-- Estado Actual de la Caja -->
                <div class="cash-status-card" id="cash-status-card">
                    <div class="cash-status-header">
                        <h3><i class="fas fa-cash-register"></i> Estado de la Caja</h3>
                        <div class="cash-status-badge" id="cash-status-badge">
                            <span id="cash-status-text">Cerrada</span>
                        </div>
                    </div>
                    <div class="cash-status-content" id="cash-status-content">
                        <div class="empty-state">No hay sesión de caja abierta</div>
                    </div>
                </div>

                <!-- Acciones Principales -->
                <div class="cash-actions" id="cash-actions">
                    <button class="btn-primary btn-lg" id="cash-open-btn">
                        <i class="fas fa-lock-open"></i> Abrir Caja
                    </button>
                    <button class="btn-secondary btn-lg" id="cash-close-btn" style="display: none;">
                        <i class="fas fa-lock"></i> Cerrar Caja
                    </button>
                    <button class="btn-secondary" id="cash-movement-btn" style="display: none;">
                        <i class="fas fa-exchange-alt"></i> Movimiento de Efectivo
                    </button>
                    <button class="btn-secondary" id="cash-partial-count-btn" style="display: none;">
                        <i class="fas fa-calculator"></i> Arqueo Parcial
                    </button>
                    <button class="btn-secondary" id="cash-reconcile-btn" style="display: none;">
                        <i class="fas fa-balance-scale"></i> Conciliar con POS
                    </button>
                    <button class="btn-secondary" id="cash-report-btn" style="display: none;">
                        <i class="fas fa-file-pdf"></i> Generar Reporte
                    </button>
                    <button class="btn-secondary" id="cash-history-btn">
                        <i class="fas fa-history"></i> Historial
                    </button>
                </div>

                <!-- Panel de Conciliación -->
                <div class="cash-reconciliation-panel" id="cash-reconciliation-panel" style="display: none;">
                    <h3><i class="fas fa-balance-scale"></i> Conciliación con Ventas POS</h3>
                    <div id="cash-reconciliation-content"></div>
                </div>

                <!-- Estadísticas Avanzadas -->
                <div class="cash-stats-section" id="cash-stats-section" style="display: none;">
                    <h3><i class="fas fa-chart-line"></i> Estadísticas del Día</h3>
                    <div id="cash-stats-content"></div>
                </div>

                <!-- Movimientos del Día -->
                <div class="cash-movements-section" id="cash-movements-section" style="display: none;">
                    <h3>Movimientos del Día</h3>
                    <div id="cash-movements-list"></div>
                </div>

                <!-- Historial de Sesiones -->
                <div class="cash-history-section" id="cash-history-section" style="display: none;">
                    <div class="cash-history-header">
                        <h3>Historial de Sesiones</h3>
                        <div class="filters-bar-compact">
                            <input type="date" id="cash-history-date-from" class="form-input">
                            <input type="date" id="cash-history-date-to" class="form-input">
                            <button class="btn-secondary btn-sm" id="cash-history-filter-btn">Filtrar</button>
                        </div>
                    </div>
                    <div id="cash-history-list"></div>
                </div>
            </div>
        `;
    },

    setupEventListeners() {
        document.getElementById('cash-open-btn')?.addEventListener('click', () => this.showOpenCashForm());
        document.getElementById('cash-close-btn')?.addEventListener('click', () => this.showCloseCashForm());
        document.getElementById('cash-movement-btn')?.addEventListener('click', () => this.showMovementForm());
        document.getElementById('cash-partial-count-btn')?.addEventListener('click', () => this.showPartialCountForm());
        document.getElementById('cash-reconcile-btn')?.addEventListener('click', () => this.reconcileWithPOS());
        document.getElementById('cash-report-btn')?.addEventListener('click', () => this.generateReport());
        document.getElementById('cash-history-btn')?.addEventListener('click', () => this.toggleHistory());
        document.getElementById('cash-history-filter-btn')?.addEventListener('click', () => this.loadHistory());
    },

    async loadCurrentSession() {
        try {
            const branchId = await this.getCurrentBranchId();
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            
            // Buscar sesión abierta del día de hoy
            const allSessions = await DB.getAll('cash_sessions', null, null, {
                filterByBranch: true,
                branchIdField: 'branch_id'
            }) || [];
            const todaySessions = allSessions.filter(s => {
                const sessionDate = Utils.formatDate(s.date, 'YYYY-MM-DD');
                return sessionDate === today && s.status === 'abierta';
            });

            if (todaySessions.length > 0) {
                this.currentSession = todaySessions[0];
                await this.loadSessionMovements();
                this.displayCurrentSession();
            } else {
                this.currentSession = null;
                this.displayCurrentSession();
            }
        } catch (e) {
            console.error('Error loading current session:', e);
            Utils.showNotification('Error al cargar sesión de caja', 'error');
        }
    },

    async loadSessionMovements() {
        if (!this.currentSession) return;
        
        try {
            const movements = await DB.query('cash_movements', 'session_id', this.currentSession.id);
            this.displayMovements(movements);
        } catch (e) {
            console.error('Error loading movements:', e);
        }
    },

    displayCurrentSession() {
        // Verificar que el módulo esté visible antes de intentar actualizar
        const cashModule = document.getElementById('module-cash');
        const cashPlaceholder = document.getElementById('module-placeholder');
        const isModuleVisible = (cashModule && cashModule.style.display !== 'none') || 
                                (cashPlaceholder && cashPlaceholder.style.display !== 'none');
        
        if (!isModuleVisible) {
            // El módulo no está visible, no intentar actualizar
            return;
        }

        const statusCard = document.getElementById('cash-status-card');
        const statusContent = document.getElementById('cash-status-content');
        const statusBadge = document.getElementById('cash-status-badge');
        const statusText = document.getElementById('cash-status-text');
        const openBtn = document.getElementById('cash-open-btn');
        const closeBtn = document.getElementById('cash-close-btn');
        const movementBtn = document.getElementById('cash-movement-btn');
        const movementsSection = document.getElementById('cash-movements-section');

        // Verificar que los elementos existan antes de usarlos
        if (!statusText || !statusBadge || !statusContent || !openBtn || !closeBtn || !movementBtn || !movementsSection) {
            // Si los elementos no están listos, intentar de nuevo después de un breve delay
            setTimeout(() => {
                if (this.initialized) {
                    this.displayCurrentSession();
                }
            }, 100);
            return;
        }

        if (!this.currentSession) {
            // Caja cerrada
            statusText.textContent = 'Cerrada';
            statusBadge.className = 'cash-status-badge closed';
            statusContent.innerHTML = `
                <div class="empty-state">
                    <p>No hay sesión de caja abierta</p>
                    <p style="font-size: 12px; color: #666; margin-top: 8px;">
                        Haz clic en "Abrir Caja" para iniciar una nueva sesión
                    </p>
                </div>
            `;
            openBtn.style.display = 'block';
            closeBtn.style.display = 'none';
            movementBtn.style.display = 'none';
            const partialCountBtn = document.getElementById('cash-partial-count-btn');
            const reconcileBtn = document.getElementById('cash-reconcile-btn');
            const reportBtn = document.getElementById('cash-report-btn');
            const reconciliationPanel = document.getElementById('cash-reconciliation-panel');
            const statsSection = document.getElementById('cash-stats-section');
            if (partialCountBtn) partialCountBtn.style.display = 'none';
            if (reconcileBtn) reconcileBtn.style.display = 'none';
            if (reportBtn) reportBtn.style.display = 'none';
            if (movementsSection) movementsSection.style.display = 'none';
            if (reconciliationPanel) reconciliationPanel.style.display = 'none';
            if (statsSection) statsSection.style.display = 'none';
            return;
        }

        // Caja abierta
        statusText.textContent = 'Abierta';
        statusBadge.className = 'cash-status-badge open';
        
        const session = this.currentSession;
        const openedAt = Utils.formatDate(session.created_at, 'YYYY-MM-DD HH:mm');
        
        // Calcular totales actuales
        this.calculateCurrentTotals().then(totals => {
            statusContent.innerHTML = `
                <div class="cash-session-info">
                    <div class="info-row">
                        <span class="info-label">Abierta por:</span>
                        <span class="info-value">${session.user_name || 'Usuario'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Fecha/Hora:</span>
                        <span class="info-value">${openedAt}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Monto Inicial USD:</span>
                        <span class="info-value">${Utils.formatCurrency(session.initial_usd || 0, 'USD')}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Monto Inicial MXN:</span>
                        <span class="info-value">${Utils.formatCurrency(session.initial_mxn || 0)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Monto Inicial CAD:</span>
                        <span class="info-value">${Utils.formatCurrency(session.initial_cad || 0, 'CAD')}</span>
                    </div>
                </div>
                <div class="cash-totals-grid">
                    <div class="cash-total-card">
                        <div class="cash-total-label">Efectivo USD</div>
                        <div class="cash-total-value">${Utils.formatCurrency(totals.current_usd, 'USD')}</div>
                    </div>
                    <div class="cash-total-card">
                        <div class="cash-total-label">Efectivo MXN</div>
                        <div class="cash-total-value">${Utils.formatCurrency(totals.current_mxn)}</div>
                    </div>
                    <div class="cash-total-card">
                        <div class="cash-total-label">Efectivo CAD</div>
                        <div class="cash-total-value">${Utils.formatCurrency(totals.current_cad, 'CAD')}</div>
                    </div>
                    <div class="cash-total-card">
                        <div class="cash-total-label">Ventas del Día</div>
                        <div class="cash-total-value">${Utils.formatCurrency(totals.sales_total)}</div>
                    </div>
                </div>
            `;
        });

        openBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        movementBtn.style.display = 'block';
        document.getElementById('cash-partial-count-btn').style.display = 'block';
        document.getElementById('cash-reconcile-btn').style.display = 'block';
        document.getElementById('cash-report-btn').style.display = 'block';
        movementsSection.style.display = 'block';
        
        // Cargar estadísticas y conciliación
        this.loadAdvancedStats();
    },

    async calculateCurrentTotals() {
        if (!this.currentSession) {
            return { 
                current_usd: 0, 
                current_mxn: 0, 
                current_cad: 0, 
                sales_total: 0,
                sales_cash_usd: 0,
                sales_cash_mxn: 0,
                sales_cash_cad: 0,
                sales_tpv_visa: 0,
                sales_tpv_amex: 0,
                total_sales_count: 0
            };
        }

        // Monto inicial
        let current_usd = this.currentSession.initial_usd || 0;
        let current_mxn = this.currentSession.initial_mxn || 0;
        let current_cad = this.currentSession.initial_cad || 0;

        // Sumar movimientos
        const movements = await DB.query('cash_movements', 'session_id', this.currentSession.id);
        movements.forEach(m => {
            if (m.type === 'entrada') {
                if (m.currency === 'USD') current_usd += m.amount;
                if (m.currency === 'MXN') current_mxn += m.amount;
                if (m.currency === 'CAD') current_cad += m.amount;
            } else if (m.type === 'salida') {
                if (m.currency === 'USD') current_usd -= m.amount;
                if (m.currency === 'MXN') current_mxn -= m.amount;
                if (m.currency === 'CAD') current_cad -= m.amount;
            }
        });

        // Calcular ventas del día detalladas
        const branchId = await this.getCurrentBranchId();
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        const sessionDate = Utils.formatDate(this.currentSession.date, 'YYYY-MM-DD');
        // Obtener ventas filtradas por sucursal
        const sales = await DB.getAll('sales', null, null, { 
            filterByBranch: true,
            branchIdField: 'branch_id' 
        }) || [];
        const sessionSales = sales.filter(s => {
            const saleDate = Utils.formatDate(s.created_at, 'YYYY-MM-DD');
            return saleDate === sessionDate && s.status === 'completada';
        });

        let sales_total = 0;
        let sales_cash_usd = 0;
        let sales_cash_mxn = 0;
        let sales_cash_cad = 0;
        let sales_tpv_visa = 0;
        let sales_tpv_amex = 0;

        for (const sale of sessionSales) {
            const payments = await DB.query('payments', 'sale_id', sale.id);
            payments.forEach(p => {
                if (p.method_id?.includes('CASH')) {
                    sales_total += p.amount;
                    if (p.currency === 'USD') sales_cash_usd += p.amount;
                    if (p.currency === 'MXN') sales_cash_mxn += p.amount;
                    if (p.currency === 'CAD') sales_cash_cad += p.amount;
                } else if (p.method_id?.includes('VISA') || p.method_id?.includes('MC')) {
                    sales_tpv_visa += p.amount;
                } else if (p.method_id?.includes('AMEX')) {
                    sales_tpv_amex += p.amount;
                }
            });
        }

        return { 
            current_usd, 
            current_mxn, 
            current_cad, 
            sales_total,
            sales_cash_usd,
            sales_cash_mxn,
            sales_cash_cad,
            sales_tpv_visa,
            sales_tpv_amex,
            total_sales_count: sessionSales.length
        };
    },

    displayMovements(movements) {
        const list = document.getElementById('cash-movements-list');
        if (!list) return;

        if (movements.length === 0) {
            list.innerHTML = '<div class="empty-state">No hay movimientos registrados</div>';
            return;
        }

        // Ordenar movimientos por fecha descendente
        movements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        list.innerHTML = movements.map(m => {
            if (m.type === 'arqueo_parcial') {
                // Mostrar arqueo parcial de forma especial
                const diffUsd = m.difference_usd || 0;
                const diffMxn = m.difference_mxn || 0;
                const diffCad = m.difference_cad || 0;
                const hasDifference = Math.abs(diffUsd) > 0.01 || Math.abs(diffMxn) > 0.01 || Math.abs(diffCad) > 0.01;
                
                return `
                    <div class="cash-movement-item movement-partial ${hasDifference ? 'has-difference' : ''}">
                        <div class="movement-icon">
                            <i class="fas fa-calculator"></i>
                        </div>
                        <div class="movement-details">
                            <div class="movement-type">Arqueo Parcial</div>
                            <div class="movement-description">${m.description || 'Sin descripción'}</div>
                            <div class="partial-details">
                                <div class="partial-row">
                                    <span>Contado USD:</span>
                                    <strong>${Utils.formatCurrency(m.count_usd || 0, 'USD')}</strong>
                                    ${hasDifference ? `<span class="partial-diff ${diffUsd >= 0 ? 'positive' : 'negative'}">(${diffUsd >= 0 ? '+' : ''}${diffUsd.toFixed(2)})</span>` : ''}
                                </div>
                                <div class="partial-row">
                                    <span>Contado MXN:</span>
                                    <strong>${Utils.formatCurrency(m.count_mxn || 0)}</strong>
                                    ${hasDifference ? `<span class="partial-diff ${diffMxn >= 0 ? 'positive' : 'negative'}">(${diffMxn >= 0 ? '+' : ''}${diffMxn.toFixed(2)})</span>` : ''}
                                </div>
                                <div class="partial-row">
                                    <span>Contado CAD:</span>
                                    <strong>${Utils.formatCurrency(m.count_cad || 0, 'CAD')}</strong>
                                    ${hasDifference ? `<span class="partial-diff ${diffCad >= 0 ? 'positive' : 'negative'}">(${diffCad >= 0 ? '+' : ''}${diffCad.toFixed(2)})</span>` : ''}
                                </div>
                            </div>
                            <div class="movement-date">${Utils.formatDate(m.created_at, 'YYYY-MM-DD HH:mm')}</div>
                        </div>
                    </div>
                `;
            }
            
            const typeClass = m.type === 'entrada' ? 'movement-entry' : 'movement-exit';
            const typeIcon = m.type === 'entrada' ? 'fa-arrow-down' : 'fa-arrow-up';
            const typeLabel = m.type === 'entrada' ? 'Entrada' : 'Salida';
            
            return `
                <div class="cash-movement-item ${typeClass}">
                    <div class="movement-icon">
                        <i class="fas ${typeIcon}"></i>
                    </div>
                    <div class="movement-details">
                        <div class="movement-type">${typeLabel}</div>
                        <div class="movement-description">${m.description || 'Sin descripción'}</div>
                        <div class="movement-date">${Utils.formatDate(m.created_at, 'YYYY-MM-DD HH:mm')}</div>
                    </div>
                    <div class="movement-amount">
                        ${Utils.formatCurrency(m.amount, m.currency)}
                    </div>
                </div>
            `;
        }).join('');
    },

    showOpenCashForm() {
        const modalContent = `
            <form id="cash-open-form">
                <div class="form-group">
                    <label>Monto Inicial USD</label>
                    <input type="number" id="open-initial-usd" class="form-input" step="0.01" value="0" required>
                </div>
                <div class="form-group">
                    <label>Monto Inicial MXN</label>
                    <input type="number" id="open-initial-mxn" class="form-input" step="0.01" value="0" required>
                </div>
                <div class="form-group">
                    <label>Monto Inicial CAD</label>
                    <input type="number" id="open-initial-cad" class="form-input" step="0.01" value="0" required>
                </div>
                <div class="form-group">
                    <label>Observaciones</label>
                    <textarea id="open-notes" class="form-input" rows="3" placeholder="Notas adicionales..."></textarea>
                </div>
            </form>
        `;

        const self = this;
        UI.showModal('Abrir Caja', modalContent, [
            {
                text: 'Cancelar',
                class: 'btn-secondary',
                onclick: () => UI.closeModal()
            },
            {
                text: 'Abrir Caja',
                class: 'btn-primary',
                onclick: () => self.processOpenCash()
            }
        ]);
    },

    async processOpenCash() {
        try {
            const initialUsd = parseFloat(document.getElementById('open-initial-usd')?.value || 0);
            const initialMxn = parseFloat(document.getElementById('open-initial-mxn')?.value || 0);
            const initialCad = parseFloat(document.getElementById('open-initial-cad')?.value || 0);
            const notes = document.getElementById('open-notes')?.value || '';

            if (initialUsd < 0 || initialMxn < 0 || initialCad < 0) {
                Utils.showNotification('Los montos no pueden ser negativos', 'error');
                return;
            }

            const branchId = await this.getCurrentBranchId();
            const userId = await this.getCurrentUserId();
            const userName = await this.getCurrentUserName();

            const session = {
                id: Utils.generateId(),
                branch_id: branchId,
                user_id: userId,
                user_name: userName,
                date: new Date().toISOString(),
                initial_usd: initialUsd,
                initial_mxn: initialMxn,
                initial_cad: initialCad,
                final_usd: 0,
                final_mxn: 0,
                final_cad: 0,
                status: 'abierta',
                notes: notes,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await DB.add('cash_sessions', session);
            this.currentSession = session;
            await this.loadCurrentSession();
            UI.closeModal();
            Utils.showNotification('Caja abierta correctamente', 'success');
        } catch (e) {
            console.error('Error opening cash:', e);
            Utils.showNotification('Error al abrir la caja', 'error');
        }
    },

    async showCloseCashForm() {
        if (!this.currentSession) return;

        const totals = await this.calculateCurrentTotals();
        const branchId = this.currentSession.branch_id;
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        
        // Obtener llegadas del día
        const arrivals = await DB.query('agency_arrivals', 'date', today);
        // Solo llegadas válidas (passengers > 0 && units > 0)
        const branchArrivals = arrivals.filter(a => 
            a.branch_id === branchId &&
            a.passengers > 0 &&
            a.units > 0
        );
        const agencies = await DB.getAll('catalog_agencies') || [];
        
        const arrivalsSummary = branchArrivals.map(arrival => {
            const agency = agencies.find(a => a.id === arrival.agency_id);
            return {
                agency: agency?.name || 'N/A',
                pax: arrival.passengers || 0,
                fee: arrival.arrival_fee || 0
            };
        });
        
        const totalPax = branchArrivals.reduce((sum, a) => sum + (a.passengers || 0), 0);
        const totalArrivalsFee = branchArrivals.reduce((sum, a) => sum + (a.arrival_fee || 0), 0);
        
        const modalContent = `
            <form id="cash-close-form">
                <div class="cash-close-info">
                    <h4>Totales Calculados</h4>
                    <div class="info-row">
                        <span>Efectivo USD:</span>
                        <strong>${Utils.formatCurrency(totals.current_usd, 'USD')}</strong>
                    </div>
                    <div class="info-row">
                        <span>Efectivo MXN:</span>
                        <strong>${Utils.formatCurrency(totals.current_mxn)}</strong>
                    </div>
                    <div class="info-row">
                        <span>Efectivo CAD:</span>
                        <strong>${Utils.formatCurrency(totals.current_cad, 'CAD')}</strong>
                    </div>
                </div>
                
                ${arrivalsSummary.length > 0 ? `
                <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                    <h4 style="margin-bottom: var(--spacing-sm); font-size: 13px; font-weight: 600;">Resumen de Llegadas del Día</h4>
                    <table style="width: 100%; font-size: 11px; margin-bottom: var(--spacing-sm);">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--color-border);">
                                <th style="text-align: left; padding: 4px;">Agencia</th>
                                <th style="text-align: right; padding: 4px;">PAX</th>
                                <th style="text-align: right; padding: 4px;">Costo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${arrivalsSummary.map(a => `
                                <tr>
                                    <td style="padding: 4px;">${a.agency}</td>
                                    <td style="text-align: right; padding: 4px;">${a.pax}</td>
                                    <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(a.fee)}</td>
                                </tr>
                            `).join('')}
                            <tr style="border-top: 2px solid var(--color-border); font-weight: 700;">
                                <td style="padding: 4px;">TOTAL</td>
                                <td style="text-align: right; padding: 4px;">${totalPax}</td>
                                <td style="text-align: right; padding: 4px;">${Utils.formatCurrency(totalArrivalsFee)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                ` : ''}
                
                <div class="form-group">
                    <label>Monto Final USD (Arqueo)</label>
                    <input type="number" id="close-final-usd" class="form-input" step="0.01" value="${totals.current_usd}" required>
                </div>
                <div class="form-group">
                    <label>Monto Final MXN (Arqueo)</label>
                    <input type="number" id="close-final-mxn" class="form-input" step="0.01" value="${totals.current_mxn}" required>
                </div>
                <div class="form-group">
                    <label>Monto Final CAD (Arqueo)</label>
                    <input type="number" id="close-final-cad" class="form-input" step="0.01" value="${totals.current_cad}" required>
                </div>
                <div class="form-group">
                    <label>Observaciones</label>
                    <textarea id="close-notes" class="form-input" rows="3" placeholder="Notas sobre el cierre..."></textarea>
                </div>
            </form>
        `;

        const self = this;
        UI.showModal('Cerrar Caja', modalContent, [
            {
                text: 'Cancelar',
                class: 'btn-secondary',
                onclick: () => UI.closeModal()
            },
            {
                text: 'Generar Utilidad del Día',
                class: 'btn-primary',
                onclick: () => self.generateDailyProfit()
            },
            {
                text: 'Cerrar Caja',
                class: 'btn-primary',
                onclick: () => self.processCloseCash()
            }
        ]);
    },

    async generateDailyProfit() {
        try {
            const branchId = this.currentSession?.branch_id || 
                (typeof BranchManager !== 'undefined' 
                    ? BranchManager.getCurrentBranchId() 
                    : localStorage.getItem('current_branch_id'));
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            
            Utils.showNotification('Calculando utilidad diaria...', 'info');
            
            const result = await ProfitCalculator.calculateDailyProfit(today, branchId);
            
            const branch = await DB.get('catalog_branches', branchId);
            const branchName = branch?.name || 'Tienda';
            
            const body = `
                <div style="padding: var(--spacing-md);">
                    <h4 style="margin-bottom: var(--spacing-md); color: var(--color-primary);">
                        <i class="fas fa-chart-line"></i> Utilidad Diaria - ${branchName}
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                        <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                            <div style="font-size: 10px; color: var(--color-text-secondary);">Ingresos</div>
                            <div style="font-size: 16px; font-weight: 700; color: var(--color-success);">
                                ${Utils.formatCurrency(result.calculations.revenue)}
                            </div>
                        </div>
                        <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                            <div style="font-size: 10px; color: var(--color-text-secondary);">Utilidad</div>
                            <div style="font-size: 16px; font-weight: 700; color: ${result.calculations.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                                ${Utils.formatCurrency(result.calculations.profit)}
                            </div>
                        </div>
                    </div>
                    <table style="width: 100%; font-size: 11px;">
                        <tr>
                            <td style="padding: 4px;">COGS:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.cogs)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Comisiones Vendedores:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.commissionsSellers)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Comisiones Guías:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.commissionsGuides)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Llegadas:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.arrivals)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Costos Fijos (Prorrateados):</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.fixedCosts)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Costos Variables:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${Utils.formatCurrency(result.calculations.variableCosts)}</td>
                        </tr>
                        <tr style="border-top: 2px solid var(--color-border);">
                            <td style="padding: 4px; font-weight: 700;">Utilidad Antes de Impuestos:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 700; color: ${result.calculations.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                                ${Utils.formatCurrency(result.calculations.profit)}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Margen:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${result.calculations.margin.toFixed(2)}%</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px;">Total PAX:</td>
                            <td style="text-align: right; padding: 4px; font-weight: 600;">${result.calculations.passengers}</td>
                        </tr>
                    </table>
                </div>
            `;

            UI.showModal('Utilidad Diaria Generada', body, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);
            
            Utils.showNotification('Utilidad diaria calculada y guardada', 'success');
        } catch (e) {
            console.error('Error generating daily profit:', e);
            Utils.showNotification('Error al generar utilidad diaria: ' + e.message, 'error');
        }
    },

    async processCloseCash() {
        try {
            if (!this.currentSession) return;

            const finalUsd = parseFloat(document.getElementById('close-final-usd')?.value || 0);
            const finalMxn = parseFloat(document.getElementById('close-final-mxn')?.value || 0);
            const finalCad = parseFloat(document.getElementById('close-final-cad')?.value || 0);
            const notes = document.getElementById('close-notes')?.value || '';

            const totals = await this.calculateCurrentTotals();
            
            // Calcular diferencias
            const diffUsd = finalUsd - totals.current_usd;
            const diffMxn = finalMxn - totals.current_mxn;
            const diffCad = finalCad - totals.current_cad;

            const session = {
                ...this.currentSession,
                final_usd: finalUsd,
                final_mxn: finalMxn,
                final_cad: finalCad,
                difference_usd: diffUsd,
                difference_mxn: diffMxn,
                difference_cad: diffCad,
                status: 'cerrada',
                notes: notes,
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await DB.put('cash_sessions', session);
            this.currentSession = null;
            await this.loadCurrentSession();
            UI.closeModal();
            
            let message = 'Caja cerrada correctamente';
            if (Math.abs(diffUsd) > 0.01 || Math.abs(diffMxn) > 0.01 || Math.abs(diffCad) > 0.01) {
                message += `. Diferencias: USD ${diffUsd.toFixed(2)}, MXN ${diffMxn.toFixed(2)}, CAD ${diffCad.toFixed(2)}`;
            }
            Utils.showNotification(message, diffUsd === 0 && diffMxn === 0 && diffCad === 0 ? 'success' : 'warning');
        } catch (e) {
            console.error('Error closing cash:', e);
            Utils.showNotification('Error al cerrar la caja', 'error');
        }
    },

    showMovementForm() {
        const modalContent = `
            <form id="cash-movement-form">
                <div class="form-group">
                    <label>Tipo de Movimiento</label>
                    <select id="movement-type" class="form-select" required>
                        <option value="entrada">Entrada</option>
                        <option value="salida">Salida</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Moneda</label>
                    <select id="movement-currency" class="form-select" required>
                        <option value="USD">USD</option>
                        <option value="MXN">MXN</option>
                        <option value="CAD">CAD</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Monto</label>
                    <input type="number" id="movement-amount" class="form-input" step="0.01" min="0.01" required>
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="movement-description" class="form-input" rows="3" placeholder="Motivo del movimiento..." required></textarea>
                </div>
            </form>
        `;

        const self = this;
        UI.showModal('Movimiento de Efectivo', modalContent, [
            {
                text: 'Cancelar',
                class: 'btn-secondary',
                onclick: () => UI.closeModal()
            },
            {
                text: 'Registrar',
                class: 'btn-primary',
                onclick: () => self.processMovement()
            }
        ]);
    },

    async processMovement() {
        try {
            if (!this.currentSession) {
                Utils.showNotification('No hay sesión de caja abierta', 'error');
                return;
            }

            const type = document.getElementById('movement-type')?.value;
            const currency = document.getElementById('movement-currency')?.value;
            const amount = parseFloat(document.getElementById('movement-amount')?.value || 0);
            const description = document.getElementById('movement-description')?.value || '';

            if (amount <= 0) {
                Utils.showNotification('El monto debe ser mayor a cero', 'error');
                return;
            }

            const movement = {
                id: Utils.generateId(),
                session_id: this.currentSession.id,
                type: type,
                currency: currency,
                amount: amount,
                description: description,
                created_at: new Date().toISOString()
            };

            await DB.add('cash_movements', movement);
            await this.loadCurrentSession();
            await this.loadSessionMovements();
            UI.closeModal();
            Utils.showNotification('Movimiento registrado correctamente', 'success');
        } catch (e) {
            console.error('Error processing movement:', e);
            Utils.showNotification('Error al registrar movimiento', 'error');
        }
    },

    toggleHistory() {
        const historySection = document.getElementById('cash-history-section');
        if (!historySection) return;

        if (historySection.style.display === 'none') {
            historySection.style.display = 'block';
            this.loadHistory();
        } else {
            historySection.style.display = 'none';
        }
    },

    async loadHistory() {
        try {
            const branchId = await this.getCurrentBranchId();
            let sessions = await DB.query('cash_sessions', 'branch_id', branchId);
            
            // Filtrar por fechas si están definidas
            const dateFrom = document.getElementById('cash-history-date-from')?.value;
            const dateTo = document.getElementById('cash-history-date-to')?.value;
            
            if (dateFrom) {
                sessions = sessions.filter(s => {
                    const sessionDate = Utils.formatDate(s.date, 'YYYY-MM-DD');
                    return sessionDate >= dateFrom;
                });
            }
            
            if (dateTo) {
                sessions = sessions.filter(s => {
                    const sessionDate = Utils.formatDate(s.date, 'YYYY-MM-DD');
                    return sessionDate <= dateTo;
                });
            }

            // Ordenar por fecha descendente
            sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            this.displayHistory(sessions);
        } catch (e) {
            console.error('Error loading history:', e);
            Utils.showNotification('Error al cargar historial', 'error');
        }
    },

    displayHistory(sessions) {
        const list = document.getElementById('cash-history-list');
        if (!list) return;

        if (sessions.length === 0) {
            list.innerHTML = '<div class="empty-state">No hay sesiones registradas</div>';
            return;
        }

        list.innerHTML = sessions.map(session => {
            const statusClass = session.status === 'abierta' ? 'status-open' : 'status-closed';
            const statusLabel = session.status === 'abierta' ? 'Abierta' : 'Cerrada';
            const date = Utils.formatDate(session.date, 'YYYY-MM-DD');
            const openedAt = Utils.formatDate(session.created_at, 'YYYY-MM-DD HH:mm');
            const closedAt = session.closed_at ? Utils.formatDate(session.closed_at, 'YYYY-MM-DD HH:mm') : '-';

            return `
                <div class="cash-history-item">
                    <div class="history-header">
                        <div class="history-date">
                            <strong>${date}</strong>
                            <span class="history-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="history-user">${session.user_name || 'Usuario'}</div>
                    </div>
                    <div class="history-details">
                        <div class="history-row">
                            <span>Abierta:</span>
                            <span>${openedAt}</span>
                        </div>
                        ${session.closed_at ? `
                        <div class="history-row">
                            <span>Cerrada:</span>
                            <span>${closedAt}</span>
                        </div>
                        ` : ''}
                        <div class="history-totals">
                            <div class="history-total">
                                <span>Inicial USD:</span>
                                <strong>${Utils.formatCurrency(session.initial_usd || 0, 'USD')}</strong>
                            </div>
                            <div class="history-total">
                                <span>Inicial MXN:</span>
                                <strong>${Utils.formatCurrency(session.initial_mxn || 0)}</strong>
                            </div>
                            ${session.status === 'cerrada' ? `
                            <div class="history-total">
                                <span>Final USD:</span>
                                <strong>${Utils.formatCurrency(session.final_usd || 0, 'USD')}</strong>
                            </div>
                            <div class="history-total">
                                <span>Final MXN:</span>
                                <strong>${Utils.formatCurrency(session.final_mxn || 0)}</strong>
                            </div>
                            ${session.difference_usd !== undefined || session.difference_mxn !== undefined ? `
                            <div class="history-total ${(session.difference_usd !== 0 || session.difference_mxn !== 0) ? 'difference' : ''}">
                                <span>Diferencia:</span>
                                <strong>USD ${(session.difference_usd || 0).toFixed(2)}, MXN ${(session.difference_mxn || 0).toFixed(2)}</strong>
                            </div>
                            ` : ''}
                            ` : ''}
                        </div>
                        ${session.notes ? `
                        <div class="history-notes">
                            <strong>Notas:</strong> ${session.notes}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    async getCurrentBranchId() {
        const branch = await DB.get('settings', 'current_branch');
        return branch?.value || 'branch1';
    },

    async getCurrentUserId() {
        const user = await DB.get('settings', 'current_user');
        return user?.value || null;
    },

    async getCurrentUserName() {
        const userId = await this.getCurrentUserId();
        if (!userId) return 'Usuario';
        
        const user = await DB.get('users', userId);
        if (user) {
            const employee = await DB.get('employees', user.employee_id);
            return employee?.name || user.username || 'Usuario';
        }
        return 'Usuario';
    },

    // ========================================
    // FUNCIONALIDADES AVANZADAS
    // ========================================

    async showPartialCountForm() {
        if (!this.currentSession) return;

        const totals = await this.calculateCurrentTotals();
        
        const modalContent = `
            <form id="cash-partial-form">
                <div class="cash-close-info">
                    <h4>Totales Actuales</h4>
                    <div class="info-row">
                        <span>Efectivo USD:</span>
                        <strong>${Utils.formatCurrency(totals.current_usd, 'USD')}</strong>
                    </div>
                    <div class="info-row">
                        <span>Efectivo MXN:</span>
                        <strong>${Utils.formatCurrency(totals.current_mxn)}</strong>
                    </div>
                    <div class="info-row">
                        <span>Efectivo CAD:</span>
                        <strong>${Utils.formatCurrency(totals.current_cad, 'CAD')}</strong>
                    </div>
                </div>
                <div class="form-group">
                    <label>Monto Contado USD</label>
                    <input type="number" id="partial-count-usd" class="form-input" step="0.01" value="${totals.current_usd}" required>
                </div>
                <div class="form-group">
                    <label>Monto Contado MXN</label>
                    <input type="number" id="partial-count-mxn" class="form-input" step="0.01" value="${totals.current_mxn}" required>
                </div>
                <div class="form-group">
                    <label>Monto Contado CAD</label>
                    <input type="number" id="partial-count-cad" class="form-input" step="0.01" value="${totals.current_cad}" required>
                </div>
                <div class="form-group">
                    <label>Observaciones</label>
                    <textarea id="partial-notes" class="form-input" rows="3" placeholder="Notas sobre el arqueo parcial..."></textarea>
                </div>
            </form>
        `;

        const self = this;
        UI.showModal('Arqueo Parcial', modalContent, [
            {
                text: 'Cancelar',
                class: 'btn-secondary',
                onclick: () => UI.closeModal()
            },
            {
                text: 'Registrar Arqueo',
                class: 'btn-primary',
                onclick: () => self.processPartialCount()
            }
        ]);
    },

    async processPartialCount() {
        try {
            if (!this.currentSession) return;

            const countUsd = parseFloat(document.getElementById('partial-count-usd')?.value || 0);
            const countMxn = parseFloat(document.getElementById('partial-count-mxn')?.value || 0);
            const countCad = parseFloat(document.getElementById('partial-count-cad')?.value || 0);
            const notes = document.getElementById('partial-notes')?.value || '';

            const totals = await this.calculateCurrentTotals();
            
            // Calcular diferencias
            const diffUsd = countUsd - totals.current_usd;
            const diffMxn = countMxn - totals.current_mxn;
            const diffCad = countCad - totals.current_cad;

            // Guardar arqueo parcial como movimiento especial
            const partialCount = {
                id: Utils.generateId(),
                session_id: this.currentSession.id,
                type: 'arqueo_parcial',
                currency: 'MULTI',
                amount: 0,
                description: `Arqueo Parcial - USD: ${countUsd.toFixed(2)}, MXN: ${countMxn.toFixed(2)}, CAD: ${countCad.toFixed(2)}. ${notes}`,
                count_usd: countUsd,
                count_mxn: countMxn,
                count_cad: countCad,
                expected_usd: totals.current_usd,
                expected_mxn: totals.current_mxn,
                expected_cad: totals.current_cad,
                difference_usd: diffUsd,
                difference_mxn: diffMxn,
                difference_cad: diffCad,
                created_at: new Date().toISOString()
            };

            await DB.add('cash_movements', partialCount);
            await this.loadCurrentSession();
            await this.loadSessionMovements();
            UI.closeModal();
            
            let message = 'Arqueo parcial registrado';
            if (Math.abs(diffUsd) > 0.01 || Math.abs(diffMxn) > 0.01 || Math.abs(diffCad) > 0.01) {
                message += `. Diferencias: USD ${diffUsd.toFixed(2)}, MXN ${diffMxn.toFixed(2)}, CAD ${diffCad.toFixed(2)}`;
                Utils.showNotification(message, 'warning');
            } else {
                Utils.showNotification(message, 'success');
            }
        } catch (e) {
            console.error('Error processing partial count:', e);
            Utils.showNotification('Error al registrar arqueo parcial', 'error');
        }
    },

    async reconcileWithPOS() {
        if (!this.currentSession) {
            Utils.showNotification('No hay sesión de caja abierta', 'error');
            return;
        }

        try {
            const totals = await this.calculateCurrentTotals();
            const branchId = await this.getCurrentBranchId();
            const sessionDate = Utils.formatDate(this.currentSession.date, 'YYYY-MM-DD');
            
            // Obtener todas las ventas del día (filtradas por sucursal)
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: true,
                branchIdField: 'branch_id' 
            }) || [];
            const sessionSales = sales.filter(s => {
                const saleDate = Utils.formatDate(s.created_at, 'YYYY-MM-DD');
                return saleDate === sessionDate && s.status === 'completada';
            });

            // Calcular efectivo esperado desde ventas POS
            let expectedCashUsd = 0;
            let expectedCashMxn = 0;
            let expectedCashCad = 0;
            let totalTpvVisa = 0;
            let totalTpvAmex = 0;

            for (const sale of sessionSales) {
                const payments = await DB.query('payments', 'sale_id', sale.id);
                payments.forEach(p => {
                    if (p.method_id?.includes('CASH')) {
                        if (p.currency === 'USD') expectedCashUsd += p.amount;
                        if (p.currency === 'MXN') expectedCashMxn += p.amount;
                        if (p.currency === 'CAD') expectedCashCad += p.amount;
                    } else if (p.method_id?.includes('VISA') || p.method_id?.includes('MC')) {
                        totalTpvVisa += p.amount;
                    } else if (p.method_id?.includes('AMEX')) {
                        totalTpvAmex += p.amount;
                    }
                });
            }

            // Calcular diferencias
            const diffUsd = totals.current_usd - (totals.sales_cash_usd || 0);
            const diffMxn = totals.current_mxn - (totals.sales_cash_mxn || 0);
            const diffCad = totals.current_cad - (totals.sales_cash_cad || 0);

            // Mostrar panel de conciliación
            const panel = document.getElementById('cash-reconciliation-panel');
            const content = document.getElementById('cash-reconciliation-content');
            
            if (panel && content) {
                panel.style.display = 'block';
                content.innerHTML = `
                    <div class="reconciliation-grid">
                        <div class="reconciliation-card">
                            <h4>Efectivo en Caja</h4>
                            <div class="reconciliation-row">
                                <span>USD:</span>
                                <strong>${Utils.formatCurrency(totals.current_usd, 'USD')}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>MXN:</span>
                                <strong>${Utils.formatCurrency(totals.current_mxn)}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>CAD:</span>
                                <strong>${Utils.formatCurrency(totals.current_cad, 'CAD')}</strong>
                            </div>
                        </div>
                        <div class="reconciliation-card">
                            <h4>Efectivo de Ventas POS</h4>
                            <div class="reconciliation-row">
                                <span>USD:</span>
                                <strong>${Utils.formatCurrency(expectedCashUsd, 'USD')}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>MXN:</span>
                                <strong>${Utils.formatCurrency(expectedCashMxn)}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>CAD:</span>
                                <strong>${Utils.formatCurrency(expectedCashCad, 'CAD')}</strong>
                            </div>
                        </div>
                        <div class="reconciliation-card">
                            <h4>Diferencias</h4>
                            <div class="reconciliation-row ${Math.abs(diffUsd) > 0.01 ? 'difference' : ''}">
                                <span>USD:</span>
                                <strong>${Utils.formatCurrency(diffUsd, 'USD')}</strong>
                            </div>
                            <div class="reconciliation-row ${Math.abs(diffMxn) > 0.01 ? 'difference' : ''}">
                                <span>MXN:</span>
                                <strong>${Utils.formatCurrency(diffMxn)}</strong>
                            </div>
                            <div class="reconciliation-row ${Math.abs(diffCad) > 0.01 ? 'difference' : ''}">
                                <span>CAD:</span>
                                <strong>${Utils.formatCurrency(diffCad, 'CAD')}</strong>
                            </div>
                        </div>
                        <div class="reconciliation-card">
                            <h4>Resumen de Ventas</h4>
                            <div class="reconciliation-row">
                                <span>Total Ventas:</span>
                                <strong>${totals.total_sales_count || 0}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>TPV Visa/MC:</span>
                                <strong>${Utils.formatCurrency(totalTpvVisa)}</strong>
                            </div>
                            <div class="reconciliation-row">
                                <span>TPV Amex:</span>
                                <strong>${Utils.formatCurrency(totalTpvAmex)}</strong>
                            </div>
                        </div>
                    </div>
                    ${Math.abs(diffUsd) > 0.01 || Math.abs(diffMxn) > 0.01 || Math.abs(diffCad) > 0.01 ? `
                    <div class="reconciliation-alert">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>¡Atención!</strong> Se detectaron diferencias entre el efectivo en caja y las ventas registradas.
                        Revisa los movimientos manuales y las ventas del día.
                    </div>
                    ` : `
                    <div class="reconciliation-success">
                        <i class="fas fa-check-circle"></i>
                        <strong>¡Perfecto!</strong> El efectivo en caja coincide con las ventas registradas.
                    </div>
                    `}
                `;
            }

            Utils.showNotification('Conciliación completada', 'success');
        } catch (e) {
            console.error('Error reconciling:', e);
            Utils.showNotification('Error al conciliar con POS', 'error');
        }
    },

    async loadAdvancedStats() {
        if (!this.currentSession) return;

        try {
            const totals = await this.calculateCurrentTotals();
            const movements = await DB.query('cash_movements', 'session_id', this.currentSession.id);
            
            // Calcular estadísticas
            const entries = movements.filter(m => m.type === 'entrada').length;
            const exits = movements.filter(m => m.type === 'salida').length;
            const partialCounts = movements.filter(m => m.type === 'arqueo_parcial').length;
            
            let totalEntries = 0;
            let totalExits = 0;
            movements.forEach(m => {
                if (m.type === 'entrada') totalEntries += (m.amount || 0);
                if (m.type === 'salida') totalExits += (m.amount || 0);
            });

            const statsSection = document.getElementById('cash-stats-section');
            const statsContent = document.getElementById('cash-stats-content');
            
            if (statsSection && statsContent) {
                statsSection.style.display = 'block';
                statsContent.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                            <div class="stat-value">${totals.total_sales_count || 0}</div>
                            <div class="stat-label">Ventas del Día</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-arrow-down"></i></div>
                            <div class="stat-value">${entries}</div>
                            <div class="stat-label">Entradas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-arrow-up"></i></div>
                            <div class="stat-value">${exits}</div>
                            <div class="stat-label">Salidas</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-calculator"></i></div>
                            <div class="stat-value">${partialCounts}</div>
                            <div class="stat-label">Arqueos Parciales</div>
                        </div>
                    </div>
                    <div class="stats-details">
                        <h4>Desglose de Pagos</h4>
                        <div class="payment-breakdown">
                            <div class="breakdown-item">
                                <span>Efectivo USD:</span>
                                <strong>${Utils.formatCurrency(totals.sales_cash_usd || 0, 'USD')}</strong>
                            </div>
                            <div class="breakdown-item">
                                <span>Efectivo MXN:</span>
                                <strong>${Utils.formatCurrency(totals.sales_cash_mxn || 0)}</strong>
                            </div>
                            <div class="breakdown-item">
                                <span>Efectivo CAD:</span>
                                <strong>${Utils.formatCurrency(totals.sales_cash_cad || 0, 'CAD')}</strong>
                            </div>
                            <div class="breakdown-item">
                                <span>TPV Visa/MC:</span>
                                <strong>${Utils.formatCurrency(totals.sales_tpv_visa || 0)}</strong>
                            </div>
                            <div class="breakdown-item">
                                <span>TPV Amex:</span>
                                <strong>${Utils.formatCurrency(totals.sales_tpv_amex || 0)}</strong>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            console.error('Error loading advanced stats:', e);
        }
    },

    async generateReport() {
        if (!this.currentSession) {
            Utils.showNotification('No hay sesión de caja abierta', 'error');
            return;
        }

        try {
            const totals = await this.calculateCurrentTotals();
            const movements = await DB.query('cash_movements', 'session_id', this.currentSession.id);
            const branchId = await this.getCurrentBranchId();
            const branch = await DB.get('catalog_branches', branchId);
            const branchName = branch?.name || 'Sucursal';
            
            const sessionDate = Utils.formatDate(this.currentSession.date, 'YYYY-MM-DD');
            const openedAt = Utils.formatDate(this.currentSession.created_at, 'YYYY-MM-DD HH:mm');
            
            // Crear contenido del reporte
            const reportData = {
                branch: branchName,
                date: sessionDate,
                openedAt: openedAt,
                openedBy: this.currentSession.user_name || 'Usuario',
                initial: {
                    usd: this.currentSession.initial_usd || 0,
                    mxn: this.currentSession.initial_mxn || 0,
                    cad: this.currentSession.initial_cad || 0
                },
                current: {
                    usd: totals.current_usd,
                    mxn: totals.current_mxn,
                    cad: totals.current_cad
                },
                sales: {
                    total: totals.total_sales_count || 0,
                    cash_usd: totals.sales_cash_usd || 0,
                    cash_mxn: totals.sales_cash_mxn || 0,
                    cash_cad: totals.sales_cash_cad || 0,
                    tpv_visa: totals.sales_tpv_visa || 0,
                    tpv_amex: totals.sales_tpv_amex || 0
                },
                movements: movements.map(m => ({
                    type: m.type,
                    currency: m.currency,
                    amount: m.amount || 0,
                    description: m.description || '',
                    date: Utils.formatDate(m.created_at, 'YYYY-MM-DD HH:mm')
                }))
            };

            // Generar PDF usando jsPDF
            const jspdfLib = Utils.checkJsPDF();
            if (jspdfLib) {
                this.generatePDFReport(reportData);
            } else {
                // Fallback: exportar como CSV
                Utils.showNotification('jsPDF no disponible, exportando como CSV', 'warning');
                this.exportCSVReport(reportData);
            }
        } catch (e) {
            console.error('Error generating report:', e);
            Utils.showNotification('Error al generar reporte', 'error');
        }
    },

    generatePDFReport(data) {
        const jspdfLib = Utils.checkJsPDF();
        if (!jspdfLib) {
            Utils.showNotification('jsPDF no disponible', 'error');
            return;
        }
        const { jsPDF } = jspdfLib;
        const doc = new jsPDF();
        
        // Título
        doc.setFontSize(18);
        doc.text('Reporte de Caja', 105, 20, { align: 'center' });
        
        // Información general
        doc.setFontSize(12);
        doc.text(`Sucursal: ${data.branch}`, 20, 35);
        doc.text(`Fecha: ${data.date}`, 20, 42);
        doc.text(`Abierta por: ${data.openedBy}`, 20, 49);
        doc.text(`Hora de apertura: ${data.openedAt}`, 20, 56);
        
        // Totales
        let y = 70;
        doc.setFontSize(14);
        doc.text('Totales', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.text(`Monto Inicial USD: ${Utils.formatCurrency(data.initial.usd, 'USD')}`, 25, y);
        y += 7;
        doc.text(`Monto Inicial MXN: ${Utils.formatCurrency(data.initial.mxn)}`, 25, y);
        y += 7;
        doc.text(`Monto Inicial CAD: ${Utils.formatCurrency(data.initial.cad, 'CAD')}`, 25, y);
        y += 10;
        
        doc.text(`Efectivo Actual USD: ${Utils.formatCurrency(data.current.usd, 'USD')}`, 25, y);
        y += 7;
        doc.text(`Efectivo Actual MXN: ${Utils.formatCurrency(data.current.mxn)}`, 25, y);
        y += 7;
        doc.text(`Efectivo Actual CAD: ${Utils.formatCurrency(data.current.cad, 'CAD')}`, 25, y);
        y += 10;
        
        // Ventas
        doc.setFontSize(14);
        doc.text('Resumen de Ventas', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.text(`Total de Ventas: ${data.sales.total}`, 25, y);
        y += 7;
        doc.text(`Efectivo USD: ${Utils.formatCurrency(data.sales.cash_usd, 'USD')}`, 25, y);
        y += 7;
        doc.text(`Efectivo MXN: ${Utils.formatCurrency(data.sales.cash_mxn)}`, 25, y);
        y += 7;
        doc.text(`Efectivo CAD: ${Utils.formatCurrency(data.sales.cash_cad, 'CAD')}`, 25, y);
        y += 7;
        doc.text(`TPV Visa/MC: ${Utils.formatCurrency(data.sales.tpv_visa)}`, 25, y);
        y += 7;
        doc.text(`TPV Amex: ${Utils.formatCurrency(data.sales.tpv_amex)}`, 25, y);
        
        // Guardar PDF
        const fileName = `Reporte_Caja_${data.date}_${Date.now()}.pdf`;
        doc.save(fileName);
        Utils.showNotification('Reporte PDF generado', 'success');
    },

    exportCSVReport(data) {
        let csv = 'Reporte de Caja\n';
        csv += `Sucursal,${data.branch}\n`;
        csv += `Fecha,${data.date}\n`;
        csv += `Abierta por,${data.openedBy}\n`;
        csv += `Hora de apertura,${data.openedAt}\n\n`;
        
        csv += 'Totales\n';
        csv += `Monto Inicial USD,${data.initial.usd}\n`;
        csv += `Monto Inicial MXN,${data.initial.mxn}\n`;
        csv += `Monto Inicial CAD,${data.initial.cad}\n`;
        csv += `Efectivo Actual USD,${data.current.usd}\n`;
        csv += `Efectivo Actual MXN,${data.current.mxn}\n`;
        csv += `Efectivo Actual CAD,${data.current.cad}\n\n`;
        
        csv += 'Ventas\n';
        csv += `Total Ventas,${data.sales.total}\n`;
        csv += `Efectivo USD,${data.sales.cash_usd}\n`;
        csv += `Efectivo MXN,${data.sales.cash_mxn}\n`;
        csv += `Efectivo CAD,${data.sales.cash_cad}\n`;
        csv += `TPV Visa/MC,${data.sales.tpv_visa}\n`;
        csv += `TPV Amex,${data.sales.tpv_amex}\n\n`;
        
        csv += 'Movimientos\n';
        csv += 'Tipo,Moneda,Monto,Descripción,Fecha\n';
        data.movements.forEach(m => {
            csv += `${m.type},${m.currency},${m.amount},"${m.description}",${m.date}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Caja_${data.date}_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Utils.showNotification('Reporte CSV exportado', 'success');
    }
};

