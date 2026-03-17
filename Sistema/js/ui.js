// UI Manager - Navegación y modales

const UI = {
    currentModule: null,
    currentUser: null,
    loadingModule: null,
    moduleLoadPromise: null,
    moduleChangeTimeout: null,

    init() {
        this.setupNavigation();
        this.setupModals();
        this.setupGlobalSearch();
    },

    setupNavigation() {
        // Configurar clics en items de navegación
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const module = item.dataset.module;
                
                // Cancelar carga anterior si existe
                if (this.moduleChangeTimeout) {
                    clearTimeout(this.moduleChangeTimeout);
                    this.moduleChangeTimeout = null;
                }
                
                // Si ya se está cargando este módulo, ignorar
                if (this.loadingModule === module) {
                    return;
                }
                
                // Cancelar carga anterior si hay una en progreso
                if (this.loadingModule && this.loadingModule !== module) {
                    console.log(`Cancelando carga de módulo anterior: ${this.loadingModule}`);
                    this.loadingModule = null;
                    if (this.moduleLoadPromise) {
                        // Marcar como cancelado
                        this.moduleLoadPromise = null;
                    }
                }
                
                // Usar debounce para evitar cambios muy rápidos
                this.moduleChangeTimeout = setTimeout(async () => {
                    this.moduleChangeTimeout = null;
                    this.loadingModule = module;
                    
                    try {
                        this.showModule(module);
                        // Esperar un momento para que el DOM se actualice
                        await Utils.delay(50);
                        // Cargar el módulo después de mostrarlo
                        if (window.App && window.App.loadModule) {
                            this.moduleLoadPromise = window.App.loadModule(module);
                            await this.moduleLoadPromise;
                        }
                    } catch (error) {
                        // Solo mostrar error si aún estamos en el mismo módulo
                        if (this.loadingModule === module) {
                            console.error(`Error cargando módulo ${module}:`, error);
                        }
                    } finally {
                        // Solo limpiar si aún estamos en el mismo módulo
                        if (this.loadingModule === module) {
                            this.loadingModule = null;
                            this.moduleLoadPromise = null;
                        }
                    }
                }, 50); // Debounce de 50ms
            });
        });

        // Eliminar plegado: mantener SIEMPRE visibles las secciones del menú
        // y agregar una línea sutil bajo cada título
        const headers = document.querySelectorAll('.nav-section-header');
        headers.forEach(header => {
            header.classList.remove('collapsed');
            header.style.borderBottom = '1px solid var(--color-border-light)';
            header.style.paddingBottom = '6px';
            const items = header.nextElementSibling;
            if (items && items.classList.contains('nav-section-items')) {
                items.classList.remove('max-h-0', 'opacity-0', 'pointer-events-none');
                items.classList.add('max-h-96', 'opacity-100');
                items.style.display = 'block';
                items.style.opacity = '1';
            }
        });
    },

    loadSectionStates() {
        // Sin estados: siempre expandido con una línea sutil bajo el título
        const headers = document.querySelectorAll('.nav-section-header');
        headers.forEach(header => {
            header.classList.remove('collapsed');
            header.style.borderBottom = '1px solid var(--color-border-light)';
            header.style.paddingBottom = '6px';
            const items = header.nextElementSibling;
            if (items && items.classList.contains('nav-section-items')) {
                items.classList.remove('max-h-0', 'opacity-0', 'pointer-events-none');
                items.classList.add('max-h-96', 'opacity-100');
                items.style.display = 'block';
                items.style.opacity = '1';
            }
        });
    },

    // Función para expandir una sección específica
    expandSection(sectionName) {
        const header = document.querySelector(`.nav-section-header[data-section="${sectionName}"]`);
        if (header) {
            // Asegurar que esté siempre desplegado (sin plegado)
            header.classList.remove('collapsed');
            const items = header.nextElementSibling;
            if (items && items.classList.contains('nav-section-items')) {
                items.style.display = 'block';
                items.style.opacity = '1';
            }
        }
    },

    // Función para colapsar una sección específica
    collapseSection(sectionName) {
        // No hacer nada: el plegado está deshabilitado permanentemente
        return;
    },

    saveSectionState(section, isCollapsed) {
        // Estado de plegado deshabilitado
        return;
    },

    filterMenuByPermissions() {
        if (typeof PermissionManager === 'undefined') return;

        // Mapeo de módulos a permisos requeridos
        const modulePermissions = {
            'dashboard': 'dashboard.view',
            'pos': 'pos.view',
            'cash': 'cash.view',
            'barcodes': 'barcodes.generate',
            'inventory': 'inventory.view',
            'transfers': 'transfers.view',
            'customers': 'customers.view',
            'repairs': 'repairs.view',
            'tourist-report': 'arrivals.view',
            'employees': 'employees.view',
            'catalogs': 'employees.view',
            'reports': 'reports.view',
            'costs': 'costs.view',
            'sync': 'settings.sync',
            'settings': 'settings.view',
            'qa': 'settings.qa'
        };

        // Ocultar módulos sin permiso
        document.querySelectorAll('.nav-item[data-module]').forEach(item => {
            const module = item.dataset.module;
            const requiredPermission = modulePermissions[module];
            
            if (requiredPermission && !PermissionManager.hasPermission(requiredPermission)) {
                item.style.display = 'none';
            } else {
                item.style.display = '';
            }
        });

        // Filtrar QA específicamente
        const qaNavItem = document.getElementById('nav-qa');
        if (qaNavItem) {
            if (PermissionManager.hasPermission('settings.qa')) {
                qaNavItem.style.display = '';
            } else {
                qaNavItem.style.display = 'none';
            }
        }

        // Ocultar secciones completas si no tienen items visibles
        document.querySelectorAll('.nav-section').forEach(section => {
            const sectionItems = section.querySelectorAll('.nav-section-items .nav-item[data-module]');
            const visibleItems = Array.from(sectionItems).filter(item => item.style.display !== 'none');
            
            // Si no hay items visibles en la sección, ocultarla completamente
            if (visibleItems.length === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = '';
            }
        });
    },

    showModule(moduleName, subPage = null, subCategory = null) {
        // Si es el mismo módulo y no se está cargando, no hacer nada
        if (this.currentModule === moduleName && !this.loadingModule) {
            return;
        }

        // Guardar estado de navegación en localStorage
        try {
            localStorage.setItem('current_module', moduleName);
            if (subPage) {
                localStorage.setItem('current_subpage', subPage);
            } else {
                localStorage.removeItem('current_subpage');
            }
            if (subCategory) {
                localStorage.setItem('current_subcategory', subCategory);
            } else {
                localStorage.removeItem('current_subcategory');
            }
            // Guardar timestamp para validar que el estado es reciente
            localStorage.setItem('navigation_timestamp', Date.now().toString());
        } catch (e) {
            console.warn('Error guardando estado de navegación:', e);
        }

        // Mapeo de módulos a secciones
        const moduleToSection = {
            'dashboard': 'operaciones',
            'pos': 'operaciones',
            'cash': 'operaciones',
            'barcodes': 'operaciones',
            'inventory': 'inventario',
            'transfers': 'inventario',
            'customers': 'clientes',
            'repairs': 'clientes',
            'tourist-report': 'clientes',
            'employees': 'administracion',
            'catalogs': 'administracion',
            'reports': 'analisis',
            'costs': 'analisis',
            'sync': 'sistema',
            'settings': 'sistema',
            'qa': 'sistema'
        };

        // Desplegar automáticamente la sección del módulo actual
        const sectionName = moduleToSection[moduleName];
        if (sectionName) {
            this.expandSection(sectionName);
        }

        // Cancelar cualquier operación pendiente de otro módulo
        if (this.currentModule && this.currentModule !== moduleName) {
            // Limpiar cualquier estado pendiente del módulo anterior
            const previousModule = document.getElementById(`module-${this.currentModule}`);
            if (previousModule) {
                // Marcar como oculto sin animación
                previousModule.style.display = 'none';
            }
        }

        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.module === moduleName) {
                item.classList.add('active');
            }
        });

        // Update topbar module title (Prodex)
        const topbarTitle = document.getElementById('topbar-module-title');
        if (topbarTitle) {
            topbarTitle.textContent = this.getModuleTitle(moduleName);
        }

        // Hide all modules and placeholder
        document.querySelectorAll('.module').forEach(mod => {
            mod.style.display = 'none';
        });
        
        const placeholder = document.getElementById('module-placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        // Show target module
        const moduleEl = document.getElementById(`module-${moduleName}`);
        if (moduleEl) {
            moduleEl.style.display = 'block';
            this.currentModule = moduleName;
            
            // Guardar estado completo de navegación en localStorage
            localStorage.setItem('current_module', moduleName);
            if (subPage) {
                localStorage.setItem('current_subpage', subPage);
            } else {
                localStorage.removeItem('current_subpage');
            }
            if (subCategory) {
                localStorage.setItem('current_subcategory', subCategory);
            } else {
                localStorage.removeItem('current_subcategory');
            }
            localStorage.setItem('navigation_timestamp', Date.now().toString());
            
            // Trigger module load event
            window.dispatchEvent(new CustomEvent('module-loaded', { detail: { module: moduleName, subPage, subCategory } }));
        } else {
            // Use placeholder for dynamic modules
            const title = document.getElementById('module-title');
            const content = document.getElementById('module-content');
            
            if (placeholder && title && content) {
                placeholder.style.display = 'block';
                title.textContent = this.getModuleTitle(moduleName);
                
                // Verificar si el contenido necesita ser limpiado
                // Solo limpiar si está vacío, tiene "Cargando módulo", o no tiene los elementos del módulo actual
                const moduleSpecificSelectors = {
                    'customers': ['#customers-list', '#customers-stats', '.customers-module'],
                    'repairs': ['#repairs-list'],
                    'employees': ['#employees-tabs', '#employees-content'],
                    'catalogs': ['#catalogs-tabs', '#catalogs-content'],
                    'tourist-report': ['#arrivals-container'],
                    'cash': ['#cash-status-card', '#cash-container', '.cash-container'],
                    'reports': ['#reports-tabs', '#reports-content'],
                    'costs': ['#costs-tabs', '#costs-content'],
                    'settings': ['#settings-tabs', '#settings-content'],
                    'sync': ['#sync-ui-container']
                };
                
                const selectors = moduleSpecificSelectors[moduleName] || [];
                const hasModuleContent = selectors.length > 0 && selectors.some(selector => content.querySelector(selector));
                
                // Verificar contenido de manera más robusta
                const contentText = content.textContent || content.innerText || '';
                const isEmpty = content.innerHTML.trim() === '' || 
                               content.innerHTML.trim() === '<div></div>' ||
                               content.innerHTML.trim() === '<div style="display: none;"></div>';
                const hasLoadingText = content.innerHTML.includes('Cargando módulo') || 
                                     content.innerHTML.includes('Cargando...');
                
                // NUNCA limpiar si tiene contenido válido del módulo
                // Solo limpiar si está completamente vacío Y no tiene elementos del módulo
                if (isEmpty && !hasModuleContent) {
                    console.log(`🧹 Limpiando contenido vacío para módulo ${moduleName}`);
                    content.innerHTML = '';
                } else if (hasModuleContent) {
                    console.log(`✅ Módulo ${moduleName} ya tiene contenido válido, NO limpiar`);
                } else if (hasLoadingText && !hasModuleContent) {
                    // Solo limpiar si tiene texto de carga pero no tiene contenido real
                    console.log(`🧹 Limpiando contenido con solo texto de carga para módulo ${moduleName}`);
                    content.innerHTML = '';
                }
                
                this.currentModule = moduleName;
                
                // Guardar módulo actual en localStorage
                localStorage.setItem('current_module', moduleName);
                
                window.dispatchEvent(new CustomEvent('module-loaded', { detail: { module: moduleName } }));
            }
        }
    },

    getModuleTitle(moduleName) {
        const titles = {
            'barcodes': 'Códigos de Barras',
            'branches': 'Sucursales',
            'cash': 'Caja',
            'catalogs': 'Catálogos',
            'costs': 'Costos',
            'customers': 'Clientes',
            'dashboard': 'Dashboard',
            'employees': 'Empleados',
            'inventory': 'Inventario',
            'pos': 'POS',
            'qa': 'QA / Autopruebas',
            'repairs': 'Reparaciones',
            'reports': 'Reportes',
            'settings': 'Configuración',
            'suppliers': 'Proveedores',
            'sync': 'Sincronización',
            'tourist-report': 'Llegadas',
            'transfers': 'Transferencias'
        };
        return titles[moduleName] || 'Módulo';
    },

    getModuleContent(moduleName) {
        // Content will be set by each module's init()
        return '<p>Cargando módulo...</p>';
    },

    getModuleContent(moduleName) {
        // This will be populated by each module
        return '<p>Cargando módulo...</p>';
    },

    setupModals() {
        const overlay = document.getElementById('modal-overlay');
        const closeBtn = document.getElementById('modal-close-btn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }
    },

    showModal(title, body, footer = '', options = {}) {
        // Soportar formato objeto: { title, content, buttons } (costs.js, suppliers-integration.js)
        if (title && typeof title === 'object' && !(title instanceof Node)) {
            const opts = title;
            title = opts.title || '';
            body = opts.content ?? opts.body ?? '';
            footer = opts.buttons ?? opts.footer ?? '';
            if (opts.size) options = { ...options, size: opts.size };
            if (opts.large) options = { ...options, large: opts.large };
        }
        const overlay = document.getElementById('modal-overlay');
        const modalContainer = document.getElementById('modal-container');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalFooter = document.getElementById('modal-footer');
        
        // Aplicar clase de tamaño si se especifica
        if (modalContainer) {
            // Remover todas las clases de tamaño anteriores
            modalContainer.classList.remove('modal-small', 'modal-medium', 'modal-large', 'modal-lg');
            
            // Aplicar nueva clase si se especifica
            if (options.size) {
                modalContainer.classList.add(`modal-${options.size}`);
            } else if (options.large) {
                // Compatibilidad: si se pasa large: true, usar modal-lg
                modalContainer.classList.add('modal-lg');
            }
        }
        
        // Usar innerHTML para soportar íconos en el título
        if (modalTitle) modalTitle.innerHTML = title;
        if (modalBody) modalBody.innerHTML = body;
        
        // Si footer es un array de botones, convertirlo a HTML y agregar event listeners
        if (Array.isArray(footer)) {
            const footerHTML = footer.map((btn, index) => {
                return `<button class="${btn.class || 'btn-secondary'}" id="modal-btn-${index}">${btn.text || 'Botón'}</button>`;
            }).join('');
            if (modalFooter) {
                modalFooter.innerHTML = footerHTML;
                // Agregar event listeners a los botones
                footer.forEach((btn, index) => {
                    if (btn.onclick) {
                        const btnElement = document.getElementById(`modal-btn-${index}`);
                        if (btnElement) {
                            // Convertir string a función si es necesario
                            let handler = btn.onclick;
                            if (typeof handler === 'string') {
                                // Si es un string, crear una función que lo ejecute en el contexto global
                                // Esto permite usar strings como 'UI.closeModal()' o 'window.Transfers.createTransfer()'
                                const codeString = handler;
                                handler = function() {
                                    try {
                                        // Ejecutar en contexto global usando Function constructor
                                        return new Function(codeString)();
                                    } catch (e) {
                                        console.error('Error ejecutando onclick handler:', codeString, e);
                                    }
                                };
                            }
                            btnElement.addEventListener('click', handler);
                        }
                    }
                });
            }
        } else {
            if (modalFooter) modalFooter.innerHTML = footer;
        }
        
        if (overlay) overlay.style.display = 'flex';
    },

    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    setupGlobalSearch() {
        const searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                const query = e.target.value.trim();
                if (query.length > 2) {
                    this.performGlobalSearch(query);
                }
            }, 300));
        }
    },

    async performGlobalSearch(query) {
        // Search across inventory, sales, customers
        const results = [];
        
        // Search inventory
        try {
            const items = await DB.getAll('inventory_items');
            const matches = items.filter(item => 
                item.sku?.toLowerCase().includes(query.toLowerCase()) ||
                item.name?.toLowerCase().includes(query.toLowerCase()) ||
                item.barcode?.includes(query)
            );
            results.push(...matches.map(item => ({
                type: 'inventario',
                label: `${item.sku} - ${item.name}`,
                data: item
            })));
        } catch (e) {
            console.error('Error searching inventory:', e);
        }
        
        // Search sales
        try {
            const sales = await DB.getAll('sales');
            const matches = sales.filter(sale =>
                sale.folio?.toLowerCase().includes(query.toLowerCase())
            );
            results.push(...matches.map(sale => ({
                type: 'venta',
                label: `Venta ${sale.folio}`,
                data: sale
            })));
        } catch (e) {
            console.error('Error searching sales:', e);
        }
        
        // Show results in dropdown (simplified)
        if (results.length > 0) {
            this.showSearchResults(results);
        }
    },

    showSearchResults(results) {
        // Simple implementation - can be enhanced
        console.log('Search results:', results);
    },

    updateUserInfo(user) {
        this.currentUser = user;
        const userEl = document.getElementById('current-user');
        if (userEl && user) {
            let displayText = user.name || user.username || 'Usuario';
            
            const isMasterAdmin = user.role === 'master_admin' || 
                                 UserManager?.currentUser?.role === 'master_admin' ||
                                 UserManager?.currentUser?.is_master_admin ||
                                 UserManager?.currentUser?.isMasterAdmin;
            
            if (isMasterAdmin && !displayText.includes('Administrador') && !displayText.includes('Maestro')) {
                displayText = user.name || 'Administrador Maestro';
            }
            
            userEl.textContent = displayText;

            // Actualizar avatar con iniciales
            const avatarEl = document.getElementById('tb-user-avatar');
            if (avatarEl) {
                const parts = displayText.trim().split(/\s+/);
                const initials = parts.length >= 2
                    ? (parts[0][0] + parts[1][0]).toUpperCase()
                    : displayText.substring(0, 2).toUpperCase();
                avatarEl.textContent = initials;
            }
        }
    },

    updateBranchInfo(branch) {
        const branchEl = document.getElementById('current-branch');
        if (branchEl && branch) {
            branchEl.textContent = branch.name || 'Tienda';
        }
    },

    async updateSyncStatus(online, syncing = false) {
        const statusEl = document.getElementById('connection-status');
        const textEl = document.getElementById('sync-text');
        const syncBtn = document.getElementById('topbar-sync-now-btn');
        
        // Verificar configuración de API desde la base de datos (fuente de verdad)
        let apiUrl = null;
        try {
            if (typeof DB !== 'undefined') {
                const urlSetting = await DB.get('settings', 'api_url');
                apiUrl = urlSetting?.value || null;
            }
            
            // Asegurar que API.baseURL esté sincronizado con la base de datos
            if (apiUrl && typeof API !== 'undefined' && API.baseURL !== apiUrl) {
                API.baseURL = apiUrl;
            }
        } catch (error) {
            console.error('Error verificando API:', error);
        }
        
        // Función helper para actualizar el estado
        const updateState = (statusEl, textEl, syncBtn, apiUrl, online, syncing) => {
            if (!statusEl || !textEl) return;
            
            if (!apiUrl) {
                // Caso 1: No hay URL configurada
                statusEl.className = 'status-indicator offline';
                textEl.textContent = 'API no configurado';
                textEl.style.color = '#ef4444';
                textEl.style.fontWeight = '600';
                if (syncBtn) {
                    syncBtn.style.background = '#ef4444';
                    syncBtn.title = 'Configurar API en Configuración → Sincronización';
                    syncBtn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof UI !== 'undefined' && UI.showModule) {
                            UI.showModule('settings');
                            await App.loadModule('settings');
                            setTimeout(() => {
                                const syncTab = document.querySelector('[data-tab="sync"]');
                                if (syncTab) syncTab.click();
                            }, 500);
                        }
                    };
                }
            } else {
                // Hay URL configurada: usar estado de conectividad real ya calculado
                const finalOnline = !!online;
                statusEl.className = `status-indicator ${finalOnline ? 'online' : 'offline'}`;
                textEl.textContent = syncing ? 'Sincronizando...' : (finalOnline ? 'Online' : 'Offline');
                textEl.style.color = '';
                textEl.style.fontWeight = '';
                if (syncBtn) {
                    syncBtn.style.background = '';
                    syncBtn.title = 'Sincronizar ahora';
                    syncBtn.onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (typeof window.SyncManager !== 'undefined') {
                            await window.SyncManager.syncPending();
                        }
                    };
                }
            }
        };
        
        if (!statusEl || !textEl) {
            // Si los elementos no existen, intentar encontrarlos después de un delay
            setTimeout(async () => {
                const retryStatusEl = document.getElementById('connection-status');
                const retryTextEl = document.getElementById('sync-text');
                const retrySyncBtn = document.getElementById('topbar-sync-now-btn');
                
                // Re-verificar valores actualizados
                let retryApiUrl = null;
                try {
                    if (typeof DB !== 'undefined') {
                        const urlSetting = await DB.get('settings', 'api_url');
                        retryApiUrl = urlSetting?.value || null;
                    }
                } catch (error) {
                    console.error('Error en retry:', error);
                }
                
                updateState(retryStatusEl, retryTextEl, retrySyncBtn, retryApiUrl, online, syncing);
            }, 100);
            return;
        }
        
        // Actualizar estado con los valores actuales
        updateState(statusEl, textEl, syncBtn, apiUrl, online, syncing);
    },

    // Mostrar/ocultar elementos de navegación solo para admin
    updateAdminNavigation(isAdmin) {
        const adminNavItems = document.querySelectorAll('.nav-admin-only');
        adminNavItems.forEach(item => {
            item.style.display = isAdmin ? 'flex' : 'none';
        });
        
        // Específicamente el módulo QA
        const qaNav = document.getElementById('nav-qa');
        if (qaNav) {
            qaNav.style.display = isAdmin ? 'flex' : 'none';
        }
    }
};

