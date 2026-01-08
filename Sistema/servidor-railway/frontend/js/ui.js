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

    showModule(moduleName) {
        // Si es el mismo módulo y no se está cargando, no hacer nada
        if (this.currentModule === moduleName && !this.loadingModule) {
            return;
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
            
            // Guardar módulo actual en localStorage
            localStorage.setItem('current_module', moduleName);
            
            // Trigger module load event
            window.dispatchEvent(new CustomEvent('module-loaded', { detail: { module: moduleName } }));
        } else {
            // Use placeholder for dynamic modules
            const title = document.getElementById('module-title');
            const content = document.getElementById('module-content');
            
            if (placeholder && title && content) {
                placeholder.style.display = 'block';
                title.textContent = this.getModuleTitle(moduleName);
                // Verificar si el contenido necesita ser limpiado
                // Solo limpiar si está vacío, tiene "Cargando módulo", o no tiene los elementos del módulo actual
                const hasModuleContent = content.querySelector(
                    `#${moduleName}-content, #${moduleName}-tabs, #cash-status-card, #cash-container, #reports-tabs, #reports-content, #commissions-results`
                );
                
                if (content.innerHTML.trim() === '' || 
                    content.innerHTML.includes('Cargando módulo') ||
                    !hasModuleContent) {
                    // Solo limpiar si realmente no tiene contenido del módulo
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
            'customers': 'Clientes',
            'repairs': 'Reparaciones',
            'employees': 'Empleados',
            'reports': 'Reportes',
            'costs': 'Costos',
            'tourist-report': 'Reporte Turistas',
            'sync': 'Sincronización',
            'settings': 'Configuración',
            'qa': 'QA / Autopruebas',
            'transfers': 'Transferencias entre Sucursales',
            'inventory': 'Inventario',
            'pos': 'POS',
            'cash': 'Caja',
            'dashboard': 'Dashboard'
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

    showModal(title, body, footer = '') {
        const overlay = document.getElementById('modal-overlay');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalFooter = document.getElementById('modal-footer');
        
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
            userEl.textContent = user.name || user.username || 'Usuario';
        }
    },

    updateBranchInfo(branch) {
        const branchEl = document.getElementById('current-branch');
        if (branchEl && branch) {
            branchEl.textContent = branch.name || 'Tienda';
        }
    },

    updateSyncStatus(online, syncing = false) {
        const statusEl = document.getElementById('connection-status');
        const textEl = document.getElementById('sync-text');
        
        if (statusEl) {
            statusEl.className = `status-indicator ${online ? 'online' : 'offline'}`;
        }
        
        if (textEl) {
            textEl.textContent = syncing ? 'Sincronizando...' : (online ? 'Online' : 'Offline');
        }
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

