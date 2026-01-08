// Sincronización con Google Sheets

const SyncManager = {
    syncUrl: null,
    syncToken: null,
    googleClientId: null,
    spreadsheetId: null,
    isOnline: navigator.onLine,
    isSyncing: false,
    paused: false,
    gapiLoaded: false,
    gsiLoaded: false,
    isAuthenticated: false,
    
    // Cache de hojas para evitar llamadas repetidas
    sheetsCache: null,
    sheetsCacheTimestamp: null,
    sheetsCacheTTL: 5 * 60 * 1000, // 5 minutos
    
    // Rate limiting
    lastRequestTime: 0,
    minRequestDelay: 500, // 500ms entre solicitudes mínimo (aumentado para evitar 429)
    
    // Configuración multisucursal
    MULTI_BRANCH_CONFIG: {
        SEPARATE_SHEETS: true, // true = hojas separadas por sucursal, false = una hoja con columna branch_id
        BRANCH_SHEET_SUFFIX: '_BRANCH_' // Sufijo para hojas por sucursal
    },

    async init() {
        // Load sync settings
        try {
            const urlSetting = await DB.get('settings', 'sync_url');
            const tokenSetting = await DB.get('settings', 'sync_token');
            const clientIdSetting = await DB.get('settings', 'google_client_id');
            const spreadsheetIdSetting = await DB.get('settings', 'google_sheets_spreadsheet_id');
            
            this.syncUrl = urlSetting?.value || null;
            this.syncToken = tokenSetting?.value || null;
            this.googleClientId = clientIdSetting?.value || null;
            this.spreadsheetId = spreadsheetIdSetting?.value || null;
        } catch (e) {
            console.error('Error loading sync settings:', e);
        }

        // Initialize Google API
        await this.initGoogleAPI();

        // Monitor online status
        window.addEventListener('online', () => {
            this.isOnline = true;
            UI.updateSyncStatus(true, false);
            this.autoSync();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            UI.updateSyncStatus(false, false);
        });

        // Initial status
        UI.updateSyncStatus(this.isOnline, false);

        // Auto sync basado en configuración
        this.setupAutoSync();
    },

    async initGoogleAPI() {
        // Wait for Google API to load
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 segundos máximo
            
            const tryInit = () => {
                if (typeof gapi !== 'undefined' && gapi.load) {
                    gapi.load('client', async () => {
                        try {
                            this.gapiLoaded = true;
                            if (this.googleClientId) {
                                await gapi.client.init({
                                    apiKey: '', // Not needed for OAuth
                                    clientId: this.googleClientId,
                                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                                    scope: 'https://www.googleapis.com/auth/spreadsheets'
                                });
                                console.log('✅ Google API inicializada correctamente');
                            }
                            resolve();
                        } catch (error) {
                            console.warn('⚠️ Error inicializando Google API (puede ser normal si no hay Client ID configurado):', error);
                            resolve(); // Resolver de todas formas para no bloquear
                        }
                    });
                } else {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(tryInit, 100);
                    } else {
                        console.warn('⚠️ Google API no está disponible después de 5 segundos');
                        resolve(); // Resolver de todas formas para no bloquear la aplicación
                    }
                }
            };
            
            tryInit();
        });
    },

    async authenticate() {
        if (!this.googleClientId) {
            throw new Error('Google Client ID no configurado. Configúralo en Configuración → Sincronización');
        }

        return new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.accounts) {
                reject(new Error('Google API no está cargada. Recarga la página.'));
                return;
            }

            google.accounts.oauth2.initTokenClient({
                client_id: this.googleClientId,
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                callback: (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    gapi.client.setToken(response);
                    this.isAuthenticated = true;
                    console.log('✅ Autenticado con Google Sheets API');
                    resolve(response);
                },
            }).requestAccessToken();
        });
    },

    async setupAutoSync() {
        // Limpiar intervalo anterior si existe
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        const settings = await this.getSyncSettings();
        const autoSync = settings.autoSync || 'disabled';

        if (autoSync === 'disabled') {
            return;
        }

        const intervals = {
            '5min': 5 * 60 * 1000,
            '15min': 15 * 60 * 1000,
            '30min': 30 * 60 * 1000,
            '1hour': 60 * 60 * 1000
        };

        const intervalMs = intervals[autoSync] || 5 * 60 * 1000;

        this.autoSyncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.autoSync();
            }
        }, intervalMs);
    },

    async addToQueue(entityType, entityId, action = 'upsert') {
        try {
            // Verificar que SyncManager esté inicializado
            if (!this.syncUrl && !this.syncToken) {
                console.warn('⚠️ SyncManager no está configurado, pero agregando a cola de todas formas');
            }
            
            const queueItem = {
                id: Utils.generateId(),
                entity_type: entityType,
                entity_id: entityId,
                action: action,
                status: 'pending',
                retries: 0,
                last_attempt: null,
                created_at: new Date().toISOString()
            };
            
            console.log(`➕ Agregando a cola de sincronización: ${entityType} ${entityId.substring(0, 20)}...`);
            
            await DB.add('sync_queue', queueItem);
            
            // Verificar que se guardó correctamente
            const saved = await DB.get('sync_queue', queueItem.id);
            if (!saved) {
                console.error('❌ Error: El elemento no se guardó en la cola');
                throw new Error('No se pudo guardar el elemento en la cola de sincronización');
            }
            
            console.log(`✅ Agregado a cola exitosamente: ${queueItem.id}`);
            
            // Log
            await this.addLog('info', `Agregado a cola: ${entityType} ${entityId.substring(0, 20)}`, 'pending');
            
            return queueItem.id;
        } catch (e) {
            console.error('❌ Error adding to sync queue:', e);
            console.error('Stack:', e.stack);
            await this.addLog('error', `Error agregando a cola: ${e.message}`, 'failed');
            throw e;
        }
    },

    async addLog(type, message, status = 'info', duration = null) {
        try {
            const log = {
                id: Utils.generateId(),
                type: type,
                message: message,
                status: status,
                duration: duration,
                items_synced: status === 'synced' ? parseInt(message.match(/\d+/)?.[0] || 0) : null,
                created_at: new Date().toISOString()
            };
            await DB.add('sync_logs', log);
            
            // Keep only last 2000 logs
            const allLogs = await DB.getAll('sync_logs') || [];
            if (allLogs.length > 2000) {
                const toDelete = allLogs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, allLogs.length - 2000);
                for (const log of toDelete) {
                    await DB.delete('sync_logs', log.id);
                }
            }
        } catch (e) {
            console.error('Error adding sync log:', e);
        }
    },

    async syncNow() {
        if (!this.isOnline) {
            Utils.showNotification('Sin conexión a internet', 'error');
            return;
        }

        // Verificar configuración de Google Sheets API
        if (!this.googleClientId || !this.spreadsheetId) {
            Utils.showNotification('Configura el Google Client ID y Spreadsheet ID en Configuración → Sincronización', 'error');
            console.error('❌ Sincronización no configurada:', {
                hasClientId: !!this.googleClientId,
                hasSpreadsheetId: !!this.spreadsheetId
            });
            return;
        }
        
        // Asegurar autenticación
        try {
            await this.ensureAuthenticated();
        } catch (authError) {
            Utils.showNotification('Error de autenticación con Google: ' + authError.message, 'error');
            return;
        }
        
        // Crear/actualizar índice al inicio de la sincronización (solo si no existe)
        try {
            const sheets = await this.getSheetsList();
            const indexExists = sheets.some(s => s.properties.title === '📊 ÍNDICE');
            if (!indexExists) {
                await this.createIndexSheet();
            }
        } catch (indexError) {
            console.warn('⚠️ Error creando índice (no crítico):', indexError);
        }
        
        // NO aplicar formato a todas las hojas al inicio para evitar rate limiting
        // El formato se aplicará automáticamente cuando se creen nuevas hojas

        if (this.isSyncing) {
            Utils.showNotification('Sincronización en progreso...', 'info');
            return;
        }
        
        if (this.paused) {
            console.log('Sync is paused');
            Utils.showNotification('La sincronización está pausada', 'info');
            return;
        }

        const startTime = Date.now();
        this.isSyncing = true;
        UI.updateSyncStatus(this.isOnline, true);

        try {
            // Obtener configuración de filtros
            const settings = await this.getSyncSettings();
            const entityFilters = settings.entityFilters || {};
            
            // Obtener configuración avanzada
            const batchSize = settings.batchSize || 50;
            const maxRetries = settings.maxRetries || 5;

            // DIAGNÓSTICO: Obtener TODOS los elementos de la cola para ver qué hay
            const allQueueItems = await DB.getAll('sync_queue') || [];
            console.log(`📊 DIAGNÓSTICO: Total de elementos en cola: ${allQueueItems.length}`);
            
            // Agrupar por status para diagnóstico
            const byStatus = {};
            const byType = {};
            allQueueItems.forEach(item => {
                const status = item.status || 'unknown';
                const type = item.entity_type || 'unknown';
                if (!byStatus[status]) {
                    byStatus[status] = [];
                }
                if (!byType[type]) {
                    byType[type] = [];
                }
                byStatus[status].push(item);
                byType[type].push(item);
            });
            
            console.log('📊 Elementos por status:', Object.entries(byStatus).map(([s, items]) => 
                `${s}: ${items.length}`
            ).join(', '));
            console.log('📊 Elementos por tipo:', Object.entries(byType).map(([t, items]) => 
                `${t}: ${items.length}`
            ).join(', '));
            
            // Intentar obtener pendientes con query
            let pending = [];
            try {
                pending = await DB.query('sync_queue', 'status', 'pending') || [];
                console.log(`📋 Elementos pendientes (query): ${pending.length}`);
            } catch (queryError) {
                console.warn('⚠️ Error en query, usando getAll y filtrando:', queryError);
                // Fallback: obtener todos y filtrar manualmente
                pending = allQueueItems.filter(item => (item.status || 'pending') === 'pending');
                console.log(`📋 Elementos pendientes (fallback): ${pending.length}`);
            }
            
            // Si no hay pendientes, mostrar información detallada
            if (pending.length === 0) {
                if (allQueueItems.length > 0) {
                    const statusDetails = Object.entries(byStatus).map(([status, items]) => 
                        `${status}: ${items.length}`
                    ).join(', ');
                    console.warn(`⚠️ Hay ${allQueueItems.length} elementos en la cola pero ninguno está pendiente`);
                    console.warn(`   Estados: ${statusDetails}`);
                    Utils.showNotification(
                        `No hay elementos pendientes. Cola: ${allQueueItems.length} elementos (${statusDetails})`, 
                        'warning'
                    );
                } else {
                    console.log('ℹ️ La cola está completamente vacía - no se han agregado elementos para sincronizar');
                    Utils.showNotification(
                        'No hay elementos pendientes de sincronizar. Los datos se agregan automáticamente cuando creas ventas, inventario, etc.', 
                        'info'
                    );
                }
                this.isSyncing = false;
                UI.updateSyncStatus(this.isOnline, false);
                return;
            }
            
            // Aplicar filtros de entidad
            if (Object.keys(entityFilters).length > 0) {
                const beforeFilter = pending.length;
                pending = pending.filter(item => entityFilters[item.entity_type] !== false);
                console.log(`🔍 Después de filtros: ${pending.length} (filtrados: ${beforeFilter - pending.length})`);
            }
            
            if (pending.length === 0) {
                console.log('ℹ️ Todos los elementos pendientes fueron filtrados');
                Utils.showNotification('No hay elementos pendientes de sincronizar (filtrados)', 'info');
                this.isSyncing = false;
                UI.updateSyncStatus(this.isOnline, false);
                return;
            }

            // Procesar en batches
            const batches = [];
            for (let i = 0; i < pending.length; i += batchSize) {
                batches.push(pending.slice(i, i + batchSize));
            }

            // Group by entity type
            const grouped = {};
            pending.forEach(item => {
                if (!grouped[item.entity_type]) {
                    grouped[item.entity_type] = [];
                }
                grouped[item.entity_type].push(item);
            });

            let successCount = 0;
            let errorCount = 0;

            for (const [entityType, items] of Object.entries(grouped)) {
                // Dividir items de este tipo en lotes más pequeños para evitar timeouts
                const itemsBatches = [];
                for (let i = 0; i < items.length; i += batchSize) {
                    itemsBatches.push(items.slice(i, i + batchSize));
                }
                
                console.log(`📦 Procesando ${items.length} items de tipo ${entityType} en ${itemsBatches.length} lote(s)...`);
                
                // Procesar cada lote por separado
                for (let batchIdx = 0; batchIdx < itemsBatches.length; batchIdx++) {
                    const itemsBatch = itemsBatches[batchIdx];
                    
                    try {
                        console.log(`  📦 Lote ${batchIdx + 1}/${itemsBatches.length}: ${itemsBatch.length} items`);
                        
                        // Separar items por acción (upsert vs delete)
                        const upsertItems = itemsBatch.filter(i => !i.action || i.action === 'upsert');
                        const deleteItems = itemsBatch.filter(i => i.action === 'delete');
                        
                        console.log(`    - Upserts: ${upsertItems.length}, Deletes: ${deleteItems.length}`);
                        
                        // Preparar records para upsert
                        const records = await this.prepareRecords(entityType, upsertItems.map(i => i.entity_id), 'upsert');
                        console.log(`    - Records preparados: ${records.length}`);
                        
                        // Preparar records para delete (obtener metadata de items eliminados)
                        const deleteRecords = await this.prepareRecords(entityType, deleteItems.map(i => i.entity_id), 'delete');
                        console.log(`    - Delete records preparados: ${deleteRecords.length}`);
                        
                        // Combinar records
                        const allRecords = [...records, ...deleteRecords];
                        
                        console.log(`📤 Enviando ${allRecords.length} registros a Google Sheets...`);
                        const result = await this.sendToSheets(entityType, allRecords, itemsBatch);
                    
                        if (result.success) {
                            console.log(`✅ ${entityType} lote ${batchIdx + 1}/${itemsBatches.length} sincronizado exitosamente`);
                            
                            // Mark as synced solo si realmente se enviaron datos Y se verificó la respuesta
                            if (allRecords.length > 0) {
                                for (const item of itemsBatch) {
                                    await DB.put('sync_queue', {
                                        ...item,
                                        status: 'synced',
                                        last_attempt: new Date().toISOString()
                                    });
                                    
                                    // Si fue una eliminación, limpiar el store de eliminados después de sincronizar
                                    if (item.action === 'delete') {
                                        try {
                                            await DB.delete('sync_deleted_items', item.entity_id);
                                        } catch (e) {
                                            console.warn('Error limpiando sync_deleted_items:', e);
                                        }
                                    }
                                }
                                successCount += itemsBatch.length;
                                const deleteCount = deleteItems.length;
                                const logMessage = deleteCount > 0 
                                    ? `Sincronizado: ${upsertItems.length} ${entityType}, ${deleteCount} eliminado(s)`
                                    : `Sincronizado: ${itemsBatch.length} ${entityType}`;
                                await this.addLog('success', logMessage, 'synced', Date.now() - startTime);
                            } else {
                                console.warn(`⚠️ No se enviaron registros para ${entityType} lote ${batchIdx + 1} - no marcando como sincronizado`);
                                throw new Error(`No se prepararon registros para ${entityType}`);
                            }
                        } else {
                            // Si hay error de CORS, mostrar mensaje específico y NO marcar como sincronizado
                            if (result.corsBlocked) {
                                console.error(`❌ ERROR CORS para ${entityType} lote ${batchIdx + 1}:`, result.error);
                                Utils.showNotification(
                                    `❌ ERROR CORS: ${result.error}. Los datos NO se enviaron.`, 
                                    'error'
                                );
                            } else {
                                console.error(`❌ Error sincronizando ${entityType} lote ${batchIdx + 1}:`, result.error);
                            }
                            throw new Error(result.error || 'Error desconocido');
                        }
                    } catch (e) {
                        // Verificar si es error 429 (rate limiting)
                        const is429 = e.message && (e.message.includes('Rate limit') || e.message.includes('429'));
                        const is429Result = e.isRateLimit === true;
                        
                        if (is429 || is429Result) {
                            console.warn(`⚠️ Rate limit al sincronizar ${entityType} lote ${batchIdx + 1} - se reintentará después`);
                            // No marcar como fallido si es rate limit - mantener como pending
                            for (const item of itemsBatch) {
                                await DB.put('sync_queue', {
                                    ...item,
                                    retries: (item.retries || 0) + 1,
                                    last_attempt: new Date().toISOString(),
                                    status: 'pending' // Mantener como pending para reintentar
                                });
                            }
                        } else {
                            console.error(`❌ Error completo sincronizando ${entityType} lote ${batchIdx + 1}:`, e);
                            console.error('Stack:', e.stack);
                            await this.addLog('error', `Error sincronizando ${entityType} (lote ${batchIdx + 1}): ${e.message}`, 'failed');
                            // Increment retries solo para este lote
                            for (const item of itemsBatch) {
                                const newRetries = (item.retries || 0) + 1;
                                await DB.put('sync_queue', {
                                    ...item,
                                    retries: newRetries,
                                    last_attempt: new Date().toISOString(),
                                    status: newRetries >= maxRetries ? 'failed' : 'pending'
                                });
                            }
                            errorCount += itemsBatch.length;
                        }
                        // Continuar con el siguiente lote en lugar de detenerse completamente
                        console.log(`⚠️ Continuando con el siguiente lote de ${entityType}...`);
                    }
                }
            }

            const duration = Date.now() - startTime;
            
            // Actualizar índice solo al final de toda la sincronización (una sola vez)
            try {
                console.log('📊 Actualizando hoja de índice...');
                await this.updateIndexSheet();
            } catch (indexError) {
                console.warn('⚠️ Error actualizando índice al final (no crítico):', indexError);
                // No marcar como error si es solo rate limiting
                if (indexError.status !== 429 && !(indexError.result && indexError.result.error && indexError.result.error.code === 429)) {
                    console.error('Error no relacionado con rate limiting:', indexError);
                }
            }
            
            this.isSyncing = false;
            UI.updateSyncStatus(this.isOnline, false);

            // Guardar log de sincronización completa
            await this.addLog('info', `Sincronización completada: ${successCount} exitosos, ${errorCount} errores`, 
                errorCount > 0 ? 'failed' : 'synced', duration);

            if (errorCount > 0) {
                Utils.showNotification(`Sincronización completada con ${errorCount} errores`, 'error');
            } else {
                Utils.showNotification(`Sincronización exitosa: ${successCount} elementos`, 'success');
            }

            // Trigger sync status update event
            window.dispatchEvent(new CustomEvent('sync-completed', { 
                detail: { successCount, errorCount, duration } 
            }));

        } catch (e) {
            console.error('Error in sync:', e);
            this.isSyncing = false;
            UI.updateSyncStatus(this.isOnline, false);
            await this.addLog('error', `Error en sincronización: ${e.message}`, 'failed');
            Utils.showNotification('Error en sincronización', 'error');
        }
    },

    async prepareRecords(entityType, entityIds, action = 'upsert') {
        const records = [];
        
        for (const id of entityIds) {
            try {
                let record = null;
                
                // Si es una eliminación, obtener metadata del store de eliminados
                if (action === 'delete') {
                    try {
                        const deletedMetadata = await DB.get('sync_deleted_items', id);
                        if (deletedMetadata && deletedMetadata.metadata) {
                            record = {
                                ...deletedMetadata.metadata,
                                _action: 'delete', // Marcar como eliminación
                                _deleted_at: deletedMetadata.deleted_at
                            };
                        } else {
                            // Si no hay metadata, crear un record básico con el ID
                            record = {
                                id: id,
                                _action: 'delete',
                                _deleted_at: new Date().toISOString()
                            };
                        }
                    } catch (deleteError) {
                        // Si falla, crear un record básico
                        record = {
                            id: id,
                            _action: 'delete',
                            _deleted_at: new Date().toISOString()
                        };
                    }
                } else {
                    // Acción normal (upsert)
                    switch (entityType) {
                        case 'sale':
                            record = await DB.get('sales', id);
                            if (record) {
                                const items = await DB.query('sale_items', 'sale_id', id);
                                const payments = await DB.query('payments', 'sale_id', id);
                                record.items = items;
                                record.payments = payments;
                            }
                            break;
                        case 'inventory_item':
                            record = await DB.get('inventory_items', id);
                            break;
                        case 'employee':
                            record = await DB.get('employees', id);
                            break;
                        case 'repair':
                            record = await DB.get('repairs', id);
                            break;
                        case 'cost_entry':
                            record = await DB.get('cost_entries', id);
                            break;
                        case 'tourist_report':
                            record = await DB.get('tourist_reports', id);
                            if (record) {
                                const lines = await DB.query('tourist_report_lines', 'report_id', id);
                                record.lines = lines;
                            }
                            break;
                        case 'catalog_seller':
                            record = await DB.get('catalog_sellers', id);
                            break;
                        case 'catalog_guide':
                            record = await DB.get('catalog_guides', id);
                            break;
                        case 'catalog_agency':
                            record = await DB.get('catalog_agencies', id);
                            break;
                        case 'customer':
                            record = await DB.get('customers', id);
                            break;
                        case 'user':
                            record = await DB.get('users', id);
                            break;
                        case 'arrival_rate_rule':
                            record = await DB.get('arrival_rate_rules', id);
                            break;
                        case 'agency_arrival':
                            record = await DB.get('agency_arrivals', id);
                            break;
                        case 'daily_profit_report':
                            record = await DB.get('daily_profit_reports', id);
                            break;
                        case 'inventory_transfer':
                            record = await DB.get('inventory_transfers', id);
                            if (record) {
                                const transferItems = await DB.query('inventory_transfer_items', 'transfer_id', id);
                                record.items = transferItems;
                            }
                            break;
                        case 'catalog_branch':
                            record = await DB.get('catalog_branches', id);
                            break;
                        case 'exchange_rate_daily':
                            record = await DB.get('exchange_rates_daily', id);
                            break;
                        case 'cash_session':
                            record = await DB.get('cash_sessions', id);
                            if (record) {
                                const movements = await DB.query('cash_movements', 'session_id', id);
                                record.movements = movements;
                            }
                            break;
                        case 'cash_movement':
                            record = await DB.get('cash_movements', id);
                            break;
                        case 'payment':
                            record = await DB.get('payments', id);
                            break;
                        case 'inventory_log':
                            record = await DB.get('inventory_logs', id);
                            break;
                        case 'audit_log':
                            record = await DB.get('audit_log', id);
                            break;
                        case 'budget_entry':
                            record = await DB.get('budget_entries', id);
                            break;
                        default:
                            console.warn(`⚠️ Tipo de entidad desconocido en prepareRecords: ${entityType}`);
                            // Intentar obtener el record directamente por el nombre de la tabla
                            try {
                                const tableName = entityType.replace(/_/g, '_');
                                record = await DB.get(tableName, id);
                                if (record) {
                                    console.log(`✅ Record obtenido directamente de ${tableName}`);
                                }
                            } catch (e) {
                                console.error(`❌ No se pudo obtener record de ${entityType}:`, e);
                            }
                            break;
                    }
                }
                
                if (record) {
                    records.push(record);
                }
            } catch (e) {
                console.error(`Error preparing record ${id}:`, e);
            }
        }
        
        return records;
    },

    // Mapeo de tipos de entidad a nombres de hojas
    getSheetName(entityType) {
        const sheetMap = {
            'sale': 'SALES',
            'inventory_item': 'INVENTORY',
            'employee': 'EMPLOYEES',
            'user': 'USERS',
            'repair': 'REPAIRS',
            'cost_entry': 'COSTS',
            'tourist_report': 'TOURIST_DAILY_REPORTS',
            'arrival_rate_rule': 'ARRIVAL_RATE_RULES',
            'agency_arrival': 'AGENCY_ARRIVALS',
            'daily_profit_report': 'DAILY_PROFIT_REPORTS',
            'inventory_transfer': 'INVENTORY_TRANSFERS',
            'catalog_branch': 'CATALOG_BRANCHES',
            'catalog_agency': 'CATALOG_AGENCIES',
            'catalog_seller': 'CATALOG_SELLERS',
            'catalog_guide': 'CATALOG_GUIDES',
            'customer': 'CUSTOMERS',
            'exchange_rate_daily': 'EXCHANGE_RATES_DAILY',
            'payment': 'PAYMENTS',
            'cash_session': 'CASH_SESSIONS',
            'cash_movement': 'CASH_MOVEMENTS',
            'inventory_log': 'INVENTORY_LOG',
            'audit_log': 'AUDIT_LOG'
        };
        return sheetMap[entityType] || entityType.toUpperCase();
    },

    async ensureAuthenticated() {
        if (typeof gapi === 'undefined' || !gapi.client) {
            throw new Error('Google API no está cargada. Recarga la página.');
        }
        
        if (!this.isAuthenticated || !gapi.client.getToken()) {
            console.log('🔐 Autenticando con Google...');
            await this.authenticate();
        }
    },

    async rateLimitedRequest(requestFn, retries = 3) {
        // Rate limiting: esperar al menos minRequestDelay entre solicitudes
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestDelay) {
            await new Promise(resolve => setTimeout(resolve, this.minRequestDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();

        // Intentar con retry y exponential backoff para errores 429
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                const is429 = error.status === 429 || (error.result && error.result.error && error.result.error.code === 429);
                
                if (is429 && attempt < retries - 1) {
                    // Exponential backoff: 2^attempt segundos, con delay adicional
                    const delay = Math.min(2000 * Math.pow(2, attempt), 15000); // Máximo 15 segundos, mínimo 2s
                    console.warn(`⚠️ Rate limit alcanzado (429), esperando ${delay}ms antes de reintentar (intento ${attempt + 1}/${retries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Invalidar cache después de rate limit para forzar refresh
                    this.sheetsCache = null;
                    continue;
                }
                
                throw error;
            }
        }
    },

    async getSheetsList(forceRefresh = false) {
        // Cachear la lista de hojas para evitar llamadas repetidas
        const now = Date.now();
        if (!forceRefresh && this.sheetsCache && this.sheetsCacheTimestamp && 
            (now - this.sheetsCacheTimestamp) < this.sheetsCacheTTL) {
            return this.sheetsCache;
        }

        const response = await this.rateLimitedRequest(() => 
            gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            })
        );

        this.sheetsCache = response.result.sheets;
        this.sheetsCacheTimestamp = now;
        return this.sheetsCache;
    },

    async getOrCreateSheet(sheetName) {
        if (!this.spreadsheetId) {
            throw new Error('Spreadsheet ID no configurado. Configúralo en Configuración → Sincronización');
        }

        await this.ensureAuthenticated();

        try {
            // Usar cache para verificar si la hoja existe
            const sheets = await this.getSheetsList();
            const sheet = sheets.find(s => s.properties.title === sheetName);
            if (sheet) {
                return sheetName;
            }

            // Si no existe, crear la hoja
            console.log(`📄 Creando hoja: ${sheetName}`);
            await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName
                                }
                            }
                        }]
                    }
                })
            );

            // Invalidar cache para refrescar la lista
            this.sheetsCache = null;

            // Agregar headers después de crear la hoja
            // Determinar el nombre base de la hoja (sin sufijo de sucursal)
            let baseSheetName = sheetName;
            if (sheetName.includes(this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX)) {
                baseSheetName = sheetName.split(this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX)[0];
            }
            const headers = this.getSheetHeaders(baseSheetName);
            if (headers.length > 0) {
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `${sheetName}!A1`,
                        valueInputOption: 'RAW',
                        resource: {
                            values: [headers]
                        }
                    })
                );
                // Aplicar formato a los headers (con delay adicional para evitar rate limiting)
                await new Promise(resolve => setTimeout(resolve, 500));
                // Formato es opcional - no bloquear si falla
                try {
                    await this.formatSheetHeaders(sheetName, headers.length);
                } catch (formatError) {
                    console.warn(`⚠️ Error formateando headers de ${sheetName} (continuando):`, formatError.message);
                }
            }

            return sheetName;
        } catch (error) {
            console.error(`Error obteniendo/creando hoja ${sheetName}:`, error);
            // Si es error 429, invalidar cache para forzar refresh
            if (error.status === 429 || (error.result && error.result.error && error.result.error.code === 429)) {
                this.sheetsCache = null;
            }
            throw error;
        }
    },

    // Obtener o crear hoja por sucursal
    async getOrCreateBranchSheet(baseSheetName, branchId, branchName = null) {
        if (!this.MULTI_BRANCH_CONFIG.SEPARATE_SHEETS) {
            // Si no se separan hojas, usar la hoja base
            return await this.getOrCreateSheet(baseSheetName);
        }
        
        // Crear nombre de hoja con sufijo de sucursal
        const branchDisplayName = branchName || branchId || 'UNKNOWN';
        let sheetName = baseSheetName + this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX + branchDisplayName;
        
        // Limitar longitud del nombre (Google Sheets tiene límite de 100 caracteres)
        const maxLength = 100 - this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX.length;
        if (sheetName.length > maxLength) {
            sheetName = baseSheetName + this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX + branchId.substring(0, 20);
        }
        
        return await this.getOrCreateSheet(sheetName);
    },

    // Obtener headers según el nombre de la hoja
    getSheetHeaders(sheetName) {
        const headerMap = {
            'SALES': ['ID', 'Folio', 'Sucursal', 'Vendedor', 'Agencia', 'Guía', 'Cliente', 'Pasajeros', 'Moneda', 'Tipo Cambio', 'Subtotal', 'Descuento', 'Total', 'Comisión Vendedor', 'Comisión Guía', 'Estado', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'],
            'ITEMS': ['ID', 'ID Venta', 'ID Producto', 'Cantidad', 'Precio', 'Costo', 'Descuento', 'Subtotal', 'Comisión', 'Fecha Creación'],
            'PAYMENTS': ['ID', 'ID Venta', 'Método Pago', 'Monto', 'Moneda', 'Banco', 'Tipo Pago', 'Comisión Banco', 'Fecha Creación'],
            'INVENTORY': ['ID', 'SKU', 'Código Barras', 'Nombre', 'Metal', 'Piedra', 'Talla', 'Peso (g)', 'Medidas', 'Costo', 'Precio', 'Ubicación', 'Estado', 'Sucursal', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'],
            'INVENTORY_LOG': ['ID', 'ID Producto', 'Acción', 'Cantidad', 'Notas', 'Fecha'],
            'EMPLOYEES': ['ID', 'Nombre', 'Rol', 'Sucursal', 'Activo', 'Código Barras', 'Fecha Creación'],
            'USERS': ['ID', 'Usuario', 'ID Empleado', 'Rol', 'Activo', 'Fecha Creación'],
            'REPAIRS': ['ID', 'Folio', 'ID Cliente', 'ID Pieza', 'Descripción', 'Estado', 'Costo', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'],
            'COSTS': ['ID', 'Tipo', 'Categoría', 'Monto', 'Sucursal', 'Fecha', 'Notas', 'Fecha Creación', 'Dispositivo', 'Sincronizado'],
            'AUDIT_LOG': ['ID', 'ID Usuario', 'Acción', 'Tipo Entidad', 'ID Entidad', 'Detalles', 'Fecha'],
            'CUSTOMERS': ['ID', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'CATALOG_BRANCHES': ['ID', 'Nombre', 'Dirección', 'Teléfono', 'Activa', 'Nombre Comercial', 'Dirección Fiscal', 'Teléfono Contacto', 'Email', 'RFC', 'Pie de Página', 'Logo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'CATALOG_AGENCIES': ['ID', 'Nombre', 'Activa', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'CATALOG_SELLERS': ['ID', 'Nombre', 'Código Barras', 'Regla Comisión', 'Activo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'CATALOG_GUIDES': ['ID', 'Nombre', 'ID Agencia', 'Código Barras', 'Regla Comisión', 'Activo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'TOURIST_DAILY_REPORTS': ['ID', 'Fecha', 'Sucursal', 'Tipo Cambio', 'Estado', 'Observaciones', 'Total Cash USD', 'Total Cash MXN', 'Subtotal', 'Adicional', 'Total', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'],
            'ARRIVAL_RATE_RULES': ['ID', 'ID Agencia', 'ID Sucursal', 'Pasajeros Mín', 'Pasajeros Máx', 'Tipo Unidad', 'Tarifa por PAX', 'Vigencia Desde', 'Vigencia Hasta', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Estado Sync', 'Sincronizado'],
            'AGENCY_ARRIVALS': ['ID', 'Fecha', 'ID Sucursal', 'ID Agencia', 'Pasajeros', 'Tipo Unidad', 'Costo Llegada', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Estado Sync', 'Sincronizado'],
            'DAILY_PROFIT_REPORTS': ['ID', 'Fecha', 'ID Sucursal', 'Revenue Ventas', 'COGS Total', 'Comisiones Vendedores', 'Comisiones Guías', 'Costos Llegadas', 'Costos Fijos Diarios', 'Costos Variables Diarios', 'Utilidad Antes Impuestos', 'Margen %', 'Total Pasajeros', 'Tipo Cambio', 'Fecha Creación', 'Fecha Actualización', 'Estado Sync', 'Sincronizado'],
            'EXCHANGE_RATES_DAILY': ['Fecha', 'USD', 'CAD', 'Fuente', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'INVENTORY_TRANSFERS': ['ID', 'Folio', 'Sucursal Origen', 'Sucursal Destino', 'Estado', 'Cantidad Items', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Fecha Completado', 'Creado Por', 'Estado Sync', 'Sincronizado'],
            'CASH_SESSIONS': ['ID', 'Fecha', 'ID Sucursal', 'ID Usuario', 'Monto Inicial', 'Estado', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'],
            'CASH_MOVEMENTS': ['ID', 'ID Sesión', 'Tipo', 'Monto', 'Descripción', 'Fecha', 'Fecha Creación', 'Sincronizado']
        };
        return headerMap[sheetName] || [];
    },

    // Convertir record a fila según el tipo de entidad
    convertRecordToRow(entityType, record) {
        switch (entityType) {
            case 'sale':
                return [
                    record.id,
                    record.folio || '',
                    record.branch_id || '',
                    record.seller_id || '',
                    record.agency_id || '',
                    record.guide_id || '',
                    record.customer_id || '',
                    record.passengers || 1,
                    record.currency || 'MXN',
                    record.exchange_rate || 1,
                    record.subtotal || 0,
                    record.discount || 0,
                    record.total || 0,
                    record.seller_commission || 0,
                    record.guide_commission || 0,
                    record.status || 'completada',
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    record.device_id || 'unknown',
                    new Date().toISOString()
                ];
            case 'inventory_item':
                return [
                    record.id,
                    record.sku || '',
                    record.barcode || '',
                    record.name || '',
                    record.metal || '',
                    record.stone || '',
                    record.size || '',
                    record.weight_g || 0,
                    record.measures || '',
                    record.cost || 0,
                    record.price || 0,
                    record.location || '',
                    record.status || 'disponible',
                    record.branch_id || '',
                    record.created_at || '',
                    record.updated_at || '',
                    record.device_id || 'unknown',
                    new Date().toISOString()
                ];
            case 'employee':
                return [
                    record.id,
                    record.name || '',
                    record.role || '',
                    record.branch_id || '',
                    record.active !== false, // Mantener boolean para employees
                    record.barcode || '',
                    record.created_at || ''
                ];
            case 'user':
                return [
                    record.id,
                    record.username || '',
                    record.employee_id || '',
                    record.role || '',
                    record.active !== false, // Mantener boolean para users
                    record.created_at || ''
                ];
            case 'customer':
                return [
                    record.id,
                    record.name || '',
                    record.email || '',
                    record.phone || '',
                    record.address || '',
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'cost_entry':
                return [
                    record.id,
                    record.type || '',
                    record.category || '',
                    record.amount || 0,
                    record.branch_id || '',
                    record.date || '',
                    record.notes || '',
                    record.created_at || '',
                    record.device_id || 'unknown',
                    new Date().toISOString()
                ];
            case 'inventory_log':
                return [
                    record.id,
                    record.item_id || '',
                    record.action || '',
                    record.quantity || 0,
                    record.notes || '',
                    record.created_at || ''
                ];
            case 'audit_log':
                let detailsText = '';
                try {
                    if (typeof record.details === 'string') {
                        detailsText = record.details;
                    } else {
                        detailsText = JSON.stringify(record.details || {});
                    }
                } catch (e) {
                    detailsText = String(record.details || '');
                }
                return [
                    record.id,
                    record.user_id || '',
                    record.action || '',
                    record.entity_type || '',
                    record.entity_id || '',
                    detailsText,
                    record.created_at || ''
                ];
            case 'repair':
                return [
                    record.id,
                    record.folio || '',
                    record.customer_id || '',
                    record.item_id || '',
                    record.description || '',
                    record.status || '',
                    record.cost || 0,
                    record.created_at || '',
                    record.updated_at || '',
                    record.device_id || 'unknown',
                    new Date().toISOString()
                ];
            case 'catalog_branch':
                return [
                    record.id,
                    record.name || '',
                    record.address || '',
                    record.phone || '',
                    record.active ? 'Sí' : 'No',
                    record.business_name || '',
                    record.business_address || '',
                    record.business_phone || '',
                    record.business_email || '',
                    record.business_rfc || '',
                    record.business_footer || '',
                    record.business_logo ? 'Sí' : 'No',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'catalog_agency':
                return [
                    record.id,
                    record.name || '',
                    record.active ? 'Sí' : 'No',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'catalog_seller':
                return [
                    record.id,
                    record.name || '',
                    record.barcode || '',
                    record.commission_rule || '',
                    record.active ? 'Sí' : 'No',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'catalog_guide':
                return [
                    record.id,
                    record.name || '',
                    record.agency_id || '',
                    record.barcode || '',
                    record.commission_rule || '',
                    record.active ? 'Sí' : 'No',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'exchange_rate_daily':
                return [
                    record.date || '',
                    record.usd || 0,
                    record.cad || 0,
                    record.source || 'manual',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'daily_profit_report':
                return [
                    record.id,
                    record.date || '',
                    record.branch_id || '',
                    record.revenue_sales_total || record.revenue || 0,
                    record.cogs_total || 0,
                    record.commissions_sellers_total || 0,
                    record.commissions_guides_total || 0,
                    record.arrivals_total || record.arrival_costs || 0,
                    record.fixed_costs_daily || 0,
                    record.variable_costs_daily || 0,
                    record.profit_before_taxes || 0,
                    record.profit_margin || 0,
                    record.passengers_total || record.total_passengers || 0,
                    record.exchange_rate || 1,
                    record.created_at || '',
                    record.updated_at || '',
                    record.sync_status || 'pending',
                    new Date().toISOString()
                ];
            case 'arrival_rate_rule':
                return [
                    record.id,
                    record.agency_id || '',
                    record.branch_id || '',
                    record.passengers_min || 0,
                    record.passengers_max || 0,
                    record.unit_type || '',
                    record.rate_per_pax || 0,
                    record.valid_from || '',
                    record.valid_until || '',
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    record.sync_status || 'pending',
                    new Date().toISOString()
                ];
            case 'agency_arrival':
                return [
                    record.id,
                    record.date || '',
                    record.branch_id || '',
                    record.agency_id || '',
                    record.passengers || 0,
                    record.unit_type || '',
                    record.arrival_cost || 0,
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    record.sync_status || 'pending',
                    new Date().toISOString()
                ];
            case 'inventory_transfer':
                return [
                    record.id,
                    record.folio || '',
                    record.from_branch_id || '',
                    record.to_branch_id || '',
                    record.status || 'pending',
                    record.items_count || 0,
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    record.completed_at || '',
                    record.created_by || '',
                    record.sync_status || 'pending',
                    new Date().toISOString()
                ];
            case 'cash_session':
                return [
                    record.id,
                    record.date || record.created_at || '',
                    record.branch_id || '',
                    record.user_id || '',
                    record.initial_amount || 0,
                    record.status || 'open',
                    record.notes || '',
                    record.created_at || '',
                    record.updated_at || '',
                    new Date().toISOString()
                ];
            case 'cash_movement':
                return [
                    record.id,
                    record.session_id || '',
                    record.type || '',
                    record.amount || 0,
                    record.description || '',
                    record.date || record.created_at || '',
                    record.created_at || '',
                    new Date().toISOString()
                ];
            case 'payment':
                return [
                    record.id,
                    record.sale_id || '',
                    record.method_id || '',
                    record.amount || 0,
                    record.currency || 'MXN',
                    record.bank || '',
                    record.payment_type || '',
                    record.bank_commission || 0,
                    record.created_at || ''
                ];
            case 'tourist_report':
                return [
                    record.id,
                    record.date || '',
                    record.branch_id || '',
                    record.exchange_rate || 1,
                    record.status || 'draft',
                    record.observations || '',
                    record.total_cash_usd || 0,
                    record.total_cash_mxn || 0,
                    record.subtotal || 0,
                    record.additional || 0,
                    record.total || 0,
                    record.created_at || '',
                    record.updated_at || '',
                    record.device_id || 'unknown',
                    new Date().toISOString()
                ];
            default:
                // Para tipos no mapeados, usar valores del objeto en orden alfabético
                const keys = Object.keys(record).sort();
                return keys.map(key => record[key]);
        }
    },

    async sendToSheets(entityType, records, queueItems = null) {
        // Verificar que tenemos las credenciales necesarias
        if (!this.googleClientId) {
            throw new Error('Google Client ID no configurado. Configúralo en Configuración → Sincronización');
        }

        if (!this.spreadsheetId) {
            throw new Error('Spreadsheet ID no configurado. Configúralo en Configuración → Sincronización');
        }

        // Asegurar autenticación
        await this.ensureAuthenticated();

        // Separar records de eliminaciones y upserts
        const deleteRecords = records.filter(r => r._action === 'delete');
        const upsertRecords = records.filter(r => !r._action || r._action !== 'delete');

        console.log(`📤 Enviando ${upsertRecords.length} registros y ${deleteRecords.length} eliminaciones de tipo ${entityType} a Google Sheets usando API...`);

        try {
            const baseSheetName = this.getSheetName(entityType);
            
            // Determinar si esta entidad necesita hojas separadas por sucursal
            const needsBranchSheets = ['sale', 'inventory_item', 'inventory_transfer'].includes(entityType);
            
            if (needsBranchSheets && this.MULTI_BRANCH_CONFIG.SEPARATE_SHEETS) {
                // Agrupar registros por sucursal
                const recordsByBranch = {};
                upsertRecords.forEach(record => {
                    const branchId = entityType === 'inventory_transfer' 
                        ? (record.from_branch_id || 'UNKNOWN')
                        : (record.branch_id || 'UNKNOWN');
                    if (!recordsByBranch[branchId]) {
                        recordsByBranch[branchId] = [];
                    }
                    recordsByBranch[branchId].push(record);
                });
                
                // También asegurar que existe la hoja principal
                await this.getOrCreateSheet(baseSheetName);
                
                let totalAdded = 0;
                let totalUpdated = 0;
                
                // Procesar cada sucursal
                for (const branchId in recordsByBranch) {
                    const branchRecords = recordsByBranch[branchId];
                    const branchSheetName = await this.getOrCreateBranchSheet(baseSheetName, branchId);
                    
                    await this.writeRecordsToSheet(branchSheetName, baseSheetName, entityType, branchRecords);
                    totalAdded += branchRecords.length;
                }
                
                console.log(`✅ ${upsertRecords.length} registros escritos en hojas de sucursal para ${entityType}`);
                
                // NO actualizar índice aquí - se actualizará al final de toda la sincronización
                
                return { 
                    success: true, 
                    message: `${upsertRecords.length} registros de ${entityType} sincronizados exitosamente`,
                    added: totalAdded,
                    updated: 0
                };
            } else {
                // Entidad sin hojas separadas por sucursal (empleados, usuarios, etc.)
                await this.getOrCreateSheet(baseSheetName);
                await this.writeRecordsToSheet(baseSheetName, baseSheetName, entityType, upsertRecords);
                
                console.log(`✅ ${upsertRecords.length} registros escritos en hoja ${baseSheetName}`);
                
                // NO actualizar índice aquí - se actualizará al final de toda la sincronización
                
                return { 
                    success: true, 
                    message: `${upsertRecords.length} registros de ${entityType} sincronizados exitosamente`,
                    added: upsertRecords.length,
                    updated: 0
                };
            }
        } catch (e) {
            // Verificar si es error 429 (rate limiting)
            const is429 = e.status === 429 || (e.result && e.result.error && e.result.error.code === 429);
            
            if (is429) {
                console.warn('⚠️ Rate limit (429) al enviar datos - se reintentará en la próxima sincronización');
                return { 
                    success: false, 
                    error: 'Rate limit alcanzado - se reintentará automáticamente',
                    isRateLimit: true
                };
            }
            
            console.error('❌ Error enviando a Google Sheets API:', e);
            return { 
                success: false, 
                error: e.message || 'Error desconocido al escribir en Google Sheets'
            };
        }
    },

    async writeRecordsToSheet(targetSheetName, baseSheetName, entityType, records) {
        // Escribir registros en la hoja especificada (puede ser branch o main)
        const headers = this.getSheetHeaders(baseSheetName);
        
        // Verificar si la hoja tiene headers
        let sheetInfo;
        try {
            sheetInfo = await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: `${targetSheetName}!A1:Z1`
                })
            );
        } catch (e) {
            sheetInfo = { result: { values: null } };
        }

        let startRow = 1;
        
        // Si no hay headers, agregarlos
        if (!sheetInfo.result.values || sheetInfo.result.values.length === 0 || !sheetInfo.result.values[0] || sheetInfo.result.values[0].length === 0) {
            if (headers.length > 0) {
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `${targetSheetName}!A1`,
                        valueInputOption: 'RAW',
                        resource: {
                            values: [headers]
                        }
                    })
                );
                // Aplicar formato a los headers (con delay adicional para evitar rate limiting)
                await new Promise(resolve => setTimeout(resolve, 500));
                // Formato es opcional - no bloquear si falla
                try {
                    await this.formatSheetHeaders(targetSheetName, headers.length);
                } catch (formatError) {
                    console.warn(`⚠️ Error formateando headers de ${targetSheetName} (continuando):`, formatError.message);
                }
            }
            startRow = 2;
        } else {
            // Buscar la siguiente fila vacía
            try {
                const allData = await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: `${targetSheetName}!A:Z`
                    })
                );
                startRow = (allData.result.values?.length || 1) + 1;
            } catch (e) {
                startRow = 2;
            }
        }

        // Escribir los datos
        if (records.length > 0) {
            if (entityType === 'sale') {
                // Para ventas, usar la función especializada
                await this.writeSalesData(records, startRow, targetSheetName);
            } else {
                // Para otros tipos, convertir y escribir directamente
                const rows = records.map(record => this.convertRecordToRow(entityType, record));
                
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: this.spreadsheetId,
                        range: `${targetSheetName}!A${startRow}`,
                        valueInputOption: 'RAW',
                        insertDataOption: 'INSERT_ROWS',
                        resource: {
                            values: rows
                        }
                    })
                );
            }
        }
    },

    async formatSheetHeaders(sheetName, numColumns) {
        // Aplicar formato a los headers: negrita, fondo gris, texto blanco
        // Esta función es tolerante a errores 429 y no bloquea la sincronización
        try {
            const sheetId = await this.getSheetId(sheetName);
            if (!sheetId) {
                console.warn(`No se pudo obtener sheetId para ${sheetName}, omitiendo formato`);
                return;
            }

            await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: numColumns
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.2,
                                            green: 0.2,
                                            blue: 0.2
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 1.0,
                                                green: 1.0,
                                                blue: 1.0
                                            },
                                            fontSize: 10,
                                            bold: true
                                        },
                                        horizontalAlignment: 'CENTER'
                                    }
                                },
                                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                            }
                        },
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: sheetId,
                                    gridProperties: {
                                        frozenRowCount: 1
                                    }
                                },
                                fields: 'gridProperties.frozenRowCount'
                            }
                        }
                    ]
                }
                })
            );
            console.log(`✅ Formato aplicado a headers de ${sheetName}`);
        } catch (error) {
            // Si es error 429, es esperado y no crítico
            const is429 = error.status === 429 || (error.result && error.result.error && error.result.error.code === 429);
            if (is429) {
                console.warn(`⚠️ Rate limit al formatear headers de ${sheetName} (se omitirá formato, no crítico)`);
            } else {
                console.warn(`⚠️ Error aplicando formato a headers de ${sheetName} (no crítico):`, error);
            }
            // No es crítico si falla el formato - la sincronización continúa
        }
    },

    async getSheetId(sheetName) {
        // Obtener el ID de la hoja usando cache
        try {
            const sheets = await this.getSheetsList();
            const sheet = sheets.find(s => s.properties.title === sheetName);
            return sheet ? sheet.properties.sheetId : null;
        } catch (error) {
            console.error('Error obteniendo sheet ID:', error);
            return null;
        }
    },

    async createIndexSheet() {
        // Crear o actualizar la hoja índice
        try {
            const indexSheetName = '📊 ÍNDICE';
            
            // Verificar si ya existe
            let sheetExists = false;
            try {
                const response = await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId
                });
                sheetExists = response.result.sheets.some(s => s.properties.title === indexSheetName);
            } catch (e) {
                // No existe, continuar para crearla
            }

            const sheetsInfo = [
                ['SALES', 'Ventas realizadas en el sistema POS'],
                ['ITEMS', 'Detalle de productos vendidos en cada venta'],
                ['PAYMENTS', 'Pagos realizados en cada venta (métodos, bancos, comisiones)'],
                ['INVENTORY', 'Catálogo completo de productos en inventario'],
                ['INVENTORY_LOG', 'Historial de movimientos de inventario'],
                ['EMPLOYEES', 'Lista de empleados del sistema'],
                ['USERS', 'Usuarios con acceso al sistema POS'],
                ['REPAIRS', 'Registro de reparaciones realizadas'],
                ['COSTS', 'Registro de costos fijos y variables'],
                ['AUDIT_LOG', 'Log de auditoría de acciones del sistema'],
                ['TOURIST_DAILY_REPORTS', 'Reportes diarios de ventas a turistas'],
                ['ARRIVAL_RATE_RULES', 'Tabulador maestro de tarifas de llegadas por agencia'],
                ['AGENCY_ARRIVALS', 'Registro de llegadas de pasajeros por agencia'],
                ['DAILY_PROFIT_REPORTS', 'Reportes de utilidad diaria antes de impuestos'],
                ['EXCHANGE_RATES_DAILY', 'Tipos de cambio diarios (USD, CAD)'],
                ['INVENTORY_TRANSFERS', 'Transferencias de inventario entre sucursales'],
                ['CATALOG_BRANCHES', 'Catálogo de sucursales (incluye datos empresariales por sucursal)'],
                ['CATALOG_AGENCIES', 'Catálogo de agencias'],
                ['CATALOG_SELLERS', 'Catálogo de vendedores'],
                ['CATALOG_GUIDES', 'Catálogo de guías'],
                ['CUSTOMERS', 'Catálogo de clientes'],
                ['CASH_SESSIONS', 'Sesiones de caja'],
                ['CASH_MOVEMENTS', 'Movimientos de caja']
            ];

            if (!sheetExists) {
                // Crear la hoja
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: indexSheetName,
                                        index: 0 // Insertar al inicio
                                    }
                                }
                            }]
                        }
                    })
                );
                // Invalidar cache
                this.sheetsCache = null;
            }

            // Crear los datos de la hoja
            const values = [
                ['OPAL & CO - SISTEMA POS'],
                ['Panel de Control y Sincronización'],
                [''], // Línea vacía
                ['HOJAS DISPONIBLES'],
                ['Hoja', 'Descripción', 'Total Registros'],
                ...sheetsInfo.map(info => [info[0], info[1], 0]),
                [''],
                ['📌 NOTA:', 'Las hojas se actualizan automáticamente cuando se sincroniza el sistema POS.', '']
            ];

            // Escribir valores
            await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `${indexSheetName}!A1`,
                    valueInputOption: 'RAW',
                    resource: { values }
                })
            );

            // Aplicar formato
            const indexSheetId = await this.getSheetId(indexSheetName);
            if (indexSheetId) {
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [
                            // Formato título (fila 1)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: indexSheetId,
                                        startRowIndex: 0,
                                        endRowIndex: 1,
                                        startColumnIndex: 0,
                                        endColumnIndex: 3
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                fontSize: 24,
                                                bold: true,
                                                foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 }
                                            },
                                            horizontalAlignment: 'LEFT',
                                            verticalAlignment: 'MIDDLE'
                                        }
                                    },
                                    fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
                                }
                            },
                            // Formato subtítulo (fila 2)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: indexSheetId,
                                        startRowIndex: 1,
                                        endRowIndex: 2,
                                        startColumnIndex: 0,
                                        endColumnIndex: 3
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                fontSize: 14,
                                                foregroundColor: { red: 0.42, green: 0.46, blue: 0.49 }
                                            },
                                            horizontalAlignment: 'LEFT'
                                        }
                                    },
                                    fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
                                }
                            },
                            // Formato "HOJAS DISPONIBLES" (fila 4)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: indexSheetId,
                                        startRowIndex: 3,
                                        endRowIndex: 4,
                                        startColumnIndex: 0,
                                        endColumnIndex: 3
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                fontSize: 16,
                                                bold: true
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat(textFormat)'
                                }
                            },
                            // Formato headers tabla (fila 5)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: indexSheetId,
                                        startRowIndex: 4,
                                        endRowIndex: 5,
                                        startColumnIndex: 0,
                                        endColumnIndex: 3
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: { red: 0.26, green: 0.52, blue: 0.96 },
                                            textFormat: {
                                                foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                                                fontSize: 11,
                                                bold: true
                                            },
                                            horizontalAlignment: 'CENTER'
                                        }
                                    },
                                    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                                }
                            },
                            // Formato filas de datos (alternado)
                            ...sheetsInfo.map((info, index) => ({
                                repeatCell: {
                                    range: {
                                        sheetId: indexSheetId,
                                        startRowIndex: 5 + index,
                                        endRowIndex: 6 + index,
                                        startColumnIndex: 0,
                                        endColumnIndex: 3
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            backgroundColor: index % 2 === 0 
                                                ? { red: 0.97, green: 0.98, blue: 0.98 }
                                                : { red: 1.0, green: 1.0, blue: 1.0 }
                                        }
                                    },
                                    fields: 'userEnteredFormat(backgroundColor)'
                                }
                            })),
                            // Congelar filas superiores
                            {
                                updateSheetProperties: {
                                    properties: {
                                        sheetId: indexSheetId,
                                        gridProperties: {
                                            frozenRowCount: 5
                                        }
                                    },
                                    fields: 'gridProperties.frozenRowCount'
                                }
                            },
                            // Ajustar anchos de columna
                            {
                                updateDimensionProperties: {
                                    range: {
                                        sheetId: indexSheetId,
                                        dimension: 'COLUMNS',
                                        startIndex: 0,
                                        endIndex: 1
                                    },
                                    properties: {
                                        pixelSize: 200
                                    },
                                    fields: 'pixelSize'
                                }
                            },
                            {
                                updateDimensionProperties: {
                                    range: {
                                        sheetId: indexSheetId,
                                        dimension: 'COLUMNS',
                                        startIndex: 1,
                                        endIndex: 2
                                    },
                                    properties: {
                                        pixelSize: 400
                                    },
                                    fields: 'pixelSize'
                                }
                            },
                            {
                                updateDimensionProperties: {
                                    range: {
                                        sheetId: indexSheetId,
                                        dimension: 'COLUMNS',
                                        startIndex: 2,
                                        endIndex: 3
                                    },
                                    properties: {
                                        pixelSize: 120
                                    },
                                    fields: 'pixelSize'
                                }
                            }
                        ]
                    }
                    })
                );
            }

            // Actualizar conteos (con delay para evitar rate limiting)
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.updateIndexSheet();
        } catch (error) {
            console.error('Error creando índice:', error);
            throw error;
        }
    },

    // Función deshabilitada para evitar rate limiting
    // El formato se aplica automáticamente cuando se crean nuevas hojas
    async ensureAllSheetsFormatted() {
        // Deshabilitado para evitar rate limiting
        // El formato se aplica automáticamente al crear hojas nuevas
        return;
    },

    async updateIndexSheet() {
        // Actualizar los conteos en la hoja índice
        try {
            const indexSheetName = '📊 ÍNDICE';
            
            const sheetsInfo = [
                ['SALES', 'Ventas realizadas en el sistema POS'],
                ['ITEMS', 'Detalle de productos vendidos en cada venta'],
                ['PAYMENTS', 'Pagos realizados en cada venta (métodos, bancos, comisiones)'],
                ['INVENTORY', 'Catálogo completo de productos en inventario'],
                ['INVENTORY_LOG', 'Historial de movimientos de inventario'],
                ['EMPLOYEES', 'Lista de empleados del sistema'],
                ['USERS', 'Usuarios con acceso al sistema POS'],
                ['REPAIRS', 'Registro de reparaciones realizadas'],
                ['COSTS', 'Registro de costos fijos y variables'],
                ['AUDIT_LOG', 'Log de auditoría de acciones del sistema'],
                ['TOURIST_DAILY_REPORTS', 'Reportes diarios de ventas a turistas'],
                ['ARRIVAL_RATE_RULES', 'Tabulador maestro de tarifas de llegadas por agencia'],
                ['AGENCY_ARRIVALS', 'Registro de llegadas de pasajeros por agencia'],
                ['DAILY_PROFIT_REPORTS', 'Reportes de utilidad diaria antes de impuestos'],
                ['EXCHANGE_RATES_DAILY', 'Tipos de cambio diarios (USD, CAD)'],
                ['INVENTORY_TRANSFERS', 'Transferencias de inventario entre sucursales'],
                ['CATALOG_BRANCHES', 'Catálogo de sucursales (incluye datos empresariales por sucursal)'],
                ['CATALOG_AGENCIES', 'Catálogo de agencias'],
                ['CATALOG_SELLERS', 'Catálogo de vendedores'],
                ['CATALOG_GUIDES', 'Catálogo de guías'],
                ['CUSTOMERS', 'Catálogo de clientes'],
                ['CASH_SESSIONS', 'Sesiones de caja'],
                ['CASH_MOVEMENTS', 'Movimientos de caja']
            ];

            // Obtener todas las hojas del spreadsheet usando cache
            const allSheets = await this.getSheetsList();

            // Calcular conteos (con rate limiting y delays)
            const counts = [];
            for (let i = 0; i < sheetsInfo.length; i++) {
                const info = sheetsInfo[i];
                const sheetName = info[0];
                let totalCount = 0;

                // Contar en hoja principal
                const mainSheet = allSheets.find(s => s.properties.title === sheetName);
                if (mainSheet) {
                    try {
                        const data = await this.rateLimitedRequest(() =>
                            gapi.client.sheets.spreadsheets.values.get({
                                spreadsheetId: this.spreadsheetId,
                                range: `${sheetName}!A:Z`
                            })
                        );
                        if (data.result.values && data.result.values.length > 1) {
                            totalCount += data.result.values.length - 1; // -1 por header
                        }
                    } catch (e) {
                        // Hoja vacía o error, continuar
                        if (e.status !== 429) {
                            console.warn(`Error contando ${sheetName}:`, e.message);
                        }
                    }
                }

                // Contar en hojas por sucursal (con delay para evitar rate limiting)
                const branchPrefix = sheetName + this.MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX;
                for (const sheet of allSheets) {
                    const sheetTitle = sheet.properties.title;
                    if (sheetTitle.startsWith(branchPrefix)) {
                        try {
                            // Delay adicional para hojas por sucursal
                            await new Promise(resolve => setTimeout(resolve, 100));
                            const data = await this.rateLimitedRequest(() =>
                                gapi.client.sheets.spreadsheets.values.get({
                                    spreadsheetId: this.spreadsheetId,
                                    range: `${sheetTitle}!A:Z`
                                })
                            );
                            if (data.result.values && data.result.values.length > 1) {
                                totalCount += data.result.values.length - 1;
                            }
                        } catch (e) {
                            // Ignorar errores (especialmente 429)
                            if (e.status !== 429) {
                                console.warn(`Error contando ${sheetTitle}:`, e.message);
                            }
                        }
                    }
                }

                counts.push(totalCount);
                
                // Delay entre hojas para evitar rate limiting
                if (i < sheetsInfo.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 150));
                }
            }

            // Actualizar valores en columna C (índice 2) - solo si hay cambios
            const updates = sheetsInfo.map((info, index) => ({
                range: `${indexSheetName}!C${6 + index}`,
                values: [[counts[index]]]
            }));

            await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        valueInputOption: 'RAW',
                        data: updates
                    }
                })
            );
        } catch (error) {
            console.warn('⚠️ Error actualizando índice (no crítico):', error);
        }
    },
    
    async writeRecordsToMainSheet(baseSheetName, entityType, records) {
        // Escribir también en la hoja principal (sin sufijo de sucursal)
        const headers = this.getSheetHeaders(baseSheetName);
        
        // Verificar si la hoja principal tiene headers
        let sheetInfo;
        try {
            sheetInfo = await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: `${baseSheetName}!A1:Z1`
                })
            );
        } catch (e) {
            sheetInfo = { result: { values: null } };
        }

        let startRow = 1;
        
        if (!sheetInfo.result.values || sheetInfo.result.values.length === 0 || !sheetInfo.result.values[0] || sheetInfo.result.values[0].length === 0) {
            if (headers.length > 0) {
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `${baseSheetName}!A1`,
                        valueInputOption: 'RAW',
                        resource: {
                            values: [headers]
                        }
                    })
                );
            }
            startRow = 2;
        } else {
            try {
                const allData = await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: `${baseSheetName}!A:Z`
                    })
                );
                startRow = (allData.result.values?.length || 1) + 1;
            } catch (e) {
                startRow = 2;
            }
        }

        if (entityType === 'sale' && records.length > 0) {
            await this.writeSalesData(records, startRow, baseSheetName);
        } else if (records.length > 0) {
            const rows = records.map(record => this.convertRecordToRow(entityType, record));
            
            await this.rateLimitedRequest(() =>
                gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: `${baseSheetName}!A${startRow}`,
                    valueInputOption: 'RAW',
                    insertDataOption: 'INSERT_ROWS',
                    resource: {
                        values: rows
                    }
                })
            );
        }
    },

    async writeSalesData(salesRecords, startRow, sheetName = 'SALES') {
        // Escribir ventas y sus items/payments asociados
        for (let i = 0; i < salesRecords.length; i++) {
            const sale = salesRecords[i];
            const saleRow = this.convertRecordToRow('sale', sale);
            
            // Buscar si ya existe esta venta (por folio)
            try {
                const existingData = await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: 'SALES!B:B'
                    })
                );
                
                let existingRow = null;
                if (existingData.result.values) {
                    for (let rowIdx = 0; rowIdx < existingData.result.values.length; rowIdx++) {
                        if (existingData.result.values[rowIdx][0] === sale.folio) {
                            existingRow = rowIdx + 1; // +1 porque es índice base 1
                            break;
                        }
                    }
                }
                
                if (existingRow) {
                    // Actualizar venta existente
                    await this.rateLimitedRequest(() =>
                        gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: this.spreadsheetId,
                            range: `SALES!A${existingRow}`,
                            valueInputOption: 'RAW',
                            resource: {
                                values: [saleRow]
                            }
                        })
                    );
                } else {
                    // Agregar nueva venta
                    await this.rateLimitedRequest(() =>
                        gapi.client.sheets.spreadsheets.values.append({
                            spreadsheetId: this.spreadsheetId,
                            range: `SALES!A${startRow + i}`,
                            valueInputOption: 'RAW',
                            insertDataOption: 'INSERT_ROWS',
                            resource: {
                                values: [saleRow]
                            }
                        })
                    );
                }
            } catch (e) {
                console.warn('Error buscando venta existente, agregando como nueva:', e);
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: this.spreadsheetId,
                        range: `SALES!A${startRow + i}`,
                        valueInputOption: 'RAW',
                        insertDataOption: 'INSERT_ROWS',
                        resource: {
                            values: [saleRow]
                        }
                    })
                );
            }
            
            // Escribir items si existen
            if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
                await this.getOrCreateSheet('ITEMS');
                const itemsRows = sale.items.map(item => [
                    item.id,
                    sale.id, // sale_id
                    item.item_id,
                    item.quantity || 1,
                    item.price || 0,
                    item.cost || 0,
                    item.discount || 0,
                    item.subtotal || 0,
                    item.commission_amount || 0,
                    item.created_at || ''
                ]);
                
                const itemsData = await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: 'ITEMS!A:Z'
                    })
                );
                const itemsStartRow = (itemsData.result.values?.length || 1) + 1;
                
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: this.spreadsheetId,
                        range: `ITEMS!A${itemsStartRow}`,
                        valueInputOption: 'RAW',
                        insertDataOption: 'INSERT_ROWS',
                        resource: {
                            values: itemsRows
                        }
                    })
                );
            }
            
            // Escribir payments si existen
            if (sale.payments && Array.isArray(sale.payments) && sale.payments.length > 0) {
                await this.getOrCreateSheet('PAYMENTS');
                const paymentsRows = sale.payments.map(payment => [
                    payment.id,
                    sale.id, // sale_id
                    payment.method_id || '',
                    payment.amount || 0,
                    payment.currency || 'MXN',
                    payment.bank || '',
                    payment.payment_type || '',
                    payment.bank_commission || 0,
                    payment.created_at || ''
                ]);
                
                const paymentsData = await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: 'PAYMENTS!A:Z'
                    })
                );
                const paymentsStartRow = (paymentsData.result.values?.length || 1) + 1;
                
                await this.rateLimitedRequest(() =>
                    gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: this.spreadsheetId,
                        range: `PAYMENTS!A${paymentsStartRow}`,
                        valueInputOption: 'RAW',
                        insertDataOption: 'INSERT_ROWS',
                        resource: {
                            values: paymentsRows
                        }
                    })
                );
            }
        }
    },

    async getDeviceId() {
        try {
            const devices = await DB.getAll('device');
            if (devices.length > 0) {
                return devices[0].id;
            }
            // Create device ID
            const deviceId = Utils.generateId();
            await DB.add('device', {
                id: deviceId,
                name: navigator.userAgent,
                created_at: new Date().toISOString()
            });
            return deviceId;
        } catch (e) {
            return 'unknown';
        }
    },

    async autoSync() {
        if (this.isOnline && !this.isSyncing && !this.paused) {
            const allItems = await DB.getAll('sync_queue') || [];
            const pending = allItems.filter(i => i.status === 'pending');
            
            // Aplicar filtros de entidad si están configurados
            const settings = await this.getSyncSettings();
            const entityFilters = settings.entityFilters || {};
            if (Object.keys(entityFilters).length > 0) {
                const filtered = pending.filter(item => entityFilters[item.entity_type] !== false);
                if (filtered.length > 0) {
                    this.syncNow();
                }
            } else if (pending.length > 0) {
                this.syncNow();
            }
        }
    },

    async getSyncStatus() {
        const allItems = await DB.getAll('sync_queue') || [];
        const pending = allItems.filter(i => i.status === 'pending').length;
        const synced = allItems.filter(i => i.status === 'synced').length;
        const failed = allItems.filter(i => i.status === 'failed').length;
        
        return {
            pending,
            synced,
            failed,
            total: pending + synced + failed
        };
    },

    // ========================================
    // FUNCIONALIDADES AVANZADAS
    // ========================================

    async getAdvancedStats() {
        const allItems = await DB.getAll('sync_queue') || [];
        const synced = allItems.filter(i => i.status === 'synced');
        const failed = allItems.filter(i => i.status === 'failed');
        const total = allItems.length;
        
        const successRate = total > 0 ? (synced.length / total * 100) : 100;
        
        // Calcular tiempo promedio de sincronización
        const syncLogs = await DB.getAll('sync_logs') || [];
        const successfulLogs = syncLogs.filter(l => l.status === 'synced' && l.duration);
        const avgDuration = successfulLogs.length > 0 
            ? Math.round(successfulLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / successfulLogs.length)
            : 0;

        return {
            totalProcessed: total,
            successRate,
            avgPerSync: synced.length > 0 ? synced.length / Math.max(syncLogs.filter(l => l.status === 'synced').length, 1) : 0,
            avgDuration: avgDuration
        };
    },

    async getLastSyncInfo() {
        const logs = await DB.getAll('sync_logs') || [];
        const syncLogs = logs.filter(l => l.type === 'success' || l.type === 'error').sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        return syncLogs[0] || null;
    },

    async getAnalytics() {
        const allItems = await DB.getAll('sync_queue') || [];
        const logs = await DB.getAll('sync_logs') || [];
        
        // Análisis por tipo
        const byType = {};
        allItems.forEach(item => {
            if (!byType[item.entity_type]) {
                byType[item.entity_type] = 0;
            }
            if (item.status === 'synced') {
                byType[item.entity_type]++;
            }
        });

        // Análisis de duración
        const durations = logs.filter(l => l.duration).map(l => l.duration);
        const avgDuration = durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : 0;
        const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

        // Análisis de errores
        const errorLogs = logs.filter(l => l.type === 'error' || l.status === 'failed');
        const errorCounts = {};
        errorLogs.forEach(log => {
            const message = log.message || 'Error desconocido';
            if (!errorCounts[message]) {
                errorCounts[message] = 0;
            }
            errorCounts[message]++;
        });
        const errors = Object.entries(errorCounts)
            .map(([message, count]) => ({ message, count }))
            .sort((a, b) => b.count - a.count);

        // Historial de últimos 30 días
        const history = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayLogs = logs.filter(l => l.created_at && l.created_at.startsWith(dateStr));
            history.push({
                date: dateStr,
                count: dayLogs.filter(l => l.status === 'synced').length
            });
        }

        return {
            byType,
            avgDuration,
            minDuration,
            maxDuration,
            totalSyncs: logs.filter(l => l.status === 'synced').length,
            errors,
            history
        };
    },

    async getSyncSettings() {
        const settings = await DB.getAll('settings') || [];
        const settingsMap = {};
        settings.forEach(s => {
            settingsMap[s.key] = s.value;
        });

        return {
            autoSync: settingsMap.auto_sync || 'disabled',
            batchSize: parseInt(settingsMap.sync_batch_size || 50),
            timeout: parseInt(settingsMap.sync_timeout || 60),
            compress: settingsMap.sync_compress === 'true',
            retryFailed: settingsMap.sync_retry_failed !== 'false',
            notifyErrors: settingsMap.sync_notify_errors !== 'false',
            maxRetries: parseInt(settingsMap.sync_max_retries || 5),
            entityFilters: JSON.parse(settingsMap.sync_entity_filters || '{}'),
            googleClientId: settingsMap.google_client_id || '',
            spreadsheetId: settingsMap.google_sheets_spreadsheet_id || ''
        };
    },

    async saveSyncSettings() {
        const autoSync = document.getElementById('sync-auto-frequency')?.value || 'disabled';
        const batchSize = parseInt(document.getElementById('sync-batch-size')?.value || 50);
        const timeout = parseInt(document.getElementById('sync-timeout')?.value || 60);
        const googleClientId = document.getElementById('google-client-id')?.value || '';
        const spreadsheetId = document.getElementById('google-spreadsheet-id')?.value || '';

        await DB.put('settings', { key: 'auto_sync', value: autoSync, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'sync_batch_size', value: batchSize, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'sync_timeout', value: timeout, updated_at: new Date().toISOString() });
        
        if (googleClientId) {
            await DB.put('settings', { key: 'google_client_id', value: googleClientId, updated_at: new Date().toISOString() });
            this.googleClientId = googleClientId;
            // Reinicializar Google API con el nuevo client ID
            if (this.gapiLoaded) {
                await this.initGoogleAPI();
            }
        }
        
        if (spreadsheetId) {
            await DB.put('settings', { key: 'google_sheets_spreadsheet_id', value: spreadsheetId, updated_at: new Date().toISOString() });
            this.spreadsheetId = spreadsheetId;
        }

        // Reconfigurar auto-sync
        await this.setupAutoSync();

        Utils.showNotification('Configuración guardada', 'success');
    },

    async testGoogleAuth() {
        try {
            if (!this.googleClientId) {
                Utils.showNotification('Primero configura el Google Client ID', 'error');
                return;
            }
            Utils.showNotification('Autenticando con Google...', 'info');
            await this.authenticate();
            Utils.showNotification('✅ Autenticación exitosa con Google Sheets', 'success');
        } catch (error) {
            console.error('Error en autenticación:', error);
            Utils.showNotification(`Error de autenticación: ${error.message}`, 'error');
        }
    },

    async saveEntityFilters() {
        const entities = ['sale', 'inventory_item', 'customer', 'employee', 'repair', 'cost_entry', 'tourist_report', 'catalog_seller', 'catalog_guide', 'catalog_agency'];
        const filters = {};
        
        entities.forEach(entity => {
            const checkbox = document.getElementById(`sync-filter-${entity}`);
            filters[entity] = checkbox ? checkbox.checked : true;
        });

        await DB.put('settings', { 
            key: 'sync_entity_filters', 
            value: JSON.stringify(filters), 
            updated_at: new Date().toISOString() 
        });

        Utils.showNotification('Filtros guardados', 'success');
    },

    async saveAdvancedSettings() {
        const compress = document.getElementById('sync-compress')?.checked || false;
        const retryFailed = document.getElementById('sync-retry-failed')?.checked !== false;
        const notifyErrors = document.getElementById('sync-notify-errors')?.checked !== false;
        const maxRetries = parseInt(document.getElementById('sync-max-retries')?.value || 5);

        await DB.put('settings', { key: 'sync_compress', value: compress.toString(), updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'sync_retry_failed', value: retryFailed.toString(), updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'sync_notify_errors', value: notifyErrors.toString(), updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'sync_max_retries', value: maxRetries, updated_at: new Date().toISOString() });

        Utils.showNotification('Configuración avanzada guardada', 'success');
    },

    async syncFailedItems() {
        const failed = await DB.query('sync_queue', 'status', 'failed');
        if (failed.length === 0) {
            Utils.showNotification('No hay elementos fallidos para reintentar', 'info');
            return;
        }

        // Resetear estado a pending
        for (const item of failed) {
            await DB.put('sync_queue', {
                ...item,
                status: 'pending',
                retries: 0
            });
        }

        Utils.showNotification(`${failed.length} elementos marcados para reintento`, 'success');
        await this.syncNow();
    },

    async clearSyncedItems() {
        if (!await Utils.confirm('¿Eliminar todos los elementos sincronizados de la cola?')) {
            return;
        }

        try {
            const synced = await DB.query('sync_queue', 'status', 'synced') || [];
            let deletedCount = 0;
            
            for (const item of synced) {
                await DB.delete('sync_queue', item.id);
                deletedCount++;
            }

            Utils.showNotification(`${deletedCount} elementos sincronizados eliminados`, 'success');
            return deletedCount;
        } catch (e) {
            console.error('Error eliminando elementos sincronizados:', e);
            Utils.showNotification('Error al eliminar elementos sincronizados', 'error');
            throw e;
        }
    },

    async clearPendingItems() {
        if (!await Utils.confirm('¿Eliminar todos los elementos pendientes de la cola? Esto cancelará la sincronización de estos elementos.')) {
            return;
        }

        try {
            const pending = await DB.query('sync_queue', 'status', 'pending') || [];
            let deletedCount = 0;
            
            for (const item of pending) {
                await DB.delete('sync_queue', item.id);
                deletedCount++;
            }

            Utils.showNotification(`${deletedCount} elementos pendientes eliminados`, 'success');
            return deletedCount;
        } catch (e) {
            console.error('Error eliminando elementos pendientes:', e);
            Utils.showNotification('Error al eliminar elementos pendientes', 'error');
            throw e;
        }
    },

    async sync() {
        return await this.syncNow();
    },
    
    // Función para verificar la conexión con Google Apps Script
    async testConnection() {
        if (!this.syncUrl || !this.syncToken) {
            return { success: false, error: 'URL o token no configurado' };
        }

        try {
            console.log('🔍 Probando conexión con Google Apps Script...');
            
            // Intentar hacer una petición GET simple para verificar CORS
            try {
                const response = await fetch(this.syncUrl, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const text = await response.text();
                    console.log('✅ Conexión exitosa. Respuesta:', text);
                    return { 
                        success: true, 
                        message: 'Conexión verificada correctamente. CORS está configurado.',
                        corsWorking: true
                    };
                } else {
                    return { 
                        success: false, 
                        error: `Error HTTP ${response.status}`,
                        corsWorking: false
                    };
                }
            } catch (corsError) {
                if (corsError.message.includes('CORS') || corsError.message.includes('fetch')) {
                    console.error('❌ ERROR CORS:', corsError);
                    return { 
                        success: false, 
                        error: 'CORS bloqueado. Google Apps Script no está configurado correctamente. Actualiza el código en Google Apps Script y crea una NUEVA implementación.',
                        corsWorking: false,
                        requiresAction: 'Actualizar Google Apps Script con headers CORS y volver a desplegar'
                    };
                } else {
                    throw corsError;
                }
            }
        } catch (e) {
            console.error('❌ Error probando conexión:', e);
            return { 
                success: false, 
                error: e.message || 'Error desconocido',
                corsWorking: false
            };
        }
    },

    // Función de diagnóstico para verificar el estado de la cola
    async diagnoseQueue() {
        try {
            const allItems = await DB.getAll('sync_queue') || [];
            const byStatus = {};
            const byType = {};
            
            allItems.forEach(item => {
                const status = item.status || 'unknown';
                const type = item.entity_type || 'unknown';
                if (!byStatus[status]) byStatus[status] = [];
                if (!byType[type]) byType[type] = [];
                byStatus[status].push(item);
                byType[type].push(item);
            });
            
            const diagnosis = {
                total: allItems.length,
                byStatus: Object.fromEntries(Object.entries(byStatus).map(([s, items]) => [s, items.length])),
                byType: Object.fromEntries(Object.entries(byType).map(([t, items]) => [t, items.length])),
                pending: byStatus.pending?.length || 0,
                synced: byStatus.synced?.length || 0,
                failed: byStatus.failed?.length || 0,
                recentPending: byStatus.pending?.slice(-10).map(i => ({
                    type: i.entity_type,
                    id: i.entity_id?.substring(0, 20),
                    created: i.created_at
                })) || []
            };
            
            console.log('🔍 DIAGNÓSTICO DE COLA DE SINCRONIZACIÓN:', diagnosis);
            return diagnosis;
        } catch (e) {
            console.error('Error en diagnóstico:', e);
            return { error: e.message };
        }
    },
    
    // Función para forzar re-agregar elementos a la cola (útil si se perdieron)
    async forceRequeueEntityType(entityType, limit = 100) {
        try {
            console.log(`🔄 Forzando re-agregar ${entityType} a la cola...`);
            
            let records = [];
            switch (entityType) {
                case 'sale':
                    records = await DB.getAll('sales') || [];
                    break;
                case 'inventory_item':
                    records = await DB.getAll('inventory_items') || [];
                    break;
                case 'customer':
                    records = await DB.getAll('customers') || [];
                    break;
                case 'employee':
                    records = await DB.getAll('employees') || [];
                    break;
                case 'repair':
                    records = await DB.getAll('repairs') || [];
                    break;
                case 'cost_entry':
                    records = await DB.getAll('cost_entries') || [];
                    break;
                default:
                    throw new Error(`Tipo de entidad no soportado: ${entityType}`);
            }
            
            // Limitar cantidad
            records = records.slice(0, limit);
            
            console.log(`📦 Encontrados ${records.length} registros de ${entityType}`);
            
            let added = 0;
            let errors = 0;
            
            for (const record of records) {
                try {
                    // Verificar si ya está en la cola
                    const existing = await DB.getAll('sync_queue') || [];
                    const alreadyInQueue = existing.some(item => 
                        item.entity_type === entityType && 
                        item.entity_id === record.id &&
                        item.status === 'pending'
                    );
                    
                    if (!alreadyInQueue) {
                        await this.addToQueue(entityType, record.id);
                        added++;
                    }
                } catch (e) {
                    console.error(`Error agregando ${record.id}:`, e);
                    errors++;
                }
            }
            
            console.log(`✅ Re-agregados ${added} elementos, ${errors} errores`);
            Utils.showNotification(`Re-agregados ${added} elementos de ${entityType} a la cola`, 'success');
            
            return { added, errors, total: records.length };
        } catch (e) {
            console.error('Error en forceRequeueEntityType:', e);
            Utils.showNotification(`Error: ${e.message}`, 'error');
            throw e;
        }
    }
};

// Exponer SyncManager globalmente
window.SyncManager = SyncManager;

