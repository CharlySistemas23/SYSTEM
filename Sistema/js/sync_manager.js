// Sync Manager - Gestión de sincronización con el servidor

const SyncManager = {
    initialized: false,
    syncQueue: [],
    isSyncing: false,
    syncInterval: null,

    async init() {
        if (this.initialized) return;
        
        // Cargar cola de sincronización desde IndexedDB
        await this.loadQueue();
        
        // Intentar sincronizar al iniciar (verificar desde DB)
        try {
            if (typeof DB !== 'undefined') {
                const urlSetting = await DB.get('settings', 'api_url');
                const apiUrl = urlSetting?.value || null;
                let hasToken = (typeof API !== 'undefined' && API.token) || !!localStorage.getItem('api_token');
                
                // Sincronizar API.baseURL y API.token si es necesario
                if (apiUrl && typeof API !== 'undefined') {
                    if (!API.baseURL || API.baseURL !== apiUrl) {
                        API.baseURL = apiUrl;
                        console.log(`🔄 API.baseURL sincronizado desde DB: ${apiUrl}`);
                    }
                    if (!API.token && hasToken) {
                        API.token = localStorage.getItem('api_token');
                        console.log('🔄 API.token cargado desde localStorage');
                        hasToken = true;
                    }
                    
                    // Verificar validez del token antes de continuar
                    if (hasToken && typeof API.verifyToken === 'function') {
                        const valid = await API.verifyToken();
                    // valid === null => error transitorio (no borrar token)
                    if (valid === false || (valid && valid.valid === false)) {
                            console.warn('⚠️ Token inválido o expirado. Limpiando y reintentando login automático...');
                            API.token = null;
                            localStorage.removeItem('api_token');
                            hasToken = false;
                            this._autoLoginAttempted = false;
                        }
                    }
                    
                    // Si no hay token, no intentar login automático por seguridad
                    if (!hasToken) {
                        console.log('ℹ️ Sin token al iniciar. Se requiere login explícito del usuario.');
                    }
                    
                    // Inicializar socket si hay URL y token pero no está conectado
                    if (API.baseURL && API.token && (!API.socket || !API.socket.connected)) {
                        try {
                            await API.initSocket();
                            console.log('✅ Socket inicializado desde SyncManager.init()');
                        } catch (socketError) {
                            console.warn('⚠️ Error inicializando socket:', socketError);
                        }
                    }
                    
                    // Sincronizar en background (no bloquear init para Cache-First)
                    // IMPORTANTE: no promover automáticamente datos locales históricos/mock al servidor,
                    // a menos que se habilite explícitamente.
                    if (API.baseURL) {
                        const autoBootstrapSyncEnabled =
                            localStorage.getItem('AUTO_BOOTSTRAP_SYNC_LOCAL_DATA') === 'true' ||
                            window.AUTO_BOOTSTRAP_SYNC_LOCAL_DATA === true;

                        Promise.resolve().then(async () => {
                            if (autoBootstrapSyncEnabled) {
                                await this.syncLocalDataToServer();
                            }
                            await this.syncPending();
                        }).catch(e => console.warn('Sync init background:', e));
                    }
                }
            }
        } catch (error) {
            console.error('Error inicializando SyncManager:', error);
        }
        
        // Configurar intervalo de sincronización (cada 10 segundos - más agresivo)
        // Solo sincronizar si hay elementos pendientes
        this.syncInterval = setInterval(async () => {
            // Verificar disponibilidad del API antes de sincronizar
            try {
                if (typeof DB !== 'undefined') {
                    const urlSetting = await DB.get('settings', 'api_url');
                    const apiUrl = urlSetting?.value || null;
                    const hasToken = (typeof API !== 'undefined' && API.token) || !!localStorage.getItem('api_token');
                    
                    // Sincronizar API.baseURL si es necesario
                    if (apiUrl && typeof API !== 'undefined') {
                        if (!API.baseURL || API.baseURL !== apiUrl) {
                            API.baseURL = apiUrl;
                        }
                        if (!API.token && hasToken) {
                            API.token = localStorage.getItem('api_token');
                        }
                    }
                    
                    if (apiUrl && hasToken && typeof API !== 'undefined' && API.baseURL && API.token && !this.isSyncing && this.syncQueue.length > 0) {
                        this.syncPending();
                    }
                }
            } catch (error) {
                console.error('Error en intervalo de sincronización:', error);
            }
        }, 10000);
        
        // Escuchar eventos de conexión
        if (typeof API !== 'undefined' && API.socket) {
            API.socket.on('connect', () => {
                console.log('🔄 Reconectado, sincronizando pendientes...');
                this.syncPending();
            });
        }
        
        this.initialized = true;
    },

    async loadQueue() {
        try {
            const queue = await DB.getAll('sync_queue') || [];
            this.syncQueue = queue;
            console.log(`📋 Cola de sincronización cargada: ${queue.length} elementos`);
        } catch (error) {
            console.error('Error cargando cola de sincronización:', error);
            this.syncQueue = [];
        }
    },

    getQueueSize() {
        return this.syncQueue ? this.syncQueue.length : 0;
    },

    async addToQueue(type, entityId, data = null) {
        try {
            const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

            // Evitar encolar duplicados (mismo tipo + entity_id)
            if (Array.isArray(this.syncQueue) && this.syncQueue.some(q => q.type === type && q.entity_id === entityId)) {
                console.warn(`ℹ️ Ya existe en cola: ${type} - ${entityId}`);
                return;
            }

            // No encolar transferencias con ID UUID (si ya viene del servidor)
            if (type === 'inventory_transfer' && isUUID(entityId)) {
                console.warn(`ℹ️ inventory_transfer con id UUID no se encola (ya existe en servidor): ${entityId}`);
                return;
            }

            const queueItem = {
                id: Utils.generateId(),
                type: type,
                entity_id: entityId,
                data: data,
                created_at: new Date().toISOString(),
                retry_count: 0
            };
            
            await DB.add('sync_queue', queueItem);
            this.syncQueue.push(queueItem);
            
            console.log(`➕ Agregado a cola de sincronización: ${type} - ${entityId}`);
            
            // Intentar sincronizar inmediatamente si hay conexión (sin delay para mejor responsividad)
            if (typeof API !== 'undefined' && API.baseURL && API.token && !this.isSyncing) {
                // Usar requestIdleCallback si está disponible, sino setTimeout
                if (window.requestIdleCallback) {
                    requestIdleCallback(() => this.syncPending(), { timeout: 500 });
                } else {
                    setTimeout(() => this.syncPending(), 500);
                }
            }
        } catch (error) {
            console.error('Error agregando a cola de sincronización:', error);
        }
    },

    async syncPending() {
        if (this.isSyncing) {
            return; // Silenciar log si ya está sincronizando
        }

        // Verificar que API esté definido y configurado
        // Primero verificar desde la base de datos (fuente de verdad)
        let apiUrl = null;
        let hasToken = false;
        
        try {
            if (typeof DB !== 'undefined') {
                const urlSetting = await DB.get('settings', 'api_url');
                apiUrl = urlSetting?.value || null;
            }
            hasToken = (typeof API !== 'undefined' && API.token) || !!localStorage.getItem('api_token');
            
            // Sincronizar API.baseURL con la base de datos si es necesario
            if (apiUrl && typeof API !== 'undefined') {
                if (!API.baseURL || API.baseURL !== apiUrl) {
                    API.baseURL = apiUrl;
                    console.log(`🔄 API.baseURL sincronizado: ${apiUrl}`);
                }
                
                // Si hay URL pero no token, intentar cargar desde localStorage
                if (!API.token && hasToken) {
                    API.token = localStorage.getItem('api_token');
                    console.log('🔄 API.token cargado desde localStorage');
                    
                    // Inicializar socket si hay URL y token pero no está conectado
                    if (API.baseURL && API.token && (!API.socket || !API.socket.connected)) {
                        try {
                            await API.initSocket();
                            console.log('✅ Socket inicializado desde syncPending()');
                        } catch (socketError) {
                            console.warn('⚠️ Error inicializando socket:', socketError);
                        }
                    }
                }
                
                // Verificar token y limpiar si es inválido para forzar re-login
                // Solo verificar una vez por sincronización para evitar rate limits
                if (!this._lastTokenCheck || (Date.now() - this._lastTokenCheck) > 60000) { // 1 minuto
                    if (((typeof API !== 'undefined' && API.token) || hasToken) && typeof API.verifyToken === 'function') {
                        const valid = await API.verifyToken();
                        this._lastTokenCheck = Date.now();
                        // valid === null => error transitorio (no borrar token, incluye 429)
                        if (valid === false || (valid && valid.valid === false)) {
                            console.warn('⚠️ Token inválido/expirado detectado durante sync. Limpiando y reintentando login automático...');
                            API.token = null;
                            localStorage.removeItem('api_token');
                            hasToken = false;
                            this._autoLoginAttempted = false;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error verificando API desde DB:', error);
        }
        
        // Verificar disponibilidad final
        if (typeof API === 'undefined' || !apiUrl) {
            // Solo mostrar warning si no hay URL configurada (una vez, no repetidamente)
            if (!apiUrl && !this._urlWarningShown) {
                console.warn('⚠️ API no disponible: URL no configurada');
                this._urlWarningShown = true;
            }
            return;
        }
        
        // Asegurar que API.baseURL esté configurado
        if (typeof API !== 'undefined' && !API.baseURL) {
            API.baseURL = apiUrl;
            console.log(`🔄 API.baseURL configurado: ${apiUrl}`);
        }
        
        // Si no hay token, no intentar login automático por seguridad.
        // Se mantiene fallback de headers en operaciones permitidas.
        if (!hasToken) {
            console.log('ℹ️ Sin token detectado. Sincronizando con fallback de headers (x-username/x-branch-id) cuando aplique.');
        }
        
        // Verificar que API.baseURL esté configurado (token opcional: se puede usar fallback)
        if (!API.baseURL) {
            console.warn('⚠️ API no disponible: baseURL no configurado');
            return;
        }
        
        // Log importante: indicar si se usará token o fallback
        if (hasToken) {
            console.log('🔐 Sincronizando con token de autenticación');
        } else {
            console.log('🔐 Sincronizando con fallback de headers (x-username/x-branch-id)');
        }

        if (this.syncQueue.length === 0) {
            return;
        }

        this.isSyncing = true;
        const queueSize = this.syncQueue.length;
        console.log(`🔄 ========================================`);
        console.log(`🔄 INICIANDO SINCRONIZACIÓN`);
        console.log(`🔄 Elementos en cola: ${queueSize}`);
        console.log(`🔄 URL del servidor: ${API.baseURL}`);
        console.log(`🔄 Token disponible: ${hasToken ? 'Sí' : 'No (usando fallback)'}`);
        console.log(`🔄 ========================================`);

        const toSync = [...this.syncQueue];
        let successCount = 0;
        let errorCount = 0;

        // Verificar si el usuario actual es master_admin
        const isMasterAdmin = typeof UserManager !== 'undefined' && (
            UserManager.currentUser?.role === 'master_admin' ||
            UserManager.currentUser?.is_master_admin ||
            UserManager.currentUser?.isMasterAdmin ||
            UserManager.currentEmployee?.role === 'master_admin'
        );

        for (const item of toSync) {
            try {
                // Verificar que API esté disponible antes de procesar cada item (token opcional)
                if (typeof API === 'undefined' || !API.baseURL) {
                    console.error('❌ API no disponible, deteniendo sincronización');
                    console.error(`   API definido: ${typeof API !== 'undefined'}`);
                    console.error(`   API.baseURL: ${typeof API !== 'undefined' ? API.baseURL : 'undefined'}`);
                    break; // Salir del loop si API no está disponible
                }
                
                // Verificar permisos para entidades que requieren master_admin
                if ((item.type === 'branch' || item.type === 'catalog_branch' || item.type === 'employee') && !isMasterAdmin) {
                    // Reducir verbosidad: solo loguear la primera vez o usar debug
                    // console.debug(`⚠️  Omitiendo sincronización de ${item.type} - Se requiere rol de administrador maestro`);
                    // console.debug(`   Usuario actual no es master_admin, eliminando de cola: ${item.entity_id}`);
                    await DB.delete('sync_queue', item.id);
                    continue; // Omitir este item y continuar con el siguiente
                }
                
                // Log detallado para debugging
                console.log(`🔄 ───────────────────────────────────────`);
                console.log(`🔄 Procesando item de cola:`);
                console.log(`   Tipo: ${item.type}`);
                console.log(`   Entity ID: ${item.entity_id}`);
                console.log(`   Data: ${item.data || 'null'}`);
                console.log(`   URL: ${API.baseURL}`);
                console.log(`   Token: ${hasToken ? 'Presente' : 'Ausente (usando fallback)'}`);
                
                // Obtener datos de la entidad
                let entityData;
                switch (item.type) {
                    case 'sale':
                        // Manejar eliminaciones
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteSale !== 'function') {
                                    throw new Error('API.deleteSale no disponible');
                                }
                                await API.deleteSale(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando venta en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones (las ventas no se actualizan)
                            entityData = await DB.get('sales', item.entity_id);
                            if (entityData) {
                                if (typeof API === 'undefined' || typeof API.createSale !== 'function') {
                                    throw new Error('API.createSale no disponible');
                                }

                                const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

                                // Construir payload compatible con backend (routes/sales.js)
                                const payload = { ...entityData };
                                if (payload.branch_id && !isUUID(payload.branch_id)) delete payload.branch_id;
                                if (payload.seller_id && !isUUID(payload.seller_id)) payload.seller_id = null;
                                if (payload.guide_id && !isUUID(payload.guide_id)) payload.guide_id = null;
                                if (payload.agency_id && !isUUID(payload.agency_id)) payload.agency_id = null;
                                if (payload.customer_id && !isUUID(payload.customer_id)) payload.customer_id = null;

                                // Items: si vienen en la venta, normalizar; si no, cargar de store sale_items.
                                let saleItems = Array.isArray(payload.items) ? payload.items : null;
                                if (!saleItems) {
                                    try {
                                        saleItems = await DB.query('sale_items', 'sale_id', payload.id);
                                    } catch (e) {
                                        saleItems = [];
                                    }
                                }
                                const normalizedItems = [];
                                for (const it of (saleItems || [])) {
                                    const qty = it.quantity || 1;
                                    const unitPrice = (it.unit_price ?? it.price ?? 0);
                                    const discountPct = (it.discount_percent ?? it.discount ?? 0);
                                    const subtotal = (it.subtotal ?? (unitPrice * qty) * (1 - (discountPct / 100)));

                                    // Enlazar item_id si es UUID; si no, intentar resolver por SKU/Barcode; si no, omitir item_id.
                                    let itemId = it.item_id;
                                    let sku = it.sku;
                                    let name = it.name;

                                    if (!sku || !name) {
                                        try {
                                            const localInv = it.item_id ? await DB.get('inventory_items', it.item_id) : null;
                                            sku = sku || localInv?.sku;
                                            name = name || localInv?.name;
                                        } catch (e) {}
                                    }

                                    if (itemId && !isUUID(itemId)) {
                                        // Resolver por SKU/Barcode si hay API disponible
                                        try {
                                            const searchKey = sku || it.barcode || null;
                                            if (searchKey && typeof API.getInventoryItems === 'function') {
                                                const candidates = await API.getInventoryItems({ search: String(searchKey) });
                                                const found = (candidates || []).find(c => c && ((sku && c.sku === sku) || (it.barcode && c.barcode === it.barcode)));
                                                if (found && found.id) {
                                                    itemId = found.id;
                                                } else {
                                                    itemId = null;
                                                }
                                            } else {
                                                itemId = null;
                                            }
                                        } catch (e) {
                                            itemId = null;
                                        }
                                    }

                                    normalizedItems.push({
                                        item_id: (itemId && isUUID(itemId)) ? itemId : null,
                                        sku: sku || null,
                                        name: name || null,
                                        quantity: qty,
                                        unit_price: unitPrice,
                                        discount_percent: discountPct,
                                        subtotal: subtotal
                                    });
                                }
                                payload.items = normalizedItems;

                                if (!Array.isArray(payload.items) || payload.items.length === 0) {
                                    console.warn(`⚠️ sale ${item.entity_id} sin items válidos. Eliminando de cola para evitar reintentos infinitos.`);
                                    await DB.delete('sync_queue', item.id);
                                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                    continue;
                                }

                                // Payments: si no vienen en payload, cargar store payments
                                if (!Array.isArray(payload.payments)) {
                                    try {
                                        payload.payments = await DB.query('payments', 'sale_id', payload.id);
                                    } catch (e) {
                                        payload.payments = [];
                                    }
                                }

                                if (!Array.isArray(payload.payments) || payload.payments.length === 0) {
                                    console.warn(`⚠️ sale ${item.entity_id} sin pagos válidos. Eliminando de cola para evitar reintentos infinitos.`);
                                    await DB.delete('sync_queue', item.id);
                                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                    continue;
                                }

                                const created = await API.createSale(payload);

                                // Reconciliar IDs: si el servidor generó otro id, migrar sale_id en sale_items/payments
                                try {
                                    if (created && created.id && created.id !== entityData.id) {
                                        const oldSaleId = entityData.id;
                                        const newSaleId = created.id;

                                        await DB.put('sales', created, { autoBranchId: false });
                                        await DB.delete('sales', oldSaleId);

                                        const localSaleItems = await DB.query('sale_items', 'sale_id', oldSaleId);
                                        for (const si of (localSaleItems || [])) {
                                            await DB.put('sale_items', { ...si, sale_id: newSaleId }, { autoBranchId: false });
                                            await DB.delete('sale_items', si.id);
                                        }

                                        const localPays = await DB.query('payments', 'sale_id', oldSaleId);
                                        for (const p of (localPays || [])) {
                                            await DB.put('payments', { ...p, sale_id: newSaleId }, { autoBranchId: false });
                                            await DB.delete('payments', p.id);
                                        }
                                    }
                                } catch (e) {
                                    console.warn('No se pudo reconciliar sale_id local→servidor:', e);
                                }

                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            }
                        }
                        break;

                    case 'inventory':
                    case 'inventory_item': // También manejar 'inventory_item' usado en inventory.js
                        // Manejar eliminaciones PRIMERO
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteInventoryItem !== 'function') {
                                    throw new Error('API.deleteInventoryItem no disponible');
                                }
                                await API.deleteInventoryItem(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando item de inventario en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('inventory_items', item.entity_id);
                            if (!entityData) {
                                // Caso común: el item fue reconciliado/eliminado como “fantasma” en Inventory.loadInventory,
                                // pero quedó una entrada vieja en sync_queue. No se puede sincronizar: eliminar de la cola.
                                console.warn(`⚠️ inventory_item ${item.entity_id} no existe localmente. Eliminando de cola: ${item.id}`);
                                await DB.delete('sync_queue', item.id);
                                this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                // No contar como error: es limpieza
                                continue;
                            }

                            if (typeof API === 'undefined') {
                                throw new Error('API no disponible');
                            }
                            if (entityData.id && await this.entityExists('inventory_items', entityData.id)) {
                                if (typeof API.updateInventoryItem !== 'function') {
                                    throw new Error('API.updateInventoryItem no disponible');
                                }
                                await API.updateInventoryItem(entityData.id, entityData);
                            } else {
                                if (typeof API.createInventoryItem !== 'function') {
                                    throw new Error('API.createInventoryItem no disponible');
                                }
                                const created = await API.createInventoryItem(entityData);
                                // Si el item local tenía id no-UUID, el servidor generó uno nuevo.
                                // Para evitar “fantasmas”, migrar a id del servidor.
                                try {
                                    if (created && created.id && created.id !== entityData.id) {
                                        await DB.put('inventory_items', created, { autoBranchId: false });
                                        await DB.delete('inventory_items', entityData.id);
                                    }
                                } catch (e) {
                                    console.warn('No se pudo migrar item local a id del servidor:', e);
                                }
                            }
                            await DB.delete('sync_queue', item.id);
                            successCount++;
                        }
                        break;

                    case 'inventory_transfer':
                        entityData = await DB.get('inventory_transfers', item.entity_id);
                        if (!entityData) {
                            // Transferencia ya no existe localmente -> limpiar cola
                            await DB.delete('sync_queue', item.id);
                            this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                            continue;
                        }

                        try {
                            if (typeof API === 'undefined' || typeof API.createTransfer !== 'function') {
                                throw new Error('API.createTransfer no disponible');
                            }

                            // Construir payload correcto (el backend requiere items[] y toma from_branch_id del usuario
                            // o del body si es master admin). No mandar el objeto entero del store.
                            const transferItems = await DB.query('inventory_transfer_items', 'transfer_id', entityData.id) || [];
                            const itemsPayload = (transferItems || [])
                                .filter(ti => ti?.item_id)
                                .map(ti => ({ item_id: ti.item_id, quantity: ti.quantity || 1 }));

                            if (itemsPayload.length === 0) {
                                console.warn(`⚠️ inventory_transfer ${entityData.id} sin items. Eliminando de cola.`);
                                await DB.delete('sync_queue', item.id);
                                this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                continue;
                            }

                            const payload = {
                                // permitir que el backend use from_branch_id si es master admin (si no, lo ignorará)
                                from_branch_id: entityData.from_branch_id || null,
                                to_branch_id: entityData.to_branch_id,
                                notes: entityData.notes || '',
                                items: itemsPayload
                            };

                            await API.createTransfer(payload);
                            await DB.delete('sync_queue', item.id);
                            successCount++;
                        } catch (error) {
                            // Errores permanentes típicos: item no pertenece a la sucursal origen / stock / etc.
                            if (error?.message && (error.message.includes('no encontrado en tu sucursal') || error.message.includes('Stock insuficiente'))) {
                                console.warn(`⚠️ inventory_transfer inválida (permanente). Eliminando de cola: ${entityData.id}`);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } else if (error?.message && error.message.includes('ya existe')) {
                                console.warn(`Transferencia ${item.entity_id} ya existe en servidor, saltando...`);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } else {
                                throw error;
                            }
                        }
                        break;

                    case 'payment':
                        // Los pagos normalmente se sincronizan con las ventas
                        // Si hay un endpoint específico, se puede agregar aquí
                        // Por ahora, simplemente eliminarlos de la cola (se sincronizan con las ventas)
                        console.warn(`⚠️  Pagos se sincronizan automáticamente con las ventas, eliminando de cola: ${item.entity_id}`);
                        await DB.delete('sync_queue', item.id);
                        break;

                    case 'inventory_log':
                        // Los logs de inventario no se sincronizan al servidor (son solo locales)
                        console.warn(`⚠️  Los logs de inventario son solo locales, eliminando de cola: ${item.entity_id}`);
                        await DB.delete('sync_queue', item.id);
                        break;

                    case 'customer':
                        // Manejar eliminaciones PRIMERO
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteCustomer !== 'function') {
                                    throw new Error('API.deleteCustomer no disponible');
                                }
                                await API.deleteCustomer(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando cliente en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('customers', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') {
                                        throw new Error('API no disponible');
                                    }
                                    // Verificar si el cliente existe en el servidor
                                    const exists = await this.entityExists('customers', entityData.id);
                                    if (exists) {
                                        if (typeof API.updateCustomer !== 'function') {
                                            throw new Error('API.updateCustomer no disponible');
                                        }
                                        await API.updateCustomer(entityData.id, entityData);
                                    } else {
                                        if (typeof API.createCustomer !== 'function') {
                                            throw new Error('API.createCustomer no disponible');
                                        }
                                        await API.createCustomer(entityData);
                                    }
                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando cliente:', error);
                                    throw error;
                                }
                            } else {
                                // Si el cliente no existe localmente y no es eliminación, eliminar de la cola
                                console.warn(`⚠️  Cliente ${item.entity_id} no encontrado localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'repair':
                        // Manejar eliminaciones PRIMERO
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteRepair !== 'function') {
                                    throw new Error('API.deleteRepair no disponible');
                                }
                                await API.deleteRepair(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando reparación en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('repairs', item.entity_id);
                            if (entityData) {
                                const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

                                // Validación mínima (si falta, no tiene sentido reintentar)
                                if (!entityData.folio || !entityData.description) {
                                    console.warn(`⚠️ repair inválido (faltan campos). Eliminando de cola: ${item.entity_id}`);
                                    await DB.delete('sync_queue', item.id);
                                    break;
                                }

                                // Normalizar IDs para evitar 500 por UUID inválido
                                if (entityData.branch_id && !isUUID(entityData.branch_id)) {
                                    try {
                                        entityData.branch_id = null;
                                        await DB.put('repairs', entityData, { autoBranchId: false });
                                    } catch (e) {}
                                }
                                if (entityData.customer_id && !isUUID(entityData.customer_id)) {
                                    try {
                                        entityData.customer_id = null;
                                        await DB.put('repairs', entityData, { autoBranchId: false });
                                    } catch (e) {}
                                }

                                // Construir payload “limpio”
                                const payload = {
                                    folio: entityData.folio,
                                    branch_id: (entityData.branch_id && isUUID(entityData.branch_id)) ? entityData.branch_id : undefined,
                                    customer_id: (entityData.customer_id && isUUID(entityData.customer_id)) ? entityData.customer_id : undefined,
                                    description: entityData.description,
                                    estimated_cost: entityData.estimated_cost ?? 0,
                                    estimated_delivery_date: entityData.estimated_delivery_date || null,
                                    notes: entityData.notes || '',
                                    status: entityData.status || 'pending',
                                    photos: entityData.photos || []
                                };

                                if (typeof API === 'undefined') {
                                    throw new Error('API no disponible');
                                }
                                if (entityData.id && await this.entityExists('repairs', entityData.id)) {
                                    if (!API.updateRepair) {
                                        throw new Error('API.updateRepair no disponible');
                                    }
                                    await API.updateRepair(entityData.id, payload);
                                } else {
                                    if (!API.createRepair) {
                                        throw new Error('API.createRepair no disponible');
                                    }
                                    const created = await API.createRepair(payload);
                                    // Migrar id local → id servidor si aplica
                                    try {
                                        if (created?.id && created.id !== entityData.id) {
                                            await DB.put('repairs', { ...entityData, ...created, id: created.id }, { autoBranchId: false });
                                            await DB.delete('repairs', entityData.id);
                                        }
                                    } catch (e) {
                                        console.warn('No se pudo migrar repair local a id del servidor:', e);
                                    }
                                }
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            }
                        }
                        break;

                    case 'cost':
                    case 'cost_entry': // Manejar también 'cost_entry' usado por frontend
                        // Manejar eliminaciones PRIMERO
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteCost !== 'function') {
                                    throw new Error('API.deleteCost no disponible');
                                }
                                await API.deleteCost(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando costo en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('cost_entries', item.entity_id);
                            if (!entityData) {
                                // Si el cost_entry no existe localmente, eliminar de la cola
                                console.warn(`⚠️ cost_entry ${item.entity_id} no encontrado localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                                break;
                            }
                            
                            // Sanitizar payload: branch_id e id deben ser UUID para Postgres.
                            const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                            // Normalizar entidad local (evita 500 "invalid input syntax for type uuid: branch3")
                            if (entityData.branch_id && !isUUID(entityData.branch_id)) {
                                try {
                                    entityData.branch_id = null;
                                    await DB.put('cost_entries', entityData, { autoBranchId: false });
                                } catch (e) {
                                    // no bloquear sync si no se puede persistir la normalización
                                }
                            }

                            if (typeof API === 'undefined') {
                                throw new Error('API no disponible');
                            }

                            // Si faltan campos requeridos, no tiene sentido reintentar: eliminar de cola
                            const amountNum = typeof entityData.amount === 'number' ? entityData.amount : parseFloat(entityData.amount);
                            const requiredOk =
                                !isNaN(amountNum) && amountNum > 0 &&
                                (entityData.type === 'fijo' || entityData.type === 'variable') &&
                                !!(entityData.date || entityData.created_at);
                            if (!requiredOk) {
                                console.warn(`⚠️ cost_entry inválido (faltan campos). Eliminando de cola: ${item.entity_id}`, entityData);
                                await DB.delete('sync_queue', item.id);
                                break;
                            }

                            if (entityData.id && await this.entityExists('cost_entries', entityData.id)) {
                                if (typeof API.updateCost !== 'function') {
                                    throw new Error('API.updateCost no disponible');
                                }
                                await API.updateCost(entityData.id, entityData);
                            } else {
                                if (typeof API.createCost !== 'function') {
                                    throw new Error('API.createCost no disponible');
                                }
                                const created = await API.createCost(entityData);
                                // Si el costo local tenía id no-UUID, el servidor generó uno nuevo.
                                // Migrar para que no queden "fantasmas" y futuras actualizaciones funcionen.
                                try {
                                    if (created && created.id && created.id !== entityData.id) {
                                        await DB.put('cost_entries', created);
                                        await DB.delete('cost_entries', entityData.id);
                                    }
                                } catch (e) {
                                    console.warn('No se pudo migrar costo local a id del servidor:', e);
                                }
                            }
                            await DB.delete('sync_queue', item.id);
                            successCount++;
                        }
                        break;

                    case 'employee':
                        // Manejar eliminaciones
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteEmployee !== 'function') {
                                    throw new Error('API.deleteEmployee no disponible');
                                }
                                await API.deleteEmployee(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de sync_deleted_items si existe
                                try {
                                    await DB.delete('sync_deleted_items', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando empleado en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('employees', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') {
                                        throw new Error('API no disponible');
                                    }

                                    // 1. Validar branch_id antes de sincronizar
                                    if (entityData.branch_id) {
                                        try {
                                            const branches = await API.getBranches();
                                            const branchExists = branches && branches.some(b => b.id === entityData.branch_id);
                                            if (!branchExists) {
                                                console.warn(`⚠️ branch_id ${entityData.branch_id} no existe en servidor, estableciendo a null`);
                                                entityData.branch_id = null;
                                                // Actualizar en local también
                                                await DB.put('employees', entityData);
                                            }
                                        } catch (branchError) {
                                            console.warn('⚠️ Error verificando branches, continuando sin validación:', branchError);
                                        }
                                    }

                                    // 2. Verificar si el empleado existe (por ID o por código/barcode)
                                    let existingEmployee = null;
                                    try {
                                        const allEmployees = await API.getEmployees();
                                        if (allEmployees && Array.isArray(allEmployees)) {
                                            // Primero verificar por ID
                                            existingEmployee = allEmployees.find(e => e.id === entityData.id);
                                            
                                            // Si no existe por ID, verificar por código/barcode
                                            if (!existingEmployee && (entityData.code || entityData.barcode)) {
                                                existingEmployee = allEmployees.find(e => 
                                                    (entityData.code && e.code === entityData.code) || 
                                                    (entityData.barcode && e.barcode === entityData.barcode)
                                                );
                                                
                                                if (existingEmployee) {
                                                    console.log(`ℹ️ Empleado encontrado por código/barcode (ID diferente). Actualizando existente: ${existingEmployee.id}`);
                                                }
                                            }
                                        }
                                    } catch (fetchError) {
                                        console.warn('⚠️ Error obteniendo lista de empleados, intentando crear/actualizar directamente:', fetchError);
                                    }

                                    // 3. Crear o actualizar según corresponda
                                    if (existingEmployee) {
                                        // Actualizar el empleado existente
                                        if (typeof API.updateEmployee !== 'function') {
                                            throw new Error('API.updateEmployee no disponible');
                                        }
                                        await API.updateEmployee(existingEmployee.id, entityData);
                                        
                                        // Si el ID es diferente, actualizar el ID local
                                        if (existingEmployee.id !== entityData.id) {
                                            console.log(`🔄 Actualizando ID local de empleado: ${entityData.id} -> ${existingEmployee.id}`);
                                            await DB.put('employees', { ...entityData, id: existingEmployee.id });
                                            await DB.delete('employees', entityData.id);
                                        }
                                    } else {
                                        // Crear nuevo empleado
                                        if (typeof API.createEmployee !== 'function') {
                                            throw new Error('API.createEmployee no disponible');
                                        }
                                        await API.createEmployee(entityData);
                                    }
                                    
                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    // Manejo inteligente de errores de duplicados
                                    const errorMessage = error.message || error.toString() || '';
                                    const isDuplicateError = errorMessage.includes('ya existe') || 
                                                           errorMessage.includes('duplicate') ||
                                                           (error.status === 400 && errorMessage.toLowerCase().includes('código'));
                                    
                                    if (isDuplicateError) {
                                        // Intentar recuperar: buscar el empleado existente y actualizarlo
                                        try {
                                            console.log(`🔄 Error de duplicado detectado, intentando recuperación...`);
                                            const allEmployees = await API.getEmployees();
                                            if (allEmployees && Array.isArray(allEmployees)) {
                                                const existing = allEmployees.find(e => 
                                                    (entityData.code && e.code === entityData.code) || 
                                                    (entityData.barcode && e.barcode === entityData.barcode)
                                                );
                                                
                                                if (existing) {
                                                    console.log(`✅ Empleado duplicado encontrado, actualizando: ${existing.id}`);
                                                    await API.updateEmployee(existing.id, entityData);
                                                    
                                                    // Actualizar ID local si es diferente
                                                    if (existing.id !== entityData.id) {
                                                        await DB.put('employees', { ...entityData, id: existing.id });
                                                        await DB.delete('employees', entityData.id);
                                                    }
                                                    
                                                    await DB.delete('sync_queue', item.id);
                                                    successCount++;
                                                    continue; // Saltar al siguiente item
                                                }
                                            }
                                        } catch (recoveryError) {
                                            console.error('❌ Error en recuperación de duplicado:', recoveryError);
                                        }
                                    }
                                    
                                    console.error('Error sincronizando empleado:', error);
                                    // Si el error es de permisos (403), eliminar de la cola
                                    if (error.message && (
                                        error.message.includes('Acceso denegado') ||
                                        error.message.includes('se requiere rol de administrador maestro') ||
                                        error.message.includes('403')
                                    )) {
                                        console.warn(`⚠️  Empleado ${entityData.name || item.entity_id} no se puede sincronizar: Se requiere rol de administrador maestro`);
                                        await DB.delete('sync_queue', item.id);
                                    } else {
                                        throw error; // Re-lanzar para que se maneje el error normalmente
                                    }
                                }
                            } else {
                                // Si el empleado no existe localmente y no es eliminación, eliminar de la cola
                                console.warn(`⚠️  Empleado ${item.entity_id} no encontrado localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'user':
                        // Manejar eliminaciones
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteUser !== 'function') {
                                    throw new Error('API.deleteUser no disponible');
                                }
                                await API.deleteUser(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando usuario en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('users', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined' || typeof API.post !== 'function') {
                                        throw new Error('API.post no disponible');
                                    }
                                    
                                    if (!entityData.employee_id) {
                                        console.warn(`⚠️ Usuario ${item.entity_id} no tiene employee_id, eliminando de cola`);
                                        await DB.delete('sync_queue', item.id);
                                        break;
                                    }

                                    // Verificar si el usuario ya existe antes de crear
                                    let userAlreadyExists = false;
                                    try {
                                        // Verificar si el empleado existe y si ya tiene usuario asociado
                                        const allEmployees = await API.getEmployees();
                                        if (allEmployees && Array.isArray(allEmployees)) {
                                            const employee = allEmployees.find(e => e.id === entityData.employee_id);
                                            
                                            if (!employee) {
                                                console.warn(`⚠️ Empleado ${entityData.employee_id} no existe en servidor, eliminando usuario de cola`);
                                                await DB.delete('sync_queue', item.id);
                                                break;
                                            }
                                            
                                            // Verificar si el empleado ya tiene un usuario asociado
                                            if (employee.user_id) {
                                                // El empleado ya tiene un usuario, verificar si es el mismo username
                                                if (employee.username === entityData.username) {
                                                    console.log(`✅ Usuario ${entityData.username} ya existe en servidor para este empleado, marcando como sincronizado`);
                                                    await DB.delete('sync_queue', item.id);
                                                    successCount++;
                                                    continue; // Saltar al siguiente item
                                                } else {
                                                    console.warn(`⚠️ Empleado ya tiene usuario diferente (${employee.username} vs ${entityData.username}), eliminando de cola`);
                                                    await DB.delete('sync_queue', item.id);
                                                    break;
                                                }
                                            }
                                            
                                            // Verificar si el username ya existe en otro empleado
                                            const existingUser = allEmployees.find(e => 
                                                e.username === entityData.username && 
                                                e.id !== entityData.employee_id
                                            );
                                            
                                            if (existingUser) {
                                                console.log(`✅ Usuario ${entityData.username} ya existe en servidor para otro empleado, marcando como sincronizado`);
                                                await DB.delete('sync_queue', item.id);
                                                successCount++;
                                                continue; // Saltar al siguiente item
                                            }
                                        }
                                    } catch (fetchError) {
                                        console.warn('⚠️ Error verificando empleado, intentando crear usuario directamente:', fetchError);
                                    }

                                    // Intentar crear el usuario (si ya existe, el catch lo manejará)
                                    try {
                                        await API.post(`/api/employees/${entityData.employee_id}/user`, {
                                            username: entityData.username,
                                            password: '1234', // PIN por defecto, debería cambiarse
                                            role: entityData.role || 'employee'
                                        });
                                        await DB.delete('sync_queue', item.id);
                                        successCount++;
                                    } catch (createError) {
                                        // Si el error es "ya existe", considerarlo como éxito
                                        const errorMessage = createError.message || createError.toString() || '';
                                        if (errorMessage.includes('nombre de usuario ya existe') || 
                                            errorMessage.includes('username already exists') ||
                                            errorMessage.includes('ya existe')) {
                                            console.log(`✅ Usuario ${entityData.username} ya existe en servidor, marcando como sincronizado`);
                                            await DB.delete('sync_queue', item.id);
                                            successCount++;
                                        } else {
                                            // Re-lanzar otros errores
                                            throw createError;
                                        }
                                    }
                                } catch (error) {
                                    // El manejo de "ya existe" ya se hace en el try interno
                                    // Este catch solo maneja errores inesperados
                                    console.error('Error sincronizando usuario:', error);
                                    throw error; // Re-lanzar para que se maneje el error normalmente
                                }
                            } else {
                                // Si el usuario no existe localmente y no es eliminación, eliminar de la cola
                                console.warn(`⚠️  Usuario ${item.entity_id} no encontrado localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'branch':
                    case 'catalog_branch': // También manejar catalog_branch para compatibilidad
                        // Manejar eliminaciones
                        if (item.data === 'delete' || (item.data && item.data.action === 'delete')) {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteBranch !== 'function') {
                                    throw new Error('API.deleteBranch no disponible');
                                }
                                await API.deleteBranch(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                // También eliminar de IndexedDB si existe
                                try {
                                    await DB.delete('catalog_branches', item.entity_id);
                                } catch (e) {
                                    // Ignorar si no existe
                                }
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando sucursal en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('catalog_branches', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') {
                                        throw new Error('API no disponible');
                                    }
                                    
                                    // Verificar si la sucursal existe en el servidor
                                    const exists = await this.entityExists('branches', entityData.id);
                                    
                                    // Asegurar que la sucursal tenga código antes de sincronizar
                                    if (!entityData.code && entityData.name) {
                                        // Generar código basado en el nombre si no existe
                                        entityData.code = entityData.name
                                            .toUpperCase()
                                            .replace(/[^A-Z0-9]/g, '')
                                            .substring(0, 10) || `BRANCH-${entityData.id.substring(0, 8).toUpperCase()}`;
                                        // Actualizar en local
                                        await DB.put('catalog_branches', entityData);
                                    }
                                    
                                    if (exists) {
                                        if (typeof API.updateBranch !== 'function') {
                                            throw new Error('API.updateBranch no disponible');
                                        }
                                        await API.updateBranch(entityData.id, entityData);
                                    } else {
                                        // Verificar si existe por nombre antes de crear
                                        try {
                                            const allBranches = await API.getBranches();
                                            const existingByName = allBranches.find(b => 
                                                b.name === entityData.name || 
                                                (entityData.code && b.code === entityData.code)
                                            );
                                            
                                            if (existingByName) {
                                                // La sucursal ya existe en el servidor, actualizar local con el ID del servidor
                                                console.log(`✅ Sucursal "${entityData.name}" ya existe en servidor, actualizando local...`);
                                                entityData.id = existingByName.id;
                                                await DB.put('catalog_branches', entityData);
                                                await API.updateBranch(existingByName.id, entityData);
                                            } else {
                                                // Crear nueva sucursal
                                                if (typeof API.createBranch !== 'function') {
                                                    throw new Error('API.createBranch no disponible');
                                                }
                                                
                                                // Asegurar que tenga código antes de crear
                                                if (!entityData.code) {
                                                    throw new Error('La sucursal debe tener un código para sincronizarse');
                                                }
                                                
                                                await API.createBranch(entityData);
                                            }
                                        } catch (createError) {
                                            // Si el error es "Código requerido" o similar, intentar generar código y reintentar
                                            if (createError.message && (
                                                createError.message.includes('Código requerido') ||
                                                createError.message.includes('code') ||
                                                createError.message.includes('required')
                                            )) {
                                                if (!entityData.code && entityData.name) {
                                                    entityData.code = entityData.name
                                                        .toUpperCase()
                                                        .replace(/[^A-Z0-9]/g, '')
                                                        .substring(0, 10) || `BRANCH-${Date.now().toString(36).toUpperCase()}`;
                                                    await DB.put('catalog_branches', entityData);
                                                    await API.createBranch(entityData);
                                                } else {
                                                    throw createError;
                                                }
                                            } else {
                                                throw createError;
                                            }
                                        }
                                    }
                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando sucursal:', error);
                                    // Si el error es "Código requerido", marcar como error pero no reintentar infinitamente
                                    if (error.message && error.message.includes('Código requerido')) {
                                        console.warn(`⚠️  Sucursal ${entityData.name || item.entity_id} sin código, eliminando de cola de sincronización`);
                                        await DB.delete('sync_queue', item.id);
                                    } else if (error.message && (
                                        error.message.includes('Acceso denegado') ||
                                        error.message.includes('se requiere rol de administrador maestro') ||
                                        error.message.includes('403')
                                    )) {
                                        // Si el error es de permisos, eliminar de la cola (no es master_admin)
                                        console.warn(`⚠️  Sucursal ${entityData.name || item.entity_id} no se puede sincronizar: Se requiere rol de administrador maestro`);
                                        await DB.delete('sync_queue', item.id);
                                    } else {
                                        throw error;
                                    }
                                }
                            } else {
                                // Si la sucursal no existe localmente y no es eliminación, eliminar de la cola
                                console.warn(`⚠️  Sucursal ${item.entity_id} no encontrada localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'catalog_seller':
                        if (item.data === 'delete' || (item.data && item.data.action === 'delete')) {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteSeller !== 'function') {
                                    throw new Error('API.deleteSeller no disponible');
                                }
                                await API.deleteSeller(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando vendedor en servidor:', error);
                                throw error;
                            }
                        } else {
                            entityData = await DB.get('catalog_sellers', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') throw new Error('API no disponible');
                                    if (typeof API.createSeller !== 'function' || typeof API.updateSeller !== 'function') {
                                        throw new Error('API de vendedores no disponible');
                                    }

                                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                                    const oldLocalId = entityData.id;
                                    const serverId = isUUID(entityData.server_id) ? entityData.server_id : (isUUID(entityData.id) ? entityData.id : null);

                                    const payload = {
                                        ...entityData,
                                        id: serverId || undefined,
                                        name: entityData.name,
                                        code: entityData.code || entityData.codigo || (entityData.name || '').trim(),
                                        barcode: entityData.barcode || null,
                                        active: entityData.active !== false
                                    };

                                    let synced;
                                    if (serverId) {
                                        synced = await API.updateSeller(serverId, payload);
                                    } else {
                                        synced = await API.createSeller(payload);
                                    }

                                    const finalData = {
                                        ...entityData,
                                        ...(synced || {}),
                                        id: (synced && synced.id) ? synced.id : (serverId || oldLocalId),
                                        server_id: (synced && synced.id) ? synced.id : (serverId || null),
                                        sync_status: 'synced',
                                        updated_at: new Date().toISOString()
                                    };

                                    await DB.put('catalog_sellers', finalData, { autoBranchId: false });
                                    if (oldLocalId && finalData.id && oldLocalId !== finalData.id) {
                                        try { await DB.delete('catalog_sellers', oldLocalId); } catch (e) {}
                                    }

                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando vendedor:', error);
                                    throw error;
                                }
                            } else {
                                console.warn(`⚠️ Vendedor ${item.entity_id} no encontrado localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'catalog_agency':
                        if (item.data === 'delete' || (item.data && item.data.action === 'delete')) {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteAgency !== 'function') {
                                    throw new Error('API.deleteAgency no disponible');
                                }
                                await API.deleteAgency(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando agencia en servidor:', error);
                                throw error;
                            }
                        } else {
                            entityData = await DB.get('catalog_agencies', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') throw new Error('API no disponible');
                                    if (typeof API.createAgency !== 'function' || typeof API.updateAgency !== 'function') {
                                        throw new Error('API de agencias no disponible');
                                    }

                                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                                    const oldLocalId = entityData.id;
                                    const serverId = isUUID(entityData.server_id) ? entityData.server_id : (isUUID(entityData.id) ? entityData.id : null);

                                    const payload = {
                                        ...entityData,
                                        id: serverId || undefined,
                                        name: entityData.name,
                                        code: entityData.code || entityData.codigo || (entityData.name || '').trim(),
                                        barcode: entityData.barcode || null,
                                        active: entityData.active !== false
                                    };

                                    let synced;
                                    if (serverId) {
                                        synced = await API.updateAgency(serverId, payload);
                                    } else {
                                        synced = await API.createAgency(payload);
                                    }

                                    const finalData = {
                                        ...entityData,
                                        ...(synced || {}),
                                        id: (synced && synced.id) ? synced.id : (serverId || oldLocalId),
                                        server_id: (synced && synced.id) ? synced.id : (serverId || null),
                                        sync_status: 'synced',
                                        updated_at: new Date().toISOString()
                                    };

                                    await DB.put('catalog_agencies', finalData, { autoBranchId: false });
                                    if (oldLocalId && finalData.id && oldLocalId !== finalData.id) {
                                        try { await DB.delete('catalog_agencies', oldLocalId); } catch (e) {}
                                    }

                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando agencia:', error);
                                    throw error;
                                }
                            } else {
                                console.warn(`⚠️ Agencia ${item.entity_id} no encontrada localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'catalog_guide':
                        if (item.data === 'delete' || (item.data && item.data.action === 'delete')) {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteGuide !== 'function') {
                                    throw new Error('API.deleteGuide no disponible');
                                }
                                await API.deleteGuide(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando guía en servidor:', error);
                                throw error;
                            }
                        } else {
                            entityData = await DB.get('catalog_guides', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') throw new Error('API no disponible');
                                    if (typeof API.createGuide !== 'function' || typeof API.updateGuide !== 'function') {
                                        throw new Error('API de guías no disponible');
                                    }

                                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                                    const oldLocalId = entityData.id;
                                    const serverId = isUUID(entityData.server_id) ? entityData.server_id : (isUUID(entityData.id) ? entityData.id : null);

                                    let finalAgencyId = entityData.agency_id || null;
                                    if (finalAgencyId && !isUUID(finalAgencyId)) {
                                        try {
                                            const localAgency = await DB.get('catalog_agencies', finalAgencyId);
                                            if (localAgency && localAgency.name && typeof API.getAgencies === 'function') {
                                                const backendAgencies = await API.getAgencies({ search: localAgency.name });
                                                const matched = (backendAgencies || []).find(a => String(a.name || '').trim().toUpperCase() === String(localAgency.name || '').trim().toUpperCase());
                                                finalAgencyId = matched && matched.id ? matched.id : null;
                                            } else {
                                                finalAgencyId = null;
                                            }
                                        } catch (e) {
                                            finalAgencyId = null;
                                        }
                                    }

                                    const payload = {
                                        ...entityData,
                                        id: serverId || undefined,
                                        agency_id: finalAgencyId,
                                        name: entityData.name,
                                        code: entityData.code || entityData.codigo || (entityData.name || '').trim(),
                                        barcode: entityData.barcode || null,
                                        active: entityData.active !== false
                                    };

                                    if (!payload.agency_id) {
                                        console.warn(`⚠️ Guía ${item.entity_id} sin agencia válida, eliminando de cola`);
                                        await DB.delete('sync_queue', item.id);
                                        break;
                                    }

                                    let synced;
                                    if (serverId) {
                                        synced = await API.updateGuide(serverId, payload);
                                    } else {
                                        synced = await API.createGuide(payload);
                                    }

                                    const finalData = {
                                        ...entityData,
                                        ...(synced || {}),
                                        id: (synced && synced.id) ? synced.id : (serverId || oldLocalId),
                                        server_id: (synced && synced.id) ? synced.id : (serverId || null),
                                        agency_id: payload.agency_id,
                                        sync_status: 'synced',
                                        updated_at: new Date().toISOString()
                                    };

                                    await DB.put('catalog_guides', finalData, { autoBranchId: false });
                                    if (oldLocalId && finalData.id && oldLocalId !== finalData.id) {
                                        try { await DB.delete('catalog_guides', oldLocalId); } catch (e) {}
                                    }

                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando guía:', error);
                                    throw error;
                                }
                            } else {
                                console.warn(`⚠️ Guía ${item.entity_id} no encontrada localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    case 'arrival_rate_rule':
                        // Manejar eliminaciones
                        if (item.data === 'delete') {
                            try {
                                if (typeof API === 'undefined' || typeof API.deleteArrivalRateRule !== 'function') {
                                    throw new Error('API.deleteArrivalRateRule no disponible');
                                }
                                await API.deleteArrivalRateRule(item.entity_id);
                                await DB.delete('sync_queue', item.id);
                                successCount++;
                            } catch (error) {
                                console.error('Error eliminando regla de llegada en servidor:', error);
                                throw error;
                            }
                        } else {
                            // Manejar creaciones/actualizaciones
                            entityData = await DB.get('arrival_rate_rules', item.entity_id);
                            if (entityData) {
                                try {
                                    if (typeof API === 'undefined') {
                                        throw new Error('API no disponible');
                                    }
                                    
                                    // Mapear IDs locales a UUIDs del backend
                                    const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
                                    
                                    let finalAgencyId = entityData.agency_id;
                                    let finalBranchId = entityData.branch_id || null;
                                    
                                    // Si agency_id no es UUID, buscar la agencia en el backend por nombre
                                    if (entityData.agency_id && !isUUID(entityData.agency_id)) {
                                        try {
                                            // Obtener el nombre de la agencia desde IndexedDB
                                            const localAgency = await DB.get('catalog_agencies', entityData.agency_id);
                                            if (localAgency && localAgency.name) {
                                                // Buscar la agencia en el backend por nombre
                                                if (typeof API !== 'undefined' && API.getAgencies) {
                                                    try {
                                                        const backendAgencies = await API.getAgencies();
                                                        const matchedAgency = backendAgencies.find(a => 
                                                            a.name && a.name.toUpperCase() === localAgency.name.toUpperCase()
                                                        );
                                                        if (matchedAgency && matchedAgency.id) {
                                                            finalAgencyId = matchedAgency.id;
                                                            console.log(`✅ Mapeado agency_id: "${entityData.agency_id}" (${localAgency.name}) → ${finalAgencyId}`);
                                                        } else {
                                                            // Intentar crear la agencia en el backend si no existe
                                                            if (typeof API !== 'undefined' && API.createAgency) {
                                                                try {
                                                                    console.log(`📤 Creando agencia "${localAgency.name}" en backend...`);
                                                                    const createdAgency = await API.createAgency({
                                                                        code: localAgency.code || localAgency.name.substring(0, 10).toUpperCase(),
                                                                        name: localAgency.name,
                                                                        barcode: localAgency.barcode || null,
                                                                        active: localAgency.active !== false
                                                                    });
                                                                    if (createdAgency && createdAgency.id) {
                                                                        finalAgencyId = createdAgency.id;
                                                                        console.log(`✅ Agencia "${localAgency.name}" creada en backend con UUID: ${finalAgencyId}`);
                                                                    } else {
                                                                        throw new Error('Agencia creada pero sin ID');
                                                                    }
                                                                } catch (createError) {
                                                                    console.error(`❌ Error creando agencia "${localAgency.name}" en backend:`, createError);
                                                                    // Si falla la creación, marcar como null para omitir sincronización
                                                                    finalAgencyId = null;
                                                                }
                                                            } else {
                                                                console.warn(`⚠️ Agencia "${localAgency.name}" (${entityData.agency_id}) no encontrada en backend y API.createAgency no disponible`);
                                                                finalAgencyId = null;
                                                            }
                                                        }
                                                    } catch (apiError) {
                                                        console.error(`❌ Error obteniendo agencias del backend:`, apiError);
                                                        finalAgencyId = null;
                                                    }
                                                } else {
                                                    console.warn(`⚠️ API.getAgencies no disponible, omitiendo agency_id no-UUID: ${entityData.agency_id}`);
                                                    finalAgencyId = null;
                                                }
                                            } else {
                                                console.warn(`⚠️ No se pudo obtener nombre de agencia local para ID: ${entityData.agency_id}`);
                                                finalAgencyId = null;
                                            }
                                        } catch (e) {
                                            console.error(`❌ Error mapeando agency_id ${entityData.agency_id}:`, e);
                                            finalAgencyId = null;
                                        }
                                    }
                                    
                                    // Si branch_id no es UUID, omitirlo o buscar el UUID
                                    if (finalBranchId && !isUUID(finalBranchId)) {
                                        try {
                                            if (typeof API !== 'undefined' && API.getBranches) {
                                                const backendBranches = await API.getBranches();
                                                const matchedBranch = backendBranches.find(b => b.id === finalBranchId);
                                                if (!matchedBranch) {
                                                    // Si no se encuentra por ID, buscar por nombre (branch1, branch2, etc.)
                                                    const localBranch = await DB.get('catalog_branches', finalBranchId);
                                                    if (localBranch && localBranch.name) {
                                                        const matchedByName = backendBranches.find(b => 
                                                            b.name && b.name.toUpperCase() === localBranch.name.toUpperCase()
                                                        );
                                                        if (matchedByName) {
                                                            finalBranchId = matchedByName.id;
                                                        } else {
                                                            finalBranchId = null;
                                                        }
                                                    } else {
                                                        finalBranchId = null;
                                                    }
                                                }
                                            } else {
                                                finalBranchId = null;
                                            }
                                        } catch (e) {
                                            console.warn(`⚠️ Error mapeando branch_id ${finalBranchId}:`, e);
                                            finalBranchId = null;
                                        }
                                    }
                                    
                                    // Construir payload limpio
                                    const payload = {
                                        id: entityData.id,
                                        agency_id: finalAgencyId,
                                        branch_id: finalBranchId,
                                        unit_type: entityData.unit_type || null,
                                        fee_type: entityData.fee_type || 'flat',
                                        flat_fee: entityData.flat_fee || 0,
                                        rate_per_passenger: entityData.rate_per_passenger || 0,
                                        extra_per_passenger: entityData.extra_per_passenger || 0,
                                        min_passengers: entityData.min_passengers || 1,
                                        max_passengers: entityData.max_passengers || null,
                                        active_from: entityData.active_from,
                                        active_until: entityData.active_until || null,
                                        notes: entityData.notes || ''
                                    };
                                    
                                    // Si no hay agency_id válido, no podemos sincronizar
                                    if (!payload.agency_id) {
                                        console.warn(`⚠️ Regla de llegada ${entityData.id} sin agency_id válido, eliminando de cola`);
                                        await DB.delete('sync_queue', item.id);
                                        break;
                                    }
                                    
                                    // Verificar si la regla existe en el servidor
                                    const exists = await this.entityExists('arrival_rate_rules', entityData.id);
                                    
                                    if (exists) {
                                        // Actualizar regla existente
                                        if (typeof API.updateArrivalRateRule !== 'function') {
                                            throw new Error('API.updateArrivalRateRule no disponible');
                                        }
                                        await API.updateArrivalRateRule(entityData.id, payload);
                                    } else {
                                        // Crear nueva regla (el endpoint POST maneja crear/actualizar automáticamente)
                                        if (typeof API.createArrivalRateRule !== 'function') {
                                            throw new Error('API.createArrivalRateRule no disponible');
                                        }
                                        await API.createArrivalRateRule(payload);
                                    }
                                    
                                    // Actualizar sync_status a 'synced'
                                    entityData.sync_status = 'synced';
                                    await DB.put('arrival_rate_rules', entityData);
                                    await DB.delete('sync_queue', item.id);
                                    successCount++;
                                } catch (error) {
                                    console.error('Error sincronizando regla de llegada:', error);
                                    throw error;
                                }
                            } else {
                                // Si la regla no existe localmente y no es eliminación, eliminar de la cola
                                console.warn(`⚠️  Regla de llegada ${item.entity_id} no encontrada localmente, eliminando de cola`);
                                await DB.delete('sync_queue', item.id);
                            }
                        }
                        break;

                    default:
                        console.warn(`⚠️  Tipo de sincronización no soportado: ${item.type}`, item);
                        // Eliminar de la cola si el tipo no está soportado
                        await DB.delete('sync_queue', item.id);
                        console.log(`🗑️  Item no soportado eliminado de la cola: ${item.type} - ${item.entity_id}`);
                        break;
                }
            } catch (error) {
                console.error(`❌ Error sincronizando ${item.type} - ${item.entity_id}:`, error);
                errorCount++;

                // Si es inventario y el servidor responde 400 por SKU/Barcode duplicado,
                // normalmente significa que ya fue creado por API anteriormente. No reintentar infinito.
                if ((item.type === 'inventory_item' || item.type === 'inventory') &&
                    error?.cause?.status === 400 &&
                    String(error.message || '').toLowerCase().includes('sku') &&
                    String(error.message || '').toLowerCase().includes('existe')) {
                    console.warn(`⚠️ inventory_item duplicado (SKU/Barcode). Eliminando de cola: ${item.entity_id}`);
                    try { await DB.delete('sync_queue', item.id); } catch (e) {}
                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                    // No contar como error "real" para no spamear al usuario
                    errorCount = Math.max(0, errorCount - 1);
                    continue;
                }

                // Si es empleado y hay error de foreign key constraint (branch_id inválido)
                if (item.type === 'employee' &&
                    (error?.code === '23503' || 
                     String(error.message || '').toLowerCase().includes('foreign key constraint') ||
                     String(error.message || '').toLowerCase().includes('violates foreign key') ||
                     String(error.message || '').includes('employees_branch_id_fkey'))) {
                    console.warn(`⚠️ Empleado con branch_id inválido detectado. Intentando corregir...`);
                    try {
                        const employeeData = await DB.get('employees', item.entity_id);
                        if (employeeData && employeeData.branch_id) {
                            // Obtener branches válidas y establecer a null o a una válida
                            const branches = await API.getBranches();
                            const isValidBranch = branches && branches.some(b => b.id === employeeData.branch_id);
                            
                            if (!isValidBranch) {
                                console.log(`🔄 Estableciendo branch_id a null para empleado ${item.entity_id}`);
                                employeeData.branch_id = null;
                                await DB.put('employees', employeeData);
                                // Reintentar sincronización (no contar como error todavía)
                                errorCount = Math.max(0, errorCount - 1);
                                continue; // Volver a intentar este item
                            }
                        }
                    } catch (fixError) {
                        console.error('❌ Error intentando corregir branch_id:', fixError);
                    }
                }

                // Si es empleado/usuario y hay error de duplicado, ya fue manejado en el caso específico
                // pero si llegamos aquí significa que la recuperación falló, considerar eliminarlo
                if ((item.type === 'employee' || item.type === 'user') &&
                    error?.cause?.status === 400 &&
                    (String(error.message || '').toLowerCase().includes('ya existe') ||
                     String(error.message || '').toLowerCase().includes('already exists'))) {
                    // Si ya intentamos recuperar y falló, verificar una vez más y eliminar si realmente existe
                    try {
                        if (item.type === 'employee') {
                            const allEmployees = await API.getEmployees();
                            const entityData = await DB.get('employees', item.entity_id);
                            if (entityData && allEmployees) {
                                const exists = allEmployees.find(e => 
                                    (entityData.code && e.code === entityData.code) || 
                                    (entityData.barcode && e.barcode === entityData.barcode)
                                );
                                if (exists) {
                                    console.log(`✅ Empleado duplicado ya existe en servidor. Eliminando de cola: ${item.entity_id}`);
                                    await DB.delete('sync_queue', item.id);
                                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                    errorCount = Math.max(0, errorCount - 1);
                                    continue;
                                }
                            }
                        } else if (item.type === 'user') {
                            const allEmployees = await API.getEmployees();
                            const entityData = await DB.get('users', item.entity_id);
                            if (entityData && entityData.employee_id && allEmployees) {
                                const employee = allEmployees.find(e => e.id === entityData.employee_id);
                                if (employee && employee.user_id) {
                                    console.log(`✅ Usuario duplicado ya existe en servidor. Eliminando de cola: ${item.entity_id}`);
                                    await DB.delete('sync_queue', item.id);
                                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                    errorCount = Math.max(0, errorCount - 1);
                                    continue;
                                }
                            }
                        }
                    } catch (verifyError) {
                        console.warn('⚠️ Error verificando duplicado:', verifyError);
                    }
                }

                // Ventas: si ya fue creada en servidor (mismo folio), no reintentar creando.
                // Esto limpia colas viejas y evita loops de 500 por duplicados.
                if (item.type === 'sale') {
                    try {
                        const localSale = await DB.get('sales', item.entity_id);
                        const folio = localSale?.folio;
                        if (folio && typeof API !== 'undefined' && typeof API.getSales === 'function') {
                            const serverSales = await API.getSales({});
                            const found = (serverSales || []).find(s => s && s.folio === folio);
                            if (found && found.id) {
                                await DB.put('sales', found, { autoBranchId: false });
                                await DB.delete('sync_queue', item.id);
                                this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                                console.warn(`✅ Venta ya existía en servidor (folio ${folio}). Eliminada de cola.`);
                                errorCount = Math.max(0, errorCount - 1);
                                continue;
                            }
                        }
                    } catch (e) {
                        // seguir flujo normal de reintentos
                    }
                }

                // Si el backend responde 429 (rate limit), pausar sincronización y reintentar después.
                // IMPORTANTE: no incrementar retry_count ni borrar de cola por esto.
                if (error && (error.status === 429 || String(error.message).includes('429'))) {
                    let waitSeconds = 60;
                    const ra = error.retryAfter;
                    // Ratelimit-Reset suele ser segundos hasta reset.
                    const parsed = ra ? parseInt(String(ra), 10) : NaN;
                    if (!Number.isNaN(parsed) && parsed > 0) waitSeconds = parsed + 1;

                    console.warn(`⏳ Rate limit (429). Pausando sync por ${waitSeconds}s...`);
                    Utils.showNotification(`⚠️ Demasiadas solicitudes. Reintentando en ${waitSeconds}s...`, 'warning');

                    // Detener loop actual
                    this.isSyncing = false;

                    // Reintento después del reset
                    setTimeout(() => {
                        try {
                            this.syncPending();
                        } catch (e) {}
                    }, waitSeconds * 1000);

                    return;
                }
                
                // Incrementar contador de reintentos
                item.retry_count = (item.retry_count || 0) + 1;
                await DB.put('sync_queue', item);
                
                // Si tiene muchos reintentos, eliminarlo de la cola
                if (item.retry_count >= 5) {
                    console.warn(`⚠️  Eliminando de cola después de 5 reintentos: ${item.type} - ${item.entity_id}`);
                    await DB.delete('sync_queue', item.id);
                    this.syncQueue = this.syncQueue.filter(q => q.id !== item.id);
                }
            }
        }

        // Recargar cola
        await this.loadQueue();

        // Siempre actualizar UI después de sincronizar (incluso si no hubo cambios)
        if (typeof window.SyncUI !== 'undefined' && window.SyncUI.loadStatus) {
            try {
                await window.SyncUI.loadStatus();
            } catch (uiError) {
                console.warn('Error actualizando UI de sincronización:', uiError);
            }
        }

        console.log(`🔄 ========================================`);
        console.log(`🔄 SINCRONIZACIÓN COMPLETADA`);
        console.log(`🔄 Exitosos: ${successCount}`);
        console.log(`🔄 Errores: ${errorCount}`);
        console.log(`🔄 Elementos restantes en cola: ${this.syncQueue.length}`);
        console.log(`🔄 ========================================`);
        
        if (successCount > 0 || errorCount > 0) {
            if (successCount > 0) {
                console.log(`✅ ${successCount} elemento${successCount > 1 ? 's' : ''} sincronizado${successCount > 1 ? 's' : ''} exitosamente`);
                Utils.showNotification(
                    `${successCount} elemento${successCount > 1 ? 's' : ''} sincronizado${successCount > 1 ? 's' : ''}`,
                    'success'
                );
            }
            if (errorCount > 0) {
                console.error(`❌ ${errorCount} elemento${errorCount > 1 ? 's' : ''} falló${errorCount > 1 ? 'ron' : ''} al sincronizar`);
                Utils.showNotification(
                    `${errorCount} elemento${errorCount > 1 ? 's' : ''} falló${errorCount > 1 ? 'ron' : ''} al sincronizar. Revisa la consola para más detalles.`,
                    'error'
                );
            }
        } else if (queueSize > 0) {
            // Si había elementos pero no se sincronizaron (todos fallaron o no se procesaron)
            // Solo mostrar warning si realmente quedan elementos (no si quedan 0)
            if (this.syncQueue.length > 0) {
                console.warn(`⚠️ Sincronización completada pero quedan ${this.syncQueue.length} elementos en cola`);
                console.warn(`   Esto puede indicar que las requests no se están enviando correctamente`);
                console.warn(`   Verifica:`);
                console.warn(`   1. Que ALLOWED_ORIGINS esté configurada en Railway`);
                console.warn(`   2. Que el backend esté funcionando (verifica /health)`);
                console.warn(`   3. Que no haya errores CORS en la consola del navegador`);
            }
            // Si quedan 0 elementos, no mostrar warning (es normal)
        }

        this.isSyncing = false;
    },

    async entityExists(type, id) {
        try {
            if (!id) return false;

            // Si el ID NO es UUID, NO tiene sentido consultarlo en el backend (Postgres espera UUID).
            // Esto evita 500s y reduce muchas llamadas innecesarias.
            const isUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
            if (!isUUID(id)) {
                return false;
            }
            
            // Verificar que API esté disponible
            if (typeof API === 'undefined' || !API.baseURL || !API.token) {
                return false;
            }
            
            switch (type) {
                case 'inventory_items':
                    if (typeof API.getInventoryItem === 'function') {
                        await API.getInventoryItem(id);
                        return true;
                    }
                    return false;
                case 'customers':
                    if (typeof API.getCustomer === 'function') {
                        await API.getCustomer(id);
                        return true;
                    }
                    return false;
                case 'repairs':
                    if (typeof API.getRepair === 'function') {
                        await API.getRepair(id);
                        return true;
                    }
                    return false;
                case 'cost_entries':
                    if (typeof API.getCost === 'function') {
                        await API.getCost(id);
                        return true;
                    }
                    return false;
                case 'employees':
                    // Verificar si el empleado existe obteniendo todos los empleados y buscando por ID
                    if (typeof API.getEmployees === 'function') {
                        const employees = await API.getEmployees();
                        return employees.some(emp => emp.id === id);
                    }
                    return false;
                case 'branches':
                    // Verificar si la sucursal existe obteniendo todas las sucursales y buscando por ID
                    if (typeof API.getBranches === 'function') {
                        const branches = await API.getBranches();
                        return branches.some(branch => branch.id === id);
                    }
                    return false;
                case 'arrival_rate_rules':
                case 'arrival_rate_rule':
                    // Verificar si la regla de llegada existe obteniendo todas las reglas y buscando por ID
                    if (typeof API.getArrivalRules === 'function') {
                        const rules = await API.getArrivalRules();
                        return rules.some(rule => rule.id === id);
                    }
                    return false;
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    },

    getQueueSize() {
        return this.syncQueue.length;
    },

    async clearQueue() {
        try {
            const queue = await DB.getAll('sync_queue') || [];
            for (const item of queue) {
                await DB.delete('sync_queue', item.id);
            }
            this.syncQueue = [];
            console.log('🗑️  Cola de sincronización limpiada');
        } catch (error) {
            console.error('Error limpiando cola:', error);
        }
    },

    // Función para sincronizar datos locales (sucursales, empleados, usuarios) que no están en el servidor
    async syncLocalDataToServer() {
        try {
            // Verificar que API esté disponible y con token
            if (typeof API === 'undefined' || !API.baseURL || !API.token) {
                return; // No hacer nada si no hay conexión
            }

            // Verificar token
            const tokenValid = await API.verifyToken();
            if (!tokenValid) {
                return; // No hacer nada si el token no es válido
            }

            console.log('🔄 Verificando datos locales para sincronizar...');

            // Helper para agregar delay entre solicitudes
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // 1. Sincronizar sucursales locales
            try {
                const localBranches = await DB.getAll('catalog_branches') || [];
                // Agregar delay antes de solicitar branches
                await delay(500);
                const serverBranches = await API.getBranches() || [];
                const serverBranchIds = new Set(serverBranches.map(b => b.id));

                for (const branch of localBranches) {
                    if (!branch || !branch.id) continue;
                    
                    // Ignorar IDs locales no-UUID (branch1, branch2, etc.)
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(branch.id));
                    if (!isUUID) continue;

                    // Si la sucursal no existe en el servidor, agregarla a la cola
                    if (!serverBranchIds.has(branch.id)) {
                        // Verificar si ya está en la cola
                        const existingInQueue = await DB.query('sync_queue', 'entity_id', branch.id) || [];
                        const alreadyQueued = existingInQueue.some(q => 
                            (q.type === 'branch' || q.type === 'catalog_branch') && q.entity_id === branch.id
                        );

                        if (!alreadyQueued) {
                            await this.addToQueue('branch', branch.id, branch);
                            console.log(`📤 Sucursal agregada a cola de sincronización: ${branch.name || branch.id}`);
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error verificando sucursales locales:', error.message);
            }

            // Delay entre sincronizaciones para evitar rate limiting
            await delay(500);

            // 2. Sincronizar empleados locales
            try {
                const localEmployees = await DB.getAll('employees') || [];
                // Agregar delay antes de solicitar employees
                await delay(500);
                const serverEmployees = await API.getEmployees() || [];
                const serverEmployeeIds = new Set(serverEmployees.map(e => e.id));

                for (const employee of localEmployees) {
                    if (!employee || !employee.id) continue;
                    
                    // Ignorar IDs locales no-UUID
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(employee.id));
                    if (!isUUID) continue;

                    // Si el empleado no existe en el servidor, agregarlo a la cola
                    if (!serverEmployeeIds.has(employee.id)) {
                        // Verificar si ya está en la cola
                        const existingInQueue = await DB.query('sync_queue', 'entity_id', employee.id) || [];
                        const alreadyQueued = existingInQueue.some(q => q.type === 'employee' && q.entity_id === employee.id);

                        if (!alreadyQueued) {
                            await this.addToQueue('employee', employee.id, employee);
                            console.log(`📤 Empleado agregado a cola de sincronización: ${employee.name || employee.id}`);
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error verificando empleados locales:', error.message);
            }

            // Delay entre sincronizaciones para evitar rate limiting
            await delay(500);

            // 3. Sincronizar usuarios locales (solo si tienen empleado asociado)
            try {
                const localUsers = await DB.getAll('users') || [];
                // Agregar delay antes de solicitar employees nuevamente
                await delay(500);
                const serverEmployees = await API.getEmployees() || [];
                const serverEmployeeIds = new Set(serverEmployees.map(e => e.id));

                for (const user of localUsers) {
                    if (!user || !user.id || !user.employee_id) continue;
                    
                    // Ignorar IDs locales no-UUID
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(user.id));
                    if (!isUUID) continue;

                    // Solo sincronizar si el empleado asociado existe en el servidor
                    // Los usuarios se crean a través de los empleados
                    if (serverEmployeeIds.has(user.employee_id)) {
                        // Verificar si ya está en la cola
                        const existingInQueue = await DB.query('sync_queue', 'entity_id', user.id) || [];
                        const alreadyQueued = existingInQueue.some(q => q.type === 'user' && q.entity_id === user.id);

                        if (!alreadyQueued) {
                            // Los usuarios se sincronizan solo si tienen empleado asociado
                            await this.addToQueue('user', user.id, user);
                            console.log(`📤 Usuario agregado a cola de sincronización: ${user.username || user.id}`);
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error verificando usuarios locales:', error.message);
            }

            console.log('✅ Verificación de datos locales completada');
        } catch (error) {
            console.warn('⚠️ Error en syncLocalDataToServer:', error.message);
        }
    }
};

// Exportar para uso global
window.SyncManager = SyncManager;
