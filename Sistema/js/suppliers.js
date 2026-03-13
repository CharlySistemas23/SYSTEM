// Suppliers Module - Gestión Completa de Proveedores
// Sistema de gestión de proveedores con sincronización bidireccional

const Suppliers = {
    initialized: false,
    currentView: 'table', // 'table' o 'cards'
    selectedSuppliers: new Set(),
    sortConfig: { field: 'name', direction: 'asc' },
    
    async init() {
        try {
            // Verificar permiso
            if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('suppliers.view')) {
                const content = document.getElementById('module-content');
                if (content) {
                    content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver proveedores</div>';
                }
                return;
            }

            if (this.initialized) {
                await this.loadSuppliers();
                return;
            }
            
            this.setupEventListeners();
            await this.loadSuppliers();
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error inicializando módulo Suppliers:', error);
            this.initialized = true;
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Suppliers</h3>
                        <p style="color: var(--color-text-secondary); margin-top: var(--spacing-md);">
                            ${error.message || 'Error desconocido'}
                        </p>
                        <button class="btn-primary" onclick="location.reload()" style="margin-top: var(--spacing-md);">
                            Recargar página
                        </button>
                    </div>
                `;
            }
        }
    },

    setupEventListeners() {
        const content = document.getElementById('module-content');
        if (!content) {
            console.error('❌ module-content no encontrado');
            return;
        }

        content.style.display = 'block';
        content.style.visibility = 'visible';

        content.innerHTML = `
            <div class="suppliers-module dashboard-card-prodex module-section" style="padding: var(--spacing-lg);">
                <!-- Barra de herramientas -->
                <div class="suppliers-toolbar">
                    <div class="suppliers-toolbar-left">
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('suppliers.add') ? `
                            <button class="btn-primary" id="supplier-add-btn">
                                <i class="fas fa-plus"></i> Nuevo Proveedor
                            </button>
                        ` : ''}
                        <button class="btn-secondary" id="supplier-export-btn">
                            <i class="fas fa-file-export"></i> Exportar
                        </button>
                    </div>
                    <div class="suppliers-toolbar-right">
                        <div class="view-toggle">
                            <button class="view-btn active" data-view="table" onclick="window.Suppliers.setView('table')" title="Vista Tabla">
                                <i class="fas fa-table"></i>
                            </button>
                            <button class="view-btn" data-view="cards" onclick="window.Suppliers.setView('cards')" title="Vista Tarjetas">
                                <i class="fas fa-th-large"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Filtros -->
                <div class="suppliers-filters">
                    <div class="filters-row">
                        <div class="filter-group filter-search">
                            <label><i class="fas fa-search"></i> Búsqueda</label>
                            <input type="text" id="supplier-search" class="form-input" placeholder="Nombre, código, categoría...">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-filter"></i> Estado</label>
                            <select id="supplier-status-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="active">Activos</option>
                                <option value="inactive">Inactivos</option>
                                <option value="suspended">Suspendidos</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-tag"></i> Tipo</label>
                            <select id="supplier-type-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="mayoreo">Mayoreo</option>
                                <option value="menudeo">Menudeo</option>
                                <option value="especializado">Especializado</option>
                                <option value="internacional">Internacional</option>
                            </select>
                        </div>
                        <div class="filter-group" id="supplier-branch-filter-container" style="display: none;">
                            <label><i class="fas fa-store"></i> Sucursal</label>
                            <select id="supplier-branch-filter" class="form-select">
                                <option value="all">Todas</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Lista de proveedores -->
                <div id="suppliers-list" class="suppliers-list"></div>
            </div>
        `;

        // Event listeners
        document.getElementById('supplier-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('supplier-export-btn')?.addEventListener('click', () => this.exportSuppliers());
        document.getElementById('supplier-search')?.addEventListener('input', () => this.loadSuppliers());
        document.getElementById('supplier-status-filter')?.addEventListener('change', () => this.loadSuppliers());
        document.getElementById('supplier-type-filter')?.addEventListener('change', () => this.loadSuppliers());
        document.getElementById('supplier-branch-filter')?.addEventListener('change', () => this.loadSuppliers());

        // Socket.IO listeners
        this.setupSocketListeners();
    },

    setView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.loadSuppliers();
    },

    async loadSuppliers() {
        try {
            // Configurar dropdown de sucursal
            await this.setupBranchFilter();
            
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            const branchFilterEl = document.getElementById('supplier-branch-filter');
            const branchFilterValue = branchFilterEl?.value;
            
            let filterBranchId = null;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                filterBranchId = branchFilterValue;
            } else if (isMasterAdmin && (!branchFilterValue || branchFilterValue === 'all')) {
                filterBranchId = null;
            } else {
                filterBranchId = currentBranchId;
            }
            
            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir proveedores locales que NO están en el servidor
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.createSupplier && API.updateSupplier) {
                    console.log('📤 [Paso 1 Suppliers] Buscando proveedores locales que no están en el servidor...');
                    
                    const allLocalSuppliers = await DB.getAll('suppliers') || [];
                    const unsyncedSuppliers = allLocalSuppliers.filter(s => {
                        if (!s || !s.id) return false;
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s.id));
                        return !isUUID || !s.server_id;
                    });
                    
                    const suppliersToSync = unsyncedSuppliers.filter(s => {
                        if (!filterBranchId) return true;
                        return s.branch_id === filterBranchId;
                    });
                    
                    console.log(`📊 [Paso 1 Suppliers] Encontrados ${suppliersToSync.length} proveedores locales sin sincronizar`);
                    
                    if (suppliersToSync.length > 0) {
                        const suppliersByCode = new Map();
                        for (const localSupplier of suppliersToSync) {
                            const key = `${localSupplier.code}_${localSupplier.branch_id || 'no-branch'}`;
                            if (!suppliersByCode.has(key)) {
                                suppliersByCode.set(key, localSupplier);
                            } else {
                                const existing = suppliersByCode.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localSupplier.updated_at ? new Date(localSupplier.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    suppliersByCode.set(key, localSupplier);
                                }
                            }
                        }
                        
                        let uploadedCount = 0;
                        for (const [key, localSupplier] of suppliersByCode) {
                            try {
                                console.log(`📤 [Paso 1 Suppliers] Subiendo proveedor local al servidor: ${localSupplier.id}`);
                                
                                let serverSupplier = null;
                                if (localSupplier.code) {
                                    try {
                                        const serverSuppliers = await API.getSuppliers({ 
                                            branch_id: filterBranchId,
                                            code: localSupplier.code
                                        });
                                        if (serverSuppliers && serverSuppliers.length > 0) {
                                            serverSupplier = serverSuppliers[0];
                                        }
                                    } catch (e) {
                                        console.warn('⚠️ Error buscando proveedor en servidor:', e);
                                    }
                                }
                                
                                if (serverSupplier) {
                                    // Actualizar local con datos del servidor
                                    const mergedSupplier = { ...localSupplier, ...serverSupplier, server_id: serverSupplier.id };
                                    await DB.put('suppliers', mergedSupplier);
                                    console.log(`✅ [Paso 1 Suppliers] Proveedor actualizado desde servidor: ${serverSupplier.id}`);
                                } else {
                                    // Crear nuevo en servidor
                                    const createdSupplier = await API.createSupplier(localSupplier);
                                    if (createdSupplier && createdSupplier.id) {
                                        const mergedSupplier = { ...localSupplier, ...createdSupplier, server_id: createdSupplier.id };
                                        await DB.put('suppliers', mergedSupplier);
                                        uploadedCount++;
                                        console.log(`✅ [Paso 1 Suppliers] Proveedor subido al servidor: ${createdSupplier.id}`);
                                    }
                                }
                            } catch (e) {
                                console.error(`❌ [Paso 1 Suppliers] Error subiendo proveedor ${localSupplier.id}:`, e);
                            }
                        }
                        
                        if (uploadedCount > 0) {
                            console.log(`✅ [Paso 1 Suppliers] ${uploadedCount} proveedores subidos al servidor`);
                        }
                    }
                }
            } catch (e) {
                console.error('❌ [Paso 1 Suppliers] Error en sincronización:', e);
            }
            
            // CACHE-FIRST: Cargar desde IndexedDB primero
            let allSuppliers = await DB.getAll('suppliers') || [];
            const hasCache = allSuppliers.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getSuppliers;

            if (!hasCache && hasApi) {
                const container = document.getElementById('suppliers-list');
                if (container) container.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center;"><i class="fas fa-spinner fa-spin"></i> Cargando proveedores...</div>';
                try {
                    const filters = {};
                    if (filterBranchId) filters.branch_id = filterBranchId;
                    const sf = document.getElementById('supplier-status-filter')?.value;
                    if (sf) filters.status = sf;
                    const tf = document.getElementById('supplier-type-filter')?.value;
                    if (tf) filters.supplier_type = tf;
                    const search = document.getElementById('supplier-search')?.value;
                    if (search) filters.search = search;
                    const fresh = await API.getSuppliers(filters) || [];
                    for (const s of fresh) {
                        try {
                            const existing = await DB.get('suppliers', s.id);
                            await DB.put('suppliers', existing ? { ...existing, ...s, server_id: s.id } : { ...s, server_id: s.id });
                        } catch (e) {}
                    }
                    allSuppliers = await DB.getAll('suppliers') || [];
                } catch (e) {
                    console.warn('Error cargando proveedores desde API:', e);
                }
            } else if (hasCache && hasApi) {
                Promise.resolve().then(async () => {
                    try {
                        const filters = {};
                        if (filterBranchId) filters.branch_id = filterBranchId;
                        const fresh = await API.getSuppliers(filters) || [];
                        for (const s of fresh) {
                            try {
                                const existing = await DB.get('suppliers', s.id);
                                await DB.put('suppliers', existing ? { ...existing, ...s, server_id: s.id } : { ...s, server_id: s.id });
                            } catch (e) {}
                        }
                        const beforeIds = new Set(allSuppliers.map(s => s.id));
                        const afterIds = new Set(fresh.map(s => s.id));
                        if (beforeIds.size !== afterIds.size || [...beforeIds].some(id => !afterIds.has(id))) {
                            this.loadSuppliers();
                        }
                    } catch (e) { console.warn('Sync suppliers background:', e); }
                }).catch(e => console.warn('Sync suppliers background:', e));
            }
            
            // Filtrar por sucursal
            let filteredSuppliers = allSuppliers.filter(s => {
                if (!filterBranchId) return true;
                return s.branch_id === filterBranchId || s.is_shared;
            });
            
            // Aplicar filtros adicionales
            const statusFilter = document.getElementById('supplier-status-filter')?.value;
            if (statusFilter) {
                filteredSuppliers = filteredSuppliers.filter(s => s.status === statusFilter);
            }
            
            const typeFilter = document.getElementById('supplier-type-filter')?.value;
            if (typeFilter) {
                filteredSuppliers = filteredSuppliers.filter(s => s.supplier_type === typeFilter);
            }
            
            const search = document.getElementById('supplier-search')?.value?.toLowerCase();
            if (search) {
                filteredSuppliers = filteredSuppliers.filter(s => 
                    s.name?.toLowerCase().includes(search) ||
                    s.code?.toLowerCase().includes(search) ||
                    s.legal_name?.toLowerCase().includes(search) ||
                    s.category?.toLowerCase().includes(search)
                );
            }
            
            // Ordenar
            filteredSuppliers = this.sortSuppliers(filteredSuppliers);
            
            // Mostrar
            this.displaySuppliers(filteredSuppliers);
            
        } catch (error) {
            console.error('Error loading suppliers:', error);
            Utils.showNotification(`Error al cargar proveedores: ${error.message}`, 'error');
            const suppliersList = document.getElementById('suppliers-list');
            if (suppliersList) {
                suppliersList.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center; color: var(--color-danger);">
                        <h3>Error al cargar proveedores</h3>
                        <p>${error.message}</p>
                        <button class="btn-primary" onclick="window.Suppliers.loadSuppliers()" style="margin-top: var(--spacing-md);">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            }
        }
    },

    sortSuppliers(suppliers) {
        const { field, direction } = this.sortConfig;
        return [...suppliers].sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (direction === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
    },

    displaySuppliers(suppliers) {
        const container = document.getElementById('suppliers-list');
        if (!container) return;
        
        if (suppliers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck"></i>
                    <h3>No hay proveedores</h3>
                    <p>Agrega tu primer proveedor para comenzar</p>
                    <button class="btn-primary" onclick="window.Suppliers.showAddForm()">
                        <i class="fas fa-plus"></i> Agregar Proveedor
                    </button>
                </div>
            `;
            return;
        }
        
        if (this.currentView === 'table') {
            this.displaySuppliersTable(suppliers);
        } else {
            this.displaySuppliersCards(suppliers);
        }
    },

    displaySuppliersTable(suppliers) {
        const container = document.getElementById('suppliers-list');
        if (!container) return;
        
        const getSortIcon = (field) => {
            if (this.sortConfig.field !== field) return '<i class="fas fa-sort"></i>';
            return this.sortConfig.direction === 'asc' 
                ? '<i class="fas fa-sort-up"></i>' 
                : '<i class="fas fa-sort-down"></i>';
        };
        
        container.innerHTML = `
            <div class="suppliers-table-wrapper">
                <table class="suppliers-table">
                    <thead>
                        <tr>
                            <th class="col-code sortable" onclick="window.Suppliers.setSortConfig('code')">
                                Código ${getSortIcon('code')}
                            </th>
                            <th class="col-name sortable" onclick="window.Suppliers.setSortConfig('name')">
                                Nombre ${getSortIcon('name')}
                            </th>
                            <th class="col-type">Tipo</th>
                            <th class="col-category">Categoría</th>
                            <th class="col-contact">Contacto</th>
                            <th class="col-rating">Calificación</th>
                            <th class="col-status">Estado</th>
                            <th class="col-actions">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${suppliers.map(s => this.renderSupplierRow(s)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="suppliers-table-footer">
                <span class="results-count">${suppliers.length} proveedor${suppliers.length !== 1 ? 'es' : ''} encontrado${suppliers.length !== 1 ? 's' : ''}</span>
            </div>
        `;
    },

    displaySuppliersCards(suppliers) {
        const container = document.getElementById('suppliers-list');
        if (!container) return;
        
        container.innerHTML = `
            <div class="suppliers-cards-grid">
                ${suppliers.map(s => this.renderSupplierCard(s)).join('')}
            </div>
            <div class="suppliers-table-footer">
                <span class="results-count">${suppliers.length} proveedor${suppliers.length !== 1 ? 'es' : ''} encontrado${suppliers.length !== 1 ? 's' : ''}</span>
            </div>
        `;
    },

    renderSupplierRow(supplier) {
        const statusClass = supplier.status === 'active' ? 'status-active' : supplier.status === 'inactive' ? 'status-inactive' : 'status-suspended';
        // Asegurar que rating sea un número válido
        const ratingValue = supplier.rating != null ? parseFloat(supplier.rating) : 0;
        const ratingStars = this.renderRating(isNaN(ratingValue) ? 0 : ratingValue);
        
        return `
            <tr data-supplier-id="${supplier.id}">
                <td class="col-code">${supplier.code || '-'}</td>
                <td class="col-name">
                    <div class="supplier-name-cell">
                        <strong>${supplier.name || 'Sin nombre'}</strong>
                        ${supplier.legal_name ? `<div class="supplier-legal-name">${supplier.legal_name}</div>` : ''}
                    </div>
                </td>
                <td class="col-type">${supplier.supplier_type || '-'}</td>
                <td class="col-category">${supplier.category || '-'}</td>
                <td class="col-contact">
                    ${supplier.contact_person ? `<div>${supplier.contact_person}</div>` : ''}
                    ${supplier.email ? `<div class="text-muted"><i class="fas fa-envelope"></i> ${supplier.email}</div>` : ''}
                    ${supplier.phone ? `<div class="text-muted"><i class="fas fa-phone"></i> ${supplier.phone}</div>` : ''}
                </td>
                <td class="col-rating">${ratingStars}</td>
                <td class="col-status">
                    <span class="status-badge ${statusClass}">${this.getStatusLabel(supplier.status)}</span>
                </td>
                <td class="col-actions">
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="window.Suppliers.showDetails('${supplier.id}')" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon" onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'overview')" title="Vista Avanzada">
                            <i class="fas fa-chart-line"></i>
                        </button>
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('suppliers.edit') ? `
                            <button class="btn-icon" onclick="window.Suppliers.showEditForm('${supplier.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('suppliers.delete') ? `
                            <button class="btn-icon btn-danger" onclick="window.Suppliers.deleteSupplier('${supplier.id}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    },

    renderSupplierCard(supplier) {
        const statusClass = supplier.status === 'active' ? 'status-active' : supplier.status === 'inactive' ? 'status-inactive' : 'status-suspended';
        const ratingStars = this.renderRating(supplier.rating || 0);
        
        return `
            <div class="supplier-card" data-supplier-id="${supplier.id}">
                <div class="supplier-card-header">
                    <div class="supplier-card-title">
                        <h3>${supplier.name || 'Sin nombre'}</h3>
                        <span class="supplier-code">${supplier.code || '-'}</span>
                    </div>
                    <span class="status-badge ${statusClass}">${this.getStatusLabel(supplier.status)}</span>
                </div>
                <div class="supplier-card-body">
                    ${supplier.legal_name ? `<div class="supplier-info"><strong>Razón Social:</strong> ${supplier.legal_name}</div>` : ''}
                    ${supplier.supplier_type ? `<div class="supplier-info"><strong>Tipo:</strong> ${supplier.supplier_type}</div>` : ''}
                    ${supplier.category ? `<div class="supplier-info"><strong>Categoría:</strong> ${supplier.category}</div>` : ''}
                    ${supplier.contact_person ? `<div class="supplier-info"><strong>Contacto:</strong> ${supplier.contact_person}</div>` : ''}
                    ${supplier.email ? `<div class="supplier-info"><i class="fas fa-envelope"></i> <a href="mailto:${supplier.email}">${supplier.email}</a></div>` : ''}
                    ${supplier.phone ? `<div class="supplier-info"><i class="fas fa-phone"></i> <a href="tel:${supplier.phone}">${supplier.phone}</a></div>` : ''}
                    ${supplier.whatsapp ? `<div class="supplier-info"><i class="fab fa-whatsapp"></i> <a href="https://wa.me/${supplier.whatsapp.replace(/[^0-9]/g, '')}" target="_blank">${supplier.whatsapp}</a></div>` : ''}
                    ${supplier.delivery_days ? `<div class="supplier-info"><i class="fas fa-truck"></i> Entrega: ${supplier.delivery_days} días</div>` : ''}
                    ${supplier.payment_terms ? `<div class="supplier-info"><i class="fas fa-money-bill-wave"></i> ${supplier.payment_terms}</div>` : ''}
                    <div class="supplier-rating">${ratingStars}</div>
                </div>
                <div class="supplier-card-footer">
                    <button class="btn-secondary btn-sm" onclick="window.Suppliers.showDetails('${supplier.id}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'overview')" title="Vista Avanzada">
                        <i class="fas fa-chart-line"></i> Avanzado
                    </button>
                    ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('suppliers.edit') ? `
                        <button class="btn-primary btn-sm" onclick="window.Suppliers.showEditForm('${supplier.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderRating(rating) {
        // Convertir rating a número, manejar null/undefined/string
        const ratingNum = rating != null ? parseFloat(rating) : 0;
        const validRating = isNaN(ratingNum) ? 0 : Math.max(0, Math.min(5, ratingNum)); // Asegurar que esté entre 0 y 5
        
        const fullStars = Math.floor(validRating);
        const hasHalfStar = validRating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        let html = '';
        for (let i = 0; i < fullStars; i++) {
            html += '<i class="fas fa-star"></i>';
        }
        if (hasHalfStar) {
            html += '<i class="fas fa-star-half-alt"></i>';
        }
        for (let i = 0; i < emptyStars; i++) {
            html += '<i class="far fa-star"></i>';
        }
        return `<span class="rating-stars">${html}</span> <span class="rating-value">${validRating.toFixed(1)}</span>`;
    },

    getStatusLabel(status) {
        const labels = {
            'active': 'Activo',
            'inactive': 'Inactivo',
            'suspended': 'Suspendido',
            'blacklisted': 'En lista negra'
        };
        return labels[status] || status;
    },

    setSortConfig(field) {
        if (this.sortConfig.field === field) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortConfig.field = field;
            this.sortConfig.direction = 'asc';
        }
        this.loadSuppliers();
    },

    async setupBranchFilter() {
        const branchFilterContainer = document.getElementById('supplier-branch-filter-container');
        const branchFilter = document.getElementById('supplier-branch-filter');
        if (!branchFilterContainer || !branchFilter) return;

        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );

        if (isMasterAdmin) {
            branchFilterContainer.style.display = 'block';
            // Agregar delay para evitar rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
            const branches = await API.getBranches() || [];
            branchFilter.innerHTML = '<option value="all">Todas</option>' +
                branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        } else {
            branchFilterContainer.style.display = 'none';
        }
    },

    async showAddForm() {
        await this.showSupplierForm();
    },

    async showEditForm(supplierId) {
        const supplier = await DB.get('suppliers', supplierId);
        if (!supplier) {
            Utils.showNotification('Proveedor no encontrado', 'error');
            return;
        }
        await this.showSupplierForm(supplier);
    },

    // Generar código de proveedor automáticamente
    async generateSupplierCode() {
        const codeInput = document.getElementById('supplier-code');
        
        if (!codeInput) {
            Utils.showNotification('Error: Campo de código no encontrado', 'error');
            return;
        }

        // Si ya hay un código, preguntar si desea generar uno nuevo
        if (codeInput.value.trim()) {
            const confirmed = await Utils.confirm(
                '¿Generar nuevo código?',
                'Ya existe un código. ¿Deseas generar uno nuevo?'
            );
            if (!confirmed) return;
        }

        try {
            // Obtener sucursal actual para generar código único por sucursal
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : null;
            
            // Obtener código de la sucursal
            let branchCode = '';
            if (currentBranchId) {
                try {
                    const branch = await DB.get('catalog_branches', currentBranchId);
                    if (branch && branch.code) {
                        branchCode = branch.code.toUpperCase().substring(0, 3);
                    } else if (branch && branch.name) {
                        branchCode = branch.name.toUpperCase()
                            .replace(/[^A-Z]/g, '')
                            .substring(0, 3)
                            .padEnd(3, 'X');
                    }
                } catch (e) {
                    console.warn('No se pudo obtener código de sucursal:', e);
                }
            }
            
            // Prefijo para proveedores: PROV-
            const codePrefix = branchCode ? `${branchCode}-PROV-` : 'PROV-';
            const codePattern = branchCode 
                ? new RegExp(`^${branchCode}-PROV-(\\d+)$`, 'i')
                : /^PROV-(\d+)$/i;
            
            // Obtener proveedores de la sucursal actual (o todos si no hay sucursal)
            let allSuppliers = [];
            if (currentBranchId) {
                const allSuppliersRaw = await DB.getAll('suppliers') || [];
                const normalizedBranchId = String(currentBranchId);
                allSuppliers = allSuppliersRaw.filter(supplier => {
                    if (!supplier.branch_id) return false;
                    return String(supplier.branch_id) === normalizedBranchId;
                });
            } else {
                const allSuppliersRaw = await DB.getAll('suppliers') || [];
                allSuppliers = allSuppliersRaw.filter(supplier => {
                    if (!supplier.code) return false;
                    return supplier.code.match(codePattern);
                });
            }
            
            // Buscar el último código numérico con el prefijo
            let lastNumber = 0;
            
            allSuppliers.forEach(supplier => {
                if (supplier.code) {
                    const match = supplier.code.match(codePattern);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > lastNumber) {
                            lastNumber = num;
                        }
                    }
                }
            });

            // Generar nuevo código
            const newNumber = lastNumber + 1;
            const newCode = `${codePrefix}${String(newNumber).padStart(4, '0')}`;
            
            // Verificar que no exista globalmente
            const allSuppliersGlobal = await DB.getAll('suppliers') || [];
            const exists = allSuppliersGlobal.some(s => s.code === newCode);
            
            if (exists) {
                // Si existe, buscar el siguiente disponible
                let nextNumber = newNumber + 1;
                while (allSuppliersGlobal.some(s => s.code === `${codePrefix}${String(nextNumber).padStart(4, '0')}`)) {
                    nextNumber++;
                }
                codeInput.value = `${codePrefix}${String(nextNumber).padStart(4, '0')}`;
            } else {
                codeInput.value = newCode;
            }

            // Auto-generar código de barras si existe el campo (usar el mismo código)
            const barcodeInput = document.getElementById('supplier-barcode');
            if (barcodeInput && !barcodeInput.value.trim()) {
                barcodeInput.value = codeInput.value;
            }

            Utils.showNotification(`Código generado: ${codeInput.value}`, 'success');
        } catch (error) {
            console.error('Error generando código de proveedor:', error);
            // Fallback: generar código con timestamp
            const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
            codeInput.value = `PROV-${timestamp}`;
            Utils.showNotification('Código generado (formato alternativo)', 'info');
        }
    },

    async showSupplierForm(supplier = null) {
        const isEdit = !!supplier;
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        
        const modalTitle = isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor';
        const modalContent = `
            <form id="supplier-form" class="supplier-form">
                <div class="form-section">
                    <h3>Información Básica</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Código *</label>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                <input type="text" id="supplier-code" class="form-input" value="${supplier?.code || ''}" required style="flex: 1;">
                                <button type="button" class="btn-secondary" onclick="window.Suppliers.generateSupplierCode()" title="Generar código automático">
                                    <i class="fas fa-magic"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Nombre *</label>
                            <input type="text" id="supplier-name" class="form-input" value="${supplier?.name || ''}" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Código de Barras</label>
                            <input type="text" id="supplier-barcode" class="form-input" value="${supplier?.barcode || supplier?.code || ''}" placeholder="Se genera automáticamente con el código">
                        </div>
                        <div class="form-group">
                            <label>Razón Social</label>
                            <input type="text" id="supplier-legal-name" class="form-input" value="${supplier?.legal_name || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>RFC / Tax ID</label>
                            <input type="text" id="supplier-tax-id" class="form-input" value="${supplier?.tax_id || ''}">
                        </div>
                        <div class="form-group">
                            <label>Tipo</label>
                            <select id="supplier-type" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="mayoreo" ${supplier?.supplier_type === 'mayoreo' ? 'selected' : ''}>Mayoreo</option>
                                <option value="menudeo" ${supplier?.supplier_type === 'menudeo' ? 'selected' : ''}>Menudeo</option>
                                <option value="especializado" ${supplier?.supplier_type === 'especializado' ? 'selected' : ''}>Especializado</option>
                                <option value="internacional" ${supplier?.supplier_type === 'internacional' ? 'selected' : ''}>Internacional</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Categoría</label>
                            <input type="text" id="supplier-category" class="form-input" value="${supplier?.category || ''}" placeholder="Ej: Joyería fina, Bisutería">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h3>Contacto Principal</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Persona de Contacto</label>
                            <input type="text" id="supplier-contact-person" class="form-input" value="${supplier?.contact_person || ''}">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="supplier-email" class="form-input" value="${supplier?.email || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Teléfono</label>
                            <input type="tel" id="supplier-phone" class="form-input" value="${supplier?.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>Móvil</label>
                            <input type="tel" id="supplier-mobile" class="form-input" value="${supplier?.mobile || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="tel" id="supplier-whatsapp" class="form-input" value="${supplier?.whatsapp || ''}" placeholder="Ej: +52 123 456 7890">
                        </div>
                        <div class="form-group">
                            <label>Sitio Web</label>
                            <input type="url" id="supplier-website" class="form-input" value="${supplier?.website || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Facebook</label>
                            <input type="url" id="supplier-facebook" class="form-input" value="${supplier?.facebook || ''}" placeholder="URL de Facebook">
                        </div>
                        <div class="form-group">
                            <label>Instagram</label>
                            <input type="text" id="supplier-instagram" class="form-input" value="${supplier?.instagram || ''}" placeholder="@usuario">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Horarios de Atención</label>
                        <input type="text" id="supplier-business-hours" class="form-input" value="${supplier?.business_hours || ''}" placeholder="Ej: Lunes a Viernes 9:00 - 18:00, Sábados 9:00 - 14:00">
                    </div>
                </div>

                <div class="form-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                        <h3 style="margin: 0;">Contactos Adicionales</h3>
                        ${isEdit ? `
                            <button type="button" class="btn-secondary btn-sm" onclick="window.Suppliers.showContactForm('${supplier.id}')">
                                <i class="fas fa-plus"></i> Agregar Contacto
                            </button>
                        ` : '<small style="color: var(--color-text-secondary);">Guarda el proveedor primero para agregar contactos</small>'}
                    </div>
                    <div id="supplier-contacts-list" class="contacts-list">
                        ${isEdit ? '<div class="loading-text">Cargando contactos...</div>' : ''}
                    </div>
                </div>

                <div class="form-section">
                    <h3>Dirección</h3>
                    <div class="form-group">
                        <label>Dirección</label>
                        <textarea id="supplier-address" class="form-input" rows="2">${supplier?.address || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Ciudad</label>
                            <input type="text" id="supplier-city" class="form-input" value="${supplier?.city || ''}">
                        </div>
                        <div class="form-group">
                            <label>Estado</label>
                            <input type="text" id="supplier-state" class="form-input" value="${supplier?.state || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>País</label>
                            <input type="text" id="supplier-country" class="form-input" value="${supplier?.country || 'México'}">
                        </div>
                        <div class="form-group">
                            <label>Código Postal</label>
                            <input type="text" id="supplier-postal-code" class="form-input" value="${supplier?.postal_code || ''}">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h3>Información Comercial</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Términos de Pago</label>
                            <input type="text" id="supplier-payment-terms" class="form-input" value="${supplier?.payment_terms || ''}" placeholder="Ej: Contado, 30 días, 60 días">
                        </div>
                        <div class="form-group">
                            <label>Límite de Crédito</label>
                            <input type="number" id="supplier-credit-limit" class="form-input" value="${supplier?.credit_limit || ''}" step="0.01" placeholder="0.00">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Métodos de Pago Aceptados</label>
                            <input type="text" id="supplier-payment-methods" class="form-input" value="${supplier?.payment_methods || ''}" placeholder="Ej: Efectivo, Transferencia, Cheque, Tarjeta">
                        </div>
                        <div class="form-group">
                            <label>Días de Entrega Promedio</label>
                            <input type="number" id="supplier-delivery-days" class="form-input" value="${supplier?.delivery_days || ''}" min="0" placeholder="Ej: 7">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Moneda</label>
                            <select id="supplier-currency" class="form-select">
                                <option value="MXN" ${supplier?.currency === 'MXN' ? 'selected' : ''}>MXN - Peso Mexicano</option>
                                <option value="USD" ${supplier?.currency === 'USD' ? 'selected' : ''}>USD - Dólar Americano</option>
                                <option value="EUR" ${supplier?.currency === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Estado</label>
                            <select id="supplier-status" class="form-select">
                                <option value="active" ${supplier?.status === 'active' ? 'selected' : ''}>Activo</option>
                                <option value="inactive" ${supplier?.status === 'inactive' ? 'selected' : ''}>Inactivo</option>
                                <option value="suspended" ${supplier?.status === 'suspended' ? 'selected' : ''}>Suspendido</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Calificación Inicial (1-5)</label>
                            <input type="number" id="supplier-rating" class="form-input" value="${supplier?.rating || ''}" min="0" max="5" step="0.1" placeholder="0.0">
                        </div>
                        <div class="form-group">
                            <label>Fecha de Inicio de Relación</label>
                            <input type="date" id="supplier-relationship-start" class="form-input" value="${supplier?.relationship_start_date || ''}">
                        </div>
                    </div>
                    ${typeof UserManager !== 'undefined' && (UserManager.currentUser?.role === 'master_admin' || UserManager.currentUser?.is_master_admin) ? `
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="supplier-is-shared" ${supplier?.is_shared !== false ? 'checked' : ''}>
                                Compartido entre sucursales
                            </label>
                        </div>
                    ` : ''}
                </div>

                <div class="form-section">
                    <h3>Información Bancaria</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Banco</label>
                            <input type="text" id="supplier-bank-name" class="form-input" value="${supplier?.bank_name || ''}" placeholder="Nombre del banco">
                        </div>
                        <div class="form-group">
                            <label>Número de Cuenta</label>
                            <input type="text" id="supplier-bank-account" class="form-input" value="${supplier?.bank_account || ''}" placeholder="Número de cuenta">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>CLABE</label>
                            <input type="text" id="supplier-clabe" class="form-input" value="${supplier?.clabe || ''}" placeholder="CLABE interbancaria">
                        </div>
                        <div class="form-group">
                            <label>Titular de la Cuenta</label>
                            <input type="text" id="supplier-account-holder" class="form-input" value="${supplier?.account_holder || ''}" placeholder="Nombre del titular">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Referencias Bancarias</label>
                        <textarea id="supplier-bank-references" class="form-input" rows="2" placeholder="Información adicional sobre cuentas bancarias...">${supplier?.bank_references || ''}</textarea>
                    </div>
                </div>

                <div class="form-section">
                    <h3>Notas</h3>
                    <div class="form-group">
                        <textarea id="supplier-notes" class="form-input" rows="3" placeholder="Notas adicionales...">${supplier?.notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;
        const modalButtons = [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { 
                text: isEdit ? 'Actualizar' : 'Crear', 
                class: 'btn-primary', 
                onclick: () => this.saveSupplier(supplier?.id) 
            }
        ];
        
        UI.showModal(modalTitle, modalContent, modalButtons);

        // Generar código automáticamente si es un nuevo proveedor y no tiene código
        if (!isEdit) {
            const codeInput = document.getElementById('supplier-code');
            if (codeInput && !codeInput.value) {
                await this.generateSupplierCode();
            }
        }

        // Cargar contactos si es edición
        if (isEdit && supplier?.id) {
            await this.loadContactsList(supplier.id);
        }
    },

    async loadContactsList(supplierId) {
        const contactsList = document.getElementById('supplier-contacts-list');
        if (!contactsList) return;

        try {
            const contacts = await API.getSupplierContacts(supplierId) || [];
            
            if (contacts.length === 0) {
                contactsList.innerHTML = '<div class="empty-state">No hay contactos adicionales. Haz clic en "Agregar Contacto" para agregar uno.</div>';
                return;
            }

            contactsList.innerHTML = contacts.map(contact => `
                <div class="contact-item" data-contact-id="${contact.id}">
                    <div class="contact-item-header">
                        <div class="contact-item-info">
                            <strong>${contact.name || 'Sin nombre'}</strong>
                            ${contact.is_primary ? '<span class="badge badge-primary">Principal</span>' : ''}
                            ${contact.position ? `<span class="text-muted">${contact.position}</span>` : ''}
                        </div>
                        <div class="contact-item-actions">
                            <button type="button" class="btn-icon" onclick="window.Suppliers.showContactForm('${supplierId}', '${contact.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" class="btn-icon btn-danger" onclick="window.Suppliers.deleteContact('${contact.id}', '${supplierId}')" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="contact-item-details">
                        ${contact.department ? `<div><i class="fas fa-building"></i> ${contact.department}</div>` : ''}
                        ${contact.email ? `<div><i class="fas fa-envelope"></i> ${contact.email}</div>` : ''}
                        ${contact.phone ? `<div><i class="fas fa-phone"></i> ${contact.phone}</div>` : ''}
                        ${contact.mobile ? `<div><i class="fas fa-mobile-alt"></i> ${contact.mobile}</div>` : ''}
                        ${contact.contact_hours ? `<div><i class="fas fa-clock"></i> ${contact.contact_hours}</div>` : ''}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error cargando contactos:', error);
            contactsList.innerHTML = '<div class="error-state">Error al cargar contactos</div>';
        }
    },

    async showContactForm(supplierId, contactId = null) {
        const isEdit = !!contactId;
        let contact = null;

        if (isEdit) {
            try {
                const contacts = await API.getSupplierContacts(supplierId) || [];
                contact = contacts.find(c => c.id === contactId);
            } catch (error) {
                console.error('Error obteniendo contacto:', error);
                Utils.showNotification('Error al obtener contacto', 'error');
                return;
            }
        }

        const contactModalTitle = isEdit ? 'Editar Contacto' : 'Nuevo Contacto';
        const contactModalContent = `
            <form id="contact-form" class="contact-form">
                <div class="form-group">
                    <label>Nombre *</label>
                    <input type="text" id="contact-name" class="form-input" value="${contact?.name || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Posición</label>
                        <input type="text" id="contact-position" class="form-input" value="${contact?.position || ''}" placeholder="Ej: Gerente de Ventas">
                    </div>
                    <div class="form-group">
                        <label>Departamento</label>
                        <input type="text" id="contact-department" class="form-input" value="${contact?.department || ''}" placeholder="Ej: Ventas">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="contact-email" class="form-input" value="${contact?.email || ''}">
                    </div>
                    <div class="form-group">
                        <label>Teléfono</label>
                        <input type="tel" id="contact-phone" class="form-input" value="${contact?.phone || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Móvil</label>
                    <input type="tel" id="contact-mobile" class="form-input" value="${contact?.mobile || ''}">
                </div>
                <div class="form-group">
                    <label>Horarios de Contacto</label>
                    <input type="text" id="contact-hours" class="form-input" value="${contact?.contact_hours || ''}" placeholder="Ej: Lunes a Viernes 9:00 - 18:00">
                </div>
                <div class="form-group">
                    <label>Preferencia de Comunicación</label>
                    <select id="contact-preference" class="form-select">
                        <option value="">Seleccionar...</option>
                        <option value="email" ${contact?.communication_preference === 'email' ? 'selected' : ''}>Email</option>
                        <option value="phone" ${contact?.communication_preference === 'phone' ? 'selected' : ''}>Teléfono</option>
                        <option value="mobile" ${contact?.communication_preference === 'mobile' ? 'selected' : ''}>Móvil</option>
                        <option value="whatsapp" ${contact?.communication_preference === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Notas</label>
                    <textarea id="contact-notes" class="form-input" rows="2">${contact?.notes || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="contact-is-primary" ${contact?.is_primary ? 'checked' : ''}>
                        Marcar como contacto principal
                    </label>
                </div>
            </form>
        `;
        const contactModalButtons = [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { 
                text: isEdit ? 'Actualizar' : 'Crear', 
                class: 'btn-primary', 
                onclick: () => this.saveContact(supplierId, contactId) 
            }
        ];
        
        UI.showModal(contactModalTitle, contactModalContent, contactModalButtons);
    },

    async saveContact(supplierId, contactId) {
        try {
            const form = document.getElementById('contact-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const contactData = {
                name: document.getElementById('contact-name').value.trim(),
                position: document.getElementById('contact-position').value.trim() || null,
                department: document.getElementById('contact-department').value.trim() || null,
                email: document.getElementById('contact-email').value.trim() || null,
                phone: document.getElementById('contact-phone').value.trim() || null,
                mobile: document.getElementById('contact-mobile').value.trim() || null,
                contact_hours: document.getElementById('contact-hours').value.trim() || null,
                communication_preference: document.getElementById('contact-preference').value || null,
                notes: document.getElementById('contact-notes').value.trim() || null,
                is_primary: document.getElementById('contact-is-primary').checked
            };

            if (contactId) {
                await API.updateSupplierContact(contactId, contactData);
                Utils.showNotification('Contacto actualizado', 'success');
            } else {
                await API.createSupplierContact(supplierId, contactData);
                Utils.showNotification('Contacto creado', 'success');
            }

            UI.closeModal();
            
            // Recargar lista de contactos si el formulario de proveedor está abierto
            const contactsList = document.getElementById('supplier-contacts-list');
            if (contactsList) {
                await this.loadContactsList(supplierId);
            }
        } catch (error) {
            console.error('Error guardando contacto:', error);
            Utils.showNotification(error.message || 'Error al guardar contacto', 'error');
        }
    },

    async deleteContact(contactId, supplierId) {
        if (!confirm('¿Estás seguro de eliminar este contacto?')) return;

        try {
            await API.deleteSupplierContact(contactId);
            Utils.showNotification('Contacto eliminado', 'success');
            
            // Recargar lista de contactos
            const contactsList = document.getElementById('supplier-contacts-list');
            if (contactsList) {
                await this.loadContactsList(supplierId);
            }
        } catch (error) {
            console.error('Error eliminando contacto:', error);
            Utils.showNotification('Error al eliminar contacto', 'error');
        }
    },

    async saveSupplier(supplierId) {
        try {
            const form = document.getElementById('supplier-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin
            );

            const code = document.getElementById('supplier-code').value.trim();
            const barcodeInput = document.getElementById('supplier-barcode');
            const barcodeValue = barcodeInput ? barcodeInput.value.trim() : '';
            
            // Si no hay barcode, usar el código del proveedor
            const finalBarcode = barcodeValue || code;
            
            const supplierData = {
                code: code,
                barcode: finalBarcode,
                name: document.getElementById('supplier-name').value.trim(),
                legal_name: document.getElementById('supplier-legal-name').value.trim() || null,
                tax_id: document.getElementById('supplier-tax-id').value.trim() || null,
                supplier_type: document.getElementById('supplier-type').value || null,
                category: document.getElementById('supplier-category').value.trim() || null,
                contact_person: document.getElementById('supplier-contact-person').value.trim() || null,
                email: document.getElementById('supplier-email').value.trim() || null,
                phone: document.getElementById('supplier-phone').value.trim() || null,
                mobile: document.getElementById('supplier-mobile').value.trim() || null,
                whatsapp: document.getElementById('supplier-whatsapp').value.trim() || null,
                website: document.getElementById('supplier-website').value.trim() || null,
                facebook: document.getElementById('supplier-facebook').value.trim() || null,
                instagram: document.getElementById('supplier-instagram').value.trim() || null,
                business_hours: document.getElementById('supplier-business-hours').value.trim() || null,
                address: document.getElementById('supplier-address').value.trim() || null,
                city: document.getElementById('supplier-city').value.trim() || null,
                state: document.getElementById('supplier-state').value.trim() || null,
                country: document.getElementById('supplier-country').value.trim() || 'México',
                postal_code: document.getElementById('supplier-postal-code').value.trim() || null,
                payment_terms: document.getElementById('supplier-payment-terms').value.trim() || null,
                payment_methods: document.getElementById('supplier-payment-methods').value.trim() || null,
                delivery_days: parseInt(document.getElementById('supplier-delivery-days').value) || null,
                credit_limit: parseFloat(document.getElementById('supplier-credit-limit').value) || null,
                currency: document.getElementById('supplier-currency').value || 'MXN',
                rating: document.getElementById('supplier-rating')?.value ? parseFloat(document.getElementById('supplier-rating').value) : 0,
                relationship_start_date: document.getElementById('supplier-relationship-start').value || null,
                bank_name: document.getElementById('supplier-bank-name').value.trim() || null,
                bank_account: document.getElementById('supplier-bank-account').value.trim() || null,
                clabe: document.getElementById('supplier-clabe').value.trim() || null,
                account_holder: document.getElementById('supplier-account-holder').value.trim() || null,
                bank_references: document.getElementById('supplier-bank-references').value.trim() || null,
                status: document.getElementById('supplier-status').value || 'active',
                notes: document.getElementById('supplier-notes').value.trim() || null,
                branch_id: currentBranchId,
                is_shared: isMasterAdmin ? document.getElementById('supplier-is-shared')?.checked !== false : true
            };

            let savedSupplier = null;
            let savedWithAPI = false;

            // Intentar guardar en backend
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token) {
                    if (supplierId && API.updateSupplier) {
                        savedSupplier = await API.updateSupplier(supplierId, supplierData);
                        savedWithAPI = true;
                    } else if (!supplierId && API.createSupplier) {
                        savedSupplier = await API.createSupplier(supplierData);
                        savedWithAPI = true;
                    }
                }
            } catch (apiError) {
                console.warn('⚠️ Error guardando en API, guardando localmente:', apiError);
            }

            // Si no se guardó con API, generar ID local
            if (!savedSupplier) {
                savedSupplier = {
                    ...supplierData,
                    id: supplierId || Utils.generateId(),
                    created_at: supplierId ? undefined : new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            } else {
                savedSupplier = { ...supplierData, ...savedSupplier };
            }

            // Guardar en IndexedDB (siempre)
            await DB.put('suppliers', savedSupplier);

            // Agregar a cola de sincronización si no se guardó con API
            if (!savedWithAPI && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('supplier', savedSupplier.id);
            }

            UI.closeModal();
            Utils.showNotification(
                supplierId ? 'Proveedor actualizado correctamente' : 'Proveedor creado correctamente',
                'success'
            );
            
            await this.loadSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            Utils.showNotification(`Error al guardar proveedor: ${error.message}`, 'error');
        }
    },

    async deleteSupplier(supplierId) {
        if (!confirm('¿Estás seguro de eliminar este proveedor?')) return;

        try {
            // Intentar eliminar en backend
            try {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteSupplier) {
                    await API.deleteSupplier(supplierId);
                }
            } catch (apiError) {
                console.warn('⚠️ Error eliminando en API:', apiError);
            }

            // Eliminar de IndexedDB
            await DB.delete('suppliers', supplierId);

            Utils.showNotification('Proveedor eliminado correctamente', 'success');
            await this.loadSuppliers();
        } catch (error) {
            console.error('Error deleting supplier:', error);
            Utils.showNotification(`Error al eliminar proveedor: ${error.message}`, 'error');
        }
    },

    async showDetails(supplierId) {
        const supplier = await DB.get('suppliers', supplierId);
        if (!supplier) {
            Utils.showNotification('Proveedor no encontrado', 'error');
            return;
        }

        // Obtener items y costos asociados
        const items = await DB.getAll('inventory_items') || [];
        const supplierItems = items.filter(i => i.supplier_id === supplierId);
        
        const costs = await DB.getAll('cost_entries') || [];
        const supplierCosts = costs.filter(c => c.supplier_id === supplierId);

        const detailsModalTitle = `Detalles: ${supplier.name}`;
        const detailsModalContent = `
            <div class="supplier-details">
                <div class="details-section">
                    <h3>Información Básica</h3>
                    <div class="details-grid">
                        <div><strong>Código:</strong> ${supplier.code || '-'}</div>
                        <div><strong>Nombre:</strong> ${supplier.name || '-'}</div>
                        ${supplier.legal_name ? `<div><strong>Razón Social:</strong> ${supplier.legal_name}</div>` : ''}
                        ${supplier.tax_id ? `<div><strong>RFC:</strong> ${supplier.tax_id}</div>` : ''}
                        <div><strong>Tipo:</strong> ${supplier.supplier_type || '-'}</div>
                        <div><strong>Categoría:</strong> ${supplier.category || '-'}</div>
                        <div><strong>Estado:</strong> <span class="status-badge ${supplier.status === 'active' ? 'status-active' : 'status-inactive'}">${this.getStatusLabel(supplier.status)}</span></div>
                    </div>
                </div>

                <div class="details-section">
                    <h3>Contacto</h3>
                    <div class="details-grid">
                        ${supplier.contact_person ? `<div><strong>Contacto:</strong> ${supplier.contact_person}</div>` : ''}
                        ${supplier.email ? `<div><strong>Email:</strong> <a href="mailto:${supplier.email}">${supplier.email}</a></div>` : ''}
                        ${supplier.phone ? `<div><strong>Teléfono:</strong> <a href="tel:${supplier.phone}">${supplier.phone}</a></div>` : ''}
                        ${supplier.mobile ? `<div><strong>Móvil:</strong> <a href="tel:${supplier.mobile}">${supplier.mobile}</a></div>` : ''}
                        ${supplier.whatsapp ? `<div><strong>WhatsApp:</strong> <a href="https://wa.me/${supplier.whatsapp.replace(/[^0-9]/g, '')}" target="_blank">${supplier.whatsapp}</a></div>` : ''}
                        ${supplier.website ? `<div><strong>Web:</strong> <a href="${supplier.website}" target="_blank">${supplier.website}</a></div>` : ''}
                        ${supplier.facebook ? `<div><strong>Facebook:</strong> <a href="${supplier.facebook}" target="_blank">${supplier.facebook}</a></div>` : ''}
                        ${supplier.instagram ? `<div><strong>Instagram:</strong> <a href="https://instagram.com/${supplier.instagram.replace('@', '')}" target="_blank">${supplier.instagram}</a></div>` : ''}
                        ${supplier.business_hours ? `<div><strong>Horarios:</strong> ${supplier.business_hours}</div>` : ''}
                    </div>
                </div>

                ${supplier.address ? `
                <div class="details-section">
                    <h3>Dirección</h3>
                    <div class="details-grid">
                        <div><strong>Dirección:</strong> ${supplier.address}</div>
                        ${supplier.city ? `<div><strong>Ciudad:</strong> ${supplier.city}</div>` : ''}
                        ${supplier.state ? `<div><strong>Estado:</strong> ${supplier.state}</div>` : ''}
                        ${supplier.country ? `<div><strong>País:</strong> ${supplier.country}</div>` : ''}
                        ${supplier.postal_code ? `<div><strong>Código Postal:</strong> ${supplier.postal_code}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                    <div class="details-section">
                        <h3>Información Comercial</h3>
                        <div class="details-grid">
                            ${supplier.payment_terms ? `<div><strong>Términos de Pago:</strong> ${supplier.payment_terms}</div>` : ''}
                            ${supplier.payment_methods ? `<div><strong>Métodos de Pago:</strong> ${supplier.payment_methods}</div>` : ''}
                            ${supplier.delivery_days ? `<div><strong>Días de Entrega:</strong> ${supplier.delivery_days} días</div>` : ''}
                            ${supplier.credit_limit ? `<div><strong>Límite de Crédito:</strong> ${Utils.formatCurrency(supplier.credit_limit)}</div>` : ''}
                            <div><strong>Moneda:</strong> ${supplier.currency || 'MXN'}</div>
                            ${supplier.rating ? `<div><strong>Calificación:</strong> ${this.renderRating(supplier.rating)}</div>` : ''}
                            ${supplier.relationship_start_date ? `<div><strong>Fecha de Inicio:</strong> ${new Date(supplier.relationship_start_date).toLocaleDateString('es-MX')}</div>` : ''}
                        </div>
                    </div>

                    ${supplier.bank_name || supplier.bank_account ? `
                    <div class="details-section">
                        <h3>Información Bancaria</h3>
                        <div class="details-grid">
                            ${supplier.bank_name ? `<div><strong>Banco:</strong> ${supplier.bank_name}</div>` : ''}
                            ${supplier.bank_account ? `<div><strong>Número de Cuenta:</strong> ${supplier.bank_account}</div>` : ''}
                            ${supplier.clabe ? `<div><strong>CLABE:</strong> ${supplier.clabe}</div>` : ''}
                            ${supplier.account_holder ? `<div><strong>Titular:</strong> ${supplier.account_holder}</div>` : ''}
                            ${supplier.bank_references ? `<div><strong>Referencias:</strong> ${supplier.bank_references}</div>` : ''}
                        </div>
                    </div>
                    ` : ''}

                    <div class="details-section">
                        <h3>Estadísticas</h3>
                        <div class="details-grid">
                            <div><strong>Items en Inventario:</strong> ${supplierItems.length}</div>
                            <div><strong>Costos Registrados:</strong> ${supplierCosts.length}</div>
                            ${supplier.total_purchases ? `<div><strong>Total Compras:</strong> ${Utils.formatCurrency(supplier.total_purchases)}</div>` : ''}
                        </div>
                    </div>

                ${supplier.notes ? `
                <div class="details-section">
                    <h3>Notas</h3>
                    <p>${supplier.notes}</p>
                </div>
                ` : ''}
            </div>
        `;
        const detailsModalButtons = [
            { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { 
                text: 'Editar', 
                class: 'btn-primary', 
                onclick: () => {
                    UI.closeModal();
                    this.showEditForm(supplierId);
                }
            }
        ];
        
        UI.showModal(detailsModalTitle, detailsModalContent, detailsModalButtons);
    },

    async exportSuppliers() {
        try {
            const suppliers = await DB.getAll('suppliers') || [];
            if (suppliers.length === 0) {
                Utils.showNotification('No hay proveedores para exportar', 'warning');
                return;
            }

            const csv = this.generateCSV(suppliers);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `proveedores_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Utils.showNotification('Proveedores exportados correctamente', 'success');
        } catch (error) {
            console.error('Error exporting suppliers:', error);
            Utils.showNotification(`Error al exportar: ${error.message}`, 'error');
        }
    },

    generateCSV(suppliers) {
        const headers = ['Código', 'Nombre', 'Razón Social', 'Tipo', 'Categoría', 'Email', 'Teléfono', 'Estado'];
        const rows = suppliers.map(s => [
            s.code || '',
            s.name || '',
            s.legal_name || '',
            s.supplier_type || '',
            s.category || '',
            s.email || '',
            s.phone || '',
            s.status || ''
        ]);

        return [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    },

    setupSocketListeners() {
        if (typeof API === 'undefined' || !API.socket) {
            console.warn('⚠️ Socket.IO no disponible para Suppliers');
            return;
        }

        API.socket.on('supplier_updated', async (data) => {
            console.log('📡 Suppliers: Evento recibido:', data);
            const { supplier, action } = data;
            
            if (supplier && supplier.id) {
                if (action === 'deleted') {
                    await DB.delete('suppliers', supplier.id);
                } else {
                    await DB.put('suppliers', { ...supplier, server_id: supplier.id });
                }
                
                if (this.initialized) {
                    setTimeout(async () => {
                        await this.loadSuppliers();
                    }, 300);
                }
            }
        });
    }
};

// Exponer al scope global
window.Suppliers = Suppliers;

// Verificación de carga
if (typeof window.Suppliers !== 'undefined') {
    console.log('✅ Suppliers module expuesto correctamente en window.Suppliers');
} else {
    console.error('❌ Error: Suppliers module no se pudo exponer en window.Suppliers');
}
