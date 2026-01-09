// User Management and Authentication

const UserManager = {
    currentUser: null,
    currentEmployee: null,

    async init() {
        // Inicializar API primero para cargar token guardado si existe
        if (typeof API !== 'undefined' && API.init) {
            API.init();
        }
        
        this.setupLogin();
        
        // Intentar restaurar sesión existente primero
        await this.checkAuth();
        
        // Si no hay sesión, intentar login automático
        if (!this.currentUser && !API.token) {
            await this.autoLogin();
        }
    },
    
    async autoLogin() {
        try {
            console.log('🔄 Intentando login automático...');
            
            // Primero intentar configurar admin si no existe
            try {
                const baseURL = typeof API !== 'undefined' && API.baseURL ? API.baseURL : '';
                
                const setupResponse = await fetch(`${baseURL}/api/auth/setup-admin`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (setupResponse.ok) {
                    const setupData = await setupResponse.json();
                    
                    if (setupData.success) {
                        console.log('✅ Usuario admin configurado automáticamente');
                        // Esperar un momento para asegurar que el usuario se creó/actualizó en la BD
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } catch (setupError) {
                console.log('⚠️ No se pudo configurar admin automáticamente (puede que ya exista):', setupError.message);
            }
            
            // Intentar login automático con credenciales por defecto
            try {
                const response = await API.login('admin', '1234');
                
                if (response.success && response.token) {
                    console.log('✅ Login automático exitoso');
                    
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
                    
                    // Inicializar y cargar branch usando BranchManager DESPUÉS del login
                    if (typeof BranchManager !== 'undefined') {
                        try {
                            await BranchManager.init();
                            
                            // Establecer sucursal si está disponible
                            const branchId = response.user.branchId || response.employee?.branchId || response.employee?.branch_id;
                            if (branchId) {
                                await BranchManager.setCurrentBranch(branchId);
                            }
                        } catch (e) {
                            console.error('Error inicializando BranchManager después del login automático:', e);
                        }
                    }
                    
                    // Ocultar login y mostrar sistema
                    this.hideLogin();
                    await this.onLoginSuccess();
                    return true;
                }
            } catch (loginError) {
                console.log('⚠️ Login automático falló:', loginError.message);
                
                // Si falla, mostrar pantalla de login para que el usuario ingrese manualmente
                // Pre-llenar campos con credenciales por defecto
                this.showLogin();
                const barcodeInput = document.getElementById('employee-barcode-input');
                const pinInput = document.getElementById('pin-input');
                const pinGroup = document.getElementById('pin-group');
                if (barcodeInput) barcodeInput.value = 'admin';
                if (pinInput) pinInput.value = '1234';
                if (pinGroup) pinGroup.style.display = 'block';
                return false;
            }
        } catch (error) {
            console.error('Error en autoLogin:', error);
            // Si falla todo, mostrar pantalla de login
            this.showLogin();
            return false;
        }
    },
    
    showLogin() {
        const codeScreen = document.getElementById('company-code-screen');
        const loginScreen = document.getElementById('login-screen');
        
        // Ocultar código de empresa y mostrar login directamente
        if (codeScreen) codeScreen.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'flex';
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

        // Botón de crear usuarios demo ELIMINADO - ya no se necesita
        // El backend tiene seed.js que crea usuarios automáticamente
    },

    async handleBarcodeInput(barcode) {
        try {
            // No hacer peticiones antes del login - solo mostrar el campo de PIN cuando hay texto
            // Las búsquedas de usuarios/empleados requieren autenticación, así que no las hacemos aquí
            const pinGroup = document.getElementById('pin-group');
            if (pinGroup && barcode.length > 0) {
                pinGroup.style.display = 'block';
                document.getElementById('pin-input')?.focus();
            }
            
            // NO hacer peticiones a la API antes del login porque requieren token
            // El usuario simplemente escribirá su username y PIN, y el login verificará las credenciales
        } catch (e) {
            // Silenciar errores - no es crítico si no se puede buscar antes del login
        }
    },

    async setupAdmin() {
        const setupBtn = document.getElementById('setup-admin-btn');
        const errorEl = document.getElementById('login-error');
        
        if (!setupBtn) return;
        
        // Deshabilitar botón mientras se procesa
        setupBtn.disabled = true;
        setupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Configurando...';
        
        // Ocultar errores previos
        if (errorEl) {
            errorEl.style.display = 'none';
        }
        
        try {
            const baseURL = typeof API !== 'undefined' && API.baseURL ? API.baseURL : '';
            
            // Intentar primero con setup-admin, si falla (404), el servidor necesita reiniciarse
            let url = `${baseURL}/api/auth/setup-admin`;
            let response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // Si el endpoint no existe (404), el servidor necesita reiniciarse
            if (response.status === 404) {
                throw new Error('El endpoint no está disponible. El servidor necesita reiniciarse. Por favor, haz un nuevo deploy en Railway o espera unos minutos.');
            }
            
            // Verificar si la respuesta es JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`El servidor devolvió HTML en lugar de JSON. El servidor necesita reiniciarse. Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Mostrar mensaje de éxito
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.style.background = 'var(--color-success)';
                    errorEl.style.color = 'white';
                    errorEl.textContent = `✅ Usuario admin configurado correctamente! Usuario: admin, PIN: 1234`;
                }
                
                // Llenar automáticamente los campos
                const barcodeInput = document.getElementById('employee-barcode-input');
                const pinInput = document.getElementById('pin-input');
                const pinGroup = document.getElementById('pin-group');
                
                if (barcodeInput) {
                    barcodeInput.value = 'admin';
                }
                if (pinInput) {
                    pinInput.value = '1234';
                }
                if (pinGroup) {
                    pinGroup.style.display = 'block';
                }
                
                // Mostrar notificación
                if (typeof Utils !== 'undefined' && Utils.showNotification) {
                    Utils.showNotification('Usuario admin configurado correctamente. Puedes iniciar sesión ahora.', 'success');
                }
            } else {
                // Mostrar error
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.style.background = 'var(--color-error)';
                    errorEl.style.color = 'white';
                    errorEl.textContent = `❌ Error: ${data.error || 'Error desconocido'}`;
                }
                
                if (typeof Utils !== 'undefined' && Utils.showNotification) {
                    Utils.showNotification(`Error: ${data.error || 'Error desconocido'}`, 'error');
                        }
                    }
        } catch (error) {
            console.error('Error configurando admin:', error);
            let errorMessage = error.message || 'Error desconocido';
            
            // Si el error menciona que el endpoint no existe, dar instrucciones más claras
            if (errorMessage.includes('endpoint no existe') || errorMessage.includes('HTML en lugar de JSON') || errorMessage.includes('Unexpected token')) {
                errorMessage = 'El endpoint no está disponible. El servidor necesita reiniciarse. Por favor, ve a Railway Dashboard → Deployments → Redeploy, o espera unos minutos y vuelve a intentar.';
                }
            
            if (errorEl) {
                errorEl.style.display = 'block';
                errorEl.style.background = 'var(--color-error)';
                errorEl.style.color = 'white';
                errorEl.textContent = `❌ ${errorMessage}`;
            }
            
            if (typeof Utils !== 'undefined' && Utils.showNotification) {
                Utils.showNotification(errorMessage, 'error');
            }
        } finally {
            // Restaurar botón
            setupBtn.disabled = false;
            setupBtn.innerHTML = '<i class="fas fa-tools"></i> Configurar Usuario Admin';
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
                    
                    // Inicializar y cargar branch usando BranchManager DESPUÉS del login
                    if (typeof BranchManager !== 'undefined') {
                        try {
                            // Inicializar BranchManager ahora que tenemos token
                            await BranchManager.init();
                            
                            // Establecer sucursal si está disponible
                            const branchId = response.user.branchId || response.employee?.branchId || response.employee?.branch_id;
                        if (branchId) {
                            await BranchManager.setCurrentBranch(branchId);
                            }
                        } catch (e) {
                            console.error('Error inicializando BranchManager después del login:', e);
                        }
            }

                    // Ocultar login y mostrar sistema
                    this.hideLogin();
                    this.onLoginSuccess();
                    return;
                }
            } catch (apiError) {
                console.error('Error en login por username:', apiError);
                // Si el error es específico de autenticación (usuario/contraseña incorrectos),
                // mostrar ese error y NO intentar por barcode
                if (apiError.message && (
                    apiError.message.includes('Usuario o contraseña') || 
                    apiError.message.includes('incorrectos') ||
                    apiError.message.includes('no encontrado') ||
                    apiError.message.includes('inactivo')
                )) {
                    this.showError(apiError.message || 'Usuario o contraseña incorrectos');
                    return;
                }
                // Si es otro tipo de error (red, servidor, etc.), intentar por barcode como fallback
                console.log('Login por username falló con error inesperado, intentando por barcode...', apiError.message);
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
                    
                    // Inicializar y cargar branch usando BranchManager DESPUÉS del login
                    if (typeof BranchManager !== 'undefined') {
                        try {
                            // Inicializar BranchManager ahora que tenemos token
                            await BranchManager.init();
                            
                            // Establecer sucursal si está disponible
                            const branchId = response.user.branchId || response.employee?.branchId || response.employee?.branch_id;
                        if (branchId) {
                            await BranchManager.setCurrentBranch(branchId);
                            }
                        } catch (e) {
                            console.error('Error inicializando BranchManager después del login:', e);
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

            // Inicializar módulos que requieren autenticación después del login
            try {
                // Initialize Backup Manager (backups automáticos cada 10 minutos)
                if (typeof BackupManager !== 'undefined' && !BackupManager.isRunning) {
                    await BackupManager.init();
                    console.log('Backup manager initialized after login');
                }

                // Initialize Exchange Rates Manager (actualización automática de tipos de cambio)
                if (typeof ExchangeRates !== 'undefined') {
                    await ExchangeRates.init();
                    console.log('Exchange rates manager initialized after login');
                }

                // Initialize Branch Selector (selector de sucursal para admin)
                if (typeof BranchSelector !== 'undefined' && BranchSelector.init) {
                    await BranchSelector.init();
                    console.log('Branch selector initialized after login');
                }

                // Cargar datos básicos del sistema si no se cargaron antes
                if (typeof App !== 'undefined' && App.loadSystemData) {
                    await App.loadSystemData();
                    console.log('System data loaded after login');
                }

                // Verificar y corregir códigos de barras después del login
                if (typeof App !== 'undefined' && App.verifyAndFixBarcodes) {
                    await App.verifyAndFixBarcodes();
                    console.log('Barcodes verified and fixed after login');
                }
            } catch (initError) {
                console.error('Error initializing modules after login:', initError);
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
                        // Token válido, restaurar usuario PERO verificar que el logout no haya limpiado esto
                        // Si hay un flag de "logout forzado", no restaurar
                        const forcedLogout = sessionStorage.getItem('forced_logout');
                        if (forcedLogout === 'true') {
                            // Logout forzado, no restaurar sesión
                            console.log('Logout forzado detectado, no restaurando sesión');
                            sessionStorage.removeItem('forced_logout');
                            API.logout();
                            return;
                        }
                        
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
                                    console.warn('⚠️ No se pudo cargar empleado (puede ser error de tabla):', e.message || e);
                                    // Continuar sin empleado si hay error
                                }
                            }
                            
                            // Actualizar UI
                            if (UI && UI.updateUserInfo && this.currentEmployee) {
                                UI.updateUserInfo(this.currentEmployee);
                            }
                            
                            // Cargar branch
                            if (this.currentUser.branchId && typeof BranchManager !== 'undefined') {
                                try {
                                    await BranchManager.setCurrentBranch(this.currentUser.branchId);
                                } catch (e) {
                                    console.warn('⚠️ Error cargando branch (puede ser error de tabla):', e.message || e);
                                    // Continuar sin branch si hay error
                                }
                            }
                            
                            // Mostrar navegación de admin si aplica
                            if (UI && UI.updateAdminNavigation) {
                                const isAdmin = this.currentUser.role === 'admin' || 
                                               this.currentUser.permissions?.includes('all');
                                UI.updateAdminNavigation(isAdmin);
                            }
                            
                            // Ocultar AMBAS pantallas de autenticación
                            const loginScreen = document.getElementById('login-screen');
                            const mainApp = document.getElementById('main-app');
                            if (loginScreen) {
                                loginScreen.style.display = 'none';
                            }
                            if (companyCodeScreen) {
                                companyCodeScreen.style.display = 'none';
                            }
                            if (mainApp) {
                                mainApp.style.display = 'flex';
                            }
                            
                            // Restaurar módulo guardado o mostrar dashboard
                            const savedModule = localStorage.getItem('current_module');
                            const moduleToShow = savedModule || 'dashboard';
                            
                            if (UI && UI.showModule) {
                                UI.showModule(moduleToShow);
                            }
                            
                            // Inicializar módulos que requieren autenticación después de restaurar token válido
                            // Manejar errores individualmente para que un fallo no rompa todo
                            try {
                                // Initialize Branch Manager si no está inicializado
                                if (typeof BranchManager !== 'undefined' && !BranchManager.currentBranchId) {
                                    await BranchManager.init();
                                    console.log('✅ Branch manager initialized after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error inicializando BranchManager (puede ser tabla faltante):', e.message || e);
                            }

                            try {
                                // Initialize Backup Manager (backups automáticos cada 10 minutos)
                                if (typeof BackupManager !== 'undefined' && !BackupManager.isRunning) {
                                    await BackupManager.init();
                                    console.log('✅ Backup manager initialized after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error inicializando BackupManager:', e.message || e);
                            }

                            try {
                                // Initialize Exchange Rates Manager (actualización automática de tipos de cambio)
                                if (typeof ExchangeRates !== 'undefined') {
                                    await ExchangeRates.init();
                                    console.log('✅ Exchange rates manager initialized after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error inicializando ExchangeRates (puede ser tabla faltante):', e.message || e);
                            }

                            try {
                                // Initialize Branch Selector (selector de sucursal para admin)
                                if (typeof BranchSelector !== 'undefined' && BranchSelector.init) {
                                    await BranchSelector.init();
                                    console.log('✅ Branch selector initialized after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error inicializando BranchSelector:', e.message || e);
                            }

                            try {
                                // Cargar datos básicos del sistema si no se cargaron antes
                                // Esta función maneja errores internamente, así que si falla, no rompe todo
                                if (typeof App !== 'undefined' && App.loadSystemData) {
                                    await App.loadSystemData();
                                    console.log('✅ System data loaded after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error cargando datos del sistema (puede ser tablas faltantes):', e.message || e);
                                // Continuar aunque falle - el sistema puede funcionar sin algunos datos
                            }

                            try {
                                // Verificar y corregir códigos de barras después de restaurar token
                                if (typeof App !== 'undefined' && App.verifyAndFixBarcodes) {
                                    await App.verifyAndFixBarcodes();
                                    console.log('✅ Barcodes verified and fixed after token restore');
                                }
                            } catch (e) {
                                console.warn('⚠️ Error verificando códigos de barras:', e.message || e);
                            }
                            
                            return;
                        } catch (e) {
                            console.error('❌ Error restaurando usuario:', e);
                            // Token inválido o error al restaurar, limpiar y mostrar login
                            API.logout();
                            this.showLogin();
                        }
                    } else {
                        // Token inválido, limpiar y mostrar login
                        console.log('Token inválido, limpiando sesión');
                        API.logout();
                        this.showLogin();
                    }
                } catch (e) {
                    console.error('Error verificando token:', e);
                    // Error verificando token, limpiar y mostrar login
                    API.logout();
                }
            }
            
            // Ya no hay fallback a IndexedDB - todo debe usar el backend
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
        // Desconectar WebSocket primero
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
        
        // Logout en Railway API
        if (typeof API !== 'undefined') {
            API.logout();
        }
        
        // Limpiar todas las variables de sesión
        this.currentUser = null;
        this.currentEmployee = null;
        
        // Marcar logout forzado en sessionStorage para evitar restauración automática
        sessionStorage.setItem('forced_logout', 'true');
        
        // LIMPIAR COMPLETAMENTE localStorage - CRÍTICO
        localStorage.removeItem('api_token');
        localStorage.removeItem('api_user');
        localStorage.removeItem('current_user_id');
        localStorage.removeItem('current_employee_id');
        localStorage.removeItem('current_branch_id');
        localStorage.removeItem('company_code_validated'); // Limpiar también el código de empresa
        localStorage.removeItem('selected_branch_id');
        localStorage.removeItem('branch_filter');
        localStorage.removeItem('current_module');
        
        // Limpiar cualquier otro dato de sesión relacionado
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('api_') || key.startsWith('current_') || key.includes('token') || key.includes('user') || key.includes('branch'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // Mostrar pantalla de código de empresa (resetear completamente)
        const companyCodeScreen = document.getElementById('company-code-screen');
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');
        
        if (companyCodeScreen) companyCodeScreen.style.display = 'flex';
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'none';
        
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
            // Audit log se guarda en localStorage (store local)
            // No se envía al backend por ahora (puede agregarse endpoint si se necesita)
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
            
            // Ya no se necesita SyncManager - el backend es centralizado
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
