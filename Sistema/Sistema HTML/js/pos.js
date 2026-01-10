// POS Module - Point of Sale - Versión Avanzada

// CRÍTICO: Exponer window.POS INMEDIATAMENTE al inicio antes de definir el objeto
// Esto asegura que window.POS existe desde el primer momento
const POS = {};

// Ahora asignar todas las propiedades y métodos al objeto POS
Object.assign(POS, {
    initialized: false,
    listenersAttached: false,
    isProcessingSale: false,
    currentSale: null,
    cart: [],
    currentGuide: null,
    currentAgency: null,
    currentSeller: null,
    currentCustomer: null,
    currentDiscount: 0,
    favorites: [],
    pendingSales: [],
    lastSale: null,
    clockInterval: null,
    autoSaveInterval: null,
    isFullscreen: false,

    async init() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('pos.view')) {
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver el módulo POS</div>';
            }
            return;
        }

        // Asegurar que window.POS esté disponible ANTES de cualquier otra operación
        if (!window.POS) {
            window.POS = this;
            console.log('POS: window.POS expuesto en init()');
        }
        
        if (this.initialized) {
            // Si ya está inicializado, solo recargar productos y actualizar listeners
            await this.loadProducts();
            this.setupEventListeners(); // Reconfigurar listeners por si acaso
            return;
        }
        
        // Configurar listeners - verificar si el HTML ya existe
        const posModule = document.getElementById('module-pos');
        if (posModule && posModule.innerHTML.trim() !== '') {
            // Si el HTML ya existe, configurar listeners de nuevo para asegurar que funcionen
            if (!this.listenersAttached) {
                this.setupEventListeners();
                this.setupKeyboardShortcuts();
                this.listenersAttached = true;
            }
        }
        
        // DIAGNÓSTICO AUTOMÁTICO
        await this.diagnoseSystem();
        
        await this.loadCatalogs();
        // Desactivado: await this.ensureDemoProducts(); // Ya no carga productos demo automáticamente
        
        await this.loadProducts(); // Cargar productos directamente sin verificar demo
        await this.loadFavorites();
        await this.loadPendingSales();
        this.startClock();
        this.startAutoSave();
        this.restoreCart();
        await this.updateTodaySalesCount();
        this.initialized = true;
        console.log('POS Avanzado inicializado correctamente');
    },

    // Diagnóstico automático del sistema
    async diagnoseSystem() {
        console.log('🔍 POS: Iniciando diagnóstico del sistema...');
        
        try {
            // 1. Verificar base de datos
            if (!DB || !DB.db) {
                console.error('❌ POS: Base de datos no disponible');
                return;
            }
            console.log('✅ POS: Base de datos disponible');
            
            // 2. Obtener todos los productos
            const allItems = await DB.getAll('inventory_items') || [];
            console.log(`📦 POS: Total productos en BD: ${allItems.length}`);
            
            if (allItems.length === 0) {
                console.warn('⚠️ POS: NO HAY PRODUCTOS EN LA BASE DE DATOS');
                console.log('💡 Solución: Crea productos en el módulo de Inventario');
                return;
            }
            
            // 3. Análisis de status
            const statusCount = {};
            allItems.forEach(item => {
                const status = item.status || 'sin_status';
                statusCount[status] = (statusCount[status] || 0) + 1;
            });
            console.log('📊 POS: Productos por status:', statusCount);
            
            // 4. Análisis de stock
            const stockAnalysis = {
                conStock: 0,
                sinStock: 0,
                stockCero: 0,
                stockNull: 0
            };
            allItems.forEach(item => {
                const stock = item.stock_actual;
                if (stock === null || stock === undefined) {
                    stockAnalysis.stockNull++;
                } else if (stock === 0) {
                    stockAnalysis.stockCero++;
                    stockAnalysis.sinStock++;
                } else if (stock > 0) {
                    stockAnalysis.conStock++;
                }
            });
            console.log('📊 POS: Análisis de stock:', stockAnalysis);
            
            // 5. Análisis de sucursal
            const branchAnalysis = {
                conBranch: 0,
                sinBranch: 0,
                branchIds: {}
            };
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || null;
            
            allItems.forEach(item => {
                if (item.branch_id) {
                    branchAnalysis.conBranch++;
                    branchAnalysis.branchIds[item.branch_id] = (branchAnalysis.branchIds[item.branch_id] || 0) + 1;
                } else {
                    branchAnalysis.sinBranch++;
                }
            });
            console.log('📊 POS: Análisis de sucursal:', branchAnalysis);
            console.log(`📍 POS: Sucursal actual: ${currentBranchId || 'No configurada'}`);
            
            // 6. Productos que deberían aparecer en POS
            const disponiblesConStock = allItems.filter(item => {
                return item.status === 'disponible' && (item.stock_actual ?? 1) > 0;
            });
            console.log(`✅ POS: Productos disponibles con stock: ${disponiblesConStock.length}`);
            
            // 7. Productos filtrados por sucursal
            let filtradosPorSucursal = allItems;
            if (currentBranchId) {
                filtradosPorSucursal = allItems.filter(item => {
                    return !item.branch_id || item.branch_id === currentBranchId;
                });
                console.log(`📍 POS: Productos después de filtrar por sucursal: ${filtradosPorSucursal.length}`);
            }
            
            const finalDisponibles = filtradosPorSucursal.filter(item => {
                return item.status === 'disponible' && (item.stock_actual ?? 1) > 0;
            });
            console.log(`✅ POS: Productos finales que deberían aparecer: ${finalDisponibles.length}`);
            
            // 8. Mostrar primeros 5 productos para debug
            if (allItems.length > 0) {
                console.log('📋 POS: Primeros 5 productos (muestra):');
                allItems.slice(0, 5).forEach((item, idx) => {
                    console.log(`  ${idx + 1}. ${item.name || 'Sin nombre'} - Status: ${item.status}, Stock: ${item.stock_actual ?? 'null'}, Branch: ${item.branch_id || 'null'}`);
                });
            }
            
            // 9. Recomendaciones
            if (finalDisponibles.length === 0) {
                console.warn('⚠️ POS: PROBLEMA IDENTIFICADO - No hay productos que cumplan los criterios');
                if (disponiblesConStock.length > 0 && currentBranchId) {
                    console.warn('💡 POS: Hay productos disponibles pero no coinciden con la sucursal actual');
                    console.warn('💡 Solución: Verifica que los productos tengan el branch_id correcto o cámbialo a null');
                } else if (statusCount.disponible === 0) {
                    console.warn('💡 POS: No hay productos con status "disponible"');
                    console.warn('💡 Solución: Cambia el status de los productos a "disponible" en Inventario');
                } else if (stockAnalysis.conStock === 0) {
                    console.warn('💡 POS: No hay productos con stock > 0');
                    console.warn('💡 Solución: Ajusta el stock de los productos en Inventario');
                }
            }
            
        } catch (error) {
            console.error('❌ POS: Error en diagnóstico:', error);
        }
    },

    // ==================== CONFIGURACIÓN ====================

    setupEventListeners() {
        // Nota: El botón completar venta usa onclick en HTML, no agregar listener aquí
        
        // Configurar event listeners para botones que usan onclick en HTML
        // Esto asegura que funcionen incluso si window.POS no está disponible inmediatamente
        const setupButtonListeners = () => {
            // Botón de impresora
            const printerBtn = document.getElementById('btn-printer-connect');
            if (printerBtn && !printerBtn.hasAttribute('data-listener-attached')) {
                printerBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.togglePrinter) {
                        window.POS.togglePrinter();
                    } else {
                        console.error('POS: togglePrinter no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                printerBtn.setAttribute('data-listener-attached', 'true');
            }
            
            // Botón de favoritos
            const favoritesBtn = document.querySelector('button[onclick*="showFavorites"]');
            if (favoritesBtn && !favoritesBtn.hasAttribute('data-listener-attached')) {
                favoritesBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.showFavorites) {
                        window.POS.showFavorites();
                    } else {
                        console.error('POS: showFavorites no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                favoritesBtn.setAttribute('data-listener-attached', 'true');
            }
            
            // Botón de historial
            const historyBtn = document.querySelector('button[onclick*="showHistory"]');
            if (historyBtn && !historyBtn.hasAttribute('data-listener-attached')) {
                historyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.showHistory) {
                        window.POS.showHistory();
                    } else {
                        console.error('POS: showHistory no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                historyBtn.setAttribute('data-listener-attached', 'true');
            }
            
            // Botón de pantalla completa
            const fullscreenBtn = document.querySelector('button[onclick*="toggleFullscreen"]');
            if (fullscreenBtn && !fullscreenBtn.hasAttribute('data-listener-attached')) {
                fullscreenBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.toggleFullscreen) {
                        window.POS.toggleFullscreen();
                    } else {
                        console.error('POS: toggleFullscreen no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                fullscreenBtn.setAttribute('data-listener-attached', 'true');
            }
            
            // Botón de escanear código
            const scannerBtn = document.querySelector('button[onclick*="startBarcodeScanner"]');
            if (scannerBtn && !scannerBtn.hasAttribute('data-listener-attached')) {
                scannerBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.startBarcodeScanner) {
                        window.POS.startBarcodeScanner();
                    } else {
                        console.error('POS: startBarcodeScanner no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                scannerBtn.setAttribute('data-listener-attached', 'true');
            }
            
            // Botón de limpiar información de venta
            const clearSaleBtn = document.querySelector('button[onclick*="clearSaleInfo"]');
            if (clearSaleBtn && !clearSaleBtn.hasAttribute('data-listener-attached')) {
                clearSaleBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.POS && window.POS.clearSaleInfo) {
                        window.POS.clearSaleInfo();
                    } else {
                        console.error('POS: clearSaleInfo no disponible');
                        Utils.showNotification('Error: Módulo POS no disponible', 'error');
                    }
                });
                clearSaleBtn.setAttribute('data-listener-attached', 'true');
            }
        };
        
        // Configurar listeners inmediatamente
        setupButtonListeners();
        
        // También configurar después de un pequeño delay para asegurar que el DOM esté listo
        setTimeout(setupButtonListeners, 100);
        
        // Payment inputs
        ['cash-usd', 'cash-mxn', 'cash-cad', 'tpv-visa', 'tpv-amex'].forEach(id => {
            const input = document.getElementById(`payment-${id}`);
            if (input) {
                input.addEventListener('input', () => this.calculatePayments());
                input.addEventListener('focus', function() { this.select(); });
            }
        });

        // Categorías con chips - usar delegación de eventos para elementos dinámicos
        const catalogPanel = document.querySelector('.pos-catalog-panel') || document.getElementById('module-pos');
        if (catalogPanel) {
            catalogPanel.addEventListener('click', (e) => {
                const chip = e.target.closest('.pos-category-chip');
                if (chip) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelectorAll('.pos-category-chip').forEach(b => b.classList.remove('active'));
                    chip.classList.add('active');
                    this.loadProducts();
                }
            });
        }
        
        // También agregar listeners directos si existen
        document.querySelectorAll('.pos-category-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pos-category-chip').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.loadProducts();
            });
        });

        // Vista toggle - usar delegación de eventos
        const posContainer = document.querySelector('.pos-container-advanced') || document.getElementById('module-pos');
        if (posContainer) {
            posContainer.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('.pos-view-btn');
                if (viewBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelectorAll('.pos-view-btn').forEach(b => b.classList.remove('active'));
                    viewBtn.classList.add('active');
                    this.changeView(viewBtn.dataset.view);
                }
            });
        }
        
        // También agregar listeners directos si existen
        document.querySelectorAll('.pos-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pos-view-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.changeView(e.currentTarget.dataset.view);
            });
        });

        // Búsqueda de productos
        const searchInput = document.getElementById('pos-product-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => this.loadProducts(), 300));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.quickAddBySearch(searchInput.value);
                }
            });
        }

        // Búsqueda de cliente
        const customerInput = document.getElementById('pos-customer-search');
        if (customerInput) {
            customerInput.addEventListener('input', Utils.debounce(() => this.searchCustomer(), 300));
        }

        // Filtros avanzados
        ['pos-metal-filter', 'pos-stone-filter', 'pos-min-price', 'pos-max-price'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.loadProducts());
        });

        // Ordenamiento
        document.getElementById('pos-sort-by')?.addEventListener('change', () => this.loadProducts());

        // Recargar cuando se muestre el módulo
        window.addEventListener('module-loaded', (e) => {
            if (e.detail && e.detail.module === 'pos') {
                setTimeout(() => {
                    this.loadProducts();
                    this.updateTodaySalesCount();
                }, 100);
            }
        });

        // Chips de descuento
        document.querySelectorAll('.pos-discount-chip[data-discount]').forEach(chip => {
            chip.addEventListener('click', () => {
                const discount = parseInt(chip.dataset.discount);
                this.applyQuickDiscount(discount);
            });
        });

        // Escuchar eventos de actualización de inventario para recargar productos automáticamente
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            // Usar debounce para evitar recargas excesivas si hay múltiples actualizaciones rápidas
            let inventoryUpdateTimeout = null;
            Utils.EventBus.on('inventory-updated', async (data) => {
                if (this.initialized) {
                    // Limpiar timeout anterior si existe
                    if (inventoryUpdateTimeout) {
                        clearTimeout(inventoryUpdateTimeout);
                    }
                    // Usar debounce de 300ms para agrupar actualizaciones rápidas
                    inventoryUpdateTimeout = setTimeout(async () => {
                        // Recargar productos automáticamente cuando se crea/modifica un producto
                        await this.loadProducts();
                        // Mostrar notificación discreta si es un producto nuevo o actualización masiva
                        if (data && data.isNew) {
                            if (data.isBulkUpdate && data.count) {
                                Utils.showNotification(`${data.count} productos importados`, 'info', 2000);
                            } else {
                                Utils.showNotification('Nuevo producto disponible', 'info', 2000);
                            }
                        }
                    }, 300);
                }
            });
        }
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Solo si estamos en el módulo POS
            const posModule = document.getElementById('module-pos');
            if (!posModule || posModule.style.display === 'none') return;

            // F1 - Enfocar búsqueda
            if (e.key === 'F1') {
                e.preventDefault();
                document.getElementById('pos-product-search')?.focus();
            }
            // F2 - Favoritos
            if (e.key === 'F2') {
                e.preventDefault();
                this.showFavorites();
            }
            // F3 - Ventas pendientes
            if (e.key === 'F3') {
                e.preventDefault();
                this.showPendingSales();
            }
            // F4 - Historial
            if (e.key === 'F4') {
                e.preventDefault();
                this.showHistory();
            }
            // F5 - Pausar venta
            if (e.key === 'F5') {
                e.preventDefault();
                this.holdSale();
            }
            // F11 - Pantalla completa
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
            // F12 - Completar venta
            if (e.key === 'F12') {
                e.preventDefault();
                this.completeSale();
            }
            // Escape - Cerrar modales
            if (e.key === 'Escape') {
                this.closeQuickView();
                this.closeSuccessOverlay();
            }
            // ? - Mostrar atajos
            if (e.key === '?' && !e.ctrlKey && !e.altKey) {
                const activeElement = document.activeElement;
                if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.showShortcuts();
                }
            }
        });
    },

    // ==================== RELOJ Y CONTADORES ====================

    startClock() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const clockEl = document.getElementById('pos-clock');
            if (clockEl) clockEl.textContent = timeStr;
        };
        updateClock();
        this.clockInterval = setInterval(updateClock, 1000);
    },

    async updateTodaySalesCount() {
        try {
            // Obtener sucursal actual y filtrar ventas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const today = new Date().toISOString().split('T')[0];
            const todaySales = sales.filter(s => 
                s.created_at?.startsWith(today) && s.status === 'completada'
            );
            const countEl = document.getElementById('pos-today-sales');
            if (countEl) countEl.textContent = todaySales.length;
        } catch (e) {
            console.error('Error actualizando contador:', e);
        }
    },

    // ==================== AUTO-GUARDADO ====================

    startAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            if (this.cart.length > 0) {
                this.saveCartToStorage();
            }
        }, 30000); // Cada 30 segundos
    },

    saveCartToStorage() {
        try {
            const cartData = {
                cart: this.cart,
                guide: this.currentGuide,
                agency: this.currentAgency,
                seller: this.currentSeller,
                customer: this.currentCustomer,
                discount: this.currentDiscount,
                timestamp: Date.now()
            };
            localStorage.setItem('pos_cart_backup', JSON.stringify(cartData));
        } catch (e) {
            console.error('Error guardando carrito:', e);
        }
    },

    restoreCart() {
        try {
            const savedData = localStorage.getItem('pos_cart_backup');
            if (savedData) {
                const data = JSON.parse(savedData);
                // Solo restaurar si es del mismo día
                const savedDate = new Date(data.timestamp).toDateString();
                const today = new Date().toDateString();
                if (savedDate === today && data.cart?.length > 0) {
                    this.cart = data.cart;
                    this.currentGuide = data.guide;
                    this.currentAgency = data.agency;
                    this.currentSeller = data.seller;
                    this.currentCustomer = data.customer;
                    this.currentDiscount = data.discount || 0;
                    this.updateCartDisplay();
                    this.calculateTotals();
                    this.updateCustomerDisplay();
                    Utils.showNotification('Carrito restaurado', 'info');
                }
            }
        } catch (e) {
            console.error('Error restaurando carrito:', e);
        }
    },

    clearCartStorage() {
        localStorage.removeItem('pos_cart_backup');
    },

    // ==================== CATÁLOGOS Y PRODUCTOS ====================

    async loadCatalogs() {
        // Los catálogos se cargan bajo demanda
    },

    async ensureDemoProducts() {
        try {
            let items = await DB.getAll('inventory_items') || [];
            if (items.length === 0) {
                if (window.App && window.App.loadDemoInventory) {
                    await window.App.loadDemoInventory();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            await this.loadProducts();
        } catch (e) {
            console.error('Error asegurando productos demo:', e);
            await this.loadProducts();
        }
    },

    async loadProducts() {
        const container = document.getElementById('pos-products-list');
        if (!container) {
            console.warn('POS: Container pos-products-list no encontrado');
            return;
        }

        // Mostrar loading
        container.innerHTML = `
            <div class="pos-loading-products">
                <div class="pos-loader"></div>
                <span>Cargando productos...</span>
            </div>
        `;

        try {
            const search = document.getElementById('pos-product-search')?.value.toLowerCase() || '';
            const category = document.querySelector('.pos-category-chip.active')?.dataset.category || 'all';
            const metalFilter = document.getElementById('pos-metal-filter')?.value || '';
            const stoneFilter = document.getElementById('pos-stone-filter')?.value || '';
            const minPrice = parseFloat(document.getElementById('pos-min-price')?.value) || 0;
            const maxPrice = parseFloat(document.getElementById('pos-max-price')?.value) || Infinity;
            const sortBy = document.getElementById('pos-sort-by')?.value || 'name';

            // Obtener items - primero intentar sin filtro de sucursal para debug
            let allItems = await DB.getAll('inventory_items') || [];
            console.log(`POS: Total items en BD: ${allItems.length}`);
            
            // Obtener sucursal actual
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || null;
            
            console.log(`POS: Sucursal actual: ${currentBranchId}`);
            
            // Filtrar por sucursal si está configurado - MÁS FLEXIBLE
            let items = allItems;
            if (currentBranchId) {
                items = allItems.filter(item => {
                    // Incluir items de la sucursal actual, sin branch_id, o con branch_id null/undefined
                    return !item.branch_id || item.branch_id === currentBranchId || item.branch_id === null || item.branch_id === undefined;
                });
                console.log(`POS: Items después de filtrar por sucursal: ${items.length}`);
            }
            
            // DEBUG: Mostrar información de todos los items
            console.log('POS: Análisis de items:');
            allItems.forEach((item, idx) => {
                if (idx < 5) { // Solo primeros 5 para no saturar
                    console.log(`  Item ${idx + 1}:`, {
                        id: item.id,
                        name: item.name,
                        status: item.status,
                        stock_actual: item.stock_actual,
                        branch_id: item.branch_id
                    });
                }
            });
            
            // Filtrar solo disponibles Y con stock > 0
            const beforeStatusFilter = items.length;
            items = items.filter(item => {
                if (!item) return false;
                // Mostrar solo disponibles (pero también mostrar otros status para debug si no hay disponibles)
                const isDisponible = item.status === 'disponible';
                const stockActual = item.stock_actual ?? 1;
                const hasStock = stockActual > 0;
                
                // Si no hay items disponibles con los filtros estrictos, relajar filtros
                const disponibleConStock = items.filter(i => i.status === 'disponible' && (i.stock_actual ?? 1) > 0);
                if (disponibleConStock.length === 0 && beforeStatusFilter > 0) {
                    console.warn('POS: No hay items disponibles con stock, mostrando disponibles sin importar stock');
                    // Mostrar disponibles aunque no tengan stock
                    return isDisponible;
                }
                
                return isDisponible && hasStock;
            });
            console.log(`POS: Items disponibles con stock: ${items.length} (filtrados ${beforeStatusFilter - items.length})`);

            // Filtro de búsqueda
            if (search) {
                items = items.filter(item => 
                    item.sku?.toLowerCase().includes(search) ||
                    item.name?.toLowerCase().includes(search) ||
                    item.barcode?.includes(search) ||
                    item.metal?.toLowerCase().includes(search) ||
                    item.stone?.toLowerCase().includes(search)
                );
            }

            // Filtro de categoría
            if (category && category !== 'all') {
                items = items.filter(item => 
                    item.category?.toLowerCase() === category.toLowerCase() ||
                    item.name?.toLowerCase().includes(category.toLowerCase())
                );
            }

            // Filtro de metal
            if (metalFilter) {
                items = items.filter(item => item.metal === metalFilter);
            }

            // Filtro de piedra
            if (stoneFilter) {
                items = items.filter(item => item.stone === stoneFilter);
            }

            // Filtro de precio
            items = items.filter(item => {
                const price = item.cost || 0;
                return price >= minPrice && price <= maxPrice;
            });

            // Ordenar
            items.sort((a, b) => {
                switch (sortBy) {
                    case 'price-asc': return (a.cost || 0) - (b.cost || 0);
                    case 'price-desc': return (b.cost || 0) - (a.cost || 0);
                    case 'recent': return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                    default: return (a.name || '').localeCompare(b.name || '');
                }
            });

            // Actualizar contador
            const countEl = document.getElementById('pos-products-count');
            if (countEl) countEl.textContent = `${items.length} producto${items.length !== 1 ? 's' : ''} encontrado${items.length !== 1 ? 's' : ''}`;

            if (items.length === 0) {
                // Mostrar información detallada de debug
                const disponibleCount = allItems.filter(i => i.status === 'disponible').length;
                const conStockCount = allItems.filter(i => (i.stock_actual ?? 1) > 0).length;
                const disponibleConStock = allItems.filter(i => i.status === 'disponible' && (i.stock_actual ?? 1) > 0).length;
                
                container.innerHTML = `
                    <div class="pos-loading-products" style="text-align: center; padding: 40px;">
                        <i class="fas fa-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <div style="margin-bottom: 16px; font-size: 14px; color: var(--color-text-secondary);">
                            No se encontraron productos disponibles
                        </div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 20px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
                            <strong>Información de Debug:</strong><br>
                            • Total productos en BD: ${allItems.length}<br>
                            • Productos con status "disponible": ${disponibleCount}<br>
                            • Productos con stock > 0: ${conStockCount}<br>
                            • Productos disponibles con stock: ${disponibleConStock}<br>
                            • Sucursal actual: ${currentBranchId || 'No configurada'}<br><br>
                            ${allItems.length > 0 ? 
                                `<strong>Acción requerida:</strong> Verifica que los productos tengan:<br>
                                - Status: "disponible"<br>
                                - Stock actual: mayor a 0<br>
                                - Branch ID: coincida con la sucursal actual o esté vacío` :
                                '<strong>No hay productos en el inventario.</strong> Crea productos en el módulo de Inventario primero.'
                            }
                        </div>
                        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn-primary btn-sm" onclick="window.POS && window.POS.loadProducts()">
                                <i class="fas fa-sync"></i> Recargar Productos
                            </button>
                            ${allItems.length === 0 ? `
                                <button class="btn-secondary btn-sm" onclick="window.UI && window.UI.showModule('inventory')">
                                    <i class="fas fa-box"></i> Ir a Inventario
                                </button>
                            ` : `
                                <button class="btn-secondary btn-sm" onclick="window.UI && window.UI.showModule('inventory')">
                                    <i class="fas fa-box"></i> Ver Inventario
                                </button>
                            `}
                        </div>
                    </div>
                `;
                
                // Asegurar que el botón de recargar funcione
                setTimeout(() => {
                    const reloadBtn = container.querySelector('button');
                    if (reloadBtn && !window.POS) {
                        window.POS = this;
                    }
                }, 100);
                
                return;
            }

            // Cargar fotos
            const itemsWithPhotos = await Promise.all(items.map(async (item) => {
                try {
                    const photos = await DB.query('inventory_photos', 'item_id', item.id);
                    const photo = photos && photos.length > 0 ? photos[0] : null;
                    return { ...item, photo: photo?.thumbnail_blob || photo?.photo_blob || null };
                } catch (e) {
                    return { ...item, photo: null };
                }
            }));

            // Asegurar que window.POS esté disponible ANTES de renderizar
            if (!window.POS) {
                window.POS = this;
                console.log('POS: window.POS expuesto manualmente antes de renderizar');
            }
            
            // Renderizar productos
            const productsHTML = itemsWithPhotos.map(item => this.renderProductCard(item)).join('');
            container.innerHTML = productsHTML;
            
            // Re-asegurar que window.POS esté disponible después de renderizar
            if (!window.POS) {
                window.POS = this;
            }
            
            // Usar delegación de eventos para todos los botones del contenedor
            // Esto asegura que los botones funcionen incluso si se renderizan dinámicamente
            container.addEventListener('click', (e) => {
                // Buscar el botón más cercano
                const button = e.target.closest('button');
                if (!button) return;
                
                // Verificar si tiene onclick con window.POS
                const onclick = button.getAttribute('onclick');
                if (onclick && onclick.includes('window.POS.')) {
                    // Asegurar que window.POS esté disponible
                    if (!window.POS) {
                        window.POS = this;
                    }
                    
                    // Intentar ejecutar el onclick original primero
                    try {
                        // Si el onclick no funciona, ejecutarlo manualmente
                        const funcMatch = onclick.match(/window\.POS\.(\w+)\(['"]?([^'")]+)['"]?\)/);
                        if (funcMatch) {
                            const funcName = funcMatch[1];
                            const param = funcMatch[2];
                            if (this[funcName] && typeof this[funcName] === 'function') {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log(`POS: Ejecutando ${funcName} con parámetro: ${param}`);
                                this[funcName](param);
                                return;
                            }
                        }
                    } catch (err) {
                        console.error('POS: Error ejecutando función desde delegación:', err);
                    }
                }
                
                // También manejar clicks en imágenes con onclick
                const image = e.target.closest('.pos-product-card-image');
                if (image) {
                    const imageOnclick = image.getAttribute('onclick');
                    if (imageOnclick && imageOnclick.includes('window.POS.showQuickView')) {
                        if (!window.POS) {
                            window.POS = this;
                        }
                        const match = imageOnclick.match(/window\.POS\.showQuickView\(['"]?([^'")]+)['"]?\)/);
                        if (match && this.showQuickView) {
                            e.preventDefault();
                            e.stopPropagation();
                            this.showQuickView(match[1]);
                        }
                    }
                }
            });
            
            console.log(`POS: ${items.length} productos renderizados correctamente`);

        } catch (e) {
            console.error('Error loading products:', e);
            container.innerHTML = `
                <div class="pos-loading-products">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <span>Error al cargar productos: ${e.message}</span>
                </div>
            `;
        }
    },

    renderProductCard(item) {
        const isInCart = this.cart.find(c => c.id === item.id);
                const itemId = String(item.id).replace(/'/g, "\\'");
                const itemName = (item.name || 'Sin nombre').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        const itemSku = (item.sku || item.barcode || 'N/A').replace(/'/g, "&#39;");
                
                return `
            <div class="pos-product-card ${isInCart ? 'in-cart' : ''}" data-item-id="${itemId}">
                <div class="pos-product-card-image" onclick="window.POS.showQuickView('${itemId}')">
                            ${item.photo ? 
                        `<img src="${item.photo}" alt="${itemName}" onerror="this.parentElement.innerHTML='<div class=\\'pos-product-card-placeholder\\'><i class=\\'fas fa-gem\\'></i></div>'">` :
                        `<div class="pos-product-card-placeholder"><i class="fas fa-gem"></i></div>`
                            }
                    ${item.certificate ? '<div class="pos-product-card-badge">Certificado</div>' : ''}
                        </div>
                <div class="pos-product-card-body">
                    <div class="pos-product-card-name">${itemName}</div>
                    <div class="pos-product-card-sku">${itemSku}</div>
                    <div class="pos-product-card-details">
                        ${item.metal ? `<span class="pos-product-card-tag">${item.metal}</span>` : ''}
                        ${item.stone && item.stone !== 'Sin piedra' ? `<span class="pos-product-card-tag">${item.stone}</span>` : ''}
                        ${item.size ? `<span class="pos-product-card-tag">Talla ${item.size}</span>` : ''}
                    </div>
                    ${(() => {
                        const stockActual = item.stock_actual ?? 1;
                        const stockMin = item.stock_min ?? 1;
                        const stockStatus = stockActual <= 0 ? 'out' : (stockActual < stockMin ? 'low' : 'ok');
                        const stockBadgeClass = stockStatus === 'out' ? 'stock-badge-out' : (stockStatus === 'low' ? 'stock-badge-low' : 'stock-badge-ok');
                        const stockText = stockActual <= 0 ? 'Agotado' : (stockActual < stockMin ? 'Stock Bajo' : `Stock: ${stockActual}`);
                        return `
                        <div class="pos-product-card-stock" style="margin: 4px 0; font-size: 10px;">
                            <span class="stock-badge ${stockBadgeClass}" style="padding: 2px 6px;">${stockText}</span>
                        </div>
                        `;
                    })()}
                    <div class="pos-product-card-price">
                        ${Utils.formatCurrency(item.cost || 0)}
                        <small>costo</small>
                    </div>
                    <div class="pos-product-card-actions">
                        <button class="pos-product-quick-add" onclick="event.stopPropagation(); window.POS.selectProduct('${itemId}')">
                            <i class="fas fa-plus"></i> Agregar
                        </button>
                        <button class="pos-product-quick-view" onclick="event.stopPropagation(); window.POS.showQuickView('${itemId}')" title="Vista Rápida">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                        </div>
                    </div>
                `;
    },

    changeView(view) {
        const container = document.getElementById('pos-products-list');
        if (!container) return;
        
        if (view === 'list') {
            container.style.gridTemplateColumns = '1fr';
        } else {
            container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(180px, 1fr))';
        }
    },

    // ==================== CARRITO ====================

    async selectProduct(itemId) {
        console.log('POS.selectProduct llamado con itemId:', itemId);
        if (!itemId) {
            console.error('POS.selectProduct: itemId no proporcionado');
            Utils.showNotification('Error: ID de producto no válido', 'error');
            return;
        }
        try {
            const item = await DB.get('inventory_items', itemId);
            if (!item) {
                Utils.showNotification('Producto no encontrado', 'error');
                return;
            }

            // Verificar si ya está en el carrito
            if (this.cart.find(c => c.id === item.id)) {
                Utils.showNotification('La pieza ya está en el carrito', 'warning');
                return;
            }

            // Verificar disponibilidad y stock
            if (item.status !== 'disponible') {
                Utils.showNotification(`Pieza ${item.status}`, 'error');
                return;
            }
            
            // Verificar stock disponible
            const stockActual = item.stock_actual ?? 1;
            if (stockActual <= 0) {
                Utils.showNotification('Producto sin stock disponible', 'error');
                return;
            }

            // Cargar foto
            let photo = null;
            try {
                const photos = await DB.query('inventory_photos', 'item_id', item.id);
                photo = photos && photos.length > 0 ? photos[0]?.thumbnail_blob || photos[0]?.photo_blob : null;
            } catch (e) {}

            // Agregar al carrito
            const cartItem = {
                ...item,
                photo: photo,
                price: item.cost || 0,
                quantity: 1,
                discount: this.currentDiscount,
                subtotal: (item.cost || 0) * (1 - this.currentDiscount / 100)
            };

            this.cart.push(cartItem);
            this.updateCartDisplay();
            this.calculateTotals();
            this.updateProductCard(item.id, true);
            this.saveCartToStorage();
            
            // Animación de éxito
            Utils.showNotification(`${item.name || 'Pieza'} agregada al carrito`, 'success');

        } catch (e) {
            console.error('Error selecting product:', e);
            Utils.showNotification('Error al agregar producto', 'error');
        }
    },

    async quickAddBySearch(query) {
        if (!query) return;
        
        try {
            // Obtener items filtrados por sucursal
            const items = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: true, 
                branchIdField: 'branch_id' 
            }) || [];
            
            const match = items.find(item => {
                if (item.status !== 'disponible') return false;
                // Verificar stock disponible
                const stockActual = item.stock_actual ?? 1;
                if (stockActual <= 0) return false;
                // Verificar match por SKU o código de barras
                return (
                    item.sku?.toLowerCase() === query.toLowerCase() ||
                    item.barcode === query
            );
            });

            if (match) {
                await this.selectProduct(match.id);
                document.getElementById('pos-product-search').value = '';
            } else {
                Utils.showNotification('Producto no encontrado', 'warning');
            }
        } catch (e) {
            console.error('Error en búsqueda rápida:', e);
        }
    },

    updateProductCard(itemId, inCart) {
        const card = document.querySelector(`.pos-product-card[data-item-id="${itemId}"]`);
        if (card) {
            if (inCart) {
                card.classList.add('in-cart');
            } else {
                card.classList.remove('in-cart');
            }
        }
    },

    removeFromCart(itemId) {
        const index = this.cart.findIndex(c => c.id === itemId);
        if (index > -1) {
            this.cart.splice(index, 1);
        this.updateCartDisplay();
        this.calculateTotals();
            this.updateProductCard(itemId, false);
            this.saveCartToStorage();
        }
    },

    async clearCart() {
        if (this.cart.length === 0) return;
        
        if (await Utils.confirm('¿Estás seguro de vaciar el carrito?')) {
            const itemIds = this.cart.map(c => c.id);
            this.cart = [];
            this.updateCartDisplay();
            this.calculateTotals();
            itemIds.forEach(id => this.updateProductCard(id, false));
            this.clearCartStorage();
            Utils.showNotification('Carrito vaciado', 'info');
        }
    },

    updateCartDisplay() {
        const container = document.getElementById('pos-cart-items');
        const countEl = document.getElementById('pos-cart-count');
        
        if (countEl) countEl.textContent = `(${this.cart.length})`;
        
        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="pos-cart-empty">
                    <i class="fas fa-shopping-basket"></i>
                    <p>El carrito está vacío</p>
                    <span>Selecciona productos para agregar</span>
                </div>
            `;
            return;
        }

        container.innerHTML = this.cart.map(item => `
            <div class="pos-cart-item-advanced" data-item-id="${item.id}">
                <div class="pos-cart-item-main">
                    <div class="pos-cart-item-image">
                        ${item.photo ? 
                            `<img src="${item.photo}" alt="${item.name}">` :
                            `<div class="pos-cart-item-image-placeholder"><i class="fas fa-gem"></i></div>`
                        }
                        </div>
                    <div class="pos-cart-item-info">
                        <div class="pos-cart-item-name">${item.name || 'Sin nombre'}</div>
                        <div class="pos-cart-item-sku">${item.sku || item.barcode || 'N/A'}</div>
                        <div class="pos-cart-item-price-row">
                            <div class="pos-cart-item-qty">
                        <button onclick="window.POS.updateQuantity('${item.id}', ${item.quantity - 1})">-</button>
                        <input type="number" value="${item.quantity}" min="1" 
                               onchange="window.POS.updateQuantity('${item.id}', parseInt(this.value))">
                        <button onclick="window.POS.updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
                    </div>
                            <input type="number" class="pos-cart-item-price-input" value="${item.price}" step="0.01" min="0"
                                   onchange="window.POS.updateItemPrice('${item.id}', parseFloat(this.value))"
                                   placeholder="Precio">
                            <div class="pos-cart-item-total">${Utils.formatCurrency(item.subtotal)}</div>
                    </div>
                </div>
                    <button class="pos-cart-item-remove" onclick="window.POS.removeFromCart('${item.id}')" title="Eliminar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    updateQuantity(itemId, newQuantity) {
        if (newQuantity < 1) {
            this.removeFromCart(itemId);
            return;
        }
        const item = this.cart.find(c => c.id === itemId);
        if (item) {
            item.quantity = newQuantity;
            item.subtotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
            this.updateCartDisplay();
            this.calculateTotals();
            this.saveCartToStorage();
        }
    },

    updateItemPrice(itemId, newPrice) {
        if (newPrice < 0) return;
        const item = this.cart.find(c => c.id === itemId);
        if (item) {
            item.price = newPrice;
            item.subtotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
            this.updateCartDisplay();
            this.calculateTotals();
            this.saveCartToStorage();
        }
    },

    // ==================== DESCUENTOS ====================

    applyQuickDiscount(percent) {
        if (percent > 0 && typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('pos.apply_discount')) {
            Utils.showNotification('No tienes permiso para aplicar descuentos', 'error');
            return;
        }
        
        this.currentDiscount = percent;
        
        // Actualizar chips de descuento
        document.querySelectorAll('.pos-discount-chip[data-discount]').forEach(chip => {
            const chipDiscount = parseInt(chip.dataset.discount);
            if (chipDiscount === percent) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });

        // Aplicar a todos los items
        this.cart.forEach(item => {
            item.discount = percent;
            item.subtotal = item.price * item.quantity * (1 - percent / 100);
        });

        this.updateCartDisplay();
        this.calculateTotals();
        this.saveCartToStorage();

        if (percent > 0) {
        Utils.showNotification(`Descuento del ${percent}% aplicado`, 'success');
        }
    },

    removeDiscount() {
        this.applyQuickDiscount(0);
        Utils.showNotification('Descuentos removidos', 'info');
    },

    async showCustomDiscount() {
        const percent = await Utils.prompt('Ingrese el porcentaje de descuento (0-100):', '', 'Descuento personalizado');
        if (percent !== null) {
            const value = parseInt(percent);
            if (!isNaN(value) && value >= 0 && value <= 100) {
                this.applyQuickDiscount(value);
        } else {
                Utils.showNotification('Porcentaje inválido', 'error');
            }
        }
    },

    // ==================== CÁLCULOS ====================

    calculateTotals() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0) / 100), 0);
        const total = subtotal - discountAmount;

        // Actualizar displays
        const subtotalEl = document.getElementById('pos-subtotal');
        const totalEl = document.getElementById('pos-total');
        const discountDisplay = document.getElementById('pos-discount-display');
        const discountPercentEl = document.getElementById('pos-discount-percent');
        const discountAmountEl = document.getElementById('pos-discount-amount');

        if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
        if (totalEl) totalEl.textContent = Utils.formatCurrency(total);

        // Mostrar/ocultar fila de descuento
        if (discountDisplay) {
            if (this.currentDiscount > 0) {
                discountDisplay.style.display = 'flex';
                if (discountPercentEl) discountPercentEl.textContent = this.currentDiscount;
                if (discountAmountEl) discountAmountEl.textContent = Utils.formatCurrency(discountAmount);
            } else {
                discountDisplay.style.display = 'none';
            }
        }
    },

    async calculatePayments() {
        try {
            const cashUsd = parseFloat(document.getElementById('payment-cash-usd')?.value || 0);
            const cashMxn = parseFloat(document.getElementById('payment-cash-mxn')?.value || 0);
            const cashCad = parseFloat(document.getElementById('payment-cash-cad')?.value || 0);
            const tpvVisa = parseFloat(document.getElementById('payment-tpv-visa')?.value || 0);
            const tpvAmex = parseFloat(document.getElementById('payment-tpv-amex')?.value || 0);

            // Obtener tipos de cambio del día actual
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const exchangeRates = await ExchangeRates.getExchangeRate(today);
            const exchangeRate = exchangeRates.usd;
            const exchangeRateCadValue = exchangeRates.cad;

            // Convertir todo a MXN
            let totalPayments = 0;
            totalPayments += cashUsd * exchangeRate;
            totalPayments += cashMxn;
            totalPayments += cashCad * exchangeRateCadValue;
            totalPayments += tpvVisa;
            totalPayments += tpvAmex;

            const total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
            const difference = totalPayments - total;

            // Actualizar displays
            const paymentsTotalEl = document.getElementById('payments-total');
            const diffEl = document.getElementById('payments-difference');
            const labelEl = document.getElementById('pos-change-label');

            if (paymentsTotalEl) paymentsTotalEl.textContent = Utils.formatCurrency(totalPayments);
            
            if (diffEl) {
                diffEl.textContent = Utils.formatCurrency(Math.abs(difference));
                diffEl.classList.remove('negative', 'positive', 'exact');
                
                if (difference === 0) {
                    diffEl.classList.add('exact');
                    if (labelEl) labelEl.textContent = 'Exacto:';
                } else if (difference > 0) {
                    diffEl.classList.add('positive');
                    if (labelEl) labelEl.textContent = 'Cambio:';
                } else {
                    diffEl.classList.add('negative');
                    if (labelEl) labelEl.textContent = 'Faltante:';
                }
            }
        } catch (e) {
            console.error('Error calculating payments:', e);
        }
    },

    async payExact(currency) {
        const total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
        
        if (currency === 'USD') {
            // Obtener tipo de cambio del día actual
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const exchangeRates = await ExchangeRates.getExchangeRate(today);
            const rate = exchangeRates.usd;
            const usdAmount = total / rate;
            document.getElementById('payment-cash-usd').value = usdAmount.toFixed(2);
        } else {
            document.getElementById('payment-cash-mxn').value = total.toFixed(2);
        }
        
        this.calculatePayments();
    },

    // ==================== PAGOS Y VENTAS ====================

    togglePayments() {
        const content = document.getElementById('pos-payments-content');
        const toggle = document.getElementById('pos-payments-toggle');
        
        if (content) {
            content.classList.toggle('open');
            if (toggle) {
                toggle.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
            }
        }
    },

    async completeSale() {
        // Validar que el módulo esté inicializado
        if (!this.initialized) {
            console.warn('POS: Módulo no inicializado, no se puede completar venta');
            Utils.showNotification('El módulo POS no está listo. Por favor espera un momento.', 'warning');
            // Intentar inicializar
            if (this.init) {
                try {
                    await this.init();
                } catch (err) {
                    console.error('Error inicializando POS:', err);
                    return;
                }
            } else {
                return;
            }
        }
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('pos.create_sale')) {
            Utils.showNotification('No tienes permiso para crear ventas', 'error');
            return;
        }

        // Evitar llamadas múltiples simultáneas
        if (this.isProcessingSale) {
            console.log('Venta ya en proceso, ignorando llamada duplicada');
            return;
        }
        
        if (this.cart.length === 0) {
            Utils.showNotification('El carrito está vacío', 'error');
            return;
        }

        this.isProcessingSale = true;
        
        try {
        // Validar pagos
        await this.calculatePayments();
        const total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
        const totalPayments = parseFloat(document.getElementById('payments-total')?.textContent.replace(/[^0-9.-]/g, '') || 0);
        
        if (Math.abs(totalPayments - total) > 0.01 && totalPayments < total) {
            if (!await Utils.confirm(`Falta ${Utils.formatCurrency(total - totalPayments)} por pagar. ¿Continuar de todos modos?`)) {
                return;
            }
        }

        // Notificaciones informativas (no bloquean la venta)
        const warnings = [];
        if (!this.currentGuide) warnings.push('Sin guía');
        if (!this.currentSeller) warnings.push('Sin vendedor');
        if (!this.currentAgency) warnings.push('Sin agencia');
        
        if (warnings.length > 0) {
            Utils.showNotification(`Venta ${warnings.join(', ')}`, 'warning');
        }

        // Obtener datos
        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id') || 'default';
        // Usar vendedor escaneado, o si no hay, el usuario logueado como fallback
        const sellerId = this.currentSeller?.id || UserManager.currentUser?.employee_id || null;
        const agencyId = this.currentAgency?.id || null;
        const guideId = this.currentGuide?.id || null;
        const customerId = this.currentCustomer?.id || null;
        const currency = 'MXN';
        // Obtener tipo de cambio del día actual
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        const exchangeRates = await ExchangeRates.getExchangeRate(today);
        const exchangeRate = exchangeRates.usd;

        // Generar folio
        const branch = await DB.get('catalog_branches', branchId);
        const branchCode = branch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'SUC';
        const folio = Utils.generateFolio(branchCode);

        // Crear venta
        const sale = {
            id: Utils.generateId(),
            folio: folio,
            branch_id: branchId,
            seller_id: sellerId,
            agency_id: agencyId,
            guide_id: guideId,
            passengers: 1,
            customer_id: customerId,
            currency: currency,
            exchange_rate: exchangeRate,
            subtotal: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            discount: this.cart.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0) / 100), 0),
            total: total,
            status: 'completada',
            notes: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        };

        await DB.add('sales', sale);

        // Variables para acumular costos
        let totalCOGS = 0;
        let totalSellerCommission = 0;
        let totalGuideCommission = 0;

        // Crear items de venta
        for (const item of this.cart) {
            // Obtener item actualizado de la BD para obtener el costo
            const currentItem = await DB.get('inventory_items', item.id);
            if (!currentItem) continue;
            
            const itemCost = currentItem?.cost || 0; // Costo de adquisición del item
            const itemCOGS = itemCost * item.quantity; // COGS total para este item
            
            // Calcular comisiones usando Utils.calculateCommission (centralizado)
            const commissionAmount = await Utils.calculateCommission(item.subtotal, sellerId, guideId);
            
            // Separar comisiones de vendedor y guía para registro individual
            let sellerCommission = 0;
            let guideCommission = 0;
            
            if (sellerId && typeof Utils !== 'undefined' && Utils.calculateCommission) {
                sellerCommission = await Utils.calculateCommission(item.subtotal, sellerId, null);
            }
            
            if (guideId && typeof Utils !== 'undefined' && Utils.calculateCommission) {
                guideCommission = await Utils.calculateCommission(item.subtotal, null, guideId);
            }
            
            await DB.add('sale_items', {
                id: Utils.generateId(),
                sale_id: sale.id,
                item_id: item.id,
                quantity: item.quantity,
                price: item.price, // Precio de venta
                cost: itemCost, // Costo de adquisición (COGS)
                discount: item.discount,
                subtotal: item.subtotal,
                commission_amount: commissionAmount, // Comisión calculada
                created_at: new Date().toISOString()
            });

            // Acumular costos
            totalCOGS += itemCOGS;
            totalSellerCommission += sellerCommission;
            totalGuideCommission += guideCommission;
            
            // Actualizar stock y estado del inventario
            const currentStock = currentItem.stock_actual ?? 1;
            const newStock = Math.max(0, currentStock - item.quantity);
            
            // Solo cambiar status a 'vendida' si el stock llega a 0
            // Si aún hay stock, mantener 'disponible'
            const newStatus = newStock <= 0 ? 'vendida' : 'disponible';
            
            const updatedItem = {
                ...currentItem,
                stock_actual: newStock,
                status: newStatus,
                updated_at: new Date().toISOString()
            };
            
            await DB.put('inventory_items', updatedItem);

            // Log de inventario con información de stock
            const logId = Utils.generateId();
            await DB.add('inventory_logs', {
                id: logId,
                item_id: item.id,
                action: 'vendida',
                quantity: item.quantity,
                stock_before: currentItem.stock_actual ?? 1,
                stock_after: newStock,
                reason: 'venta',
                notes: `Venta ${folio} - Cantidad: ${item.quantity}`,
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

            // Emitir evento de actualización de inventario
            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('inventory-updated', {
                    item: updatedItem,
                    isNew: false,
                    oldStatus: currentItem.status,
                    newStatus: newStatus,
                    stockChange: item.quantity,
                    reason: 'venta'
                });
            }
        }

        // Registrar COGS automáticamente
        if (typeof Costs !== 'undefined' && totalCOGS > 0) {
            await Costs.registerCOGS(sale.id, totalCOGS, branchId, sale.folio);
        }

        // Actualizar venta con comisiones totales
        sale.seller_commission = totalSellerCommission;
        sale.guide_commission = totalGuideCommission;
        await DB.put('sales', sale);

        // Registrar comisiones automáticamente
        if (typeof Costs !== 'undefined') {
            if (totalSellerCommission > 0 && sellerId) {
                await Costs.registerCommission(sale.id, totalSellerCommission, branchId, sale.folio, 'seller', sellerId);
            }
            if (totalGuideCommission > 0 && guideId) {
                await Costs.registerCommission(sale.id, totalGuideCommission, branchId, sale.folio, 'guide', guideId);
            }
        }

        // Crear pagos
        await this.savePayments(sale.id);

        // Actualizar historial del cliente si existe
        if (customerId && typeof Customers !== 'undefined') {
            try {
                const customer = await DB.get('customers', customerId);
                if (customer) {
                    // Actualizar estadísticas del cliente
                    const customerSales = await DB.query('sales', 'customer_id', customerId) || [];
                    const totalSpent = customerSales
                        .filter(s => s.status === 'completada')
                        .reduce((sum, s) => sum + (s.total || 0), 0);
                    
                    const lastSale = customerSales
                        .filter(s => s.status === 'completada')
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    
                    await DB.put('customers', {
                        ...customer,
                        totalSpent: totalSpent,
                        lastPurchaseDate: lastSale ? lastSale.created_at : customer.lastPurchaseDate || customer.lastPurchase,
                        lastPurchase: lastSale ? lastSale.created_at : customer.lastPurchase,
                        purchaseCount: customerSales.filter(s => s.status === 'completada').length,
                        updated_at: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Error actualizando historial del cliente:', error);
                // No bloquear la venta si falla la actualización del cliente
            }
        }

        // Agregar a cola de sincronización
        await SyncManager.addToQueue('sale', sale.id);

        // Guardar última venta
        this.lastSale = sale;

        // Emitir evento de venta completada para otros módulos
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.emit('sale-completed', {
                sale: sale,
                branchId: branchId,
                total: total,
                items: this.cart
            });
        }

        // Imprimir ticket (siempre intentar, incluso si hay errores)
        try {
            await Printer.printTicket(sale);
        } catch (e) {
            console.error('Error crítico al imprimir ticket:', e);
            // No bloquear la venta por error de impresión
            Utils.showNotification('Venta completada, pero hubo un error al imprimir. Puedes reimprimir desde el historial.', 'warning');
        }

        // Mostrar overlay de éxito
        this.showSuccessOverlay(sale);

        // Reset
        const itemIds = this.cart.map(c => c.id);
        this.resetForm();
        itemIds.forEach(id => this.updateProductCard(id, false));
        await this.updateTodaySalesCount();
        await this.loadProducts();

        // Las ventas ya contienen toda la información (vendedor, guía, agencia, productos, pagos)
        // No es necesario agregar al módulo de llegadas, ya que las llegadas se registran por separado
        } finally {
            this.isProcessingSale = false;
        }
    },

    async savePayments(saleId) {
        const cashUsd = parseFloat(document.getElementById('payment-cash-usd')?.value || 0);
        const cashMxn = parseFloat(document.getElementById('payment-cash-mxn')?.value || 0);
        const cashCad = parseFloat(document.getElementById('payment-cash-cad')?.value || 0);
        const tpvVisa = parseFloat(document.getElementById('payment-tpv-visa')?.value || 0);
        const tpvAmex = parseFloat(document.getElementById('payment-tpv-amex')?.value || 0);
        const tpvVisaBank = document.getElementById('payment-tpv-visa-bank')?.value || 'banamex';
        const tpvVisaType = document.getElementById('payment-tpv-visa-type')?.value || 'national';
        const tpvAmexBank = document.getElementById('payment-tpv-amex-bank')?.value || 'banamex';
        const tpvAmexType = document.getElementById('payment-tpv-amex-type')?.value || 'national';

        const paymentMethods = await DB.getAll('payment_methods') || [];
        const getMethodId = (code) => paymentMethods.find(m => m.code === code)?.id || code;

        // Función para calcular comisión bancaria
        const calculateBankCommission = async (amount, bank, paymentType) => {
            if (amount <= 0) return 0;
            
            const bankKey = `bank_commission_${bank}_${paymentType}`;
            const commissionSetting = await DB.get('settings', bankKey);
            const commissionRate = commissionSetting?.value || 0;
            
            return (amount * commissionRate) / 100;
        };

        if (cashUsd > 0) {
            await DB.add('payments', { 
                id: Utils.generateId(), 
                sale_id: saleId, 
                method_id: getMethodId('CASH_USD'), 
                amount: cashUsd, 
                currency: 'USD', 
                created_at: new Date().toISOString() 
            });
        }
        if (cashMxn > 0) {
            await DB.add('payments', { 
                id: Utils.generateId(), 
                sale_id: saleId, 
                method_id: getMethodId('CASH_MXN'), 
                amount: cashMxn, 
                currency: 'MXN', 
                created_at: new Date().toISOString() 
            });
        }
        if (cashCad > 0) {
            await DB.add('payments', { 
                id: Utils.generateId(), 
                sale_id: saleId, 
                method_id: getMethodId('CASH_CAD'), 
                amount: cashCad, 
                currency: 'CAD', 
                created_at: new Date().toISOString() 
            });
        }
        if (tpvVisa > 0) {
            const bankCommission = await calculateBankCommission(tpvVisa, tpvVisaBank, tpvVisaType);
            await DB.add('payments', { 
                id: Utils.generateId(), 
                sale_id: saleId, 
                method_id: getMethodId('TPV_VISA'), 
                amount: tpvVisa, 
                currency: 'MXN',
                bank: tpvVisaBank,
                payment_type: tpvVisaType,
                bank_commission: bankCommission,
                created_at: new Date().toISOString() 
            });

            // Registrar costo de comisión bancaria automáticamente
            if (typeof Costs !== 'undefined' && bankCommission > 0) {
                const sale = await DB.get('sales', saleId);
                const branchId = sale?.branch_id || (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
                await Costs.registerBankCommission(saleId, bankCommission, branchId, tpvVisaBank, tpvVisaType, sale?.folio);
            }
        }
        if (tpvAmex > 0) {
            const bankCommission = await calculateBankCommission(tpvAmex, tpvAmexBank, tpvAmexType);
            await DB.add('payments', { 
                id: Utils.generateId(), 
                sale_id: saleId, 
                method_id: getMethodId('TPV_AMEX'), 
                amount: tpvAmex, 
                currency: 'MXN',
                bank: tpvAmexBank,
                payment_type: tpvAmexType,
                bank_commission: bankCommission,
                created_at: new Date().toISOString() 
            });

            // Registrar costo de comisión bancaria automáticamente
            if (typeof Costs !== 'undefined' && bankCommission > 0) {
                const sale = await DB.get('sales', saleId);
                const branchId = sale?.branch_id || (typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null);
                await Costs.registerBankCommission(saleId, bankCommission, branchId, tpvAmexBank, tpvAmexType, sale?.folio);
            }
        }
    },

    showSuccessOverlay(sale) {
        const overlay = document.getElementById('pos-success-overlay');
        const folioEl = document.getElementById('pos-success-folio');
        const totalEl = document.getElementById('pos-success-total');

        if (overlay) {
            if (folioEl) folioEl.textContent = `Folio: ${sale.folio}`;
            if (totalEl) totalEl.textContent = Utils.formatCurrency(sale.total);
            overlay.style.display = 'flex';
        }
    },

    closeSuccessOverlay() {
        const overlay = document.getElementById('pos-success-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    async printLastTicket() {
        if (this.lastSale) {
            await Printer.printTicket(this.lastSale);
        }
        this.closeSuccessOverlay();
    },

    // ==================== BORRADOR Y APARTAR ====================

    async saveDraft() {
        if (this.cart.length === 0) {
            Utils.showNotification('El carrito está vacío', 'error');
            return;
        }

        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id') || 'default';
        const branch = await DB.get('catalog_branches', branchId);
        const branchCode = branch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'SUC';
        const folio = Utils.generateFolio(branchCode);
        const total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);

        const sale = {
            id: Utils.generateId(),
            folio: folio,
            branch_id: branchId,
            seller_id: UserManager.currentUser?.employee_id || null,
            agency_id: this.currentAgency?.id || null,
            guide_id: this.currentGuide?.id || null,
            customer_id: this.currentCustomer?.id || null,
            total: total,
            status: 'borrador',
            cart_data: JSON.stringify(this.cart),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        };

        await DB.add('sales', sale);
        await SyncManager.addToQueue('sale', sale.id);
        
        Utils.showNotification(`Borrador guardado: ${folio}`, 'success');
        this.resetForm();
        await this.loadPendingSales();
    },

    async reserveSale() {
        if (this.cart.length === 0) {
            Utils.showNotification('El carrito está vacío', 'error');
            return;
        }

        // Validar pagos (anticipo)
        await this.calculatePayments();
        const totalPayments = parseFloat(document.getElementById('payments-total')?.textContent.replace(/[^0-9.-]/g, '') || 0);
        
        if (totalPayments <= 0) {
            if (!await Utils.confirm('No hay anticipo registrado. ¿Continuar?')) {
                return;
            }
        }

        const branchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id') || 'default';
        const branch = await DB.get('catalog_branches', branchId);
        const branchCode = branch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'SUC';
        const folio = Utils.generateFolio(branchCode);
        const total = this.cart.reduce((sum, item) => sum + item.subtotal, 0);

        const sale = {
            id: Utils.generateId(),
            folio: folio,
            branch_id: branchId,
            seller_id: UserManager.currentUser?.employee_id || null,
            agency_id: this.currentAgency?.id || null,
            guide_id: this.currentGuide?.id || null,
            customer_id: this.currentCustomer?.id || null,
            subtotal: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            discount: this.cart.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0) / 100), 0),
            total: total,
            status: 'apartada',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        };

        await DB.add('sales', sale);

        // Guardar items y actualizar inventario
        for (const item of this.cart) {
            // Obtener item actualizado para obtener el costo
            const currentItem = await DB.get('inventory_items', item.id);
            const itemCost = currentItem?.cost || 0; // Costo de adquisición del item
            
            await DB.add('sale_items', {
                id: Utils.generateId(),
                sale_id: sale.id,
                item_id: item.id,
                quantity: item.quantity,
                price: item.price, // Precio de venta
                cost: itemCost, // Costo de adquisición (COGS)
                discount: item.discount,
                subtotal: item.subtotal,
                created_at: new Date().toISOString()
            });

            // Obtener item actualizado (ya lo tenemos arriba, pero lo mantenemos para consistencia)
            if (currentItem) {
                // No reducimos stock al apartar, solo cambiamos estado
                await DB.put('inventory_items', { 
                    ...currentItem, 
                    status: 'apartada',
                    updated_at: new Date().toISOString()
                });
                
                // Log de apartado
                const logId = Utils.generateId();
                await DB.add('inventory_logs', {
                    id: logId,
                    item_id: item.id,
                    action: 'apartada',
                    quantity: 0,
                    notes: `Apartado ${folio}`,
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
        }

        // Guardar pagos (anticipo)
        await this.savePayments(sale.id);

        await SyncManager.addToQueue('sale', sale.id);
        Utils.showNotification(`Apartado creado: ${folio}`, 'success');
        
        const itemIds = this.cart.map(c => c.id);
        this.resetForm();
        itemIds.forEach(id => this.updateProductCard(id, false));
        await this.loadProducts();
    },

    // ==================== PAUSAR/RETOMAR VENTAS ====================

    async holdSale() {
        if (this.cart.length === 0) {
            Utils.showNotification('El carrito está vacío', 'info');
            return;
        }

        const pendingSale = {
            id: Utils.generateId(),
            cart: [...this.cart],
            guide: this.currentGuide,
            agency: this.currentAgency,
            seller: this.currentSeller,
            customer: this.currentCustomer,
            discount: this.currentDiscount,
            timestamp: Date.now()
        };

        this.pendingSales.push(pendingSale);
        await this.savePendingSales();
        this.updatePendingCount();

        Utils.showNotification('Venta pausada', 'success');
        
        const itemIds = this.cart.map(c => c.id);
        this.resetForm();
        itemIds.forEach(id => this.updateProductCard(id, false));
    },

    async resumeSale(saleId) {
        const sale = this.pendingSales.find(s => s.id === saleId);
        if (!sale) return;

        // Restaurar carrito
        this.cart = sale.cart;
        this.currentGuide = sale.guide;
        this.currentAgency = sale.agency;
        this.currentSeller = sale.seller;
        this.currentCustomer = sale.customer;
        this.currentDiscount = sale.discount || 0;

        // Remover de pendientes
        this.pendingSales = this.pendingSales.filter(s => s.id !== saleId);
        await this.savePendingSales();
        this.updatePendingCount();

        // Actualizar UI
        this.updateCartDisplay();
        this.calculateTotals();
        this.updateCustomerDisplay();
        this.cart.forEach(item => this.updateProductCard(item.id, true));

        Utils.showNotification('Venta retomada', 'success');
        UI.closeModal();
    },

    async deletePendingSale(saleId) {
        if (!await Utils.confirm('¿Eliminar esta venta pendiente?')) return;
        
        this.pendingSales = this.pendingSales.filter(s => s.id !== saleId);
        await this.savePendingSales();
        this.updatePendingCount();
        this.showPendingSales();
    },

    async savePendingSales() {
        localStorage.setItem('pos_pending_sales', JSON.stringify(this.pendingSales));
    },

    async loadPendingSales() {
        try {
            const saved = localStorage.getItem('pos_pending_sales');
            this.pendingSales = saved ? JSON.parse(saved) : [];
            this.updatePendingCount();
        } catch (e) {
            this.pendingSales = [];
        }
    },

    updatePendingCount() {
        const el = document.getElementById('pending-count');
        if (el) {
            el.textContent = this.pendingSales.length;
            el.style.display = this.pendingSales.length > 0 ? 'flex' : 'none';
        }
    },

    showPendingSales() {
        if (this.pendingSales.length === 0) {
            Utils.showNotification('No hay ventas pendientes', 'info');
            return;
        }

        const body = `
            <div style="max-height: 400px; overflow-y: auto;">
                ${this.pendingSales.map(sale => `
                    <div style="padding: 16px; background: var(--color-bg-secondary); border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--color-border-light);">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                            <div>
                                <strong>${sale.cart.length} producto${sale.cart.length !== 1 ? 's' : ''}</strong>
                                <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                                    ${new Date(sale.timestamp).toLocaleString('es-MX')}
                                </div>
                            </div>
                            <strong style="color: var(--color-primary);">
                                ${Utils.formatCurrency(sale.cart.reduce((sum, item) => sum + item.subtotal, 0))}
                            </strong>
                        </div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 12px;">
                            ${sale.cart.map(item => item.name || item.sku).join(', ')}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-primary btn-sm" onclick="window.POS.resumeSale('${sale.id}')">
                                <i class="fas fa-play"></i> Retomar
                            </button>
                            <button class="btn-danger btn-sm" onclick="window.POS.deletePendingSale('${sale.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        UI.showModal('Ventas Pendientes', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>');
    },

    async showDrafts() {
        try {
            // Obtener sucursal actual para filtrar
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || null;
            
            // Obtener todas las ventas con status 'borrador'
            const allSales = await DB.getAll('sales') || [];
            const drafts = allSales.filter(sale => {
                if (sale.status !== 'borrador') return false;
                // Filtrar por sucursal si está configurada
                if (currentBranchId && sale.branch_id && sale.branch_id !== currentBranchId) return false;
                return true;
            }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            if (drafts.length === 0) {
                Utils.showNotification('No hay borradores guardados', 'info');
                return;
            }

            // Obtener información adicional
            const branches = await DB.getAll('catalog_branches') || [];
            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];

            const body = `
                <div style="max-height: 500px; overflow-y: auto;">
                    ${drafts.map(sale => {
                        const branch = branches.find(b => b.id === sale.branch_id);
                        const seller = sellers.find(s => s.id === sale.seller_id);
                        const guide = guides.find(g => g.id === sale.guide_id);
                        const agency = agencies.find(a => a.id === sale.agency_id);
                        
                        let cartItems = [];
                        try {
                            cartItems = sale.cart_data ? JSON.parse(sale.cart_data) : [];
                        } catch (e) {
                            cartItems = [];
                        }

                        return `
                            <div style="padding: 16px; background: var(--color-bg-secondary); border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--color-border-light);">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                    <div>
                                        <strong style="color: var(--color-primary);">${sale.folio || 'Sin folio'}</strong>
                                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                                            ${Utils.formatDate(sale.created_at, 'DD/MM/YYYY HH:mm')}
                                        </div>
                                        ${branch ? `<div style="font-size: 11px; color: var(--color-text-secondary);">${branch.name}</div>` : ''}
                                    </div>
                                    <strong style="color: var(--color-primary); font-size: 18px;">
                                        ${Utils.formatCurrency(sale.total || 0)}
                                    </strong>
                                </div>
                                <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px;">
                                    <div><strong>Productos:</strong> ${cartItems.length} item${cartItems.length !== 1 ? 's' : ''}</div>
                                    ${seller ? `<div><strong>Vendedor:</strong> ${seller.name}</div>` : ''}
                                    ${guide ? `<div><strong>Guía:</strong> ${guide.name}</div>` : ''}
                                    ${agency ? `<div><strong>Agencia:</strong> ${agency.name}</div>` : ''}
                                </div>
                                ${cartItems.length > 0 ? `
                                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: 12px; max-height: 60px; overflow-y: auto;">
                                        ${cartItems.slice(0, 3).map(item => `${item.name || item.sku} (${item.quantity}x)`).join(', ')}
                                        ${cartItems.length > 3 ? `... y ${cartItems.length - 3} más` : ''}
                                    </div>
                                ` : ''}
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn-primary btn-sm" onclick="window.POS.loadDraft('${sale.id}')">
                                        <i class="fas fa-edit"></i> Cargar
                                    </button>
                                    <button class="btn-secondary btn-sm" onclick="window.POS.completeDraft('${sale.id}')">
                                        <i class="fas fa-check"></i> Completar
                                    </button>
                                    <button class="btn-danger btn-sm" onclick="window.POS.deleteDraft('${sale.id}')">
                                        <i class="fas fa-trash"></i> Eliminar
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            UI.showModal('Borradores Guardados', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>');
        } catch (e) {
            console.error('Error mostrando borradores:', e);
            Utils.showNotification('Error al cargar borradores', 'error');
        }
    },

    async loadDraft(saleId) {
        try {
            const sale = await DB.get('sales', saleId);
            if (!sale || sale.status !== 'borrador') {
                Utils.showNotification('Borrador no encontrado', 'error');
                return;
            }

            // Cargar el carrito desde cart_data
            let cartItems = [];
            try {
                cartItems = sale.cart_data ? JSON.parse(sale.cart_data) : [];
            } catch (e) {
                Utils.showNotification('Error al cargar datos del borrador', 'error');
                return;
            }

            // Limpiar carrito actual
            this.cart = [];

            // Cargar items al carrito
            for (const item of cartItems) {
                const inventoryItem = await DB.get('inventory_items', item.id);
                if (inventoryItem) {
                    this.cart.push({
                        id: item.id,
                        name: inventoryItem.name,
                        sku: inventoryItem.sku,
                        price: item.price || inventoryItem.price,
                        quantity: item.quantity || 1,
                        discount: item.discount || 0,
                        subtotal: item.subtotal || (item.price * (item.quantity || 1))
                    });
                }
            }

            // Cargar información adicional
            if (sale.seller_id) {
                const seller = await DB.get('catalog_sellers', sale.seller_id);
                if (seller) {
                    this.currentSeller = seller;
                    this.updateSellerDisplay();
                }
            }

            if (sale.guide_id) {
                const guide = await DB.get('catalog_guides', sale.guide_id);
                if (guide) {
                    this.currentGuide = guide;
                    this.updateGuideDisplay();
                }
            }

            if (sale.agency_id) {
                const agency = await DB.get('catalog_agencies', sale.agency_id);
                if (agency) {
                    this.currentAgency = agency;
                    this.updateAgencyDisplay();
                }
            }

            if (sale.customer_id) {
                const customer = await DB.get('customers', sale.customer_id);
                if (customer) {
                    this.currentCustomer = customer;
                    this.updateCustomerDisplay();
                }
            }

            // Actualizar UI
            this.updateCart();
            this.updateTotals();

            // Eliminar el borrador después de cargarlo
            await this.deleteDraft(saleId);

            Utils.showNotification('Borrador cargado correctamente', 'success');
            UI.closeModal();
        } catch (e) {
            console.error('Error cargando borrador:', e);
            Utils.showNotification('Error al cargar el borrador', 'error');
        }
    },

    async completeDraft(saleId) {
        try {
            const sale = await DB.get('sales', saleId);
            if (!sale || sale.status !== 'borrador') {
                Utils.showNotification('Borrador no encontrado', 'error');
                return;
            }

            // Cargar el borrador primero
            await this.loadDraft(saleId);
            
            // Completar la venta
            await this.completeSale();
        } catch (e) {
            console.error('Error completando borrador:', e);
            Utils.showNotification('Error al completar el borrador', 'error');
        }
    },

    async deleteDraft(saleId) {
        if (!await Utils.confirm('¿Eliminar este borrador?')) return;

        try {
            await DB.delete('sales', saleId);
            
            // También eliminar los sale_items asociados si existen
            const saleItems = await DB.query('sale_items', 'sale_id', saleId) || [];
            for (const item of saleItems) {
                await DB.delete('sale_items', item.id);
            }

            Utils.showNotification('Borrador eliminado', 'success');
            
            // Recargar la lista si el modal está abierto
            const modal = document.getElementById('modal-container');
            if (modal && modal.style.display !== 'none') {
                await this.showDrafts();
            }
        } catch (e) {
            console.error('Error eliminando borrador:', e);
            Utils.showNotification('Error al eliminar el borrador', 'error');
        }
    },

    // ==================== FAVORITOS ====================

    async loadFavorites() {
        try {
            const saved = localStorage.getItem('pos_favorites');
            this.favorites = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.favorites = [];
        }
    },

    async addToFavorites(itemId) {
        if (!this.favorites.includes(itemId)) {
            this.favorites.push(itemId);
            localStorage.setItem('pos_favorites', JSON.stringify(this.favorites));
            Utils.showNotification('Agregado a favoritos', 'success');
        }
    },

    async removeFromFavorites(itemId) {
        this.favorites = this.favorites.filter(id => id !== itemId);
        localStorage.setItem('pos_favorites', JSON.stringify(this.favorites));
    },

    async showFavorites() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        if (this.favorites.length === 0) {
            Utils.showNotification('No hay favoritos guardados', 'info');
            return;
        }

        try {
            const items = await Promise.all(this.favorites.map(id => DB.get('inventory_items', id)));
            const validItems = items.filter(item => {
                if (!item || item.status !== 'disponible') return false;
                // Verificar stock disponible
                const stockActual = item.stock_actual ?? 1;
                return stockActual > 0;
            });

            if (validItems.length === 0) {
                Utils.showNotification('No hay favoritos disponibles', 'info');
                return;
            }

            const body = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; max-height: 400px; overflow-y: auto;">
                    ${validItems.map(item => `
                        <div style="padding: 12px; background: var(--color-bg-secondary); border-radius: 8px; text-align: center; cursor: pointer; border: 1px solid var(--color-border-light); transition: all 0.2s;"
                             onclick="window.POS.selectProduct('${item.id}'); UI.closeModal();">
                            <div style="font-size: 32px; margin-bottom: 8px; color: var(--color-primary);"><i class="fas fa-gem"></i></div>
                            <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">${item.name || 'Sin nombre'}</div>
                            <div style="font-size: 10px; color: var(--color-text-secondary);">${item.sku || 'N/A'}</div>
                            <div style="font-size: 14px; font-weight: 700; color: var(--color-primary); margin-top: 8px;">
                                ${Utils.formatCurrency(item.cost || 0)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            UI.showModal('Favoritos', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>');
        } catch (e) {
            console.error('Error loading favorites:', e);
        }
    },

    // ==================== VISTA RÁPIDA ====================

    async showQuickView(itemId) {
        console.log('POS.showQuickView llamado con itemId:', itemId);
        if (!itemId) {
            console.error('POS.showQuickView: itemId no proporcionado');
            return;
        }
        try {
            const item = await DB.get('inventory_items', itemId);
            if (!item) {
                console.error('POS.showQuickView: Item no encontrado:', itemId);
                return;
            }

            let photo = null;
            try {
                const photos = await DB.query('inventory_photos', 'item_id', item.id);
                photo = photos && photos.length > 0 ? photos[0]?.photo_blob || photos[0]?.thumbnail_blob : null;
            } catch (e) {}

            const modal = document.getElementById('pos-quick-view');
            const body = document.getElementById('pos-quick-view-body');

            if (modal && body) {
                body.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                        <div>
                            <div style="width: 100%; height: 250px; background: var(--color-bg-secondary); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                ${photo ? 
                                    `<img src="${photo}" style="width: 100%; height: 100%; object-fit: cover;">` :
                                    `<i class="fas fa-gem" style="font-size: 72px; color: var(--color-primary);"></i>`
                                }
                            </div>
                        </div>
                        <div>
                            <h3 style="font-size: 20px; margin-bottom: 8px;">${item.name || 'Sin nombre'}</h3>
                            <p style="color: var(--color-text-secondary); font-family: monospace; margin-bottom: 16px;">${item.sku || item.barcode || 'N/A'}</p>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                                ${item.metal ? `<div><strong>Metal:</strong><br>${item.metal}</div>` : ''}
                                ${item.stone ? `<div><strong>Piedra:</strong><br>${item.stone}</div>` : ''}
                                ${item.weight_g ? `<div><strong>Peso:</strong><br>${item.weight_g}g</div>` : ''}
                                ${item.size ? `<div><strong>Talla:</strong><br>${item.size}</div>` : ''}
                                ${item.measures ? `<div><strong>Medidas:</strong><br>${item.measures}</div>` : ''}
                                ${item.certificate ? `<div><strong>Certificado:</strong><br><span style="color: #22c55e;">✓ Sí</span></div>` : ''}
                            </div>
                            
                            <div style="font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 24px;">
                                ${Utils.formatCurrency(item.cost || 0)}
                            </div>
                            
                            <div style="display: flex; gap: 12px;">
                                <button class="btn-primary" style="flex: 1;" onclick="window.POS.selectProduct('${item.id}'); window.POS.closeQuickView();">
                                    <i class="fas fa-plus"></i> Agregar al Carrito
                                </button>
                                <button class="btn-secondary" onclick="window.POS.addToFavorites('${item.id}')" title="Agregar a Favoritos">
                                    <i class="fas fa-star"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                modal.style.display = 'flex';
            }
        } catch (e) {
            console.error('Error showing quick view:', e);
        }
    },

    closeQuickView() {
        const modal = document.getElementById('pos-quick-view');
        if (modal) modal.style.display = 'none';
    },

    // ==================== GUÍA/AGENCIA/CLIENTE ====================

    async setGuide(guide) {
        this.currentGuide = guide;
        
        if (guide.agency_id) {
            const agency = await DB.get('catalog_agencies', guide.agency_id);
            this.currentAgency = agency;
        }
        
        this.updateCustomerDisplay();
        Utils.showNotification(`Guía ${guide.name} cargado. Ahora escanea el VENDEDOR.`, 'success');
    },

    async setSeller(seller) {
        this.currentSeller = seller;
        this.updateCustomerDisplay();
        Utils.showNotification(`Vendedor ${seller.name} asignado. Ahora escanea los PRODUCTOS.`, 'success');
    },

    clearGuide() {
        this.currentGuide = null;
        this.currentAgency = null;
        this.updateCustomerDisplay();
        Utils.showNotification('Guía y agencia limpiados', 'info');
    },

    clearSeller() {
        this.currentSeller = null;
        this.updateCustomerDisplay();
        Utils.showNotification('Vendedor limpiado', 'info');
    },

    clearSaleInfo() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        this.currentGuide = null;
        this.currentAgency = null;
        this.currentSeller = null;
        this.currentCustomer = null;
        this.updateCustomerDisplay();
        Utils.showNotification('Información de venta limpiada', 'info');
    },

    updateCustomerDisplay() {
        const guideEl = document.getElementById('pos-current-guide');
        const agencyEl = document.getElementById('pos-current-agency');
        const sellerEl = document.getElementById('pos-current-seller');
        
        if (guideEl) {
            guideEl.innerHTML = this.currentGuide ? 
                `<span style="font-weight: 600;">${this.currentGuide.name}</span>` : 
                '<span class="pos-placeholder">Sin guía</span>';
        }
        
        if (agencyEl) {
            agencyEl.innerHTML = this.currentAgency ? 
                `<span style="font-weight: 600;">${this.currentAgency.name}</span>` : 
                '<span class="pos-placeholder">Sin agencia</span>';
        }

        if (sellerEl) {
            sellerEl.innerHTML = this.currentSeller ? 
                `<span style="font-weight: 600;">${this.currentSeller.name}</span>` : 
                '<span class="pos-placeholder">Sin vendedor</span>';
        }
    },

    async searchCustomer() {
        const query = document.getElementById('pos-customer-search')?.value.trim();
        if (!query || query.length < 2) return;

        try {
            const customers = await DB.getAll('customers') || [];
            const matches = customers.filter(c => 
                c.name?.toLowerCase().includes(query.toLowerCase()) ||
                c.email?.toLowerCase().includes(query.toLowerCase()) ||
                c.phone?.includes(query)
            );

            if (matches.length === 1) {
                this.currentCustomer = matches[0];
                document.getElementById('pos-customer-search').value = matches[0].name;
                Utils.showNotification(`Cliente: ${matches[0].name}`, 'success');
            } else if (matches.length > 1) {
                this.showCustomerResults(matches);
            }
        } catch (e) {
            console.error('Error searching customers:', e);
        }
    },

    showCustomerResults(customers) {
        const body = customers.map(c => `
            <div style="padding: 12px; border-bottom: 1px solid var(--color-border-light); cursor: pointer;"
                 onclick="window.POS.selectCustomer('${c.id}'); UI.closeModal();">
                <strong>${c.name}</strong>
                ${c.phone ? `<br><small>${c.phone}</small>` : ''}
                ${c.email ? `<br><small>${c.email}</small>` : ''}
            </div>
        `).join('');

        UI.showModal('Seleccionar Cliente', body, '<button class="btn-secondary" onclick="UI.closeModal()">Cerrar</button>');
    },

    async selectCustomer(customerId) {
        const customer = await DB.get('customers', customerId);
        if (customer) {
            this.currentCustomer = customer;
            document.getElementById('pos-customer-search').value = customer.name;
        }
    },

    async quickAddCustomer() {
        const name = await Utils.prompt('Nombre del cliente:', '', 'Nuevo Cliente');
        if (!name) return;

        const phone = await Utils.prompt('Teléfono (opcional):', '', 'Nuevo Cliente');
        const email = await Utils.prompt('Email (opcional):', '', 'Nuevo Cliente');

        const customer = {
            id: Utils.generateId(),
            name: name,
            phone: phone || '',
            email: email || '',
            created_at: new Date().toISOString()
        };

        await DB.add('customers', customer);
        this.currentCustomer = customer;
        document.getElementById('pos-customer-search').value = customer.name;
        Utils.showNotification('Cliente creado', 'success');
    },

    // ==================== HISTORIAL ====================

    async showHistory() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        try {
            // Obtener sucursal actual y filtrar ventas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            const sales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            const recentSales = sales
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 50);

            const sellers = await DB.getAll('catalog_sellers') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            
            const today = new Date().toISOString().split('T')[0];
            const todaySales = recentSales.filter(s => s.created_at?.startsWith(today) && s.status === 'completada');
            const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);

            const body = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                        <div class="kpi-card">
                            <div class="kpi-label">Ventas Hoy</div>
                            <div class="kpi-value">${todaySales.length}</div>
                        </div>
                        <div class="kpi-card">
                        <div class="kpi-label">Total Hoy</div>
                        <div class="kpi-value">${Utils.formatCurrency(todayTotal)}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">Ticket Promedio</div>
                        <div class="kpi-value">${Utils.formatCurrency(todaySales.length > 0 ? todayTotal / todaySales.length : 0)}</div>
                        </div>
                        </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    <table class="cart-table" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th>Folio</th>
                                <th>Fecha</th>
                                <th>Total</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentSales.map(sale => {
                                const seller = sellers.find(s => s.id === sale.seller_id);
                                return `
                                    <tr>
                                        <td><strong>${sale.folio}</strong></td>
                                        <td>${Utils.formatDate(sale.created_at, 'DD/MM HH:mm')}</td>
                                        <td>${Utils.formatCurrency(sale.total)}</td>
                                        <td><span class="status-badge status-${sale.status}">${sale.status}</span></td>
                                        <td>
                                            <button class="btn-secondary btn-xs" onclick="window.POS.viewSale('${sale.id}')">Ver</button>
                                            ${sale.status === 'completada' ? `
                                                <button class="btn-secondary btn-xs" onclick="window.POS.reprintTicket('${sale.id}')">
                                                    <i class="fas fa-print"></i>
                                                </button>
                                            ` : ''}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            UI.showModal('Historial de Ventas', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        } catch (e) {
            console.error('Error loading history:', e);
            Utils.showNotification('Error al cargar historial', 'error');
        }
    },

    async viewSale(saleId) {
        const sale = await DB.get('sales', saleId);
        if (!sale) return;

        const items = await DB.query('sale_items', 'sale_id', saleId) || [];
        const payments = await DB.query('payments', 'sale_id', saleId) || [];
        
        const inventoryItems = await Promise.all(items.map(async item => {
            const inv = await DB.get('inventory_items', item.item_id);
            return { ...item, inventory: inv };
        }));

        const body = `
            <div style="display: grid; gap: 16px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                        <h4 style="margin-bottom: 12px;">Información</h4>
                    <p><strong>Folio:</strong> ${sale.folio}</p>
                    <p><strong>Fecha:</strong> ${Utils.formatDate(sale.created_at, 'DD/MM/YYYY HH:mm')}</p>
                    <p><strong>Estado:</strong> <span class="status-badge status-${sale.status}">${sale.status}</span></p>
                </div>
                <div>
                        <h4 style="margin-bottom: 12px;">Totales</h4>
                        <p><strong>Subtotal:</strong> ${Utils.formatCurrency(sale.subtotal)}</p>
                        <p><strong>Descuento:</strong> ${Utils.formatCurrency(sale.discount)}</p>
                        <p style="font-size: 18px;"><strong>Total:</strong> ${Utils.formatCurrency(sale.total)}</p>
                            </div>
                    </div>
                <div>
                    <h4 style="margin-bottom: 12px;">Productos</h4>
                    <div style="max-height: 150px; overflow-y: auto;">
                        ${inventoryItems.map(item => `
                            <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px; margin-bottom: 4px;">
                                <span>${item.inventory?.name || 'N/A'} x${item.quantity}</span>
                                <span>${Utils.formatCurrency(item.subtotal)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const footer = `
            ${sale.status === 'completada' ? `
                <button class="btn-secondary" onclick="window.POS.reprintTicket('${sale.id}')">
                    <i class="fas fa-print"></i> Reimprimir
                </button>
            ` : ''}
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Venta: ${sale.folio}`, body, footer);
    },

    async reprintTicket(saleId) {
        const sale = await DB.get('sales', saleId);
        if (sale) {
            await Printer.printTicket(sale);
        }
    },

    // ==================== UTILIDADES ====================

    toggleAdvancedFilters() {
        const filters = document.getElementById('pos-advanced-filters');
        const chevron = document.getElementById('pos-filters-chevron');
        
        if (filters) {
            const isOpen = filters.style.display !== 'none';
            filters.style.display = isOpen ? 'none' : 'block';
            if (chevron) {
                chevron.style.transform = isOpen ? 'rotate(0)' : 'rotate(180deg)';
            }
        }
    },

    clearSearch() {
        const input = document.getElementById('pos-product-search');
        if (input) {
            input.value = '';
            this.loadProducts();
        }
    },

    startBarcodeScanner() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        // Validar que el módulo esté inicializado
        if (!this.initialized) {
            console.warn('POS: Módulo no inicializado, intentando inicializar...');
            if (this.init) {
                this.init().then(() => {
                    this.startBarcodeScanner();
                }).catch(err => {
                    console.error('Error inicializando POS:', err);
                    Utils.showNotification('Error al inicializar POS', 'error');
                });
            }
            return;
        }
        
        const input = document.getElementById('pos-product-search');
        if (input) {
            input.focus();
            input.select();
        }
        Utils.showNotification('Escanea el código de barras', 'info');
    },

    toggleFullscreen() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => {
                Utils.showNotification('No se pudo activar pantalla completa', 'warning');
            });
            this.isFullscreen = true;
        } else {
            document.exitFullscreen();
            this.isFullscreen = false;
        }
    },

    showShortcuts() {
        const body = `
            <div style="display: grid; gap: 8px;">
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Buscar producto</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F1</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Favoritos</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F2</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Ventas pendientes</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F3</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Historial</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F4</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Pausar venta</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F5</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Pantalla completa</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F11</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Completar venta</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">F12</kbd>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: var(--color-bg-secondary); border-radius: 4px;">
                    <span>Cerrar modal</span>
                    <kbd style="background: var(--color-bg-tertiary); padding: 2px 8px; border-radius: 4px; font-family: monospace;">Esc</kbd>
                </div>
            </div>
        `;

        UI.showModal('Atajos de Teclado', body, '<button class="btn-primary" onclick="UI.closeModal()">Entendido</button>');
    },

    resetForm() {
        this.cart = [];
        this.currentDiscount = 0;
        this.currentCustomer = null;
        // Limpiar guía, agencia y vendedor para nueva venta
        this.currentGuide = null;
        this.currentAgency = null;
        this.currentSeller = null;
        
        this.updateCartDisplay();
        this.calculateTotals();
        this.updateCustomerDisplay();
        this.clearCartStorage();

        // Limpiar inputs de pago
        ['cash-usd', 'cash-mxn', 'cash-cad', 'tpv-visa', 'tpv-amex'].forEach(id => {
            const input = document.getElementById(`payment-${id}`);
            if (input) input.value = '0';
        });
        
        this.calculatePayments();

        // Limpiar cliente
        const customerInput = document.getElementById('pos-customer-search');
        if (customerInput) customerInput.value = '';

        // Resetear chips de descuento
        document.querySelectorAll('.pos-discount-chip').forEach(chip => {
            chip.classList.remove('active');
            if (chip.dataset.discount === '0') chip.classList.add('active');
        });
    },

    // ==================== IMPRESORA ====================

    async togglePrinter() {
        // Validar que window.POS esté disponible
        if (!window.POS || !this) {
            console.error('POS: window.POS no está disponible');
            Utils.showNotification('Error: Módulo POS no disponible', 'error');
            return;
        }
        
        if (window.Printer && window.Printer.connected) {
            // Ya conectada, mostrar opciones
            const action = await this.showPrinterMenu();
            if (action === 'disconnect') {
                await window.Printer.disconnect();
                this.updatePrinterStatus();
            } else if (action === 'test') {
                await window.Printer.testPrint();
            } else if (action === 'reconnect') {
                await window.Printer.disconnect();
                await window.Printer.connectWithConfig();
                this.updatePrinterStatus();
            }
        } else {
            // No conectada, mostrar opciones de conexión
            const action = await this.showPrinterConnectMenu();
            if (action === 'connect') {
                await window.Printer.connect();
                this.updatePrinterStatus();
            } else if (action === 'config') {
                await window.Printer.connectWithConfig();
                this.updatePrinterStatus();
            }
        }
    },

    async showPrinterConnectMenu() {
        return new Promise((resolve) => {
            const savedBaud = localStorage.getItem('printer_baud_rate') || '9600';
            const body = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="text-align: center; padding: 16px; background: #fff3cd; border-radius: 8px;">
                        <i class="fas fa-print" style="font-size: 32px; color: #856404; margin-bottom: 8px;"></i>
                        <div style="font-weight: 600; color: #856404;">Impresora No Conectada</div>
                        <small style="color: #856404;">Selecciona tu impresora USB (puede aparecer como USB, COM, etc.)</small>
                    </div>
                    <button class="btn-primary" onclick="window._printerAction='connect'; UI.closeModal();" style="padding: 14px; font-size: 14px;">
                        <i class="fas fa-plug"></i> Conectar Rápido (${savedBaud} baud)
                    </button>
                    <button class="btn-secondary" onclick="window._printerAction='config'; UI.closeModal();" style="padding: 12px;">
                        <i class="fas fa-cog"></i> Configurar Velocidad
                    </button>
                    <div style="padding: 12px; background: var(--color-bg-secondary); border-radius: 8px; font-size: 11px; color: var(--color-text-secondary);">
                        <strong>💡 Tip:</strong> Si la impresora no responde, prueba con otra velocidad (baud rate). 
                        Las más comunes son 9600 y 115200.
                    </div>
                    <button class="btn-secondary" onclick="window._printerAction='cancel'; UI.closeModal();" style="padding: 10px;">
                        Cancelar
                    </button>
                </div>
            `;
            
            window._printerAction = 'cancel';
            UI.showModal('🖨️ Conectar Impresora', body, '');
            
            const checkAction = setInterval(() => {
                const modal = document.getElementById('modal-container');
                if (!modal || modal.style.display === 'none') {
                    clearInterval(checkAction);
                    resolve(window._printerAction);
                }
            }, 100);
        });
    },

    async showPrinterMenu() {
        return new Promise((resolve) => {
            const baudRate = window.Printer?.currentBaudRate || 9600;
            const body = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="text-align: center; padding: 16px; background: #d4edda; border-radius: 8px;">
                        <i class="fas fa-check-circle" style="font-size: 32px; color: #28a745; margin-bottom: 8px;"></i>
                        <div style="font-weight: 600; color: #28a745;">Impresora Conectada</div>
                        <small style="color: #28a745;">${baudRate} baud</small>
                    </div>
                    <button class="btn-primary" onclick="window._printerAction='test'; UI.closeModal();" style="padding: 12px;">
                        <i class="fas fa-print"></i> Imprimir Prueba
                    </button>
                    <button class="btn-secondary" onclick="window._printerAction='reconnect'; UI.closeModal();" style="padding: 12px;">
                        <i class="fas fa-sync"></i> Cambiar Configuración
                    </button>
                    <button class="btn-danger" onclick="window._printerAction='disconnect'; UI.closeModal();" style="padding: 12px;">
                        <i class="fas fa-unlink"></i> Desconectar
                    </button>
                    <button class="btn-secondary" onclick="window._printerAction='cancel'; UI.closeModal();" style="padding: 10px;">
                        Cancelar
                    </button>
                </div>
            `;
            
            window._printerAction = 'cancel';
            UI.showModal('🖨️ Impresora', body, '');
            
            const checkAction = setInterval(() => {
                const modal = document.getElementById('modal-container');
                if (!modal || modal.style.display === 'none') {
                    clearInterval(checkAction);
                    resolve(window._printerAction);
                }
            }, 100);
        });
    },

    updatePrinterStatus() {
        const btn = document.getElementById('btn-printer-connect');
        if (btn) {
            if (window.Printer && window.Printer.connected) {
                btn.classList.add('printer-connected');
                btn.title = 'Impresora Conectada - Click para opciones';
            } else {
                btn.classList.remove('printer-connected');
                btn.title = 'Conectar Impresora';
            }
        }
    }
});

// CRÍTICO: Exponer window.POS DESPUÉS de que Object.assign haya asignado todos los métodos
// Esto asegura que todos los métodos estén disponibles cuando se accede a window.POS
if (typeof window !== 'undefined') {
    window.POS = POS;
    console.log('✅ POS: window.POS expuesto con todos los métodos disponibles');
}

// #region agent log
// Log: window.POS expuesto
fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pos.js:2559',message:'window.POS expuesto después de definir objeto',data:{windowPOSExists:typeof window.POS !== 'undefined',windowPOSType:typeof window.POS,isPOSObject:window.POS === POS,posKeysCount:Object.keys(POS).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion
