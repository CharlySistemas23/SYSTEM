// Inventory Module - Sistema Avanzado de Gestión de Inventario

const Inventory = {
    initialized: false,
    selectedItems: new Set(), // Items seleccionados para acciones en lote
    currentView: 'grid', // grid o list
    sortBy: 'name',
    sortOrder: 'asc',
    
    // Configuración de stock por defecto
    defaultStockConfig: {
        stock_min: 1,
        stock_max: 10,
        stock_actual: 1,
        alert_enabled: true
    },
    
    async init() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:18',message:'Inventory.init called',data:{initialized:this.initialized,hasPermissionManager:typeof PermissionManager!=='undefined',currentUser:typeof UserManager!=='undefined'?UserManager.currentUser:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso primero, pero no bloquear si el HTML no está listo
        const hasPermission = typeof PermissionManager === 'undefined' || PermissionManager.hasPermission('inventory.view');
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:22',message:'Permission check result',data:{hasPermission:hasPermission,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null,userPermissions:typeof UserManager!=='undefined'?UserManager.currentUser?.permissions:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (!hasPermission) {
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver inventario</div>';
            }
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:28',message:'Permission denied, returning early',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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

        await this.setupEventListeners();
        await this.loadInventory();
        this.initialized = true;
        
        // Escuchar cambios de sucursal para recargar inventario
        window.addEventListener('branch-changed', async () => {
            if (this.initialized) {
                await this.loadInventory();
            }
        });
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
                        <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
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
                    
                    <!-- Filtros -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-sm); margin-bottom: var(--spacing-md);">
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="text" id="inventory-search" class="form-input" placeholder="Buscar...">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-status-filter" class="form-select">
                                <option value="">Todos los estados</option>
                                <option value="disponible">Disponible</option>
                                <option value="vendida">Vendida</option>
                                <option value="reservada">Reservada</option>
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
                        <div class="form-group" style="margin-bottom: 0;">
                            <select id="inventory-stock-alert-filter" class="form-select">
                                <option value="">Todos</option>
                                <option value="ok">Stock Normal</option>
                                <option value="low">Stock Bajo</option>
                                <option value="out">Agotado</option>
                                <option value="over">Exceso</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="number" id="inventory-min-price" class="form-input" placeholder="Costo Mín" step="0.01">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <input type="number" id="inventory-max-price" class="form-input" placeholder="Costo Máx" step="0.01">
                        </div>
                    </div>
                </div>
                <div id="inventory-list"></div>
            `;
        }
    },

    async setupEventListeners() {
        document.getElementById('inventory-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('inventory-import-btn')?.addEventListener('click', () => this.importCSV());
        document.getElementById('inventory-export-btn')?.addEventListener('click', () => this.exportInventory());
        
        // Nuevos botones de acciones en lote
        document.getElementById('inventory-delete-selected-btn')?.addEventListener('click', () => this.deleteSelectedItems());
        document.getElementById('inventory-select-all-btn')?.addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('inventory-print-selected-labels-btn')?.addEventListener('click', () => this.printSelectedLabels());
        document.getElementById('inventory-print-labels-btn')?.addEventListener('click', () => this.printSelectedLabels());
        
        // Filtro de alertas de stock
        document.getElementById('inventory-stock-alert-filter')?.addEventListener('change', () => this.loadInventory());
        
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
            const branches = await DB.getAll('catalog_branches') || [];
            branchFilter.innerHTML = '<option value="">Todas las sucursales</option>' + 
                branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
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

            // Actualizar inventario cuando otro módulo actualiza un item
            Utils.EventBus.on('inventory-updated', async (data) => {
                if (this.initialized && data && data.item) {
                    // Limpiar timeout anterior si existe
                    if (inventoryUpdateTimeout) {
                        clearTimeout(inventoryUpdateTimeout);
                    }
                    // Usar debounce de 300ms
                    inventoryUpdateTimeout = setTimeout(async () => {
                        // Recargar inventario
                        await this.loadInventory();
                        // Resaltar el item actualizado si existe
                        if (data.item.id) {
                            setTimeout(() => {
                                this.highlightItem(data.item.id);
                            }, 300);
                        }
                    }, 300);
                }
            });
        }
    },

    async loadInventory() {
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
            const currentBranchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId() 
                : localStorage.getItem('current_branch_id');
            
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            
            // Si es admin y no hay filtro de sucursal específico, puede ver todos los items
            const branchFilterValue = document.getElementById('inventory-branch-filter')?.value;
            const viewAllBranches = isAdmin && !branchFilterValue;
            
            // Obtener TODOS los items sin filtro primero para verificar que realmente existen
            // Usar una consulta directa sin cache
            let allItemsRaw = [];
            try {
                // Obtener directamente desde IndexedDB sin pasar por cache
                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open('opal_pos_db');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                if (db) {
                    const transaction = db.transaction(['inventory_items'], 'readonly');
                    const store = transaction.objectStore('inventory_items');
                    const request = store.getAll();
                    
                    allItemsRaw = await new Promise((resolve, reject) => {
                        request.onsuccess = () => resolve(request.result || []);
                        request.onerror = () => reject(request.error);
                    });
                } else {
                    // Fallback al método normal
                    allItemsRaw = await DB.getAll('inventory_items', null, null, { 
                        filterByBranch: false
                    }) || [];
                }
            } catch (error) {
                console.error('Error obteniendo items directamente:', error);
                // Fallback al método normal
                allItemsRaw = await DB.getAll('inventory_items', null, null, { 
                    filterByBranch: false
                }) || [];
            }
            
            console.log(`📦 Items obtenidos de IndexedDB: ${allItemsRaw.length}`);
            
            // VERIFICAR QUE CADA ITEM REALMENTE EXISTE EN LA BD (eliminar items fantasma)
            const verifiedItems = [];
            const ghostItems = [];
            
            for (const item of allItemsRaw) {
                try {
                    // Verificar existencia con una consulta directa
                    const verified = await DB.get('inventory_items', item.id);
                    if (verified && verified.id === item.id) {
                        verifiedItems.push(verified);
                    } else {
                        ghostItems.push(item.id);
                        console.warn(`⚠️ Item fantasma detectado: ${item.id} (${item.sku || item.name || 'sin nombre'})`);
                    }
                } catch (error) {
                    ghostItems.push(item.id);
                    console.warn(`⚠️ Error verificando item ${item.id}:`, error);
                }
            }
            
            // Limpiar items fantasma si se detectaron
            if (ghostItems.length > 0) {
                console.warn(`⚠️ Se detectaron ${ghostItems.length} items fantasma. Limpiando...`);
                // Intentar limpiar desde IndexedDB directamente
                try {
                    const db = await new Promise((resolve, reject) => {
                        const request = indexedDB.open('opal_pos_db');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                    
                    if (db) {
                        const transaction = db.transaction(['inventory_items'], 'readwrite');
                        const store = transaction.objectStore('inventory_items');
                        
                        for (const ghostId of ghostItems) {
                            try {
                                await new Promise((resolve, reject) => {
                                    const deleteRequest = store.delete(ghostId);
                                    deleteRequest.onsuccess = () => resolve();
                                    deleteRequest.onerror = () => reject(deleteRequest.error);
                                });
                            } catch (e) {
                                console.error(`Error eliminando item fantasma ${ghostId}:`, e);
                            }
                        }
                    }
                } catch (cleanupError) {
                    console.error('Error en limpieza de items fantasma:', cleanupError);
                }
            }
            
            console.log(`✅ Items verificados: ${verifiedItems.length} válidos, ${ghostItems.length} fantasma`);
            
            // Si se detectaron items fantasma, mostrar advertencia
            if (ghostItems.length > 0) {
                console.warn(`⚠️ Se limpiaron ${ghostItems.length} items fantasma de la base de datos`);
            }
            
            // Ahora aplicar filtros
            let items = verifiedItems;
            
            // Filtrado por sucursal
            if (!viewAllBranches && currentBranchId) {
                const normalizedCurrentBranchId = String(currentBranchId);
                const beforeBranchFilter = items.length;
                items = items.filter(item => {
                    // Solo incluir items que tienen branch_id y pertenecen a la sucursal actual
                    if (!item.branch_id) {
                        console.warn(`⚠️ Item sin branch_id excluido: ${item.id} (${item.sku || item.name})`);
                        return false;
                    }
                    const itemBranchId = String(item.branch_id);
                    return itemBranchId === normalizedCurrentBranchId;
                });
                console.log(`📍 Filtrado por sucursal: ${beforeBranchFilter} → ${items.length} items (sucursal: ${currentBranchId})`);
            } else {
                console.log(`📍 Sin filtro de sucursal: ${items.length} items (admin o sin sucursal)`);
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:255',message:'Items retrieved from DB',data:{itemsCount:items.length,currentBranchId:currentBranchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Log para debugging
            if (items.length === 0) {
                const allItems = await DB.getAll('inventory_items', null, null, { filterByBranch: false }) || [];
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:260',message:'No items after filter, checking all items',data:{allItemsCount:allItems.length,itemsWithoutBranch:allItems.filter(i=>!i.branch_id).length,branchIds:allItems.filter(i=>i.branch_id).map(i=>i.branch_id),currentBranchId:currentBranchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
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
            } else {
                // Por defecto, excluir items vendidos O con stock <= 0
                // Esto asegura consistencia entre status y stock_actual
                items = items.filter(item => {
                    const stock = item.stock_actual ?? 0;
                    // Si está marcado como vendida Y tiene stock <= 0, excluir
                    // Si está marcado como disponible PERO tiene stock <= 0, también excluir
                    if (item.status === 'vendida' && stock <= 0) return false;
                    if (item.status === 'disponible' && stock <= 0) return false;
                    // Si tiene stock > 0, incluir independientemente del status (puede estar mal marcado)
                    if (stock > 0) return true;
                    // Si no tiene stock y no está marcado como vendida, puede estar en otro estado (apartada, reparacion, etc.)
                    return item.status !== 'vendida';
                });
            }

            // Apply branch filter
            const branchFilter = document.getElementById('inventory-branch-filter')?.value;
            if (branchFilter) {
                items = items.filter(item => item.branch_id === branchFilter);
            }

            // Apply cost range filter (ya no hay precio de venta)
            const minPrice = parseFloat(document.getElementById('inventory-min-price')?.value || '0');
            const maxPrice = parseFloat(document.getElementById('inventory-max-price')?.value || '999999999');
            items = items.filter(item => (item.cost || 0) >= minPrice && (item.cost || 0) <= maxPrice);

            // Apply metal filter
            const metalFilter = document.getElementById('inventory-metal-filter')?.value;
            if (metalFilter) {
                items = items.filter(item => item.metal === metalFilter);
            }

            // Apply stone type filter
            const stoneTypeFilter = document.getElementById('inventory-stone-type-filter')?.value;
            if (stoneTypeFilter) {
                items = items.filter(item => item.stone_type === stoneTypeFilter);
            }

            // Apply certificate filter
            const certificateFilter = document.getElementById('inventory-certificate-filter')?.value;
            if (certificateFilter === 'yes') {
                items = items.filter(item => item.certificate_type && item.certificate_number);
            } else if (certificateFilter === 'no') {
                items = items.filter(item => !item.certificate_type || !item.certificate_number);
            }

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

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:330',message:'About to display inventory',data:{itemsCount:items.length,containerExists:!!document.getElementById('inventory-list')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            this.displayInventory(items);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:333',message:'Inventory displayed',data:{itemsCount:items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:336',message:'Error loading inventory',data:{error:e.message,errorStack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.error('Error loading inventory:', e);
            Utils.showNotification('Error al cargar inventario', 'error');
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

    async displayInventory(items) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:398',message:'displayInventory called',data:{itemsCount:items.length,containerExists:!!document.getElementById('inventory-list')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        const container = document.getElementById('inventory-list');
        if (!container) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:404',message:'Container not found in displayInventory',data:{itemsCount:items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            return;
        }
        
        // Mostrar estadísticas si hay items
        await this.displayInventoryStats(items);
        
        // Actualizar contador de seleccionados
        this.updateSelectionUI();

        if (items.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px;">No hay piezas en inventario</p>';
            return;
        }

        // Load photos for items
        const itemsWithPhotos = await Promise.all(items.map(async (item) => {
            const photos = await DB.query('inventory_photos', 'item_id', item.id);
            return { ...item, photo: photos[0]?.thumbnail_blob || null };
        }));

        container.innerHTML = itemsWithPhotos.map(item => {
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
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Metal:</strong> ${item.metal || 'N/A'}</p>
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Piedra:</strong> ${stoneInfo}</p>
                    ${item.total_carats ? `<p style="font-size: 12px; margin-bottom: 4px;"><strong>Quilates Totales:</strong> ${item.total_carats}ct</p>` : ''}
                    <p style="font-size: 12px; margin-bottom: 4px;"><strong>Peso:</strong> ${item.weight_g}g</p>
                    
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
                    ${item.suggested_price ? `<p style="font-size: 12px; color: var(--color-success); margin-bottom: 4px;"><strong>Precio Sugerido:</strong> ${Utils.formatCurrency(item.suggested_price)}</p>` : ''}
                    ${item.collection ? `<p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: 4px;"><i class="fas fa-tag"></i> ${item.collection}</p>` : ''}
                    <p style="margin-top: 8px;"><strong>Estado:</strong> <span class="status-badge status-${item.status}">${item.status}</span></p>
                    <div style="margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="btn-secondary" onclick="window.Inventory.showItemDetails('${item.id}')" style="flex: 1; padding: 6px; font-size: 11px;">Ver Detalles</button>
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.update_stock') ? `
                            <button class="btn-secondary" onclick="window.Inventory.showStockModal('${item.id}')" style="padding: 6px; font-size: 11px;" title="Ajustar Stock"><i class="fas fa-cubes"></i></button>
                        ` : ''}
                        <button class="btn-secondary" onclick="window.Inventory.printJewelryLabel('${item.id}')" style="padding: 6px; font-size: 11px;" title="Imprimir Etiqueta Joya"><i class="fas fa-gem"></i></button>
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('inventory.delete') ? `
                            <button class="btn-danger-outline" onclick="window.Inventory.confirmDeleteItem('${item.id}')" style="padding: 6px; font-size: 11px;" title="Eliminar"><i class="fas fa-trash"></i></button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        }).join('');
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
            
            // Agregar a cola de sincronización ANTES de eliminar (para que Google Sheets sepa que fue eliminado)
            if (typeof SyncManager !== 'undefined') {
                try {
                    // Guardar metadata en un store temporal para que prepareRecords pueda accederlo
                    await DB.add('sync_deleted_items', {
                        id: itemId,
                        entity_type: 'inventory_item',
                        metadata: itemMetadata,
                        deleted_at: new Date().toISOString()
                    });
                    
                    // Agregar a cola con action='delete'
                    await SyncManager.addToQueue('inventory_item', itemId, 'delete');
                } catch (syncError) {
                    console.error('Error guardando metadata para sincronización:', syncError);
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
        
        UI.showModal('Ajustar Stock', body, footer);
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
                        <div><strong>Peso:</strong> ${item.weight_g}g</div>
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
        
        const item = itemId ? await DB.get('inventory_items', itemId) : null;

        const body = `
            <form id="inventory-form">
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
                        <label>Metal *</label>
                        <select id="inv-metal" class="form-select" required>
                            <option value="">Seleccionar...</option>
                            <option value="Oro 18k" ${item?.metal === 'Oro 18k' ? 'selected' : ''}>Oro 18k</option>
                            <option value="Oro 14k" ${item?.metal === 'Oro 14k' ? 'selected' : ''}>Oro 14k</option>
                            <option value="Oro 10k" ${item?.metal === 'Oro 10k' ? 'selected' : ''}>Oro 10k</option>
                            <option value="Plata 925" ${item?.metal === 'Plata 925' ? 'selected' : ''}>Plata 925</option>
                            <option value="Plata Sterling" ${item?.metal === 'Plata Sterling' ? 'selected' : ''}>Plata Sterling</option>
                            <option value="Platino" ${item?.metal === 'Platino' ? 'selected' : ''}>Platino</option>
                            <option value="Paladio" ${item?.metal === 'Paladio' ? 'selected' : ''}>Paladio</option>
                            <option value="Titanio" ${item?.metal === 'Titanio' ? 'selected' : ''}>Titanio</option>
                        </select>
                    </div>
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
                            <option value="Otra" ${item?.stone_type === 'Otra' ? 'selected' : ''}>Otra</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Talla/Tamaño</label>
                        <input type="text" id="inv-size" class="form-input" value="${item?.size || ''}" placeholder="Ej: 6, 7, 8...">
                    </div>
                </div>
                <div class="form-row" id="diamond-specs-row" style="display: none;">
                    <div class="form-group">
                        <label>Quilates (ct)</label>
                        <input type="number" id="inv-carats" class="form-input" step="0.01" value="${item?.carats || ''}" placeholder="0.00">
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
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Piedra (Descripción)</label>
                        <input type="text" id="inv-stone" class="form-input" value="${item?.stone || ''}" placeholder="Descripción detallada de la piedra">
                    </div>
                    <div class="form-group">
                        <label>Quilates Totales</label>
                        <input type="number" id="inv-total-carats" class="form-input" step="0.01" value="${item?.total_carats || ''}" placeholder="0.00">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Peso (g) *</label>
                        <input type="number" id="inv-weight" class="form-input" step="0.01" value="${item?.weight_g || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Medidas</label>
                        <input type="text" id="inv-measures" class="form-input" value="${item?.measures || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Costo *</label>
                        <input type="number" id="inv-cost" class="form-input" step="0.01" value="${item?.cost || ''}" required>
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Costo de adquisición</small>
                    </div>
                    <div class="form-group">
                        <label>Precio Sugerido</label>
                        <input type="number" id="inv-suggested-price" class="form-input" step="0.01" value="${item?.suggested_price || ''}">
                        <small style="color: var(--color-text-secondary); font-size: 11px;">Precio sugerido de venta</small>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Colección/Serie</label>
                        <input type="text" id="inv-collection" class="form-input" value="${item?.collection || ''}" placeholder="Ej: Colección Primavera 2024">
                    </div>
                    <div class="form-group">
                        <label>Proveedor/Fabricante</label>
                        <input type="text" id="inv-supplier" class="form-input" value="${item?.supplier || ''}" placeholder="Nombre del proveedor">
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
                <div class="form-row">
                    <div class="form-group">
                        <label>Ubicación</label>
                        <input type="text" id="inv-location" class="form-input" value="${item?.location || ''}" placeholder="Ej: Vitrina 1, Estante A">
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="inv-status" class="form-select">
                            <option value="disponible" ${item?.status === 'disponible' ? 'selected' : ''}>Disponible</option>
                            <option value="apartada" ${item?.status === 'apartada' ? 'selected' : ''}>Apartada</option>
                            <option value="vendida" ${item?.status === 'vendida' ? 'selected' : ''}>Vendida</option>
                            <option value="reparacion" ${item?.status === 'reparacion' ? 'selected' : ''}>En Reparación</option>
                            <option value="exhibicion" ${item?.status === 'exhibicion' ? 'selected' : ''}>En Exhibición</option>
                            <option value="reservado" ${item?.status === 'reservado' ? 'selected' : ''}>Reservado</option>
                        </select>
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
                <div class="form-group">
                    <label>Etiquetas/Categorías</label>
                    <input type="text" id="inv-tags" class="form-input" value="${item?.tags || ''}" placeholder="Ej: exclusivo, limitado, vintage, moderno (separadas por comas)">
                    <small style="color: var(--color-text-secondary); font-size: 11px;">Separa las etiquetas con comas</small>
                </div>
                <div class="form-group">
                    <label>Notas Adicionales</label>
                    <textarea id="inv-notes" class="form-input" rows="3" placeholder="Información adicional sobre la pieza...">${item?.notes || ''}</textarea>
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
            </form>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Inventory.saveItem('${itemId || ''}')">Guardar</button>
        `;

        UI.showModal(itemId ? 'Editar Pieza' : 'Nueva Pieza', body, footer);

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
            // Obtener todos los items para encontrar el último SKU
            const allItems = await DB.getAll('inventory_items') || [];
            
            // Buscar el último SKU numérico en formato JOY-XXX
            let lastNumber = 0;
            const skuPattern = /^JOY-(\d+)$/i;
            
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

            // Generar nuevo SKU
            const newNumber = lastNumber + 1;
            const newSKU = `JOY-${String(newNumber).padStart(3, '0')}`;
            
            // Verificar que no exista (por si acaso)
            const exists = allItems.some(item => item.sku === newSKU);
            if (exists) {
                // Si existe, buscar el siguiente disponible
                let nextNumber = newNumber + 1;
                while (allItems.some(item => item.sku === `JOY-${String(nextNumber).padStart(3, '0')}`)) {
                    nextNumber++;
                }
                skuInput.value = `JOY-${String(nextNumber).padStart(3, '0')}`;
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1362',message:'saveItem called',data:{itemId:itemId,isEdit:!!itemId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        const form = document.getElementById('inventory-form');
        if (!form || !form.checkValidity()) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1366',message:'Form validation failed',data:{formExists:!!form,formValid:form?.checkValidity()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            form.reportValidity();
            return;
        }

        const branchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : (localStorage.getItem('current_branch_id') || 'default');
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1370',message:'Branch ID determined',data:{branchId:branchId,fromBranchManager:typeof BranchManager!=='undefined',fromLocalStorage:localStorage.getItem('current_branch_id')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        const formBarcode = document.getElementById('inv-barcode').value.trim();
        const formSku = document.getElementById('inv-sku').value.trim();
        
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
        
        const item = {
            id: itemId || Utils.generateId(),
            sku: formSku,
            barcode: finalBarcode,
            name: document.getElementById('inv-name').value,
            metal: document.getElementById('inv-metal').value,
            stone: document.getElementById('inv-stone').value,
            stone_type: document.getElementById('inv-stone-type')?.value || '',
            carats: parseFloat(document.getElementById('inv-carats')?.value || 0),
            total_carats: parseFloat(document.getElementById('inv-total-carats')?.value || 0),
            color: document.getElementById('inv-color')?.value || '',
            clarity: document.getElementById('inv-clarity')?.value || '',
            cut: document.getElementById('inv-cut')?.value || '',
            size: document.getElementById('inv-size').value,
            weight_g: parseFloat(document.getElementById('inv-weight').value),
            measures: document.getElementById('inv-measures').value,
            cost: parseFloat(document.getElementById('inv-cost').value),
            suggested_price: parseFloat(document.getElementById('inv-suggested-price')?.value || 0),
            price: 0, // Precio de venta se asigna manualmente en el POS
            collection: document.getElementById('inv-collection')?.value || '',
            supplier: document.getElementById('inv-supplier')?.value || '',
            origin_country: document.getElementById('inv-origin-country')?.value || '',
            year: parseInt(document.getElementById('inv-year')?.value || 0) || null,
            location: document.getElementById('inv-location').value,
            tags: document.getElementById('inv-tags')?.value || '',
            notes: document.getElementById('inv-notes')?.value || '',
            certificate_type: document.getElementById('inv-certificate-type')?.value || '',
            certificate_number: document.getElementById('inv-certificate-number')?.value || '',
            status: document.getElementById('inv-status').value,
            // Campos de stock
            stock_actual: stockActual,
            stock_min: stockMin,
            stock_max: stockMax,
            branch_id: branchId,
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
            }
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1487',message:'About to save item to DB',data:{itemId:item.id,sku:item.sku,name:item.name,branch_id:item.branch_id,status:item.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        try {
            await DB.put('inventory_items', item);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1490',message:'Item saved successfully',data:{itemId:item.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1493',message:'Error saving item',data:{itemId:item.id,error:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            throw error;
        }

        // Handle photos
        const photoInput = document.getElementById('inv-photos');
        if (photoInput && photoInput.files.length > 0) {
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

        // Log inventory change
        const logId = Utils.generateId();
        await DB.add('inventory_logs', {
            id: logId,
            item_id: item.id,
            action: itemId ? 'actualizada' : 'alta',
            quantity: 1,
            notes: itemId ? 'Pieza actualizada' : 'Nueva pieza',
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

        // Registrar costo de adquisición en Costs si es un nuevo item o cambió el costo
        if (typeof Costs !== 'undefined' && item.cost > 0) {
            const oldCost = existingItem?.cost || 0;
            // Solo registrar si es nuevo item o si el costo aumentó (adquisición nueva)
            if (!itemId || (itemId && item.cost > oldCost && oldCost > 0)) {
                const costAmount = itemId ? (item.cost - oldCost) : item.cost;
                if (costAmount > 0) {
                    try {
                        await Costs.registerCost({
                            amount: costAmount,
                            category: 'adquisicion',
                            type: 'variable',
                            description: itemId 
                                ? `Actualización de costo - ${item.name}` 
                                : `Adquisición de producto - ${item.name}`,
                            date: new Date().toISOString().split('T')[0],
                            branch_id: branchId,
                            notes: `Item: ${item.sku || item.name}, Costo anterior: ${Utils.formatCurrency(oldCost)}, Costo nuevo: ${Utils.formatCurrency(item.cost)}`
                        });
                    } catch (error) {
                        console.error('Error registrando costo de adquisición:', error);
                        // No bloquear el guardado del item si falla el registro de costo
                    }
                }
            }
        }

        // Add to sync queue
        await SyncManager.addToQueue('inventory_item', item.id);

        // Emitir evento de actualización de inventario
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.emit('inventory-updated', { item, isNew: !itemId });
        }

        Utils.showNotification(itemId ? 'Pieza actualizada' : 'Pieza agregada', 'success');
        UI.closeModal();
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1520',message:'About to reload inventory after save',data:{itemId:item.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Esperar un momento para asegurar que el item se guardó correctamente
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Forzar recarga completa
        await this.loadInventory();
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inventory.js:1525',message:'Inventory reloaded after save',data:{itemId:item.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
    },

    async editItem(itemId) {
        UI.closeModal();
        await this.showAddForm(itemId);
    },

    async printJewelryLabel(itemId) {
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

                UI.showModal('Vista Previa de Importación CSV', body, footer);
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
        try {
            const items = await DB.getAll('inventory_items');
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
            if (!format) return;
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `inventario_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `inventario_${date}.xlsx`, 'Inventario');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `inventario_${date}.pdf`, 'Inventario', { includeImages: true });
            }
        } catch (e) {
            console.error('Error exporting inventory:', e);
            Utils.showNotification('Error al exportar', 'error');
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

    async displayInventoryStats(items) {
        const allItems = await DB.getAll('inventory_items') || [];
        
        // Estadísticas de stock
        const stats = {
            total: allItems.length,
            filteredCount: items.length,
            disponible: allItems.filter(i => i.status === 'disponible').length,
            vendida: allItems.filter(i => i.status === 'vendida').length,
            apartada: allItems.filter(i => i.status === 'apartada').length,
            reparacion: allItems.filter(i => i.status === 'reparacion').length,
            totalValue: allItems.reduce((sum, i) => sum + ((i.cost || 0) * (i.stock_actual || 1)), 0),
            totalStock: allItems.reduce((sum, i) => sum + (i.stock_actual || 1), 0),
            withCertificates: allItems.filter(i => i.certificate_type && i.certificate_number).length,
            // Alertas de stock
            stockOut: allItems.filter(i => this.getStockStatus(i) === 'out').length,
            stockLow: allItems.filter(i => this.getStockStatus(i) === 'low').length,
            stockOver: allItems.filter(i => this.getStockStatus(i) === 'over').length,
            stockOk: allItems.filter(i => this.getStockStatus(i) === 'ok').length
        };
        
        const statsContainer = document.getElementById('inventory-stats');
        if (statsContainer) {
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
                
                <!-- Alertas de Stock -->
                <div class="inventory-alerts-bar">
                    <div class="alert-item ${stats.stockOut > 0 ? 'alert-critical' : 'alert-ok'}" onclick="document.getElementById('inventory-stock-alert-filter').value='out'; window.Inventory.loadInventory();">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>${stats.stockOut} Agotado${stats.stockOut !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="alert-item ${stats.stockLow > 0 ? 'alert-warning' : 'alert-ok'}" onclick="document.getElementById('inventory-stock-alert-filter').value='low'; window.Inventory.loadInventory();">
                        <i class="fas fa-arrow-down"></i>
                        <span>${stats.stockLow} Stock Bajo</span>
                    </div>
                    <div class="alert-item ${stats.stockOver > 0 ? 'alert-info' : 'alert-ok'}" onclick="document.getElementById('inventory-stock-alert-filter').value='over'; window.Inventory.loadInventory();">
                        <i class="fas fa-arrow-up"></i>
                        <span>${stats.stockOver} Exceso</span>
                    </div>
                    <div class="alert-item alert-success" onclick="document.getElementById('inventory-stock-alert-filter').value='ok'; window.Inventory.loadInventory();">
                        <i class="fas fa-check"></i>
                        <span>${stats.stockOk} Normal</span>
                    </div>
                </div>
                
                ${items.length !== allItems.length ? `
                <div style="text-align: center; padding: 8px; background: var(--color-bg-tertiary); border-radius: var(--radius-sm); margin-top: 12px;">
                    <span style="font-size: 12px; color: var(--color-text-secondary);">
                        Mostrando ${items.length} de ${allItems.length} piezas
                    </span>
                </div>
                ` : ''}
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
        
        UI.showModal('Resumen de Alertas de Stock', body, footer);
    },
    
    // Exportar alertas de stock
    async exportStockAlerts() {
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
    }
};

window.Inventory = Inventory;

