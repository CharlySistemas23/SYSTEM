// Sync UI Module - Módulo de Sincronización con Railway

const SyncUI = {
    initialized: false,
    updateInterval: null,
    
    async init() {
        try {
            if (this.initialized) {
                await this.loadStatus();
                return;
            }
            
            this.setupUI();
            // Pequeño delay para asegurar que el DOM esté listo
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.loadStatus();
            this.startAutoUpdate();
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error inicializando módulo SyncUI:', error);
            this.initialized = true; // Marcar como inicializado para evitar loops infinitos
            const content = document.getElementById('module-content') || document.getElementById('sync-ui-container');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <h3 style="color: var(--color-danger);">Error al cargar módulo Sincronización</h3>
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
            // Aún así intentar cargar el estado
            try {
                await this.loadStatus();
            } catch (err) {
                console.error('Error loading status after init failure:', err);
            }
        }
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div id="sync-ui-container" class="dashboard-card-prodex module-section" style="padding: var(--spacing-lg); max-width: 1400px; margin: 0 auto;">
                <!-- Tarjetas KPI Principales -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <!-- Estado del Servidor -->
                    <div class="kpi-card" style="position: relative; overflow: hidden;">
                        <div class="kpi-label">
                            <i class="fas fa-server" style="margin-right: 6px;"></i> Servidor
                        </div>
                        <div id="sync-server-status-kpi" class="kpi-value" style="font-size: 18px; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </div>
                        <div id="sync-server-url" style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs); opacity: 0.8;">
                            Verificando...
                        </div>
                    </div>

                    <!-- Estado de Sincronización -->
                    <div class="kpi-card" style="position: relative; overflow: hidden;">
                        <div class="kpi-label">
                            <i class="fas fa-sync" style="margin-right: 6px;"></i> Estado
                        </div>
                        <div id="sync-status-kpi" class="kpi-value" style="font-size: 18px; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-spinner fa-spin"></i> Cargando...
                        </div>
                        <div id="sync-status-detail" style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            Verificando...
                        </div>
                    </div>

                    <!-- Cola Pendiente -->
                    <div class="kpi-card" style="position: relative; overflow: hidden;">
                        <div class="kpi-label">
                            <i class="fas fa-list" style="margin-right: 6px;"></i> Pendientes
                        </div>
                        <div id="sync-queue-kpi" class="kpi-value" style="font-size: 28px; font-weight: 700;">
                            0
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            En cola de sincronización
                        </div>
                    </div>

                    <!-- Estadísticas Totales -->
                    <div class="kpi-card" style="position: relative; overflow: hidden;">
                        <div class="kpi-label">
                            <i class="fas fa-chart-line" style="margin-right: 6px;"></i> Total
                        </div>
                        <div id="sync-total-kpi" class="kpi-value" style="font-size: 28px; font-weight: 700;">
                            0
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            Sincronizaciones realizadas
                        </div>
                    </div>
                </div>

                <!-- Panel Principal de Control -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <!-- Panel de Conexión -->
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
                            <h3 style="margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-network-wired"></i> Conexión con Railway
                            </h3>
                            <button class="btn-secondary btn-sm" id="test-connection-btn">
                                <i class="fas fa-plug"></i> Probar
                            </button>
                        </div>
                        <div id="sync-server-status" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md); min-height: 80px; display: flex; align-items: center; justify-content: center;">
                            <div style="text-align: center;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);"></i>
                                <div style="font-size: 11px; color: var(--color-text-secondary);">Cargando estado...</div>
                            </div>
                        </div>
                        <div style="padding: var(--spacing-sm); background: rgba(var(--color-primary-rgb), 0.1); border-radius: var(--radius-sm); border-left: 3px solid var(--color-primary);">
                            <div style="font-size: 11px; color: var(--color-text-secondary); line-height: 1.5;">
                                <i class="fas fa-info-circle" style="margin-right: 6px;"></i>
                                <strong>Nota:</strong> Configura la URL del servidor en <strong>Configuración → Sincronización</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Panel de Sincronización -->
                    <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
                            <h3 style="margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-sync-alt"></i> Control de Sincronización
                            </h3>
                        </div>
                        <div id="sync-status" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md); min-height: 80px; display: flex; align-items: center; justify-content: center;">
                            <div style="text-align: center;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);"></i>
                                <div style="font-size: 11px; color: var(--color-text-secondary);">Cargando estado...</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-xs);">
                            <button class="btn-primary btn-sm" id="sync-now-btn" style="width: 100%;">
                                <i class="fas fa-sync-alt"></i> Sincronizar Ahora
                            </button>
                            <button class="btn-secondary btn-sm" id="clear-queue-btn" style="width: 100%;">
                                <i class="fas fa-trash"></i> Limpiar Cola
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Estadísticas Detalladas -->
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-chart-bar"></i> Estadísticas de Sincronización
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--spacing-md);">
                        <div id="sync-stats-success" style="padding: var(--spacing-md); background: rgba(34, 197, 94, 0.1); border-radius: var(--radius-sm); border-left: 4px solid #22c55e;">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                                <i class="fas fa-check-circle" style="color: #22c55e; margin-right: 6px;"></i> Exitosas
                            </div>
                            <div style="font-size: 24px; font-weight: 700; color: #22c55e;">0</div>
                        </div>
                        <div id="sync-stats-failed" style="padding: var(--spacing-md); background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); border-left: 4px solid #ef4444;">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                                <i class="fas fa-times-circle" style="color: #ef4444; margin-right: 6px;"></i> Fallidas
                            </div>
                            <div style="font-size: 24px; font-weight: 700; color: #ef4444;">0</div>
                        </div>
                        <div id="sync-stats-pending" style="padding: var(--spacing-md); background: rgba(251, 191, 36, 0.1); border-radius: var(--radius-sm); border-left: 4px solid #fbbf24;">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                                <i class="fas fa-clock" style="color: #fbbf24; margin-right: 6px;"></i> Pendientes
                            </div>
                            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">0</div>
                        </div>
                        <div id="sync-stats-last" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 4px solid var(--color-primary);">
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                                <i class="fas fa-history" style="margin-right: 6px;"></i> Última Sincronización
                            </div>
                            <div style="font-size: 12px; font-weight: 600; color: var(--color-text);">Nunca</div>
                        </div>
                    </div>
                </div>

                <!-- Historial de Sincronización -->
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md);">
                        <h3 style="margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-history"></i> Historial de Sincronización
                        </h3>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">
                            Últimas 50 sincronizaciones
                        </div>
                    </div>
                    <div id="sync-history" style="max-height: 450px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm);">
                        <div style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: var(--spacing-sm);"></i>
                            <div>Cargando historial...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('test-connection-btn')?.addEventListener('click', () => this.testConnection());
        document.getElementById('sync-now-btn')?.addEventListener('click', () => this.syncNow());
        document.getElementById('clear-queue-btn')?.addEventListener('click', () => this.clearQueue());
    },

    async loadStatus() {
        await Promise.all([
            this.updateServerStatus(),
            this.updateSyncStatus(),
            this.updateQueueInfo(),
            this.updateStats(),
            this.loadHistory()
        ]);
    },

    async updateServerStatus() {
        const statusDiv = document.getElementById('sync-server-status');
        const statusKpi = document.getElementById('sync-server-status-kpi');
        const urlDiv = document.getElementById('sync-server-url');
        if (!statusDiv) return;

        try {
            const apiUrl = (await DB.get('settings', 'api_url'))?.value || null;
            
            // Asegurar que API esté inicializado
            if (typeof API !== 'undefined' && apiUrl && !API.baseURL) {
                await API.init();
            }
            
            // Verificar conexión real: /health (no depender de token/socket)
            const hasToken = (typeof API !== 'undefined' && API.token) || localStorage.getItem('api_token');
            const hasSocket = typeof API !== 'undefined' && API.socket && API.socket.connected;
            const isConfigured = apiUrl && typeof API !== 'undefined' && API.baseURL;
            const isConnected = !!(isConfigured && typeof API.checkHealth === 'function' && await API.checkHealth());

            if (isConnected) {
                if (statusKpi) {
                    statusKpi.innerHTML = '<span style="color: var(--color-success);"><i class="fas fa-check-circle"></i> Conectado</span>';
                }
                if (urlDiv) {
                    urlDiv.textContent = apiUrl.length > 40 ? apiUrl.substring(0, 37) + '...' : apiUrl;
                }
                statusDiv.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-check-circle" style="font-size: 48px; color: var(--color-success); margin-bottom: var(--spacing-sm);"></i>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-success); margin-bottom: var(--spacing-xs);">Conectado</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); word-break: break-all;">
                            ${apiUrl}
                        </div>
                    </div>
                `;
            } else if (apiUrl) {
                if (statusKpi) {
                    statusKpi.innerHTML = '<span style="color: var(--color-warning);"><i class="fas fa-exclamation-triangle"></i> Sin Conexión</span>';
                }
                if (urlDiv) {
                    urlDiv.textContent = apiUrl.length > 40 ? apiUrl.substring(0, 37) + '...' : apiUrl;
                }
                
                // Verificar por qué no está conectado
                let reason = 'No responde /health (backend caído o bloqueado por CORS)';
                if (!hasToken) {
                    reason = 'Sin token (pero el sync HTTP puede funcionar por fallback si /health responde)';
                } else if (!hasSocket) {
                    reason = 'Socket.IO no conectado (no debería bloquear sync HTTP)';
                }
                
                // Agregar botón para crear usuario si no hay token
                let actionButton = '';
                if (!hasToken) {
                    actionButton = `
                        <button id="create-admin-user-btn" class="btn-primary" style="margin-top: var(--spacing-sm); width: 100%;">
                            <i class="fas fa-user-plus"></i> Crear Usuario master_admin en Railway
                        </button>
                    `;
                }
                
                statusDiv.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--color-warning); margin-bottom: var(--spacing-sm);"></i>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-warning); margin-bottom: var(--spacing-xs);">Configurado pero no conectado</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); word-break: break-all; margin-bottom: var(--spacing-xs);">
                            ${apiUrl}
                        </div>
                        <div style="font-size: 10px; color: var(--color-warning); font-weight: 500;">
                            ${reason}
                        </div>
                        ${actionButton}
                    </div>
                `;
                
                // Agregar event listener al botón si existe
                const createBtn = document.getElementById('create-admin-user-btn');
                if (createBtn) {
                    createBtn.addEventListener('click', async () => {
                        await this.createAdminUser();
                    });
                }
            } else {
                if (statusKpi) {
                    statusKpi.innerHTML = '<span style="color: var(--color-danger);"><i class="fas fa-times-circle"></i> No Configurado</span>';
                }
                if (urlDiv) {
                    urlDiv.textContent = 'No configurado';
                }
                statusDiv.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-times-circle" style="font-size: 48px; color: var(--color-danger); margin-bottom: var(--spacing-sm);"></i>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-danger); margin-bottom: var(--spacing-xs);">No configurado</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">
                            Configura el servidor en<br>Configuración → Sincronización
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error updating server status:', error);
            statusDiv.innerHTML = '<div style="color: var(--color-danger); text-align: center;">Error al cargar estado</div>';
        }
    },

    async updateSyncStatus() {
        const statusDiv = document.getElementById('sync-status');
        const statusKpi = document.getElementById('sync-status-kpi');
        const detailDiv = document.getElementById('sync-status-detail');
        if (!statusDiv) return;

        try {
            const apiUrl = (await DB.get('settings', 'api_url'))?.value || null;
            
            // Asegurar que API esté inicializado
            if (typeof API !== 'undefined' && apiUrl && !API.baseURL) {
                await API.init();
            }
            
            const isConfigured = !!(apiUrl && typeof API !== 'undefined' && API.baseURL);
            const isConnected = !!(isConfigured && typeof API.checkHealth === 'function' && await API.checkHealth());

            // Actualizar estado en el topbar
            if (typeof UI !== 'undefined' && UI.updateSyncStatus) {
                UI.updateSyncStatus(isConnected, typeof window.SyncManager !== 'undefined' ? window.SyncManager.isSyncing : false);
            }
            
            // También actualizar vía App si está disponible
            if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                await window.App.updateTopbarStatus();
            }

            if (!isConnected) {
                if (statusKpi) {
                    statusKpi.innerHTML = '<span style="color: var(--color-warning);"><i class="fas fa-pause-circle"></i> Desconectado</span>';
                }
                if (detailDiv) {
                    detailDiv.textContent = isConfigured ? 'Servidor no responde (/health)' : 'Servidor no configurado';
                }
                statusDiv.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-pause-circle" style="font-size: 48px; color: var(--color-warning); margin-bottom: var(--spacing-sm);"></i>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-warning); margin-bottom: var(--spacing-xs);">Desconectado</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">
                            ${isConfigured ? 'El servidor no responde. Revisa Railway y CORS.' : 'Configura el servidor para activar la sincronización'}
                        </div>
                    </div>
                `;
                return;
            }

            if (typeof window.SyncManager !== 'undefined') {
                const isSyncing = window.SyncManager.isSyncing;
                const queueSize = window.SyncManager.getQueueSize();

                if (isSyncing) {
                    if (statusKpi) {
                        statusKpi.innerHTML = '<span style="color: var(--color-info);"><i class="fas fa-sync-alt fa-spin"></i> Sincronizando</span>';
                    }
                    if (detailDiv) {
                        detailDiv.textContent = 'Procesando elementos...';
                    }
                    // Actualizar topbar
                    if (typeof UI !== 'undefined' && UI.updateSyncStatus) {
                        UI.updateSyncStatus(true, true);
                    }
                    if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                        await window.App.updateTopbarStatus();
                    }
                    statusDiv.innerHTML = `
                        <div style="text-align: center;">
                            <i class="fas fa-sync-alt fa-spin" style="font-size: 48px; color: var(--color-info); margin-bottom: var(--spacing-sm);"></i>
                            <div style="font-size: 14px; font-weight: 600; color: var(--color-info); margin-bottom: var(--spacing-xs);">Sincronizando...</div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">
                                Procesando elementos pendientes
                            </div>
                        </div>
                    `;
                } else if (queueSize > 0) {
                    if (statusKpi) {
                        statusKpi.innerHTML = `<span style="color: var(--color-warning);"><i class="fas fa-clock"></i> Pendiente</span>`;
                    }
                    if (detailDiv) {
                        detailDiv.textContent = `${queueSize} elemento(s) en cola`;
                    }
                    statusDiv.innerHTML = `
                        <div style="text-align: center;">
                            <i class="fas fa-clock" style="font-size: 48px; color: var(--color-warning); margin-bottom: var(--spacing-sm);"></i>
                            <div style="font-size: 14px; font-weight: 600; color: var(--color-warning); margin-bottom: var(--spacing-xs);">Pendiente</div>
                            <div style="font-size: 24px; font-weight: 700; color: var(--color-warning); margin-bottom: var(--spacing-xs);">${queueSize}</div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">
                                elemento(s) en cola de sincronización
                            </div>
                        </div>
                    `;
                } else {
                    if (statusKpi) {
                        statusKpi.innerHTML = '<span style="color: var(--color-success);"><i class="fas fa-check-circle"></i> Sincronizado</span>';
                    }
                    if (detailDiv) {
                        detailDiv.textContent = 'Todo está sincronizado';
                    }
                    // Actualizar topbar
                    if (typeof UI !== 'undefined' && UI.updateSyncStatus) {
                        UI.updateSyncStatus(true, false);
                    }
                    if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                        await window.App.updateTopbarStatus();
                    }
                    statusDiv.innerHTML = `
                        <div style="text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 48px; color: var(--color-success); margin-bottom: var(--spacing-sm);"></i>
                            <div style="font-size: 14px; font-weight: 600; color: var(--color-success); margin-bottom: var(--spacing-xs);">Sincronizado</div>
                            <div style="font-size: 11px; color: var(--color-text-secondary);">
                                Todo está sincronizado correctamente
                            </div>
                        </div>
                    `;
                }
            } else {
                if (statusKpi) {
                    statusKpi.innerHTML = '<span style="color: var(--color-danger);"><i class="fas fa-exclamation-triangle"></i> Error</span>';
                }
                if (detailDiv) {
                    detailDiv.textContent = 'SyncManager no disponible';
                }
                statusDiv.innerHTML = `
                    <div style="text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--color-danger); margin-bottom: var(--spacing-sm);"></i>
                        <div style="font-size: 14px; font-weight: 600; color: var(--color-danger); margin-bottom: var(--spacing-xs);">Error</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">
                            SyncManager no disponible
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error updating sync status:', error);
            statusDiv.innerHTML = '<div style="color: var(--color-danger); text-align: center;">Error al cargar estado</div>';
        }
    },

    async updateQueueInfo() {
        const queueCountEl = document.getElementById('sync-queue-count');
        const queueKpi = document.getElementById('sync-queue-kpi');
        if (!queueCountEl && !queueKpi) return;

        try {
            if (typeof window.SyncManager !== 'undefined') {
                const queueSize = window.SyncManager.getQueueSize();
                if (queueCountEl) {
                    queueCountEl.textContent = queueSize;
                    queueCountEl.style.color = queueSize > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
                }
                if (queueKpi) {
                    queueKpi.textContent = queueSize;
                    queueKpi.style.color = queueSize > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
                }
            } else {
                if (queueCountEl) queueCountEl.textContent = '0';
                if (queueKpi) queueKpi.textContent = '0';
            }
        } catch (error) {
            console.error('Error updating queue info:', error);
        }
    },

    async updateStats() {
        const statsDiv = document.getElementById('sync-stats-success');
        const totalKpi = document.getElementById('sync-total-kpi');
        const successDiv = document.getElementById('sync-stats-success');
        const failedDiv = document.getElementById('sync-stats-failed');
        const pendingDiv = document.getElementById('sync-stats-pending');
        const lastDiv = document.getElementById('sync-stats-last');
        
        if (!successDiv && !failedDiv && !pendingDiv && !lastDiv && !totalKpi) return;

        try {
            const syncLogs = await DB.getAll('sync_logs') || [];
            const successful = syncLogs.filter(log => log.status === 'synced').length;
            const failed = syncLogs.filter(log => log.status === 'failed').length;
            const pending = syncLogs.filter(log => log.status === 'pending').length;
            const total = syncLogs.length;

            const lastSync = syncLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

            // Actualizar KPI total
            if (totalKpi) {
                totalKpi.textContent = total;
                totalKpi.style.color = total > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)';
            }

            // Actualizar tarjeta de exitosas
            if (successDiv) {
                const valueEl = successDiv.querySelector('.kpi-value') || successDiv.querySelector('div[style*="font-size: 24px"]');
                if (valueEl) {
                    valueEl.textContent = successful;
                } else {
                    successDiv.innerHTML = `
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-check-circle" style="color: #22c55e; margin-right: 6px;"></i> Exitosas
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${successful}</div>
                    `;
                }
            }

            // Actualizar tarjeta de fallidas
            if (failedDiv) {
                const valueEl = failedDiv.querySelector('.kpi-value') || failedDiv.querySelector('div[style*="font-size: 24px"]');
                if (valueEl) {
                    valueEl.textContent = failed;
                } else {
                    failedDiv.innerHTML = `
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-times-circle" style="color: #ef4444; margin-right: 6px;"></i> Fallidas
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: #ef4444;">${failed}</div>
                    `;
                }
            }

            // Actualizar tarjeta de pendientes
            if (pendingDiv) {
                const queueSize = typeof window.SyncManager !== 'undefined' ? window.SyncManager.getQueueSize() : 0;
                const valueEl = pendingDiv.querySelector('.kpi-value') || pendingDiv.querySelector('div[style*="font-size: 24px"]');
                if (valueEl) {
                    valueEl.textContent = queueSize;
                } else {
                    pendingDiv.innerHTML = `
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-clock" style="color: #fbbf24; margin-right: 6px;"></i> Pendientes
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${queueSize}</div>
                    `;
                }
            }

            // Actualizar última sincronización
            if (lastDiv) {
                const valueEl = lastDiv.querySelector('div[style*="font-size: 12px"]');
                if (valueEl) {
                    valueEl.textContent = lastSync ? Utils.formatDate(lastSync.created_at, 'DD/MM/YYYY HH:mm') : 'Nunca';
                } else {
                    lastDiv.innerHTML = `
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-history" style="margin-right: 6px;"></i> Última Sincronización
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--color-text);">${lastSync ? Utils.formatDate(lastSync.created_at, 'DD/MM/YYYY HH:mm') : 'Nunca'}</div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    },

    async loadHistory() {
        const historyDiv = document.getElementById('sync-history');
        if (!historyDiv) return;

        try {
            const syncLogs = await DB.getAll('sync_logs') || [];
            const sortedLogs = syncLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);

            if (sortedLogs.length === 0) {
                historyDiv.innerHTML = '<div style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay historial de sincronización</div>';
                return;
            }

            // Mostrar como tarjetas en cuadrícula uniforme
            historyDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-md);">
                    ${sortedLogs.map(log => `
                        <div style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); 
                            ${log.status === 'synced' ? 'border-left: 4px solid #22c55e;' : ''}
                            ${log.status === 'failed' ? 'border-left: 4px solid #ef4444;' : ''}
                            ${log.status === 'pending' ? 'border-left: 4px solid #fbbf24;' : ''}
                        ">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-xs);">
                                <div style="font-size: 12px; font-weight: 600; color: var(--color-text);">
                                    ${log.entity_type || 'N/A'}
                                </div>
                                <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: 600; 
                                    ${log.status === 'synced' ? 'background: rgba(34, 197, 94, 0.1); color: #22c55e;' : ''}
                                    ${log.status === 'failed' ? 'background: rgba(239, 68, 68, 0.1); color: #ef4444;' : ''}
                                    ${log.status === 'pending' ? 'background: rgba(251, 191, 36, 0.1); color: #fbbf24;' : ''}
                                ">
                                    ${log.status === 'synced' ? '✓ Sincronizado' : log.status === 'failed' ? '✗ Fallido' : '⏳ Pendiente'}
                                </span>
                            </div>
                            <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                                <i class="fas fa-calendar-alt" style="margin-right: 4px;"></i>
                                ${Utils.formatDate(log.created_at, 'DD/MM/YYYY HH:mm')}
                            </div>
                            <div style="font-size: 10px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs); font-family: 'Consolas', 'Monaco', monospace;">
                                ID: ${(log.entity_id || '').substring(0, 12)}...
                            </div>
                            ${log.message ? `
                                <div style="font-size: 11px; color: var(--color-text-secondary); padding-top: var(--spacing-xs); border-top: 1px solid var(--color-border-light);">
                                    ${log.message}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Error loading history:', error);
            historyDiv.innerHTML = '<div style="color: var(--color-danger);">Error al cargar historial</div>';
        }
    },

    async testConnection() {
        const btn = document.getElementById('test-connection-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Probando...';
        }

        try {
            const apiUrl = (await DB.get('settings', 'api_url'))?.value || null;
            
            if (!apiUrl) {
                Utils.showNotification('⚠️ Configura el servidor primero en Configuración → Sincronización', 'warning');
                return;
            }

            Utils.showNotification('🔄 Probando conexión...', 'info');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                // Limpiar URL: eliminar barras finales y asegurar formato correcto
                const cleanUrl = apiUrl.replace(/\/+$/, ''); // Eliminar todas las barras finales
                const healthUrl = `${cleanUrl}/health`;
                
                console.log(`🔄 Probando conexión a: ${healthUrl}`);
                
                const response = await fetch(healthUrl, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    Utils.showNotification(`✅ Conexión exitosa: ${data.status || 'OK'}`, 'success');
                    await this.updateServerStatus();
                    await this.updateSyncStatus();
                    
                    // Actualizar estado del topbar
                    if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                        await window.App.updateTopbarStatus();
                    }
                } else {
                    throw new Error(`Servidor respondió con código ${response.status}`);
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Tiempo de espera agotado (5 segundos)');
                }
                throw fetchError;
            }
        } catch (error) {
            Utils.showNotification(`❌ Error de conexión: ${error.message}`, 'error');
            await this.updateServerStatus();
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-plug"></i> Probar Conexión';
            }
        }
    },

    async syncNow() {
        if (typeof window.SyncManager === 'undefined') {
            Utils.showNotification('SyncManager no disponible', 'error');
            return;
        }

        const btn = document.getElementById('sync-now-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        }

        try {
            Utils.showNotification('🔄 Iniciando sincronización...', 'info');
            await window.SyncManager.syncPending();
            Utils.showNotification('✅ Sincronización completada', 'success');
            await this.loadStatus();
        } catch (error) {
            console.error('Error syncing:', error);
            Utils.showNotification('❌ Error durante la sincronización: ' + error.message, 'error');
            await this.loadStatus();
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Ahora';
            }
        }
    },

    async clearQueue() {
        if (!await Utils.confirm('¿Estás seguro de que quieres limpiar toda la cola de sincronización? Esta acción no se puede deshacer.')) {
            return;
        }

        try {
            if (typeof window.SyncManager !== 'undefined') {
                await window.SyncManager.clearQueue();
                Utils.showNotification('✅ Cola de sincronización limpiada', 'success');
                await this.loadStatus();
            } else {
                Utils.showNotification('SyncManager no disponible', 'error');
            }
        } catch (error) {
            console.error('Error clearing queue:', error);
            Utils.showNotification('❌ Error al limpiar cola: ' + error.message, 'error');
        }
    },

    startAutoUpdate() {
        // Actualizar estado cada 5 segundos
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(async () => {
            if (this.initialized && document.getElementById('sync-status')) {
                try {
                    await this.loadStatus();
                } catch (error) {
                    console.error('Error en actualización automática:', error);
                }
            }
        }, 5000);
    },

    // Crear usuario master_admin en Railway
    async createAdminUser() {
        const btn = document.getElementById('create-admin-user-btn');
        if (!btn) return;
        
        // Deshabilitar botón y mostrar loading
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando usuario...';
        
        try {
            // Obtener URL del servidor
            const apiUrl = (await DB.get('settings', 'api_url'))?.value || null;
            if (!apiUrl) {
                throw new Error('URL del servidor no configurada');
            }
            
            // Limpiar URL
            const cleanUrl = apiUrl.replace(/\/+$/, '');
            const ensureAdminUrl = `${cleanUrl}/api/auth/ensure-admin`;
            
            console.log(`🔄 Creando usuario master_admin en Railway: ${ensureAdminUrl}`);
            
            // Llamar al endpoint
            const response = await fetch(ensureAdminUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            console.log('✅ Usuario creado:', result);
            
            // Mostrar notificación de éxito
            if (Utils && Utils.showNotification) {
                Utils.showNotification(
                    `✅ ${result.message || 'Usuario master_admin creado exitosamente'}`,
                    'success',
                    5000
                );
            }
            
            // Intentar login automático con las credenciales
            if (typeof API !== 'undefined' && typeof UserManager !== 'undefined') {
                console.log('🔄 Intentando login automático con master_admin...');
                
                try {
                    // Asegurar que API.baseURL esté configurado
                    API.baseURL = cleanUrl;
                    
                    // Intentar login
                    const loginResult = await API.login('master_admin', '1234');
                    
                    if (loginResult && loginResult.token) {
                        console.log('✅ Login automático exitoso');
                        API.token = loginResult.token;
                        localStorage.setItem('api_token', API.token);
                        
                        // Inicializar socket
                        try {
                            await API.initSocket();
                            console.log('✅ Socket.IO inicializado después de crear usuario');
                        } catch (socketError) {
                            console.warn('⚠️ Error inicializando socket:', socketError);
                        }
                        
                        // Actualizar estado
                        await this.updateServerStatus();
                        await this.updateSyncStatus();
                        
                        if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                            await window.App.updateTopbarStatus();
                        }
                        
                        if (Utils && Utils.showNotification) {
                            Utils.showNotification('✅ Conectado con Railway', 'success');
                        }
                    }
                } catch (loginError) {
                    console.warn('⚠️ No se pudo hacer login automático:', loginError);
                    console.log('💡 Puedes hacer login manualmente con: master_admin / 1234');
                    
                    if (Utils && Utils.showNotification) {
                        Utils.showNotification(
                            '✅ Usuario creado. Inicia sesión con: master_admin / 1234',
                            'info',
                            8000
                        );
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Error creando usuario:', error);
            
            if (Utils && Utils.showNotification) {
                Utils.showNotification(
                    `❌ Error: ${error.message || 'No se pudo crear el usuario'}`,
                    'error',
                    5000
                );
            }
        } finally {
            // Restaurar botón
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Usuario master_admin en Railway';
        }
    },

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.initialized = false;
    }
};

window.SyncUI = SyncUI;
