// Customers Module (CRM) - Versión Avanzada
// Sistema CRM completo con tabla horizontal y funcionalidades profesionales

const Customers = {
    initialized: false,
    currentView: 'table', // 'table' o 'cards'
    selectedCustomers: new Set(),
    sortConfig: { field: 'totalSpent', direction: 'desc' },
    
    async init() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('customers.view')) {
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver clientes</div>';
            }
            return;
        }

        if (this.initialized) return;
        this.setupEventListeners();
        await this.loadCustomers();
        this.initialized = true;
    },

    setupEventListeners() {
        window.addEventListener('demo-data-loaded', () => {
            if (this.initialized) {
                this.loadCustomers();
            }
        });
        
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div class="customers-module">
                <!-- Barra de acciones superior -->
                <div class="customers-toolbar">
                    <div class="customers-toolbar-left">
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('customers.add') ? `
                            <button class="btn-primary" id="customer-add-btn">
                                <i class="fas fa-plus"></i> Nuevo Cliente
                            </button>
                        ` : ''}
                        <button class="btn-secondary" id="customer-import-btn">
                            <i class="fas fa-file-import"></i> Importar
                        </button>
                        <button class="btn-secondary" id="customer-export-btn">
                            <i class="fas fa-file-export"></i> Exportar
                        </button>
                        <div class="customers-bulk-actions" id="bulk-actions" style="display: none;">
                            <span class="bulk-count"><span id="selected-count">0</span> seleccionados</span>
                            <button class="btn-secondary btn-sm" onclick="window.Customers.bulkEmail()">
                                <i class="fas fa-envelope"></i> Email
                            </button>
                            <button class="btn-secondary btn-sm" onclick="window.Customers.bulkSegment()">
                                <i class="fas fa-tags"></i> Segmentar
                            </button>
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('customers.delete') ? `
                                <button class="btn-danger btn-sm" onclick="window.Customers.bulkDelete()">
                                    <i class="fas fa-trash"></i> Eliminar
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="customers-toolbar-right">
                        <div class="view-toggle">
                            <button class="view-btn active" data-view="table" onclick="window.Customers.setView('table')" title="Vista Tabla">
                                <i class="fas fa-table"></i>
                            </button>
                            <button class="view-btn" data-view="cards" onclick="window.Customers.setView('cards')" title="Vista Tarjetas">
                                <i class="fas fa-th-large"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Filtros avanzados -->
                <div class="customers-filters">
                    <div class="filters-row">
                        <div class="filter-group filter-search">
                            <label><i class="fas fa-search"></i> Búsqueda</label>
                            <input type="text" id="customer-search" class="form-input" placeholder="Nombre, email, teléfono, etiquetas...">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-layer-group"></i> Segmento</label>
                            <select id="customer-segment-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="VIP">VIP</option>
                                <option value="Premium">Premium</option>
                                <option value="Regular">Regular</option>
                                <option value="Nuevo">Nuevo</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-globe"></i> País</label>
                            <select id="customer-country-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="México">México</option>
                                <option value="Estados Unidos">Estados Unidos</option>
                                <option value="Canadá">Canadá</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-calendar"></i> Última Compra</label>
                            <select id="customer-activity-filter" class="form-select">
                                <option value="">Cualquier fecha</option>
                                <option value="7">Últimos 7 días</option>
                                <option value="30">Últimos 30 días</option>
                                <option value="90">Últimos 90 días</option>
                                <option value="inactive">Sin compras (+90 días)</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-dollar-sign"></i> Valor Mínimo</label>
                            <input type="number" id="customer-min-value" class="form-input" placeholder="$0" min="0">
                        </div>
                    </div>
                </div>

                <!-- Estadísticas CRM -->
                <div id="customers-stats" class="customers-stats-container"></div>

                <!-- Lista de clientes -->
                <div id="customers-list" class="customers-list-container"></div>
            </div>
        `;

        // Event listeners
        document.getElementById('customer-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('customer-import-btn')?.addEventListener('click', () => this.showImportDialog());
        document.getElementById('customer-export-btn')?.addEventListener('click', () => this.exportCustomers());
        
        // Filtros con debounce
        document.getElementById('customer-search')?.addEventListener('input', Utils.debounce(() => this.loadCustomers(), 300));
        document.getElementById('customer-segment-filter')?.addEventListener('change', () => this.loadCustomers());
        document.getElementById('customer-country-filter')?.addEventListener('change', () => this.loadCustomers());
        document.getElementById('customer-activity-filter')?.addEventListener('change', () => this.loadCustomers());
        document.getElementById('customer-min-value')?.addEventListener('input', Utils.debounce(() => this.loadCustomers(), 500));

        // Escuchar eventos de ventas para actualizar historial de clientes
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            // Usar debounce para evitar recargas excesivas
            let saleUpdateTimeout = null;
            Utils.EventBus.on('sale-completed', async (data) => {
                if (this.initialized && data && data.sale) {
                    // Limpiar timeout anterior si existe
                    if (saleUpdateTimeout) {
                        clearTimeout(saleUpdateTimeout);
                    }
                    // Usar debounce de 500ms
                    saleUpdateTimeout = setTimeout(async () => {
                        // Recargar lista de clientes para actualizar estadísticas
                        await this.loadCustomers();
                    }, 500);
                }
            });
        }
    },

    setView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.loadCustomers();
    },

    async loadCustomers() {
        try {
            // Obtener sucursal actual y filtrar datos
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            // Los clientes no tienen branch_id, pero las ventas sí
            let customers = await DB.getAll('customers');
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Si no es admin, filtrar clientes que solo tienen ventas en la sucursal actual
            if (!viewAllBranches && currentBranchId) {
                const normalizedBranchId = String(currentBranchId);
                const customerIdsWithSales = new Set(
                    sales
                        .filter(s => {
                            const saleBranchId = s.branch_id != null ? String(s.branch_id) : null;
                            return saleBranchId === normalizedBranchId;
                        })
                        .map(s => s.customer_id)
                        .filter(id => id)
                );
                // Mantener clientes que tienen ventas en esta sucursal o que no tienen ventas
                customers = customers.filter(c => 
                    !c.id || customerIdsWithSales.has(c.id) || !sales.some(s => s.customer_id === c.id)
                );
            }
            
            // Enriquecer datos de clientes con estadísticas
            const customersWithStats = await Promise.all(customers.map(async customer => {
                const customerSales = sales.filter(s => s.customer_id === customer.id && s.status === 'completada');
                const totalSpent = customerSales.reduce((sum, s) => sum + (s.total || 0), 0);
                const lastPurchase = customerSales.length > 0 
                    ? customerSales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
                    : null;
                const lastPurchaseDays = lastPurchase ? this.daysSinceLastPurchase(lastPurchase.created_at) : null;
                
                // Calcular segmento automático basado en comportamiento
                const autoSegment = this.calculateCustomerSegment(totalSpent, customerSales.length, lastPurchaseDays);
                
                return {
                    ...customer,
                    purchaseCount: customerSales.length,
                    totalSpent,
                    lastPurchaseDate: lastPurchase ? lastPurchase.created_at : null,
                    lastPurchaseDays,
                    avgPurchase: customerSales.length > 0 ? totalSpent / customerSales.length : 0,
                    autoSegment,
                    customerScore: this.calculateCustomerScore(totalSpent, customerSales.length, lastPurchaseDays, customerSales.length > 0 ? totalSpent / customerSales.length : 0)
                };
            }));

            // Aplicar filtros
            let filtered = this.applyFilters(customersWithStats);
            
            // Ordenar
            filtered = this.sortCustomers(filtered);

            // Mostrar estadísticas
            await this.displayCustomerStats(customersWithStats);
            
            // Mostrar clientes según la vista actual
            if (this.currentView === 'table') {
                this.displayCustomersTable(filtered);
            } else {
                this.displayCustomersCards(filtered);
            }
        } catch (e) {
            console.error('Error loading customers:', e);
            Utils.showNotification('Error al cargar clientes', 'error');
        }
    },

    applyFilters(customers) {
        let filtered = [...customers];
        
        // Búsqueda
        const search = document.getElementById('customer-search')?.value.toLowerCase() || '';
        if (search) {
            filtered = filtered.filter(c => 
                c.name?.toLowerCase().includes(search) ||
                c.lastname?.toLowerCase().includes(search) ||
                c.email?.toLowerCase().includes(search) ||
                c.phone?.includes(search) ||
                c.tags?.toLowerCase().includes(search)
            );
        }

        // Segmento
        const segmentFilter = document.getElementById('customer-segment-filter')?.value;
        if (segmentFilter) {
            if (segmentFilter === 'Inactivo') {
                filtered = filtered.filter(c => c.lastPurchaseDays === null || c.lastPurchaseDays > 90);
            } else {
                filtered = filtered.filter(c => c.segment === segmentFilter || c.autoSegment === segmentFilter);
            }
        }

        // País
        const countryFilter = document.getElementById('customer-country-filter')?.value;
        if (countryFilter) {
            filtered = filtered.filter(c => c.country === countryFilter);
        }

        // Actividad
        const activityFilter = document.getElementById('customer-activity-filter')?.value;
        if (activityFilter) {
            if (activityFilter === 'inactive') {
                filtered = filtered.filter(c => c.lastPurchaseDays === null || c.lastPurchaseDays > 90);
            } else {
                const days = parseInt(activityFilter);
                filtered = filtered.filter(c => c.lastPurchaseDays !== null && c.lastPurchaseDays <= days);
            }
        }

        // Valor mínimo
        const minValue = parseFloat(document.getElementById('customer-min-value')?.value) || 0;
        if (minValue > 0) {
            filtered = filtered.filter(c => c.totalSpent >= minValue);
        }

        return filtered;
    },

    sortCustomers(customers) {
        const { field, direction } = this.sortConfig;
        return customers.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];
            
            if (field === 'name') {
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
            }
            
            if (typeof valA === 'string') {
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            
            return direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
        });
    },

    setSortConfig(field) {
        if (this.sortConfig.field === field) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.field = field;
            this.sortConfig.direction = 'desc';
        }
        this.loadCustomers();
    },

    async displayCustomerStats(customers) {
        const statsContainer = document.getElementById('customers-stats');
        if (!statsContainer) return;
        
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(c => c.purchaseCount > 0).length;
        const inactiveCustomers = customers.filter(c => c.lastPurchaseDays === null || c.lastPurchaseDays > 90).length;
        const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
        const avgCustomerValue = activeCustomers > 0 ? totalRevenue / activeCustomers : 0;
        const avgPurchaseFrequency = activeCustomers > 0 ? customers.filter(c => c.purchaseCount > 0).reduce((sum, c) => sum + c.purchaseCount, 0) / activeCustomers : 0;
        
        // Segmentación
        const vipCount = customers.filter(c => c.autoSegment === 'VIP').length;
        const premiumCount = customers.filter(c => c.autoSegment === 'Premium').length;
        const regularCount = customers.filter(c => c.autoSegment === 'Regular').length;
        const newCount = customers.filter(c => c.autoSegment === 'Nuevo' || c.autoSegment === 'Ocasional').length;
        
        // Top clientes
        const topCustomers = customers
            .filter(c => c.totalSpent > 0)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 5);
        
        statsContainer.innerHTML = `
            <div class="customers-stats-grid">
                <!-- KPIs principales -->
                <div class="stats-kpi-section">
                    <div class="kpi-card kpi-highlight">
                        <div class="kpi-icon"><i class="fas fa-users"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${totalCustomers}</div>
                            <div class="kpi-label">Total Clientes</div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-icon"><i class="fas fa-user-check"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${activeCustomers}</div>
                            <div class="kpi-label">Activos</div>
                            <div class="kpi-subtext">${totalCustomers > 0 ? ((activeCustomers / totalCustomers) * 100).toFixed(0) : 0}%</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-warning">
                        <div class="kpi-icon"><i class="fas fa-user-clock"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${inactiveCustomers}</div>
                            <div class="kpi-label">Inactivos</div>
                            <div class="kpi-subtext">&gt;90 días</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-success">
                        <div class="kpi-icon"><i class="fas fa-dollar-sign"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${Utils.formatCurrency(totalRevenue)}</div>
                            <div class="kpi-label">Ingresos Totales</div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-icon"><i class="fas fa-chart-line"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${Utils.formatCurrency(avgCustomerValue)}</div>
                            <div class="kpi-label">Valor Promedio</div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-icon"><i class="fas fa-redo"></i></div>
                        <div class="kpi-content">
                            <div class="kpi-value">${avgPurchaseFrequency.toFixed(1)}</div>
                            <div class="kpi-label">Compras/Cliente</div>
                        </div>
                    </div>
                </div>

                <!-- Segmentación y Top Clientes -->
                <div class="stats-details-section">
                    <div class="stats-segment-card">
                        <h4><i class="fas fa-chart-pie"></i> Segmentación</h4>
                        <div class="segment-bars">
                            <div class="segment-bar">
                                <div class="segment-info">
                                    <span class="segment-badge segment-vip">VIP</span>
                                    <span class="segment-count">${vipCount}</span>
                                </div>
                                <div class="segment-progress">
                                    <div class="segment-fill segment-fill-vip" style="width: ${totalCustomers > 0 ? (vipCount/totalCustomers*100) : 0}%"></div>
                                </div>
                            </div>
                            <div class="segment-bar">
                                <div class="segment-info">
                                    <span class="segment-badge segment-premium">Premium</span>
                                    <span class="segment-count">${premiumCount}</span>
                                </div>
                                <div class="segment-progress">
                                    <div class="segment-fill segment-fill-premium" style="width: ${totalCustomers > 0 ? (premiumCount/totalCustomers*100) : 0}%"></div>
                                </div>
                            </div>
                            <div class="segment-bar">
                                <div class="segment-info">
                                    <span class="segment-badge segment-regular">Regular</span>
                                    <span class="segment-count">${regularCount}</span>
                                </div>
                                <div class="segment-progress">
                                    <div class="segment-fill segment-fill-regular" style="width: ${totalCustomers > 0 ? (regularCount/totalCustomers*100) : 0}%"></div>
                                </div>
                            </div>
                            <div class="segment-bar">
                                <div class="segment-info">
                                    <span class="segment-badge segment-new">Nuevo</span>
                                    <span class="segment-count">${newCount}</span>
                                </div>
                                <div class="segment-progress">
                                    <div class="segment-fill segment-fill-new" style="width: ${totalCustomers > 0 ? (newCount/totalCustomers*100) : 0}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${topCustomers.length > 0 ? `
                    <div class="stats-top-card">
                        <h4><i class="fas fa-trophy"></i> Top 5 Clientes</h4>
                        <div class="top-customers-list">
                            ${topCustomers.map((c, idx) => `
                                <div class="top-customer-item" onclick="window.Customers.showCustomer360('${c.id}')">
                                    <div class="top-rank">#${idx + 1}</div>
                                    <div class="top-info">
                                        <div class="top-name">${c.name} ${c.lastname || ''}</div>
                                        <div class="top-meta">${c.purchaseCount} compras</div>
                                    </div>
                                    <div class="top-value">${Utils.formatCurrency(c.totalSpent)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    displayCustomersTable(customers) {
        const container = document.getElementById('customers-list');
        if (!container) return;

        if (customers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No hay clientes</h3>
                    <p>Agrega tu primer cliente para comenzar</p>
                    <button class="btn-primary" onclick="window.Customers.showAddForm()">
                        <i class="fas fa-plus"></i> Agregar Cliente
                    </button>
                </div>
            `;
            return;
        }

        const getSortIcon = (field) => {
            if (this.sortConfig.field !== field) return '<i class="fas fa-sort"></i>';
            return this.sortConfig.direction === 'asc' 
                ? '<i class="fas fa-sort-up"></i>' 
                : '<i class="fas fa-sort-down"></i>';
        };

        container.innerHTML = `
            <div class="customers-table-wrapper">
                <table class="customers-table">
                    <thead>
                        <tr>
                            <th class="col-checkbox">
                                <input type="checkbox" id="select-all-customers" onchange="window.Customers.toggleSelectAll(this.checked)">
                            </th>
                            <th class="col-name sortable" onclick="window.Customers.setSortConfig('name')">
                                Cliente ${getSortIcon('name')}
                            </th>
                            <th class="col-contact">Contacto</th>
                            <th class="col-location">Ubicación</th>
                            <th class="col-segment">Segmento</th>
                            <th class="col-purchases sortable" onclick="window.Customers.setSortConfig('purchaseCount')">
                                Compras ${getSortIcon('purchaseCount')}
                            </th>
                            <th class="col-value sortable" onclick="window.Customers.setSortConfig('totalSpent')">
                                Valor Total ${getSortIcon('totalSpent')}
                            </th>
                            <th class="col-avg sortable" onclick="window.Customers.setSortConfig('avgPurchase')">
                                Ticket Prom. ${getSortIcon('avgPurchase')}
                            </th>
                            <th class="col-last sortable" onclick="window.Customers.setSortConfig('lastPurchaseDays')">
                                Última Compra ${getSortIcon('lastPurchaseDays')}
                            </th>
                            <th class="col-score sortable" onclick="window.Customers.setSortConfig('customerScore')">
                                Score ${getSortIcon('customerScore')}
                            </th>
                            <th class="col-actions">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customers.map(c => this.renderCustomerRow(c)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="customers-table-footer">
                <span class="results-count">${customers.length} cliente${customers.length !== 1 ? 's' : ''} encontrado${customers.length !== 1 ? 's' : ''}</span>
            </div>
        `;
    },

    renderCustomerRow(customer) {
        const segmentClass = this.getSegmentClass(customer.autoSegment || customer.segment);
        const activityStatus = this.getActivityStatus(customer.lastPurchaseDays);
        const scoreColor = this.getScoreColor(customer.customerScore);
        
        return `
            <tr data-customer-id="${customer.id}" class="${this.selectedCustomers.has(customer.id) ? 'selected' : ''}">
                <td class="col-checkbox">
                    <input type="checkbox" ${this.selectedCustomers.has(customer.id) ? 'checked' : ''} 
                           onchange="window.Customers.toggleSelect('${customer.id}', this.checked)">
                </td>
                <td class="col-name">
                    <div class="customer-name-cell">
                        <div class="customer-avatar">${this.getInitials(customer.name, customer.lastname)}</div>
                        <div class="customer-name-info">
                            <span class="customer-fullname">${customer.name || 'Sin nombre'} ${customer.lastname || ''}</span>
                            ${customer.tags ? `<div class="customer-tags-mini">${customer.tags.split(',').slice(0, 2).map(t => `<span class="tag-mini">${t.trim()}</span>`).join('')}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td class="col-contact">
                    <div class="contact-info">
                        ${customer.email ? `<div class="contact-item"><i class="fas fa-envelope"></i> ${customer.email}</div>` : ''}
                        ${customer.phone ? `<div class="contact-item"><i class="fas fa-phone"></i> ${customer.phone}</div>` : ''}
                        ${!customer.email && !customer.phone ? '<span class="no-data">-</span>' : ''}
                    </div>
                </td>
                <td class="col-location">
                    ${customer.country ? `<span class="location-text">${customer.city ? customer.city + ', ' : ''}${customer.country}</span>` : '<span class="no-data">-</span>'}
                </td>
                <td class="col-segment">
                    <span class="segment-badge ${segmentClass}">${customer.autoSegment || customer.segment || 'Sin segmento'}</span>
                </td>
                <td class="col-purchases">
                    <span class="purchase-count">${customer.purchaseCount}</span>
                </td>
                <td class="col-value">
                    <span class="value-amount ${customer.totalSpent > 0 ? 'has-value' : ''}">${Utils.formatCurrency(customer.totalSpent)}</span>
                </td>
                <td class="col-avg">
                    <span class="avg-amount">${Utils.formatCurrency(customer.avgPurchase)}</span>
                </td>
                <td class="col-last">
                    <div class="last-purchase-cell ${activityStatus.class}">
                        ${customer.lastPurchaseDate 
                            ? `<span class="last-date">${Utils.formatDate(customer.lastPurchaseDate, 'DD/MM/YY')}</span>
                               <span class="days-ago">${customer.lastPurchaseDays}d</span>`
                            : '<span class="no-purchase">Nunca</span>'}
                    </div>
                </td>
                <td class="col-score">
                    <div class="score-cell">
                        <div class="score-bar">
                            <div class="score-fill" style="width: ${customer.customerScore}%; background: ${scoreColor}"></div>
                        </div>
                        <span class="score-value">${customer.customerScore}</span>
                    </div>
                </td>
                <td class="col-actions">
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="window.Customers.showCustomer360('${customer.id}')" title="Vista 360°">
                            <i class="fas fa-chart-line"></i>
                        </button>
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('customers.edit') ? `
                            <button class="btn-action btn-edit" onclick="window.Customers.editCustomer('${customer.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('customers.delete') ? `
                            <button class="btn-action btn-delete" onclick="window.Customers.confirmDelete('${customer.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    },

    displayCustomersCards(customers) {
        const container = document.getElementById('customers-list');
        if (!container) return;

        if (customers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No hay clientes</h3>
                    <p>Agrega tu primer cliente para comenzar</p>
                    <button class="btn-primary" onclick="window.Customers.showAddForm()">
                        <i class="fas fa-plus"></i> Agregar Cliente
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="customers-cards-grid">
                ${customers.map(c => this.renderCustomerCard(c)).join('')}
            </div>
            <div class="customers-table-footer">
                <span class="results-count">${customers.length} cliente${customers.length !== 1 ? 's' : ''} encontrado${customers.length !== 1 ? 's' : ''}</span>
            </div>
        `;
    },

    renderCustomerCard(customer) {
        const segmentClass = this.getSegmentClass(customer.autoSegment || customer.segment);
        const scoreColor = this.getScoreColor(customer.customerScore);
        
        return `
            <div class="customer-card" data-customer-id="${customer.id}">
                <div class="customer-card-header">
                    <div class="customer-avatar-lg">${this.getInitials(customer.name, customer.lastname)}</div>
                    <div class="customer-card-info">
                        <h4>${customer.name || 'Sin nombre'} ${customer.lastname || ''}</h4>
                        <span class="segment-badge ${segmentClass}">${customer.autoSegment || customer.segment || 'Sin segmento'}</span>
                    </div>
                    <div class="customer-score-badge" style="background: ${scoreColor}">
                        ${customer.customerScore}
                    </div>
                </div>
                <div class="customer-card-body">
                    <div class="customer-card-contact">
                        ${customer.email ? `<div><i class="fas fa-envelope"></i> ${customer.email}</div>` : ''}
                        ${customer.phone ? `<div><i class="fas fa-phone"></i> ${customer.phone}</div>` : ''}
                        ${customer.country ? `<div><i class="fas fa-map-marker-alt"></i> ${customer.city ? customer.city + ', ' : ''}${customer.country}</div>` : ''}
                    </div>
                    <div class="customer-card-stats">
                        <div class="stat-item">
                            <span class="stat-value">${customer.purchaseCount}</span>
                            <span class="stat-label">Compras</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${Utils.formatCurrency(customer.totalSpent)}</span>
                            <span class="stat-label">Total</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${customer.lastPurchaseDays !== null ? customer.lastPurchaseDays + 'd' : '-'}</span>
                            <span class="stat-label">Última</span>
                        </div>
                    </div>
                </div>
                <div class="customer-card-actions">
                    <button class="btn-secondary btn-sm" onclick="window.Customers.showCustomer360('${customer.id}')">
                        <i class="fas fa-chart-line"></i> 360°
                    </button>
                    ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('customers.edit') ? `
                        <button class="btn-secondary btn-sm" onclick="window.Customers.editCustomer('${customer.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Helpers
    getInitials(name, lastname) {
        const first = (name || '?')[0].toUpperCase();
        const last = (lastname || '')[0]?.toUpperCase() || '';
        return first + last;
    },

    getSegmentClass(segment) {
        const classes = {
            'VIP': 'segment-vip',
            'Premium': 'segment-premium',
            'Regular': 'segment-regular',
            'Nuevo': 'segment-new',
            'Ocasional': 'segment-new',
            'Inactivo': 'segment-inactive'
        };
        return classes[segment] || 'segment-default';
    },

    getActivityStatus(days) {
        if (days === null) return { class: 'status-never', text: 'Nunca' };
        if (days <= 30) return { class: 'status-active', text: 'Activo' };
        if (days <= 90) return { class: 'status-moderate', text: 'Moderado' };
        return { class: 'status-inactive', text: 'Inactivo' };
    },

    getScoreColor(score) {
        if (score >= 80) return '#1a1a1a';
        if (score >= 60) return '#3a3a3a';
        if (score >= 40) return '#6a6a6a';
        return '#9a9a9a';
    },

    // Selección masiva
    toggleSelect(customerId, selected) {
        if (selected) {
            this.selectedCustomers.add(customerId);
        } else {
            this.selectedCustomers.delete(customerId);
        }
        this.updateBulkActions();
    },

    toggleSelectAll(selected) {
        const rows = document.querySelectorAll('.customers-table tbody tr');
        rows.forEach(row => {
            const id = row.dataset.customerId;
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = selected;
                if (selected) {
                    this.selectedCustomers.add(id);
                    row.classList.add('selected');
                } else {
                    this.selectedCustomers.delete(id);
                    row.classList.remove('selected');
                }
            }
        });
        this.updateBulkActions();
    },

    updateBulkActions() {
        const bulkActions = document.getElementById('bulk-actions');
        const selectedCount = document.getElementById('selected-count');
        if (bulkActions && selectedCount) {
            selectedCount.textContent = this.selectedCustomers.size;
            bulkActions.style.display = this.selectedCustomers.size > 0 ? 'flex' : 'none';
        }
    },

    // Formularios y modales
    async showAddForm(customerId = null) {
        const customer = customerId ? await DB.get('customers', customerId) : null;

        const body = `
            <form id="customer-form" class="customer-form">
                <div class="form-section">
                    <div class="form-section-title"><i class="fas fa-user"></i> Información Personal</div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nombre *</label>
                            <input type="text" id="customer-name" class="form-input" value="${customer?.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Apellidos</label>
                            <input type="text" id="customer-lastname" class="form-input" value="${customer?.lastname || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="customer-email" class="form-input" value="${customer?.email || ''}">
                        </div>
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="text" id="customer-phone" class="form-input" value="${customer?.phone || ''}" placeholder="+52 123 456 7890">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Nacimiento</label>
                            <input type="date" id="customer-birthdate" class="form-input" value="${customer?.birthdate || ''}">
                        </div>
                        <div class="form-group">
                            <label>Segmento</label>
                            <select id="customer-segment" class="form-select">
                                <option value="">Automático</option>
                                <option value="VIP" ${customer?.segment === 'VIP' ? 'selected' : ''}>VIP</option>
                                <option value="Premium" ${customer?.segment === 'Premium' ? 'selected' : ''}>Premium</option>
                                <option value="Regular" ${customer?.segment === 'Regular' ? 'selected' : ''}>Regular</option>
                                <option value="Nuevo" ${customer?.segment === 'Nuevo' ? 'selected' : ''}>Nuevo</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div class="form-section-title"><i class="fas fa-map-marker-alt"></i> Ubicación</div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>País</label>
                            <select id="customer-country" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="México" ${customer?.country === 'México' ? 'selected' : ''}>México</option>
                                <option value="Estados Unidos" ${customer?.country === 'Estados Unidos' ? 'selected' : ''}>Estados Unidos</option>
                                <option value="Canadá" ${customer?.country === 'Canadá' ? 'selected' : ''}>Canadá</option>
                                <option value="Otro" ${customer?.country === 'Otro' ? 'selected' : ''}>Otro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Ciudad</label>
                            <input type="text" id="customer-city" class="form-input" value="${customer?.city || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Dirección</label>
                        <textarea id="customer-address" class="form-textarea" rows="2">${customer?.address || ''}</textarea>
                    </div>
                </div>

                <div class="form-section">
                    <div class="form-section-title"><i class="fas fa-cog"></i> Preferencias y Notas</div>
                    <div class="form-group">
                        <label>Preferencias de Comunicación</label>
                        <div class="preferences-grid">
                            <label class="checkbox-label">
                                <input type="checkbox" id="customer-pref-email" ${customer?.preferences?.email ? 'checked' : ''}>
                                <span><i class="fas fa-envelope"></i> Email</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="customer-pref-sms" ${customer?.preferences?.sms ? 'checked' : ''}>
                                <span><i class="fas fa-sms"></i> SMS</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="customer-pref-whatsapp" ${customer?.preferences?.whatsapp ? 'checked' : ''}>
                                <span><i class="fab fa-whatsapp"></i> WhatsApp</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="customer-pref-newsletter" ${customer?.preferences?.newsletter ? 'checked' : ''}>
                                <span><i class="fas fa-newspaper"></i> Newsletter</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Etiquetas</label>
                        <input type="text" id="customer-tags" class="form-input" value="${customer?.tags || ''}" placeholder="Ej: joyería fina, anillos, exclusivo (separadas por comas)">
                        <small>Separa las etiquetas con comas</small>
                    </div>
                    <div class="form-group">
                        <label>Notas</label>
                        <textarea id="customer-notes" class="form-textarea" rows="3" placeholder="Notas adicionales sobre el cliente...">${customer?.notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Customers.saveCustomer('${customerId || ''}')">
                <i class="fas fa-save"></i> Guardar
            </button>
        `;

        UI.showModal(customerId ? 'Editar Cliente' : 'Nuevo Cliente', body, footer);
    },

    async saveCustomer(customerId) {
        const form = document.getElementById('customer-form');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const customer = {
            id: customerId || Utils.generateId(),
            name: document.getElementById('customer-name').value,
            lastname: document.getElementById('customer-lastname')?.value || '',
            email: document.getElementById('customer-email').value,
            phone: document.getElementById('customer-phone').value,
            birthdate: document.getElementById('customer-birthdate')?.value || null,
            segment: document.getElementById('customer-segment')?.value || '',
            country: document.getElementById('customer-country')?.value || '',
            city: document.getElementById('customer-city')?.value || '',
            address: document.getElementById('customer-address')?.value || '',
            preferences: {
                email: document.getElementById('customer-pref-email')?.checked || false,
                sms: document.getElementById('customer-pref-sms')?.checked || false,
                whatsapp: document.getElementById('customer-pref-whatsapp')?.checked || false,
                newsletter: document.getElementById('customer-pref-newsletter')?.checked || false
            },
            tags: document.getElementById('customer-tags')?.value || '',
            notes: document.getElementById('customer-notes').value,
            created_at: customerId ? (await DB.get('customers', customerId))?.created_at : new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await DB.put('customers', customer);
        await SyncManager.addToQueue('customer', customer.id);

        Utils.showNotification(customerId ? 'Cliente actualizado' : 'Cliente agregado', 'success');
        UI.closeModal();
        this.loadCustomers();
    },

    async editCustomer(customerId) {
        UI.closeModal();
        await this.showAddForm(customerId);
    },

    async confirmDelete(customerId) {
        const customer = await DB.get('customers', customerId);
        if (!customer) return;

        const body = `
            <div class="confirm-delete-content">
                <i class="fas fa-exclamation-triangle"></i>
                <p>¿Estás seguro de eliminar a <strong>${customer.name} ${customer.lastname || ''}</strong>?</p>
                <p class="warning-text">Esta acción no se puede deshacer.</p>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-danger" onclick="window.Customers.deleteCustomer('${customerId}')">
                <i class="fas fa-trash"></i> Eliminar
            </button>
        `;

        UI.showModal('Confirmar Eliminación', body, footer);
    },

    async deleteCustomer(customerId) {
        try {
            const customer = await DB.get('customers', customerId);
            if (!customer) {
                Utils.showNotification('Cliente no encontrado', 'error');
                return;
            }
            
            // Guardar metadata del cliente antes de eliminarlo para sincronización
            const customerMetadata = {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                deleted_at: new Date().toISOString()
            };
            
            // Agregar a cola de sincronización ANTES de eliminar
            if (typeof SyncManager !== 'undefined') {
                try {
                    await DB.add('sync_deleted_items', {
                        id: customerId,
                        entity_type: 'customer',
                        metadata: customerMetadata,
                        deleted_at: new Date().toISOString()
                    });
                    await SyncManager.addToQueue('customer', customerId, 'delete');
                } catch (syncError) {
                    console.error('Error guardando metadata para sincronización:', syncError);
                }
            }
            
            // Eliminar el cliente de la base de datos
            try {
        await DB.delete('customers', customerId);
                
                // Verificar que realmente se eliminó
                let verifyDeleted = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
                    verifyDeleted = await DB.get('customers', customerId);
                    if (!verifyDeleted) break;
                }
                
                if (verifyDeleted) {
                    console.error('⚠️ ERROR: El cliente aún existe después de eliminarlo. ID:', customerId);
                    Utils.showNotification('Advertencia: La eliminación puede no haberse completado. Recarga la página si el cliente sigue apareciendo.', 'warning');
                }
            } catch (deleteError) {
                console.error('Error eliminando cliente de la BD:', deleteError);
                Utils.showNotification('Error al eliminar el cliente de la base de datos: ' + deleteError.message, 'error');
                return;
            }
            
        Utils.showNotification('Cliente eliminado', 'success');
        UI.closeModal();
        this.selectedCustomers.delete(customerId);
            await this.loadCustomers();
        } catch (e) {
            console.error('Error eliminando cliente:', e);
            Utils.showNotification('Error al eliminar cliente: ' + e.message, 'error');
        }
    },

    // Vista 360
    async showCustomer360(customerId) {
        const customer = await DB.get('customers', customerId);
        if (!customer) {
            Utils.showNotification('Cliente no encontrado', 'error');
            return;
        }

        const sales = await DB.query('sales', 'customer_id', customerId);
        const completedSales = sales.filter(s => s.status === 'completada');
        const repairs = await DB.query('repairs', 'customer_id', customerId);
        
        const totalSpent = completedSales.reduce((sum, s) => sum + (s.total || 0), 0);
        const avgPurchase = completedSales.length > 0 ? totalSpent / completedSales.length : 0;
        const lastPurchaseDays = customer.lastPurchaseDate ? this.daysSinceLastPurchase(customer.lastPurchaseDate) : null;
        const customerSegment = this.calculateCustomerSegment(totalSpent, completedSales.length, lastPurchaseDays);
        
        const saleItems = await DB.getAll('sale_items');
        const items = await DB.getAll('inventory_items');
        const preferredProducts = this.analyzePreferredProducts(completedSales, saleItems, items);
        
        const customerScore = this.calculateCustomerScore(totalSpent, completedSales.length, lastPurchaseDays, avgPurchase);
        const purchaseFrequency = this.calculatePurchaseFrequency(completedSales);
        const scoreColor = this.getScoreColor(customerScore);

        const body = `
            <div class="customer-360-view">
                <!-- Header con info principal -->
                <div class="c360-header">
                    <div class="c360-avatar">${this.getInitials(customer.name, customer.lastname)}</div>
                    <div class="c360-info">
                        <h3>${customer.name} ${customer.lastname || ''}</h3>
                        <div class="c360-badges">
                            <span class="segment-badge ${this.getSegmentClass(customerSegment)}">${customerSegment}</span>
                            <span class="c360-score" style="background: ${scoreColor}">${customerScore}/100</span>
                        </div>
                    </div>
                </div>

                <!-- KPIs principales -->
                <div class="c360-kpis">
                    <div class="c360-kpi">
                        <div class="c360-kpi-value">${Utils.formatCurrency(totalSpent)}</div>
                        <div class="c360-kpi-label">Valor de Vida</div>
                    </div>
                    <div class="c360-kpi">
                        <div class="c360-kpi-value">${completedSales.length}</div>
                        <div class="c360-kpi-label">Total Compras</div>
                    </div>
                    <div class="c360-kpi">
                        <div class="c360-kpi-value">${Utils.formatCurrency(avgPurchase)}</div>
                        <div class="c360-kpi-label">Ticket Promedio</div>
                    </div>
                    <div class="c360-kpi">
                        <div class="c360-kpi-value">${purchaseFrequency}</div>
                        <div class="c360-kpi-label">Frecuencia</div>
                    </div>
                </div>

                <!-- Información de contacto -->
                <div class="c360-section">
                    <h4><i class="fas fa-address-card"></i> Información de Contacto</h4>
                    <div class="c360-contact-grid">
                        <div class="c360-contact-item">
                            <i class="fas fa-envelope"></i>
                            <span>${customer.email || 'No registrado'}</span>
                        </div>
                        <div class="c360-contact-item">
                            <i class="fas fa-phone"></i>
                            <span>${customer.phone || 'No registrado'}</span>
                        </div>
                        <div class="c360-contact-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${customer.city ? customer.city + ', ' : ''}${customer.country || 'No registrado'}</span>
                        </div>
                        <div class="c360-contact-item">
                            <i class="fas fa-calendar-alt"></i>
                            <span>Cliente desde ${Utils.formatDate(customer.created_at, 'DD/MM/YYYY')}</span>
                        </div>
                    </div>
                </div>

                <!-- Productos preferidos -->
                ${preferredProducts.length > 0 ? `
                <div class="c360-section">
                    <h4><i class="fas fa-heart"></i> Productos Preferidos</h4>
                    <div class="c360-products-list">
                        ${preferredProducts.slice(0, 5).map((p, idx) => `
                            <div class="c360-product-item">
                                <span class="product-rank">#${idx + 1}</span>
                                <span class="product-name">${p.name}</span>
                                <span class="product-stats">${p.count}x • ${Utils.formatCurrency(p.revenue)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Historial de compras -->
                <div class="c360-section">
                    <h4><i class="fas fa-history"></i> Últimas Compras</h4>
                    <div class="c360-sales-list">
                        ${completedSales.length === 0 
                            ? '<p class="no-data-text">Sin compras registradas</p>'
                            : completedSales.slice(0, 5).map(sale => `
                                <div class="c360-sale-item">
                                    <div class="sale-info">
                                        <span class="sale-folio">${sale.folio}</span>
                                        <span class="sale-date">${Utils.formatDate(sale.created_at, 'DD/MM/YY HH:mm')}</span>
                                    </div>
                                    <span class="sale-total">${Utils.formatCurrency(sale.total)}</span>
                                </div>
                            `).join('')}
                    </div>
                </div>

                <!-- Notas -->
                ${customer.notes ? `
                <div class="c360-section">
                    <h4><i class="fas fa-sticky-note"></i> Notas</h4>
                    <p class="c360-notes">${customer.notes}</p>
                </div>
                ` : ''}
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="window.Customers.editCustomer('${customer.id}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Vista 360° - ${customer.name}`, body, footer);
    },

    // Exportación
    async exportCustomers() {
        try {
            const customers = await DB.getAll('customers');
            const sales = await DB.getAll('sales') || [];
            
            const exportData = customers.map(c => {
                const customerSales = sales.filter(s => s.customer_id === c.id && s.status === 'completada');
                const totalSpent = customerSales.reduce((sum, s) => sum + (s.total || 0), 0);
                
                return {
                    Nombre: c.name || '',
                    Apellidos: c.lastname || '',
                    Email: c.email || '',
                    Teléfono: c.phone || '',
                    País: c.country || '',
                    Ciudad: c.city || '',
                    Segmento: c.segment || '',
                    Etiquetas: c.tags || '',
                    'Total Compras': customerSales.length,
                    'Valor Total': totalSpent,
                    'Fecha Registro': Utils.formatDate(c.created_at, 'DD/MM/YYYY'),
                    Notas: c.notes || ''
                };
            });

            const body = `
                <div class="export-options">
                    <p>Selecciona el formato de exportación:</p>
                    <div class="export-buttons">
                        <button class="btn-export" onclick="window.Customers.doExport('csv')">
                            <i class="fas fa-file-csv"></i>
                            <span>CSV</span>
                        </button>
                        <button class="btn-export" onclick="window.Customers.doExport('excel')">
                            <i class="fas fa-file-excel"></i>
                            <span>Excel</span>
                        </button>
                        <button class="btn-export" onclick="window.Customers.doExport('pdf')">
                            <i class="fas fa-file-pdf"></i>
                            <span>PDF</span>
                        </button>
                    </div>
                </div>
            `;

            UI.showModal('Exportar Clientes', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>');
            
            window._exportData = exportData;
        } catch (e) {
            console.error('Error preparing export:', e);
            Utils.showNotification('Error al preparar exportación', 'error');
        }
    },

    async doExport(format) {
        const exportData = window._exportData;
        if (!exportData) return;
        
        const date = Utils.formatDate(new Date(), 'YYYYMMDD');
        
        try {
            if (format === 'csv') {
                Utils.exportToCSV(exportData, `clientes_${date}.csv`);
            } else if (format === 'excel') {
                Utils.exportToExcel(exportData, `clientes_${date}.xlsx`, 'Clientes');
            } else if (format === 'pdf') {
                Utils.exportToPDF(exportData, `clientes_${date}.pdf`, 'Clientes');
            }
            UI.closeModal();
            Utils.showNotification('Exportación completada', 'success');
        } catch (e) {
            console.error('Export error:', e);
            Utils.showNotification('Error en la exportación', 'error');
        }
    },

    showImportDialog() {
        const body = `
            <div class="import-dialog">
                <p>Importa clientes desde un archivo CSV o Excel.</p>
                <div class="import-dropzone" id="import-dropzone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Arrastra un archivo aquí o haz clic para seleccionar</p>
                    <input type="file" id="import-file" accept=".csv,.xlsx,.xls" style="display: none;">
                </div>
                <div class="import-template">
                    <p>¿Necesitas una plantilla?</p>
                    <button class="btn-link" onclick="window.Customers.downloadTemplate()">
                        <i class="fas fa-download"></i> Descargar plantilla CSV
                    </button>
                </div>
            </div>
        `;

        UI.showModal('Importar Clientes', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>');

        setTimeout(() => {
            const dropzone = document.getElementById('import-dropzone');
            const fileInput = document.getElementById('import-file');
            
            dropzone?.addEventListener('click', () => fileInput?.click());
            fileInput?.addEventListener('change', (e) => this.handleImportFile(e.target.files[0]));
        }, 100);
    },

    downloadTemplate() {
        const template = [
            { Nombre: 'Juan', Apellidos: 'Pérez', Email: 'juan@email.com', Teléfono: '+52 123 456 7890', País: 'México', Ciudad: 'CDMX', Segmento: 'Regular', Etiquetas: 'nuevo,interesado', Notas: 'Cliente potencial' }
        ];
        Utils.exportToCSV(template, 'plantilla_clientes.csv');
    },

    async handleImportFile(file) {
        // Implementación básica de importación
        Utils.showNotification('Función de importación en desarrollo', 'info');
        UI.closeModal();
    },

    // Acciones masivas
    async bulkEmail() {
        Utils.showNotification(`Enviar email a ${this.selectedCustomers.size} clientes`, 'info');
    },

    async bulkSegment() {
        const body = `
            <div class="bulk-segment-dialog">
                <p>Asignar segmento a ${this.selectedCustomers.size} clientes:</p>
                <select id="bulk-segment-select" class="form-select">
                    <option value="VIP">VIP</option>
                    <option value="Premium">Premium</option>
                    <option value="Regular">Regular</option>
                    <option value="Nuevo">Nuevo</option>
                </select>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Customers.applyBulkSegment()">Aplicar</button>
        `;

        UI.showModal('Asignar Segmento', body, footer);
    },

    async applyBulkSegment() {
        const segment = document.getElementById('bulk-segment-select')?.value;
        if (!segment) return;

        for (const id of this.selectedCustomers) {
            const customer = await DB.get('customers', id);
            if (customer) {
                customer.segment = segment;
                customer.updated_at = new Date().toISOString();
                await DB.put('customers', customer);
            }
        }

        UI.closeModal();
        this.selectedCustomers.clear();
        this.updateBulkActions();
        this.loadCustomers();
        Utils.showNotification('Segmento actualizado', 'success');
    },

    async bulkDelete() {
        const count = this.selectedCustomers.size;
        const body = `
            <div class="confirm-delete-content">
                <i class="fas fa-exclamation-triangle"></i>
                <p>¿Eliminar <strong>${count} cliente${count !== 1 ? 's' : ''}</strong>?</p>
                <p class="warning-text">Esta acción no se puede deshacer.</p>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-danger" onclick="window.Customers.confirmBulkDelete()">Eliminar</button>
        `;

        UI.showModal('Confirmar Eliminación', body, footer);
    },

    async confirmBulkDelete() {
        for (const id of this.selectedCustomers) {
            await DB.delete('customers', id);
        }
        
        UI.closeModal();
        this.selectedCustomers.clear();
        this.updateBulkActions();
        this.loadCustomers();
        Utils.showNotification('Clientes eliminados', 'success');
    },

    // Cálculos de CRM
    daysSinceLastPurchase(lastPurchaseDate) {
        const lastPurchase = new Date(lastPurchaseDate);
        const today = new Date();
        const diffTime = Math.abs(today - lastPurchase);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    calculatePurchaseFrequency(sales) {
        if (sales.length < 2) return 'Nueva';
        const sortedSales = sales.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const daysBetween = [];
        for (let i = 1; i < sortedSales.length; i++) {
            const days = this.daysSinceLastPurchase(sortedSales[i-1].created_at);
            daysBetween.push(days);
        }
        const avgDays = daysBetween.reduce((sum, d) => sum + d, 0) / daysBetween.length;
        if (avgDays <= 30) return 'Alta';
        if (avgDays <= 90) return 'Media';
        return 'Baja';
    },

    calculateCustomerSegment(totalSpent, purchaseCount, lastPurchaseDays) {
        if (purchaseCount === 0) return 'Nuevo';
        if (lastPurchaseDays !== null && lastPurchaseDays > 180) return 'Inactivo';
        if (totalSpent >= 50000 && purchaseCount >= 5 && (!lastPurchaseDays || lastPurchaseDays <= 90)) return 'VIP';
        if (totalSpent >= 20000 && purchaseCount >= 3) return 'Premium';
        if (totalSpent >= 5000) return 'Regular';
        return 'Ocasional';
    },

    analyzePreferredProducts(sales, saleItems, items) {
        const productStats = {};
        sales.forEach(sale => {
            const itemsForSale = saleItems.filter(si => si.sale_id === sale.id);
            itemsForSale.forEach(si => {
                const item = items.find(i => i.id === si.item_id);
                if (item) {
                    if (!productStats[item.id]) {
                        productStats[item.id] = { name: item.name, count: 0, revenue: 0 };
                    }
                    productStats[item.id].count += si.quantity || 1;
                    productStats[item.id].revenue += (si.price || 0) * (si.quantity || 1);
                }
            });
        });
        return Object.values(productStats).sort((a, b) => b.count - a.count);
    },

    calculateCustomerScore(totalSpent, purchaseCount, lastPurchaseDays, avgPurchase) {
        let score = 0;
        
        // Valor monetario (40 puntos max)
        if (totalSpent >= 50000) score += 40;
        else if (totalSpent >= 20000) score += 30;
        else if (totalSpent >= 5000) score += 20;
        else if (totalSpent >= 1000) score += 10;
        
        // Frecuencia (30 puntos max)
        if (purchaseCount >= 10) score += 30;
        else if (purchaseCount >= 5) score += 20;
        else if (purchaseCount >= 2) score += 10;
        
        // Recencia (20 puntos max)
        if (lastPurchaseDays === null) score += 0;
        else if (lastPurchaseDays <= 30) score += 20;
        else if (lastPurchaseDays <= 90) score += 10;
        else if (lastPurchaseDays <= 180) score += 5;
        
        // Ticket promedio (10 puntos max)
        if (avgPurchase >= 5000) score += 10;
        else if (avgPurchase >= 2000) score += 7;
        else if (avgPurchase >= 1000) score += 5;
        
        return Math.min(100, score);
    },

    // Legacy methods para compatibilidad
    async showDetails(customerId) {
        await this.showCustomer360(customerId);
    }
};

window.Customers = Customers;
