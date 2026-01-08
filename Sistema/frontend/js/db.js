// IndexedDB Database Manager

const DB = {
    db: null,
    dbName: 'opal_pos_db',
    version: 8, // Incrementado para agregar store exchange_rates_daily

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db, event);
            };
        });
    },

    createStores(db, event = null) {
        // Settings
        if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Device
        if (!db.objectStoreNames.contains('device')) {
            db.createObjectStore('device', { keyPath: 'id' });
        }

        // Audit Log
        if (!db.objectStoreNames.contains('audit_log')) {
            const auditStore = db.createObjectStore('audit_log', { keyPath: 'id', autoIncrement: true });
            auditStore.createIndex('user_id', 'user_id', { unique: false });
            auditStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Employees
        if (!db.objectStoreNames.contains('employees')) {
            const empStore = db.createObjectStore('employees', { keyPath: 'id' });
            empStore.createIndex('barcode', 'barcode', { unique: true });
            empStore.createIndex('branch_id', 'branch_id', { unique: false });
        }

        // Users
        if (!db.objectStoreNames.contains('users')) {
            const userStore = db.createObjectStore('users', { keyPath: 'id' });
            userStore.createIndex('username', 'username', { unique: true });
            userStore.createIndex('employee_id', 'employee_id', { unique: false });
        }

        // Catalog Agencies
        if (!db.objectStoreNames.contains('catalog_agencies')) {
            const agencyStore = db.createObjectStore('catalog_agencies', { keyPath: 'id' });
            agencyStore.createIndex('barcode', 'barcode', { unique: false });
        } else if (event) {
            // Agregar índice si el store ya existe (durante upgrade)
            const transaction = event.target.transaction;
            if (transaction) {
                const agencyStore = transaction.objectStore('catalog_agencies');
                if (!agencyStore.indexNames.contains('barcode')) {
                    agencyStore.createIndex('barcode', 'barcode', { unique: false });
                }
            }
        }

        // Catalog Guides
        if (!db.objectStoreNames.contains('catalog_guides')) {
            const guideStore = db.createObjectStore('catalog_guides', { keyPath: 'id' });
            guideStore.createIndex('agency_id', 'agency_id', { unique: false });
            guideStore.createIndex('barcode', 'barcode', { unique: false });
        } else if (event) {
            // Agregar índice si el store ya existe (durante upgrade)
            const transaction = event.target.transaction;
            if (transaction) {
                const guideStore = transaction.objectStore('catalog_guides');
                if (!guideStore.indexNames.contains('barcode')) {
                    guideStore.createIndex('barcode', 'barcode', { unique: false });
                }
            }
        }

        // Catalog Sellers
        if (!db.objectStoreNames.contains('catalog_sellers')) {
            const sellerStore = db.createObjectStore('catalog_sellers', { keyPath: 'id' });
            sellerStore.createIndex('barcode', 'barcode', { unique: false });
        } else if (event) {
            // Agregar índice si el store ya existe (durante upgrade)
            const transaction = event.target.transaction;
            if (transaction) {
                const sellerStore = transaction.objectStore('catalog_sellers');
                if (!sellerStore.indexNames.contains('barcode')) {
                    sellerStore.createIndex('barcode', 'barcode', { unique: false });
                }
            }
        }

        // Catalog Branches
        if (!db.objectStoreNames.contains('catalog_branches')) {
            db.createObjectStore('catalog_branches', { keyPath: 'id' });
        }

        // Payment Methods
        if (!db.objectStoreNames.contains('payment_methods')) {
            db.createObjectStore('payment_methods', { keyPath: 'id' });
        }

        // Commission Rules
        if (!db.objectStoreNames.contains('commission_rules')) {
            const commStore = db.createObjectStore('commission_rules', { keyPath: 'id' });
            commStore.createIndex('entity_type', 'entity_type', { unique: false });
            commStore.createIndex('entity_id', 'entity_id', { unique: false });
        }

        // Inventory Items
        if (!db.objectStoreNames.contains('inventory_items')) {
            const invStore = db.createObjectStore('inventory_items', { keyPath: 'id' });
            invStore.createIndex('sku', 'sku', { unique: true });
            invStore.createIndex('barcode', 'barcode', { unique: true });
            invStore.createIndex('branch_id', 'branch_id', { unique: false });
            invStore.createIndex('status', 'status', { unique: false });
        }

        // Inventory Photos
        if (!db.objectStoreNames.contains('inventory_photos')) {
            const photoStore = db.createObjectStore('inventory_photos', { keyPath: 'id' });
            photoStore.createIndex('item_id', 'item_id', { unique: false });
        }

        // Inventory Logs
        if (!db.objectStoreNames.contains('inventory_logs')) {
            const logStore = db.createObjectStore('inventory_logs', { keyPath: 'id' });
            logStore.createIndex('item_id', 'item_id', { unique: false });
            logStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Inventory Certificates (Certificados de Joyería)
        if (!db.objectStoreNames.contains('inventory_certificates')) {
            const certStore = db.createObjectStore('inventory_certificates', { keyPath: 'id' });
            certStore.createIndex('item_id', 'item_id', { unique: false });
            certStore.createIndex('certificate_number', 'certificate_number', { unique: false });
        }

        // Inventory Price History (Historial de Precios)
        if (!db.objectStoreNames.contains('inventory_price_history')) {
            const priceStore = db.createObjectStore('inventory_price_history', { keyPath: 'id' });
            priceStore.createIndex('item_id', 'item_id', { unique: false });
            priceStore.createIndex('date', 'date', { unique: false });
        }

        // Sales
        if (!db.objectStoreNames.contains('sales')) {
            const saleStore = db.createObjectStore('sales', { keyPath: 'id' });
            saleStore.createIndex('folio', 'folio', { unique: true });
            saleStore.createIndex('branch_id', 'branch_id', { unique: false });
            saleStore.createIndex('seller_id', 'seller_id', { unique: false });
            saleStore.createIndex('agency_id', 'agency_id', { unique: false });
            saleStore.createIndex('guide_id', 'guide_id', { unique: false });
            saleStore.createIndex('created_at', 'created_at', { unique: false });
            saleStore.createIndex('status', 'status', { unique: false });
            saleStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Sale Items
        if (!db.objectStoreNames.contains('sale_items')) {
            const itemStore = db.createObjectStore('sale_items', { keyPath: 'id' });
            itemStore.createIndex('sale_id', 'sale_id', { unique: false });
            itemStore.createIndex('item_id', 'item_id', { unique: false });
        }

        // Payments
        if (!db.objectStoreNames.contains('payments')) {
            const payStore = db.createObjectStore('payments', { keyPath: 'id' });
            payStore.createIndex('sale_id', 'sale_id', { unique: false });
        }

        // Customers
        if (!db.objectStoreNames.contains('customers')) {
            db.createObjectStore('customers', { keyPath: 'id' });
        }

        // Repairs
        if (!db.objectStoreNames.contains('repairs')) {
            const repStore = db.createObjectStore('repairs', { keyPath: 'id' });
            repStore.createIndex('folio', 'folio', { unique: true });
            repStore.createIndex('status', 'status', { unique: false });
            repStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Repair Photos
        if (!db.objectStoreNames.contains('repair_photos')) {
            const repPhotoStore = db.createObjectStore('repair_photos', { keyPath: 'id' });
            repPhotoStore.createIndex('repair_id', 'repair_id', { unique: false });
        }

        // Cost Entries
        if (!db.objectStoreNames.contains('cost_entries')) {
            const costStore = db.createObjectStore('cost_entries', { keyPath: 'id' });
            costStore.createIndex('branch_id', 'branch_id', { unique: false });
            costStore.createIndex('date', 'date', { unique: false });
            costStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Sync Queue
        if (!db.objectStoreNames.contains('sync_queue')) {
            const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
            syncStore.createIndex('entity_type', 'entity_type', { unique: false });
            syncStore.createIndex('status', 'status', { unique: false });
            syncStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Sync Logs
        if (!db.objectStoreNames.contains('sync_logs')) {
            const logStore = db.createObjectStore('sync_logs', { keyPath: 'id' });
            logStore.createIndex('type', 'type', { unique: false });
            logStore.createIndex('status', 'status', { unique: false });
            logStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Sync Deleted Items (Metadata de items eliminados para sincronización)
        if (!db.objectStoreNames.contains('sync_deleted_items')) {
            const deletedStore = db.createObjectStore('sync_deleted_items', { keyPath: 'id' });
            deletedStore.createIndex('entity_type', 'entity_type', { unique: false });
            deletedStore.createIndex('deleted_at', 'deleted_at', { unique: false });
        }

        // Tourist Reports
        if (!db.objectStoreNames.contains('tourist_reports')) {
            const tourStore = db.createObjectStore('tourist_reports', { keyPath: 'id' });
            tourStore.createIndex('date', 'date', { unique: false });
            tourStore.createIndex('branch_id', 'branch_id', { unique: false });
            tourStore.createIndex('status', 'status', { unique: false });
            tourStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tourist Report Lines
        if (!db.objectStoreNames.contains('tourist_report_lines')) {
            const lineStore = db.createObjectStore('tourist_report_lines', { keyPath: 'id' });
            lineStore.createIndex('report_id', 'report_id', { unique: false });
            lineStore.createIndex('sale_id', 'sale_id', { unique: false });
        }

        // Cash Sessions (Aperturas/Cierres de Caja)
        if (!db.objectStoreNames.contains('cash_sessions')) {
            const cashStore = db.createObjectStore('cash_sessions', { keyPath: 'id' });
            cashStore.createIndex('branch_id', 'branch_id', { unique: false });
            cashStore.createIndex('user_id', 'user_id', { unique: false });
            cashStore.createIndex('date', 'date', { unique: false });
            cashStore.createIndex('status', 'status', { unique: false });
            cashStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Cash Movements (Movimientos de Efectivo)
        if (!db.objectStoreNames.contains('cash_movements')) {
            const moveStore = db.createObjectStore('cash_movements', { keyPath: 'id' });
            moveStore.createIndex('session_id', 'session_id', { unique: false });
            moveStore.createIndex('type', 'type', { unique: false });
            moveStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Barcode Scan History
        if (!db.objectStoreNames.contains('barcode_scan_history')) {
            const scanStore = db.createObjectStore('barcode_scan_history', { keyPath: 'id' });
            scanStore.createIndex('barcode', 'barcode', { unique: false });
            scanStore.createIndex('timestamp', 'timestamp', { unique: false });
            scanStore.createIndex('context', 'context', { unique: false });
        }

        // Barcode Print Templates
        if (!db.objectStoreNames.contains('barcode_print_templates')) {
            db.createObjectStore('barcode_print_templates', { keyPath: 'id' });
        }

        // Arrival Rate Rules (Tabulador maestro de llegadas)
        if (!db.objectStoreNames.contains('arrival_rate_rules')) {
            const arrivalRulesStore = db.createObjectStore('arrival_rate_rules', { keyPath: 'id' });
            arrivalRulesStore.createIndex('agency_id', 'agency_id', { unique: false });
            arrivalRulesStore.createIndex('branch_id', 'branch_id', { unique: false });
            arrivalRulesStore.createIndex('active_from', 'active_from', { unique: false });
            arrivalRulesStore.createIndex('active_to', 'active_to', { unique: false });
        }

        // Agency Arrivals (Captura diaria oficial de llegadas)
        if (!db.objectStoreNames.contains('agency_arrivals')) {
            const arrivalsStore = db.createObjectStore('agency_arrivals', { keyPath: 'id' });
            arrivalsStore.createIndex('date', 'date', { unique: false });
            arrivalsStore.createIndex('branch_id', 'branch_id', { unique: false });
            arrivalsStore.createIndex('agency_id', 'agency_id', { unique: false });
        }

        // Budget Entries (Presupuestos)
        if (!db.objectStoreNames.contains('budget_entries')) {
            const budgetStore = db.createObjectStore('budget_entries', { keyPath: 'id' });
            budgetStore.createIndex('month', 'month', { unique: false });
            budgetStore.createIndex('branch_id', 'branch_id', { unique: false });
            budgetStore.createIndex('year', 'year', { unique: false });
        }

        // Daily Profit Reports (Reportes de utilidad diaria)
        if (!db.objectStoreNames.contains('daily_profit_reports')) {
            const profitStore = db.createObjectStore('daily_profit_reports', { keyPath: 'id' });
            profitStore.createIndex('date', 'date', { unique: false });
            profitStore.createIndex('branch_id', 'branch_id', { unique: false });
        }

        // Exchange Rates Daily (Tipos de Cambio por Fecha)
        if (!db.objectStoreNames.contains('exchange_rates_daily')) {
            const exchangeStore = db.createObjectStore('exchange_rates_daily', { keyPath: 'id' });
            exchangeStore.createIndex('date', 'date', { unique: true });
            exchangeStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Inventory Transfers (Transferencias entre Sucursales)
        if (!db.objectStoreNames.contains('inventory_transfers')) {
            const transferStore = db.createObjectStore('inventory_transfers', { keyPath: 'id' });
            transferStore.createIndex('from_branch_id', 'from_branch_id', { unique: false });
            transferStore.createIndex('to_branch_id', 'to_branch_id', { unique: false });
            transferStore.createIndex('status', 'status', { unique: false });
            transferStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Inventory Transfer Items (Items de Transferencias)
        if (!db.objectStoreNames.contains('inventory_transfer_items')) {
            const transferItemStore = db.createObjectStore('inventory_transfer_items', { keyPath: 'id' });
            transferItemStore.createIndex('transfer_id', 'transfer_id', { unique: false });
            transferItemStore.createIndex('item_id', 'item_id', { unique: false });
        }

        // ===== QA / AUTOPRUEBAS STORES =====
        
        // QA Test Runs (Resumen de cada ejecución de pruebas)
        if (!db.objectStoreNames.contains('qa_test_runs')) {
            const qaRunsStore = db.createObjectStore('qa_test_runs', { keyPath: 'id' });
            qaRunsStore.createIndex('started_at', 'started_at', { unique: false });
            qaRunsStore.createIndex('status', 'status', { unique: false });
            qaRunsStore.createIndex('test_type', 'test_type', { unique: false });
        }

        // QA Coverage (Acciones detectadas y ejecutadas por módulo)
        if (!db.objectStoreNames.contains('qa_coverage')) {
            const qaCoverageStore = db.createObjectStore('qa_coverage', { keyPath: 'id' });
            qaCoverageStore.createIndex('run_id', 'run_id', { unique: false });
            qaCoverageStore.createIndex('module', 'module', { unique: false });
            qaCoverageStore.createIndex('selector', 'selector', { unique: false });
        }

        // QA Errors (Errores capturados durante pruebas)
        if (!db.objectStoreNames.contains('qa_errors')) {
            const qaErrorsStore = db.createObjectStore('qa_errors', { keyPath: 'id' });
            qaErrorsStore.createIndex('run_id', 'run_id', { unique: false });
            qaErrorsStore.createIndex('module', 'module', { unique: false });
            qaErrorsStore.createIndex('severity', 'severity', { unique: false });
            qaErrorsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // QA Fixes (Correcciones aplicadas en auto-fix)
        if (!db.objectStoreNames.contains('qa_fixes')) {
            const qaFixesStore = db.createObjectStore('qa_fixes', { keyPath: 'id' });
            qaFixesStore.createIndex('run_id', 'run_id', { unique: false });
            qaFixesStore.createIndex('fix_type', 'fix_type', { unique: false });
            qaFixesStore.createIndex('entity_type', 'entity_type', { unique: false });
            qaFixesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
    },

    // Generic CRUD operations
    async add(storeName, data, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    reject(new Error('Database not initialized'));
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    reject(new Error(`Store ${storeName} no existe en la base de datos`));
                    return;
                }
                
                // Clean data - remove any non-serializable properties
                const cleanData = JSON.parse(JSON.stringify(data));
                
                // Agregar branch_id automáticamente si no existe y BranchManager está disponible
                if (options.autoBranchId !== false && typeof BranchManager !== 'undefined') {
                    const branchIdField = options.branchIdField || 'branch_id';
                    if (!cleanData[branchIdField]) {
                        const currentBranchId = BranchManager.getCurrentBranchId();
                        if (currentBranchId) {
                            cleanData[branchIdField] = currentBranchId;
                        }
                    }
                }
                
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.add(cleanData);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error('Error in add:', request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error('Exception in add:', e);
                reject(e);
            }
        });
    },

    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    resolve(null);
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    resolve(null);
                    return;
                }
                
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const request = store.get(key);
                request.onsuccess = () => {
                    resolve(request.result || null);
                };
                request.onerror = () => {
                    console.error('Error in get:', request.error);
                    resolve(null);
                };
            } catch (e) {
                console.error('Exception in get:', e);
                resolve(null);
            }
        });
    },

    async getAll(storeName, indexName = null, query = null, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    resolve([]);
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    resolve([]);
                    return;
                }
                
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const source = indexName ? store.index(indexName) : store;
                const request = source.getAll(query);
                request.onsuccess = () => {
                    let results = request.result || [];
                    
                    // Filtrar por branch_id si se especifica y BranchManager está disponible
                    if (options.filterByBranch !== false && typeof BranchManager !== 'undefined') {
                        const branchId = BranchManager.getCurrentBranchId();
                        if (branchId && options.branchIdField) {
                            // Si filterByBranch es explícitamente true, siempre filtrar
                            // Si no es admin, siempre filtrar
                            // Si es admin pero tiene una sucursal seleccionada, también filtrar (para consistencia)
                            const isAdmin = typeof UserManager !== 'undefined' && 
                                           (UserManager.currentUser?.role === 'admin' || 
                                            UserManager.currentUser?.permissions?.includes('all'));
                            
                            // Filtrar si:
                            // 1. filterByBranch es explícitamente true (siempre filtrar)
                            // 2. filterByBranch no está definido y el usuario no es admin (filtrar por defecto para no-admins)
                            // NO filtrar si filterByBranch es explícitamente false (respetar la intención explícita)
                            const shouldFilter = options.filterByBranch === true || (options.filterByBranch !== false && !isAdmin);
                            
                            if (shouldFilter) {
                                // Primero intentar filtrar por branch_id
                                let filtered = results.filter(item => 
                                    item[options.branchIdField] === branchId
                                );
                                
                                // Si no hay resultados y includeNull no está explícitamente false, incluir items sin branch_id como fallback
                                if (filtered.length === 0 && options.includeNull !== false) {
                                    const itemsWithoutBranch = results.filter(item => !item[options.branchIdField]);
                                    if (itemsWithoutBranch.length > 0) {
                                        console.log(`[DB] No hay items para sucursal ${branchId}, mostrando ${itemsWithoutBranch.length} items sin sucursal asignada`);
                                        filtered = itemsWithoutBranch;
                                    } else {
                                        // Si tampoco hay items sin branch_id, mostrar TODOS los productos disponibles
                                        // Esto permite que el sistema funcione incluso si los productos no tienen branch_id asignado
                                        console.log(`[DB] No hay items para sucursal ${branchId} ni sin sucursal, mostrando todos los productos disponibles (${results.length} items)`);
                                        filtered = results;
                                    }
                                }
                                
                                results = filtered;
                            }
                        }
                    }
                    
                    resolve(results);
                };
                request.onerror = () => {
                    console.error('Error in getAll:', request.error);
                    resolve([]);
                };
            } catch (e) {
                console.error('Exception in getAll:', e);
                resolve([]);
            }
        });
    },

    async put(storeName, data, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    reject(new Error('Database not initialized'));
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    reject(new Error(`Store ${storeName} no existe en la base de datos`));
                    return;
                }
                
                // Clean data - remove any non-serializable properties
                const cleanData = JSON.parse(JSON.stringify(data));
                
                // Agregar branch_id automáticamente si no existe y BranchManager está disponible
                if (options.autoBranchId !== false && typeof BranchManager !== 'undefined') {
                    const branchIdField = options.branchIdField || 'branch_id';
                    if (!cleanData[branchIdField]) {
                        const currentBranchId = BranchManager.getCurrentBranchId();
                        if (currentBranchId) {
                            cleanData[branchIdField] = currentBranchId;
                        }
                    }
                }
                
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(cleanData);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    console.error('Error in put:', request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error('Exception in put:', e);
                reject(e);
            }
        });
    },

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    reject(new Error('Database not initialized'));
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    reject(new Error(`Store ${storeName} no existe en la base de datos`));
                    return;
                }
                
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(key);
                
                // Asegurarse de que la transacción se complete antes de resolver
                tx.oncomplete = () => {
                    resolve();
                };
                
                request.onsuccess = () => {
                    // El request fue exitoso, pero esperamos a que la transacción se complete
                    // Si la transacción ya se completó, resolve se llamará desde tx.oncomplete
                    // Si no, tx.oncomplete se encargará de resolver
                };
                
                request.onerror = () => {
                    console.error('Error in delete:', request.error);
                    reject(request.error);
                };
                
                tx.onerror = () => {
                    console.error('Error in transaction:', tx.error);
                    reject(tx.error || new Error('Error en transacción de eliminación'));
                };
            } catch (e) {
                console.error('Exception in delete:', e);
                reject(e);
            }
        });
    },

    async query(storeName, indexName, query, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    resolve([]);
                    return;
                }
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    resolve([]);
                    return;
                }
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                
                // Verificar si el índice existe
                if (indexName && !store.indexNames.contains(indexName)) {
                    console.warn(`Índice ${indexName} no existe en el store ${storeName}, usando getAll y filtrando manualmente`);
                    // Fallback: obtener todos y filtrar manualmente
                    const request = store.getAll();
                    request.onsuccess = () => {
                        let results = request.result || [];
                        let filtered = results.filter(item => {
                            if (query === null || query === undefined) return true;
                            return item[indexName] === query;
                        });
                        
                        // Filtrar por branch_id si se especifica
                        if (options.filterByBranch !== false && typeof BranchManager !== 'undefined') {
                            const branchId = BranchManager.getCurrentBranchId();
                            if (branchId && options.branchIdField) {
                                const isAdmin = typeof UserManager !== 'undefined' && 
                                               (UserManager.currentUser?.role === 'admin' || 
                                                UserManager.currentUser?.permissions?.includes('all'));
                                
                                // Filtrar si: filterByBranch es explícitamente true, o no está definido y no es admin
                                // NO filtrar si filterByBranch es explícitamente false
                                const shouldFilter = options.filterByBranch === true || (options.filterByBranch !== false && !isAdmin);
                                
                                if (shouldFilter) {
                                    filtered = filtered.filter(item => 
                                        !item[options.branchIdField] || 
                                        item[options.branchIdField] === branchId ||
                                        (options.includeNull && !item[options.branchIdField])
                                    );
                                }
                            }
                        }
                        
                        resolve(filtered);
                    };
                    request.onerror = () => {
                        console.error('Error in query fallback:', request.error);
                        resolve([]);
                    };
                    return;
                }
                
                const index = indexName ? store.index(indexName) : store;
                const request = index.getAll(query);
                request.onsuccess = () => {
                    let results = request.result || [];
                    
                    // Filtrar por branch_id si se especifica
                    if (options.filterByBranch !== false && typeof BranchManager !== 'undefined') {
                        const branchId = BranchManager.getCurrentBranchId();
                        if (branchId && options.branchIdField) {
                            const isAdmin = typeof UserManager !== 'undefined' && 
                                           (UserManager.currentUser?.role === 'admin' || 
                                            UserManager.currentUser?.permissions?.includes('all'));
                            
                            // Filtrar si: filterByBranch es true, no es admin, o es admin con sucursal seleccionada
                            const shouldFilter = options.filterByBranch === true || !isAdmin || (isAdmin && branchId);
                            
                            if (shouldFilter) {
                                results = results.filter(item => 
                                    !item[options.branchIdField] || 
                                    item[options.branchIdField] === branchId ||
                                    (options.includeNull && !item[options.branchIdField])
                                );
                            }
                        }
                    }
                    
                    resolve(results);
                };
                request.onerror = () => {
                    console.error('Error in query:', request.error);
                    resolve([]);
                };
            } catch (e) {
                console.error('Exception in query:', e);
                resolve([]);
            }
        });
    },

    async count(storeName, indexName = null, query = null) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    resolve(0);
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    resolve(0);
                    return;
                }
                
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const source = indexName ? store.index(indexName) : store;
                const request = source.count(query);
                request.onsuccess = () => {
                    resolve(request.result || 0);
                };
                request.onerror = () => {
                    console.error('Error in count:', request.error);
                    resolve(0);
                };
            } catch (e) {
                console.error('Exception in count:', e);
                resolve(0);
            }
        });
    },

    // Helper: Get by index unique value
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    resolve(null);
                    return;
                }
                
                // Verificar que el store existe antes de intentar acceder
                if (!this.db.objectStoreNames.contains(storeName)) {
                    console.warn(`Store ${storeName} no existe en la base de datos`);
                    resolve(null);
                    return;
                }
                
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.get(value);
                request.onsuccess = () => {
                    resolve(request.result || null);
                };
                request.onerror = () => {
                    console.error('Error in getByIndex:', request.error);
                    resolve(null);
                };
            } catch (e) {
                console.error('Exception in getByIndex:', e);
                resolve(null);
            }
        });
    },

    // Clear all data from a store
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    console.error('Database not initialized');
                    reject(new Error('Database not initialized'));
                    return;
                }
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = () => {
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Error in clear:', request.error);
                    reject(request.error);
                };
            } catch (e) {
                console.error('Exception in clear:', e);
                reject(e);
            }
        });
    }
};

