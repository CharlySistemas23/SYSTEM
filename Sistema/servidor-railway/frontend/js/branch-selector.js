// Selector de Sucursal para Admin
// Permite a admin seleccionar qué sucursal ver y filtrar datos

const BranchSelector = {
    selectedBranchId: null, // null = todas las sucursales
    isAdmin: false,
    branches: [],
    
    async init() {
        // Verificar si el usuario es admin
        let currentUser = null;
        
        // Intentar obtener del API primero
        if (typeof API !== 'undefined' && API.currentUser) {
            currentUser = API.currentUser;
        } else {
            // Intentar obtener de localStorage
            try {
                const userStr = localStorage.getItem('api_user');
                if (userStr) {
                    currentUser = JSON.parse(userStr);
                }
            } catch (e) {
                console.warn('Error parseando api_user de localStorage:', e);
            }
        }
        
        // Si no hay usuario, intentar obtener de UserManager
        if (!currentUser && typeof UserManager !== 'undefined' && UserManager.currentUser) {
            currentUser = UserManager.currentUser;
        }
        
        // Verificar si es admin (puede venir como array o string parseado)
        const permissions = currentUser?.permissions || [];
        const permissionsArray = Array.isArray(permissions) ? permissions : 
                                 (typeof permissions === 'string' ? JSON.parse(permissions || '[]') : []);
        
        this.isAdmin = currentUser?.role === 'admin' || permissionsArray.includes('all');
        
        if (!this.isAdmin) {
            // Si no es admin, ocultar selector y usar su branch_id
            this.hideSelector();
            return;
        }
        
        // Cargar sucursales disponibles
        await this.loadBranches();
        
        // Cargar sucursal seleccionada desde localStorage
        const savedBranchId = localStorage.getItem('admin_selected_branch_id');
        if (savedBranchId && savedBranchId !== 'null' && savedBranchId !== 'all') {
            this.selectedBranchId = savedBranchId;
        } else {
            this.selectedBranchId = null; // Por defecto: todas las sucursales
        }
        
        // Inicializar UI
        this.initUI();
        
        // Aplicar filtro inicial
        this.applyFilter();
    },
    
    async loadBranches() {
        try {
            const response = await API.getBranches();
            this.branches = response.data || [];
            
            // Actualizar selector en el header
            this.updateSelectorOptions();
        } catch (error) {
            console.error('Error cargando sucursales:', error);
            this.branches = [];
        }
    },
    
    initUI() {
        const container = document.getElementById('branch-selector-container');
        const selector = document.getElementById('branch-selector');
        
        if (!container || !selector) {
            console.warn('Branch selector elements not found');
            return;
        }
        
        // Mostrar selector solo si es admin
        container.style.display = this.isAdmin ? 'block' : 'none';
        
        // Configurar selector
        selector.innerHTML = '<option value="all">Todas las Sucursales</option>';
        
        this.branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name;
            if (this.selectedBranchId === branch.id) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        // Si estaba seleccionada "todas", marcarla
        if (!this.selectedBranchId) {
            selector.value = 'all';
        }
        
        // Event listener para cambio de sucursal
        selector.addEventListener('change', (e) => {
            this.handleBranchChange(e.target.value);
        });
        
        // Actualizar label de sucursal actual
        this.updateCurrentBranchLabel();
    },
    
    updateSelectorOptions() {
        const selector = document.getElementById('branch-selector');
        if (!selector) return;
        
        // Guardar valor seleccionado
        const currentValue = selector.value;
        
        // Limpiar y reconstruir opciones
        selector.innerHTML = '<option value="all">Todas las Sucursales</option>';
        
        this.branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name;
            selector.appendChild(option);
        });
        
        // Restaurar selección
        if (currentValue) {
            selector.value = currentValue;
        }
    },
    
    async handleBranchChange(branchId) {
        if (branchId === 'all') {
            this.selectedBranchId = null;
        } else {
            this.selectedBranchId = branchId;
        }
        
        // Guardar en localStorage
        localStorage.setItem('admin_selected_branch_id', this.selectedBranchId || 'all');
        
        // Si se seleccionó una sucursal específica (no "todas"), actualizar BranchManager
        if (this.selectedBranchId && typeof BranchManager !== 'undefined') {
            await BranchManager.setCurrentBranch(this.selectedBranchId);
        }
        
        // Actualizar label
        this.updateCurrentBranchLabel();
        
        // Aplicar filtro (recargar datos de todos los módulos)
        this.applyFilter();
        
        // Emitir eventos para que otros módulos sepan que cambió la sucursal
        const branchFilterEvent = new CustomEvent('branch-filter-changed', {
            detail: { branchId: this.selectedBranchId }
        });
        window.dispatchEvent(branchFilterEvent);
        
        // También emitir evento branch-changed para compatibilidad
        if (this.selectedBranchId) {
            const branch = this.branches.find(b => b.id === this.selectedBranchId);
            if (branch) {
                const branchChangedEvent = new CustomEvent('branch-changed', {
                    detail: { branchId: this.selectedBranchId, branch }
                });
                window.dispatchEvent(branchChangedEvent);
                
                // Notificar a EventBus si existe
                if (typeof Utils !== 'undefined' && Utils.EventBus) {
                    Utils.EventBus.emit('branch-changed', { branchId: this.selectedBranchId, branch });
                }
            }
        }
        
        // Recargar módulo actual si existe
        const currentModule = typeof UI !== 'undefined' && UI.currentModule 
            ? UI.currentModule 
            : localStorage.getItem('current_module');
        
        if (currentModule && typeof App !== 'undefined' && App.loadModule) {
            // Pequeño delay para asegurar que los eventos se propaguen
            setTimeout(async () => {
                try {
                    await App.loadModule(currentModule);
                    if (typeof Utils !== 'undefined' && Utils.showNotification) {
                        const branchName = this.selectedBranchId 
                            ? (this.branches.find(b => b.id === this.selectedBranchId)?.name || 'Sucursal')
                            : 'Todas las Sucursales';
                        Utils.showNotification(`Vista cambiada a: ${branchName}`, 'success');
                    }
                } catch (e) {
                    console.error('Error recargando módulo después de cambio de sucursal:', e);
                }
            }, 200);
        }
    },
    
    updateCurrentBranchLabel() {
        const label = document.getElementById('current-branch');
        if (!label) return;
        
        if (!this.selectedBranchId) {
            label.textContent = 'Todas las Sucursales';
            label.style.fontWeight = '600';
            label.style.color = 'var(--color-primary)';
        } else {
            const branch = this.branches.find(b => b.id === this.selectedBranchId);
            if (branch) {
                label.textContent = branch.name;
                label.style.fontWeight = '400';
                label.style.color = 'inherit';
            }
        }
    },
    
    hideSelector() {
        const container = document.getElementById('branch-selector-container');
        if (container) {
            container.style.display = 'none';
        }
        
        // Mostrar solo la sucursal del usuario
        const currentUser = API.currentUser || JSON.parse(localStorage.getItem('api_user') || '{}');
        const label = document.getElementById('current-branch');
        if (label && currentUser.branch_name) {
            label.textContent = currentUser.branch_name;
        }
    },
    
    applyFilter() {
        // Notificar a todos los módulos que deben recargar datos
        // Cada módulo escuchará el evento 'branch-filter-changed' y recargará sus datos
        
        // Por ahora, simplemente emitimos el evento
        // Los módulos individuales deben escuchar este evento
        console.log('🔍 Filtro de sucursal aplicado:', this.selectedBranchId || 'Todas');
    },
    
    // Obtener parámetros de query para API
    getQueryParams() {
        if (!this.isAdmin) {
            return {}; // Usuario normal: no envía branchId (backend usa el del token)
        }
        
        if (this.selectedBranchId) {
            return { branchId: this.selectedBranchId };
        }
        
        // Admin sin filtro: no enviar branchId para ver todas
        return {};
    }
};

// Exportar globalmente
window.BranchSelector = BranchSelector;

