/**
 * MÓDULO AVANZADO DE PROVEEDORES
 * Gestión de Contratos, Órdenes de Compra, Cuentas por Pagar y Análisis
 * 
 * Este módulo extiende suppliers.js con funcionalidades avanzadas
 */

window.SuppliersAdvanced = {
    initialized: false,
    currentSupplierId: null,
    currentView: 'overview', // overview, contracts, orders, payments, analytics

    async init() {
        if (this.initialized) return;
        
        console.log('🔧 Inicializando módulo avanzado de proveedores...');
        this.initialized = true;
    },

    // ========== NAVEGACIÓN Y VISTAS ==========

    async showAdvancedView(supplierId, view = 'overview') {
        this.currentSupplierId = supplierId;
        this.currentView = view;

        const supplier = await DB.get('suppliers', supplierId);
        if (!supplier) {
            Utils.showNotification('Proveedor no encontrado', 'error');
            return;
        }

        // Verificar si el modal ya está abierto
        const modalOverlay = document.getElementById('modal-overlay');
        const isModalOpen = modalOverlay && modalOverlay.style.display === 'flex';

        const views = {
            overview: () => this.showOverview(supplier),
            contracts: () => this.showContracts(supplier),
            orders: () => this.showPurchaseOrders(supplier),
            payments: () => this.showPayments(supplier),
            analytics: () => this.showAnalytics(supplier)
        };

        const viewFunction = views[view] || views.overview;
        await viewFunction();
    },

    async showOverview(supplier) {
        const title = `Vista Avanzada: ${supplier.name}`;
        
        const body = `
            <div class="supplier-advanced-view">
                <div class="advanced-tabs">
                    <button class="tab-btn ${this.currentView === 'overview' ? 'active' : ''}" 
                            onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'overview')">
                        <i class="fas fa-chart-line"></i> Resumen
                    </button>
                    <button class="tab-btn ${this.currentView === 'contracts' ? 'active' : ''}" 
                            onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'contracts')">
                        <i class="fas fa-file-contract"></i> Contratos
                    </button>
                    <button class="tab-btn ${this.currentView === 'orders' ? 'active' : ''}" 
                            onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'orders')">
                        <i class="fas fa-shopping-cart"></i> Órdenes de Compra
                    </button>
                    <button class="tab-btn ${this.currentView === 'payments' ? 'active' : ''}" 
                            onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'payments')">
                        <i class="fas fa-money-bill-wave"></i> Cuentas por Pagar
                    </button>
                    <button class="tab-btn ${this.currentView === 'analytics' ? 'active' : ''}" 
                            onclick="window.SuppliersAdvanced.showAdvancedView('${supplier.id}', 'analytics')">
                        <i class="fas fa-chart-bar"></i> Análisis
                    </button>
                </div>

                <div class="advanced-content">
                    <div class="overview-stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-file-contract"></i></div>
                            <div class="stat-info">
                                <div class="stat-value" id="contracts-count">-</div>
                                <div class="stat-label">Contratos Activos</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-shopping-cart"></i></div>
                            <div class="stat-info">
                                <div class="stat-value" id="orders-count">-</div>
                                <div class="stat-label">Órdenes Pendientes</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                            <div class="stat-info">
                                <div class="stat-value" id="payments-pending">-</div>
                                <div class="stat-label">Pagos Pendientes</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon"><i class="fas fa-star"></i></div>
                            <div class="stat-info">
                                <div class="stat-value" id="avg-rating">-</div>
                                <div class="stat-label">Calificación Promedio</div>
                            </div>
                        </div>
                    </div>

                    <div class="overview-sections">
                        <div class="overview-section">
                            <h3>Contratos Recientes</h3>
                            <div id="recent-contracts-list">Cargando...</div>
                        </div>
                        <div class="overview-section">
                            <h3>Órdenes Recientes</h3>
                            <div id="recent-orders-list">Cargando...</div>
                        </div>
                        <div class="overview-section">
                            <h3>Pagos Pendientes</h3>
                            <div id="pending-payments-list">Cargando...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        UI.showModal(
            title,
            body,
            [
                { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
            ],
            { size: 'lg' }
        );

        await this.loadOverviewData(supplier.id);
    },

    async loadOverviewData(supplierId) {
        try {
            // Cargar contratos activos
            try {
                const contracts = (typeof API !== 'undefined' && API.getSupplierContracts) 
                    ? await API.getSupplierContracts(supplierId, { status: 'active' }) || []
                    : [];
                const contractsCount = document.getElementById('contracts-count');
                if (contractsCount) contractsCount.textContent = contracts.length;
            } catch (e) {
                console.warn('Error cargando contratos:', e);
                const contractsCount = document.getElementById('contracts-count');
                if (contractsCount) contractsCount.textContent = '0';
            }

            // Cargar órdenes pendientes
            try {
                const orders = (typeof API !== 'undefined' && API.getPurchaseOrders)
                    ? await API.getPurchaseOrders({ supplier_id: supplierId, status: 'pending' }) || []
                    : [];
                const ordersCount = document.getElementById('orders-count');
                if (ordersCount) ordersCount.textContent = orders.length;
            } catch (e) {
                console.warn('Error cargando órdenes:', e);
                const ordersCount = document.getElementById('orders-count');
                if (ordersCount) ordersCount.textContent = '0';
            }

            // Cargar pagos pendientes
            try {
                const payments = (typeof API !== 'undefined' && API.getSupplierPayments)
                    ? await API.getSupplierPayments({ supplier_id: supplierId, status: 'pending' }) || []
                    : [];
                const totalPending = payments.reduce((sum, p) => sum + (parseFloat(p.total_amount || 0) - parseFloat(p.paid_amount || 0)), 0);
                const paymentsPending = document.getElementById('payments-pending');
                if (paymentsPending) paymentsPending.textContent = Utils.formatCurrency(totalPending);
            } catch (e) {
                console.warn('Error cargando pagos:', e);
                const paymentsPending = document.getElementById('payments-pending');
                if (paymentsPending) paymentsPending.textContent = Utils.formatCurrency(0);
            }

            // Cargar calificación promedio
            try {
                const stats = (typeof API !== 'undefined' && API.getSupplierStatsAdvanced)
                    ? await API.getSupplierStatsAdvanced(supplierId) || {}
                    : {};
                const avgRating = stats.ratings?.avg_rating || 0;
                const avgRatingEl = document.getElementById('avg-rating');
                if (avgRatingEl) avgRatingEl.textContent = avgRating > 0 ? avgRating.toFixed(1) : 'N/A';
            } catch (e) {
                console.warn('Error cargando estadísticas:', e);
                const avgRatingEl = document.getElementById('avg-rating');
                if (avgRatingEl) avgRatingEl.textContent = 'N/A';
            }

            // Cargar listas recientes
            await this.loadRecentContracts(supplierId);
            await this.loadRecentOrders(supplierId);
            await this.loadPendingPayments(supplierId);
        } catch (error) {
            console.error('Error cargando datos del resumen:', error);
        }
    },

    // ========== GESTIÓN DE CONTRATOS ==========

    async showContracts(supplier) {
        const title = `Contratos: ${supplier.name}`;
        
        const body = `
            <div class="supplier-contracts-view">
                <div class="view-header">
                    <h3>Contratos del Proveedor</h3>
                    <button class="btn-primary" onclick="window.SuppliersAdvanced.showContractForm('${supplier.id}')">
                        <i class="fas fa-plus"></i> Nuevo Contrato
                    </button>
                </div>
                <div id="contracts-list" class="contracts-list">Cargando contratos...</div>
            </div>
        `;

        UI.showModal(
            title,
            body,
            [
                { text: '← Regresar', class: 'btn-secondary', onclick: () => this.showAdvancedView(supplier.id, 'overview') },
                { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
            ],
            { size: 'lg' }
        );

        await this.loadContracts(supplier.id);
    },

    async loadContracts(supplierId) {
        const contractsList = document.getElementById('contracts-list');
        if (!contractsList) return;

        try {
            const contracts = (typeof API !== 'undefined' && API.getSupplierContracts)
                ? await API.getSupplierContracts(supplierId) || []
                : [];
            
            if (contracts.length === 0) {
                contractsList.innerHTML = '<div class="empty-state">No hay contratos registrados</div>';
                return;
            }

            contractsList.innerHTML = contracts.map(contract => `
                <div class="contract-card" data-contract-id="${contract.id}">
                    <div class="contract-header">
                        <div class="contract-title">
                            <h4>${contract.title}</h4>
                            <span class="contract-number">${contract.contract_number}</span>
                        </div>
                        <span class="status-badge status-${contract.status}">${this.getContractStatusLabel(contract.status)}</span>
                    </div>
                    <div class="contract-details">
                        <div class="contract-detail">
                            <i class="fas fa-tag"></i>
                            <span>${this.getContractTypeLabel(contract.contract_type)}</span>
                        </div>
                        <div class="contract-detail">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${Utils.formatDate(contract.start_date)} - ${contract.end_date ? Utils.formatDate(contract.end_date) : 'Sin fecha de fin'}</span>
                        </div>
                        ${contract.discount_percentage ? `
                            <div class="contract-detail">
                                <i class="fas fa-percent"></i>
                                <span>Descuento: ${contract.discount_percentage}%</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="contract-actions">
                        <button class="btn-icon" onclick="window.SuppliersAdvanced.showContractForm('${supplierId}', '${contract.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="window.SuppliersAdvanced.deleteContract('${contract.id}', '${supplierId}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error cargando contratos:', error);
            contractsList.innerHTML = '<div class="error-state">Error al cargar contratos</div>';
        }
    },

    async showContractForm(supplierId, contractId = null) {
        const isEdit = !!contractId;
        let contract = null;

        if (isEdit) {
            try {
                const contracts = await API.getSupplierContracts(supplierId) || [];
                contract = contracts.find(c => c.id === contractId);
            } catch (error) {
                console.error('Error obteniendo contrato:', error);
                Utils.showNotification('Error al obtener contrato', 'error');
                return;
            }
        }

        const contractTitle = isEdit ? 'Editar Contrato' : 'Nuevo Contrato';
        const contractBody = `
                <form id="contract-form" class="contract-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Número de Contrato *</label>
                            <input type="text" id="contract-number" class="form-input" value="${contract?.contract_number || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Tipo de Contrato *</label>
                            <select id="contract-type" class="form-select" required>
                                <option value="">Seleccionar...</option>
                                <option value="exclusividad" ${contract?.contract_type === 'exclusividad' ? 'selected' : ''}>Exclusividad</option>
                                <option value="volumen" ${contract?.contract_type === 'volumen' ? 'selected' : ''}>Volumen</option>
                                <option value="precio_fijo" ${contract?.contract_type === 'precio_fijo' ? 'selected' : ''}>Precio Fijo</option>
                                <option value="marco" ${contract?.contract_type === 'marco' ? 'selected' : ''}>Marco</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Título *</label>
                        <input type="text" id="contract-title" class="form-input" value="${contract?.title || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea id="contract-description" class="form-input" rows="3">${contract?.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Inicio *</label>
                            <input type="date" id="contract-start-date" class="form-input" value="${contract?.start_date || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Fecha de Fin</label>
                            <input type="date" id="contract-end-date" class="form-input" value="${contract?.end_date || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Renovación</label>
                            <input type="date" id="contract-renewal-date" class="form-input" value="${contract?.renewal_date || ''}">
                        </div>
                        <div class="form-group">
                            <label>Descuento (%)</label>
                            <input type="number" id="contract-discount" class="form-input" step="0.01" value="${contract?.discount_percentage || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="contract-auto-renew" ${contract?.auto_renew ? 'checked' : ''}>
                            Renovación Automática
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="contract-is-exclusive" ${contract?.is_exclusive ? 'checked' : ''}>
                            Contrato Exclusivo
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="contract-status" class="form-select">
                            <option value="active" ${contract?.status === 'active' ? 'selected' : ''}>Activo</option>
                            <option value="expired" ${contract?.status === 'expired' ? 'selected' : ''}>Expirado</option>
                            <option value="cancelled" ${contract?.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                            <option value="pending_renewal" ${contract?.status === 'pending_renewal' ? 'selected' : ''}>Pendiente de Renovación</option>
                        </select>
                    </div>
                </form>
            `;
        
        UI.showModal(
            contractTitle,
            contractBody,
            [
                { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                { 
                    text: isEdit ? 'Actualizar' : 'Crear', 
                    class: 'btn-primary', 
                    onclick: () => this.saveContract(supplierId, contractId) 
                }
            ],
            { size: 'lg' }
        );
    },

    async saveContract(supplierId, contractId) {
        try {
            const form = document.getElementById('contract-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const contractData = {
                contract_number: document.getElementById('contract-number').value.trim(),
                contract_type: document.getElementById('contract-type').value,
                title: document.getElementById('contract-title').value.trim(),
                description: document.getElementById('contract-description').value.trim() || null,
                start_date: document.getElementById('contract-start-date').value,
                end_date: document.getElementById('contract-end-date').value || null,
                renewal_date: document.getElementById('contract-renewal-date').value || null,
                auto_renew: document.getElementById('contract-auto-renew').checked,
                is_exclusive: document.getElementById('contract-is-exclusive').checked,
                discount_percentage: document.getElementById('contract-discount').value ? parseFloat(document.getElementById('contract-discount').value) : null,
                status: document.getElementById('contract-status').value
            };

            if (contractId) {
                await API.updateSupplierContract(contractId, contractData);
                Utils.showNotification('Contrato actualizado', 'success');
            } else {
                await API.createSupplierContract(supplierId, contractData);
                Utils.showNotification('Contrato creado', 'success');
            }

            UI.closeModal();
            await this.loadContracts(supplierId);
        } catch (error) {
            console.error('Error guardando contrato:', error);
            Utils.showNotification(error.message || 'Error al guardar contrato', 'error');
        }
    },

    async deleteContract(contractId, supplierId) {
        if (!confirm('¿Estás seguro de eliminar este contrato?')) return;

        try {
            await API.deleteSupplierContract(contractId);
            Utils.showNotification('Contrato eliminado', 'success');
            await this.loadContracts(supplierId);
        } catch (error) {
            console.error('Error eliminando contrato:', error);
            Utils.showNotification('Error al eliminar contrato', 'error');
        }
    },

    getContractStatusLabel(status) {
        const labels = {
            'active': 'Activo',
            'expired': 'Expirado',
            'cancelled': 'Cancelado',
            'pending_renewal': 'Pendiente Renovación'
        };
        return labels[status] || status;
    },

    getContractTypeLabel(type) {
        const labels = {
            'exclusividad': 'Exclusividad',
            'volumen': 'Volumen',
            'precio_fijo': 'Precio Fijo',
            'marco': 'Marco'
        };
        return labels[type] || type;
    },

    // ========== GESTIÓN DE ÓRDENES DE COMPRA ==========

    async showPurchaseOrders(supplier) {
        const title = `Órdenes de Compra: ${supplier.name}`;
        
        const body = `
            <div class="supplier-orders-view">
                <div class="view-header">
                    <h3>Órdenes de Compra</h3>
                    <button class="btn-primary" onclick="window.SuppliersAdvanced.showOrderForm('${supplier.id}')">
                        <i class="fas fa-plus"></i> Nueva Orden
                    </button>
                </div>
                <div class="filters-bar">
                    <select id="order-status-filter" class="form-select" onchange="window.SuppliersAdvanced.filterOrders('${supplier.id}')">
                        <option value="">Todos los estados</option>
                        <option value="draft">Borrador</option>
                        <option value="pending">Pendiente</option>
                        <option value="sent">Enviada</option>
                        <option value="confirmed">Confirmada</option>
                        <option value="in_transit">En Tránsito</option>
                        <option value="received">Recibida</option>
                        <option value="completed">Completada</option>
                    </select>
                </div>
                <div id="orders-list" class="orders-list">Cargando órdenes...</div>
            </div>
        `;

        UI.showModal(
            title,
            body,
            [
                { text: '← Regresar', class: 'btn-secondary', onclick: () => this.showAdvancedView(supplier.id, 'overview') },
                { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
            ],
            { size: 'lg' }
        );

        await this.loadPurchaseOrders(supplier.id);
    },

    async loadPurchaseOrders(supplierId, filters = {}) {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;

        try {
            const params = { supplier_id: supplierId, ...filters };
            const orders = (typeof API !== 'undefined' && API.getPurchaseOrders)
                ? await API.getPurchaseOrders(params) || []
                : [];
            
            if (orders.length === 0) {
                ordersList.innerHTML = '<div class="empty-state">No hay órdenes de compra</div>';
                return;
            }

            ordersList.innerHTML = orders.map(order => `
                <div class="order-card" data-order-id="${order.id}">
                    <div class="order-header">
                        <div class="order-title">
                            <h4>Orden #${order.order_number}</h4>
                            ${order.reference_number ? `<span class="order-ref">Ref: ${order.reference_number}</span>` : ''}
                        </div>
                        <span class="status-badge status-${order.status}">${this.getOrderStatusLabel(order.status)}</span>
                    </div>
                    <div class="order-details">
                        <div class="order-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${Utils.formatDate(order.order_date)}</span>
                        </div>
                        ${order.expected_delivery_date ? `
                            <div class="order-detail">
                                <i class="fas fa-truck"></i>
                                <span>Entrega esperada: ${Utils.formatDate(order.expected_delivery_date)}</span>
                            </div>
                        ` : ''}
                        <div class="order-detail">
                            <i class="fas fa-dollar-sign"></i>
                            <span>Total: ${Utils.formatCurrency(order.total_amount)}</span>
                        </div>
                        ${order.items_count ? `
                            <div class="order-detail">
                                <i class="fas fa-box"></i>
                                <span>${order.items_count} items</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="order-actions">
                        <button class="btn-secondary btn-sm" onclick="window.SuppliersAdvanced.viewOrder('${order.id}')">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.showOrderForm('${supplierId}', '${order.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error cargando órdenes:', error);
            ordersList.innerHTML = '<div class="error-state">Error al cargar órdenes</div>';
        }
    },

    async filterOrders(supplierId) {
        const statusFilter = document.getElementById('order-status-filter')?.value;
        const filters = statusFilter ? { status: statusFilter } : {};
        await this.loadPurchaseOrders(supplierId, filters);
    },

    async showOrderForm(supplierId, orderId = null) {
        const isEdit = !!orderId;
        let order = null;
        let supplier = null;

        try {
            supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            if (!supplier) {
                Utils.showNotification('Proveedor no encontrado', 'error');
                return;
            }

            if (isEdit) {
                order = await API.getPurchaseOrder(orderId);
                if (!order) {
                    Utils.showNotification('Orden no encontrada', 'error');
                    return;
                }
            }
        } catch (error) {
            console.error('Error obteniendo datos:', error);
            Utils.showNotification('Error al cargar datos', 'error');
            return;
        }

        // Generar número de orden si es nuevo
        const orderNumber = order?.order_number || `PO-${supplier.code}-${Date.now().toString().slice(-6)}`;
        const currentDate = new Date().toISOString().split('T')[0];

        const body = `
            <form id="order-form" class="order-form">
                <div class="form-section">
                    <h4>Información de la Orden</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Número de Orden *</label>
                            <input type="text" id="order-number" class="form-input" value="${orderNumber}" required>
                        </div>
                        <div class="form-group">
                            <label>Número de Referencia (Proveedor)</label>
                            <input type="text" id="order-reference" class="form-input" value="${order?.reference_number || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Orden *</label>
                            <input type="date" id="order-date" class="form-input" value="${order?.order_date || currentDate}" required>
                        </div>
                        <div class="form-group">
                            <label>Fecha de Entrega Esperada</label>
                            <input type="date" id="order-expected-delivery" class="form-input" value="${order?.expected_delivery_date || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Estado</label>
                            <select id="order-status" class="form-select">
                                <option value="draft" ${order?.status === 'draft' ? 'selected' : ''}>Borrador</option>
                                <option value="pending" ${order?.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                                <option value="sent" ${order?.status === 'sent' ? 'selected' : ''}>Enviada</option>
                                <option value="confirmed" ${order?.status === 'confirmed' ? 'selected' : ''}>Confirmada</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Prioridad</label>
                            <select id="order-priority" class="form-select">
                                <option value="low" ${order?.priority === 'low' ? 'selected' : ''}>Baja</option>
                                <option value="normal" ${order?.priority === 'normal' ? 'selected' : ''} selected>Normal</option>
                                <option value="high" ${order?.priority === 'high' ? 'selected' : ''}>Alta</option>
                                <option value="urgent" ${order?.priority === 'urgent' ? 'selected' : ''}>Urgente</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                        <h4>Items de la Orden</h4>
                        <button type="button" class="btn-secondary btn-sm" onclick="window.SuppliersAdvanced.addOrderItem()">
                            <i class="fas fa-plus"></i> Agregar Item
                        </button>
                    </div>
                    <div id="order-items-list" class="order-items-list">
                        ${order?.items ? order.items.map(item => this.renderOrderItem(item)).join('') : '<div class="empty-state-small">No hay items. Haz clic en "Agregar Item"</div>'}
                    </div>
                </div>

                <div class="form-section">
                    <h4>Totales</h4>
                    <div class="totals-grid">
                        <div class="total-row">
                            <label>Subtotal:</label>
                            <span id="order-subtotal">$0.00</span>
                        </div>
                        <div class="total-row">
                            <label>Impuestos:</label>
                            <input type="number" id="order-tax" class="form-input form-input-sm" step="0.01" value="${order?.tax_amount || 0}" onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                        </div>
                        <div class="total-row">
                            <label>Descuento:</label>
                            <input type="number" id="order-discount" class="form-input form-input-sm" step="0.01" value="${order?.discount_amount || 0}" onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                        </div>
                        <div class="total-row">
                            <label>Envío:</label>
                            <input type="number" id="order-shipping" class="form-input form-input-sm" step="0.01" value="${order?.shipping_cost || 0}" onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                        </div>
                        <div class="total-row total-final">
                            <label><strong>Total:</strong></label>
                            <span id="order-total"><strong>$0.00</strong></span>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Información Adicional</h4>
                    <div class="form-group">
                        <label>Tracking Number</label>
                        <input type="text" id="order-tracking" class="form-input" value="${order?.tracking_number || ''}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Transportista</label>
                            <input type="text" id="order-carrier" class="form-input" value="${order?.carrier || ''}">
                        </div>
                        <div class="form-group">
                            <label>Método de Envío</label>
                            <input type="text" id="order-shipping-method" class="form-input" value="${order?.shipping_method || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notas (Visibles para proveedor)</label>
                        <textarea id="order-notes" class="form-input" rows="2">${order?.notes || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Notas Internas (No visibles para proveedor)</label>
                        <textarea id="order-internal-notes" class="form-input" rows="2">${order?.internal_notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;

        const orderModalTitle = isEdit ? `Editar Orden: ${orderNumber}` : `Nueva Orden: ${supplier.name}`;
        UI.showModal(
            orderModalTitle,
            body,
            [
                { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                { 
                    text: isEdit ? 'Actualizar Orden' : 'Crear Orden', 
                    class: 'btn-primary', 
                    onclick: () => this.saveOrder(supplierId, orderId) 
                }
            ],
            { size: 'lg' }
        );

        // Guardar supplierId y orderId para uso en funciones
        window.currentOrderSupplierId = supplierId;
        window.currentOrderId = orderId;

        // Calcular totales iniciales
        this.calculateOrderTotals();
    },

    renderOrderItem(item = null) {
        const itemId = item?.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return `
            <div class="order-item-row" data-item-id="${itemId}">
                <div class="order-item-fields">
                    <div class="form-group form-group-sm">
                        <label>SKU</label>
                        <input type="text" class="form-input form-input-sm order-item-sku" value="${item?.sku || ''}" placeholder="SKU">
                    </div>
                    <div class="form-group form-group-sm" style="flex: 2;">
                        <label>Nombre del Item *</label>
                        <input type="text" class="form-input form-input-sm order-item-name" value="${item?.name || ''}" placeholder="Nombre del item" required>
                    </div>
                    <div class="form-group form-group-sm">
                        <label>Cantidad *</label>
                        <input type="number" class="form-input form-input-sm order-item-quantity" value="${item?.quantity_ordered || 1}" min="1" step="1" required onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                    </div>
                    <div class="form-group form-group-sm">
                        <label>Precio Unit. *</label>
                        <input type="number" class="form-input form-input-sm order-item-price" value="${item?.unit_price || 0}" step="0.01" min="0" required onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                    </div>
                    <div class="form-group form-group-sm">
                        <label>Descuento</label>
                        <input type="number" class="form-input form-input-sm order-item-discount" value="${item?.discount_amount || 0}" step="0.01" min="0" onchange="window.SuppliersAdvanced.calculateOrderTotals()">
                    </div>
                    <div class="form-group form-group-sm">
                        <label>Total</label>
                        <input type="text" class="form-input form-input-sm order-item-total" value="${item ? Utils.formatCurrency((item.quantity_ordered * item.unit_price) - (item.discount_amount || 0)) : '$0.00'}" readonly>
                    </div>
                    <div class="form-group form-group-sm" style="width: 40px;">
                        <label>&nbsp;</label>
                        <button type="button" class="btn-icon btn-danger" onclick="window.SuppliersAdvanced.removeOrderItem('${itemId}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group form-group-sm" style="margin-top: var(--spacing-xs);">
                    <label>Descripción</label>
                    <input type="text" class="form-input form-input-sm order-item-description" value="${item?.description || ''}" placeholder="Descripción opcional">
                </div>
            </div>
        `;
    },

    addOrderItem() {
        const itemsList = document.getElementById('order-items-list');
        if (!itemsList) return;

        if (itemsList.querySelector('.empty-state-small')) {
            itemsList.innerHTML = '';
        }

        const newItem = this.renderOrderItem();
        itemsList.insertAdjacentHTML('beforeend', newItem);
        this.calculateOrderTotals();
    },

    removeOrderItem(itemId) {
        const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
        if (itemRow) {
            itemRow.remove();
            this.calculateOrderTotals();
        }
    },

    calculateOrderTotals() {
        const items = document.querySelectorAll('.order-item-row');
        let subtotal = 0;

        items.forEach(itemRow => {
            const quantity = parseFloat(itemRow.querySelector('.order-item-quantity')?.value || 0);
            const price = parseFloat(itemRow.querySelector('.order-item-price')?.value || 0);
            const discount = parseFloat(itemRow.querySelector('.order-item-discount')?.value || 0);
            const lineTotal = (quantity * price) - discount;
            subtotal += lineTotal;

            // Actualizar total de línea
            const totalInput = itemRow.querySelector('.order-item-total');
            if (totalInput) {
                totalInput.value = Utils.formatCurrency(lineTotal);
            }
        });

        const tax = parseFloat(document.getElementById('order-tax')?.value || 0);
        const discount = parseFloat(document.getElementById('order-discount')?.value || 0);
        const shipping = parseFloat(document.getElementById('order-shipping')?.value || 0);
        const total = subtotal + tax - discount + shipping;

        // Actualizar totales
        const subtotalEl = document.getElementById('order-subtotal');
        const totalEl = document.getElementById('order-total');
        if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
        if (totalEl) totalEl.innerHTML = `<strong>${Utils.formatCurrency(total)}</strong>`;
    },

    async saveOrder(supplierId, orderId) {
        try {
            const form = document.getElementById('order-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            // Validar que haya al menos un item
            const items = document.querySelectorAll('.order-item-row');
            if (items.length === 0) {
                Utils.showNotification('Debes agregar al menos un item a la orden', 'error');
                return;
            }

            // Recopilar items
            const orderItems = [];
            items.forEach(itemRow => {
                const name = itemRow.querySelector('.order-item-name')?.value.trim();
                const quantity = parseInt(itemRow.querySelector('.order-item-quantity')?.value || 0);
                const price = parseFloat(itemRow.querySelector('.order-item-price')?.value || 0);

                if (!name || quantity <= 0 || price <= 0) {
                    return; // Saltar items inválidos
                }

                orderItems.push({
                    sku: itemRow.querySelector('.order-item-sku')?.value.trim() || null,
                    name: name,
                    description: itemRow.querySelector('.order-item-description')?.value.trim() || null,
                    quantity_ordered: quantity,
                    unit_price: price,
                    discount_amount: parseFloat(itemRow.querySelector('.order-item-discount')?.value || 0),
                    status: 'pending'
                });
            });

            if (orderItems.length === 0) {
                Utils.showNotification('Debes agregar al menos un item válido', 'error');
                return;
            }

            // Calcular totales
            const subtotal = orderItems.reduce((sum, item) => {
                return sum + (item.quantity_ordered * item.unit_price) - (item.discount_amount || 0);
            }, 0);

            const taxAmount = parseFloat(document.getElementById('order-tax')?.value || 0);
            const discountAmount = parseFloat(document.getElementById('order-discount')?.value || 0);
            const shippingCost = parseFloat(document.getElementById('order-shipping')?.value || 0);
            const totalAmount = subtotal + taxAmount - discountAmount + shippingCost;

            const orderData = {
                supplier_id: supplierId,
                order_number: document.getElementById('order-number').value.trim(),
                reference_number: document.getElementById('order-reference').value.trim() || null,
                order_date: document.getElementById('order-date').value,
                expected_delivery_date: document.getElementById('order-expected-delivery').value || null,
                status: document.getElementById('order-status').value,
                priority: document.getElementById('order-priority').value,
                subtotal: subtotal,
                tax_amount: taxAmount,
                discount_amount: discountAmount,
                shipping_cost: shippingCost,
                total_amount: totalAmount,
                currency: 'MXN',
                tracking_number: document.getElementById('order-tracking').value.trim() || null,
                carrier: document.getElementById('order-carrier').value.trim() || null,
                shipping_method: document.getElementById('order-shipping-method').value.trim() || null,
                notes: document.getElementById('order-notes').value.trim() || null,
                internal_notes: document.getElementById('order-internal-notes').value.trim() || null,
                items: orderItems
            };

            let savedOrder;
            if (orderId) {
                savedOrder = await API.updatePurchaseOrder(orderId, orderData);
                Utils.showNotification('Orden actualizada', 'success');
            } else {
                savedOrder = await API.createPurchaseOrder(orderData);
                Utils.showNotification('Orden creada', 'success');
                
                // Registrar precios en historial
                await this.recordPriceHistory(supplierId, orderItems);
            }

            UI.closeModal();
            
            // Recargar lista de órdenes si está abierta
            const ordersList = document.getElementById('orders-list');
            if (ordersList) {
                await this.loadPurchaseOrders(supplierId);
            }
        } catch (error) {
            console.error('Error guardando orden:', error);
            Utils.showNotification(error.message || 'Error al guardar orden', 'error');
        }
    },

    async recordPriceHistory(supplierId, items) {
        try {
            for (const item of items) {
                await API.createPriceHistory({
                    supplier_id: supplierId,
                    sku: item.sku,
                    item_name: item.name,
                    unit_price: item.unit_price,
                    quantity: item.quantity_ordered,
                    total_amount: item.quantity_ordered * item.unit_price,
                    currency: 'MXN',
                    price_date: new Date().toISOString().split('T')[0]
                });
            }
        } catch (error) {
            console.warn('Error registrando historial de precios:', error);
            // No bloquear si falla el registro de precios
        }
    },

    async viewOrder(orderId) {
        try {
            const order = await API.getPurchaseOrder(orderId);
            if (!order) {
                Utils.showNotification('Orden no encontrada', 'error');
                return;
            }

            const body = `
                <div class="order-detail-view">
                    <div class="order-info">
                        <h4>Orden #${order.order_number}</h4>
                        <div class="info-grid">
                            <div><strong>Estado:</strong> ${this.getOrderStatusLabel(order.status)}</div>
                            <div><strong>Fecha:</strong> ${Utils.formatDate(order.order_date)}</div>
                            <div><strong>Total:</strong> ${Utils.formatCurrency(order.total_amount)}</div>
                        </div>
                    </div>
                    <div class="order-items">
                        <h5>Items</h5>
                        <table class="order-items-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Cantidad</th>
                                    <th>Precio Unit.</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(order.items || []).map(item => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${item.quantity_ordered}</td>
                                        <td>${Utils.formatCurrency(item.unit_price)}</td>
                                        <td>${Utils.formatCurrency(item.line_total)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            UI.showModal(
                `Orden #${order.order_number}`,
                body,
                [
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error obteniendo orden:', error);
            Utils.showNotification('Error al obtener orden', 'error');
        }
    },

    getOrderStatusLabel(status) {
        const labels = {
            'draft': 'Borrador',
            'pending': 'Pendiente',
            'sent': 'Enviada',
            'confirmed': 'Confirmada',
            'in_transit': 'En Tránsito',
            'received': 'Recibida',
            'partial': 'Parcial',
            'completed': 'Completada',
            'cancelled': 'Cancelada'
        };
        return labels[status] || status;
    },

    // ========== GESTIÓN DE PAGOS ==========

    async showPayments(supplier) {
        const title = `Cuentas por Pagar: ${supplier.name}`;
        
        const body = `
            <div class="supplier-payments-view">
                <div class="view-header">
                    <h3>Cuentas por Pagar</h3>
                    <button class="btn-primary" onclick="window.SuppliersAdvanced.showPaymentForm('${supplier.id}')">
                        <i class="fas fa-plus"></i> Nueva Factura/Pago
                    </button>
                </div>
                <div class="filters-bar">
                    <select id="payment-status-filter" class="form-select" onchange="window.SuppliersAdvanced.filterPayments('${supplier.id}')">
                        <option value="">Todos los estados</option>
                        <option value="pending">Pendiente</option>
                        <option value="partial">Parcial</option>
                        <option value="paid">Pagado</option>
                        <option value="overdue">Vencido</option>
                    </select>
                    <label>
                        <input type="checkbox" id="overdue-only" onchange="window.SuppliersAdvanced.filterPayments('${supplier.id}')">
                        Solo vencidos
                    </label>
                </div>
                <div id="payments-list" class="payments-list">Cargando pagos...</div>
            </div>
        `;

        UI.showModal(
            title,
            body,
            [
                { text: '← Regresar', class: 'btn-secondary', onclick: () => this.showAdvancedView(supplier.id, 'overview') },
                { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
            ],
            { size: 'lg' }
        );

        await this.loadPayments(supplier.id);
    },

    async loadPayments(supplierId, filters = {}) {
        const paymentsList = document.getElementById('payments-list');
        if (!paymentsList) return;

        try {
            // ========== SINCRONIZACIÓN BIDIRECCIONAL DE RECIBOS ==========
            // Sincronizar recibos desde el servidor
            await this.syncReceiptsFromServer(supplierId);

            const params = { supplier_id: supplierId, ...filters };
            if (document.getElementById('overdue-only')?.checked) {
                params.overdue_only = 'true';
            }
            const payments = (typeof API !== 'undefined' && API.getSupplierPayments)
                ? await API.getSupplierPayments(params) || []
                : [];
            
            // Guardar pagos localmente para sincronización
            if (payments.length > 0 && typeof DB !== 'undefined') {
                for (const payment of payments) {
                    try {
                        await DB.put('supplier_payments', {
                            ...payment,
                            server_id: payment.id,
                            sync_status: 'synced'
                        });
                    } catch (e) {
                        console.warn('Error guardando pago localmente:', e);
                    }
                }
            }
            
            if (payments.length === 0) {
                paymentsList.innerHTML = '<div class="empty-state">No hay pagos registrados</div>';
                return;
            }

            paymentsList.innerHTML = payments.map(payment => {
                const pendingAmount = parseFloat(payment.total_amount) - parseFloat(payment.paid_amount || 0);
                const isOverdue = new Date(payment.due_date) < new Date() && payment.status !== 'paid';
                
                return `
                    <div class="payment-card ${isOverdue ? 'overdue' : ''}" data-payment-id="${payment.id}">
                        <div class="payment-header">
                            <div class="payment-title">
                                <h4>${payment.reference_number}</h4>
                                <span class="payment-type">${this.getPaymentTypeLabel(payment.payment_type)}</span>
                            </div>
                            <span class="status-badge status-${payment.status}">${this.getPaymentStatusLabel(payment.status)}</span>
                        </div>
                        <div class="payment-details">
                            <div class="payment-detail">
                                <i class="fas fa-calendar"></i>
                                <span>Vence: ${Utils.formatDate(payment.due_date)}</span>
                                ${isOverdue ? '<span class="overdue-badge">VENCIDO</span>' : ''}
                            </div>
                            <div class="payment-detail">
                                <i class="fas fa-dollar-sign"></i>
                                <span>Total: ${Utils.formatCurrency(payment.total_amount)}</span>
                            </div>
                            <div class="payment-detail">
                                <i class="fas fa-check-circle"></i>
                                <span>Pagado: ${Utils.formatCurrency(payment.paid_amount || 0)}</span>
                            </div>
                            <div class="payment-detail">
                                <i class="fas fa-exclamation-circle"></i>
                                <span><strong>Pendiente: ${Utils.formatCurrency(pendingAmount)}</strong></span>
                            </div>
                        </div>
                        <div class="payment-actions">
                            ${payment.status !== 'paid' ? `
                            <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.recordPayment('${payment.id}')">
                                <i class="fas fa-money-bill"></i> Registrar Pago
                            </button>
                            ` : `
                            <button class="btn-secondary btn-sm" onclick="window.SuppliersAdvanced.printExistingReceipt('${payment.id}')">
                                <i class="fas fa-print"></i> Imprimir Recibo
                            </button>
                            `}
                            <button class="btn-secondary btn-sm" onclick="window.SuppliersAdvanced.viewPayment('${payment.id}')">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error cargando pagos:', error);
            paymentsList.innerHTML = '<div class="error-state">Error al cargar pagos</div>';
        }
    },

    async filterPayments(supplierId) {
        const statusFilter = document.getElementById('payment-status-filter')?.value;
        const filters = statusFilter ? { status: statusFilter } : {};
        await this.loadPayments(supplierId, filters);
    },

    async showPaymentForm(supplierId, paymentId = null) {
        const isEdit = !!paymentId;
        let payment = null;
        let supplier = null;

        try {
            supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            if (!supplier) {
                Utils.showNotification('Proveedor no encontrado', 'error');
                return;
            }

            if (isEdit) {
                payment = await API.getSupplierPayment(paymentId);
                if (!payment) {
                    Utils.showNotification('Pago no encontrado', 'error');
                    return;
                }
            }
        } catch (error) {
            console.error('Error obteniendo datos:', error);
            Utils.showNotification('Error al cargar datos', 'error');
            return;
        }

        // Obtener órdenes de compra del proveedor para asociar
        const orders = await API.getPurchaseOrders({ supplier_id: supplierId }) || [];

        // Generar número de referencia si es nuevo
        const referenceNumber = payment?.reference_number || `INV-${supplier.code}-${Date.now().toString().slice(-6)}`;
        const currentDate = new Date().toISOString().split('T')[0];

        const body = `
            <form id="payment-form" class="payment-form">
                <div class="form-section">
                    <h4>Información del Pago/Factura</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo *</label>
                            <select id="payment-type" class="form-select" required>
                                <option value="invoice" ${payment?.payment_type === 'invoice' ? 'selected' : ''}>Factura</option>
                                <option value="payment" ${payment?.payment_type === 'payment' ? 'selected' : ''}>Pago</option>
                                <option value="credit_note" ${payment?.payment_type === 'credit_note' ? 'selected' : ''}>Nota de Crédito</option>
                                <option value="debit_note" ${payment?.payment_type === 'debit_note' ? 'selected' : ''}>Nota de Débito</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Número de Referencia *</label>
                            <input type="text" id="payment-reference" class="form-input" value="${referenceNumber}" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Orden de Compra (Opcional)</label>
                            <select id="payment-po-id" class="form-select">
                                <option value="">Sin orden de compra</option>
                                ${orders.map(o => `<option value="${o.id}" ${payment?.purchase_order_id === o.id ? 'selected' : ''}>${o.order_number} - ${Utils.formatCurrency(o.total_amount)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Moneda</label>
                            <select id="payment-currency" class="form-select">
                                <option value="MXN" ${payment?.currency === 'MXN' ? 'selected' : ''} selected>MXN</option>
                                <option value="USD" ${payment?.currency === 'USD' ? 'selected' : ''}>USD</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Montos</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Monto Base *</label>
                            <input type="number" id="payment-amount" class="form-input" step="0.01" value="${payment?.amount || payment?.total_amount || ''}" required onchange="window.SuppliersAdvanced.calculatePaymentTotals()">
                        </div>
                        <div class="form-group">
                            <label>Impuestos</label>
                            <input type="number" id="payment-tax" class="form-input" step="0.01" value="${payment?.tax_amount || 0}" onchange="window.SuppliersAdvanced.calculatePaymentTotals()">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Descuento</label>
                            <input type="number" id="payment-discount" class="form-input" step="0.01" value="${payment?.discount_amount || 0}" onchange="window.SuppliersAdvanced.calculatePaymentTotals()">
                        </div>
                        <div class="form-group">
                            <label>Total *</label>
                            <input type="number" id="payment-total" class="form-input" step="0.01" value="${payment?.total_amount || ''}" required readonly>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Fechas</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha de Emisión *</label>
                            <input type="date" id="payment-issue-date" class="form-input" value="${payment?.issue_date || currentDate}" required>
                        </div>
                        <div class="form-group">
                            <label>Fecha de Vencimiento *</label>
                            <input type="date" id="payment-due-date" class="form-input" value="${payment?.due_date || currentDate}" required>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Estado y Notas</h4>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="payment-status" class="form-select">
                            <option value="pending" ${payment?.status === 'pending' ? 'selected' : ''} selected>Pendiente</option>
                            <option value="partial" ${payment?.status === 'partial' ? 'selected' : ''}>Parcial</option>
                            <option value="paid" ${payment?.status === 'paid' ? 'selected' : ''}>Pagado</option>
                            <option value="overdue" ${payment?.status === 'overdue' ? 'selected' : ''}>Vencido</option>
                            <option value="cancelled" ${payment?.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Notas</label>
                        <textarea id="payment-notes" class="form-input" rows="3">${payment?.notes || ''}</textarea>
                    </div>
                </div>
            </form>
        `;

        const paymentTitle = isEdit ? `Editar Pago: ${referenceNumber}` : `Nuevo Pago/Factura: ${supplier.name}`;
        UI.showModal(
            paymentTitle,
            body,
            [
                { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                { 
                    text: isEdit ? 'Actualizar' : 'Crear', 
                    class: 'btn-primary', 
                    onclick: () => this.savePayment(supplierId, paymentId) 
                }
            ],
            { size: 'lg' }
        );

        // Calcular totales iniciales
        this.calculatePaymentTotals();
    },

    calculatePaymentTotals() {
        const amount = parseFloat(document.getElementById('payment-amount')?.value || 0);
        const tax = parseFloat(document.getElementById('payment-tax')?.value || 0);
        const discount = parseFloat(document.getElementById('payment-discount')?.value || 0);
        const total = amount + tax - discount;

        const totalInput = document.getElementById('payment-total');
        if (totalInput) {
            totalInput.value = total.toFixed(2);
        }
    },

    async savePayment(supplierId, paymentId) {
        try {
            const form = document.getElementById('payment-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const paymentData = {
                supplier_id: supplierId,
                purchase_order_id: document.getElementById('payment-po-id')?.value || null,
                payment_type: document.getElementById('payment-type').value,
                reference_number: document.getElementById('payment-reference').value.trim(),
                amount: parseFloat(document.getElementById('payment-amount').value),
                tax_amount: parseFloat(document.getElementById('payment-tax').value || 0),
                discount_amount: parseFloat(document.getElementById('payment-discount').value || 0),
                total_amount: parseFloat(document.getElementById('payment-total').value),
                currency: document.getElementById('payment-currency').value,
                issue_date: document.getElementById('payment-issue-date').value,
                due_date: document.getElementById('payment-due-date').value,
                status: document.getElementById('payment-status').value,
                notes: document.getElementById('payment-notes').value.trim() || null
            };

            let savedPayment;
            if (paymentId) {
                savedPayment = await API.updateSupplierPayment(paymentId, paymentData);
                Utils.showNotification('Pago actualizado', 'success');
            } else {
                savedPayment = await API.createSupplierPayment(paymentData);
                Utils.showNotification('Pago creado', 'success');
            }

            UI.closeModal();
            
            // Recargar lista de pagos si está abierta
            const paymentsList = document.getElementById('payments-list');
            if (paymentsList) {
                await this.loadPayments(supplierId);
            }
        } catch (error) {
            console.error('Error guardando pago:', error);
            Utils.showNotification(error.message || 'Error al guardar pago', 'error');
        }
    },

    async recordPayment(paymentId) {
        try {
            // Obtener información del pago
            const payment = (typeof API !== 'undefined' && API.getSupplierPayment)
                ? await API.getSupplierPayment(paymentId)
                : null;
            
            if (!payment) {
                Utils.showNotification('Pago no encontrado', 'error');
                return;
            }

            const supplier = await DB.get('suppliers', payment.supplier_id);
            const pendingAmount = parseFloat(payment.total_amount) - parseFloat(payment.paid_amount || 0);
            const currentDate = new Date().toISOString().split('T')[0];

            // Generar número de folio para el recibo
            const receiptNumber = `REC-${payment.supplier_id?.substring(0, 8).toUpperCase() || 'PROV'}-${Date.now().toString().slice(-6)}`;

            const body = `
                <form id="record-payment-form" class="payment-form">
                    <div class="form-section">
                        <h4>Información del Pago</h4>
                        <div class="form-group">
                            <label>Proveedor</label>
                            <input type="text" class="form-input" value="${supplier?.name || 'N/A'}" readonly>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Factura/Referencia</label>
                                <input type="text" class="form-input" value="${payment.reference_number || ''}" readonly>
                            </div>
                            <div class="form-group">
                                <label>Monto Pendiente</label>
                                <input type="text" class="form-input" value="${Utils.formatCurrency(pendingAmount)}" readonly>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Registro de Pago</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Monto del Pago *</label>
                                <input type="number" id="record-payment-amount" class="form-input" 
                                       step="0.01" min="0.01" max="${pendingAmount}" 
                                       value="${pendingAmount}" required>
                                <small style="color: var(--color-text-secondary);">Máximo: ${Utils.formatCurrency(pendingAmount)}</small>
                            </div>
                            <div class="form-group">
                                <label>Fecha de Pago *</label>
                                <input type="date" id="record-payment-date" class="form-input" 
                                       value="${currentDate}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Método de Pago *</label>
                                <select id="record-payment-method" class="form-select" required>
                                    <option value="cash">Efectivo</option>
                                    <option value="transfer" selected>Transferencia</option>
                                    <option value="check">Cheque</option>
                                    <option value="credit_card">Tarjeta de Crédito</option>
                                    <option value="debit_card">Tarjeta de Débito</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Referencia de Pago</label>
                                <input type="text" id="record-payment-reference" class="form-input" 
                                       placeholder="Número de transferencia, cheque, etc.">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Notas</label>
                            <textarea id="record-payment-notes" class="form-input" rows="2" 
                                      placeholder="Notas adicionales sobre el pago..."></textarea>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Recibo de Pago</h4>
                        <div class="form-group">
                            <label>Número de Folio del Recibo</label>
                            <input type="text" id="record-payment-receipt-number" class="form-input" 
                                   value="${receiptNumber}" readonly>
                            <small style="color: var(--color-text-secondary);">Este folio se usará para el recibo impreso</small>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="record-payment-print-receipt" checked>
                                Generar e imprimir recibo automáticamente
                            </label>
                        </div>
                    </div>
                </form>
            `;

            UI.showModal(
                'Registrar Pago',
                body,
                [
                    { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                    { 
                        text: 'Registrar Pago y Generar Recibo', 
                        class: 'btn-primary', 
                        onclick: () => this.saveRecordedPayment(paymentId, receiptNumber) 
                    }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error obteniendo información del pago:', error);
            Utils.showNotification('Error al cargar información del pago', 'error');
        }
    },

    async saveRecordedPayment(paymentId, receiptNumber) {
        try {
            const form = document.getElementById('record-payment-form');
            if (!form || !form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const paymentAmount = parseFloat(document.getElementById('record-payment-amount').value);
            const paymentDate = document.getElementById('record-payment-date').value;
            const paymentMethod = document.getElementById('record-payment-method').value;
            const paymentReference = document.getElementById('record-payment-reference').value.trim() || null;
            const notes = document.getElementById('record-payment-notes').value.trim() || null;
            const printReceipt = document.getElementById('record-payment-print-receipt').checked;

            // Obtener información del pago para guardar localmente
            const payment = (typeof API !== 'undefined' && API.getSupplierPayment)
                ? await API.getSupplierPayment(paymentId)
                : null;

            // Registrar el pago en el servidor
            let savedReceipt = null;
            if (typeof API !== 'undefined' && API.recordSupplierPayment) {
                const currentBranchId = typeof BranchManager !== 'undefined' 
                    ? BranchManager.getCurrentBranchId() 
                    : null;

                savedReceipt = await API.recordSupplierPayment(paymentId, {
                    payment_amount: paymentAmount,
                    payment_date: paymentDate,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference,
                    notes: notes,
                    receipt_number: receiptNumber
                });

                // Guardar recibo localmente en IndexedDB
                if (savedReceipt && typeof DB !== 'undefined') {
                    const receiptData = {
                        id: savedReceipt.id || Utils.generateId(),
                        supplier_payment_id: paymentId,
                        payment_date: paymentDate,
                        payment_amount: paymentAmount,
                        payment_method: paymentMethod,
                        payment_reference: paymentReference,
                        receipt_number: receiptNumber,
                        notes: notes,
                        branch_id: currentBranchId || payment?.branch_id,
                        created_by: typeof UserManager !== 'undefined' ? UserManager.currentUser?.id : null,
                        created_at: new Date().toISOString(),
                        server_id: savedReceipt.id,
                        sync_status: 'synced'
                    };

                    try {
                        await DB.put('payment_invoices', receiptData);
                        console.log('✅ Recibo guardado localmente:', receiptNumber);
                    } catch (dbError) {
                        console.warn('⚠️ Error guardando recibo localmente:', dbError);
                    }
                }
            }

            Utils.showNotification('Pago registrado correctamente', 'success');
            UI.closeModal();

            // Recargar lista de pagos
            const supplierId = this.currentSupplierId;
            if (supplierId) await this.loadPayments(supplierId);

            // Generar e imprimir recibo si está marcado
            if (printReceipt) {
                await this.generateAndPrintReceipt(paymentId, receiptNumber, paymentAmount, paymentDate, paymentMethod);
            }
        } catch (error) {
            console.error('Error registrando pago:', error);
            Utils.showNotification(error.message || 'Error al registrar pago', 'error');
        }
    },

    async generateAndPrintReceipt(paymentId, receiptNumber, amount, date, method) {
        try {
            // Obtener información completa del pago y proveedor
            const payment = (typeof API !== 'undefined' && API.getSupplierPayment)
                ? await API.getSupplierPayment(paymentId)
                : null;
            
            if (!payment) {
                Utils.showNotification('No se pudo obtener información del pago para el recibo', 'error');
                return;
            }

            const supplier = await DB.get('suppliers', payment.supplier_id);
            const currentBranch = typeof BranchManager !== 'undefined' 
                ? await DB.get('catalog_branches', BranchManager.getCurrentBranchId())
                : null;

            // Generar HTML del recibo
            const receiptHTML = this.generateReceiptHTML({
                receiptNumber,
                payment,
                supplier,
                amount,
                date,
                method,
                branch: currentBranch
            });

            // Abrir ventana de impresión
            const printWindow = window.open('', '_blank');
            printWindow.document.write(receiptHTML);
            printWindow.document.close();
            
            // Esperar a que se cargue el contenido antes de imprimir
            printWindow.onload = () => {
                setTimeout(() => {
                    printWindow.print();
                }, 250);
            };
        } catch (error) {
            console.error('Error generando recibo:', error);
            Utils.showNotification('Error al generar recibo', 'error');
        }
    },

    async printExistingReceipt(paymentId) {
        try {
            const payment = (typeof API !== 'undefined' && API.getSupplierPayment)
                ? await API.getSupplierPayment(paymentId)
                : null;
            
            if (!payment) {
                Utils.showNotification('Pago no encontrado', 'error');
                return;
            }

            // Buscar el último recibo del historial de pagos
            const lastReceipt = payment.payment_history && payment.payment_history.length > 0
                ? payment.payment_history[0] // El más reciente
                : null;

            if (!lastReceipt || !lastReceipt.receipt_number) {
                Utils.showNotification('No se encontró un recibo para este pago', 'error');
                return;
            }

            await this.printReceiptByNumber(lastReceipt.receipt_number, paymentId);
        } catch (error) {
            console.error('Error imprimiendo recibo:', error);
            Utils.showNotification('Error al imprimir recibo', 'error');
        }
    },

    async printReceiptByNumber(receiptNumber, paymentId) {
        try {
            // Buscar recibo en el servidor o localmente
            let receipt = null;
            
            // Intentar obtener del servidor
            if (typeof API !== 'undefined' && API.getPaymentReceipts) {
                const receipts = await API.getPaymentReceipts({
                    payment_id: paymentId
                }) || [];
                receipt = receipts.find(r => r.receipt_number === receiptNumber);
            }

            // Si no se encuentra en el servidor, buscar localmente
            if (!receipt && typeof DB !== 'undefined') {
                const allReceipts = await DB.getAll('payment_invoices') || [];
                receipt = allReceipts.find(r => r.receipt_number === receiptNumber);
            }

            if (!receipt) {
                Utils.showNotification('Recibo no encontrado', 'error');
                return;
            }

            // Obtener información del pago y proveedor
            const payment = (typeof API !== 'undefined' && API.getSupplierPayment)
                ? await API.getSupplierPayment(paymentId || receipt.supplier_payment_id)
                : null;

            if (!payment) {
                Utils.showNotification('Pago no encontrado', 'error');
                return;
            }

            const supplier = await DB.get('suppliers', payment.supplier_id);
            const currentBranch = typeof BranchManager !== 'undefined' 
                ? await DB.get('catalog_branches', BranchManager.getCurrentBranchId())
                : null;

            await this.generateAndPrintReceipt(
                paymentId || receipt.supplier_payment_id,
                receipt.receipt_number,
                receipt.payment_amount,
                receipt.payment_date,
                receipt.payment_method || 'transfer'
            );
        } catch (error) {
            console.error('Error imprimiendo recibo por número:', error);
            Utils.showNotification('Error al imprimir recibo', 'error');
        }
    },

    generateReceiptHTML({ receiptNumber, payment, supplier, amount, date, method, branch }) {
        const methodLabels = {
            'cash': 'Efectivo',
            'transfer': 'Transferencia',
            'check': 'Cheque',
            'credit_card': 'Tarjeta de Crédito',
            'debit_card': 'Tarjeta de Débito'
        };

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Recibo de Pago - ${receiptNumber}</title>
    <style>
        @media print {
            @page { margin: 10mm; size: A4; }
            body { margin: 0; }
        }
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #000;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: bold;
        }
        .header h2 {
            margin: 5px 0;
            font-size: 18px;
            color: #333;
        }
        .info-section {
            margin-bottom: 20px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #ddd;
        }
        .info-label {
            font-weight: bold;
            width: 40%;
        }
        .info-value {
            width: 60%;
            text-align: right;
        }
        .amount-section {
            background: #f5f5f5;
            padding: 20px;
            margin: 20px 0;
            border: 2px solid #000;
        }
        .amount-total {
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin-top: 10px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        .signature-section {
            margin-top: 60px;
            display: flex;
            justify-content: space-around;
        }
        .signature-box {
            width: 300px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000;
            margin-top: 50px;
            padding-top: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>OPAL & CO</h1>
        <h2>RECIBO DE PAGO A PROVEEDOR</h2>
        <p>Folio: <strong>${receiptNumber}</strong></p>
    </div>

    <div class="info-section">
        <div class="info-row">
            <span class="info-label">Fecha de Pago:</span>
            <span class="info-value">${Utils.formatDate(date)}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Proveedor:</span>
            <span class="info-value">${supplier?.name || 'N/A'}</span>
        </div>
        ${supplier?.code ? `
        <div class="info-row">
            <span class="info-label">Código de Proveedor:</span>
            <span class="info-value">${supplier.code}</span>
        </div>
        ` : ''}
        <div class="info-row">
            <span class="info-label">Factura/Referencia:</span>
            <span class="info-value">${payment.reference_number || 'N/A'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Método de Pago:</span>
            <span class="info-value">${methodLabels[method] || method}</span>
        </div>
        ${branch ? `
        <div class="info-row">
            <span class="info-label">Sucursal:</span>
            <span class="info-value">${branch.name || 'N/A'}</span>
        </div>
        ` : ''}
    </div>

    <div class="amount-section">
        <div style="text-align: center; font-size: 16px; margin-bottom: 10px;">
            MONTO DEL PAGO
        </div>
        <div class="amount-total">
            ${Utils.formatCurrency(amount)}
        </div>
    </div>

    <div class="footer">
        <p>Este documento es un comprobante de pago emitido por Opal & Co</p>
        <p>Fecha de emisión: ${Utils.formatDate(new Date().toISOString())}</p>
    </div>

    <div class="signature-section">
        <div class="signature-box">
            <div class="signature-line">
                <strong>Recibido por:</strong><br>
                ${supplier?.name || 'Proveedor'}
            </div>
        </div>
        <div class="signature-box">
            <div class="signature-line">
                <strong>Autorizado por:</strong><br>
                Opal & Co
            </div>
        </div>
    </div>
</body>
</html>
        `;
    },

    async viewPayment(paymentId) {
        try {
            const payment = await API.getSupplierPayment(paymentId);
            if (!payment) {
                Utils.showNotification('Pago no encontrado', 'error');
                return;
            }

            const body = `
                <div class="payment-detail-view">
                    <div class="payment-info">
                        <h4>${payment.reference_number}</h4>
                        <div class="info-grid">
                            <div><strong>Tipo:</strong> ${this.getPaymentTypeLabel(payment.payment_type)}</div>
                            <div><strong>Estado:</strong> ${this.getPaymentStatusLabel(payment.status)}</div>
                            <div><strong>Total:</strong> ${Utils.formatCurrency(payment.total_amount)}</div>
                            <div><strong>Pagado:</strong> ${Utils.formatCurrency(payment.paid_amount || 0)}</div>
                            <div><strong>Pendiente:</strong> ${Utils.formatCurrency(payment.pending_amount || 0)}</div>
                            <div><strong>Vence:</strong> ${Utils.formatDate(payment.due_date)}</div>
                        </div>
                    </div>
                    ${payment.payment_history && payment.payment_history.length > 0 ? `
                        <div class="payment-history">
                            <h5>Historial de Pagos y Recibos</h5>
                            <table class="payment-history-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Folio Recibo</th>
                                        <th>Monto</th>
                                        <th>Método</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${payment.payment_history.map(p => `
                                        <tr>
                                            <td>${Utils.formatDate(p.payment_date)}</td>
                                            <td>${p.receipt_number || '<span style="color: #999;">N/A</span>'}</td>
                                            <td>${Utils.formatCurrency(p.payment_amount)}</td>
                                            <td>${p.payment_method || 'N/A'}</td>
                                            <td>
                                                ${p.receipt_number ? `
                                                <button class="btn-icon btn-sm" onclick="window.SuppliersAdvanced.printReceiptByNumber('${p.receipt_number}', '${payment.id}')" title="Imprimir Recibo">
                                                    <i class="fas fa-print"></i>
                                                </button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : ''}
                </div>
            `;

            UI.showModal(
                `Pago: ${payment.reference_number}`,
                body,
                [
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error obteniendo pago:', error);
            Utils.showNotification('Error al obtener pago', 'error');
        }
    },

    getPaymentTypeLabel(type) {
        const labels = {
            'invoice': 'Factura',
            'payment': 'Pago',
            'credit_note': 'Nota de Crédito',
            'debit_note': 'Nota de Débito'
        };
        return labels[type] || type;
    },

    getPaymentStatusLabel(status) {
        const labels = {
            'pending': 'Pendiente',
            'partial': 'Parcial',
            'paid': 'Pagado',
            'overdue': 'Vencido',
            'cancelled': 'Cancelado'
        };
        return labels[status] || status;
    },

    // ========== ANÁLISIS Y REPORTES ==========

    async generatePurchasesReport(filters = {}) {
        try {
            Utils.showNotification('Generando reporte de compras...', 'info');
            const data = await API.getSupplierPurchasesReport(filters);
            
            if (!data || data.length === 0) {
                Utils.showNotification('No hay datos para el reporte', 'warning');
                return;
            }

            // Crear tabla HTML
            let html = `
                <div style="padding: var(--spacing-md);">
                    <h3 style="margin-bottom: var(--spacing-md);">Reporte de Compras por Proveedor</h3>
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--color-bg-secondary);">
                                <th style="padding: 8px; text-align: left; border: 1px solid var(--color-border);">Proveedor</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Compras</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Total</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">Primera Compra</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">Última Compra</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid var(--color-border);">
                                        ${row.supplier_code || ''} ${row.supplier_code && row.supplier_name ? '- ' : ''}${row.supplier_name || 'N/A'}
                                    </td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${row.purchase_count || 0}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border); font-weight: 600;">${Utils.formatCurrency(row.total_amount || 0)}</td>
                                    <td style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">${row.first_purchase ? Utils.formatDate(row.first_purchase) : 'N/A'}</td>
                                    <td style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">${row.last_purchase ? Utils.formatDate(row.last_purchase) : 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: var(--color-bg-secondary); font-weight: 600;">
                                <td style="padding: 8px; border: 1px solid var(--color-border);">TOTAL</td>
                                <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${data.reduce((sum, r) => sum + (r.purchase_count || 0), 0)}</td>
                                <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${Utils.formatCurrency(data.reduce((sum, r) => sum + (r.total_amount || 0), 0))}</td>
                                <td colspan="2" style="padding: 8px; border: 1px solid var(--color-border);"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;

            UI.showModal(
                'Reporte de Compras por Proveedor',
                html,
                [
                    { text: 'Exportar CSV', class: 'btn-primary', onclick: () => this.exportReportToCSV(data, 'compras_proveedores') },
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error generando reporte de compras:', error);
            Utils.showNotification('Error al generar reporte', 'error');
        }
    },

    async generatePaymentsReport(filters = {}) {
        try {
            Utils.showNotification('Generando reporte de pagos...', 'info');
            const data = await API.getSupplierPaymentsReport(filters);
            
            if (!data || data.length === 0) {
                Utils.showNotification('No hay datos para el reporte', 'warning');
                return;
            }

            let html = `
                <div style="padding: var(--spacing-md);">
                    <h3 style="margin-bottom: var(--spacing-md);">Reporte de Pagos a Proveedores</h3>
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--color-bg-secondary);">
                                <th style="padding: 8px; text-align: left; border: 1px solid var(--color-border);">Proveedor</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Pagos</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Total Pagado</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Pendiente</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">Primer Pago</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">Último Pago</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid var(--color-border);">
                                        ${row.supplier_code || ''} ${row.supplier_code && row.supplier_name ? '- ' : ''}${row.supplier_name || 'N/A'}
                                    </td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${row.payment_count || 0}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border); font-weight: 600; color: var(--color-success);">${Utils.formatCurrency(row.total_paid || 0)}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border); font-weight: 600; color: var(--color-danger);">${Utils.formatCurrency(row.total_pending || 0)}</td>
                                    <td style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">${row.first_payment ? Utils.formatDate(row.first_payment) : 'N/A'}</td>
                                    <td style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">${row.last_payment ? Utils.formatDate(row.last_payment) : 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: var(--color-bg-secondary); font-weight: 600;">
                                <td style="padding: 8px; border: 1px solid var(--color-border);">TOTAL</td>
                                <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${data.reduce((sum, r) => sum + (r.payment_count || 0), 0)}</td>
                                <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${Utils.formatCurrency(data.reduce((sum, r) => sum + (r.total_paid || 0), 0))}</td>
                                <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${Utils.formatCurrency(data.reduce((sum, r) => sum + (r.total_pending || 0), 0))}</td>
                                <td colspan="2" style="padding: 8px; border: 1px solid var(--color-border);"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;

            UI.showModal(
                'Reporte de Pagos a Proveedores',
                html,
                [
                    { text: 'Exportar CSV', class: 'btn-primary', onclick: () => this.exportReportToCSV(data, 'pagos_proveedores') },
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error generando reporte de pagos:', error);
            Utils.showNotification('Error al generar reporte', 'error');
        }
    },

    async generateAnalysisReport(filters = {}) {
        try {
            Utils.showNotification('Generando análisis de proveedores...', 'info');
            const data = await API.getSupplierAnalysisReport(filters);
            
            if (!data || data.length === 0) {
                Utils.showNotification('No hay datos para el reporte', 'warning');
                return;
            }

            let html = `
                <div style="padding: var(--spacing-md);">
                    <h3 style="margin-bottom: var(--spacing-md);">Análisis Completo de Proveedores</h3>
                    <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: var(--color-bg-secondary);">
                                <th style="padding: 8px; text-align: left; border: 1px solid var(--color-border);">Proveedor</th>
                                <th style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">Calificación</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Compras</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Total Compras</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Pagos</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Total Pagado</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Pendiente</th>
                                <th style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">Items Inventario</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    <td style="padding: 8px; border: 1px solid var(--color-border);">
                                        ${row.code || ''} ${row.code && row.name ? '- ' : ''}${row.name || 'N/A'}
                                    </td>
                                    <td style="padding: 8px; text-align: center; border: 1px solid var(--color-border);">
                                        ${row.rating ? `${parseFloat(row.rating).toFixed(1)} ⭐` : 'N/A'}
                                    </td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${row.total_purchases || 0}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${Utils.formatCurrency(row.total_purchase_amount || 0)}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${row.total_payments || 0}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border); font-weight: 600; color: var(--color-success);">${Utils.formatCurrency(row.total_paid_amount || 0)}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border); font-weight: 600; color: var(--color-danger);">${Utils.formatCurrency(row.total_pending_amount || 0)}</td>
                                    <td style="padding: 8px; text-align: right; border: 1px solid var(--color-border);">${row.inventory_items_count || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            UI.showModal(
                'Análisis Completo de Proveedores',
                html,
                [
                    { text: 'Exportar CSV', class: 'btn-primary', onclick: () => this.exportReportToCSV(data, 'analisis_proveedores') },
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ],
                { size: 'lg' }
            );
        } catch (error) {
            console.error('Error generando análisis:', error);
            Utils.showNotification('Error al generar análisis', 'error');
        }
    },

    exportReportToCSV(data, filename) {
        if (!data || data.length === 0) {
            Utils.showNotification('No hay datos para exportar', 'warning');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvRows = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'string' && value.includes(',')) {
                        return `"${value}"`;
                    }
                    return value;
                }).join(',')
            )
        ];

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Utils.showNotification('Reporte exportado correctamente', 'success');
    },

    async showAnalytics(supplier) {
        const title = `Análisis: ${supplier.name}`;
        
        const body = `
            <div class="supplier-analytics-view">
                <div class="analytics-filters">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Fecha Inicio</label>
                            <input type="date" id="analytics-start-date" class="form-input" onchange="window.SuppliersAdvanced.loadAnalytics('${supplier.id}')">
                        </div>
                        <div class="form-group">
                            <label>Fecha Fin</label>
                            <input type="date" id="analytics-end-date" class="form-input" onchange="window.SuppliersAdvanced.loadAnalytics('${supplier.id}')">
                        </div>
                        <div class="form-group" style="display: flex; align-items: flex-end; gap: var(--spacing-xs);">
                            <button class="btn-secondary" onclick="window.SuppliersAdvanced.loadAnalytics('${supplier.id}')">
                                <i class="fas fa-sync"></i> Actualizar
                            </button>
                            <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.generatePurchasesReport({ supplier_id: '${supplier.id}' })" title="Reporte de Compras">
                                <i class="fas fa-shopping-cart"></i> Compras
                            </button>
                            <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.generatePaymentsReport({ supplier_id: '${supplier.id}' })" title="Reporte de Pagos">
                                <i class="fas fa-money-bill"></i> Pagos
                            </button>
                            <button class="btn-primary btn-sm" onclick="window.SuppliersAdvanced.generateAnalysisReport({ supplier_id: '${supplier.id}' })" title="Análisis Completo">
                                <i class="fas fa-chart-bar"></i> Análisis
                            </button>
                        </div>
                    </div>
                </div>
                <div id="analytics-content">Cargando análisis...</div>
            </div>
        `;

        UI.showModal(
            title,
            body,
            [
                { text: '← Regresar', class: 'btn-secondary', onclick: () => this.showAdvancedView(supplier.id, 'overview') },
                { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
            ],
            { size: 'lg' }
        );

        await this.loadAnalytics(supplier.id);
    },

    async loadAnalytics(supplierId) {
        const analyticsContent = document.getElementById('analytics-content');
        if (!analyticsContent) return;

        try {
            const startDate = document.getElementById('analytics-start-date')?.value || null;
            const endDate = document.getElementById('analytics-end-date')?.value || null;
            
            const filters = {};
            if (startDate) filters.start_date = startDate;
            if (endDate) filters.end_date = endDate;

            const stats = (typeof API !== 'undefined' && API.getSupplierStatsAdvanced)
                ? await API.getSupplierStatsAdvanced(supplierId, filters) || {}
                : {};
            
            // Obtener datos para gráficos
            const orders = (typeof API !== 'undefined' && API.getPurchaseOrders)
                ? await API.getPurchaseOrders({ supplier_id: supplierId, ...filters }) || []
                : [];
            const payments = (typeof API !== 'undefined' && API.getSupplierPayments)
                ? await API.getSupplierPayments({ supplier_id: supplierId, ...filters }) || []
                : [];
            
            analyticsContent.innerHTML = `
                <div class="analytics-grid">
                    <div class="analytics-section">
                        <h4>Estadísticas de Órdenes</h4>
                        <div class="stats-list">
                            <div class="stat-item">
                                <span class="stat-label">Total de Órdenes:</span>
                                <span class="stat-value">${stats.orders?.total_orders || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Órdenes Completadas:</span>
                                <span class="stat-value">${stats.orders?.completed_orders || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Órdenes Pendientes:</span>
                                <span class="stat-value">${stats.orders?.pending_orders || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Gastado:</span>
                                <span class="stat-value">${Utils.formatCurrency(stats.orders?.total_spent || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Promedio por Orden:</span>
                                <span class="stat-value">${Utils.formatCurrency(stats.orders?.avg_order_amount || 0)}</span>
                            </div>
                            ${stats.orders?.first_order_date ? `
                                <div class="stat-item">
                                    <span class="stat-label">Primera Orden:</span>
                                    <span class="stat-value">${Utils.formatDate(stats.orders.first_order_date)}</span>
                                </div>
                            ` : ''}
                            ${stats.orders?.last_order_date ? `
                                <div class="stat-item">
                                    <span class="stat-label">Última Orden:</span>
                                    <span class="stat-value">${Utils.formatDate(stats.orders.last_order_date)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="analytics-section">
                        <h4>Estadísticas de Pagos</h4>
                        <div class="stats-list">
                            <div class="stat-item">
                                <span class="stat-label">Total Facturado:</span>
                                <span class="stat-value">${Utils.formatCurrency(stats.payments?.total_invoiced || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Pagado:</span>
                                <span class="stat-value">${Utils.formatCurrency(stats.payments?.total_paid || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Pendiente:</span>
                                <span class="stat-value">${Utils.formatCurrency(stats.payments?.total_pending || 0)}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Pagos Vencidos:</span>
                                <span class="stat-value">${stats.payments?.overdue_payments || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Pagos:</span>
                                <span class="stat-value">${stats.payments?.total_payments || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div class="analytics-section">
                        <h4>Calificaciones</h4>
                        <div class="stats-list">
                            <div class="stat-item">
                                <span class="stat-label">Calificación General:</span>
                                <span class="stat-value">${(stats.ratings?.avg_rating || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Calidad:</span>
                                <span class="stat-value">${(stats.ratings?.avg_quality || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Entrega:</span>
                                <span class="stat-value">${(stats.ratings?.avg_delivery || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Precio:</span>
                                <span class="stat-value">${(stats.ratings?.avg_price || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Comunicación:</span>
                                <span class="stat-value">${(stats.ratings?.avg_communication || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Servicio:</span>
                                <span class="stat-value">${(stats.ratings?.avg_service || 0).toFixed(1)} / 5.0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Calificaciones:</span>
                                <span class="stat-value">${stats.ratings?.total_ratings || 0}</span>
                            </div>
                        </div>
                    </div>

                    ${orders.length > 0 ? `
                        <div class="analytics-section" style="grid-column: 1 / -1;">
                            <h4>Evolución de Compras</h4>
                            <canvas id="orders-chart" style="max-height: 300px;"></canvas>
                        </div>
                    ` : ''}

                    ${payments.length > 0 ? `
                        <div class="analytics-section" style="grid-column: 1 / -1;">
                            <h4>Evolución de Pagos</h4>
                            <canvas id="payments-chart" style="max-height: 300px;"></canvas>
                        </div>
                    ` : ''}

                    ${stats.ratings && stats.ratings.total_ratings > 0 ? `
                        <div class="analytics-section">
                            <h4>Desglose de Calificaciones</h4>
                            <canvas id="ratings-chart" style="max-height: 250px;"></canvas>
                        </div>
                    ` : ''}

                    ${stats.price_history && stats.price_history.length > 0 ? `
                        <div class="analytics-section" style="grid-column: 1 / -1;">
                            <h4>Historial de Precios (Últimos 12 Meses)</h4>
                            <canvas id="price-history-chart" style="max-height: 300px;"></canvas>
                            <div class="price-history-table-wrapper" style="margin-top: var(--spacing-md);">
                                <table class="price-history-table">
                                    <thead>
                                        <tr>
                                            <th>Mes</th>
                                            <th>Precio Promedio</th>
                                            <th>Precio Mínimo</th>
                                            <th>Precio Máximo</th>
                                            <th>Registros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stats.price_history.map(ph => `
                                            <tr>
                                                <td>${Utils.formatDate(ph.month, 'YYYY-MM')}</td>
                                                <td>${Utils.formatCurrency(ph.avg_price || 0)}</td>
                                                <td>${Utils.formatCurrency(ph.min_price || 0)}</td>
                                                <td>${Utils.formatCurrency(ph.max_price || 0)}</td>
                                                <td>${ph.price_records || 0}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            // Renderizar gráficos después de que el HTML esté en el DOM
            setTimeout(() => {
                if (orders.length > 0) this.renderOrdersChart(orders);
                if (payments.length > 0) this.renderPaymentsChart(payments);
                if (stats.ratings && stats.ratings.total_ratings > 0) this.renderRatingsChart(stats.ratings);
                if (stats.price_history && stats.price_history.length > 0) this.renderPriceHistoryChart(stats.price_history);
            }, 100);
        } catch (error) {
            console.error('Error cargando análisis:', error);
            analyticsContent.innerHTML = '<div class="error-state">Error al cargar análisis</div>';
        }
    },

    renderOrdersChart(orders) {
        const canvas = document.getElementById('orders-chart');
        if (!canvas) return;

        // Agrupar por mes
        const monthlyData = {};
        orders.forEach(order => {
            const month = order.order_date ? order.order_date.substring(0, 7) : new Date().toISOString().substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { count: 0, amount: 0 };
            }
            monthlyData[month].count++;
            monthlyData[month].amount += parseFloat(order.total_amount || 0);
        });

        const months = Object.keys(monthlyData).sort();
        const counts = months.map(m => monthlyData[m].count);
        const amounts = months.map(m => monthlyData[m].amount);

        this.renderLineChart(canvas, {
            labels: months.map(m => Utils.formatDate(m, 'YYYY-MM')),
            datasets: [{
                label: 'Cantidad de Órdenes',
                data: counts,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                yAxisID: 'y'
            }, {
                label: 'Monto Total (MXN)',
                data: amounts,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                yAxisID: 'y1'
            }]
        }, {
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Cantidad' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Monto (MXN)' },
                    grid: { drawOnChartArea: false }
                }
            }
        });
    },

    renderPaymentsChart(payments) {
        const canvas = document.getElementById('payments-chart');
        if (!canvas) return;

        // Agrupar por mes y estado
        const monthlyData = {};
        payments.forEach(payment => {
            const month = payment.issue_date ? payment.issue_date.substring(0, 7) : new Date().toISOString().substring(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { paid: 0, pending: 0, overdue: 0 };
            }
            const status = payment.status;
            const pending = parseFloat(payment.total_amount || 0) - parseFloat(payment.paid_amount || 0);
            
            if (status === 'paid') {
                monthlyData[month].paid += parseFloat(payment.paid_amount || 0);
            } else if (status === 'overdue') {
                monthlyData[month].overdue += pending;
            } else {
                monthlyData[month].pending += pending;
            }
        });

        const months = Object.keys(monthlyData).sort();
        
        this.renderBarChart(canvas, {
            labels: months.map(m => Utils.formatDate(m, 'YYYY-MM')),
            datasets: [{
                label: 'Pagado',
                data: months.map(m => monthlyData[m].paid),
                backgroundColor: 'rgba(34, 197, 94, 0.8)'
            }, {
                label: 'Pendiente',
                data: months.map(m => monthlyData[m].pending),
                backgroundColor: 'rgba(251, 191, 36, 0.8)'
            }, {
                label: 'Vencido',
                data: months.map(m => monthlyData[m].overdue),
                backgroundColor: 'rgba(239, 68, 68, 0.8)'
            }]
        });
    },

    renderRatingsChart(ratings) {
        const canvas = document.getElementById('ratings-chart');
        if (!canvas) return;

        this.renderRadarChart(canvas, {
            labels: ['Calidad', 'Entrega', 'Precio', 'Comunicación', 'Servicio'],
            datasets: [{
                label: 'Calificación Promedio',
                data: [
                    ratings.avg_quality || 0,
                    ratings.avg_delivery || 0,
                    ratings.avg_price || 0,
                    ratings.avg_communication || 0,
                    ratings.avg_service || 0
                ],
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: 'rgb(59, 130, 246)',
                pointBackgroundColor: 'rgb(59, 130, 246)'
            }]
        }, {
            scales: {
                r: {
                    beginAtZero: true,
                    max: 5,
                    ticks: { stepSize: 1 }
                }
            }
        });
    },

    renderPriceHistoryChart(priceHistory) {
        const canvas = document.getElementById('price-history-chart');
        if (!canvas) return;

        const months = priceHistory.map(ph => Utils.formatDate(ph.month, 'YYYY-MM'));
        const avgPrices = priceHistory.map(ph => ph.avg_price || 0);
        const minPrices = priceHistory.map(ph => ph.min_price || 0);
        const maxPrices = priceHistory.map(ph => ph.max_price || 0);

        this.renderLineChart(canvas, {
            labels: months,
            datasets: [{
                label: 'Precio Promedio',
                data: avgPrices,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true
            }, {
                label: 'Precio Mínimo',
                data: minPrices,
                borderColor: 'rgb(34, 197, 94)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderDash: [5, 5]
            }, {
                label: 'Precio Máximo',
                data: maxPrices,
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderDash: [5, 5]
            }]
        });
    },

    renderLineChart(canvas, data, options = {}) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js no está disponible');
            return;
        }

        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                ...options
            }
        });
    },

    renderBarChart(canvas, data, options = {}) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js no está disponible');
            return;
        }

        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                },
                ...options
            }
        });
    },

    renderRadarChart(canvas, data, options = {}) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js no está disponible');
            return;
        }

        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'radar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                ...options
            }
        });
    },

    // ========== FUNCIONES AUXILIARES ==========

    async loadRecentContracts(supplierId) {
        const list = document.getElementById('recent-contracts-list');
        if (!list) return;

        try {
            const contracts = (typeof API !== 'undefined' && API.getSupplierContracts)
                ? await API.getSupplierContracts(supplierId) || []
                : [];
            const recent = contracts.slice(0, 3);
            
            if (recent.length === 0) {
                list.innerHTML = '<div class="empty-state-small">No hay contratos</div>';
                return;
            }

            list.innerHTML = recent.map(c => `
                <div class="recent-item">
                    <strong>${c.title}</strong>
                    <span class="text-muted">${c.contract_number}</span>
                </div>
            `).join('');
        } catch (error) {
            list.innerHTML = '<div class="error-state-small">Error</div>';
        }
    },

    async loadRecentOrders(supplierId) {
        const list = document.getElementById('recent-orders-list');
        if (!list) return;

        try {
            const orders = (typeof API !== 'undefined' && API.getPurchaseOrders)
                ? await API.getPurchaseOrders({ supplier_id: supplierId }) || []
                : [];
            const recent = orders.slice(0, 3);
            
            if (recent.length === 0) {
                list.innerHTML = '<div class="empty-state-small">No hay órdenes</div>';
                return;
            }

            list.innerHTML = recent.map(o => `
                <div class="recent-item">
                    <strong>Orden #${o.order_number}</strong>
                    <span class="text-muted">${Utils.formatCurrency(o.total_amount)}</span>
                </div>
            `).join('');
        } catch (error) {
            list.innerHTML = '<div class="error-state-small">Error</div>';
        }
    },

    async syncReceiptsFromServer(supplierId) {
        try {
            if (typeof API === 'undefined' || !API.getPaymentReceipts) return;

            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : null;

            // Obtener recibos del servidor filtrados por sucursal
            const receipts = await API.getPaymentReceipts({
                supplier_id: supplierId,
                branch_id: currentBranchId
            }) || [];

            // Guardar recibos localmente
            if (receipts.length > 0 && typeof DB !== 'undefined') {
                for (const receipt of receipts) {
                    try {
                        await DB.put('payment_invoices', {
                            ...receipt,
                            server_id: receipt.id,
                            sync_status: 'synced'
                        });
                    } catch (e) {
                        console.warn('Error guardando recibo localmente:', e);
                    }
                }
                console.log(`✅ ${receipts.length} recibos sincronizados desde el servidor`);
            }
        } catch (error) {
            console.warn('Error sincronizando recibos desde servidor:', error);
        }
    },

    async loadPendingPayments(supplierId) {
        const list = document.getElementById('pending-payments-list');
        if (!list) return;

        try {
            const payments = (typeof API !== 'undefined' && API.getSupplierPayments)
                ? await API.getSupplierPayments({ supplier_id: supplierId, status: 'pending' }) || []
                : [];
            const recent = payments.slice(0, 3);
            
            if (recent.length === 0) {
                list.innerHTML = '<div class="empty-state-small">No hay pagos pendientes</div>';
                return;
            }

            list.innerHTML = recent.map(p => {
                const pending = parseFloat(p.total_amount) - parseFloat(p.paid_amount || 0);
                return `
                    <div class="recent-item">
                        <strong>${p.reference_number}</strong>
                        <span class="text-muted">${Utils.formatCurrency(pending)}</span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            list.innerHTML = '<div class="error-state-small">Error</div>';
        }
    }
};
