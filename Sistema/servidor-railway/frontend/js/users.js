// User Management and Authentication

const UserManager = {
    currentUser: null,
    currentEmployee: null,

    async init() {
        this.setupLogin();
        this.checkAuth();
    },

    setupLogin() {
        const barcodeInput = document.getElementById('employee-barcode-input');
        const pinInput = document.getElementById('pin-input');
        const loginBtn = document.getElementById('login-btn');
        const createDemoBtn = document.getElementById('create-demo-users-btn');

        if (barcodeInput) {
            barcodeInput.addEventListener('input', async (e) => {
                const barcode = e.target.value.trim();
                if (barcode.length > 0) {
                    await this.handleBarcodeInput(barcode);
                }
            });
        }

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.handleLogin());
        }

        if (pinInput) {
            pinInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });
        }

        // Botón de crear usuarios demo (oculto, solo para desarrollo)
        if (createDemoBtn) {
            createDemoBtn.addEventListener('click', async () => {
                try {
                    if (typeof window.createDemoUsers === 'function') {
                        await window.createDemoUsers();
                        console.log('✅ Usuarios demo creados');
                    }
                } catch (error) {
                    console.error('Error creando usuarios demo:', error);
                }
            });
        }
    },

    async handleBarcodeInput(barcode) {
        try {
            // Try to find employee by barcode
            const employee = await DB.getByIndex('employees', 'barcode', barcode);
            if (employee && employee.active) {
                document.getElementById('employee-barcode-input').value = employee.name;
                document.getElementById('pin-group').style.display = 'block';
                document.getElementById('pin-input').focus();
                window.currentEmployee = employee;
                return;
            }
            
            // Try to find by username
            const users = await DB.getAll('users') || [];
            if (Array.isArray(users)) {
                const user = users.find(u => u && u.username && u.username.toLowerCase() === barcode.toLowerCase() && u.active);
                if (user) {
                    const emp = await DB.get('employees', user.employee_id);
                    if (emp && emp.active) {
                        document.getElementById('employee-barcode-input').value = user.username;
                        document.getElementById('pin-group').style.display = 'block';
                        document.getElementById('pin-input').focus();
                        window.currentEmployee = emp;
                    }
                }
            }
        } catch (e) {
            console.error('Error finding employee:', e);
        }
    },

    async handleLogin() {
        try {
            console.log('=== INICIANDO LOGIN CON RAILWAY ===');
            const barcodeInput = document.getElementById('employee-barcode-input');
            const pinInput = document.getElementById('pin-input');
            const errorEl = document.getElementById('login-error');

            if (!barcodeInput || !pinInput) {
                console.error('Campos de login no encontrados');
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }

            const inputValue = barcodeInput.value.trim();
            const pinValue = pinInput.value.trim();
            
            console.log('Input usuario:', inputValue);
            console.log('PIN ingresado:', pinValue ? '***' : '(vacío)');

            if (!inputValue) {
                this.showError('Ingresa un usuario');
                return;
            }

            if (!pinValue || pinValue.length < 4) {
                this.showError('Ingresa un PIN válido');
                return;
            }

            // Intentar login con Railway API
            // Primero intentar login por username/password
            try {
                const response = await API.login(inputValue, pinValue);
                
                if (response.success && response.token) {
                    console.log('✅ Login exitoso con Railway');
                    
                    // Guardar datos del usuario
                    this.currentUser = response.user;
                    this.currentEmployee = response.employee;
                    
                    // Actualizar localStorage
                    localStorage.setItem('current_user_id', response.user.id);
                    if (response.employee) {
                        localStorage.setItem('current_employee_id', response.employee.id);
                    }
                    
                    // Conectar WebSocket después del login exitoso
                    if (typeof SocketManager !== 'undefined') {
                        await SocketManager.init();
                    }
                    
                    // Cargar branch usando BranchManager
                    if (typeof BranchManager !== 'undefined') {
                        const branchId = response.user.branchId || response.employee?.branchId;
                        if (branchId) {
                            await BranchManager.setCurrentBranch(branchId);
                        }
            }

                    // Ocultar login y mostrar sistema
                    this.hideLogin();
                    this.onLoginSuccess();
                    return;
                }
            } catch (apiError) {
                console.log('Login por username falló, intentando por barcode...', apiError.message);
            }

            // Si falló por username, intentar por código de barras
            try {
                const response = await API.loginBarcode(inputValue, pinValue);
                
                if (response.success && response.token) {
                    console.log('✅ Login exitoso con Railway (por barcode)');
                    
                    // Guardar datos del usuario
                    this.currentUser = response.user;
                    this.currentEmployee = response.employee;
                    
                    // Actualizar localStorage
                    localStorage.setItem('current_user_id', response.user.id);
                    if (response.employee) {
                        localStorage.setItem('current_employee_id', response.employee.id);
            }

                    // Conectar WebSocket después del login exitoso
                    if (typeof SocketManager !== 'undefined') {
                        await SocketManager.init();
                    }
                    
                    // Cargar branch usando BranchManager
                    if (typeof BranchManager !== 'undefined') {
                        const branchId = response.user.branchId || response.employee?.branchId;
                        if (branchId) {
                            await BranchManager.setCurrentBranch(branchId);
                }
            }

                    // Ocultar login y mostrar sistema
                    this.hideLogin();
                    this.onLoginSuccess();
                    return;
                }
            } catch (barcodeError) {
                console.error('Error en login por barcode:', barcodeError);
                this.showError(barcodeError.message || 'Usuario o contraseña incorrectos');
                return;
            }

            // Si llegamos aquí, ambos intentos fallaron
            this.showError('Usuario o contraseña incorrectos');
            
        } catch (error) {
            console.error('Error en login:', error);
            this.showError(error.message || 'Error de conexión con el servidor');
                    }
    },

    hideLogin() {
        const loginScreen = document.getElementById('login-screen');
        const companyCodeScreen = document.getElementById('company-code-screen');
        
        if (loginScreen) {
            loginScreen.style.display = 'none';
        }
        if (companyCodeScreen) {
            companyCodeScreen.style.display = 'none';
                    }
        
        // Limpiar campos de login
        const barcodeInput = document.getElementById('employee-barcode-input');
        const pinInput = document.getElementById('pin-input');
        const loginError = document.getElementById('login-error');
        
        if (barcodeInput) barcodeInput.value = '';
        if (pinInput) pinInput.value = '';
        if (loginError) loginError.style.display = 'none';
    },

    async onLoginSuccess() {
        try {
            // Actualizar UI con información del usuario
            if (UI && UI.updateUserInfo && this.currentEmployee) {
                UI.updateUserInfo(this.currentEmployee);
            }

            // Ocultar todos los módulos primero
            document.querySelectorAll('.module').forEach(mod => {
                mod.style.display = 'none';
            });

            // Mostrar dashboard por defecto
            if (UI && UI.showModule) {
                try {
                    await UI.showModule('dashboard');
                } catch (e) {
                    console.error('Error showing module:', e);
                    // Fallback
                    const dashboard = document.getElementById('module-dashboard');
                    if (dashboard) {
                        dashboard.style.display = 'block';
                    }
                }
            } else {
                // Fallback si UI.showModule no está disponible
            const dashboard = document.getElementById('module-dashboard');
            if (dashboard) {
                dashboard.style.display = 'block';
                }
            }

            // Actualizar navegación
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.module === 'dashboard') {
                    item.classList.add('active');
                }
            });

            // Mostrar navegación de admin si aplica
            if (UI && UI.updateAdminNavigation) {
                const isAdmin = this.currentUser?.role === 'admin' || 
                               this.currentUser?.permissions?.includes('all');
                UI.updateAdminNavigation(isAdmin);
            }
            
            // Filtrar menú lateral según permisos
            if (typeof PermissionManager !== 'undefined' && UI && UI.filterMenuByPermissions) {
                UI.filterMenuByPermissions();
            }

            // Log audit (si existe la función)
            if (this.logAudit) {
            try {
                    await this.logAudit('login', 'user', this.currentUser?.id, { 
                        employee_id: this.currentEmployee?.id 
                    });
            } catch (e) {
                console.error('Error logging audit:', e);
                }
            }

            // Mostrar notificación de bienvenida
            if (Utils && Utils.showNotification && this.currentEmployee) {
                Utils.showNotification(`Bienvenido, ${this.currentEmployee.name}`, 'success');
            }

            console.log('✅ Login completado exitosamente');
            
                } catch (error) {
            console.error('Error en onLoginSuccess:', error);
                }
            },

    showError(message, type = 'error') {
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (errorEl) errorEl.style.display = 'none';
            }, 5000);
        }
    },

    async checkAuth() {
        // IMPORTANTE: Verificar primero si el código de empresa ya fue validado
        // Si no está validado, NO mostrar login-screen (App.initCompanyCodeAccess se encarga de eso)
        const companyCodeScreen = document.getElementById('company-code-screen');
        const companyCodeValidated = localStorage.getItem('company_code_validated');
        
        // Si la pantalla de código de empresa está visible, no hacer nada aquí
        if (companyCodeScreen && companyCodeScreen.style.display === 'flex') {
            console.log('checkAuth: Código de empresa pendiente, esperando validación...');
            return;
        }
        
        // Si no hay código validado y no estamos en producción con bypass, esperar
        if (!companyCodeValidated) {
            // Verificar si existe App.COMPANY_ACCESS_CODE (sistema de código habilitado)
            if (typeof App !== 'undefined' && App.COMPANY_ACCESS_CODE) {
                console.log('checkAuth: Código de empresa no validado aún, delegando a initCompanyCodeAccess');
                return;
            }
        }
        
        try {
            // Verificar si hay token de Railway guardado
            const token = localStorage.getItem('api_token');
            const savedUser = localStorage.getItem('api_user');
            
            if (token && savedUser) {
                try {
                    // Verificar que el token sea válido
                    const isValid = await API.verifyToken();
                    
                    if (isValid) {
                        // Token válido, restaurar usuario
                        try {
                            this.currentUser = JSON.parse(savedUser);
                            API.currentUser = this.currentUser;
                            
                            // Conectar WebSocket si no está conectado
                            if (typeof SocketManager !== 'undefined' && !SocketManager.isConnected()) {
                                await SocketManager.init();
                            }
                            
                            // Restaurar empleado si está en la respuesta guardada
                            const savedEmployeeId = localStorage.getItem('current_employee_id');
                            if (savedEmployeeId && typeof API !== 'undefined') {
                                try {
                                    const employees = await API.getEmployees();
                                    this.currentEmployee = employees.find(e => e.id === savedEmployeeId);
                                } catch (e) {
                                    console.warn('No se pudo cargar empleado:', e);
                                }
                            }
                            
                            // Actualizar UI
                            if (UI && UI.updateUserInfo && this.currentEmployee) {
                                UI.updateUserInfo(this.currentEmployee);
                            }
                            
                            // Cargar branch
                            if (this.currentUser.branchId && typeof BranchManager !== 'undefined') {
                                await BranchManager.setCurrentBranch(this.currentUser.branchId);
                            }
                            
                            // Mostrar navegación de admin si aplica
                            if (UI && UI.updateAdminNavigation) {
                                const isAdmin = this.currentUser.role === 'admin' || 
                                               this.currentUser.permissions?.includes('all');
                                UI.updateAdminNavigation(isAdmin);
                            }
                            
                            // Ocultar AMBAS pantallas de autenticación
                            const loginScreen = document.getElementById('login-screen');
                            if (loginScreen) {
                                loginScreen.style.display = 'none';
                            }
                            if (companyCodeScreen) {
                                companyCodeScreen.style.display = 'none';
                            }
                            
                            // Restaurar módulo guardado o mostrar dashboard
                            const savedModule = localStorage.getItem('current_module');
                            const moduleToShow = savedModule || 'dashboard';
                            
                            if (UI && UI.showModule) {
                                UI.showModule(moduleToShow);
                            }
                            
                            return;
                        } catch (e) {
                            console.error('Error restaurando usuario:', e);
                            // Token inválido, limpiar y mostrar login
                            API.logout();
                        }
                    } else {
                        // Token inválido, limpiar y mostrar login
                        API.logout();
                    }
                } catch (e) {
                    console.error('Error verificando token:', e);
                    // Error verificando token, limpiar y mostrar login
                    API.logout();
                }
            }
            
            // Fallback: Verificar si hay usuario en IndexedDB (para migración gradual)
            const userId = localStorage.getItem('current_user_id');
            if (userId && typeof DB !== 'undefined' && DB.get) {
                try {
                    const user = await DB.get('users', userId);
                    if (user && user.active) {
                        const employee = await DB.get('employees', user.employee_id);
                        if (employee && employee.active) {
                            this.currentUser = user;
                            this.currentEmployee = employee;
                            
                            if (UI && UI.updateUserInfo) {
                                UI.updateUserInfo(employee);
                            }
                            
                            const branchId = localStorage.getItem('current_branch_id');
                            if (branchId) {
                                const branch = await DB.get('catalog_branches', branchId);
                                if (branch && UI && UI.updateBranchInfo) {
                                    UI.updateBranchInfo(branch);
                                }
                            }
                            
                            // Ocultar pantallas de autenticación
                            const loginScreen = document.getElementById('login-screen');
                            if (loginScreen) {
                                loginScreen.style.display = 'none';
                            }
                            if (companyCodeScreen) {
                                companyCodeScreen.style.display = 'none';
                            }
                            
                            // Restaurar módulo guardado o mostrar dashboard
                            const savedModule = localStorage.getItem('current_module');
                            const moduleToShow = savedModule || 'dashboard';
                            
                            if (UI && UI.showModule) {
                                UI.showModule(moduleToShow);
                            }
                            
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Error checking auth (fallback IndexedDB):', e);
                }
            }
        } catch (e) {
            console.error('Error in checkAuth:', e);
        }
        
        // Solo mostrar login si el código de empresa ya fue validado
        if (companyCodeValidated) {
            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) {
                loginScreen.style.display = 'flex';
            } else {
                console.error('login-screen element not found!');
            }
        }
    },

    async logout() {
        // Logout en Railway API
        if (typeof API !== 'undefined') {
            API.logout();
        }
        
        // Desconectar WebSocket
        if (typeof SocketManager !== 'undefined') {
            SocketManager.disconnect();
        }
        
        // Logout audit (si existe función)
        if (this.logAudit) {
            try {
        await this.logAudit('logout', 'user', this.currentUser?.id);
            } catch (e) {
                console.error('Error logging audit:', e);
            }
        }
        
        this.currentUser = null;
        this.currentEmployee = null;
        localStorage.removeItem('current_user_id');
        localStorage.removeItem('current_employee_id');
        localStorage.removeItem('current_branch_id');
        localStorage.removeItem('api_token');
        localStorage.removeItem('api_user');
        
        // Al cerrar sesión, verificar si debe mostrar código de empresa o login
        const companyCodeValidated = localStorage.getItem('company_code_validated');
        const companyCodeScreen = document.getElementById('company-code-screen');
        const loginScreen = document.getElementById('login-screen');
        
        if (companyCodeValidated) {
            // Código de empresa ya validado, mostrar solo login
            if (loginScreen) loginScreen.style.display = 'flex';
            if (companyCodeScreen) companyCodeScreen.style.display = 'none';
        } else {
            // Código de empresa no validado, mostrar pantalla de código
            if (companyCodeScreen) companyCodeScreen.style.display = 'flex';
            if (loginScreen) loginScreen.style.display = 'none';
        }
        
        // Limpiar campos de login
        const barcodeInput = document.getElementById('employee-barcode-input');
        const pinInput = document.getElementById('pin-input');
        const pinGroup = document.getElementById('pin-group');
        const loginError = document.getElementById('login-error');
        
        if (barcodeInput) barcodeInput.value = '';
        if (pinInput) pinInput.value = '';
        if (pinGroup) pinGroup.style.display = 'none';
        if (loginError) loginError.style.display = 'none';
    },

    async logAudit(action, entityType, entityId, details = {}) {
        try {
            const auditId = Utils.generateId();
            await DB.add('audit_log', {
                id: auditId,
                user_id: this.currentUser?.id || 'system',
                action: action,
                entity_type: entityType,
                entity_id: entityId,
                details: details,
                created_at: new Date().toISOString()
            });
            
            // Agregar a cola de sincronización
            if (typeof SyncManager !== 'undefined') {
                try {
                    await SyncManager.addToQueue('audit_log', auditId);
                } catch (syncError) {
                    console.error('Error agregando audit_log a cola:', syncError);
                }
            }
        } catch (e) {
            console.error('Error logging audit:', e);
        }
    },

    hasPermission(permission) {
        if (!this.currentUser) return false;
        if (this.currentUser.role === 'admin') return true;
        return this.currentUser.permissions?.includes(permission) || false;
    }
};
