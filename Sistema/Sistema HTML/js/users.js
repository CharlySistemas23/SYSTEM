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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:92',message:'handleLogin iniciando',data:{dbReady:!!DB.db},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        try {
            console.log('=== INICIANDO LOGIN ===');
            const barcodeInput = document.getElementById('employee-barcode-input');
            const pinInput = document.getElementById('pin-input');
            const errorEl = document.getElementById('login-error');

            if (!barcodeInput || !pinInput) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:99',message:'handleLogin campos no encontrados',data:{barcodeInput:!!barcodeInput,pinInput:!!pinInput},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                console.error('Campos de login no encontrados');
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }

            // Ensure DB is ready
            if (!DB.db) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:106',message:'handleLogin DB no listo, esperando',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                console.log('Esperando DB...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            let employee = window.currentEmployee;
            let user = null;

            // Try to find by username first (easier login)
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

            // Get all users and employees
            const allUsers = await DB.getAll('users') || [];
            const allEmployees = await DB.getAll('employees') || [];
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:132',message:'handleLogin usuarios obtenidos',data:{usersCount:Array.isArray(allUsers)?allUsers.length:'NOT_ARRAY',employeesCount:Array.isArray(allEmployees)?allEmployees.length:'NOT_ARRAY',isUsersArray:Array.isArray(allUsers),isEmployeesArray:Array.isArray(allEmployees)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            console.log('Usuarios en DB:', Array.isArray(allUsers) ? allUsers.length : 'ERROR - no es array');
            console.log('Empleados en DB:', Array.isArray(allEmployees) ? allEmployees.length : 'ERROR - no es array');
            
            if (!Array.isArray(allUsers)) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:138',message:'handleLogin ERROR usuarios no array',data:{type:typeof allUsers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                console.error('allUsers no es un array:', typeof allUsers, allUsers);
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }
            
            if (!Array.isArray(allEmployees)) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:144',message:'handleLogin ERROR empleados no array',data:{type:typeof allEmployees},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                console.error('allEmployees no es un array:', typeof allEmployees, allEmployees);
                this.showError('Error del sistema. Por favor recarga la página.');
                return;
            }

            // Try to find by username first
            if (inputValue && Array.isArray(allUsers)) {
                user = allUsers.find(u => 
                    u && u.username && u.username.toLowerCase() === inputValue.toLowerCase() && u.active
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
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:192',message:'handleLogin empleado no encontrado',data:{inputValue,usersCount:allUsers.length,employeesCount:allEmployees.length,createDemoUsersAvailable:typeof window.createDemoUsers==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                console.error('Empleado no encontrado');
                this.showError('Usuario o contraseña incorrectos');
                // Try to create users silently
                if (typeof window.createDemoUsers === 'function') {
                    console.log('Intentando crear usuarios demo...');
                    await window.createDemoUsers();
                }
                return;
            }

            if (!employee.active) {
                console.warn('Empleado inactivo, activándolo...');
                // Auto-activate employee for demo
                employee.active = true;
                await DB.put('employees', employee);
                console.log('Empleado activado:', employee.name);
            }

            if (!user) {
                console.error('Usuario no encontrado para empleado:', employee.name);
                this.showError('Usuario o contraseña incorrectos');
                // Try to create users
                if (typeof window.createDemoUsers === 'function') {
                    await window.createDemoUsers();
                    // Try again
                    const newUsers = await DB.getAll('users') || [];
                    if (Array.isArray(newUsers)) {
                        user = newUsers.find(u => u && u.employee_id === employee.id && u.active);
                    }
                    if (!user) {
                        // Try creating user directly for this employee
                        const pinHash = await Utils.hashPin('1234');
                        user = {
                            id: `user_${employee.id}`,
                            username: employee.name.toLowerCase().replace(/\s+/g, ''),
                            employee_id: employee.id,
                            role: employee.role || 'seller',
                            permissions: employee.role === 'admin' ? ['all'] : ['pos', 'inventory_view'],
                            active: true,
                            pin_hash: pinHash
                        };
                        await DB.put('users', user);
                        console.log('Usuario creado para empleado:', user);
                    }
                } else {
                    // Create user directly
                    const pinHash = await Utils.hashPin('1234');
                    user = {
                        id: `user_${employee.id}`,
                        username: employee.name.toLowerCase().replace(/\s+/g, ''),
                        employee_id: employee.id,
                        role: employee.role || 'seller',
                        permissions: employee.role === 'admin' ? ['all'] : ['pos', 'inventory_view'],
                        active: true,
                        pin_hash: pinHash
                    };
                    await DB.put('users', user);
                    console.log('Usuario creado directamente:', user);
                }
            }

            console.log('Validando PIN...');
            // Validate PIN - also allow direct PIN check for demo
            let isValid = false;
            if (user.pin_hash) {
                isValid = await Utils.validatePin(pinValue, user.pin_hash);
                console.log('PIN válido (hash):', isValid);
            } else {
                // Fallback: if no hash, accept 1234 for demo
                isValid = pinValue === '1234';
                console.log('PIN válido (fallback):', isValid);
            }

            if (!isValid) {
                console.error('PIN incorrecto. Hash esperado:', user.pin_hash?.substring(0, 20));
                this.showError('Usuario o contraseña incorrectos');
                return;
            }

                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:260',message:'handleLogin EXITOSO',data:{userId:user.id,username:user.username,employeeId:employee.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
                    console.log('=== LOGIN EXITOSO ===');
                    // Login successful
                    // Asegurar que el usuario tenga permisos según su rol
                    if (typeof PermissionManager !== 'undefined') {
                        user = await PermissionManager.ensureUserPermissions(user);
                    }
                    this.currentUser = user;
                    this.currentEmployee = employee;
            
            // Store in localStorage
            localStorage.setItem('current_user_id', user.id);
            localStorage.setItem('current_employee_id', employee.id);

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
                } catch (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'users.js:469',message:'handleLogin ERROR',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                    // #endregion
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
            const userId = localStorage.getItem('current_user_id');
            if (userId) {
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
                            
                            // Mostrar navegación de admin si aplica
                            if (UI && UI.updateAdminNavigation) {
                                const isAdmin = user.role === 'admin' || user.permissions?.includes('all');
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
