;(function() {
'use strict';
// Inventory Module - Sistema Avanzado de Gestión de Inventario

const Inventory = {
    initialized: false,
    isExporting: false, // Flag para prevenir múltiples exportaciones simultáneas
    selectedItems: new Set(), // Items seleccionados para acciones en lote
    currentView: 'grid', // grid o list
    sortBy: 'name',
    sortOrder: 'asc',
    // Carga progresiva: 3 filas iniciales (~5 columnas = 15 tarjetas), botón "Cargar más" para evitar peso de render
    INVENTORY_GRID_BATCH_SIZE: 15,
    _gridDisplayLimit: 0,
    _lastGridItems: [],
    _suppressFilterChange: false,
    _lastBackgroundRefreshTime: 0,
    
    // Configuración de stock por defecto
    defaultStockConfig: {
        stock_min: 1,
        stock_max: 10,
        stock_actual: 1,
        alert_enabled: true
    },

    // Lista única de categorías (reutilizada en barra de filtros y formulario de pieza)
    INVENTORY_CATEGORIES: [
        'Anillos', 'Collares', 'Cadenas', 'Pulseras', 'Esclavas', 'Brazaletes', 'Aretes',
        'Arracadas', 'Broqueles', 'Dijes / Charms', 'Sets / Juegos', 'Tobilleras',
        'Piercings', 'Relojería', 'Accesorios'
    ],
    
    async init() {
        try {
            // Verificar permiso primero, pero no bloquear si el HTML no está listo
            const hasPermission = typeof PermissionManager === 'undefined' || PermissionManager.hasPermission('inventory.view');
            
            if (!hasPermission) {
                const content = document.getElementById('module-content');
                if (content) {
                    content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver inventario</div>';
                }
                return;
            }

            if (this.initialized) {
                // Si ya está inicializado, solo recargar datos
                await this.loadInventory();
                return;
            }

            // Asegurar que el HTML esté creado antes de continuar
            const content = document.getElementById('module-content');
            const inventoryList = document.getElementById('inventory-list');
            
            if (!inventoryList && content) {
                // El HTML no existe, crearlo
                await this.setupUI();
            }

            // Esperar un momento para asegurar que el DOM esté completamente renderizado
            console.log('⏳ Esperando renderizado del DOM...');
            await new Promise(resolve => setTimeout(resolve, 150));
            
            console.log('🔧 Configurando event listeners...');
            await this.setupEventListeners();
            
            // Actualizar estado visual de los botones de vista después de configurar listeners
            setTimeout(() => {
                console.log('🔄 Actualizando botones de vista después de setupEventListeners');
                this.updateViewButtons();
            }, 200);
            
            console.log('📦 Cargando inventario...');
            await this.loadInventory();
            this.initialized = true;
            
            // Escuchar cambios de sucursal para recargar inventario
            window.addEventListener('branch-changed', async () => {
                if (this.initialized) {
                    await this.loadInventory();
                }
            });
        } catch (error) {
            console.error('❌ Error inicializando módulo Inventory:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Inventory</h3>
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

    async setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        // Verificar permiso antes de crear UI
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('inventory.view')) {
            content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver inventario</div>';
            return;
        }

        // Crear estructura HTML del inventario si no existe
        if (!document.getElementById('inventory-list')) {
            content.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                        <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                            <i class="fas fa-box"></i> Inventario
                        </h3>
                        <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap; align-items: center;">
                            ${(() => {
                                const hasPermission = typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.add');
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:45',message:'Checking add button permission in setupUI',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasPermission:hasPermission,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                                // #endregion
                                return hasPermission ? `
                                    <button class="btn-primary btn-sm" id="inventory-add-btn">
                                        <i class="fas fa-plus"></i> Agregar
                                    </button>
                                ` : '';
                            })()}
                            <button class="btn-secondary btn-sm" id="inventory-import-btn">
                                <i class="fas fa-file-import"></i> Importar
                            </button>
                            <button class="btn-secondary btn-sm" id="inventory-export-btn">
                                <i class="fas fa-file-export"></i> Exportar
                            </button>
                            <button class="btn-secondary btn-sm" id="inventory-print-labels-btn" style="display: none;">
                                <i class="fas fa-gem"></i> Imprimir Etiquetas (<span id="inventory-print-labels-count">0</span>)
                            </button>
                            <!-- Botones de Vista (Grid/Lista) - VISIBLES EN LA BARRA SUPERIOR -->
                            <div id="inventory-view-toggle-container" style="display: flex; gap: 2px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; background: var(--color-bg-secondary); box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-left: var(--spacing-xs);">
                                <button type="button" id="inventory-view-grid-btn" class="inventory-view-btn" data-view="grid" title="Vista de Tarjetas" style="border-radius: 0; margin: 0; border: none; padding: 8px 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; background: transparent; color: var(--color-text);">
                                    <i class="fas fa-th"></i> <span style="font-size: 12px;">Tarjetas</span>
                                </button>
                                <button type="button" id="inventory-view-list-btn" class="inventory-view-btn" data-view="list" title="Vista de Lista" style="border-radius: 0; margin: 0; border: none; padding: 8px 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; background: transparent; color: var(--color-text);">
                                    <i class="fas fa-list"></i> <span style="font-size: 12px;">Lista</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Barra de acciones en lote -->
                    <div id="inventory-batch-actions" style="display: none; padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-md); align-items: center; gap: var(--spacing-sm); flex-wrap: wrap;">
                        <span id="inventory-selected-count-text" style="font-size: 12px; color: var(--color-text-secondary);"></span>
                        <button class="btn-secondary btn-sm" id="inventory-select-all-btn">
                            <i class="fas fa-check-square"></i> Seleccionar todo
                        </button>
                        <button class="btn-danger btn-sm" id="inventory-delete-selected-btn" style="display: none;">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                        <button class="btn-primary btn-sm" id="inventory-print-selected-labels-btn" style="display: none;">
                            <i class="fas fa-gem"></i> Imprimir Etiquetas
                        </button>
                    </div>
                    
                    <!-- Búsqueda rápida por código de barras -->
                    <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-md); align-items: center; flex-wrap: wrap;">
                        <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 200px;">
                            <label style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 4px; display: block;">
                                <i class="fas fa-barcode"></i> Escanear Código de Barras
                            </label>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                <input type="text" id="inventory-barcode-scan" class="form-input" placeholder="Escanear o escribir código de barras..." style="flex: 1;" autocomplete="off">
                                <button type="button" class="btn-primary btn-sm" id="inventory-scan-btn" title="Activar escáner">
                                    <i class="fas fa-camera"></i> Escanear
                                </button>
                            </div>
                            <small style="color: var(--color-text-secondary); font-size: 10px; display: block; margin-top: 4px;">
                                Escanea un código de barras para buscar y editar la pieza rápidamente
                            </small>
                        </div>
                    </div>
                    
                    <!-- Filtros -->
                    <div id="inventory-filters-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="text" id="inventory-search" class="form-input" placeholder="Buscar...">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-status-filter" class="form-select">
                                <option value="">Todos los estados</option>
                                <option value="disponible">Disponible</option>
                                <option value="vendida">Vendida</option>
                                <option value="apartada">Apartada</option>
                                <option value="reparacion">Reparación</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-branch-filter" class="form-select">
                                <option value="">Todas las sucursales</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-metal-filter" class="form-select">
                                <option value="">Todos los metales</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-stone-type-filter" class="form-select">
                                <option value="">Todos los tipos</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-certificate-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="yes">Con certificado</option>
                                <option value="no">Sin certificado</option>
                            </select>
                        </div>
                        <!-- Select oculto: filtro de stock controlado por las pills -->
                        <div class="form-group" style="margin-bottom: 0; display: none;">
                            <select id="inventory-stock-alert-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="ok">Normal</option>
                                <option value="low">Stock Bajo</option>
                                <option value="out">Agotado</option>
                                <option value="over">Exceso</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-supplier-filter" class="form-select">
                                <option value="">Todos los proveedores</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="number" id="inventory-min-price" class="form-input" placeholder="Costo Mín" step="0.01">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="number" id="inventory-max-price" class="form-input" placeholder="Costo Máx" step="0.01">
                        </div>
                        <!-- Botones de vista removidos de aquí - ahora están en la barra superior -->
                        <div class="form-group" style="margin-bottom: 0;">
                            <button class="btn-secondary btn-sm" id="inventory-advanced-filters-toggle" style="width: 100%;">
                                <i class="fas fa-filter"></i> Filtros Avanzados
                            </button>
                        </div>
                    </div>
                    
                    <!-- Filtros Avanzados (Colapsable) -->
                    <div id="inventory-advanced-filters" style="display: none; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                        <h4 style="margin: 0 0 var(--spacing-md) 0; font-size: 13px; font-weight: 600; text-transform: uppercase;">Filtros Avanzados</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-sm);">
                            <!-- Material y Pureza -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Material</label>
                                <select id="inventory-material-filter" class="form-select">
                                    <option value="">Todos los materiales</option>
                                    <option value="Oro">Oro</option>
                                    <option value="Plata">Plata</option>
                                    <option value="Acero">Acero</option>
                                    <option value="Titanio">Titanio</option>
                                    <option value="Bisutería">Bisutería</option>
                                    <option value="Platino">Platino</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Ley/Pureza</label>
                                <select id="inventory-purity-filter" class="form-select">
                                    <option value="">Todas las leyes</option>
                                    <option value="10K">10K</option>
                                    <option value="14K">14K</option>
                                    <option value="18K">18K</option>
                                    <option value=".925">.925</option>
                                    <option value=".999">.999</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Baño</label>
                                <select id="inventory-plating-filter" class="form-select">
                                    <option value="">Todos los baños</option>
                                    <option value="Rodio">Rodio</option>
                                    <option value="Oro amarillo">Oro amarillo</option>
                                    <option value="Oro rosa">Oro rosa</option>
                                    <option value="Oro blanco">Oro blanco</option>
                                </select>
                            </div>
                            
                            <!-- Diseño / Estilo -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Estilo</label>
                                <select id="inventory-style-filter" class="form-select">
                                    <option value="">Todos los estilos</option>
                                    <option value="Clásico">Clásico</option>
                                    <option value="Minimalista">Minimalista</option>
                                    <option value="Luxury">Luxury</option>
                                    <option value="Vintage">Vintage</option>
                                    <option value="Boho">Boho</option>
                                    <option value="Urbano">Urbano</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Tipo de Acabado</label>
                                <select id="inventory-finish-filter" class="form-select">
                                    <option value="">Todos los acabados</option>
                                    <option value="Pulido">Pulido</option>
                                    <option value="Mate">Mate</option>
                                    <option value="Satinado">Satinado</option>
                                    <option value="Texturizado">Texturizado</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Tema</label>
                                <select id="inventory-theme-filter" class="form-select">
                                    <option value="">Todos los temas</option>
                                    <option value="Corazón">Corazón</option>
                                    <option value="Cruz">Cruz</option>
                                    <option value="Inicial">Inicial</option>
                                    <option value="Ojo">Ojo</option>
                                    <option value="Flor">Flor</option>
                                    <option value="Zodiacal">Zodiacal</option>
                                    <option value="Virgen">Virgen</option>
                                </select>
                            </div>
                            
                            <!-- Medidas -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Talla Anillo (MX/US)</label>
                                <input type="number" id="inventory-ring-size-filter" class="form-input" placeholder="Ej: 6, 7, 8..." step="0.5">
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Largo Cadena (cm)</label>
                                <input type="number" id="inventory-chain-length-filter" class="form-input" placeholder="Ej: 50, 60..." step="0.1">
                            </div>
                            
                            <!-- Estado y Ubicación -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Condición</label>
                                <select id="inventory-condition-filter" class="form-select">
                                    <option value="">Todas las condiciones</option>
                                    <option value="Nuevo">Nuevo</option>
                                    <option value="Seminuevo">Seminuevo</option>
                                    <option value="Exhibición">Exhibición</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Ubicación Detallada</label>
                                <select id="inventory-location-filter" class="form-select">
                                    <option value="">Todas las ubicaciones</option>
                                    <option value="Vitrina 1">Vitrina 1</option>
                                    <option value="Vitrina 2">Vitrina 2</option>
                                    <option value="Caja fuerte">Caja fuerte</option>
                                    <option value="Taller">Taller</option>
                                </select>
                            </div>
                            
                            <!-- Colección -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Colección</label>
                                <select id="inventory-collection-filter" class="form-select">
                                    <option value="">Todas las colecciones</option>
                                </select>
                            </div>
                            
                            <!-- Agrupar por Colección -->
                            <div class="form-group" style="margin-bottom: 0; display: flex; align-items: center; gap: 8px; padding-top: 20px;">
                                <input type="checkbox" id="inventory-group-by-collection" style="cursor: pointer;">
                                <label for="inventory-group-by-collection" style="font-size: 11px; font-weight: 600; cursor: pointer; margin: 0;">Agrupar por Colección</label>
                            </div>
                            
                            <!-- Ordenamiento -->
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px; font-weight: 600;">Ordenar por</label>
                                <select id="inventory-sort-by" class="form-select">
                                    <option value="newest" selected>Más nuevo primero</option>
                                    <option value="oldest">Más antiguo primero</option>
                                    <option value="name">Nombre A-Z</option>
                                    <option value="name_desc">Nombre Z-A</option>
                                    <option value="price_asc">Precio: Menor a Mayor</option>
                                    <option value="price_desc">Precio: Mayor a Menor</option>
                                    <option value="cost_asc">Costo: Menor a Mayor</option>
                                    <option value="cost_desc">Costo: Mayor a Menor</option>
                                    <option value="stock_asc">Stock: Menor a Mayor</option>
                                    <option value="stock_desc">Stock: Mayor a Menor</option>
                                    <option value="material_category">Material → Categoría</option>
                                    <option value="status_location">Estado → Ubicación</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="inventory-list"></div>
            `;
        }
    },

    async setupEventListeners() {
        console.log('🔧 [setupEventListeners] Iniciando configuración de event listeners...');
        
        document.getElementById('inventory-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('inventory-import-btn')?.addEventListener('click', () => this.importCSV());
        document.getElementById('inventory-export-btn')?.addEventListener('click', () => this.exportInventory());
        
        // Toggle de vista (Grid/Lista) - Función helper con múltiples intentos
        const setupViewButtons = (attempt = 1) => {
            console.log(`🔍 [setupViewButtons] Intento ${attempt}: Buscando botones de vista...`);
            
            const gridBtn = document.getElementById('inventory-view-grid-btn');
            const listBtn = document.getElementById('inventory-view-list-btn');
            
            console.log(`🔍 [setupViewButtons] Grid encontrado:`, !!gridBtn, 'List encontrado:', !!listBtn);
            
            if (gridBtn && listBtn) {
                console.log('✅ Botones de vista encontrados, configurando listeners...');
                
                // Remover listeners anteriores clonando los elementos
                const gridParent = gridBtn.parentNode;
                const listParent = listBtn.parentNode;
                const newGridBtn = gridBtn.cloneNode(true);
                const newListBtn = listBtn.cloneNode(true);
                
                gridParent.replaceChild(newGridBtn, gridBtn);
                listParent.replaceChild(newListBtn, listBtn);
                
                // Agregar listeners a los nuevos elementos
                const finalGridBtn = document.getElementById('inventory-view-grid-btn');
                const finalListBtn = document.getElementById('inventory-view-list-btn');
                
                if (finalGridBtn) {
                    finalGridBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔄 [CLICK] Cambiando a vista GRID');
                        this.currentView = 'grid';
                        this.updateViewButtons();
                        this.loadInventory();
                    });
                    console.log('✅ Listener agregado a botón GRID');
                }
                
                if (finalListBtn) {
                    finalListBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🔄 [CLICK] Cambiando a vista LISTA');
                        this.currentView = 'list';
                        this.updateViewButtons();
                        this.loadInventory();
                    });
                    console.log('✅ Listener agregado a botón LISTA');
                }
                
                // Actualizar estado visual inicial
                this.updateViewButtons();
                console.log('✅ Botones de vista configurados correctamente');
                return true;
            } else {
                console.warn(`⚠️ Botones de vista no encontrados en intento ${attempt}. Grid:`, !!gridBtn, 'List:', !!listBtn);
                if (gridBtn) console.log('📍 Grid button location:', gridBtn.getBoundingClientRect());
                if (listBtn) console.log('📍 List button location:', listBtn.getBoundingClientRect());
                return false;
            }
        };
        
        // Intentar configurar inmediatamente
        if (!setupViewButtons(1)) {
            // Si no se encuentran, intentar después de un pequeño delay
            setTimeout(() => {
                if (!setupViewButtons(2)) {
                    // Último intento después de más tiempo
                    setTimeout(() => {
                        setupViewButtons(3);
                    }, 500);
                }
            }, 100);
        }
        
        // También mantener delegación de eventos como fallback
        const inventoryContainer = document.getElementById('module-content') || document.querySelector('.inventory-container');
        if (inventoryContainer) {
            inventoryContainer.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('.inventory-view-btn');
                if (viewBtn && (viewBtn.id === 'inventory-view-grid-btn' || viewBtn.id === 'inventory-view-list-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const view = viewBtn.dataset.view || (viewBtn.id.includes('grid') ? 'grid' : 'list');
                    console.log(`🔄 Cambiando a vista ${view.toUpperCase()} (delegación)`);
                    this.currentView = view;
                    this.updateViewButtons();
                    this.loadInventory();
                }
            });
            console.log('✅ Delegación de eventos configurada como fallback');
        }
        
        // Escaneo de código de barras
        this.setupBarcodeScanning();
        
        // Nuevos botones de acciones en lote
        document.getElementById('inventory-delete-selected-btn')?.addEventListener('click', () => this.deleteSelectedItems());
        document.getElementById('inventory-select-all-btn')?.addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('inventory-print-selected-labels-btn')?.addEventListener('click', () => this.printSelectedLabels());
        document.getElementById('inventory-print-labels-btn')?.addEventListener('click', () => this.printSelectedLabels());
        
        // Filtro de alertas de stock
        document.getElementById('inventory-stock-alert-filter')?.addEventListener('change', () => this.loadInventory());
        
        // Delegación: clic en chips de categoría y pills de alerta (barra generada en displayInventoryStats)
        const statsContainer = document.getElementById('inventory-stats');
        if (statsContainer) {
            const handleAlertOrCategoryClick = (target) => {
                const alertItem = target?.closest('.alert-item');
                if (alertItem) {
                    const value = alertItem.dataset.value ?? '';
                    const select = document.getElementById('inventory-stock-alert-filter');
                    if (select) {
                        select.value = value;
                        this.loadInventory();
                    }
                    return true;
                }
                const chip = target?.closest('.inventory-category-chip');
                if (chip) {
                    statsContainer.querySelectorAll('.inventory-category-bar .inventory-category-chip').forEach(b => b.classList.remove('active'));
                    chip.classList.add('active');
                    this.loadInventory();
                    return true;
                }
                return false;
            };
            statsContainer.addEventListener('click', (e) => {
                if (handleAlertOrCategoryClick(e.target)) return;
            });
            statsContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (handleAlertOrCategoryClick(e.target)) {
                        e.preventDefault();
                    }
                }
            });
        }
        
        // Listen for demo data loaded event
        window.addEventListener('demo-data-loaded', () => {
            if (this.initialized) {
                this.loadInventory();
            }
        });
        
        const searchInput = document.getElementById('inventory-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => this.loadInventory(), 300));
        }

        const statusFilter = document.getElementById('inventory-status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.loadInventory());
        }

        const branchFilter = document.getElementById('inventory-branch-filter');
        if (branchFilter) {
            let branches = await DB.getAll('catalog_branches') || [];
            
            // Verificar si el usuario es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener sucursal actual del usuario
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id');
            
            // Si NO es master_admin, ocultar el dropdown y forzar filtro a su sucursal
            if (!isMasterAdmin) {
                branchFilter.style.display = 'none';
                // Forzar el filtro a la sucursal del usuario
                if (currentBranchId) {
                    branchFilter.value = currentBranchId;
                }
            } else {
                // Master admin puede ver todas las sucursales
                branchFilter.style.display = '';
                
                // Eliminar duplicados: si hay múltiples sucursales con el mismo nombre "Sucursal Principal", 
                // mantener solo la primera y eliminar las demás
                const seenNames = new Set();
                const seenIds = new Set();
                branches = branches.filter(b => {
                    if (!b || !b.id || !b.name) return false;
                    // Si el nombre es "Sucursal Principal" y ya vimos una, excluir esta
                    if (b.name === 'Sucursal Principal' && seenNames.has('Sucursal Principal')) {
                        console.log(`🗑️ Eliminando sucursal duplicada "Sucursal Principal" con ID: ${b.id}`);
                        return false;
                    }
                    // Si ya vimos este ID, excluir (duplicado por ID)
                    if (seenIds.has(b.id)) {
                        console.log(`🗑️ Eliminando sucursal duplicada por ID: ${b.id} (${b.name})`);
                        return false;
                    }
                    seenNames.add(b.name);
                    seenIds.add(b.id);
                    return true;
                });
                
                branchFilter.innerHTML = '<option value="all">Todas las sucursales</option>' + 
                branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
                // Master admin: por defecto ver inventario completo
                branchFilter.value = 'all';
            }
            
            branchFilter.addEventListener('change', () => this.loadInventory());
        }

        const metalFilter = document.getElementById('inventory-metal-filter');
        if (metalFilter) {
            metalFilter.addEventListener('change', () => this.loadInventory());
        }

        const stoneTypeFilter = document.getElementById('inventory-stone-type-filter');
        if (stoneTypeFilter) {
            stoneTypeFilter.addEventListener('change', () => this.loadInventory());
        }

        const certificateFilter = document.getElementById('inventory-certificate-filter');
        if (certificateFilter) {
            certificateFilter.addEventListener('change', () => this.loadInventory());
        }

        const minPrice = document.getElementById('inventory-min-price');
        if (minPrice) {
            minPrice.addEventListener('input', Utils.debounce(() => this.loadInventory(), 500));
        }

        const maxPrice = document.getElementById('inventory-max-price');
        if (maxPrice) {
            maxPrice.addEventListener('input', Utils.debounce(() => this.loadInventory(), 500));
        }

        // Filtro por proveedor
        const supplierFilter = document.getElementById('inventory-supplier-filter');
        if (supplierFilter) {
            await this.loadSupplierFilterDropdown();
            supplierFilter.addEventListener('change', () => this.loadInventory());
        }

        // Toggle de filtros avanzados
        const advancedFiltersToggle = document.getElementById('inventory-advanced-filters-toggle');
        const advancedFilters = document.getElementById('inventory-advanced-filters');
        if (advancedFiltersToggle && advancedFilters) {
            advancedFiltersToggle.addEventListener('click', () => {
                const isVisible = advancedFilters.style.display !== 'none';
                advancedFilters.style.display = isVisible ? 'none' : 'block';
                advancedFiltersToggle.innerHTML = isVisible 
                    ? '<i class="fas fa-filter"></i> Filtros Avanzados'
                    : '<i class="fas fa-filter"></i> Ocultar Filtros';
            });
        }

        // Event listeners para filtros avanzados
        const advancedFilterIds = [
            'inventory-material-filter', 'inventory-purity-filter', 'inventory-plating-filter',
            'inventory-style-filter', 'inventory-finish-filter', 'inventory-theme-filter',
            'inventory-ring-size-filter', 'inventory-chain-length-filter',
            'inventory-condition-filter', 'inventory-location-filter', 'inventory-collection-filter',
            'inventory-sort-by'
        ];
        
        advancedFilterIds.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => this.loadInventory());
            }
        });

        // Checkbox de agrupación por colección
        const groupByCollection = document.getElementById('inventory-group-by-collection');
        if (groupByCollection) {
            groupByCollection.addEventListener('change', () => this.loadInventory());
        }

        // Poblar dropdowns dinámicamente
        this.populateCollectionFilter();
        this.populateMetalFilter();
        this.populateStoneTypeFilter();

        // Recargar dropdowns cuando se carga el inventario (sin disparar change → loadInventory)
        window.addEventListener('inventory-loaded', () => {
            this._suppressFilterChange = true;
            try {
                this.populateCollectionFilter();
                this.populateMetalFilter();
                this.populateStoneTypeFilter();
            } finally {
                this._suppressFilterChange = false;
            }
        });

            // Escuchar cambios de sucursal para sincronizar el dropdown
            const inventoryBranchChangedListener = async (e) => {
                if (this.initialized) {
                    const branchFilter = document.getElementById('inventory-branch-filter');
                    if (branchFilter && e.detail && e.detail.branchId) {
                        console.log(`🔄 Inventory: Sincronizando dropdown con sucursal del header: ${e.detail.branchId}`);
                        // CRÍTICO: Actualizar el dropdown PRIMERO, luego recargar
                        // Esto asegura que loadInventory() use el valor correcto del dropdown
                        branchFilter.value = e.detail.branchId;
                        // Pequeño delay para asegurar que el DOM se actualizó
                        await new Promise(resolve => setTimeout(resolve, 50));
                        // Recargar inventario con el nuevo filtro
                        await this.loadInventory();
                    }
                }
            };
            // Remover listener anterior si existe para evitar duplicados
            window.removeEventListener('branch-changed', inventoryBranchChangedListener);
            window.addEventListener('branch-changed', inventoryBranchChangedListener);

        // Escuchar eventos de transferencias y actualizaciones de inventario
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            // Usar debounce para evitar recargas excesivas
            let inventoryUpdateTimeout = null;
            let transferUpdateTimeout = null;

            // Actualizar inventario cuando se completa una transferencia
            Utils.EventBus.on('transfer-completed', async (data) => {
                if (this.initialized) {
                    // Limpiar timeout anterior si existe
                    if (transferUpdateTimeout) {
                        clearTimeout(transferUpdateTimeout);
                    }
                    // Usar debounce de 500ms
                    transferUpdateTimeout = setTimeout(async () => {
                        // Recargar inventario para mostrar stock actualizado
                        await this.loadInventory();
                    }, 500);
                }
            });

            // Actualizar inventario cuando otro módulo actualiza un item (debounce 800ms para evitar trabarse)
            Utils.EventBus.on('inventory-updated', async (data) => {
                if (this.initialized && data && data.item) {
                    if (inventoryUpdateTimeout) clearTimeout(inventoryUpdateTimeout);
                    inventoryUpdateTimeout = setTimeout(async () => {
                        await this.loadInventory();
                        if (data.item.id) {
                            setTimeout(() => this.highlightItem(data.item.id), 300);
                        }
                    }, 800);
                }
            });
        }
            
            // Escuchar eventos Socket.IO para actualización en tiempo real
            // Eventos de inventario de todas las sucursales (master_admin)
            if (UserManager.currentUser?.is_master_admin) {
                let allBranchesUpdateTimer = null;
                window.addEventListener('inventory-updated-all-branches', async (e) => {
                    const { branchId, action, item } = e.detail;
                    if (this.initialized) {
                        clearTimeout(allBranchesUpdateTimer);
                        allBranchesUpdateTimer = setTimeout(async () => {
                            await this.loadInventory();
                            if (item && item.id) {
                                setTimeout(() => this.highlightItem(item.id), 300);
                            }
                        }, 800);
                    }
                });
            }
            
            // Eventos de inventario locales (para usuarios normales o master_admin viendo su sucursal)
            let inventoryUpdateTimeout = null;
            const pendingUpdates = new Set(); // Para evitar procesar el mismo item múltiples veces
            
            window.addEventListener('inventory-updated', async (e) => {
                const { item, action } = e.detail || {};
                if (this.initialized && item) {
                    const currentBranchId = BranchManager?.getCurrentBranchId();
                    // Solo actualizar si el item es de la sucursal actual o es master admin
                    if (!currentBranchId || item.branch_id === currentBranchId || UserManager.currentUser?.is_master_admin) {
                        // Evitar procesar el mismo item múltiples veces simultáneamente
                        if (pendingUpdates.has(item.id)) {
                            return; // Ya se está procesando
                        }
                        pendingUpdates.add(item.id);
                        try {
                            // Actualizar o crear en IndexedDB según la acción
                            if (action === 'deleted') {
                                await DB.delete('inventory_items', item.id);
                            } else {
                                // Obtener campos adicionales del item local si existe
                                const localItem = await DB.get('inventory_items', item.id).catch(() => null);
                                // Merge: combinar datos del servidor con campos adicionales locales
                                const mergedItem = {
                                    ...item, // Datos del servidor (campos del esquema)
                                    server_id: item.id, // Marcar como sincronizado
                                    // Preservar campos adicionales locales si existen
                                    ...(localItem ? {
                                        stone: localItem.stone || item.stone || '',
                                        carats: localItem.carats || item.carats || 0,
                                        total_carats: localItem.total_carats || item.total_carats || 0,
                                        color: localItem.color || item.color || '',
                                        clarity: localItem.clarity || item.clarity || '',
                                        cut: localItem.cut || item.cut || '',
                                        size: localItem.size || item.size || '',
                                        weight_g: localItem.weight_g || item.weight || 0,
                                        measures: localItem.measures || item.measures || '',
                                        suggested_price: localItem.suggested_price || item.suggested_price || 0,
                                        collection: localItem.collection || item.collection || '',
                                        supplier: localItem.supplier || item.supplier || '',
                                        origin_country: localItem.origin_country || item.origin_country || '',
                                        year: localItem.year || item.year || null,
                                        location: localItem.location || item.location || '',
                                        tags: localItem.tags || item.tags || '',
                                        notes: localItem.notes || item.notes || '',
                                        certificate_type: localItem.certificate_type || item.certificate_type || ''
                                    } : {})
                                };
                                // Guardar en IndexedDB (sincronización bidireccional)
                                await DB.put('inventory_items', mergedItem, { autoBranchId: false });
                                console.log(`✅ Item actualizado en IndexedDB: ${item.id}`);
                            }
                            
                            // Remover del set de pendientes después de un pequeño delay
                            setTimeout(() => {
                                pendingUpdates.delete(item.id);
                            }, 500);
                            
                            // Debounce corto para tiempo real: recargar pronto sin saturar (400ms)
                            if (inventoryUpdateTimeout) {
                                clearTimeout(inventoryUpdateTimeout);
                            }
                            const debounceMs = (action === 'created') ? 150 : 400;
                            inventoryUpdateTimeout = setTimeout(async () => {
                                await this.loadInventory();
                                if (item && item.id && action !== 'deleted') {
                                    setTimeout(() => {
                                        this.highlightItem(item.id);
                                    }, 300);
                                }
                            }, debounceMs);
                        } catch (error) {
                            console.error('Error actualizando IndexedDB desde servidor:', error);
                            pendingUpdates.delete(item.id); // Remover en caso de error
                        }
                    }
                }
            });
        
        console.log('✅ [setupEventListeners] Configuración completada');
    },

    async loadInventory(options) {
        if (this._suppressFilterChange) return;
        if (this._loadInventoryInProgress && !options?.force) return;
        this._loadInventoryInProgress = true;
        this._lastLoadEmptyFromServer = false;
        const ensureItemInList = options && options.ensureItemInList;
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('inventory.view')) {
            const container = document.getElementById('inventory-list');
            if (container) {
                container.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver inventario</div>';
            }
            return;
        }

        // Asegurar que el contenedor existe
        const container = document.getElementById('inventory-list');
        if (!container) {
            console.warn('Contenedor inventory-list no encontrado, creando UI...');
            await this.setupUI();
            // Intentar de nuevo después de crear el UI
            const newContainer = document.getElementById('inventory-list');
            if (!newContainer) {
                console.error('No se pudo crear el contenedor de inventario');
                return;
            }
        }

        try {
            // Obtener items filtrados por sucursal - FORZAR RECARGA SIN CACHE
            let currentBranchId = typeof BranchManager !== 'undefined'
                ? BranchManager.getCurrentBranchId()
                : localStorage.getItem('current_branch_id');
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            // Para usuarios no master: asegurar branch desde empleado si no hay en BranchManager/localStorage
            if (!isMasterAdmin && !currentBranchId && typeof UserManager !== 'undefined') {
                const emp = UserManager.currentEmployee;
                if (emp?.branch_id) currentBranchId = String(emp.branch_id).trim();
                else if (Array.isArray(emp?.branch_ids) && emp.branch_ids.length) currentBranchId = String(emp.branch_ids[0]).trim();
            }
            if (!currentBranchId) currentBranchId = localStorage.getItem('current_branch_id');

            // Si es master_admin y no hay filtro de sucursal específico, puede ver todos los items
            const inventoryBranchFilterEl = document.getElementById('inventory-branch-filter');
            const branchFilterValue = inventoryBranchFilterEl?.value;

            // Determinar qué branch_id usar para el filtro
            let filterBranchId = null;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                filterBranchId = branchFilterValue;
            } else if (isMasterAdmin && branchFilterValue === 'all') {
                filterBranchId = null;
            } else if (isMasterAdmin && (!branchFilterValue || branchFilterValue === '')) {
                filterBranchId = null;
            } else {
                // Usuario normal = siempre filtrar por currentBranchId (nunca "all")
                filterBranchId = currentBranchId;
            }
            
            const viewAllBranches = isMasterAdmin && filterBranchId === null;

            // ========== SINCRONIZACIÓN BIDIRECCIONAL ==========
            // PASO 1: Subir items locales que NO están en el servidor (en background para no bloquear)
            const syncPromise = (async () => {
                try {
                    if (typeof API !== 'undefined' && API.baseURL && API.token && API.createInventoryItem && API.updateInventoryItem) {
                        console.log('📤 [Paso 1 Inventory] Buscando items locales que no están en el servidor...');
                    
                    // Obtener todos los items locales
                    const allLocalItems = await DB.getAll('inventory_items') || [];
                    
                    // Filtrar items que NO tienen server_id o tienen un ID local (no UUID)
                    // IMPORTANTE: Si el item tiene un UUID como ID, significa que ya está en el servidor
                    // Solo necesitamos sincronizar si NO tiene server_id Y el ID no es UUID
                    const unsyncedItems = allLocalItems.filter(item => {
                        if (!item || !item.id) return false;
                        // Verificar si el ID es un UUID (formato del servidor)
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id));
                        // Si el ID es UUID, el item ya está en el servidor (no necesita sincronización)
                        if (isUUID) {
                            return false; // Ya está sincronizado
                        }
                        // Si no es UUID y no tiene server_id, necesita sincronizarse
                        return !item.server_id;
                    });
                    
                    // Filtrar por sucursal actual si no es master admin
                    const itemsToSync = unsyncedItems.filter(item => {
                        if (!filterBranchId) return true; // Master admin puede ver todos
                        return item.branch_id === filterBranchId;
                    });
                    
                    console.log(`📊 [Paso 1 Inventory] Encontrados ${itemsToSync.length} items locales sin sincronizar`);
                    
                    if (itemsToSync.length > 0) {
                        // Agrupar por SKU + branch_id para evitar duplicados
                        const itemsByKey = new Map();
                        for (const localItem of itemsToSync) {
                            const key = `${localItem.sku || localItem.id}_${localItem.branch_id || 'no-branch'}`;
                            
                            // Si ya hay un item con esta clave, usar el más reciente
                            if (!itemsByKey.has(key)) {
                                itemsByKey.set(key, localItem);
                            } else {
                                const existing = itemsByKey.get(key);
                                const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                                const currentUpdated = localItem.updated_at ? new Date(localItem.updated_at) : new Date(0);
                                if (currentUpdated > existingUpdated) {
                                    itemsByKey.set(key, localItem);
                                }
                            }
                        }
                        
                        // Subir solo los items únicos (procesar en lotes para mejor rendimiento)
                        let uploadedCount = 0;
                        let errorCount = 0;
                        const itemsArray = Array.from(itemsByKey.entries());
                        const batchSize = 5; // Procesar 5 items a la vez
                        
                        for (let i = 0; i < itemsArray.length; i += batchSize) {
                            const batch = itemsArray.slice(i, i + batchSize);
                            
                            // Procesar lote en paralelo
                            const batchPromises = batch.map(async ([key, localItem]) => {
                                try {
                                    // Limpiar datos antes de enviar (solo campos permitidos)
                                    const cleanItem = {
                                        sku: localItem.sku,
                                        barcode: localItem.barcode,
                                        name: localItem.name,
                                        description: localItem.description,
                                        category: localItem.category,
                                        subcategory: localItem.subcategory,
                                        collection: localItem.collection,
                                        metal: localItem.metal,
                                        material: localItem.material,
                                        purity: localItem.purity,
                                        plating: localItem.plating,
                                        stone_type: localItem.stone_type,
                                        stone_weight: localItem.stone_weight,
                                        stones: localItem.stones,
                                        weight: localItem.weight,
                                        measurements: localItem.measurements,
                                        price: localItem.price,
                                        sale_price: localItem.sale_price,
                                        cost: localItem.cost,
                                        discount: localItem.discount,
                                        discount_amount: localItem.discount_amount,
                                        currency: localItem.currency || 'MXN',
                                        margin_percent: localItem.margin_percent,
                                        stock_actual: localItem.stock_actual || 0,
                                        stock_min: localItem.stock_min || 0,
                                        stock_max: localItem.stock_max || 0,
                                        status: localItem.status || 'disponible',
                                        condition: localItem.condition,
                                        location_detail: localItem.location_detail,
                                        style: localItem.style,
                                        finish_type: localItem.finish_type,
                                        theme: localItem.theme,
                                        certificate_number: localItem.certificate_number,
                                        certificate_details: localItem.certificate_details,
                                        supplier: localItem.supplier,
                                        supplier_code: localItem.supplier_code,
                                        notes: localItem.notes,
                                        photos: localItem.photos || [],
                                        branch_id: localItem.branch_id || filterBranchId
                                    };
                                    
                                    // Verificar si el item ya existe en el servidor por SKU
                                    let serverItem = null;
                                    if (cleanItem.sku && filterBranchId) {
                                        try {
                                            const serverItems = await API.getInventoryItems({ branch_id: filterBranchId, sku: cleanItem.sku });
                                            if (serverItems && serverItems.length > 0) {
                                                serverItem = serverItems[0];
                                            }
                                        } catch (e) {
                                            // Ignorar error, continuar con creación
                                        }
                                    }
                                    
                                    if (serverItem && serverItem.id) {
                                        // El item ya existe, actualizar
                                        const updatedItem = await API.updateInventoryItem(serverItem.id, cleanItem);
                                        if (updatedItem && updatedItem.id) {
                                            // Actualizar TODOS los items locales con el mismo SKU
                                            const allLocalItems = await DB.getAll('inventory_items') || [];
                                            const itemsToUpdate = allLocalItems.filter(i => {
                                                const iKey = `${i.sku || i.id}_${i.branch_id || 'no-branch'}`;
                                                return iKey === key;
                                            });
                                            
                                            for (const itemToUpdate of itemsToUpdate) {
                                                itemToUpdate.server_id = updatedItem.id;
                                                itemToUpdate.id = updatedItem.id;
                                                itemToUpdate.sync_status = 'synced';
                                                await DB.put('inventory_items', itemToUpdate, { autoBranchId: false });
                                            }
                                            
                                            return { success: true, id: updatedItem.id, action: 'updated' };
                                        }
                                    } else {
                                        // El item no existe, crear nuevo
                                        const createdItem = await API.createInventoryItem(cleanItem);
                                        if (createdItem && createdItem.id) {
                                            // Actualizar TODOS los items locales con el mismo SKU
                                            const allLocalItems = await DB.getAll('inventory_items') || [];
                                            const itemsToUpdate = allLocalItems.filter(i => {
                                                const iKey = `${i.sku || i.id}_${i.branch_id || 'no-branch'}`;
                                                return iKey === key;
                                            });
                                            
                                            for (const itemToUpdate of itemsToUpdate) {
                                                itemToUpdate.server_id = createdItem.id;
                                                itemToUpdate.id = createdItem.id;
                                                itemToUpdate.sync_status = 'synced';
                                                await DB.put('inventory_items', itemToUpdate, { autoBranchId: false });
                                            }
                                            
                                            return { success: true, id: createdItem.id, action: 'created' };
                                        }
                                    }
                                    return { success: false, error: 'No se pudo crear/actualizar' };
                                } catch (uploadError) {
                                    console.error(`❌ [Paso 1 Inventory] Error subiendo item ${localItem.id} (${localItem.sku}):`, uploadError);
                                    return { success: false, error: uploadError.message };
                                }
                            });
                            
                            // Esperar que termine el lote antes de continuar
                            const results = await Promise.allSettled(batchPromises);
                            results.forEach((result, index) => {
                                if (result.status === 'fulfilled' && result.value.success) {
                                    uploadedCount++;
                                    const [key, localItem] = batch[index];
                                    console.log(`✅ [Paso 1 Inventory] Item ${result.value.action} en servidor: ${result.value.id} (${localItem.sku || localItem.name})`);
                                } else {
                                    errorCount++;
                                }
                            });
                            
                            // Pequeña pausa entre lotes para no sobrecargar el servidor
                            if (i + batchSize < itemsArray.length) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        }
                        
                        if (errorCount > 0) {
                            console.warn(`⚠️ [Paso 1 Inventory] ${errorCount} items fallaron al sincronizar`);
                        }
                        
                        console.log(`✅ [Paso 1 Inventory] Sincronización local→servidor completada: ${uploadedCount} items subidos, ${errorCount} errores`);
                    }
                } else {
                    console.log('⚠️ [Paso 1 Inventory] API no disponible para subir items locales');
                }
            } catch (error) {
                console.error('❌ [Paso 1 Inventory] Error sincronizando items locales al servidor:', error);
                // Continuar aunque falle este paso
            }
            })();
            
            // No esperar la sincronización, continuar con la carga
            syncPromise.catch(err => console.error('Error en sincronización en background:', err));

            // ========== CACHE-FIRST: Cargar desde IndexedDB primero para mostrar al instante ==========
            const norm = (id) => String(id || '').trim().toLowerCase();
            const fromIdb = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            let cachedFiltered = [];
            if (filterBranchId) {
                const fb = norm(filterBranchId);
                cachedFiltered = fromIdb.filter(item => item.branch_id && norm(item.branch_id) === fb);
            } else if (viewAllBranches && isMasterAdmin) {
                cachedFiltered = fromIdb;
            } else if (currentBranchId) {
                const cb = norm(currentBranchId);
                cachedFiltered = fromIdb.filter(item => item.branch_id && norm(item.branch_id) === cb);
            } else {
                cachedFiltered = fromIdb;
            }
            if (ensureItemInList && ensureItemInList.id && !cachedFiltered.some(i => i.id === ensureItemInList.id)) {
                cachedFiltered = [ensureItemInList, ...cachedFiltered];
            }
            const hasCache = cachedFiltered.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getInventoryItems;

            let allItemsRaw = [];
            let skipGhostVerification = false;
            let runApiInBackground = false;

            if (hasCache) {
                // CACHE-FIRST: Mostrar datos desde IndexedDB al instante; API en background
                allItemsRaw = cachedFiltered;
                skipGhostVerification = true;
                runApiInBackground = hasApi;
                console.log(`⚡ [Cache-First] Mostrando ${allItemsRaw.length} items desde IndexedDB (actualización en background)`);
            } else if (hasApi) {
                // Sin caché: mostrar "Cargando..." y esperar API
                if (container) container.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);"><i class="fas fa-spinner fa-spin"></i> Cargando inventario...</div>';
                try {
                    const categoryChip = document.querySelector('.inventory-category-bar .inventory-category-chip.active')?.dataset.category;
                    const categoryFilter = (categoryChip && categoryChip !== 'all') ? categoryChip : undefined;
                    const filters = {
                        branch_id: filterBranchId != null ? String(filterBranchId).trim() || undefined : undefined,
                        status: document.getElementById('inventory-status-filter')?.value || undefined,
                        category: categoryFilter
                    };
                    Object.keys(filters).forEach(k => { if (filters[k] == null || filters[k] === '') delete filters[k]; });
                    allItemsRaw = await API.getInventoryItems(filters);
                    const apiReturnedZero = (allItemsRaw.length === 0);
                    if (filterBranchId) {
                        const filterBranchNorm = String(filterBranchId || '').trim().toLowerCase();
                        allItemsRaw = allItemsRaw.filter(item => {
                            if (!item.branch_id) return false;
                            return String(item.branch_id || '').trim().toLowerCase() === filterBranchNorm;
                        });
                    }
                    let savedCount = 0, updatedCount = 0;
                    for (const serverItem of allItemsRaw) {
                        try {
                            const key = `${serverItem.sku || serverItem.id}_${serverItem.branch_id || 'no-branch'}`;
                            const localItem = { ...serverItem, server_id: serverItem.id, sync_status: 'synced' };
                            await DB.put('inventory_items', localItem, { autoBranchId: false });
                            savedCount++;
                        } catch (err) { console.warn('Error guardando item:', err); }
                    }
                    if (apiReturnedZero && allItemsRaw.length === 0) this._lastLoadEmptyFromServer = true;
                    else this._lastLoadEmptyFromServer = false;
                } catch (apiError) {
                    console.warn('Error cargando inventario desde API:', apiError);
                    const code = apiError?.code || apiError?.details?.code;
                    const errMsg = (apiError?.message || apiError?.details?.message || '') || '';
                    const isNoBranch = code === 'NO_BRANCH_ASSIGNED' || errMsg.includes('sucursal asignada');
                    if (isNoBranch && typeof Utils !== 'undefined' && Utils.showNotification) {
                        Utils.showNotification('No tienes sucursal asignada. Pide al administrador que te asigne una.', 'warning');
                    }
                    allItemsRaw = [];
                }
            } else {
                // Sin API: cargar desde IndexedDB
                allItemsRaw = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
                const fb = filterBranchId ? norm(filterBranchId) : null;
                const cb = currentBranchId ? norm(currentBranchId) : null;
                if (filterBranchId && fb) allItemsRaw = allItemsRaw.filter(item => item.branch_id && norm(item.branch_id) === fb);
                else if (!viewAllBranches && cb) allItemsRaw = allItemsRaw.filter(item => item.branch_id && norm(item.branch_id) === cb);
            }

            // API en background cuando hay caché (Cache-First)
            if (runApiInBackground) {
                Promise.resolve().then(async () => {
                    try {
                        const categoryChip = document.querySelector('.inventory-category-bar .inventory-category-chip.active')?.dataset.category;
                        const categoryFilter = (categoryChip && categoryChip !== 'all') ? categoryChip : undefined;
                        const filters = {
                            branch_id: filterBranchId != null ? String(filterBranchId).trim() || undefined : undefined,
                            status: document.getElementById('inventory-status-filter')?.value || undefined,
                            category: categoryFilter
                        };
                        Object.keys(filters).forEach(k => { if (filters[k] == null || filters[k] === '') delete filters[k]; });
                        const fresh = await API.getInventoryItems(filters);
                        let freshFiltered = fresh;
                        if (filterBranchId) {
                            const fbn = String(filterBranchId || '').trim().toLowerCase();
                            freshFiltered = fresh.filter(item => item?.branch_id && String(item.branch_id).trim().toLowerCase() === fbn);
                        }
                        for (const serverItem of freshFiltered) {
                            try {
                                const localItem = { ...serverItem, server_id: serverItem.id, sync_status: 'synced' };
                                await DB.put('inventory_items', localItem, { autoBranchId: false });
                            } catch (e) { /* ignore */ }
                        }
                        const beforeIds = new Set((allItemsRaw || []).map(i => i.id));
                        const afterIds = new Set(freshFiltered.map(i => i.id));
                        const changed = beforeIds.size !== afterIds.size || [...beforeIds].some(id => !afterIds.has(id));
                        const now = Date.now();
                        const minInterval = 3000;
                        if (changed && (now - this._lastBackgroundRefreshTime) >= minInterval) {
                            this._lastBackgroundRefreshTime = now;
                            this.loadInventory({ force: true }).catch(e => console.warn('Refresh tras sync:', e));
                        }
                    } catch (e) {
                        console.warn('Sync background inventario:', e);
                    }
                }).catch(e => console.warn('Sync background inventario:', e));
            }
            
            console.log(`📦 Items obtenidos: ${allItemsRaw.length}`);
            
            // VERIFICAR ITEMS FANTASMA (se salta en Cache-First para mostrar al instante; se hará en background)
            const verifiedItems = [];
            const ghostItems = [];
            let serverItems = new Set();
            let serverBySku = new Map();
            let serverByBarcode = new Map();
            
            if (skipGhostVerification) {
                verifiedItems.push(...allItemsRaw);
            } else {
                if (typeof API !== 'undefined' && API.baseURL && API.token && API.getInventoryItems) {
                    try {
                        const branchForVerification = viewAllBranches ? null : (filterBranchId || currentBranchId);
                        const serverItemsList = await API.getInventoryItems({
                            branch_id: branchForVerification
                        });
                        serverItems = new Set(serverItemsList.map(item => item.id));
                        serverBySku = new Map(serverItemsList.filter(i => i?.sku).map(i => [String(i.sku), i]));
                        serverByBarcode = new Map(serverItemsList.filter(i => i?.barcode).map(i => [String(i.barcode), i]));
                        console.log(`✅ ${serverItems.size} items verificados contra servidor`);
                    } catch (apiError) {
                        console.warn('No se pudo verificar items contra servidor, usando verificación local:', apiError);
                    }
                }
            
            // Verificar cada item
            for (const item of allItemsRaw) {
                try {
                    let isValid = false;
                    // Pieza recién creada (ensureItemInList) siempre válida en camino rápido
                    if (ensureItemInList && item.id === ensureItemInList.id) {
                        isValid = true;
                    } else
                    // Si tenemos lista del servidor, verificar contra ella
                    if (serverItems.size > 0) {
                        isValid = serverItems.has(item.id);
                    } else {
                        // Fallback: verificar existencia local
                    const verified = await DB.get('inventory_items', item.id);
                        isValid = verified && verified.id === item.id;
                    }
                    
                    if (isValid) {
                        verifiedItems.push(item);
                    } else {
                        // Si el ID no coincide pero el SKU/Barcode existe en servidor, NO es fantasma: es mismatch de id.
                        if (serverItems.size > 0) {
                            const skuKey = item?.sku ? String(item.sku) : null;
                            const bcKey = item?.barcode ? String(item.barcode) : null;
                            const serverMatch = (skuKey && serverBySku.get(skuKey)) || (bcKey && serverByBarcode.get(bcKey));
                            if (serverMatch && serverMatch.id) {
                                try {
                                    await DB.delete('inventory_items', item.id);
                                    await DB.put('inventory_items', serverMatch, { autoBranchId: false });
                                    // Limpiar sync_queue del id viejo para no reintentar crear duplicado
                                    const syncQueue = await DB.getAll('sync_queue') || [];
                                    for (const queueItem of syncQueue) {
                                        if (queueItem.type === 'inventory_item' && queueItem.entity_id === item.id) {
                                            await DB.delete('sync_queue', queueItem.id);
                                        }
                                    }
                                    console.log(`🔁 Item reconciliado por SKU/Barcode: ${item.id} → ${serverMatch.id}`);
                                    verifiedItems.push(serverMatch);
                                    continue;
                                } catch (reconcileErr) {
                                    console.warn('No se pudo reconciliar item por SKU/Barcode:', reconcileErr);
                                }
                            }
                        }

                        // Modo seguro: no ocultar ni borrar automáticamente piezas no verificadas,
                        // porque una respuesta parcial/transitoria del servidor puede provocar subconteos.
                        verifiedItems.push(item);
                        ghostItems.push(item.id);
                        console.warn(`⚠️ Item no verificado (se mantiene visible): ${item.id} (${item.sku || item.name || 'sin nombre'})`);
                    }
                } catch (error) {
                    // Ante error transitorio, mantener visible el item.
                    verifiedItems.push(item);
                    ghostItems.push(item.id);
                    console.warn(`⚠️ Error verificando item ${item.id} (se mantiene visible):`, error);
                }
            }
            
            // No borrar automáticamente items "fantasma" para evitar pérdidas visuales de inventario.
            if (ghostItems.length > 0) {
                console.warn(`⚠️ ${ghostItems.length} items no verificados (modo seguro: sin borrado automático).`);
            }
            } // fin else (!skipGhostVerification)
            
            console.log(`✅ Items verificados: ${verifiedItems.length} válidos, ${ghostItems.length} fantasma`);

            // Incluir pieza recién creada/actualizada si se pasó ensureItemInList (mismo cliente tras guardar)
            if (ensureItemInList && ensureItemInList.id) {
                const alreadyInList = verifiedItems.some(i => i.id === ensureItemInList.id);
                if (!alreadyInList) {
                    const matchesBranch = !filterBranchId ||
                        (ensureItemInList.branch_id && String(ensureItemInList.branch_id) === String(filterBranchId)) ||
                        (viewAllBranches && isMasterAdmin);
                    if (matchesBranch) {
                        verifiedItems.push(ensureItemInList);
                        console.log(`📦 Item recién guardado incluido en lista: ${ensureItemInList.id}`);
                    }
                }
            }
            
            // Si se detectaron items no verificados, mostrar advertencia
            if (ghostItems.length > 0) {
                console.warn(`⚠️ Se detectaron ${ghostItems.length} items no verificados`);
                if (typeof Utils !== 'undefined' && Utils.showNotification) {
                    Utils.showNotification(`${ghostItems.length} items no verificados detectados (sin borrado automático)`, 'info');
                }
            }
            
            // PASO 3: Eliminar duplicados reales antes de mostrar
            // IMPORTANTE: deduplicar por SKU + branch colapsa piezas distintas del mismo modelo.
            // Para inventario, cada pieza debe conservarse; solo removemos duplicados por id.
            const itemsById = new Map();
            for (const item of verifiedItems) {
                const key = String(item?.id || '');
                if (!key) continue;

                if (!itemsById.has(key)) {
                    itemsById.set(key, item);
                } else {
                    const existing = itemsById.get(key);
                    if (item.server_id && !existing.server_id) {
                        itemsById.set(key, item);
                    } else if (existing.server_id && !item.server_id) {
                        // Mantener existente
                    } else {
                        const existingUpdated = existing.updated_at ? new Date(existing.updated_at) : new Date(0);
                        const currentUpdated = item.updated_at ? new Date(item.updated_at) : new Date(0);
                        if (currentUpdated > existingUpdated) {
                            itemsById.set(key, item);
                        }
                    }
                }
            }

            const uniqueItems = Array.from(itemsById.values());
            console.log(`🔍 [Paso 3 Inventory] Deduplicación por id: ${verifiedItems.length} → ${uniqueItems.length}`);
            
            // Ahora aplicar filtros
            let items = uniqueItems;
            
            // Filtrado por sucursal - ESTRICTO: cuando hay un filtro específico, SOLO mostrar items de esa sucursal
            if (filterBranchId) {
                // Si hay un filtro específico de sucursal, aplicar filtro ESTRICTO (comparación robusta)
                const beforeBranchFilter = items.length;
                const matchBranch = (a, b) => {
                    const sa = String(a || '').trim().toLowerCase();
                    const sb = String(b || '').trim().toLowerCase();
                    return !sa && !sb ? true : sa && sb && sa === sb;
                };
                items = items.filter(item => {
                    // CRÍTICO: Excluir items sin branch_id cuando se filtra por sucursal específica
                    if (!item.branch_id) {
                        return false; // NO mostrar items sin branch_id
                    }
                    return matchBranch(item.branch_id, filterBranchId);
                });
                console.log(`📍 Filtrado por sucursal: ${beforeBranchFilter} → ${items.length} items (sucursal: ${filterBranchId})`);
            } else if (viewAllBranches && isMasterAdmin) {
                // Master admin con filtro "Todas" = mostrar todos (incluyendo items sin branch_id)
                console.log(`📍 Sin filtro de sucursal: ${items.length} items (master_admin - todas las sucursales)`);
            } else {
                // Sin sucursal asignada o usuario normal sin branch_id = mostrar 0 items
                items = [];
                console.log(`📍 Sin sucursal asignada: 0 items`);
            }
            
            // Log para debugging
            if (items.length === 0) {
                const allItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
                if (allItems.length > 0) {
                    console.warn(`⚠️ Hay ${allItems.length} items en total, pero 0 items después del filtro de sucursal (${currentBranchId || 'sin sucursal'})`);
                    console.log('Items sin branch_id:', allItems.filter(i => !i.branch_id).length);
                    const branchIds = [...new Set(allItems.filter(i => i.branch_id).map(i => i.branch_id))];
                    console.log('Sucursales con items:', branchIds);
                } else {
                    console.warn('⚠️ No hay items en la base de datos');
                }
            } else {
                console.log(`✅ Cargados ${items.length} items de inventario`);
            }
            
            // Apply search filter
            const search = document.getElementById('inventory-search')?.value.toLowerCase() || '';
            if (search) {
                items = items.filter(item => 
                    item.sku?.toLowerCase().includes(search) ||
                    item.name?.toLowerCase().includes(search) ||
                    item.barcode?.includes(search) ||
                    item.metal?.toLowerCase().includes(search) ||
                    item.stone?.toLowerCase().includes(search)
                );
            }

            // Apply status filter
            const statusFilter = document.getElementById('inventory-status-filter')?.value;
            if (statusFilter) {
                items = items.filter(item => item.status === statusFilter);
            }

            // NOTA: El filtrado por sucursal ya se aplicó arriba (líneas 587-604)
            // Este bloque duplicado se eliminó porque el filtrado estricto se hace arriba
            // en la sección "Filtrado por sucursal" (líneas 587-604)

            // Apply cost range filter (ya no hay precio de venta)
            const minPrice = parseFloat(document.getElementById('inventory-min-price')?.value || '0');
            const maxPrice = parseFloat(document.getElementById('inventory-max-price')?.value || '999999999');
            items = items.filter(item => (item.cost || 0) >= minPrice && (item.cost || 0) <= maxPrice);

            // Apply metal filter (case-insensitive)
            const metalFilter = document.getElementById('inventory-metal-filter')?.value;
            if (metalFilter) {
                items = items.filter(item => (item.metal || '').toLowerCase() === (metalFilter || '').toLowerCase());
            }

            // Apply stone type filter (case-insensitive)
            const stoneTypeFilter = document.getElementById('inventory-stone-type-filter')?.value;
            if (stoneTypeFilter) {
                items = items.filter(item => (item.stone_type || '').toLowerCase() === (stoneTypeFilter || '').toLowerCase());
            }

            // Apply supplier filter
            const supplierFilter = document.getElementById('inventory-supplier-filter')?.value;
            if (supplierFilter) {
                items = items.filter(item => {
                    // Comparar supplier_id
                    const itemSupplierId = item.supplier_id;
                    return String(itemSupplierId) === String(supplierFilter);
                });
            }

            // Apply certificate filter
            const certificateFilter = document.getElementById('inventory-certificate-filter')?.value;
            if (certificateFilter === 'yes') {
                items = items.filter(item => item.certificate_type && item.certificate_number);
            } else if (certificateFilter === 'no') {
                items = items.filter(item => !item.certificate_type || !item.certificate_number);
            }

            // Apply category filter ANTES de stock (para que pills respeten categoría seleccionada)
            const selectedCategory = document.querySelector('.inventory-category-bar .inventory-category-chip.active')?.dataset.category;
            if (selectedCategory && selectedCategory !== 'all') {
                items = items.filter(item => (item.category || '').toLowerCase() === (selectedCategory || '').toLowerCase());
            }

            // Guardar items antes del filtro de stock (para pills: totales por contexto actual)
            const itemsBeforeStockFilter = [...items];

            // Apply stock alert filter
            const stockAlertFilter = document.getElementById('inventory-stock-alert-filter')?.value;
            if (stockAlertFilter === 'low') {
                items = items.filter(item => this.getStockStatus(item) === 'low');
            } else if (stockAlertFilter === 'out') {
                items = items.filter(item => this.getStockStatus(item) === 'out');
            } else if (stockAlertFilter === 'over') {
                items = items.filter(item => this.getStockStatus(item) === 'over');
            } else if (stockAlertFilter === 'ok') {
                items = items.filter(item => this.getStockStatus(item) === 'ok');
            }

            // ========== FILTROS AVANZADOS ==========
            const materialFilter = document.getElementById('inventory-material-filter')?.value;
            if (materialFilter) {
                const mf = (materialFilter || '').toLowerCase();
                items = items.filter(item => (item.material || '').toLowerCase() === mf || (item.metal || '').toLowerCase().includes(mf));
            }

            const purityFilter = document.getElementById('inventory-purity-filter')?.value;
            if (purityFilter) {
                const pf = (purityFilter || '').toLowerCase();
                items = items.filter(item => (item.purity || '').toLowerCase() === pf || (item.metal || '').toLowerCase().includes(pf));
            }

            const platingFilter = document.getElementById('inventory-plating-filter')?.value;
            if (platingFilter) {
                items = items.filter(item => (item.plating || '').toLowerCase() === (platingFilter || '').toLowerCase());
            }

            const styleFilter = document.getElementById('inventory-style-filter')?.value;
            if (styleFilter) {
                items = items.filter(item => (item.style || '').toLowerCase() === (styleFilter || '').toLowerCase());
            }

            const finishFilter = document.getElementById('inventory-finish-filter')?.value;
            if (finishFilter) {
                items = items.filter(item => item.finish_type === finishFilter);
            }

            const themeFilter = document.getElementById('inventory-theme-filter')?.value;
            if (themeFilter) {
                items = items.filter(item => item.theme === themeFilter);
            }

            const ringSizeFilter = document.getElementById('inventory-ring-size-filter')?.value;
            if (ringSizeFilter) {
                items = items.filter(item => {
                    if (!item.measurements) return false;
                    const measurements = typeof item.measurements === 'string' ? JSON.parse(item.measurements) : item.measurements;
                    return measurements.ring_size === parseFloat(ringSizeFilter);
                });
            }

            const chainLengthFilter = document.getElementById('inventory-chain-length-filter')?.value;
            if (chainLengthFilter) {
                items = items.filter(item => {
                    if (!item.measurements) return false;
                    const measurements = typeof item.measurements === 'string' ? JSON.parse(item.measurements) : item.measurements;
                    return measurements.chain_length === parseFloat(chainLengthFilter);
                });
            }

            const conditionFilter = document.getElementById('inventory-condition-filter')?.value;
            if (conditionFilter) {
                items = items.filter(item => item.condition === conditionFilter);
            }

            const locationFilter = document.getElementById('inventory-location-filter')?.value;
            if (locationFilter) {
                items = items.filter(item => item.location_detail === locationFilter || item.location === locationFilter);
            }

            const collectionFilter = document.getElementById('inventory-collection-filter')?.value;
            if (collectionFilter) {
                items = items.filter(item => item.collection === collectionFilter);
            }

            // ========== ORDENAMIENTO ==========
            const sortBy = document.getElementById('inventory-sort-by')?.value || 'newest';
            items = this.sortInventoryItems(items, sortBy);

            // ========== AGRUPACIÓN POR COLECCIÓN (OPCIONAL) ==========
            // IMPORTANTE: En modo lista, NO agrupar por colección para mostrar todas las piezas juntas
            const groupByCollection = document.getElementById('inventory-group-by-collection')?.checked || false;
            
            if (groupByCollection && items.length > 0 && this.currentView !== 'list') {
                // Solo agrupar si NO estamos en modo lista
                const grouped = {};
                const noCollection = [];
                
                items.forEach(item => {
                    const collection = item.collection || 'Sin Colección';
                    if (collection === 'Sin Colección') {
                        noCollection.push(item);
                    } else {
                        if (!grouped[collection]) {
                            grouped[collection] = [];
                        }
                        grouped[collection].push(item);
                    }
                });
                
                this.groupedItems = { grouped, noCollection };
            } else {
                // En modo lista, siempre mostrar sin agrupación
                this.groupedItems = null;
            }

            // Decidir qué vista mostrar según currentView
            console.log(`📊 Mostrando inventario en vista: ${this.currentView} (${items.length} items)`);
            // Guardar items antes de stock para stats (pills con totales globales)
            this._itemsBeforeStockFilterForStats = itemsBeforeStockFilter;
            // Usar displayInventory que verifica si hay agrupación
            await this.displayInventory(items);
            
            // Actualizar filtro de ubicación con ubicaciones disponibles
            await this.updateLocationFilter();
            
            // Emitir evento de inventario cargado
            window.dispatchEvent(new CustomEvent('inventory-loaded'));
        } catch (e) {
            console.error('Error loading inventory:', e);
            Utils.showNotification('Error al cargar inventario', 'error');
        } finally {
            this._loadInventoryInProgress = false;
        }
    },

    // Determinar el estado del stock de un item
    getStockStatus(item) {
        const actual = item.stock_actual ?? 1;
        const min = item.stock_min ?? 1;
        const max = item.stock_max ?? 10;
        
        if (actual <= 0) return 'out';
        if (actual < min) return 'low';
        if (actual > max) return 'over';
        return 'ok';
    },
    
    // Obtener color del badge según estado de stock
    getStockBadgeClass(status) {
        switch (status) {
            case 'out': return 'stock-badge-out';
            case 'low': return 'stock-badge-low';
            case 'over': return 'stock-badge-over';
            default: return 'stock-badge-ok';
        }
    },
    
    // Obtener texto del estado de stock
    getStockStatusText(status) {
        switch (status) {
            case 'out': return 'Agotado';
            case 'low': return 'Stock Bajo';
            case 'over': return 'Exceso';
            default: return 'Normal';
        }
    },

    // Ordenar items de inventario
    sortInventoryItems(items, sortBy) {
        const sorted = [...items];
        
        switch (sortBy) {
            case 'name':
                sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            case 'name_desc':
                sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
                break;
            case 'newest':
                sorted.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0);
                    const dateB = new Date(b.created_at || 0);
                    return dateB - dateA;
                });
                break;
            case 'oldest':
                sorted.sort((a, b) => {
                    const dateA = new Date(a.created_at || 0);
                    const dateB = new Date(b.created_at || 0);
                    return dateA - dateB;
                });
                break;
            case 'price_asc':
                sorted.sort((a, b) => (a.sale_price || a.price || 0) - (b.sale_price || b.price || 0));
                break;
            case 'price_desc':
                sorted.sort((a, b) => (b.sale_price || b.price || 0) - (a.sale_price || a.price || 0));
                break;
            case 'cost_asc':
                sorted.sort((a, b) => (a.cost || 0) - (b.cost || 0));
                break;
            case 'cost_desc':
                sorted.sort((a, b) => (b.cost || 0) - (a.cost || 0));
                break;
            case 'stock_asc':
                sorted.sort((a, b) => (a.stock_actual || 0) - (b.stock_actual || 0));
                break;
            case 'stock_desc':
                sorted.sort((a, b) => (b.stock_actual || 0) - (a.stock_actual || 0));
                break;
            case 'material_category':
                sorted.sort((a, b) => {
                    const materialA = (a.material || a.metal || '').localeCompare(b.material || b.metal || '');
                    if (materialA !== 0) return materialA;
                    return (a.category || '').localeCompare(b.category || '');
                });
                break;
            case 'status_location':
                sorted.sort((a, b) => {
                    const statusA = (a.status || '').localeCompare(b.status || '');
                    if (statusA !== 0) return statusA;
                    return (a.location_detail || a.location || '').localeCompare(b.location_detail || b.location || '');
                });
                break;
            default:
                sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
        
        return sorted;
    },

    // Poblar dropdown de colecciones dinámicamente
    async populateCollectionFilter() {
        const collectionFilter = document.getElementById('inventory-collection-filter');
        if (!collectionFilter) return;

        try {
            const allItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            const collections = [...new Set(allItems
                .filter(item => item.collection)
                .map(item => item.collection)
                .filter(Boolean)
            )].sort();

            const currentValue = collectionFilter.value;
            collectionFilter.innerHTML = '<option value="">Todas las colecciones</option>';
            
            collections.forEach(collection => {
                const option = document.createElement('option');
                option.value = collection;
                option.textContent = collection;
                collectionFilter.appendChild(option);
            });

            if (currentValue && collections.includes(currentValue)) {
                collectionFilter.value = currentValue;
            }
        } catch (error) {
            console.error('Error poblando filtro de colecciones:', error);
        }
    },

    // Poblar dropdown de metales dinámicamente
    async populateMetalFilter() {
        const metalFilter = document.getElementById('inventory-metal-filter');
        if (!metalFilter) return;

        try {
            const allItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            const metals = [...new Set(allItems
                .map(item => item.metal)
                .filter(Boolean)
            )].sort((a, b) => String(a).localeCompare(String(b)));

            const currentValue = metalFilter.value;
            metalFilter.innerHTML = '<option value="">Todos los metales</option>';
            metals.forEach(metal => {
                const option = document.createElement('option');
                option.value = metal;
                option.textContent = metal;
                metalFilter.appendChild(option);
            });

            if (currentValue && metals.includes(currentValue)) {
                metalFilter.value = currentValue;
            }
        } catch (error) {
            console.error('Error poblando filtro de metales:', error);
        }
    },

    // Poblar dropdown de tipos de piedra dinámicamente
    async populateStoneTypeFilter() {
        const stoneFilter = document.getElementById('inventory-stone-type-filter');
        if (!stoneFilter) return;

        try {
            const allItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            const stoneTypes = [...new Set(
                allItems.flatMap(item => [item.stone_type, item.stone].filter(Boolean))
            )].sort((a, b) => String(a).localeCompare(String(b)));

            const currentValue = stoneFilter.value;
            stoneFilter.innerHTML = '<option value="">Todos los tipos</option>';
            stoneTypes.forEach(st => {
                const option = document.createElement('option');
                option.value = st;
                option.textContent = st;
                stoneFilter.appendChild(option);
            });

            if (currentValue && stoneTypes.includes(currentValue)) {
                stoneFilter.value = currentValue;
            }
        } catch (error) {
            console.error('Error poblando filtro de tipos de piedra:', error);
        }
    },

    // Actualizar estado visual de los botones de vista
    updateViewButtons() {
        const gridBtn = document.getElementById('inventory-view-grid-btn');
        const listBtn = document.getElementById('inventory-view-list-btn');
        
        console.log('🎨 [updateViewButtons] Vista actual:', this.currentView, 'Grid:', !!gridBtn, 'List:', !!listBtn);
        
        if (gridBtn) {
            if (this.currentView === 'grid') {
                gridBtn.classList.add('active');
                gridBtn.style.background = 'var(--color-primary)';
                gridBtn.style.color = 'white';
                console.log('✅ Botón GRID activado');
            } else {
                gridBtn.classList.remove('active');
                gridBtn.style.background = 'transparent';
                gridBtn.style.color = 'var(--color-text)';
            }
        } else {
            console.warn('⚠️ Botón GRID no encontrado en updateViewButtons');
        }
        
        if (listBtn) {
            if (this.currentView === 'list') {
                listBtn.classList.add('active');
                listBtn.style.background = 'var(--color-primary)';
                listBtn.style.color = 'white';
                console.log('✅ Botón LISTA activado');
            } else {
                listBtn.classList.remove('active');
                listBtn.style.background = 'transparent';
                listBtn.style.color = 'var(--color-text)';
            }
        } else {
            console.warn('⚠️ Botón LISTA no encontrado en updateViewButtons');
        }
    },

    async displayInventory(items) {
        // Si hay agrupación por colección, mostrar agrupado
        if (this.groupedItems) {
            await this.displayInventoryGrouped(this.groupedItems);
            return;
        }

        // Usar la vista seleccionada
        if (this.currentView === 'list') {
            await this.displayInventoryList(items);
        } else {
            await this.displayInventoryGrid(items);
        }
    },

    async displayInventoryGrouped({ grouped, noCollection }) {
        const container = document.getElementById('inventory-list');
        if (!container) return;

        const allItems = [...Object.values(grouped).flat(), ...noCollection];
        await this.displayInventoryStats(allItems);
        this.updateSelectionUI();

        if (allItems.length === 0) {
            container.innerHTML = this.getEmptyInventoryMessage();
            return;
        }

        console.log(`📋 [displayInventoryGrouped] Vista actual: ${this.currentView}, Total items: ${allItems.length}`);

        // Si es vista de lista, mostrar TODAS las piezas en una sola tabla
        if (this.currentView === 'list') {
            console.log(`📋 [displayInventoryGrouped] Mostrando ${allItems.length} items en modo LISTA (tabla única)`);
            const rowsHTML = await this.getInventoryListHTML(allItems);
            const html = `
                <div style="overflow-x: auto; background: var(--color-bg-card); border-radius: var(--radius-md); overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border);">
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); width: 40px;">
                                    <input type="checkbox" class="inventory-select-all-collection" onchange="window.Inventory.toggleSelectAll(this.checked)">
                                </th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); width: 80px;">Foto</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">SKU</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Nombre</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Categoría</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Material</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Piedra</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Peso (g)</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Costo</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Precio Venta</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Stock</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Estado</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary);">Ubicación</th>
                                <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); width: 100px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = html;
            return;
        }

        // Para vista de grid, mantener el agrupamiento por colecciones
        let html = '<div style="display: flex; flex-direction: column; gap: var(--spacing-lg);">';

        const sortedCollections = Object.keys(grouped).sort();
        for (const collection of sortedCollections) {
            const collectionItems = grouped[collection];
            const collectionHTML = await this.getInventoryGridHTML(collectionItems);
            
            html += `
                <div style="background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="padding: var(--spacing-md); background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); color: white;">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-tag"></i> ${collection}
                            <span style="margin-left: auto; font-size: 14px; opacity: 0.9;">${collectionItems.length} pieza${collectionItems.length !== 1 ? 's' : ''}</span>
                        </h3>
                    </div>
                    <div style="padding: var(--spacing-md);">
                        ${collectionHTML}
                    </div>
                </div>
            `;
        }

        if (noCollection.length > 0) {
            const noCollectionHTML = await this.getInventoryGridHTML(noCollection);
            
            html += `
                <div style="background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                    <div style="padding: var(--spacing-md); background: var(--color-bg-secondary);">
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-box"></i> Sin Colección
                            <span style="margin-left: auto; font-size: 14px; color: var(--color-text-secondary);">${noCollection.length} pieza${noCollection.length !== 1 ? 's' : ''}</span>
                        </h3>
                    </div>
                    <div style="padding: var(--spacing-md);">
                        ${noCollectionHTML}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    },

    async getInventoryGridHTML(items) {
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            const photos = await DB.query('inventory_photos', 'item_id', item.id);
            return { ...item, photo: photos[0]?.thumbnail_blob || null };
        }));

        return itemsWithPhotos.map(item => {
            const hasCertificate = item.certificate_type && item.certificate_number;
            const stoneInfo = item.stone_type ? `${item.stone_type}${item.carats ? ` ${item.carats}ct` : ''}` : (item.stone || 'N/A');
            const isSelected = this.selectedItems.has(item.id);
            const stockStatus = this.getStockStatus(item);
            const stockBadgeClass = this.getStockBadgeClass(stockStatus);
            const stockStatusText = this.getStockStatusText(stockStatus);
            const stockActual = item.stock_actual ?? 1;
            const stockMin = item.stock_min ?? 1;
            const stockMax = item.stock_max ?? 10;
            
            return `
            <div class="inventory-card ${isSelected ? 'inventory-card-selected' : ''}" data-item-id="${item.id}" style="display: inline-block; width: calc(25% - 12px); margin: 6px; vertical-align: top;">
                <div class="inventory-card-select">
                    <input type="checkbox" class="inventory-checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="window.Inventory.toggleItemSelection('${item.id}', this.checked)">
                </div>
                ${item.photo ? `<img src="${item.photo}" alt="${item.name}" class="inventory-card-photo">` : 
                  '<div class="inventory-card-photo" style="display: flex; align-items: center; justify-content: center; color: #999; background: var(--color-bg-secondary);"><i class="fas fa-gem" style="font-size: 48px; opacity: 0.3;"></i></div>'}
                <div class="inventory-card-info">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <h4 style="margin: 0; flex: 1; font-size: 14px;">${item.name || item.sku}</h4>
                        <div style="display: flex; gap: 4px;">
                            ${hasCertificate ? '<span class="cert-badge" title="Certificado"><i class="fas fa-certificate"></i></span>' : ''}
                            <span class="stock-badge ${stockBadgeClass}" title="Stock: ${stockActual} (Mín: ${stockMin}, Máx: ${stockMax})">${stockStatusText}</span>
                        </div>
                    </div>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px;"><strong>SKU:</strong> ${item.sku}</p>
                    <p style="font-size: 11px; margin-bottom: 4px;"><strong>Metal:</strong> ${item.metal || 'N/A'}</p>
                    <p style="font-size: 11px; margin-bottom: 4px;"><strong>Piedra:</strong> ${stoneInfo}</p>
                    <p style="font-size: 11px; margin-bottom: 4px;"><strong>Peso:</strong> ${(parseFloat(item.weight_g || item.weight || 0) || 0).toFixed(2)}g</p>
                    <div class="stock-info-bar" style="margin: 8px 0; padding: 8px; background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 10px; color: var(--color-text-secondary);">Stock</span>
                            <span style="font-size: 10px; font-weight: 600;">${stockActual} / ${stockMax}</span>
                        </div>
                        <div class="stock-progress-bar" style="height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden;">
                            <div class="stock-progress ${stockBadgeClass}" style="height: 100%; width: ${Math.min((stockActual / stockMax) * 100, 100)}%; border-radius: 3px; transition: width 0.3s;"></div>
                        </div>
                    </div>
                    <p style="font-size: 12px; font-weight: 600; color: var(--color-primary); margin: 8px 0;"><strong>Costo:</strong> ${Utils.formatCurrency(item.cost || 0)}</p>
                    <p style="margin-top: 8px;"><strong>Estado:</strong> <span class="status-badge status-${item.status}">${item.status}</span></p>
                    <div class="inv-card-actions">
                        <button class="btn-secondary inv-btn-main" onclick="window.Inventory.showItemDetails('${item.id}')">Ver <span class="inv-btn-detail">Detalles</span></button>
                        <div class="inv-btn-icons">
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.update_stock') ? `
                                <button class="btn-secondary" onclick="window.Inventory.showStockModal('${item.id}')" title="Ajustar Stock"><i class="fas fa-cubes"></i></button>
                            ` : ''}
                            <button class="btn-secondary" onclick="window.Inventory.printJewelryLabel('${item.id}')" title="Imprimir Etiqueta Joya"><i class="fas fa-gem"></i></button>
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.delete') ? `
                                <button class="btn-danger-outline" onclick="window.Inventory.confirmDeleteItem('${item.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },

    async getInventoryListHTML(items) {
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            const photos = await DB.query('inventory_photos', 'item_id', item.id);
            return { ...item, photo: photos[0]?.thumbnail_blob || null };
        }));

        return itemsWithPhotos.map(item => {
                            const isSelected = this.selectedItems.has(item.id);
                            const stockStatus = this.getStockStatus(item);
                            const stockBadgeClass = this.getStockBadgeClass(stockStatus);
                            const stockStatusText = this.getStockStatusText(stockStatus);
                            const stockActual = item.stock_actual ?? 1;
                            const stockMax = item.stock_max ?? 10;
                            
                            return `
                            <tr class="inventory-list-row ${isSelected ? 'inventory-list-row-selected' : ''}" data-item-id="${item.id}" style="border-bottom: 1px solid var(--color-border-light); transition: background 0.2s;">
                                <td style="padding: 12px;">
                                    <input type="checkbox" class="inventory-checkbox" 
                                           ${isSelected ? 'checked' : ''} 
                                           onchange="window.Inventory.toggleItemSelection('${item.id}', this.checked)"
                                           style="cursor: pointer;">
                                </td>
                                <td style="padding: 12px;">
                                    ${item.photo ? 
                                        `<img src="${item.photo}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : 
                                        '<div style="width: 50px; height: 50px; background: var(--color-bg-secondary); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999;"><i class="fas fa-gem" style="font-size: 20px; opacity: 0.3;"></i></div>'
                                    }
                                </td>
                                <td style="padding: 12px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.sku || 'N/A'}">${item.sku || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name || 'Sin nombre'}">${item.name || 'Sin nombre'}</td>
                                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.category || 'N/A'}">${item.category || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.metal || 'N/A'}">${item.metal || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.stone_type || item.stone || 'N/A'}">${item.stone_type || item.stone || 'N/A'}</td>
                                <td style="padding: 12px; text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                        <span style="font-size: 12px; font-weight: 600;">${stockActual} / ${stockMax}</span>
                                        <span class="stock-badge ${stockBadgeClass}" style="font-size: 10px; padding: 2px 6px; border-radius: 3px;">${stockStatusText}</span>
                                    </div>
                                </td>
                                <td style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: var(--color-primary);">${Utils.formatCurrency(item.cost || 0)}</td>
                                <td style="padding: 12px;">
                                    <span class="status-badge status-${item.status}" style="font-size: 11px; padding: 4px 8px; border-radius: 4px;">${item.status || 'disponible'}</span>
                                </td>
                                <td style="padding: 12px; text-align: center;">
                                    <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: nowrap;">
                                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showItemDetails('${item.id}')" title="Ver Detalles" style="padding: 4px 8px; font-size: 11px; min-width: auto;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showAddForm('${item.id}')" title="Editar" style="padding: 4px 8px; font-size: 11px; min-width: auto;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.update_stock') ? `
                                            <button class="btn-secondary btn-sm" onclick="window.Inventory.showStockModal('${item.id}')" title="Ajustar Stock" style="padding: 4px 8px; font-size: 11px; min-width: auto;">
                                                <i class="fas fa-cubes"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('');
    },

    // Función principal que decide qué vista mostrar
    displayInventory(items) {
        if (this.currentView === 'list') {
            this.displayInventoryList(items);
        } else {
            this.displayInventoryGrid(items);
        }
    },

    // Helper: Obtener HTML de las filas de tabla (sin thead ni contenedor)
    async getInventoryListHTML(items) {
        if (!items || items.length === 0) {
            return '<tr><td colspan="14" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No hay items para mostrar</td></tr>';
        }

        // Obtener fotos de los items
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            let photo = null;
            if (item.photos && item.photos.length > 0) {
                photo = item.photos[0];
            } else {
                try {
                    const photos = await DB.getAll('inventory_photos', null, null, {
                        index: 'item_id',
                        value: item.id
                    });
                    if (photos && photos.length > 0) {
                        photo = photos[0].photo_url || (photos[0].photo_blob ? URL.createObjectURL(photos[0].photo_blob) : null);
                    }
                } catch (e) {
                    console.warn('Error obteniendo foto:', e);
                }
            }
            return { ...item, photo };
        }));

        // Construir solo las filas de la tabla
        return itemsWithPhotos.map(item => {
            const isSelected = this.selectedItems.has(item.id);
            const stockActual = item.stock_actual ?? 0;
            const stockMin = item.stock_min ?? 1;
            const stockMax = item.stock_max ?? 10;
            const stockStatus = this.getStockStatus(item);
            const stockBadgeClass = this.getStockBadgeClass(stockStatus);
            const stockStatusText = this.getStockStatusText(stockStatus);
            const hasCertificate = item.certificate_type && item.certificate_number;
            
            const stoneInfo = item.stone_type ? `${item.stone_type}${item.total_carats ? ` (${item.total_carats}ct)` : ''}` : 'N/A';
            
            const measurements = item.measurements ? (typeof item.measurements === 'string' ? JSON.parse(item.measurements) : item.measurements) : {};
            const measuresText = [
                measurements.ring_size ? `Talla: ${measurements.ring_size}` : null,
                measurements.chain_length ? `Cadena: ${measurements.chain_length}cm` : null,
                measurements.bracelet_length ? `Pulsera: ${measurements.bracelet_length}cm` : null,
                measurements.width ? `Ancho: ${measurements.width}mm` : null,
                measurements.thickness ? `Grosor: ${measurements.thickness}mm` : null
            ].filter(Boolean).join(', ') || 'N/A';
            
            return `
            <tr style="border-bottom: 1px solid var(--color-border-light); ${isSelected ? 'background: var(--color-primary-light);' : ''}" data-item-id="${item.id}">
                <td style="padding: 12px;">
                    <input type="checkbox" class="inventory-checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="window.Inventory.toggleItemSelection('${item.id}', this.checked)">
                </td>
                <td style="padding: 12px;">
                    ${item.photo ? 
                        `<img src="${item.photo}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: var(--radius-sm);">` : 
                        '<div style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; color: #999; background: var(--color-bg-secondary); border-radius: var(--radius-sm);"><i class="fas fa-gem"></i></div>'}
                </td>
                <td style="padding: 12px; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.sku || 'N/A'}">${item.sku || 'N/A'}</td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name || 'Sin nombre'}">
                    <div style="font-weight: 600; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name || 'Sin nombre'}</div>
                    ${item.description ? `<div style="font-size: 11px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.description}">${item.description.substring(0, 30)}${item.description.length > 30 ? '...' : ''}</div>` : ''}
                </td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.category || 'N/A'}">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.category || 'N/A'}</div>
                    ${item.subcategory ? `<div style="font-size: 11px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.subcategory}">${item.subcategory}</div>` : ''}
                </td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.metal || item.material || 'N/A'}">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.metal || item.material || 'N/A'}</div>
                    ${item.purity ? `<div style="font-size: 11px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.purity}">${item.purity}</div>` : ''}
                </td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${stoneInfo}">${stoneInfo}</td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.weight ? `${item.weight}g` : 'N/A'}">${item.weight ? `${item.weight}g` : 'N/A'}</td>
                <td style="padding: 12px; font-size: 12px; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.cost ? `$${parseFloat(item.cost).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A'}</td>
                <td style="padding: 12px; font-size: 12px; font-weight: 600; color: var(--color-primary); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${item.sale_price ? `$${parseFloat(item.sale_price).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : (item.price ? `$${parseFloat(item.price).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A')}
                </td>
                <td style="padding: 12px; font-size: 12px; text-align: center;">
                    <span class="stock-badge ${stockBadgeClass}" title="Stock: ${stockActual} (Mín: ${stockMin}, Máx: ${stockMax})">${stockActual}</span>
                    ${hasCertificate ? '<span class="cert-badge" title="Certificado"><i class="fas fa-certificate"></i></span>' : ''}
                </td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span style="padding: 4px 8px; background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px;">
                        ${item.status === 'disponible' ? 'Disponible' : 
                          item.status === 'vendida' ? 'Vendida' : 
                          item.status === 'apartada' ? 'Apartada' : 
                          item.status === 'reparacion' ? 'Reparación' : 
                          item.status === 'exhibicion' ? 'Exhibición' : 
                          item.status || 'N/A'}
                    </span>
                </td>
                <td style="padding: 12px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.location_detail || item.location || 'N/A'}">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.location_detail || item.location || 'N/A'}</div>
                </td>
                <td style="padding: 12px; text-align: center;">
                    <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: nowrap;">
                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showAddForm('${item.id}')" title="Editar" style="padding: 4px 8px; font-size: 10px; min-width: auto;"><i class="fas fa-edit"></i></button>
                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showItemDetails('${item.id}')" title="Ver Detalles" style="padding: 4px 8px; font-size: 10px; min-width: auto;"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    },

    // Helper: Obtener HTML de las tarjetas (sin contenedor)
    async getInventoryGridHTML(items) {
        if (!items || items.length === 0) {
            return '<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No hay items para mostrar</p>';
        }

        // Load photos for items
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            const photos = await DB.query('inventory_photos', 'item_id', item.id);
            return { ...item, photo: photos[0]?.thumbnail_blob || null };
        }));

        return itemsWithPhotos.map(item => {
            const hasCertificate = item.certificate_type && item.certificate_number;
            const stoneInfo = item.stone_type ? `${item.stone_type}${item.carats ? ` ${item.carats}ct` : ''}${item.color ? ` ${item.color}` : ''}${item.clarity ? ` ${item.clarity}` : ''}` : (item.stone || 'N/A');
            const isSelected = this.selectedItems.has(item.id);
            const stockStatus = this.getStockStatus(item);
            const stockBadgeClass = this.getStockBadgeClass(stockStatus);
            const stockStatusText = this.getStockStatusText(stockStatus);
            const stockActual = item.stock_actual ?? 1;
            const stockMin = item.stock_min ?? 1;
            const stockMax = item.stock_max ?? 10;
            
            return `
            <div class="inventory-card ${isSelected ? 'inventory-card-selected' : ''}" data-item-id="${item.id}">
                <div class="inventory-card-select">
                    <input type="checkbox" class="inventory-checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="window.Inventory.toggleItemSelection('${item.id}', this.checked)">
                </div>
                ${item.photo ? `<img src="${item.photo}" alt="${item.name}" class="inventory-card-photo">` : 
                  '<div class="inventory-card-photo" style="display: flex; align-items: center; justify-content: center; color: #999; background: var(--color-bg-secondary);"><i class="fas fa-gem" style="font-size: 48px; opacity: 0.3;"></i></div>'}
                <div class="inventory-card-info">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                        <h4 style="margin: 0; flex: 1;">${item.name || item.sku}</h4>
                        <div style="display: flex; gap: 4px;">
                            ${hasCertificate ? '<span class="cert-badge" title="Certificado"><i class="fas fa-certificate"></i></span>' : ''}
                            <span class="stock-badge ${stockBadgeClass}" title="Stock: ${stockActual} (Mín: ${stockMin}, Máx: ${stockMax})">${stockStatusText}</span>
                        </div>
                    </div>
                    <p style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 4px;"><strong>SKU:</strong> ${item.sku}</p>
                    ${item.supplier_name || item.supplier_code ? `
                    <p style="font-size: 11px; margin-bottom: 4px; color: var(--color-primary);">
                        <i class="fas fa-truck" style="margin-right: 4px;"></i>
                        <strong>Proveedor:</strong> ${item.supplier_code || ''} ${item.supplier_code && item.supplier_name ? '- ' : ''}${item.supplier_name || ''}
                    </p>
                    ` : ''}
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Metal:</strong> ${item.metal || 'N/A'}</p>
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Piedra:</strong> ${stoneInfo}</p>
                    ${item.total_carats ? `<p style="font-size: 12px; margin-bottom: 4px;"><strong>Quilates Totales:</strong> ${item.total_carats}ct</p>` : ''}
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Peso:</strong> ${(parseFloat(item.weight_g || item.weight || 0) || 0).toFixed(2)}g</p>
                    
                    <!-- Stock Info -->
                    <div class="stock-info-bar" style="margin: 8px 0; padding: 8px; background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="font-size: 11px; color: var(--color-text-secondary);">Stock</span>
                            <span style="font-size: 11px; font-weight: 600;">${stockActual} / ${stockMax}</span>
                        </div>
                        <div class="stock-progress-bar" style="height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden;">
                            <div class="stock-progress ${stockBadgeClass}" style="height: 100%; width: ${Math.min((stockActual / stockMax) * 100, 100)}%; border-radius: 3px; transition: width 0.3s;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                            <span style="font-size: 9px; color: var(--color-text-tertiary);">Mín: ${stockMin}</span>
                            <span style="font-size: 9px; color: var(--color-text-tertiary);">Máx: ${stockMax}</span>
                        </div>
                    </div>
                    
                    <p style="font-size: 13px; font-weight: 600; color: var(--color-primary); margin: 8px 0;"><strong>Costo:</strong> ${Utils.formatCurrency(item.cost || 0)}</p>
                    ${item.collection ? `<p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px;"><i class="fas fa-tag"></i> ${item.collection}</p>` : ''}
                    <p style="margin-top: 8px;"><strong>Estado:</strong> <span class="status-badge status-${item.status}">${item.status}</span></p>
                    <div class="inv-card-actions">
                        <button class="btn-secondary inv-btn-main" onclick="window.Inventory.showItemDetails('${item.id}')">Ver <span class="inv-btn-detail">Detalles</span></button>
                        <div class="inv-btn-icons">
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.update_stock') ? `
                                <button class="btn-secondary" onclick="window.Inventory.showStockModal('${item.id}')" title="Ajustar Stock"><i class="fas fa-cubes"></i></button>
                            ` : ''}
                            <button class="btn-secondary" onclick="window.Inventory.printJewelryLabel('${item.id}')" title="Imprimir Etiqueta Joya"><i class="fas fa-gem"></i></button>
                            ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.delete') ? `
                                <button class="btn-danger-outline" onclick="window.Inventory.confirmDeleteItem('${item.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    },

    /**
     * Muestra la pieza recién guardada en la UI de inmediato (solo vista grid).
     * Usado tras saveItem para feedback instantáneo; loadInventory se ejecuta en segundo plano.
     */
    async prependNewItemToUI(item) {
        if (!item || !item.id) return;
        const container = document.getElementById('inventory-list');
        if (!container) return;
        if (this.currentView !== 'grid') return;

        const oneCardHtml = await this.getInventoryGridHTML([item]);
        if (!oneCardHtml || oneCardHtml.includes('No hay items')) return;

        const hasCards = container.querySelector('.inventory-card');
        if (!hasCards) {
            if (!container.classList.contains('inventory-grid')) {
                container.classList.add('inventory-grid');
                container.classList.remove('inventory-list-view');
            }
            container.innerHTML = oneCardHtml;
        } else {
            container.insertAdjacentHTML('afterbegin', oneCardHtml);
        }
    },

    // Vista de lista (tabla)
    async displayInventoryList(items) {
        const container = document.getElementById('inventory-list');
        if (!container) {
            console.warn('Container inventory-list no encontrado');
            return;
        }

        // Mostrar estadísticas
        await this.displayInventoryStats(items);

        if (items.length === 0) {
            container.innerHTML = this.getEmptyInventoryMessage();
            return;
        }

        // Usar función helper para obtener HTML de las filas
        const rowsHTML = await this.getInventoryListHTML(items);

        // Construir tabla completa con thead - Ajustada al mismo tamaño que el recuadro de filtros
        const tableHTML = `
            <div style="width: 100%; max-width: 100%; padding: 16px; background: var(--color-bg-secondary); border-radius: var(--radius-lg); overflow-x: auto; overflow-y: visible; box-sizing: border-box;">
                <table style="width: 100%; min-width: calc(100vw - 400px); border-collapse: collapse; background: var(--color-bg-card); border-radius: var(--radius-md); overflow: hidden; table-layout: auto;">
                    <thead>
                        <tr style="background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border);">
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 40px; width: auto;">
                                <input type="checkbox" id="inventory-select-all-list" onchange="window.Inventory.toggleSelectAll(this.checked)">
                            </th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 80px; width: auto;">Foto</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">SKU</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 200px; width: auto;">Nombre</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">Categoría</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">Material</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">Piedra</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 80px; width: auto;">Peso (g)</th>
                            <th style="padding: 12px; text-align: right; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 100px; width: auto;">Costo</th>
                            <th style="padding: 12px; text-align: right; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">Precio Venta</th>
                            <th style="padding: 12px; text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 100px; width: auto;">Stock</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 120px; width: auto;">Estado</th>
                            <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 100px; width: auto;">Ubicación</th>
                            <th style="padding: 12px; text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-secondary); min-width: 150px; width: auto;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
        
        // Remover clase inventory-grid cuando está en modo lista para evitar limitaciones de grid
        if (container.classList.contains('inventory-grid')) {
            container.classList.remove('inventory-grid');
            container.classList.add('inventory-list-view');
        }

        // Actualizar estado de selección
        this.updateViewButtons();
    },

    async displayInventoryGrid(items, options = {}) {
        const container = document.getElementById('inventory-list');
        if (!container) return;
        
        // Resolver items primero: en loadMore usar _lastGridItems; evitar null
        if (options.isLoadMore) {
            items = (this._lastGridItems && Array.isArray(this._lastGridItems)) ? this._lastGridItems : [];
        } else {
            items = Array.isArray(items) ? items : [];
            this._gridDisplayLimit = this.INVENTORY_GRID_BATCH_SIZE;
            this._lastGridItems = items;
        }
        
        // Mostrar estadísticas con TODOS los items (no solo los visibles)
        await this.displayInventoryStats(items);
        
        // Actualizar contador de seleccionados
        this.updateSelectionUI();

        if (items.length === 0) {
            container.innerHTML = this.getEmptyInventoryMessage();
            return;
        }

        const limit = this._gridDisplayLimit || this.INVENTORY_GRID_BATCH_SIZE;
        const toShow = items.slice(0, limit);
        const hasMore = items.length > limit;
        const remaining = items.length - limit;

        // Asegurar que tenga la clase inventory-grid para modo tarjetas
        if (!container.classList.contains('inventory-grid')) {
            container.classList.add('inventory-grid');
            container.classList.remove('inventory-list-view');
        }

        // Renderizar solo los items visibles (reducir peso en DOM)
        const cardsHTML = await this.getInventoryGridHTML(toShow);
        const loadMoreBtn = hasMore ? `
            <div class="inventory-load-more-wrap" style="grid-column: 1 / -1; display: flex; justify-content: center; padding: var(--spacing-md);">
                <button type="button" class="btn-secondary" onclick="window.Inventory.loadMoreInventoryGrid()">
                    <i class="fas fa-chevron-down"></i> Cargar más (${remaining} restantes)
                </button>
            </div>
        ` : '';
        container.innerHTML = cardsHTML + loadMoreBtn;
    },

    /**
     * Incrementa la cantidad de tarjetas mostradas y vuelve a renderizar (carga progresiva).
     */
    async loadMoreInventoryGrid() {
        if (!this._lastGridItems || this._lastGridItems.length === 0) return;
        this._gridDisplayLimit = (this._gridDisplayLimit || this.INVENTORY_GRID_BATCH_SIZE) + this.INVENTORY_GRID_BATCH_SIZE;
        await this.displayInventoryGrid(null, { isLoadMore: true });
    },

    async displayInventoryList(items) {
        const container = document.getElementById('inventory-list');
        if (!container) return;
        
        // Mostrar estadísticas si hay items
        await this.displayInventoryStats(items);
        
        // Actualizar contador de seleccionados
        this.updateSelectionUI();

        if (items.length === 0) {
            container.innerHTML = this.getEmptyInventoryMessage();
            return;
        }

        // Load photos for items
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            const photos = await DB.query('inventory_photos', 'item_id', item.id);
            return { ...item, photo: photos[0]?.thumbnail_blob || null };
        }));

        // Crear tabla - Ajustada al mismo tamaño que el recuadro de filtros
        container.innerHTML = `
            <div style="width: 100%; max-width: 100%; padding: 16px; background: var(--color-bg-secondary); border-radius: var(--radius-lg); overflow-x: auto; overflow-y: visible; box-sizing: border-box;">
                <table style="width: 100%; min-width: calc(100vw - 400px); border-collapse: collapse; background: var(--color-bg-card); border-radius: var(--radius-md); overflow: hidden; table-layout: auto;">
                    <thead>
                        <tr style="background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border);">
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 40px; width: auto;">
                                <input type="checkbox" id="inventory-list-select-all" onchange="window.Inventory.toggleSelectAll()" style="cursor: pointer;">
                            </th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 80px; width: auto;">Foto</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 120px; width: auto;">SKU</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 200px; width: auto;">Nombre</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 120px; width: auto;">Categoría</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 120px; width: auto;">Metal</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 120px; width: auto;">Piedra</th>
                            <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 100px; width: auto;">Stock</th>
                            <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 100px; width: auto;">Costo</th>
                            <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 120px; width: auto;">Estado</th>
                            <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 600; text-transform: uppercase; min-width: 150px; width: auto;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsWithPhotos.map(item => {
                            const hasCertificate = item.certificate_type && item.certificate_number;
                            const stoneInfo = item.stone_type ? `${item.stone_type}${item.carats ? ` ${item.carats}ct` : ''}` : (item.stone || 'N/A');
                            const isSelected = this.selectedItems.has(item.id);
                            const stockStatus = this.getStockStatus(item);
                            const stockBadgeClass = this.getStockBadgeClass(stockStatus);
                            const stockStatusText = this.getStockStatusText(stockStatus);
                            const stockActual = item.stock_actual ?? 1;
                            const stockMax = item.stock_max ?? 10;
                            
                            return `
                            <tr class="inventory-list-row ${isSelected ? 'inventory-list-row-selected' : ''}" data-item-id="${item.id}" style="border-bottom: 1px solid var(--color-border-light); transition: background 0.2s;">
                                <td style="padding: 12px;">
                                    <input type="checkbox" class="inventory-checkbox" 
                                           ${isSelected ? 'checked' : ''} 
                                           onchange="window.Inventory.toggleItemSelection('${item.id}', this.checked)"
                                           style="cursor: pointer;">
                                </td>
                                <td style="padding: 12px;">
                                    ${item.photo ? 
                                        `<img src="${item.photo}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` : 
                                        '<div style="width: 50px; height: 50px; background: var(--color-bg-secondary); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #999;"><i class="fas fa-gem" style="font-size: 20px; opacity: 0.3;"></i></div>'
                                    }
                                </td>
                                <td style="padding: 12px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary);">${item.sku || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 13px; font-weight: 500;">${item.name || 'Sin nombre'}</td>
                                <td style="padding: 12px; font-size: 12px;">${item.category || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 12px;">${item.metal || 'N/A'}</td>
                                <td style="padding: 12px; font-size: 12px;">${stoneInfo}</td>
                                <td style="padding: 12px; text-align: center;">
                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                        <span style="font-size: 12px; font-weight: 600;">${stockActual} / ${stockMax}</span>
                                        <span class="stock-badge ${stockBadgeClass}" style="font-size: 10px; padding: 2px 6px; border-radius: 3px;">${stockStatusText}</span>
                                    </div>
                                </td>
                                <td style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: var(--color-primary);">${Utils.formatCurrency(item.cost || 0)}</td>
                                <td style="padding: 12px;">
                                    <span class="status-badge status-${item.status}" style="font-size: 11px; padding: 4px 8px; border-radius: 4px;">${item.status || 'disponible'}</span>
                                </td>
                                <td style="padding: 12px; text-align: center;">
                                    <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showItemDetails('${item.id}')" title="Ver Detalles" style="padding: 4px 8px; font-size: 11px;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-secondary btn-sm" onclick="window.Inventory.showAddForm('${item.id}')" title="Editar" style="padding: 4px 8px; font-size: 11px;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.update_stock') ? `
                                            <button class="btn-secondary btn-sm" onclick="window.Inventory.showStockModal('${item.id}')" title="Ajustar Stock" style="padding: 4px 8px; font-size: 11px;">
                                                <i class="fas fa-cubes"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <style>
                .inventory-list-row:hover {
                    background: var(--color-bg-secondary) !important;
                }
                .inventory-list-row-selected {
                    background: rgba(var(--color-primary-rgb), 0.1) !important;
                }
            </style>
        `;
    },
    
    // Toggle selección de un item
    toggleItemSelection(itemId, selected) {
        if (selected) {
            this.selectedItems.add(itemId);
        } else {
            this.selectedItems.delete(itemId);
        }
        this.updateSelectionUI();
        
        // Actualizar la clase de la card
        const card = document.querySelector(`[data-item-id="${itemId}"]`);
        if (card) {
            card.classList.toggle('inventory-card-selected', selected);
        }
    },
    
    // Seleccionar/deseleccionar todos
    toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.inventory-checkbox');
        const allSelected = this.selectedItems.size === checkboxes.length && checkboxes.length > 0;
        
        checkboxes.forEach(checkbox => {
            const itemId = checkbox.closest('.inventory-card')?.dataset.itemId;
            if (itemId) {
                checkbox.checked = !allSelected;
                this.toggleItemSelection(itemId, !allSelected);
            }
        });
    },
    
    // Actualizar UI de selección
    updateSelectionUI() {
        const count = this.selectedItems.size;
        const deleteBtn = document.getElementById('inventory-delete-selected-btn');
        const printLabelsBtn = document.getElementById('inventory-print-selected-labels-btn');
        const printLabelsTopBtn = document.getElementById('inventory-print-labels-btn');
        const countEl = document.getElementById('inventory-selected-count');
        const countTextEl = document.getElementById('inventory-selected-count-text');
        const selectAllBtn = document.getElementById('inventory-select-all-btn');
        const batchActionsBar = document.getElementById('inventory-batch-actions');
        
        if (deleteBtn) {
            deleteBtn.style.display = count > 0 ? 'inline-flex' : 'none';
            deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Eliminar (${count})`;
        }
        
        if (printLabelsBtn) {
            printLabelsBtn.style.display = count > 0 ? 'inline-flex' : 'none';
            printLabelsBtn.innerHTML = `<i class="fas fa-gem"></i> Imprimir Etiquetas (${count})`;
        }
        
        if (printLabelsTopBtn) {
            printLabelsTopBtn.style.display = count > 0 ? 'inline-flex' : 'none';
            const countSpan = printLabelsTopBtn.querySelector('#inventory-print-labels-count');
            if (countSpan) {
                countSpan.textContent = count;
            }
        }
        
        if (countEl) {
            countEl.textContent = count > 0 ? `${count} seleccionados` : '';
        }
        
        if (countTextEl) {
            countTextEl.textContent = count > 0 ? `${count} item${count > 1 ? 's' : ''} seleccionado${count > 1 ? 's' : ''}` : '';
        }
        
        if (selectAllBtn) {
            const checkboxes = document.querySelectorAll('.inventory-checkbox');
            const allSelected = count === checkboxes.length && checkboxes.length > 0;
            selectAllBtn.innerHTML = allSelected ? 
                '<i class="fas fa-square"></i> Deseleccionar' : 
                '<i class="fas fa-check-square"></i> Seleccionar todo';
        }
        
        if (batchActionsBar) {
            batchActionsBar.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    // ============ MÉTODOS DE ELIMINACIÓN ============
    
    // Confirmar eliminación de un item individual
    async confirmDeleteItem(itemId) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            Utils.showNotification('Pieza no encontrada', 'error');
            return;
        }
        
        const confirmed = await Utils.confirm(
            `¿Estás seguro de eliminar "${item.name}" (SKU: ${item.sku})?`,
            'Esta acción no se puede deshacer. Se eliminarán también las fotos y certificados asociados.',
            'Eliminar',
            'Cancelar'
        );
        
        if (confirmed) {
            await this.deleteItem(itemId);
        }
    },
    
    // Eliminar un item
    async deleteItem(itemId) {
        try {
            const item = await DB.get('inventory_items', itemId);
            if (!item) return;
            
            // Eliminar fotos asociadas
            const photos = await DB.query('inventory_photos', 'item_id', itemId);
            for (const photo of photos) {
                await DB.delete('inventory_photos', photo.id);
            }
            
            // Eliminar certificados asociados
            const certs = await DB.query('inventory_certificates', 'item_id', itemId);
            for (const cert of certs) {
                await DB.delete('inventory_certificates', cert.id);
            }
            
            // Eliminar historial de precios
            const priceHistory = await DB.query('inventory_price_history', 'item_id', itemId);
            for (const ph of priceHistory) {
                await DB.delete('inventory_price_history', ph.id);
            }
            
            // Guardar metadata del item antes de eliminarlo para sincronización
            const itemMetadata = {
                id: item.id,
                sku: item.sku,
                name: item.name,
                branch_id: item.branch_id,
                deleted_at: new Date().toISOString()
            };
            
            // ELIMINAR EN AMBOS LADOS: Backend (Railway) y Frontend (IndexedDB)
            // Primero intentar eliminar del backend si está disponible
            let deletedFromBackend = false;
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteInventoryItem) {
                try {
                    console.log('🗑️ Eliminando item del servidor...');
                    await API.deleteInventoryItem(itemId);
                    deletedFromBackend = true;
                    console.log('✅ Item eliminado del servidor');
                } catch (apiError) {
                    console.warn('⚠️ Error eliminando del servidor (continuando con eliminación local):', apiError);
                    // Continuar con eliminación local aunque falle el backend
                }
            }
            
            // Agregar a cola de sincronización para asegurar sincronización bidireccional
            if (typeof SyncManager !== 'undefined') {
                try {
                    // Guardar metadata en un store temporal para que prepareRecords pueda accederlo
                    // Usar put en lugar de add para evitar errores si ya existe
                    await DB.put('sync_deleted_items', {
                        id: itemId,
                        entity_type: 'inventory_item',
                        metadata: itemMetadata,
                        deleted_at: new Date().toISOString()
                    });
                    
                    // Si no se eliminó del backend, agregar a cola para sincronización
                    if (!deletedFromBackend) {
                        await SyncManager.addToQueue('inventory_item', itemId, 'delete');
                    }
                } catch (syncError) {
                    console.warn('Error guardando metadata para sincronización (continuando):', syncError);
                    // Continuar con la eliminación aunque falle la sincronización
                }
            }
            
            // Registrar la eliminación en el log
            const logId = Utils.generateId();
            await DB.add('inventory_logs', {
                id: logId,
                item_id: itemId,
                action: 'eliminado',
                quantity: 1,
                notes: `Pieza eliminada: ${item.name} (SKU: ${item.sku})`,
                item_data: JSON.stringify(item), // Guardar copia del item eliminado
                created_at: new Date().toISOString()
            });
            
            // Agregar a cola de sincronización
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('inventory_log', logId);
                } catch (syncError) {
                    console.error('Error agregando inventory_log a cola:', syncError);
                }
            }
            
            // Eliminar el item de la base de datos
            try {
                await DB.delete('inventory_items', itemId);
                
                // Verificar que realmente se eliminó (con múltiples intentos si es necesario)
                let verifyDeleted = null;
                for (let attempt = 0; attempt < 5; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
                    verifyDeleted = await DB.get('inventory_items', itemId);
                    if (!verifyDeleted) {
                        console.log(`✅ Item ${itemId} eliminado correctamente (intento ${attempt + 1})`);
                        break;
                    }
                }
                
                if (verifyDeleted) {
                    console.error('⚠️ ERROR CRÍTICO: El item aún existe después de eliminarlo. ID:', itemId);
                    // Intentar eliminación forzada múltiple
                    try {
                        for (let forceAttempt = 0; forceAttempt < 3; forceAttempt++) {
                            await DB.delete('inventory_items', itemId);
                            await new Promise(resolve => setTimeout(resolve, 200));
                            const finalCheck = await DB.get('inventory_items', itemId);
                            if (!finalCheck) {
                                console.log(`✅ Item eliminado mediante eliminación forzada (intento ${forceAttempt + 1})`);
                                break;
                            }
                            if (forceAttempt === 2) {
                                Utils.showNotification('Error: No se pudo eliminar el item. Recarga la página para ver los cambios.', 'error');
                                // Continuar de todas formas y recargar
                            }
                        }
                    } catch (forceDeleteError) {
                        console.error('Error en eliminación forzada:', forceDeleteError);
                        // Continuar de todas formas
                    }
                }
            } catch (deleteError) {
                console.error('Error eliminando item de la BD:', deleteError);
                Utils.showNotification('Error al eliminar el item de la base de datos: ' + deleteError.message, 'error');
                return;
            }
            
            // Quitar de seleccionados si estaba
            this.selectedItems.delete(itemId);
            
            Utils.showNotification('Pieza eliminada correctamente', 'success');
            
            // Esperar más tiempo antes de recargar para asegurar que la eliminación se complete
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Forzar recarga completa sin cache
            await this.loadInventory();
        } catch (e) {
            console.error('Error eliminando item:', e);
            Utils.showNotification('Error al eliminar la pieza', 'error');
        }
    },
    
    // Eliminar items seleccionados
    async deleteSelectedItems() {
        if (this.selectedItems.size === 0) {
            Utils.showNotification('No hay items seleccionados', 'warning');
            return;
        }
        
        const count = this.selectedItems.size;
        const confirmed = await Utils.confirm(
            `¿Eliminar ${count} pieza(s) seleccionada(s)?`,
            'Esta acción no se puede deshacer. Se eliminarán todas las piezas seleccionadas junto con sus fotos y certificados.',
            `Eliminar ${count} pieza(s)`,
            'Cancelar'
        );
        
        if (confirmed) {
            let deleted = 0;
            let errors = 0;
            
            for (const itemId of this.selectedItems) {
                try {
                    await this.deleteItem(itemId);
                    deleted++;
                } catch (e) {
                    errors++;
                }
            }
            
            this.selectedItems.clear();
            Utils.showNotification(`${deleted} pieza(s) eliminada(s)${errors > 0 ? `, ${errors} error(es)` : ''}`, deleted > 0 ? 'success' : 'error');
            this.loadInventory();
        }
    },
    
    // ============ MÉTODOS DE GESTIÓN DE STOCK ============
    
    // Mostrar modal de ajuste de stock
    async showStockModal(itemId) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            Utils.showNotification('Pieza no encontrada', 'error');
            return;
        }
        
        const stockActual = item.stock_actual ?? 1;
        const stockMin = item.stock_min ?? 1;
        const stockMax = item.stock_max ?? 10;
        
        const body = `
            <form id="stock-form">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h4 style="margin: 0;">${item.name}</h4>
                    <p style="color: var(--color-text-secondary); font-size: 12px;">SKU: ${item.sku}</p>
                </div>
                
                <div class="stock-quick-adjust" style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', -10)" title="-10">-10</button>
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', -5)" title="-5">-5</button>
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', -1)" title="-1">-1</button>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <input type="number" id="stock-actual" class="form-input" value="${stockActual}" min="0" style="width: 80px; text-align: center; font-size: 24px; font-weight: bold;">
                        <span style="font-size: 10px; color: var(--color-text-secondary);">Actual</span>
                    </div>
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', 1)" title="+1">+1</button>
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', 5)" title="+5">+5</button>
                    <button type="button" class="btn-secondary btn-circle" onclick="window.Inventory.quickAdjustStock('${itemId}', 10)" title="+10">+10</button>
                </div>
                
                <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="form-group">
                        <label><i class="fas fa-arrow-down" style="color: var(--color-danger);"></i> Stock Mínimo</label>
                        <input type="number" id="stock-min" class="form-input" value="${stockMin}" min="0" required>
                        <small style="color: var(--color-text-secondary); font-size: 10px;">Alerta cuando esté por debajo</small>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-arrow-up" style="color: var(--color-success);"></i> Stock Máximo</label>
                        <input type="number" id="stock-max" class="form-input" value="${stockMax}" min="1" required>
                        <small style="color: var(--color-text-secondary); font-size: 10px;">Capacidad máxima</small>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Motivo del ajuste (opcional)</label>
                    <select id="stock-reason" class="form-select">
                        <option value="">Sin especificar</option>
                        <option value="compra">Compra/Reabastecimiento</option>
                        <option value="venta">Venta</option>
                        <option value="devolucion">Devolución</option>
                        <option value="ajuste">Ajuste de inventario</option>
                        <option value="dano">Daño/Pérdida</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Notas</label>
                    <textarea id="stock-notes" class="form-input" rows="2" placeholder="Notas adicionales sobre este ajuste..."></textarea>
                </div>
            </form>
        `;
        
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Inventory.saveStock('${itemId}')">
                <i class="fas fa-save"></i> Guardar Stock
            </button>
        `;
        
        UI.showModal('Ajustar Stock', body, footer, { size: 'medium' });
    },
    
    // Ajuste rápido de stock desde el modal
    quickAdjustStock(itemId, delta) {
        const input = document.getElementById('stock-actual');
        if (input) {
            let value = parseInt(input.value) || 0;
            value = Math.max(0, value + delta);
            input.value = value;
        }
    },
    
    // Guardar configuración de stock
    async saveStock(itemId) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            Utils.showNotification('Pieza no encontrada', 'error');
            return;
        }
        
        const stockActual = parseInt(document.getElementById('stock-actual')?.value) || 0;
        const stockMin = parseInt(document.getElementById('stock-min')?.value) || 1;
        const stockMax = parseInt(document.getElementById('stock-max')?.value) || 10;
        const reason = document.getElementById('stock-reason')?.value || '';
        const notes = document.getElementById('stock-notes')?.value || '';
        
        // Validaciones
        if (stockMin > stockMax) {
            Utils.showNotification('El stock mínimo no puede ser mayor al máximo', 'error');
            return;
        }
        
        const oldStock = item.stock_actual ?? 1;
        const stockChange = stockActual - oldStock;
        
        // Actualizar item
        item.stock_actual = stockActual;
        item.stock_min = stockMin;
        item.stock_max = stockMax;
        item.updated_at = new Date().toISOString();
        
        await DB.put('inventory_items', item);
        
        // Registrar movimiento de stock si hubo cambio
        if (stockChange !== 0) {
            const logId = Utils.generateId();
            await DB.add('inventory_logs', {
                id: logId,
                item_id: itemId,
                action: stockChange > 0 ? 'entrada' : 'salida',
                quantity: Math.abs(stockChange),
                stock_before: oldStock,
                stock_after: stockActual,
                reason: reason,
                notes: notes || `Stock ajustado de ${oldStock} a ${stockActual}`,
                created_at: new Date().toISOString()
            });
            
            // Agregar a cola de sincronización
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('inventory_log', logId);
                } catch (syncError) {
                    console.error('Error agregando inventory_log a cola:', syncError);
                }
            }
        }
        
        // Registrar cambio de configuración
        const configLogId = Utils.generateId();
        await DB.add('inventory_logs', {
            id: configLogId,
            item_id: itemId,
            action: 'config_stock',
            quantity: 0,
            notes: `Configuración de stock actualizada - Mín: ${stockMin}, Máx: ${stockMax}`,
            created_at: new Date().toISOString()
        });
        
        // Agregar a cola de sincronización
        if (typeof SyncManager !== 'undefined') {
            try {
                await SyncManager.addToQueue('inventory_log', configLogId);
            } catch (syncError) {
                console.error('Error agregando inventory_log a cola:', syncError);
            }
        }
        
        // Emitir evento de actualización de inventario
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.emit('inventory-updated', {
                item: item,
                isNew: false,
                stockChange: stockChange,
                oldStock: oldStock,
                newStock: stockActual,
                reason: reason || 'ajuste_manual'
            });
        }
        
        Utils.showNotification('Stock actualizado correctamente', 'success');
        UI.closeModal();
        this.loadInventory();
    },
    
    // Mostrar historial de movimientos de stock
    async showStockHistory(itemId) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) return;
        
        const logs = await DB.query('inventory_logs', 'item_id', itemId);
        const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        const body = `
            <div style="max-height: 400px; overflow-y: auto;">
                ${sortedLogs.length === 0 ? 
                    '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay movimientos registrados</p>' :
                    `<table class="cart-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Acción</th>
                                <th>Cantidad</th>
                                <th>Notas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedLogs.map(log => `
                                <tr>
                                    <td style="font-size: 11px;">${Utils.formatDate(log.created_at, 'YYYY-MM-DD HH:mm')}</td>
                                    <td><span class="stock-action-badge stock-action-${log.action}">${log.action}</span></td>
                                    <td style="text-align: center;">${log.quantity || '-'}</td>
                                    <td style="font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${log.notes || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>`
                }
            </div>
        `;
        
        const footer = `
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;
        
        UI.showModal(`Historial de Stock: ${item.name}`, body, footer);
    },

    async showItemDetails(itemId) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            Utils.showNotification('Pieza no encontrada', 'error');
            return;
        }

        const photos = await DB.query('inventory_photos', 'item_id', itemId);

        const certificate = item.certificate_type && item.certificate_number ? 
            await DB.query('inventory_certificates', 'item_id', itemId).then(certs => certs[0]) : null;
        const priceHistory = await DB.query('inventory_price_history', 'item_id', itemId);

        // Calcular estado de stock para el modal de detalles
        const stockActual = item.stock_actual ?? 1;
        const stockMin = item.stock_min ?? 1;
        const stockMax = item.stock_max ?? 10;
        const stockStatus = this.getStockStatus(item);
        const stockBadgeClass = this.getStockBadgeClass(stockStatus);
        const stockStatusText = this.getStockStatusText(stockStatus);

        const body = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h4 style="border-bottom: 2px solid var(--color-border-light); padding-bottom: 8px; margin-bottom: 12px;">Información General</h4>
                    <div style="display: grid; gap: 8px;">
                        <div><strong>SKU:</strong> ${item.sku}</div>
                        <div><strong>Código de Barras:</strong> ${item.barcode || 'N/A'}</div>
                        <div><strong>Nombre:</strong> ${item.name}</div>
                        <div><strong>Metal:</strong> ${item.metal || 'N/A'}</div>
                        ${item.stone_type ? `<div><strong>Tipo de Piedra:</strong> ${item.stone_type}</div>` : ''}
                        ${item.stone ? `<div><strong>Piedra:</strong> ${item.stone}</div>` : ''}
                        ${item.carats ? `<div><strong>Quilates:</strong> ${item.carats}ct</div>` : ''}
                        ${item.total_carats ? `<div><strong>Quilates Totales:</strong> ${item.total_carats}ct</div>` : ''}
                        ${item.color ? `<div><strong>Color:</strong> ${item.color}</div>` : ''}
                        ${item.clarity ? `<div><strong>Claridad:</strong> ${item.clarity}</div>` : ''}
                        ${item.cut ? `<div><strong>Corte:</strong> ${item.cut}</div>` : ''}
                        <div><strong>Talla/Tamaño:</strong> ${item.size || 'N/A'}</div>
                        <div><strong>Peso:</strong> ${(parseFloat(item.weight_g || item.weight || 0) || 0).toFixed(2)}g</div>
                        <div><strong>Medidas:</strong> ${item.measures || 'N/A'}</div>
                        <div><strong>Costo:</strong> ${Utils.formatCurrency(item.cost || 0)}</div>
                        ${item.suggested_price ? `<div><strong>Precio Sugerido:</strong> ${Utils.formatCurrency(item.suggested_price)}</div>` : ''}
                        ${item.collection ? `<div><strong>Colección:</strong> ${item.collection}</div>` : ''}
                        ${item.supplier ? `<div><strong>Proveedor:</strong> ${item.supplier}</div>` : ''}
                        ${item.origin_country ? `<div><strong>País de Origen:</strong> ${item.origin_country}</div>` : ''}
                        ${item.year ? `<div><strong>Año:</strong> ${item.year}</div>` : ''}
                        <div><strong>Ubicación:</strong> ${item.location || 'N/A'}</div>
                        <div><strong>Estado:</strong> <span class="status-badge status-${item.status}">${item.status}</span></div>
                        ${item.tags ? `<div><strong>Etiquetas:</strong> ${item.tags.split(',').map(t => `<span style="background: var(--color-bg-secondary); padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-right: 4px;">${t.trim()}</span>`).join('')}</div>` : ''}
                        ${item.notes ? `<div style="margin-top: 8px;"><strong>Notas:</strong><br><div style="background: var(--color-bg-secondary); padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">${item.notes}</div></div>` : ''}
                    </div>
                    
                    <!-- Panel de Control de Stock -->
                    <div style="margin-top: 16px; padding: 16px; background: var(--color-bg-secondary); border-radius: 8px; border-left: 4px solid var(--color-primary);">
                        <h5 style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-cubes" style="color: var(--color-primary);"></i>
                            Control de Stock
                            <span class="stock-badge ${stockBadgeClass}" style="margin-left: auto;">${stockStatusText}</span>
                        </h5>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
                            <div style="padding: 8px; background: white; border-radius: var(--radius-sm);">
                                <div style="font-size: 24px; font-weight: 700; color: var(--color-text);">${stockActual}</div>
                                <div style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;">Actual</div>
                            </div>
                            <div style="padding: 8px; background: white; border-radius: var(--radius-sm);">
                                <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${stockMin}</div>
                                <div style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;">Mínimo</div>
                            </div>
                            <div style="padding: 8px; background: white; border-radius: var(--radius-sm);">
                                <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${stockMax}</div>
                                <div style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase;">Máximo</div>
                            </div>
                        </div>
                        <div style="margin-top: 12px;">
                            <div class="stock-progress-bar" style="height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden;">
                                <div class="stock-progress ${stockBadgeClass}" style="height: 100%; width: ${Math.min((stockActual / stockMax) * 100, 100)}%; border-radius: 4px;"></div>
                            </div>
                        </div>
                        <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
                            <button class="btn-secondary btn-sm" onclick="UI.closeModal(); window.Inventory.showStockModal('${item.id}')" style="font-size: 11px;">
                                <i class="fas fa-edit"></i> Ajustar Stock
                            </button>
                            <button class="btn-secondary btn-sm" onclick="UI.closeModal(); window.Inventory.showStockHistory('${item.id}')" style="font-size: 11px;">
                                <i class="fas fa-history"></i> Ver Historial
                            </button>
                        </div>
                    </div>
                    
                    ${certificate ? `
                    <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); border-radius: 8px; border-left: 4px solid var(--color-success);">
                        <h5 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-certificate" style="color: var(--color-success);"></i>
                            Certificado
                        </h5>
                        <div><strong>Tipo:</strong> ${certificate.certificate_type}</div>
                        <div><strong>Número:</strong> ${certificate.certificate_number}</div>
                    </div>
                    ` : ''}
                    ${priceHistory.length > 0 ? `
                    <div style="margin-top: 16px;">
                        <h5 style="margin: 0 0 8px 0;">Historial de Precios</h5>
                        <div style="max-height: 150px; overflow-y: auto;">
                            ${priceHistory.slice(0, 5).map(ph => `
                                <div style="padding: 6px; border-bottom: 1px solid var(--color-border-light); font-size: 12px;">
                                    ${Utils.formatDate(ph.date, 'YYYY-MM-DD')}: 
                                    ${Utils.formatCurrency(ph.old_price)} → ${Utils.formatCurrency(ph.new_price)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div>
                    <h4 style="border-bottom: 2px solid var(--color-border-light); padding-bottom: 8px; margin-bottom: 12px;">Fotos</h4>
                    ${photos.length > 0 ? `
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px;">
                        ${photos.map(photo => `
                            <img src="${photo.photo_blob}" alt="Foto" style="width: 100%; border-radius: 4px; cursor: pointer;" onclick="window.open('${photo.photo_blob}', '_blank')">
                        `).join('')}
                    </div>
                    ` : '<p style="color: var(--color-text-secondary); text-align: center; padding: 20px;">No hay fotos disponibles</p>'}
                    <div id="barcode-preview" style="margin-top: 20px; text-align: center; padding: 20px; background: var(--color-bg-secondary); border-radius: 8px;">
                        <div style="margin-bottom: 12px; font-weight: 600; font-size: 14px;">Código de Barras</div>
                        <div style="display: flex; justify-content: center; align-items: center; min-height: 120px;">
                            <svg id="barcode-svg-${item.id}" style="max-width: 100%; height: auto;"></svg>
                        </div>
                        <div style="margin-top: 12px; font-size: 14px; color: var(--color-text-secondary); font-weight: 500;">${item.barcode}</div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-danger-outline" onclick="UI.closeModal(); window.Inventory.confirmDeleteItem('${item.id}')">
                <i class="fas fa-trash"></i> Eliminar
            </button>
            <button class="btn-secondary" onclick="window.Inventory.editItem('${item.id}')">
                <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn-secondary" onclick="UI.closeModal(); window.Inventory.showStockModal('${item.id}')">
                <i class="fas fa-cubes"></i> Stock
            </button>
            <button class="btn-secondary" onclick="window.Inventory.printJewelryLabel('${item.id}')">
                <i class="fas fa-gem"></i> Imprimir Etiqueta Joya
            </button>
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Pieza: ${item.name}`, body, footer);

        // Generate barcode preview (solo visualización, no usa BarcodeManager)
        if (item.barcode && typeof JsBarcode !== 'undefined') {
            setTimeout(() => {
                this.generateBarcodePreview(item.barcode, `barcode-svg-${item.id}`);
            }, 100);
        }
    },

    async showAddForm(itemId = null) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:968',message:'showAddForm called',data:{itemId:itemId,hasPermissionManager:typeof PermissionManager!=='undefined',hasAddPermission:typeof PermissionManager!=='undefined'?PermissionManager.hasPermission('inventory.add'):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permisos
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('inventory.add')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:975',message:'Permission denied for inventory.add',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null,userPermissions:typeof UserManager!=='undefined'?UserManager.currentUser?.permissions:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para agregar items al inventario', 'error');
            return;
        }
        
        // Obtener item desde IndexedDB o API si no está disponible localmente
        let item = itemId ? await DB.get('inventory_items', itemId) : null;
        
        // Si no se encuentra localmente y hay API, intentar obtenerlo del servidor
        if (itemId && !item && typeof API !== 'undefined' && API.baseURL && API.getInventoryItem) {
            try {
                item = await API.getInventoryItem(itemId);
                // Guardar en IndexedDB para uso futuro
                if (item) {
                    await DB.put('inventory_items', item);
                }
            } catch (error) {
                console.warn('Error obteniendo item desde API:', error);
            }
        }

        // Parsear measurements y stones si existen
        const measurements = item?.measurements ? (typeof item.measurements === 'string' ? JSON.parse(item.measurements) : item.measurements) : {};
        const stones = item?.stones ? (typeof item.stones === 'string' ? JSON.parse(item.stones) : item.stones) : [];
        
        const body = `
            <form id="inventory-form">
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--spacing-md); min-height: 500px;">
                    <!-- Sidebar de Pestañas Vertical -->
                    <div style="background: var(--color-bg-secondary); border-radius: var(--radius-md); padding: var(--spacing-sm); display: flex; flex-direction: column; gap: 4px;">
                        <button type="button" class="tab-btn-vertical active" data-tab="basic" onclick="window.Inventory.switchTab('basic')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-info-circle"></i> <span>Información Básica</span>
                        </button>
                        <button type="button" class="tab-btn-vertical" data-tab="material" onclick="window.Inventory.switchTab('material')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-gem"></i> <span>Material y Pureza</span>
                        </button>
                        <button type="button" class="tab-btn-vertical" data-tab="stones" onclick="window.Inventory.switchTab('stones')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-diamond"></i> <span>Piedras</span>
                        </button>
                        <button type="button" class="tab-btn-vertical" data-tab="measurements" onclick="window.Inventory.switchTab('measurements')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-ruler"></i> <span>Medidas</span>
                        </button>
                        <button type="button" class="tab-btn-vertical" data-tab="pricing" onclick="window.Inventory.switchTab('pricing')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-dollar-sign"></i> <span>Precio y Márgenes</span>
                        </button>
                        <button type="button" class="tab-btn-vertical" data-tab="status" onclick="window.Inventory.switchTab('status')" style="text-align: left; padding: 12px; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text);">
                            <i class="fas fa-map-marker-alt"></i> <span>Estado y Ubicación</span>
                        </button>
                    </div>
                    
                    <!-- Contenido de Pestañas -->
                    <div style="overflow-y: auto; max-height: 600px; padding-right: var(--spacing-sm);">
                        <!-- Pestaña 1: Información Básica -->
                        <div id="tab-basic" class="tab-content active">
                    <div class="form-row">
                        <div class="form-group">
                            <label>SKU *</label>
                            <div style="display: flex; gap: var(--spacing-xs); align-items: flex-start;">
                                <input type="text" id="inv-sku" class="form-input" value="${item?.sku || ''}" required style="flex: 1;">
                                <button type="button" class="btn-secondary btn-sm" onclick="window.Inventory.generateSKU()" title="Generar SKU automáticamente" style="white-space: nowrap; margin-top: 0;">
                                    <i class="fas fa-magic"></i> Auto
                                </button>
                            </div>
                            <small style="color: var(--color-text-secondary); font-size: 11px; display: block; margin-top: var(--spacing-xs);">
                                El SKU se genera automáticamente en formato secuencial (JOY-001, JOY-002, etc.)
                            </small>
                        </div>
                        <div class="form-group">
                            <label>Código de Barras</label>
                            <div style="display: flex; gap: var(--spacing-xs); align-items: flex-start;">
                                <input type="text" id="inv-barcode" class="form-input" value="${item?.barcode || ''}" placeholder="Se generará automáticamente desde SKU" style="flex: 1;">
                                <button type="button" class="btn-secondary btn-sm" onclick="window.Inventory.generateBarcode()" title="Generar código de barras desde SKU" style="white-space: nowrap; margin-top: 0;">
                                    <i class="fas fa-barcode"></i> Generar
                                </button>
                            </div>
                            <small style="color: var(--color-text-secondary); font-size: 11px; display: block; margin-top: var(--spacing-xs);">
                                El código de barras se genera automáticamente. Si hay SKU, se usará el SKU; si no, se generará un código único. Puedes editarlo manualmente si es necesario.
                            </small>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Nombre *</label>
                        <input type="text" id="inv-name" class="form-input" value="${item?.name || ''}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Categoría *</label>
                            <select id="inv-category" class="form-select" required>
                                <option value="">Seleccionar...</option>
                                ${this.INVENTORY_CATEGORIES.map(cat => `<option value="${cat.replace(/"/g, '&quot;')}" ${item?.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Subcategoría</label>
                            <input type="text" id="inv-subcategory" class="form-input" value="${item?.subcategory || ''}" placeholder="Ej: Cubana, Figaro, Cartier">
                        </div>
                        <div class="form-group">
                            <label>Colección</label>
                            <input type="text" id="inv-collection" class="form-input" value="${item?.collection || ''}" placeholder="Ej: Verano 2024">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Descripción</label>
                        <textarea id="inv-description" class="form-input" rows="3" placeholder="Descripción detallada de la pieza...">${item?.description || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Notas Adicionales</label>
                        <textarea id="inv-notes" class="form-input" rows="3" placeholder="Información adicional sobre la pieza...">${item?.notes || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Etiquetas/Categorías</label>
                        <input type="text" id="inv-tags" class="form-input" value="${item?.tags || ''}" placeholder="Ej: exclusivo, limitado, vintage, moderno (separadas por comas)">
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Separa las etiquetas con comas</small>
                    </div>
                    <div class="form-group">
                        <label>Fotos</label>
                        <input type="file" id="inv-photos" class="form-input" multiple accept="image/*">
                        <div id="inv-photos-preview" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;"></div>
                    </div>
                    <div class="form-group" id="barcode-preview-container" style="display: none; margin-top: var(--spacing-md); padding: 20px; background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <label style="margin-bottom: 12px; font-weight: 600; font-size: 14px; display: block;">Vista Previa del Código de Barras</label>
                        <div style="text-align: center; padding: 15px; background: white; border-radius: 6px; min-height: 120px; display: flex; align-items: center; justify-content: center;">
                            <svg id="barcode-preview-svg" style="max-width: 100%; height: auto;"></svg>
                        </div>
                    </div>
                </div>
                
                <!-- Pestaña 2: Material y Pureza -->
                <div id="tab-material" class="tab-content" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Material *</label>
                            <select id="inv-material" class="form-select" required>
                                <option value="">Seleccionar...</option>
                                <option value="Oro" ${item?.material === 'Oro' || (!item?.material && item?.metal?.includes('Oro')) ? 'selected' : ''}>Oro</option>
                                <option value="Plata" ${item?.material === 'Plata' || (!item?.material && item?.metal?.includes('Plata')) ? 'selected' : ''}>Plata</option>
                                <option value="Acero" ${item?.material === 'Acero' ? 'selected' : ''}>Acero</option>
                                <option value="Titanio" ${item?.material === 'Titanio' || (!item?.material && item?.metal === 'Titanio') ? 'selected' : ''}>Titanio</option>
                                <option value="Bisutería" ${item?.material === 'Bisutería' ? 'selected' : ''}>Bisutería</option>
                                <option value="Platino" ${item?.material === 'Platino' || (!item?.material && item?.metal === 'Platino') ? 'selected' : ''}>Platino</option>
                                <option value="Paladio" ${item?.material === 'Paladio' || (!item?.material && item?.metal === 'Paladio') ? 'selected' : ''}>Paladio</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Material principal de la pieza</small>
                        </div>
                        <div class="form-group">
                            <label>Ley/Pureza</label>
                            <select id="inv-purity" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="10K" ${item?.purity === '10K' || (!item?.purity && item?.metal?.includes('10k')) ? 'selected' : ''}>10K</option>
                                <option value="14K" ${item?.purity === '14K' || (!item?.purity && item?.metal?.includes('14k')) ? 'selected' : ''}>14K</option>
                                <option value="18K" ${item?.purity === '18K' || (!item?.purity && item?.metal?.includes('18k')) ? 'selected' : ''}>18K</option>
                                <option value=".925" ${item?.purity === '.925' || (!item?.purity && item?.metal?.includes('925')) ? 'selected' : ''}>.925</option>
                                <option value=".999" ${item?.purity === '.999' ? 'selected' : ''}>.999</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Ley o pureza del material</small>
                        </div>
                        <div class="form-group">
                            <label>Peso (g) *</label>
                            <input type="number" id="inv-weight" class="form-input" step="0.01" value="${item?.weight_g || item?.weight || ''}" required>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Peso en gramos</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Baño</label>
                            <select id="inv-plating" class="form-select">
                                <option value="">Sin baño</option>
                                <option value="Rodio" ${item?.plating === 'Rodio' ? 'selected' : ''}>Rodio</option>
                                <option value="Oro amarillo" ${item?.plating === 'Oro amarillo' ? 'selected' : ''}>Oro amarillo</option>
                                <option value="Oro rosa" ${item?.plating === 'Oro rosa' ? 'selected' : ''}>Oro rosa</option>
                                <option value="Oro blanco" ${item?.plating === 'Oro blanco' ? 'selected' : ''}>Oro blanco</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Tipo de baño aplicado</small>
                        </div>
                        <div class="form-group">
                            <label>Estilo</label>
                            <select id="inv-style" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="Clásico" ${item?.style === 'Clásico' ? 'selected' : ''}>Clásico</option>
                                <option value="Minimalista" ${item?.style === 'Minimalista' ? 'selected' : ''}>Minimalista</option>
                                <option value="Luxury" ${item?.style === 'Luxury' ? 'selected' : ''}>Luxury</option>
                                <option value="Vintage" ${item?.style === 'Vintage' ? 'selected' : ''}>Vintage</option>
                                <option value="Boho" ${item?.style === 'Boho' ? 'selected' : ''}>Boho</option>
                                <option value="Urbano" ${item?.style === 'Urbano' ? 'selected' : ''}>Urbano</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Estilo de diseño</small>
                        </div>
                        <div class="form-group">
                            <label>Tipo de Acabado</label>
                            <select id="inv-finish-type" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="Pulido" ${item?.finish_type === 'Pulido' ? 'selected' : ''}>Pulido</option>
                                <option value="Mate" ${item?.finish_type === 'Mate' ? 'selected' : ''}>Mate</option>
                                <option value="Satinado" ${item?.finish_type === 'Satinado' ? 'selected' : ''}>Satinado</option>
                                <option value="Texturizado" ${item?.finish_type === 'Texturizado' ? 'selected' : ''}>Texturizado</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Tipo de acabado superficial</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex: 1;">
                            <label>Tema</label>
                            <select id="inv-theme" class="form-select">
                                <option value="">Sin tema</option>
                                <option value="Corazón" ${item?.theme === 'Corazón' ? 'selected' : ''}>Corazón</option>
                                <option value="Cruz" ${item?.theme === 'Cruz' ? 'selected' : ''}>Cruz</option>
                                <option value="Inicial" ${item?.theme === 'Inicial' ? 'selected' : ''}>Inicial</option>
                                <option value="Ojo" ${item?.theme === 'Ojo' ? 'selected' : ''}>Ojo</option>
                                <option value="Flor" ${item?.theme === 'Flor' ? 'selected' : ''}>Flor</option>
                                <option value="Zodiacal" ${item?.theme === 'Zodiacal' ? 'selected' : ''}>Zodiacal</option>
                                <option value="Virgen" ${item?.theme === 'Virgen' ? 'selected' : ''}>Virgen</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Tema o motivo decorativo</small>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-sm); display: block;">Información del Metal</label>
                        <div style="background: var(--color-bg-secondary); padding: 12px; border-radius: var(--radius-sm);">
                            <div style="font-size: 13px; color: var(--color-text-secondary);">
                                <strong>Metal combinado:</strong> <span id="metal-preview" style="color: var(--color-primary); font-weight: 600;">Se generará automáticamente desde Material + Pureza</span>
                            </div>
                            <small style="color: var(--color-text-secondary); font-size: 11px; display: block; margin-top: 4px;">Este campo se calcula automáticamente al guardar</small>
                        </div>
                    </div>
                </div>
                
                <!-- Pestaña 3: Piedras -->
                <div id="tab-stones" class="tab-content" style="display: none;">
                    <div class="form-group" style="background: var(--color-bg-secondary); padding: 12px; border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-xs); display: block;">¿La pieza tiene piedras?</label>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Selecciona el tipo de piedra si aplica. Si no tiene piedras, deja en "Ninguna".</small>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo de Piedra</label>
                            <select id="inv-stone-type" class="form-select">
                                <option value="">Ninguna</option>
                                <option value="Diamante" ${item?.stone_type === 'Diamante' ? 'selected' : ''}>Diamante</option>
                                <option value="Rubí" ${item?.stone_type === 'Rubí' ? 'selected' : ''}>Rubí</option>
                                <option value="Zafiro" ${item?.stone_type === 'Zafiro' ? 'selected' : ''}>Zafiro</option>
                                <option value="Esmeralda" ${item?.stone_type === 'Esmeralda' ? 'selected' : ''}>Esmeralda</option>
                                <option value="Perla" ${item?.stone_type === 'Perla' ? 'selected' : ''}>Perla</option>
                                <option value="Amatista" ${item?.stone_type === 'Amatista' ? 'selected' : ''}>Amatista</option>
                                <option value="Topacio" ${item?.stone_type === 'Topacio' ? 'selected' : ''}>Topacio</option>
                                <option value="Citrino" ${item?.stone_type === 'Citrino' ? 'selected' : ''}>Citrino</option>
                                <option value="Aguamarina" ${item?.stone_type === 'Aguamarina' ? 'selected' : ''}>Aguamarina</option>
                                <option value="Tanzanita" ${item?.stone_type === 'Tanzanita' ? 'selected' : ''}>Tanzanita</option>
                                <option value="Moissanita" ${item?.stone_type === 'Moissanita' ? 'selected' : ''}>Moissanita</option>
                                <option value="Zirconia" ${item?.stone_type === 'Zirconia' ? 'selected' : ''}>Zirconia</option>
                                <option value="Ópalo" ${item?.stone_type === 'Ópalo' ? 'selected' : ''}>Ópalo</option>
                                <option value="Otra" ${item?.stone_type === 'Otra' ? 'selected' : ''}>Otra</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Tipo principal de piedra</small>
                        </div>
                        <div class="form-group">
                            <label>Piedra (Descripción)</label>
                            <input type="text" id="inv-stone" class="form-input" value="${item?.stone || ''}" placeholder="Descripción detallada de la piedra">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Información adicional sobre la piedra</small>
                        </div>
                        <div class="form-group">
                            <label>Quilates Totales</label>
                            <input type="number" id="inv-total-carats" class="form-input" step="0.01" value="${item?.total_carats || item?.stone_weight || ''}" placeholder="0.00">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Total de quilates (ct)</small>
                        </div>
                    </div>
                    <div class="form-row" id="diamond-specs-row" style="display: none;">
                        <div class="form-group">
                            <label>Quilates (ct)</label>
                            <input type="number" id="inv-carats" class="form-input" step="0.01" value="${item?.carats || ''}" placeholder="0.00">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Quilates individuales</small>
                        </div>
                        <div class="form-group">
                            <label>Color</label>
                            <select id="inv-color" class="form-select">
                                <option value="">N/A</option>
                                <option value="D" ${item?.color === 'D' ? 'selected' : ''}>D (Incoloro)</option>
                                <option value="E" ${item?.color === 'E' ? 'selected' : ''}>E</option>
                                <option value="F" ${item?.color === 'F' ? 'selected' : ''}>F</option>
                                <option value="G" ${item?.color === 'G' ? 'selected' : ''}>G</option>
                                <option value="H" ${item?.color === 'H' ? 'selected' : ''}>H</option>
                                <option value="I" ${item?.color === 'I' ? 'selected' : ''}>I</option>
                                <option value="J" ${item?.color === 'J' ? 'selected' : ''}>J</option>
                                <option value="K-Z" ${item?.color === 'K-Z' ? 'selected' : ''}>K-Z</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Grado de color (solo diamantes)</small>
                        </div>
                        <div class="form-group">
                            <label>Claridad</label>
                            <select id="inv-clarity" class="form-select">
                                <option value="">N/A</option>
                                <option value="FL" ${item?.clarity === 'FL' ? 'selected' : ''}>FL (Flawless)</option>
                                <option value="IF" ${item?.clarity === 'IF' ? 'selected' : ''}>IF (Internally Flawless)</option>
                                <option value="VVS1" ${item?.clarity === 'VVS1' ? 'selected' : ''}>VVS1</option>
                                <option value="VVS2" ${item?.clarity === 'VVS2' ? 'selected' : ''}>VVS2</option>
                                <option value="VS1" ${item?.clarity === 'VS1' ? 'selected' : ''}>VS1</option>
                                <option value="VS2" ${item?.clarity === 'VS2' ? 'selected' : ''}>VS2</option>
                                <option value="SI1" ${item?.clarity === 'SI1' ? 'selected' : ''}>SI1</option>
                                <option value="SI2" ${item?.clarity === 'SI2' ? 'selected' : ''}>SI2</option>
                                <option value="I1" ${item?.clarity === 'I1' ? 'selected' : ''}>I1</option>
                                <option value="I2" ${item?.clarity === 'I2' ? 'selected' : ''}>I2</option>
                                <option value="I3" ${item?.clarity === 'I3' ? 'selected' : ''}>I3</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Grado de claridad (solo diamantes)</small>
                        </div>
                        <div class="form-group">
                            <label>Corte</label>
                            <select id="inv-cut" class="form-select">
                                <option value="">N/A</option>
                                <option value="Excelente" ${item?.cut === 'Excelente' ? 'selected' : ''}>Excelente</option>
                                <option value="Muy Bueno" ${item?.cut === 'Muy Bueno' ? 'selected' : ''}>Muy Bueno</option>
                                <option value="Bueno" ${item?.cut === 'Bueno' ? 'selected' : ''}>Bueno</option>
                                <option value="Regular" ${item?.cut === 'Regular' ? 'selected' : ''}>Regular</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Calidad del corte</small>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-sm); display: block;">Notas sobre Piedras</label>
                        <textarea class="form-input" rows="2" placeholder="Información adicional sobre las piedras (tamaño en mm, cantidad, disposición, etc.)" style="resize: vertical;"></textarea>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Información adicional sobre las piedras de la pieza</small>
                    </div>
                </div>
                
                <!-- Pestaña 4: Medidas -->
                <div id="tab-measurements" class="tab-content" style="display: none;">
                    <div class="form-group" style="background: var(--color-bg-secondary); padding: 12px; border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-xs); display: block;">Medidas Específicas por Tipo de Pieza</label>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Completa solo las medidas que apliquen según el tipo de pieza seleccionado en la categoría.</small>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Talla Anillo (MX/US)</label>
                            <input type="number" id="inv-ring-size" class="form-input" step="0.5" value="${measurements?.ring_size || item?.size || ''}" placeholder="Ej: 6, 6.5, 7...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Solo para anillos</small>
                        </div>
                        <div class="form-group">
                            <label>Largo Cadena/Collar (cm)</label>
                            <input type="number" id="inv-chain-length" class="form-input" step="0.1" value="${measurements?.chain_length || ''}" placeholder="Ej: 50, 60...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Solo para cadenas y collares</small>
                        </div>
                        <div class="form-group">
                            <label>Largo Pulsera/Esclava (cm)</label>
                            <input type="number" id="inv-bracelet-length" class="form-input" step="0.1" value="${measurements?.bracelet_length || ''}" placeholder="Ej: 18, 20...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Solo para pulseras y esclavas</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo de Broche (Aretes)</label>
                            <select id="inv-earring-type" class="form-select">
                                <option value="">N/A</option>
                                <option value="Mariposa" ${measurements?.earring_type === 'Mariposa' ? 'selected' : ''}>Mariposa</option>
                                <option value="Presión" ${measurements?.earring_type === 'Presión' ? 'selected' : ''}>Presión</option>
                                <option value="Gancho" ${measurements?.earring_type === 'Gancho' ? 'selected' : ''}>Gancho</option>
                                <option value="Poste" ${measurements?.earring_type === 'Poste' ? 'selected' : ''}>Poste</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Solo para aretes</small>
                        </div>
                        <div class="form-group">
                            <label>Ancho (mm)</label>
                            <input type="number" id="inv-width" class="form-input" step="0.1" value="${measurements?.width || ''}" placeholder="Ej: 5, 10...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Ancho de la pieza en milímetros</small>
                        </div>
                        <div class="form-group">
                            <label>Grosor (mm)</label>
                            <input type="number" id="inv-thickness" class="form-input" step="0.1" value="${measurements?.thickness || ''}" placeholder="Ej: 2, 3...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Grosor de la pieza en milímetros</small>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Otras Medidas / Notas de Medidas</label>
                        <textarea id="inv-measures" class="form-input" rows="3" placeholder="Ej: Diámetro 20mm, Largo colgante 3cm, Tipo de eslabón: Figaro, etc.">${item?.measures || item?.size || ''}</textarea>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Medidas adicionales o información detallada sobre dimensiones</small>
                    </div>
                </div>
                
                <!-- Pestaña 5: Precio y Márgenes -->
                <div id="tab-pricing" class="tab-content" style="display: none;">
                    <div class="form-group" style="background: var(--color-bg-secondary); padding: 12px; border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-xs); display: block;">Información de Precios</label>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">El precio de venta es editable y se usa en el punto de venta. El precio sugerido es opcional y puede estar vacío.</small>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Proveedor</label>
                            <select id="inv-supplier" class="form-select">
                                <option value="">Seleccionar proveedor...</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Proveedor de este item</small>
                        </div>
                        <div class="form-group">
                            <label>Costo *</label>
                            <input type="number" id="inv-cost" class="form-input" step="0.01" value="${item?.cost || ''}" required>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Costo de adquisición</small>
                        </div>
                        <div class="form-group">
                            <label>Precio de Venta</label>
                            <input type="number" id="inv-sale-price" class="form-input" step="0.01" value="${item?.sale_price || ''}">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Precio de venta (editable en POS)</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Precio Sugerido</label>
                            <input type="number" id="inv-price" class="form-input" step="0.01" value="${item?.price || ''}">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Precio sugerido (opcional)</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Moneda</label>
                            <select id="inv-currency" class="form-select">
                                <option value="MXN" ${item?.currency === 'MXN' || !item?.currency ? 'selected' : ''}>MXN (Peso Mexicano)</option>
                                <option value="USD" ${item?.currency === 'USD' ? 'selected' : ''}>USD (Dólar Americano)</option>
                                <option value="CAD" ${item?.currency === 'CAD' ? 'selected' : ''}>CAD (Dólar Canadiense)</option>
                            </select>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Moneda para precios</small>
                        </div>
                        <div class="form-group">
                            <label>Descuento (%)</label>
                            <input type="number" id="inv-discount" class="form-input" step="0.01" value="${item?.discount || ''}" placeholder="0.00" min="0" max="100">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Descuento porcentual</small>
                        </div>
                        <div class="form-group">
                            <label>Descuento (Monto Fijo)</label>
                            <input type="number" id="inv-discount-amount" class="form-input" step="0.01" value="${item?.discount_amount || ''}" placeholder="0.00" min="0">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Descuento en monto fijo</small>
                        </div>
                    </div>
                    <div class="form-group" style="background: var(--color-bg-secondary); padding: 16px; border-radius: var(--radius-sm); margin-top: var(--spacing-md);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-sm); display: block;">Margen % (Calculado automáticamente)</label>
                        <div id="inv-margin-display" style="font-size: 24px; font-weight: 700; color: var(--color-primary); margin: var(--spacing-sm) 0;">
                            ${item?.margin_percent ? `${item.margin_percent.toFixed(2)}%` : 'N/A'}
                        </div>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Fórmula: ((Precio de Venta - Costo) / Costo) × 100</small>
                    </div>
                    <div class="form-group" style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border);">
                        <label style="font-weight: 600; margin-bottom: var(--spacing-sm); display: block;">Notas de Precios</label>
                        <textarea class="form-input" rows="2" placeholder="Información adicional sobre precios, promociones, condiciones especiales, etc." style="resize: vertical;"></textarea>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Información adicional relacionada con precios</small>
                    </div>
                </div>
                
                <!-- Pestaña 6: Estado y Ubicación -->
                <div id="tab-status" class="tab-content" style="display: none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Estado *</label>
                            <select id="inv-status" class="form-select" required>
                                <option value="disponible" ${item?.status === 'disponible' || !item?.status ? 'selected' : ''}>Disponible</option>
                                <option value="apartada" ${item?.status === 'apartada' ? 'selected' : ''}>Apartada</option>
                                <option value="vendida" ${item?.status === 'vendida' ? 'selected' : ''}>Vendida</option>
                                <option value="reparacion" ${item?.status === 'reparacion' ? 'selected' : ''}>En Reparación</option>
                                <option value="exhibicion" ${item?.status === 'exhibicion' ? 'selected' : ''}>En Exhibición</option>
                                <option value="reservado" ${item?.status === 'reservado' ? 'selected' : ''}>Reservado</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Condición</label>
                            <select id="inv-condition" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="Nuevo" ${item?.condition === 'Nuevo' ? 'selected' : ''}>Nuevo</option>
                                <option value="Seminuevo" ${item?.condition === 'Seminuevo' ? 'selected' : ''}>Seminuevo</option>
                                <option value="Exhibición" ${item?.condition === 'Exhibición' ? 'selected' : ''}>Exhibición</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Ubicación</label>
                            <div style="position: relative;">
                                <input type="text" id="inv-location-detail" class="form-input" 
                                       list="inv-location-detail-list" 
                                       value="${item?.location_detail || item?.location || ''}" 
                                       placeholder="Escribe o selecciona una ubicación..."
                                       autocomplete="off">
                                <datalist id="inv-location-detail-list">
                                    <!-- Se poblará dinámicamente con ubicaciones guardadas -->
                                </datalist>
                            </div>
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Escribe una ubicación nueva o selecciona una existente para filtrar</small>
                        </div>
                        <div class="form-group">
                            <label>Detalle de Ubicación (Opcional)</label>
                            <input type="text" id="inv-location" class="form-input" value="${item?.location || ''}" placeholder="Ej: Estante A, Nivel 2, Compartimento 3...">
                            <small style="color: var(--color-text-secondary); font-size: 11px;">Información adicional de ubicación</small>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Proveedor/Fabricante</label>
                            <input type="text" id="inv-supplier" class="form-input" value="${item?.supplier || ''}" placeholder="Nombre del proveedor">
                        </div>
                        <div class="form-group">
                            <label>Código del Proveedor</label>
                            <input type="text" id="inv-supplier-code" class="form-input" value="${item?.supplier_code || ''}" placeholder="Código del proveedor">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>País de Origen</label>
                            <select id="inv-origin-country" class="form-select">
                                <option value="">Seleccionar...</option>
                                <option value="México" ${item?.origin_country === 'México' ? 'selected' : ''}>México</option>
                                <option value="Italia" ${item?.origin_country === 'Italia' ? 'selected' : ''}>Italia</option>
                                <option value="Estados Unidos" ${item?.origin_country === 'Estados Unidos' ? 'selected' : ''}>Estados Unidos</option>
                                <option value="India" ${item?.origin_country === 'India' ? 'selected' : ''}>India</option>
                                <option value="Tailandia" ${item?.origin_country === 'Tailandia' ? 'selected' : ''}>Tailandia</option>
                                <option value="China" ${item?.origin_country === 'China' ? 'selected' : ''}>China</option>
                                <option value="Bélgica" ${item?.origin_country === 'Bélgica' ? 'selected' : ''}>Bélgica</option>
                                <option value="Israel" ${item?.origin_country === 'Israel' ? 'selected' : ''}>Israel</option>
                                <option value="Otro" ${item?.origin_country === 'Otro' ? 'selected' : ''}>Otro</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Año de Fabricación</label>
                            <input type="number" id="inv-year" class="form-input" value="${item?.year || ''}" placeholder="2024" min="1900" max="2100">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Certificado</label>
                        <div class="form-row">
                            <div class="form-group" style="flex: 1;">
                                <select id="inv-certificate-type" class="form-select">
                                    <option value="">Sin certificado</option>
                                    <option value="GIA" ${item?.certificate_type === 'GIA' ? 'selected' : ''}>GIA (Gemological Institute of America)</option>
                                    <option value="IGI" ${item?.certificate_type === 'IGI' ? 'selected' : ''}>IGI (International Gemological Institute)</option>
                                    <option value="AGS" ${item?.certificate_type === 'AGS' ? 'selected' : ''}>AGS (American Gem Society)</option>
                                    <option value="HRD" ${item?.certificate_type === 'HRD' ? 'selected' : ''}>HRD (Hoge Raad voor Diamant)</option>
                                    <option value="EGL" ${item?.certificate_type === 'EGL' ? 'selected' : ''}>EGL (European Gemological Laboratory)</option>
                                    <option value="Otro" ${item?.certificate_type === 'Otro' ? 'selected' : ''}>Otro</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <input type="text" id="inv-certificate-number" class="form-input" value="${item?.certificate_number || ''}" placeholder="Número de certificado">
                            </div>
                        </div>
                    </div>
                    <!-- Sección de Control de Stock -->
                    <div style="background: var(--color-bg-secondary); padding: 16px; border-radius: var(--radius-md); margin: 16px 0;">
                        <h4 style="margin: 0 0 12px 0; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-cubes" style="color: var(--color-primary);"></i>
                            Control de Stock
                        </h4>
                        <div class="form-row" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px;">Stock Actual *</label>
                                <input type="number" id="inv-stock-actual" class="form-input" value="${item?.stock_actual ?? 1}" min="0" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px;">Stock Mínimo</label>
                                <input type="number" id="inv-stock-min" class="form-input" value="${item?.stock_min ?? 1}" min="0">
                                <small style="color: var(--color-text-secondary); font-size: 9px;">Alerta stock bajo</small>
                            </div>
                            <div class="form-group" style="margin-bottom: 0;">
                                <label style="font-size: 11px;">Stock Máximo</label>
                                <input type="number" id="inv-stock-max" class="form-input" value="${item?.stock_max ?? 10}" min="1">
                                <small style="color: var(--color-text-secondary); font-size: 9px;">Capacidad máxima</small>
                            </div>
                        </div>
                    </div>
                        </div>
                    </div>
                </div>
            </form>
            <style>
                .tab-btn-vertical {
                    transition: all 0.2s ease;
                }
                .tab-btn-vertical:hover {
                    background: var(--color-bg) !important;
                }
                .tab-btn-vertical.active {
                    background: var(--color-primary) !important;
                    color: white !important;
                    font-weight: 600;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
            </style>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Inventory.saveItem('${itemId || ''}')">Guardar</button>
        `;

        UI.showModal(itemId ? 'Editar Pieza' : 'Nueva Pieza', body, footer, { size: 'lg' });

        // Inicializar sistema de pestañas
        this.initializeTabs();
        
        // Cargar ubicaciones guardadas para el autocompletado
        this.loadSavedLocations();
        
        // Mostrar/ocultar campos de especificaciones de diamante
        const stoneTypeSelect = document.getElementById('inv-stone-type');
        const diamondSpecsRow = document.getElementById('diamond-specs-row');
        if (stoneTypeSelect && diamondSpecsRow) {
            stoneTypeSelect.addEventListener('change', () => {
                diamondSpecsRow.style.display = stoneTypeSelect.value === 'Diamante' ? 'flex' : 'none';
            });
            // Mostrar si ya es un diamante
            if (item?.stone_type === 'Diamante') {
                diamondSpecsRow.style.display = 'flex';
            }
        }
        
        // Actualizar preview del metal cuando cambian Material + Pureza
        const materialSelect = document.getElementById('inv-material');
        const puritySelect = document.getElementById('inv-purity');
        const metalPreview = document.getElementById('metal-preview');
        if (materialSelect && puritySelect && metalPreview) {
            const updateMetalPreview = () => {
                const material = materialSelect.value || '';
                const purity = puritySelect.value || '';
                let previewText = 'Se generará automáticamente desde Material + Pureza';
                
                if (material && purity) {
                    if (material === 'Oro' && purity) {
                        previewText = `${material} ${purity}`;
                    } else if (material === 'Plata' && purity === '.925') {
                        previewText = 'Plata 925';
                    } else if (material === 'Plata' && purity === '.999') {
                        previewText = 'Plata Sterling';
                    } else {
                        previewText = material;
                    }
                } else if (material) {
                    previewText = material;
                }
                
                metalPreview.textContent = previewText;
            };
            
            materialSelect.addEventListener('change', updateMetalPreview);
            puritySelect.addEventListener('change', updateMetalPreview);
            updateMetalPreview(); // Actualizar inicial
        }
        
        // Calcular margen automáticamente cuando cambian precio o costo
        const costInput = document.getElementById('inv-cost');
        const salePriceInput = document.getElementById('inv-sale-price');
        const marginDisplay = document.getElementById('inv-margin-display');
        if (costInput && salePriceInput && marginDisplay) {
            const updateMargin = () => {
                const cost = parseFloat(costInput.value) || 0;
                const salePrice = parseFloat(salePriceInput.value) || 0;
                if (cost > 0 && salePrice > 0) {
                    const margin = ((salePrice - cost) / cost) * 100;
                    marginDisplay.textContent = `${margin.toFixed(2)}%`;
                    marginDisplay.style.color = margin > 0 ? 'var(--color-success)' : 'var(--color-danger)';
                } else {
                    marginDisplay.textContent = 'N/A';
                    marginDisplay.style.color = 'var(--color-text-secondary)';
                }
            };
            costInput.addEventListener('input', updateMargin);
            salePriceInput.addEventListener('input', updateMargin);
            updateMargin(); // Calcular inicial
        }

        // Photo preview
        document.getElementById('inv-photos')?.addEventListener('change', (e) => {
            this.previewPhotos(e.target.files);
        });
        
        // Auto-generar código de barras cuando se escribe el SKU (si no hay código existente)
        const skuInput = document.getElementById('inv-sku');
        const barcodeInput = document.getElementById('inv-barcode');
        if (skuInput && barcodeInput && !item?.barcode) {
            skuInput.addEventListener('blur', () => {
                const sku = skuInput.value.trim();
                const barcode = barcodeInput.value.trim();
                if (sku && !barcode) {
                    // Auto-generar si hay SKU pero no hay código de barras
                    barcodeInput.value = sku;
                    barcodeInput.dispatchEvent(new Event('input'));
                }
            });
        }
        
        // Mostrar preview del código de barras si existe
        if (item?.barcode && typeof JsBarcode !== 'undefined') {
            const previewContainer = document.getElementById('barcode-preview-container');
            if (previewContainer) {
                previewContainer.style.display = 'block';
                setTimeout(() => {
                    try {
                        this.generateBarcodePreview(item.barcode, 'barcode-preview-svg');
                    } catch (e) {
                        console.log('No se pudo generar preview:', e);
                    }
                }, 100);
            }
        }
        
        // Actualizar preview cuando cambia el código de barras
        if (barcodeInput) {
            barcodeInput.addEventListener('input', () => {
                const barcode = barcodeInput.value.trim();
                const previewContainer = document.getElementById('barcode-preview-container');
                if (barcode && previewContainer && typeof JsBarcode !== 'undefined') {
                    previewContainer.style.display = 'block';
                    setTimeout(() => {
                        try {
                            this.generateBarcodePreview(barcode, 'barcode-preview-svg');
                        } catch (e) {
                            console.log('No se pudo actualizar preview:', e);
                        }
                    }, 100);
                } else if (previewContainer) {
                    previewContainer.style.display = 'none';
                }
            });
        }
        
        // Cargar dropdown de proveedores
        await this.loadSupplierDropdown(item?.supplier_id);
    },

    // Cargar dropdown de proveedores
    async loadSupplierDropdown(selectedSupplierId = null) {
        const supplierSelect = document.getElementById('inv-supplier');
        if (!supplierSelect) return;
        
        try {
            // CACHE-FIRST: leer proveedores de IndexedDB primero
            let suppliers = await DB.getAll('suppliers') || [];
            if (suppliers.length === 0 && typeof API !== 'undefined' && API.baseURL && API.getSuppliers) {
                suppliers = await API.getSuppliers() || [];
                for (const s of suppliers) { try { await DB.put('suppliers', s); } catch (e) {} }
            }
            suppliers = suppliers.filter(s => s && (s.status === 'active' || !s.status));
            
            // Limpiar y llenar dropdown
            supplierSelect.innerHTML = '<option value="">Seleccionar proveedor...</option>';
            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = `${supplier.code || ''} - ${supplier.name || 'Sin nombre'}`.trim();
                if (selectedSupplierId && supplier.id === selectedSupplierId) {
                    option.selected = true;
                }
                supplierSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando proveedores:', error);
        }
    },

    // Cargar dropdown de proveedores para filtro de inventario
    async loadSupplierFilterDropdown() {
        const supplierFilter = document.getElementById('inventory-supplier-filter');
        if (!supplierFilter) return;

        try {
            let suppliers = await DB.getAll('suppliers') || [];
            if (suppliers.length === 0 && typeof API !== 'undefined' && API.baseURL && API.getSuppliers) {
                suppliers = await API.getSuppliers() || [];
                for (const s of suppliers) { try { await DB.put('suppliers', s); } catch (e) {} }
            }
            suppliers = suppliers.filter(s => s && (s.status === 'active' || !s.status));

            const currentValue = supplierFilter.value;
            supplierFilter.innerHTML = '<option value="">Todos los proveedores</option>';
            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = `${supplier.code || ''} - ${supplier.name || 'Sin nombre'}`.trim();
                supplierFilter.appendChild(option);
            });

            if (currentValue && suppliers.some(s => String(s.id) === String(currentValue))) {
                supplierFilter.value = currentValue;
            }
        } catch (error) {
            console.error('Error cargando proveedores para filtro de inventario:', error);
        }
    },

    // Función para cambiar de pestaña
    switchTab(tabName) {
        // Ocultar todas las pestañas
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });
        
        // Remover clase active de todos los botones (tanto .tab-btn como .tab-btn-vertical)
        document.querySelectorAll('.tab-btn, .tab-btn-vertical').forEach(btn => {
            btn.classList.remove('active');
            if (btn.classList.contains('tab-btn-vertical')) {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--color-text)';
                btn.style.fontWeight = 'normal';
            }
        });
        
        // Mostrar la pestaña seleccionada
        const selectedTab = document.getElementById(`tab-${tabName}`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            selectedTab.style.display = 'block';
        }
        
        // Agregar clase active al botón correspondiente
        const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('active');
            if (selectedBtn.classList.contains('tab-btn-vertical')) {
                selectedBtn.style.background = 'var(--color-primary)';
                selectedBtn.style.color = 'white';
                selectedBtn.style.fontWeight = '600';
            }
        }
    },

    // Inicializar sistema de pestañas
    initializeTabs() {
        // Agregar event listeners a todos los botones de pestaña (tanto .tab-btn como .tab-btn-vertical)
        document.querySelectorAll('.tab-btn, .tab-btn-vertical').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabName = btn.getAttribute('data-tab');
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
    },

    previewPhotos(files) {
        const preview = document.getElementById('inv-photos-preview');
        if (!preview) return;

        preview.innerHTML = '';
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = '100%';
                img.style.borderRadius = '4px';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    },

    // Generar preview de código de barras (solo visualización, independiente de BarcodeManager)
    generateBarcodePreview(barcode, svgId) {
        if (!barcode || typeof JsBarcode === 'undefined') {
            return;
        }
        
        try {
            const svgElement = document.getElementById(svgId);
            if (!svgElement) {
                console.warn(`Elemento SVG no encontrado: ${svgId}`);
                return;
            }
            
            // Limpiar SVG anterior
            svgElement.innerHTML = '';
            
            // Generar código de barras usando JsBarcode directamente
            // Configurado para ser más corto horizontalmente y más alto verticalmente
            JsBarcode(svgElement, barcode, {
                format: "CODE128",
                width: 1.8,        // Reducido para hacer el código más corto horizontalmente
                height: 200,       // Aumentado significativamente para hacerlo más alto (mejor para escáner)
                displayValue: true,
                fontSize: 14,       // Tamaño de fuente legible
                margin: 10,
                marginTop: 10,
                marginBottom: 10,
                marginLeft: 10,
                marginRight: 10
            });
        } catch (e) {
            console.error('Error generando preview de código de barras:', e);
        }
    },

    async generateBarcode() {
        const skuInput = document.getElementById('inv-sku');
        const barcodeInput = document.getElementById('inv-barcode');
        
        if (!barcodeInput) {
            Utils.showNotification('Error: Campo de código de barras no encontrado', 'error');
            return;
        }
        
        // Generar código de barras: usar SKU si existe, sino generar código único
        let barcode = '';
        if (skuInput && skuInput.value.trim()) {
            barcode = skuInput.value.trim();
        } else {
            // Generar código único automáticamente
            const timestamp = Date.now().toString(36).toUpperCase();
            const random = Math.random().toString(36).substring(2, 8).toUpperCase();
            barcode = `ITEM${timestamp}${random}`.substring(0, 20); // Máximo 20 caracteres
        }
        
        barcodeInput.value = barcode;
        Utils.showNotification('Código de barras generado', 'success');
    },

    // Generar SKU automáticamente
    async generateSKU() {
        const skuInput = document.getElementById('inv-sku');
        
        if (!skuInput) {
            Utils.showNotification('Error: Campo de SKU no encontrado', 'error');
            return;
        }

        // Si ya hay un SKU, no generar uno nuevo (solo si está editando)
        if (skuInput.value.trim()) {
            const confirmed = await Utils.confirm(
                '¿Generar nuevo SKU?',
                'Ya existe un SKU. ¿Deseas generar uno nuevo?'
            );
            if (!confirmed) return;
        }

        try {
            // Obtener sucursal actual para generar SKU único por sucursal
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : null;
            
            // Obtener código de la sucursal
            let branchCode = '';
            if (currentBranchId) {
                try {
                    const branch = await DB.get('catalog_branches', currentBranchId);
                    if (branch && branch.code) {
                        branchCode = branch.code.toUpperCase().substring(0, 3); // Primeras 3 letras del código
                    } else if (branch && branch.name) {
                        // Si no tiene código, generar uno desde el nombre
                        branchCode = branch.name.toUpperCase()
                            .replace(/[^A-Z]/g, '')
                            .substring(0, 3)
                            .padEnd(3, 'X'); // Asegurar 3 caracteres
                    }
                } catch (e) {
                    console.warn('No se pudo obtener código de sucursal:', e);
                }
            }
            
            // Si no hay código de sucursal, usar prefijo genérico (compatibilidad con items existentes)
            const skuPrefix = branchCode ? `${branchCode}-JOY-` : 'JOY-';
            const skuPattern = branchCode 
                ? new RegExp(`^${branchCode}-JOY-(\\d+)$`, 'i')
                : /^JOY-(\d+)$/i;
            
            // Obtener items de la sucursal actual (o todos si no hay sucursal)
            let allItems = [];
            if (currentBranchId) {
                // Filtrar por sucursal para generar SKU único por sucursal
                const allItemsRaw = await DB.getAll('inventory_items', null, null, { 
                    filterByBranch: true, 
                    branchIdField: 'branch_id' 
                }) || [];
                
                // Filtrado estricto por sucursal
                const normalizedBranchId = String(currentBranchId);
                allItems = allItemsRaw.filter(item => {
                    if (!item.branch_id) return false;
                    return String(item.branch_id) === normalizedBranchId;
                });
            } else {
                // Si no hay sucursal, buscar todos los items con el mismo prefijo
                const allItemsRaw = await DB.getAll('inventory_items') || [];
                allItems = allItemsRaw.filter(item => {
                    if (!item.sku) return false;
                    return item.sku.match(skuPattern);
                });
            }
            
            // Buscar el último SKU numérico con el prefijo de la sucursal
            let lastNumber = 0;
            
            allItems.forEach(item => {
                if (item.sku) {
                    const match = item.sku.match(skuPattern);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > lastNumber) {
                            lastNumber = num;
                        }
                    }
                }
            });

            // Generar nuevo SKU (único globalmente con prefijo de sucursal)
            const newNumber = lastNumber + 1;
            const newSKU = `${skuPrefix}${String(newNumber).padStart(3, '0')}`;
            
            // Verificar que no exista globalmente (importante para evitar duplicados)
            const allItemsGlobal = await DB.getAll('inventory_items') || [];
            const exists = allItemsGlobal.some(item => item.sku === newSKU);
            
            if (exists) {
                // Si existe, buscar el siguiente disponible
                let nextNumber = newNumber + 1;
                while (allItemsGlobal.some(item => item.sku === `${skuPrefix}${String(nextNumber).padStart(3, '0')}`)) {
                    nextNumber++;
                }
                skuInput.value = `${skuPrefix}${String(nextNumber).padStart(3, '0')}`;
            } else {
                skuInput.value = newSKU;
            }

            // Auto-generar código de barras si está vacío
            const barcodeInput = document.getElementById('inv-barcode');
            if (barcodeInput && !barcodeInput.value.trim()) {
                barcodeInput.value = skuInput.value;
            }

            Utils.showNotification(`SKU generado: ${skuInput.value}`, 'success');
        } catch (error) {
            console.error('Error generando SKU:', error);
            // Fallback: generar SKU con timestamp si hay error
            const timestamp = Date.now().toString(36).toUpperCase().substring(0, 6);
            skuInput.value = `JOY-${timestamp}`;
            Utils.showNotification('SKU generado (formato alternativo)', 'info');
        }
    },

    async saveItem(itemId) {
        try {
            const form = document.getElementById('inventory-form');
            if (!form) {
                console.error('❌ Formulario no encontrado');
                Utils.showNotification('Error: Formulario no encontrado', 'error');
                return;
            }
            
            // Validar formulario
            if (!form.checkValidity()) {
                console.warn('⚠️ Formulario inválido, mostrando errores de validación');
                // Si el primer campo inválido está en una pestaña oculta, mostrar esa pestaña para que el usuario lo vea
                const controls = form.querySelectorAll('input, select, textarea');
                let invalidEl = null;
                for (const el of controls) {
                    if (el.required && !el.validity.valid) {
                        invalidEl = el;
                        break;
                    }
                }
                if (invalidEl) {
                    const tabContent = invalidEl.closest('.tab-content');
                    if (tabContent && tabContent.id && tabContent.style.display === 'none') {
                        const tabName = tabContent.id.replace('tab-', '');
                        this.switchTab(tabName);
                    }
                    setTimeout(() => {
                        invalidEl.focus();
                        form.reportValidity();
                    }, 80);
                } else {
                    form.reportValidity();
                }
                return;
            }
            
            console.log(`💾 Guardando pieza ${itemId ? '(edición)' : '(nueva)'}...`);

        const rawBranchId = typeof BranchManager !== 'undefined'
            ? BranchManager.getCurrentBranchId()
            : (localStorage.getItem('current_branch_id') || null);

        const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
        // Solo enviar branch_id al servidor si es UUID. Si no, dejarlo null para que el backend lo maneje.
        // PERO para IndexedDB local, siempre usar el branch_id del usuario actual si está disponible
        const branchId = isUUID(rawBranchId) ? rawBranchId : null;
        // Para guardar en IndexedDB, usar el branch_id del usuario actual si no hay UUID válido
        const localBranchId = isUUID(rawBranchId) ? rawBranchId : (rawBranchId || null);

        const formBarcode = document.getElementById('inv-barcode').value.trim();
        const formSku = document.getElementById('inv-sku').value.trim();
        
        // Guardar formSku original para comparaciones posteriores
        const originalFormSku = formSku;
        // SKU final a usar (puede cambiar si detectamos duplicado de barcode/SKU)
        let finalSku = formSku || formBarcode;
        
        // Generar código de barras automáticamente si no existe
        let finalBarcode = formBarcode;
        if (!finalBarcode) {
            if (formSku) {
                // Usar SKU si está disponible
                finalBarcode = formSku;
            } else {
                // Generar código único automáticamente
                const timestamp = Date.now().toString(36).toUpperCase();
                const random = Math.random().toString(36).substring(2, 8).toUpperCase();
                finalBarcode = `ITEM${timestamp}${random}`.substring(0, 20);
            }
        }
        
        // VALIDAR CÓDIGO DE BARRAS DUPLICADO EN INDEXEDDB
        // Verificar si ya existe un item con este código de barras (excepto el item actual si es edición)
        if (finalBarcode) {
            try {
                const existingBarcodeItems = await DB.query('inventory_items', 'barcode', finalBarcode);
                const duplicateItem = existingBarcodeItems.find(item => item.id !== itemId);
                
                if (duplicateItem) {
                    Utils.showNotification('El código de barras ya existe. Cambia el valor y vuelve a guardar.', 'error', 6000);
                    const barcodeInput = document.getElementById('inv-barcode');
                    if (barcodeInput) barcodeInput.focus();
                    return;
                }
            } catch (queryError) {
                // Si hay error al consultar, continuar (puede ser que el índice no exista aún)
                console.warn('⚠️ Error verificando código de barras duplicado:', queryError);
            }
        }
        
        // VALIDAR SKU DUPLICADO (backend e IndexedDB exigen SKU único)
        if (finalSku && !itemId) {
            try {
                const existingSkuItems = await DB.query('inventory_items', 'sku', finalSku);
                if (existingSkuItems && existingSkuItems.length > 0) {
                    Utils.showNotification('El SKU ya existe. Cambia el SKU y vuelve a guardar.', 'error', 6000);
                    const skuInput = document.getElementById('inv-sku');
                    if (skuInput) skuInput.focus();
                    return;
                }
            } catch (queryError) {
                console.warn('⚠️ Error verificando SKU duplicado:', queryError);
            }
        }
        
        // Obtener valores de stock
        const stockActual = parseInt(document.getElementById('inv-stock-actual')?.value) || 1;
        const stockMin = parseInt(document.getElementById('inv-stock-min')?.value) || 1;
        const stockMax = parseInt(document.getElementById('inv-stock-max')?.value) || 10;
        
        // Validación de stock
        if (stockMin > stockMax) {
            Utils.showNotification('El stock mínimo no puede ser mayor al máximo', 'error');
            return;
        }
        
        const existingItem = itemId ? await DB.get('inventory_items', itemId) : null;
        
        // IMPORTANTE: generar UUID si está disponible para evitar que el servidor genere otro id y se creen “fantasmas”
        const newId = (!itemId && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : (itemId || Utils.generateId());

        // Obtener todos los valores del formulario
        const nameValue = document.getElementById('inv-name').value;
        const notesValue = document.getElementById('inv-notes')?.value || '';
        
        // Obtener medidas específicas
        const measurements = {
            ring_size: document.getElementById('inv-ring-size')?.value ? parseFloat(document.getElementById('inv-ring-size').value) : null,
            chain_length: document.getElementById('inv-chain-length')?.value ? parseFloat(document.getElementById('inv-chain-length').value) : null,
            bracelet_length: document.getElementById('inv-bracelet-length')?.value ? parseFloat(document.getElementById('inv-bracelet-length').value) : null,
            earring_type: document.getElementById('inv-earring-type')?.value || null,
            width: document.getElementById('inv-width')?.value ? parseFloat(document.getElementById('inv-width').value) : null,
            thickness: document.getElementById('inv-thickness')?.value ? parseFloat(document.getElementById('inv-thickness').value) : null
        };
        
        // Calcular margen automáticamente
        const cost = parseFloat(document.getElementById('inv-cost').value);
        const salePrice = parseFloat(document.getElementById('inv-sale-price')?.value || 0) || null;
        const marginPercent = (cost > 0 && salePrice && salePrice > 0) ? ((salePrice - cost) / cost) * 100 : null;
        
        let item = {
            id: itemId || newId,
            sku: finalSku,
            barcode: finalBarcode,
            name: nameValue,
            // Campos requeridos por el backend
            description: document.getElementById('inv-description')?.value || notesValue || nameValue,
            category: document.getElementById('inv-category')?.value || '',
            subcategory: document.getElementById('inv-subcategory')?.value || '',
            collection: document.getElementById('inv-collection')?.value || '',
            material: document.getElementById('inv-material')?.value || null,
            // Auto-generar metal desde material + purity
            metal: (() => {
                const material = document.getElementById('inv-material')?.value || '';
                const purity = document.getElementById('inv-purity')?.value || '';
                if (material && purity) {
                    if (material === 'Oro' && purity) {
                        return `${material} ${purity}`;
                    } else if (material === 'Plata' && purity === '.925') {
                        return 'Plata 925';
                    } else if (material === 'Plata' && purity === '.999') {
                        return 'Plata Sterling';
                    } else {
                        return material; // Si no hay pureza específica, usar solo material
                    }
                } else if (material) {
                    return material; // Solo material si no hay pureza
                }
                return null;
            })(),
            purity: document.getElementById('inv-purity')?.value || null,
            plating: document.getElementById('inv-plating')?.value || null,
            style: document.getElementById('inv-style')?.value || null,
            finish_type: document.getElementById('inv-finish-type')?.value || null,
            theme: document.getElementById('inv-theme')?.value || null,
            stone_type: document.getElementById('inv-stone-type')?.value || '',
            stone_weight: parseFloat(document.getElementById('inv-total-carats')?.value || 0), // Backend espera stone_weight
            weight: parseFloat(document.getElementById('inv-weight').value) || 0, // Backend espera 'weight', no 'weight_g'
            measurements: measurements, // Guardar como JSONB
            price: parseFloat(document.getElementById('inv-price')?.value || 0) || null, // Precio sugerido (puede estar vacío)
            sale_price: salePrice, // Precio de venta (editable)
            cost: cost,
            discount: document.getElementById('inv-discount')?.value ? parseFloat(document.getElementById('inv-discount').value) : null,
            discount_amount: document.getElementById('inv-discount-amount')?.value ? parseFloat(document.getElementById('inv-discount-amount').value) : null,
            currency: document.getElementById('inv-currency')?.value || 'MXN',
            margin_percent: marginPercent,
            stock_actual: stockActual,
            stock_min: stockMin,
            stock_max: stockMax,
            status: document.getElementById('inv-status').value,
            condition: document.getElementById('inv-condition')?.value || null,
            location_detail: document.getElementById('inv-location-detail')?.value || null,
            certificate_number: document.getElementById('inv-certificate-number')?.value || '',
            supplier_id: document.getElementById('inv-supplier')?.value || null,
            // IMPORTANTE: branch_id debe ser UUID para Postgres. Si no lo es, lo dejamos null.
            // Para IndexedDB local, usar localBranchId para que el item sea visible después de guardar
            branch_id: branchId, // Para API (puede ser null, el backend lo asignará)
            // Campos adicionales para compatibilidad local (se guardan en IndexedDB)
            stone: document.getElementById('inv-stone')?.value || '',
            carats: parseFloat(document.getElementById('inv-carats')?.value || 0),
            total_carats: parseFloat(document.getElementById('inv-total-carats')?.value || 0),
            color: document.getElementById('inv-color')?.value || '',
            clarity: document.getElementById('inv-clarity')?.value || '',
            cut: document.getElementById('inv-cut')?.value || '',
            size: document.getElementById('inv-measures')?.value || document.getElementById('inv-ring-size')?.value || '',
            weight_g: parseFloat(document.getElementById('inv-weight')?.value || 0), // Mantener para compatibilidad local
            measures: document.getElementById('inv-measures')?.value || '',
            suggested_price: parseFloat(document.getElementById('inv-price')?.value || 0) || null, // Mantener compatibilidad
            origin_country: document.getElementById('inv-origin-country')?.value || null,
            year: parseInt(document.getElementById('inv-year')?.value || 0) || null,
            location: document.getElementById('inv-location')?.value || document.getElementById('inv-location-detail')?.value || null, // Ubicación detallada o general
            tags: document.getElementById('inv-tags')?.value || '',
            notes: notesValue,
            certificate_type: document.getElementById('inv-certificate-type')?.value || '',
            created_at: existingItem?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Registrar cambio de stock si es edición y cambió
        if (itemId && existingItem && existingItem.stock_actual !== stockActual) {
            const logId = Utils.generateId();
            await DB.add('inventory_logs', {
                id: logId,
                item_id: item.id,
                action: stockActual > (existingItem.stock_actual || 0) ? 'entrada' : 'salida',
                quantity: Math.abs(stockActual - (existingItem.stock_actual || 0)),
                stock_before: existingItem.stock_actual || 0,
                stock_after: stockActual,
                reason: 'edicion',
                notes: `Stock modificado durante edición de ${existingItem.stock_actual || 0} a ${stockActual}`,
                created_at: new Date().toISOString()
            });
            
            // Agregar a cola de sincronización
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('inventory_log', logId);
                } catch (syncError) {
                    console.error('Error agregando inventory_log a cola:', syncError);
                }
            }
        }

        // Guardar certificado si existe
        if (item.certificate_type && item.certificate_number) {
            const existingCert = itemId ? await DB.query('inventory_certificates', 'item_id', itemId).then(certs => certs[0]) : null;
            const certificate = {
                id: existingCert?.id || Utils.generateId(),
                item_id: item.id,
                certificate_type: item.certificate_type,
                certificate_number: item.certificate_number,
                created_at: existingCert?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (existingCert) {
                await DB.put('inventory_certificates', certificate);
            } else {
                await DB.add('inventory_certificates', certificate);
            }
        }

        // Guardar historial de precio si cambió
        // ⚠️ IMPORTANTE: NO crear costos automáticamente en cost_entries cuando se crea o actualiza un item de inventario.
        // El campo "cost" del inventario es solo para referencia del costo de adquisición del producto,
        // NO debe registrarse automáticamente como un costo operativo en el módulo de costos.
        // Los costos operativos deben registrarse MANUALMENTE en el módulo de Costos.
        // NO llamar a: Costs.registerCost(), API.createCost(), DB.add('cost_entries', ...), etc.
        // Solo guardar historial de precios en inventory_price_history para referencia.
        if (itemId) {
            const oldItem = await DB.get('inventory_items', itemId);
            if (oldItem && oldItem.cost !== item.cost) {
                await DB.add('inventory_price_history', {
                    id: Utils.generateId(),
                    item_id: item.id,
                    old_price: oldItem.cost,
                    new_price: item.cost,
                    date: new Date().toISOString(),
                    notes: 'Actualización de costo'
                });
                // ⚠️ NO crear costo en cost_entries aquí - solo historial de precios
            }
        }

        // Si hay supplier_id, obtener datos del proveedor para llenar supplier y supplier_code
        if (item.supplier_id) {
            try {
                const supplier = await DB.get('suppliers', item.supplier_id);
                if (supplier) {
                    item.supplier = supplier.name || null;
                    item.supplier_code = supplier.code || null;
                }
            } catch (e) {
                console.warn('Error obteniendo proveedor:', e);
            }
        }
        
        let savedWithAPI = false;
        let mergedItem = null;
        // Intentar guardar con API si está disponible
        if (typeof API !== 'undefined' && API.baseURL && API.token) {
            try {
                // Sanitizar antes de mandar al servidor (evitar branch_id inválido)
                if (item.branch_id && !isUUID(item.branch_id)) {
                    delete item.branch_id;
                }
                if (itemId) {
                    // Actualizar item existente
                    console.log('Actualizando item con API...');
                    item = await API.updateInventoryItem(itemId, item);
                    console.log('✅ Item actualizado con API');
                } else {
                    // Crear nuevo item
                    console.log('Creando item con API...');
                    item = await API.createInventoryItem(item);
                    console.log('✅ Item creado con API');
                }

                savedWithAPI = true;
                
                // Merge: combinar datos del backend con campos adicionales locales
                // El backend solo devuelve campos del esquema, pero necesitamos preservar campos adicionales
                mergedItem = {
                    ...item, // Datos del backend (campos del esquema)
                    // Preservar campos adicionales que no están en el backend
                    stone: document.getElementById('inv-stone')?.value || item.stone || '',
                    carats: parseFloat(document.getElementById('inv-carats')?.value || 0) || item.carats || 0,
                    total_carats: parseFloat(document.getElementById('inv-total-carats')?.value || 0) || item.total_carats || 0,
                    color: document.getElementById('inv-color')?.value || item.color || '',
                    clarity: document.getElementById('inv-clarity')?.value || item.clarity || '',
                    cut: document.getElementById('inv-cut')?.value || item.cut || '',
                    size: document.getElementById('inv-size')?.value || item.size || '',
                    weight_g: parseFloat(document.getElementById('inv-weight').value) || 0,
                    measures: document.getElementById('inv-measures')?.value || item.measures || '',
                    suggested_price: parseFloat(document.getElementById('inv-suggested-price')?.value || 0) || item.suggested_price || 0,
                    collection: document.getElementById('inv-collection')?.value || item.collection || '',
                    supplier_id: item.supplier_id || null,
                    supplier: item.supplier || null,
                    supplier_code: item.supplier_code || null,
                    origin_country: document.getElementById('inv-origin-country')?.value || item.origin_country || '',
                    year: parseInt(document.getElementById('inv-year')?.value || 0) || item.year || null,
                    location: document.getElementById('inv-location')?.value || item.location || '',
                    tags: document.getElementById('inv-tags')?.value || item.tags || '',
                    notes: document.getElementById('inv-notes')?.value || item.notes || '',
                    certificate_type: document.getElementById('inv-certificate-type')?.value || item.certificate_type || ''
                };
                
                // Guardar en IndexedDB como caché (con todos los campos)
                // Nota: NO auto-inyectar branch_id local (branch1/branch2...) porque el backend espera UUID
                try {
                    await DB.put('inventory_items', mergedItem, { autoBranchId: false });
                } catch (dbError) {
                    const isBarcodeConstraint = dbError.message && (dbError.message.includes('BARCODE') && dbError.message.includes('UNIQUENESS'));
                    const isSkuConstraint = dbError.message && (dbError.message.includes("index 'sku'") || (dbError.message.includes('sku') && dbError.message.includes('uniqueness')));
                    const isConstraintError = dbError.name === 'ConstraintError';
                    if (isBarcodeConstraint || isSkuConstraint || isConstraintError) {
                        console.warn('⚠️ SKU/barcode duplicado en IndexedDB, intentando actualizar item existente...');
                        let existingItem = mergedItem.barcode ? await DB.query('inventory_items', 'barcode', mergedItem.barcode).then(items => items[0]) : null;
                        if (!existingItem && mergedItem.sku) {
                            existingItem = await DB.query('inventory_items', 'sku', mergedItem.sku).then(items => items[0]);
                        }
                        if (existingItem) {
                            // Actualizar el item existente con los nuevos datos
                            mergedItem.id = existingItem.id;
                            await DB.put('inventory_items', mergedItem, { autoBranchId: false });
                            item = mergedItem;
                            console.log('✅ Item actualizado en IndexedDB (código de barras existente)');
                        } else {
                            // No generar ITEM... para evitar duplicados; el item ya está en el servidor
                            console.warn('⚠️ No se pudo cachear en IndexedDB (SKU/barcode duplicado). Se actualizará en la próxima carga.');
                        }
                    } else {
                        // Para otros errores, solo loguear pero no fallar (el item ya está en el servidor)
                        console.warn('⚠️ Error guardando en IndexedDB (pero ya está en servidor):', dbError);
                    }
                }
            } catch (apiError) {
                console.error('Error guardando item con API:', apiError);
                
                // Detectar error de SKU duplicado
                // api.js estructura errores con: err.status, err.details, err.message
                const isDuplicateError = (
                    apiError.status === 400 && (
                        (apiError.message && (
                            apiError.message.includes('SKU') || 
                            apiError.message.includes('ya existe') ||
                            apiError.message.includes('duplicate') ||
                            apiError.message.includes('El SKU')
                        )) ||
                        (apiError.details && (
                            apiError.details.error && (
                                apiError.details.error.includes('SKU') ||
                                apiError.details.error.includes('ya existe')
                            ) ||
                            apiError.details.code === 'DUPLICATE_SKU'
                        ))
                    )
                );
                
                // Si es error de SKU duplicado, intentar agregar prefijo de sucursal automáticamente
                if (isDuplicateError) {
                    console.log('🔄 SKU duplicado detectado, intentando agregar prefijo de sucursal...');
                    
                    // Obtener código de sucursal
                    let branchCode = '';
                    if (branchId) {
                        try {
                            const branch = await DB.get('catalog_branches', branchId);
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
                    
                    // Si el SKU no tiene prefijo de sucursal, agregarlo
                    if (branchCode && item.sku && !item.sku.includes('-JOY-')) {
                        const skuMatch = item.sku.match(/JOY-?(\d+)/i);
                        if (skuMatch) {
                            const number = skuMatch[1].padStart(3, '0');
                            item.sku = `${branchCode}-JOY-${number}`;
                            // Actualizar barcode solo si era igual al SKU original
                            if (item.barcode === originalFormSku || item.barcode === formSku) {
                                item.barcode = item.sku;
                            }
                            
                            console.log(`✅ SKU actualizado con prefijo: ${item.sku}`);
                            
                            // Reintentar guardar con el nuevo SKU
                            try {
                                if (itemId) {
                                    item = await API.updateInventoryItem(itemId, item);
                                } else {
                                    item = await API.createInventoryItem(item);
                                }
                                savedWithAPI = true;
                                await DB.put('inventory_items', item, { autoBranchId: false });
                                Utils.showNotification(`SKU actualizado automáticamente: ${item.sku}`, 'info');
                            } catch (retryError) {
                                console.error('Error en reintento con prefijo:', retryError);
                                // Continuar con fallback local
                            }
                        }
                    }
                }
                
                // Si aún no se guardó, usar modo local como fallback
                if (!savedWithAPI) {
                    // Si API falló por duplicado, no crear registro local con SKU auto-generado
                    if (isDuplicateError) {
                        Utils.showNotification('El SKU o código de barras ya existe. Cambia el SKU y vuelve a guardar.', 'error', 6000);
                        const skuInput = document.getElementById('inv-sku');
                        if (skuInput) skuInput.focus();
                        return;
                    }
                    console.warn('Usando modo local como fallback (se sincronizará después)');
                    try {
                        // Asegurar que el item tenga branch_id para IndexedDB (usar localBranchId si branchId es null)
                        const itemForLocal = {
                            ...item,
                            branch_id: item.branch_id || localBranchId || rawBranchId || null
                        };
                        // Guardar en IndexedDB con TODOS los campos
                        await DB.put('inventory_items', itemForLocal, { autoBranchId: false });
                        console.log('✅ Item guardado en IndexedDB (modo offline)');
                        // Definir mergedItem para consistencia
                        mergedItem = itemForLocal;
                    } catch (error) {
                        const isBarcodeConstraint = error.message && (error.message.includes('BARCODE') && error.message.includes('UNIQUENESS'));
                        const isSkuConstraint = error.message && (error.message.includes("index 'sku'") || (error.message.includes('sku') && error.message.includes('uniqueness')));
                        const isConstraintError = error.name === 'ConstraintError';
                        if (isBarcodeConstraint || isSkuConstraint || isConstraintError) {
                            Utils.showNotification('El SKU o código de barras ya existe. Cambia el SKU y vuelve a guardar.', 'error', 6000);
                            const skuInput = document.getElementById('inv-sku');
                            if (skuInput) skuInput.focus();
                            return;
                        }
                        throw error;
                    }
                }
            }
        } else {
            // Modo offline: guardar solo en IndexedDB (se sincronizará cuando haya conexión)
            try {
                // Asegurar que el item tenga branch_id para IndexedDB (usar localBranchId si branchId es null)
                const itemForLocal = {
                    ...item,
                    branch_id: item.branch_id || localBranchId || rawBranchId || null
                };
                await DB.put('inventory_items', itemForLocal, { autoBranchId: false });
                console.log('✅ Item guardado en IndexedDB (sin conexión al servidor)');
                // Actualizar item para que tenga el branch_id correcto
                item = itemForLocal;
            } catch (error) {
                const isBarcodeConstraint = error.message && (error.message.includes('BARCODE') && error.message.includes('UNIQUENESS'));
                const isSkuConstraint = error.message && (error.message.includes("index 'sku'") || (error.message.includes('sku') && error.message.includes('uniqueness')));
                const isConstraintError = error.name === 'ConstraintError';
                if (isBarcodeConstraint || isSkuConstraint || isConstraintError) {
                    Utils.showNotification('El SKU o código de barras ya existe. Cambia el valor y vuelve a guardar.', 'error', 6000);
                    const skuInput = document.getElementById('inv-sku');
                    if (skuInput) skuInput.focus();
                    return;
                }
                throw error;
            }
        }

        // Handle photos - Subir a Cloudinary si está disponible
        const photoInput = document.getElementById('inv-photos');
        if (photoInput && photoInput.files.length > 0) {
            const photoUrls = [];
            
            // Intentar subir a Cloudinary si API está disponible
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.uploadImages) {
                try {
                    console.log('Subiendo imágenes a Cloudinary...');
                    const filesArray = Array.from(photoInput.files);
                    const uploadResult = await API.uploadImages(filesArray, 'inventory');
                    
                    // Guardar URLs en el array de photos
                    for (const img of uploadResult.images) {
                        if (!img.error) {
                            photoUrls.push(img.url);
                        }
                    }
                    
                    // Actualizar item con URLs de fotos
                    if (photoUrls.length > 0) {
                        const currentPhotos = item.photos || [];
                        item.photos = [...currentPhotos, ...photoUrls];
                        
                        // Actualizar en servidor si fue creado con API
                        if (typeof API !== 'undefined' && API.baseURL && API.token && API.updateInventoryItem) {
                            try {
                                await API.updateInventoryItem(item.id, { photos: item.photos });
                            } catch (error) {
                                console.warn('Error actualizando fotos en servidor:', error);
                            }
                        }
                        
                        // Actualizar en IndexedDB
                        await DB.put('inventory_items', item);
                    }
                    
                    console.log(`✅ ${photoUrls.length} imágenes subidas a Cloudinary`);
                } catch (apiError) {
                    console.warn('Error subiendo imágenes a Cloudinary, guardando localmente:', apiError);
                    // Fallback: guardar como blob en IndexedDB (modo offline)
                    for (const file of photoInput.files) {
                        const photoBlob = await Utils.loadImageAsBlob(file);
                        const thumbnailBlob = await Utils.createThumbnail(photoBlob);

                        await DB.add('inventory_photos', {
                            id: Utils.generateId(),
                            item_id: item.id,
                            photo_blob: photoBlob,
                            thumbnail_blob: thumbnailBlob,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            } else {
                // Modo offline: guardar como blob en IndexedDB
                for (const file of photoInput.files) {
                    const photoBlob = await Utils.loadImageAsBlob(file);
                    const thumbnailBlob = await Utils.createThumbnail(photoBlob);

                    await DB.add('inventory_photos', {
                        id: Utils.generateId(),
                        item_id: item.id,
                        photo_blob: photoBlob,
                        thumbnail_blob: thumbnailBlob,
                        created_at: new Date().toISOString()
                    });
                }
            }
        }

        // Pasos posteriores al guardado (no deben impedir cerrar modal ni recargar lista)
        try {
            const logId = Utils.generateId();
            await DB.add('inventory_logs', {
                id: logId,
                item_id: item.id,
                action: itemId ? 'actualizada' : 'alta',
                quantity: 1,
                notes: itemId ? 'Pieza actualizada' : 'Nueva pieza',
                created_at: new Date().toISOString()
            });
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('inventory_log', logId);
                } catch (syncError) {
                    console.warn('Error agregando inventory_log a cola:', syncError);
                }
            }

            const itemToSync = savedWithAPI && mergedItem ? mergedItem : item;
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('inventory_item', itemToSync.id);
                } catch (syncError) {
                    console.warn('Error agregando inventory_item a cola:', syncError);
                }
            }

            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('inventory-updated', { item, isNew: !itemId });
            }

            const locationDetail = document.getElementById('inv-location-detail')?.value?.trim();
            if (locationDetail) {
                try {
                    await this.saveLocation(locationDetail);
                } catch (e) {
                    console.warn('Error guardando ubicación:', e);
                }
            }
        } catch (postError) {
            console.warn('Error en pasos posteriores al guardado (la pieza ya se guardó):', postError);
        }

        // Siempre cerrar modal, notificar y recargar lista (la pieza ya está guardada)
        Utils.showNotification(itemId ? 'Pieza actualizada' : 'Pieza agregada', 'success');
        UI.closeModal();
        await new Promise(resolve => setTimeout(resolve, 150));
        const itemToShow = (mergedItem || item);
        if (savedWithAPI && itemToShow?.id) {
            try {
                const toStore = { ...itemToShow, server_id: itemToShow.id, sync_status: 'synced' };
                await DB.put('inventory_items', toStore, { autoBranchId: false });
            } catch (e) { console.warn('Error guardando item en IndexedDB:', e); }
            await this.prependNewItemToUI(itemToShow);
            this.loadInventory({ ensureItemInList: itemToShow });
        } else {
            await this.loadInventory();
        }
    } catch (error) {
        console.error('❌ Error guardando pieza:', error);
        Utils.showNotification(`Error al guardar pieza: ${error.message || 'Error desconocido'}`, 'error');
    }
    },

    async editItem(itemId) {
        UI.closeModal();
        await this.showAddForm(itemId);
    },

    async printJewelryLabel(itemId) {
        if (typeof JewelryLabelEditor === 'undefined' || !JewelryLabelEditor.printJewelryLabel) {
            Utils.showNotification('Error: módulo de etiquetas no disponible. Recarga la app.', 'error');
            return;
        }

        // Verificar si hay plantilla configurada
        const hasTemplate = await JewelryLabelEditor.hasTemplate();
        if (!hasTemplate) {
            // Si no hay plantilla, mostrar mensaje y redirigir a Settings
            Utils.showNotification('⚠️ Primero configura la plantilla en Configuración → Impresión → Etiquetas de Joyas', 'warning', 5000);
            // Opcional: abrir Settings automáticamente
            setTimeout(() => {
                UI.showModule('settings');
                const printingTab = document.querySelector('#settings-tabs .tab-btn[data-tab="printing"]');
                if (printingTab) {
                    printingTab.click();
                }
            }, 1000);
            return;
        }
        // Si ya hay plantilla, imprimir directamente
        await JewelryLabelEditor.printJewelryLabel(itemId);
    },

    // Imprimir etiquetas de items seleccionados
    async printSelectedLabels() {
        if (this.selectedItems.size === 0) {
            Utils.showNotification('No hay items seleccionados', 'warning');
            return;
        }

        if (typeof JewelryLabelEditor === 'undefined' || !JewelryLabelEditor.printJewelryLabel) {
            Utils.showNotification('Error: módulo de etiquetas no disponible. Recarga la app.', 'error');
            return;
        }

        // Verificar si hay plantilla configurada
        const hasTemplate = await JewelryLabelEditor.hasTemplate();
        if (!hasTemplate) {
            Utils.showNotification('⚠️ Primero configura la plantilla en Configuración → Impresión → Etiquetas de Joyas', 'warning', 5000);
            setTimeout(() => {
                UI.showModule('settings');
                const printingTab = document.querySelector('#settings-tabs .tab-btn[data-tab="printing"]');
                if (printingTab) {
                    printingTab.click();
                }
            }, 1000);
            return;
        }

        const count = this.selectedItems.size;
        const confirmed = await Utils.confirm(
            `¿Imprimir ${count} etiqueta${count > 1 ? 's' : ''}?`,
            `Se imprimirán ${count} etiqueta${count > 1 ? 's' : ''} de joyas.`
        );

        if (!confirmed) return;

        // Mostrar progreso
        const progressModal = UI.showModal('Imprimiendo Etiquetas', `
            <div style="padding: 20px; text-align: center;">
                <div style="margin-bottom: 15px;">
                    <div class="spinner" style="margin: 0 auto;"></div>
                </div>
                <p style="color: var(--color-text-secondary); font-size: 14px;">
                    Imprimiendo <span id="print-progress-current">0</span> de <span id="print-progress-total">${count}</span> etiquetas...
                </p>
                <div style="margin-top: 15px; padding: 10px; background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                    <div id="print-progress-item" style="font-size: 12px; color: var(--color-text-secondary);"></div>
                </div>
            </div>
        `, '');

        let printed = 0;
        let failed = 0;
        const itemIds = Array.from(this.selectedItems);

        for (let i = 0; i < itemIds.length; i++) {
            const itemId = itemIds[i];
            try {
                const item = await DB.get('inventory_items', itemId);
                if (item) {
                    // Actualizar progreso
                    const currentEl = document.getElementById('print-progress-current');
                    const itemEl = document.getElementById('print-progress-item');
                    if (currentEl) currentEl.textContent = i + 1;
                    if (itemEl) itemEl.textContent = `Imprimiendo: ${item.name || item.sku || itemId}`;
                    
                    // Imprimir etiqueta
                    await JewelryLabelEditor.printJewelryLabel(itemId);
                    printed++;
                    
                    // Pequeña pausa entre impresiones para evitar sobrecarga
                    await Utils.delay(500);
                } else {
                    failed++;
                    console.warn(`Item ${itemId} no encontrado`);
                }
            } catch (error) {
                failed++;
                console.error(`Error imprimiendo etiqueta para item ${itemId}:`, error);
            }
        }

        UI.closeModal();
        
        if (printed > 0) {
            Utils.showNotification(
                `✅ ${printed} etiqueta${printed > 1 ? 's' : ''} impresa${printed > 1 ? 's' : ''}${failed > 0 ? `, ${failed} fallida${failed > 1 ? 's' : ''}` : ''}`,
                failed > 0 ? 'warning' : 'success',
                5000
            );
        } else {
            Utils.showNotification('❌ No se pudo imprimir ninguna etiqueta', 'error');
        }
    },

    async importCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                
                const preview = [];
                for (let i = 1; i < Math.min(lines.length, 6); i++) {
                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                    const row = {};
                    headers.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                    });
                    preview.push(row);
                }

                const body = `
                    <p>Se encontraron ${lines.length - 1} registros. Vista previa:</p>
                    <div style="max-height: 300px; overflow-y: auto; margin: 10px 0;">
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    ${headers.map(h => `<th>${h}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${preview.map(row => `
                                    <tr>
                                        ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <p><small>Se importarán todos los registros. ¿Continuar?</small></p>
                `;

                const footer = `
                    <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
                    <button class="btn-primary" onclick="window.Inventory.processCSVImport(${JSON.stringify(lines).replace(/"/g, '&quot;')}, ${JSON.stringify(headers).replace(/"/g, '&quot;')})">Importar</button>
                `;

                UI.showModal('Vista Previa de Importación CSV', body, footer, { size: 'xl' });
            } catch (e) {
                console.error('Error reading CSV:', e);
                Utils.showNotification('Error al leer archivo CSV', 'error');
            }
        };
        input.click();
    },

    async processCSVImport(lines, headers) {
        try {
            const branchId = localStorage.getItem('current_branch_id') || 'default';
            let imported = 0;
            let errors = 0;

            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                    const row = {};
                    headers.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                    });

                    // Map CSV columns to inventory fields
                    const csvSku = (row['SKU'] || row['sku'] || Utils.generateId().substring(0, 8)).trim();
                    const csvBarcode = (row['Barcode'] || row['barcode'] || '').trim();
                    const item = {
                        id: Utils.generateId(),
                        sku: csvSku,
                        barcode: csvBarcode || csvSku, // Usar código de barras del CSV, o SKU como fallback
                        name: row['Nombre'] || row['nombre'] || row['Name'] || row['name'] || 'Sin nombre',
                        metal: row['Metal'] || row['metal'] || '',
                        stone: row['Piedra'] || row['piedra'] || row['Stone'] || '',
                        size: row['Talla'] || row['talla'] || row['Size'] || '',
                        weight_g: parseFloat(row['Peso (g)'] || row['Peso'] || row['weight_g'] || 0),
                        measures: row['Medidas'] || row['medidas'] || row['Measures'] || '',
                        cost: parseFloat(row['Costo'] || row['costo'] || row['Cost'] || 0),
                        price: 0, // Precio de venta se asigna manualmente en el POS
                        location: row['Ubicación'] || row['ubicacion'] || row['Location'] || '',
                        status: row['Estado'] || row['estado'] || row['Status'] || 'disponible',
                        branch_id: branchId,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    await DB.put('inventory_items', item);
                    const logId = Utils.generateId();
                    await DB.add('inventory_logs', {
                        id: logId,
                        item_id: item.id,
                        action: 'alta',
                        quantity: 1,
                        notes: 'Importado desde CSV',
                        created_at: new Date().toISOString()
                    });
                    
                    // Agregar a cola de sincronización
                    if (typeof SyncManager !== 'undefined') {
                        try {
                            await SyncManager.addToQueue('inventory_log', logId);
                        } catch (syncError) {
                            console.error('Error agregando inventory_log a cola:', syncError);
                        }
                    }
                    imported++;
                } catch (e) {
                    console.error(`Error importing row ${i}:`, e);
                    errors++;
                }
            }

            // Emitir evento de actualización masiva si se importaron items
            if (imported > 0 && typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('inventory-updated', {
                    item: null, // null indica actualización masiva
                    isNew: true,
                    isBulkUpdate: true,
                    count: imported,
                    reason: 'importacion_csv'
                });
            }
            
            UI.closeModal();
            Utils.showNotification(`Importación completada: ${imported} importados, ${errors} errores`, imported > 0 ? 'success' : 'error');
            this.loadInventory();
        } catch (e) {
            console.error('Error processing CSV import:', e);
            Utils.showNotification('Error al procesar importación', 'error');
        }
    },

    async exportInventory() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            // Obtener filtro de sucursal del dropdown (puede no existir)
            const branchFilterEl = document.getElementById('inventory-branch-filter');
            const branchFilterValue = branchFilterEl?.value;
            
            // Verificar si es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener sucursal actual
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            
            // Determinar qué branch_id usar para el filtro
            let filterBranchId = null;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                filterBranchId = branchFilterValue;
            } else if (!isMasterAdmin) {
                filterBranchId = currentBranchId;
            }
            
            // Cargar items filtrados
            const viewAllBranches = !filterBranchId && isMasterAdmin;
            let items = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Filtro estricto adicional si hay filtro específico
            if (filterBranchId) {
                items = items.filter(i => i.branch_id && String(i.branch_id) === String(filterBranchId));
            }
            
            const exportData = items.map(item => ({
                SKU: item.sku,
                'Código de Barras': item.barcode,
                Nombre: item.name,
                Metal: item.metal,
                'Tipo de Piedra': item.stone_type || '',
                Piedra: item.stone || '',
                'Quilates': item.carats || '',
                'Quilates Totales': item.total_carats || '',
                Color: item.color || '',
                Claridad: item.clarity || '',
                Corte: item.cut || '',
                Talla: item.size || '',
                'Peso (g)': item.weight_g,
                Medidas: item.measures || '',
                Costo: item.cost,
                'Precio Sugerido': item.suggested_price || '',
                // Campos de Stock
                'Stock Actual': item.stock_actual ?? 1,
                'Stock Mínimo': item.stock_min ?? 1,
                'Stock Máximo': item.stock_max ?? 10,
                'Estado Stock': this.getStockStatusText(this.getStockStatus(item)),
                // Resto de campos
                Colección: item.collection || '',
                Proveedor: item.supplier || '',
                'País de Origen': item.origin_country || '',
                Año: item.year || '',
                Ubicación: item.location || '',
                Etiquetas: item.tags || '',
                'Tipo de Certificado': item.certificate_type || '',
                'Número de Certificado': item.certificate_number || '',
                Estado: item.status,
                'Fecha de Creación': Utils.formatDate(item.created_at, 'YYYY-MM-DD'),
                'Última Actualización': Utils.formatDate(item.updated_at, 'YYYY-MM-DD')
            }));

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Inventario');
            if (!format) {
                this.isExporting = false;
                return;
            }
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `inventario_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `inventario_${date}.xlsx`, 'Inventario');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `inventario_${date}.pdf`, 'Inventario', { includeImages: true });
            }

            Utils.showNotification('Inventario exportado', 'success');
        } catch (e) {
            console.error('Error exporting inventory:', e);
            Utils.showNotification('Error al exportar', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },

    highlightItem(itemId) {
        const card = document.querySelector(`[data-item-id="${itemId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.boxShadow = '0 0 0 3px #388e3c';
            setTimeout(() => {
                card.style.boxShadow = '';
            }, 2000);
        }
    },

    getEmptyInventoryMessage() {
        const base = 'No hay piezas en inventario.';
        if (this._lastLoadEmptyFromServer) {
            return `<div style="text-align: center; padding: 40px; max-width: 520px; margin: 0 auto;">
                <p style="margin-bottom: 12px;">${base}</p>
                <p style="font-size: 13px; color: var(--color-text-secondary);">El servidor respondió correctamente pero no tiene registros para esta sucursal. Verifica que la base de datos en Railway tenga datos o ejecuta la migración/restauración.</p>
            </div>`;
        }
        return `<p style="text-align: center; padding: 40px;">${base}</p>`;
    },

    async displayInventoryStats(items) {
        // Items filtrados (vista actual): para Total Piezas, Valor, etc.
        const filteredItems = Array.isArray(items) ? items : [];
        // Items antes del filtro de stock: para pills (Agotados, Stock Bajo, etc.) muestran totales por contexto
        const itemsForPillCounts = Array.isArray(this._itemsBeforeStockFilterForStats)
            ? this._itemsBeforeStockFilterForStats
            : filteredItems;
        
        const stats = {
            total: filteredItems.length,
            filteredCount: filteredItems.length,
            disponible: filteredItems.filter(i => i.status === 'disponible').length,
            vendida: filteredItems.filter(i => i.status === 'vendida').length,
            apartada: filteredItems.filter(i => i.status === 'apartada').length,
            reparacion: filteredItems.filter(i => i.status === 'reparacion').length,
            totalValue: filteredItems.reduce((sum, i) => sum + ((i.cost || 0) * (i.stock_actual || 1)), 0),
            totalStock: filteredItems.reduce((sum, i) => sum + (i.stock_actual || 1), 0),
            withCertificates: filteredItems.filter(i => i.certificate_type && i.certificate_number).length,
            // Pills: conteos globales (antes de filtro stock) para que siempre muestren cuántos hay de cada tipo
            stockOut: itemsForPillCounts.filter(i => this.getStockStatus(i) === 'out').length,
            stockLow: itemsForPillCounts.filter(i => this.getStockStatus(i) === 'low').length,
            stockOver: itemsForPillCounts.filter(i => this.getStockStatus(i) === 'over').length,
            stockOk: itemsForPillCounts.filter(i => this.getStockStatus(i) === 'ok').length
        };
        
        const statsContainer = document.getElementById('inventory-stats');
        if (statsContainer) {
            const currentStockFilter = document.getElementById('inventory-stock-alert-filter')?.value || '';
            const activeCategory = document.querySelector('.inventory-category-bar .inventory-category-chip.active')?.dataset.category ?? '';
            const categoryChipsHTML = [
                `<button type="button" class="inventory-category-chip ${activeCategory === '' || activeCategory === 'all' ? 'active' : ''}" data-category="">Todas</button>`
            ].concat(this.INVENTORY_CATEGORIES.map(cat =>
                `<button type="button" class="inventory-category-chip ${activeCategory === cat ? 'active' : ''}" data-category="${cat.replace(/"/g, '&quot;')}">${cat}</button>`
            )).join('');
            statsContainer.innerHTML = `
                <div class="inventory-stats-grid">
                    <div class="inventory-stat-card">
                        <div class="stat-icon"><i class="fas fa-gem"></i></div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.total}</div>
                            <div class="stat-label">Total Piezas</div>
                        </div>
                    </div>
                    <div class="inventory-stat-card">
                        <div class="stat-icon" style="background: var(--color-success);"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.disponible}</div>
                            <div class="stat-label">Disponibles</div>
                        </div>
                    </div>
                    <div class="inventory-stat-card">
                        <div class="stat-icon" style="background: var(--color-primary);"><i class="fas fa-dollar-sign"></i></div>
                        <div class="stat-content">
                            <div class="stat-value">${Utils.formatCurrency(stats.totalValue)}</div>
                            <div class="stat-label">Valor Total</div>
                        </div>
                    </div>
                    <div class="inventory-stat-card">
                        <div class="stat-icon" style="background: var(--color-info);"><i class="fas fa-cubes"></i></div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.totalStock}</div>
                            <div class="stat-label">Unidades en Stock</div>
                        </div>
                    </div>
                </div>
                
                <!-- Alertas de Stock (pills con delegación; data-value para filtro) -->
                <div class="inventory-alerts-bar">
                    <div class="alert-item ${!currentStockFilter ? 'active' : ''}" data-value="" role="button" tabindex="0" style="cursor: pointer;">
                        <i class="fas fa-th-list"></i>
                        <span>Todos (${itemsForPillCounts.length})</span>
                    </div>
                    <div class="alert-item ${stats.stockOut > 0 ? 'alert-critical' : 'alert-ok'} ${currentStockFilter === 'out' ? 'active' : ''}" data-value="out" role="button" tabindex="0" style="cursor: pointer;">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>${stats.stockOut} Agotado${stats.stockOut !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="alert-item ${stats.stockLow > 0 ? 'alert-warning' : 'alert-ok'} ${currentStockFilter === 'low' ? 'active' : ''}" data-value="low" role="button" tabindex="0" style="cursor: pointer;">
                        <i class="fas fa-arrow-down"></i>
                        <span>${stats.stockLow} Stock Bajo</span>
                    </div>
                    <div class="alert-item ${stats.stockOver > 0 ? 'alert-info' : 'alert-ok'} ${currentStockFilter === 'over' ? 'active' : ''}" data-value="over" role="button" tabindex="0" style="cursor: pointer;">
                        <i class="fas fa-arrow-up"></i>
                        <span>${stats.stockOver} Exceso</span>
                    </div>
                    <div class="alert-item alert-success ${currentStockFilter === 'ok' ? 'active' : ''}" data-value="ok" role="button" tabindex="0" style="cursor: pointer;">
                        <i class="fas fa-check"></i>
                        <span>${stats.stockOk} Normal</span>
                    </div>
                </div>
                
                <!-- Filtro por categoría -->
                <div class="inventory-category-bar">
                    ${categoryChipsHTML}
                </div>
                
            `;
        }
        
        return stats;
    },
    
    // Mostrar resumen completo de alertas de stock
    async showStockAlertsSummary() {
        const items = await DB.getAll('inventory_items') || [];
        
        const outOfStock = items.filter(i => this.getStockStatus(i) === 'out');
        const lowStock = items.filter(i => this.getStockStatus(i) === 'low');
        const overStock = items.filter(i => this.getStockStatus(i) === 'over');
        
        const body = `
            <div style="display: grid; gap: 20px;">
                <!-- Agotados -->
                <div>
                    <h4 style="color: #dc3545; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-exclamation-circle"></i>
                        Productos Agotados (${outOfStock.length})
                    </h4>
                    ${outOfStock.length === 0 ? 
                        '<p style="color: var(--color-text-secondary); font-size: 12px;">No hay productos agotados</p>' :
                        `<div style="max-height: 150px; overflow-y: auto;">
                            ${outOfStock.map(item => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #fff5f5; border-radius: var(--radius-sm); margin-bottom: 4px;">
                                    <div>
                                        <strong style="font-size: 12px;">${item.name}</strong>
                                        <span style="font-size: 10px; color: var(--color-text-secondary);"> (${item.sku})</span>
                                    </div>
                                    <button class="btn-sm btn-secondary" onclick="UI.closeModal(); window.Inventory.showStockModal('${item.id}')">
                                        <i class="fas fa-plus"></i> Reabastecer
                                    </button>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
                
                <!-- Stock Bajo -->
                <div>
                    <h4 style="color: #ffc107; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-arrow-down"></i>
                        Stock Bajo (${lowStock.length})
                    </h4>
                    ${lowStock.length === 0 ? 
                        '<p style="color: var(--color-text-secondary); font-size: 12px;">No hay productos con stock bajo</p>' :
                        `<div style="max-height: 150px; overflow-y: auto;">
                            ${lowStock.map(item => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #fffbeb; border-radius: var(--radius-sm); margin-bottom: 4px;">
                                    <div>
                                        <strong style="font-size: 12px;">${item.name}</strong>
                                        <span style="font-size: 10px; color: var(--color-text-secondary);"> Stock: ${item.stock_actual || 0}/${item.stock_min || 1} mín</span>
                                    </div>
                                    <button class="btn-sm btn-secondary" onclick="UI.closeModal(); window.Inventory.showStockModal('${item.id}')">
                                        <i class="fas fa-cubes"></i> Ajustar
                                    </button>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
                
                <!-- Exceso de Stock -->
                <div>
                    <h4 style="color: #17a2b8; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-arrow-up"></i>
                        Exceso de Stock (${overStock.length})
                    </h4>
                    ${overStock.length === 0 ? 
                        '<p style="color: var(--color-text-secondary); font-size: 12px;">No hay productos con exceso de stock</p>' :
                        `<div style="max-height: 150px; overflow-y: auto;">
                            ${overStock.map(item => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #e8f4f8; border-radius: var(--radius-sm); margin-bottom: 4px;">
                                    <div>
                                        <strong style="font-size: 12px;">${item.name}</strong>
                                        <span style="font-size: 10px; color: var(--color-text-secondary);"> Stock: ${item.stock_actual || 0}/${item.stock_max || 10} máx</span>
                                    </div>
                                    <button class="btn-sm btn-secondary" onclick="UI.closeModal(); window.Inventory.showStockModal('${item.id}')">
                                        <i class="fas fa-cubes"></i> Ajustar
                                    </button>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
            </div>
        `;
        
        const footer = `
            <button class="btn-secondary" onclick="window.Inventory.exportStockAlerts()">
                <i class="fas fa-download"></i> Exportar Alertas
            </button>
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;
        
        UI.showModal('Resumen de Alertas de Stock', body, footer, { size: 'large' });
    },
    
    // Exportar alertas de stock
    async exportStockAlerts() {
        // Prevenir múltiples ejecuciones simultáneas
        if (this.isExporting) {
            console.warn('Exportación ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this.isExporting = true;
        try {
            const items = await DB.getAll('inventory_items') || [];
            const alertItems = items.filter(i => this.getStockStatus(i) !== 'ok');
            
            const exportData = alertItems.map(item => ({
                SKU: item.sku,
                Nombre: item.name,
                'Stock Actual': item.stock_actual ?? 1,
                'Stock Mínimo': item.stock_min ?? 1,
                'Stock Máximo': item.stock_max ?? 10,
                Estado: this.getStockStatusText(this.getStockStatus(item)),
                Ubicación: item.location || 'N/A'
            }));
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            Utils.exportToExcel(exportData, `alertas_stock_${date}.xlsx`, 'Alertas');
            Utils.showNotification('Alertas de stock exportadas', 'success');
        } catch (e) {
            console.error('Error exporting stock alerts:', e);
            Utils.showNotification('Error al exportar alertas', 'error');
        } finally {
            // Siempre resetear el flag, incluso si hay error
            this.isExporting = false;
        }
    },
    
    // ==================== ESCANEO DE CÓDIGOS DE BARRAS ====================
    
    /**
     * Configurar escaneo de códigos de barras para búsqueda rápida
     */
    setupBarcodeScanning() {
        const barcodeInput = document.getElementById('inventory-barcode-scan');
        const scanBtn = document.getElementById('inventory-scan-btn');
        
        if (!barcodeInput) return;
        
        // Detectar cuando se escribe o escanea un código
        let scanTimeout = null;
        barcodeInput.addEventListener('input', (e) => {
            const barcode = e.target.value.trim();
            
            // Limpiar timeout anterior
            if (scanTimeout) {
                clearTimeout(scanTimeout);
            }
            
            // Si el código tiene al menos 3 caracteres, buscar después de un breve delay
            // Esto permite que el escáner complete la entrada antes de buscar
            if (barcode.length >= 3) {
                scanTimeout = setTimeout(() => {
                    this.searchByBarcode(barcode);
                }, 300); // Esperar 300ms para que el escáner complete
            }
        });
        
        // Permitir búsqueda con Enter
        barcodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const barcode = barcodeInput.value.trim();
                if (barcode) {
                    this.searchByBarcode(barcode);
                }
            }
        });
        
        // Botón de escaneo (activar cámara si está disponible)
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                this.startBarcodeScan();
            });
        }
        
        // Auto-focus en el campo de escaneo cuando se presiona Ctrl+B o Cmd+B
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                barcodeInput.focus();
                barcodeInput.select();
            }
        });
        
        // Configurar handler para BarcodeManager si está disponible
        if (typeof BarcodeManager !== 'undefined' && BarcodeManager.handleBarcodeScan) {
            // Guardar handler original
            const originalHandler = BarcodeManager.handleBarcodeScan;
            
            // Configurar nuestro handler
            BarcodeManager.handleBarcodeScan = async (barcode) => {
                // Si estamos en el módulo de inventario, usar nuestro handler
                const isInventoryActive = typeof UI !== 'undefined' && UI.currentModule === 'inventory';
                if (isInventoryActive) {
                    await this.searchByBarcode(barcode);
                } else {
                    // Si no estamos en inventario, usar el handler original
                    if (originalHandler) {
                        await originalHandler(barcode);
                    }
                }
            };
        }
    },
    
    /**
     * Iniciar escaneo de código de barras con cámara
     */
    async startBarcodeScan() {
        // Verificar si hay soporte para cámara
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                Utils.showNotification('Activando cámara para escaneo...', 'info');
                
                // Intentar acceder a la cámara
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } // Cámara trasera
                });
                
                // Si hay un módulo de escaneo disponible, usarlo
                if (typeof BarcodeManager !== 'undefined' && BarcodeManager.startCameraScan) {
                    await BarcodeManager.startCameraScan((barcode) => {
                        document.getElementById('inventory-barcode-scan').value = barcode;
                        this.searchByBarcode(barcode);
                    });
                } else {
                    // Fallback: mostrar mensaje
                    Utils.showNotification('Usa un escáner de códigos de barras físico o escribe el código manualmente', 'info');
                    stream.getTracks().forEach(track => track.stop()); // Detener cámara
                    document.getElementById('inventory-barcode-scan').focus();
                }
            } catch (error) {
                console.warn('No se pudo acceder a la cámara:', error);
                Utils.showNotification('No se pudo acceder a la cámara. Usa un escáner físico o escribe el código manualmente', 'warning');
                document.getElementById('inventory-barcode-scan').focus();
            }
        } else {
            // No hay soporte para cámara, usar escáner físico o entrada manual
            Utils.showNotification('Usa un escáner de códigos de barras físico o escribe el código manualmente', 'info');
            document.getElementById('inventory-barcode-scan').focus();
        }
    },
    
    /**
     * Buscar pieza por código de barras y abrir modal de edición
     */
    async searchByBarcode(barcode) {
        if (!barcode || barcode.length < 3) {
            return;
        }
        
        try {
            console.log(`🔍 Buscando pieza por código de barras: ${barcode}`);
            
            // Buscar en IndexedDB primero
            let item = null;
            const allItems = await DB.getAll('inventory_items') || [];
            
            // Buscar por código de barras exacto
            item = allItems.find(i => i.barcode && i.barcode.trim() === barcode.trim());
            
            // Si no se encuentra, buscar por SKU
            if (!item) {
                item = allItems.find(i => i.sku && i.sku.trim() === barcode.trim());
            }
            
            // Si aún no se encuentra, buscar en el servidor
            if (!item && typeof API !== 'undefined' && API.baseURL && API.token && API.getInventoryItems) {
                try {
                    const items = await API.getInventoryItems({ barcode: barcode });
                    if (items && items.length > 0) {
                        item = items[0];
                        // Guardar en IndexedDB para caché
                        await DB.put('inventory_items', item, { autoBranchId: false });
                    }
                } catch (apiError) {
                    console.warn('Error buscando en servidor:', apiError);
                }
            }
            
            if (item) {
                console.log(`✅ Pieza encontrada: ${item.name} (SKU: ${item.sku})`);
                
                // Limpiar el campo de búsqueda
                const barcodeInput = document.getElementById('inventory-barcode-scan');
                if (barcodeInput) {
                    barcodeInput.value = '';
                }
                
                // Registrar escaneo en historial (BarcodesModule)
                if (typeof BarcodesModule !== 'undefined' && BarcodesModule.recordScan) {
                    await BarcodesModule.recordScan(barcode, 'inventory_search', item.name, 'item');
                }
                
                // Abrir modal de edición directamente
                await this.editItem(item.id);
                
                Utils.showNotification(`Pieza encontrada: ${item.name}`, 'success');
            } else {
                console.log(`❌ Pieza no encontrada con código: ${barcode}`);
                Utils.showNotification(`No se encontró ninguna pieza con el código: ${barcode}`, 'warning');
                
                // Limpiar el campo después de un momento
                setTimeout(() => {
                    const barcodeInput = document.getElementById('inventory-barcode-scan');
                    if (barcodeInput) {
                        barcodeInput.value = '';
                        barcodeInput.focus();
                    }
                }, 2000);
            }
        } catch (error) {
            console.error('Error buscando por código de barras:', error);
            Utils.showNotification('Error al buscar la pieza: ' + error.message, 'error');
        }
    },
    
    // Función para cambiar de pestaña
    switchTab(tabName) {
        // Ocultar todas las pestañas
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
            tab.style.display = 'none';
        });
        
        // Remover clase active de todos los botones (tanto .tab-btn como .tab-btn-vertical)
        document.querySelectorAll('.tab-btn, .tab-btn-vertical').forEach(btn => {
            btn.classList.remove('active');
            if (btn.classList.contains('tab-btn-vertical')) {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--color-text)';
                btn.style.fontWeight = 'normal';
            }
        });
        
        // Mostrar la pestaña seleccionada
        const selectedTab = document.getElementById(`tab-${tabName}`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            selectedTab.style.display = 'block';
        }
        
        // Agregar clase active al botón correspondiente
        const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('active');
            if (selectedBtn.classList.contains('tab-btn-vertical')) {
                selectedBtn.style.background = 'var(--color-primary)';
                selectedBtn.style.color = 'white';
                selectedBtn.style.fontWeight = '600';
            }
        }
    },
    
    // Inicializar sistema de pestañas
    initializeTabs() {
        // Agregar event listeners a todos los botones de pestaña (tanto .tab-btn como .tab-btn-vertical)
        document.querySelectorAll('.tab-btn, .tab-btn-vertical').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabName = btn.getAttribute('data-tab');
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });
    },
    
    // Cargar ubicaciones guardadas para autocompletado
    async loadSavedLocations() {
        try {
            // Obtener todas las ubicaciones de items existentes
            const allItems = await DB.getAll('inventory_items') || [];
            const locations = new Set();
            
            allItems.forEach(item => {
                if (item.location_detail) locations.add(item.location_detail);
                if (item.location && item.location !== item.location_detail) locations.add(item.location);
            });
            
            // Agregar ubicaciones predefinidas comunes
            const predefinedLocations = ['Vitrina 1', 'Vitrina 2', 'Caja fuerte', 'Taller', 'Almacén'];
            predefinedLocations.forEach(loc => locations.add(loc));
            
            // Poblar el datalist
            const datalist = document.getElementById('inv-location-detail-list');
            if (datalist) {
                datalist.innerHTML = Array.from(locations).sort().map(loc => 
                    `<option value="${loc}">${loc}</option>`
                ).join('');
            }
            
            // También actualizar el filtro de ubicación
            this.updateLocationFilter(Array.from(locations).sort());
        } catch (error) {
            console.warn('Error cargando ubicaciones:', error);
        }
    },
    
    // Actualizar filtro de ubicación con ubicaciones guardadas
    async updateLocationFilter(locations = null) {
        try {
            if (!locations) {
                const allItems = await DB.getAll('inventory_items') || [];
                const locationSet = new Set();
                allItems.forEach(item => {
                    if (item.location_detail) locationSet.add(item.location_detail);
                    if (item.location) locationSet.add(item.location);
                });
                locations = Array.from(locationSet).sort();
            }
            
            const locationFilter = document.getElementById('inventory-location-filter');
            if (locationFilter) {
                const currentValue = locationFilter.value;
                locationFilter.innerHTML = '<option value="">Todas las ubicaciones</option>' +
                    locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
                if (currentValue) {
                    locationFilter.value = currentValue;
                }
            }
        } catch (error) {
            console.warn('Error actualizando filtro de ubicación:', error);
        }
    },
    
    // Guardar nueva ubicación cuando se guarda un item
    async saveLocation(location) {
        if (!location || !location.trim()) return;
        
        try {
            // La ubicación se guarda automáticamente en el item, solo necesitamos actualizar el filtro
            await this.updateLocationFilter();
        } catch (error) {
            console.warn('Error guardando ubicación:', error);
        }
    },
    
    // Actualizar botones de vista (usando clases como en POS)
    updateViewButtons() {
        const viewBtns = document.querySelectorAll('.inventory-view-btn');
        if (!viewBtns || viewBtns.length === 0) {
            return;
        }
        
        // Actualizar estilos según la vista actual (igual que POS)
        viewBtns.forEach(btn => {
            if (btn.dataset.view === this.currentView) {
                btn.classList.add('active');
                btn.style.background = 'var(--color-primary)';
                btn.style.color = 'white';
                btn.style.fontWeight = '600';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = 'var(--color-text)';
                btn.style.fontWeight = 'normal';
            }
        });
    },
    
    // Toggle seleccionar todos los items
    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.inventory-checkbox');
        checkboxes.forEach(checkbox => {
            if (checkbox.id !== 'inventory-select-all-list' && checkbox.id !== 'inventory-select-all-grid') {
                checkbox.checked = checked;
                const itemId = checkbox.closest('[data-item-id]')?.getAttribute('data-item-id');
                if (itemId) {
                    if (checked) {
                        this.selectedItems.add(itemId);
                    } else {
                        this.selectedItems.delete(itemId);
                    }
                }
            }
        });
        this.updateBatchActions();
    },
    
    // Actualizar UI de acciones en lote
    updateBatchActions() {
        const batchActionsDiv = document.getElementById('inventory-batch-actions');
        const selectedCountText = document.getElementById('inventory-selected-count-text');
        const deleteBtn = document.getElementById('inventory-delete-selected-btn');
        const printBtn = document.getElementById('inventory-print-selected-labels-btn');
        
        const count = this.selectedItems.size;
        
        if (batchActionsDiv) {
            if (count > 0) {
                batchActionsDiv.style.display = 'flex';
                if (selectedCountText) {
                    selectedCountText.textContent = `${count} pieza${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}`;
                }
                if (deleteBtn) deleteBtn.style.display = 'inline-block';
                if (printBtn) printBtn.style.display = 'inline-block';
            } else {
                batchActionsDiv.style.display = 'none';
                if (deleteBtn) deleteBtn.style.display = 'none';
                if (printBtn) printBtn.style.display = 'none';
            }
        }
    },
    
    // Actualizar UI de selección
    updateSelectionUI() {
        this.updateBatchActions();
        
        // Actualizar checkboxes visualmente
        document.querySelectorAll('.inventory-checkbox').forEach(checkbox => {
            if (checkbox.id !== 'inventory-select-all-list' && checkbox.id !== 'inventory-select-all-grid') {
                const itemId = checkbox.closest('[data-item-id]')?.getAttribute('data-item-id');
                if (itemId) {
                    checkbox.checked = this.selectedItems.has(itemId);
                    const row = checkbox.closest('tr, .inventory-card');
                    if (row) {
                        row.classList.toggle('inventory-card-selected', this.selectedItems.has(itemId));
                    }
                }
            }
        });
    }
};

window.Inventory = Inventory;
})();
