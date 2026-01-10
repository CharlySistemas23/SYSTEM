// Settings Module

const Settings = {
    initialized: false,
    
    async init() {
        if (this.initialized) return;
        this.setupUI();
        await this.loadSettings();
        
        // Escuchar eventos de sincronización para actualizar el estado
        window.addEventListener('sync-completed', async () => {
            // Si estamos en la pestaña de sincronización, recargar el estado
            const activeTab = document.querySelector('#settings-tabs .tab-btn.active')?.dataset.tab;
            if (activeTab === 'sync') {
                await this.loadSyncStatus();
            }
        });
        this.initialized = true;
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div id="settings-tabs" class="tabs-container" style="margin-bottom: var(--spacing-lg);">
                <button class="tab-btn active" data-tab="general"><i class="fas fa-cog"></i> General</button>
                <button class="tab-btn" data-tab="printing"><i class="fas fa-print"></i> Impresión</button>
                <button class="tab-btn" data-tab="financial"><i class="fas fa-dollar-sign"></i> Financiero</button>
                <button class="tab-btn" data-tab="catalogs"><i class="fas fa-book"></i> Catálogos</button>
                <button class="tab-btn" data-tab="arrival-rates"><i class="fas fa-table"></i> Tabulador Llegadas</button>
                <button class="tab-btn" data-tab="sync"><i class="fas fa-sync"></i> Sincronización</button>
                <button class="tab-btn" data-tab="security"><i class="fas fa-shield-alt"></i> Seguridad</button>
                <button class="tab-btn" data-tab="system"><i class="fas fa-server"></i> Sistema</button>
            </div>
            <div id="settings-content"></div>
        `;

        // Event listeners para tabs
        document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const tab = e.target.dataset.tab;
                this.loadTab(tab);
            });
        });

        // Cargar pestaña inicial
        this.loadTab('general');
    },

    async loadTab(tab) {
        const content = document.getElementById('settings-content');
        if (!content) return;

        switch(tab) {
            case 'general':
                content.innerHTML = this.getGeneralTab();
                break;
            case 'printing':
                content.innerHTML = this.getPrintingTab();
                await this.updateJewelryLabelStatus();
                break;
            case 'sync':
                content.innerHTML = this.getSyncTab();
                break;
            case 'financial':
                content.innerHTML = this.getFinancialTab();
                break;
            case 'catalogs':
                content.innerHTML = this.getCatalogsTab();
                break;
            case 'arrival-rates':
                content.innerHTML = this.getArrivalRatesTab();
                await this.loadArrivalRates();
                break;
            case 'security':
                content.innerHTML = this.getSecurityTab();
                await this.loadCompanyCodeSettings();
                break;
            case 'system':
                content.innerHTML = this.getSystemTab();
                break;
        }

        await this.loadSettings();
    },

    getGeneralTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-palette"></i> Apariencia
                    </h3>
                    <div class="form-group">
                        <label>Tema</label>
                        <select id="setting-theme" class="form-select">
                            <option value="light">Claro</option>
                            <option value="dark">Oscuro</option>
                            <option value="auto">Automático</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Idioma</label>
                        <select id="setting-language" class="form-select">
                            <option value="es">Español</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Formato de Fecha</label>
                        <select id="setting-date-format" class="form-select">
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.saveAppearance()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-save"></i> Guardar Apariencia
                        </button>
                    </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-bell"></i> Notificaciones
                    </h3>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="setting-notify-sales" checked>
                            <span>Notificar nuevas ventas</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="setting-notify-low-stock" checked>
                            <span>Alertar inventario bajo</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                            <input type="checkbox" id="setting-notify-sync" checked>
                            <span>Notificar sincronizaciones</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Umbral de Inventario Bajo</label>
                        <input type="number" id="setting-low-stock-threshold" class="form-input" value="10" step="1">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.saveNotifications()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-save"></i> Guardar Notificaciones
                    </button>
                </div>
            </div>
        `;
    },

    getPrintingTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <!-- MÓDULO: TICKETS / RECIBOS -->
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fas fa-receipt"></i> Tickets / Recibos - GP-5838 SERIES</span>
                        <span id="printer-status-badge" class="printer-status-badge disconnected">
                            <i class="fas fa-circle"></i> Desconectada
                        </span>
                    </h3>
                    
                    <!-- Información de la impresora -->
                    <div style="background: linear-gradient(135deg, rgba(26, 26, 26, 0.05) 0%, rgba(26, 26, 26, 0.02) 100%); border-left: 3px solid var(--color-primary); padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <div style="display: flex; align-items: start; gap: var(--spacing-sm); font-size: 11px; color: var(--color-text-secondary);">
                            <i class="fas fa-info-circle" style="color: var(--color-primary); margin-top: 2px;"></i>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;"><strong>GP-5838 SERIES</strong> - Impresora térmica 58mm</div>
                                <div style="font-size: 10px; line-height: 1.4;">
                                    <strong>Requisitos:</strong> Chrome o Edge (versión 89+), impresora encendida, cable USB conectado. 
                                    Al conectar, selecciona manualmente tu impresora en la lista de dispositivos.
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Estado de conexión -->
                    <div id="printer-connection-panel" style="background: var(--color-bg-secondary); border-radius: var(--radius-sm); padding: var(--spacing-md); margin-bottom: var(--spacing-md); border: 1px solid var(--color-border-light);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-sm);">
                            <div>
                                <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Estado de la Impresora</div>
                                <div id="printer-connection-info" style="font-size: 11px; color: var(--color-text-secondary);">No conectada</div>
                            </div>
                            <div style="display: flex; gap: var(--spacing-xs);">
                                <button class="btn-primary btn-sm" id="btn-connect-printer" onclick="window.Settings.connectPrinter()">
                                    <i class="fas fa-plug"></i> Conectar
                                </button>
                                <button class="btn-secondary btn-sm" id="btn-disconnect-printer" onclick="window.Settings.disconnectPrinter()" style="display: none;">
                                    <i class="fas fa-unlink"></i> Desconectar
                                </button>
                            </div>
                        </div>
                        <div id="printer-last-activity" style="font-size: 10px; color: var(--color-text-tertiary);">
                            Última actividad: -
                        </div>
                    </div>

                    <!-- Configuración en dos columnas -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
                        <!-- Columna izquierda: Configuración de Hardware -->
                        <div>
                            <div style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); padding-bottom: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light);">
                                <i class="fas fa-cog"></i> Hardware
                            </div>
                            <div class="form-group">
                                <label>Modelo de Impresora</label>
                                <select id="setting-printer-model" class="form-select" onchange="window.Settings.onPrinterModelChange()">
                                    <option value="GP-5838">GP-5838 SERIES (Recomendado)</option>
                                    <option value="GP-5830">GP-5830 Series</option>
                                    <option value="EC-58110">EC Line 58110</option>
                                    <option value="GP-5830II">GP-5830II</option>
                                    <option value="custom">Personalizada</option>
                                </select>
                            </div>
                            <div class="form-group" id="printer-name-custom" style="display: none;">
                                <label>Nombre de Impresora (Personalizada)</label>
                                <input type="text" id="setting-printer-name" class="form-input" placeholder="Ej: EC Line 58110">
                            </div>
                            <div class="form-group" id="printer-port-info" style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-xs); font-size: 10px; color: var(--color-text-secondary); border-left: 3px solid var(--color-border);">
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                    <i class="fas fa-usb"></i> 
                                    <span id="printer-port-status" style="font-weight: 600;">Puerto USB: No conectado</span>
                                </div>
                                <div style="margin-top: 6px; padding: 6px; background: rgba(26, 26, 26, 0.05); border-radius: var(--radius-xs); font-size: 9px; color: var(--color-text-tertiary); line-height: 1.4;">
                                    <i class="fas fa-info-circle"></i> <strong>Consejo:</strong> Al hacer clic en "Conectar", se abrirá una ventana para seleccionar tu impresora. Busca "GP-5838" o cualquier puerto USB (como USB004). Si no aparece, verifica que la impresora esté encendida y el cable USB bien conectado.
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Velocidad de Comunicación (Baud Rate)</label>
                                <select id="setting-printer-baud" class="form-select">
                                    <option value="9600">9600 baud (Recomendado)</option>
                                    <option value="19200">19200 baud</option>
                                    <option value="38400">38400 baud</option>
                                    <option value="57600">57600 baud</option>
                                    <option value="115200">115200 baud</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Ancho de Papel</label>
                                <select id="setting-printer-width" class="form-select">
                                    <option value="58">58mm (32 caracteres)</option>
                                    <option value="80">80mm (48 caracteres)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Densidad de Impresión</label>
                                <select id="setting-printer-density" class="form-select">
                                    <option value="low">Baja (Ahorra tinta)</option>
                                    <option value="medium" selected>Media</option>
                                    <option value="high">Alta (Mejor calidad)</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- Columna derecha: Configuración de Ticket -->
                        <div>
                            <div style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); padding-bottom: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light);">
                                <i class="fas fa-receipt"></i> Formato de Ticket
                            </div>
                            <div class="form-group">
                                <label>Estilo de Ticket</label>
                                <select id="setting-ticket-format" class="form-select">
                                    <option value="standard">Estándar - Completo</option>
                                    <option value="compact">Compacto - Resumido</option>
                                    <option value="detailed">Detallado - Con descripción</option>
                                    <option value="minimal">Mínimo - Solo totales</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Copias por Venta</label>
                                <select id="setting-ticket-copies" class="form-select">
                                    <option value="1">1 copia</option>
                                    <option value="2">2 copias</option>
                                    <option value="3">3 copias</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Corte de Papel</label>
                                <select id="setting-paper-cut" class="form-select">
                                    <option value="full">Corte completo</option>
                                    <option value="partial">Corte parcial</option>
                                    <option value="none">Sin corte</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Líneas de Avance Después del Corte</label>
                                <input type="number" id="setting-feed-lines" class="form-input" value="3" min="0" max="10">
                            </div>
                        </div>
                    </div>

                    <!-- Opciones adicionales -->
                    <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                        <div style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                            <i class="fas fa-sliders-h"></i> Opciones del Ticket
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--spacing-sm);">
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-print-logo" checked>
                                <span><i class="fas fa-image"></i> Imprimir Logo</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-print-barcode">
                                <span><i class="fas fa-barcode"></i> Código de Barras</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-print-qr">
                                <span><i class="fas fa-qrcode"></i> Código QR</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-auto-print" checked>
                                <span><i class="fas fa-magic"></i> Auto-imprimir</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-print-footer" checked>
                                <span><i class="fas fa-comment"></i> Pie de Página</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); cursor: pointer; font-size: 11px;">
                                <input type="checkbox" id="setting-print-duplicate">
                                <span><i class="fas fa-copy"></i> Copia Cliente</span>
                            </label>
                        </div>
                    </div>

                    <!-- Personalización del encabezado -->
                    <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                        <div style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                            <i class="fas fa-heading"></i> Personalización del Ticket
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md);">
                            <div class="form-group">
                                <label>Nombre del Negocio</label>
                                <input type="text" id="setting-business-name" class="form-input" value="OPAL & CO" placeholder="Nombre de tu negocio">
                            </div>
                            <div class="form-group">
                                <label>Teléfono</label>
                                <input type="text" id="setting-business-phone" class="form-input" placeholder="+52 123 456 7890">
                            </div>
                            <div class="form-group" style="grid-column: span 2;">
                                <label>Dirección</label>
                                <input type="text" id="setting-business-address" class="form-input" placeholder="Dirección del negocio">
                            </div>
                            <div class="form-group" style="grid-column: span 2;">
                                <label>Mensaje de Pie de Página</label>
                                <textarea id="setting-ticket-footer" class="form-textarea" rows="2" placeholder="Ej: ¡Gracias por su compra! Visítenos pronto.">Gracias por su compra</textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Botones de acción -->
                    <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light); display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                        <button class="btn-secondary btn-sm" onclick="window.Settings.testPrinter()" style="flex: 1;">
                            <i class="fas fa-print"></i> Imprimir Prueba
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.previewTicket()" style="flex: 1;">
                            <i class="fas fa-eye"></i> Vista Previa
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.resetPrinterSettings()" style="flex: 1;">
                            <i class="fas fa-undo"></i> Restablecer
                        </button>
                        <button class="btn-primary btn-sm" onclick="window.Settings.savePrinterSettings()" style="flex: 1;">
                            <i class="fas fa-save"></i> Guardar Configuración de Tickets
                        </button>
                    </div>
                </div>

                <!-- MÓDULO: ETIQUETAS DE JOYAS -->
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); border-left: 4px solid #ff6b9d;">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: var(--spacing-xs);">
                        <i class="fas fa-gem" style="color: #ff6b9d;"></i> Etiquetas de Joyas - RIEBEC RT-320-PB
                    </h3>
                    
                    <div style="background: linear-gradient(135deg, rgba(255, 107, 157, 0.1) 0%, rgba(255, 107, 157, 0.05) 100%); border-left: 3px solid #ff6b9d; padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <div style="display: flex; align-items: start; gap: var(--spacing-sm); font-size: 11px; color: var(--color-text-secondary);">
                            <i class="fas fa-info-circle" style="color: #ff6b9d; margin-top: 2px;"></i>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px; color: var(--color-text-primary);"><strong>RIEBEC RT-320-PB</strong> - Impresora de etiquetas 63x11mm</div>
                                <div style="font-size: 10px; line-height: 1.4;">
                                    Configura libremente la posición del código de barras y nombre del producto en la etiqueta de joya.
                                    <br><strong>Tamaño de etiqueta:</strong> 63mm x 11mm (puedes posicionar elementos en toda la etiqueta).
                                    <br><strong>Uso:</strong> Sistema independiente de tickets. Configura una vez y usa desde Inventario.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="jewelry-label-status" style="background: var(--color-bg-secondary); border-radius: var(--radius-sm); padding: var(--spacing-md); margin-bottom: var(--spacing-md); border: 1px solid var(--color-border-light);">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Estado de la Plantilla</div>
                                <div id="jewelry-template-status-text" style="font-size: 11px; color: var(--color-text-secondary);">No configurada</div>
                            </div>
                            <button class="btn-primary btn-sm" onclick="window.Settings.configureJewelryLabel()">
                                <i class="fas fa-cog"></i> Configurar Etiqueta
                            </button>
                        </div>
                    </div>

                    <div style="background: #fff3cd; padding: 12px; border-radius: var(--radius-md); margin-bottom: var(--spacing-md); border-left: 4px solid #ffc107;">
                        <p style="margin: 0; font-size: 12px; color: #856404;">
                            <i class="fas fa-lightbulb"></i> 
                            <strong>Consejo:</strong> Configura la plantilla una vez y luego usa el botón <i class="fas fa-gem"></i> "Etiqueta Joya" en el módulo de Inventario para imprimir directamente.
                        </p>
                    </div>

                    <div style="display: flex; gap: var(--spacing-sm); flex-wrap: wrap; margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                        <button class="btn-secondary btn-sm" onclick="window.Settings.configureJewelryLabel()" style="flex: 1;">
                            <i class="fas fa-edit"></i> Editar Plantilla
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.testJewelryLabel()" style="flex: 1;">
                            <i class="fas fa-print"></i> Imprimir Prueba
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    getSyncTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-sync"></i> Configuración de Sincronización
                    </h3>
                    <div class="form-group">
                        <label>Google Client ID</label>
                        <input type="text" id="setting-google-client-id" class="form-input" placeholder="363340186026-xxxxx.apps.googleusercontent.com">
                        <small style="color: var(--color-text-secondary); font-size: 10px;">ID de cliente OAuth obtenido de Google Cloud Console</small>
                    </div>
                    <div class="form-group">
                        <label>Spreadsheet ID</label>
                        <input type="text" id="setting-spreadsheet-id" class="form-input" placeholder="1awlhCklyVlnYxhC3i6wMYhgDE...">
                        <small style="color: var(--color-text-secondary); font-size: 10px;">ID del spreadsheet de Google Sheets (de la URL del documento)</small>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="SyncManager.testGoogleAuth()" style="margin-top: 5px; width: 100%;">
                        <i class="fas fa-key"></i> Probar Autenticación
                    </button>
                    <div class="form-group">
                        <label>Sincronización Automática</label>
                        <select id="setting-auto-sync" class="form-select">
                            <option value="disabled">Deshabilitada</option>
                            <option value="5min">Cada 5 minutos</option>
                            <option value="15min">Cada 15 minutos</option>
                            <option value="30min">Cada 30 minutos</option>
                            <option value="1hour">Cada hora</option>
                        </select>
                    </div>
                    <button class="btn-primary" onclick="window.Settings.saveSyncSettings()" style="width: 100%;">
                        <i class="fas fa-save"></i> Guardar Configuración
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-history"></i> Estado de Sincronización
                    </h3>
                    <div id="sync-status-info" style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-sm);">
                        <div style="font-size: 11px; color: var(--color-text-secondary);">Cargando...</div>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.testSyncConnection()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                        <i class="fas fa-plug"></i> Probar Conexión
                    </button>
                    <button class="btn-primary btn-sm" onclick="window.Settings.forceSync()" style="width: 100%;">
                        <i class="fas fa-sync-alt"></i> Sincronizar Ahora
                    </button>
                </div>
            </div>
        `;
    },

    getFinancialTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-receipt"></i> Impuestos
                    </h3>
                    <div class="form-group">
                        <label>IVA (%)</label>
                        <input type="number" id="setting-tax-iva" class="form-input" step="0.01" value="16.00">
                    </div>
                    <div class="form-group">
                        <label>IEPS (%)</label>
                        <input type="number" id="setting-tax-ieps" class="form-input" step="0.01" value="0.00">
                    </div>
                    <div class="form-group">
                        <label>ISR (%)</label>
                        <input type="number" id="setting-tax-isr" class="form-input" step="0.01" value="0.00">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.saveTaxes()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-save"></i> Guardar Impuestos
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-exchange-alt"></i> Monedas y Tipo de Cambio
                    </h3>
                    <div style="margin-bottom: var(--spacing-sm); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); border-left: 2px solid var(--color-accent);">
                        <button class="btn-primary btn-sm" onclick="window.Settings.fetchExchangeRates()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-sync-alt"></i> Obtener Tipos de Cambio Actuales
                        </button>
                        <small style="color: var(--color-text-secondary); font-size: 9px;">
                            Obtiene automáticamente los tipos de cambio actuales de USD y CAD desde internet
                        </small>
                    </div>
                    <div class="form-group">
                        <label>Tipo de Cambio USD (MXN por USD)</label>
                        <input type="number" id="setting-exchange-usd" class="form-input" step="0.0001" value="20.00">
                    </div>
                    <div class="form-group">
                        <label>Tipo de Cambio CAD (MXN por CAD)</label>
                        <input type="number" id="setting-exchange-cad" class="form-input" step="0.0001" value="15.00">
                    </div>
                    <div style="margin-top: var(--spacing-sm); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 9px; color: var(--color-text-secondary);">
                        <strong>Última actualización:</strong> <span id="exchange-rates-timestamp">-</span>
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.saveExchangeRates()" style="width: 100%; margin-top: var(--spacing-sm);">
                        Guardar Tipos de Cambio
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-credit-card"></i> Comisiones Bancarias (con IVA incluido)
                    </h3>
                    <div style="margin-bottom: var(--spacing-sm); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 10px; color: var(--color-text-secondary);">
                        <i class="fas fa-info-circle"></i> Las comisiones se aplican automáticamente a los pagos con TPV (tarjeta). Los porcentajes ya incluyen IVA.
                    </div>
                    
                    <div style="margin-bottom: var(--spacing-md);">
                        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: var(--spacing-sm); color: var(--color-primary);">
                            <i class="fas fa-university"></i> Banamex
                        </h4>
                        <div class="form-group">
                            <label>Nacional (%)</label>
                            <input type="number" id="setting-bank-commission-banamex-national" class="form-input" step="0.01" value="2.32" min="0" max="100">
                            <small style="color: var(--color-text-secondary); font-size: 9px;">Comisión para tarjetas nacionales</small>
                        </div>
                        <div class="form-group">
                            <label>Internacional (%)</label>
                            <input type="number" id="setting-bank-commission-banamex-international" class="form-input" step="0.01" value="4.06" min="0" max="100">
                            <small style="color: var(--color-text-secondary); font-size: 9px;">Comisión para tarjetas internacionales</small>
                        </div>
                    </div>

                    <div style="margin-bottom: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                        <h4 style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: var(--spacing-sm); color: var(--color-primary);">
                            <i class="fas fa-university"></i> Santander
                        </h4>
                        <div class="form-group">
                            <label>Nacional (%)</label>
                            <input type="number" id="setting-bank-commission-santander-national" class="form-input" step="0.01" value="2.00" min="0" max="100">
                            <small style="color: var(--color-text-secondary); font-size: 9px;">Comisión para tarjetas nacionales</small>
                        </div>
                        <div class="form-group">
                            <label>Internacional (%)</label>
                            <input type="number" id="setting-bank-commission-santander-international" class="form-input" step="0.01" value="2.55" min="0" max="100">
                            <small style="color: var(--color-text-secondary); font-size: 9px;">Comisión para tarjetas internacionales</small>
                        </div>
                    </div>

                    <button class="btn-primary btn-sm" onclick="window.Settings.saveBankCommissions()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-save"></i> Guardar Comisiones Bancarias
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-percent"></i> Reglas de Comisión
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Configura las reglas de comisión para vendedores, guías y agencias
                    </p>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.manageCommissionRules()" style="width: 100%;">
                        <i class="fas fa-cog"></i> Gestionar Reglas de Comisión
                    </button>
                </div>
            </div>
        `;
    },

    getCatalogsTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-building"></i> Agencias
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Gestiona las agencias de turismo
                    </p>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.manageAgencies()" style="width: 100%;">
                        Gestionar Agencias
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-user-tag"></i> Vendedores
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Gestiona los vendedores del sistema
                    </p>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.manageSellers()" style="width: 100%;">
                        Gestionar Vendedores
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-suitcase"></i> Guías
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Gestiona los guías de turismo
                    </p>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.manageGuides()" style="width: 100%;">
                        Gestionar Guías
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); text-align: center;">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-store"></i> Sucursales
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Gestiona las sucursales
                    </p>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.manageBranches()" style="width: 100%;">
                        Gestionar Sucursales
                    </button>
                </div>
            </div>
        `;
    },

    getSecurityTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-lock"></i> Seguridad de PIN
                    </h3>
                    <div class="form-group">
                        <label>Longitud Mínima de PIN</label>
                        <input type="number" id="setting-pin-min-length" class="form-input" value="4" min="4" max="8">
                    </div>
                    <div class="form-group">
                        <label>Intentos Máximos de Login</label>
                        <input type="number" id="setting-max-login-attempts" class="form-input" value="5" min="3" max="10">
                    </div>
                    <div class="form-group">
                        <label>Tiempo de Bloqueo (minutos)</label>
                        <input type="number" id="setting-lockout-time" class="form-input" value="15" min="5" max="60">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.saveSecuritySettings()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Guardar Configuración
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-user-shield"></i> Permisos y Roles
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Gestiona los permisos del sistema
                    </p>
                    ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('settings.manage_permissions') ? `
                        <button class="btn-secondary btn-sm" onclick="window.Settings.managePermissions()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-users-cog"></i> Gestionar Permisos
                        </button>
                    ` : ''}
                    ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('settings.view_audit') ? `
                        <button class="btn-secondary btn-sm" onclick="window.Settings.viewAuditLog()" style="width: 100%;">
                            <i class="fas fa-history"></i> Ver Log de Auditoría
                        </button>
                    ` : ''}
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-key"></i> Cambiar Contraseña Maestra
                    </h3>
                    <div class="form-group">
                        <label>PIN Actual</label>
                        <input type="password" id="setting-current-pin" class="form-input" placeholder="Ingresa tu PIN actual">
                    </div>
                    <div class="form-group">
                        <label>Nuevo PIN</label>
                        <input type="password" id="setting-new-pin" class="form-input" placeholder="Nuevo PIN (mínimo 4 dígitos)">
                    </div>
                    <div class="form-group">
                        <label>Confirmar Nuevo PIN</label>
                        <input type="password" id="setting-confirm-pin" class="form-input" placeholder="Confirma el nuevo PIN">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.changeMasterPin()" style="width: 100%; margin-top: var(--spacing-xs);">
                        Cambiar PIN
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-building"></i> Código de Acceso de Empresa
                    </h3>
                    <p style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                        Este código se solicita antes del login. Solo usuarios autorizados pueden acceder al sistema.
                    </p>
                    <div class="form-group">
                        <label>Código Actual</label>
                        <input type="text" id="setting-current-company-code" class="form-input" placeholder="Código actual" readonly style="background: var(--color-bg-secondary);">
                    </div>
                    <div class="form-group">
                        <label>Nuevo Código</label>
                        <input type="password" id="setting-new-company-code" class="form-input" placeholder="Nuevo código de acceso">
                    </div>
                    <div class="form-group">
                        <label>Confirmar Nuevo Código</label>
                        <input type="password" id="setting-confirm-company-code" class="form-input" placeholder="Confirma el nuevo código">
                    </div>
                    <button class="btn-primary btn-sm" onclick="window.Settings.changeCompanyCode()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-save"></i> Cambiar Código
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.clearCompanyCodeCache()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-trash"></i> Limpiar Códigos Guardados
                    </button>
                </div>
            </div>
        `;
    },

    getSystemTab() {
        return `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-database"></i> Base de Datos
                    </h3>
                    <div id="db-stats" style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); margin-bottom: var(--spacing-sm); font-size: 11px;">
                        <div>Cargando estadísticas...</div>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.exportDatabase()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                        <i class="fas fa-download"></i> Exportar DB
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.importDatabase()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                        <i class="fas fa-upload"></i> Importar DB
                    </button>
                    <button class="btn-primary btn-sm" onclick="window.Settings.loadDemoData()" style="width: 100%; margin-bottom: var(--spacing-xs); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600; border: none;">
                        <i class="fas fa-database"></i> Cargar 20 Datos Demo
                    </button>
                    <button class="btn-danger btn-sm" onclick="window.Settings.clearMockData()" style="width: 100%; margin-bottom: var(--spacing-xs);">
                        <i class="fas fa-broom"></i> Limpiar Datos Mock (Solo Usuarios)
                    </button>
                    <button class="btn-danger btn-sm" onclick="window.Settings.clearDatabase()" style="width: 100%;">
                        <i class="fas fa-trash"></i> Limpiar DB Completa (Cuidado!)
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-check-circle"></i> Verificaciones y Validaciones
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                        <button class="btn-primary btn-sm" onclick="window.Settings.verifySettings()" style="width: 100%;">
                            <i class="fas fa-cog"></i> Verificar Configuraciones
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.verifyCatalogs('all')" style="width: 100%;">
                            <i class="fas fa-book"></i> Verificar Todos los Catálogos
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.verifyCatalogs('agencies')" style="width: 100%;">
                            <i class="fas fa-building"></i> Verificar Agencias
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.verifyCatalogs('sellers')" style="width: 100%;">
                            <i class="fas fa-user-tie"></i> Verificar Vendedores
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.verifyCatalogs('guides')" style="width: 100%;">
                            <i class="fas fa-user-shield"></i> Verificar Guías
                        </button>
                        <button class="btn-secondary btn-sm" onclick="window.Settings.verifyCatalogs('branches')" style="width: 100%;">
                            <i class="fas fa-map-marker-alt"></i> Verificar Sucursales
                        </button>
                        <button class="btn-primary btn-sm" onclick="window.Settings.validateMultiBranchSystem()" style="width: 100%; margin-top: var(--spacing-xs); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600; border: none;">
                            <i class="fas fa-check-double"></i> Validar Sistema Multisucursal
                        </button>
                    </div>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-history"></i> Historial de Configuración
                    </h3>
                    <div id="settings-history" style="max-height: 300px; overflow-y: auto; padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px;">
                        Cargando historial...
                    </div>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.loadSettingsHistory()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-sync"></i> Actualizar
                    </button>
                </div>

                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-info-circle"></i> Información del Sistema
                    </h3>
                    <div id="system-info" style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px;">
                        <div>Cargando información...</div>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.loadSystemInfo()" style="width: 100%; margin-top: var(--spacing-xs);">
                        <i class="fas fa-sync"></i> Actualizar
                    </button>
                </div>
            </div>
        `;
    },

    async loadSettings() {
        try {
            // Cargar todas las configuraciones
            const settings = await DB.getAll('settings') || [];
            const settingsMap = {};
            settings.forEach(s => {
                settingsMap[s.key] = s.value;
            });

            // Sincronización
            const googleClientIdEl = document.getElementById('setting-google-client-id');
            const spreadsheetIdEl = document.getElementById('setting-spreadsheet-id');
            if (googleClientIdEl && settingsMap.google_client_id) googleClientIdEl.value = settingsMap.google_client_id;
            if (spreadsheetIdEl && settingsMap.google_sheets_spreadsheet_id) spreadsheetIdEl.value = settingsMap.google_sheets_spreadsheet_id;

            // Tipos de cambio
            const exchangeUsdEl = document.getElementById('setting-exchange-usd');
            const exchangeCadEl = document.getElementById('setting-exchange-cad');
            if (exchangeUsdEl && settingsMap.exchange_rate_usd) exchangeUsdEl.value = settingsMap.exchange_rate_usd;
            if (exchangeCadEl && settingsMap.exchange_rate_cad) exchangeCadEl.value = settingsMap.exchange_rate_cad;
            
            const timestampEl = document.getElementById('exchange-rates-timestamp');
            if (timestampEl && settingsMap.exchange_rates_timestamp) {
                const timestamp = new Date(settingsMap.exchange_rates_timestamp);
                timestampEl.textContent = Utils.formatDate(timestamp, 'DD/MM/YYYY HH:mm');
            }

            // Impresión - Configuración Avanzada
            const printerNameEl = document.getElementById('setting-printer-name');
            const printerBaudEl = document.getElementById('setting-printer-baud');
            const printerWidthEl = document.getElementById('setting-printer-width');
            const printerDensityEl = document.getElementById('setting-printer-density');
            const ticketFormatEl = document.getElementById('setting-ticket-format');
            const ticketCopiesEl = document.getElementById('setting-ticket-copies');
            const paperCutEl = document.getElementById('setting-paper-cut');
            const feedLinesEl = document.getElementById('setting-feed-lines');
            
            // Opciones del ticket
            const printLogoEl = document.getElementById('setting-print-logo');
            const printBarcodeEl = document.getElementById('setting-print-barcode');
            const printQREl = document.getElementById('setting-print-qr');
            const autoPrintEl = document.getElementById('setting-auto-print');
            const printFooterEl = document.getElementById('setting-print-footer');
            const printDuplicateEl = document.getElementById('setting-print-duplicate');
            
            // Personalización
            const businessNameEl = document.getElementById('setting-business-name');
            const businessPhoneEl = document.getElementById('setting-business-phone');
            const businessAddressEl = document.getElementById('setting-business-address');
            const ticketFooterEl = document.getElementById('setting-ticket-footer');

            // Cargar valores
            if (printerNameEl && settingsMap.printer_name) printerNameEl.value = settingsMap.printer_name;
            if (printerBaudEl && settingsMap.printer_baud) printerBaudEl.value = settingsMap.printer_baud;
            if (printerWidthEl && settingsMap.printer_width) printerWidthEl.value = settingsMap.printer_width;
            if (printerDensityEl && settingsMap.printer_density) printerDensityEl.value = settingsMap.printer_density;
            if (ticketFormatEl && settingsMap.ticket_format) ticketFormatEl.value = settingsMap.ticket_format;
            if (ticketCopiesEl && settingsMap.ticket_copies) ticketCopiesEl.value = settingsMap.ticket_copies;
            if (paperCutEl && settingsMap.paper_cut) paperCutEl.value = settingsMap.paper_cut;
            if (feedLinesEl && settingsMap.feed_lines !== undefined) feedLinesEl.value = settingsMap.feed_lines;
            
            // Checkboxes
            if (printLogoEl) printLogoEl.checked = settingsMap.print_logo !== false;
            if (printBarcodeEl) printBarcodeEl.checked = settingsMap.print_barcode === true;
            if (printQREl) printQREl.checked = settingsMap.print_qr === true;
            if (autoPrintEl) autoPrintEl.checked = settingsMap.auto_print !== false;
            if (printFooterEl) printFooterEl.checked = settingsMap.print_footer !== false;
            if (printDuplicateEl) printDuplicateEl.checked = settingsMap.print_duplicate === true;
            
            // Personalización
            if (businessNameEl && settingsMap.business_name) businessNameEl.value = settingsMap.business_name;
            if (businessPhoneEl && settingsMap.business_phone) businessPhoneEl.value = settingsMap.business_phone;
            if (businessAddressEl && settingsMap.business_address) businessAddressEl.value = settingsMap.business_address;
            if (ticketFooterEl && settingsMap.ticket_footer) ticketFooterEl.value = settingsMap.ticket_footer;

            // Actualizar estado de conexión de impresora
            if (typeof Printer !== 'undefined') {
                this.updatePrinterStatus(Printer.connected);
                this.updatePrinterPortInfo();
            }

            // Cargar modelo de impresora guardado
            const printerModelEl = document.getElementById('setting-printer-model');
            if (printerModelEl && settingsMap.printer_model) {
                printerModelEl.value = settingsMap.printer_model;
                this.onPrinterModelChange();
            }

            // Impuestos
            const taxIvaEl = document.getElementById('setting-tax-iva');
            const taxIepsEl = document.getElementById('setting-tax-ieps');
            const taxIsrEl = document.getElementById('setting-tax-isr');
            if (taxIvaEl && settingsMap.tax_iva) taxIvaEl.value = settingsMap.tax_iva;
            if (taxIepsEl && settingsMap.tax_ieps) taxIepsEl.value = settingsMap.tax_ieps;
            if (taxIsrEl && settingsMap.tax_isr) taxIsrEl.value = settingsMap.tax_isr;

            // Comisiones Bancarias
            const banamexNationalEl = document.getElementById('setting-bank-commission-banamex-national');
            const banamexInternationalEl = document.getElementById('setting-bank-commission-banamex-international');
            const santanderNationalEl = document.getElementById('setting-bank-commission-santander-national');
            const santanderInternationalEl = document.getElementById('setting-bank-commission-santander-international');
            if (banamexNationalEl) banamexNationalEl.value = settingsMap.bank_commission_banamex_national || 2.32;
            if (banamexInternationalEl) banamexInternationalEl.value = settingsMap.bank_commission_banamex_international || 4.06;
            if (santanderNationalEl) santanderNationalEl.value = settingsMap.bank_commission_santander_national || 2.00;
            if (santanderInternationalEl) santanderInternationalEl.value = settingsMap.bank_commission_santander_international || 2.55;

            // Notificaciones
            const notifySalesEl = document.getElementById('setting-notify-sales');
            const notifyLowStockEl = document.getElementById('setting-notify-low-stock');
            const notifySyncEl = document.getElementById('setting-notify-sync');
            const lowStockThresholdEl = document.getElementById('setting-low-stock-threshold');
            if (notifySalesEl) notifySalesEl.checked = settingsMap.notify_sales !== false;
            if (notifyLowStockEl) notifyLowStockEl.checked = settingsMap.notify_low_stock !== false;
            if (notifySyncEl) notifySyncEl.checked = settingsMap.notify_sync !== false;
            if (lowStockThresholdEl && settingsMap.low_stock_threshold) lowStockThresholdEl.value = settingsMap.low_stock_threshold;

            // Apariencia
            const themeEl = document.getElementById('setting-theme');
            const languageEl = document.getElementById('setting-language');
            const dateFormatEl = document.getElementById('setting-date-format');
            if (themeEl && settingsMap.theme) themeEl.value = settingsMap.theme;
            if (languageEl && settingsMap.language) languageEl.value = settingsMap.language;
            if (dateFormatEl && settingsMap.date_format) dateFormatEl.value = settingsMap.date_format;

            // Seguridad
            const pinMinLengthEl = document.getElementById('setting-pin-min-length');
            const maxLoginAttemptsEl = document.getElementById('setting-max-login-attempts');
            const lockoutTimeEl = document.getElementById('setting-lockout-time');
            if (pinMinLengthEl && settingsMap.pin_min_length) pinMinLengthEl.value = settingsMap.pin_min_length;
            if (maxLoginAttemptsEl && settingsMap.max_login_attempts) maxLoginAttemptsEl.value = settingsMap.max_login_attempts;
            if (lockoutTimeEl && settingsMap.lockout_time) lockoutTimeEl.value = settingsMap.lockout_time;

            // Auto-sync
            const autoSyncEl = document.getElementById('setting-auto-sync');
            if (autoSyncEl && settingsMap.auto_sync) autoSyncEl.value = settingsMap.auto_sync;

            // Cargar información adicional según la pestaña activa
            const activeTab = document.querySelector('#settings-tabs .tab-btn.active')?.dataset.tab;
            if (activeTab === 'system') {
                await this.loadSystemInfo();
                await this.loadSettingsHistory();
                await this.loadDatabaseStats();
            }
            if (activeTab === 'sync') {
                await this.loadSyncStatus();
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    },

    async saveSyncSettings() {
        try {
            const googleClientIdInput = document.getElementById('setting-google-client-id');
            const spreadsheetIdInput = document.getElementById('setting-spreadsheet-id');
            const autoSyncSelect = document.getElementById('setting-auto-sync');

            if (!googleClientIdInput || !spreadsheetIdInput) {
                Utils.showNotification('Error: No se encontraron los campos de configuración', 'error');
                return;
            }

            const googleClientId = googleClientIdInput.value.trim();
            const spreadsheetId = spreadsheetIdInput.value.trim();
            const autoSync = autoSyncSelect?.value || 'disabled';

            if (!googleClientId || !spreadsheetId) {
                Utils.showNotification('El Google Client ID y Spreadsheet ID son requeridos', 'error');
                return;
            }

            await DB.put('settings', { key: 'google_client_id', value: googleClientId, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'google_sheets_spreadsheet_id', value: spreadsheetId, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'auto_sync', value: autoSync, updated_at: new Date().toISOString() });

            // Actualizar valores en SyncManager
            if (SyncManager) {
                SyncManager.googleClientId = googleClientId;
                SyncManager.spreadsheetId = spreadsheetId;
            }

            Utils.showNotification('Configuración de sincronización guardada correctamente', 'success');
        await this.loadSyncStatus();
        } catch (e) {
            console.error('Error guardando configuración de sincronización:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async fetchExchangeRates() {
        Utils.showNotification('Obteniendo tipos de cambio desde internet...', 'info');
        
        const rates = await Utils.fetchExchangeRates();
        
        if (rates) {
            document.getElementById('setting-exchange-usd').value = rates.usd;
            document.getElementById('setting-exchange-cad').value = rates.cad;
            document.getElementById('exchange-rates-timestamp').textContent = 
                Utils.formatDate(new Date(), 'DD/MM/YYYY HH:mm');
            
            // Guardar automáticamente en settings y en exchange_rates_daily
            await this.saveExchangeRates(rates.timestamp);
            
            // También guardar en exchange_rates_daily para persistencia por fecha
            if (typeof ExchangeRates !== 'undefined') {
                const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
                await ExchangeRates.saveExchangeRate(today, rates.usd, rates.cad);
            }
            
            Utils.showNotification(`Tipos de cambio actualizados: USD ${rates.usd}, CAD ${rates.cad}`, 'success');
        } else {
            Utils.showNotification('No se pudieron obtener los tipos de cambio. Verifica tu conexión a internet.', 'error');
        }
    },

    async saveExchangeRates(timestamp = null) {
        try {
            const usdInput = document.getElementById('setting-exchange-usd');
            const cadInput = document.getElementById('setting-exchange-cad');

            if (!usdInput || !cadInput) {
                Utils.showNotification('Error: No se encontraron los campos de tipos de cambio', 'error');
                return;
            }

            const usd = parseFloat(usdInput.value);
            const cad = parseFloat(cadInput.value);

            // Validaciones
            if (isNaN(usd) || usd <= 0 || usd > 1000) {
                Utils.showNotification('El tipo de cambio USD debe ser un número positivo menor a 1000', 'error');
                return;
            }

            if (isNaN(cad) || cad <= 0 || cad > 1000) {
                Utils.showNotification('El tipo de cambio CAD debe ser un número positivo menor a 1000', 'error');
            return;
        }

        await DB.put('settings', { key: 'exchange_rate_usd', value: usd, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'exchange_rate_cad', value: cad, updated_at: new Date().toISOString() });
        
        if (timestamp) {
            await DB.put('settings', { key: 'exchange_rates_timestamp', value: timestamp, updated_at: new Date().toISOString() });
        }

        // También guardar en exchange_rates_daily para persistencia por fecha
        if (typeof ExchangeRates !== 'undefined') {
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            await ExchangeRates.saveExchangeRate(today, usd, cad);
        } else {
            // Fallback: guardar directamente si ExchangeRates no está disponible
            localStorage.setItem('daily_exchange_rate', usd.toString());
        }

            // Verificar que se guardó correctamente
            const savedUsd = await DB.get('settings', 'exchange_rate_usd');
            const savedCad = await DB.get('settings', 'exchange_rate_cad');
            
            if (!savedUsd || savedUsd.value !== usd) {
                throw new Error('Error al guardar el tipo de cambio USD');
            }
            if (!savedCad || savedCad.value !== cad) {
                throw new Error('Error al guardar el tipo de cambio CAD');
        }

            Utils.showNotification(`Tipos de cambio guardados: USD ${usd}, CAD ${cad}`, 'success');
        } catch (e) {
            console.error('Error guardando tipos de cambio:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    generateToken() {
        const token = Utils.generateId() + '-' + Date.now().toString(36);
        document.getElementById('setting-sync-token').value = token;
        Utils.showNotification('Token generado', 'success');
    },

    async testPrinter() {
        try {
            // Guardar configuración antes de probar
            await this.savePrinterSettings();
            
            // Verificar si Printer está disponible
            if (typeof Printer === 'undefined') {
                Utils.showNotification('Módulo de impresora no disponible', 'error');
                return;
            }
            
            // Si está conectada, usar método directo
            if (Printer.connected) {
                await Printer.testPrint();
            } else {
                // Si no está conectada, crear un ticket de prueba completo y usar método fallback
                Utils.showNotification('Impresora no conectada. Usando método de impresión del navegador...', 'info');
                
                // Crear una venta de prueba completa para el ticket
                const testSale = {
                    id: 'test-' + Date.now(),
                    folio: 'TEST-001',
                    branch_id: 'default',
                    seller_id: null,
                    agency_id: null,
                    guide_id: null,
                    customer_id: null,
                    subtotal: 18500,
                    discount: 1850,
                    total: 16650,
                    currency: 'MXN',
                    status: 'completada',
                    created_at: new Date().toISOString()
                };
                
                // Crear items de prueba simulados
                const testItems = [
                    { id: 'item1', sale_id: testSale.id, item_id: 'test1', quantity: 1, price: 15000, discount: 0, subtotal: 15000, name: 'ANILLO ORO 18K DIAMANTE' },
                    { id: 'item2', sale_id: testSale.id, item_id: 'test2', quantity: 1, price: 3500, discount: 0, subtotal: 3500, name: 'COLLAR PLATA 925' }
                ];
                
                // Crear pagos de prueba simulados
                const testPayments = [
                    { id: 'pay1', sale_id: testSale.id, method_id: 'CASH_USD', amount: 800, currency: 'USD' },
                    { id: 'pay2', sale_id: testSale.id, method_id: 'TPV_VISA', amount: 650, currency: 'MXN' }
                ];
                
                // Obtener configuración
                let settings = {};
                try {
                    settings = await Printer.getPrinterSettings();
                } catch (e) {
                    settings = Printer.getDefaultSettings();
                }
                
                // Construir HTML del ticket de prueba
                const ticketHTML = Printer.buildTicketHTML(testSale, testItems, testPayments, { name: 'Tienda de Prueba' }, { name: 'Sistema' }, null, null, settings);
                
                // Usar iframe oculto para imprimir
                let iframe = document.getElementById('print-frame');
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = 'print-frame';
                    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
                    document.body.appendChild(iframe);
                }
                
                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(ticketHTML);
                doc.close();
                
                // Imprimir cuando esté listo
                const printWhenReady = () => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                        Utils.showNotification('Ticket de prueba enviado a impresora', 'success');
                    } catch (e) {
                        console.error('Error al imprimir:', e);
                        Utils.showNotification('Error al abrir diálogo de impresión', 'error');
                    }
                };
                
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                    printWhenReady();
                } else {
                    iframe.onload = printWhenReady;
                    setTimeout(printWhenReady, 500);
                }
            }
        } catch (e) {
            console.error('Error en prueba:', e);
            Utils.showNotification('Error al imprimir prueba: ' + e.message, 'error');
        }
    },

    async exportDatabase() {
        try {
            const stores = ['sales', 'inventory_items', 'customers', 'repairs', 'cost_entries', 'employees', 'users'];
            const exportData = {};

            for (const store of stores) {
                exportData[store] = await DB.getAll(store);
            }

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `backup_${Utils.formatDate(new Date(), 'YYYYMMDD_HHmmss')}.json`;
            link.click();

            Utils.showNotification('Base de datos exportada', 'success');
        } catch (e) {
            console.error('Error exporting database:', e);
            Utils.showNotification('Error al exportar', 'error');
        }
    },

    async importDatabase() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                for (const [storeName, records] of Object.entries(data)) {
                    for (const record of records) {
                        await DB.put(storeName, record);
                    }
                }

                Utils.showNotification('Base de datos importada', 'success');
                location.reload();
            } catch (e) {
                console.error('Error importing database:', e);
                Utils.showNotification('Error al importar', 'error');
            }
        };
        input.click();
    },

    async clearDatabase() {
        if (!await Utils.confirm('¿Estás seguro? Esto eliminará TODOS los datos. Esta acción no se puede deshacer.')) {
            return;
        }

        if (!await Utils.confirm('ÚLTIMA CONFIRMACIÓN: ¿Eliminar TODOS los datos?')) {
            return;
        }

        try {
            indexedDB.deleteDatabase(DB.dbName);
            Utils.showNotification('Base de datos limpiada. Recargando...', 'success');
            setTimeout(() => location.reload(), 2000);
        } catch (e) {
            console.error('Error clearing database:', e);
            Utils.showNotification('Error al limpiar', 'error');
        }
    },

    async saveTaxes() {
        try {
            const taxIvaInput = document.getElementById('setting-tax-iva');
            const taxIepsInput = document.getElementById('setting-tax-ieps');
            const taxIsrInput = document.getElementById('setting-tax-isr');

            if (!taxIvaInput || !taxIepsInput) {
                Utils.showNotification('Error: No se encontraron los campos de impuestos', 'error');
                return;
            }

            const taxIva = parseFloat(taxIvaInput.value);
            const taxIeps = parseFloat(taxIepsInput.value);
            const taxIsr = taxIsrInput ? parseFloat(taxIsrInput.value) || 0 : 0;

            // Validaciones
            if (isNaN(taxIva) || taxIva < 0 || taxIva > 100) {
                Utils.showNotification('El IVA debe ser un número entre 0 y 100', 'error');
                return;
            }

            if (isNaN(taxIeps) || taxIeps < 0 || taxIeps > 100) {
                Utils.showNotification('El IEPS debe ser un número entre 0 y 100', 'error');
                return;
            }

            if (taxIsrInput && (isNaN(taxIsr) || taxIsr < 0 || taxIsr > 100)) {
                Utils.showNotification('El ISR debe ser un número entre 0 y 100', 'error');
                return;
            }

            await DB.put('settings', { key: 'tax_iva', value: taxIva, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'tax_ieps', value: taxIeps, updated_at: new Date().toISOString() });
            if (taxIsrInput) {
                await DB.put('settings', { key: 'tax_isr', value: taxIsr, updated_at: new Date().toISOString() });
            }

            // Verificar que se guardó correctamente
            const savedIva = await DB.get('settings', 'tax_iva');
            if (!savedIva || savedIva.value !== taxIva) {
                throw new Error('Error al guardar el IVA');
            }

            Utils.showNotification('Impuestos guardados correctamente', 'success');
        } catch (e) {
            console.error('Error guardando impuestos:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async saveBankCommissions() {
        try {
            const banamexNational = parseFloat(document.getElementById('setting-bank-commission-banamex-national')?.value || 2.32);
            const banamexInternational = parseFloat(document.getElementById('setting-bank-commission-banamex-international')?.value || 4.06);
            const santanderNational = parseFloat(document.getElementById('setting-bank-commission-santander-national')?.value || 2.00);
            const santanderInternational = parseFloat(document.getElementById('setting-bank-commission-santander-international')?.value || 2.55);

            // Validaciones
            if (isNaN(banamexNational) || banamexNational < 0 || banamexNational > 100) {
                Utils.showNotification('La comisión Banamex Nacional debe ser un número entre 0 y 100', 'error');
                return;
            }
            if (isNaN(banamexInternational) || banamexInternational < 0 || banamexInternational > 100) {
                Utils.showNotification('La comisión Banamex Internacional debe ser un número entre 0 y 100', 'error');
                return;
            }
            if (isNaN(santanderNational) || santanderNational < 0 || santanderNational > 100) {
                Utils.showNotification('La comisión Santander Nacional debe ser un número entre 0 y 100', 'error');
                return;
            }
            if (isNaN(santanderInternational) || santanderInternational < 0 || santanderInternational > 100) {
                Utils.showNotification('La comisión Santander Internacional debe ser un número entre 0 y 100', 'error');
                return;
            }

            await DB.put('settings', { key: 'bank_commission_banamex_national', value: banamexNational, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'bank_commission_banamex_international', value: banamexInternational, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'bank_commission_santander_national', value: santanderNational, updated_at: new Date().toISOString() });
            await DB.put('settings', { key: 'bank_commission_santander_international', value: santanderInternational, updated_at: new Date().toISOString() });

            Utils.showNotification('Comisiones bancarias guardadas correctamente', 'success');
        } catch (e) {
            console.error('Error guardando comisiones bancarias:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async manageAgencies() {
        const agencies = await DB.getAll('catalog_agencies') || [];
        const body = `
            <div style="margin-bottom: var(--spacing-md);">
                <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                    <button class="btn-primary" onclick="window.Settings.addAgency()">
                        <i class="fas fa-plus"></i> Agregar Agencia
                    </button>
                    <button class="btn-secondary" onclick="window.Settings.verifyCatalogs('agencies')">
                        <i class="fas fa-check-circle"></i> Verificar Datos
                    </button>
            </div>
                <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                    <input type="text" id="agency-search-input" class="form-input" placeholder="Buscar por nombre..." 
                        onkeyup="window.Settings.filterAgencies(this.value)">
                </div>
                <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterAgencies('', 'all')" style="flex: 1;">
                        Todas (${agencies.length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterAgencies('', 'active')" style="flex: 1;">
                        Activas (${agencies.filter(a => a.active).length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterAgencies('', 'inactive')" style="flex: 1;">
                        Inactivas (${agencies.filter(a => !a.active).length})
                    </button>
                </div>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                <table class="cart-table" id="agencies-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>ID</th>
                            <th>Código Barras</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="agencies-tbody">
                        ${agencies.map(agency => `
                            <tr data-agency-id="${agency.id}" data-agency-active="${agency.active}">
                                <td><strong>${agency.name || 'Sin nombre'}</strong></td>
                                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${agency.id}</small></td>
                                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${agency.barcode || 'N/A'}</small></td>
                                <td><span class="status-badge status-${agency.active ? 'disponible' : 'vendida'}">${agency.active ? 'Activa' : 'Inactiva'}</span></td>
                                <td style="white-space: nowrap;">
                                    <button class="btn-secondary btn-sm" onclick="window.Settings.editAgency('${agency.id}')">
                                        <i class="fas fa-edit"></i> Editar
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                        ${agencies.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay agencias registradas</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
        UI.showModal('Gestionar Agencias', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        
        // Guardar referencia para filtros
        window.Settings.currentAgencies = agencies;
    },

    filterAgencies(searchTerm = '', statusFilter = 'all') {
        const tbody = document.getElementById('agencies-tbody');
        if (!tbody || !window.Settings.currentAgencies) return;

        const agencies = window.Settings.currentAgencies;
        const search = searchTerm.toLowerCase().trim();
        
        const filtered = agencies.filter(agency => {
            const matchesSearch = !search || 
                (agency.name && agency.name.toLowerCase().includes(search)) ||
                (agency.id && agency.id.toLowerCase().includes(search)) ||
                (agency.barcode && agency.barcode.toLowerCase().includes(search));
            
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'active' && agency.active) ||
                (statusFilter === 'inactive' && !agency.active);
            
            return matchesSearch && matchesStatus;
        });

        tbody.innerHTML = filtered.map(agency => `
            <tr data-agency-id="${agency.id}" data-agency-active="${agency.active}">
                <td><strong>${agency.name || 'Sin nombre'}</strong></td>
                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${agency.id}</small></td>
                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${agency.barcode || 'N/A'}</small></td>
                <td><span class="status-badge status-${agency.active ? 'disponible' : 'vendida'}">${agency.active ? 'Activa' : 'Inactiva'}</span></td>
                <td style="white-space: nowrap;">
                    <button class="btn-secondary btn-sm" onclick="window.Settings.editAgency('${agency.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },

    async addAgency() {
        const body = `
            <form id="agency-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre de la Agencia *</label>
                    <input type="text" id="agency-name-input" class="form-input" required 
                        placeholder="Ej: AGENCIA DE VIAJES SA" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="agency-active-input" checked>
                        <span>Agencia activa</span>
                    </label>
                </div>
            </form>
        `;
        
        UI.showModal('Nueva Agencia', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveAgency() }
        ]);
        
        // Focus en el input
        setTimeout(() => {
            document.getElementById('agency-name-input')?.focus();
        }, 100);
    },

    async saveAgency(agencyId = null) {
        const form = document.getElementById('agency-form');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const nameInput = document.getElementById('agency-name-input');
        const activeInput = document.getElementById('agency-active-input');
        
        if (!nameInput || !nameInput.value.trim()) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        try {
            const name = nameInput.value.trim().toUpperCase();
            
            // Verificar duplicados (solo si no es edición)
            if (!agencyId) {
                const existing = await DB.getAll('catalog_agencies') || [];
                const duplicate = existing.find(a => a.name === name);
                if (duplicate) {
                    Utils.showNotification('Ya existe una agencia con ese nombre', 'error');
                    return;
                }
            }

            const agency = agencyId ? await DB.get('catalog_agencies', agencyId) : {
            id: Utils.generateId(),
                created_at: new Date().toISOString()
            };

            if (!agency) {
                Utils.showNotification('Agencia no encontrada', 'error');
                return;
            }

            agency.name = name;
            agency.active = activeInput ? activeInput.checked : true;
            agency.updated_at = new Date().toISOString();
            
            // Generar código de barras automáticamente si no existe
            if (!agency.barcode || Utils.isBarcodeEmpty?.(agency.barcode)) {
                agency.barcode = Utils.generateAgencyBarcode?.(agency) || `AG${agency.id.substring(0, 6)}`;
            }

        await DB.put('catalog_agencies', agency);
        await SyncManager.addToQueue('catalog_agency', agency.id);
            Utils.showNotification(agencyId ? 'Agencia actualizada' : 'Agencia agregada', 'success');
            UI.closeModal();
        this.manageAgencies();
        } catch (e) {
            console.error('Error guardando agencia:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async editAgency(id) {
        const agency = await DB.get('catalog_agencies', id);
        if (!agency) {
            Utils.showNotification('Agencia no encontrada', 'error');
            return;
        }

        const body = `
            <form id="agency-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre de la Agencia *</label>
                    <input type="text" id="agency-name-input" class="form-input" required 
                        value="${agency.name || ''}" placeholder="Ej: AGENCIA DE VIAJES SA" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="agency-active-input" ${agency.active ? 'checked' : ''}>
                        <span>Agencia activa</span>
                    </label>
                </div>
                <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <strong>ID:</strong> ${agency.id}<br>
                    <strong>Código de Barras:</strong> ${agency.barcode || 'N/A'}
                </div>
            </form>
        `;
        
        UI.showModal('Editar Agencia', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveAgency(id) }
        ]);
        
        // Focus en el input
        setTimeout(() => {
            document.getElementById('agency-name-input')?.focus();
            document.getElementById('agency-name-input')?.select();
        }, 100);
    },

    async manageSellers() {
        const sellers = await DB.getAll('catalog_sellers') || [];
        const body = `
            <div style="margin-bottom: var(--spacing-md);">
                <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                    <button class="btn-primary" onclick="window.Settings.addSeller()">
                        <i class="fas fa-plus"></i> Agregar Vendedor
                    </button>
                    <button class="btn-secondary" onclick="window.Settings.verifyCatalogs('sellers')">
                        <i class="fas fa-check-circle"></i> Verificar Datos
                    </button>
            </div>
                <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                    <input type="text" id="seller-search-input" class="form-input" placeholder="Buscar por nombre..." 
                        onkeyup="window.Settings.filterSellers(this.value)">
                </div>
                <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterSellers('', 'all')" style="flex: 1;">
                        Todos (${sellers.length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterSellers('', 'active')" style="flex: 1;">
                        Activos (${sellers.filter(s => s.active).length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterSellers('', 'inactive')" style="flex: 1;">
                        Inactivos (${sellers.filter(s => !s.active).length})
                    </button>
                </div>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                <table class="cart-table" id="sellers-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>ID</th>
                            <th>Código Barras</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="sellers-tbody">
                        ${sellers.map(seller => `
                            <tr data-seller-id="${seller.id}" data-seller-active="${seller.active}">
                                <td><strong>${seller.name || 'Sin nombre'}</strong></td>
                                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${seller.id}</small></td>
                                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${seller.barcode || 'N/A'}</small></td>
                                <td><span class="status-badge status-${seller.active ? 'disponible' : 'vendida'}">${seller.active ? 'Activo' : 'Inactivo'}</span></td>
                                <td style="white-space: nowrap;">
                                    <button class="btn-secondary btn-sm" onclick="window.Settings.editSeller('${seller.id}')">
                                        <i class="fas fa-edit"></i> Editar
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                        ${sellers.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay vendedores registrados</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
        UI.showModal('Gestionar Vendedores', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        
        window.Settings.currentSellers = sellers;
    },

    filterSellers(searchTerm = '', statusFilter = 'all') {
        const tbody = document.getElementById('sellers-tbody');
        if (!tbody || !window.Settings.currentSellers) return;

        const sellers = window.Settings.currentSellers;
        const search = searchTerm.toLowerCase().trim();
        
        const filtered = sellers.filter(seller => {
            const matchesSearch = !search || 
                (seller.name && seller.name.toLowerCase().includes(search)) ||
                (seller.id && seller.id.toLowerCase().includes(search)) ||
                (seller.barcode && seller.barcode.toLowerCase().includes(search));
            
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'active' && seller.active) ||
                (statusFilter === 'inactive' && !seller.active);
            
            return matchesSearch && matchesStatus;
        });

        tbody.innerHTML = filtered.map(seller => `
            <tr data-seller-id="${seller.id}" data-seller-active="${seller.active}">
                <td><strong>${seller.name || 'Sin nombre'}</strong></td>
                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${seller.id}</small></td>
                <td><small style="color: var(--color-text-secondary); font-family: monospace;">${seller.barcode || 'N/A'}</small></td>
                <td><span class="status-badge status-${seller.active ? 'disponible' : 'vendida'}">${seller.active ? 'Activo' : 'Inactivo'}</span></td>
                <td style="white-space: nowrap;">
                    <button class="btn-secondary btn-sm" onclick="window.Settings.editSeller('${seller.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },

    async addSeller() {
        const body = `
            <form id="seller-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre del Vendedor *</label>
                    <input type="text" id="seller-name-input" class="form-input" required 
                        placeholder="Ej: JUAN PÉREZ" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="seller-active-input" checked>
                        <span>Vendedor activo</span>
                    </label>
                </div>
            </form>
        `;
        
        UI.showModal('Nuevo Vendedor', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveSeller() }
        ]);
        
        setTimeout(() => {
            document.getElementById('seller-name-input')?.focus();
        }, 100);
    },

    async saveSeller(sellerId = null) {
        const form = document.getElementById('seller-form');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const nameInput = document.getElementById('seller-name-input');
        const activeInput = document.getElementById('seller-active-input');
        
        if (!nameInput || !nameInput.value.trim()) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        try {
            const name = nameInput.value.trim().toUpperCase();
            
            if (!sellerId) {
                const existing = await DB.getAll('catalog_sellers') || [];
                const duplicate = existing.find(s => s.name === name);
                if (duplicate) {
                    Utils.showNotification('Ya existe un vendedor con ese nombre', 'error');
                    return;
                }
            }

            const seller = sellerId ? await DB.get('catalog_sellers', sellerId) : {
            id: Utils.generateId(),
                created_at: new Date().toISOString()
            };

            if (!seller) {
                Utils.showNotification('Vendedor no encontrado', 'error');
                return;
            }

            seller.name = name;
            seller.active = activeInput ? activeInput.checked : true;
            seller.updated_at = new Date().toISOString();
            
            if (!seller.barcode || Utils.isBarcodeEmpty?.(seller.barcode)) {
                seller.barcode = Utils.generateSellerBarcode?.(seller) || `SE${seller.id.substring(0, 6)}`;
            }

        await DB.put('catalog_sellers', seller);
        await SyncManager.addToQueue('catalog_seller', seller.id);
            Utils.showNotification(sellerId ? 'Vendedor actualizado' : 'Vendedor agregado', 'success');
            UI.closeModal();
        this.manageSellers();
        } catch (e) {
            console.error('Error guardando vendedor:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async editSeller(id) {
        const seller = await DB.get('catalog_sellers', id);
        if (!seller) {
            Utils.showNotification('Vendedor no encontrado', 'error');
            return;
        }

        const body = `
            <form id="seller-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre del Vendedor *</label>
                    <input type="text" id="seller-name-input" class="form-input" required 
                        value="${seller.name || ''}" placeholder="Ej: JUAN PÉREZ" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="seller-active-input" ${seller.active ? 'checked' : ''}>
                        <span>Vendedor activo</span>
                    </label>
                </div>
                <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <strong>ID:</strong> ${seller.id}<br>
                    <strong>Código de Barras:</strong> ${seller.barcode || 'N/A'}
                </div>
            </form>
        `;
        
        UI.showModal('Editar Vendedor', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveSeller(id) }
        ]);
        
        setTimeout(() => {
            document.getElementById('seller-name-input')?.focus();
            document.getElementById('seller-name-input')?.select();
        }, 100);
    },

    async manageGuides() {
        const guides = await DB.getAll('catalog_guides') || [];
        const agencies = await DB.getAll('catalog_agencies') || [];
        const body = `
            <div style="margin-bottom: var(--spacing-md);">
                <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                    <button class="btn-primary" onclick="window.Settings.addGuide()">
                        <i class="fas fa-plus"></i> Agregar Guía
                    </button>
                    <button class="btn-secondary" onclick="window.Settings.verifyCatalogs('guides')">
                        <i class="fas fa-check-circle"></i> Verificar Datos
                    </button>
            </div>
                <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                    <input type="text" id="guide-search-input" class="form-input" placeholder="Buscar por nombre o agencia..." 
                        onkeyup="window.Settings.filterGuides(this.value)">
                </div>
                <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterGuides('', 'all')" style="flex: 1;">
                        Todos (${guides.length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterGuides('', 'active')" style="flex: 1;">
                        Activos (${guides.filter(g => g.active).length})
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.Settings.filterGuides('', 'inactive')" style="flex: 1;">
                        Inactivos (${guides.filter(g => !g.active).length})
                    </button>
                </div>
            </div>
            <div style="max-height: 500px; overflow-y: auto;">
                <table class="cart-table" id="guides-table">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Agencia</th>
                            <th>ID</th>
                            <th>Código Barras</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="guides-tbody">
                        ${guides.map(guide => {
                            const agency = agencies.find(a => a.id === guide.agency_id);
                            return `
                                <tr data-guide-id="${guide.id}" data-guide-active="${guide.active}" data-agency-id="${guide.agency_id || ''}">
                                    <td><strong>${guide.name || 'Sin nombre'}</strong></td>
                                    <td>${agency?.name || 'Sin agencia'}</td>
                                    <td><small style="color: var(--color-text-secondary); font-family: monospace;">${guide.id}</small></td>
                                    <td><small style="color: var(--color-text-secondary); font-family: monospace;">${guide.barcode || 'N/A'}</small></td>
                                    <td><span class="status-badge status-${guide.active ? 'disponible' : 'vendida'}">${guide.active ? 'Activo' : 'Inactivo'}</span></td>
                                    <td style="white-space: nowrap;">
                                        <button class="btn-secondary btn-sm" onclick="window.Settings.editGuide('${guide.id}')">
                                            <i class="fas fa-edit"></i> Editar
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                        ${guides.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay guías registrados</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
        UI.showModal('Gestionar Guías', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        
        window.Settings.currentGuides = guides;
        window.Settings.currentGuidesAgencies = agencies;
    },

    filterGuides(searchTerm = '', statusFilter = 'all') {
        const tbody = document.getElementById('guides-tbody');
        if (!tbody || !window.Settings.currentGuides || !window.Settings.currentGuidesAgencies) return;

        const guides = window.Settings.currentGuides;
        const agencies = window.Settings.currentGuidesAgencies;
        const search = searchTerm.toLowerCase().trim();
        
        const filtered = guides.filter(guide => {
            const agency = agencies.find(a => a.id === guide.agency_id);
            const agencyName = agency?.name || '';
            
            const matchesSearch = !search || 
                (guide.name && guide.name.toLowerCase().includes(search)) ||
                agencyName.toLowerCase().includes(search) ||
                (guide.id && guide.id.toLowerCase().includes(search)) ||
                (guide.barcode && guide.barcode.toLowerCase().includes(search));
            
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'active' && guide.active) ||
                (statusFilter === 'inactive' && !guide.active);
            
            return matchesSearch && matchesStatus;
        });

        tbody.innerHTML = filtered.map(guide => {
            const agency = agencies.find(a => a.id === guide.agency_id);
            return `
                <tr data-guide-id="${guide.id}" data-guide-active="${guide.active}" data-agency-id="${guide.agency_id || ''}">
                    <td><strong>${guide.name || 'Sin nombre'}</strong></td>
                    <td>${agency?.name || 'Sin agencia'}</td>
                    <td><small style="color: var(--color-text-secondary); font-family: monospace;">${guide.id}</small></td>
                    <td><small style="color: var(--color-text-secondary); font-family: monospace;">${guide.barcode || 'N/A'}</small></td>
                    <td><span class="status-badge status-${guide.active ? 'disponible' : 'vendida'}">${guide.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td style="white-space: nowrap;">
                        <button class="btn-secondary btn-sm" onclick="window.Settings.editGuide('${guide.id}')">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },

    async addGuide() {
        const agencies = await DB.getAll('catalog_agencies') || [];
        
        if (agencies.length === 0) {
            Utils.showNotification('Debes crear al menos una agencia primero', 'error');
            return;
        }

        const body = `
            <form id="guide-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre del Guía *</label>
                    <input type="text" id="guide-name-input" class="form-input" required 
                        placeholder="Ej: CARLOS RAMÍREZ" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label>Agencia *</label>
                    <select id="guide-agency-input" class="form-select" required>
                        <option value="">Seleccionar agencia...</option>
                        ${agencies.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="guide-active-input" checked>
                        <span>Guía activo</span>
                    </label>
                </div>
            </form>
        `;
        
        UI.showModal('Nuevo Guía', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveGuide() }
        ]);
        
        setTimeout(() => {
            document.getElementById('guide-name-input')?.focus();
        }, 100);
    },

    async saveGuide(guideId = null) {
        const form = document.getElementById('guide-form');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const nameInput = document.getElementById('guide-name-input');
        const agencyInput = document.getElementById('guide-agency-input');
        const activeInput = document.getElementById('guide-active-input');
        
        if (!nameInput || !nameInput.value.trim()) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        if (!agencyInput || !agencyInput.value) {
            Utils.showNotification('Debes seleccionar una agencia', 'error');
            return;
        }

        try {
            const name = nameInput.value.trim().toUpperCase();
            const agencyId = agencyInput.value;
            
            // Verificar que la agencia existe
            const agency = await DB.get('catalog_agencies', agencyId);
            if (!agency) {
                Utils.showNotification('La agencia seleccionada no existe', 'error');
                return;
            }

            if (!guideId) {
                const existing = await DB.getAll('catalog_guides') || [];
                const duplicate = existing.find(g => g.name === name && g.agency_id === agencyId);
                if (duplicate) {
                    Utils.showNotification('Ya existe un guía con ese nombre en esta agencia', 'error');
                    return;
                }
            }

            const guide = guideId ? await DB.get('catalog_guides', guideId) : {
            id: Utils.generateId(),
                created_at: new Date().toISOString()
            };

            if (!guide) {
                Utils.showNotification('Guía no encontrado', 'error');
                return;
            }

            guide.name = name;
            guide.agency_id = agencyId;
            guide.active = activeInput ? activeInput.checked : true;
            guide.updated_at = new Date().toISOString();
            
            if (!guide.barcode || Utils.isBarcodeEmpty?.(guide.barcode)) {
                guide.barcode = Utils.generateGuideBarcode?.(guide) || `GU${guide.id.substring(0, 6)}`;
            }

        await DB.put('catalog_guides', guide);
        await SyncManager.addToQueue('catalog_guide', guide.id);
            Utils.showNotification(guideId ? 'Guía actualizado' : 'Guía agregado', 'success');
            UI.closeModal();
        this.manageGuides();
        } catch (e) {
            console.error('Error guardando guía:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async editGuide(id) {
        const guide = await DB.get('catalog_guides', id);
        if (!guide) {
            Utils.showNotification('Guía no encontrado', 'error');
            return;
        }

        const agencies = await DB.getAll('catalog_agencies') || [];

        const body = `
            <form id="guide-form" style="max-width: 500px;">
                <div class="form-group">
                    <label>Nombre del Guía *</label>
                    <input type="text" id="guide-name-input" class="form-input" required 
                        value="${guide.name || ''}" placeholder="Ej: CARLOS RAMÍREZ" maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">
                        El nombre será convertido a mayúsculas automáticamente
                    </small>
                </div>
                <div class="form-group">
                    <label>Agencia *</label>
                    <select id="guide-agency-input" class="form-select" required>
                        <option value="">Seleccionar agencia...</option>
                        ${agencies.map(a => `<option value="${a.id}" ${guide.agency_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="guide-active-input" ${guide.active ? 'checked' : ''}>
                        <span>Guía activo</span>
                    </label>
                </div>
                <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <strong>ID:</strong> ${guide.id}<br>
                    <strong>Código de Barras:</strong> ${guide.barcode || 'N/A'}
                </div>
            </form>
        `;
        
        UI.showModal('Editar Guía', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveGuide(id) }
        ]);
        
        setTimeout(() => {
            document.getElementById('guide-name-input')?.focus();
            document.getElementById('guide-name-input')?.select();
        }, 100);
    },

    async manageBranches() {
        const branches = await DB.getAll('catalog_branches') || [];
        const employees = await DB.getAll('employees') || [];
        
        // Contar empleados por sucursal
        const employeesByBranch = {};
        employees.forEach(emp => {
            if (emp.branch_id) {
                if (!employeesByBranch[emp.branch_id]) {
                    employeesByBranch[emp.branch_id] = [];
                }
                employeesByBranch[emp.branch_id].push(emp);
            }
        });
        
        const body = `
            <div style="margin-bottom: var(--spacing-md);">
                <div style="display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-sm); flex-wrap: wrap;">
                    <button class="btn-primary" onclick="window.Settings.addBranch()">
                        <i class="fas fa-plus"></i> Agregar Sucursal
                    </button>
                    <button class="btn-secondary" onclick="window.Settings.verifyCatalogs('branches')">
                        <i class="fas fa-check-circle"></i> Verificar Datos
                    </button>
                </div>
                <div class="form-group" style="margin-bottom: var(--spacing-sm);">
                    <input type="text" id="branch-search-input" class="form-input" placeholder="Buscar por nombre, dirección..." 
                        onkeyup="window.Settings.filterBranches(this.value)">
                </div>
                <div style="display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-sm);">
                    <button class="btn-secondary btn-sm active" data-filter="all" onclick="window.Settings.filterBranches('', 'all')" style="flex: 1;">
                        Todas (${branches.length})
                    </button>
                    <button class="btn-secondary btn-sm" data-filter="active" onclick="window.Settings.filterBranches('', 'active')" style="flex: 1;">
                        Activas (${branches.filter(b => b.active).length})
                    </button>
                    <button class="btn-secondary btn-sm" data-filter="inactive" onclick="window.Settings.filterBranches('', 'inactive')" style="flex: 1;">
                        Inactivas (${branches.filter(b => !b.active).length})
                    </button>
                </div>
            </div>
            <div style="max-height: 600px; overflow-y: auto;">
                <table class="cart-table" id="branches-table" style="width: 100%;">
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Dirección</th>
                            <th>Empleados</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="branches-tbody">
                        ${branches.map(branch => {
                            const branchEmployees = employeesByBranch[branch.id] || [];
                            return `
                            <tr data-branch-id="${branch.id}" data-branch-active="${branch.active}">
                                <td>
                                    <strong>${branch.name || 'Sin nombre'}</strong>
                                    <br><small style="color: var(--color-text-secondary); font-family: monospace; font-size: 9px;">ID: ${branch.id}</small>
                                </td>
                                <td>
                                    ${branch.address ? `<span>${branch.address}</span>` : '<span style="color: var(--color-text-secondary); font-style: italic;">Sin dirección</span>'}
                                </td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                                        <span class="status-badge status-info">${branchEmployees.length} empleado(s)</span>
                                        ${branchEmployees.length > 0 ? `
                                            <button class="btn-secondary btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.viewBranchEmployees) { window.Settings.viewBranchEmployees(id); } else { console.error('Settings.viewBranchEmployees no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Ver empleados">
                                                <i class="fas fa-users"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                                <td>
                                    <span class="status-badge status-${branch.active ? 'disponible' : 'vendida'}">${branch.active ? 'Activa' : 'Inactiva'}</span>
                                </td>
                                <td style="white-space: nowrap;">
                                    <button class="btn-secondary btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.editBranch) { window.Settings.editBranch(id); } else { console.error('Settings.editBranch no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-primary btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.assignEmployeesToBranch) { window.Settings.assignEmployeesToBranch(id); } else { console.error('Settings.assignEmployeesToBranch no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Asignar Empleados">
                                        <i class="fas fa-user-plus"></i>
                                    </button>
                                    ${branch.active ? `
                                        <button class="btn-danger btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.toggleBranchStatus) { window.Settings.toggleBranchStatus(id, false); } else { console.error('Settings.toggleBranchStatus no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Desactivar">
                                            <i class="fas fa-ban"></i>
                                        </button>
                                    ` : `
                                        <button class="btn-success btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.toggleBranchStatus) { window.Settings.toggleBranchStatus(id, true); } else { console.error('Settings.toggleBranchStatus no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Activar">
                                            <i class="fas fa-check"></i>
                                        </button>
                                    `}
                                </td>
                            </tr>
                        `;
                        }).join('')}
                        ${branches.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay sucursales registradas. <button class="btn-primary btn-sm" onclick="window.Settings.addBranch()" style="margin-top: var(--spacing-sm);">Crear Primera Sucursal</button></td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        `;
        UI.showModal('Gestionar Sucursales', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
        
        window.Settings.currentBranches = branches;
        window.Settings.currentEmployeesByBranch = employeesByBranch;
        
        // Configurar event listeners después de mostrar el modal para mayor robustez
        setTimeout(() => {
            // Event delegation para los botones de acciones
            const tbody = document.getElementById('branches-tbody');
            if (tbody) {
                tbody.addEventListener('click', async (e) => {
                    const button = e.target.closest('button');
                    if (!button) return;
                    
                    const row = button.closest('tr');
                    if (!row) return;
                    
                    const branchId = row.dataset.branchId;
                    if (!branchId) return;
                    
                    // Botón Editar
                    if (button.querySelector('.fa-edit')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Edit button clicked for branch:', branchId);
                        if (window.Settings && window.Settings.editBranch) {
                            await window.Settings.editBranch(branchId);
                        } else {
                            console.error('Settings.editBranch no disponible');
                            Utils.showNotification('Error: Función no disponible', 'error');
                        }
                        return;
                    }
                    
                    // Botón Asignar Empleados
                    if (button.querySelector('.fa-user-plus')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Assign employees button clicked for branch:', branchId);
                        if (window.Settings && window.Settings.assignEmployeesToBranch) {
                            await window.Settings.assignEmployeesToBranch(branchId);
                        } else {
                            console.error('Settings.assignEmployeesToBranch no disponible');
                            Utils.showNotification('Error: Función no disponible', 'error');
                        }
                        return;
                    }
                    
                    // Botón Ver Empleados
                    if (button.querySelector('.fa-users')) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('View employees button clicked for branch:', branchId);
                        if (window.Settings && window.Settings.viewBranchEmployees) {
                            await window.Settings.viewBranchEmployees(branchId);
                        } else {
                            console.error('Settings.viewBranchEmployees no disponible');
                            Utils.showNotification('Error: Función no disponible', 'error');
                        }
                        return;
                    }
                    
                    // Botón Toggle Status (ban/check)
                    if (button.querySelector('.fa-ban') || button.querySelector('.fa-check')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const isActive = button.querySelector('.fa-ban') ? false : true;
                        console.log('Toggle status button clicked for branch:', branchId, 'active:', isActive);
                        if (window.Settings && window.Settings.toggleBranchStatus) {
                            await window.Settings.toggleBranchStatus(branchId, isActive);
                        } else {
                            console.error('Settings.toggleBranchStatus no disponible');
                            Utils.showNotification('Error: Función no disponible', 'error');
                        }
                        return;
                    }
                });
            }
        }, 200);
    },

    filterBranches(searchTerm = '', statusFilter = 'all') {
        const tbody = document.getElementById('branches-tbody');
        if (!tbody || !window.Settings.currentBranches) return;

        const branches = window.Settings.currentBranches;
        const employeesByBranch = window.Settings.currentEmployeesByBranch || {};
        const search = searchTerm.toLowerCase().trim();
        
        // Actualizar botones de filtro activos
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === statusFilter) {
                btn.classList.add('active');
            }
        });
        
        const filtered = branches.filter(branch => {
            const matchesSearch = !search || 
                (branch.name && branch.name.toLowerCase().includes(search)) ||
                (branch.address && branch.address.toLowerCase().includes(search)) ||
                (branch.id && branch.id.toLowerCase().includes(search));
            
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'active' && branch.active) ||
                (statusFilter === 'inactive' && !branch.active);
            
            return matchesSearch && matchesStatus;
        });

        tbody.innerHTML = filtered.map(branch => {
            const branchEmployees = employeesByBranch[branch.id] || [];
            return `
            <tr data-branch-id="${branch.id}" data-branch-active="${branch.active}">
                <td>
                    <strong>${branch.name || 'Sin nombre'}</strong>
                    <br><small style="color: var(--color-text-secondary); font-family: monospace; font-size: 9px;">ID: ${branch.id}</small>
                </td>
                <td>
                    ${branch.address ? `<span>${branch.address}</span>` : '<span style="color: var(--color-text-secondary); font-style: italic;">Sin dirección</span>'}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <span class="status-badge status-info">${branchEmployees.length} empleado(s)</span>
                        ${branchEmployees.length > 0 ? `
                            <button class="btn-secondary btn-sm" onclick="window.Settings.viewBranchEmployees('${branch.id}')" title="Ver empleados">
                                <i class="fas fa-users"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${branch.active ? 'disponible' : 'vendida'}">${branch.active ? 'Activa' : 'Inactiva'}</span>
                </td>
                <td style="white-space: nowrap;">
                    <button class="btn-secondary btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.editBranch) { window.Settings.editBranch(id); } else { console.error('Settings.editBranch no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-primary btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.assignEmployeesToBranch) { window.Settings.assignEmployeesToBranch(id); } else { console.error('Settings.assignEmployeesToBranch no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Asignar Empleados">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    ${branch.active ? `
                        <button class="btn-danger btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.toggleBranchStatus) { window.Settings.toggleBranchStatus(id, false); } else { console.error('Settings.toggleBranchStatus no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Desactivar">
                            <i class="fas fa-ban"></i>
                        </button>
                    ` : `
                        <button class="btn-success btn-sm" onclick="(function(id) { if (window.Settings && window.Settings.toggleBranchStatus) { window.Settings.toggleBranchStatus(id, true); } else { console.error('Settings.toggleBranchStatus no disponible'); } })('${branch.id.replace(/'/g, "\\'")}')" title="Activar">
                            <i class="fas fa-check"></i>
                        </button>
                    `}
                </td>
            </tr>
        `;
        }).join('') || '<tr><td colspan="5" style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No se encontraron resultados</td></tr>';
    },

    async addBranch() {
        const body = `
            <form id="branch-form" style="max-width: 600px;">
                <div class="form-group">
                    <label>Nombre de la Sucursal *</label>
                    <input type="text" id="branch-name-input" class="form-input" required 
                        placeholder="Ej: Sucursal Centro, Tienda Plaza, etc." maxlength="100">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Nombre que aparecerá en todo el sistema</small>
                </div>
                <div class="form-group">
                    <label>Dirección (opcional)</label>
                    <textarea id="branch-address-input" class="form-textarea" rows="2" 
                        placeholder="Ej: Av. Principal #123, Col. Centro, Ciudad"></textarea>
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Dirección física de la sucursal</small>
                </div>
                <div class="form-group">
                    <label>Teléfono (opcional)</label>
                    <input type="text" id="branch-phone-input" class="form-input" 
                        placeholder="Ej: (999) 123-4567" maxlength="20">
                </div>
                
                <!-- Datos Empresariales -->
                <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 2px solid var(--color-border-light);">
                    <h4 style="font-size: 12px; font-weight: 600; margin-bottom: var(--spacing-sm); color: var(--color-primary);">
                        <i class="fas fa-building"></i> Datos Empresariales (Personalización)
                    </h4>
                    <small style="color: var(--color-text-secondary); font-size: 10px; display: block; margin-bottom: var(--spacing-sm);">
                        Estos datos se usarán en tickets, reportes y documentos generados para esta sucursal
                    </small>
                    
                    <div class="form-group">
                        <label>Nombre Comercial / Razón Social</label>
                        <input type="text" id="branch-business-name-input" class="form-input" 
                            placeholder="Ej: Opal & Co Sucursal Centro" maxlength="200">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Nombre que aparecerá en tickets y documentos</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Dirección Completa</label>
                        <textarea id="branch-business-address-input" class="form-textarea" rows="3" 
                            placeholder="Ej: Av. Principal #123, Col. Centro, CP 97000, Ciudad, Estado"></textarea>
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Dirección completa para documentos fiscales</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Teléfono de Contacto</label>
                        <input type="text" id="branch-business-phone-input" class="form-input" 
                            placeholder="Ej: +52 999 123 4567" maxlength="30">
                    </div>
                    
                    <div class="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" id="branch-business-email-input" class="form-input" 
                            placeholder="Ej: ventas@sucursal-centro.opal.com" maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label>RFC (Registro Federal de Contribuyentes)</label>
                        <input type="text" id="branch-business-rfc-input" class="form-input" 
                            placeholder="Ej: ABC123456789" maxlength="20">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Para facturación y documentos fiscales</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Pie de Página Personalizado</label>
                        <textarea id="branch-business-footer-input" class="form-textarea" rows="2" 
                            placeholder="Ej: ¡Gracias por su compra! Visítenos pronto."></textarea>
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Mensaje que aparecerá al final de tickets</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Logo (URL o Base64)</label>
                        <input type="text" id="branch-business-logo-input" class="form-input" 
                            placeholder="Ej: https://ejemplo.com/logo.png o data:image/png;base64,...">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">URL de imagen o datos en base64. Se usará en tickets y reportes.</small>
                        <button type="button" class="btn-secondary btn-sm" onclick="window.Settings.uploadBranchLogo()" style="width: 100%; margin-top: var(--spacing-xs);">
                            <i class="fas fa-upload"></i> Subir Logo
                        </button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="branch-active-input" checked>
                        <span>Sucursal activa</span>
                    </label>
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Las sucursales inactivas no aparecerán en los selectores</small>
                </div>
            </form>
        `;
        
        UI.showModal('Nueva Sucursal', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveBranch() }
        ]);
        
        setTimeout(() => {
            document.getElementById('branch-name-input')?.focus();
        }, 100);
    },

    async saveBranch(branchId = null) {
        const form = document.getElementById('branch-form');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const nameInput = document.getElementById('branch-name-input');
        const addressInput = document.getElementById('branch-address-input');
        const phoneInput = document.getElementById('branch-phone-input');
        const activeInput = document.getElementById('branch-active-input');
        
        // Datos empresariales
        const businessNameInput = document.getElementById('branch-business-name-input');
        const businessAddressInput = document.getElementById('branch-business-address-input');
        const businessPhoneInput = document.getElementById('branch-business-phone-input');
        const businessEmailInput = document.getElementById('branch-business-email-input');
        const businessRfcInput = document.getElementById('branch-business-rfc-input');
        const businessFooterInput = document.getElementById('branch-business-footer-input');
        const businessLogoInput = document.getElementById('branch-business-logo-input');
        
        if (!nameInput || !nameInput.value.trim()) {
            Utils.showNotification('El nombre es requerido', 'error');
            return;
        }

        try {
            const name = nameInput.value.trim();
            const address = addressInput?.value.trim() || '';
            const phone = phoneInput?.value.trim() || '';
            const active = activeInput ? activeInput.checked : true;
            
            // Datos empresariales
            const businessName = businessNameInput?.value.trim() || '';
            const businessAddress = businessAddressInput?.value.trim() || '';
            const businessPhone = businessPhoneInput?.value.trim() || '';
            const businessEmail = businessEmailInput?.value.trim() || '';
            const businessRfc = businessRfcInput?.value.trim() || '';
            const businessFooter = businessFooterInput?.value.trim() || '';
            const businessLogo = businessLogoInput?.value.trim() || '';
            
            // Validar email si se proporciona
            if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
                Utils.showNotification('El formato del correo electrónico no es válido', 'error');
                return;
            }
            
            // Validaciones estrictas
            if (name.length < 2) {
                Utils.showNotification('El nombre debe tener al menos 2 caracteres', 'error');
                return;
            }
            
            if (name.length > 100) {
                Utils.showNotification('El nombre es demasiado largo (máximo 100 caracteres)', 'error');
                return;
            }
            
            // Validar formato de teléfono si se proporciona
            if (phone && phone.length > 0) {
                const phoneRegex = /^[\d\s()+-]+$/;
                if (!phoneRegex.test(phone) || phone.length > 20) {
                    Utils.showNotification('El formato del teléfono no es válido', 'error');
                    return;
                }
            }
            
            // Verificar duplicados (excluyendo el actual si es edición)
            const existing = await DB.getAll('catalog_branches') || [];
            const duplicate = existing.find(b => 
                b.name.toLowerCase() === name.toLowerCase() && 
                (!branchId || b.id !== branchId)
            );
            if (duplicate) {
                Utils.showNotification('Ya existe una sucursal con ese nombre. Por favor, usa un nombre diferente.', 'error');
                return;
            }

            const branch = branchId ? await DB.get('catalog_branches', branchId) : {
                id: Utils.generateId(),
                created_at: new Date().toISOString()
            };

            if (branchId && !branch) {
                Utils.showNotification('Sucursal no encontrada', 'error');
                return;
            }

            // Guardar valores anteriores para rollback si es necesario
            const previousValues = branchId ? {
                name: branch.name,
                active: branch.active
            } : null;

            branch.name = name;
            branch.address = address;
            branch.phone = phone;
            branch.active = active;
            
            // Datos empresariales
            branch.business_name = businessName;
            branch.business_address = businessAddress;
            branch.business_phone = businessPhone;
            branch.business_email = businessEmail;
            branch.business_rfc = businessRfc.toUpperCase();
            branch.business_footer = businessFooter;
            branch.business_logo = businessLogo;
            
            branch.updated_at = new Date().toISOString();

            // Si se está desactivando, verificar que no haya dependencias críticas
            if (branchId && previousValues && previousValues.active && !active) {
                const employees = await DB.getAll('employees') || [];
                const branchEmployees = employees.filter(emp => emp.branch_id === branchId && emp.active);
                
                if (branchEmployees.length > 0) {
                    const confirmMsg = `Esta sucursal tiene ${branchEmployees.length} empleado(s) activo(s). ` +
                                     `Si la desactivas, los empleados no podrán iniciar sesión. ` +
                                     `¿Deseas continuar?`;
                    if (!await Utils.confirm(confirmMsg)) {
                        return;
                    }
                }
            }

            // Validar que el ID sea válido
            if (!branch.id || branch.id.length === 0) {
                Utils.showNotification('Error: ID de sucursal inválido', 'error');
                return;
            }

            await DB.put('catalog_branches', branch);
            
            // Log de auditoría
            console.log(`Branch ${branchId ? 'updated' : 'created'}:`, {
                id: branch.id,
                name: branch.name,
                active: branch.active,
                previousValues
            });
            
            // Sincronizar si está disponible
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('catalog_branch', branch.id);
            }
            
            Utils.showNotification(branchId ? 'Sucursal actualizada correctamente' : 'Sucursal agregada correctamente', 'success');
            UI.closeModal();
            await this.manageBranches();
        } catch (e) {
            console.error('Error guardando sucursal:', e);
            Utils.showNotification('Error al guardar: ' + e.message, 'error');
        }
    },

    async editBranch(id) {
        console.log('editBranch llamado con ID:', id);
        try {
            const branch = await DB.get('catalog_branches', id);
            if (!branch) {
                Utils.showNotification('Sucursal no encontrada', 'error');
                return;
            }

        const body = `
            <form id="branch-form" style="max-width: 600px;">
                <div class="form-group">
                    <label>Nombre de la Sucursal *</label>
                    <input type="text" id="branch-name-input" class="form-input" required 
                        value="${Utils.escapeHtml(branch.name || '')}" placeholder="Ej: Sucursal Centro" maxlength="100">
                </div>
                <div class="form-group">
                    <label>Dirección (opcional)</label>
                    <textarea id="branch-address-input" class="form-textarea" rows="2" 
                        placeholder="Ej: Av. Principal #123, Col. Centro, Ciudad">${Utils.escapeHtml(branch.address || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Teléfono (opcional)</label>
                    <input type="text" id="branch-phone-input" class="form-input" 
                        value="${Utils.escapeHtml(branch.phone || '')}" placeholder="Ej: (999) 123-4567" maxlength="20">
                </div>
                
                <!-- Datos Empresariales -->
                <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 2px solid var(--color-border-light);">
                    <h4 style="font-size: 12px; font-weight: 600; margin-bottom: var(--spacing-sm); color: var(--color-primary);">
                        <i class="fas fa-building"></i> Datos Empresariales (Personalización)
                    </h4>
                    <small style="color: var(--color-text-secondary); font-size: 10px; display: block; margin-bottom: var(--spacing-sm);">
                        Estos datos se usarán en tickets, reportes y documentos generados para esta sucursal
                    </small>
                    
                    <div class="form-group">
                        <label>Nombre Comercial / Razón Social</label>
                        <input type="text" id="branch-business-name-input" class="form-input" 
                            value="${Utils.escapeHtml(branch.business_name || '')}" placeholder="Ej: Opal & Co Sucursal Centro" maxlength="200">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Nombre que aparecerá en tickets y documentos</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Dirección Completa</label>
                        <textarea id="branch-business-address-input" class="form-textarea" rows="3" 
                            placeholder="Ej: Av. Principal #123, Col. Centro, CP 97000, Ciudad, Estado">${Utils.escapeHtml(branch.business_address || '')}</textarea>
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Dirección completa para documentos fiscales</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Teléfono de Contacto</label>
                        <input type="text" id="branch-business-phone-input" class="form-input" 
                            value="${Utils.escapeHtml(branch.business_phone || '')}" placeholder="Ej: +52 999 123 4567" maxlength="30">
                    </div>
                    
                    <div class="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" id="branch-business-email-input" class="form-input" 
                            value="${Utils.escapeHtml(branch.business_email || '')}" placeholder="Ej: ventas@sucursal-centro.opal.com" maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label>RFC (Registro Federal de Contribuyentes)</label>
                        <input type="text" id="branch-business-rfc-input" class="form-input" 
                            value="${Utils.escapeHtml(branch.business_rfc || '')}" placeholder="Ej: ABC123456789" maxlength="20">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Para facturación y documentos fiscales</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Pie de Página Personalizado</label>
                        <textarea id="branch-business-footer-input" class="form-textarea" rows="2" 
                            placeholder="Ej: ¡Gracias por su compra! Visítenos pronto.">${Utils.escapeHtml(branch.business_footer || '')}</textarea>
                        <small style="color: var(--color-text-secondary); font-size: 9px;">Mensaje que aparecerá al final de tickets</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Logo (URL o Base64)</label>
                        <input type="text" id="branch-business-logo-input" class="form-input" 
                            value="${Utils.escapeHtml(branch.business_logo || '')}" placeholder="Ej: https://ejemplo.com/logo.png o data:image/png;base64,...">
                        <small style="color: var(--color-text-secondary); font-size: 9px;">URL de imagen o datos en base64. Se usará en tickets y reportes.</small>
                        <button type="button" class="btn-secondary btn-sm" onclick="window.Settings.uploadBranchLogo()" style="width: 100%; margin-top: var(--spacing-xs);">
                            <i class="fas fa-upload"></i> Subir Logo
                        </button>
                        ${branch.business_logo ? `
                            <div style="margin-top: var(--spacing-xs); padding: var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs);">
                                <img src="${Utils.escapeHtml(branch.business_logo)}" alt="Logo" style="max-width: 100px; max-height: 50px; object-fit: contain;" onerror="this.style.display='none'">
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="checkbox" id="branch-active-input" ${branch.active ? 'checked' : ''}>
                        <span>Sucursal activa</span>
                    </label>
                </div>
                <div style="padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <strong>ID:</strong> ${branch.id}
                    <br><strong>Creada:</strong> ${Utils.formatDate(new Date(branch.created_at), 'DD/MM/YYYY HH:mm')}
                </div>
            </form>
        `;
        
        UI.showModal('Editar Sucursal', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveBranch(id) }
        ]);
        
        setTimeout(() => {
            document.getElementById('branch-name-input')?.focus();
            document.getElementById('branch-name-input')?.select();
        }, 100);
        } catch (e) {
            console.error('Error en editBranch:', e);
            Utils.showNotification('Error: ' + e.message, 'error');
        }
    },

    async toggleBranchStatus(branchId, active) {
        console.log('toggleBranchStatus llamado con ID:', branchId, 'active:', active);
        try {
            if (!branchId) {
                Utils.showNotification('ID de sucursal inválido', 'error');
                return;
            }

            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                Utils.showNotification('Sucursal no encontrada', 'error');
                return;
            }

            // Si ya está en el estado deseado, no hacer nada
            if (branch.active === active) {
                return;
            }

            // Si se está desactivando, verificar dependencias
            if (!active) {
                const employees = await DB.getAll('employees') || [];
                const branchEmployees = employees.filter(emp => emp.branch_id === branchId && emp.active);
                
                if (branchEmployees.length > 0) {
                    const confirmMsg = `⚠️ ADVERTENCIA: Esta sucursal tiene ${branchEmployees.length} empleado(s) activo(s).\n\n` +
                                     `Si la desactivas:\n` +
                                     `• Los empleados no podrán iniciar sesión\n` +
                                     `• Sus datos seguirán asociados a esta sucursal\n` +
                                     `• Deberás reasignarlos manualmente a otra sucursal\n\n` +
                                     `¿Deseas continuar con la desactivación?`;
                    
                    if (!await Utils.confirm(confirmMsg)) {
                        return;
                    }
                }

                // Verificar si hay ventas recientes (últimos 30 días)
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const sales = await DB.getAll('sales') || [];
                const recentSales = sales.filter(sale => 
                    sale.branch_id === branchId && 
                    new Date(sale.created_at) >= thirtyDaysAgo
                );
                
                if (recentSales.length > 0) {
                    const confirmMsg2 = `Esta sucursal tiene ${recentSales.length} venta(s) en los últimos 30 días.\n\n` +
                                      `¿Estás seguro de que deseas desactivarla?`;
                    if (!await Utils.confirm(confirmMsg2)) {
                        return;
                    }
                }
            }

            const previousActive = branch.active;
            branch.active = active;
            branch.updated_at = new Date().toISOString();
            
            await DB.put('catalog_branches', branch);
            
            // Log de auditoría
            console.log(`Branch status toggled:`, {
                id: branch.id,
                name: branch.name,
                previousActive,
                newActive: active
            });
            
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('catalog_branch', branch.id);
            }
            
            Utils.showNotification(`Sucursal ${active ? 'activada' : 'desactivada'} correctamente`, 'success');
            await this.manageBranches();
        } catch (e) {
            console.error('Error cambiando estado de sucursal:', e);
            Utils.showNotification('Error: ' + e.message, 'error');
        }
    },

    async assignEmployeesToBranch(branchId) {
        console.log('assignEmployeesToBranch llamado con ID:', branchId);
        try {
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                Utils.showNotification('Sucursal no encontrada', 'error');
                return;
            }

            const allEmployees = await DB.getAll('employees') || [];
            const allBranches = await DB.getAll('catalog_branches') || [];
            const branchesMap = {};
            allBranches.forEach(b => { branchesMap[b.id] = b.name; });
            
            // Filtrar empleados que tienen acceso a esta sucursal
            // Para admin y manager pueden tener múltiples (branch_ids), otros solo uno (branch_id)
            const currentEmployees = allEmployees.filter(emp => {
                if (emp.role === 'admin' || emp.role === 'manager') {
                    // Para admin/manager, usar branch_ids (array) si existe, o branch_id como fallback
                    const branchIds = emp.branch_ids || (emp.branch_id ? [emp.branch_id] : []);
                    return branchIds.includes(branchId);
                } else {
                    // Para otros roles, usar branch_id único
                    return emp.branch_id === branchId;
                }
            });
            
            // Empleados disponibles: los que NO están en esta sucursal
            const availableEmployees = allEmployees.filter(emp => {
                if (emp.role === 'admin' || emp.role === 'manager') {
                    const branchIds = emp.branch_ids || (emp.branch_id ? [emp.branch_id] : []);
                    return !branchIds.includes(branchId);
                } else {
                    return emp.branch_id !== branchId && (!emp.branch_id || emp.branch_id !== branchId);
                }
            });

            const body = `
                <div style="max-width: 700px;">
                    <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <strong>Sucursal:</strong> ${Utils.escapeHtml(branch.name)}
                    </div>
                    
                    <div style="margin-bottom: var(--spacing-md);">
                        <h4 style="font-size: 12px; font-weight: 600; margin-bottom: var(--spacing-sm);">Empleados Actuales (${currentEmployees.length})</h4>
                        <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); padding: var(--spacing-sm);">
                            ${currentEmployees.length > 0 ? `
                                <div style="display: grid; gap: var(--spacing-xs);">
                                    ${currentEmployees.map(emp => `
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs); background: var(--color-bg-card); border-radius: var(--radius-xs);">
                                            <span>${Utils.escapeHtml(emp.name || 'Sin nombre')} <small style="color: var(--color-text-secondary);">(${emp.role || 'N/A'})</small></span>
                                            <button class="btn-danger btn-xs" onclick="window.Settings.removeEmployeeFromBranch('${emp.id}', '${branchId}')" title="Quitar">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p style="color: var(--color-text-secondary); text-align: center; padding: var(--spacing-md);">No hay empleados asignados</p>'}
                        </div>
                    </div>

                    <div>
                        <h4 style="font-size: 12px; font-weight: 600; margin-bottom: var(--spacing-sm);">Asignar Empleados</h4>
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); padding: var(--spacing-sm);">
                            ${availableEmployees.length > 0 ? `
                                <div style="display: grid; gap: var(--spacing-xs);">
                                    ${availableEmployees.map(emp => {
                                        // Para admin/manager, mostrar todas sus sucursales
                                        let currentBranchesText = '';
                                        if (emp.role === 'admin' || emp.role === 'manager') {
                                            const branchIds = emp.branch_ids || (emp.branch_id ? [emp.branch_id] : []);
                                            if (branchIds.length > 0) {
                                                const branchNames = branchIds.map(id => branchesMap[id]).filter(Boolean);
                                                currentBranchesText = branchNames.length > 0 
                                                    ? ` • Actualmente en: ${branchNames.join(', ')}` 
                                                    : '';
                                            } else {
                                                currentBranchesText = ' • Sin asignar';
                                            }
                                        } else {
                                            const currentBranchId = emp.branch_id;
                                            const currentBranchName = currentBranchId ? branchesMap[currentBranchId] : null;
                                            currentBranchesText = currentBranchName ? ` • Actualmente en: ${currentBranchName}` : ' • Sin asignar';
                                        }
                                        
                                        const isMultiBranch = emp.role === 'admin' || emp.role === 'manager';
                                        return `
                                            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs); background: var(--color-bg-card); border-radius: var(--radius-xs);">
                                                <div>
                                                    <span>${Utils.escapeHtml(emp.name || 'Sin nombre')} ${isMultiBranch ? '<span style="color: var(--color-primary); font-size: 9px;">(Puede múltiples)</span>' : ''}</span>
                                                    <small style="color: var(--color-text-secondary); display: block; font-size: 10px;">
                                                        ${emp.role || 'N/A'}${currentBranchesText}
                                                    </small>
                                                </div>
                                                <button class="btn-primary btn-xs" onclick="window.Settings.addEmployeeToBranch('${emp.id}', '${branchId}')" title="Asignar">
                                                    <i class="fas fa-plus"></i> ${isMultiBranch ? 'Agregar' : 'Asignar'}
                                                </button>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            ` : '<p style="color: var(--color-text-secondary); text-align: center; padding: var(--spacing-md);">Todos los empleados ya están asignados a esta u otra sucursal</p>'}
                        </div>
                    </div>
                </div>
            `;

            UI.showModal(`Asignar Empleados - ${Utils.escapeHtml(branch.name)}`, body, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);

            // Guardar referencia para las funciones internas
            window.Settings.currentAssignBranchId = branchId;
        } catch (e) {
            console.error('Error mostrando asignación de empleados:', e);
            Utils.showNotification('Error: ' + e.message, 'error');
        }
    },

    async addEmployeeToBranch(employeeId, branchId) {
        try {
            // Validaciones estrictas
            if (!employeeId || !branchId) {
                Utils.showNotification('Datos inválidos para asignación', 'error');
                return;
            }

            // Verificar que la sucursal exista y esté activa
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                Utils.showNotification('Sucursal no encontrada. La operación no puede continuar.', 'error');
                return;
            }

            if (!branch.active) {
                const confirm = await Utils.confirm(
                    `La sucursal "${branch.name}" está desactivada.\n\n` +
                    `Si asignas el empleado, no podrá iniciar sesión hasta que se active la sucursal.\n\n` +
                    `¿Deseas continuar?`
                );
                if (!confirm) return;
            }

            // Verificar que el empleado exista
            const employee = await DB.get('employees', employeeId);
            if (!employee) {
                Utils.showNotification('Empleado no encontrado', 'error');
                return;
            }

            // Determinar si es admin o manager (pueden tener múltiples sucursales)
            const isMultiBranch = employee.role === 'admin' || employee.role === 'manager';
            
            // Validar que el empleado esté activo
            if (!employee.active) {
                const confirm = await Utils.confirm(
                    `El empleado "${employee.name}" está inactivo.\n\n` +
                    `¿Deseas asignarlo a la sucursal de todas formas?`
                );
                if (!confirm) return;
            }

            // Asignar sucursal según el rol
            if (isMultiBranch) {
                // Admin/Manager: agregar a branch_ids (múltiples sucursales)
                if (!employee.branch_ids) {
                    // Si no tiene branch_ids, crear array desde branch_id si existe
                    employee.branch_ids = employee.branch_id ? [employee.branch_id] : [];
                    // Mantener branch_id para compatibilidad, pero usar branch_ids como fuente principal
                }
                
                // Si ya está en esta sucursal, no hacer nada
                if (employee.branch_ids.includes(branchId)) {
                    Utils.showNotification(`El empleado ya está asignado a "${branch.name}"`, 'info');
                    return;
                }
                
                // Agregar la nueva sucursal
                employee.branch_ids.push(branchId);
                // También actualizar branch_id con la primera sucursal (para compatibilidad)
                if (!employee.branch_id) {
                    employee.branch_id = branchId;
                }
            } else {
                // Otros roles: solo una sucursal (branch_id)
                const previousBranchId = employee.branch_id;
                if (previousBranchId && previousBranchId !== branchId) {
                    const prevBranch = await DB.get('catalog_branches', previousBranchId);
                    const previousBranchName = prevBranch?.name || 'Sucursal desconocida';
                    
                    const confirm = await Utils.confirm(
                        `El empleado "${employee.name}" está asignado a "${previousBranchName}".\n\n` +
                        `¿Deseas moverlo a "${branch.name}"?\n\n` +
                        `NOTA: Los empleados de este rol solo pueden estar en una sucursal a la vez.`
                    );
                    if (!confirm) return;
                }
                
                employee.branch_id = branchId;
                // Limpiar branch_ids si existe (no debería para estos roles)
                if (employee.branch_ids) {
                    delete employee.branch_ids;
                }
            }
            
            employee.updated_at = new Date().toISOString();
            
            await DB.put('employees', employee);
            
            // Log de auditoría
            console.log(`Employee assigned to branch:`, {
                employeeId: employee.id,
                employeeName: employee.name,
                role: employee.role,
                isMultiBranch,
                branchIds: employee.branch_ids || [employee.branch_id],
                newBranchId: branchId,
                newBranchName: branch.name
            });
            
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('employee', employee.id);
            }
            
            const branchIds = employee.branch_ids || [employee.branch_id];
            const message = isMultiBranch 
                ? `Empleado "${employee.name}" agregado a "${branch.name}". Total: ${branchIds.length} sucursal(es)`
                : `Empleado "${employee.name}" asignado a "${branch.name}"`;
            Utils.showNotification(message, 'success');
            await this.assignEmployeesToBranch(branchId);
        } catch (e) {
            console.error('Error asignando empleado:', e);
            Utils.showNotification('Error al asignar empleado: ' + e.message, 'error');
        }
    },

    async removeEmployeeFromBranch(employeeId, branchId) {
        try {
            // Validaciones
            if (!employeeId || !branchId) {
                Utils.showNotification('Datos inválidos', 'error');
                return;
            }

            const employee = await DB.get('employees', employeeId);
            if (!employee) {
                Utils.showNotification('Empleado no encontrado', 'error');
                return;
            }
            
            const targetBranch = await DB.get('catalog_branches', branchId);
            const branchName = targetBranch?.name || 'Sucursal desconocida';
            
            // Determinar si es admin o manager (pueden tener múltiples sucursales)
            const isMultiBranch = employee.role === 'admin' || employee.role === 'manager';
            
            if (isMultiBranch) {
                // Admin/Manager: remover de branch_ids
                if (employee.branch_ids && employee.branch_ids.length > 0) {
                    if (employee.branch_ids.length === 1 && employee.branch_ids[0] === branchId) {
                        // Si es la única sucursal, pedir confirmación
                        const confirm = await Utils.confirm(
                            `El empleado "${employee.name}" solo tiene asignada esta sucursal.\n\n` +
                            `¿Estás seguro de que deseas removerlo?\n\n` +
                            `El empleado quedará sin sucursales asignadas.`
                        );
                        if (!confirm) return;
                    }
                    
                    // Remover la sucursal del array
                    employee.branch_ids = employee.branch_ids.filter(id => id !== branchId);
                    
                    // Si quedan sucursales, actualizar branch_id a la primera (para compatibilidad)
                    if (employee.branch_ids.length > 0) {
                        employee.branch_id = employee.branch_ids[0];
                    } else {
                        employee.branch_id = null;
                    }
                } else {
                    // Si no tiene branch_ids pero tiene branch_id, removerlo
                    if (employee.branch_id === branchId) {
                        employee.branch_id = null;
                    }
                }
            } else {
                // Otros roles: solo pueden tener una sucursal, quitarla completamente
                if (employee.branch_id === branchId) {
                    const confirm = await Utils.confirm(
                        `¿Estás seguro de que deseas remover al empleado "${employee.name}" de "${branchName}"?\n\n` +
                        `El empleado quedará sin sucursal asignada.`
                    );
                    if (!confirm) return;
                    
                    employee.branch_id = null;
                } else {
                    Utils.showNotification('El empleado no está asignado a esta sucursal', 'warning');
                    return;
                }
            }
            
            employee.updated_at = new Date().toISOString();
            
            await DB.put('employees', employee);
            
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('employee', employee.id);
            }
            
            Utils.showNotification(`Empleado removido de "${branchName}"`, 'success');
            await this.assignEmployeesToBranch(branchId);
        } catch (e) {
            console.error('Error removiendo empleado:', e);
            Utils.showNotification('Error al remover empleado: ' + e.message, 'error');
        }
    },

    async viewBranchEmployees(branchId) {
        console.log('viewBranchEmployees llamado con ID:', branchId);
        try {
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                Utils.showNotification('Sucursal no encontrada', 'error');
                return;
            }

            const allEmployees = await DB.getAll('employees') || [];
            const branchEmployees = allEmployees.filter(emp => emp.branch_id === branchId);

            const body = `
                <div style="max-width: 700px;">
                    <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <strong>Sucursal:</strong> ${Utils.escapeHtml(branch.name)}
                        <br><small style="color: var(--color-text-secondary);">Total: ${branchEmployees.length} empleado(s)</small>
                    </div>
                    
                    ${branchEmployees.length > 0 ? `
                        <div style="max-height: 400px; overflow-y: auto;">
                            <table class="cart-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        <th>Rol</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${branchEmployees.map(emp => `
                                        <tr>
                                            <td><strong>${Utils.escapeHtml(emp.name || 'Sin nombre')}</strong></td>
                                            <td><span class="status-badge status-${emp.role === 'admin' ? 'disponible' : 'reservado'}">${emp.role || 'N/A'}</span></td>
                                            <td><span class="status-badge status-${emp.active ? 'disponible' : 'vendida'}">${emp.active ? 'Activo' : 'Inactivo'}</span></td>
                                            <td>
                                                <button class="btn-secondary btn-xs" onclick="window.Employees && window.Employees.editEmployee('${emp.id}'); UI.closeModal();" title="Editar">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn-danger btn-xs" onclick="window.Settings.removeEmployeeFromBranch('${emp.id}', '${branchId}'); UI.closeModal();" title="Quitar de sucursal">
                                                    <i class="fas fa-user-minus"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">No hay empleados asignados a esta sucursal</p>'}
                </div>
            `;

            UI.showModal(`Empleados de ${Utils.escapeHtml(branch.name)}`, body, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() },
                { text: 'Asignar Empleados', class: 'btn-secondary', onclick: () => { UI.closeModal(); this.assignEmployeesToBranch(branchId); } }
            ]);
        } catch (e) {
            console.error('Error mostrando empleados de sucursal:', e);
            Utils.showNotification('Error: ' + e.message, 'error');
        }
    },

    async manageCommissionRules() {
        const rules = await DB.getAll('commission_rules') || [];
        const body = `
            <div style="margin-bottom: 20px;">
                <button class="btn-primary" onclick="window.Settings.addCommissionRule()">+ Agregar Regla</button>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
                <table class="cart-table">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Entidad</th>
                            <th>Descuento %</th>
                            <th>Multiplicador</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rules.map(rule => `
                            <tr>
                                <td>${rule.entity_type}</td>
                                <td>${rule.entity_id}</td>
                                <td>${rule.discount_pct || 0}%</td>
                                <td>${rule.multiplier || 1}x</td>
                                <td>
                                    <button class="btn-secondary" onclick="window.Settings.editCommissionRule('${rule.id}')" style="padding: 4px 8px; font-size: 12px;">Editar</button>
                                    <button class="btn-danger" onclick="window.Settings.deleteCommissionRule('${rule.id}')" style="padding: 4px 8px; font-size: 12px;">Eliminar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        UI.showModal('Gestionar Reglas de Comisión', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
    },

    async addCommissionRule() {
        const typeOptions = [
            { value: 'seller', label: 'Vendedor' },
            { value: 'guide', label: 'Guía' },
            { value: 'agency', label: 'Agencia' }
        ];
        const type = await Utils.select('Selecciona el tipo de entidad:', typeOptions, 'Nueva Regla de Comisión');
        if (!type) return;

        const entityId = await Utils.prompt('ID de la entidad:', '', 'Nueva Regla');
        if (!entityId) return;

        const discountStr = await Utils.prompt('Descuento %:', '0', 'Nueva Regla');
        const discount = parseFloat(discountStr || '0');
        
        const multiplierStr = await Utils.prompt('Multiplicador:', '1', 'Nueva Regla');
        const multiplier = parseFloat(multiplierStr || '1');

        const rule = {
            id: Utils.generateId(),
            entity_type: type,
            entity_id: entityId,
            discount_pct: discount,
            multiplier: multiplier,
            created_at: new Date().toISOString()
        };

        await DB.put('commission_rules', rule);
        Utils.showNotification('Regla agregada', 'success');
        this.manageCommissionRules();
    },

    async editCommissionRule(id) {
        const rule = await DB.get('commission_rules', id);
        if (!rule) return;

        const discountStr = await Utils.prompt('Descuento %:', String(rule.discount_pct || 0), 'Editar Regla');
        const discount = parseFloat(discountStr || '0');
        
        const multiplierStr = await Utils.prompt('Multiplicador:', String(rule.multiplier || 1), 'Editar Regla');
        const multiplier = parseFloat(multiplierStr || '1');

        rule.discount_pct = discount;
        rule.multiplier = multiplier;
        await DB.put('commission_rules', rule);
        Utils.showNotification('Regla actualizada', 'success');
        this.manageCommissionRules();
    },

    async deleteCommissionRule(id) {
        if (!await Utils.confirm('¿Eliminar esta regla?')) return;
        await DB.delete('commission_rules', id);
        Utils.showNotification('Regla eliminada', 'success');
        this.manageCommissionRules();
    },

    // ========================================
    // ========================================
    // FUNCIONALIDADES AVANZADAS DE IMPRESIÓN
    // ========================================

    async connectPrinter() {
        try {
            const baudRate = parseInt(document.getElementById('setting-printer-baud')?.value || '9600');
            const printerModel = document.getElementById('setting-printer-model')?.value || 'GP-5830';
            
            // Verificar que Web Serial API esté disponible
            if (!('serial' in navigator)) {
                Utils.showNotification('Tu navegador no soporta impresión directa. Usa Chrome o Edge (versión 89+).', 'error');
                return;
            }
            
            if (typeof Printer !== 'undefined') {
                // Para GP-5830, no usar filtros restrictivos - dejar que el usuario seleccione manualmente
                // Esto es más confiable ya que diferentes adaptadores USB pueden tener diferentes Vendor IDs
                Printer.preferredFilters = null; // Sin filtros para permitir selección manual
                
                // Mostrar instrucciones antes de conectar
                const shouldContinue = confirm(
                    'INSTRUCCIONES PARA CONECTAR GP-5830:\n\n' +
                    '1. Asegúrate de que la impresora esté encendida\n' +
                    '2. Verifica que esté conectada por USB\n' +
                    '3. En la ventana que aparecerá, busca "GP-5830" o "USB Serial Port"\n' +
                    '4. Si no aparece, busca cualquier puerto USB que no sea "Print to PDF"\n\n' +
                    '¿Continuar con la conexión?'
                );
                
                if (!shouldContinue) return;
                
                const connected = await Printer.connect(baudRate);
                if (connected) {
                    this.updatePrinterStatus(true);
                    localStorage.setItem('printer_baud_rate', baudRate.toString());
                    localStorage.setItem('printer_model', printerModel);
                    
                    // Actualizar información del puerto
                    setTimeout(() => this.updatePrinterPortInfo(), 500);
                    
                    Utils.showNotification('✅ GP-5830 conectada correctamente', 'success');
                } else {
                    Utils.showNotification('No se pudo conectar. Verifica que la impresora esté encendida y conectada.', 'warning');
                }
            } else {
                Utils.showNotification('Módulo de impresora no disponible', 'error');
            }
        } catch (e) {
            console.error('Error conectando impresora:', e);
            
            let errorMessage = 'Error al conectar: ' + e.message;
            
            // Mensajes de error más amigables
            if (e.message.includes('cancel')) {
                errorMessage = 'Conexión cancelada. Intenta de nuevo y selecciona tu impresora GP-5830 en la lista.';
            } else if (e.message.includes('No se pudo encontrar')) {
                errorMessage = 'No se encontró la impresora. Verifica:\n' +
                              '• Que la GP-5830 esté encendida\n' +
                              '• Que esté conectada por USB\n' +
                              '• Que no esté siendo usada por otro programa\n' +
                              '• Intenta desconectar y volver a conectar el cable USB';
            }
            
            Utils.showNotification(errorMessage, 'error');
        }
    },

    onPrinterModelChange() {
        const model = document.getElementById('setting-printer-model')?.value;
        const customNameDiv = document.getElementById('printer-name-custom');
        
        if (model === 'custom') {
            if (customNameDiv) customNameDiv.style.display = 'block';
        } else {
            if (customNameDiv) customNameDiv.style.display = 'none';
            
            // Configurar valores predeterminados según modelo
            const defaults = {
                'GP-5830': { baud: '9600', width: '58', density: 'medium' },
                'GP-5830II': { baud: '9600', width: '58', density: 'high' },
                'EC-58110': { baud: '9600', width: '58', density: 'medium' }
            };
            
            if (defaults[model]) {
                const config = defaults[model];
                const baudEl = document.getElementById('setting-printer-baud');
                const widthEl = document.getElementById('setting-printer-width');
                const densityEl = document.getElementById('setting-printer-density');
                
                if (baudEl) baudEl.value = config.baud;
                if (widthEl) widthEl.value = config.width;
                if (densityEl) densityEl.value = config.density;
            }
        }
    },

    async updatePrinterPortInfo() {
        const portInfo = document.getElementById('printer-port-status');
        if (!portInfo) return;

        try {
            if (typeof Printer !== 'undefined' && Printer.connected && Printer.port) {
                const portInfoObj = Printer.port.getInfo();
                let portText = 'Puerto USB: Conectado';
                
                if (portInfoObj.usbVendorId) {
                    const vendorId = portInfoObj.usbVendorId.toString(16).toUpperCase().padStart(4, '0');
                    portText = `Puerto USB: 0x${vendorId} (GP-5830 detectada)`;
                }
                
                portInfo.textContent = portText;
                portInfo.parentElement.style.background = 'rgba(45, 45, 45, 0.15)';
                portInfo.parentElement.style.color = 'var(--color-success)';
                portInfo.parentElement.style.borderLeft = '3px solid var(--color-success)';
            } else {
                portInfo.textContent = 'Puerto USB: No conectado';
                portInfo.parentElement.style.background = 'var(--color-bg-secondary)';
                portInfo.parentElement.style.color = 'var(--color-text-secondary)';
                portInfo.parentElement.style.borderLeft = '3px solid var(--color-border)';
            }
        } catch (e) {
            portInfo.textContent = 'Puerto: Información no disponible';
        }
    },

    async disconnectPrinter() {
        try {
            if (typeof Printer !== 'undefined' && Printer.connected) {
                await Printer.disconnect();
                this.updatePrinterStatus(false);
            }
        } catch (e) {
            console.error('Error desconectando:', e);
        }
    },

    updatePrinterStatus(connected) {
        const badge = document.getElementById('printer-status-badge');
        const info = document.getElementById('printer-connection-info');
        const btnConnect = document.getElementById('btn-connect-printer');
        const btnDisconnect = document.getElementById('btn-disconnect-printer');
        const lastActivity = document.getElementById('printer-last-activity');

        if (badge) {
            badge.className = `printer-status-badge ${connected ? 'connected' : 'disconnected'}`;
            badge.innerHTML = connected 
                ? '<i class="fas fa-circle"></i> Conectada' 
                : '<i class="fas fa-circle"></i> Desconectada';
        }

        if (info) {
            const baudRate = localStorage.getItem('printer_baud_rate') || '9600';
            const printerModel = localStorage.getItem('printer_model') || 'GP-5830';
            info.textContent = connected 
                ? `GP-5830 Series conectada a ${baudRate} baud` 
                : 'No conectada - Haz clic en Conectar';
        }

        if (btnConnect) btnConnect.style.display = connected ? 'none' : 'inline-flex';
        if (btnDisconnect) btnDisconnect.style.display = connected ? 'inline-flex' : 'none';

        if (lastActivity && connected) {
            lastActivity.textContent = `Última actividad: ${new Date().toLocaleTimeString()}`;
        }

        // Actualizar información del puerto
        this.updatePrinterPortInfo();
    },

    async previewTicket() {
        const businessName = document.getElementById('setting-business-name')?.value || 'OPAL & CO';
        const businessPhone = document.getElementById('setting-business-phone')?.value || '';
        const businessAddress = document.getElementById('setting-business-address')?.value || '';
        const footerMessage = document.getElementById('setting-ticket-footer')?.value || 'Gracias por su compra';
        const ticketFormat = document.getElementById('setting-ticket-format')?.value || 'standard';
        const printLogo = document.getElementById('setting-print-logo')?.checked;
        const printBarcode = document.getElementById('setting-print-barcode')?.checked;
        const printQR = document.getElementById('setting-print-qr')?.checked;

        const previewHTML = `
            <div style="background: white; color: black; font-family: 'Courier New', monospace; width: 220px; padding: 15px; margin: 0 auto; border: 1px solid #ccc; font-size: 11px; line-height: 1.4;">
                ${printLogo ? '<div style="text-align: center; margin-bottom: 10px;"><i class="fas fa-gem" style="font-size: 24px;"></i></div>' : ''}
                <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 5px;">${businessName}</div>
                ${businessAddress ? `<div style="text-align: center; font-size: 9px;">${businessAddress}</div>` : ''}
                ${businessPhone ? `<div style="text-align: center; font-size: 9px;">Tel: ${businessPhone}</div>` : ''}
                <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
                
                <div style="display: flex; justify-content: space-between;"><span>Folio:</span><span>V-001234</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Fecha:</span><span>${new Date().toLocaleDateString()}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Hora:</span><span>${new Date().toLocaleTimeString()}</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Vendedor:</span><span>Juan Pérez</span></div>
                
                <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
                
                ${ticketFormat !== 'minimal' ? `
                <div style="font-weight: bold;">Anillo Oro 18k Diamante</div>
                <div style="display: flex; justify-content: space-between;"><span>1 x $15,000.00</span><span>$15,000.00</span></div>
                
                <div style="font-weight: bold; margin-top: 5px;">Collar Plata 925</div>
                <div style="display: flex; justify-content: space-between;"><span>1 x $3,500.00</span><span>$3,500.00</span></div>
                ` : ''}
                
                <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
                
                <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span>$18,500.00</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Descuento (10%):</span><span>-$1,850.00</span></div>
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #000;">
                    <span>TOTAL:</span><span>$16,650.00</span>
                </div>
                
                <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
                
                <div style="font-weight: bold;">PAGOS:</div>
                <div style="display: flex; justify-content: space-between;"><span>Efectivo USD:</span><span>$800.00 USD</span></div>
                <div style="display: flex; justify-content: space-between;"><span>Visa/MC:</span><span>$650.00 MXN</span></div>
                
                <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
                
                ${printBarcode ? '<div style="text-align: center; margin: 10px 0;"><div style="font-family: monospace; letter-spacing: 3px;">|||||||||||||||</div><div style="font-size: 9px;">V-001234</div></div>' : ''}
                ${printQR ? '<div style="text-align: center; margin: 10px 0;"><div style="width: 50px; height: 50px; background: #000; margin: 0 auto;"></div><div style="font-size: 8px; margin-top: 3px;">Escanea para ver detalles</div></div>' : ''}
                
                <div style="text-align: center; margin-top: 10px;">${footerMessage}</div>
                <div style="text-align: center; font-size: 9px; color: #666; margin-top: 5px;">${new Date().toLocaleString()}</div>
            </div>
        `;

        const body = `
            <div style="display: flex; gap: var(--spacing-lg);">
                <div style="flex: 1;">
                    <h4 style="margin-bottom: var(--spacing-md);">Vista Previa del Ticket</h4>
                    ${previewHTML}
                </div>
                <div style="flex: 1; padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                    <h4 style="margin-bottom: var(--spacing-md);">Información</h4>
                    <div style="font-size: 12px; color: var(--color-text-secondary);">
                        <p><strong>Formato:</strong> ${ticketFormat}</p>
                        <p><strong>Ancho:</strong> ${document.getElementById('setting-printer-width')?.value || '58'}mm</p>
                        <p><strong>Logo:</strong> ${printLogo ? 'Sí' : 'No'}</p>
                        <p><strong>Código de barras:</strong> ${printBarcode ? 'Sí' : 'No'}</p>
                        <p><strong>Código QR:</strong> ${printQR ? 'Sí' : 'No'}</p>
                        <p style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid var(--color-border-light);">
                            <i class="fas fa-info-circle"></i> Esta es una vista previa aproximada. 
                            El ticket real puede variar según la impresora.
                        </p>
                    </div>
                </div>
            </div>
        `;

        UI.showModal('Vista Previa del Ticket', body, '<button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>');
    },

    async resetPrinterSettings() {
        const confirmReset = confirm('¿Restablecer toda la configuración de impresión a los valores predeterminados?');
        if (!confirmReset) return;

        // Valores predeterminados para GP-5838 SERIES
        const defaults = {
            printer_model: 'GP-5838',
            printer_name: 'GP-5838 SERIES',
            printer_baud: '9600',
            printer_width: '58',
            printer_density: 'medium',
            ticket_format: 'standard',
            ticket_copies: '1',
            paper_cut: 'full',
            feed_lines: '3',
            print_logo: true,
            print_barcode: false,
            print_qr: false,
            auto_print: true,
            print_footer: true,
            print_duplicate: false,
            business_name: 'OPAL & CO',
            business_phone: '',
            business_address: '',
            ticket_footer: 'Gracias por su compra'
        };

        // Actualizar campos en la UI
        if (document.getElementById('setting-printer-model')) {
            document.getElementById('setting-printer-model').value = defaults.printer_model;
            this.onPrinterModelChange();
        }
        if (document.getElementById('setting-printer-name')) document.getElementById('setting-printer-name').value = defaults.printer_name;
        if (document.getElementById('setting-printer-baud')) document.getElementById('setting-printer-baud').value = defaults.printer_baud;
        if (document.getElementById('setting-printer-width')) document.getElementById('setting-printer-width').value = defaults.printer_width;
        if (document.getElementById('setting-printer-density')) document.getElementById('setting-printer-density').value = defaults.printer_density;
        if (document.getElementById('setting-ticket-format')) document.getElementById('setting-ticket-format').value = defaults.ticket_format;
        if (document.getElementById('setting-ticket-copies')) document.getElementById('setting-ticket-copies').value = defaults.ticket_copies;
        if (document.getElementById('setting-paper-cut')) document.getElementById('setting-paper-cut').value = defaults.paper_cut;
        if (document.getElementById('setting-feed-lines')) document.getElementById('setting-feed-lines').value = defaults.feed_lines;
        if (document.getElementById('setting-print-logo')) document.getElementById('setting-print-logo').checked = defaults.print_logo;
        if (document.getElementById('setting-print-barcode')) document.getElementById('setting-print-barcode').checked = defaults.print_barcode;
        if (document.getElementById('setting-print-qr')) document.getElementById('setting-print-qr').checked = defaults.print_qr;
        if (document.getElementById('setting-auto-print')) document.getElementById('setting-auto-print').checked = defaults.auto_print;
        if (document.getElementById('setting-print-footer')) document.getElementById('setting-print-footer').checked = defaults.print_footer;
        if (document.getElementById('setting-print-duplicate')) document.getElementById('setting-print-duplicate').checked = defaults.print_duplicate;
        if (document.getElementById('setting-business-name')) document.getElementById('setting-business-name').value = defaults.business_name;
        if (document.getElementById('setting-business-phone')) document.getElementById('setting-business-phone').value = defaults.business_phone;
        if (document.getElementById('setting-business-address')) document.getElementById('setting-business-address').value = defaults.business_address;
        if (document.getElementById('setting-ticket-footer')) document.getElementById('setting-ticket-footer').value = defaults.ticket_footer;

        Utils.showNotification('Configuración restablecida', 'success');
    },

    async savePrinterSettings() {
        try {
            // Configuración de hardware
            const printerModel = document.getElementById('setting-printer-model')?.value || 'GP-5838';
            const printerName = printerModel === 'custom' 
                ? (document.getElementById('setting-printer-name')?.value || 'GP-5838 SERIES')
                : printerModel;
            const printerBaud = document.getElementById('setting-printer-baud')?.value || '9600';
            const printerWidth = document.getElementById('setting-printer-width')?.value || '58';
            const printerDensity = document.getElementById('setting-printer-density')?.value || 'medium';

            // Configuración de ticket
            const ticketFormat = document.getElementById('setting-ticket-format')?.value || 'standard';
            const ticketCopies = document.getElementById('setting-ticket-copies')?.value || '1';
            const paperCut = document.getElementById('setting-paper-cut')?.value || 'full';
            const feedLines = document.getElementById('setting-feed-lines')?.value || '3';

            // Opciones del ticket
            const printLogo = document.getElementById('setting-print-logo')?.checked || false;
            const printBarcode = document.getElementById('setting-print-barcode')?.checked || false;
            const printQR = document.getElementById('setting-print-qr')?.checked || false;
            const autoPrint = document.getElementById('setting-auto-print')?.checked || false;
            const printFooter = document.getElementById('setting-print-footer')?.checked || false;
            const printDuplicate = document.getElementById('setting-print-duplicate')?.checked || false;

            // Personalización
            const businessName = document.getElementById('setting-business-name')?.value || 'OPAL & CO';
            const businessPhone = document.getElementById('setting-business-phone')?.value || '';
            const businessAddress = document.getElementById('setting-business-address')?.value || '';
            const ticketFooterMsg = document.getElementById('setting-ticket-footer')?.value || 'Gracias por su compra';

            // Guardar en la base de datos
            const settingsToSave = {
                printer_model: printerModel,
                printer_name: printerName,
                printer_baud: printerBaud,
                printer_width: parseInt(printerWidth),
                printer_density: printerDensity,
                ticket_format: ticketFormat,
                ticket_copies: parseInt(ticketCopies),
                paper_cut: paperCut,
                feed_lines: parseInt(feedLines),
                print_logo: printLogo,
                print_barcode: printBarcode,
                print_qr: printQR,
                auto_print: autoPrint,
                print_footer: printFooter,
                print_duplicate: printDuplicate,
                business_name: businessName,
                business_phone: businessPhone,
                business_address: businessAddress,
                ticket_footer: ticketFooterMsg
            };

            // Guardar cada setting individualmente con verificación
            for (const [key, value] of Object.entries(settingsToSave)) {
                try {
                    // Verificar si existe antes de guardar
                    const existing = await DB.get('settings', key);
                    const settingData = { 
                        key: key, 
                        value: value, 
                        updated_at: new Date().toISOString() 
                    };
                    
                    // Si existe, agregar created_at del existente
                    if (existing && existing.created_at) {
                        settingData.created_at = existing.created_at;
                    } else {
                        settingData.created_at = new Date().toISOString();
                    }
                    
                    await DB.put('settings', settingData);
                    console.log(`✅ Setting guardado: ${key} = ${value}`);
                } catch (e) {
                    console.error(`❌ Error guardando setting ${key}:`, e);
                    // Intentar con add si put falla
                    try {
                        await DB.add('settings', { 
                            key: key, 
                            value: value, 
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString() 
                        });
                        console.log(`✅ Setting agregado (add): ${key} = ${value}`);
                    } catch (e2) {
                        console.error(`❌ Error también con add para ${key}:`, e2);
                    }
                }
            }

            // Verificar que se guardaron correctamente
            const verificationPromises = Object.keys(settingsToSave).map(async (key) => {
                const saved = await DB.get('settings', key);
                if (!saved || saved.value !== settingsToSave[key]) {
                    console.warn(`⚠️ Advertencia: Setting ${key} no se guardó correctamente`);
                    return false;
                }
                return true;
            });
            
            const verificationResults = await Promise.all(verificationPromises);
            const allSaved = verificationResults.every(r => r === true);
            
            if (!allSaved) {
                console.error('Algunos settings no se guardaron correctamente');
                Utils.showNotification('Configuración guardada con advertencias. Algunos valores pueden no haberse guardado.', 'warning');
            }

            // Actualizar configuración del módulo Printer
            if (typeof Printer !== 'undefined') {
                Printer.printerName = printerName;
                Printer.printerWidth = parseInt(printerWidth) === 80 ? 48 : 32;
                Printer.currentBaudRate = parseInt(printerBaud);
            }

            // Guardar en localStorage también para acceso rápido
            localStorage.setItem('printer_settings', JSON.stringify(settingsToSave));
            localStorage.setItem('printer_settings_timestamp', new Date().toISOString());

            Utils.showNotification('Configuración de impresión guardada correctamente', 'success');
        } catch (e) {
            console.error('Error guardando configuración de impresión:', e);
            Utils.showNotification('Error al guardar configuración', 'error');
        }
    },

    async saveNotifications() {
        const notifySales = document.getElementById('setting-notify-sales').checked;
        const notifyLowStock = document.getElementById('setting-notify-low-stock').checked;
        const notifySync = document.getElementById('setting-notify-sync').checked;
        const lowStockThreshold = parseInt(document.getElementById('setting-low-stock-threshold').value);

        await DB.put('settings', { key: 'notify_sales', value: notifySales, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'notify_low_stock', value: notifyLowStock, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'notify_sync', value: notifySync, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'low_stock_threshold', value: lowStockThreshold, updated_at: new Date().toISOString() });

        Utils.showNotification('Configuración de notificaciones guardada', 'success');
    },

    async saveAppearance() {
        const theme = document.getElementById('setting-theme').value;
        const language = document.getElementById('setting-language').value;
        const dateFormat = document.getElementById('setting-date-format').value;

        await DB.put('settings', { key: 'theme', value: theme, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'language', value: language, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'date_format', value: dateFormat, updated_at: new Date().toISOString() });

        // Aplicar tema si es necesario
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }

        Utils.showNotification('Configuración de apariencia guardada', 'success');
    },

    async saveSecuritySettings() {
        const pinMinLength = parseInt(document.getElementById('setting-pin-min-length').value);
        const maxLoginAttempts = parseInt(document.getElementById('setting-max-login-attempts').value);
        const lockoutTime = parseInt(document.getElementById('setting-lockout-time').value);

        await DB.put('settings', { key: 'pin_min_length', value: pinMinLength, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'max_login_attempts', value: maxLoginAttempts, updated_at: new Date().toISOString() });
        await DB.put('settings', { key: 'lockout_time', value: lockoutTime, updated_at: new Date().toISOString() });

        Utils.showNotification('Configuración de seguridad guardada', 'success');
    },

    async changeMasterPin() {
        const currentPin = document.getElementById('setting-current-pin').value;
        const newPin = document.getElementById('setting-new-pin').value;
        const confirmPin = document.getElementById('setting-confirm-pin').value;

        if (!currentPin || !newPin || !confirmPin) {
            Utils.showNotification('Completa todos los campos', 'error');
            return;
        }

        if (newPin.length < 4) {
            Utils.showNotification('El PIN debe tener al menos 4 dígitos', 'error');
            return;
        }

        if (newPin !== confirmPin) {
            Utils.showNotification('Los PINs no coinciden', 'error');
            return;
        }

        // Validar PIN actual (simplificado - en producción validar con hash)
        const currentUser = UserManager.currentUser;
        if (!currentUser) {
            Utils.showNotification('Debes estar autenticado', 'error');
            return;
        }

        // Cambiar PIN
        const newPinHash = await Utils.hashPin(newPin);
        currentUser.pin_hash = newPinHash;
        await DB.put('users', currentUser);

        // Limpiar campos
        document.getElementById('setting-current-pin').value = '';
        document.getElementById('setting-new-pin').value = '';
        document.getElementById('setting-confirm-pin').value = '';

        Utils.showNotification('PIN cambiado correctamente', 'success');
    },

    async loadCompanyCodeSettings() {
        // Cargar código actual (sin mostrarlo completo por seguridad)
        const currentCodeInput = document.getElementById('setting-current-company-code');
        if (currentCodeInput && typeof App !== 'undefined' && App.COMPANY_ACCESS_CODE) {
            const code = App.COMPANY_ACCESS_CODE;
            // Mostrar solo los primeros y últimos caracteres
            const masked = code.length > 4 
                ? code.substring(0, 2) + '•'.repeat(code.length - 4) + code.substring(code.length - 2)
                : '•'.repeat(code.length);
            currentCodeInput.value = masked;
        }
    },

    async changeCompanyCode() {
        const newCode = document.getElementById('setting-new-company-code').value.trim();
        const confirmCode = document.getElementById('setting-confirm-company-code').value.trim();

        if (!newCode || !confirmCode) {
            Utils.showNotification('Completa todos los campos', 'error');
            return;
        }

        if (newCode.length < 4) {
            Utils.showNotification('El código debe tener al menos 4 caracteres', 'error');
            return;
        }

        if (newCode !== confirmCode) {
            Utils.showNotification('Los códigos no coinciden', 'error');
            return;
        }

        // Cambiar el código en App
        if (typeof App !== 'undefined') {
            App.COMPANY_ACCESS_CODE = newCode;
            
            // Limpiar códigos guardados para forzar nueva validación
            localStorage.removeItem('company_code_validated');
            
            // Limpiar campos
            document.getElementById('setting-new-company-code').value = '';
            document.getElementById('setting-confirm-company-code').value = '';
            
            // Actualizar display del código actual
            await this.loadCompanyCodeSettings();
            
            Utils.showNotification('Código de acceso cambiado correctamente. Todos los usuarios deberán ingresar el nuevo código.', 'success');
        } else {
            Utils.showNotification('Error: No se pudo cambiar el código', 'error');
        }
    },

    async clearCompanyCodeCache() {
        if (await Utils.confirm('¿Estás seguro de que deseas limpiar todos los códigos guardados? Esto forzará a todos los usuarios a ingresar el código nuevamente.')) {
            localStorage.removeItem('company_code_validated');
            Utils.showNotification('Códigos guardados eliminados. Todos los usuarios deberán ingresar el código nuevamente.', 'success');
        }
    },

    async managePermissions() {
        // Verificar permisos
        if (!PermissionManager || !PermissionManager.hasPermission('settings.manage_permissions')) {
            Utils.showNotification('No tienes permiso para gestionar permisos', 'error');
            return;
        }

        const users = await DB.getAll('users') || [];
        const employees = await DB.getAll('employees') || [];
        const employeesMap = {};
        employees.forEach(emp => { employeesMap[emp.id] = emp; });

        // Obtener permisos predefinidos de cada rol para comparar
        const getRoleDefaultPermissions = (role) => {
            if (role === 'admin') return ['all'];
            return PermissionManager.getRolePermissions(role) || [];
        };

        const body = `
            <div style="max-width: 1000px;">
                <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px; color: var(--color-text-secondary);">
                    <strong>ℹ️ Información:</strong> Los Administradores tienen acceso total automáticamente. Otros roles tienen permisos predefinidos que pueden personalizarse.
                </div>
                <div style="max-height: 500px; overflow-y: auto;">
                    <table class="cart-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th style="min-width: 150px;">Usuario</th>
                                <th style="min-width: 100px;">Rol</th>
                                <th style="min-width: 120px;">Tipo de Permisos</th>
                                <th style="min-width: 100px;">Cantidad</th>
                                <th style="min-width: 200px;">Razón/Origen</th>
                                <th style="min-width: 100px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => {
                                const emp = employeesMap[user.employee_id];
                                const isAdmin = user.role === 'admin';
                                
                                let permCount = 0;
                                let permType = 'Sin permisos';
                                let permReason = 'No asignados';
                                let isCustomized = false;
                                
                                if (user.permissions) {
                                    if (Array.isArray(user.permissions)) {
                                        if (user.permissions.includes('all')) {
                                            permCount = 'TODOS';
                                            permType = 'Acceso Total';
                                            permReason = 'Administrador del sistema';
                                        } else {
                                            permCount = user.permissions.length;
                                            const defaultPerms = getRoleDefaultPermissions(user.role);
                                            isCustomized = JSON.stringify(user.permissions.sort()) !== JSON.stringify(defaultPerms.sort());
                                            
                                            if (isCustomized) {
                                                permType = 'Personalizados';
                                                permReason = `Personalizado desde perfil de ${user.role}`;
                                            } else {
                                                permType = 'Perfil Predefinido';
                                                permReason = `Asignado automáticamente según rol: ${user.role}`;
                                            }
                                        }
                                    } else {
                                        // Formato antiguo (objeto)
                                        permCount = Object.keys(user.permissions).filter(p => user.permissions[p]).length;
                                        permType = 'Formato Antiguo';
                                        permReason = 'Necesita migración a nuevo formato';
                                    }
                                } else {
                                    // Sin permisos definidos
                                    const defaultPerms = getRoleDefaultPermissions(user.role);
                                    permCount = defaultPerms.length;
                                    permType = 'Se asignarán automáticamente';
                                    permReason = `Se asignarán al hacer login según rol: ${user.role}`;
                                }
                                
                                return `
                                    <tr>
                                        <td>
                                            <strong>${user.username}</strong>
                                            ${emp ? `<br><small style="color: var(--color-text-secondary);">${emp.name}</small>` : ''}
                                        </td>
                                        <td>
                                            <span class="status-badge" style="background: ${user.role === 'admin' ? '#d32f2f' : user.role === 'manager' ? '#1976d2' : user.role === 'seller' ? '#388e3c' : '#ff9800'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase;">
                                                ${user.role || 'N/A'}
                                            </span>
                                        </td>
                                        <td>
                                            <span style="font-weight: 600; color: ${isAdmin ? 'var(--color-primary)' : isCustomized ? 'var(--color-accent)' : 'var(--color-text)'};">
                                                ${permType}
                                            </span>
                                        </td>
                                        <td>
                                            ${permCount === 'TODOS' ? '<strong style="color: var(--color-primary);">Todos</strong>' : `${permCount} permiso(s)`}
                                        </td>
                                        <td>
                                            <small style="color: var(--color-text-secondary); font-size: 10px;">
                                                ${permReason}
                                            </small>
                                        </td>
                                        <td>
                                            ${!isAdmin ? `
                                                <button class="btn-secondary btn-sm" onclick="window.Settings.editUserPermissions('${user.id}')" title="Ver y editar permisos">
                                                    <i class="fas fa-edit"></i> Editar
                                                </button>
                                            ` : '<span style="color: var(--color-text-secondary); font-size: 10px;">N/A (Admin)</span>'}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            ${users.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: var(--spacing-md);">No hay usuarios registrados</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm); font-size: 11px;">
                    <strong>💡 Tipos de Permisos:</strong>
                    <ul style="margin: var(--spacing-xs) 0; padding-left: 20px;">
                        <li><strong>Acceso Total:</strong> Administrador con todos los permisos</li>
                        <li><strong>Perfil Predefinido:</strong> Permisos asignados automáticamente según el rol</li>
                        <li><strong>Personalizados:</strong> Permisos modificados manualmente desde el perfil del rol</li>
                    </ul>
                </div>
            </div>
        `;

        UI.showModal('Gestionar Permisos', body, [
            { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
        ]);
    },

    async editUserPermissions(userId) {
        // Verificar permisos
        if (!PermissionManager || !PermissionManager.hasPermission('settings.manage_permissions')) {
            Utils.showNotification('No tienes permiso para gestionar permisos', 'error');
            return;
        }

        const user = await DB.get('users', userId);
        if (!user) {
            Utils.showNotification('Usuario no encontrado', 'error');
            return;
        }

        // Admin no necesita configuración de permisos
        if (user.role === 'admin') {
            Utils.showNotification('Los administradores tienen acceso total y no necesitan configuración de permisos', 'info');
            return;
        }

        // Asegurar que el usuario tenga permisos según su rol si no tiene personalizados
        if (typeof PermissionManager !== 'undefined') {
            await PermissionManager.ensureUserPermissions(user);
        }

        const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
        const allPermissions = PermissionManager.getAllPermissions();
        const grouped = PermissionManager.groupPermissionsByCategory(allPermissions);
        
        // Mapear nombres legibles de permisos
        const permissionLabels = {
            // OPERACIONES
            'pos.view': 'Ver POS',
            'pos.create_sale': 'Crear Ventas',
            'pos.edit_sale': 'Editar Ventas',
            'pos.cancel_sale': 'Cancelar Ventas',
            'pos.apply_discount': 'Aplicar Descuentos',
            'cash.view': 'Ver Caja',
            'cash.open_session': 'Abrir Sesión de Caja',
            'cash.close_session': 'Cerrar Sesión de Caja',
            'cash.view_reports': 'Ver Reportes de Caja',
            'barcodes.generate': 'Generar Códigos de Barras',
            'barcodes.print': 'Imprimir Códigos de Barras',
            // INVENTARIO
            'inventory.view': 'Ver Inventario',
            'inventory.add': 'Agregar Items',
            'inventory.edit': 'Editar Items',
            'inventory.delete': 'Eliminar Items',
            'inventory.update_stock': 'Actualizar Stock',
            'inventory.view_cost': 'Ver Costos',
            'inventory.edit_cost': 'Editar Costos',
            'transfers.view': 'Ver Transferencias',
            'transfers.create': 'Crear Transferencias',
            'transfers.approve': 'Aprobar Transferencias',
            // CLIENTES Y SERVICIOS
            'customers.view': 'Ver Clientes',
            'customers.add': 'Agregar Clientes',
            'customers.edit': 'Editar Clientes',
            'customers.delete': 'Eliminar Clientes',
            'repairs.view': 'Ver Reparaciones',
            'repairs.create': 'Crear Reparaciones',
            'repairs.edit': 'Editar Reparaciones',
            'repairs.complete': 'Completar Reparaciones',
            'arrivals.view': 'Ver Llegadas',
            'arrivals.register': 'Registrar Llegadas',
            'arrivals.edit': 'Editar Llegadas',
            // ADMINISTRACIÓN
            'employees.view': 'Ver Empleados',
            'employees.add': 'Agregar Empleados',
            'employees.edit': 'Editar Empleados',
            'employees.delete': 'Eliminar Empleados',
            'employees.view_users': 'Ver Usuarios',
            'employees.create_users': 'Crear Usuarios',
            'employees.edit_users': 'Editar Usuarios',
            'employees.reset_pin': 'Restablecer PINs',
            'branches.view': 'Ver Sucursales',
            'branches.manage': 'Gestionar Sucursales',
            // REPORTES Y ANÁLISIS
            'reports.view': 'Ver Reportes',
            'reports.generate': 'Generar Reportes',
            'reports.export': 'Exportar Reportes',
            'reports.view_profits': 'Ver Utilidades',
            'reports.view_costs': 'Ver Costos en Reportes',
            'reports.view_analytics': 'Ver Análisis Avanzados',
            'costs.view': 'Ver Módulo Costos',
            'costs.add': 'Agregar Costos',
            'costs.edit': 'Editar Costos',
            'costs.delete': 'Eliminar Costos',
            'dashboard.view': 'Ver Dashboard',
            'dashboard.view_all_branches': 'Ver Todas las Sucursales en Dashboard',
            // CONFIGURACIÓN
            'settings.view': 'Ver Configuración',
            'settings.edit_general': 'Editar Configuración General',
            'settings.edit_financial': 'Editar Configuración Financiera',
            'settings.manage_catalogs': 'Gestionar Catálogos',
            'settings.manage_permissions': 'Gestionar Permisos',
            'settings.view_audit': 'Ver Auditoría',
            'settings.sync': 'Sincronizar Datos',
            'settings.qa': 'Acceso a QA/Autopruebas'
        };

        const categoryLabels = {
            operations: 'OPERACIONES',
            inventory: 'INVENTARIO',
            customers_services: 'CLIENTES Y SERVICIOS',
            administration: 'ADMINISTRACIÓN',
            reports_analysis: 'REPORTES Y ANÁLISIS',
            configuration: 'CONFIGURACIÓN'
        };

        const renderCategory = (categoryName, perms) => {
            if (!perms || perms.length === 0) return '';
            return `
                <div style="margin-bottom: var(--spacing-lg);">
                    <h4 style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm); color: var(--color-primary);">
                        ${categoryLabels[categoryName] || categoryName}
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm);">
                        ${perms.map(perm => {
                            const isChecked = userPermissions.includes(perm);
                            const label = permissionLabels[perm] || perm.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            return `
                                <label style="display: flex; align-items: center; gap: var(--spacing-xs); cursor: pointer; padding: var(--spacing-xs); border-radius: var(--radius-xs); transition: background 0.2s;" 
                                       onmouseover="this.style.background='var(--color-bg-secondary)'" 
                                       onmouseout="this.style.background='transparent'">
                                    <input type="checkbox" value="${perm}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
                                    <span style="font-size: 11px;">${label}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        };

        const body = `
            <form id="permissions-form" style="max-width: 800px; max-height: 600px; overflow-y: auto;">
                <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                    <strong>Usuario:</strong> ${user.username}<br>
                    <strong>Rol:</strong> ${user.role}<br>
                    <button type="button" class="btn-secondary btn-sm" onclick="window.Settings.resetToRoleProfile('${userId}')" style="margin-top: var(--spacing-xs);">
                        Restablecer a Perfil de Rol
                    </button>
                </div>
                ${renderCategory('operations', grouped.operations)}
                ${renderCategory('inventory', grouped.inventory)}
                ${renderCategory('customers_services', grouped.customers_services)}
                ${renderCategory('administration', grouped.administration)}
                ${renderCategory('reports_analysis', grouped.reports_analysis)}
                ${renderCategory('configuration', grouped.configuration)}
            </form>
        `;

        const self = this;
        UI.showModal('Editar Permisos', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => self.saveUserPermissions(userId) }
        ]);
    },

    async resetToRoleProfile(userId) {
        if (!await Utils.confirm('¿Restablecer los permisos a los predefinidos del rol?\n\nEsto eliminará cualquier personalización de permisos.')) {
            return;
        }

        const user = await DB.get('users', userId);
        if (!user || !user.role) return;

        if (user.role === 'admin') {
            user.permissions = ['all'];
        } else {
            user.permissions = PermissionManager.getRolePermissions(user.role) || [];
        }

        await DB.put('users', user);
        
        if (typeof SyncManager !== 'undefined') {
            await SyncManager.addToQueue('user', user.id);
        }

        Utils.showNotification('Permisos restablecidos al perfil del rol', 'success');
        
        // Recargar el modal de edición
        await this.editUserPermissions(userId);
    },

    async saveUserPermissions(userId) {
        const user = await DB.get('users', userId);
        if (!user) return;

        // Recopilar permisos seleccionados
        const checkboxes = document.querySelectorAll('#permissions-form input[type="checkbox"]:checked');
        const selectedPermissions = Array.from(checkboxes).map(cb => cb.value);

        // Si es admin, mantener 'all'
        if (user.role === 'admin') {
            user.permissions = ['all'];
        } else {
            user.permissions = selectedPermissions;
        }

        user.updated_at = new Date().toISOString();
        
        await DB.put('users', user);
        
        if (typeof SyncManager !== 'undefined') {
            await SyncManager.addToQueue('user', user.id);
        }

        Utils.showNotification('Permisos actualizados correctamente', 'success');
        UI.closeModal();
        
        // Si el usuario actualizó sus propios permisos, recargar
        if (UserManager.currentUser && UserManager.currentUser.id === userId) {
            UserManager.currentUser = user;
            Utils.showNotification('Tus permisos han sido actualizados. Algunos cambios pueden requerir recargar la página.', 'info');
        }
        
        await this.managePermissions();
    },

    async viewAuditLog() {
        // Verificar permisos
        if (!PermissionManager || !PermissionManager.hasPermission('settings.view_audit')) {
            Utils.showNotification('No tienes permiso para ver el log de auditoría', 'error');
            return;
        }
        const audits = await DB.getAll('audit_logs') || [];
        const sortedAudits = audits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);

        const body = `
            <div style="max-height: 500px; overflow-y: auto;">
                <table class="cart-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Usuario</th>
                            <th>Acción</th>
                            <th>Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedAudits.length === 0 ? '<tr><td colspan="4" style="text-align: center; padding: var(--spacing-md);">No hay registros</td></tr>' : 
                        sortedAudits.map(audit => `
                            <tr>
                                <td>${Utils.formatDate(audit.created_at, 'DD/MM/YYYY HH:mm')}</td>
                                <td>${audit.user_id || 'Sistema'}</td>
                                <td>${audit.action}</td>
                                <td style="font-size: 10px;">${JSON.stringify(audit.details || {}).substring(0, 50)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        UI.showModal('Log de Auditoría', body, [
            { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
        ]);
    },

    async testSyncConnection() {
        // Redirigir a la función de prueba de autenticación de Google
        if (SyncManager && SyncManager.testGoogleAuth) {
            try {
                await SyncManager.testGoogleAuth();
                // Actualizar el estado después de autenticarse
                await this.loadSyncStatus();
            } catch (error) {
                // El error ya se muestra en testGoogleAuth
                await this.loadSyncStatus();
            }
        } else {
            Utils.showNotification('Configura el Google Client ID y Spreadsheet ID primero', 'error');
        }
    },

    async forceSync() {
        if (typeof SyncManager !== 'undefined') {
            Utils.showNotification('Iniciando sincronización...', 'info');
            await SyncManager.syncNow();
            // Recargar estado después de sincronizar
            await this.loadSyncStatus();
        } else {
            Utils.showNotification('SyncManager no disponible', 'error');
        }
    },

    async loadSettingsHistory() {
        const historyContainer = document.getElementById('settings-history');
        if (!historyContainer) return;

        const settings = await DB.getAll('settings') || [];
        const sortedSettings = settings
            .filter(s => s.updated_at)
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, 20);

        if (sortedSettings.length === 0) {
            historyContainer.innerHTML = '<div style="text-align: center; padding: var(--spacing-md); color: var(--color-text-secondary);">No hay historial</div>';
            return;
        }

        historyContainer.innerHTML = sortedSettings.map(s => `
            <div style="padding: var(--spacing-xs); border-bottom: 1px solid var(--color-border-light);">
                <div style="font-weight: 600; font-size: 10px;">${s.key}</div>
                <div style="font-size: 9px; color: var(--color-text-secondary);">
                    ${Utils.formatDate(s.updated_at, 'DD/MM/YYYY HH:mm')}
                </div>
            </div>
        `).join('');
    },

    async loadSystemInfo() {
        const infoContainer = document.getElementById('system-info');
        if (!infoContainer) return;

        try {
            const stores = ['sales', 'inventory_items', 'customers', 'repairs', 'cost_entries', 'employees', 'users'];
            const stats = {};

            for (const store of stores) {
                const items = await DB.getAll(store) || [];
                stats[store] = items.length;
            }

            const totalItems = Object.values(stats).reduce((sum, count) => sum + count, 0);

            infoContainer.innerHTML = `
                <div style="margin-bottom: var(--spacing-xs);">
                    <strong>Total de Registros:</strong> ${totalItems}
                </div>
                <div style="font-size: 10px; color: var(--color-text-secondary);">
                    <div>Ventas: ${stats.sales || 0}</div>
                    <div>Inventario: ${stats.inventory_items || 0}</div>
                    <div>Clientes: ${stats.customers || 0}</div>
                    <div>Reparaciones: ${stats.repairs || 0}</div>
                    <div>Costos: ${stats.cost_entries || 0}</div>
                    <div>Empleados: ${stats.employees || 0}</div>
                    <div>Usuarios: ${stats.users || 0}</div>
                </div>
                <div style="margin-top: var(--spacing-xs); font-size: 9px; color: var(--color-text-secondary);">
                    Versión: 1.0.0<br>
                    Última actualización: ${Utils.formatDate(new Date(), 'DD/MM/YYYY')}
                </div>
            `;
        } catch (e) {
            infoContainer.innerHTML = '<div style="color: var(--color-danger);">Error al cargar información</div>';
        }
    },

    async uploadBranchLogo() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                // Convertir a base64
                const base64 = await Utils.loadImageAsBlob(file);
                const logoInput = document.getElementById('branch-business-logo-input');
                if (logoInput) {
                    logoInput.value = base64;
                    Utils.showNotification('Logo cargado correctamente', 'success');
                }
            } catch (error) {
                console.error('Error cargando logo:', error);
                Utils.showNotification('Error al cargar el logo: ' + error.message, 'error');
            }
        };
        input.click();
    },

    async loadSyncStatus() {
        const statusContainer = document.getElementById('sync-status-info');
        if (!statusContainer) return;

        try {
            // Verificar si está configurado
            const googleClientIdSetting = await DB.get('settings', 'google_client_id');
            const spreadsheetIdSetting = await DB.get('settings', 'google_sheets_spreadsheet_id');
            const isConfigured = googleClientIdSetting?.value && spreadsheetIdSetting?.value;

            if (!isConfigured) {
                statusContainer.innerHTML = `
                    <div style="margin-bottom: var(--spacing-xs);">
                        <strong>Estado:</strong> 
                        <span style="color: var(--color-warning);">No configurado</span>
                    </div>
                    <div style="font-size: 10px; color: var(--color-text-secondary);">
                        Configura el Google Client ID y Spreadsheet ID para sincronizar
                    </div>
                `;
                return;
            }

            // Verificar si está autenticado con Google (verificar tanto la variable como el token guardado)
            let isAuthenticated = false;
            if (SyncManager) {
                // Verificar si hay un token guardado en gapi.client
                try {
                    if (typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken) {
                        const token = gapi.client.getToken();
                        isAuthenticated = !!(token && token.access_token);
                    }
                } catch (e) {
                    // Si no está disponible gapi, usar la variable de SyncManager
                    isAuthenticated = SyncManager.isAuthenticated || false;
                }
                // Si no hay token pero la variable dice que está autenticado, usar esa
                if (!isAuthenticated && SyncManager.isAuthenticated) {
                    isAuthenticated = true;
                }
            }
            
            // Buscar el último log de sincronización real (no de prueba)
            const syncLogs = await DB.getAll('sync_logs') || [];
            // Filtrar logs de sincronización real (que tengan status 'synced' o 'failed')
            const realSyncLogs = syncLogs.filter(log => 
                log.status === 'synced' || log.status === 'failed'
            );
            const lastSync = realSyncLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

            // Si está autenticado pero no hay logs, mostrar estado "Conectado"
            if (isAuthenticated && !lastSync) {
                const syncQueue = await DB.getAll('sync_queue') || [];
                const pending = syncQueue.filter(item => item.status === 'pending');
                
                if (pending.length > 0) {
                    statusContainer.innerHTML = `
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Estado:</strong> 
                            <span style="color: var(--color-warning);">Pendiente</span>
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary);">
                            ${pending.length} elemento(s) pendiente(s) de sincronizar
                        </div>
                        <div style="font-size: 10px; color: var(--color-success); margin-top: 4px;">
                            <i class="fas fa-check-circle"></i> Autenticado con Google Sheets
                        </div>
                    `;
                } else {
                    statusContainer.innerHTML = `
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Estado:</strong> 
                            <span style="color: var(--color-success);">Conectado</span>
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary);">
                            Sin sincronizaciones previas
                        </div>
                        <div style="font-size: 10px; color: var(--color-success); margin-top: 4px;">
                            <i class="fas fa-check-circle"></i> Autenticado con Google Sheets
                        </div>
                    `;
                }
                return;
            }

            // Si no está autenticado y no hay logs, mostrar "No autenticado"
            if (!isAuthenticated && !lastSync) {
                const syncQueue = await DB.getAll('sync_queue') || [];
                const pending = syncQueue.filter(item => item.status === 'pending');
                
                if (pending.length > 0) {
                    statusContainer.innerHTML = `
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Estado:</strong> 
                            <span style="color: var(--color-warning);">Pendiente</span>
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary);">
                            ${pending.length} elemento(s) pendiente(s) de sincronizar
                        </div>
                        <div style="font-size: 10px; color: var(--color-warning); margin-top: 4px;">
                            <i class="fas fa-exclamation-triangle"></i> No autenticado - Haz clic en "Probar Autenticación"
                        </div>
                    `;
                } else {
                    statusContainer.innerHTML = `
                        <div style="margin-bottom: var(--spacing-xs);">
                            <strong>Estado:</strong> 
                            <span style="color: var(--color-warning);">No autenticado</span>
                        </div>
                        <div style="font-size: 10px; color: var(--color-text-secondary);">
                            Haz clic en "Probar Autenticación" para conectar
                        </div>
                    `;
                }
                return;
            }

            // Determinar estado basado en el último log
            const isSuccess = lastSync && lastSync.status === 'synced';
            
            // Si está autenticado, priorizar mostrar estado positivo aunque haya habido errores anteriores
            let statusText, statusColor;
            if (isAuthenticated) {
                if (isSuccess) {
                    statusText = 'Sincronizado';
                    statusColor = 'var(--color-success)';
                } else {
                    // Si está autenticado pero hubo un error anterior, mostrar "Listo" o "Conectado"
                    statusText = 'Conectado';
                    statusColor = 'var(--color-success)';
                }
            } else {
                // Si no está autenticado, mostrar el estado real del último log
                statusText = isSuccess ? 'Sincronizado' : (lastSync ? 'Error' : 'Listo');
                statusColor = isSuccess ? 'var(--color-success)' : (lastSync ? 'var(--color-danger)' : 'var(--color-success)');
            }

            statusContainer.innerHTML = `
                <div style="margin-bottom: var(--spacing-xs);">
                    <strong>Estado:</strong> 
                    <span style="color: ${statusColor};">
                        ${statusText}
                    </span>
                </div>
                <div style="font-size: 10px; color: var(--color-text-secondary);">
                    ${lastSync ? `Última sincronización: ${Utils.formatDate(lastSync.created_at, 'DD/MM/YYYY HH:mm')}` : 'Sin sincronizaciones previas'}
                    ${lastSync && !isSuccess && isAuthenticated ? ' (error anterior)' : ''}
                </div>
                ${isAuthenticated ? `
                    <div style="font-size: 10px; color: var(--color-success); margin-top: 4px;">
                        <i class="fas fa-check-circle"></i> Autenticado con Google Sheets
                    </div>
                ` : `
                    <div style="font-size: 10px; color: var(--color-warning); margin-top: 4px;">
                        <i class="fas fa-exclamation-triangle"></i> No autenticado
                    </div>
                `}
            `;
        } catch (e) {
            console.error('Error loading sync status:', e);
            statusContainer.innerHTML = '<div style="color: var(--color-danger);">Error al cargar estado</div>';
        }
    },

    async loadDatabaseStats() {
        const statsContainer = document.getElementById('db-stats');
        if (!statsContainer) return;

        try {
            const stores = ['sales', 'inventory_items', 'customers', 'repairs', 'cost_entries', 'employees', 'users', 'cash_sessions', 'cash_movements'];
            const stats = {};

            for (const store of stores) {
                try {
                    const items = await DB.getAll(store) || [];
                    stats[store] = items.length;
                } catch (e) {
                    stats[store] = 0;
                }
            }

            const totalItems = Object.values(stats).reduce((sum, count) => sum + count, 0);
            const dbSize = await this.estimateDatabaseSize();

            statsContainer.innerHTML = `
                <div style="margin-bottom: var(--spacing-xs);">
                    <strong>Total de Registros:</strong> ${totalItems.toLocaleString()}
                </div>
                <div style="font-size: 10px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">
                    <div>Ventas: ${stats.sales || 0}</div>
                    <div>Inventario: ${stats.inventory_items || 0}</div>
                    <div>Clientes: ${stats.customers || 0}</div>
                    <div>Reparaciones: ${stats.repairs || 0}</div>
                    <div>Costos: ${stats.cost_entries || 0}</div>
                    <div>Empleados: ${stats.employees || 0}</div>
                    <div>Usuarios: ${stats.users || 0}</div>
                    <div>Sesiones de Caja: ${stats.cash_sessions || 0}</div>
                    <div>Movimientos de Caja: ${stats.cash_movements || 0}</div>
                </div>
                <div style="font-size: 9px; color: var(--color-text-secondary); border-top: 1px solid var(--color-border-light); padding-top: var(--spacing-xs); margin-top: var(--spacing-xs);">
                    Tamaño estimado: ${dbSize}
                </div>
            `;
        } catch (e) {
            statsContainer.innerHTML = '<div style="color: var(--color-danger);">Error al cargar estadísticas</div>';
        }
    },

    async estimateDatabaseSize() {
        try {
            // Estimación simple basada en número de registros
            const stores = ['sales', 'inventory_items', 'customers', 'repairs', 'cost_entries', 'employees', 'users'];
            let totalRecords = 0;
            
            for (const store of stores) {
                try {
                    const items = await DB.getAll(store) || [];
                    totalRecords += items.length;
                } catch (e) {
                    // Ignorar errores
                }
            }

            // Estimación aproximada: ~2KB por registro promedio
            const estimatedSizeKB = Math.round((totalRecords * 2) / 1024);
            if (estimatedSizeKB < 1024) {
                return `${estimatedSizeKB} KB`;
            } else {
                return `${(estimatedSizeKB / 1024).toFixed(2)} MB`;
            }
        } catch (e) {
            return 'N/A';
        }
    },

    getArrivalRatesTab() {
        return `
            <div style="display: grid; grid-template-columns: 1fr; gap: var(--spacing-md);">
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md);">
                        <h3 style="margin: 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            <i class="fas fa-table"></i> Reglas de Llegadas
                        </h3>
                        <button class="btn-primary btn-sm" id="arrival-rate-add-btn">
                            <i class="fas fa-plus"></i> Nueva Regla
                        </button>
                    </div>
                    <div id="arrival-rates-list" style="max-height: 600px; overflow-y: auto; width: 100%; overflow-x: auto;"></div>
                </div>
            </div>
        `;
    },

    async loadArrivalRates() {
        document.getElementById('arrival-rate-add-btn')?.addEventListener('click', () => this.showArrivalRateForm());

        try {
            const rules = await DB.getAll('arrival_rate_rules') || [];
            const agencies = await DB.getAll('catalog_agencies') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            
            // Ordenar de manera organizada: Agencia > Sucursal > Pasajeros Mín > Tipo Unidad > Vigencia
            rules.sort((a, b) => {
                // 1. Por agencia (alfabético)
                const agencyA = agencies.find(ag => ag.id === a.agency_id);
                const agencyB = agencies.find(ag => ag.id === b.agency_id);
                const agencyNameA = agencyA?.name || a.agency_id || '';
                const agencyNameB = agencyB?.name || b.agency_id || '';
                if (agencyNameA !== agencyNameB) {
                    return agencyNameA.localeCompare(agencyNameB);
                }
                
                // 2. Por sucursal (alfabético, "Todas" al final)
                const branchA = branches.find(br => br.id === a.branch_id);
                const branchB = branches.find(br => br.id === b.branch_id);
                const branchNameA = branchA?.name || (a.branch_id ? a.branch_id : 'ZZZ_Todas');
                const branchNameB = branchB?.name || (b.branch_id ? b.branch_id : 'ZZZ_Todas');
                if (branchNameA !== branchNameB) {
                    return branchNameA.localeCompare(branchNameB);
                }
                
                // 3. Por pasajeros mínimos (ascendente)
                const minPaxA = a.min_passengers || 0;
                const minPaxB = b.min_passengers || 0;
                if (minPaxA !== minPaxB) {
                    return minPaxA - minPaxB;
                }
                
                // 4. Por tipo de unidad (alfabético, null al final)
                const unitTypeA = a.unit_type || 'zzz_cualquiera';
                const unitTypeB = b.unit_type || 'zzz_cualquiera';
                if (unitTypeA !== unitTypeB) {
                    return unitTypeA.localeCompare(unitTypeB);
                }
                
                // 5. Por vigencia desde (más reciente primero)
                const dateA = new Date(a.active_from || 0);
                const dateB = new Date(b.active_from || 0);
                return dateB - dateA;
            });

            this.displayArrivalRates(rules);
        } catch (e) {
            console.error('Error loading arrival rates:', e);
            Utils.showNotification('Error al cargar reglas de llegadas', 'error');
        }
    },

    async displayArrivalRates(rules) {
        const container = document.getElementById('arrival-rates-list');
        if (!container) return;

        if (rules.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay reglas de llegadas registradas</div>';
            return;
        }

        const agencies = await DB.getAll('catalog_agencies') || [];
        const branches = await DB.getAll('catalog_branches') || [];

        // Agrupar por agencia para mejor visualización
        const groupedByAgency = {};
        rules.forEach(rule => {
            const agencyId = rule.agency_id || 'sin_agencia';
            if (!groupedByAgency[agencyId]) {
                groupedByAgency[agencyId] = [];
            }
            groupedByAgency[agencyId].push(rule);
        });

        container.innerHTML = `
            <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 800px;">
                <thead>
                    <tr style="background: var(--color-bg-secondary);">
                        <th style="font-weight: 600;">Agencia</th>
                        <th style="font-weight: 600;">Sucursal</th>
                        <th style="font-weight: 600;">Pasajeros</th>
                        <th style="font-weight: 600;">Tipo Unidad</th>
                        <th style="font-weight: 600;">Tarifa por PAX</th>
                        <th style="font-weight: 600;">Vigencia Desde</th>
                        <th style="font-weight: 600;">Vigencia Hasta</th>
                        <th style="font-weight: 600;">Activa</th>
                        <th style="font-weight: 600;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.keys(groupedByAgency).map(agencyId => {
                        const agencyRules = groupedByAgency[agencyId];
                        const agency = agencies.find(a => a.id === agencyId);
                        const agencyName = agency?.name || agencyId;
                        
                        return agencyRules.map((rule, index) => {
                        const agency = agencies.find(a => a.id === rule.agency_id);
                        const branch = branches.find(b => b.id === rule.branch_id);
                        const unitTypeLabels = {
                            'city_tour': 'City Tour',
                            'sprinter': 'Sprinter',
                            'van': 'Van',
                            'truck': 'Camiones',
                            null: 'Cualquiera'
                        };
                        const isActive = !rule.active_until || new Date(rule.active_until) >= new Date();
                        const isFirstInGroup = index === 0;
                        
                        // Determinar cómo mostrar la tarifa
                        let feeDisplay = '';
                        if (rule.fee_type === 'flat' || rule.flat_fee) {
                            feeDisplay = Utils.formatCurrency(rule.flat_fee || 0);
                            if (rule.extra_per_passenger && rule.extra_per_passenger > 0) {
                                feeDisplay += ` <small style="color: var(--color-accent);">+${Utils.formatCurrency(rule.extra_per_passenger)}/PAX extra</small>`;
                            }
                        } else {
                            feeDisplay = `${Utils.formatCurrency(rule.rate_per_passenger || 0)}/PAX`;
                        }

                        return `
                            <tr style="${isFirstInGroup ? 'border-top: 2px solid var(--color-primary);' : ''}">
                                <td style="${isFirstInGroup ? 'font-weight: 600; background: var(--color-bg-secondary);' : ''}">
                                    ${isFirstInGroup ? agencyName : ''}
                                </td>
                                <td>${branch?.name || rule.branch_id || 'Todas'}</td>
                                <td>${rule.min_passengers || 1} - ${rule.max_passengers || '∞'}</td>
                                <td>${unitTypeLabels[rule.unit_type] || 'Cualquiera'}</td>
                                <td style="font-weight: 600;">${feeDisplay}</td>
                                <td>${Utils.formatDate(rule.active_from, 'DD/MM/YYYY')}</td>
                                <td>${rule.active_until ? Utils.formatDate(rule.active_until, 'DD/MM/YYYY') : 'Sin límite'}</td>
                                <td>${isActive ? '<span class="status-badge status-disponible">Sí</span>' : '<span class="status-badge status-reservado">No</span>'}</td>
                                <td style="white-space: nowrap;">
                                    <button class="btn-secondary btn-xs" onclick="window.Settings.editArrivalRate('${rule.id}')">
                                        <i class="fas fa-edit"></i> Editar
                                    </button>
                                    <button class="btn-danger btn-xs" onclick="window.Settings.deleteArrivalRate('${rule.id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `;
                        }).join('')}).join('')}
                </tbody>
            </table>
        `;
    },

    async showArrivalRateForm(ruleId = null) {
        const rule = ruleId ? await DB.get('arrival_rate_rules', ruleId) : null;
        const agencies = await DB.getAll('catalog_agencies') || [];
        const branches = await DB.getAll('catalog_branches') || [];

        const body = `
            <form id="arrival-rate-form" style="max-width: 600px;">
                <div class="form-group">
                    <label>Agencia *</label>
                    <select id="arrival-rate-agency" class="form-select" required>
                        <option value="">Seleccionar...</option>
                        ${agencies.map(a => `<option value="${a.id}" ${rule?.agency_id === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Sucursal</label>
                    <select id="arrival-rate-branch" class="form-select">
                        <option value="">Todas</option>
                        ${branches.map(b => `<option value="${b.id}" ${rule?.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Pasajeros Mínimos</label>
                    <input type="number" id="arrival-rate-min-pax" class="form-input" value="${rule?.min_passengers || 1}" min="1" required>
                </div>
                <div class="form-group">
                    <label>Pasajeros Máximos</label>
                    <input type="number" id="arrival-rate-max-pax" class="form-input" value="${rule?.max_passengers || ''}" min="1" placeholder="Sin límite">
                </div>
                <div class="form-group">
                    <label>Tipo de Unidad</label>
                    <select id="arrival-rate-unit-type" class="form-select">
                        ${typeof ArrivalRules !== 'undefined' && ArrivalRules.UNIT_TYPE_OPTIONS 
                            ? ArrivalRules.UNIT_TYPE_OPTIONS.map(opt => 
                                `<option value="${opt.value}" ${rule?.unit_type === opt.value || (!rule?.unit_type && opt.value === '') ? 'selected' : ''}>${opt.label}</option>`
                            ).join('')
                            : `
                                <option value="">Cualquiera</option>
                                <option value="city_tour" ${rule?.unit_type === 'city_tour' ? 'selected' : ''}>City Tour</option>
                                <option value="sprinter" ${rule?.unit_type === 'sprinter' ? 'selected' : ''}>Sprinter</option>
                                <option value="van" ${rule?.unit_type === 'van' ? 'selected' : ''}>Van</option>
                                <option value="truck" ${rule?.unit_type === 'truck' ? 'selected' : ''}>Camiones</option>
                            `
                        }
                    </select>
                </div>
                <div class="form-group">
                    <label>Tipo de Tarifa *</label>
                    <select id="arrival-rate-fee-type" class="form-select" required>
                        <option value="flat" ${rule?.fee_type === 'flat' || rule?.flat_fee ? 'selected' : ''}>Tarifa Fija</option>
                        <option value="per_passenger" ${rule?.fee_type === 'per_passenger' || (!rule?.fee_type && !rule?.flat_fee) ? 'selected' : ''}>Por Pasajero</option>
                    </select>
                </div>
                <div class="form-group" id="arrival-rate-flat-fee-group" style="${rule?.fee_type === 'flat' || rule?.flat_fee ? '' : 'display: none;'}">
                    <label>Tarifa Fija (MXN) *</label>
                    <input type="number" id="arrival-rate-flat-fee" class="form-input" step="0.01" value="${rule?.flat_fee || 0}" min="0">
                </div>
                <div class="form-group" id="arrival-rate-per-pax-group" style="${rule?.fee_type === 'per_passenger' || (!rule?.fee_type && !rule?.flat_fee) ? '' : 'display: none;'}">
                    <label>Tarifa por Pasajero (MXN) *</label>
                    <input type="number" id="arrival-rate-amount" class="form-input" step="0.01" value="${rule?.rate_per_passenger || 0}" min="0">
                </div>
                <div class="form-group">
                    <label>Extra por Pasajero Adicional (MXN)</label>
                    <input type="number" id="arrival-rate-extra-per-pax" class="form-input" step="0.01" value="${rule?.extra_per_passenger || 0}" min="0" placeholder="0">
                    <small style="color: var(--color-text-secondary); font-size: 10px;">Se aplica cuando se excede el máximo de pasajeros del rango</small>
                </div>
                <div class="form-group">
                    <label>Vigencia Desde *</label>
                    <input type="date" id="arrival-rate-from" class="form-input" value="${rule?.active_from ? Utils.formatDate(rule.active_from, 'YYYY-MM-DD') : Utils.formatDate(new Date(), 'YYYY-MM-DD')}" required>
                </div>
                <div class="form-group">
                    <label>Vigencia Hasta</label>
                    <input type="date" id="arrival-rate-until" class="form-input" value="${rule?.active_until ? Utils.formatDate(rule.active_until, 'YYYY-MM-DD') : ''}" placeholder="Sin límite">
                </div>
                <div class="form-group">
                    <label>Notas</label>
                    <textarea id="arrival-rate-notes" class="form-input" rows="3" style="resize: vertical;">${rule?.notes || ''}</textarea>
                </div>
            </form>
        `;

        UI.showModal(ruleId ? 'Editar Regla de Llegadas' : 'Nueva Regla de Llegadas', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
            { text: 'Guardar', class: 'btn-primary', onclick: () => this.saveArrivalRate(ruleId) }
        ]);
        
        // Event listener para mostrar/ocultar campos según tipo de tarifa
        const feeTypeSelect = document.getElementById('arrival-rate-fee-type');
        const flatFeeGroup = document.getElementById('arrival-rate-flat-fee-group');
        const perPaxGroup = document.getElementById('arrival-rate-per-pax-group');
        
        if (feeTypeSelect) {
            feeTypeSelect.addEventListener('change', () => {
                const feeType = feeTypeSelect.value;
                if (feeType === 'flat') {
                    flatFeeGroup.style.display = 'block';
                    perPaxGroup.style.display = 'none';
                    document.getElementById('arrival-rate-flat-fee')?.setAttribute('required', 'required');
                    document.getElementById('arrival-rate-amount')?.removeAttribute('required');
                } else {
                    flatFeeGroup.style.display = 'none';
                    perPaxGroup.style.display = 'block';
                    document.getElementById('arrival-rate-amount')?.setAttribute('required', 'required');
                    document.getElementById('arrival-rate-flat-fee')?.removeAttribute('required');
                }
            });
            // Trigger inicial
            feeTypeSelect.dispatchEvent(new Event('change'));
        }
    },

    async saveArrivalRate(ruleId = null) {
        try {
            const form = document.getElementById('arrival-rate-form');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const feeType = document.getElementById('arrival-rate-fee-type').value;
            const flatFee = feeType === 'flat' ? parseFloat(document.getElementById('arrival-rate-flat-fee').value) : 0;
            const ratePerPax = feeType === 'per_passenger' ? parseFloat(document.getElementById('arrival-rate-amount').value) : 0;
            const extraPerPax = parseFloat(document.getElementById('arrival-rate-extra-per-pax').value) || 0;

            const rule = {
                id: ruleId || Utils.generateId(),
                agency_id: document.getElementById('arrival-rate-agency').value,
                branch_id: document.getElementById('arrival-rate-branch').value || null,
                min_passengers: parseInt(document.getElementById('arrival-rate-min-pax').value) || 1,
                max_passengers: document.getElementById('arrival-rate-max-pax').value ? parseInt(document.getElementById('arrival-rate-max-pax').value) : null,
                unit_type: (() => {
                    const value = document.getElementById('arrival-rate-unit-type').value;
                    // Convertir string vacío a null para consistencia con el sistema
                    return value === '' ? null : value;
                })(),
                fee_type: feeType,
                rate_per_passenger: ratePerPax,
                flat_fee: flatFee,
                extra_per_passenger: extraPerPax > 0 ? extraPerPax : null,
                active_from: document.getElementById('arrival-rate-from').value,
                active_until: document.getElementById('arrival-rate-until').value || null,
                notes: document.getElementById('arrival-rate-notes').value || '',
                created_at: ruleId ? (await DB.get('arrival_rate_rules', ruleId))?.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('arrival_rate_rules', rule);
            await SyncManager.addToQueue('arrival_rate_rule', rule.id);
            
            Utils.showNotification('Regla de llegadas guardada', 'success');
            UI.closeModal();
            await this.loadArrivalRates();
        } catch (e) {
            console.error('Error saving arrival rate:', e);
            Utils.showNotification('Error al guardar regla de llegadas', 'error');
        }
    },

    async editArrivalRate(ruleId) {
        await this.showArrivalRateForm(ruleId);
    },

    async deleteArrivalRate(ruleId) {
        if (!await Utils.confirm('¿Estás seguro de eliminar esta regla de llegadas?')) return;

        try {
            await DB.delete('arrival_rate_rules', ruleId);
            await SyncManager.addToQueue('arrival_rate_rule', ruleId, 'delete');
            Utils.showNotification('Regla eliminada', 'success');
            await this.loadArrivalRates();
        } catch (e) {
            console.error('Error deleting arrival rate:', e);
            Utils.showNotification('Error al eliminar regla', 'error');
        }
    },

    /**
     * Carga 20 datos demo completos para validar todo el flujo del sistema
     */
    async loadDemoData() {
        if (!await Utils.confirm('¿Cargar datos demo completos? Esto creará datos para todos los módulos del sistema.')) {
            return;
        }

        try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:1889',message:'loadDemoData START',data:{timestamp:new Date().toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // Verificar que los módulos necesarios estén disponibles
            if (typeof ArrivalRules === 'undefined') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:1896',message:'ArrivalRules undefined',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                Utils.showNotification('Error: Módulo ArrivalRules no está disponible', 'error');
                return;
            }
            if (typeof SyncManager === 'undefined') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:1900',message:'SyncManager undefined',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                Utils.showNotification('Error: Módulo SyncManager no está disponible', 'error');
                return;
            }

            Utils.showNotification('Cargando datos demo...', 'info');
            
            // Validar y obtener sucursal
            let branchId = typeof BranchManager !== 'undefined' 
                ? BranchManager.getCurrentBranchId()
                : localStorage.getItem('current_branch_id');
            
            // Si no hay sucursal, obtener o crear una por defecto
            if (!branchId && typeof BranchValidator !== 'undefined') {
                branchId = await BranchValidator.getOrCreateDefaultBranch();
            }
            
            if (!branchId) {
                Utils.showNotification('Error: No se pudo obtener una sucursal. Crea una sucursal primero.', 'error');
                return;
            }
            
            // Validar que la sucursal exista
            const branch = await DB.get('catalog_branches', branchId);
            if (!branch) {
                Utils.showNotification(`Error: Sucursal ${branchId} no encontrada.`, 'error');
                return;
            }
            const today = new Date();
            const actions = [];
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:1906',message:'Parameters initialized',data:{branchId,today:today.toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // 1. Reglas de tarifas de llegadas (5 reglas)
            const agencies = await DB.getAll('catalog_agencies') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            const targetAgencies = ['TRAVELEX', 'VERANOS', 'TANITOURS', 'DISCOVERY', 'TB'];
            
            for (let i = 0; i < 5; i++) {
                const agency = agencies.find(a => targetAgencies.includes(a.name.toUpperCase())) || agencies[0];
                const branch = branches[i % branches.length] || branches[0];
                
                const rule = {
                    id: Utils.generateId(),
                    agency_id: agency?.id || 'agency1',
                    branch_id: branch?.id || branchId,
                    min_passengers: [1, 5, 10, 15, 20][i],
                    max_passengers: [4, 9, 14, 19, null][i],
                    unit_type: ['city_tour', 'sprinter', 'van', 'truck', 'city_tour'][i],
                    rate_per_passenger: [150, 120, 100, 90, 150][i],
                    active_from: Utils.formatDate(new Date(today.getTime() - (i * 30 * 24 * 60 * 60 * 1000)), 'YYYY-MM-DD'),
                    active_until: i === 0 ? null : Utils.formatDate(new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)), 'YYYY-MM-DD'),
                    notes: `Regla demo ${i + 1} - ${agency?.name || 'Agencia'} - ${branch?.name || 'Sucursal'}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.put('arrival_rate_rules', rule);
                await SyncManager.addToQueue('arrival_rate_rule', rule.id);
                actions.push(`✓ Regla de tarifa ${i + 1} creada`);
            }

            // 2. Llegadas de agencias (5 llegadas)
            for (let i = 0; i < 5; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = Utils.formatDate(date, 'YYYY-MM-DD');
                const agency = agencies.find(a => targetAgencies.includes(a.name.toUpperCase())) || agencies[i % agencies.length];
                const passengers = [15, 25, 30, 20, 35][i];
                const unitType = ['city_tour', 'sprinter', 'van', 'truck', 'city_tour'][i];
                
                // Calcular tarifa
                const calculation = await ArrivalRules.calculateArrivalFee(
                    agency?.id || 'agency1',
                    branchId,
                    passengers,
                    unitType,
                    dateStr
                );
                
                const arrival = {
                    id: Utils.generateId(),
                    date: dateStr,
                    branch_id: branchId,
                    agency_id: agency?.id || 'agency1',
                    passengers: passengers,
                    units: Math.ceil(passengers / 15),
                    unit_type: unitType,
                    calculated_fee: calculation.calculatedFee || (passengers * 120),
                    override: false,
                    arrival_fee: calculation.calculatedFee || (passengers * 120),
                    notes: `Llegada demo ${i + 1} - ${agency?.name || 'Agencia'}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.put('agency_arrivals', arrival);
                await SyncManager.addToQueue('agency_arrival', arrival.id);
                
                // Registrar costo de pago de llegadas automáticamente
                if (typeof Costs !== 'undefined' && arrival.arrival_fee > 0) {
                    await Costs.registerArrivalPayment(
                        arrival.id,
                        arrival.arrival_fee,
                        arrival.branch_id,
                        arrival.agency_id,
                        arrival.passengers
                    );
                }
                
                actions.push(`✓ Llegada ${i + 1} (${passengers} PAX) creada`);
            }

            // 3. Reportes de utilidad diaria (3 reportes)
            for (let i = 0; i < 3; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = Utils.formatDate(date, 'YYYY-MM-DD');
                
                // Obtener llegadas del día
                const dayArrivals = await DB.query('agency_arrivals', 'date', dateStr) || [];
                const dayArrivalsFiltered = dayArrivals.filter(a => a.branch_id === branchId || !a.branch_id);
                const arrivalCosts = dayArrivalsFiltered.reduce((sum, a) => sum + (a.arrival_fee || 0), 0);
                const totalPassengers = dayArrivalsFiltered.reduce((sum, a) => sum + (a.passengers || 0), 0);
                
                // Obtener ventas del día
                const allSales = await DB.getAll('sales') || [];
                const daySales = allSales.filter(s => {
                    if (!s.created_at) return false;
                    const saleDate = s.created_at.split('T')[0];
                    return saleDate === dateStr && s.branch_id === branchId && s.status === 'completada';
                });
                const revenue = daySales.reduce((sum, s) => sum + (s.total || 0), 0);
                
                // Obtener costos del día (prorrateados, filtrados por sucursal)
                const allCosts = await DB.getAll('cost_entries', null, null, { 
                    filterByBranch: false, // Desactivar porque ya filtramos manualmente
                    branchIdField: 'branch_id' 
                }) || [];
                const dayCosts = allCosts.filter(c => {
                    const costDate = new Date(c.date || c.created_at);
                    return costDate.toISOString().split('T')[0] === dateStr && 
                           (c.branch_id === branchId || !c.branch_id);
                });
                let operatingCosts = dayCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
                
                // Agregar prorrateo de costos recurrentes
                const recurringCosts = allCosts.filter(c => c.recurring === true);
                for (const cost of recurringCosts) {
                    if (cost.branch_id && cost.branch_id !== branchId) continue;
                    
                    let dailyProrate = 0;
                    if (cost.period_type === 'daily') {
                        dailyProrate = cost.amount || 0;
                    } else if (cost.period_type === 'weekly') {
                        dailyProrate = (cost.amount || 0) / 7;
                    } else if (cost.period_type === 'monthly') {
                        const costDate = new Date(cost.date || cost.created_at);
                        const daysInMonth = new Date(costDate.getFullYear(), costDate.getMonth() + 1, 0).getDate();
                        dailyProrate = (cost.amount || 0) / daysInMonth;
                    }
                    operatingCosts += dailyProrate;
                }
                
                // Calcular costo de mercancía vendida (COGS - Cost of Goods Sold)
                const saleItems = await DB.getAll('sale_items') || [];
                const allPayments = await DB.getAll('payments') || [];
                let merchandiseCost = 0; // COGS
                let commissions = 0;
                let bankCommissions = 0; // Comisiones bancarias
                
                for (const sale of daySales) {
                    const items = saleItems.filter(si => si.sale_id === sale.id);
                    for (const item of items) {
                        // Sumar costo de mercancía: costo unitario × cantidad
                        const itemCost = item.cost || 0; // Costo de adquisición del item
                        merchandiseCost += itemCost * (item.quantity || 1);
                        
                        // Sumar comisiones
                        if (item.commission_amount) {
                            commissions += item.commission_amount;
                        }
                    }
                    
                    // Sumar comisiones bancarias de los pagos de esta venta
                    const salePayments = allPayments.filter(p => p.sale_id === sale.id);
                    for (const payment of salePayments) {
                        if (payment.bank_commission) {
                            bankCommissions += payment.bank_commission;
                        }
                    }
                }
                
                // Calcular utilidad bruta: Ingresos - COGS - Costos de Llegadas - Costos Operativos
                const grossProfit = revenue - merchandiseCost - arrivalCosts - operatingCosts;
                // Calcular utilidad neta: Utilidad Bruta - Comisiones - Comisiones Bancarias
                const netProfit = grossProfit - commissions - bankCommissions;
                
                const profitReport = {
                    id: Utils.generateId(),
                    date: dateStr,
                    branch_id: branchId,
                    revenue: revenue,
                    merchandise_cost: merchandiseCost, // COGS - Costo de mercancía vendida
                    arrival_costs: arrivalCosts,
                    operating_costs: operatingCosts,
                    commissions: commissions,
                    bank_commissions: bankCommissions, // Comisiones bancarias
                    gross_profit: grossProfit,
                    net_profit: netProfit,
                    total_passengers: totalPassengers,
                    total_sales: daySales.length,
                    notes: `Reporte demo ${i + 1} - ${dateStr}`,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.put('daily_profit_reports', profitReport);
                await SyncManager.addToQueue('daily_profit_report', profitReport.id);
                actions.push(`✓ Reporte utilidad ${i + 1} (${Utils.formatCurrency(netProfit)}) creado`);
            }

            // 4. Costos recurrentes (3 costos)
            const recurringCategories = ['nomina', 'renta', 'luz'];
            for (let i = 0; i < 3; i++) {
                const cost = {
                    id: Utils.generateId(),
                    type: 'fijo',
                    category: recurringCategories[i],
                    amount: [5000, 15000, 2000][i],
                    branch_id: i === 0 ? branchId : null, // Nómina por tienda, otros generales
                    date: Utils.formatDate(today, 'YYYY-MM-DD'),
                    period_type: i === 0 ? 'weekly' : 'monthly',
                    recurring: true,
                    auto_generate: true,
                    notes: `Costo recurrente demo ${i + 1} - ${recurringCategories[i]}`,
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.put('cost_entries', cost);
                await SyncManager.addToQueue('cost_entry', cost.id);
                actions.push(`✓ Costo recurrente ${i + 1} (${recurringCategories[i]}) creado`);
            }

            // 5. Costos normales (2 costos)
            for (let i = 0; i < 2; i++) {
                const cost = {
                    id: Utils.generateId(),
                    type: 'variable',
                    category: ['despensa', 'mantenimiento'][i],
                    amount: [800, 1200][i],
                    branch_id: branchId,
                    date: Utils.formatDate(new Date(today.getTime() - (i * 2 * 24 * 60 * 60 * 1000)), 'YYYY-MM-DD'),
                    period_type: 'one_time',
                    recurring: false,
                    notes: `Costo demo ${i + 1} - ${['despensa', 'mantenimiento'][i]}`,
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                };
                await DB.put('cost_entries', cost);
                await SyncManager.addToQueue('cost_entry', cost.id);
                actions.push(`✓ Costo normal ${i + 1} creado`);
            }

            // 6. Productos de inventario (5 productos)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2105',message:'Starting inventory items generation',data:{count:5},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const metals = ['Oro', 'Plata', 'Oro Rosa'];
            const stones = ['Diamante', 'Zafiro', 'Rubí', 'Esmeralda', 'Perla'];
            const sizes = ['6', '7', '8', '9', '10'];
            
            for (let i = 0; i < 5; i++) {
                try {
                    const sku = `DEMO-${String(1000 + i)}`;
                    const barcode = `DEMO${String(1000 + i).padStart(8, '0')}`;
                    
                    // Verificar si el SKU ya existe
                    const existingBySku = await DB.query('inventory_items', 'sku', sku);
                    if (existingBySku && existingBySku.length > 0) {
                        console.log(`SKU ${sku} ya existe, omitiendo creación`);
                        continue;
                    }
                    
                    // Verificar si el barcode ya existe
                    const existingByBarcode = await DB.query('inventory_items', 'barcode', barcode);
                    if (existingByBarcode && existingByBarcode.length > 0) {
                        console.log(`Barcode ${barcode} ya existe, omitiendo creación`);
                        continue;
                    }
                    
                    const inventoryItem = {
                        id: Utils.generateId(),
                        sku: sku,
                        barcode: barcode,
                        name: `${metals[i % metals.length]} con ${stones[i % stones.length]} - Demo ${i + 1}`,
                        metal: metals[i % metals.length],
                        stone: stones[i % stones.length],
                        size: sizes[i % sizes.length],
                        weight_g: [5.5, 8.2, 12.3, 15.7, 20.1][i],
                        measurements: `${[10, 12, 14, 16, 18][i]}mm x ${[8, 10, 12, 14, 16][i]}mm`,
                        cost: [2000, 3500, 5000, 7500, 10000][i],
                        price: [5000, 8000, 12000, 18000, 25000][i],
                        location: `Estante ${i + 1}`,
                        status: 'disponible',
                        branch_id: branchId,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        sync_status: 'pending'
                    };
                    await DB.put('inventory_items', inventoryItem);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2120',message:'Inventory item saved',data:{id:inventoryItem.id,sku:inventoryItem.sku},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    await SyncManager.addToQueue('inventory_item', inventoryItem.id);
                    actions.push(`✓ Producto ${i + 1} (${inventoryItem.name}) creado`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2125',message:'Error creating inventory item',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating inventory item ${i + 1}:`, e);
                }
            }

            // 7. Clientes (3 clientes)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2130',message:'Starting customers generation',data:{count:3},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const customerNames = ['María González', 'Juan Pérez', 'Ana Martínez'];
            const customerPhones = ['3312345678', '3323456789', '3334567890'];
            const customerEmails = ['maria@demo.com', 'juan@demo.com', 'ana@demo.com'];
            
            for (let i = 0; i < 3; i++) {
                try {
                    const customer = {
                        id: Utils.generateId(),
                        name: customerNames[i],
                        phone: customerPhones[i],
                        email: customerEmails[i],
                        address: `Calle Demo ${i + 1} #${100 + i}, Guadalajara`,
                        notes: `Cliente demo ${i + 1}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        sync_status: 'pending'
                    };
                    await DB.put('customers', customer);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2145',message:'Customer saved',data:{id:customer.id,name:customer.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    await SyncManager.addToQueue('customer', customer.id);
                    actions.push(`✓ Cliente ${i + 1} (${customer.name}) creado`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2150',message:'Error creating customer',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating customer ${i + 1}:`, e);
                }
            }

            // 8. Reparaciones (2 reparaciones)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2155',message:'Starting repairs generation',data:{count:2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const allCustomers = await DB.getAll('customers') || [];
            const allInventoryItems = await DB.getAll('inventory_items') || [];
            
            for (let i = 0; i < 2; i++) {
                try {
                    const customer = allCustomers[i % allCustomers.length] || allCustomers[0];
                    const item = allInventoryItems[i % allInventoryItems.length] || allInventoryItems[0];
                    
                    const repair = {
                        id: Utils.generateId(),
                        folio: `REP-DEMO-${String(Date.now()).slice(-6)}-${i + 1}`,
                        customer_id: customer?.id || null,
                        item_id: item?.id || null,
                        description: `Reparación demo ${i + 1}: ${['Ajuste de talla', 'Soldadura de eslabón'][i]}`,
                        status: ['en_proceso', 'completada'][i],
                        cost: [500, 800][i],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        sync_status: 'pending'
                    };
                    await DB.put('repairs', repair);
                    await SyncManager.addToQueue('repair', repair.id);
                    actions.push(`✓ Reparación ${i + 1} (${repair.folio}) creada`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2175',message:'Error creating repair',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating repair ${i + 1}:`, e);
                }
            }

            // 9. Ventas relacionadas (3 ventas con pagos e items)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2180',message:'Starting sales generation',data:{count:3},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const sellers = await DB.getAll('catalog_sellers') || [];
            const guides = await DB.getAll('catalog_guides') || [];
            const inventoryItems = await DB.getAll('inventory_items') || [];
            
            for (let i = 0; i < 3; i++) {
                try {
                    const saleDate = new Date(today);
                    saleDate.setDate(saleDate.getDate() - i);
                    const saleDateStr = saleDate.toISOString();
                    
                    const seller = sellers[i % sellers.length] || sellers[0];
                    const guide = guides[i % guides.length] || guides[0];
                    const agency = agencies[i % agencies.length] || agencies[0];
                    const customer = allCustomers[i % allCustomers.length] || allCustomers[0];
                    
                    const sale = {
                        id: Utils.generateId(),
                        folio: `DEMO-${String(Date.now()).slice(-6)}-${i + 1}`,
                        branch_id: branchId,
                        seller_id: seller?.id || null,
                        guide_id: guide?.id || null,
                        agency_id: agency?.id || null,
                        customer_id: customer?.id || null,
                        passengers: [2, 4, 3][i],
                        currency: 'MXN',
                        exchange_rate: 1,
                        subtotal: [5000, 8000, 6000][i],
                        discount: 0,
                        total: [5000, 8000, 6000][i],
                        status: 'completada',
                        notes: `Venta demo ${i + 1}`,
                        created_at: saleDateStr,
                        updated_at: saleDateStr,
                        sync_status: 'pending'
                    };
                    await DB.put('sales', sale);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2215',message:'Sale saved',data:{id:sale.id,folio:sale.folio,total:sale.total},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    await SyncManager.addToQueue('sale', sale.id);
                    
                    // Agregar items de venta
                    if (inventoryItems.length > 0) {
                        const item = inventoryItems[i % inventoryItems.length];
                        const saleItem = {
                            id: Utils.generateId(),
                            sale_id: sale.id,
                            item_id: item.id,
                            quantity: 1,
                            price: sale.subtotal,
                            discount: 0,
                            subtotal: sale.subtotal,
                            commission_amount: sale.subtotal * 0.05,
                            created_at: saleDateStr
                        };
                        await DB.put('sale_items', saleItem);
                    }
                    
                    // Agregar pago
                    const payment = {
                        id: Utils.generateId(),
                        sale_id: sale.id,
                        method: ['cash', 'card', 'cash'][i],
                        amount: sale.total,
                        currency: 'MXN',
                        exchange_rate: 1,
                        created_at: saleDateStr,
                        sync_status: 'pending'
                    };
                    await DB.put('payments', payment);
                    await SyncManager.addToQueue('payment', payment.id);
                    
                    actions.push(`✓ Venta ${i + 1} (${Utils.formatCurrency(sale.total)}) con pago creada`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2235',message:'Error creating sale',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating sale ${i + 1}:`, e);
                }
            }

            // 10. Reportes turistas completos (2 reportes con líneas)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2240',message:'Starting tourist reports generation',data:{count:2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const allSales = await DB.getAll('sales') || [];
            
            for (let i = 0; i < 2; i++) {
                try {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    const dateStr = Utils.formatDate(date, 'YYYY-MM-DD');
                    
                    const report = {
                        id: Utils.generateId(),
                        date: dateStr,
                        branch_id: branchId,
                        exchange_rate: 20.0,
                        status: 'completado',
                        observations: `Reporte demo ${i + 1}`,
                        total_cash_usd: [100, 150][i],
                        total_cash_mxn: [2000, 3000][i],
                        total_cash_cad: 0,
                        subtotal: [2000, 3000][i],
                        additional: 0,
                        total: [2000, 3000][i],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        sync_status: 'pending'
                    };
                    await DB.put('tourist_reports', report);
                    await SyncManager.addToQueue('tourist_report', report.id);
                    
                    // Agregar líneas del reporte
                    const reportSales = allSales.filter(s => {
                        if (!s.created_at) return false;
                        return s.created_at.split('T')[0] === dateStr;
                    }).slice(0, 2);
                    
                    for (const sale of reportSales) {
                        const line = {
                            id: Utils.generateId(),
                            report_id: report.id,
                            sale_id: sale.id,
                            identification: `DEMO-${i + 1}-${sale.id.slice(0, 6)}`,
                            seller_id: sale.seller_id,
                            guide_id: sale.guide_id,
                            agency_id: sale.agency_id,
                            quantity: sale.passengers || 1,
                            weight_g: 0,
                            products: 'Producto demo',
                            exchange_rate: 20.0,
                            cash_eur: 0,
                            cash_cad: 0,
                            cash_usd: [50, 75][i],
                            cash_mxn: [1000, 1500][i],
                            tpv_visa_mc: 0,
                            tpv_amex: 0,
                            total: sale.total || 0,
                            created_at: new Date().toISOString()
                        };
                        await DB.put('tourist_report_lines', line);
                    }
                    
                    actions.push(`✓ Reporte turista ${i + 1} con ${reportSales.length} líneas creado`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2290',message:'Error creating tourist report',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating tourist report ${i + 1}:`, e);
                }
            }

            // 11. Sesiones de caja (2 sesiones)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2295',message:'Starting cash sessions generation',data:{count:2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const users = await DB.getAll('users') || [];
            const currentUser = users[0] || { id: 'user1' };
            
            for (let i = 0; i < 2; i++) {
                try {
                    const sessionDate = new Date(today);
                    sessionDate.setDate(sessionDate.getDate() - i);
                    const sessionDateStr = sessionDate.toISOString();
                    
                    const session = {
                        id: Utils.generateId(),
                        branch_id: branchId,
                        user_id: currentUser.id,
                        opened_at: sessionDateStr,
                        closed_at: i === 0 ? null : new Date(sessionDate.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
                        initial_cash_usd: [100, 150][i],
                        initial_cash_mxn: [2000, 3000][i],
                        initial_cash_cad: 0,
                        final_cash_usd: i === 0 ? null : [150, 200][i],
                        final_cash_mxn: i === 0 ? null : [4000, 5000][i],
                        final_cash_cad: i === 0 ? null : 0,
                        status: i === 0 ? 'open' : 'closed',
                        notes: `Sesión demo ${i + 1}`,
                        created_at: sessionDateStr,
                        updated_at: sessionDateStr,
                        sync_status: 'pending'
                    };
                    await DB.put('cash_sessions', session);
                    await SyncManager.addToQueue('cash_session', session.id);
                    
                    // Agregar movimientos de caja para sesiones cerradas
                    if (i === 1) {
                        const movement = {
                            id: Utils.generateId(),
                            session_id: session.id,
                            type: 'income',
                            amount: 2000,
                            currency: 'MXN',
                            description: 'Movimiento demo',
                            created_at: sessionDateStr,
                            sync_status: 'pending'
                        };
                        await DB.put('cash_movements', movement);
                        await SyncManager.addToQueue('cash_movement', movement.id);
                    }
                    
                    actions.push(`✓ Sesión de caja ${i + 1} (${session.status}) creada`);
                } catch (e) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2335',message:'Error creating cash session',data:{index:i,error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error(`Error creating cash session ${i + 1}:`, e);
                }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2340',message:'loadDemoData COMPLETE',data:{totalActions:actions.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            // Verificar que los datos se guardaron correctamente
            const verifyInventory = await DB.getAll('inventory_items') || [];
            const verifyCustomers = await DB.getAll('customers') || [];
            const verifySales = await DB.getAll('sales') || [];
            const verifyRepairs = await DB.getAll('repairs') || [];
            const verifyTouristReports = await DB.getAll('tourist_reports') || [];
            const verifyCashSessions = await DB.getAll('cash_sessions') || [];
            const verifyArrivals = await DB.getAll('agency_arrivals') || [];
            const verifyArrivalRules = await DB.getAll('arrival_rate_rules') || [];
            const verifyProfitReports = await DB.getAll('daily_profit_reports') || [];
            const verifyCosts = await DB.getAll('cost_entries') || [];
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2452',message:'Data verification',data:{inventory:verifyInventory.length,customers:verifyCustomers.length,sales:verifySales.length,repairs:verifyRepairs.length,touristReports:verifyTouristReports.length,cashSessions:verifyCashSessions.length,arrivals:verifyArrivals.length,arrivalRules:verifyArrivalRules.length,profitReports:verifyProfitReports.length,costs:verifyCosts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion

            // Mostrar resumen con verificación
            const summary = `
                <div style="padding: var(--spacing-md); max-height: 400px; overflow-y: auto;">
                    <h3 style="margin-bottom: var(--spacing-md); color: var(--color-success);">
                        <i class="fas fa-check-circle"></i> Datos Demo Cargados Exitosamente
                    </h3>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-sm); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md);">
                        <strong>Total de acciones:</strong> ${actions.length}
                    </div>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-sm); border-radius: var(--radius-sm); margin-bottom: var(--spacing-md); font-size: 11px;">
                        <strong>Verificación en BD:</strong><br>
                        • Inventario: ${verifyInventory.length} productos<br>
                        • Clientes: ${verifyCustomers.length} clientes<br>
                        • Ventas: ${verifySales.length} ventas<br>
                        • Reparaciones: ${verifyRepairs.length} reparaciones<br>
                        • Reportes Turistas: ${verifyTouristReports.length} reportes<br>
                        • Sesiones Caja: ${verifyCashSessions.length} sesiones<br>
                        • Llegadas: ${verifyArrivals.length} llegadas<br>
                        • Reglas Tarifas: ${verifyArrivalRules.length} reglas<br>
                        • Reportes Utilidad: ${verifyProfitReports.length} reportes<br>
                        • Costos: ${verifyCosts.length} costos
                    </div>
                    <div style="display: flex; flex-direction: column; gap: var(--spacing-xs);">
                        ${actions.map(action => `
                            <div style="padding: var(--spacing-xs); background: var(--color-bg-card); border-radius: var(--radius-xs); font-size: 12px;">
                                ${action}
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-accent); color: white; border-radius: var(--radius-sm); font-size: 11px;">
                        <strong><i class="fas fa-lightbulb" style="margin-right: 4px;"></i>Siguiente paso:</strong> Revisa todos los módulos del sistema (Inventario, Clientes, Reparaciones, Ventas, Reporte Turistas, Caja, Costos, Dashboard) para validar el flujo completo.
                    </div>
                </div>
            `;

            UI.showModal('Datos Demo Cargados', summary, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);

            Utils.showNotification(`${actions.length} datos demo cargados exitosamente`, 'success');
            
            // Refrescar módulos activos manualmente
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2509',message:'Refreshing modules',data:{currentModule:localStorage.getItem('current_module')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            // Refrescar módulos según cuál esté activo
            try {
                const currentModule = localStorage.getItem('current_module') || '';
                if (currentModule === 'inventory' && typeof Inventory !== 'undefined' && Inventory.initialized) {
                    await Inventory.loadInventory();
                }
                if (currentModule === 'customers' && typeof Customers !== 'undefined' && Customers.initialized) {
                    await Customers.loadCustomers();
                }
                if (currentModule === 'repairs' && typeof Repairs !== 'undefined' && Repairs.initialized) {
                    await Repairs.loadRepairs();
                }
                if (currentModule === 'pos' && typeof POS !== 'undefined' && POS.initialized) {
                    await POS.loadProducts();
                }
                if (currentModule === 'costs' && typeof Costs !== 'undefined' && Costs.initialized) {
                    await Costs.loadCosts();
                }
                if (currentModule === 'cash' && typeof Cash !== 'undefined' && Cash.initialized) {
                    await Cash.loadCurrentSession();
                }
                if (currentModule === 'dashboard' && typeof Dashboard !== 'undefined' && Dashboard.initialized) {
                    await Dashboard.loadDashboard();
                }
            } catch (refreshError) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2535',message:'Error refreshing modules',data:{error:refreshError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                console.error('Error refreshing modules:', refreshError);
            }
            
            // Disparar evento para otros listeners
            window.dispatchEvent(new CustomEvent('demo-data-loaded'));
            
        } catch (e) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'settings.js:2455',message:'Error in loadDemoData',data:{error:e.message,stack:e.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            console.error('Error loading demo data:', e);
            Utils.showNotification('Error al cargar datos demo: ' + e.message, 'error');
        }
    },

    // Limpiar todos los datos mock/demo excepto usuarios y empleados
    async clearMockData() {
        const confirmed = await Utils.confirm(
            '¿Limpiar todos los datos mock?',
            'Esta acción eliminará TODOS los datos de prueba/demo del sistema EXCEPTO:\n\n✅ CONSERVADOS:\n- Usuarios y Empleados\n- Sucursales\n- Catálogos (Agencias, Guías, Vendedores)\n- Comisiones\n- Llegadas\n- Costos\n- Configuraciones (incluyendo tickets)\n- Códigos de Barras (historial)\n\n❌ ELIMINADOS:\n- Inventario\n- Ventas\n- Clientes\n- Reparaciones\n- Reportes\n- Y todos los demás datos mock\n\n¿Estás seguro?',
            'Limpiar Datos Mock',
            'Cancelar'
        );

        if (!confirmed) return;

        try {
            Utils.showNotification('Limpiando datos mock...', 'info');
            
            // Lista de stores a limpiar (EXCLUYENDO: users, employees, settings, device, audit_log, catalog_branches, commission_rules, agency_arrivals, cost_entries, catalog_agencies, catalog_guides, catalog_sellers, barcode_scan_history)
            // IMPORTANTE: NUNCA incluir stores protegidos en esta lista
            const storesToClear = [
                'inventory_items',
                'inventory_photos',
                'inventory_logs',
                'inventory_certificates',
                'inventory_price_history',
                'sales',
                'sale_items',
                'payments',
                'customers',
                'repairs',
                'repair_photos',
                // 'cost_entries', // NO ELIMINAR - Costos son datos reales
                'sync_queue',
                'sync_logs',
                'sync_deleted_items',
                'tourist_reports',
                'tourist_report_lines',
                'cash_sessions',
                'cash_movements',
                // 'barcode_scan_history', // NO ELIMINAR - Historial de códigos de barras es importante
                // 'catalog_agencies', // NO ELIMINAR - Catálogos son datos importantes
                // 'catalog_guides', // NO ELIMINAR - Catálogos son datos importantes
                // 'catalog_sellers', // NO ELIMINAR - Catálogos son datos importantes
                // 'catalog_branches', // NO ELIMINAR - Sucursales son datos reales
                'payment_methods',
                // 'commission_rules', // NO ELIMINAR - Comisiones son datos reales
                'arrival_rate_rules',
                // 'agency_arrivals', // NO ELIMINAR - Llegadas son datos reales
                'daily_profit_reports',
                'exchange_rates_daily',
                'inventory_transfers',
                'inventory_transfer_items',
                'qa_test_runs',
                'qa_coverage',
                'qa_errors',
                'qa_fixes'
            ];

            let clearedCount = 0;
            let errorCount = 0;

            // Abrir conexión directa a IndexedDB
            const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open('opal_pos_db');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!db) {
                throw new Error('No se pudo abrir la base de datos');
            }

            // VERIFICACIÓN DE SEGURIDAD: Nunca limpiar stores críticos
            // Incluye: usuarios, empleados, configuraciones, catálogos, códigos de barras, sucursales, comisiones, llegadas, costos
            const protectedStores = [
                'users', 
                'employees', 
                'catalog_branches', 
                'catalog_agencies', 
                'catalog_guides', 
                'catalog_sellers',
                'commission_rules', 
                'agency_arrivals', 
                'cost_entries', 
                'settings', 
                'device', 
                'audit_log',
                'barcode_scan_history'
            ];
            
            // Verificar que ningún store protegido esté en la lista
            const protectedInList = storesToClear.filter(store => protectedStores.includes(store));
            if (protectedInList.length > 0) {
                console.error('❌ ERROR CRÍTICO: Stores protegidos encontrados en lista de limpieza:', protectedInList);
                Utils.showNotification('Error: Se detectaron stores protegidos en la lista. La limpieza fue cancelada por seguridad.', 'error');
                return;
            }
            
            const storesToClearFiltered = storesToClear;

            // Limpiar cada store
            for (const storeName of storesToClearFiltered) {
                try {
                    if (db.objectStoreNames.contains(storeName)) {
                        const transaction = db.transaction([storeName], 'readwrite');
                        const store = transaction.objectStore(storeName);
                        const clearRequest = store.clear();
                        
                        await new Promise((resolve, reject) => {
                            clearRequest.onsuccess = () => resolve();
                            clearRequest.onerror = () => reject(clearRequest.error);
                        });
                        
                        clearedCount++;
                        console.log(`✅ Limpiado: ${storeName}`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Error limpiando ${storeName}:`, error);
                }
            }

            // Verificar que datos importantes siguen existiendo después de la limpieza
            const usersAfter = await DB.getAll('users') || [];
            const employeesAfter = await DB.getAll('employees') || [];
            const branchesAfter = await DB.getAll('catalog_branches') || [];
            const agenciesAfter = await DB.getAll('catalog_agencies') || [];
            const guidesAfter = await DB.getAll('catalog_guides') || [];
            const sellersAfter = await DB.getAll('catalog_sellers') || [];
            const commissionsAfter = await DB.getAll('commission_rules') || [];
            const arrivalsAfter = await DB.getAll('agency_arrivals') || [];
            const costsAfter = await DB.getAll('cost_entries') || [];
            const settingsAfter = await DB.getAll('settings') || [];
            const barcodeHistoryAfter = await DB.getAll('barcode_scan_history') || [];
            
            console.log(`✅ Verificación post-limpieza: ${usersAfter.length} usuarios, ${employeesAfter.length} empleados, ${branchesAfter.length} sucursales, ${agenciesAfter.length} agencias, ${guidesAfter.length} guías, ${sellersAfter.length} vendedores, ${commissionsAfter.length} comisiones, ${arrivalsAfter.length} llegadas, ${costsAfter.length} costos, ${settingsAfter.length} configuraciones, ${barcodeHistoryAfter.length} registros de códigos de barras`);
            
            if (usersAfter.length === 0) {
                console.error('❌ ERROR CRÍTICO: Todos los usuarios fueron eliminados!');
                Utils.showNotification('ERROR: Se detectó que todos los usuarios fueron eliminados. Esto no debería haber ocurrido.', 'error');
            }
            
            if (employeesAfter.length === 0) {
                console.error('❌ ERROR CRÍTICO: Todos los empleados fueron eliminados!');
                Utils.showNotification('ERROR: Se detectó que todos los empleados fueron eliminados. Esto no debería haber ocurrido.', 'error');
            }
            
            // Verificar que catálogos y configuraciones no fueron eliminados
            if (agenciesAfter.length === 0 || guidesAfter.length === 0 || sellersAfter.length === 0) {
                console.warn('⚠️ ADVERTENCIA: Algunos catálogos están vacíos después de la limpieza');
            }
            
            if (settingsAfter.length === 0) {
                console.error('❌ ERROR CRÍTICO: Todas las configuraciones fueron eliminadas!');
                Utils.showNotification('ERROR: Se detectó que todas las configuraciones fueron eliminadas. Esto no debería haber ocurrido.', 'error');
            }
            
            // Restaurar configuración básica si falta
            if (branchesAfter.length === 0 || commissionsAfter.length === 0) {
                console.log('⚠️ Detectada configuración faltante, restaurando...');
                await this.restoreSystemConfiguration();
            }
            
            // Nota: Las reglas de llegadas (arrival_rate_rules) se restauran automáticamente
            // cuando se cargan los catálogos mediante App.loadCatalogs() si está disponible
            // Las llegadas (agency_arrivals) son datos que se crean manualmente por el usuario
            
            // Limpiar también el setting de demo_data_loaded
            try {
                await DB.delete('settings', 'demo_data_loaded');
            } catch (e) {
                console.warn('No se pudo eliminar demo_data_loaded setting:', e);
            }

            // Mostrar resumen
            const footerHTML = `
                <button class="btn-primary" onclick="location.reload()">
                    <i class="fas fa-sync"></i> Recargar Página
                </button>
                <button class="btn-secondary" onclick="UI.closeModal()">
                    Cerrar
                </button>
            `;
            
            UI.showModal('Limpieza de Datos Mock Completada', `
                <div style="padding: 20px;">
                    <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: var(--radius-md); padding: 15px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #155724;">
                            <i class="fas fa-check-circle"></i> Limpieza Exitosa
                        </h4>
                        <p style="margin: 0; color: #155724; font-size: 13px;">
                            ${clearedCount} stores limpiados${errorCount > 0 ? `<br>${errorCount} errores` : ''}
                        </p>
                    </div>
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: var(--radius-md); padding: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #856404;">
                            <i class="fas fa-info-circle"></i> Datos Conservados
                        </h4>
                        <ul style="margin: 0; padding-left: 20px; color: #856404; font-size: 13px;">
                            <li>Usuarios (users)</li>
                            <li>Empleados (employees)</li>
                            <li>Sucursales (catalog_branches)</li>
                            <li>Catálogos: Agencias, Guías, Vendedores</li>
                            <li>Comisiones (commission_rules)</li>
                            <li>Llegadas (agency_arrivals)</li>
                            <li>Costos (cost_entries)</li>
                            <li>Configuraciones (settings) - Incluye tickets</li>
                            <li>Códigos de Barras (barcode_scan_history)</li>
                            <li>Información del dispositivo (device)</li>
                            <li>Logs de auditoría (audit_log)</li>
                        </ul>
                    </div>
                    <p style="margin-top: 15px; font-size: 12px; color: var(--color-text-secondary);">
                        <strong>Nota:</strong> Recarga la página para ver los cambios reflejados en todos los módulos.
                    </p>
                </div>
            `, footerHTML);

            Utils.showNotification(`Limpieza completada: ${clearedCount} stores limpiados`, 'success', 5000);
            
        } catch (error) {
            console.error('Error limpiando datos mock:', error);
            Utils.showNotification('Error al limpiar datos mock: ' + error.message, 'error');
        }
    },

    async verifyCatalogs(catalogType = 'all') {
        try {
            Utils.showNotification('Verificando catálogos...', 'info');
            
            const issues = [];
            const warnings = [];
            const successes = [];

            // Verificar Agencias
            if (catalogType === 'all' || catalogType === 'agencies') {
                const agencies = await DB.getAll('catalog_agencies') || [];
                if (agencies.length === 0) {
                    warnings.push('No hay agencias registradas');
                } else {
                    successes.push(`${agencies.length} agencias encontradas`);
                    
                    agencies.forEach(agency => {
                        if (!agency.name || agency.name.trim() === '') {
                            issues.push(`Agencia ${agency.id}: Falta nombre`);
                        }
                        if (!agency.barcode || Utils.isBarcodeEmpty?.(agency.barcode)) {
                            warnings.push(`Agencia ${agency.name || agency.id}: Falta código de barras`);
                        }
                    });
                }
            }

            // Verificar Vendedores
            if (catalogType === 'all' || catalogType === 'sellers') {
                const sellers = await DB.getAll('catalog_sellers') || [];
                if (sellers.length === 0) {
                    warnings.push('No hay vendedores registrados');
                } else {
                    successes.push(`${sellers.length} vendedores encontrados`);
                    
                    sellers.forEach(seller => {
                        if (!seller.name || seller.name.trim() === '') {
                            issues.push(`Vendedor ${seller.id}: Falta nombre`);
                        }
                        if (!seller.barcode || Utils.isBarcodeEmpty?.(seller.barcode)) {
                            warnings.push(`Vendedor ${seller.name || seller.id}: Falta código de barras`);
                        }
                    });
                }
            }

            // Verificar Guías
            if (catalogType === 'all' || catalogType === 'guides') {
                const guides = await DB.getAll('catalog_guides') || [];
                const agencies = await DB.getAll('catalog_agencies') || [];
                
                if (guides.length === 0) {
                    warnings.push('No hay guías registrados');
                } else {
                    successes.push(`${guides.length} guías encontrados`);
                    
                    guides.forEach(guide => {
                        if (!guide.name || guide.name.trim() === '') {
                            issues.push(`Guía ${guide.id}: Falta nombre`);
                        }
                        if (!guide.agency_id) {
                            issues.push(`Guía ${guide.name || guide.id}: Falta agencia asignada`);
                        } else {
                            const agency = agencies.find(a => a.id === guide.agency_id);
                            if (!agency) {
                                issues.push(`Guía ${guide.name || guide.id}: Agencia asignada no existe (${guide.agency_id})`);
                            }
                        }
                        if (!guide.barcode || Utils.isBarcodeEmpty?.(guide.barcode)) {
                            warnings.push(`Guía ${guide.name || guide.id}: Falta código de barras`);
                        }
                    });
                }
            }

            // Verificar Sucursales
            if (catalogType === 'all' || catalogType === 'branches') {
                const branches = await DB.getAll('catalog_branches') || [];
                if (branches.length === 0) {
                    warnings.push('No hay sucursales registradas');
                } else {
                    successes.push(`${branches.length} sucursales encontradas`);
                    
                    branches.forEach(branch => {
                        if (!branch.name || branch.name.trim() === '') {
                            issues.push(`Sucursal ${branch.id}: Falta nombre`);
                        }
                    });
                }
            }

            // Generar reporte
            const reportHTML = `
                <div style="max-width: 600px;">
                    <h4 style="margin-bottom: var(--spacing-md);">Resultado de Verificación</h4>
                    
                    ${issues.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #ffebee; border-left: 4px solid #d32f2f; border-radius: var(--radius-sm);">
                            <h5 style="color: #d32f2f; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-circle"></i> Problemas Encontrados (${issues.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${issues.map(issue => `<li style="margin-bottom: var(--spacing-xs);">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${warnings.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #fff3e0; border-left: 4px solid #f57c00; border-radius: var(--radius-sm);">
                            <h5 style="color: #f57c00; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-triangle"></i> Advertencias (${warnings.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${warnings.map(warning => `<li style="margin-bottom: var(--spacing-xs);">${warning}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${successes.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm);">
                            <h5 style="color: #388e3c; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-check-circle"></i> Verificaciones Exitosas
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${successes.map(success => `<li style="margin-bottom: var(--spacing-xs);">${success}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${issues.length === 0 && warnings.length === 0 ? `
                        <div style="padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm); text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 32px; color: #388e3c; margin-bottom: var(--spacing-sm);"></i>
                            <p style="font-weight: 600; color: #388e3c;">¡Todos los datos están correctos!</p>
                        </div>
                    ` : ''}
                </div>
            `;

            UI.showModal('Verificación de Catálogos', reportHTML, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);

            if (issues.length > 0) {
                Utils.showNotification(`Se encontraron ${issues.length} problemas en los catálogos`, 'error');
            } else if (warnings.length > 0) {
                Utils.showNotification(`Verificación completada con ${warnings.length} advertencias`, 'info');
            } else {
                Utils.showNotification('Verificación completada: Todos los datos están correctos', 'success');
            }

        } catch (e) {
            console.error('Error verificando catálogos:', e);
            Utils.showNotification('Error al verificar: ' + e.message, 'error');
        }
    },

    async verifySettings() {
        try {
            Utils.showNotification('Verificando configuraciones...', 'info');
            
            const settings = await DB.getAll('settings') || [];
            const settingsMap = {};
            settings.forEach(s => {
                settingsMap[s.key] = s.value;
            });

            const issues = [];
            const warnings = [];
            const checks = [];

            // Verificar configuraciones críticas
            if (!settingsMap.exchange_rate_usd || parseFloat(settingsMap.exchange_rate_usd) <= 0) {
                issues.push('Tipo de cambio USD no configurado o inválido');
            } else {
                checks.push(`Tipo de cambio USD: ${settingsMap.exchange_rate_usd}`);
            }

            if (!settingsMap.exchange_rate_cad || parseFloat(settingsMap.exchange_rate_cad) <= 0) {
                issues.push('Tipo de cambio CAD no configurado o inválido');
            } else {
                checks.push(`Tipo de cambio CAD: ${settingsMap.exchange_rate_cad}`);
            }

            if (!settingsMap.tax_iva || parseFloat(settingsMap.tax_iva) < 0) {
                warnings.push('IVA no configurado (usando 0%)');
            } else {
                checks.push(`IVA: ${settingsMap.tax_iva}%`);
            }

            // Verificar configuración de impresora
            if (!settingsMap.printer_name) {
                warnings.push('Nombre de impresora no configurado');
            } else {
                checks.push(`Impresora: ${settingsMap.printer_name}`);
            }

            // Verificar sincronización
            if (!settingsMap.google_client_id || !settingsMap.google_sheets_spreadsheet_id) {
                warnings.push('Google Client ID o Spreadsheet ID no configurados');
            } else {
                checks.push('Google Sheets API configurada correctamente');
            }

            const reportHTML = `
                <div style="max-width: 600px;">
                    <h4 style="margin-bottom: var(--spacing-md);">Verificación de Configuraciones</h4>
                    
                    ${issues.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #ffebee; border-left: 4px solid #d32f2f; border-radius: var(--radius-sm);">
                            <h5 style="color: #d32f2f; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-circle"></i> Problemas Críticos (${issues.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${issues.map(issue => `<li style="margin-bottom: var(--spacing-xs);">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${warnings.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #fff3e0; border-left: 4px solid #f57c00; border-radius: var(--radius-sm);">
                            <h5 style="color: #f57c00; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-triangle"></i> Advertencias (${warnings.length})
                            </h5>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                                ${warnings.map(warning => `<li style="margin-bottom: var(--spacing-xs);">${warning}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm);">
                        <h5 style="color: #388e3c; margin-bottom: var(--spacing-sm);">
                            <i class="fas fa-check-circle"></i> Configuraciones Verificadas
                        </h5>
                        <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px;">
                            ${checks.map(check => `<li style="margin-bottom: var(--spacing-xs);">${check}</li>`).join('')}
                        </ul>
                    </div>
                    
                    ${issues.length === 0 && warnings.length === 0 ? `
                        <div style="padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm); text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 32px; color: #388e3c; margin-bottom: var(--spacing-sm);"></i>
                            <p style="font-weight: 600; color: #388e3c;">¡Todas las configuraciones están correctas!</p>
                        </div>
                    ` : ''}
                </div>
            `;

            UI.showModal('Verificación de Configuraciones', reportHTML, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);

            if (issues.length > 0) {
                Utils.showNotification(`Se encontraron ${issues.length} problemas críticos`, 'error');
            } else if (warnings.length > 0) {
                Utils.showNotification(`Verificación completada con ${warnings.length} advertencias`, 'info');
            } else {
                Utils.showNotification('Todas las configuraciones están correctas', 'success');
            }

        } catch (e) {
            console.error('Error verificando configuraciones:', e);
            Utils.showNotification('Error al verificar: ' + e.message, 'error');
        }
    },

    async validateMultiBranchSystem() {
        try {
            Utils.showNotification('Validando sistema multisucursal...', 'info');
            
            const issues = [];
            const warnings = [];
            const fixed = [];
            let totalFixed = 0;
            
            // Obtener todas las sucursales
            const branches = await DB.getAll('catalog_branches') || [];
            const branchesMap = {};
            branches.forEach(b => { branchesMap[b.id] = b; });
            
            // 1. Verificar sucursales
            if (branches.length === 0) {
                issues.push('❌ No hay sucursales registradas en el sistema');
            } else {
                const activeBranches = branches.filter(b => b.active);
                if (activeBranches.length === 0) {
                    issues.push('❌ No hay sucursales activas. El sistema no funcionará correctamente');
                } else {
                    fixed.push(`✓ ${activeBranches.length} sucursal(es) activa(s) encontrada(s)`);
                }
                
                // Verificar integridad de sucursales
                branches.forEach(branch => {
                    if (!branch.name || branch.name.trim() === '') {
                        issues.push(`❌ Sucursal ${branch.id}: Falta nombre`);
                    }
                    if (!branch.id || branch.id.trim() === '') {
                        issues.push(`❌ Sucursal encontrada sin ID válido`);
                    }
                });
            }
            
            // 2. Verificar empleados
            const employees = await DB.getAll('employees') || [];
            const employeesWithoutBranch = employees.filter(emp => !emp.branch_id);
            const employeesWithInvalidBranch = employees.filter(emp => {
                if (!emp.branch_id) return false;
                return !branchesMap[emp.branch_id];
            });
            
            if (employeesWithInvalidBranch.length > 0) {
                issues.push(`❌ ${employeesWithInvalidBranch.length} empleado(s) con sucursal inválida/no existente`);
                // Opción de corrección
                if (await Utils.confirm(`Se encontraron ${employeesWithInvalidBranch.length} empleado(s) con sucursales inválidas.\n\n¿Deseas limpiar estas asignaciones inválidas?`)) {
                    for (const emp of employeesWithInvalidBranch) {
                        emp.branch_id = null;
                        emp.updated_at = new Date().toISOString();
                        await DB.put('employees', emp);
                        totalFixed++;
                    }
                    fixed.push(`✓ ${employeesWithInvalidBranch.length} asignación(es) inválida(s) corregida(s)`);
                }
            }
            
            if (employeesWithoutBranch.length > 0) {
                warnings.push(`⚠️ ${employeesWithoutBranch.length} empleado(s) sin sucursal asignada`);
            }
            
            // 3. Verificar datos de ventas
            const sales = await DB.getAll('sales') || [];
            const salesWithoutBranch = sales.filter(s => !s.branch_id);
            const salesWithInvalidBranch = sales.filter(s => {
                if (!s.branch_id) return false;
                return !branchesMap[s.branch_id];
            });
            
            if (salesWithInvalidBranch.length > 0) {
                issues.push(`❌ ${salesWithInvalidBranch.length} venta(s) con sucursal inválida/no existente`);
            }
            
            if (salesWithoutBranch.length > 0) {
                warnings.push(`⚠️ ${salesWithoutBranch.length} venta(s) sin sucursal asignada`);
            }
            
            // 4. Verificar inventario
            const inventory = await DB.getAll('inventory_items') || [];
            const inventoryWithoutBranch = inventory.filter(i => !i.branch_id);
            const inventoryWithInvalidBranch = inventory.filter(i => {
                if (!i.branch_id) return false;
                return !branchesMap[i.branch_id];
            });
            
            if (inventoryWithInvalidBranch.length > 0) {
                issues.push(`❌ ${inventoryWithInvalidBranch.length} item(s) de inventario con sucursal inválida`);
            }
            
            if (inventoryWithoutBranch.length > 0) {
                warnings.push(`⚠️ ${inventoryWithoutBranch.length} item(s) de inventario sin sucursal`);
            }
            
            // 5. Verificar costos
            const costs = await DB.getAll('cost_entries') || [];
            const costsWithInvalidBranch = costs.filter(c => {
                if (!c.branch_id) return false;
                return !branchesMap[c.branch_id];
            });
            
            if (costsWithInvalidBranch.length > 0) {
                issues.push(`❌ ${costsWithInvalidBranch.length} costo(s) con sucursal inválida`);
            }
            
            // 6. Verificar consistencia: empleados activos en sucursales inactivas
            const activeEmployeesInInactiveBranches = employees.filter(emp => {
                if (!emp.active || !emp.branch_id) return false;
                const branch = branchesMap[emp.branch_id];
                return branch && !branch.active;
            });
            
            if (activeEmployeesInInactiveBranches.length > 0) {
                warnings.push(`⚠️ ${activeEmployeesInInactiveBranches.length} empleado(s) activo(s) asignado(s) a sucursal(es) inactiva(s)`);
            }
            
            // 7. Estadísticas por sucursal
            const branchStats = {};
            branches.forEach(branch => {
                const branchEmployees = employees.filter(emp => emp.branch_id === branch.id);
                const branchSales = sales.filter(s => s.branch_id === branch.id);
                const branchInventory = inventory.filter(i => i.branch_id === branch.id);
                
                branchStats[branch.id] = {
                    name: branch.name,
                    active: branch.active,
                    employees: branchEmployees.length,
                    sales: branchSales.length,
                    inventory: branchInventory.length
                };
            });
            
            // Generar reporte
            let message = `
                <div style="max-width: 700px; max-height: 600px; overflow-y: auto;">
                    <h3 style="margin-bottom: var(--spacing-md); color: var(--color-primary);">
                        <i class="fas fa-check-double"></i> Validación del Sistema Multisucursal
                    </h3>
                    
                    ${issues.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #ffebee; border-left: 4px solid #d32f2f; border-radius: var(--radius-sm);">
                            <h4 style="color: #d32f2f; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-circle"></i> Problemas Críticos (${issues.length})
                            </h4>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px; line-height: 1.6;">
                                ${issues.map(issue => `<li style="margin-bottom: var(--spacing-xs);">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${warnings.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #fff3e0; border-left: 4px solid #f57c00; border-radius: var(--radius-sm);">
                            <h4 style="color: #f57c00; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-exclamation-triangle"></i> Advertencias (${warnings.length})
                            </h4>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px; line-height: 1.6;">
                                ${warnings.map(warning => `<li style="margin-bottom: var(--spacing-xs);">${warning}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${fixed.length > 0 ? `
                        <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm);">
                            <h4 style="color: #388e3c; margin-bottom: var(--spacing-sm);">
                                <i class="fas fa-check-circle"></i> Verificaciones Exitosas
                            </h4>
                            <ul style="margin: 0; padding-left: var(--spacing-md); font-size: 12px; line-height: 1.6;">
                                ${fixed.map(f => `<li style="margin-bottom: var(--spacing-xs);">${f}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                        <h4 style="margin-bottom: var(--spacing-sm); font-size: 13px; font-weight: 600;">
                            <i class="fas fa-chart-bar"></i> Estadísticas por Sucursal
                        </h4>
                        <div style="display: grid; gap: var(--spacing-xs); font-size: 11px;">
                            ${Object.entries(branchStats).map(([branchId, stats]) => `
                                <div style="padding: var(--spacing-xs); background: var(--color-bg-card); border-radius: var(--radius-xs); border-left: 3px solid ${stats.active ? '#388e3c' : '#d32f2f'};">
                                    <strong>${Utils.escapeHtml(stats.name)}</strong> 
                                    <span style="color: ${stats.active ? '#388e3c' : '#d32f2f'}; font-size: 10px;">
                                        ${stats.active ? '✓ Activa' : '✗ Inactiva'}
                                    </span>
                                    <div style="margin-top: 4px; color: var(--color-text-secondary);">
                                        👥 ${stats.employees} empleado(s) | 💰 ${stats.sales} venta(s) | 📦 ${stats.inventory} item(s) inventario
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    ${issues.length === 0 && warnings.length === 0 ? `
                        <div style="padding: var(--spacing-md); background: #e8f5e9; border-left: 4px solid #388e3c; border-radius: var(--radius-sm); text-align: center;">
                            <i class="fas fa-check-circle" style="font-size: 48px; color: #388e3c; margin-bottom: var(--spacing-sm);"></i>
                            <p style="font-weight: 600; color: #388e3c; font-size: 16px;">¡Sistema Multisucursal Configurado Correctamente!</p>
                            <p style="color: #388e3c; font-size: 12px; margin-top: var(--spacing-xs);">Todos los datos están validados y funcionando correctamente</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            UI.showModal('Validación Multisucursal', message, [
                { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
            ]);
            
            if (totalFixed > 0) {
                Utils.showNotification(`${totalFixed} problema(s) corregido(s) automáticamente`, 'success');
            } else if (issues.length === 0 && warnings.length === 0) {
                Utils.showNotification('Sistema multisucursal validado correctamente', 'success');
            } else {
                Utils.showNotification(`Validación completada: ${issues.length} problema(s), ${warnings.length} advertencia(s)`, issues.length > 0 ? 'error' : 'warning');
            }
        } catch (e) {
            console.error('Error validando sistema multisucursal:', e);
            Utils.showNotification('Error en validación: ' + e.message, 'error');
        }
    },

    // Funciones para Etiquetas de Joyas
    async configureJewelryLabel() {
        if (typeof JewelryLabelEditor === 'undefined') {
            Utils.showNotification('Módulo de etiquetas de joyas no disponible', 'error');
            return;
        }
        await JewelryLabelEditor.showEditor();
    },

    async updateJewelryLabelStatus() {
        try {
            const statusText = document.getElementById('jewelry-template-status-text');
            if (!statusText) return;

            if (typeof JewelryLabelEditor === 'undefined') {
                statusText.textContent = 'Módulo no disponible';
                statusText.style.color = 'var(--color-text-secondary)';
                return;
            }

            const hasTemplate = await JewelryLabelEditor.hasTemplate();
            if (hasTemplate) {
                statusText.textContent = '✅ Plantilla configurada y lista para usar';
                statusText.style.color = '#388e3c';
            } else {
                statusText.textContent = '⚠️ No configurada - Click en "Configurar Etiqueta" para comenzar';
                statusText.style.color = '#f57c00';
            }
        } catch (e) {
            console.error('Error actualizando estado de etiqueta de joya:', e);
        }
    },

    async testJewelryLabel() {
        try {
            if (typeof JewelryLabelEditor === 'undefined') {
                Utils.showNotification('Módulo de etiquetas de joyas no disponible', 'error');
                return;
            }

            const hasTemplate = await JewelryLabelEditor.hasTemplate();
            if (!hasTemplate) {
                Utils.showNotification('⚠️ Primero configura la plantilla antes de imprimir una prueba', 'warning');
                await this.configureJewelryLabel();
                return;
            }

            // Crear un item de prueba
            const testItem = {
                id: 'test',
                name: 'Anillo Oro 18K Diamante',
                sku: 'TEST-001',
                barcode: '123456789012',
                price: 15000
            };

            // Usar la función de impresión con item de prueba
            await JewelryLabelEditor.printJewelryLabel('test', testItem);
            Utils.showNotification('✅ Prueba de etiqueta enviada a impresión', 'success');
        } catch (e) {
            console.error('Error en prueba de etiqueta de joya:', e);
            Utils.showNotification('Error al imprimir prueba: ' + e.message, 'error');
        }
    },

    async restoreSystemConfiguration() {
        try {
            console.log('🔄 Restaurando configuración básica del sistema...');
            let restoredCount = 0;

            // 1. Restaurar Sucursales
            const branches = [
                { id: 'branch1', name: 'L Vallarta', address: '', active: true },
                { id: 'branch2', name: 'Malecón', address: '', active: true },
                { id: 'branch3', name: 'San Sebastián', address: '', active: true },
                { id: 'branch4', name: 'Sayulita', address: '', active: true }
            ];

            for (const branch of branches) {
                try {
                    const existing = await DB.get('catalog_branches', branch.id);
                    if (!existing) {
                        await DB.put('catalog_branches', branch);
                        restoredCount++;
                        console.log(`✅ Sucursal restaurada: ${branch.name}`);
                    }
                } catch (e) {
                    console.error(`Error restaurando sucursal ${branch.id}:`, e);
                }
            }

            // 2. Restaurar Comisiones (necesita sellers y guides)
            const allSellers = await DB.getAll('catalog_sellers') || [];
            const allGuides = await DB.getAll('catalog_guides') || [];
            
            const sebastianSeller = allSellers.find(s => s.name === 'SEBASTIAN');
            const omarSeller = allSellers.find(s => s.name === 'OMAR');
            const jcSeller = allSellers.find(s => s.name === 'JUAN CARLOS');
            const marinaGuide = allGuides.find(g => g.name === 'MARINA');

            const commissionRules = [];
            
            // SEBASTIAN: discount_pct=0, multiplier=10
            if (sebastianSeller) {
                commissionRules.push({
                    id: 'seller_sebastian',
                    entity_type: 'seller',
                    entity_id: sebastianSeller.id,
                    discount_pct: 0,
                    multiplier: 10,
                    created_at: new Date().toISOString()
                });
            }
            
            // OMAR y JUAN CARLOS: discount_pct=20, multiplier=7
            if (omarSeller) {
                commissionRules.push({
                    id: 'seller_omar',
                    entity_type: 'seller',
                    entity_id: omarSeller.id,
                    discount_pct: 20,
                    multiplier: 7,
                    created_at: new Date().toISOString()
                });
            }
            if (jcSeller) {
                commissionRules.push({
                    id: 'seller_jc',
                    entity_type: 'seller',
                    entity_id: jcSeller.id,
                    discount_pct: 20,
                    multiplier: 7,
                    created_at: new Date().toISOString()
                });
            }
            
            // Default vendedores: discount_pct=5, multiplier=9
            commissionRules.push({
                id: 'seller_default',
                entity_type: 'seller',
                entity_id: null,
                discount_pct: 5,
                multiplier: 9,
                created_at: new Date().toISOString()
            });
            
            // MARINA: discount_pct=0, multiplier=10
            if (marinaGuide) {
                commissionRules.push({
                    id: 'guide_marina',
                    entity_type: 'guide',
                    entity_id: marinaGuide.id,
                    discount_pct: 0,
                    multiplier: 10,
                    created_at: new Date().toISOString()
                });
            }
            
            // Default guías: discount_pct=18, multiplier=10
            commissionRules.push({
                id: 'guide_default',
                entity_type: 'guide',
                entity_id: null,
                discount_pct: 18,
                multiplier: 10,
                created_at: new Date().toISOString()
            });

            for (const rule of commissionRules) {
                try {
                    const existing = await DB.get('commission_rules', rule.id);
                    if (!existing) {
                        await DB.put('commission_rules', rule);
                        restoredCount++;
                        console.log(`✅ Regla de comisión restaurada: ${rule.id}`);
                    }
                } catch (e) {
                    console.error(`Error restaurando regla ${rule.id}:`, e);
                }
            }

            // 3. Verificar que cost_entries existe (no hay datos de ejemplo, solo verificar que el store esté disponible)
            // Los costos se crean manualmente por el usuario, así que solo verificamos que el store exista

            console.log(`✅ Configuración restaurada: ${restoredCount} elementos`);
            if (restoredCount > 0) {
                Utils.showNotification(`✅ Configuración básica restaurada: ${restoredCount} elementos`, 'success');
            }

            // Nota: Las reglas de llegadas (arrival_rate_rules) se restauran automáticamente
            // cuando se cargan los catálogos (agencies) mediante App.loadCatalogs()
            // Las llegadas (agency_arrivals) son datos que se crean manualmente por el usuario

        } catch (e) {
            console.error('Error restaurando configuración del sistema:', e);
            Utils.showNotification('Error al restaurar configuración: ' + e.message, 'error');
        }
    }
};

window.Settings = Settings;

