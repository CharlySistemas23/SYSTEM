// Barcodes Module - Gestión Avanzada de Códigos de Barras

// Declarar el módulo (usar var para evitar errores de redeclaración)
var BarcodesModule = {
    initialized: false,
    isExporting: false, // Flag para prevenir múltiples exportaciones simultáneas
    currentTab: 'overview',
    scanHistory: [],
    BARCODES_BATCH_SIZE: 15, // ~3 filas iniciales para reducir peso de render; "Ver más" carga el resto
    _displayLimits: {},
    _lastFilterKey: null,

    async init() {
        try {
            if (this.initialized) {
                const activeTab = document.querySelector('#barcodes-tabs .tab-btn.active')?.dataset.tab || 'overview';
                await this.loadTab(activeTab);
                return;
            }
            this.setupUI();
            try {
                await this.loadTab('overview');
            } catch (e) {
                console.error('Error loading tab in init:', e);
            }
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error inicializando módulo BarcodesModule:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('barcodes-content') || document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Barcodes</h3>
                        <p style="color: var(--color-text-secondary); margin-top: var(--spacing-md);">
                            ${error.message || 'Error desconocido'}
                        </p>
                        <p style="color: var(--color-danger); font-size: 12px; margin-top: var(--spacing-sm);">
                            Por favor, abre la consola del navegador (F12) para ver más detalles.
                        </p>
                        <button class="btn-primary" onclick="location.reload()" style="margin-top: var(--spacing-md);">
                            Recargar página
                        </button>
                    </div>
                `;
            }
        }
    },

    setupUI() {
        const content = document.getElementById('barcodes-content');
        if (!content) return;

        // Event listeners para tabs
        document.querySelectorAll('#barcodes-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const clickedBtn = e.target.closest('.tab-btn');
                if (!clickedBtn) return;
                
                document.querySelectorAll('#barcodes-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                clickedBtn.classList.add('active');
                const tab = clickedBtn.dataset.tab;
                this.loadTab(tab);
            });
        });
        
        // Configurar listeners de Socket.IO para actualización en tiempo real
        this.setupSocketListeners();
        
        // Escuchar cambios de sucursal
        window.addEventListener('branch-changed', () => {
            if (this.initialized && this.currentTab === 'barcodes') {
                this.loadBarcodes();
            }
        });
        
        // Configurar event listeners para filtros (solo una vez)
    },
    
    setupBarcodesTabListeners() {
        const searchInput = document.getElementById('barcodes-search');
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.dataset.listenerAdded = 'true';
            searchInput.addEventListener('input', Utils.debounce(() => this.loadBarcodes(), 300));
        }
        
        const typeFilter = document.getElementById('barcodes-type-filter');
        if (typeFilter && !typeFilter.dataset.listenerAdded) {
            typeFilter.dataset.listenerAdded = 'true';
            typeFilter.addEventListener('change', () => this.loadBarcodes());
        }
        
        const statusFilter = document.getElementById('barcodes-status-filter');
        if (statusFilter && !statusFilter.dataset.listenerAdded) {
            statusFilter.dataset.listenerAdded = 'true';
            statusFilter.addEventListener('change', () => this.loadBarcodes());
        }
        
        const branchFilter = document.getElementById('barcodes-branch-filter');
        if (branchFilter && !branchFilter.dataset.listenerAdded) {
            branchFilter.dataset.listenerAdded = 'true';
            branchFilter.addEventListener('change', () => this.loadBarcodes());
        }
        
        const batchPrintBtn = document.getElementById('barcodes-batch-print');
        if (batchPrintBtn && !batchPrintBtn.dataset.listenerAdded) {
            batchPrintBtn.dataset.listenerAdded = 'true';
            batchPrintBtn.addEventListener('click', () => this.handleBatchPrint());
        }
        
        const exportAllBtn = document.getElementById('barcodes-export-all');
        if (exportAllBtn && !exportAllBtn.dataset.listenerAdded) {
            exportAllBtn.dataset.listenerAdded = 'true';
            exportAllBtn.addEventListener('click', () => this.showExportOptions());
        }
    },
    
    setupScanHistoryTabListeners() {
        const scanHistorySearch = document.getElementById('scan-history-search');
        if (scanHistorySearch && !scanHistorySearch.dataset.listenerAdded) {
            scanHistorySearch.dataset.listenerAdded = 'true';
            scanHistorySearch.addEventListener('input', Utils.debounce(() => this.loadScanHistory(), 300));
        }
        
        const scanHistoryFilter = document.getElementById('scan-history-filter');
        if (scanHistoryFilter && !scanHistoryFilter.dataset.listenerAdded) {
            scanHistoryFilter.dataset.listenerAdded = 'true';
            scanHistoryFilter.addEventListener('change', () => this.loadScanHistory());
        }
        
        const scanHistoryClear = document.getElementById('scan-history-clear');
        if (scanHistoryClear && !scanHistoryClear.dataset.listenerAdded) {
            scanHistoryClear.dataset.listenerAdded = 'true';
            scanHistoryClear.addEventListener('click', () => this.clearScanHistory());
        }
    },
    
    setupSocketListeners() {
        // Escuchar eventos Socket.IO para actualización en tiempo real
        // Eventos de inventario (para actualizar códigos de barras de productos)
        if (typeof UserManager !== 'undefined' && UserManager.currentUser?.is_master_admin) {
            window.addEventListener('inventory-updated-all-branches', async (e) => {
                const { branchId, action, item } = e.detail;
                if (this.initialized && this.currentTab === 'barcodes') {
                    console.log(`📦 Barcodes: Inventario actualizado en sucursal ${branchId} (${action})`);
                    // Recargar códigos de barras después de un pequeño delay
                    setTimeout(async () => {
                        await this.loadBarcodes();
                    }, 300);
                }
            });
        }
        
        window.addEventListener('inventory-updated', async (e) => {
            if (this.initialized && this.currentTab === 'barcodes') {
                const { item } = e.detail || {};
                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                // Solo actualizar si el item es de la sucursal actual
                if (item && (!currentBranchId || item.branch_id === currentBranchId)) {
                    console.log(`📦 Barcodes: Inventario actualizado localmente`);
                    setTimeout(async () => {
                        await this.loadBarcodes();
                    }, 300);
                }
            }
        });
        
        // Eventos de empleados (para actualizar códigos de barras de empleados)
        window.addEventListener('employee-updated', async (e) => {
            if (this.initialized && this.currentTab === 'barcodes') {
                const { employee } = e.detail || {};
                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                // Solo actualizar si el empleado es de la sucursal actual
                if (employee && (!currentBranchId || employee.branch_id === currentBranchId || 
                    (employee.branch_ids && Array.isArray(employee.branch_ids) && employee.branch_ids.includes(currentBranchId)))) {
                    console.log(`👤 Barcodes: Empleado actualizado localmente`);
                    setTimeout(async () => {
                        await this.loadBarcodes();
                    }, 300);
                }
            }
        });
        
        // Eventos de proveedores (para actualizar códigos de barras de proveedores)
        window.addEventListener('supplier-updated', async (e) => {
            if (this.initialized && this.currentTab === 'barcodes') {
                const { supplier } = e.detail || {};
                const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                // Solo actualizar si el proveedor es de la sucursal actual o es compartido
                if (supplier && (!currentBranchId || supplier.branch_id === currentBranchId || supplier.is_shared === true)) {
                    console.log(`🚚 Barcodes: Proveedor actualizado localmente`);
                    setTimeout(async () => {
                        await this.loadBarcodes();
                    }, 300);
                }
            }
        });
    },

    async loadTab(tab) {
        const content = document.getElementById('barcodes-content');
        if (!content) {
            console.error('❌ barcodes-content no encontrado');
            return;
        }

        this.currentTab = tab;
        
        // Asegurar que el contenido sea visible
        content.style.display = 'block';
        content.style.visibility = 'visible';

        try {
            content.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

            switch(tab) {
                case 'overview':
                    content.innerHTML = await this.getOverviewTab();
                    break;
                case 'barcodes':
                    content.innerHTML = await this.getBarcodesTab();
                    // Configurar filtro de sucursal antes de cargar códigos
                    await this.setupBranchFilter();
                    // Configurar event listeners para filtros del tab Códigos
                    this.setupBarcodesTabListeners();
                    // Configurar event listeners para botones de generación individual
                    setTimeout(() => {
                        const generateItemBtn = document.getElementById('barcodes-generate-item');
                        const generateEmployeeBtn = document.getElementById('barcodes-generate-employee');
                        const generateSellerBtn = document.getElementById('barcodes-generate-seller');
                        const generateGuideBtn = document.getElementById('barcodes-generate-guide');
                        const generateAgencyBtn = document.getElementById('barcodes-generate-agency');
                        const generateSupplierBtn = document.getElementById('barcodes-generate-supplier');
                        
                        if (generateItemBtn) {
                            generateItemBtn.onclick = () => App.loadModule('inventory');
                        }
                        if (generateEmployeeBtn) {
                            generateEmployeeBtn.onclick = () => App.loadModule('employees');
                        }
                        if (generateSellerBtn) {
                            generateSellerBtn.onclick = () => this.loadCatalogModule('sellers');
                        }
                        if (generateGuideBtn) {
                            generateGuideBtn.onclick = () => this.loadCatalogModule('guides');
                        }
                        if (generateAgencyBtn) {
                            generateAgencyBtn.onclick = () => this.loadCatalogModule('agencies');
                        }
                        if (generateSupplierBtn) {
                            generateSupplierBtn.onclick = () => {
                                // Filtrar por proveedores
                                const typeFilter = document.getElementById('barcodes-type-filter');
                                if (typeFilter) {
                                    typeFilter.value = 'suppliers';
                                    // Disparar evento change para que se recargue
                                    const changeEvent = new Event('change', { bubbles: true });
                                    typeFilter.dispatchEvent(changeEvent);
                                    // También recargar manualmente por si acaso
                                    setTimeout(() => {
                                        this.loadBarcodes();
                                    }, 100);
                                }
                            };
                        }
                    }, 100);
                    await this.loadBarcodes();
                    break;
                case 'scan-history':
                    content.innerHTML = await this.getScanHistoryTab();
                    this.setupScanHistoryTabListeners();
                    await this.loadScanHistory();
                    break;
                case 'templates':
                    content.innerHTML = await this.getTemplatesTab();
                    break;
                case 'settings':
                    content.innerHTML = await this.getSettingsTab();
                    // Configurar event listener para el botón de guardar configuración
                    setTimeout(() => {
                        const saveBtn = document.querySelector('#barcodes-content button[onclick*="saveBarcodeSettings"]');
                        if (saveBtn) {
                            // Remover onclick y agregar event listener
                            saveBtn.removeAttribute('onclick');
                            saveBtn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                if (window.BarcodesModule && typeof window.BarcodesModule.saveBarcodeSettings === 'function') {
                                    await window.BarcodesModule.saveBarcodeSettings();
                                } else {
                                    console.error('saveBarcodeSettings no está disponible');
                                    Utils.showNotification('Error: función no disponible', 'error');
                                }
                            });
                        }
                    }, 100);
                    break;
                default:
                    content.innerHTML = '<p>Pestaña no encontrada</p>';
            }
        } catch (e) {
            console.error(`Error loading tab ${tab}:`, e);
            content.innerHTML = `
                <div style="padding: var(--spacing-md); background: var(--color-danger); color: white; border-radius: var(--radius-md);">
                    <strong>Error al cargar:</strong> ${e.message}
                </div>
            `;
        }
    },

    async getOverviewTab() {
        const stats = await this.getBarcodeStats();
        const recentScans = await this.getRecentScans(10);
        const duplicates = await this.findDuplicateBarcodes();

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div class="kpi-card">
                    <div class="kpi-label">Total Códigos</div>
                    <div class="kpi-value">${stats.total}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.withBarcode} con código
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Sin Código</div>
                    <div class="kpi-value" style="color: ${stats.withoutBarcode > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">${stats.withoutBarcode}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${stats.withoutBarcode > 0 ? 'Requieren generación' : 'Todos tienen código'}
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Duplicados</div>
                    <div class="kpi-value" style="color: ${duplicates.length > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${duplicates.length}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${duplicates.length > 0 ? 'Requieren corrección' : 'Sin duplicados'}
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Escaneos Hoy</div>
                    <div class="kpi-value">${stats.scansToday}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        Total: ${stats.totalScans}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-pie"></i> Distribución por Tipo
                    </h3>
                    <div style="margin-top: var(--spacing-md);">
                        ${this.renderTypeDistribution(stats)}
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-history"></i> Escaneos Recientes
                    </h3>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${recentScans.length === 0 ? 
                            '<p style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay escaneos recientes</p>' :
                            recentScans.map(scan => `
                                <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 11px;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span><strong>${scan.barcode}</strong></span>
                                        <span style="color: var(--color-text-secondary);">${Utils.formatDate(scan.timestamp, 'HH:mm:ss')}</span>
                                    </div>
                                    <div style="color: var(--color-text-secondary); font-size: 10px; margin-top: 2px;">
                                        ${scan.context || 'Genérico'}
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>

            ${duplicates.length > 0 ? `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-danger); margin-top: var(--spacing-md);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm); color: var(--color-danger);">
                        <i class="fas fa-exclamation-triangle"></i> Códigos Duplicados Detectados
                    </h3>
                    <div style="max-height: 200px; overflow-y: auto; margin-top: var(--spacing-sm);">
                        ${duplicates.map(dup => `
                            <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 11px;">
                                <div style="font-weight: 600; color: var(--color-danger);">${dup.barcode}</div>
                                <div style="color: var(--color-text-secondary); font-size: 10px; margin-top: 2px;">
                                    Usado en: ${dup.count} elementos
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-danger btn-sm" onclick="window.BarcodesModule.fixDuplicates()" style="margin-top: var(--spacing-sm); width: 100%;">
                        <i class="fas fa-wrench"></i> Corregir Duplicados
                    </button>
                </div>
            ` : ''}
        `;
    },

    async getBarcodesTab() {
        return `
            <div class="module-header" style="margin-bottom: var(--spacing-md);">
                <div class="module-actions">
                    <button class="btn-secondary btn-sm" id="barcodes-generate-item"><i class="fas fa-box"></i> Productos</button>
                    <button class="btn-secondary btn-sm" id="barcodes-generate-employee"><i class="fas fa-user-tie"></i> Empleados</button>
                    <button class="btn-secondary btn-sm" id="barcodes-generate-seller"><i class="fas fa-user-tag"></i> Vendedores</button>
                    <button class="btn-secondary btn-sm" id="barcodes-generate-guide"><i class="fas fa-suitcase"></i> Guías</button>
                    <button class="btn-secondary btn-sm" id="barcodes-generate-agency"><i class="fas fa-building"></i> Agencias</button>
                    <button class="btn-secondary btn-sm" id="barcodes-generate-supplier"><i class="fas fa-truck"></i> Proveedores</button>
                    <button class="btn-primary btn-sm" id="barcodes-batch-print"><i class="fas fa-print"></i> Imprimir Seleccionados</button>
                    <button class="btn-secondary btn-sm" id="barcodes-export-all"><i class="fas fa-download"></i> Exportar</button>
                </div>
            </div>
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md);">
                <div class="form-group" style="flex: 1;">
                    <input type="text" id="barcodes-search" class="form-input" placeholder="Buscar por nombre, SKU, código...">
                </div>
                ${(() => {
                    const isMasterAdmin = typeof UserManager !== 'undefined' && (
                        UserManager.currentUser?.role === 'master_admin' ||
                        UserManager.currentUser?.is_master_admin ||
                        UserManager.currentUser?.isMasterAdmin ||
                        UserManager.currentEmployee?.role === 'master_admin'
                    );
                    return isMasterAdmin ? `
                        <div class="form-group" style="width: 180px;">
                            <select id="barcodes-branch-filter" class="form-select">
                                <option value="all">Todas las sucursales</option>
                            </select>
                        </div>
                    ` : '';
                })()}
                <div class="form-group" style="width: 150px;">
                    <select id="barcodes-type-filter" class="form-select">
                        <option value="all">Todos</option>
                        <option value="items">Productos</option>
                        <option value="employees">Empleados</option>
                        <option value="sellers">Vendedores</option>
                        <option value="guides">Guías</option>
                        <option value="agencies">Agencias</option>
                        <option value="suppliers">Proveedores</option>
                    </select>
                </div>
                <div class="form-group" style="width: 150px;">
                    <select id="barcodes-status-filter" class="form-select">
                        <option value="all">Todos</option>
                        <option value="with">Con Código</option>
                        <option value="without">Sin Código</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs); cursor: pointer;">
                        <input type="checkbox" id="barcodes-select-all" style="cursor: pointer;">
                        <span style="font-size: 11px;">Seleccionar Todos</span>
                    </label>
                </div>
            </div>
            <div id="barcodes-list" class="barcodes-container-compact">
                <div class="empty-state">Cargando códigos de barras...</div>
            </div>
        `;
    },

    async getScanHistoryTab() {
        return `
            <div class="filters-bar-compact" style="margin-bottom: var(--spacing-md);">
                <div class="form-group" style="flex: 1;">
                    <input type="text" id="scan-history-search" class="form-input" placeholder="Buscar en historial...">
                </div>
                <div class="form-group" style="width: 150px;">
                    <select id="scan-history-filter" class="form-select">
                        <option value="all">Todos</option>
                        <option value="today">Hoy</option>
                        <option value="week">Esta Semana</option>
                        <option value="month">Este Mes</option>
                    </select>
                </div>
                <button class="btn-danger btn-sm" id="scan-history-clear"><i class="fas fa-trash"></i> Limpiar</button>
            </div>
            <div id="scan-history-list" style="max-height: 600px; overflow-y: auto;">
                <div class="empty-state">Cargando historial...</div>
            </div>
        `;
    },

    async getTemplatesTab() {
        const templates = await this.getPrintTemplates();
        
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                ${templates.map(template => `
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <h3 style="font-size: 13px; font-weight: 600; margin-bottom: var(--spacing-sm);">${template.name}</h3>
                        <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">${template.description}</p>
                        <div style="display: flex; gap: var(--spacing-xs); margin-top: var(--spacing-sm);">
                            <button class="btn-secondary btn-sm" onclick="window.BarcodesModule.editTemplate('${template.id}')" style="flex: 1;">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn-primary btn-sm" onclick="window.BarcodesModule.useTemplate('${template.id}')" style="flex: 1;">
                                <i class="fas fa-check"></i> Usar
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn-primary" onclick="window.BarcodesModule.addTemplate()">
                <i class="fas fa-plus"></i> Nueva Plantilla
            </button>
        `;
    },

    async getSettingsTab() {
        const settings = await this.getBarcodeSettings();
        
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-barcode"></i> Formato de Código
                    </h3>
                    <div class="form-group">
                        <label>Formato Predeterminado</label>
                        <select id="barcode-format" class="form-select">
                            <option value="CODE128" ${settings.format === 'CODE128' ? 'selected' : ''}>CODE128</option>
                            <option value="EAN13" ${settings.format === 'EAN13' ? 'selected' : ''}>EAN-13</option>
                            <option value="EAN8" ${settings.format === 'EAN8' ? 'selected' : ''}>EAN-8</option>
                            <option value="CODE39" ${settings.format === 'CODE39' ? 'selected' : ''}>CODE39</option>
                            <option value="ITF14" ${settings.format === 'ITF14' ? 'selected' : ''}>ITF-14</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Ancho de Barras</label>
                        <input type="number" id="barcode-width" class="form-input" value="${settings.width}" min="1" max="5" step="0.5">
                    </div>
                    <div class="form-group">
                        <label>Altura de Barras</label>
                        <input type="number" id="barcode-height" class="form-input" value="${settings.height}" min="20" max="200" step="10">
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="barcode-display-value" ${settings.displayValue ? 'checked' : ''}>
                            <span>Mostrar Valor del Código</span>
                        </label>
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.BarcodesModule.saveBarcodeSettings()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Configuración
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-qrcode"></i> Códigos QR
                    </h3>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="qr-enabled" ${settings.qrEnabled ? 'checked' : ''}>
                            <span>Habilitar Generación de QR</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Tamaño QR</label>
                        <input type="number" id="qr-size" class="form-input" value="${settings.qrSize}" min="100" max="500" step="50">
                    </div>
                    <div class="form-group">
                        <label>Contenido QR</label>
                        <select id="qr-content-type" class="form-select">
                            <option value="barcode" ${settings.qrContentType === 'barcode' ? 'selected' : ''}>Solo Código</option>
                            <option value="url" ${settings.qrContentType === 'url' ? 'selected' : ''}>URL del Producto</option>
                            <option value="full" ${settings.qrContentType === 'full' ? 'selected' : ''}>Información Completa</option>
                        </select>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-history"></i> Historial de Escaneos
                    </h3>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="scan-history-enabled" ${settings.scanHistoryEnabled ? 'checked' : ''}>
                            <span>Registrar Escaneos</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Días de Retención</label>
                        <input type="number" id="scan-history-days" class="form-input" value="${settings.scanHistoryDays}" min="1" max="365">
                    </div>
                    <button class="btn-danger btn-sm" onclick="window.BarcodesModule.clearScanHistory()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-trash"></i> Limpiar Historial
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-check-circle"></i> Validación
                    </h3>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="validate-on-generate" ${settings.validateOnGenerate ? 'checked' : ''}>
                            <span>Validar al Generar</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="check-duplicates" ${settings.checkDuplicates ? 'checked' : ''}>
                            <span>Verificar Duplicados</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="auto-fix-duplicates" ${settings.autoFixDuplicates ? 'checked' : ''}>
                            <span>Corregir Duplicados Automáticamente</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    },

    async setupBranchFilter() {
        const branchFilter = document.getElementById('barcodes-branch-filter');
        if (!branchFilter) return;
        
        try {
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id');
            
            // Si NO es master_admin, ocultar el dropdown y forzar filtro a su sucursal
            if (!isMasterAdmin) {
                branchFilter.style.display = 'none';
                // CRÍTICO: Establecer el valor aunque esté oculto para que el filtrado funcione
                if (currentBranchId) {
                    branchFilter.value = currentBranchId;
                    console.log(`📍 Barcodes: Filtro oculto establecido a sucursal actual: ${currentBranchId}`);
                } else {
                    // Si no hay sucursal actual, establecer a 'all' para evitar errores
                    branchFilter.value = 'all';
                    console.warn('⚠️ Barcodes: No hay sucursal actual, estableciendo filtro a "all"');
                }
            } else {
                // Master admin puede ver todas las sucursales
                branchFilter.style.display = '';
                
                let branches = await DB.getAll('catalog_branches') || [];
                
                // Eliminar duplicados
                const seenNames = new Set();
                const seenIds = new Set();
                branches = branches.filter(b => {
                    if (!b || !b.id || !b.name) return false;
                    if (b.name === 'Sucursal Principal' && seenNames.has('Sucursal Principal')) {
                        return false;
                    }
                    if (seenIds.has(b.id)) {
                        return false;
                    }
                    seenNames.add(b.name);
                    seenIds.add(b.id);
                    return true;
                });
                
                branchFilter.innerHTML = '<option value="all">Todas las sucursales</option>' + 
                    branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
                
                // Establecer valor por defecto según sucursal actual
                if (currentBranchId) {
                    branchFilter.value = currentBranchId;
                } else {
                    branchFilter.value = 'all';
                }
            }
        } catch (error) {
            console.error('Error configurando filtro de sucursal:', error);
        }
    },

    async getBarcodeStats() {
        // Obtener sucursal actual y filtrar datos
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        // Obtener filtro de sucursal seleccionado (si existe)
        const branchFilter = document.getElementById('barcodes-branch-filter');
        const selectedBranchId = branchFilter?.value === 'all' ? null : branchFilter?.value || null;
        const filterBranchId = selectedBranchId || (isMasterAdmin ? null : currentBranchId);
        const viewAllBranches = isMasterAdmin && !selectedBranchId;
        
        const items = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Filtrado estricto por sucursal si hay un filtro específico
        let filteredItems = items;
        if (filterBranchId) {
            const normalizedFilterBranchId = String(filterBranchId);
            filteredItems = items.filter(item => {
                if (!item.branch_id) return false;
                return String(item.branch_id) === normalizedFilterBranchId;
            });
        }
        
        let employees = await DB.getAll('employees', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también (por si tienen branch_ids múltiples)
        if (!viewAllBranches && filterBranchId) {
            const normalizedBranchId = String(filterBranchId);
            employees = employees.filter(emp => {
                if (emp.branch_id) {
                    return String(emp.branch_id) === normalizedBranchId;
                }
                if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                    return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                }
                return false; // Excluir empleados sin branch_id cuando hay filtro
            });
        }
        
        // Sellers, guides y agencies no tienen branch_id, se muestran todos
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];

        const all = [...filteredItems, ...employees, ...sellers, ...guides, ...agencies];
        const withBarcode = all.filter(item => !Utils.isBarcodeEmpty(item.barcode)).length;
        const withoutBarcode = all.length - withBarcode;

        // Obtener escaneos del historial
        const history = await DB.getAll('barcode_scan_history') || [];
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        const scansToday = history.filter(h => h.timestamp?.startsWith(today)).length;

        return {
            total: all.length,
            withBarcode,
            withoutBarcode,
            scansToday,
            totalScans: history.length,
            byType: {
                items: filteredItems.length,
                employees: employees.length,
                sellers: sellers.length,
                guides: guides.length,
                agencies: agencies.length,
                suppliers: (await DB.getAll('suppliers') || []).length
            }
        };
    },

    renderTypeDistribution(stats) {
        const total = stats.total;
        if (total === 0) return '<p style="text-align: center; color: var(--color-text-secondary);">No hay datos</p>';

        const types = [
            { name: 'Productos', count: stats.byType.items, color: 'var(--color-accent)' },
            { name: 'Empleados', count: stats.byType.employees, color: 'var(--color-success)' },
            { name: 'Vendedores', count: stats.byType.sellers, color: 'var(--color-info)' },
            { name: 'Guías', count: stats.byType.guides, color: 'var(--color-warning)' },
            { name: 'Agencias', count: stats.byType.agencies, color: 'var(--color-danger)' },
            { name: 'Proveedores', count: stats.byType.suppliers || 0, color: '#f59e0b' }
        ];

        return types.map(type => {
            const percentage = total > 0 ? (type.count / total * 100).toFixed(1) : 0;
            return `
                <div style="margin-bottom: var(--spacing-sm);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: var(--spacing-xs); font-size: 11px;">
                        <span>${type.name}</span>
                        <span style="font-weight: 600;">${type.count} (${percentage}%)</span>
                    </div>
                    <div style="height: 8px; background: var(--color-bg-secondary); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${percentage}%; background: ${type.color}; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async getRecentScans(limit = 10) {
        const history = await DB.getAll('barcode_scan_history') || [];
        return history
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    },

    async findDuplicateBarcodes() {
        // Obtener sucursal actual y filtrar datos
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        // Obtener filtro de sucursal seleccionado (si existe)
        const branchFilter = document.getElementById('barcodes-branch-filter');
        const selectedBranchId = branchFilter?.value === 'all' ? null : branchFilter?.value || null;
        const filterBranchId = selectedBranchId || (isMasterAdmin ? null : currentBranchId);
        const viewAllBranches = isMasterAdmin && !selectedBranchId;
        
        const items = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Filtrado estricto por sucursal si hay un filtro específico
        let filteredItems = items;
        if (filterBranchId) {
            const normalizedFilterBranchId = String(filterBranchId);
            filteredItems = items.filter(item => {
                if (!item.branch_id) return false;
                return String(item.branch_id) === normalizedFilterBranchId;
            });
        }
        
        let employees = await DB.getAll('employees', null, null, { 
            filterByBranch: !viewAllBranches, 
            branchIdField: 'branch_id' 
        }) || [];
        
        // Si no es admin, filtrar manualmente también
        if (!viewAllBranches && filterBranchId) {
            const normalizedBranchId = String(filterBranchId);
            employees = employees.filter(emp => {
                if (emp.branch_id) {
                    return String(emp.branch_id) === normalizedBranchId;
                }
                if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                    return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                }
                return false; // Excluir empleados sin branch_id cuando hay filtro
            });
        }
        
        // Sellers, guides y agencies no tienen branch_id, se muestran todos
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];

        const suppliers = await DB.getAll('suppliers') || [];
        const filteredSuppliers = filterBranchId ? suppliers.filter(s => {
            if (s.branch_id) return String(s.branch_id) === String(filterBranchId);
            return s.is_shared === true;
        }) : suppliers;

        const all = [
            ...filteredItems.map(i => ({ ...i, type: 'item' })),
            ...employees.map(e => ({ ...e, type: 'employee' })),
            ...sellers.map(s => ({ ...s, type: 'seller' })),
            ...guides.map(g => ({ ...g, type: 'guide' })),
            ...agencies.map(a => ({ ...a, type: 'agency' })),
            ...filteredSuppliers.map(s => ({ ...s, type: 'supplier' }))
        ];

        const barcodeMap = {};
        all.forEach(item => {
            if (!Utils.isBarcodeEmpty(item.barcode)) {
                if (!barcodeMap[item.barcode]) {
                    barcodeMap[item.barcode] = [];
                }
                barcodeMap[item.barcode].push(item);
            }
        });

        return Object.entries(barcodeMap)
            .filter(([barcode, items]) => items.length > 1)
            .map(([barcode, items]) => ({
                barcode,
                count: items.length,
                items: items.map(i => ({ id: i.id, name: i.name, type: i.type }))
            }));
    },

    async getPrintTemplates() {
        const templates = await DB.getAll('barcode_print_templates') || [];
        if (templates.length === 0) {
            // Crear plantillas por defecto
            const defaultTemplates = [
                {
                    id: 'standard',
                    name: 'Estándar',
                    description: 'Etiqueta estándar con código de barras y nombre',
                    width: 58,
                    height: 40,
                    fields: ['name', 'barcode', 'price']
                },
                {
                    id: 'compact',
                    name: 'Compacta',
                    description: 'Etiqueta compacta solo con código de barras',
                    width: 58,
                    height: 25,
                    fields: ['barcode']
                },
                {
                    id: 'detailed',
                    name: 'Detallada',
                    description: 'Etiqueta completa con toda la información',
                    width: 58,
                    height: 60,
                    fields: ['name', 'sku', 'barcode', 'price', 'metal', 'stone']
                }
            ];
            return defaultTemplates;
        }
        return templates;
    },

    async getBarcodeSettings() {
        const settings = await DB.get('settings', 'barcode_settings');
        return settings?.value || {
            format: 'CODE128',
            width: 2,
            height: 50,
            displayValue: true,
            qrEnabled: false,
            qrSize: 200,
            qrContentType: 'barcode',
            scanHistoryEnabled: true,
            scanHistoryDays: 30,
            validateOnGenerate: true,
            checkDuplicates: true,
            autoFixDuplicates: false
        };
    },

    async saveBarcodeSettings() {
        // Verificar que los elementos existan
        const formatEl = document.getElementById('barcode-format');
        const widthEl = document.getElementById('barcode-width');
        const heightEl = document.getElementById('barcode-height');
        const displayValueEl = document.getElementById('barcode-display-value');
        const qrEnabledEl = document.getElementById('qr-enabled');
        const qrSizeEl = document.getElementById('qr-size');
        const qrContentTypeEl = document.getElementById('qr-content-type');
        const scanHistoryEnabledEl = document.getElementById('scan-history-enabled');
        const scanHistoryDaysEl = document.getElementById('scan-history-days');
        const validateOnGenerateEl = document.getElementById('validate-on-generate');
        const checkDuplicatesEl = document.getElementById('check-duplicates');
        const autoFixDuplicatesEl = document.getElementById('auto-fix-duplicates');
        
        const settings = {
            format: formatEl?.value || 'CODE128',
            width: parseFloat(widthEl?.value || 2),
            height: parseFloat(heightEl?.value || 50),
            displayValue: displayValueEl?.checked || false,
            qrEnabled: qrEnabledEl?.checked || false,
            qrSize: parseInt(qrSizeEl?.value || 200),
            qrContentType: qrContentTypeEl?.value || 'barcode',
            scanHistoryEnabled: scanHistoryEnabledEl?.checked || false,
            scanHistoryDays: parseInt(scanHistoryDaysEl?.value || 30),
            validateOnGenerate: validateOnGenerateEl?.checked || false,
            checkDuplicates: checkDuplicatesEl?.checked || false,
            autoFixDuplicates: autoFixDuplicatesEl?.checked || false
        };

        try {
            await DB.put('settings', {
                key: 'barcode_settings',
                value: settings,
                updated_at: new Date().toISOString()
            });

            Utils.showNotification('Configuración guardada', 'success');
        } catch (e) {
            console.error('Error saving barcode settings:', e);
            Utils.showNotification('Error al guardar configuración: ' + e.message, 'error');
        }
    },

    async loadScanHistory() {
        const container = document.getElementById('scan-history-list');
        if (!container) return;

        const search = document.getElementById('scan-history-search')?.value.toLowerCase() || '';
        const filter = document.getElementById('scan-history-filter')?.value || 'all';

        let history = await DB.getAll('barcode_scan_history') || [];
        
        // Aplicar filtro de fecha
        const now = new Date();
        if (filter === 'today') {
            const today = Utils.formatDate(now, 'YYYY-MM-DD');
            history = history.filter(h => h.timestamp?.startsWith(today));
        } else if (filter === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            history = history.filter(h => new Date(h.timestamp) >= weekAgo);
        } else if (filter === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            history = history.filter(h => new Date(h.timestamp) >= monthAgo);
        }

        // Aplicar búsqueda
        if (search) {
            history = history.filter(h => 
                h.barcode?.toLowerCase().includes(search) ||
                h.context?.toLowerCase().includes(search) ||
                h.itemName?.toLowerCase().includes(search)
            );
        }

        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay escaneos registrados</div>';
            return;
        }

        container.innerHTML = `
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Fecha/Hora</th>
                        <th>Código</th>
                        <th>Contexto</th>
                        <th>Elemento</th>
                        <th>Tipo</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(scan => `
                        <tr>
                            <td style="font-size: 10px;">${Utils.formatDate(scan.timestamp, 'DD/MM/YYYY HH:mm:ss')}</td>
                            <td><code style="font-size: 10px;">${scan.barcode}</code></td>
                            <td style="font-size: 10px;">${scan.context || 'Genérico'}</td>
                            <td style="font-size: 10px;">${scan.itemName || 'N/A'}</td>
                            <td><span class="status-badge status-${scan.type || 'disponible'}" style="font-size: 9px;">${scan.type || 'N/A'}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    async clearScanHistory() {
        if (!await Utils.confirm('¿Eliminar todo el historial de escaneos?')) {
            return;
        }

        const history = await DB.getAll('barcode_scan_history') || [];
        for (const scan of history) {
            await DB.delete('barcode_scan_history', scan.id);
        }

        Utils.showNotification('Historial eliminado', 'success');
        await this.loadScanHistory();
    },

    async fixDuplicates() {
        const duplicates = await this.findDuplicateBarcodes();
        if (duplicates.length === 0) {
            Utils.showNotification('No hay duplicados para corregir', 'info');
            return;
        }

        if (!await Utils.confirm(`Se encontraron ${duplicates.length} códigos duplicados. ¿Corregirlos automáticamente?`)) {
            return;
        }

        let fixed = 0;
        for (const dup of duplicates) {
            // Mantener el primero y regenerar los demás
            for (let i = 1; i < dup.items.length; i++) {
                const item = dup.items[i];
                let entity;
                
                try {
                    switch(item.type) {
                        case 'item':
                            entity = await DB.get('inventory_items', item.id);
                            if (entity) {
                                entity.barcode = entity.sku || `ITEM${entity.id.substring(0, 8).toUpperCase()}`;
                                await DB.put('inventory_items', entity);
                            }
                            break;
                        case 'employee':
                            entity = await DB.get('employees', item.id);
                            if (entity) {
                                entity.barcode = entity.employee_code || `EMP${entity.id.substring(0, 6).toUpperCase()}`;
                                await DB.put('employees', entity);
                            }
                            break;
                        case 'seller':
                            entity = await DB.get('catalog_sellers', item.id);
                            if (entity) {
                                entity.barcode = Utils.generateSellerBarcode(entity);
                                await DB.put('catalog_sellers', entity);
                            }
                            break;
                        case 'guide':
                            entity = await DB.get('catalog_guides', item.id);
                            if (entity) {
                                entity.barcode = Utils.generateGuideBarcode(entity);
                                await DB.put('catalog_guides', entity);
                            }
                            break;
                        case 'agency':
                            entity = await DB.get('catalog_agencies', item.id);
                            if (entity) {
                                entity.barcode = Utils.generateAgencyBarcode(entity);
                                await DB.put('catalog_agencies', entity);
                            }
                            break;
                    }
                    fixed++;
                } catch (e) {
                    console.error(`Error corrigiendo duplicado ${item.id}:`, e);
                }
            }
        }

        Utils.showNotification(`${fixed} duplicados corregidos`, 'success');
        await this.loadTab('overview');
    },

    async recordScan(barcode, context, itemName, type) {
        const settings = await this.getBarcodeSettings();
        if (!settings.scanHistoryEnabled) return;

        const scan = {
            id: Utils.generateId(),
            barcode,
            context,
            itemName,
            type,
            timestamp: new Date().toISOString()
        };

        await DB.add('barcode_scan_history', scan);

        // Limpiar escaneos antiguos
        const history = await DB.getAll('barcode_scan_history') || [];
        const cutoffDate = new Date(Date.now() - settings.scanHistoryDays * 24 * 60 * 60 * 1000);
        for (const oldScan of history) {
            if (new Date(oldScan.timestamp) < cutoffDate) {
                await DB.delete('barcode_scan_history', oldScan.id);
            }
        }
    },

    async loadMoreBarcodes(type) {
        this._displayLimits[type] = (this._displayLimits[type] || this.BARCODES_BATCH_SIZE) + this.BARCODES_BATCH_SIZE;
        await this.loadBarcodes({ loadMoreFor: type });
    },

    async loadBarcodes(options = {}) {
        const container = document.getElementById('barcodes-list');
        if (!container) {
            return;
        }

        try {
            const search = document.getElementById('barcodes-search')?.value.toLowerCase() || '';
            const typeFilter = document.getElementById('barcodes-type-filter')?.value || 'all';
            const statusFilter = document.getElementById('barcodes-status-filter')?.value || 'all';
            
            // Obtener filtro de sucursal
            const branchFilter = document.getElementById('barcodes-branch-filter');
            const selectedBranchId = branchFilter?.value === 'all' ? null : branchFilter?.value || null;
            
            // Obtener sucursal actual y permisos
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Determinar qué sucursal usar para filtrar
            // CRÍTICO: Si hay un filtro seleccionado, usarlo. Si no, y no es master admin, usar sucursal actual
            let filterBranchId = null;
            if (selectedBranchId) {
                // Hay un filtro específico seleccionado
                filterBranchId = selectedBranchId;
            } else if (!isMasterAdmin) {
                // No es master admin y no hay filtro = usar sucursal actual
                filterBranchId = currentBranchId;
            } else {
                // Master admin sin filtro = ver todas (null)
                filterBranchId = null;
            }
            const viewAllBranches = isMasterAdmin && !selectedBranchId;
            
            console.log(`📍 Barcodes: Filtro de sucursal - selectedBranchId: ${selectedBranchId}, currentBranchId: ${currentBranchId}, filterBranchId: ${filterBranchId}, isMasterAdmin: ${isMasterAdmin}`);

            // Paginación: resetear límites si cambió el filtro; loadMoreBarcodes ya incrementó si aplica
            const filterKey = `${search}|${typeFilter}|${statusFilter}|${selectedBranchId || 'all'}`;
            if (!options.loadMoreFor && filterKey !== this._lastFilterKey) {
                this._lastFilterKey = filterKey;
                this._displayLimits = {
                    items: this.BARCODES_BATCH_SIZE,
                    employees: this.BARCODES_BATCH_SIZE,
                    sellers: this.BARCODES_BATCH_SIZE,
                    guides: this.BARCODES_BATCH_SIZE,
                    agencies: this.BARCODES_BATCH_SIZE,
                    suppliers: this.BARCODES_BATCH_SIZE
                };
            }

            let items = [];
            let employees = [];
            let sellers = [];
            let guides = [];
            let agencies = [];
            let suppliers = [];

            // Cargar productos con filtrado por sucursal
            if (typeFilter === 'all' || typeFilter === 'items') {
                // Obtener todos los items primero (sin filtro automático para tener control total)
                items = await DB.getAll('inventory_items') || [];
                
                // Filtrado ESTRICTO por sucursal
                if (filterBranchId) {
                    // Hay un filtro específico de sucursal - filtrar estrictamente
                    const normalizedFilterBranchId = String(filterBranchId);
                    const beforeFilter = items.length;
                    items = items.filter(item => {
                        // CRÍTICO: Excluir items sin branch_id cuando hay filtro específico
                        if (!item.branch_id) {
                            return false;
                        }
                        return String(item.branch_id) === normalizedFilterBranchId;
                    });
                    console.log(`📍 Barcodes: Filtrado estricto productos: ${beforeFilter} → ${items.length} (sucursal: ${filterBranchId})`);
                } else if (viewAllBranches) {
                    // Master admin viendo todas las sucursales - mostrar todos (incluyendo sin branch_id)
                    console.log(`📍 Barcodes: Mostrando todos los productos (master admin)`);
                } else {
                    // Sin sucursal asignada o usuario normal sin branch_id = no mostrar nada
                    items = [];
                    console.log(`📍 Barcodes: Sin sucursal asignada: 0 productos`);
                }
                
                if (search) {
                    items = items.filter(item => 
                        item.sku?.toLowerCase().includes(search) ||
                        item.name?.toLowerCase().includes(search) ||
                        item.barcode?.includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    items = items.filter(item => !Utils.isBarcodeEmpty(item.barcode));
                } else if (statusFilter === 'without') {
                    items = items.filter(item => Utils.isBarcodeEmpty(item.barcode));
                }
            }

            // Cargar empleados con filtrado por sucursal
            if (typeFilter === 'all' || typeFilter === 'employees') {
                // Obtener todos los empleados primero
                employees = await DB.getAll('employees') || [];
                
                // Filtrado ESTRICTO por sucursal
                if (filterBranchId) {
                    const normalizedBranchId = String(filterBranchId);
                    const beforeFilter = employees.length;
                    employees = employees.filter(emp => {
                        // Si tiene branch_id único, comparar directamente
                        if (emp.branch_id) {
                            return String(emp.branch_id) === normalizedBranchId;
                        }
                        // Si tiene branch_ids múltiples, verificar si incluye el filtro
                        if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                            return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                        }
                        // Excluir empleados sin branch_id cuando hay filtro específico
                        return false;
                    });
                    console.log(`📍 Barcodes: Filtrado estricto empleados: ${beforeFilter} → ${employees.length} (sucursal: ${filterBranchId})`);
                } else if (!viewAllBranches && currentBranchId) {
                    // Si no es master admin y hay sucursal actual, filtrar por ella
                    const normalizedCurrentBranchId = String(currentBranchId);
                    const beforeFilter = employees.length;
                    employees = employees.filter(emp => {
                        if (emp.branch_id) {
                            return String(emp.branch_id) === normalizedCurrentBranchId;
                        }
                        if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                            return emp.branch_ids.some(id => String(id) === normalizedCurrentBranchId);
                        }
                        return false;
                    });
                    console.log(`📍 Barcodes: Filtrado empleados por sucursal actual: ${beforeFilter} → ${employees.length} (sucursal: ${currentBranchId})`);
                } else if (viewAllBranches) {
                    // Master admin viendo todas las sucursales
                    console.log(`📍 Barcodes: Mostrando todos los empleados (master admin)`);
                } else {
                    // Sin sucursal asignada = no mostrar nada
                    employees = [];
                    console.log(`📍 Barcodes: Sin sucursal asignada: 0 empleados`);
                }
                
                if (search) {
                    employees = employees.filter(emp => 
                        emp.name?.toLowerCase().includes(search) ||
                        emp.barcode?.includes(search) ||
                        emp.employee_code?.toLowerCase().includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    employees = employees.filter(emp => !Utils.isBarcodeEmpty(emp.barcode));
                } else if (statusFilter === 'without') {
                    employees = employees.filter(emp => Utils.isBarcodeEmpty(emp.barcode));
                }
            }

            // Cargar vendedores
            if (typeFilter === 'all' || typeFilter === 'sellers') {
                sellers = await DB.getAll('catalog_sellers') || [];
                if (search) {
                    sellers = sellers.filter(seller => 
                        seller.name?.toLowerCase().includes(search) ||
                        seller.barcode?.includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    sellers = sellers.filter(s => !Utils.isBarcodeEmpty(s.barcode));
                } else if (statusFilter === 'without') {
                    sellers = sellers.filter(s => Utils.isBarcodeEmpty(s.barcode));
                }
            }

            // Cargar guías
            if (typeFilter === 'all' || typeFilter === 'guides') {
                guides = await DB.getAll('catalog_guides') || [];
                if (search) {
                    guides = guides.filter(guide => 
                        guide.name?.toLowerCase().includes(search) ||
                        guide.barcode?.includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    guides = guides.filter(g => !Utils.isBarcodeEmpty(g.barcode));
                } else if (statusFilter === 'without') {
                    guides = guides.filter(g => Utils.isBarcodeEmpty(g.barcode));
                }
            }

            // Cargar agencias
            if (typeFilter === 'all' || typeFilter === 'agencies') {
                agencies = await DB.getAll('catalog_agencies') || [];
                if (search) {
                    agencies = agencies.filter(agency => 
                        agency.name?.toLowerCase().includes(search) ||
                        agency.barcode?.includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    agencies = agencies.filter(a => !Utils.isBarcodeEmpty(a.barcode));
                } else if (statusFilter === 'without') {
                    agencies = agencies.filter(a => Utils.isBarcodeEmpty(a.barcode));
                }
            }

            // Cargar proveedores
            if (typeFilter === 'all' || typeFilter === 'suppliers') {
                console.log('🔍 Cargando proveedores, typeFilter:', typeFilter);
                suppliers = await DB.getAll('suppliers') || [];
                console.log('📦 Proveedores encontrados:', suppliers.length);
                
                // Filtrar por sucursal si aplica
                if (filterBranchId) {
                    const normalizedBranchId = String(filterBranchId);
                    suppliers = suppliers.filter(supplier => {
                        if (supplier.branch_id) {
                            return String(supplier.branch_id) === normalizedBranchId;
                        }
                        // Si es compartido, mostrarlo siempre
                        return supplier.is_shared === true;
                    });
                } else if (!viewAllBranches && currentBranchId) {
                    const normalizedCurrentBranchId = String(currentBranchId);
                    suppliers = suppliers.filter(supplier => {
                        if (supplier.branch_id) {
                            return String(supplier.branch_id) === normalizedCurrentBranchId;
                        }
                        return supplier.is_shared === true;
                    });
                }
                
                if (search) {
                    suppliers = suppliers.filter(supplier => 
                        supplier.name?.toLowerCase().includes(search) ||
                        supplier.code?.toLowerCase().includes(search) ||
                        supplier.barcode?.includes(search)
                    );
                }
                if (statusFilter === 'with') {
                    suppliers = suppliers.filter(s => !Utils.isBarcodeEmpty(s.barcode));
                } else if (statusFilter === 'without') {
                    suppliers = suppliers.filter(s => Utils.isBarcodeEmpty(s.barcode));
                }
            }

            if (items.length === 0 && employees.length === 0 && sellers.length === 0 && guides.length === 0 && agencies.length === 0 && suppliers.length === 0) {
                container.innerHTML = '<div class="empty-state">No se encontraron códigos de barras</div>';
                return;
            }

            const limitItems = this._displayLimits.items || this.BARCODES_BATCH_SIZE;
            const limitEmployees = this._displayLimits.employees || this.BARCODES_BATCH_SIZE;
            const limitSellers = this._displayLimits.sellers || this.BARCODES_BATCH_SIZE;
            const limitGuides = this._displayLimits.guides || this.BARCODES_BATCH_SIZE;
            const limitAgencies = this._displayLimits.agencies || this.BARCODES_BATCH_SIZE;
            const limitSuppliers = this._displayLimits.suppliers || this.BARCODES_BATCH_SIZE;

            const itemsToShow = items.slice(0, limitItems);
            const employeesToShow = employees.slice(0, limitEmployees);
            const sellersToShow = sellers.slice(0, limitSellers);
            const guidesToShow = guides.slice(0, limitGuides);
            const agenciesToShow = agencies.slice(0, limitAgencies);
            const suppliersToShow = suppliers.slice(0, limitSuppliers);

            let html = '';

            // Mostrar productos con contador y acciones (solo si el filtro es 'all' o 'items')
            if (items.length > 0 && (typeFilter === 'all' || typeFilter === 'items')) {
                const itemsWithoutBarcode = items.filter(item => Utils.isBarcodeEmpty(item.barcode)).length;
                const hasMore = items.length > limitItems;
                html += `
                    <div class="barcodes-section" data-type="items">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-box"></i> Productos <span class="barcode-count">(${items.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${itemsWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-items-${Date.now()}" data-action="generate-items" data-count="${itemsWithoutBarcode}">
                                        Generar ${itemsWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('items', [${items.filter(i => !Utils.isBarcodeEmpty(i.barcode)).map(i => `'${i.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${itemsToShow.map(item => this.renderBarcodeCard(item, 'item')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('items')">Ver más (${items.length - limitItems} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            // Mostrar empleados con contador y acciones (solo si el filtro es 'all' o 'employees')
            if (employees.length > 0 && (typeFilter === 'all' || typeFilter === 'employees')) {
                const employeesWithoutBarcode = employees.filter(emp => Utils.isBarcodeEmpty(emp.barcode)).length;
                const hasMore = employees.length > limitEmployees;
                html += `
                    <div class="barcodes-section" data-type="employees">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-user-tie"></i> Empleados <span class="barcode-count">(${employees.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${employeesWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-employees-${Date.now()}" data-action="generate-employees" data-count="${employeesWithoutBarcode}">
                                        Generar ${employeesWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('employees', [${employees.filter(e => !Utils.isBarcodeEmpty(e.barcode)).map(e => `'${e.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${employeesToShow.map(emp => this.renderBarcodeCard(emp, 'employee')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('employees')">Ver más (${employees.length - limitEmployees} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            // Mostrar vendedores con contador y acciones (solo si el filtro es 'all' o 'sellers')
            if (sellers.length > 0 && (typeFilter === 'all' || typeFilter === 'sellers')) {
                const sellersWithoutBarcode = sellers.filter(s => Utils.isBarcodeEmpty(s.barcode)).length;
                const hasMore = sellers.length > limitSellers;
                html += `
                    <div class="barcodes-section" data-type="sellers">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-user-tag"></i> Vendedores <span class="barcode-count">(${sellers.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${sellersWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-sellers-${Date.now()}" data-action="generate-sellers" data-count="${sellersWithoutBarcode}">
                                        Generar ${sellersWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('sellers', [${sellers.filter(s => !Utils.isBarcodeEmpty(s.barcode)).map(s => `'${s.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${sellersToShow.map(seller => this.renderBarcodeCard(seller, 'seller')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('sellers')">Ver más (${sellers.length - limitSellers} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            // Mostrar guías con contador y acciones (solo si el filtro es 'all' o 'guides')
            if (guides.length > 0 && (typeFilter === 'all' || typeFilter === 'guides')) {
                const guidesWithoutBarcode = guides.filter(g => Utils.isBarcodeEmpty(g.barcode)).length;
                const hasMore = guides.length > limitGuides;
                html += `
                    <div class="barcodes-section" data-type="guides">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-suitcase"></i> Guías <span class="barcode-count">(${guides.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${guidesWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-guides-${Date.now()}" data-action="generate-guides" data-count="${guidesWithoutBarcode}">
                                        Generar ${guidesWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('guides', [${guides.filter(g => !Utils.isBarcodeEmpty(g.barcode)).map(g => `'${g.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${guidesToShow.map(guide => this.renderBarcodeCard(guide, 'guide')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('guides')">Ver más (${guides.length - limitGuides} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            // Mostrar agencias con contador y acciones (solo si el filtro es 'all' o 'agencies')
            if (agencies.length > 0 && (typeFilter === 'all' || typeFilter === 'agencies')) {
                const agenciesWithoutBarcode = agencies.filter(a => Utils.isBarcodeEmpty(a.barcode)).length;
                const hasMore = agencies.length > limitAgencies;
                html += `
                    <div class="barcodes-section" data-type="agencies">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-building"></i> Agencias <span class="barcode-count">(${agencies.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${agenciesWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-agencies-${Date.now()}" data-action="generate-agencies" data-count="${agenciesWithoutBarcode}">
                                        Generar ${agenciesWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('agencies', [${agencies.filter(a => !Utils.isBarcodeEmpty(a.barcode)).map(a => `'${a.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${agenciesToShow.map(agency => this.renderBarcodeCard(agency, 'agency')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('agencies')">Ver más (${agencies.length - limitAgencies} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            // Mostrar proveedores con contador y acciones (solo si el filtro es 'all' o 'suppliers')
            if (suppliers.length > 0 && (typeFilter === 'all' || typeFilter === 'suppliers')) {
                const suppliersWithoutBarcode = suppliers.filter(s => Utils.isBarcodeEmpty(s.barcode)).length;
                const hasMore = suppliers.length > limitSuppliers;
                html += `
                    <div class="barcodes-section" data-type="suppliers">
                        <div class="barcodes-section-header">
                            <h3><i class="fas fa-truck"></i> Proveedores <span class="barcode-count">(${suppliers.length})</span></h3>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                ${suppliersWithoutBarcode > 0 ? `
                                    <button class="btn-secondary btn-sm" id="btn-gen-suppliers-${Date.now()}" data-action="generate-suppliers" data-count="${suppliersWithoutBarcode}">
                                        Generar ${suppliersWithoutBarcode} Faltantes
                                    </button>
                                ` : ''}
                                <button class="btn-primary btn-sm" onclick="window.BarcodesModule.batchPrint('suppliers', [${suppliers.filter(s => !Utils.isBarcodeEmpty(s.barcode)).map(s => `'${s.id}'`).join(',')}])">
                                    <i class="fas fa-print"></i> Imprimir Todos
                                </button>
                            </div>
                        </div>
                        <div class="barcodes-grid">
                            ${suppliersToShow.map(supplier => this.renderBarcodeCard(supplier, 'supplier')).join('')}
                        </div>
                        ${hasMore ? `<div style="margin-top: var(--spacing-sm); text-align: center;"><button class="btn-secondary btn-sm" onclick="window.BarcodesModule.loadMoreBarcodes('suppliers')">Ver más (${suppliers.length - limitSuppliers} restantes)</button></div>` : ''}
                    </div>
                `;
            }

            container.innerHTML = html;

            // Configurar event listeners para botones de generación masiva
            container.querySelectorAll('[data-action^="generate-"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const action = btn.dataset.action;
                    e.preventDefault();
                    e.stopPropagation();
                    
                    try {
                        if (action === 'generate-items') {
                            await this.generateAllItemBarcodes();
                        } else if (action === 'generate-employees') {
                            await this.generateAllEmployeeBarcodes();
                        } else if (action === 'generate-sellers') {
                            await this.generateAllSellerBarcodes();
                        } else if (action === 'generate-guides') {
                            await this.generateAllGuideBarcodes();
                        } else if (action === 'generate-agencies') {
                            await this.generateAllAgencyBarcodes();
                        } else if (action === 'generate-suppliers') {
                            await this.generateAllSupplierBarcodes();
                        }
                    } catch (error) {
                        console.error('Error en generación masiva:', error);
                        Utils.showNotification('Error al generar códigos de barras', 'error');
                    }
                });
            });

            // Configurar selección múltiple
            const selectAllCheckbox = document.getElementById('barcodes-select-all');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => {
                    const checkboxes = container.querySelectorAll('.barcode-select-checkbox');
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                });
            }

            // Configurar selector de sucursal ANTES de cargar datos
            await this.setupBranchFilter();
            
            // Los event listeners se configuran en setupBarcodesTabListeners() al cargar el tab
            // Re-aplicar por si el DOM fue reconstruido (ej. selección múltiple)
            this.setupBarcodesTabListeners();

            // Generar códigos de barras en lotes para evitar trabar la UI
            const settings = await this.getBarcodeSettings();
            const format = settings.format || 'CODE128';
            const barcodeOpts = { width: settings.width, height: settings.height, displayValue: settings.displayValue };

            const batches = [
                itemsToShow.filter(i => !Utils.isBarcodeEmpty(i.barcode)).map(i => ({ barcode: i.barcode, id: `barcode-item-${i.id}` })),
                employeesToShow.filter(e => !Utils.isBarcodeEmpty(e.barcode)).map(e => ({ barcode: e.barcode, id: `barcode-emp-${e.id}` })),
                sellersToShow.filter(s => !Utils.isBarcodeEmpty(s.barcode)).map(s => ({ barcode: s.barcode, id: `barcode-seller-${s.id}` })),
                guidesToShow.filter(g => !Utils.isBarcodeEmpty(g.barcode)).map(g => ({ barcode: g.barcode, id: `barcode-guide-${g.id}` })),
                agenciesToShow.filter(a => !Utils.isBarcodeEmpty(a.barcode)).map(a => ({ barcode: a.barcode, id: `barcode-agency-${a.id}` })),
                suppliersToShow.filter(s => !Utils.isBarcodeEmpty(s.barcode)).map(s => ({ barcode: s.barcode, id: `barcode-supplier-${s.id}` }))
            ].flat();

            const BATCH_SIZE = 10;
            for (let i = 0; i < batches.length; i += BATCH_SIZE) {
                const batch = batches.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(b => 
                    BarcodeManager.generateBarcode(b.barcode, b.id, format, barcodeOpts).catch(err => {
                        console.warn(`Error generando código ${b.id}:`, err?.message);
                    })
                ));
                await new Promise(r => requestAnimationFrame(r));
            }

        } catch (e) {
            console.error('Error loading barcodes:', e);
            container.innerHTML = '<div class="empty-state">Error al cargar códigos de barras</div>';
        }
    },

    renderBarcodeCard(item, type) {
        const id = item.id;
        const name = item.name || 'Sin nombre';
        let code = '';
        let barcodeId = '';
        
        if (type === 'item') {
            code = item.sku || 'N/A';
            barcodeId = `barcode-item-${id}`;
        } else if (type === 'employee') {
            code = item.employee_code || 'N/A';
            barcodeId = `barcode-emp-${id}`;
        } else if (type === 'seller') {
            code = item.id || 'N/A';
            barcodeId = `barcode-seller-${id}`;
        } else if (type === 'guide') {
            code = item.id || 'N/A';
            barcodeId = `barcode-guide-${id}`;
        } else if (type === 'agency') {
            code = item.id || 'N/A';
            barcodeId = `barcode-agency-${id}`;
        } else if (type === 'supplier') {
            code = item.code || 'N/A';
            barcodeId = `barcode-supplier-${id}`;
        }
        
        const barcode = item.barcode || 'Sin código';
        const hasBarcode = !Utils.isBarcodeEmpty(barcode);

        return `
            <div class="barcode-card ${!hasBarcode ? 'barcode-card-missing' : ''}" data-type="${type}" data-id="${id}">
                <div class="barcode-card-header-compact" style="display: flex; align-items: center; gap: var(--spacing-xs);">
                    <input type="checkbox" class="barcode-select-checkbox" data-type="${type}" data-id="${id}" style="cursor: pointer;">
                    <div style="flex: 1;">
                        <div class="barcode-card-name-compact">${name}</div>
                        <div class="barcode-card-code-compact">${
                            type === 'item' ? 'SKU' : 
                            type === 'employee' ? 'Código' : 
                            type === 'seller' ? 'ID' : 
                            type === 'guide' ? 'ID' : 
                            type === 'supplier' ? 'Código' :
                            'ID'
                        }: ${code}</div>
                    </div>
                </div>
                <div class="barcode-card-body-compact">
                    <div class="barcode-preview-compact">
                        ${hasBarcode ? 
                            `<svg id="${barcodeId}" class="barcode-svg-compact"></svg>` :
                            '<div class="barcode-placeholder-compact">Sin código</div>'
                        }
                    </div>
                    <div class="barcode-value-compact">${barcode}</div>
                    ${hasBarcode ? `
                        <div style="font-size: 9px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            <button class="btn-link btn-xs" onclick="window.BarcodesModule.generateQR('${id}', '${type}')" title="Generar QR">
                                <i class="fas fa-qrcode"></i> QR
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="barcode-card-actions-compact">
                    ${hasBarcode ? 
                        `<button class="btn-secondary btn-xs" onclick="window.BarcodesModule.printBarcode('${id}', '${type}')" title="Imprimir"><i class="fas fa-print"></i></button>` :
                        `<button class="btn-primary btn-xs" onclick="window.BarcodesModule.generateBarcode('${id}', '${type}')" title="Generar"><i class="fas fa-plus"></i></button>`
                    }
                    <button class="btn-secondary btn-xs" onclick="window.BarcodesModule.viewDetails('${id}', '${type}')" title="Ver detalles"><i class="fas fa-eye"></i></button>
                    <button class="btn-secondary btn-xs" onclick="window.BarcodesModule.editBarcode('${id}', '${type}')" title="Editar"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        `;
    },

    async generateBarcode(id, type) {
        try {
            const settings = await this.getBarcodeSettings();
            let entity, storeName, barcode;

            if (type === 'item') {
                entity = await DB.get('inventory_items', id);
                storeName = 'inventory_items';
                if (!entity) {
                    Utils.showNotification('Producto no encontrado', 'error');
                    return;
                }
                barcode = entity.barcode || entity.sku;
                if (!barcode) {
                    Utils.showNotification('El producto no tiene SKU', 'error');
                    return;
                }
            } else if (type === 'employee') {
                entity = await DB.get('employees', id);
                storeName = 'employees';
                if (!entity) {
                    Utils.showNotification('Empleado no encontrado', 'error');
                    return;
                }
                barcode = entity.barcode || entity.employee_code || `EMP${entity.id.substring(0, 6).toUpperCase()}`;
            } else if (type === 'seller') {
                entity = await DB.get('catalog_sellers', id);
                storeName = 'catalog_sellers';
                if (!entity) {
                    Utils.showNotification('Vendedor no encontrado', 'error');
                    return;
                }
                barcode = Utils.generateSellerBarcode(entity);
            } else if (type === 'guide') {
                entity = await DB.get('catalog_guides', id);
                storeName = 'catalog_guides';
                if (!entity) {
                    Utils.showNotification('Guía no encontrado', 'error');
                    return;
                }
                barcode = Utils.generateGuideBarcode(entity);
            } else if (type === 'agency') {
                entity = await DB.get('catalog_agencies', id);
                storeName = 'catalog_agencies';
                if (!entity) {
                    Utils.showNotification('Agencia no encontrada', 'error');
                    return;
                }
                barcode = Utils.generateAgencyBarcode(entity);
            } else if (type === 'supplier') {
                entity = await DB.get('suppliers', id);
                storeName = 'suppliers';
                if (!entity) {
                    Utils.showNotification('Proveedor no encontrado', 'error');
                    return;
                }
                barcode = entity.barcode || entity.code || `PROV${entity.id.substring(0, 6).toUpperCase()}`;
            } else {
                Utils.showNotification('Tipo no válido', 'error');
                return;
            }

            // Validar si está habilitado
            if (settings.validateOnGenerate) {
                const isValid = await this.validateBarcode(barcode, settings.format);
                if (!isValid) {
                    Utils.showNotification('El código generado no es válido para el formato seleccionado', 'warning');
                }
            }

            // Verificar duplicados si está habilitado
            if (settings.checkDuplicates) {
                const duplicates = await this.checkBarcodeDuplicate(barcode, id, type);
                if (duplicates.length > 0) {
                    if (settings.autoFixDuplicates) {
                        // Generar código único
                        barcode = `${barcode}_${Date.now().toString().slice(-6)}`;
                    } else {
                        if (!await Utils.confirm(`Este código ya está en uso. ¿Continuar de todas formas?`)) {
                            return;
                        }
                    }
                }
            }

            entity.barcode = barcode;
            await DB.put(storeName, entity);

            // Agregar a cola de sincronización si aplica
            if (type === 'seller' && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('catalog_seller', id);
            } else if (type === 'guide' && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('catalog_guide', id);
            } else if (type === 'agency' && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('catalog_agency', id);
            } else if (type === 'supplier' && typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('supplier', id);
            }

            Utils.showNotification('Código de barras generado', 'success');
            await this.loadBarcodes();
        } catch (e) {
            console.error('Error generating barcode:', e);
            Utils.showNotification('Error al generar código de barras', 'error');
        }
    },

    async printBarcode(id, type) {
        try {
            if (type === 'item') {
                // Para items de inventario, usar JewelryLabelEditor (sistema exclusivo para joyas)
                const item = await DB.get('inventory_items', id);
                if (item && item.barcode) {
                    // Verificar si JewelryLabelEditor está disponible
                    if (typeof JewelryLabelEditor !== 'undefined' && JewelryLabelEditor.printJewelryLabel) {
                        await JewelryLabelEditor.printJewelryLabel(id);
                    } else {
                        Utils.showNotification('Sistema de etiquetas de joyas no disponible', 'error');
                    }
                }
            } else if (type === 'employee') {
                // Para empleados/usuarios, usar BarcodeManager (sistema genérico)
                const emp = await DB.get('employees', id);
                if (emp && emp.barcode) {
                    await BarcodeManager.printBarcodeLabel({
                        name: emp.name,
                        barcode: emp.barcode,
                        sku: emp.employee_code || 'EMP'
                    });
                }
            }
        } catch (e) {
            console.error('Error printing barcode:', e);
            Utils.showNotification('Error al imprimir código de barras', 'error');
        }
    },

    async viewDetails(id, type) {
        try {
            if (type === 'item') {
                if (window.Inventory && window.Inventory.showItemDetails) {
                    await window.Inventory.showItemDetails(id);
                } else {
                    const item = await DB.get('inventory_items', id);
                    if (item) {
                        const body = `
                            <div style="padding: var(--spacing-md);">
                                <p><strong>SKU:</strong> ${item.sku || 'N/A'}</p>
                                <p><strong>Nombre:</strong> ${item.name || 'N/A'}</p>
                                <p><strong>Código de Barras:</strong> ${item.barcode || 'Sin código'}</p>
                                <p><strong>Metal:</strong> ${item.metal || 'N/A'}</p>
                                <p><strong>Piedra:</strong> ${item.stone || 'N/A'}</p>
                                <p><strong>Peso:</strong> ${item.weight_g || 0}g</p>
                                <p><strong>Costo:</strong> ${Utils.formatCurrency(item.cost || 0)}</p>
                                <p><strong>Estado:</strong> ${item.status || 'N/A'}</p>
                            </div>
                        `;
                        UI.showModal(`Producto: ${item.sku}`, body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
                    }
                }
            } else if (type === 'employee') {
                if (window.Employees && window.Employees.showAddEmployeeForm) {
                    await window.Employees.showAddEmployeeForm(id);
                } else {
                    const emp = await DB.get('employees', id);
                    if (emp) {
                        const body = `
                            <div style="padding: var(--spacing-md);">
                                <p><strong>Nombre:</strong> ${emp.name || 'N/A'}</p>
                                <p><strong>Código:</strong> ${emp.employee_code || 'N/A'}</p>
                                <p><strong>Código de Barras:</strong> ${emp.barcode || 'Sin código'}</p>
                                <p><strong>Rol:</strong> ${emp.role || 'N/A'}</p>
                                <p><strong>Estado:</strong> ${emp.active ? 'Activo' : 'Inactivo'}</p>
                            </div>
                        `;
                        UI.showModal(`Empleado: ${emp.name}`, body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
                    }
                }
            }
        } catch (e) {
            console.error('Error viewing details:', e);
            Utils.showNotification('Error al cargar detalles', 'error');
        }
    },

    async showGenerateItemBarcode() {
        const items = await DB.getAll('inventory_items') || [];
        const itemsWithoutBarcode = items.filter(item => !item.barcode);

        if (itemsWithoutBarcode.length === 0) {
            Utils.showNotification('Todos los productos ya tienen código de barras', 'info');
            return;
        }

        const body = `
            <div style="padding: 20px;">
                <p>Se generarán códigos de barras para ${itemsWithoutBarcode.length} productos sin código.</p>
                <p><small>Se usará el SKU como código de barras.</small></p>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.BarcodesModule.generateAllItemBarcodes()">Generar Todos</button>
        `;

        UI.showModal('Generar Códigos de Barras - Productos', body, footer);
    },

    async generateAllItemBarcodes() {
        try {
            const items = await DB.getAll('inventory_items') || [];
            const itemsWithoutBarcode = items.filter(item => Utils.isBarcodeEmpty(item.barcode) && item.sku);
            
            if (itemsWithoutBarcode.length === 0) {
                Utils.showNotification('Todos los productos ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            Utils.showNotification(`Generando ${itemsWithoutBarcode.length} códigos de barras...`, 'info');

            for (const item of itemsWithoutBarcode) {
                try {
                    item.barcode = item.sku;
                    await DB.put('inventory_items', item);
                    generated++;
                } catch (e) {
                    console.error(`Error generando código para item ${item.id}:`, e);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados exitosamente`, 'success');
            await this.loadBarcodes();
        } catch (e) {
            console.error('Error generating all barcodes:', e);
            Utils.showNotification('Error al generar códigos de barras: ' + e.message, 'error');
        }
    },

    async showGenerateEmployeeBarcode() {
        const employees = await DB.getAll('employees') || [];
        const employeesWithoutBarcode = employees.filter(emp => !emp.barcode);

        if (employeesWithoutBarcode.length === 0) {
            Utils.showNotification('Todos los empleados ya tienen código de barras', 'info');
            return;
        }

        const body = `
            <div style="padding: 20px;">
                <p>Se generarán códigos de barras para ${employeesWithoutBarcode.length} empleados sin código.</p>
                <p><small>Se usará el código de empleado o se generará uno automáticamente.</small></p>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.BarcodesModule.generateAllEmployeeBarcodes()">Generar Todos</button>
        `;

        UI.showModal('Generar Códigos de Barras - Empleados', body, footer);
    },

    async generateAllEmployeeBarcodes() {
        try {
            const employees = await DB.getAll('employees') || [];
            const employeesWithoutBarcode = employees.filter(emp => Utils.isBarcodeEmpty(emp.barcode));
            
            if (employeesWithoutBarcode.length === 0) {
                Utils.showNotification('Todos los empleados ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            Utils.showNotification(`Generando ${employeesWithoutBarcode.length} códigos de barras...`, 'info');

            for (const emp of employeesWithoutBarcode) {
                try {
                    emp.barcode = emp.employee_code || `EMP${emp.id.substring(0, 6).toUpperCase()}`;
                    await DB.put('employees', emp);
                    generated++;
                } catch (e) {
                    console.error(`Error generando código para empleado ${emp.id}:`, e);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados exitosamente`, 'success');
            await this.loadBarcodes();
        } catch (e) {
            console.error('Error generating all employee barcodes:', e);
            Utils.showNotification('Error al generar códigos de barras: ' + e.message, 'error');
        }
    },

    async exportAllToPDF() {
        try {
            const items = await DB.getAll('inventory_items') || [];
            const employees = await DB.getAll('employees') || [];
            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];

            // Preparar datos para exportación
            const exportData = [];

            // Productos
            items.forEach(item => {
                exportData.push({
                    'Tipo': 'Producto',
                    'SKU/Código': item.sku || 'N/A',
                    'Nombre': item.name || 'Sin nombre',
                    'Código de Barras': item.barcode || 'Sin código'
                });
            });

            // Empleados
            employees.forEach(emp => {
                exportData.push({
                    'Tipo': 'Empleado',
                    'SKU/Código': emp.employee_code || 'N/A',
                    'Nombre': emp.name || 'Sin nombre',
                    'Código de Barras': emp.barcode || 'Sin código'
                });
            });

            // Vendedores
            sellers.forEach(seller => {
                exportData.push({
                    'Tipo': 'Vendedor',
                    'SKU/Código': seller.id || 'N/A',
                    'Nombre': seller.name || 'Sin nombre',
                    'Código de Barras': seller.barcode || 'Sin código'
                });
            });

            // Guías
            guides.forEach(guide => {
                exportData.push({
                    'Tipo': 'Guía',
                    'SKU/Código': guide.id || 'N/A',
                    'Nombre': guide.name || 'Sin nombre',
                    'Código de Barras': guide.barcode || 'Sin código'
                });
            });

            // Agencias
            agencies.forEach(agency => {
                exportData.push({
                    'Tipo': 'Agencia',
                    'SKU/Código': agency.id || 'N/A',
                    'Nombre': agency.name || 'Sin nombre',
                    'Código de Barras': agency.barcode || 'Sin código'
                });
            });

            const date = new Date().toISOString().split('T')[0];
            Utils.exportToPDF(exportData, `codigos_barras_${date}.pdf`, 'Códigos de Barras - Opal & Co');
        } catch (e) {
            console.error('Error exporting to PDF:', e);
            Utils.showNotification('Error al exportar PDF', 'error');
        }
    },

    async generateAllSellerBarcodes() {
        try {
            const sellers = await DB.getAll('catalog_sellers') || [];
            const sellersWithoutBarcode = sellers.filter(s => Utils.isBarcodeEmpty(s.barcode));
            
            if (sellersWithoutBarcode.length === 0) {
                Utils.showNotification('Todos los vendedores ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            Utils.showNotification(`Generando ${sellersWithoutBarcode.length} códigos de barras...`, 'info');

            for (const seller of sellersWithoutBarcode) {
                try {
                    seller.barcode = Utils.generateSellerBarcode(seller);
                    await DB.put('catalog_sellers', seller);
                    
                    // Verificar que se guardó
                    const saved = await DB.get('catalog_sellers', seller.id);
                    if (saved && saved.barcode === seller.barcode) {
                        generated++;
                        // Agregar a cola de sincronización
                        await SyncManager.addToQueue('catalog_seller', seller.id);
                    } else {
                        console.error(`Error: Código no se guardó para vendedor ${seller.id}`);
                    }
                } catch (e) {
                    console.error(`Error generando código para vendedor ${seller.id}:`, e);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados exitosamente`, 'success');
            await this.loadBarcodes();
            
            // Si el módulo de empleados está activo, recargarlo para mostrar los nuevos códigos
            if (window.Employees && window.Employees.currentTab) {
                const currentTab = window.Employees.currentTab;
                if (currentTab === 'sellers') {
                    await window.Employees.loadSellers();
                } else if (currentTab === 'guides') {
                    await window.Employees.loadGuides();
                } else if (currentTab === 'agencies') {
                    await window.Employees.loadAgencies();
                }
            }
        } catch (e) {
            console.error('Error generating all seller barcodes:', e);
            Utils.showNotification('Error al generar códigos de barras: ' + e.message, 'error');
        }
    },

    async generateAllGuideBarcodes() {
        try {
            const guides = await DB.getAll('catalog_guides') || [];
            const guidesWithoutBarcode = guides.filter(g => Utils.isBarcodeEmpty(g.barcode));
            
            if (guidesWithoutBarcode.length === 0) {
                Utils.showNotification('Todos los guías ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            Utils.showNotification(`Generando ${guidesWithoutBarcode.length} códigos de barras...`, 'info');

            for (const guide of guidesWithoutBarcode) {
                try {
                    guide.barcode = Utils.generateGuideBarcode(guide);
                    await DB.put('catalog_guides', guide);
                    
                    // Verificar que se guardó
                    const saved = await DB.get('catalog_guides', guide.id);
                    if (saved && saved.barcode === guide.barcode) {
                        generated++;
                        // Agregar a cola de sincronización
                        await SyncManager.addToQueue('catalog_guide', guide.id);
                    } else {
                        console.error(`Error: Código no se guardó para guía ${guide.id}`);
                    }
                } catch (e) {
                    console.error(`Error generando código para guía ${guide.id}:`, e);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados exitosamente`, 'success');
            await this.loadBarcodes();
            
            // Si el módulo de empleados está activo, recargarlo para mostrar los nuevos códigos
            if (window.Employees && window.Employees.currentTab) {
                const currentTab = window.Employees.currentTab;
                if (currentTab === 'sellers') {
                    await window.Employees.loadSellers();
                } else if (currentTab === 'guides') {
                    await window.Employees.loadGuides();
                } else if (currentTab === 'agencies') {
                    await window.Employees.loadAgencies();
                }
            }
        } catch (e) {
            console.error('Error generating all guide barcodes:', e);
            Utils.showNotification('Error al generar códigos de barras: ' + e.message, 'error');
        }
    },

    async generateAllAgencyBarcodes() {
        try {
            const agencies = await DB.getAll('catalog_agencies') || [];
            const agenciesWithoutBarcode = agencies.filter(a => Utils.isBarcodeEmpty(a.barcode));
            
            if (agenciesWithoutBarcode.length === 0) {
                Utils.showNotification('Todas las agencias ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            Utils.showNotification(`Generando ${agenciesWithoutBarcode.length} códigos de barras...`, 'info');

            for (const agency of agenciesWithoutBarcode) {
                try {
                    agency.barcode = Utils.generateAgencyBarcode(agency);
                    await DB.put('catalog_agencies', agency);
                    
                    // Verificar que se guardó
                    const saved = await DB.get('catalog_agencies', agency.id);
                    if (saved && saved.barcode === agency.barcode) {
                        generated++;
                        // Agregar a cola de sincronización
                        await SyncManager.addToQueue('catalog_agency', agency.id);
                    } else {
                        console.error(`Error: Código no se guardó para agencia ${agency.id}`);
                    }
                } catch (e) {
                    console.error(`Error generando código para agencia ${agency.id}:`, e);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados exitosamente`, 'success');
            await this.loadBarcodes();
            
            // Si el módulo de empleados está activo, recargarlo para mostrar los nuevos códigos
            if (window.Employees && window.Employees.currentTab) {
                const currentTab = window.Employees.currentTab;
                if (currentTab === 'sellers') {
                    await window.Employees.loadSellers();
                } else if (currentTab === 'guides') {
                    await window.Employees.loadGuides();
                } else if (currentTab === 'agencies') {
                    await window.Employees.loadAgencies();
                }
            }
        } catch (e) {
            console.error('Error generating all agency barcodes:', e);
            Utils.showNotification('Error al generar códigos de barras: ' + e.message, 'error');
        }
    },

    async handleBatchPrint() {
        const selected = this.getSelectedBarcodes();
        if (selected.length === 0) {
            Utils.showNotification('Selecciona al menos un código de barras', 'warning');
            return;
        }

        const template = await this.getCurrentTemplate();
        await this.batchPrint(null, selected.map(s => s.id), template);
    },

    getSelectedBarcodes() {
        const checkboxes = document.querySelectorAll('.barcode-select-checkbox:checked');
        return Array.from(checkboxes).map(cb => ({
            id: cb.dataset.id,
            type: cb.dataset.type
        }));
    },

    async batchPrint(type, ids, template = null) {
        if (!ids || ids.length === 0) {
            Utils.showNotification('No hay elementos seleccionados', 'warning');
            return;
        }

        const templateToUse = template || await this.getCurrentTemplate();
        const settings = await this.getBarcodeSettings();
        const printWindow = window.open('', '_blank');
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Impresión Masiva de Códigos de Barras</title>
                <style>
                    body {
                        margin: 0;
                        padding: 10mm;
                        font-family: Arial, sans-serif;
                        font-size: 10pt;
                    }
                    .labels-grid {
                        display: grid;
                        grid-template-columns: repeat(3, ${templateToUse.width}mm);
                        gap: 5mm;
                    }
                    .label {
                        width: ${templateToUse.width}mm;
                        height: ${templateToUse.height}mm;
                        border: 1px dashed #ccc;
                        padding: 2mm;
                        text-align: center;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                    }
                    .label h3 {
                        margin: 0;
                        font-size: ${templateToUse.fields.includes('name') ? '10pt' : '8pt'};
                    }
                    .label img {
                        max-width: 100%;
                        height: auto;
                    }
                    @media print {
                        @page {
                            size: A4;
                            margin: 10mm;
                        }
                        .label {
                            border: none;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="labels-grid">
        `;

        for (const id of ids) {
            let entity, entityType;
            if (type === 'items') {
                entity = await DB.get('inventory_items', id);
                entityType = 'item';
            } else if (type === 'employees') {
                entity = await DB.get('employees', id);
                entityType = 'employee';
            } else if (type === 'sellers') {
                entity = await DB.get('catalog_sellers', id);
                entityType = 'seller';
            } else if (type === 'guides') {
                entity = await DB.get('catalog_guides', id);
                entityType = 'guide';
            } else if (type === 'agencies') {
                entity = await DB.get('catalog_agencies', id);
                entityType = 'agency';
            } else {
                // Detectar tipo desde el checkbox
                const checkbox = document.querySelector(`.barcode-select-checkbox[data-id="${id}"]`);
                if (checkbox) {
                    entityType = checkbox.dataset.type;
                    switch(entityType) {
                        case 'item':
                            entity = await DB.get('inventory_items', id);
                            break;
                        case 'employee':
                            entity = await DB.get('employees', id);
                            break;
                        case 'seller':
                            entity = await DB.get('catalog_sellers', id);
                            break;
                        case 'guide':
                            entity = await DB.get('catalog_guides', id);
                            break;
                        case 'agency':
                            entity = await DB.get('catalog_agencies', id);
                            break;
                    }
                }
            }

            if (entity && !Utils.isBarcodeEmpty(entity.barcode)) {
                const barcodeImg = await BarcodeManager.generateBarcodeImage(entity.barcode, settings.format || 'CODE128', {
                    width: settings.width,
                    height: settings.height,
                    displayValue: settings.displayValue
                });
                html += `
                    <div class="label">
                        ${templateToUse.fields.includes('name') ? `<h3>${entity.name || 'N/A'}</h3>` : ''}
                        ${templateToUse.fields.includes('sku') && entity.sku ? `<div style="font-size: 8pt;">SKU: ${entity.sku}</div>` : ''}
                        <img src="${barcodeImg}" alt="Barcode">
                        <div style="font-size: 8pt;">${entity.barcode}</div>
                        ${templateToUse.fields.includes('price') && entity.price ? `<div style="font-weight: bold;">${Utils.formatCurrency(entity.price)}</div>` : ''}
                        ${templateToUse.fields.includes('metal') && entity.metal ? `<div style="font-size: 7pt;">${entity.metal}</div>` : ''}
                        ${templateToUse.fields.includes('stone') && entity.stone ? `<div style="font-size: 7pt;">${entity.stone}</div>` : ''}
                    </div>
                `;
            }
        }

        html += `
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    },

    async getCurrentTemplate() {
        const currentTemplateId = localStorage.getItem('barcode_current_template') || 'standard';
        const templates = await this.getPrintTemplates();
        return templates.find(t => t.id === currentTemplateId) || templates[0];
    },

    async useTemplate(templateId) {
        localStorage.setItem('barcode_current_template', templateId);
        Utils.showNotification('Plantilla seleccionada', 'success');
    },

    async editTemplate(templateId) {
        const templates = await this.getPrintTemplates();
        const template = templates.find(t => t.id === templateId);
        
        if (!template) {
            Utils.showNotification('Plantilla no encontrada', 'error');
            return;
        }

        const body = `
            <div style="padding: var(--spacing-md);">
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" id="template-name" class="form-input" value="${template.name}">
                </div>
                <div class="form-group">
                    <label>Descripción</label>
                    <textarea id="template-description" class="form-input" rows="2">${template.description || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Ancho (mm)</label>
                        <input type="number" id="template-width" class="form-input" value="${template.width}">
                    </div>
                    <div class="form-group">
                        <label>Alto (mm)</label>
                        <input type="number" id="template-height" class="form-input" value="${template.height}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Campos a Mostrar</label>
                    <div id="template-fields-container" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-xs); margin-top: var(--spacing-xs);">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="name" ${template.fields.includes('name') ? 'checked' : ''}>
                            <span>Nombre</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="sku" ${template.fields.includes('sku') ? 'checked' : ''}>
                            <span>SKU</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="barcode" ${template.fields.includes('barcode') ? 'checked' : ''} checked disabled>
                            <span>Código de Barras</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="price" ${template.fields.includes('price') ? 'checked' : ''}>
                            <span>Precio</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="metal" ${template.fields.includes('metal') ? 'checked' : ''}>
                            <span>Metal</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" value="stone" ${template.fields.includes('stone') ? 'checked' : ''}>
                            <span>Piedra</span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" id="template-cancel-btn">Cancelar</button>
            <button class="btn-primary" id="template-save-btn" data-template-id="${templateId}">Guardar</button>
        `;

        UI.showModal('Editar Plantilla', body, footer);
        
        // Configurar event listeners después de mostrar el modal
        setTimeout(() => {
            const cancelBtn = document.getElementById('template-cancel-btn');
            const saveBtn = document.getElementById('template-save-btn');
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => UI.closeModal());
            }
            
            if (saveBtn) {
                const templateIdToSave = saveBtn.dataset.templateId;
                saveBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (window.BarcodesModule && typeof window.BarcodesModule.saveTemplate === 'function') {
                        await window.BarcodesModule.saveTemplate(templateIdToSave);
                    } else {
                        console.error('saveTemplate no está disponible');
                        Utils.showNotification('Error: función no disponible', 'error');
                    }
                });
            }
        }, 100);
    },

    async saveTemplate(templateId) {
        const nameEl = document.getElementById('template-name');
        const descriptionEl = document.getElementById('template-description');
        const widthEl = document.getElementById('template-width');
        const heightEl = document.getElementById('template-height');
        
        const name = nameEl?.value;
        const description = descriptionEl?.value;
        const width = parseInt(widthEl?.value || 58);
        const height = parseInt(heightEl?.value || 40);
        
        const fields = [];
        try {
            const fieldsContainer = document.getElementById('template-fields-container');
            if (fieldsContainer) {
                fieldsContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                    if (!cb.disabled) fields.push(cb.value);
                });
            }
        } catch (e) {
            console.error('Error getting template fields:', e);
        }
        fields.push('barcode'); // Siempre incluir código de barras

        const template = {
            id: templateId,
            name,
            description,
            width,
            height,
            fields
        };

        try {
            // Guardar en DB
            const existing = await DB.get('barcode_print_templates', templateId);
            
            if (existing) {
                await DB.put('barcode_print_templates', { ...existing, ...template });
            } else {
                await DB.add('barcode_print_templates', template);
            }

            Utils.showNotification('Plantilla guardada', 'success');
            UI.closeModal();
            await this.loadTab('templates');
        } catch (e) {
            console.error('Error saving template:', e);
            Utils.showNotification('Error al guardar plantilla: ' + e.message, 'error');
        }
    },

    async addTemplate() {
        const newId = `template_${Date.now()}`;
        const template = {
            id: newId,
            name: 'Nueva Plantilla',
            description: '',
            width: 58,
            height: 40,
            fields: ['name', 'barcode']
        };

        await DB.add('barcode_print_templates', template);
        await this.editTemplate(newId);
    },

    async showExportOptions() {
        const body = `
            <div style="padding: var(--spacing-md);">
                <p>Selecciona el formato de exportación:</p>
                <div style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                    <button class="btn-primary" onclick="window.BarcodesModule.exportAll('pdf'); UI.closeModal();" style="width: 100%;">
                        <i class="fas fa-file-pdf"></i> PDF con Imágenes
                    </button>
                    <button class="btn-primary" onclick="window.BarcodesModule.exportAll('excel'); UI.closeModal();" style="width: 100%;">
                        <i class="fas fa-file-excel"></i> Excel
                    </button>
                    <button class="btn-primary" onclick="window.BarcodesModule.exportAll('csv'); UI.closeModal();" style="width: 100%;">
                        <i class="fas fa-file-csv"></i> CSV
                    </button>
                </div>
            </div>
        `;

        UI.showModal('Exportar Códigos de Barras', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>');
    },

    async exportAll(format) {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            // Obtener filtros actuales para respetar el filtrado por sucursal
            const branchFilter = document.getElementById('barcodes-branch-filter');
            const selectedBranchId = branchFilter?.value === 'all' ? null : branchFilter?.value || null;
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Determinar qué sucursal usar para filtrar
            let filterBranchId = null;
            if (selectedBranchId) {
                filterBranchId = selectedBranchId;
            } else if (!isMasterAdmin) {
                filterBranchId = currentBranchId;
            }
            
            // Cargar todos los datos
            let items = await DB.getAll('inventory_items') || [];
            let employees = await DB.getAll('employees') || [];
            let sellers = await DB.getAll('catalog_sellers') || [];
            let guides = await DB.getAll('catalog_guides') || [];
            let agencies = await DB.getAll('catalog_agencies') || [];
            let suppliers = await DB.getAll('suppliers') || [];
            
            // Aplicar filtro de sucursal si aplica
            if (filterBranchId) {
                const normalizedBranchId = String(filterBranchId);
                
                items = items.filter(item => {
                    if (!item.branch_id) return false;
                    return String(item.branch_id) === normalizedBranchId;
                });
                
                employees = employees.filter(emp => {
                    if (emp.branch_id) {
                        return String(emp.branch_id) === normalizedBranchId;
                    }
                    if (emp.branch_ids && Array.isArray(emp.branch_ids)) {
                        return emp.branch_ids.some(id => String(id) === normalizedBranchId);
                    }
                    return false;
                });
                
                suppliers = suppliers.filter(supplier => {
                    if (supplier.branch_id) {
                        return String(supplier.branch_id) === normalizedBranchId;
                    }
                    return supplier.is_shared === true;
                });
            }

            const exportData = [];

            // Productos
            for (const item of items) {
                if (!Utils.isBarcodeEmpty(item.barcode)) {
                    const barcodeImg = await BarcodeManager.generateBarcodeImage(item.barcode);
                    exportData.push({
                        'Tipo': 'Producto',
                        'SKU/Código': item.sku || 'N/A',
                        'Nombre': item.name || 'Sin nombre',
                        'Código de Barras': item.barcode,
                        'Precio': Utils.formatCurrency(item.price || 0),
                        'Metal': item.metal || 'N/A',
                        'Piedra': item.stone || 'N/A',
                        'Estado': item.status || 'N/A',
                        'Imagen': barcodeImg
                    });
                }
            }

            // Empleados
            for (const emp of employees) {
                if (!Utils.isBarcodeEmpty(emp.barcode)) {
                    const barcodeImg = await BarcodeManager.generateBarcodeImage(emp.barcode);
                    exportData.push({
                        'Tipo': 'Empleado',
                        'SKU/Código': emp.employee_code || 'N/A',
                        'Nombre': emp.name || 'Sin nombre',
                        'Código de Barras': emp.barcode,
                        'Rol': emp.role || 'N/A',
                        'Estado': emp.active ? 'Activo' : 'Inactivo',
                        'Imagen': barcodeImg
                    });
                }
            }

            // Vendedores, Guías, Agencias
            [...sellers, ...guides, ...agencies].forEach(entity => {
                if (!Utils.isBarcodeEmpty(entity.barcode)) {
                    const type = sellers.includes(entity) ? 'Vendedor' : guides.includes(entity) ? 'Guía' : 'Agencia';
                    exportData.push({
                        'Tipo': type,
                        'SKU/Código': entity.id || 'N/A',
                        'Nombre': entity.name || 'Sin nombre',
                        'Código de Barras': entity.barcode
                    });
                }
            });

            // Proveedores
            for (const supplier of suppliers) {
                if (!Utils.isBarcodeEmpty(supplier.barcode)) {
                    const barcodeImg = await BarcodeManager.generateBarcodeImage(supplier.barcode);
                    exportData.push({
                        'Tipo': 'Proveedor',
                        'SKU/Código': supplier.code || 'N/A',
                        'Nombre': supplier.name || 'Sin nombre',
                        'Código de Barras': supplier.barcode,
                        'Tipo Proveedor': supplier.supplier_type || 'N/A',
                        'Categoría': supplier.category || 'N/A',
                        'Estado': supplier.status || 'N/A',
                        'Imagen': barcodeImg
                    });
                }
            }

            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === 'pdf') {
                await this.exportToPDFWithImages(exportData, `codigos_barras_${date}.pdf`);
            } else if (format === 'excel') {
                Utils.exportToExcel(exportData, `codigos_barras_${date}.xlsx`, 'Códigos de Barras');
            } else if (format === 'csv') {
                // Remover imágenes para CSV
                const csvData = exportData.map(item => {
                    const { Imagen, ...rest } = item;
                    return rest;
                });
                Utils.exportToCSV(csvData, `codigos_barras_${date}.csv`);
            }

            Utils.showNotification(`Exportación completada: ${exportData.length} códigos`, 'success');
        } catch (e) {
            console.error('Error exporting:', e);
            Utils.showNotification('Error al exportar: ' + e.message, 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    async exportToPDFWithImages(data, filename) {
        const jspdfLib = Utils.checkJsPDF();
        if (!jspdfLib) {
            Utils.showNotification('jsPDF no está disponible', 'error');
            return;
        }

        const { jsPDF } = jspdfLib;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const cardWidth = (pageWidth - margin * 3) / 2;
        const cardHeight = 40;
        let x = margin;
        let y = margin;

        for (const item of data) {
            if (y + cardHeight > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }

            // Dibujar borde de tarjeta
            doc.setDrawColor(200, 200, 200);
            doc.rect(x, y, cardWidth, cardHeight);

            // Título
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(item.Nombre.substring(0, 30), x + 5, y + 5);

            // Código de barras (imagen)
            if (item.Imagen) {
                doc.addImage(item.Imagen, 'PNG', x + 5, y + 8, cardWidth - 10, 15);
            }

            // Código de texto
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text(`Código: ${item['Código de Barras']}`, x + 5, y + 28);

            // Tipo y SKU
            doc.setFontSize(7);
            doc.text(`${item.Tipo} - ${item['SKU/Código']}`, x + 5, y + 33);

            // Precio si existe
            if (item.Precio) {
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                doc.text(item.Precio, x + cardWidth - 15, y + 33);
            }

            x += cardWidth + margin;
            if (x + cardWidth > pageWidth - margin) {
                x = margin;
                y += cardHeight + margin;
            }
        }

        doc.save(filename);
    },

    async generateQR(id, type) {
        try {
            let entity;
            switch(type) {
                case 'item':
                    entity = await DB.get('inventory_items', id);
                    break;
                case 'employee':
                    entity = await DB.get('employees', id);
                    break;
                case 'seller':
                    entity = await DB.get('catalog_sellers', id);
                    break;
                case 'guide':
                    entity = await DB.get('catalog_guides', id);
                    break;
            case 'agency':
                entity = await DB.get('catalog_agencies', id);
                break;
            case 'supplier':
                entity = await DB.get('suppliers', id);
                break;
        }

        if (!entity || Utils.isBarcodeEmpty(entity.barcode)) {
                Utils.showNotification('No hay código de barras para generar QR', 'error');
                return;
            }

            const settings = await this.getBarcodeSettings();
            if (!settings.qrEnabled) {
                Utils.showNotification('Los códigos QR están deshabilitados. Actívalos en Configuración.', 'warning');
                return;
            }

            let qrContent = entity.barcode;
            if (settings.qrContentType === 'url') {
                qrContent = `${window.location.origin}/item/${id}`;
            } else if (settings.qrContentType === 'full') {
                qrContent = JSON.stringify({
                    id: entity.id,
                    name: entity.name,
                    barcode: entity.barcode,
                    type: type
                });
            }

            // Generar QR usando una librería QR (si está disponible) o mostrar modal
            await this.showQRModal(entity, qrContent, settings.qrSize);
        } catch (e) {
            console.error('Error generating QR:', e);
            Utils.showNotification('Error al generar QR', 'error');
        }
    },

    async showQRModal(entity, content, size) {
        // Verificar si hay librería QR disponible
        let qrImage = '';
        if (typeof QRCode !== 'undefined') {
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, content, { width: size }, (error) => {
                if (!error) {
                    qrImage = canvas.toDataURL('image/png');
                }
            });
        }

        const body = `
            <div style="padding: var(--spacing-md); text-align: center;">
                <h3 style="margin-bottom: var(--spacing-md);">${entity.name}</h3>
                ${qrImage ? `<img src="${qrImage}" alt="QR Code" style="max-width: 100%; margin-bottom: var(--spacing-md);">` : 
                    `<div style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                        <p style="font-size: 11px; color: var(--color-text-secondary);">Código QR:</p>
                        <code style="font-size: 10px; word-break: break-all;">${content}</code>
                    </div>`
                }
                <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-sm);">
                    Escanea este código QR para acceder rápidamente
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>
            ${qrImage ? `<button class="btn-primary" onclick="window.BarcodesModule.printQR('${entity.id}', '${entity.name}', '${qrImage}')">Imprimir QR</button>` : ''}
        `;

        UI.showModal('Código QR', body, footer);
    },

    async printQR(id, name, qrImage) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code - ${name}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20mm;
                        font-family: Arial, sans-serif;
                        text-align: center;
                    }
                    .qr-label {
                        width: 58mm;
                        margin: 0 auto;
                    }
                    .qr-label h3 {
                        margin: 5mm 0;
                        font-size: 12pt;
                    }
                    .qr-label img {
                        max-width: 100%;
                        height: auto;
                    }
                    @media print {
                        @page {
                            size: 58mm auto;
                            margin: 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="qr-label">
                    <h3>${name}</h3>
                    <img src="${qrImage}" alt="QR Code">
                    <div style="font-size: 8pt; margin-top: 5mm;">Escanea para más información</div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    },

    async editBarcode(id, type) {
        let entity;
        switch(type) {
            case 'item':
                entity = await DB.get('inventory_items', id);
                break;
            case 'employee':
                entity = await DB.get('employees', id);
                break;
            case 'seller':
                entity = await DB.get('catalog_sellers', id);
                break;
            case 'guide':
                entity = await DB.get('catalog_guides', id);
                break;
            case 'agency':
                entity = await DB.get('catalog_agencies', id);
                break;
            case 'supplier':
                entity = await DB.get('suppliers', id);
                break;
        }

        if (!entity) {
            Utils.showNotification('Elemento no encontrado', 'error');
            return;
        }

        const settings = await this.getBarcodeSettings();
        const currentBarcode = entity.barcode || '';

        const body = `
            <div style="padding: var(--spacing-md);">
                <div class="form-group">
                    <label>Código de Barras</label>
                    <input type="text" id="edit-barcode-value" class="form-input" value="${currentBarcode}" placeholder="Ingresa el código">
                </div>
                <div class="form-group">
                    <label>Formato</label>
                    <select id="edit-barcode-format" class="form-select">
                        <option value="CODE128" ${settings.format === 'CODE128' ? 'selected' : ''}>CODE128</option>
                        <option value="EAN13" ${settings.format === 'EAN13' ? 'selected' : ''}>EAN-13</option>
                        <option value="EAN8" ${settings.format === 'EAN8' ? 'selected' : ''}>EAN-8</option>
                        <option value="CODE39" ${settings.format === 'CODE39' ? 'selected' : ''}>CODE39</option>
                        <option value="ITF14" ${settings.format === 'ITF14' ? 'selected' : ''}>ITF-14</option>
                    </select>
                </div>
                <div id="barcode-preview-edit" style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-top: var(--spacing-sm);">
                    <svg id="preview-barcode-edit"></svg>
                </div>
                <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                    <button class="btn-link btn-xs" onclick="window.BarcodesModule.validateBarcode(document.getElementById('edit-barcode-value').value)">
                        <i class="fas fa-check-circle"></i> Validar Código
                    </button>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.BarcodesModule.saveBarcode('${id}', '${type}')">Guardar</button>
        `;

        UI.showModal('Editar Código de Barras', body, footer);

        // Preview en tiempo real
        const input = document.getElementById('edit-barcode-value');
        if (input) {
            input.addEventListener('input', async (e) => {
                const value = e.target.value;
                if (value && value.length > 0) {
                    const format = document.getElementById('edit-barcode-format')?.value || 'CODE128';
                    await this.generateBarcodePreview('preview-barcode-edit', value, format);
                }
            });
        }

        // Generar preview inicial
        if (currentBarcode) {
            const format = document.getElementById('edit-barcode-format')?.value || settings.format;
            setTimeout(async () => {
                await this.generateBarcodePreview('preview-barcode-edit', currentBarcode, format);
            }, 100);
        }
    },

    async saveBarcode(id, type) {
        const newBarcode = document.getElementById('edit-barcode-value')?.value.trim();
        const format = document.getElementById('edit-barcode-format')?.value || 'CODE128';

        if (!newBarcode) {
            Utils.showNotification('El código de barras no puede estar vacío', 'error');
            return;
        }

        // Validar si está habilitado
        const settings = await this.getBarcodeSettings();
        if (settings.validateOnGenerate) {
            const isValid = await this.validateBarcode(newBarcode, format);
            if (!isValid) {
                if (!await Utils.confirm('El código no es válido para el formato seleccionado. ¿Guardar de todas formas?')) {
                    return;
                }
            }
        }

        // Verificar duplicados si está habilitado
        if (settings.checkDuplicates) {
            const duplicates = await this.checkBarcodeDuplicate(newBarcode, id, type);
            if (duplicates.length > 0) {
                if (!await Utils.confirm(`Este código ya está en uso por ${duplicates.length} elemento(s). ¿Continuar de todas formas?`)) {
                    return;
                }
            }
        }

        let entity;
        switch(type) {
            case 'item':
                entity = await DB.get('inventory_items', id);
                break;
            case 'employee':
                entity = await DB.get('employees', id);
                break;
            case 'seller':
                entity = await DB.get('catalog_sellers', id);
                break;
            case 'guide':
                entity = await DB.get('catalog_guides', id);
                break;
            case 'agency':
                entity = await DB.get('catalog_agencies', id);
                break;
            case 'supplier':
                entity = await DB.get('suppliers', id);
                break;
        }

        if (entity) {
            entity.barcode = newBarcode;
            await DB.put(
                type === 'item' ? 'inventory_items' :
                type === 'employee' ? 'employees' :
                type === 'seller' ? 'catalog_sellers' :
                type === 'guide' ? 'catalog_guides' :
                type === 'agency' ? 'catalog_agencies' :
                'suppliers',
                entity
            );

            // Agregar a cola de sincronización para sincronización bidireccional
            if (typeof SyncManager !== 'undefined') {
                try {
                    if (type === 'item') {
                        await SyncManager.addToQueue('inventory_item', id);
                    } else if (type === 'employee') {
                        await SyncManager.addToQueue('employee', id);
                    } else if (type === 'seller') {
                        await SyncManager.addToQueue('catalog_seller', id);
                    } else if (type === 'guide') {
                        await SyncManager.addToQueue('catalog_guide', id);
                    } else if (type === 'agency') {
                        await SyncManager.addToQueue('catalog_agency', id);
                    } else if (type === 'supplier') {
                        await SyncManager.addToQueue('supplier', id);
                    }
                } catch (syncError) {
                    console.warn('Error agregando a cola de sincronización:', syncError);
                }
            }

            Utils.showNotification('Código de barras actualizado', 'success');
            UI.closeModal();
            await this.loadBarcodes();
        }
    },

    async viewDetails(id, type) {
        let entity;
        let storeName;
        switch(type) {
            case 'item':
                entity = await DB.get('inventory_items', id);
                storeName = 'Producto';
                break;
            case 'employee':
                entity = await DB.get('employees', id);
                storeName = 'Empleado';
                break;
            case 'seller':
                entity = await DB.get('catalog_sellers', id);
                storeName = 'Vendedor';
                break;
            case 'guide':
                entity = await DB.get('catalog_guides', id);
                storeName = 'Guía';
                break;
            case 'agency':
                entity = await DB.get('catalog_agencies', id);
                storeName = 'Agencia';
                break;
            case 'supplier':
                entity = await DB.get('suppliers', id);
                storeName = 'Proveedor';
                break;
            default:
                Utils.showNotification('Tipo no válido', 'error');
                return;
        }

        if (!entity) {
            Utils.showNotification(`${storeName} no encontrado`, 'error');
            return;
        }

        const barcode = entity.barcode || 'Sin código de barras';
        const hasBarcode = !Utils.isBarcodeEmpty(barcode);
        
        let code = '';
        if (type === 'item') {
            code = entity.sku || 'N/A';
        } else if (type === 'employee') {
            code = entity.employee_code || 'N/A';
        } else if (type === 'supplier') {
            code = entity.code || 'N/A';
        } else {
            code = entity.id || 'N/A';
        }

        const body = `
            <div style="padding: var(--spacing-md);">
                <div style="margin-bottom: var(--spacing-md);">
                    <h3 style="margin-bottom: var(--spacing-sm);">${entity.name || 'Sin nombre'}</h3>
                    <p style="color: var(--color-text-secondary); font-size: 12px;">
                        ${storeName} • ${code}
                    </p>
                </div>
                ${hasBarcode ? `
                    <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                        <svg id="detail-barcode-preview" style="max-width: 100%;"></svg>
                        <div style="margin-top: var(--spacing-sm); font-family: monospace; font-size: 12px;">${barcode}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-md); color: var(--color-text-secondary);">
                        Sin código de barras asignado
                    </div>
                `}
                <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                    ${hasBarcode ? `
                        <button class="btn-primary btn-sm" onclick="window.BarcodesModule.printBarcode('${id}', '${type}')">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.BarcodesModule.generateQR('${id}', '${type}')">
                            <i class="fas fa-qrcode"></i> Generar QR
                        </button>
                    ` : ''}
                    <button class="btn-secondary btn-sm" onclick="window.BarcodesModule.editBarcode('${id}', '${type}'); UI.closeModal();">
                        <i class="fas fa-edit"></i> ${hasBarcode ? 'Editar' : 'Generar'} Código
                    </button>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Detalles - ${storeName}`, body, footer);

        // Generar código de barras visual si existe
        if (hasBarcode) {
            setTimeout(async () => {
                const settings = await this.getBarcodeSettings();
                await BarcodeManager.generateBarcode(barcode, 'detail-barcode-preview', settings.format || 'CODE128', {
                    width: settings.width || 2,
                    height: settings.height || 50,
                    displayValue: settings.displayValue !== false
                });
            }, 100);
        }
    },

    async printBarcode(id, type) {
        try {
            let entity;
            let entityName;
            let code;
            
            switch(type) {
                case 'item':
                    entity = await DB.get('inventory_items', id);
                    entityName = entity?.name || entity?.sku || 'Producto';
                    code = entity?.sku || 'N/A';
                    break;
                case 'employee':
                    entity = await DB.get('employees', id);
                    entityName = entity?.name || 'Empleado';
                    code = entity?.employee_code || 'N/A';
                    break;
                case 'seller':
                    entity = await DB.get('catalog_sellers', id);
                    entityName = entity?.name || 'Vendedor';
                    code = entity?.id || 'N/A';
                    break;
                case 'guide':
                    entity = await DB.get('catalog_guides', id);
                    entityName = entity?.name || 'Guía';
                    code = entity?.id || 'N/A';
                    break;
                case 'agency':
                    entity = await DB.get('catalog_agencies', id);
                    entityName = entity?.name || 'Agencia';
                    code = entity?.id || 'N/A';
                    break;
                case 'supplier':
                    entity = await DB.get('suppliers', id);
                    entityName = entity?.name || 'Proveedor';
                    code = entity?.code || 'N/A';
                    break;
                default:
                    Utils.showNotification('Tipo no válido', 'error');
                    return;
            }

            if (!entity) {
                Utils.showNotification('Elemento no encontrado', 'error');
                return;
            }

            const barcode = entity.barcode || code;
            if (Utils.isBarcodeEmpty(barcode)) {
                Utils.showNotification('No hay código de barras para imprimir', 'error');
                return;
            }

            const settings = await this.getBarcodeSettings();
            const barcodeImg = await BarcodeManager.generateBarcodeImage(barcode, settings.format || 'CODE128', {
                width: settings.width || 2,
                height: settings.height || 50,
                displayValue: settings.displayValue !== false
            });

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Etiqueta ${code}</title>
                    <style>
                        body {
                            margin: 0;
                            padding: 10mm;
                            font-family: Arial, sans-serif;
                            font-size: 10pt;
                        }
                        .label {
                            width: 58mm;
                            text-align: center;
                        }
                        .label h3 {
                            margin: 5mm 0;
                            font-size: 12pt;
                            word-wrap: break-word;
                        }
                        .label img {
                            max-width: 100%;
                            height: auto;
                        }
                        .label .code {
                            margin-top: 5mm;
                            font-size: 10pt;
                            font-family: monospace;
                        }
                        @media print {
                            @page {
                                size: 58mm auto;
                                margin: 0;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="label">
                        <h3>${entityName}</h3>
                        <img src="${barcodeImg}" alt="Barcode">
                        <div class="code">${code}</div>
                        <div class="code" style="font-size: 8pt; margin-top: 2mm;">${barcode}</div>
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        } catch (error) {
            console.error('Error imprimiendo código de barras:', error);
            Utils.showNotification('Error al imprimir código de barras', 'error');
        }
    },

    async validateBarcode(barcode, format = 'CODE128') {
        if (!barcode || barcode.trim() === '') {
            return false;
        }

        // Validaciones básicas por formato
        switch(format) {
            case 'EAN13':
                return /^\d{13}$/.test(barcode);
            case 'EAN8':
                return /^\d{8}$/.test(barcode);
            case 'CODE39':
                return /^[A-Z0-9\-\.\$\/\+\%\s]+$/.test(barcode);
            case 'ITF14':
                return /^\d{14}$/.test(barcode);
            case 'CODE128':
            default:
                return barcode.length > 0 && barcode.length <= 80; // CODE128 acepta casi cualquier carácter
        }
    },

    async checkBarcodeDuplicate(barcode, excludeId, excludeType) {
        const items = await DB.getAll('inventory_items') || [];
        const employees = await DB.getAll('employees') || [];
        const sellers = await DB.getAll('catalog_sellers') || [];
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];
        const suppliers = await DB.getAll('suppliers') || [];

        const all = [
            ...items.map(i => ({ ...i, type: 'item' })),
            ...employees.map(e => ({ ...e, type: 'employee' })),
            ...sellers.map(s => ({ ...s, type: 'seller' })),
            ...guides.map(g => ({ ...g, type: 'guide' })),
            ...agencies.map(a => ({ ...a, type: 'agency' })),
            ...suppliers.map(s => ({ ...s, type: 'supplier' }))
        ];

        return all.filter(item => 
            !Utils.isBarcodeEmpty(item.barcode) &&
            item.barcode === barcode &&
            !(item.id === excludeId && item.type === excludeType)
        );
    },

    async generateBarcodePreview(elementId, value, format = 'CODE128') {
        if (typeof JsBarcode === 'undefined') {
            return;
        }

        try {
            const settings = await this.getBarcodeSettings();
            BarcodeManager.generateBarcode(value, elementId, format, {
                width: settings.width || 2,
                height: settings.height || 50,
                displayValue: settings.displayValue !== false,
                fontSize: 12
            });
        } catch (e) {
            console.error('Error generating preview:', e);
        }
    },

    async exportAllToPDF() {
        await this.exportAll('pdf');
    },

    loadCatalogModule(type) {
        if (typeof Settings !== 'undefined') {
            switch(type) {
                case 'sellers':
                    Settings.manageSellers();
                    break;
                case 'guides':
                    Settings.manageGuides();
                    break;
                case 'agencies':
                    Settings.manageAgencies();
                    break;
            }
        } else {
            Utils.showNotification('Módulo de configuración no disponible', 'error');
        }
    },

    async generateAllSupplierBarcodes() {
        try {
            const suppliers = await DB.getAll('suppliers') || [];
            const suppliersWithoutBarcode = suppliers.filter(s => Utils.isBarcodeEmpty(s.barcode));
            
            if (suppliersWithoutBarcode.length === 0) {
                Utils.showNotification('Todos los proveedores ya tienen código de barras', 'info');
                return;
            }

            let generated = 0;
            for (const supplier of suppliersWithoutBarcode) {
                try {
                    // Generar código de barras basado en el código del proveedor
                    supplier.barcode = supplier.code || `PROV${supplier.id.substring(0, 6).toUpperCase()}`;
                    await DB.put('suppliers', supplier);
                    
                    // Sincronizar si aplica
                    if (typeof SyncManager !== 'undefined') {
                        await SyncManager.addToQueue('supplier', supplier.id);
                    }
                    
                    generated++;
                } catch (error) {
                    console.error(`Error generando código para proveedor ${supplier.id}:`, error);
                }
            }

            Utils.showNotification(`${generated} códigos de barras generados para proveedores`, 'success');
            await this.loadBarcodes();
        } catch (error) {
            console.error('Error generando códigos de barras de proveedores:', error);
            Utils.showNotification('Error al generar códigos de barras', 'error');
        }
    }
};

// Exponer el módulo globalmente (solo si no existe ya)
if (typeof window.BarcodesModule === 'undefined') {
    window.BarcodesModule = BarcodesModule;
} else {
    // Si ya existe, usar el existente pero actualizar métodos si es necesario
    console.warn('⚠️ BarcodesModule ya existe. Usando la instancia existente.');
}

