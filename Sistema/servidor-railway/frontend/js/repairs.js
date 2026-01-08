// Repairs Module

const Repairs = {
    initialized: false,
    
    async init() {
        // Verificar permiso
        if (typeof PermissionManager !== 'undefined' && !PermissionManager.hasPermission('repairs.view')) {
            const content = document.getElementById('module-content');
            if (content) {
                content.innerHTML = '<div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-secondary);">No tienes permiso para ver reparaciones</div>';
            }
            return;
        }

        if (this.initialized) return;
        this.setupUI();
        await this.loadRepairs();
        this.initialized = true;
        
        // Escuchar cambios de sucursal para recargar reparaciones
        window.addEventListener('branch-changed', async () => {
            if (this.initialized) {
                await this.loadRepairs();
            }
        });
    },

    setupUI() {
        const content = document.getElementById('module-content');
        if (!content) return;

        content.innerHTML = `
            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); flex-wrap: wrap; gap: var(--spacing-sm);">
                    <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                        <i class="fas fa-tools"></i> Gestión de Reparaciones
                    </h3>
                    <div style="display: flex; gap: var(--spacing-xs); flex-wrap: wrap;">
                        ${typeof PermissionManager !== 'undefined' && PermissionManager.hasPermission('repairs.create') ? `
                            <button class="btn-primary btn-sm" id="repair-add-btn">
                                <i class="fas fa-plus"></i> Nueva Reparación
                            </button>
                        ` : ''}
                        <button class="btn-secondary btn-sm" id="repair-export-btn">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: var(--spacing-xs);">Filtrar por Estado</label>
                    <select id="repair-status-filter" class="form-select" style="width: 100%; max-width: 300px;">
                        <option value="">Todos los estados</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="completada">Completada</option>
                        <option value="entregada">Entregada</option>
                    </select>
                </div>
            </div>
            <div id="repairs-list" style="width: 100%; max-width: 100%; box-sizing: border-box;"></div>
        `;

        document.getElementById('repair-add-btn')?.addEventListener('click', () => this.showAddForm());
        document.getElementById('repair-export-btn')?.addEventListener('click', () => this.exportRepairs());
        document.getElementById('repair-status-filter')?.addEventListener('change', () => this.loadRepairs());
    },

    async loadRepairs() {
        try {
            // Obtener sucursal actual y filtrar reparaciones
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            // Las reparaciones pueden tener branch_id, filtrar usando filtrado automático
            let repairs = await DB.getAll('repairs', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            
            const statusFilter = document.getElementById('repair-status-filter')?.value;
            if (statusFilter) {
                repairs = repairs.filter(r => r.status === statusFilter);
            }

            this.displayRepairs(repairs);
        } catch (e) {
            console.error('Error loading repairs:', e);
            Utils.showNotification('Error al cargar reparaciones', 'error');
        }
    },

    async displayRepairs(repairs) {
        const container = document.getElementById('repairs-list');
        if (!container) return;

        if (repairs.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px;">No hay reparaciones</p>';
            return;
        }
        
        // Mostrar estadísticas
        await this.displayRepairStats(repairs);

        const customers = await DB.getAll('customers');
        const items = await DB.getAll('inventory_items');

        container.innerHTML = `
            <div class="module" style="padding: 0; background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); overflow: hidden;">
                <div style="overflow-x: auto; width: 100%; max-width: 100%; box-sizing: border-box;">
                    <table class="cart-table" style="width: 100%; max-width: 100%; table-layout: auto; min-width: 1000px;">
                    <thead>
                        <tr>
                            <th>Folio</th>
                            <th>Cliente</th>
                            <th>Pieza</th>
                            <th>Descripción</th>
                            <th>Estado</th>
                            <th>Costo</th>
                            <th>Fecha</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${repairs.map(repair => {
                            const customer = customers.find(c => c.id === repair.customer_id);
                            const item = items.find(i => i.id === repair.item_id);
                            return `
                                <tr>
                                    <td>${repair.folio || 'N/A'}</td>
                                    <td>${customer?.name || 'N/A'}</td>
                                    <td>${item?.name || 'N/A'}</td>
                                    <td>${repair.description?.substring(0, 30) || 'N/A'}...</td>
                                    <td><span class="status-badge status-${repair.status}">${repair.status}</span></td>
                                    <td style="font-weight: 600;">${Utils.formatCurrency(repair.cost || 0)}</td>
                                    <td>${Utils.formatDate(repair.created_at, 'DD/MM/YYYY')}</td>
                                    <td>
                                        <button class="btn-secondary btn-sm" onclick="window.Repairs.showDetails('${repair.id}')" title="Ver detalles"><i class="fas fa-eye"></i></button>
                                        <button class="btn-secondary btn-sm" onclick="window.Repairs.showRepairTimeline('${repair.id}')" title="Línea de tiempo"><i class="fas fa-history"></i></button>
                                        <button class="btn-secondary btn-sm" onclick="window.Repairs.printTicket('${repair.id}')" title="Imprimir ticket"><i class="fas fa-print"></i></button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    async displayRepairStats(repairs) {
        let statsContainer = document.getElementById('repairs-stats');
        if (!statsContainer) {
            const moduleContent = document.getElementById('module-content');
            if (moduleContent) {
                statsContainer = document.createElement('div');
                statsContainer.id = 'repairs-stats';
                statsContainer.style.marginBottom = 'var(--spacing-xl)';
                const listContainer = document.getElementById('repairs-list');
                if (listContainer && listContainer.parentNode) {
                    listContainer.parentNode.insertBefore(statsContainer, listContainer);
                }
            }
        }
        
        if (!statsContainer) return;
        
        const pending = repairs.filter(r => r.status === 'pendiente').length;
        const inProcess = repairs.filter(r => r.status === 'en_proceso').length;
        const completed = repairs.filter(r => r.status === 'completada').length;
        const delivered = repairs.filter(r => r.status === 'entregada').length;
        
        const totalCost = repairs.reduce((sum, r) => sum + (r.cost || 0), 0);
        const avgCost = repairs.length > 0 ? totalCost / repairs.length : 0;
        
        // Análisis por estado
        const statusStats = {
            pendiente: { count: pending, cost: repairs.filter(r => r.status === 'pendiente').reduce((sum, r) => sum + (r.cost || 0), 0) },
            en_proceso: { count: inProcess, cost: repairs.filter(r => r.status === 'en_proceso').reduce((sum, r) => sum + (r.cost || 0), 0) },
            completada: { count: completed, cost: repairs.filter(r => r.status === 'completada').reduce((sum, r) => sum + (r.cost || 0), 0) },
            entregada: { count: delivered, cost: repairs.filter(r => r.status === 'entregada').reduce((sum, r) => sum + (r.cost || 0), 0) }
        };
        
        // Reparaciones por mes (últimos 6 meses)
        const monthlyStats = {};
        repairs.forEach(repair => {
            const repairDate = new Date(repair.created_at);
            const monthKey = `${repairDate.getFullYear()}-${String(repairDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { count: 0, cost: 0 };
            }
            monthlyStats[monthKey].count += 1;
            monthlyStats[monthKey].cost += repair.cost || 0;
        });
        
        const monthlyData = Object.entries(monthlyStats)
            .map(([month, stats]) => ({ month, ...stats }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6);
        
        const maxMonthly = Math.max(...monthlyData.map(m => m.count), 1);
        
        statsContainer.innerHTML = `
            <div class="module" style="padding: var(--spacing-md); background: var(--color-bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); margin-bottom: var(--spacing-lg);">
                <h3 style="margin-bottom: var(--spacing-md); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i class="fas fa-chart-pie"></i> Estadísticas de Reparaciones
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md);">
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Total Reparaciones</div>
                        <div class="kpi-value">${repairs.length}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Pendientes</div>
                        <div class="kpi-value">${pending}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">En Proceso</div>
                        <div class="kpi-value">${inProcess}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Completadas</div>
                        <div class="kpi-value">${completed}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Entregadas</div>
                        <div class="kpi-value">${delivered}</div>
                    </div>
                    <div class="kpi-card" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <div class="kpi-label">Costo Total</div>
                        <div class="kpi-value">${Utils.formatCurrency(totalCost)}</div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                            Promedio: ${Utils.formatCurrency(avgCost)}
                        </div>
                    </div>
                </div>
                
                ${monthlyData.length > 0 ? `
                    <div style="margin-top: var(--spacing-md);">
                        <h4 style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">Tendencia de Reparaciones (Últimos 6 Meses)</h4>
                    <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm); width: 100%; overflow-x: auto; box-sizing: border-box;">
                        <div style="display: flex; align-items: flex-end; gap: 4px; height: 200px; min-width: 0; width: 100%;">
                            ${monthlyData.map(month => {
                                const height = maxMonthly > 0 ? (month.count / maxMonthly * 100) : 0;
                                const monthName = new Date(month.month + '-01').toLocaleDateString('es', { month: 'short' });
                                return `
                                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; flex-shrink: 0;">
                                        <div style="flex: 1; display: flex; align-items: flex-end; width: 100%; min-width: 0;">
                                            <div style="width: 100%; background: var(--gradient-accent); 
                                                border-radius: var(--radius-xs) var(--radius-xs) 0 0; 
                                                height: ${height}%; 
                                                min-height: ${month.count > 0 ? '4px' : '0'};"></div>
                                        </div>
                                        <div style="font-size: 9px; color: var(--color-text-secondary); text-align: center; white-space: nowrap;">
                                            <div>${monthName}</div>
                                            <div style="font-weight: 600; color: var(--color-text); margin-top: 2px; font-size: 10px;">${month.count}</div>
                                            <div style="font-size: 8px; color: var(--color-text-secondary);">${Utils.formatCurrency(month.cost)}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="dashboard-section" style="width: 100%; max-width: 100%; box-sizing: border-box;">
                <h3 style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--spacing-sm);">Análisis por Estado</h3>
                <div style="background: var(--color-bg-secondary); padding: var(--spacing-md); border-radius: var(--radius-md); margin-top: var(--spacing-sm); width: 100%; box-sizing: border-box;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-sm); width: 100%; box-sizing: border-box;">
                        ${Object.entries(statusStats).map(([status, stats]) => `
                            <div style="padding: var(--spacing-sm); background: var(--color-bg); border-radius: var(--radius-sm); border-left: 2px solid var(--color-primary); min-width: 0; width: 100%; box-sizing: border-box;">
                                <div style="font-weight: 600; text-transform: capitalize; margin-bottom: var(--spacing-xs); font-size: 10px;">${status.replace('_', ' ')}</div>
                                <div style="font-size: 18px; font-weight: 700; color: var(--color-primary);">${stats.count}</div>
                                <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: var(--spacing-xs);">
                                    Costo: ${Utils.formatCurrency(stats.cost)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    async showAddForm(repairId = null) {
        const repair = repairId ? await DB.get('repairs', repairId) : null;
        const customers = await DB.getAll('customers');
        const allItems = await DB.getAll('inventory_items');
        const items = allItems.filter(i => i.status !== 'vendida');

        const body = `
            <form id="repair-form">
                <div class="form-group">
                    <label>Cliente *</label>
                    <select id="repair-customer" class="form-select" required>
                        <option value="">Seleccionar...</option>
                        ${customers.map(c => `<option value="${c.id}" ${repair?.customer_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Pieza</label>
                    <select id="repair-item" class="form-select">
                        <option value="">Seleccionar...</option>
                        ${items.map(i => `<option value="${i.id}" ${repair?.item_id === i.id ? 'selected' : ''}>${i.sku} - ${i.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Descripción *</label>
                    <textarea id="repair-description" class="form-textarea" rows="4" required>${repair?.description || ''}</textarea>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-md); width: 100%; box-sizing: border-box;">
                    <div class="form-group" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <label>Estado</label>
                        <select id="repair-status" class="form-select" style="width: 100%;">
                            <option value="pendiente" ${repair?.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option value="en_proceso" ${repair?.status === 'en_proceso' ? 'selected' : ''}>En Proceso</option>
                            <option value="completada" ${repair?.status === 'completada' ? 'selected' : ''}>Completada</option>
                            <option value="entregada" ${repair?.status === 'entregada' ? 'selected' : ''}>Entregada</option>
                        </select>
                    </div>
                    <div class="form-group" style="min-width: 0; width: 100%; box-sizing: border-box;">
                        <label>Costo</label>
                        <input type="number" id="repair-cost" class="form-input" step="0.01" value="${repair?.cost || 0}" style="width: 100%;">
                    </div>
                </div>
                <div class="form-group" style="width: 100%; box-sizing: border-box;">
                    <label>Fotos</label>
                    <input type="file" id="repair-photos" class="form-input" multiple accept="image/*" style="width: 100%;">
                    <div id="repair-photos-preview" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-top: 10px; width: 100%; box-sizing: border-box;"></div>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="window.Repairs.saveRepair('${repairId || ''}')">Guardar</button>
        `;

        UI.showModal(repairId ? 'Editar Reparación' : 'Nueva Reparación', body, footer);

        document.getElementById('repair-photos')?.addEventListener('change', (e) => {
            this.previewPhotos(e.target.files);
        });
    },

    previewPhotos(files) {
        const preview = document.getElementById('repair-photos-preview');
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

    async saveRepair(repairId) {
        const form = document.getElementById('repair-form');
        if (!form || !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const folio = repairId ? (await DB.get('repairs', repairId))?.folio : `REP-${Utils.formatDate(new Date(), 'YYYYMMDD')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        const repair = {
            id: repairId || Utils.generateId(),
            folio: folio,
            customer_id: document.getElementById('repair-customer').value,
            item_id: document.getElementById('repair-item').value || null,
            description: document.getElementById('repair-description').value,
            status: document.getElementById('repair-status').value,
            cost: parseFloat(document.getElementById('repair-cost').value) || 0,
            created_at: repairId ? (await DB.get('repairs', repairId))?.created_at : new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sync_status: 'pending'
        };

        await DB.put('repairs', repair);

        // Handle photos
        const photoInput = document.getElementById('repair-photos');
        if (photoInput && photoInput.files.length > 0) {
            for (const file of photoInput.files) {
                const photoBlob = await Utils.loadImageAsBlob(file);
                const thumbnailBlob = await Utils.createThumbnail(photoBlob);

                await DB.add('repair_photos', {
                    id: Utils.generateId(),
                    repair_id: repair.id,
                    photo_blob: photoBlob,
                    thumbnail_blob: thumbnailBlob,
                    created_at: new Date().toISOString()
                });
            }
        }

        // Update inventory status if item selected
        let branchId = null;
        let inventoryItemUpdated = false;
        if (repair.item_id) {
            const item = await DB.get('inventory_items', repair.item_id);
            if (item) {
                const oldStatus = item.status;
                item.status = 'reparacion';
                branchId = item.branch_id; // Obtener branch_id del item
                await DB.put('inventory_items', item);
                inventoryItemUpdated = true;
                
                // Emitir evento de actualización de inventario
                if (typeof Utils !== 'undefined' && Utils.EventBus) {
                    Utils.EventBus.emit('inventory-updated', {
                        item: item,
                        isNew: false,
                        oldStatus: oldStatus,
                        newStatus: 'reparacion'
                    });
                }
            }
        }

        // Si no hay item, obtener branch_id de la sucursal actual
        if (!branchId) {
            branchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
        }

        // Registrar costo de reparación en Costs si hay costo y la reparación está completada
        if (typeof Costs !== 'undefined' && repair.cost > 0 && repair.status === 'completada') {
            try {
                // Verificar si ya se registró el costo (para evitar duplicados al editar)
                const existingRepair = repairId ? await DB.get('repairs', repairId) : null;
                const wasCompleted = existingRepair && existingRepair.status === 'completada';
                
                // Solo registrar si es nueva o si cambió de estado a completada
                if (!wasCompleted) {
                    await Costs.registerCost({
                        amount: repair.cost,
                        category: 'reparacion',
                        type: 'variable',
                        description: `Costo de reparación - ${repair.folio}`,
                        date: new Date().toISOString().split('T')[0],
                        branch_id: branchId,
                        notes: `Reparación ${repair.folio}: ${repair.description}`,
                        repair_id: repair.id
                    });
                    
                    // Emitir evento de reparación completada
                    if (typeof Utils !== 'undefined' && Utils.EventBus) {
                        Utils.EventBus.emit('repair-completed', {
                            repair: repair,
                            branchId: branchId,
                            cost: repair.cost
                        });
                    }
                }
            } catch (error) {
                console.error('Error registrando costo de reparación:', error);
                // No bloquear el guardado si falla el registro de costo
            }
        }

        await SyncManager.addToQueue('repair', repair.id);

        Utils.showNotification(repairId ? 'Reparación actualizada' : 'Reparación creada', 'success');
        UI.closeModal();
        this.loadRepairs();
    },

    async showDetails(repairId) {
        const repair = await DB.get('repairs', repairId);
        if (!repair) return;

        const customer = await DB.get('customers', repair.customer_id);
        const item = repair.item_id ? await DB.get('inventory_items', repair.item_id) : null;
        const photos = await DB.query('repair_photos', 'repair_id', repairId);

        const body = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h4>Información</h4>
                    <p><strong>Folio:</strong> ${repair.folio}</p>
                    <p><strong>Cliente:</strong> ${customer?.name || 'N/A'}</p>
                    <p><strong>Pieza:</strong> ${item ? `${item.sku} - ${item.name}` : 'N/A'}</p>
                    <p><strong>Descripción:</strong> ${repair.description}</p>
                    <p><strong>Estado:</strong> ${repair.status}</p>
                    <p><strong>Costo:</strong> ${Utils.formatCurrency(repair.cost)}</p>
                    <p><strong>Fecha:</strong> ${Utils.formatDate(repair.created_at, 'DD/MM/YYYY HH:mm')}</p>
                </div>
                <div>
                    <h4>Fotos</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        ${photos.map(photo => `
                            <img src="${photo.photo_blob}" alt="Foto" style="width: 100%; border-radius: 4px;">
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="window.Repairs.showAddForm('${repair.id}')">Editar</button>
            <button class="btn-secondary" onclick="window.Repairs.printTicket('${repair.id}')">Imprimir Ticket</button>
            <button class="btn-primary" onclick="UI.closeModal()">Cerrar</button>
        `;

        UI.showModal(`Reparación: ${repair.folio}`, body, footer);
    },

    async printTicket(repairId) {
        const repair = await DB.get('repairs', repairId);
        if (!repair) return;

        const customer = await DB.get('customers', repair.customer_id);
        const item = repair.item_id ? await DB.get('inventory_items', repair.item_id) : null;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(Printer.buildRepairTicketHTML(repair, customer, item));
        printWindow.document.close();
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    },

    async exportRepairs() {
        try {
            const repairs = await DB.getAll('repairs');
            const customers = await DB.getAll('customers');
            const items = await DB.getAll('inventory_items');

            const exportData = repairs.map(repair => {
                const customer = customers.find(c => c.id === repair.customer_id);
                const item = items.find(i => i.id === repair.item_id);
                return {
                    Folio: repair.folio,
                    Cliente: customer?.name || '',
                    Pieza: item ? `${item.sku} - ${item.name}` : '',
                    Descripción: repair.description,
                    Estado: repair.status,
                    Costo: repair.cost,
                    Fecha: Utils.formatDate(repair.created_at, 'DD/MM/YYYY')
                };
            });

            const formatOptions = [
                { value: '1', label: 'CSV' },
                { value: '2', label: 'Excel' },
                { value: '3', label: 'PDF' }
            ];
            const format = await Utils.select('Formato de exportación:', formatOptions, 'Exportar Reparaciones');
            if (!format) return;
            
            const date = Utils.formatDate(new Date(), 'YYYYMMDD');
            
            if (format === '1') {
                Utils.exportToCSV(exportData, `reparaciones_${date}.csv`);
            } else if (format === '2') {
                Utils.exportToExcel(exportData, `reparaciones_${date}.xlsx`, 'Reparaciones');
            } else if (format === '3') {
                Utils.exportToPDF(exportData, `reparaciones_${date}.pdf`, 'Reparaciones');
            }
        } catch (e) {
            console.error('Error exporting repairs:', e);
            Utils.showNotification('Error al exportar', 'error');
        }
    },

    // ========================================
    // FUNCIONALIDADES AVANZADAS REPARACIONES
    // ========================================

    async showRepairTimeline(repairId) {
        const repair = await DB.get('repairs', repairId);
        if (!repair) return;

        // Obtener historial de cambios (simulado - en producción vendría de logs)
        const timeline = [
            { date: repair.created_at, action: 'Reparación creada', user: 'Sistema' },
            ...(repair.status === 'en_proceso' ? [{ date: repair.updated_at, action: 'En proceso', user: 'Técnico' }] : []),
            ...(repair.status === 'completada' ? [{ date: repair.updated_at, action: 'Completada', user: 'Técnico' }] : []),
            ...(repair.status === 'entregada' ? [{ date: repair.updated_at, action: 'Entregada', user: 'Vendedor' }] : [])
        ];

        const body = `
            <div style="position: relative; padding-left: var(--spacing-lg);">
                ${timeline.map((event, idx) => `
                    <div style="position: relative; margin-bottom: var(--spacing-md);">
                        <div style="position: absolute; left: -8px; top: 4px; width: 12px; height: 12px; background: var(--color-primary); border-radius: 50%; border: 2px solid var(--color-bg);"></div>
                        ${idx < timeline.length - 1 ? '<div style="position: absolute; left: -2px; top: 16px; width: 2px; height: calc(100% + var(--spacing-md)); background: var(--color-border-light);"></div>' : ''}
                        <div style="background: var(--color-bg-secondary); padding: var(--spacing-sm); border-radius: var(--radius-sm);">
                            <div style="font-weight: 600; font-size: 12px;">${event.action}</div>
                            <div style="font-size: 10px; color: var(--color-text-secondary); margin-top: 4px;">
                                ${Utils.formatDate(event.date, 'DD/MM/YYYY HH:mm')} • ${event.user}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        UI.showModal('Línea de Tiempo de Reparación', body, [
            { text: 'Cerrar', class: 'btn-primary', onclick: () => UI.closeModal() }
        ]);
    },

    async estimateRepairTime(repairId) {
        const repair = await DB.get('repairs', repairId);
        if (!repair) return;

        // Análisis de reparaciones similares para estimar tiempo
        const allRepairs = await DB.getAll('repairs');
        const similarRepairs = allRepairs.filter(r => 
            r.status === 'completada' && 
            r.description?.toLowerCase().includes(repair.description?.toLowerCase().substring(0, 10) || '')
        );

        if (similarRepairs.length === 0) {
            Utils.showNotification('No hay datos suficientes para estimar', 'info');
            return;
        }

        const avgDays = similarRepairs.map(r => {
            const start = new Date(r.created_at);
            const end = new Date(r.updated_at);
            return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        }).reduce((sum, d) => sum + d, 0) / similarRepairs.length;

        Utils.showNotification(`Tiempo estimado: ${Math.ceil(avgDays)} días (basado en ${similarRepairs.length} reparaciones similares)`, 'info');
    },

    async generateRepairReport(repairId) {
        const repair = await DB.get('repairs', repairId);
        if (!repair) return;

        const customer = await DB.get('customers', repair.customer_id);
        const item = await DB.get('inventory_items', repair.item_id);
        const photos = await DB.query('repair_photos', 'repair_id', repairId);

        const reportData = {
            folio: repair.folio,
            fecha: Utils.formatDate(repair.created_at, 'DD/MM/YYYY'),
            cliente: customer?.name || 'N/A',
            pieza: item?.name || 'N/A',
            descripcion: repair.description,
            estado: repair.status,
            costo: repair.cost,
            fotos: photos.length
        };

        const jspdfLib = Utils.checkJsPDF();
        if (jspdfLib) {
            const { jsPDF } = jspdfLib;
            const doc = new jsPDF();
            
            doc.setFontSize(18);
            doc.text('Reporte de Reparación', 105, 20, { align: 'center' });
            
            doc.setFontSize(12);
            let y = 35;
            doc.text(`Folio: ${reportData.folio}`, 20, y);
            y += 10;
            doc.text(`Fecha: ${reportData.fecha}`, 20, y);
            y += 10;
            doc.text(`Cliente: ${reportData.cliente}`, 20, y);
            y += 10;
            doc.text(`Pieza: ${reportData.pieza}`, 20, y);
            y += 10;
            doc.text(`Descripción: ${reportData.descripcion}`, 20, y);
            y += 10;
            doc.text(`Estado: ${reportData.estado}`, 20, y);
            y += 10;
            doc.text(`Costo: ${Utils.formatCurrency(reportData.costo)}`, 20, y);
            
            doc.save(`Reparacion_${repair.folio}_${Date.now()}.pdf`);
            Utils.showNotification('Reporte PDF generado', 'success');
        } else {
            Utils.exportToCSV([reportData], `reparacion_${repair.folio}.csv`);
        }
    }
};

window.Repairs = Repairs;
