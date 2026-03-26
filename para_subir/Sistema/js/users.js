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
        const pinGroup = document.getElementById('pin-group');
        const loginBtn = document.getElementById('login-btn');
        const createDemoBtn = document.getElementById('create-demo-users-btn');

        // Asegurar que el campo PIN siempre esté visible
        if (pinGroup) {
            pinGroup.style.display = 'block';
        }

        if (barcodeInput) {
            barcodeInput.addEventListener('input', async (e) => {
                const barcode = e.target.value.trim();
                // Asegurar que el campo PIN esté visible cuando el usuario empiece a escribir
                if (barcode.length > 0 && pinGroup) {
                    pinGroup.style.display = 'block';
                }
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

        // Botón de crear usuarios demo ELIMINADO
        // Los usuarios deben ser creados desde el módulo de Empleados o desde el servidor centralizado
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
            console.log('=== INICIANDO LOGIN ===');
            const barcodeInput = document.getElementById('employee-barcode-input');
            const pinInput = document.getElementById('pin-input');
            const errorEl = document.getElementById('login-error');

            if (!barcodeInput || !pinInput) {
                console.error('Campos de login no encontrados');
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }

            const inputValue = barcodeInput.value.trim();
            let pinValue = pinInput.value.trim();
            
            // Si el PIN está vacío pero el usuario ingresó "admin", usar PIN por defecto
            if (!pinValue && (inputValue.toLowerCase() === 'admin' || inputValue.toLowerCase() === 'master_admin')) {
                console.log('💡 PIN vacío detectado, usando PIN por defecto para admin');
                pinValue = '1234';
                // Actualizar el campo visualmente (solo para feedback, no cambiar el valor real)
                pinInput.value = '1234';
            }

            // Intentar login con API si está configurada
            if (typeof API !== 'undefined' && API.baseURL && API.login) {
                try {
                    console.log('🔄 Intentando login con API de Railway...');
                    console.log(`   Usuario: ${inputValue}`);
                    console.log(`   URL: ${API.baseURL}`);
                    const result = await API.login(inputValue, pinValue);
                    
                    // Login exitoso con API
                    const isMasterAdmin = result.user.isMasterAdmin || result.user.is_master_admin || result.user.role === 'master_admin';
                    const userRole = result.user.role || (isMasterAdmin ? 'master_admin' : 'admin'); // Preservar rol del servidor
                    
                    const permissions = result.user.permissions != null && Array.isArray(result.user.permissions) ? result.user.permissions : [];
                    const permissionsByBranch = result.user.permissions_by_branch != null && typeof result.user.permissions_by_branch === 'object' ? result.user.permissions_by_branch : {};
                    this.currentUser = {
                        ...result.user,
                        role: userRole,
                        is_master_admin: isMasterAdmin,
                        isMasterAdmin: isMasterAdmin,
                        permissions,
                        permissions_by_branch: permissionsByBranch
                    };
                    this.currentEmployee = {
                        id: result.user.employeeId,
                        name: result.user.name || (isMasterAdmin ? 'Administrador Maestro' : 'Admin'),
                        role: userRole, // Preservar rol del servidor
                        branch_id: result.user.branchId,
                        branch_ids: result.user.branchIds
                    };

                    localStorage.setItem('current_user', JSON.stringify({
                        ...result.user,
                        role: userRole,
                        is_master_admin: isMasterAdmin,
                        isMasterAdmin: isMasterAdmin,
                        permissions,
                        permissions_by_branch: permissionsByBranch
                    }));
                    
                    // Ocultar login y mostrar sistema
                    document.getElementById('login-screen').style.display = 'none';
                    
                    // Inicializar BranchManager con la sucursal del usuario
                    if (typeof BranchManager !== 'undefined') {
                        if (result.user.branchId) {
                            await BranchManager.setCurrentBranch(result.user.branchId);
                        } else if (result.user.branchIds && result.user.branchIds.length > 0) {
                            await BranchManager.setCurrentBranch(result.user.branchIds[0]);
                        }
                    }
                    
                    // Cargar dashboard
                    UI.showModule('dashboard');
                    if (typeof Dashboard !== 'undefined' && Dashboard.init) {
                        await Dashboard.init();
                    }
                    
                    // Asegurar que API esté completamente inicializado
                    if (typeof API !== 'undefined') {
                        API.token = result.token;
                        API.baseURL = API.baseURL || (await DB.get('settings', 'api_url'))?.value || null;
                        localStorage.setItem('api_token', API.token);
                        
                        if (API.baseURL && API.token) {
                            try {
                                await API.initSocket();
                                console.log('✅ Socket.IO inicializado correctamente');
                            } catch (socketError) {
                                console.warn('Error inicializando socket:', socketError);
                            }
                        }
                    }
                    
                    // Actualizar BranchManager después del login con API
                    if (typeof BranchManager !== 'undefined') {
                        await BranchManager.updateBranchSelector();
                    }
                    
                    // Actualizar nombre del usuario en el header
                    if (typeof UI !== 'undefined' && UI.updateUserInfo) {
                        UI.updateUserInfo({
                            name: this.currentEmployee.name,
                            username: this.currentUser.username,
                            role: this.currentUser.role
                        });
                    }
                    
                    // Actualizar estado del topbar después del login
                    if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                        await window.App.updateTopbarStatus();
                    } else if (typeof UI !== 'undefined' && UI.updateSyncStatus) {
                        const apiUrl = (await DB.get('settings', 'api_url'))?.value || null;
                        const hasToken = (typeof API !== 'undefined' && API.token) || localStorage.getItem('api_token');
                        const isConnected = apiUrl && typeof API !== 'undefined' && API.baseURL && hasToken;
                        UI.updateSyncStatus(isConnected, false);
                    }
                    
                    // Sincronizar capturas rápidas después del login para que el usuario vea sus capturas en diferentes computadoras
                    if (typeof Reports !== 'undefined' && Reports.syncQuickCapturesFromServer) {
                        setTimeout(async () => {
                            try {
                                await Reports.syncQuickCapturesFromServer();
                                console.log('✅ Capturas rápidas sincronizadas después del login');
                            } catch (syncError) {
                                console.warn('⚠️ Error sincronizando capturas después del login:', syncError);
                            }
                        }, 1000); // Esperar 1 segundo para asegurar que todo esté inicializado
                    }
                    
                    // Sincronizar reportes archivados después del login para que el usuario vea sus reportes en diferentes computadoras
                    if (typeof Reports !== 'undefined' && Reports.loadArchivedReports) {
                        setTimeout(async () => {
                            try {
                                await Reports.loadArchivedReports();
                                console.log('✅ Reportes archivados sincronizados después del login');
                            } catch (syncError) {
                                console.warn('⚠️ Error sincronizando reportes archivados después del login:', syncError);
                            }
                        }, 1500); // Esperar 1.5 segundos para asegurar que todo esté inicializado
                    }
                    
                    console.log('✅ Login exitoso con API');
                    return;
                } catch (apiError) {
                    // Mostrar error más detallado
                    const errorMsg = apiError.message || 'Error desconocido';
                    const errorStatus = Number(apiError.status || 0);
                    const errorCode = String(apiError.code || '').toUpperCase();
                    
                    // Si es 401, el usuario/contraseña no coinciden en Railway
                    if (errorMsg.includes('401') || errorMsg.includes('incorrectos') || errorMsg.includes('Unauthorized')) {
                        console.error('❌ Login con API falló: Usuario o contraseña incorrectos en Railway');
                        console.error('💡 Verifica que el usuario exista en Railway y que el PIN sea correcto');
                        console.error('💡 Para master_admin, el PIN debe ser: 1234');
                        
                        // Mostrar error al usuario
                        if (errorEl) {
                            errorEl.textContent = 'Usuario o contraseña incorrectos en Railway. Verifica tus credenciales.';
                            errorEl.style.display = 'block';
                        }
                        
                        // NO continuar con login local si el error es 401 (credenciales incorrectas)
                        // Solo continuar si es un error de conexión
                        if (errorMsg.includes('no configurada') || errorMsg.includes('Tiempo de espera') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
                            console.warn('💡 Error de conexión, continuando con login local...');
                        } else {
                            return; // No hacer login local si las credenciales son incorrectas
                        }
                    } else if (errorStatus === 503 || errorCode === 'DB_UNAVAILABLE' || errorMsg.includes('Base de datos no disponible')) {
                        console.error('❌ Login con API falló: servidor central temporalmente no disponible');
                        if (errorEl) {
                            errorEl.textContent = 'Servidor central temporalmente no disponible. Intenta de nuevo en 1-2 minutos.';
                            errorEl.style.display = 'block';
                        }
                        return;
                    } else if (errorMsg.includes('no configurada') || errorMsg.includes('Tiempo de espera') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Failed to fetch')) {
                        // Silenciar estos errores (modo offline normal)
                        console.log('💡 Modo offline: Continuando con login local...');
                    } else {
                        console.warn('⚠️ Error en login con API, intentando modo local:', errorMsg);
                        console.log('💡 Usa: master_admin / PIN: 1234 para login local');
                    }
                    // Continuar con login local como fallback solo si es error de conexión
                }
            }

            // Ensure DB is ready (modo offline/fallback)
            if (!DB.db) {
                console.log('Esperando DB...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            let employee = window.currentEmployee;
            let user = null;
            
            console.log('Continuando con login local...');
            console.log('Input usuario:', inputValue);
            console.log('PIN ingresado:', pinValue ? '***' : '(vacío)');

            if (!inputValue) {
                this.showError('Ingresa un usuario');
                // Enfocar el campo de usuario
                if (barcodeInput) barcodeInput.focus();
                return;
            }

            // Si el PIN está vacío, intentar usar el PIN por defecto para admin
            if (!pinValue || pinValue.length < 4) {
                if (inputValue.toLowerCase() === 'admin' || inputValue.toLowerCase() === 'master_admin') {
                    console.log('💡 Usando PIN por defecto (1234) para admin');
                    pinValue = '1234';
                } else {
                    this.showError('Ingresa un PIN válido (mínimo 4 dígitos)');
                    // Enfocar el campo de PIN
                    if (pinInput) pinInput.focus();
                return;
                }
            }

            // Get all users and employees
            const allUsers = await DB.getAll('users') || [];
            const allEmployees = await DB.getAll('employees') || [];
            
            console.log('Usuarios en DB:', Array.isArray(allUsers) ? allUsers.length : 'ERROR - no es array');
            console.log('Empleados en DB:', Array.isArray(allEmployees) ? allEmployees.length : 'ERROR - no es array');
            
            if (!Array.isArray(allUsers)) {
                console.error('allUsers no es un array:', typeof allUsers, allUsers);
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }
            
            if (!Array.isArray(allEmployees)) {
                console.error('allEmployees no es un array:', typeof allEmployees, allEmployees);
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }

            // Normalizar input: "admin" -> "master_admin" para compatibilidad
            const normalizedInput = inputValue.toLowerCase() === 'admin' ? 'master_admin' : inputValue.toLowerCase();

            // Try to find by username first
            if (inputValue && Array.isArray(allUsers)) {
                user = allUsers.find(u => 
                    u && u.username && (
                        u.username.toLowerCase() === normalizedInput ||
                        u.username.toLowerCase() === inputValue.toLowerCase()
                    ) && u.active
                );
                
                if (user) {
                    console.log('Usuario encontrado por username:', user.username);
                    employee = await DB.get('employees', user.employee_id);
                    if (employee) {
                        console.log('Empleado encontrado:', employee.name);
                    }
                }
            }

            // If no user found by username, try by employee name or barcode
            if (!employee && inputValue && Array.isArray(allEmployees)) {
                employee = allEmployees.find(e => 
                    e && (
                        (e.name && e.name.toLowerCase() === inputValue.toLowerCase()) ||
                        (e.employee_code && e.employee_code.toLowerCase() === inputValue.toLowerCase()) ||
                        (e.employee_code && e.employee_code.toLowerCase() === normalizedInput) ||
                        e.barcode === inputValue
                    )
                );
                
                if (employee) {
                    console.log('Empleado encontrado por nombre/barcode:', employee.name);
                    if (Array.isArray(allUsers)) {
                        user = allUsers.find(u => u && u.employee_id === employee.id && u.active);
                    }
                }
            }

            // If still no employee, try currentEmployee from barcode scan
            if (!employee) {
                employee = window.currentEmployee;
                if (employee && Array.isArray(allUsers)) {
                    console.log('Usando currentEmployee:', employee.name);
                    user = allUsers.find(u => u && u.employee_id === employee.id && u.active);
                }
            }

            if (!employee) {
                console.error('Empleado no encontrado');
                
                // Intentar crear usuario/empleado admin si no existe
                if (normalizedInput === 'master_admin' || inputValue.toLowerCase() === 'admin') {
                    console.log('Intentando crear usuario master_admin...');
                    try {
                        // Crear empleado admin si no existe
                        const adminEmployee = {
                            id: '00000000-0000-0000-0000-000000000002',
                            code: 'ADMIN',
                            name: 'Administrador Maestro',
                            role: 'master_admin',
                            branch_id: null,
                            active: true
                        };
                        
                        const existingEmployee = await DB.get('employees', adminEmployee.id);
                        if (!existingEmployee) {
                            await DB.put('employees', adminEmployee);
                            console.log('✅ Empleado admin creado');
                        } else {
                            employee = existingEmployee;
                        }
                        
                        // Crear usuario admin si no existe
                        if (!user && employee) {
                            const adminUser = {
                                id: '00000000-0000-0000-0000-000000000001',
                                username: 'master_admin',
                                pin_hash: null, // Se validará con PIN 1234
                                employee_id: employee.id,
                                role: 'master_admin',
                                active: true
                            };
                            
                            const existingUser = await DB.get('users', adminUser.id);
                            if (!existingUser) {
                                await DB.put('users', adminUser);
                                console.log('✅ Usuario master_admin creado');
                                user = adminUser;
                            } else {
                                user = existingUser;
                            }
                        }
                        
                        if (employee && user) {
                            console.log('✅ Usuario y empleado admin encontrados/creados, continuando login...');
                            // Continuar con el flujo normal de login
                        } else {
                            this.showError('No se pudo crear el usuario. Usa: master_admin / PIN: 1234');
                            return;
                        }
                    } catch (createError) {
                        console.error('Error creando usuario admin:', createError);
                        this.showError('Usuario no encontrado. Usa: master_admin / PIN: 1234');
                        return;
                    }
                } else {
                    this.showError('Usuario no encontrado. Usa: master_admin / PIN: 1234');
                    return;
                }
            }

            if (!employee.active) {
                console.warn('Empleado inactivo');
                this.showError('El empleado está inactivo. Contacta al administrador.');
                return;
            }

            if (!user) {
                console.error('Usuario no encontrado para empleado:', employee.name);
                this.showError('Usuario o contraseña incorrectos. El usuario debe ser creado manualmente desde el módulo de Empleados.');
                return;
            }

            console.log('Validando PIN...');
            // Validate PIN
            let isValid = false;
            if (user.pin_hash) {
                isValid = await Utils.validatePin(pinValue, user.pin_hash);
                console.log('PIN válido (hash):', isValid);
            } else {
                // Si no hay pin_hash pero es master_admin, generar uno con PIN por defecto
                if ((user.role === 'master_admin' || employee.role === 'master_admin') && pinValue === '1234') {
                    console.log('⚠️ Usuario master_admin sin pin_hash, generando con PIN por defecto...');
                    const defaultPinHash = await Utils.hashPin('1234');
                    user.pin_hash = defaultPinHash;
                    await DB.put('users', user);
                    isValid = true;
                    console.log('✅ PIN configurado y validado');
                } else {
                    // No hay hash de PIN y no es master_admin con PIN por defecto
                    console.error('Usuario sin PIN configurado');
                    this.showError('El usuario no tiene PIN configurado. Contacta al administrador.');
                    return;
                }
            }

            if (!isValid) {
                console.error('PIN incorrecto. Hash esperado:', user.pin_hash?.substring(0, 20));
                this.showError('Usuario o contraseña incorrectos');
                return;
            }

            console.log('=== LOGIN EXITOSO ===');
                    // Login successful
                    // Asegurar que el usuario tenga permisos según su rol
                    if (typeof PermissionManager !== 'undefined') {
                        user = await PermissionManager.ensureUserPermissions(user);
                    }
                    
                    // Establecer is_master_admin basado en el rol
                    const isMasterAdmin = (user.role === 'master_admin' || employee.role === 'master_admin');
                    user.is_master_admin = isMasterAdmin;
                    user.isMasterAdmin = isMasterAdmin;
                    
                    this.currentUser = user;
                    this.currentEmployee = employee;
            
            // Store in localStorage
            localStorage.setItem('current_user_id', user.id);
            localStorage.setItem('current_employee_id', employee.id);
            localStorage.setItem('current_user', JSON.stringify(this.currentUser));

            // Update UI
            if (UI && UI.updateUserInfo) {
                UI.updateUserInfo(employee);
            }
            
            // Load branch usando BranchManager
            if (typeof BranchManager !== 'undefined') {
                if (employee.branch_id) {
                    await BranchManager.setCurrentBranch(employee.branch_id);
                } else {
                    // Si no tiene branch_id, usar la guardada o la primera disponible
                    const savedBranchId = localStorage.getItem('current_branch_id');
                    if (savedBranchId) {
                        await BranchManager.setCurrentBranch(savedBranchId);
                    }
                }
                // Asegurar que el selector se actualice después del login
                await BranchManager.updateBranchSelector();
            } else {
                // Fallback si BranchManager no está disponible
                if (employee.branch_id) {
                    const branch = await DB.get('catalog_branches', employee.branch_id);
                    if (branch && UI && UI.updateBranchInfo) {
                        UI.updateBranchInfo(branch);
                        localStorage.setItem('current_branch_id', branch.id);
                    }
                }
            }

            // Hide login, show app
            const loginScreen = document.getElementById('login-screen');
            if (loginScreen) {
                loginScreen.style.display = 'none';
            } else {
                console.error('login-screen no encontrado');
            }

            // Hide all modules first
            document.querySelectorAll('.module').forEach(mod => {
                mod.style.display = 'none';
            });

            // Show dashboard
            const dashboard = document.getElementById('module-dashboard');
            if (dashboard) {
                dashboard.style.display = 'block';
            }

            // Update navigation
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.module === 'dashboard') {
                    item.classList.add('active');
                }
            });

            if (UI && UI.showModule) {
                try {
                    UI.showModule('dashboard');
                } catch (e) {
                    console.error('Error showing module:', e);
                }
            }

            // Mostrar navegación de admin si aplica
            if (UI && UI.updateAdminNavigation) {
                const isAdmin = user.role === 'admin' || user.permissions?.includes('all');
                UI.updateAdminNavigation(isAdmin);
            }
            
            // Filtrar menú lateral según permisos
            if (typeof PermissionManager !== 'undefined' && UI && UI.filterMenuByPermissions) {
                UI.filterMenuByPermissions();
            }

            // Log audit
            try {
                await this.logAudit('login', 'user', user.id, { employee_id: employee.id });
            } catch (e) {
                console.error('Error logging audit:', e);
            }

            if (Utils && Utils.showNotification) {
                Utils.showNotification(`Bienvenido, ${employee.name}`, 'success');
            }

            console.log('Login completado exitosamente');
            
            // Después de login local exitoso, intentar sincronizar con Railway si está configurado
            // Esto permite obtener token de API incluso si el login inicial falló
            if (typeof API !== 'undefined' && typeof DB !== 'undefined') {
                try {
                    const urlSetting = await DB.get('settings', 'api_url');
                    const apiUrl = urlSetting?.value || null;
                    
                    if (apiUrl) {
                        // Asegurar que API.baseURL esté configurado
                        API.baseURL = apiUrl;
                        
                        // Intentar login con API usando las mismas credenciales
                        console.log('🔄 Intentando sincronizar con Railway después del login local...');
                        console.log(`   URL: ${apiUrl}`);
                        console.log(`   Usuario: ${inputValue}`);
                        
                        try {
                            const apiResult = await API.login(inputValue, pinValue);
                            if (apiResult && apiResult.token) {
                                console.log('✅ Token de API obtenido después del login local');
                                API.token = apiResult.token;
                                localStorage.setItem('api_token', API.token);
                                if (apiResult.user) {
                                    const perms = apiResult.user.permissions != null && Array.isArray(apiResult.user.permissions) ? apiResult.user.permissions : [];
                                    this.currentUser = { ...this.currentUser, ...apiResult.user, permissions: perms };
                                    localStorage.setItem('current_user', JSON.stringify({ ...JSON.parse(localStorage.getItem('current_user') || '{}'), ...apiResult.user, permissions: perms }));
                                }
                                try {
                                    await API.initSocket();
                                    console.log('✅ Socket.IO inicializado después del login con API');
                                } catch (socketError) {
                                    console.warn('⚠️ Error inicializando socket:', socketError);
                                }
                                if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                                    await window.App.updateTopbarStatus();
                                }
                                if (Utils && Utils.showNotification) {
                                    Utils.showNotification('✅ Conectado con Railway', 'success');
                                }
                            }
                        } catch (syncError) {
                            // Analizar el tipo de error
                            const errorMsg = syncError.message || '';
                            const is401 = errorMsg.includes('401') || errorMsg.includes('incorrectos') || errorMsg.includes('Unauthorized');
                            
                            if (is401) {
                                console.warn('⚠️ No se pudo sincronizar con Railway: Usuario o contraseña incorrectos');
                                console.warn('💡 El usuario "' + inputValue + '" puede no existir en Railway');
                                console.warn('💡 Solución:');
                                console.warn('   1. Verifica que el usuario existe en Railway');
                                console.warn('   2. O ejecuta el script create-admin-user.js en Railway');
                                console.warn('   3. O crea el usuario manualmente desde el módulo Empleados');
                                console.warn('   4. Para master_admin, usa: username=master_admin, PIN=1234');
                                
                                if (Utils && Utils.showNotification) {
                                    Utils.showNotification(
                                        '⚠️ Usuario no encontrado en Railway. Puedes continuar en modo local.',
                                        'warning',
                                        5000
                                    );
                                }
                            } else {
                                // Otro tipo de error (conexión, timeout, etc.)
                                console.warn('⚠️ No se pudo sincronizar con Railway:', syncError.message);
                                console.warn('💡 Puedes continuar trabajando en modo local');
                            }
                        }
                    }
                } catch (syncError) {
                    console.warn('Error intentando sincronizar con Railway:', syncError);
                }
            }
            
            // Actualizar estado del topbar después del login
            if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                await window.App.updateTopbarStatus();
            }
                } catch (error) {
                    console.error('Error en handleLogin:', error);
                    this.showError('Error al iniciar sesión. Por favor intenta de nuevo.');
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
        const companyCodeScreen = document.getElementById('company-code-screen');
        const companyCodeValidated = localStorage.getItem('company_code_validated');
        const apiToken = localStorage.getItem('api_token');

        // PRIORITARIO: Si hay sesión activa (token), verificar y restaurar antes de mostrar código/login.
        // Así al recargar la página se muestra el contenido directamente sin pedir código ni usuario.
        if (apiToken && typeof API !== 'undefined') {
            // Asegurar que API.baseURL esté cargado (fallback a URL de Railway por defecto)
            if (!API.baseURL && typeof DB !== 'undefined') {
                try {
                    const urlSetting = await DB.get('settings', 'api_url');
                    const DEFAULT_RAILWAY_URL = 'https://system-production-bec2.up.railway.app';
                    const normalizedSavedURL = String(urlSetting?.value || '').trim().replace(/\/+$/, '');
                    const migratedURL = normalizedSavedURL === 'https://backend-production-6260.up.railway.app'
                        ? DEFAULT_RAILWAY_URL
                        : (urlSetting?.value || DEFAULT_RAILWAY_URL);
                    API.baseURL = migratedURL;
                    // Persistir para próximas cargas
                    if (!urlSetting?.value || migratedURL !== urlSetting?.value) {
                        await DB.put('settings', { key: 'api_url', value: API.baseURL }).catch(() => {});
                    }
                } catch (e) {
                    console.warn('Error cargando API.baseURL desde DB:', e);
                    API.baseURL = 'https://system-production-bec2.up.railway.app';
                }
            }
            
            if (API.baseURL) {
                try {
                    API.token = apiToken;
                    const verifyResult = await API.verifyToken();
                    
                    if (verifyResult && verifyResult.user) {
                        // Token válido, restaurar sesión desde el servidor
                        const user = verifyResult.user;

                        // Renovar token si el servidor emitió uno nuevo (expiración próxima)
                        if (verifyResult.newToken) {
                            API.token = verifyResult.newToken;
                            localStorage.setItem('api_token', verifyResult.newToken);
                            console.log('🔄 Token renovado automáticamente');
                        }

                        const isMasterAdmin = user.isMasterAdmin || user.is_master_admin || user.role === 'master_admin';
                        
                        // Si el usuario viene del servidor y no tiene pin_hash, generarlo con PIN por defecto
                        // Esto es necesario porque el backend usa password_hash (bcrypt) y el frontend usa pin_hash (SHA-256)
                        if (!user.pin_hash && typeof Utils !== 'undefined' && Utils.hashPin) {
                            console.log('⚠️ Usuario sin pin_hash, generando con PIN por defecto (1234)...');
                            const defaultPinHash = await Utils.hashPin('1234');
                            user.pin_hash = defaultPinHash;
                            
                            // Guardar en IndexedDB si existe
                            if (typeof DB !== 'undefined') {
                                try {
                                    // Buscar usuario local por username o employee_id
                                    const localUsers = await DB.getAll('users') || [];
                                    const localUser = localUsers.find(u => 
                                        u.username === user.username || 
                                        u.employee_id === user.employeeId
                                    );
                                    
                                    if (localUser) {
                                        localUser.pin_hash = defaultPinHash;
                                        await DB.put('users', localUser);
                                        console.log('✅ pin_hash actualizado en IndexedDB');
                                    } else {
                                        // Crear entrada local si no existe
                                        const newLocalUser = {
                                            id: user.id || Utils.generateId(),
                                            username: user.username,
                                            employee_id: user.employeeId,
                                            role: user.role || 'master_admin',
                                            pin_hash: defaultPinHash,
                                            permissions: ['all'],
                                            active: true,
                                            created_at: new Date().toISOString()
                                        };
                                        await DB.put('users', newLocalUser);
                                        console.log('✅ Usuario local creado con pin_hash');
                                    }
                                } catch (dbError) {
                                    console.warn('⚠️ Error guardando pin_hash en IndexedDB:', dbError);
                                }
                            }
                        }
                        
                        const permissions = user.permissions != null && Array.isArray(user.permissions) ? user.permissions : [];
                        const permissionsByBranch = user.permissions_by_branch != null && typeof user.permissions_by_branch === 'object' ? user.permissions_by_branch : {};
                        // Preservar rol del servidor (manager, admin, etc.). Solo usar fallback 'employee' si el rol viene vacío o no está en ROLE_PROFILES.
                        let employeeRole = user.role || 'master_admin';
                        if (!isMasterAdmin && typeof PermissionManager !== 'undefined') {
                            const knownRoles = Object.keys(PermissionManager.ROLE_PROFILES || {});
                            if (!employeeRole || !knownRoles.includes(employeeRole)) {
                                employeeRole = 'employee';
                            }
                        }
                        this.currentUser = {
                            ...user,
                            role: employeeRole,
                            is_master_admin: isMasterAdmin,
                            isMasterAdmin: isMasterAdmin,
                            permissions,
                            permissions_by_branch: permissionsByBranch
                        };
                        
                        // Construir currentEmployee desde los datos del servidor
                        // Asegurar que el rol se preserve correctamente
                        this.currentEmployee = {
                            id: user.employeeId,
                            name: user.name || 'Administrador Maestro',
                            role: employeeRole,
                            branch_id: user.branchId,
                            branch_ids: user.branchIds || (user.branchId ? [user.branchId] : [])
                        };
                        
                        // Asegurar que el rol del usuario también esté correcto
                        user.role = employeeRole;
                        this.currentUser.role = employeeRole;

                        // Si el servidor devolvió permisos vacíos, rellenar según el rol (employee, seller, etc.)
                        if (typeof PermissionManager !== 'undefined') {
                            const updatedUser = await PermissionManager.ensureUserPermissions(this.currentUser);
                            this.currentUser = updatedUser;
                        }

                        localStorage.setItem('current_user', JSON.stringify({
                            ...this.currentUser,
                            role: employeeRole,
                            is_master_admin: isMasterAdmin,
                            isMasterAdmin: isMasterAdmin,
                            permissions: this.currentUser.permissions,
                            permissions_by_branch: this.currentUser.permissions_by_branch || permissionsByBranch
                        }));
                        
                        // Inicializar socket si no está ya conectado
                        if (typeof API !== 'undefined' && API.baseURL && API.token) {
                            if (!API.socket || !API.socket.connected) {
                                try {
                                    await API.initSocket();
                                    console.log('✅ Socket.IO inicializado desde checkAuth()');
                                } catch (socketError) {
                                    console.warn('⚠️ Error inicializando socket en checkAuth():', socketError);
                                }
                            }
                        }
                        
                        // Inicializar UI con información completa
                        if (UI && UI.updateUserInfo) {
                            UI.updateUserInfo({
                                ...this.currentEmployee,
                                role: employeeRole,
                                is_master_admin: isMasterAdmin
                            });
                        }
                        
                        // Inicializar BranchManager y actualizar botones de sucursales
                        if (typeof BranchManager !== 'undefined') {
                            await BranchManager.init();
                            await BranchManager.updateBranchSelector();
                            
                            // Establecer sucursal actual si existe
                            if (user.branchId) {
                                await BranchManager.setCurrentBranch(user.branchId);
                            } else if (user.branchIds && user.branchIds.length > 0) {
                                await BranchManager.setCurrentBranch(user.branchIds[0]);
                            }
                        }
                        
                        // Actualizar información de sucursal en UI
                        const branchId = user.branchId || (user.branchIds && user.branchIds.length > 0 ? user.branchIds[0] : null);
                        if (branchId && UI && UI.updateBranchInfo) {
                            try {
                                const branch = await DB.get('catalog_branches', branchId);
                                if (branch) {
                                    UI.updateBranchInfo(branch);
                                }
                            } catch (e) {
                                console.warn('No se pudo obtener branch de IndexedDB, pero continuando...', e);
                            }
                        }
                        
                        // Mostrar navegación de admin si aplica
                        if (UI && UI.updateAdminNavigation) {
                            const isAdmin = user.role === 'admin' || 
                                           user.role === 'master_admin' ||
                                           isMasterAdmin;
                            UI.updateAdminNavigation(isAdmin);
                        }
                        
                        // Inicializar Socket.IO si no está inicializado
                        if (API.baseURL && API.token && (!API.socket || !API.socket.connected)) {
                            try {
                                await API.initSocket();
                            } catch (socketError) {
                                console.warn('Error inicializando socket:', socketError);
                            }
                        }
                        
                        // Ocultar overlay "Restaurando sesión..." y ambas pantallas de autenticación
                        if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                            App.hideSessionRestoreOverlay();
                        }
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
                        } else {
                            // Fallback
                            const moduleEl = document.getElementById(`module-${moduleToShow}`);
                            if (moduleEl) {
                                moduleEl.style.display = 'block';
                            } else {
                                const dashboard = document.getElementById('module-dashboard');
                                if (dashboard) {
                                    dashboard.style.display = 'block';
                                }
                            }
                        }
                        
                        console.log('✅ Sesión restaurada desde servidor');
                        return;
                    }
                } catch (error) {
                    console.warn('Error verificando token con servidor, intentando modo local:', error);
                    localStorage.removeItem('api_token');
                    if (typeof API !== 'undefined') {
                        API.token = null;
                    }
                    if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                        App.hideSessionRestoreOverlay();
                    }
                }
            }
        }

        // Si no se restauró sesión por token: respetar pantalla de código o login
        if (companyCodeScreen && companyCodeScreen.style.display === 'flex') {
            if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                App.hideSessionRestoreOverlay();
            }
            console.log('checkAuth: Código de empresa pendiente, esperando validación...');
            return;
        }
        if (!companyCodeValidated) {
            if (typeof App !== 'undefined' && App.COMPANY_ACCESS_CODE) {
                if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                    App.hideSessionRestoreOverlay();
                }
                console.log('checkAuth: Código de empresa no validado aún, delegando a initCompanyCodeAccess');
                return;
            }
        }
        
        // MODO LOCAL: Verificar si hay usuario guardado localmente (sin servidor)
        try {
            const savedUser = localStorage.getItem('current_user');
            if (savedUser) {
                try {
                    const user = JSON.parse(savedUser);
                    // Si no hay token del servidor, usar datos locales
                    if (!apiToken) {
                        this.currentUser = user;
                        if (user.employeeId) {
                            try {
                                const employee = await DB.get('employees', user.employeeId);
                                if (employee && employee.active) {
                                    // Asegurar branch_id/branch_ids para BranchManager y API (desde user guardado si el empleado local no los tiene)
                                    const branch_id = employee.branch_id ?? user.branchId ?? null;
                                    const branch_ids = (Array.isArray(employee.branch_ids) && employee.branch_ids.length) ? employee.branch_ids : (user.branchIds && user.branchIds.length ? user.branchIds : (user.branchId ? [user.branchId] : []));
                                    this.currentEmployee = { ...employee, branch_id, branch_ids };
                                    
                                    // Rellenar permisos desde el rol si vienen vacíos (igual que al cargar desde servidor)
                                    if (typeof PermissionManager !== 'undefined') {
                                        const updatedUser = await PermissionManager.ensureUserPermissions(this.currentUser);
                                        this.currentUser = updatedUser;
                                    }
                                    
                                    if (UI && UI.updateUserInfo) {
                                        UI.updateUserInfo(this.currentEmployee);
                                    }
                                    
                                    // Inicializar BranchManager (usa currentEmployee.branch_id / branch_ids)
                                    if (typeof BranchManager !== 'undefined') {
                                        await BranchManager.init();
                                        await BranchManager.updateBranchSelector();
                                    }
                                    
                                    const branchId = localStorage.getItem('current_branch_id');
                                    if (branchId && UI && UI.updateBranchInfo) {
                                        const branch = await DB.get('catalog_branches', branchId);
                                        if (branch) {
                                            UI.updateBranchInfo(branch);
                                        }
                                    }
                                    
                                    // Establecer is_master_admin
                                    const isMasterAdmin = this.currentUser.role === 'master_admin' ||
                                                         this.currentUser.is_master_admin ||
                                                         this.currentUser.isMasterAdmin ||
                                                         (employee && employee.role === 'master_admin');
                                    this.currentUser.is_master_admin = isMasterAdmin;
                                    this.currentUser.isMasterAdmin = isMasterAdmin;
                                    
                                    // Mostrar navegación de admin
                                    if (UI && UI.updateAdminNavigation) {
                                        const isAdmin = this.currentUser.role === 'admin' ||
                                                       this.currentUser.role === 'master_admin' ||
                                                       this.currentUser.permissions?.includes('all') ||
                                                       isMasterAdmin;
                                        UI.updateAdminNavigation(isAdmin);
                                    }
                                    
                                    if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                                        App.hideSessionRestoreOverlay();
                                    }
                                    // Ocultar pantallas de autenticación
                                    const loginScreen = document.getElementById('login-screen');
                                    if (loginScreen) {
                                        loginScreen.style.display = 'none';
                                    }
                                    if (companyCodeScreen) {
                                        companyCodeScreen.style.display = 'none';
                                    }
                                    
                                    // Restaurar módulo guardado
                                    const savedModule = localStorage.getItem('current_module');
                                    const moduleToShow = savedModule || 'dashboard';
                                    
                                    if (UI && UI.showModule) {
                                        UI.showModule(moduleToShow);
                                    } else {
                                        const moduleEl = document.getElementById(`module-${moduleToShow}`);
                                        if (moduleEl) {
                                            moduleEl.style.display = 'block';
                                        } else {
                                            const dashboard = document.getElementById('module-dashboard');
                                            if (dashboard) {
                                                dashboard.style.display = 'block';
                                            }
                                        }
                                    }
                                    return;
                                }
                            } catch (e) {
                                console.error('Error obteniendo empleado local:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parseando usuario guardado:', e);
                }
            }
            
            // También intentar con current_user_id (modo legacy)
            const userId = localStorage.getItem('current_user_id');
            if (userId && !apiToken) {
                try {
                    const user = await DB.get('users', userId);
                    if (user && user.active) {
                        const employee = await DB.get('employees', user.employee_id);
                        if (employee && employee.active) {
                            this.currentUser = user;
                            // Rellenar permisos desde el rol si vienen vacíos
                            if (typeof PermissionManager !== 'undefined') {
                                const updatedUser = await PermissionManager.ensureUserPermissions(this.currentUser);
                                this.currentUser = updatedUser;
                            }
                            // Asegurar branch_id/branch_ids para BranchManager y API (desde user si el empleado local no los tiene)
                            const branch_id = employee.branch_id ?? user.branch_id ?? user.branchId ?? null;
                            const branch_ids = (Array.isArray(employee.branch_ids) && employee.branch_ids.length) ? employee.branch_ids : (user.branch_ids && user.branch_ids.length ? user.branch_ids : (user.branchIds && user.branchIds.length ? user.branchIds : (user.branchId || user.branch_id ? [user.branchId || user.branch_id] : [])));
                            this.currentEmployee = { ...employee, branch_id, branch_ids };
                            
                            if (UI && UI.updateUserInfo) {
                                UI.updateUserInfo(this.currentEmployee);
                            }
                            
                            if (typeof BranchManager !== 'undefined') {
                                await BranchManager.init();
                                await BranchManager.updateBranchSelector();
                            }
                            
                            const branchId = localStorage.getItem('current_branch_id');
                            if (branchId) {
                                const branch = await DB.get('catalog_branches', branchId);
                                if (branch && UI && UI.updateBranchInfo) {
                                    UI.updateBranchInfo(branch);
                                }
                            }
                            
                            const isMasterAdmin = this.currentUser.role === 'master_admin' ||
                                                 this.currentUser.is_master_admin ||
                                                 this.currentUser.isMasterAdmin ||
                                                 (employee && employee.role === 'master_admin');
                            this.currentUser.is_master_admin = isMasterAdmin;
                            this.currentUser.isMasterAdmin = isMasterAdmin;
                            
                            if (UI && UI.updateAdminNavigation) {
                                const isAdmin = this.currentUser.role === 'admin' ||
                                               this.currentUser.role === 'master_admin' ||
                                               this.currentUser.permissions?.includes('all') ||
                                               isMasterAdmin;
                                UI.updateAdminNavigation(isAdmin);
                            }
                            
                            if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
                                App.hideSessionRestoreOverlay();
                            }
                            const loginScreen = document.getElementById('login-screen');
                            if (loginScreen) {
                                loginScreen.style.display = 'none';
                            }
                            if (companyCodeScreen) {
                                companyCodeScreen.style.display = 'none';
                            }
                            
                            const savedModule = localStorage.getItem('current_module');
                            const moduleToShow = savedModule || 'dashboard';
                            
                            if (UI && UI.showModule) {
                                UI.showModule(moduleToShow);
                            } else {
                                const moduleEl = document.getElementById(`module-${moduleToShow}`);
                                if (moduleEl) {
                                    moduleEl.style.display = 'block';
                                } else {
                                    const dashboard = document.getElementById('module-dashboard');
                                    if (dashboard) {
                                        dashboard.style.display = 'block';
                                    }
                                }
                            }
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Error checking auth:', e);
                }
            }
        } catch (e) {
            console.error('Error in checkAuth:', e);
        }
        
        if (typeof App !== 'undefined' && App.hideSessionRestoreOverlay) {
            App.hideSessionRestoreOverlay();
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
        await this.logAudit('logout', 'user', this.currentUser?.id);
        
        this.currentUser = null;
        this.currentEmployee = null;
        localStorage.removeItem('current_user_id');
        localStorage.removeItem('current_employee_id');
        localStorage.removeItem('current_branch_id');
        
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
        // Mostrar campo PIN siempre (no ocultarlo después de logout)
        if (pinGroup) pinGroup.style.display = 'block';
        if (loginError) loginError.style.display = 'none';
        
        // Enfocar campo de usuario después de limpiar
        if (barcodeInput) {
            setTimeout(() => barcodeInput.focus(), 100);
        }
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
        // Admin y master_admin tienen acceso a todo
        if (this.currentUser.role === 'admin' || this.currentUser.role === 'master_admin') return true;
        return this.currentUser.permissions?.includes(permission) || false;
    }
};
