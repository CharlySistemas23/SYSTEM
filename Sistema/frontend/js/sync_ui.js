// Sync UI Module

const SyncUI = {
    initialized: false,
    
    async init() {
        // Recargar configuración de sincronización desde la base de datos
        try {
            const urlSetting = await DB.get('settings', 'sync_url');
            const tokenSetting = await DB.get('settings', 'sync_token');
            const clientIdSetting = await DB.get('settings', 'google_client_id');
            const spreadsheetIdSetting = await DB.get('settings', 'google_sheets_spreadsheet_id');
            
            if (urlSetting) SyncManager.syncUrl = urlSetting.value;
            if (tokenSetting) SyncManager.syncToken = tokenSetting.value;
            if (clientIdSetting) SyncManager.googleClientId = clientIdSetting.value;
            if (spreadsheetIdSetting) SyncManager.spreadsheetId = spreadsheetIdSetting.value;
        } catch (e) {
            console.error('Error loading sync settings on init:', e);
        }

        if (this.initialized) {
            // Si ya está inicializado, recargar la pestaña activa
            const activeTab = document.querySelector('#sync-tabs .tab-btn.active')?.dataset.tab || 'overview';
            await this.loadTab(activeTab);
            return;
        }
        
        try {
            this.setupUI();
            await this.loadTab('overview');
            this.initialized = true;
        } catch (e) {
            console.error('Error initializing SyncUI:', e);
            throw e;
        }
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div id="sync-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="overview"><i class="fas fa-chart-line"></i> Resumen</button>
                <button class="tab-btn" data-tab="queue"><i class="fas fa-list"></i> Cola</button>
                <button class="tab-btn" data-tab="analytics"><i class="fas fa-chart-bar"></i> Análisis</button>
                <button class="tab-btn" data-tab="settings"><i class="fas fa-cog"></i> Configuración</button>
                <button class="tab-btn" data-tab="logs"><i class="fas fa-file-alt"></i> Logs</button>
            </div>
            <div id="sync-content"></div>
        `;

        // Event listeners para tabs
        document.querySelectorAll('#sync-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const clickedBtn = e.target.closest('.tab-btn');
                if (!clickedBtn) return;
                
                document.querySelectorAll('#sync-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                clickedBtn.classList.add('active');
                const tab = clickedBtn.dataset.tab;
                this.loadTab(tab);
            });
        });

        // Limpiar intervalo anterior si existe
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        // Auto refresh cada 10 segundos solo en la pestaña de resumen y cola
        this.autoRefreshInterval = setInterval(() => {
            const activeTab = document.querySelector('#sync-tabs .tab-btn.active')?.dataset.tab;
            if (activeTab === 'overview' || activeTab === 'queue') {
                this.loadTab(activeTab);
            }
        }, 10000);
    },

    async loadTab(tab) {
        const content = document.getElementById('sync-content');
        if (!content) {
            console.warn('sync-content no encontrado');
            return;
        }

        try {
            // Mostrar indicador de carga
            content.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

            let html = '';
            switch(tab) {
                case 'overview':
                    html = await this.getOverviewTab();
                    break;
                case 'queue':
                    html = await this.getQueueTab();
                    break;
                case 'analytics':
                    html = await this.getAnalyticsTab();
                    break;
                case 'settings':
                    html = await this.getSettingsTab();
                    break;
                case 'logs':
                    html = await this.getLogsTab();
                    break;
                default:
                    html = '<p>Pestaña no encontrada</p>';
            }
            
            content.innerHTML = html;
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
        // Recargar configuración de sincronización desde la base de datos siempre
        try {
            const urlSetting = await DB.get('settings', 'sync_url');
            const tokenSetting = await DB.get('settings', 'sync_token');
            const clientIdSetting = await DB.get('settings', 'google_client_id');
            const spreadsheetIdSetting = await DB.get('settings', 'google_sheets_spreadsheet_id');
            
            // Actualizar SyncManager con los valores de la base de datos
            SyncManager.syncUrl = urlSetting?.value || null;
            SyncManager.syncToken = tokenSetting?.value || null;
            SyncManager.googleClientId = clientIdSetting?.value || null;
            SyncManager.spreadsheetId = spreadsheetIdSetting?.value || null;
            
            console.log('Configuración de sincronización recargada:', {
                hasUrl: !!SyncManager.syncUrl,
                hasToken: !!SyncManager.syncToken,
                hasClientId: !!SyncManager.googleClientId,
                hasSpreadsheetId: !!SyncManager.spreadsheetId
            });
        } catch (e) {
            console.error('Error loading sync settings:', e);
        }

        let status, syncStats, lastSync;
        try {
            status = await SyncManager.getSyncStatus();
            syncStats = await SyncManager.getAdvancedStats();
            lastSync = await SyncManager.getLastSyncInfo();
        } catch (e) {
            console.error('Error loading overview:', e);
            status = { pending: 0, synced: 0, failed: 0, total: 0 };
            syncStats = { totalProcessed: 0, successRate: 0, avgPerSync: 0, avgDuration: 0 };
            lastSync = null;
        }

        // Verificar si está configurado - considerar ambas formas de configuración:
        // 1. Google Apps Script (sync_url + sync_token)
        // 2. Google Sheets API (google_client_id + spreadsheet_id)
        const hasAppsScriptConfig = SyncManager.syncUrl && SyncManager.syncToken && 
            SyncManager.syncUrl.trim() !== '' && SyncManager.syncToken.trim() !== '';
        const hasSheetsApiConfig = SyncManager.googleClientId && SyncManager.spreadsheetId && 
            SyncManager.googleClientId.trim() !== '' && SyncManager.spreadsheetId.trim() !== '';
        const isConfigured = hasAppsScriptConfig || hasSheetsApiConfig;
        
        return `
            ${!isConfigured ? `
                <div style="padding: var(--spacing-md); background: var(--color-warning); color: white; border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                    <strong><i class="fas fa-exclamation-triangle"></i> Configuración Requerida</strong>
                    <p style="margin: var(--spacing-xs) 0 0 0; font-size: 12px;">
                        La URL y Token de sincronización no están configurados. 
                        Ve a la pestaña <strong>Configuración</strong> para configurarlos.
                    </p>
                    <div style="margin-top: var(--spacing-sm); font-size: 11px; opacity: 0.9;">
                        <div><strong>Estado actual:</strong></div>
                        <div style="margin-top: var(--spacing-xs);"><strong>Google Apps Script:</strong></div>
                        <div>• URL: ${SyncManager.syncUrl ? '✓ Configurada' : '✗ No configurada'}</div>
                        <div>• Token: ${SyncManager.syncToken ? '✓ Configurado' : '✗ No configurado'}</div>
                        <div style="margin-top: var(--spacing-xs);"><strong>Google Sheets API:</strong></div>
                        <div>• Client ID: ${SyncManager.googleClientId ? '✓ Configurado' : '✗ No configurado'}</div>
                        <div>• Spreadsheet ID: ${SyncManager.spreadsheetId ? '✓ Configurado' : '✗ No configurado'}</div>
                    </div>
                </div>
            ` : `
                <div style="padding: var(--spacing-md); background: var(--color-success); color: white; border-radius: var(--radius-md); margin-bottom: var(--spacing-md);">
                    <strong><i class="fas fa-check-circle"></i> Configuración Activa</strong>
                    <p style="margin: var(--spacing-xs) 0 0 0; font-size: 12px;">
                        La sincronización está configurada correctamente.
                    </p>
                </div>
            `}
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-md); margin-bottom: var(--spacing-lg); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="kpi-card">
                    <div class="kpi-label">Pendientes</div>
                    <div class="kpi-value" style="color: ${status.pending > 0 ? 'var(--color-warning)' : 'var(--color-success)'};">
                        ${status.pending}
                    </div>
                    ${status.pending > 0 && isConfigured ? `
                        <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            <button class="btn-secondary btn-sm" onclick="window.SyncManager.syncNow()" style="width: 100%;">
                                Sincronizar Ahora
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Sincronizados</div>
                    <div class="kpi-value" style="color: var(--color-success);">${status.synced}</div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${syncStats.successRate.toFixed(1)}% éxito
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Fallidos</div>
                    <div class="kpi-value" style="color: ${status.failed > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                        ${status.failed}
                    </div>
                    ${status.failed > 0 ? `
                        <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            <button class="btn-secondary btn-sm" onclick="window.SyncUI.loadTab('queue')" style="width: 100%;">
                                Ver Fallidos
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Estado</div>
                    <div class="kpi-value" style="font-size: 18px; color: ${SyncManager.isOnline ? 'var(--color-success)' : 'var(--color-danger)'};">
                        ${SyncManager.isOnline ? 'Online' : 'Offline'}
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                        ${SyncManager.isSyncing ? 'Sincronizando...' : 'Listo'}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-clock"></i> Última Sincronización
                    </h3>
                    ${lastSync ? `
                        <div style="font-size: 12px; margin-bottom: var(--spacing-xs);">
                            <strong>Fecha:</strong> ${Utils.formatDate(lastSync.created_at, 'DD/MM/YYYY HH:mm:ss')}
                        </div>
                        <div style="font-size: 12px; margin-bottom: var(--spacing-xs);">
                            <strong>Estado:</strong> 
                            <span style="color: ${lastSync.status === 'success' ? 'var(--color-success)' : 'var(--color-danger)'};">
                                ${lastSync.status === 'success' ? 'Exitoso' : 'Fallido'}
                            </span>
                        </div>
                        <div style="font-size: 12px; margin-bottom: var(--spacing-xs);">
                            <strong>Elementos:</strong> ${lastSync.items_synced || 0} sincronizados
                        </div>
                        ${lastSync.duration ? `
                            <div style="font-size: 12px;">
                                <strong>Duración:</strong> ${lastSync.duration}ms
                            </div>
                        ` : ''}
                    ` : '<p style="color: var(--color-text-secondary); font-size: 11px;">No hay sincronizaciones registradas</p>'}
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-pie"></i> Estadísticas Rápidas
                    </h3>
                    <div style="font-size: 11px;">
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Total Procesado:</strong> ${syncStats.totalProcessed}
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Promedio por Sincronización:</strong> ${syncStats.avgPerSync.toFixed(1)}
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Tasa de Éxito:</strong> ${syncStats.successRate.toFixed(1)}%
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Tiempo Promedio:</strong> ${syncStats.avgDuration}ms
                        </div>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-tasks"></i> Acciones Rápidas
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                        <button class="btn-primary btn-sm" onclick="window.SyncManager.syncNow(); setTimeout(() => window.SyncUI.loadTab('overview'), 1000);" style="width: 100%;" ${SyncManager.isSyncing ? 'disabled' : ''}>
                            <i class="fas fa-sync ${SyncManager.isSyncing ? 'fa-spin' : ''}"></i> ${SyncManager.isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.SyncManager.syncFailedItems(); setTimeout(() => window.SyncUI.loadTab('overview'), 1000);" style="width: 100%;" ${SyncManager.isSyncing ? 'disabled' : ''}>
                            <i class="fas fa-redo"></i> Reintentar Fallidos
                        </button>
                        ${SyncManager.paused ? `
                            <button class="btn-success btn-sm" onclick="window.SyncUI.resumeSync();" style="width: 100%;">
                                <i class="fas fa-play"></i> Reanudar Sincronización
                            </button>
                        ` : `
                            <button class="btn-warning btn-sm" onclick="window.SyncUI.pauseSync();" style="width: 100%;" ${SyncManager.isSyncing ? 'disabled' : ''}>
                                <i class="fas fa-pause"></i> Pausar Sincronización
                            </button>
                        `}
                        <button class="btn-secondary btn-sm" onclick="window.SyncManager.clearSyncedItems().then(() => window.SyncUI.loadTab('overview'));" style="width: 100%;" ${SyncManager.isSyncing ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i> Limpiar Sincronizados
                        </button>
                        <button class="btn-warning btn-sm" onclick="window.SyncManager.clearPendingItems().then(() => window.SyncUI.loadTab('overview'));" style="width: 100%;" ${SyncManager.isSyncing ? 'disabled' : ''}>
                            <i class="fas fa-trash-alt"></i> Limpiar Pendientes
                        </button>
                    </div>
                </div>
            </div>

            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-top: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-sm);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                        <i class="fas fa-chart-line"></i> Actividad Reciente
                    </h3>
                    <div style="display: flex; gap: var(--spacing-xs);">
                        <button class="btn-secondary btn-sm" onclick="window.SyncManager.clearSyncedItems().then(() => window.SyncUI.loadTab('overview'));" title="Limpiar sincronizados">
                            <i class="fas fa-trash"></i> Sincronizados
                        </button>
                        <button class="btn-warning btn-sm" onclick="window.SyncManager.clearPendingItems().then(() => window.SyncUI.loadTab('overview'));" title="Limpiar pendientes">
                            <i class="fas fa-trash-alt"></i> Pendientes
                        </button>
                    </div>
                </div>
                <div id="sync-activity-chart" style="height: 200px; max-height: 200px; overflow-y: auto; overflow-x: hidden; background: var(--color-bg-secondary); border-radius: var(--radius-sm); padding: var(--spacing-sm); width: 100%; box-sizing: border-box;">
                    ${await this.renderActivityChart()}
                </div>
            </div>
        `;
    },

    async getQueueTab() {
        const allItems = await DB.getAll('sync_queue') || [];
        const pending = allItems.filter(i => i.status === 'pending').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const failed = allItems.filter(i => i.status === 'failed').sort((a, b) => new Date(b.last_attempt || b.created_at) - new Date(a.last_attempt || a.created_at));
        const synced = allItems.filter(i => i.status === 'synced').slice(-50).reverse();

        return `
            <div style="margin-bottom: var(--spacing-md); display: flex; gap: var(--spacing-sm); flex-wrap: wrap; align-items: center; width: 100%; max-width: 100%; box-sizing: border-box;">
                <button class="tab-btn active btn-sm" onclick="window.SyncUI.showQueueTab('pending')" id="tab-pending">
                    Pendientes (${pending.length})
                </button>
                <button class="tab-btn btn-sm" onclick="window.SyncUI.showQueueTab('failed')" id="tab-failed">
                    Fallidos (${failed.length})
                </button>
                <button class="tab-btn btn-sm" onclick="window.SyncUI.showQueueTab('synced')" id="tab-synced">
                    Sincronizados (${synced.length})
                </button>
                <div style="margin-left: auto; display: flex; gap: var(--spacing-xs);">
                    ${pending.length > 0 ? `
                        <button class="btn-warning btn-sm" onclick="window.SyncManager.clearPendingItems().then(() => window.SyncUI.loadTab('queue'));" title="Eliminar todos los pendientes">
                            <i class="fas fa-trash-alt"></i> Limpiar Pendientes (${pending.length})
                        </button>
                    ` : ''}
                    ${failed.length > 0 ? `
                        <button class="btn-danger btn-sm" onclick="window.SyncUI.clearFailedItems()" title="Eliminar todos los fallidos">
                            <i class="fas fa-trash"></i> Limpiar Fallidos (${failed.length})
                        </button>
                    ` : ''}
                    ${synced.length > 0 ? `
                        <button class="btn-secondary btn-sm" onclick="window.SyncManager.clearSyncedItems().then(() => window.SyncUI.loadTab('queue'));" title="Eliminar todos los sincronizados">
                            <i class="fas fa-trash"></i> Limpiar Sincronizados (${synced.length})
                        </button>
                    ` : ''}
                    <button class="btn-secondary btn-sm" onclick="window.SyncUI.exportQueue()" title="Exportar cola">
                        <i class="fas fa-download"></i> Exportar
                    </button>
                </div>
            </div>
            <div id="queue-content">
                ${this.renderQueueTable(pending, 'pending')}
            </div>
        `;
    },

    async getAnalyticsTab() {
        let analytics;
        try {
            analytics = await SyncManager.getAnalytics();
        } catch (e) {
            console.error('Error loading analytics:', e);
            analytics = {
                byType: {},
                avgDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                totalSyncs: 0,
                errors: [],
                history: []
            };
        }
        
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-chart-bar"></i> Sincronización por Tipo
                    </h3>
                    <div id="sync-by-type-chart">
                        ${this.renderByTypeChart(analytics.byType)}
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-clock"></i> Rendimiento Temporal
                    </h3>
                    <div style="font-size: 11px;">
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Tiempo Promedio:</strong> ${analytics.avgDuration}ms
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Tiempo Mínimo:</strong> ${analytics.minDuration}ms
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Tiempo Máximo:</strong> ${analytics.maxDuration}ms
                        </div>
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Total de Sincronizaciones:</strong> ${analytics.totalSyncs}
                        </div>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-exclamation-triangle"></i> Errores Comunes
                    </h3>
                    <div id="error-analysis">
                        ${this.renderErrorAnalysis(analytics.errors)}
                    </div>
                </div>
            </div>

            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-top: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                    <i class="fas fa-calendar"></i> Historial de Sincronización (Últimos 30 días)
                </h3>
                <div id="sync-history-chart" style="height: 250px; background: var(--color-bg-secondary); border-radius: var(--radius-sm); padding: var(--spacing-sm);">
                    ${this.renderHistoryChart(analytics.history)}
                </div>
            </div>
        `;
    },

    async getSettingsTab() {
        let settings;
        try {
            settings = await SyncManager.getSyncSettings();
        } catch (e) {
            console.error('Error loading settings:', e);
            settings = {
                autoSync: 'disabled',
                batchSize: 50,
                timeout: 60,
                compress: false,
                retryFailed: true,
                notifyErrors: true,
                maxRetries: 5,
                entityFilters: {},
                googleClientId: '',
                spreadsheetId: ''
            };
        }
        
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: var(--spacing-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); min-width: 0; width: 100%; box-sizing: border-box;">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-sync-alt"></i> Sincronización Automática
                    </h3>
                    <div class="form-group">
                        <label>Frecuencia de Sincronización</label>
                        <select id="sync-auto-frequency" class="form-select">
                            <option value="disabled" ${settings.autoSync === 'disabled' ? 'selected' : ''}>Deshabilitada</option>
                            <option value="5min" ${settings.autoSync === '5min' ? 'selected' : ''}>Cada 5 minutos</option>
                            <option value="15min" ${settings.autoSync === '15min' ? 'selected' : ''}>Cada 15 minutos</option>
                            <option value="30min" ${settings.autoSync === '30min' ? 'selected' : ''}>Cada 30 minutos</option>
                            <option value="1hour" ${settings.autoSync === '1hour' ? 'selected' : ''}>Cada hora</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Límite de Elementos por Batch</label>
                        <input type="number" id="sync-batch-size" class="form-input" value="${settings.batchSize || 50}" min="10" max="200">
                    </div>
                    <div class="form-group">
                        <label>Timeout (segundos)</label>
                        <input type="number" id="sync-timeout" class="form-input" value="${settings.timeout || 60}" min="30" max="180">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.SyncManager.saveSyncSettings()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Configuración
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-cog"></i> Configuración de Google Sheets API
                    </h3>
                    <div class="form-group">
                        <label>Google Client ID</label>
                        <input type="text" id="google-client-id" class="form-input" 
                               placeholder="363340186026-xxxxx.apps.googleusercontent.com"
                               value="${settings.googleClientId || ''}">
                        <small style="color: var(--color-text-secondary); font-size: 10px;">
                            ID de cliente OAuth obtenido de Google Cloud Console
                        </small>
                    </div>
                    <div class="form-group">
                        <label>Spreadsheet ID</label>
                        <input type="text" id="google-spreadsheet-id" class="form-input" 
                               placeholder="1awlhCklyVlnYxhC3i6wMYhgDE..."
                               value="${settings.spreadsheetId || ''}">
                        <small style="color: var(--color-text-secondary); font-size: 10px;">
                            ID del spreadsheet de Google Sheets (de la URL del documento)
                        </small>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="SyncManager.testGoogleAuth()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-key"></i> Probar Autenticación
                    </button>
                        <button class="btn-primary btn-sm" onclick="window.SyncManager.saveSyncSettings()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Configuración Google
                    </button>
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid var(--color-primary);">
                        <div style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.5;">
                            <strong style="color: var(--color-primary);">📌 Nota importante:</strong><br>
                            Para ver datos de <strong>todas las computadoras/sucursales</strong> en una sola computadora:
                            <ol style="margin: var(--spacing-xs) 0 0 var(--spacing-md); padding-left: var(--spacing-sm); font-size: 10px;">
                                <li>Las computadoras deben estar sincronizando hacia Google Sheets</li>
                                <li>En tu computadora (como admin), el Dashboard y Reportes mostrarán automáticamente datos de todas las sucursales</li>
                                <li>Los datos se sincronizan automáticamente en segundo plano</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-filter"></i> Filtros de Sincronización
                    </h3>
                    <div style="font-size: 11px; margin-bottom: var(--spacing-sm);">
                        Selecciona qué tipos de entidades sincronizar automáticamente:
                    </div>
                    ${this.renderEntityFilters(settings.entityFilters)}
                    <button class="btn-primary btn-sm" onclick="window.SyncManager.saveEntityFilters()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Filtros
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">
                        <i class="fas fa-shield-alt"></i> Configuración Avanzada
                    </h3>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="sync-compress" ${settings.compress ? 'checked' : ''}>
                            <span>Comprimir datos antes de enviar</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="sync-retry-failed" ${settings.retryFailed !== false ? 'checked' : ''}>
                            <span>Reintentar automáticamente elementos fallidos</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="sync-notify-errors" ${settings.notifyErrors !== false ? 'checked' : ''}>
                            <span>Notificar errores de sincronización</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Máximo de Reintentos</label>
                        <input type="number" id="sync-max-retries" class="form-input" value="${settings.maxRetries || 5}" min="1" max="10">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.SyncManager.saveAdvancedSettings()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Configuración Avanzada
                    </button>
                </div>
            </div>
        `;
    },

    async getLogsTab() {
        const logs = await DB.getAll('sync_logs') || [];
        const recentLogs = logs.slice(-100).reverse();

        return `
            <div style="margin-bottom: var(--spacing-md); display: flex; gap: var(--spacing-sm); align-items: center; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 200px;">
                    <input type="text" id="log-search" class="form-input" placeholder="Buscar en logs..." 
                        onkeyup="window.SyncUI.filterLogs(this.value)">
                </div>
                <select id="log-filter-type" class="form-select" onchange="window.SyncUI.filterLogs()" style="width: 150px;">
                    <option value="">Todos los tipos</option>
                    <option value="success">Éxito</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                </select>
                <button class="btn-secondary btn-sm" onclick="window.SyncUI.exportSyncLogs()" title="Exportar logs">
                    <i class="fas fa-download"></i> Exportar
                </button>
                <button class="btn-danger btn-sm" onclick="window.SyncUI.clearLogs()" title="Limpiar logs">
                    <i class="fas fa-trash"></i> Limpiar
                </button>
            </div>
            <div id="logs-content" style="max-height: 600px; overflow-y: auto;">
                <table class="cart-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Mensaje</th>
                            <th>Estado</th>
                            <th>Duración</th>
                            <th>Elementos</th>
                        </tr>
                    </thead>
                    <tbody id="logs-table-body">
                        ${recentLogs.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 40px;">No hay logs</td></tr>' : recentLogs.map(log => `
                            <tr class="log-row" data-type="${log.type || 'info'}" data-message="${(log.message || '').toLowerCase()}">
                                <td style="font-size: 10px;">${Utils.formatDate(log.created_at, 'DD/MM/YYYY HH:mm:ss')}</td>
                                <td>
                                    <span style="color: ${log.type === 'error' ? 'var(--color-danger)' : log.type === 'success' ? 'var(--color-success)' : 'var(--color-text-secondary)'}; font-size: 10px;">
                                        ${log.type || 'info'}
                                    </span>
                                </td>
                                <td style="font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${log.message || ''}">
                                    ${log.message || ''}
                                </td>
                                <td><span class="status-badge status-${log.status || 'disponible'}" style="font-size: 9px;">${log.status || 'info'}</span></td>
                                <td style="font-size: 10px; color: var(--color-text-secondary);">
                                    ${log.duration ? `${log.duration}ms` : '-'}
                                </td>
                                <td style="font-size: 10px; color: var(--color-text-secondary);">
                                    ${log.items_synced || '-'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderEntityFilters(filters) {
        const entities = ['sale', 'inventory_item', 'customer', 'employee', 'repair', 'cost_entry', 'tourist_report', 'catalog_seller', 'catalog_guide', 'catalog_agency'];
        const entityNames = {
            'sale': 'Ventas',
            'inventory_item': 'Inventario',
            'customer': 'Clientes',
            'employee': 'Empleados',
            'repair': 'Reparaciones',
            'cost_entry': 'Costos',
            'tourist_report': 'Reportes Turistas',
            'catalog_seller': 'Vendedores',
            'catalog_guide': 'Guías',
            'catalog_agency': 'Agencias'
        };

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-xs); width: 100%; max-width: 100%; box-sizing: border-box;">
                ${entities.map(entity => `
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs); font-size: 11px; font-weight: normal;">
                        <input type="checkbox" id="sync-filter-${entity}" ${!filters || filters[entity] !== false ? 'checked' : ''}>
                        <span>${entityNames[entity] || entity}</span>
                    </label>
                `).join('')}
            </div>
        `;
    },

    renderByTypeChart(data) {
        if (!data || Object.keys(data).length === 0) {
            return '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md);">No hay datos</p>';
        }

        const maxValue = Math.max(...Object.values(data));
        
        return Object.entries(data).map(([type, count]) => {
            const width = maxValue > 0 ? (count / maxValue * 100) : 0;
            return `
                <div style="margin-bottom: var(--spacing-xs);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                        <span style="font-size: 10px; font-weight: 600;">${type}</span>
                        <span style="font-size: 10px; color: var(--color-text-secondary);">${count}</span>
                    </div>
                    <div style="width: 100%; height: 16px; background: var(--color-border-light); border-radius: var(--radius-full); overflow: hidden;">
                        <div style="width: ${width}%; height: 100%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 100%);"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderErrorAnalysis(errors) {
        if (!errors || errors.length === 0) {
            return '<p style="text-align: center; color: var(--color-success); padding: var(--spacing-md); font-size: 11px;">No hay errores registrados</p>';
        }

        return errors.slice(0, 5).map((error, idx) => `
            <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 10px;">
                <div style="font-weight: 600; color: var(--color-danger);">${idx + 1}. ${error.message}</div>
                <div style="color: var(--color-text-secondary); margin-top: 2px;">Ocurrió ${error.count} vez${error.count > 1 ? 'es' : ''}</div>
            </div>
        `).join('');
    },

    renderHistoryChart(history) {
        if (!history || history.length === 0) {
            return '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md);">No hay historial</p>';
        }

        const maxCount = Math.max(...history.map(h => h.count), 1);
        const maxHeight = 200;

        return `
            <div style="display: flex; align-items: flex-end; gap: 4px; height: ${maxHeight}px;">
                ${history.map(day => {
                    const height = (day.count / maxCount) * maxHeight;
                    return `
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                            <div style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                                <div style="width: 100%; background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-accent) 100%); 
                                    border-radius: var(--radius-xs) var(--radius-xs) 0 0; height: ${height}px; min-height: ${day.count > 0 ? '4px' : '0'};"></div>
                            </div>
                            <div style="font-size: 8px; color: var(--color-text-secondary); text-align: center;">
                                <div>${Utils.formatDate(day.date, 'DD/MM')}</div>
                                <div style="font-weight: 600; margin-top: 2px;">${day.count}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async renderActivityChart() {
        const logs = await DB.getAll('sync_logs') || [];
        const recentLogs = logs.slice(-20).reverse();
        
        if (recentLogs.length === 0) {
            return '<p style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md); margin: 0;">No hay actividad reciente</p>';
        }

        return recentLogs.map(log => `
            <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light); font-size: 10px; width: 100%; box-sizing: border-box; word-wrap: break-word;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--spacing-xs);">
                    <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${log.message || 'Sin mensaje'}</span>
                    <span style="color: var(--color-text-secondary); white-space: nowrap; flex-shrink: 0;">${Utils.formatDate(log.created_at, 'HH:mm:ss')}</span>
                </div>
            </div>
        `).join('');
    },

    async loadSyncStatus() {
        // Este método ahora redirige a loadTab para mantener consistencia
        await this.loadTab('overview');
    },


    renderQueueTable(items, type) {
        if (items.length === 0) {
            return `<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No hay elementos ${type === 'pending' ? 'pendientes' : type === 'failed' ? 'fallidos' : 'sincronizados'}</p>`;
        }

        return `
            <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>ID</th>
                            <th>Acción</th>
                            <th>Estado</th>
                            <th>Reintentos</th>
                            <th>Último Intento</th>
                            <th>Creado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr style="color: ${item.status === 'failed' ? 'var(--color-danger)' : ''};">
                                <td><span style="font-size: 11px; font-weight: 600;">${item.entity_type}</span></td>
                                <td><code style="font-size: 10px; background: var(--color-bg-secondary); padding: 2px 6px; border-radius: 4px;">${item.entity_id.substring(0, 20)}...</code></td>
                                <td><span style="font-size: 11px;">${item.action}</span></td>
                                <td><span class="status-badge status-${item.status === 'synced' ? 'disponible' : item.status === 'failed' ? 'vendida' : 'pendiente'}">${item.status}</span></td>
                                <td>
                                    <span style="font-size: 11px; ${item.retries >= 3 ? 'color: var(--color-warning); font-weight: 600;' : ''}">
                                        ${item.retries || 0}
                                    </span>
                                </td>
                                <td style="font-size: 10px; color: var(--color-text-secondary);">
                                    ${item.last_attempt ? Utils.formatDate(item.last_attempt, 'DD/MM/YYYY HH:mm') : 'N/A'}
                                </td>
                                <td style="font-size: 10px; color: var(--color-text-secondary);">
                                    ${Utils.formatDate(item.created_at, 'DD/MM/YYYY HH:mm')}
                                </td>
                                <td>
                                    <div style="display: flex; gap: 4px;">
                                        ${type === 'failed' ? `
                                            <button class="btn-secondary btn-sm" onclick="window.SyncUI.retrySync('${item.id}')" title="Reintentar">
                                                <i class="fas fa-redo"></i>
                                            </button>
                                        ` : ''}
                                        ${type === 'pending' || type === 'failed' ? `
                                            <button class="btn-danger btn-sm" onclick="window.SyncUI.deleteQueueItem('${item.id}')" title="Eliminar">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async showQueueTab(tab) {
        // Actualizar botones de pestaña
        document.querySelectorAll('#queue-content ~ .tab-btn, #queue-content ~ button.tab-btn').forEach(btn => btn.classList.remove('active'));
        const tabBtn = document.getElementById(`tab-${tab}`);
        if (tabBtn) tabBtn.classList.add('active');

        const content = document.getElementById('queue-content');
        if (!content) {
            // Si no existe el contenedor, recargar toda la pestaña
            await this.loadTab('queue');
            return;
        }

        if (tab === 'logs') {
            content.innerHTML = await this.getLogsTab();
            return;
        }

        // Recargar datos
        const allItems = await DB.getAll('sync_queue') || [];
        const pending = allItems.filter(i => i.status === 'pending').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const failed = allItems.filter(i => i.status === 'failed').sort((a, b) => new Date(b.last_attempt || b.created_at) - new Date(a.last_attempt || a.created_at));
        const synced = allItems.filter(i => i.status === 'synced').slice(-50).reverse();

        const data = { pending, failed, synced };
        window.SyncUI.currentQueueData = data;

        content.innerHTML = this.renderQueueTable(data[tab] || [], tab);
    },


    filterLogs(searchTerm = '', typeFilter = '') {
        try {
            const rows = document.querySelectorAll('#logs-table-body .log-row');
            if (rows.length === 0) return;

            const search = (searchTerm || '').toLowerCase();
            const type = typeFilter || document.getElementById('log-filter-type')?.value || '';

            let visibleCount = 0;
            rows.forEach(row => {
                const rowType = row.dataset.type || '';
                const rowMessage = row.dataset.message || '';
                const matchesSearch = !search || rowMessage.includes(search);
                const matchesType = !type || rowType === type;
                
                const visible = matchesSearch && matchesType;
                row.style.display = visible ? '' : 'none';
                if (visible) visibleCount++;
            });

            // Mostrar mensaje si no hay resultados
            const tbody = document.getElementById('logs-table-body');
            if (tbody && visibleCount === 0 && rows.length > 0) {
                const noResults = tbody.querySelector('.no-results-row');
                if (!noResults) {
                    const tr = document.createElement('tr');
                    tr.className = 'no-results-row';
                    tr.innerHTML = `<td colspan="6" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No se encontraron resultados</td>`;
                    tbody.appendChild(tr);
                }
            } else {
                const noResults = tbody?.querySelector('.no-results-row');
                if (noResults) noResults.remove();
            }
        } catch (e) {
            console.error('Error filtering logs:', e);
        }
    },

    async clearLogs() {
        if (!await Utils.confirm('¿Eliminar todos los logs de sincronización?')) {
            return;
        }

        const logs = await DB.getAll('sync_logs') || [];
        for (const log of logs) {
            await DB.delete('sync_logs', log.id);
        }

        Utils.showNotification('Logs eliminados', 'success');
        await this.loadTab('logs');
    },

    async retrySync(itemId) {
        try {
            const item = await DB.get('sync_queue', itemId);
            if (!item) {
                Utils.showNotification('Elemento no encontrado', 'error');
                return;
            }

            const settings = await SyncManager.getSyncSettings();
            const maxRetries = settings.maxRetries || 5;

            if (item.retries >= maxRetries) {
                if (!await Utils.confirm(`Este elemento ya tiene ${item.retries} reintentos (máximo: ${maxRetries}). ¿Forzar reintento?`)) {
                    return;
                }
            }

            item.status = 'pending';
            item.retries = (item.retries || 0) + 1;
            item.last_attempt = new Date().toISOString();
            item.error = null; // Limpiar error anterior
            await DB.put('sync_queue', item);

            Utils.showNotification(`Elemento marcado para reintento (intento ${item.retries}/${maxRetries})`, 'success');
            await this.loadTab('queue');
            
            // Opcionalmente iniciar sincronización si está online
            if (SyncManager.isOnline && !SyncManager.isSyncing) {
                setTimeout(async () => {
                    await SyncManager.syncNow();
                }, 500);
            }
        } catch (e) {
            console.error('Error retrying sync:', e);
            Utils.showNotification('Error al reintentar sincronización', 'error');
        }
    },

    async deleteQueueItem(itemId) {
        try {
            if (!await Utils.confirm('¿Eliminar este elemento de la cola de sincronización?')) {
                return;
            }

            const item = await DB.get('sync_queue', itemId);
            if (!item) {
                Utils.showNotification('Elemento no encontrado', 'error');
                return;
            }

            await DB.delete('sync_queue', itemId);
            Utils.showNotification('Elemento eliminado de la cola', 'success');
            
            // Recargar la pestaña actual
            await this.loadTab('queue');
        } catch (e) {
            console.error('Error eliminando elemento de la cola:', e);
            Utils.showNotification('Error al eliminar elemento', 'error');
        }
    },

    async clearFailedItems() {
        try {
            if (!await Utils.confirm('¿Eliminar todos los elementos fallidos de la cola?')) {
                return;
            }

            const allItems = await DB.getAll('sync_queue') || [];
            const failedItems = allItems.filter(item => item.status === 'failed');
            
            for (const item of failedItems) {
                await DB.delete('sync_queue', item.id);
            }

            Utils.showNotification(`${failedItems.length} elementos fallidos eliminados`, 'success');
            await this.loadTab('queue');
        } catch (e) {
            console.error('Error eliminando elementos fallidos:', e);
            Utils.showNotification('Error al eliminar elementos fallidos', 'error');
        }
    },

    async exportQueue() {
        try {
            const allItems = await DB.getAll('sync_queue') || [];
            
            if (allItems.length === 0) {
                Utils.showNotification('No hay elementos en la cola para exportar', 'info');
                return;
            }

            // Convertir a CSV
            const headers = ['ID', 'Tipo', 'ID Entidad', 'Acción', 'Estado', 'Reintentos', 'Último Intento', 'Creado', 'Error'];
            const rows = allItems.map(item => [
                item.id,
                item.entity_type || '',
                item.entity_id || '',
                item.action || 'upsert',
                item.status || 'pending',
                item.retries || 0,
                item.last_attempt || '',
                item.created_at || '',
                item.error || ''
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            // Crear y descargar archivo
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `sync_queue_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Utils.showNotification(`Cola exportada: ${allItems.length} elementos`, 'success');
        } catch (e) {
            console.error('Error exportando cola:', e);
            Utils.showNotification('Error al exportar cola', 'error');
        }
    },

    async loadSyncStatus() {
        await this.loadTab('overview');
    }
};

window.SyncUI = SyncUI;

