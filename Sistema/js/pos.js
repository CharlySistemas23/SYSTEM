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

    // Carga progresiva: como Inventario, evitar renderizar todo el catálogo
    POS_GRID_BATCH_SIZE: 15,
    _posGridDisplayLimit: 0,
    _lastPosItems: [],

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
        this.setupSocketListeners(); // Configurar listeners de Socket.IO
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
        // Botón Completar venta: asegurar que funcione aunque window.POS se asigne después
        const completeBtn = document.getElementById('pos-complete-btn');
        if (completeBtn && !completeBtn.hasAttribute('data-listener-attached')) {
            completeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.POS && typeof window.POS.completeSale === 'function') {
                    window.POS.completeSale();
                } else {
                    Utils.showNotification('Espera a que el módulo POS termine de cargar e intenta de nuevo.', 'warning');
                }
            });
            completeBtn.setAttribute('data-listener-attached', 'true');
        }

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

        // Configurar dropdown de sucursal (solo para master_admin)
        this.setupBranchFilter();

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

        // Escuchar eventos Socket.IO de ventas actualizadas en tiempo real
        if (typeof window !== 'undefined') {
            let saleUpdateTimeout = null;
            
            // Evento para todas las sucursales (master_admin)
            window.addEventListener('sale-updated-all-branches', async (e) => {
                if (this.initialized) {
                    const { action, sale, branchId } = e.detail;
                    
                    // Limpiar timeout anterior
                    if (saleUpdateTimeout) {
                        clearTimeout(saleUpdateTimeout);
                    }
                    
                    // Usar debounce para agrupar actualizaciones rápidas
                    saleUpdateTimeout = setTimeout(async () => {
                        try {
                            if (action === 'deleted') {
                                // Eliminar de IndexedDB local
                                if (sale && sale.id) {
                                    // Eliminar sale_items relacionados
                                    const saleItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                    for (const item of saleItems) {
                                        await DB.delete('sale_items', item.id);
                                    }
                                    // Eliminar payments relacionados
                                    const payments = await DB.query('payments', 'sale_id', sale.id) || [];
                                    for (const payment of payments) {
                                        await DB.delete('payments', payment.id);
                                    }
                                    // Eliminar la venta
                                    await DB.delete('sales', sale.id);
                                    console.log(`🗑️ Venta ${sale.id} eliminada localmente por evento Socket.IO`);
                                }
                                
                                // Si el historial está abierto, recargarlo
                                if (document.getElementById('pos-history-branch-filter')) {
                                    await this.showHistory();
                                }
                                
                                // Actualizar contador de ventas del día
                                await this.updateTodaySalesCount();
                            } else if (action === 'updated' && sale) {
                                // Actualizar venta en IndexedDB
                                await DB.put('sales', sale, { autoBranchId: false });
                                
                                // Actualizar sale_items
                                if (sale.items && Array.isArray(sale.items)) {
                                    // Primero eliminar items antiguos
                                    const oldItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                    for (const oldItem of oldItems) {
                                        await DB.delete('sale_items', oldItem.id);
                                    }
                                    // Luego agregar items nuevos
                                    for (const item of sale.items) {
                                        await DB.add('sale_items', {
                                            ...item,
                                            sale_id: sale.id,
                                            created_at: item.created_at || new Date().toISOString()
                                        });
                                    }
                                }
                                
                                // Actualizar payments si vienen
                                if (sale.payments && Array.isArray(sale.payments)) {
                                    const oldPayments = await DB.query('payments', 'sale_id', sale.id) || [];
                                    for (const oldPayment of oldPayments) {
                                        await DB.delete('payments', oldPayment.id);
                                    }
                                    for (const payment of sale.payments) {
                                        await DB.add('payments', {
                                            ...payment,
                                            sale_id: sale.id,
                                            created_at: payment.created_at || new Date().toISOString()
                                        });
                                    }
                                }
                                
                                // Si el historial está abierto, recargarlo
                                if (document.getElementById('pos-history-branch-filter')) {
                                    await this.showHistory();
                                }
                                
                                // Actualizar contador
                                await this.updateTodaySalesCount();
                            } else if (action === 'created' && sale) {
                                // Venta nueva creada (ej. otra sucursal o otro dispositivo): guardar en IndexedDB y refrescar
                                try {
                                    await DB.put('sales', sale, { autoBranchId: false });
                                    if (sale.items && Array.isArray(sale.items)) {
                                        const oldItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                        for (const oldItem of oldItems) await DB.delete('sale_items', oldItem.id);
                                        for (const item of sale.items) {
                                            await DB.add('sale_items', { ...item, sale_id: sale.id, created_at: item.created_at || new Date().toISOString() });
                                        }
                                    }
                                    if (sale.payments && Array.isArray(sale.payments)) {
                                        const oldPayments = await DB.query('payments', 'sale_id', sale.id) || [];
                                        for (const oldPayment of oldPayments) await DB.delete('payments', oldPayment.id);
                                        for (const payment of sale.payments) {
                                            await DB.add('payments', { ...payment, sale_id: sale.id, created_at: payment.created_at || new Date().toISOString() });
                                        }
                                    }
                                } catch (err) { console.warn('POS: Error guardando venta creada en local:', err); }
                                if (document.getElementById('pos-history-branch-filter')) await this.showHistory();
                                const today = new Date().toISOString().split('T')[0];
                                const saleDate = sale.created_at?.split('T')[0];
                                if (saleDate === today) await this.updateTodaySalesCount();
                            }
                        } catch (error) {
                            console.error('Error procesando evento sale-updated:', error);
                        }
                    }, 300);
                }
            });
            
            // Evento para sucursal específica (usuarios normales y master_admin viendo su sucursal)
            window.addEventListener('sale-updated', async (e) => {
                if (this.initialized) {
                    const { action, sale, branchId } = e.detail;
                    
                    // Limpiar timeout anterior
                    if (saleUpdateTimeout) {
                        clearTimeout(saleUpdateTimeout);
                    }
                    
                    // Usar debounce
                    saleUpdateTimeout = setTimeout(async () => {
                        try {
                            if (action === 'deleted' && sale && sale.id) {
                                // Eliminar de IndexedDB local
                                const saleItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                for (const item of saleItems) {
                                    await DB.delete('sale_items', item.id);
                                }
                                const payments = await DB.query('payments', 'sale_id', sale.id) || [];
                                for (const payment of payments) {
                                    await DB.delete('payments', payment.id);
                                }
                                await DB.delete('sales', sale.id);
                                
                                if (document.getElementById('pos-history-branch-filter')) {
                                    await this.showHistory();
                                }
                                await this.updateTodaySalesCount();
                            } else if (action === 'updated' && sale) {
                                // Actualizar venta
                                await DB.put('sales', sale, { autoBranchId: false });
                                
                                if (sale.items) {
                                    const oldItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                    for (const oldItem of oldItems) {
                                        await DB.delete('sale_items', oldItem.id);
                                    }
                                    for (const item of sale.items) {
                                        await DB.add('sale_items', {
                                            ...item,
                                            sale_id: sale.id,
                                            created_at: item.created_at || new Date().toISOString()
                                        });
                                    }
                                }
                                
                                if (sale.payments) {
                                    const oldPayments = await DB.query('payments', 'sale_id', sale.id) || [];
                                    for (const oldPayment of oldPayments) {
                                        await DB.delete('payments', oldPayment.id);
                                    }
                                    for (const payment of sale.payments) {
                                        await DB.add('payments', {
                                            ...payment,
                                            sale_id: sale.id,
                                            created_at: payment.created_at || new Date().toISOString()
                                        });
                                    }
                                }
                                
                                if (document.getElementById('pos-history-branch-filter')) {
                                    await this.showHistory();
                                }
                                await this.updateTodaySalesCount();
                            } else if (action === 'created' && sale) {
                                // Venta nueva en esta sucursal (ej. otro dispositivo): guardar en IndexedDB y refrescar
                                try {
                                    await DB.put('sales', sale, { autoBranchId: false });
                                    if (sale.items && Array.isArray(sale.items)) {
                                        const oldItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                                        for (const oldItem of oldItems) await DB.delete('sale_items', oldItem.id);
                                        for (const item of sale.items) {
                                            await DB.add('sale_items', { ...item, sale_id: sale.id, created_at: item.created_at || new Date().toISOString() });
                                        }
                                    }
                                    if (sale.payments && Array.isArray(sale.payments)) {
                                        const oldPayments = await DB.query('payments', 'sale_id', sale.id) || [];
                                        for (const oldPayment of oldPayments) await DB.delete('payments', oldPayment.id);
                                        for (const payment of sale.payments) {
                                            await DB.add('payments', { ...payment, sale_id: sale.id, created_at: payment.created_at || new Date().toISOString() });
                                        }
                                    }
                                } catch (err) { console.warn('POS: Error guardando venta creada en local:', err); }
                                if (document.getElementById('pos-history-branch-filter')) await this.showHistory();
                                await this.updateTodaySalesCount();
                            }
                        } catch (error) {
                            console.error('Error procesando evento sale-updated:', error);
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
            const todayDate = new Date();
            const todayStr = typeof Utils !== 'undefined' && Utils.formatDate
                ? Utils.formatDate(todayDate, 'YYYY-MM-DD')
                : `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
            const todaySales = sales.filter(s => {
                if (!s.created_at) return false;
                const saleDate = new Date(s.created_at);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate
                    ? Utils.formatDate(saleDate, 'YYYY-MM-DD')
                    : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr && (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'));
            });
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
        try {
            // CACHE-FIRST: leer de IndexedDB primero
            const agencies = await DB.getAll('catalog_agencies') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const sellers = await DB.getAll('catalog_sellers') || [];
            const hasCache = agencies.length > 0 || guides.length > 0 || sellers.length > 0;
            
            if (hasCache) {
                console.log(`⚡ [Cache-First] Catálogos: ${agencies.length} agencias, ${guides.length} guías, ${sellers.length} vendedores desde IndexedDB`);
            }
            
            if (typeof API !== 'undefined' && API.baseURL && API.token) {
                if (hasCache) {
                    Promise.resolve().then(async () => {
                        try {
                            const [freshAgencies, freshGuides, freshSellers] = await Promise.all([
                                API.getAgencies('', true),
                                API.getGuides('', null, true),
                                API.getSellers('', true)
                            ]);
                            for (const a of freshAgencies) { try { await DB.put('catalog_agencies', a); } catch (e) {} }
                            for (const g of freshGuides) { try { await DB.put('catalog_guides', g); } catch (e) {} }
                            for (const s of freshSellers) { try { await DB.put('catalog_sellers', s); } catch (e) {} }
                            console.log('✅ Catálogos actualizados en background');
                        } catch (e) { console.warn('Error actualizando catálogos:', e); }
                    }).catch(e => {});
                } else {
                    try {
                        const [freshAgencies, freshGuides, freshSellers] = await Promise.all([
                            API.getAgencies('', true),
                            API.getGuides('', null, true),
                            API.getSellers('', true)
                        ]);
                        for (const a of freshAgencies) { try { await DB.put('catalog_agencies', a); } catch (e) {} }
                        for (const g of freshGuides) { try { await DB.put('catalog_guides', g); } catch (e) {} }
                        for (const s of freshSellers) { try { await DB.put('catalog_sellers', s); } catch (e) {} }
                        console.log(`✅ Catálogos cargados desde API: ${freshAgencies.length} agencias, ${freshGuides.length} guías, ${freshSellers.length} vendedores`);
                    } catch (apiError) {
                        console.warn('Error cargando catálogos desde API:', apiError);
                    }
                }
            }
        } catch (error) {
            console.error('Error cargando catálogos:', error);
        }
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

            // Obtener sucursal actual
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id') || null;
            
            // Verificar si es master_admin (puede ver todos los productos)
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener filtro de sucursal del dropdown
            const branchFilterEl = document.getElementById('pos-branch-filter');
            const branchFilterValue = branchFilterEl?.value;
            
            // Determinar qué branch_id usar para el filtro - MISMÁ LOGICA QUE INVENTARIO
            // 1. Si hay un filtro específico en el dropdown (diferente de "all"), usarlo
            // 2. Si es master_admin y el filtro es "all", mostrar todos (null)
            // 3. Si NO hay filtro específico pero hay currentBranchId, usar currentBranchId (filtrar estrictamente)
            let filterBranchId = null;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                // Hay un filtro específico seleccionado en el dropdown
                filterBranchId = branchFilterValue;
            } else if (isMasterAdmin && branchFilterValue === 'all') {
                // Master admin seleccionó explícitamente "Todas" = mostrar todos
                filterBranchId = null;
            } else if (currentBranchId) {
                // Si hay una sucursal actual (del header), usarla para filtrar estrictamente
                // Esto aplica tanto para master_admin sin selección específica como para usuarios normales
                filterBranchId = currentBranchId;
            } else {
                // Sin sucursal = no filtrar (solo para master_admin sin sucursal seleccionada)
                filterBranchId = isMasterAdmin ? null : null; // Sin sucursal, no mostrar nada
            }
            
            console.log(`POS: Sucursal actual (header): ${currentBranchId}`);
            console.log(`POS: Filtro dropdown: ${branchFilterValue || 'no seleccionado'}`);
            console.log(`POS: Master Admin: ${isMasterAdmin}`);
            console.log(`POS: Filtro final aplicado: ${filterBranchId || 'todas las sucursales'}`);
            
            // CACHE-FIRST: Cargar desde IndexedDB primero para mostrar al instante
            const applyBranchFilter = (arr) => {
                return arr.filter(item => {
                    if (item.status !== 'disponible') return false;
                    if (filterBranchId) {
                        if (!item.branch_id) return false;
                        return String(item.branch_id) === String(filterBranchId);
                    }
                    return true;
                });
            };
            const safePutInventoryItem = async (item) => {
                const toPut = { ...item, server_id: item.id, sync_status: 'synced' };
                try {
                    await DB.put('inventory_items', toPut, { autoBranchId: false });
                } catch (e) {
                    const isConstraint = e?.name === 'ConstraintError' || (e?.message && (e.message.includes('sku') || e.message.includes('uniqueness')));
                    if (isConstraint && toPut.sku) {
                        const existing = await DB.getByIndex('inventory_items', 'sku', toPut.sku);
                        if (existing) {
                            toPut.id = existing.id;
                            await DB.put('inventory_items', toPut, { autoBranchId: false });
                        }
                    }
                }
            };
            const allFromIdb = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
            let items = applyBranchFilter(allFromIdb);
            const hasCache = items.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token;

            if (hasCache) {
                console.log(`⚡ [Cache-First] POS: ${items.length} productos desde IndexedDB`);
                if (hasApi) {
                    // Actualizar caché en segundo plano sin recargar la UI (evita refrescos cada pocos segundos)
                    Promise.resolve().then(async () => {
                        try {
                            const fresh = await API.getInventoryItems({ branch_id: filterBranchId, status: 'disponible' });
                            let freshFiltered = Array.isArray(fresh) ? fresh : (fresh?.items || []);
                            if (filterBranchId) {
                                freshFiltered = freshFiltered.filter(item => item?.branch_id && String(item.branch_id) === String(filterBranchId));
                            }
                            for (const item of freshFiltered) {
                                await safePutInventoryItem(item);
                            }
                            // No llamar loadProducts aquí: evita ciclo de recargas. Los cambios se reflejan al cambiar filtros
                            // o con el evento inventory-updated del socket.
                        } catch (e) { console.warn('POS sync background:', e); }
                    }).catch(e => console.warn('POS sync background:', e));
                }
            } else if (hasApi) {
                try {
                    console.log('POS: Cargando productos desde API...');
                    items = await API.getInventoryItems({ branch_id: filterBranchId, status: 'disponible' });
                    if (filterBranchId) {
                        items = items.filter(item => item?.branch_id && String(item.branch_id) === String(filterBranchId));
                    }
                    for (const item of items) {
                        await safePutInventoryItem(item);
                    }
                    console.log(`POS: ${items.length} productos cargados desde API`);
                } catch (apiError) {
                    console.warn('Error cargando productos desde API:', apiError);
                    items = applyBranchFilter(allFromIdb);
                }
            } else {
                items = applyBranchFilter(allFromIdb);
                console.log(`POS: ${items.length} productos cargados desde IndexedDB`);
            }
            
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

            // Filtro de precio: primer valor numérico > 0 entre sale_price, price, cost (0 = no definido, usar siguiente)
            items = items.filter(item => {
                const price = (parseFloat(item.sale_price) || parseFloat(item.price) || parseFloat(item.cost)) || 0;
                return price >= minPrice && price <= maxPrice;
            });

            // Ordenar
            items.sort((a, b) => {
                switch (sortBy) {
                    case 'price-asc': return ((parseFloat(a.sale_price) || parseFloat(a.price) || parseFloat(a.cost)) || 0) - ((parseFloat(b.sale_price) || parseFloat(b.price) || parseFloat(b.cost)) || 0);
                    case 'price-desc': return ((parseFloat(b.sale_price) || parseFloat(b.price) || parseFloat(b.cost)) || 0) - ((parseFloat(a.sale_price) || parseFloat(a.price) || parseFloat(a.cost)) || 0);
                    case 'recent': return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                    default: return (a.name || '').localeCompare(b.name || '');
                }
            });

            // Actualizar contador
            const countEl = document.getElementById('pos-products-count');
            if (countEl) countEl.textContent = `${items.length} producto${items.length !== 1 ? 's' : ''} encontrado${items.length !== 1 ? 's' : ''}`;

            if (items.length === 0) {
                // Mostrar información detallada de debug
                const allItemsForDebug = await DB.getAll('inventory_items') || [];
                const disponibleCount = allItemsForDebug.filter(i => i.status === 'disponible').length;
                const conStockCount = allItemsForDebug.filter(i => (i.stock_actual ?? 1) > 0).length;
                const disponibleConStock = allItemsForDebug.filter(i => i.status === 'disponible' && (i.stock_actual ?? 1) > 0).length;
                
                container.innerHTML = `
                    <div class="pos-loading-products" style="text-align: center; padding: 40px;">
                        <i class="fas fa-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <div style="margin-bottom: 16px; font-size: 14px; color: var(--color-text-secondary);">
                            No se encontraron productos disponibles
                        </div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 20px; text-align: left; max-width: 500px; margin-left: auto; margin-right: auto;">
                            <strong>Información de Debug:</strong><br>
                            • Total productos en BD: ${allItemsForDebug.length}<br>
                            • Productos con status "disponible": ${disponibleCount}<br>
                            • Productos con stock > 0: ${conStockCount}<br>
                            • Productos disponibles con stock: ${disponibleConStock}<br>
                            • Sucursal actual: ${currentBranchId || 'No configurada'}<br><br>
                            ${allItemsForDebug.length > 0 ? 
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
                            ${allItemsForDebug.length === 0 ? `
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

            // Carga progresiva: guardar items y mostrar primer batch (como Inventario)
            this._lastPosItems = items;
            this._posGridDisplayLimit = this.POS_GRID_BATCH_SIZE;
            await this.displayPosProducts();
            
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
                        // Si el onclick no funciona, ejecutarlo manualmente (param opcional para loadMorePosProducts, etc.)
                        const funcMatch = onclick.match(/window\.POS\.(\w+)\(['"]?([^'")]*)['"]?\)/);
                        if (funcMatch) {
                            const funcName = funcMatch[1];
                            const param = funcMatch[2] || undefined;
                            if (this[funcName] && typeof this[funcName] === 'function') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (param !== undefined && param !== '') {
                                    this[funcName](param);
                                } else {
                                    this[funcName]();
                                }
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

    async displayPosProducts(options = {}) {
        const container = document.getElementById('pos-products-list');
        if (!container) return;

        const items = Array.isArray(this._lastPosItems) ? this._lastPosItems : [];
        if (!options.isLoadMore) {
            this._posGridDisplayLimit = this.POS_GRID_BATCH_SIZE;
        }

        if (items.length === 0) return;

        const limit = this._posGridDisplayLimit || this.POS_GRID_BATCH_SIZE;
        const toShow = items.slice(0, limit);
        const hasMore = items.length > limit;
        const remaining = items.length - limit;

        // Cargar fotos solo para los items visibles
        const itemsWithPhotos = await Promise.all(toShow.map(async (item) => {
            try {
                const photos = await DB.query('inventory_photos', 'item_id', item.id);
                const photo = photos && photos.length > 0 ? photos[0] : null;
                return { ...item, photo: photo?.thumbnail_blob || photo?.photo_blob || null };
            } catch (e) {
                return { ...item, photo: null };
            }
        }));

        if (!window.POS) {
            window.POS = this;
        }

        const productsHTML = itemsWithPhotos.map(item => this.renderProductCard(item)).join('');
        const loadMoreBtn = hasMore ? `
            <div class="pos-load-more-wrap" style="grid-column: 1 / -1; display: flex; justify-content: center; padding: var(--spacing-md);">
                <button type="button" class="btn-secondary" onclick="window.POS.loadMorePosProducts()">
                    <i class="fas fa-chevron-down"></i> Cargar más (${remaining} restantes)
                </button>
            </div>
        ` : '';
        container.innerHTML = productsHTML + loadMoreBtn;
    },

    loadMorePosProducts() {
        if (!this._lastPosItems || this._lastPosItems.length === 0) return;
        this._posGridDisplayLimit = (this._posGridDisplayLimit || this.POS_GRID_BATCH_SIZE) + this.POS_GRID_BATCH_SIZE;
        this.displayPosProducts({ isLoadMore: true });
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
                        ${Utils.formatCurrency((parseFloat(item.sale_price) || parseFloat(item.price) || parseFloat(item.cost)) || 0)}
                        <small>precio</small>
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

            // Precio para el cliente: primer valor > 0 entre sale_price, price, cost (si sale_price es 0, usar price o cost; no eliminar cost del inventario)
            const salePrice = (parseFloat(item.sale_price) || parseFloat(item.price) || parseFloat(item.cost)) || 0;
            // Agregar al carrito
            const cartItem = {
                ...item,
                photo: photo,
                price: salePrice,
                quantity: 1,
                discount: this.currentDiscount,
                subtotal: salePrice * (1 - this.currentDiscount / 100)
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
        const rawQuery = String(query || '').trim().replace(/\r?\n/g, '');
        if (!rawQuery) return;
        
        try {
            let match = null;
            
            // Si el código escaneado parece EAN8 (8 dígitos numéricos), usar búsqueda por EAN8
            // Las etiquetas de joyería imprimen códigos EAN8 generados con toEAN8(barcode || sku)
            const isEAN8 = /^\d{8}$/.test(rawQuery);
            if (isEAN8 && typeof BarcodeManager !== 'undefined' && BarcodeManager.findItemByEAN8) {
                match = await BarcodeManager.findItemByEAN8(rawQuery);
                if (match) {
                    // Verificar que el item esté en la sucursal actual
                    const currentBranchId = typeof BranchManager !== 'undefined' 
                        ? BranchManager.getCurrentBranchId() 
                        : localStorage.getItem('current_branch_id') || null;
                    const isMasterAdmin = typeof UserManager !== 'undefined' && (
                        UserManager.currentUser?.role === 'master_admin' ||
                        UserManager.currentUser?.is_master_admin ||
                        UserManager.currentUser?.isMasterAdmin
                    );
                    if (currentBranchId && !isMasterAdmin && match.branch_id && match.branch_id !== currentBranchId) {
                        match = null;
                    }
                }
            }
            
            if (!match) {
                // Búsqueda tradicional por SKU o barcode exacto
                const items = await DB.getAll('inventory_items', null, null, { 
                    filterByBranch: true, 
                    branchIdField: 'branch_id' 
                }) || [];
                
                match = items.find(item => {
                    if (item.status !== 'disponible') return false;
                    const stockActual = item.stock_actual ?? 1;
                    if (stockActual <= 0) return false;
                    return (
                        item.sku?.toLowerCase() === rawQuery.toLowerCase() ||
                        (item.barcode && String(item.barcode).trim() === rawQuery)
                    );
                });
            }

            if (match) {
                if (match.status !== 'disponible') {
                    Utils.showNotification(`Producto ${match.status}`, 'warning');
                    return;
                }
                const stockActual = match.stock_actual ?? 1;
                if (stockActual <= 0) {
                    Utils.showNotification('Sin stock disponible', 'warning');
                    return;
                }
                await this.selectProduct(match.id);
                const searchEl = document.getElementById('pos-product-search');
                if (searchEl) searchEl.value = '';
            } else {
                // No es producto: buscar y asignar agencia, guía o vendedor directamente
                const found = await this.trySetGuideAgencyOrSellerByBarcode(rawQuery);
                const searchEl = document.getElementById('pos-product-search');
                if (searchEl) searchEl.value = '';
                if (!found) {
                    Utils.showNotification('Código no encontrado. Escanea agencia, guía, vendedor o producto.', 'warning');
                }
            }
        } catch (e) {
            console.error('Error en búsqueda rápida:', e);
            Utils.showNotification('Error al buscar producto', 'error');
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

            // Obtener tipos de cambio del día actual (robusto: ExchangeRates puede no estar cargado)
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            let exchangeRate = 20;
            let exchangeRateCadValue = 15;
            try {
                if (typeof ExchangeRates !== 'undefined' && ExchangeRates.getExchangeRate) {
            const exchangeRates = await ExchangeRates.getExchangeRate(today);
                    exchangeRate = parseFloat(exchangeRates?.usd || 20) || 20;
                    exchangeRateCadValue = parseFloat(exchangeRates?.cad || 15) || 15;
                } else if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRateByDate) {
                    const rate = await API.getExchangeRateByDate(today);
                    exchangeRate = parseFloat(rate?.usd_to_mxn || rate?.usd || 20) || 20;
                    exchangeRateCadValue = parseFloat(rate?.cad_to_mxn || rate?.cad || 15) || 15;
                }
            } catch (e) {
                // No bloquear pagos por tipo de cambio. Usar fallback.
            }

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
            let rate = 20;
            try {
                if (typeof ExchangeRates !== 'undefined' && ExchangeRates.getExchangeRate) {
            const exchangeRates = await ExchangeRates.getExchangeRate(today);
                    rate = parseFloat(exchangeRates?.usd || 20) || 20;
                } else if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRateByDate) {
                    const r = await API.getExchangeRateByDate(today);
                    rate = parseFloat(r?.usd_to_mxn || r?.usd || 20) || 20;
                }
            } catch (e) {
                // fallback
            }
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
                this.isProcessingSale = false;
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

        const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

        // Obtener datos
        const rawBranchId = typeof BranchManager !== 'undefined'
            ? BranchManager.getCurrentBranchId() 
            : (localStorage.getItem('current_branch_id') || null);
        // IMPORTANTE: el backend espera UUID en branch_id. Si no es UUID, omitir y dejar que el backend use req.user.branchId.
        const branchId = isUUID(rawBranchId) ? rawBranchId : null;
        // Usar vendedor escaneado, o si no hay, el usuario logueado como fallback
        const rawSellerId = this.currentSeller?.id || UserManager.currentUser?.employee_id || null;
        const rawAgencyId = this.currentAgency?.id || null;
        const rawGuideId = this.currentGuide?.id || null;
        const rawCustomerId = this.currentCustomer?.id || null;

        // IMPORTANTE: en backend estos ids son UUID. Si no son UUID, omitir (null/undefined).
        const sellerId = isUUID(rawSellerId) ? rawSellerId : null;
        const agencyId = isUUID(rawAgencyId) ? rawAgencyId : null;
        const guideId = isUUID(rawGuideId) ? rawGuideId : null;
        const customerId = isUUID(rawCustomerId) ? rawCustomerId : null;
        const currency = 'MXN';
        // Obtener tipo de cambio del día actual (robusto)
        const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
        let exchangeRate = 20;
        try {
            if (typeof ExchangeRates !== 'undefined' && ExchangeRates.getExchangeRate) {
        const exchangeRates = await ExchangeRates.getExchangeRate(today);
                exchangeRate = parseFloat(exchangeRates?.usd || 20) || 20;
            } else if (typeof API !== 'undefined' && API.baseURL && API.token && API.getExchangeRateByDate) {
                const r = await API.getExchangeRateByDate(today);
                exchangeRate = parseFloat(r?.usd_to_mxn || r?.usd || 20) || 20;
            }
        } catch (e) {
            // fallback
        }

        // Generar folio
        // Nota: localmente branchId puede ser "branch1". Para el servidor usamos UUID (branchId) o fallback a req.user.branchId.
        const branch = rawBranchId ? await DB.get('catalog_branches', rawBranchId) : null;
        const branchCode = branch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'SUC';
        const folio = Utils.generateFolio(branchCode);

        // Pagos (enviar al backend en el POST inicial para evitar duplicados al re-sync)
        const cashUsd = parseFloat(document.getElementById('payment-cash-usd')?.value || 0);
        const cashMxn = parseFloat(document.getElementById('payment-cash-mxn')?.value || 0);
        const cashCad = parseFloat(document.getElementById('payment-cash-cad')?.value || 0);
        const tpvVisa = parseFloat(document.getElementById('payment-tpv-visa')?.value || 0);
        const tpvAmex = parseFloat(document.getElementById('payment-tpv-amex')?.value || 0);
        const tpvVisaBank = document.getElementById('payment-tpv-visa-bank')?.value || 'banamex';
        const tpvVisaType = document.getElementById('payment-tpv-visa-type')?.value || 'national';
        const tpvAmexBank = document.getElementById('payment-tpv-amex-bank')?.value || 'banamex';
        const tpvAmexType = document.getElementById('payment-tpv-amex-type')?.value || 'national';

        const paymentsForAPI = [];
        if (cashUsd > 0) paymentsForAPI.push({ method: 'cash_usd', amount: cashUsd, currency: 'USD' });
        if (cashMxn > 0) paymentsForAPI.push({ method: 'cash_mxn', amount: cashMxn, currency: 'MXN' });
        if (cashCad > 0) paymentsForAPI.push({ method: 'cash_cad', amount: cashCad, currency: 'CAD' });
        if (tpvVisa > 0) paymentsForAPI.push({ method: 'tpv_visa', amount: tpvVisa, currency: 'MXN', bank: tpvVisaBank, card_type: tpvVisaType });
        if (tpvAmex > 0) paymentsForAPI.push({ method: 'tpv_amex', amount: tpvAmex, currency: 'MXN', bank: tpvAmexBank, card_type: tpvAmexType });

        // Crear venta (shape esperado por backend/routes/sales.js)
        const saleData = {
            folio: folio,
            branch_id: branchId || undefined,
            seller_id: sellerId,
            agency_id: agencyId,
            guide_id: guideId,
            customer_id: customerId,
            subtotal: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            discount_percent: 0,
            discount_amount: this.cart.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0) / 100), 0),
            total: total,
            status: 'completed',
            items: this.cart.map(item => ({
                // item_id debe ser UUID para validar stock en servidor; si no lo es, omitir (el servidor guardará sku/name sin link)
                item_id: isUUID(item.id) ? item.id : undefined,
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unit_price: item.price,
                discount_percent: item.discount || 0,
                subtotal: (item.price * item.quantity) * (1 - ((item.discount || 0) / 100))
            })),
            payments: paymentsForAPI
        };

        let sale;
        
        let savedWithAPI = false;
        // Intentar crear venta con API si está disponible
        if (typeof API !== 'undefined' && API.baseURL && API.token && API.createSale) {
            try {
                console.log('Creando venta con API...');
                sale = await API.createSale(saleData);
                console.log('✅ Venta creada con API:', sale.folio);
                savedWithAPI = true;
                
                // Guardar en IndexedDB como caché
                await DB.put('sales', sale, { autoBranchId: false });
            } catch (apiError) {
                console.error('Error creando venta con API, usando modo local:', apiError);
                // Fallback a modo local
                sale = {
                    id: Utils.generateId(),
                    ...saleData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.add('sales', sale);
            }
        } else {
            // Modo offline
            sale = {
                id: Utils.generateId(),
                ...saleData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };
            await DB.add('sales', sale);
        }

        // Variables para acumular costos
        let totalCOGS = 0;
        let totalSellerCommission = 0;
        let totalGuideCommission = 0;

        // Si la venta se creó con API, los items ya están incluidos
        // Solo procesar items si estamos en modo local
        const useAPI = typeof API !== 'undefined' && API.baseURL && API.token && sale.id && !sale.sync_status;
        
        if (!useAPI) {
            // Crear items de venta (modo local)
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
        } else {
            // Si usamos API, aún así guardar items localmente para impresión/historial offline (sin encolar sync).
            // Esto evita tickets con "Items: 0" porque en modo API no se crean sale_items locales.
            try {
                const existingLocalItems = await DB.query('sale_items', 'sale_id', sale.id) || [];
                if (existingLocalItems.length === 0) {
                    for (const item of this.cart) {
                        const currentItem = await DB.get('inventory_items', item.id);
                        const itemCost = currentItem?.cost ?? item.cost ?? 0;
                        await DB.put('sale_items', {
                            id: Utils.generateId(),
                            sale_id: sale.id,
                            item_id: item.id,
                            sku: item.sku,
                            name: item.name,
                            quantity: item.quantity,
                            unit_price: item.price,
                            cost: itemCost,
                            discount_percent: item.discount || 0,
                            subtotal: item.subtotal,
                            created_at: new Date().toISOString()
                        }, { autoBranchId: false });
                    }
                }
            } catch (e) {
                // No bloquear venta si falla el cache local
            }

            // Si usamos API, calcular comisiones desde los items de la respuesta
            // La API ya actualizó el stock, solo necesitamos calcular comisiones
            if (sale.items) {
                for (const saleItem of sale.items) {
                    const item = this.cart.find(c => c.id === saleItem.item_id);
                    if (item) {
                        const itemCost = saleItem.cost || 0;
                        totalCOGS += itemCost * saleItem.quantity;
                        
                        if (sellerId && typeof Utils !== 'undefined' && Utils.calculateCommission) {
                            totalSellerCommission += await Utils.calculateCommission(saleItem.subtotal, sellerId, null);
                        }
                        
                        if (guideId && typeof Utils !== 'undefined' && Utils.calculateCommission) {
                            totalGuideCommission += await Utils.calculateCommission(saleItem.subtotal, null, guideId);
                        }
                    }
                }
            }
        }

        // Registrar COGS automáticamente
        if (typeof Costs !== 'undefined' && totalCOGS > 0) {
            await Costs.registerCOGS(sale.id, totalCOGS, branchId, sale.folio);
        }

        // Actualizar venta con comisiones totales
        sale.seller_commission = totalSellerCommission;
        sale.guide_commission = totalGuideCommission;
        await DB.put('sales', sale, { autoBranchId: false });

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
                        .filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')))
                        .reduce((sum, s) => sum + (s.total || 0), 0);
                    
                    const lastSale = customerSales
                        .filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed')))
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                    
                    await DB.put('customers', {
                        ...customer,
                        totalSpent: totalSpent,
                        lastPurchaseDate: lastSale ? lastSale.created_at : customer.lastPurchaseDate || customer.lastPurchase,
                        lastPurchase: lastSale ? lastSale.created_at : customer.lastPurchase,
                        purchaseCount: customerSales.filter(s => (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'))).length,
                        updated_at: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Error actualizando historial del cliente:', error);
                // No bloquear la venta si falla la actualización del cliente
            }
        }

        // Agregar a cola de sincronización SOLO si NO se guardó con API.
        // Si ya se guardó en servidor, reintentar crea duplicados por folio y puede terminar en error.
        if (!savedWithAPI && typeof window.SyncManager !== 'undefined') {
            await window.SyncManager.addToQueue('sale', sale.id);
        }

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
        } catch (error) {
            console.error('Error completando venta:', error);
            Utils.showNotification('Error al completar la venta: ' + error.message, 'error');
            this.isProcessingSale = false;
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
            
            // Verificar si es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener ventas filtradas
            const viewAllBranches = isMasterAdmin;
            const allSales = await DB.getAll('sales', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            // Filtro estricto adicional si no es master_admin
            const sales = isMasterAdmin ? allSales : 
                allSales.filter(s => s.branch_id && String(s.branch_id) === String(currentBranchId));
            
            const drafts = sales.filter(sale => {
                if (sale.status !== 'borrador') return false;
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

    async loadDraft(saleId, options = {}) {
        const { removeFromList = true } = options;
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

            // Cargar items al carrito (item.id en cart_data es el id de inventario)
            for (const item of cartItems) {
                const invId = item.item_id || item.id;
                const inventoryItem = await DB.get('inventory_items', invId);
                if (inventoryItem) {
                    const price = item.price != null ? item.price : inventoryItem.price;
                    const qty = item.quantity || 1;
                    const discount = item.discount || 0;
                    const subtotal = item.subtotal != null ? item.subtotal : (price * qty * (1 - discount / 100));
                    this.cart.push({
                        id: inventoryItem.id,
                        name: inventoryItem.name,
                        sku: inventoryItem.sku,
                        price: price,
                        quantity: qty,
                        discount: discount,
                        subtotal: subtotal
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

            // Actualizar UI (métodos correctos del POS)
            this.updateCartDisplay();
            this.calculateTotals();
            await this.calculatePayments();

            if (removeFromList) {
                await this.deleteDraft(saleId, { skipConfirm: true });
            }

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

            // Cargar el borrador en el carrito sin eliminarlo aún (para poder completar)
            await this.loadDraft(saleId, { removeFromList: false });

            // Completar la venta con el carrito ya cargado
            await this.completeSale();

            // Eliminar el borrador después de completar con éxito
            await this.deleteDraft(saleId, { skipConfirm: true });
        } catch (e) {
            console.error('Error completando borrador:', e);
            Utils.showNotification('Error al completar el borrador', 'error');
        }
    },

    async deleteDraft(saleId, options = {}) {
        const { skipConfirm = false } = options;
        if (!skipConfirm && !await Utils.confirm('¿Eliminar este borrador?')) return;

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
                                ${Utils.formatCurrency((parseFloat(item.sale_price) || parseFloat(item.price) || parseFloat(item.cost)) || 0)}
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
                                ${Utils.formatCurrency((parseFloat(item.sale_price) || parseFloat(item.price) || parseFloat(item.cost)) || 0)}
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
    // Mapeo guía (nombre normalizado) -> agencia (cuando agency_id no está en el guía)
    GUIDE_TO_AGENCY_MAP: {
        'CARLOS SIS': 'VERANOS', 'MARIO RENDON': 'VERANOS', 'CHAVA': 'VERANOS', 'FREDY': 'VERANOS', 'NETO': 'VERANOS', 'EMMANUEL': 'VERANOS',
        'MARINA': 'TANITOURS', 'MARINA *10 DIRECTO': 'TANITOURS', 'GLORIA': 'TANITOURS', 'DANIELA': 'TANITOURS',
        'RAMON': 'DISCOVERY', 'GUSTAVO SIS': 'DISCOVERY', 'GUSTAVO LEPE': 'DISCOVERY', 'NOVOA': 'DISCOVERY', 'ERIK': 'DISCOVERY', 'CHILO': 'DISCOVERY', 'FERMIN': 'DISCOVERY', 'EMMA': 'DISCOVERY', 'HERASMO': 'DISCOVERY',
        'MIGUEL SUAREZ': 'TRAVELEX', 'SANTA': 'TRAVELEX', 'MIGUEL DELGADILLO': 'TRAVELEX', 'ANDRES CHAVEZ': 'TRAVELEX', 'SAREM': 'TRAVELEX', 'ZAVALA': 'TRAVELEX', 'TEMO': 'TRAVELEX', 'ROCIO': 'TRAVELEX', 'SEBASTIAN S': 'TRAVELEX',
        'MIGUEL IBARRA': 'TB', 'ADAN': 'TB', 'MIGUEL RAGA': 'TB', 'GABINO': 'TB', 'HECTOR SUAREZ': 'TB', 'OSCAR': 'TB', 'JOSE AVILES': 'TB',
        'HUGO': 'TTF', 'HILBERTO': 'TTF', 'JOSE MASIAS': 'TTF', 'DAVID BUSTOS': 'TTF', 'ALFONSO': 'TTF', 'DANIEL RIVERA': 'TTF', 'EDUARDO LEAL': 'TTF',
        'GEOVANNY': 'TROPICAL ADVENTURE', 'GINA': 'TROPICAL ADVENTURE', 'JAVIER': 'TROPICAL ADVENTURE', 'JULIAN': 'TROPICAL ADVENTURE', 'LUKE': 'TROPICAL ADVENTURE', 'NANCY': 'TROPICAL ADVENTURE', 'NEYRA': 'TROPICAL ADVENTURE', 'ROGER': 'TROPICAL ADVENTURE'
    },

    async setAgency(agency) {
        this.currentAgency = agency;
        this.currentGuide = null;
        this.updateCustomerDisplay();
        Utils.showNotification(`Agencia ${agency.name} establecida. Escanea el GUÍA.`, 'success');
    },

    async setGuide(guide) {
        this.currentGuide = guide;
        this.currentAgency = null;
        
        if (guide.agency_id) {
            const agency = await DB.get('catalog_agencies', guide.agency_id);
            if (agency) this.currentAgency = agency;
        }
        
        if (!this.currentAgency && guide.name) {
            const guideNameNorm = String(guide.name || '').trim().toUpperCase();
            const agencyName = this.GUIDE_TO_AGENCY_MAP[guideNameNorm] ||
                Object.entries(this.GUIDE_TO_AGENCY_MAP).find(([g]) => 
                    guideNameNorm.includes(g) || g.includes(guideNameNorm)
                )?.[1];
            if (agencyName) {
                const agencies = await DB.getAll('catalog_agencies', null, null, { filterByBranch: false }) || [];
                this.currentAgency = agencies.find(a => 
                    String(a.name || '').toUpperCase().includes(agencyName) ||
                    agencyName.includes(String(a.name || '').toUpperCase())
                ) || null;
            }
        }
        
        this.updateCustomerDisplay();
        Utils.showNotification(`Guía ${guide.name} cargado${this.currentAgency ? ` (${this.currentAgency.name})` : ''}. Ahora escanea el VENDEDOR.`, 'success');
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

    /**
     * Busca agencia, guía o vendedor por código de barras y los asigna en el POS.
     * Retorna true si encontró y asignó alguno, false si no.
     */
    async trySetGuideAgencyOrSellerByBarcode(barcode) {
        const raw = String(barcode || '').trim().replace(/\r?\n/g, '');
        if (!raw) return false;

        const norm = v => Utils.normalizeBarcodeValue ? Utils.normalizeBarcodeValue(v) : String(v || '')
            .trim()
            .replace(/\r?\n/g, '')
            .replace(/[\s\-_]/g, '')
            .toUpperCase();
        const getCandidates = (item, type, genFn) => {
            const utilsCandidates = Utils.getEntityBarcodeCandidates ? Utils.getEntityBarcodeCandidates(item, type) : [];
            const fallback = genFn ? [genFn(item)] : [];
            return Array.from(new Set([...utilsCandidates, ...fallback.map(value => norm(value)).filter(Boolean)]));
        };
        const matchesCode = (item, val) => {
            const v = norm(val);
            const candidates = [norm(item.barcode), norm(item.code), norm(item.codigo)].filter(Boolean);
            return candidates.includes(v);
        };
        const genGuide = g => (Utils.generateGuideBarcode && Utils.generateGuideBarcode(g)) || '';
        const genAgency = a => (Utils.generateAgencyBarcode && Utils.generateAgencyBarcode(a)) || '';
        const genSeller = s => (Utils.generateSellerBarcode && Utils.generateSellerBarcode(s)) || '';
        const matchesGenerated = (item, val, type, genFn) => getCandidates(item, type, genFn).includes(norm(val));

        const findByBarcode = async (store, type, genFn) => {
            const all = await DB.getAll(store, null, null, { filterByBranch: false }) || [];
            const direct = await DB.getByIndex(store, 'barcode', raw);
            const candidates = all.filter(x => {
                if (!x) return false;
                if (direct && x.id === direct.id) return true;
                return matchesCode(x, raw) || (genFn && matchesGenerated(x, raw, type, genFn));
            });

            if (candidates.length === 0) return null;

            const activeCandidates = candidates.filter(x => x.active !== false);
            const ordered = (activeCandidates.length > 0 ? activeCandidates : candidates)
                .sort((a, b) => {
                    const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                    const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                    return bUpdated - aUpdated;
                });
            return ordered[0] || null;
        };

        // 1. Agencia
        let agency = await findByBarcode('catalog_agencies', 'agency', genAgency);
        if (agency && agency.active !== false) {
            await this.setAgency(agency);
            return true;
        }

        // 2. Guía
        let guide = await findByBarcode('catalog_guides', 'guide', genGuide);
        if (guide && guide.active !== false) {
            await this.setGuide(guide);
            return true;
        }

        // 3. Vendedor
        let seller = await findByBarcode('catalog_sellers', 'seller', genSeller);
        if (seller && seller.active !== false) {
            await this.setSeller(seller);
            return true;
        }

        return false;
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
            // Obtener sucursal actual
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            
            // Verificar si es master_admin
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            
            // Obtener filtro de sucursal del dropdown (puede no existir aún)
            const branchFilterEl = document.getElementById('pos-history-branch-filter');
            const branchFilterValue = branchFilterEl?.value;
            
            // Determinar qué branch_id usar para el filtro
            let filterBranchId = null;
            let viewAllBranches = false;
            if (branchFilterValue && branchFilterValue !== 'all' && branchFilterValue !== '') {
                filterBranchId = branchFilterValue;
                viewAllBranches = false;
            } else if (isMasterAdmin && (!branchFilterValue || branchFilterValue === 'all')) {
                filterBranchId = null;
                viewAllBranches = true;
            } else {
                filterBranchId = currentBranchId;
                viewAllBranches = false;
            }
            
            // CACHE-FIRST: leer ventas de IndexedDB primero
            let sales = await DB.getAll('sales', null, null, { filterByBranch: !viewAllBranches, branchIdField: 'branch_id' }) || [];
            if (filterBranchId) {
                sales = sales.filter(s => s.branch_id && String(s.branch_id) === String(filterBranchId));
            }
            const hasCache = sales.length > 0;
            const hasApi = typeof API !== 'undefined' && API.baseURL && API.token && API.getSales;
            if (hasCache) {
                console.log(`⚡ [Cache-First] POS historial: ${sales.length} ventas desde IndexedDB`);
            }
            if (hasApi) {
                Promise.resolve().then(async () => {
                    try {
                        const fresh = await API.getSales({ branch_id: filterBranchId });
                        for (const s of fresh) { try { await DB.put('sales', s); } catch (e) {} }
                    } catch (e) { console.warn('Sync ventas POS background:', e); }
                }).catch(() => {});
            }
            if (!hasCache && hasApi) {
                try {
                    sales = await API.getSales({ branch_id: filterBranchId });
                    if (filterBranchId) sales = sales.filter(s => s.branch_id && String(s.branch_id) === String(filterBranchId));
                    for (const s of sales) { try { await DB.put('sales', s); } catch (e) {} }
                } catch (apiError) {
                    sales = await DB.getAll('sales', null, null, { filterByBranch: !viewAllBranches, branchIdField: 'branch_id' }) || [];
                    if (filterBranchId) sales = sales.filter(s => s.branch_id && String(s.branch_id) === String(filterBranchId));
                }
            }
            
            // Filtro estricto adicional
            if (filterBranchId) {
                sales = sales.filter(s => s.branch_id && String(s.branch_id) === String(filterBranchId));
            }
            
            const recentSales = sales
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const sellers = await DB.getAll('catalog_sellers') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            
            // Filtrar duplicados de sucursales
            const seenBranchNames = new Set();
            const seenBranchIds = new Set();
            const uniqueBranches = branches.filter(b => {
                if (!b.id || !b.name) return false;
                const nameKey = String(b.name).trim().toLowerCase();
                const idKey = String(b.id);
                if (seenBranchNames.has(nameKey) || seenBranchIds.has(idKey)) return false;
                seenBranchNames.add(nameKey);
                seenBranchIds.add(idKey);
                return true;
            });
            
            // Fecha local para "hoy" (igual que dashboard) y filtrar ventas del día
            const todayDate = new Date();
            const todayStr = typeof Utils !== 'undefined' && Utils.formatDate
                ? Utils.formatDate(todayDate, 'YYYY-MM-DD')
                : `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
            // Todas las ventas del día (fecha local) completadas — sin límite de cantidad
            const todaySales = recentSales.filter(s => {
                if (!s.created_at) return false;
                const saleDate = new Date(s.created_at);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate
                    ? Utils.formatDate(saleDate, 'YYYY-MM-DD')
                    : `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}-${String(saleDate.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr && (typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(s) : (s.status === 'completada' || s.status === 'completed'));
            });
            // Total del día = suma de TODAS las ventas del día (Utils.getSaleTotal evita strings y unifica campo total)
            const todayTotal = todaySales.reduce((sum, s) => sum + (typeof Utils !== 'undefined' && Utils.getSaleTotal ? Utils.getSaleTotal(s) : (parseFloat(s.total) || 0)), 0);
            
            // Verificar si venta es del día actual (para permitir edición)
            const isToday = (saleDate) => {
                if (!saleDate) return false;
                const d = new Date(saleDate);
                const saleDateStr = typeof Utils !== 'undefined' && Utils.formatDate ? Utils.formatDate(d, 'YYYY-MM-DD') : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return saleDateStr === todayStr;
            };

            const body = `
                <div style="margin-bottom: 16px;">
                    ${isMasterAdmin ? `
                        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
                            <label style="font-weight: 600; min-width: 80px;">Sucursal:</label>
                            <select id="pos-history-branch-filter" class="form-select" style="flex: 1;">
                                <option value="all">Todas las sucursales</option>
                                ${uniqueBranches.map(b => `<option value="${b.id}" ${filterBranchId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                            </select>
                        </div>
                    ` : ''}
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
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
                </div>
                <div style="max-height: 500px; overflow-y: auto;">
                    <table class="cart-table" style="min-width: 100%;">
                        <thead>
                            <tr>
                                <th>Folio</th>
                                <th>Fecha</th>
                                ${isMasterAdmin ? '<th>Sucursal</th>' : ''}
                                <th>Total</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentSales.length === 0 ? `
                                <tr>
                                    <td colspan="${isMasterAdmin ? 6 : 5}" style="text-align: center; padding: 20px; color: var(--color-text-secondary);">
                                        No hay ventas registradas
                                    </td>
                                </tr>
                            ` : recentSales.map(sale => {
                                const seller = sellers.find(s => s.id === sale.seller_id);
                                const branch = uniqueBranches.find(b => b.id === sale.branch_id);
                                const saleStatus = sale.status === 'completed' ? 'completada' : sale.status;
                                const saleIsToday = isToday(sale.created_at);
                                return `
                                    <tr>
                                        <td><strong>${sale.folio}</strong></td>
                                        <td>${Utils.formatDate(sale.created_at, 'DD/MM/YYYY HH:mm')}</td>
                                        ${isMasterAdmin ? `<td>${branch?.name || 'N/A'}</td>` : ''}
                                        <td>${Utils.formatCurrency(sale.total)}</td>
                                        <td><span class="status-badge status-${saleStatus}">${saleStatus}</span></td>
                                        <td style="white-space: nowrap;">
                                            <button class="btn-secondary btn-xs" onclick="window.POS.viewSale('${sale.id}')" title="Ver detalles">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            ${saleStatus === 'completada' || saleStatus === 'completed' ? `
                                                <button class="btn-secondary btn-xs" onclick="window.POS.reprintTicket('${sale.id}')" title="Reimprimir ticket">
                                                    <i class="fas fa-print"></i>
                                                </button>
                                                ${isMasterAdmin ? `
                                                    ${saleIsToday ? `
                                                        <button class="btn-secondary btn-xs" onclick="window.POS.editSale('${sale.id}')" title="Editar venta">
                                                            <i class="fas fa-edit"></i>
                                                </button>
                                                    ` : ''}
                                                    <button class="btn-danger btn-xs" onclick="window.POS.confirmDeleteSale('${sale.id}')" title="Eliminar venta (devolución)">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                ` : ''}
                                            ` : ''}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            const footer = '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>';
            UI.showModal('Historial de Ventas', body, footer);
            
            // Configurar listener del filtro de sucursal (solo para master_admin)
            if (isMasterAdmin) {
                const branchFilter = document.getElementById('pos-history-branch-filter');
                if (branchFilter) {
                    branchFilter.removeEventListener('change', this._historyBranchFilterHandler);
                    this._historyBranchFilterHandler = () => this.showHistory();
                    branchFilter.addEventListener('change', this._historyBranchFilterHandler);
                }
            }
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
            ${(typeof Utils !== 'undefined' && Utils.isSaleCompleted ? Utils.isSaleCompleted(sale) : (sale.status === 'completada' || sale.status === 'completed')) ? `
                <button class="btn-secondary" onclick="window.POS.reprintTicket('${sale.id}')">
                    <i class="fas fa-print"></i> Reimprimir
                </button>
            ` : ''}
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Venta: ${sale.folio}`, body, footer);
    },

    async reprintTicket(saleId) {
        let sale = await DB.get('sales', saleId);
        if (!sale) {
            Utils.showNotification('Venta no encontrada', 'error');
            return;
        }

        try {
            const localItems = await DB.query('sale_items', 'sale_id', saleId) || [];
            const needsHydration = localItems.length === 0;

            if (needsHydration && typeof API !== 'undefined' && API.baseURL && API.token && typeof API.getSale === 'function') {
                const detailedSale = await API.getSale(saleId);
                if (detailedSale) {
                    sale = { ...sale, ...detailedSale };
                    await DB.put('sales', sale, { autoBranchId: false });

                    if (Array.isArray(detailedSale.items) && detailedSale.items.length > 0) {
                        for (const item of detailedSale.items) {
                            await DB.put('sale_items', {
                                ...(item || {}),
                                id: item?.id || Utils.generateId(),
                                sale_id: saleId,
                                created_at: item?.created_at || new Date().toISOString()
                            }, { autoBranchId: false });
                        }
                    }

                    if (Array.isArray(detailedSale.payments) && detailedSale.payments.length > 0) {
                        for (const payment of detailedSale.payments) {
                            await DB.put('payments', {
                                ...(payment || {}),
                                id: payment?.id || Utils.generateId(),
                                sale_id: saleId,
                                created_at: payment?.created_at || new Date().toISOString()
                            }, { autoBranchId: false });
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('No se pudo hidratar venta para reimpresión:', e);
        }

        await Printer.printTicket(sale);
    },

    // ==================== ELIMINAR Y EDITAR VENTAS (MASTER ADMIN) ====================

    async confirmDeleteSale(saleId) {
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        if (!isMasterAdmin) {
            Utils.showNotification('Solo el administrador maestro puede eliminar ventas', 'error');
            return;
        }
        
        const sale = await DB.get('sales', saleId);
        if (!sale) {
            Utils.showNotification('Venta no encontrada', 'error');
            return;
        }
        
        const items = await DB.query('sale_items', 'sale_id', saleId) || [];
        const itemsPreview = items.slice(0, 3);
        let itemsList = 'Sin productos';
        if (itemsPreview.length > 0) {
            const itemsText = await Promise.all(itemsPreview.map(async (item, idx) => {
                const invItem = await DB.get('inventory_items', item.item_id);
                return `${idx + 1}. ${invItem?.name || 'N/A'} (x${item.quantity})`;
            }));
            itemsList = itemsText.join('<br>') + (items.length > 3 ? `<br>... y ${items.length - 3} más` : '');
        }
        
        const body = `
            <div style="padding: 20px;">
                <div style="color: var(--color-danger); margin-bottom: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    ¿Eliminar esta venta? (Devolución)
                </div>
                <div style="margin-bottom: 16px;">
                    <p><strong>Folio:</strong> ${sale.folio}</p>
                    <p><strong>Fecha:</strong> ${Utils.formatDate(sale.created_at, 'DD/MM/YYYY HH:mm')}</p>
                    <p><strong>Total:</strong> ${Utils.formatCurrency(sale.total)}</p>
                    <p><strong>Productos:</strong></p>
                    <div style="padding-left: 20px; color: var(--color-text-secondary);">
                        ${itemsList}
                    </div>
                </div>
                <div style="background: var(--color-bg-secondary); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>⚠️ Esta acción:</strong>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Restaurará el stock de los productos vendidos</li>
                        <li>Eliminará la venta permanentemente</li>
                        <li>No se puede deshacer</li>
                    </ul>
                </div>
                <div>
                    <label style="font-weight: 600; display: block; margin-bottom: 8px;">
                        Escribe <strong style="color: var(--color-danger);">ELIMINAR</strong> para confirmar:
                    </label>
                    <input type="text" id="confirm-delete-input" class="form-input" placeholder="ELIMINAR" style="width: 100%;">
                </div>
            </div>
        `;
        
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-danger" onclick="window.POS.deleteSale('${saleId}')">Eliminar Venta</button>
        `;
        
        UI.showModal('Confirmar Eliminación de Venta', body, footer);
    },

    async deleteSale(saleId) {
        const confirmInput = document.getElementById('confirm-delete-input');
        if (!confirmInput || confirmInput.value.trim() !== 'ELIMINAR') {
            Utils.showNotification('Debes escribir ELIMINAR para confirmar', 'error');
            return;
        }
        
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        if (!isMasterAdmin) {
            Utils.showNotification('Solo el administrador maestro puede eliminar ventas', 'error');
            return;
        }
        
        try {
            const sale = await DB.get('sales', saleId);
            if (!sale) {
                Utils.showNotification('Venta no encontrada', 'error');
                return;
            }
            
            const saleItems = await DB.query('sale_items', 'sale_id', saleId) || [];
            const payments = await DB.query('payments', 'sale_id', saleId) || [];
            
            // Revertir stock
            for (const saleItem of saleItems) {
                const inventoryItem = await DB.get('inventory_items', saleItem.item_id);
                if (inventoryItem) {
                    const currentStock = inventoryItem.stock_actual ?? 1;
                    const restoredStock = currentStock + saleItem.quantity;
                    const newStatus = restoredStock > 0 ? 'disponible' : inventoryItem.status;
                    
                    const updatedItem = {
                        ...inventoryItem,
                        stock_actual: restoredStock,
                        status: newStatus,
                        updated_at: new Date().toISOString()
                    };
                    
                    await DB.put('inventory_items', updatedItem, { autoBranchId: false });
                    
                    const logId = Utils.generateId();
                    await DB.add('inventory_logs', {
                        id: logId,
                        item_id: saleItem.item_id,
                        action: 'devolucion',
                        quantity: saleItem.quantity,
                        stock_before: currentStock,
                        stock_after: restoredStock,
                        reason: 'eliminacion_venta',
                        notes: `Devolución - Venta ${sale.folio} eliminada`,
                        created_at: new Date().toISOString()
                    });
                    
                    if (typeof Utils !== 'undefined' && Utils.EventBus) {
                        Utils.EventBus.emit('inventory-updated', {
                            item: updatedItem,
                            isNew: false,
                            oldStatus: inventoryItem.status,
                            newStatus: newStatus,
                            stockChange: saleItem.quantity,
                            reason: 'devolucion'
                        });
                    }
                }
            }
            
            // Eliminar items y pagos
            for (const item of saleItems) {
                await DB.delete('sale_items', item.id);
            }
            for (const payment of payments) {
                await DB.delete('payments', payment.id);
            }
            
            // Eliminar en backend si está disponible
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.deleteSale) {
                try {
                    await API.deleteSale(saleId);
                    console.log('✅ Venta eliminada en backend:', sale.folio);
                } catch (apiError) {
                    console.warn('Error eliminando venta en backend:', apiError);
                }
            }
            
            await DB.delete('sales', saleId);
            
            Utils.showNotification(`Venta ${sale.folio} eliminada. Stock restaurado.`, 'success');
            UI.closeModal();
            
            if (document.getElementById('pos-history-branch-filter')) {
                await this.showHistory();
            }
            
            await this.updateTodaySalesCount();
            
        } catch (e) {
            console.error('Error eliminando venta:', e);
            Utils.showNotification('Error al eliminar venta: ' + e.message, 'error');
        }
    },

    async editSale(saleId) {
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );
        
        if (!isMasterAdmin) {
            Utils.showNotification('Solo el administrador maestro puede editar ventas', 'error');
            return;
        }
        
        const sale = await DB.get('sales', saleId);
        if (!sale) {
            Utils.showNotification('Venta no encontrada', 'error');
            return;
        }
        
        const today = new Date().toISOString().split('T')[0];
        const saleDate = sale.created_at?.split('T')[0];
        if (saleDate !== today) {
            Utils.showNotification('Solo se pueden editar ventas del día actual', 'error');
            return;
        }
        
        if (sale.status !== 'completada' && sale.status !== 'completed') {
            Utils.showNotification('Solo se pueden editar ventas completadas', 'error');
            return;
        }
        
        // Obtener items y datos relacionados
        const saleItems = await DB.query('sale_items', 'sale_id', saleId) || [];
        const payments = await DB.query('payments', 'sale_id', saleId) || [];
        
        // Cargar productos del inventario para agregar nuevos items
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const allInventoryItems = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: currentBranchId ? true : false, 
            branchIdField: 'branch_id' 
        }) || [];
        const availableItems = allInventoryItems.filter(item => 
            (item.status === 'disponible' || item.id === saleItems.find(si => si.item_id === item.id)?.item_id) && 
            (item.stock_actual ?? 1) > 0
        );
        
        // Crear cart temporal con items de la venta
        const editCart = await Promise.all(saleItems.map(async (saleItem) => {
            const invItem = await DB.get('inventory_items', saleItem.item_id);
            return {
                id: saleItem.item_id,
                saleItemId: saleItem.id, // ID del sale_item para actualizar/eliminar
                name: invItem?.name || saleItem.name || 'N/A',
                sku: invItem?.sku || saleItem.sku || 'N/A',
                quantity: saleItem.quantity,
                price: saleItem.price || saleItem.unit_price || 0,
                discount: saleItem.discount || saleItem.discount_percent || 0,
                subtotal: saleItem.subtotal || (saleItem.price * saleItem.quantity * (1 - ((saleItem.discount || 0) / 100))),
                photo: null // Cargar después si es necesario
            };
        }));
        
        // Guardar estado de edición
        window._editingSale = {
            saleId: saleId,
            originalSale: sale,
            originalItems: saleItems,
            originalPayments: payments,
            cart: editCart
        };
        
        // Calcular totales iniciales
        const subtotal = editCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalDiscount = editCart.reduce((sum, item) => sum + (item.price * item.quantity * ((item.discount || 0) / 100)), 0);
        const total = subtotal - totalDiscount;
        
        const body = `
            <div style="max-width: 1200px; max-height: 80vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <h3 style="margin-bottom: 12px;">Productos en la venta</h3>
                        <div id="edit-sale-cart" style="min-height: 300px; max-height: 500px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: 8px; padding: 12px;">
                            ${editCart.length === 0 ? '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No hay productos</p>' : ''}
                        </div>
                        <div style="margin-top: 12px;">
                            <button class="btn-secondary btn-sm" onclick="window.POS.showAddItemToEditSale()">
                                <i class="fas fa-plus"></i> Agregar Producto
                            </button>
                        </div>
                    </div>
                    <div>
                        <h3 style="margin-bottom: 12px;">Resumen</h3>
                        <div style="background: var(--color-bg-secondary); padding: 16px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Subtotal:</span>
                                <strong id="edit-sale-subtotal">${Utils.formatCurrency(subtotal)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--color-text-secondary);">
                                <span>Descuento:</span>
                                <span id="edit-sale-discount">${Utils.formatCurrency(totalDiscount)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid var(--color-border-light); font-size: 18px; font-weight: 700;">
                                <span>Total:</span>
                                <span id="edit-sale-total">${Utils.formatCurrency(total)}</span>
                            </div>
                        </div>
                        <div style="margin-top: 16px;">
                            <p><strong>Folio:</strong> ${sale.folio}</p>
                            <p><strong>Fecha:</strong> ${Utils.formatDate(sale.created_at, 'DD/MM/YYYY HH:mm')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.POS.saveEditedSale()">
                <i class="fas fa-save"></i> Guardar Cambios
            </button>
        `;
        
        UI.showModal(`Editar Venta: ${sale.folio}`, body, footer);
        
        // Renderizar items del carrito
        this.renderEditSaleCart();
    },

    renderEditSaleCart() {
        const container = document.getElementById('edit-sale-cart');
        if (!container || !window._editingSale) return;
        
        const cart = window._editingSale.cart;
        
        if (cart.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 40px;">No hay productos</p>';
            this.updateEditSaleTotals();
            return;
        }
        
        container.innerHTML = cart.map((item, index) => `
            <div class="pos-cart-item-advanced" data-item-id="${item.id}" style="margin-bottom: 12px; padding: 12px; background: var(--color-bg-card); border-radius: 8px; border: 1px solid var(--color-border-light);">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 4px;">${item.name}</div>
                        <div style="font-size: 12px; color: var(--color-text-secondary);">${item.sku}</div>
                    </div>
                    <button class="btn-danger btn-xs" onclick="window.POS.removeItemFromEditSale('${item.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-top: 12px; align-items: center;">
                    <div>
                        <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Cantidad</label>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="btn-secondary btn-xs" onclick="window.POS.updateEditSaleQuantity('${item.id}', ${Math.max(1, item.quantity - 1)})">-</button>
                            <input type="number" value="${item.quantity}" min="1" 
                                   onchange="window.POS.updateEditSaleQuantity('${item.id}', parseInt(this.value) || 1)"
                                   style="width: 60px; padding: 4px; text-align: center; border: 1px solid var(--color-border-light); border-radius: 4px;">
                            <button class="btn-secondary btn-xs" onclick="window.POS.updateEditSaleQuantity('${item.id}', ${item.quantity + 1})">+</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Precio</label>
                        <input type="number" value="${item.price}" min="0" step="0.01"
                               onchange="window.POS.updateEditSalePrice('${item.id}', parseFloat(this.value) || 0)"
                               style="width: 100%; padding: 4px; border: 1px solid var(--color-border-light); border-radius: 4px;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Descuento %</label>
                        <input type="number" value="${item.discount}" min="0" max="100" step="0.1"
                               onchange="window.POS.updateEditSaleDiscount('${item.id}', parseFloat(this.value) || 0)"
                               style="width: 100%; padding: 4px; border: 1px solid var(--color-border-light); border-radius: 4px;">
                    </div>
                    <div style="text-align: right;">
                        <label style="font-size: 11px; color: var(--color-text-secondary); display: block; margin-bottom: 4px;">Subtotal</label>
                        <div style="font-weight: 600; font-size: 14px;">${Utils.formatCurrency(item.subtotal)}</div>
                    </div>
                </div>
            </div>
        `).join('');
        
        this.updateEditSaleTotals();
    },

    updateEditSaleTotals() {
        if (!window._editingSale) return;
        
        const cart = window._editingSale.cart;
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalDiscount = cart.reduce((sum, item) => sum + (item.price * item.quantity * ((item.discount || 0) / 100)), 0);
        const total = subtotal - totalDiscount;
        
        const subtotalEl = document.getElementById('edit-sale-subtotal');
        const discountEl = document.getElementById('edit-sale-discount');
        const totalEl = document.getElementById('edit-sale-total');
        
        if (subtotalEl) subtotalEl.textContent = Utils.formatCurrency(subtotal);
        if (discountEl) discountEl.textContent = Utils.formatCurrency(totalDiscount);
        if (totalEl) totalEl.textContent = Utils.formatCurrency(total);
    },

    updateEditSaleQuantity(itemId, quantity) {
        if (!window._editingSale) return;
        if (quantity < 1) quantity = 1;
        
        const item = window._editingSale.cart.find(c => c.id === itemId);
        if (!item) return;
        
        item.quantity = quantity;
        item.subtotal = (item.price * item.quantity) * (1 - ((item.discount || 0) / 100));
        
        this.renderEditSaleCart();
    },

    updateEditSalePrice(itemId, price) {
        if (!window._editingSale) return;
        if (price < 0) price = 0;
        
        const item = window._editingSale.cart.find(c => c.id === itemId);
        if (!item) return;
        
        item.price = price;
        item.subtotal = (item.price * item.quantity) * (1 - ((item.discount || 0) / 100));
        
        this.renderEditSaleCart();
    },

    updateEditSaleDiscount(itemId, discount) {
        if (!window._editingSale) return;
        if (discount < 0) discount = 0;
        if (discount > 100) discount = 100;
        
        const item = window._editingSale.cart.find(c => c.id === itemId);
        if (!item) return;
        
        item.discount = discount;
        item.subtotal = (item.price * item.quantity) * (1 - (discount / 100));
        
        this.renderEditSaleCart();
    },

    removeItemFromEditSale(itemId) {
        if (!window._editingSale) return;
        
        window._editingSale.cart = window._editingSale.cart.filter(c => c.id !== itemId);
        this.renderEditSaleCart();
    },

    async showAddItemToEditSale() {
        if (!window._editingSale) return;
        
        const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        const allInventoryItems = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: currentBranchId ? true : false, 
            branchIdField: 'branch_id' 
        }) || [];
        const availableItems = allInventoryItems.filter(item => {
            const stockActual = item.stock_actual ?? 1;
            const alreadyInCart = window._editingSale.cart.find(c => c.id === item.id);
            return (item.status === 'disponible' || alreadyInCart) && stockActual > 0;
        });
        
        if (availableItems.length === 0) {
            Utils.showNotification('No hay productos disponibles', 'info');
            return;
        }
        
        const itemsList = availableItems.slice(0, 50).map(item => {
            const inCart = window._editingSale.cart.find(c => c.id === item.id);
            return `<option value="${item.id}" ${inCart ? 'disabled' : ''}>${item.name} (${item.sku}) ${inCart ? '- Ya en carrito' : ''}</option>`;
        }).join('');
        
        const selectedItemId = await Utils.select('Seleccionar producto:', availableItems.filter(item => !window._editingSale.cart.find(c => c.id === item.id)).map(item => ({
            value: item.id,
            label: `${item.name} (${item.sku})`
        })), 'Agregar Producto');
        
        if (!selectedItemId) return;
        
        const invItem = await DB.get('inventory_items', selectedItemId);
        if (!invItem) return;
        
        const stockActual = invItem.stock_actual ?? 1;
        let quantity = 1;
        
        if (stockActual > 1) {
            const qtyInput = await Utils.prompt(`Cantidad (stock disponible: ${stockActual}):`, '1');
            quantity = parseInt(qtyInput) || 1;
            if (quantity > stockActual) {
                Utils.showNotification(`Solo hay ${stockActual} unidades disponibles`, 'warning');
                quantity = stockActual;
            }
        }
        
        const priceInput = await Utils.prompt('Precio de venta:', String(invItem.cost || 0));
        const price = parseFloat(priceInput) || invItem.cost || 0;
        
        const discountInput = await Utils.prompt('Descuento (%):', '0');
        const discount = parseFloat(discountInput) || 0;
        
        window._editingSale.cart.push({
            id: invItem.id,
            saleItemId: null, // Nuevo item, no tiene saleItemId aún
            name: invItem.name,
            sku: invItem.sku || invItem.barcode || 'N/A',
            quantity: quantity,
            price: price,
            discount: discount,
            subtotal: (price * quantity) * (1 - (discount / 100))
        });
        
        this.renderEditSaleCart();
        Utils.showNotification('Producto agregado', 'success');
    },

    async saveEditedSale() {
        if (!window._editingSale) return;
        
        const { saleId, originalSale, originalItems, cart } = window._editingSale;
        
        if (cart.length === 0) {
            Utils.showNotification('La venta debe tener al menos un producto', 'error');
            return;
        }
        
        if (!await Utils.confirm('¿Guardar cambios en la venta? Esto ajustará el stock automáticamente.')) {
            return;
        }
        
        try {
            // Calcular nuevos totales
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const totalDiscount = cart.reduce((sum, item) => sum + (item.price * item.quantity * ((item.discount || 0) / 100)), 0);
            const total = subtotal - totalDiscount;
            
            // 1. Ajustar stock: revertir items originales, descontar items nuevos/modificados
            const itemsToRemove = originalItems.filter(oi => !cart.find(c => c.saleItemId === oi.id));
            const itemsToAdd = cart.filter(c => !c.saleItemId);
            const itemsToModify = cart.filter(c => {
                const originalItem = originalItems.find(oi => oi.id === c.saleItemId);
                if (!originalItem) return false;
                return originalItem.quantity !== c.quantity || originalItem.item_id !== c.id;
            });
            
            // Revertir stock de items eliminados o con cantidad reducida
            for (const originalItem of originalItems) {
                const cartItem = cart.find(c => c.saleItemId === originalItem.id);
                const quantityDiff = cartItem ? (originalItem.quantity - cartItem.quantity) : originalItem.quantity;
                
                if (quantityDiff > 0) {
                    const invItem = await DB.get('inventory_items', originalItem.item_id);
                    if (invItem) {
                        const currentStock = invItem.stock_actual ?? 1;
                        const restoredStock = currentStock + quantityDiff;
                        const newStatus = restoredStock > 0 ? 'disponible' : invItem.status;
                        
                        await DB.put('inventory_items', {
                            ...invItem,
                            stock_actual: restoredStock,
                            status: newStatus,
                            updated_at: new Date().toISOString()
                        }, { autoBranchId: false });
                        
                        // Log
                        const logId = Utils.generateId();
                        await DB.add('inventory_logs', {
                            id: logId,
                            item_id: originalItem.item_id,
                            action: 'ajuste_edicion_venta',
                            quantity: quantityDiff,
                            stock_before: currentStock,
                            stock_after: restoredStock,
                            reason: 'edicion_venta',
                            notes: `Ajuste por edición de venta ${originalSale.folio}`,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }
            
            // Descontar stock de items nuevos o con cantidad aumentada
            for (const cartItem of cart) {
                const originalItem = originalItems.find(oi => oi.id === cartItem.saleItemId);
                const quantityDiff = originalItem ? (cartItem.quantity - originalItem.quantity) : cartItem.quantity;
                
                if (quantityDiff > 0) {
                    const invItem = await DB.get('inventory_items', cartItem.id);
                    if (invItem) {
                        const currentStock = invItem.stock_actual ?? 1;
                        const newStock = Math.max(0, currentStock - quantityDiff);
                        const newStatus = newStock <= 0 ? 'vendida' : 'disponible';
                        
                        await DB.put('inventory_items', {
                            ...invItem,
                            stock_actual: newStock,
                            status: newStatus,
                            updated_at: new Date().toISOString()
                        }, { autoBranchId: false });
                        
                        // Log
                        const logId = Utils.generateId();
                        await DB.add('inventory_logs', {
                            id: logId,
                            item_id: cartItem.id,
                            action: 'venta_edicion',
                            quantity: quantityDiff,
                            stock_before: currentStock,
                            stock_after: newStock,
                            reason: 'edicion_venta',
                            notes: `Ajuste por edición de venta ${originalSale.folio}`,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }
            
            // 2. Actualizar sale_items: eliminar los que no están, crear nuevos, actualizar modificados
            // Eliminar items que ya no están en el carrito
            for (const originalItem of originalItems) {
                if (!cart.find(c => c.saleItemId === originalItem.id)) {
                    await DB.delete('sale_items', originalItem.id);
                }
            }
            
            // Actualizar o crear sale_items
            for (const cartItem of cart) {
                const saleItemData = {
                    sale_id: saleId,
                    item_id: cartItem.id,
                    quantity: cartItem.quantity,
                    price: cartItem.price,
                    cost: (await DB.get('inventory_items', cartItem.id))?.cost || 0,
                    discount: cartItem.discount,
                    subtotal: cartItem.subtotal,
                    updated_at: new Date().toISOString()
                };
                
                if (cartItem.saleItemId) {
                    // Actualizar existente
                    await DB.put('sale_items', {
                        id: cartItem.saleItemId,
                        ...saleItemData
                    }, { autoBranchId: false });
                } else {
                    // Crear nuevo
                    await DB.add('sale_items', {
                        id: Utils.generateId(),
                        ...saleItemData,
                        created_at: new Date().toISOString()
                    });
                }
            }
            
            // 3. Actualizar la venta
            const updatedSale = {
                ...originalSale,
                subtotal: subtotal,
                discount_amount: totalDiscount,
                discount_percent: subtotal > 0 ? (totalDiscount / subtotal * 100) : 0,
                total: total,
                updated_at: new Date().toISOString(),
                modified_by: UserManager.currentUser?.username || 'master_admin',
                modified_at: new Date().toISOString()
            };
            
            await DB.put('sales', updatedSale, { autoBranchId: false });
            
            // 4. Intentar sincronizar con backend
            if (typeof API !== 'undefined' && API.baseURL && API.token && API.updateSale) {
                try {
                    // Preparar datos en formato esperado por el backend
                    const apiSaleData = {
                        items: cart.map(item => ({
                            id: item.saleItemId || undefined, // ID del sale_item si existe (para actualizar), undefined si es nuevo
                            item_id: item.id,
                            sku: item.sku,
                            name: item.name,
                            quantity: item.quantity,
                            unit_price: item.price,
                            discount_percent: item.discount || 0,
                            subtotal: item.subtotal
                        })),
                        subtotal: subtotal,
                        discount_amount: totalDiscount,
                        discount_percent: subtotal > 0 ? (totalDiscount / subtotal * 100) : 0,
                        total: total,
                        seller_id: originalSale.seller_id,
                        guide_id: originalSale.guide_id,
                        agency_id: originalSale.agency_id,
                        customer_id: originalSale.customer_id
                    };
                    
                    await API.updateSale(saleId, apiSaleData);
                    console.log('✅ Venta actualizada en backend:', originalSale.folio);
                } catch (apiError) {
                    console.warn('Error actualizando venta en backend:', apiError);
                    // Agregar a cola de sincronización
                    if (typeof SyncManager !== 'undefined') {
                        await SyncManager.addToQueue('sale', saleId, 'update');
                    }
                }
            }
            
            Utils.showNotification(`Venta ${originalSale.folio} actualizada correctamente`, 'success');
            UI.closeModal();
            
            // Limpiar estado de edición
            delete window._editingSale;
            
            // Recargar historial si está abierto
            if (document.getElementById('pos-history-branch-filter')) {
                await this.showHistory();
            }
            
            await this.updateTodaySalesCount();
            
        } catch (e) {
            console.error('Error guardando venta editada:', e);
            Utils.showNotification('Error al guardar cambios: ' + e.message, 'error');
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
    },

    async setupBranchFilter() {
        const branchFilter = document.getElementById('pos-branch-filter');
        if (!branchFilter) return;

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
            let branches = await DB.getAll('catalog_branches') || [];
            
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
            // Establecer valor por defecto según sucursal actual
            if (currentBranchId) {
                branchFilter.value = currentBranchId;
            } else {
                branchFilter.value = 'all';
            }
            // Agregar listener para recargar productos cuando cambia
            branchFilter.addEventListener('change', () => this.loadProducts());
        }
        
        // Escuchar cambios de sucursal desde el header para sincronizar el dropdown
        // IMPORTANTE: Este listener debe buscar el elemento actualizado cada vez, no usar la referencia vieja
        const syncBranchListener = async (e) => {
            const updatedFilter = document.getElementById('pos-branch-filter');
            if (updatedFilter && e.detail && e.detail.branchId) {
                console.log(`🔄 POS: Sincronizando dropdown con sucursal del header: ${e.detail.branchId}`);
                // CRÍTICO: Actualizar el dropdown PRIMERO, luego recargar
                // Esto asegura que loadProducts() use el valor correcto del dropdown
                updatedFilter.value = e.detail.branchId;
                // Pequeño delay para asegurar que el DOM se actualizó
                await new Promise(resolve => setTimeout(resolve, 50));
                // Recargar productos con el nuevo filtro
                await this.loadProducts();
            }
        };
        
        // Remover listener anterior si existe para evitar duplicados
        window.removeEventListener('branch-changed', syncBranchListener);
        window.addEventListener('branch-changed', syncBranchListener);
    },
    
    setupSocketListeners() {
        // Escuchar eventos Socket.IO para actualización en tiempo real
        // Eventos de inventario (para actualizar productos disponibles)
        if (UserManager.currentUser?.is_master_admin) {
            window.addEventListener('inventory-updated-all-branches', async (e) => {
                const { branchId, action, item } = e.detail;
                if (this.initialized) {
                    console.log(`📦 POS: Inventario actualizado en sucursal ${branchId} (${action})`);
                    // Recargar productos después de un pequeño delay
                    setTimeout(async () => {
                        await this.loadProducts();
                    }, 300);
                }
            });
        }
        
        window.addEventListener('inventory-updated', async (e) => {
            if (this.initialized) {
                const { item } = e.detail || {};
                const currentBranchId = BranchManager?.getCurrentBranchId();
                // Solo actualizar si el item es de la sucursal actual
                if (item && (!currentBranchId || item.branch_id === currentBranchId)) {
                    console.log(`📦 POS: Inventario actualizado localmente`);
                    setTimeout(async () => {
                        await this.loadProducts();
                    }, 300);
                }
            }
        });
        
        // Eventos de ventas (para actualizar contador de ventas del día)
        if (UserManager.currentUser?.is_master_admin) {
            window.addEventListener('sale-updated-all-branches', async (e) => {
                const { branchId, action } = e.detail;
                if (this.initialized) {
                    console.log(`💰 POS: Venta actualizada en sucursal ${branchId} (${action})`);
                    // Actualizar contador de ventas del día
                    setTimeout(async () => {
                        await this.updateTodaySalesCount();
                    }, 300);
                }
            });
        }
        
        window.addEventListener('sale-updated', async (e) => {
            if (this.initialized) {
                const { sale } = e.detail || {};
                const currentBranchId = BranchManager?.getCurrentBranchId();
                // Solo actualizar si la venta es de la sucursal actual
                if (sale && (!currentBranchId || sale.branch_id === currentBranchId)) {
                    console.log(`💰 POS: Venta actualizada localmente`);
                    setTimeout(async () => {
                        await this.updateTodaySalesCount();
                    }, 300);
                }
            }
        });
    }
});

// CRÍTICO: Exponer window.POS DESPUÉS de que Object.assign haya asignado todos los métodos
// Esto asegura que todos los métodos estén disponibles cuando se accede a window.POS
if (typeof window !== 'undefined') {
    window.POS = POS;
    console.log('✅ POS: window.POS expuesto con todos los métodos disponibles');
}

