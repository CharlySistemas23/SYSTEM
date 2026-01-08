// Transfers Module - Transferencias entre Sucursales

const Transfers = {
    initialized: false,
    
    async init() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:7',message:'Transfers.init called',data:{initialized:this.initialized,hasBranchManager:typeof BranchManager!=='undefined',hasUserManager:typeof UserManager!=='undefined',hasPermissionManager:typeof PermissionManager!=='undefined',currentUser:typeof UserManager!=='undefined'?UserManager.currentUser:null,currentBranchId:typeof BranchManager!=='undefined'?BranchManager.getCurrentBranchId():null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        try {
            // Asegurarse de que module-content existe
            let content = document.getElementById('module-content');
            if (!content) {
                // Buscar el módulo placeholder
                const placeholder = document.getElementById('module-placeholder');
                if (placeholder) {
                    placeholder.id = 'module-content';
                    content = placeholder;
                } else {
                    console.error('No se encontró module-content ni module-placeholder');
                    return;
                }
            }

            if (this.initialized) {
                await this.loadTransfers();
                return;
            }
            
            this.setupUI();
            // Esperar un momento para que se cree el contenedor
            await new Promise(resolve => setTimeout(resolve, 50));
            await this.loadTransfers();
            this.initialized = true;
        } catch (e) {
            console.error('Error inicializando módulo de transferencias:', e);
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <p style="color: var(--color-danger);">Error al inicializar el módulo de transferencias</p>
                        <p style="color: var(--color-text-secondary); font-size: 12px;">${e.message}</p>
                        <button class="btn-primary" onclick="window.Transfers.init()" style="margin-top: var(--spacing-md);">
                            Reintentar
                        </button>
                    </div>
                `;
            }
        }
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) {
            console.error('module-content no encontrado en setupUI de Transfers');
            return;
        }

        try {
            content.innerHTML = `
            <div style="max-width: 100%;">
                <!-- Header con acciones -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-lg); flex-wrap: wrap; gap: var(--spacing-md);">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Transferencias entre Sucursales</h2>
                    ${typeof PermissionManager === 'undefined' || PermissionManager.hasPermission('transfers.create') ? `
                    <button class="btn-primary" onclick="window.Transfers.showNewTransferModal()">
                        <i class="fas fa-exchange-alt"></i> Nueva Transferencia
                    </button>
                    ` : ''}
                </div>

                <!-- Filtros -->
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                        <div class="form-group">
                            <label>Sucursal Origen</label>
                            <select id="transfer-filter-from" class="form-select">
                                <option value="">Todas</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Sucursal Destino</label>
                            <select id="transfer-filter-to" class="form-select">
                                <option value="">Todas</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Estado</label>
                            <select id="transfer-filter-status" class="form-select">
                                <option value="">Todos</option>
                                <option value="pending">Pendiente</option>
                                <option value="in_transit">En Tránsito</option>
                                <option value="completed">Completada</option>
                                <option value="cancelled">Cancelada</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Fecha Desde</label>
                            <input type="date" id="transfer-filter-date-from" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Fecha Hasta</label>
                            <input type="date" id="transfer-filter-date-to" class="form-input">
                        </div>
                    </div>
                    <button class="btn-secondary btn-sm" onclick="window.Transfers.loadTransfers()" style="margin-top: var(--spacing-sm);">
                        <i class="fas fa-filter"></i> Filtrar
                    </button>
                </div>

                <!-- Lista de transferencias -->
                <div id="transfers-list-container"></div>
            </div>
        `;

            this.setupEventListeners();
        } catch (e) {
            console.error('Error en setupUI de Transfers:', e);
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <p style="color: var(--color-danger);">Error al cargar el módulo de transferencias</p>
                        <p style="color: var(--color-text-secondary); font-size: 12px;">${e.message}</p>
                        <button class="btn-primary" onclick="window.Transfers.init()" style="margin-top: var(--spacing-md);">
                            Reintentar
                        </button>
                    </div>
                `;
            }
        }
    },

    async setupEventListeners() {
        // Cargar sucursales en filtros - solo las accesibles por el usuario
        const branches = await DB.getAll('catalog_branches') || [];
        let accessibleBranches = [];
        
        if (typeof BranchManager !== 'undefined' && typeof BranchManager.getUserBranches === 'function') {
            accessibleBranches = await BranchManager.getUserBranches();
        } else {
            // Fallback: todas las sucursales activas si no hay BranchManager
            accessibleBranches = branches.filter(b => b.active);
        }
        
        const activeBranches = accessibleBranches.filter(b => b.active);
        
        const fromSelect = document.getElementById('transfer-filter-from');
        const toSelect = document.getElementById('transfer-filter-to');
        
        if (fromSelect) {
            fromSelect.innerHTML = '<option value="">Todas</option>' + 
                activeBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }
        if (toSelect) {
            toSelect.innerHTML = '<option value="">Todas</option>' + 
                activeBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        }
    },

    async loadTransfers() {
        // #region agent log
        const hasViewPermission = typeof PermissionManager !== 'undefined' ? PermissionManager.hasPermission('transfers.view') : true;
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:146',message:'loadTransfers called - permission check',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasViewPermission:hasViewPermission,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null,userPermissions:typeof UserManager!=='undefined'?UserManager.currentUser?.permissions:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso de visualización
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.view')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:152',message:'Permission denied for transfers.view',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para ver transferencias', 'error');
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = `
                    <div style="padding: var(--spacing-lg); text-align: center;">
                        <p style="color: var(--color-danger);">No tienes permiso para acceder a este módulo</p>
                    </div>
                `;
            }
            return;
        }

        let container = document.getElementById('transfers-list-container');
        if (!container) {
            console.error('transfers-list-container no encontrado. Reejecutando setupUI...');
            // Si el contenedor no existe, puede ser que setupUI no se ejecutó correctamente
            this.setupUI();
            // Esperar un momento para que se cree el contenedor
            await new Promise(resolve => setTimeout(resolve, 100));
            container = document.getElementById('transfers-list-container');
            if (!container) {
                console.error('No se pudo crear transfers-list-container');
                const content = document.getElementById('module-content');
                if (content) {
                    content.innerHTML = `
                        <div style="padding: var(--spacing-lg); text-align: center;">
                            <p style="color: var(--color-danger);">Error: No se pudo inicializar el módulo de transferencias</p>
                            <button class="btn-primary" onclick="window.Transfers.init()" style="margin-top: var(--spacing-md);">
                                Reintentar
                            </button>
                        </div>
                    `;
                }
                return;
            }
        }

        try {
            // Obtener todas las transferencias
            let allTransfers = [];
            try {
                allTransfers = await DB.getAll('inventory_transfers') || [];
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:178',message:'Before branch filtering',data:{totalTransfers:allTransfers.length,hasBranchManager:typeof BranchManager!=='undefined',currentBranchId:typeof BranchManager!=='undefined'?BranchManager.getCurrentBranchId():null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                
                // Filtrar por sucursal si es necesario
                if (typeof BranchManager !== 'undefined') {
                    const currentBranchId = BranchManager.getCurrentBranchId();
                    const isAdmin = typeof UserManager !== 'undefined' && 
                                   (UserManager.currentUser?.role === 'admin' || 
                                    UserManager.currentUser?.permissions?.includes('all'));
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:186',message:'Branch filtering check',data:{isAdmin:isAdmin,currentBranchId:currentBranchId,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    if (!isAdmin && currentBranchId) {
                        // Si no es admin, solo mostrar transferencias de su sucursal
                        const beforeCount = allTransfers.length;
                        allTransfers = allTransfers.filter(t => 
                            t.from_branch_id === currentBranchId || 
                            t.to_branch_id === currentBranchId ||
                            !t.from_branch_id // Incluir las que no tienen branch_id
                        );
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:194',message:'After branch filtering',data:{beforeCount:beforeCount,afterCount:allTransfers.length,currentBranchId:currentBranchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                    }
                }
            } catch (dbError) {
                console.error('Error obteniendo transferencias de DB:', dbError);
                allTransfers = [];
            }

            // Aplicar filtros
            const fromFilter = document.getElementById('transfer-filter-from')?.value;
            const toFilter = document.getElementById('transfer-filter-to')?.value;
            const statusFilter = document.getElementById('transfer-filter-status')?.value;
            const dateFrom = document.getElementById('transfer-filter-date-from')?.value;
            const dateTo = document.getElementById('transfer-filter-date-to')?.value;

            let filtered = allTransfers;

            if (fromFilter) {
                filtered = filtered.filter(t => t.from_branch_id === fromFilter);
            }
            if (toFilter) {
                filtered = filtered.filter(t => t.to_branch_id === toFilter);
            }
            if (statusFilter) {
                filtered = filtered.filter(t => t.status === statusFilter);
            }
            if (dateFrom) {
                filtered = filtered.filter(t => {
                    const transferDate = t.created_at?.split('T')[0] || '';
                    return transferDate >= dateFrom;
                });
            }
            if (dateTo) {
                filtered = filtered.filter(t => {
                    const transferDate = t.created_at?.split('T')[0] || '';
                    return transferDate <= dateTo;
                });
            }

            // Ordenar por fecha más reciente
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Obtener información de sucursales
            const branches = await DB.getAll('catalog_branches') || [];
            const getBranchName = (id) => branches.find(b => b.id === id)?.name || id;

            if (filtered.length === 0) {
                const emptyContainer = document.getElementById('transfers-list-container');
                if (emptyContainer) {
                    emptyContainer.innerHTML = `
                        <div class="module" style="padding: var(--spacing-xl); text-align: center; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                            <i class="fas fa-exchange-alt" style="font-size: 48px; color: var(--color-text-secondary); margin-bottom: var(--spacing-md);"></i>
                            <p style="color: var(--color-text-secondary);">No hay transferencias registradas</p>
                            ${typeof PermissionManager === 'undefined' || PermissionManager.hasPermission('transfers.create') ? `
                            <button class="btn-primary" onclick="window.Transfers.showNewTransferModal()" style="margin-top: var(--spacing-md);">
                                <i class="fas fa-plus"></i> Crear Primera Transferencia
                            </button>
                            ` : ''}
                        </div>
                    `;
                }
                return;
            }

            // Asegurarse de que tenemos el contenedor
            if (!container) {
                container = document.getElementById('transfers-list-container');
            }
            if (!container) {
                console.error('transfers-list-container no encontrado al renderizar');
                return;
            }

            container.innerHTML = `
                <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                    <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        <i class="fas fa-list"></i> Transferencias (${filtered.length})
                    </h3>
                    <div style="overflow-x: auto; width: 100%;">
                        <table class="data-table" style="width: 100%; min-width: 800px;">
                            <thead>
                                <tr>
                                    <th>Folio</th>
                                    <th>Desde</th>
                                    <th>Hacia</th>
                                    <th>Items</th>
                                    <th>Estado</th>
                                    <th>Fecha</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.map(transfer => {
                                    const statusColors = {
                                        'pending': 'warning',
                                        'in_transit': 'info',
                                        'completed': 'success',
                                        'cancelled': 'danger'
                                    };
                                    const statusLabels = {
                                        'pending': 'Pendiente',
                                        'in_transit': 'En Tránsito',
                                        'completed': 'Completada',
                                        'cancelled': 'Cancelada'
                                    };
                                    return `
                                        <tr>
                                            <td><strong>${transfer.folio || transfer.id.substring(0, 8)}</strong></td>
                                            <td>${getBranchName(transfer.from_branch_id)}</td>
                                            <td>${getBranchName(transfer.to_branch_id)}</td>
                                            <td>${transfer.items_count || 0} pieza(s)</td>
                                            <td>
                                                <span class="status-badge status-${statusColors[transfer.status] || 'secondary'}">
                                                    ${statusLabels[transfer.status] || transfer.status}
                                                </span>
                                            </td>
                                            <td>${Utils.formatDate(new Date(transfer.created_at), 'DD/MM/YYYY HH:mm')}</td>
                                            <td>
                                                <button class="btn-secondary btn-sm" onclick="window.Transfers.viewTransfer('${transfer.id}')" title="Ver detalles">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                ${transfer.status === 'pending' && (typeof PermissionManager === 'undefined' || PermissionManager.hasPermission('transfers.approve')) ? `
                                                    <button class="btn-primary btn-sm" onclick="window.Transfers.completeTransfer('${transfer.id}')" title="Completar">
                                                        <i class="fas fa-check"></i>
                                                    </button>
                                                    <button class="btn-danger btn-sm" onclick="window.Transfers.cancelTransfer('${transfer.id}')" title="Cancelar">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Error loading transfers:', e);
            Utils.showNotification('Error al cargar transferencias: ' + e.message, 'error');
        }
    },

    async showNewTransferModal() {
        // #region agent log
        const hasCreatePermission = typeof PermissionManager !== 'undefined' ? PermissionManager.hasPermission('transfers.create') : true;
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:333',message:'showNewTransferModal called - permission check',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasCreatePermission:hasCreatePermission,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso de creación
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.create')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:339',message:'Permission denied for transfers.create',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para crear transferencias', 'error');
            return;
        }
        
        // Verificar que BranchManager esté disponible
        if (typeof BranchManager === 'undefined') {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:347',message:'BranchManager not available',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('Error: BranchManager no está disponible', 'error');
            return;
        }
        
        const branches = await DB.getAll('catalog_branches') || [];
        const currentBranchId = BranchManager.getCurrentBranchId();
        
        // Determinar si es admin/manager (puede transferir entre cualquier sucursal)
        const isAdmin = typeof UserManager !== 'undefined' && 
                       (UserManager.currentUser?.role === 'admin' || 
                        UserManager.currentUser?.permissions?.includes('all'));
        const isManager = typeof UserManager !== 'undefined' && 
                         UserManager.currentUser?.role === 'manager';
        
        // Obtener sucursales para ORIGEN (solo las que el usuario puede usar como origen)
        let originBranches = [];
        if (typeof BranchManager !== 'undefined' && typeof BranchManager.getUserBranches === 'function') {
            originBranches = await BranchManager.getUserBranches();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:415',message:'User accessible branches for origin',data:{originBranchesCount:originBranches.length,originBranchIds:originBranches.map(b=>b.id),currentBranchId:currentBranchId,isAdmin:isAdmin,isManager:isManager},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        } else {
            // Fallback: todas las sucursales activas
            originBranches = branches.filter(b => b.active);
        }
        
        // Para DESTINO: si es admin/manager, puede transferir a cualquier sucursal activa
        // Si no, solo a las que tiene acceso (pero puede haber casos donde permitimos todas)
        let destinationBranches = [];
        if (isAdmin || isManager) {
            // Admin/manager puede transferir a cualquier sucursal activa
            destinationBranches = branches.filter(b => b.active);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:426',message:'Admin/manager - all active branches for destination',data:{destinationBranchesCount:destinationBranches.length,destinationBranchIds:destinationBranches.map(b=>b.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        } else {
            // Usuario normal: puede transferir a cualquier sucursal activa (no solo las que tiene acceso)
            // Esto permite transferencias entre sucursales
            destinationBranches = branches.filter(b => b.active);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:432',message:'Regular user - all active branches for destination',data:{destinationBranchesCount:destinationBranches.length,destinationBranchIds:destinationBranches.map(b=>b.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        }
        
        const activeOriginBranches = originBranches.filter(b => b.active);
        const activeDestinationBranches = destinationBranches.filter(b => b.active);
        
        // Obtener inventario de la sucursal actual
        const inventory = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: true, 
            branchIdField: 'branch_id' 
        }) || [];
        const availableItems = inventory.filter(i => i.status === 'disponible' && (i.stock_actual ?? 1) > 0);

        const body = `
            <form id="new-transfer-form">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                    <div class="form-group">
                        <label style="font-size: 12px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-warehouse" style="margin-right: var(--spacing-xs); color: var(--color-primary);"></i>
                            Sucursal Origen <span style="color: var(--color-danger);">*</span>
                        </label>
                        <select id="transfer-from-branch" class="form-select" required>
                            ${activeOriginBranches.map(b => 
                                `<option value="${b.id}" ${b.id === currentBranchId ? 'selected' : ''}>${b.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-size: 12px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: var(--spacing-xs);">
                            <i class="fas fa-map-marker-alt" style="margin-right: var(--spacing-xs); color: var(--color-primary);"></i>
                            Sucursal Destino <span style="color: var(--color-danger);">*</span>
                        </label>
                        <select id="transfer-to-branch" class="form-select" required>
                            ${activeDestinationBranches.filter(b => b.id !== currentBranchId).map(b => 
                                `<option value="${b.id}">${b.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: var(--spacing-md);">
                    <label style="font-size: 12px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: var(--spacing-xs); display: flex; align-items: center; justify-content: space-between;">
                        <span>
                            <i class="fas fa-search" style="margin-right: var(--spacing-xs); color: var(--color-primary);"></i>
                            Buscar Pieza
                        </span>
                        <small style="font-weight: normal; color: var(--color-text-secondary); text-transform: none; letter-spacing: 0; font-size: 10px;">
                            Presiona Enter para buscar
                        </small>
                    </label>
                    <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <input type="text" id="transfer-search-item" class="form-input" 
                               placeholder="Buscar por SKU, código de barras o nombre (mín. 2 caracteres)..." 
                               autocomplete="off"
                               style="flex: 1;">
                        ${typeof BarcodeManager !== 'undefined' ? `
                            <button type="button" class="btn-secondary btn-sm" onclick="window.Transfers.startBarcodeScan()" title="Escanear código de barras">
                                <i class="fas fa-barcode"></i>
                            </button>
                        ` : ''}
                        <button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('transfer-search-item').value=''; window.Transfers.searchItemForTransfer('', true);" title="Limpiar búsqueda">
                            <i class="fas fa-times"></i>
                        </button>
                        <button type="button" class="btn-secondary btn-sm" onclick="window.Transfers.showAllAvailableItems()" title="Ver todos los items disponibles">
                            <i class="fas fa-list"></i> Ver Todos
                        </button>
                    </div>
                </div>

                <div id="transfer-items-list" style="max-height: 320px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); padding: var(--spacing-md); background: var(--color-bg); min-height: 100px;">
                    <div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-lg);">
                        <i class="fas fa-search" style="font-size: 40px; opacity: 0.2; margin-bottom: var(--spacing-md); color: var(--color-text-tertiary);"></i>
                        <p style="margin: 0 0 var(--spacing-xs) 0; font-size: 13px; font-weight: 500; color: var(--color-text);">Busca piezas para agregar a la transferencia</p>
                        <small style="font-size: 11px; opacity: 0.7; color: var(--color-text-secondary);">
                            Busca por SKU, código de barras o nombre<br>
                            O haz clic en <strong>"Ver Todos"</strong> para ver todos los items disponibles
                        </small>
                    </div>
                </div>

                <div style="margin: var(--spacing-md) 0;">
                    <label style="font-size: 12px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: var(--spacing-xs); display: block;">
                        <i class="fas fa-list-check" style="margin-right: var(--spacing-xs); color: var(--color-primary);"></i>
                        Items Seleccionados
                    </label>
                    <div id="transfer-selected-items" style="padding: var(--spacing-md); background: var(--color-bg-secondary); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); min-height: 80px;">
                        <div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-md);">
                            <i class="fas fa-inbox" style="font-size: 32px; opacity: 0.3; margin-bottom: var(--spacing-sm);"></i>
                            <p style="margin: 0; font-size: 12px;">No hay items seleccionados</p>
                            <small style="font-size: 10px; opacity: 0.7;">Busca y agrega items para crear la transferencia</small>
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-top: var(--spacing-md);">
                    <label style="font-size: 12px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: var(--spacing-xs);">
                        <i class="fas fa-sticky-note" style="margin-right: var(--spacing-xs); color: var(--color-primary);"></i>
                        Notas <span style="text-transform: none; font-weight: normal; color: var(--color-text-secondary);">(opcional)</span>
                    </label>
                    <textarea id="transfer-notes" class="form-textarea" rows="3" placeholder="Notas sobre la transferencia..."></textarea>
                </div>
            </form>
        `;

        UI.showModal('Nueva Transferencia', body, [
            { text: 'Cancelar', class: 'btn-secondary', onclick: 'UI.closeModal()' },
            { text: 'Crear Transferencia', class: 'btn-primary', onclick: 'window.Transfers.createTransfer()' }
        ]);
        
        // Agregar clase large al modal para que tenga más espacio
        setTimeout(() => {
            const modal = document.querySelector('.modal');
            if (modal) {
                modal.classList.add('modal-large');
            }
        }, 50);

        // Inicializar lista de items disponibles
        this.transferSelectedItems = [];
        this.updateTransferSelectedItems();
        
        // Configurar event listener para el input de búsqueda DESPUÉS de que el modal se muestre
        setTimeout(() => {
            const searchInput = document.getElementById('transfer-search-item');
            if (searchInput) {
                // Remover listeners anteriores si existen
                searchInput.removeEventListener('input', this.searchInputHandler);
                // Crear nuevo handler con debounce mejorado
                this.searchInputHandler = (e) => {
                    const query = e.target.value.trim();
                    // Búsqueda inmediata si se borra o es muy corta
                    this.searchItemForTransfer(query, query.length < 2);
                };
                searchInput.addEventListener('input', this.searchInputHandler);
                
                // Agregar soporte para Enter y Escape
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = searchInput.value.trim();
                        if (query.length >= 2) {
                            this.searchItemForTransfer(query, true);
                        }
                    } else if (e.key === 'Escape') {
                        searchInput.value = '';
                        this.searchItemForTransfer('', true);
                    }
                });
                
                // Agregar botón de escaneo de código de barras si está disponible
                if (typeof BarcodeManager !== 'undefined') {
                    const searchWrapper = searchInput.closest('.form-group');
                    if (searchWrapper && !document.getElementById('transfer-barcode-scan-btn')) {
                        const scanBtn = document.createElement('button');
                        scanBtn.id = 'transfer-barcode-scan-btn';
                        scanBtn.type = 'button';
                        scanBtn.className = 'btn-secondary btn-sm';
                        scanBtn.innerHTML = '<i class="fas fa-barcode"></i>';
                        scanBtn.title = 'Escanear código de barras';
                        scanBtn.style.marginLeft = 'var(--spacing-xs)';
                        scanBtn.onclick = () => this.startBarcodeScan();
                        searchInput.parentNode.insertBefore(scanBtn, searchInput.nextSibling);
                    }
                }
                // También agregar listener para cambios en el selector de sucursal origen
                const fromBranchSelect = document.getElementById('transfer-from-branch');
                if (fromBranchSelect) {
                    fromBranchSelect.addEventListener('change', () => {
                        // Si hay búsqueda activa, re-buscar con la nueva sucursal
                        if (searchInput.value && searchInput.value.length >= 2) {
                            this.searchItemForTransfer(searchInput.value);
                        }
                    });
                }
            }
        }, 100);
    },

    // Búsqueda con debounce para mejorar rendimiento
    searchDebounceTimer: null,
    
    async searchItemForTransfer(query, immediate = false) {
        // Limpiar timer anterior
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Si es inmediato o query muy corto, ejecutar de inmediato
        if (immediate || !query || query.length < 2) {
            await this.executeSearch(query);
            return;
        }
        
        // Debounce de 300ms para búsquedas
        this.searchDebounceTimer = setTimeout(() => {
            this.executeSearch(query);
        }, 300);
    },
    
    async executeSearch(query) {
        // Mostrar indicador de carga
        const container = document.getElementById('transfer-items-list');
        if (container && query && query.length >= 2) {
            container.innerHTML = '<div style="text-align: center; padding: var(--spacing-md);"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
        }
        
        // Si no hay query, mostrar mensaje informativo
        if (!query || query.length < 2) {
            if (container) {
                const fromBranchId = document.getElementById('transfer-from-branch')?.value;
                const fromBranchSelect = document.getElementById('transfer-from-branch');
                const fromBranchName = fromBranchSelect?.options[fromBranchSelect.selectedIndex]?.text || 'la sucursal seleccionada';
                
                container.innerHTML = `
                    <div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-lg);">
                        <i class="fas fa-search" style="font-size: 32px; opacity: 0.3; margin-bottom: var(--spacing-sm);"></i>
                        <p style="margin: 0 0 var(--spacing-xs) 0; font-size: 13px;">Busca piezas para agregar a la transferencia</p>
                        <small style="font-size: 11px; opacity: 0.7; display: block; margin-top: var(--spacing-xs);">
                            ${fromBranchId ? `Buscará en: <strong>${fromBranchName}</strong><br>` : 'Selecciona una sucursal origen primero<br>'}
                            Busca por SKU, código de barras o nombre (mínimo 2 caracteres)
                        </small>
                    </div>
                `;
            }
            return;
        }

        const fromBranchId = document.getElementById('transfer-from-branch')?.value;
        if (!fromBranchId) {
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-lg); color: var(--color-warning);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: var(--spacing-sm);"></i>
                        <p style="margin: 0;">Selecciona una sucursal origen primero</p>
                        <small style="font-size: 11px; opacity: 0.8;">
                            Debes seleccionar la sucursal desde donde se transferirán los items
                        </small>
                    </div>
                `;
            }
            return;
        }

        try {
            // Buscar items en la sucursal origen - usar DB.getAll con filtro optimizado
            const allItems = await DB.getAll('inventory_items', null, null, { 
                filterByBranch: false 
            }) || [];
            
            // Normalizar query para búsqueda
            const normalizedQuery = query.trim().toLowerCase();
            
            // Normalizar branch_id para comparación (ambos a string)
            const normalizedFromBranchId = String(fromBranchId);
            
            // Filtrar items: 
            // 1. Deben estar en la sucursal origen (comparación flexible de tipos)
            // 2. Deben tener stock > 0 o no tener stock_actual pero estar disponibles
            // 3. Deben coincidir con la búsqueda
            // Status más flexible: aceptar 'disponible', null, undefined, o cualquier valor excepto 'vendida'
            let branchItems = allItems.filter(item => {
                // Comparar branch_id de forma flexible (string vs number)
                const itemBranchId = item.branch_id != null ? String(item.branch_id) : null;
                if (itemBranchId !== normalizedFromBranchId) return false;
                return true;
            });
            
            // Segundo filtro: stock y status
            branchItems = branchItems.filter(item => {
                // Excluir vendidas
                if (item.status === 'vendida') return false;
                
                // Verificar stock: si tiene stock_actual, debe ser > 0
                // Si no tiene stock_actual, permitirlo si tiene status 'disponible' o no tiene status
                const stock = item.stock_actual;
                if (stock !== undefined && stock !== null) {
                    if (stock <= 0) return false;
                } else {
                    // No tiene stock_actual definido - solo permitir si está disponible o sin status
                    if (item.status && item.status !== 'disponible') return false;
                }
                
                return true;
            });
            
            // Tercer filtro: búsqueda
            branchItems = branchItems.filter(item => {
                const matchesSku = item.sku?.toLowerCase().includes(normalizedQuery);
                const matchesBarcode = item.barcode?.toString().includes(query); // Búsqueda exacta para códigos
                const matchesName = item.name?.toLowerCase().includes(normalizedQuery);
                
                return matchesSku || matchesBarcode || matchesName;
            });
            
            // Ordenar por relevancia (coincidencia exacta primero, luego por nombre)
            branchItems.sort((a, b) => {
                const aExact = (a.sku?.toLowerCase() === normalizedQuery || a.barcode?.toString() === query) ? 1 : 0;
                const bExact = (b.sku?.toLowerCase() === normalizedQuery || b.barcode?.toString() === query) ? 1 : 0;
                if (aExact !== bExact) return bExact - aExact;
                return (a.name || '').localeCompare(b.name || '');
            });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:585',message:'Filtered branch items',data:{branchItemsCount:branchItems.length,query:query,fromBranchId:fromBranchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

            if (!container) {
                console.error('transfer-items-list container not found');
                return;
            }
            
            if (branchItems.length === 0) {
                // Obtener información de diagnóstico
                const totalInBranch = allItems.filter(i => i.branch_id === fromBranchId).length;
                const availableInBranch = allItems.filter(i => 
                    i.branch_id === fromBranchId && 
                    (i.stock_actual ?? 1) > 0 && 
                    i.status !== 'vendida'
                ).length;
                
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-lg);">
                        <i class="fas fa-search" style="font-size: 48px; color: var(--color-text-secondary); opacity: 0.5; margin-bottom: var(--spacing-md);"></i>
                        <p style="color: var(--color-text-secondary); margin: 0 0 var(--spacing-xs) 0; font-weight: 600;">No se encontraron piezas</p>
                        <small style="font-size: 11px; color: var(--color-text-secondary); opacity: 0.7; display: block; margin-top: var(--spacing-xs);">
                            Búsqueda: "<strong>${Utils.escapeHtml(query)}</strong>"<br>
                            ${totalInBranch > 0 ? `
                                En esta sucursal hay ${totalInBranch} item${totalInBranch !== 1 ? 's' : ''} 
                                (${availableInBranch} disponible${availableInBranch !== 1 ? 's' : ''})
                            ` : 'Esta sucursal no tiene items registrados'}
                        </small>
                        <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg); border-radius: var(--radius-sm); border: 1px solid var(--color-border-light);">
                            <small style="font-size: 10px; color: var(--color-text-secondary);">
                                <strong>Sugerencias:</strong><br>
                                • Intenta con otro término de búsqueda<br>
                                • Busca por SKU, código de barras o parte del nombre<br>
                                • Verifica que los items tengan stock disponible
                            </small>
                        </div>
                    </div>
                `;
                return;
            }

            // Crear HTML mejorado con mejor diseño
            container.innerHTML = `
                <div style="margin-bottom: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-xs); font-size: 11px; color: var(--color-text-secondary);">
                    <i class="fas fa-info-circle"></i> ${branchItems.length} pieza${branchItems.length !== 1 ? 's' : ''} encontrada${branchItems.length !== 1 ? 's' : ''}
                </div>
                ${branchItems.map((item, index) => {
                    const alreadySelected = this.transferSelectedItems?.find(ti => ti.id === item.id);
                    const stock = item.stock_actual ?? (item.status === 'disponible' ? 1 : 0);
                    const maxCanAdd = Math.min(stock, alreadySelected ? (stock - alreadySelected.quantity) : stock);
                    
                    return `
                        <div class="transfer-item-card" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); margin-bottom: var(--spacing-sm); background: var(--color-bg-card); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); transition: all var(--transition-fast); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 13px; margin-bottom: var(--spacing-xs); color: var(--color-text); letter-spacing: -0.1px;">
                                    ${Utils.escapeHtml(item.name || 'Sin nombre')}
                                </div>
                                <div style="display: flex; gap: var(--spacing-md); flex-wrap: wrap; font-size: 11px; color: var(--color-text-secondary);">
                                    ${item.sku ? `<span style="display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-tag" style="font-size: 10px; opacity: 0.7;"></i> <strong style="font-weight: 600;">${Utils.escapeHtml(item.sku)}</strong></span>` : ''}
                                    ${item.barcode ? `<span style="display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-barcode" style="font-size: 10px; opacity: 0.7;"></i> <strong style="font-weight: 600;">${Utils.escapeHtml(item.barcode)}</strong></span>` : ''}
                                    <span style="display: inline-flex; align-items: center; gap: 4px;">
                                        <i class="fas fa-box" style="font-size: 10px; opacity: 0.7;"></i> 
                                        Stock: <strong style="color: ${stock > 5 ? 'var(--color-success)' : stock > 2 ? 'var(--color-warning)' : 'var(--color-danger)'}; font-weight: 700;">${stock || 0}</strong>
                                    </span>
                                </div>
                            </div>
                            <div style="margin-left: var(--spacing-md); display: flex; align-items: center; gap: var(--spacing-xs); flex-shrink: 0;">
                                ${alreadySelected ? `
                                    <div style="text-align: right; padding-right: var(--spacing-sm); border-right: 1px solid var(--color-border-light);">
                                        <div style="color: var(--color-success); font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                                            <i class="fas fa-check-circle"></i> Agregado
                                        </div>
                                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
                                            Cantidad: <strong style="font-weight: 600;">${alreadySelected.quantity}</strong>
                                        </div>
                                    </div>
                                    ${maxCanAdd > 0 ? `
                                        <button class="btn-secondary btn-sm transfer-add-item-btn" data-item-id="${item.id}" type="button" title="Agregar más" style="min-width: 32px;">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    ` : `
                                        <span style="font-size: 10px; color: var(--color-text-tertiary); padding: 4px 8px; background: var(--color-bg-secondary); border-radius: var(--radius-xs);">Sin stock</span>
                                    `}
                                ` : `
                                    <button class="btn-primary btn-sm transfer-add-item-btn" data-item-id="${item.id}" type="button" title="Agregar a transferencia">
                                        <i class="fas fa-plus"></i> Agregar
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            `;
            
            // Agregar event listeners a los botones DESPUÉS de crear el HTML
            requestAnimationFrame(() => {
                container.querySelectorAll('.transfer-add-item-btn').forEach(btn => {
                    const itemId = btn.getAttribute('data-item-id');
                    if (itemId) {
                        // Crear handler individual para cada botón usando closure
                        const handler = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.addItemToTransfer(itemId);
                        };
                        // Remover listener anterior si existe
                        btn.removeEventListener('click', handler);
                        btn.addEventListener('click', handler);
                    }
                });
                
                // Agregar efecto hover a las tarjetas
                container.querySelectorAll('.transfer-item-card').forEach(card => {
                    card.addEventListener('mouseenter', function() {
                        this.style.background = 'var(--color-bg)';
                        this.style.borderColor = 'var(--color-primary)';
                        this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                        this.style.transform = 'translateY(-2px)';
                    });
                    card.addEventListener('mouseleave', function() {
                        this.style.background = 'var(--color-bg-card)';
                        this.style.borderColor = 'var(--color-border-light)';
                        this.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                        this.style.transform = 'translateY(0)';
                    });
                });
            });
        } catch (error) {
            console.error('Error en búsqueda de items:', error);
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: var(--spacing-lg); color: var(--color-danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: var(--spacing-md);"></i>
                        <p>Error al buscar items: ${error.message}</p>
                        <button class="btn-secondary btn-sm" onclick="window.Transfers.searchItemForTransfer(document.getElementById('transfer-search-item')?.value || '')" style="margin-top: var(--spacing-sm);">
                            Reintentar
                        </button>
                    </div>
                `;
            }
        }
    },

    // Mostrar todos los items disponibles de la sucursal origen
    async showAllAvailableItems() {
        const fromBranchId = document.getElementById('transfer-from-branch')?.value;
        if (!fromBranchId) {
            Utils.showNotification('Selecciona una sucursal origen primero', 'warning');
            return;
        }
        
        // Buscar todos los items disponibles (sin filtro de búsqueda)
        const allItems = await DB.getAll('inventory_items', null, null, { 
            filterByBranch: false 
        }) || [];
        
        console.log('[TRANSFER] showAllAvailableItems - Diagnóstico:', {
            totalItems: allItems.length,
            fromBranchId: fromBranchId,
            fromBranchIdType: typeof fromBranchId,
            sampleItems: allItems.slice(0, 3).map(i => ({
                id: i.id,
                name: i.name,
                branch_id: i.branch_id,
                branch_idType: typeof i.branch_id,
                stock_actual: i.stock_actual,
                status: i.status
            }))
        });
        
        // Normalizar branch_id para comparación (ambos a string para evitar problemas de tipo)
        const normalizedFromBranchId = String(fromBranchId);
        
        // Filtrar solo por sucursal (comparación flexible de tipos)
        // Primero filtramos por sucursal, luego verificamos stock
        let branchItems = allItems.filter(item => {
            // Comparar branch_id de forma flexible (string vs number)
            const itemBranchId = item.branch_id != null ? String(item.branch_id) : null;
            const matchesBranch = itemBranchId === normalizedFromBranchId;
            return matchesBranch;
        });
        
        console.log('[TRANSFER] Items en sucursal:', {
            branchItemsCount: branchItems.length,
            branchItemsSample: branchItems.slice(0, 3).map(i => ({
                id: i.id,
                name: i.name,
                stock_actual: i.stock_actual,
                status: i.status
            }))
        });
        
        // Luego filtrar por stock (más flexible - permitir items sin stock_actual definido si tienen status disponible)
        branchItems = branchItems.filter(item => {
            // Excluir vendidas
            if (item.status === 'vendida') return false;
            
            // Verificar stock: si tiene stock_actual, debe ser > 0
            // Si no tiene stock_actual, permitirlo si tiene status 'disponible' o no tiene status
            const stock = item.stock_actual;
            if (stock !== undefined && stock !== null) {
                if (stock <= 0) return false;
            } else {
                // No tiene stock_actual definido - solo permitir si está disponible o sin status
                if (item.status && item.status !== 'disponible') return false;
            }
            
            return true;
        });
        
        console.log('[TRANSFER] Items después de filtrar stock:', {
            finalCount: branchItems.length
        });
        
        // Ordenar por nombre
        branchItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        const container = document.getElementById('transfer-items-list');
        if (!container) return;
        
        if (branchItems.length === 0) {
            // Diagnóstico: contar items por diferentes criterios
            const totalInBranch = allItems.filter(i => {
                const itemBranchId = i.branch_id != null ? String(i.branch_id) : null;
                return itemBranchId === normalizedFromBranchId;
            }).length;
            
            const withStock = allItems.filter(i => {
                const itemBranchId = i.branch_id != null ? String(i.branch_id) : null;
                if (itemBranchId !== normalizedFromBranchId) return false;
                const stock = i.stock_actual;
                return stock !== undefined && stock !== null && stock > 0;
            }).length;
            
            const vendidas = allItems.filter(i => {
                const itemBranchId = i.branch_id != null ? String(i.branch_id) : null;
                return itemBranchId === normalizedFromBranchId && i.status === 'vendida';
            }).length;
            
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-lg);">
                    <i class="fas fa-box-open" style="font-size: 48px; color: var(--color-text-secondary); opacity: 0.5; margin-bottom: var(--spacing-md);"></i>
                    <p style="color: var(--color-text-secondary); margin: 0 0 var(--spacing-xs) 0; font-weight: 600;">No hay items disponibles</p>
                    <small style="font-size: 11px; color: var(--color-text-secondary); opacity: 0.7; display: block; margin-top: var(--spacing-xs);">
                        ${totalInBranch > 0 ? `
                            En esta sucursal: ${totalInBranch} item${totalInBranch !== 1 ? 's' : ''}<br>
                            ${withStock > 0 ? `Con stock: ${withStock}` : 'Sin items con stock'}<br>
                            ${vendidas > 0 ? `Vendidas: ${vendidas}` : ''}
                        ` : 'Esta sucursal no tiene items registrados'}
                    </small>
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg); border-radius: var(--radius-sm); border: 1px solid var(--color-border-light);">
                        <small style="font-size: 10px; color: var(--color-text-secondary);">
                            <strong>Diagnóstico:</strong><br>
                            Sucursal ID: <code>${fromBranchId}</code><br>
                            Total items en DB: ${allItems.length}<br>
                            Items en esta sucursal: ${totalInBranch}
                        </small>
                    </div>
                </div>
            `;
            return;
        }
        
        // Usar el mismo formato de renderizado que la búsqueda
        container.innerHTML = `
            <div style="margin-bottom: var(--spacing-xs); padding: var(--spacing-xs) var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-xs); font-size: 11px; color: var(--color-text-secondary);">
                <i class="fas fa-list"></i> ${branchItems.length} pieza${branchItems.length !== 1 ? 's' : ''} disponible${branchItems.length !== 1 ? 's' : ''} en esta sucursal
            </div>
            ${branchItems.map((item, index) => {
                const alreadySelected = this.transferSelectedItems?.find(ti => ti.id === item.id);
                const stock = item.stock_actual ?? (item.status === 'disponible' ? 1 : 0);
                const maxCanAdd = Math.min(stock, alreadySelected ? (stock - alreadySelected.quantity) : stock);
                
                return `
                    <div class="transfer-item-card" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); margin-bottom: var(--spacing-sm); background: var(--color-bg-card); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); transition: all var(--transition-fast); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: var(--spacing-xs); color: var(--color-text); letter-spacing: -0.1px;">
                                ${Utils.escapeHtml(item.name || 'Sin nombre')}
                            </div>
                            <div style="display: flex; gap: var(--spacing-md); flex-wrap: wrap; font-size: 11px; color: var(--color-text-secondary);">
                                ${item.sku ? `<span style="display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-tag" style="font-size: 10px; opacity: 0.7;"></i> <strong style="font-weight: 600;">${Utils.escapeHtml(item.sku)}</strong></span>` : ''}
                                ${item.barcode ? `<span style="display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-barcode" style="font-size: 10px; opacity: 0.7;"></i> <strong style="font-weight: 600;">${Utils.escapeHtml(item.barcode)}</strong></span>` : ''}
                                <span style="display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-box" style="font-size: 10px; opacity: 0.7;"></i> 
                                    Stock: <strong style="color: ${stock > 5 ? 'var(--color-success)' : stock > 2 ? 'var(--color-warning)' : 'var(--color-danger)'}; font-weight: 700;">${stock || 0}</strong>
                                </span>
                            </div>
                        </div>
                        <div style="margin-left: var(--spacing-md); display: flex; align-items: center; gap: var(--spacing-xs); flex-shrink: 0;">
                            ${alreadySelected ? `
                                <div style="text-align: right; padding-right: var(--spacing-sm); border-right: 1px solid var(--color-border-light);">
                                    <div style="color: var(--color-success); font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                                        <i class="fas fa-check-circle"></i> Agregado
                                    </div>
                                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
                                        Cantidad: <strong style="font-weight: 600;">${alreadySelected.quantity}</strong>
                                    </div>
                                </div>
                                ${maxCanAdd > 0 ? `
                                    <button class="btn-secondary btn-sm transfer-add-item-btn" data-item-id="${item.id}" type="button" title="Agregar más" style="min-width: 32px;">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                ` : `
                                    <span style="font-size: 10px; color: var(--color-text-tertiary); padding: 4px 8px; background: var(--color-bg-secondary); border-radius: var(--radius-xs);">Sin stock</span>
                                `}
                            ` : `
                                <button class="btn-primary btn-sm transfer-add-item-btn" data-item-id="${item.id}" type="button" title="Agregar a transferencia">
                                    <i class="fas fa-plus"></i> Agregar
                                </button>
                            `}
                        </div>
                    </div>
                `;
            }).join('')}
        `;
        
        // Agregar event listeners
        requestAnimationFrame(() => {
            container.querySelectorAll('.transfer-add-item-btn').forEach(btn => {
                const itemId = btn.getAttribute('data-item-id');
                if (itemId) {
                    const handler = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.addItemToTransfer(itemId);
                    };
                    btn.removeEventListener('click', handler);
                    btn.addEventListener('click', handler);
                }
            });
            
            // Agregar efecto hover
            container.querySelectorAll('.transfer-item-card').forEach(card => {
                card.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--color-bg-card)';
                    this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                });
                card.addEventListener('mouseleave', function() {
                    this.style.background = 'var(--color-bg)';
                    this.style.boxShadow = 'none';
                });
            });
        });
    },

    // Iniciar escaneo de código de barras
    startBarcodeScan() {
        if (typeof BarcodeManager === 'undefined' || !BarcodeManager.handleBarcodeScan) {
            Utils.showNotification('El escáner de códigos de barras no está disponible', 'warning');
            return;
        }
        
        // Configurar handler temporal para transferencias
        const originalHandler = BarcodeManager.handleBarcodeScan;
        BarcodeManager.handleBarcodeScan = async (barcode) => {
            // Restaurar handler original
            BarcodeManager.handleBarcodeScan = originalHandler;
            
            // Buscar item por código de barras
            const searchInput = document.getElementById('transfer-search-item');
            if (searchInput) {
                searchInput.value = barcode;
                await this.searchItemForTransfer(barcode, true);
                // Después de buscar, intentar agregar automáticamente si hay un solo resultado
                setTimeout(async () => {
                    const container = document.getElementById('transfer-items-list');
                    const items = container?.querySelectorAll('.transfer-item-card');
                    if (items && items.length === 1) {
                        const btn = container.querySelector('.transfer-add-item-btn');
                        if (btn) {
                            btn.click();
                        }
                    }
                }, 500);
            }
        };
        
        Utils.showNotification('Escanea el código de barras...', 'info');
    },

    async addItemToTransfer(itemId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:610',message:'addItemToTransfer called',data:{itemId:itemId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:614',message:'Item not found in DB',data:{itemId:itemId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('Item no encontrado', 'error');
            return;
        }

        const existing = this.transferSelectedItems.find(ti => ti.id === itemId);
        if (existing) {
            if (existing.quantity < (item.stock_actual ?? 1)) {
                existing.quantity++;
            } else {
                Utils.showNotification('No hay suficiente stock disponible', 'warning');
                return;
            }
        } else {
            this.transferSelectedItems.push({
                id: item.id,
                name: item.name,
                sku: item.sku,
                quantity: 1,
                maxQuantity: item.stock_actual ?? 1
            });
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:634',message:'Item added to transfer list',data:{itemId:itemId,selectedItemsCount:this.transferSelectedItems.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        this.updateTransferSelectedItems();
        // Re-buscar para actualizar la lista
        const searchInput = document.getElementById('transfer-search-item');
        if (searchInput && searchInput.value) {
            await this.searchItemForTransfer(searchInput.value);
        }
    },

    updateTransferSelectedItems() {
        const container = document.getElementById('transfer-selected-items');
        if (!container) return;

        if (!this.transferSelectedItems || this.transferSelectedItems.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: var(--spacing-lg); color: var(--color-text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 32px; opacity: 0.3; margin-bottom: var(--spacing-sm);"></i>
                    <p style="margin: 0; font-size: 12px;">No hay items seleccionados</p>
                    <small style="font-size: 10px; opacity: 0.7;">Busca y agrega items para crear la transferencia</small>
                </div>
            `;
            return;
        }

        const totalItems = this.transferSelectedItems.reduce((sum, item) => sum + item.quantity, 0);
        
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-sm); padding-bottom: var(--spacing-xs); border-bottom: 2px solid var(--color-border-light);">
                <div>
                    <div style="font-weight: 600; font-size: 13px; color: var(--color-text);">
                        <i class="fas fa-list-check"></i> Items Seleccionados
                    </div>
                    <small style="font-size: 11px; color: var(--color-text-secondary);">
                        ${this.transferSelectedItems.length} tipo${this.transferSelectedItems.length !== 1 ? 's' : ''} • ${totalItems} pieza${totalItems !== 1 ? 's' : ''} total
                    </small>
                </div>
                <button class="btn-danger btn-sm" onclick="window.Transfers.clearAllSelectedItems()" title="Limpiar todos">
                    <i class="fas fa-trash-alt"></i> Limpiar
                </button>
            </div>
            <div style="max-height: 250px; overflow-y: auto; overflow-x: hidden;">
                ${this.transferSelectedItems.map((item, index) => `
                    <div class="selected-item-card" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); background: var(--color-bg-card); border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); margin-bottom: var(--spacing-sm); transition: all var(--transition-fast); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 13px; font-weight: 600; margin-bottom: var(--spacing-xs); color: var(--color-text); letter-spacing: -0.1px;">
                                ${Utils.escapeHtml(item.name || 'Sin nombre')}
                            </div>
                            <div style="font-size: 11px; color: var(--color-text-secondary); display: flex; gap: var(--spacing-sm); flex-wrap: wrap;">
                                ${item.sku ? `<span><i class="fas fa-tag" style="font-size: 9px; opacity: 0.7;"></i> ${Utils.escapeHtml(item.sku)}</span>` : ''}
                                <span><i class="fas fa-box" style="font-size: 9px; opacity: 0.7;"></i> Máx: <strong>${item.maxQuantity}</strong></span>
                                <span><i class="fas fa-check-circle" style="font-size: 9px; opacity: 0.7;"></i> Disponible: <strong>${item.maxQuantity - item.quantity}</strong></span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-left: var(--spacing-md); flex-shrink: 0;">
                            <button class="btn-secondary btn-sm transfer-decrease-btn" data-index="${index}" ${item.quantity <= 1 ? 'disabled' : ''} title="Disminuir cantidad" style="min-width: 32px;">
                                <i class="fas fa-minus"></i>
                            </button>
                            <div style="min-width: 45px; text-align: center; font-weight: 700; font-size: 15px; color: var(--color-primary); padding: 6px var(--spacing-xs); background: var(--color-bg-secondary); border-radius: var(--radius-xs); border: 1px solid var(--color-border-light);">
                                ${item.quantity}
                            </div>
                            <button class="btn-secondary btn-sm transfer-increase-btn" data-index="${index}" ${item.quantity >= item.maxQuantity ? 'disabled' : ''} title="Aumentar cantidad" style="min-width: 32px;">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="btn-danger btn-sm transfer-remove-btn" data-index="${index}" title="Eliminar" style="min-width: 32px;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Agregar event listeners después de renderizar
        requestAnimationFrame(() => {
            container.querySelectorAll('.transfer-decrease-btn').forEach(btn => {
                const index = parseInt(btn.getAttribute('data-index'));
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.decreaseTransferQuantity(index);
                });
            });
            
            container.querySelectorAll('.transfer-increase-btn').forEach(btn => {
                const index = parseInt(btn.getAttribute('data-index'));
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.increaseTransferQuantity(index);
                });
            });
            
            container.querySelectorAll('.transfer-remove-btn').forEach(btn => {
                const index = parseInt(btn.getAttribute('data-index'));
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.removeItemFromTransfer(index);
                });
            });
        });
    },
    
    clearAllSelectedItems() {
        if (this.transferSelectedItems && this.transferSelectedItems.length > 0) {
            const confirmed = confirm(`¿Deseas eliminar todos los ${this.transferSelectedItems.length} items seleccionados?`);
            if (confirmed) {
                this.transferSelectedItems = [];
                this.updateTransferSelectedItems();
                // Re-buscar si hay búsqueda activa
                const searchInput = document.getElementById('transfer-search-item');
                if (searchInput && searchInput.value) {
                    this.searchItemForTransfer(searchInput.value, true);
                }
                Utils.showNotification('Todos los items han sido eliminados', 'info');
            }
        }
    },

    decreaseTransferQuantity(index) {
        if (this.transferSelectedItems && this.transferSelectedItems[index] && this.transferSelectedItems[index].quantity > 1) {
            this.transferSelectedItems[index].quantity--;
            this.updateTransferSelectedItems();
            // Re-buscar para actualizar la lista
            const query = document.getElementById('transfer-search-item')?.value || '';
            if (query) {
                this.searchItemForTransfer(query, true);
            }
        }
    },

    increaseTransferQuantity(index) {
        if (this.transferSelectedItems && this.transferSelectedItems[index] && 
            this.transferSelectedItems[index].quantity < this.transferSelectedItems[index].maxQuantity) {
            this.transferSelectedItems[index].quantity++;
            this.updateTransferSelectedItems();
            // Re-buscar para actualizar la lista
            const query = document.getElementById('transfer-search-item')?.value || '';
            if (query) {
                this.searchItemForTransfer(query, true);
            }
        } else {
            Utils.showNotification('No hay más stock disponible', 'warning');
        }
    },

    removeItemFromTransfer(index) {
        if (this.transferSelectedItems && this.transferSelectedItems[index]) {
            const itemName = this.transferSelectedItems[index].name;
            this.transferSelectedItems.splice(index, 1);
            this.updateTransferSelectedItems();
            Utils.showNotification(`Item "${itemName}" eliminado`, 'info');
            // Re-buscar para actualizar la lista
            const query = document.getElementById('transfer-search-item')?.value || '';
            if (query) {
                this.searchItemForTransfer(query, true);
            }
        }
    },
    
    clearAllSelectedItems() {
        if (this.transferSelectedItems && this.transferSelectedItems.length > 0) {
            const totalItems = this.transferSelectedItems.length;
            const confirmed = confirm(`¿Deseas eliminar todos los ${totalItems} items seleccionados?`);
            if (confirmed) {
                this.transferSelectedItems = [];
                this.updateTransferSelectedItems();
                // Re-buscar si hay búsqueda activa
                const searchInput = document.getElementById('transfer-search-item');
                if (searchInput && searchInput.value) {
                    this.searchItemForTransfer(searchInput.value, true);
                }
                Utils.showNotification('Todos los items han sido eliminados', 'info');
            }
        }
    },

    async createTransfer() {
        // #region agent log
        const hasCreatePermission = typeof PermissionManager !== 'undefined' ? PermissionManager.hasPermission('transfers.create') : true;
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:539',message:'createTransfer called - permission check',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasCreatePermission:hasCreatePermission,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso de creación
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.create')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:545',message:'Permission denied for transfers.create',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para crear transferencias', 'error');
            return;
        }
        
        try {
            const fromBranchId = document.getElementById('transfer-from-branch')?.value;
            const toBranchId = document.getElementById('transfer-to-branch')?.value;
            const notes = document.getElementById('transfer-notes')?.value || '';

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:554',message:'createTransfer - branch validation',data:{fromBranchId:fromBranchId,toBranchId:toBranchId,hasBranchManager:typeof BranchManager!=='undefined',hasAccessFrom:typeof BranchManager!=='undefined'&&fromBranchId?BranchManager.hasAccessToBranch(fromBranchId):null,hasAccessTo:typeof BranchManager!=='undefined'&&toBranchId?BranchManager.hasAccessToBranch(toBranchId):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion

            if (!fromBranchId || !toBranchId) {
                Utils.showNotification('Selecciona sucursal origen y destino', 'error');
                return;
            }

            // Validar acceso a sucursal origen (debe tener acceso para sacar items)
            if (typeof BranchManager !== 'undefined') {
                if (!BranchManager.hasAccessToBranch(fromBranchId)) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:665',message:'Access denied to fromBranchId',data:{fromBranchId:fromBranchId,currentUser:typeof UserManager!=='undefined'?UserManager.currentUser:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    Utils.showNotification('No tienes acceso a la sucursal origen seleccionada', 'error');
                    return;
                }
                // Para destino: verificar que la sucursal existe y está activa, pero no requerimos acceso directo
                // (los usuarios pueden transferir a cualquier sucursal activa)
                const toBranch = await DB.get('catalog_branches', toBranchId);
                if (!toBranch) {
                    Utils.showNotification('La sucursal destino no existe', 'error');
                    return;
                }
                if (!toBranch.active) {
                    Utils.showNotification('La sucursal destino no está activa', 'error');
                    return;
                }
            }

            if (fromBranchId === toBranchId) {
                Utils.showNotification('La sucursal origen y destino no pueden ser la misma', 'error');
                return;
            }

            if (!this.transferSelectedItems || this.transferSelectedItems.length === 0) {
                Utils.showNotification('Agrega al menos un item a la transferencia', 'error');
                return;
            }

            // Validar stock de cada item antes de crear la transferencia
            const validationErrors = [];
            for (const selectedItem of this.transferSelectedItems) {
                const item = await DB.get('inventory_items', selectedItem.id);
                if (!item) {
                    validationErrors.push(`Item "${selectedItem.name || selectedItem.id}" no encontrado`);
                    continue;
                }
                
                // Verificar que el item esté en la sucursal origen
                if (item.branch_id !== fromBranchId) {
                    validationErrors.push(`Item "${item.name}" no está en la sucursal origen seleccionada`);
                    continue;
                }
                
                // Verificar stock disponible
                const availableStock = item.stock_actual ?? 1;
                if (availableStock < selectedItem.quantity) {
                    validationErrors.push(`Stock insuficiente para "${item.name}". Disponible: ${availableStock}, Requerido: ${selectedItem.quantity}`);
                }
                
                // Verificar que esté disponible
                if (item.status && item.status !== 'disponible') {
                    validationErrors.push(`Item "${item.name}" no está disponible (estado: ${item.status})`);
                }
            }
            
            if (validationErrors.length > 0) {
                const errorMessage = validationErrors.length === 1 
                    ? validationErrors[0]
                    : `Se encontraron ${validationErrors.length} errores:\n${validationErrors.slice(0, 3).join('\n')}${validationErrors.length > 3 ? `\n... y ${validationErrors.length - 3} más` : ''}`;
                Utils.showNotification(errorMessage, 'error');
                return;
            }

            // Generar folio mejorado
            const branches = await DB.getAll('catalog_branches') || [];
            const fromBranch = branches.find(b => b.id === fromBranchId);
            const toBranch = branches.find(b => b.id === toBranchId);
            const fromBranchCode = fromBranch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'TRF';
            const toBranchCode = toBranch?.name.replace(/\s+/g, '').substring(0, 3).toUpperCase() || 'DST';
            const timestamp = Date.now().toString().slice(-8);
            const folio = `TRF-${fromBranchCode}-${toBranchCode}-${timestamp}`;

            // Crear transferencia con información completa
            const totalQuantity = this.transferSelectedItems.reduce((sum, item) => sum + item.quantity, 0);
            const transfer = {
                id: Utils.generateId(),
                folio: folio,
                from_branch_id: fromBranchId,
                to_branch_id: toBranchId,
                status: 'pending',
                items_count: this.transferSelectedItems.length,
                total_quantity: totalQuantity,
                notes: notes.trim(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_by: (typeof UserManager !== 'undefined' && UserManager.currentUser) ? UserManager.currentUser.id : null,
                created_by_name: (typeof UserManager !== 'undefined' && UserManager.currentUser) ? UserManager.currentUser.username : null,
                sync_status: 'pending'
            };

            await DB.add('inventory_transfers', transfer);

            // Crear items de transferencia y validar nuevamente
            const transferItemsCreated = [];
            for (const selectedItem of this.transferSelectedItems) {
                const item = await DB.get('inventory_items', selectedItem.id);
                if (!item) continue;
                
                const transferItemId = Utils.generateId();
                await DB.add('inventory_transfer_items', {
                    id: transferItemId,
                    transfer_id: transfer.id,
                    item_id: item.id,
                    item_sku: item.sku,
                    item_name: item.name,
                    quantity: selectedItem.quantity,
                    created_at: new Date().toISOString()
                });
                transferItemsCreated.push({ id: transferItemId, item: item, quantity: selectedItem.quantity });
            }
            
            if (transferItemsCreated.length === 0) {
                // Si no se creó ningún item, eliminar la transferencia
                await DB.delete('inventory_transfers', transfer.id);
                Utils.showNotification('Error: No se pudieron crear los items de transferencia', 'error');
                return;
            }

            // Agregar a cola de sincronización
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('inventory_transfer', transfer.id);
            }

            Utils.showNotification(`Transferencia ${folio} creada exitosamente`, 'success');
            UI.closeModal();
            await this.loadTransfers();
        } catch (e) {
            console.error('Error creating transfer:', e);
            Utils.showNotification('Error al crear transferencia: ' + e.message, 'error');
        }
    },

    async viewTransfer(transferId) {
        // Verificar permiso de visualización
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.view')) {
            Utils.showNotification('No tienes permiso para ver transferencias', 'error');
            return;
        }
        
        const transfer = await DB.get('inventory_transfers', transferId);
        if (!transfer) {
            Utils.showNotification('Transferencia no encontrada', 'error');
            return;
        }
        
        // Validar acceso a sucursales de la transferencia
        if (typeof BranchManager !== 'undefined') {
            if (!BranchManager.hasAccessToBranch(transfer.from_branch_id) && !BranchManager.hasAccessToBranch(transfer.to_branch_id)) {
                Utils.showNotification('No tienes acceso a las sucursales de esta transferencia', 'error');
                return;
            }
        }

        const transferItems = await DB.query('inventory_transfer_items', 'transfer_id', transferId) || [];
        const branches = await DB.getAll('catalog_branches') || [];
        const fromBranch = branches.find(b => b.id === transfer.from_branch_id);
        const toBranch = branches.find(b => b.id === transfer.to_branch_id);

        const statusLabels = {
            'pending': 'Pendiente',
            'in_transit': 'En Tránsito',
            'completed': 'Completada',
            'cancelled': 'Cancelada'
        };

        // Obtener detalles de items
        const itemsDetails = [];
        for (const ti of transferItems) {
            const item = await DB.get('inventory_items', ti.item_id);
            if (item) {
                itemsDetails.push({
                    ...ti,
                    item: item
                });
            }
        }

        const body = `
            <div style="max-width: 100%;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-md); margin-bottom: var(--spacing-md);">
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Folio</div>
                        <div style="font-weight: 600; font-size: 14px;">${transfer.folio}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Estado</div>
                        <div><span class="status-badge status-${transfer.status === 'completed' ? 'success' : transfer.status === 'cancelled' ? 'danger' : 'warning'}">${statusLabels[transfer.status] || transfer.status}</span></div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Desde</div>
                        <div style="font-weight: 600;">${fromBranch?.name || transfer.from_branch_id}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Hacia</div>
                        <div style="font-weight: 600;">${toBranch?.name || transfer.to_branch_id}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Fecha Creación</div>
                        <div>${Utils.formatDate(new Date(transfer.created_at), 'DD/MM/YYYY HH:mm')}</div>
                    </div>
                    ${transfer.updated_at !== transfer.created_at ? `
                    <div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Última Actualización</div>
                        <div>${Utils.formatDate(new Date(transfer.updated_at), 'DD/MM/YYYY HH:mm')}</div>
                    </div>
                    ` : ''}
                </div>

                ${transfer.notes ? `
                <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-sm); background: var(--color-bg-secondary); border-radius: var(--radius-sm);">
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">Notas</div>
                    <div>${Utils.escapeHtml(transfer.notes)}</div>
                </div>
                ` : ''}

                <div style="margin-bottom: var(--spacing-md);">
                    <div style="font-size: 12px; font-weight: 600; margin-bottom: var(--spacing-sm);">Items (${itemsDetails.length})</div>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm);">
                        <table class="data-table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Nombre</th>
                                    <th>Cantidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsDetails.map(detail => `
                                    <tr>
                                        <td>${detail.item.sku || 'N/A'}</td>
                                        <td>${detail.item.name}</td>
                                        <td style="text-align: center; font-weight: 600;">${detail.quantity}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const buttons = [
            { text: 'Cerrar', class: 'btn-secondary', onclick: 'UI.closeModal()' }
        ];

        if (transfer.status === 'pending') {
            buttons.push(
                { text: 'Completar', class: 'btn-primary', onclick: `window.Transfers.completeTransfer('${transfer.id}')` },
                { text: 'Cancelar', class: 'btn-danger', onclick: `window.Transfers.cancelTransfer('${transfer.id}')` }
            );
        }

        UI.showModal(`Transferencia ${transfer.folio}`, body, buttons);
    },

    async completeTransfer(transferId) {
        // #region agent log
        const hasApprovePermission = typeof PermissionManager !== 'undefined' ? PermissionManager.hasPermission('transfers.approve') : true;
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:717',message:'completeTransfer called - permission check',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasApprovePermission:hasApprovePermission,transferId:transferId,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso de aprobación/completar
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.approve')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:723',message:'Permission denied for transfers.approve',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para completar transferencias', 'error');
            return;
        }
        
        const confirmed = await Utils.confirm(
            '¿Completar transferencia?',
            'Esto moverá los items de la sucursal origen a la sucursal destino. Esta acción no se puede deshacer.',
            'Completar',
            'Cancelar'
        );

        if (!confirmed) return;

        try {
            const transfer = await DB.get('inventory_transfers', transferId);
            if (!transfer) {
                Utils.showNotification('Transferencia no encontrada', 'error');
                return;
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:742',message:'completeTransfer - branch access check',data:{transferFromBranch:transfer.from_branch_id,transferToBranch:transfer.to_branch_id,hasBranchManager:typeof BranchManager!=='undefined',hasAccessFrom:typeof BranchManager!=='undefined'&&transfer.from_branch_id?BranchManager.hasAccessToBranch(transfer.from_branch_id):null,hasAccessTo:typeof BranchManager!=='undefined'&&transfer.to_branch_id?BranchManager.hasAccessToBranch(transfer.to_branch_id):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Validar acceso a sucursales de la transferencia
            if (typeof BranchManager !== 'undefined') {
                if (!BranchManager.hasAccessToBranch(transfer.from_branch_id) && !BranchManager.hasAccessToBranch(transfer.to_branch_id)) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:749',message:'Access denied to transfer branches',data:{transferFromBranch:transfer.from_branch_id,transferToBranch:transfer.to_branch_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    Utils.showNotification('No tienes acceso a las sucursales de esta transferencia', 'error');
                    return;
                }
            }

            if (transfer.status !== 'pending') {
                Utils.showNotification('Solo se pueden completar transferencias pendientes', 'error');
                return;
            }

            // Obtener items de la transferencia
            const transferItems = await DB.query('inventory_transfer_items', 'transfer_id', transferId) || [];

            // Verificar stock y mover items
            for (const ti of transferItems) {
                const item = await DB.get('inventory_items', ti.item_id);
                if (!item) continue;

                // Verificar que el item esté en la sucursal origen
                if (item.branch_id !== transfer.from_branch_id) {
                    Utils.showNotification(`El item ${item.name} no está en la sucursal origen`, 'error');
                    return;
                }

                // Verificar stock disponible
                const currentStock = item.stock_actual ?? 1;
                if (currentStock < ti.quantity) {
                    Utils.showNotification(`Stock insuficiente para ${item.name}`, 'error');
                    return;
                }

                // Actualizar item: cambiar sucursal y reducir stock
                item.branch_id = transfer.to_branch_id;
                item.stock_actual = Math.max(0, currentStock - ti.quantity);
                item.updated_at = new Date().toISOString();

                await DB.put('inventory_items', item);

                // Registrar movimiento en log
                const logId = Utils.generateId();
                await DB.add('inventory_logs', {
                    id: logId,
                    item_id: item.id,
                    action: 'transferencia',
                    quantity: -ti.quantity,
                    notes: `Transferencia ${transfer.folio} a ${transfer.to_branch_id}`,
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

            // Actualizar estado de transferencia
            transfer.status = 'completed';
            transfer.completed_at = new Date().toISOString();
            transfer.updated_at = new Date().toISOString();
            await DB.put('inventory_transfers', transfer);

            // Sincronizar
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('inventory_transfer', transfer.id);
            }

            // Emitir evento de transferencia completada
            if (typeof Utils !== 'undefined' && Utils.EventBus) {
                Utils.EventBus.emit('transfer-completed', {
                    transfer: transfer,
                    fromBranchId: transfer.from_branch_id,
                    toBranchId: transfer.to_branch_id,
                    items: transferItems
                });
                
                // Emitir evento de inventario actualizado para cada item
                for (const ti of transferItems) {
                    const item = await DB.get('inventory_items', ti.item_id);
                    if (item) {
                        Utils.EventBus.emit('inventory-updated', { item, isNew: false });
                    }
                }
            }

            Utils.showNotification('Transferencia completada exitosamente', 'success');
            UI.closeModal();
            await this.loadTransfers();
        } catch (e) {
            console.error('Error completing transfer:', e);
            Utils.showNotification('Error al completar transferencia: ' + e.message, 'error');
        }
    },

    async cancelTransfer(transferId) {
        // #region agent log
        const hasApprovePermission = typeof PermissionManager !== 'undefined' ? PermissionManager.hasPermission('transfers.approve') : true;
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:798',message:'cancelTransfer called - permission check',data:{hasPermissionManager:typeof PermissionManager!=='undefined',hasApprovePermission:hasApprovePermission,transferId:transferId,userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Verificar permiso de aprobación/cancelar
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('transfers.approve')) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:804',message:'Permission denied for transfers.approve (cancel)',data:{userRole:typeof UserManager!=='undefined'?UserManager.currentUser?.role:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            Utils.showNotification('No tienes permiso para cancelar transferencias', 'error');
            return;
        }
        
        const confirmed = await Utils.confirm(
            '¿Cancelar transferencia?',
            'Esta acción cancelará la transferencia. Los items permanecerán en la sucursal origen.',
            'Cancelar Transferencia',
            'No Cancelar'
        );

        if (!confirmed) return;

        try {
            const transfer = await DB.get('inventory_transfers', transferId);
            if (!transfer) {
                Utils.showNotification('Transferencia no encontrada', 'error');
                return;
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:821',message:'cancelTransfer - branch access check',data:{transferFromBranch:transfer.from_branch_id,transferToBranch:transfer.to_branch_id,hasBranchManager:typeof BranchManager!=='undefined',hasAccessFrom:typeof BranchManager!=='undefined'&&transfer.from_branch_id?BranchManager.hasAccessToBranch(transfer.from_branch_id):null,hasAccessTo:typeof BranchManager!=='undefined'&&transfer.to_branch_id?BranchManager.hasAccessToBranch(transfer.to_branch_id):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Validar acceso a sucursales de la transferencia
            if (typeof BranchManager !== 'undefined') {
                if (!BranchManager.hasAccessToBranch(transfer.from_branch_id) && !BranchManager.hasAccessToBranch(transfer.to_branch_id)) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'transfers.js:828',message:'Access denied to transfer branches (cancel)',data:{transferFromBranch:transfer.from_branch_id,transferToBranch:transfer.to_branch_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    Utils.showNotification('No tienes acceso a las sucursales de esta transferencia', 'error');
                    return;
                }
            }

            if (transfer.status !== 'pending') {
                Utils.showNotification('Solo se pueden cancelar transferencias pendientes', 'error');
                return;
            }

            transfer.status = 'cancelled';
            transfer.updated_at = new Date().toISOString();
            await DB.put('inventory_transfers', transfer);

            // Sincronizar
            if (typeof SyncManager !== 'undefined') {
                await SyncManager.addToQueue('inventory_transfer', transfer.id);
            }

            Utils.showNotification('Transferencia cancelada', 'success');
            UI.closeModal();
            await this.loadTransfers();
        } catch (e) {
            console.error('Error cancelling transfer:', e);
            Utils.showNotification('Error al cancelar transferencia: ' + e.message, 'error');
        }
    }
};

window.Transfers = Transfers;

