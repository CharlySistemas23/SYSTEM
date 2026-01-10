// Main Application Entry Point

const App = {
    loadingModule: null,
    moduleLoadAbort: null,
    
    // Código de acceso de empresa (configurable)
    COMPANY_ACCESS_CODE: 'OPAL2024', // Cambia este código por el que quieras
    
    async initCompanyCodeAccess() {
        // Verificar si el código ya fue validado (guardado en localStorage)
        const savedCodeHash = localStorage.getItem('company_code_validated');
        const codeInput = document.getElementById('company-code-input');
        const codeBtn = document.getElementById('company-code-btn');
        const codeScreen = document.getElementById('company-code-screen');
        const loginScreen = document.getElementById('login-screen');
        const codeError = document.getElementById('company-code-error');
        
        // Si el código ya fue validado, mostrar directamente el login
        if (savedCodeHash) {
            const expectedHash = await this.hashCode(this.COMPANY_ACCESS_CODE);
            if (savedCodeHash === expectedHash) {
                if (codeScreen) codeScreen.style.display = 'none';
                if (loginScreen) loginScreen.style.display = 'flex';
                return;
            } else {
                // Código guardado es inválido, limpiar
                localStorage.removeItem('company_code_validated');
            }
        }
        
        // Mostrar pantalla de código y ocultar login
        if (codeScreen) codeScreen.style.display = 'flex';
        if (loginScreen) loginScreen.style.display = 'none';
        
        // Handler para el botón de verificar código
        if (codeBtn) {
            codeBtn.addEventListener('click', async () => {
                await this.validateCompanyCode();
            });
        }
        
        // Handler para Enter en el input
        if (codeInput) {
            codeInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    await this.validateCompanyCode();
                }
            });
        }
    },
    
    async validateCompanyCode() {
        const codeInput = document.getElementById('company-code-input');
        const codeScreen = document.getElementById('company-code-screen');
        const loginScreen = document.getElementById('login-screen');
        const codeError = document.getElementById('company-code-error');
        const rememberCheckbox = document.getElementById('remember-company-code');
        
        if (!codeInput) return;
        
        const enteredCode = codeInput.value.trim();
        
        if (!enteredCode) {
            if (codeError) {
                codeError.textContent = 'Por favor, ingresa el código de acceso';
                codeError.style.display = 'block';
            }
            return;
        }
        
        // Validar código
        if (enteredCode === this.COMPANY_ACCESS_CODE) {
            // Código correcto
            if (codeError) codeError.style.display = 'none';
            
            // Guardar validación si el usuario marcó "recordar"
            if (rememberCheckbox && rememberCheckbox.checked) {
                const codeHash = await this.hashCode(enteredCode);
                localStorage.setItem('company_code_validated', codeHash);
            }
            
            // Ocultar pantalla de código y mostrar login
            if (codeScreen) codeScreen.style.display = 'none';
            if (loginScreen) loginScreen.style.display = 'flex';
            
            // Enfocar el input de usuario del login
            setTimeout(() => {
                const userInput = document.getElementById('employee-barcode-input');
                if (userInput) userInput.focus();
            }, 100);
        } else {
            // Código incorrecto
            if (codeError) {
                codeError.textContent = 'Código de acceso incorrecto';
                codeError.style.display = 'block';
            }
            if (codeInput) {
                codeInput.value = '';
                codeInput.focus();
            }
        }
    },
    
    async hashCode(str) {
        // Hash simple para validación (no es criptográficamente seguro, pero suficiente para este caso)
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    async init() {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:4',message:'App.init iniciando',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Protección: Ocultar enlace de bypass en producción
        const isProduction = window.location.hostname.includes('vercel.app') || 
                            window.location.hostname.includes('opal-co.vercel.app') ||
                            (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
        
        if (isProduction) {
            const helpFooter = document.getElementById('login-help-footer');
            if (helpFooter) {
                helpFooter.style.display = 'none';
            }
            // Eliminar bypassLogin de la consola en producción
            setTimeout(() => {
                if (window.bypassLogin) {
                    const originalBypass = window.bypassLogin;
                    window.bypassLogin = function() {
                        console.error('⚠️ Acceso denegado: bypassLogin deshabilitado en producción');
                        if (Utils && Utils.showNotification) {
                            Utils.showNotification('Acceso no autorizado', 'error');
                        }
                    };
                }
            }, 100);
        }
        
        // Inicializar sistema de código de acceso de empresa
        await this.initCompanyCodeAccess();
        
        try {
            // Initialize database
            await DB.init();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:8',message:'DB inicializado en App.init',data:{dbReady:!!DB.db},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log('Database initialized');

            // Initialize UI
            UI.init();
            console.log('UI initialized');

            // Initialize Barcode Manager
            BarcodeManager.init();
            console.log('Barcode manager initialized');

            // Initialize Sync Manager
            await SyncManager.init();
            console.log('Sync manager initialized');

            // Initialize User Manager
            await UserManager.init();
            console.log('User manager initialized');

            // Initialize Branch Manager (gestión multisucursal)
            if (typeof BranchManager !== 'undefined') {
                await BranchManager.init();
                console.log('Branch manager initialized');

                // Validate system configuration for multi-branch
                if (typeof BranchValidator !== 'undefined') {
                    const config = await BranchValidator.validateSystemConfig();
                    if (config.issues && config.issues.length > 0) {
                        console.warn('BranchValidator: Problemas de configuración detectados:', config.issues);
                        // Mostrar notificación solo si hay problemas críticos
                        if (!config.hasBranches || !config.hasActiveBranch) {
                            setTimeout(() => {
                                Utils.showNotification(
                                    '⚠️ Configuración multisucursal incompleta. Ve a Configuración → Catálogos → Gestionar Sucursales',
                                    'warning'
                                );
                            }, 3000);
                        }
                    }
                }
            }
            
            // Initialize Backup Manager (backups automáticos cada 10 minutos)
            if (typeof BackupManager !== 'undefined') {
                await BackupManager.init();
                console.log('Backup manager initialized');
            }

            // Initialize Exchange Rates Manager (actualización automática de tipos de cambio)
            if (typeof ExchangeRates !== 'undefined') {
                await ExchangeRates.init();
                console.log('Exchange rates manager initialized');
            }
            
            // Helper: Create users if they don't exist (for debugging)
            window.createDemoUsers = async function() {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:33',message:'createDemoUsers iniciando',data:{dbReady:!!DB.db},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                console.log('Creating demo users...');
                try {
                    // Ensure branches exist first
                    const branches = await DB.getAll('catalog_branches');
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:37',message:'createDemoUsers branches obtenidos',data:{branchesCount:branches?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    if (branches.length === 0) {
                        await DB.put('catalog_branches', { id: 'branch1', name: 'Tienda 1', address: '', active: true });
                    }

                    // Verificar si los empleados ya existen ANTES de crearlos
                    const existingEmployees = await DB.getAll('employees') || [];
                    const existingUsers = await DB.getAll('users') || [];
                    
                    // Solo crear empleado admin si NO existe
                    let emp1 = existingEmployees.find(e => e.id === 'emp1');
                    if (!emp1) {
                        emp1 = { id: 'emp1', name: 'Admin', role: 'admin', branch_id: 'branch1', active: true, barcode: 'EMP001' };
                        await DB.put('employees', emp1);
                        console.log('Employee Admin created');
                    } else {
                        console.log('Employee Admin already exists, skipping creation');
                        // Actualizar solo si falta información crítica
                        if (!emp1.branch_id || !emp1.active) {
                            emp1.branch_id = emp1.branch_id || 'branch1';
                            emp1.active = emp1.active !== false;
                            await DB.put('employees', emp1);
                        }
                    }
                    
                    // Solo crear empleado vendedor si NO existe
                    let emp2 = existingEmployees.find(e => e.id === 'emp2');
                    if (!emp2) {
                        emp2 = { id: 'emp2', name: 'Vendedor 1', role: 'seller', branch_id: 'branch1', active: true, barcode: 'EMP002' };
                        await DB.put('employees', emp2);
                        console.log('Employee Vendedor created');
                    } else {
                        console.log('Employee Vendedor already exists, skipping creation');
                        // Actualizar solo si falta información crítica
                        if (!emp2.branch_id || !emp2.active) {
                            emp2.branch_id = emp2.branch_id || 'branch1';
                            emp2.active = emp2.active !== false;
                            await DB.put('employees', emp2);
                        }
                    }
                    
                    const pinHash = await Utils.hashPin('1234');
                    console.log('PIN hash generated:', pinHash.substring(0, 20) + '...');
                    
                    // Solo crear usuario admin si NO existe
                    let user1 = existingUsers.find(u => u.id === 'user1' || (u.username === 'admin' && u.employee_id === 'emp1'));
                    if (!user1) {
                        user1 = {
                            id: 'user1',
                            username: 'admin',
                            employee_id: 'emp1',
                            role: 'admin',
                            permissions: ['all'],
                            active: true,
                            pin_hash: pinHash
                        };
                        await DB.put('users', user1);
                        console.log('User admin created');
                    } else {
                        console.log('User admin already exists, skipping creation');
                        // Actualizar solo si falta información crítica
                        if (!user1.employee_id || !user1.active) {
                            user1.employee_id = user1.employee_id || 'emp1';
                            user1.active = user1.active !== false;
                            await DB.put('users', user1);
                        }
                    }
                    
                    // Solo crear usuario vendedor si NO existe
                    let user2 = existingUsers.find(u => u.id === 'user2' || (u.username === 'vendedor1' && u.employee_id === 'emp2'));
                    if (!user2) {
                        user2 = {
                            id: 'user2',
                            username: 'vendedor1',
                            employee_id: 'emp2',
                            role: 'seller',
                            permissions: ['pos', 'inventory_view'],
                            active: true,
                            pin_hash: pinHash
                        };
                        await DB.put('users', user2);
                        console.log('User vendedor created');
                    } else {
                        console.log('User vendedor already exists, skipping creation');
                        // Actualizar solo si falta información crítica
                        if (!user2.employee_id || !user2.active) {
                            user2.employee_id = user2.employee_id || 'emp2';
                            user2.active = user2.active !== false;
                            await DB.put('users', user2);
                        }
                    }
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:73',message:'createDemoUsers EXITOSO',data:{usersCreated:2,employeesCreated:2,existingEmployeesCount:existingEmployees.length,existingUsersCount:existingUsers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.log('Users check completed successfully!');
                    console.log(`Total employees: ${(await DB.getAll('employees') || []).length}`);
                    console.log(`Total users: ${(await DB.getAll('users') || []).length}`);
                    return true;
                } catch (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:77',message:'createDemoUsers ERROR',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error('Error creating demo users:', error);
                    return false;
                }
            };
            
            // Auto-create users if they don't exist
            setTimeout(async () => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:83',message:'Auto-create usuarios timeout ejecutado',data:{dbReady:!!DB.db,createDemoUsersAvailable:typeof window.createDemoUsers==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                try {
                    const users = await DB.getAll('users') || [];
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:86',message:'Auto-create usuarios check',data:{usersCount:Array.isArray(users)?users.length:'NOT_ARRAY',isArray:Array.isArray(users)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    if (!Array.isArray(users) || users.length === 0) {
                        console.warn('No users found, creating demo users...');
                        if (typeof window.createDemoUsers === 'function') {
                            await window.createDemoUsers();
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:90',message:'Auto-create usuarios ejecutado',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            // #endregion
                            console.log('✅ Usuarios demo creados automáticamente');
                        } else {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:92',message:'createDemoUsers NO DISPONIBLE',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                            // #endregion
                            console.error('createDemoUsers no está disponible');
                        }
                    } else {
                        console.log(`✅ ${users.length} usuarios encontrados en la base de datos`);
                    }
                } catch (error) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:98',message:'Auto-create usuarios ERROR',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    console.error('Error creando usuarios demo automáticamente:', error);
                }
            }, 2000);

            // Bypass login function for debugging - DISABLED IN PRODUCTION
            window.bypassLogin = async function() {
                // Verificar si estamos en producción (Vercel)
                const isProduction = window.location.hostname.includes('vercel.app') || 
                                    window.location.hostname.includes('opal-co.vercel.app') ||
                                    window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                
                if (isProduction) {
                    console.error('⚠️ bypassLogin está deshabilitado en producción por seguridad');
                    if (Utils && Utils.showNotification) {
                        Utils.showNotification('Acceso no autorizado. Por favor, inicia sesión correctamente.', 'error');
                    }
                    return;
                }
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:103',message:'bypassLogin llamado',data:{dbReady:!!DB.db},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                console.log('=== BYPASS LOGIN ===');
                try {
                    // Ensure database is ready
                    if (!DB.db) {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:107',message:'bypassLogin DB no listo, esperando',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        console.log('Esperando inicialización de DB...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    // Force create users and employees
                    console.log('Forzando creación de usuarios...');
                    try {
                        await window.createUsersManually();
                    } catch (e) {
                        console.log('createUsersManually falló, intentando createDemoUsers...');
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Ensure users exist - try multiple methods
                    let users = await DB.getAll('users') || [];
                    if (!Array.isArray(users) || users.length === 0) {
                        console.log('Creando usuarios con createDemoUsers...');
                        if (typeof window.createDemoUsers === 'function') {
                            await window.createDemoUsers();
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                        users = await DB.getAll('users') || [];
                    }

                    // If still no users, create them directly
                    if (!Array.isArray(users) || users.length === 0) {
                        console.log('Creando usuarios directamente...');
                        // Create branch
                        await DB.put('catalog_branches', { id: 'branch1', name: 'Tienda 1', address: '', active: true });
                        
                        // Create employee
                        const emp = { id: 'emp1', name: 'Admin', role: 'admin', branch_id: 'branch1', active: true, barcode: 'EMP001' };
                        await DB.put('employees', emp);
                        
                        // Create user
                        const pinHash = await Utils.hashPin('1234');
                        const user = {
                            id: 'user1',
                            username: 'admin',
                            employee_id: 'emp1',
                            role: 'admin',
                            permissions: ['all'],
                            active: true,
                            pin_hash: pinHash
                        };
                        await DB.put('users', user);
                        users = [user];
                        console.log('Usuario creado directamente');
                    }

                    const user = users.find(u => u && u.username === 'admin' && u.active) || users[0];
                    if (!user) {
                        await Utils.alert('Error: No se pudo encontrar usuario. Recarga la página.');
                        return;
                    }

                    let employee = await DB.get('employees', user.employee_id);
                    if (!employee) {
                        // Create employee if missing
                        employee = {
                            id: 'emp1',
                            name: 'Admin',
                            role: 'admin',
                            branch_id: 'branch1',
                            active: true,
                            barcode: 'EMP001'
                        };
                        await DB.put('employees', employee);
                    } else {
                        // Ensure employee is active
                        if (!employee.active) {
                            employee.active = true;
                            await DB.put('employees', employee);
                            console.log('Empleado activado:', employee.name);
                        }
                    }

                    UserManager.currentUser = user;
                    UserManager.currentEmployee = employee;
                    localStorage.setItem('current_user_id', user.id);
                    localStorage.setItem('current_employee_id', employee.id);

                    // Ensure branch exists
                    if (employee.branch_id) {
                        let branch = await DB.get('catalog_branches', employee.branch_id);
                        if (!branch) {
                            branch = { id: 'branch1', name: 'Tienda 1', address: '', active: true };
                            await DB.put('catalog_branches', branch);
                        }
                        localStorage.setItem('current_branch_id', branch.id);
                    }

                    // Update UI
                    if (UI) {
                        if (UI.updateUserInfo) UI.updateUserInfo(employee);
                        if (employee.branch_id && UI.updateBranchInfo) {
                            const branch = await DB.get('catalog_branches', employee.branch_id);
                            if (branch) UI.updateBranchInfo(branch);
                        }
                    }

                    // Hide login screen
                    const loginScreen = document.getElementById('login-screen');
                    if (loginScreen) {
                        loginScreen.style.display = 'none';
                    }

                    // Show dashboard
                    document.querySelectorAll('.module').forEach(mod => {
                        mod.style.display = 'none';
                    });
                    
                    const dashboard = document.getElementById('module-dashboard');
                    if (dashboard) {
                        dashboard.style.display = 'block';
                    }

                    // Update nav
                    document.querySelectorAll('.nav-item').forEach(item => {
                        item.classList.remove('active');
                        if (item.dataset.module === 'dashboard') {
                            item.classList.add('active');
                        }
                    });

                    if (UI && UI.showModule) {
                        UI.showModule('dashboard');
                    }

                    // Mostrar navegación de admin (bypassLogin siempre es admin)
                    if (UI && UI.updateAdminNavigation) {
                        UI.updateAdminNavigation(true);
                    }

                    console.log('✅ Bypass login exitoso');
                    if (Utils && Utils.showNotification) {
                        Utils.showNotification('Acceso directo exitoso', 'success');
                    }
                } catch (error) {
                    console.error('Error en bypassLogin:', error);
                    await Utils.alert('Error en acceso directo: ' + error.message + '\nAbre la consola (F12) para más detalles.');
                }
            };
            
            // Make bypassLogin available immediately
            console.log('✅ bypassLogin disponible en window.bypassLogin');

            // Helper to create users manually
            window.createUsersManually = async function() {
                try {
                    console.log('Creando usuarios manualmente...');
                    // Create branch
                    await DB.put('catalog_branches', { id: 'branch1', name: 'Tienda 1', address: '', active: true });
                    console.log('Branch creado');
                    
                    // Create employee - ensure active
                    const emp = { id: 'emp1', name: 'Admin', role: 'admin', branch_id: 'branch1', active: true, barcode: 'EMP001' };
                    await DB.put('employees', emp);
                    console.log('Employee creado:', emp);
                    
                    // Create user - ensure active
                    const pinHash = await Utils.hashPin('1234');
                    const usr = {
                        id: 'user1',
                        username: 'admin',
                        employee_id: 'emp1',
                        role: 'admin',
                        permissions: ['all'],
                        active: true,
                        pin_hash: pinHash
                    };
                    await DB.put('users', usr);
                    console.log('User creado:', usr);
                    
                    console.log('Usuarios creados manualmente exitosamente');
                    return true;
                } catch (e) {
                    console.error('Error creando usuarios manualmente:', e);
                    return false;
                }
            };

            // Setup module load handlers
            window.addEventListener('module-loaded', (e) => {
                this.loadModule(e.detail.module);
            });

            // Setup sync button
            document.getElementById('sync-now-btn')?.addEventListener('click', () => {
                SyncManager.syncNow();
            });

            // Setup logout
            document.getElementById('logout-btn')?.addEventListener('click', () => {
                UserManager.logout();
            });

            // Load demo data if needed (DESACTIVADO - usar Settings > Limpiar Datos Mock para limpiar)
            // await this.loadDemoData();
            
            // SIEMPRE cargar datos básicos del sistema (vendedores, guías, reglas de llegadas, costos)
            await this.loadSystemData();
            
            // Inicializar ProfitCalculator para escuchar eventos
            if (typeof ProfitCalculator !== 'undefined' && ProfitCalculator.init) {
                ProfitCalculator.init();
            }
            
            // Generar nómina semanal automáticamente si es necesario
            if (typeof Costs !== 'undefined' && Costs.generateAllWeeklyPayrolls) {
                // Ejecutar en background sin bloquear la inicialización
                setTimeout(async () => {
                    try {
                        await Costs.generateAllWeeklyPayrolls();
                    } catch (error) {
                        console.error('Error generando nómina automática:', error);
                    }
                }, 2000);
            }
            
            // Verificar y corregir códigos de barras faltantes o inconsistentes
            await this.verifyAndFixBarcodes();

            console.log('Application initialized');
            
            // Restaurar módulo guardado si el usuario está autenticado
            if (UserManager.currentUser) {
                const savedModule = localStorage.getItem('current_module');
                if (savedModule && UI && UI.showModule) {
                    // Esperar un momento para que todo esté listo
                    setTimeout(async () => {
                        await this.loadModule(savedModule);
                    }, 100);
                }
            }
        } catch (e) {
            console.error('Error initializing app:', e);
            Utils.showNotification('Error al inicializar la aplicación', 'error');
        }
    },

    async loadModule(moduleName) {
        // Cancelar carga anterior si existe
        if (this.loadingModule && this.loadingModule !== moduleName) {
            console.log(`Cancelando carga anterior de módulo: ${this.loadingModule}`);
            this.loadingModule = null;
            if (this.moduleLoadAbort) {
                this.moduleLoadAbort.aborted = true;
                this.moduleLoadAbort = null;
            }
        }
        
        // Si ya se está cargando este módulo, esperar a que termine
        if (this.loadingModule === moduleName) {
            console.log(`Módulo ${moduleName} ya se está cargando, esperando...`);
            return;
        }
        
        this.loadingModule = moduleName;
        const abortController = { aborted: false };
        this.moduleLoadAbort = abortController;
        
        try {
            console.log(`Loading module: ${moduleName}`);
            
            // Verificar si fue cancelado antes de continuar
            if (abortController.aborted) {
                console.log(`Carga de ${moduleName} cancelada antes de iniciar`);
                return;
            }
            
            switch (moduleName) {
                case 'dashboard':
                    if (abortController.aborted) return;
                    if (typeof Dashboard !== 'undefined') {
                        if (!Dashboard.initialized) {
                            await Dashboard.init();
                        } else {
                            if (abortController.aborted) return;
                            await Dashboard.loadDashboard();
                        }
                    } else {
                        if (abortController.aborted) return;
                        await this.loadDashboard();
                    }
                    break;
                case 'pos':
                    if (abortController.aborted) return;
                    if (typeof POS !== 'undefined') {
                        if (!POS.initialized) {
                            await POS.init();
                        } else {
                            if (abortController.aborted) return;
                            // Si ya está inicializado, recargar productos
                            await POS.loadProducts();
                        }
                    }
                    break;
                case 'inventory':
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:458',message:'Loading inventory module',data:{inventoryDefined:typeof Inventory!=='undefined',initialized:typeof Inventory!=='undefined'?Inventory.initialized:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                    // #endregion
                    if (abortController.aborted) return;
                    if (typeof Inventory !== 'undefined') {
                        if (!Inventory.initialized) {
                            await Inventory.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            if (content && (content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#inventory-list'))) {
                                // Asegurar que el UI esté creado
                                if (typeof Inventory.setupUI === 'function') {
                                    await Inventory.setupUI();
                                }
                                await Inventory.setupEventListeners();
                            }
                            if (abortController.aborted) return;
                            // Siempre recargar los datos cuando se navega al módulo
                            if (typeof Inventory.loadInventory === 'function') {
                                await Inventory.loadInventory();
                            }
                        }
                    }
                    break;
                case 'tourist-report':
                    if (abortController.aborted) return;
                    if (typeof TouristReport !== 'undefined') {
                        if (!TouristReport.initialized) {
                            await TouristReport.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            if (!content || content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '') {
                                TouristReport.setupUI();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                            }
                            if (abortController.aborted) return;
                            if (typeof TouristReport.displayReport === 'function') {
                                await TouristReport.displayReport();
                            }
                        }
                    }
                    break;
                case 'transfers':
                    if (abortController.aborted) return;
                    if (typeof Transfers !== 'undefined') {
                        if (!Transfers.initialized) {
                            await Transfers.init();
                        } else {
                            if (abortController.aborted) return;
                            await Transfers.loadTransfers();
                        }
                    }
                    break;
                case 'barcodes':
                    if (abortController.aborted) return;
                    if (typeof BarcodesModule !== 'undefined') {
                        if (!BarcodesModule.initialized) {
                            await BarcodesModule.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('barcodes-content');
                            if (content && (content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#barcodes-list'))) {
                                if (typeof BarcodesModule.setupEventListeners === 'function') {
                                    BarcodesModule.setupEventListeners();
                                } else if (typeof BarcodesModule.setupUI === 'function') {
                                    BarcodesModule.setupUI();
                                } else {
                                    console.error('BarcodesModule.setupEventListeners no existe, usando setupUI');
                                    BarcodesModule.setupUI();
                                }
                            }
                            if (abortController.aborted) return;
                            // Recargar la pestaña activa si el módulo ya está inicializado
                            const activeTab = document.querySelector('#barcodes-tabs .tab-btn.active')?.dataset.tab || 'overview';
                            if (typeof BarcodesModule.loadTab === 'function') {
                                await BarcodesModule.loadTab(activeTab);
                            } else if (typeof BarcodesModule.loadBarcodes === 'function') {
                                await BarcodesModule.loadBarcodes();
                            }
                        }
                    }
                    break;
                case 'repairs':
                    if (abortController.aborted) return;
                    if (typeof Repairs !== 'undefined') {
                        if (!Repairs.initialized) {
                            await Repairs.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            if (!content || content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#repairs-list')) {
                                Repairs.setupUI();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                            }
                            if (abortController.aborted) return;
                            // Siempre recargar los datos cuando se navega al módulo
                            if (typeof Repairs.loadRepairs === 'function') {
                                await Repairs.loadRepairs();
                            }
                        }
                    }
                    break;
                case 'reports':
                    if (abortController.aborted) return;
                    if (typeof Reports !== 'undefined') {
                        if (!Reports.initialized) {
                            await Reports.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            const reportsTabs = content?.querySelector('#reports-tabs');
                            const reportsContent = content?.querySelector('#reports-content');
                            
                            // Si no hay tabs o contenido, o el contenido está vacío/blanco, reconfigurar
                            if (!content || !reportsTabs || !reportsContent || 
                                content.innerHTML.includes('Cargando módulo') || 
                                content.innerHTML.trim() === '' ||
                                reportsContent.innerHTML.trim() === '' ||
                                reportsContent.innerHTML.includes('Cargando') ||
                                reportsContent.innerHTML.includes('Cargando...')) {
                                Reports.setupUI();
                                if (abortController.aborted) return;
                                await Utils.delay(100);
                                if (abortController.aborted) return;
                                await Reports.loadCatalogs();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                                if (abortController.aborted) return;
                                const activeTab = document.querySelector('#reports-tabs .tab-btn.active')?.dataset.tab || 'reports';
                                await Reports.loadTab(activeTab);
                            } else {
                                if (abortController.aborted) return;
                                // Recargar la pestaña activa para asegurar que los datos estén actualizados
                                const activeTab = document.querySelector('#reports-tabs .tab-btn.active')?.dataset.tab || 'reports';
                                await Reports.loadTab(activeTab);
                            }
                        }
                    }
                    break;
                case 'costs':
                    if (abortController.aborted) return;
                    if (typeof Costs !== 'undefined') {
                        if (!Costs.initialized) {
                            await Costs.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            if (!content || content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#costs-tabs')) {
                                Costs.setupUI();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                            }
                            if (abortController.aborted) return;
                            const activeTab = document.querySelector('#costs-tabs .tab-btn.active')?.dataset.tab || 'costs';
                            await Costs.loadTab(activeTab);
                        }
                    }
                    break;
                case 'customers':
                    if (abortController.aborted) return;
                    if (typeof Customers !== 'undefined') {
                        if (!Customers.initialized) {
                            await Customers.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            if (content && (content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#customers-list'))) {
                                Customers.setupEventListeners();
                            }
                            if (abortController.aborted) return;
                            // Siempre recargar los datos cuando se navega al módulo
                            if (typeof Customers.loadCustomers === 'function') {
                                await Customers.loadCustomers();
                            }
                        }
                    }
                    break;
                case 'employees':
                    if (abortController.aborted) return;
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:508',message:'Loading employees module',data:{employeesDefined:typeof Employees!=='undefined',initialized:typeof Employees!=='undefined'?Employees.initialized:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    if (typeof Employees !== 'undefined') {
                        if (!Employees.initialized) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:511',message:'Calling Employees.init()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            // #endregion
                            await Employees.init();
                            if (abortController.aborted) return;
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:513',message:'Employees.init() completed',data:{initialized:Employees.initialized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            // #endregion
                        } else {
                            if (abortController.aborted) return;
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:515',message:'Employees already initialized, checking UI',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                            // #endregion
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:525',message:'Checking module-content for reconfig',data:{contentExists:!!content,innerHTMLLength:content?.innerHTML.length||0,innerHTMLPreview:content?.innerHTML.substring(0,100)||'N/A',hasEmployeesTabs:content?.querySelector('#employees-tabs')!==null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                            // #endregion
                            // Siempre reconfigurar si no tiene el elemento #employees-tabs
                            if (!content || !content.querySelector('#employees-tabs')) {
                                if (abortController.aborted) return;
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:530',message:'Reconfiguring UI via setupUI() - tabs missing',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                // #endregion
                                Employees.setupUI();
                            }
                            if (abortController.aborted) return;
                            // Siempre recargar los datos cuando se navega al módulo
                            if (typeof Employees.loadEmployees === 'function') {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:524',message:'Reloading employees data',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                // #endregion
                                await Employees.loadEmployees();
                            }
                        }
                    } else {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:529',message:'Employees module not defined',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                    }
                    break;
                case 'settings':
                    if (abortController.aborted) return;
                    if (typeof Settings !== 'undefined') {
                        if (!Settings.initialized) {
                            await Settings.init();
                        } else {
                            if (abortController.aborted) return;
                            // Settings necesita reconfigurar UI si el contenido está vacío o dice "Cargando módulo"
                            const content = document.getElementById('module-content');
                            if (!content || content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#settings-tabs')) {
                                Settings.setupUI();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                            }
                            if (abortController.aborted) return;
                            if (typeof Settings.loadSettings === 'function') {
                                await Settings.loadSettings();
                            }
                        }
                    }
                    break;
                case 'sync':
                    if (abortController.aborted) return;
                    if (typeof SyncUI !== 'undefined') {
                        if (!SyncUI.initialized) {
                            await SyncUI.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('sync-content');
                            if (!content || content.innerHTML.includes('Cargando módulo') || content.innerHTML.trim() === '' || !content.querySelector('#sync-tabs')) {
                                SyncUI.setupUI();
                                // Esperar un momento para que el DOM se actualice
                                await Utils.delay(100);
                            }
                            if (abortController.aborted) return;
                            // Recargar la pestaña activa si ya está inicializado
                            const activeTab = document.querySelector('#sync-tabs .tab-btn.active')?.dataset.tab || 'overview';
                            await SyncUI.loadTab(activeTab);
                        }
                    }
                    break;
                case 'cash':
                    if (abortController.aborted) return;
                    if (typeof Cash !== 'undefined') {
                        if (!Cash.initialized) {
                            await Cash.init();
                        } else {
                            if (abortController.aborted) return;
                            // Verificar si el contenido necesita ser reconfigurado
                            const content = document.getElementById('module-content');
                            const cashStatusCard = content?.querySelector('#cash-status-card');
                            const cashStatusText = content?.querySelector('#cash-status-text');
                            
                            // Si no hay elementos clave o el contenido está vacío/blanco, reconfigurar
                            if (!content || !cashStatusCard || !cashStatusText || 
                                content.innerHTML.includes('Cargando módulo') || 
                                content.innerHTML.trim() === '' ||
                                content.innerHTML.includes('Cargando') ||
                                !content.querySelector('.cash-container')) {
                                Cash.setupUI();
                                if (abortController.aborted) return;
                                await Utils.delay(150);
                                if (abortController.aborted) return;
                                Cash.setupEventListeners();
                            }
                            
                            // Siempre recargar la sesión actual para asegurar datos actualizados
                            if (abortController.aborted) return;
                            // Esperar un momento adicional para asegurar que el DOM esté listo
                            await Utils.delay(50);
                            await Cash.loadCurrentSession();
                        }
                    }
                    break;
                case 'qa':
                    // Solo permitir a administradores
                    if (typeof QA !== 'undefined') {
                        if (UserManager?.currentUser?.role === 'admin' || UserManager?.currentUser?.permissions?.includes('all')) {
                            if (!QA.initialized) {
                                await QA.init();
                            } else {
                                QA.setupUI();
                                QA.loadHistory();
                            }
                        } else {
                            console.warn('Acceso denegado al módulo QA: solo administradores');
                            Utils.showNotification('Acceso denegado: solo administradores', 'error');
                            UI.showModule('dashboard');
                        }
                    }
                    break;
                default:
                    console.warn(`Unknown module: ${moduleName}`);
            }
            
            // Verificar si fue cancelado antes de marcar como completado
            if (abortController.aborted) {
                console.log(`Carga de ${moduleName} cancelada antes de completar`);
                return;
            }
            
            console.log(`Module ${moduleName} loaded successfully`);
        } catch (e) {
            // Solo mostrar error si no fue cancelado
            if (!abortController.aborted && this.loadingModule === moduleName) {
                console.error(`Error loading module ${moduleName}:`, e);
                Utils.showNotification(`Error al cargar módulo ${moduleName}: ${e.message}`, 'error');
            }
        } finally {
            // Solo limpiar si aún estamos en el mismo módulo
            if (this.loadingModule === moduleName) {
                this.loadingModule = null;
                this.moduleLoadAbort = null;
            }
        }
    },

    async loadDashboard() {
        try {
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const yesterday = Utils.formatDate(new Date(Date.now() - 86400000), 'YYYY-MM-DD');
            const sales = await DB.getAll('sales') || [];
            const todaySales = sales.filter(s => s.created_at?.startsWith(today) && s.status === 'completada');
            const yesterdaySales = sales.filter(s => s.created_at?.startsWith(yesterday) && s.status === 'completada');

            // KPIs
            const totalSales = todaySales.reduce((sum, s) => sum + s.total, 0);
            const yesterdayTotal = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
            const tickets = todaySales.length;
            const passengers = todaySales.reduce((sum, s) => sum + (s.passengers || 1), 0);
            // Ticket promedio = Venta Total / Número de Pasajeros / Tipo de Cambio
            const exchangeRateUsd = parseFloat((await DB.get('settings', 'exchange_rate_usd'))?.value || '20.00');
            const avgTicket = passengers > 0 ? totalSales / passengers / exchangeRateUsd : 0;
            // % de Cierre = (Número de Ventas Totales / Número de Pasajeros) * 100
            const closeRate = passengers > 0 ? (tickets / passengers) * 100 : 0;
            const salesChange = yesterdayTotal > 0 ? ((totalSales - yesterdayTotal) / yesterdayTotal * 100).toFixed(1) : 0;

            document.getElementById('kpi-sales-today').textContent = Utils.formatCurrency(totalSales);
            document.getElementById('kpi-tickets').textContent = tickets;
            document.getElementById('kpi-avg-ticket').textContent = Utils.formatCurrency(avgTicket);
            document.getElementById('kpi-close-rate').textContent = `${closeRate.toFixed(1)}%`;

            // Sales chart data (last 7 days)
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(Date.now() - i * 86400000);
                const dateStr = Utils.formatDate(date, 'YYYY-MM-DD');
                const daySales = sales.filter(s => s.created_at?.startsWith(dateStr) && s.status === 'completada');
                const dayTotal = daySales.reduce((sum, s) => sum + s.total, 0);
                last7Days.push({
                    date: Utils.formatDate(date, 'DD/MM'),
                    total: dayTotal
                });
            }

            // Top products
            const productCounts = {};
            const saleItems = await DB.getAll('sale_items') || [];
            for (const sale of todaySales) {
                const items = saleItems.filter(si => si.sale_id === sale.id);
                for (const item of items) {
                    const invItem = await DB.get('inventory_items', item.item_id);
                    if (invItem) {
                        const key = invItem.name || invItem.sku;
                        productCounts[key] = (productCounts[key] || 0) + item.quantity;
                    }
                }
            }

            const topProducts = Object.entries(productCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // Top sellers
            const sellerCounts = {};
            todaySales.forEach(sale => {
                if (sale.seller_id) {
                    sellerCounts[sale.seller_id] = (sellerCounts[sale.seller_id] || 0) + sale.total;
                }
            });

            const topSellers = Object.entries(sellerCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const sellersList = document.getElementById('top-sellers-list');
            if (sellersList) {
                const sellers = await DB.getAll('catalog_sellers') || [];
                sellersList.innerHTML = `
                    <h3 style="margin-bottom: 15px;">Top Vendedores</h3>
                    ${topSellers.length === 0 ? '<p style="text-align: center; color: #999;">No hay ventas hoy</p>' : topSellers.map(([id, total]) => {
                        const seller = sellers.find(s => s.id === id);
                        const percentage = totalSales > 0 ? (total / totalSales * 100).toFixed(1) : 0;
                        return `<div style="padding: 12px; margin-bottom: 8px; background: var(--color-bg-secondary); border-radius: var(--radius-md); border-left: 4px solid var(--color-primary);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${seller?.name || id}</strong>
                                    <div style="font-size: 12px; color: var(--color-text-secondary);">${percentage}% del total</div>
                                </div>
                                <div style="font-size: 18px; font-weight: 600;">${Utils.formatCurrency(total)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                `;
            }

            // Add charts section
            const dashboardModule = document.getElementById('module-dashboard');
            if (dashboardModule) {
                let chartsSection = dashboardModule.querySelector('#dashboard-charts');
                if (!chartsSection) {
                    chartsSection = document.createElement('div');
                    chartsSection.id = 'dashboard-charts';
                    chartsSection.className = 'dashboard-section';
                    const topSellersDiv = dashboardModule.querySelector('#top-sellers-list').parentElement;
                    topSellersDiv.insertBefore(chartsSection, topSellersDiv.firstChild);
                }

                const maxSales = Math.max(...last7Days.map(d => d.total), 1);
                chartsSection.innerHTML = `
                    <h3>Ventas Últimos 7 Días</h3>
                    <div style="display: flex; align-items: flex-end; gap: 8px; height: 200px; margin: 20px 0; padding: 20px; background: var(--color-bg-secondary); border-radius: var(--radius-md);">
                        ${last7Days.map(day => {
                            const height = maxSales > 0 ? (day.total / maxSales * 100) : 0;
                            return `
                                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                                    <div style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                                        <div style="width: 100%; background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-accent) 100%); border-radius: var(--radius-sm) var(--radius-sm) 0 0; height: ${height}%; min-height: ${day.total > 0 ? '4px' : '0'}; transition: all 0.3s;"></div>
                                    </div>
                                    <div style="font-size: 11px; color: var(--color-text-secondary); text-align: center;">
                                        <div>${day.date}</div>
                                        <div style="font-weight: 600; color: var(--color-text); margin-top: 4px;">${Utils.formatCurrency(day.total)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${yesterdayTotal > 0 ? `
                        <div style="padding: 12px; background: ${salesChange >= 0 ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)'}; border-radius: var(--radius-md); border-left: 4px solid ${salesChange >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}; margin-bottom: 20px;">
                            <strong>Comparativa con Ayer:</strong> ${salesChange >= 0 ? '+' : ''}${salesChange}% 
                            <small style="color: var(--color-text-secondary);">(${Utils.formatCurrency(Math.abs(totalSales - yesterdayTotal))})</small>
                        </div>
                    ` : ''}
                    ${topProducts.length > 0 ? `
                        <h3 style="margin-top: 30px;">Top Productos Hoy</h3>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 15px;">
                            ${topProducts.map(([name, qty]) => `
                                <div style="padding: 10px; background: var(--color-bg-secondary); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                                    <span><strong>${name}</strong></span>
                                    <span style="font-size: 18px; font-weight: 600; color: var(--color-primary);">${qty} unidades</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                `;
            }

            // Alerts
            const items = await DB.getAll('inventory_items') || [];
            const itemsWithoutPhoto = [];
            for (const item of items) {
                const photos = await DB.query('inventory_photos', 'item_id', item.id);
                if (photos.length === 0) {
                    itemsWithoutPhoto.push(item);
                }
            }

            const alertsList = document.getElementById('alerts-list');
            if (alertsList) {
                const alerts = [];
                if (itemsWithoutPhoto.length > 0) {
                    alerts.push(`${itemsWithoutPhoto.length} piezas sin foto`);
                }
                
                const pendingSync = await DB.count('sync_queue', 'status', 'pending');
                if (pendingSync > 0) {
                    alerts.push(`${pendingSync} elementos pendientes de sincronizar`);
                }

                const lowStockItems = items.filter(item => item.status === 'disponible' && item.price > 0).length;
                if (lowStockItems < 10) {
                    alerts.push(`Solo ${lowStockItems} piezas disponibles`);
                }

                alertsList.innerHTML = alerts.length === 0 
                    ? '<p style="text-align: center; color: var(--color-success); padding: 20px;"><i class="fas fa-check-circle"></i> Todo en orden</p>'
                    : alerts.map(alert => `<div class="alert-item"><i class="fas fa-exclamation-triangle"></i> ${alert}</div>`).join('');
            }
        } catch (e) {
            console.error('Error loading dashboard:', e);
        }
    },

    async loadSystemData() {
        // Función para cargar SIEMPRE los datos básicos del sistema (vendedores, guías, reglas, costos)
        try {
            console.log('🔄 Cargando datos básicos del sistema...');
            
            // Asegurar que DB esté inicializado
            if (!DB.db) {
                console.log('Esperando inicialización de DB...');
                await DB.init();
            }
            
            // Load catalogs (vendedores, guías, agencias, sucursales, comisiones)
            await this.loadCatalogs();
            
            // Precargar reglas de llegadas (arrival_rate_rules) si está vacío
            await this.loadArrivalRateRules();
            
            // Precargar nómina semanal
            await this.loadWeeklyPayroll();
            
            // Precargar costos fijos y variables iniciales
            await this.loadInitialCosts();
            
            console.log('✅ Datos básicos del sistema cargados');
        } catch (e) {
            console.error('Error loading system data:', e);
            // Reintentar después de un segundo (máximo 3 intentos)
            if (!this.systemDataRetries) this.systemDataRetries = 0;
            if (this.systemDataRetries < 3) {
                this.systemDataRetries++;
                setTimeout(() => this.loadSystemData(), 1000);
            } else {
                console.error('❌ Error crítico: No se pudieron cargar los datos del sistema después de 3 intentos');
                Utils.showNotification('Error al cargar datos del sistema. Por favor recarga la página.', 'error');
            }
        }
    },

    async loadDemoData() {
        // Asegurar que se carguen productos demo
        await this.loadDemoInventory();
        // Always ensure demo data is loaded (in case of issues)
        try {
            // Load catalogs
            await this.loadCatalogs();
            
            // Load employees and users
            await this.loadEmployees();
            
            // Mark as loaded
            await DB.put('settings', {
                key: 'demo_data_loaded',
                value: 'true',
                updated_at: new Date().toISOString()
            });

            console.log('Demo data loaded/verified');
            
            // Verify users exist
            const users = await DB.getAll('users') || [];
            const employees = await DB.getAll('employees') || [];
            console.log(`Users loaded: ${Array.isArray(users) ? users.length : 'ERROR'}, Employees loaded: ${Array.isArray(employees) ? employees.length : 'ERROR'}`);
            
            if (users.length === 0 || employees.length === 0) {
                console.warn('No users or employees found, recreating...');
                await this.loadEmployees();
            }
        } catch (e) {
            console.error('Error loading demo data:', e);
            // Try again
            setTimeout(() => this.loadDemoData(), 1000);
        }
    },

    async loadCatalogs() {
        // Agencies
        const agencies = [
            { id: 'ag1', name: 'TRAVELEX', active: true },
            { id: 'ag2', name: 'VERANOS', active: true },
            { id: 'ag3', name: 'TANITOURS', active: true },
            { id: 'ag4', name: 'DISCOVERY', active: true },
            { id: 'ag5', name: 'TB', active: true },
            { id: 'ag6', name: 'TTF', active: true }
        ];

        for (const agency of agencies) {
            try {
                const existing = await DB.get('catalog_agencies', agency.id);
                if (existing) {
                    // Si existe pero no tiene código de barras, generarlo
                    if (!existing.barcode || Utils.isBarcodeEmpty(existing.barcode)) {
                        existing.barcode = Utils.generateAgencyBarcode(existing);
                        await DB.put('catalog_agencies', existing);
                    }
                } else {
                    // Nuevo registro: generar código de barras
                    agency.barcode = Utils.generateAgencyBarcode(agency);
                    await DB.put('catalog_agencies', agency);
                }
            } catch (e) {
                // Already exists
            }
        }

        // Sellers
        const sellers = [
            'SEBASTIAN', 'CALI', 'SAULA', 'ANDRES', 'ANGEL', 'SR ANGEL', 'RAMSES', 'ISAURA',
            'CARLOS', 'PACO', 'FRANCISCO', 'OMAR', 'PANDA', 'KARLA', 'JUAN CARLOS', 'NADIA',
            'JASON', 'ROBERTO', 'PEDRO', 'ANA', 'JOVA', 'EDITH', 'VERO', 'POCHIS',
            'RAMON', 'ALDAIR', 'CLAUDIA', 'SERGIO', 'MANUEL'
        ].map((name, idx) => ({
            id: `seller_${idx + 1}`,
            name: name,
            active: true,
            commission_rule: this.getSellerCommissionRule(name)
        }));

        for (const seller of sellers) {
            try {
                const existing = await DB.get('catalog_sellers', seller.id);
                if (existing) {
                    // Si existe pero no tiene código de barras, generarlo
                    if (!existing.barcode || Utils.isBarcodeEmpty(existing.barcode)) {
                        existing.barcode = Utils.generateSellerBarcode(existing);
                        await DB.put('catalog_sellers', existing);
                    }
                } else {
                    // Nuevo registro: generar código de barras
                    seller.barcode = Utils.generateSellerBarcode(seller);
                    await DB.put('catalog_sellers', seller);
                }
            } catch (e) {
                // Already exists
            }
        }

        // Guides (by agency)
        const guidesData = {
            'ag2': ['CARLOS SIS', 'MARIO RENDON', 'CHAVA', 'FREDY', 'NETO', 'EMMANUEL'],
            'ag3': ['MARINA', 'GLORIA', 'DANIELA'],
            'ag4': ['RAMON', 'GUSTAVO SIS', 'GUSTAVO LEPE', 'NOVOA', 'ERIK', 'CHILO', 'FERMIN', 'EMMA', 'HERASMO'],
            'ag1': ['MIGUEL SUAREZ', 'SANTA', 'MIGUEL DELGADILLO', 'ANDRES CHAVEZ', 'SAREM', 'ZAVALA', 'TEMO', 'ROCIO', 'NETO', 'SEBASTIAN S'],
            'ag5': ['MIGUEL IBARRA', 'ADAN', 'MIGUEL RAGA', 'GABINO', 'HECTOR SUAREZ', 'OSCAR', 'JOSE AVILES'],
            'ag6': ['HUGO', 'HILBERTO', 'JOSE MASIAS', 'DAVID BUSTOS', 'ALFONSO', 'DANIEL RIVERA', 'EDUARDO LEAL']
        };

        let guideIdx = 1;
        for (const [agencyId, guideNames] of Object.entries(guidesData)) {
            for (const name of guideNames) {
                try {
                    const guideId = `guide_${guideIdx++}`;
                    const guideData = {
                        id: guideId,
                        name: name,
                        agency_id: agencyId,
                        active: true,
                        commission_rule: name === 'MARINA' ? 'guide_marina' : 'guide_default'
                    };
                    const existing = await DB.get('catalog_guides', guideId);
                    if (existing) {
                        // Si existe pero no tiene código de barras, generarlo
                        if (!existing.barcode || Utils.isBarcodeEmpty(existing.barcode)) {
                            existing.barcode = Utils.generateGuideBarcode(existing);
                            await DB.put('catalog_guides', existing);
                        }
                    } else {
                        // Nuevo registro: generar código de barras
                        guideData.barcode = Utils.generateGuideBarcode(guideData);
                        await DB.put('catalog_guides', guideData);
                    }
                } catch (e) {
                    // Already exists
                }
            }
        }

        // Branches (con nombres correctos)
        const branches = [
            { id: 'branch1', name: 'L Vallarta', address: '', active: true },
            { id: 'branch2', name: 'Malecón', address: '', active: true },
            { id: 'branch3', name: 'San Sebastián', address: '', active: true },
            { id: 'branch4', name: 'Sayulita', address: '', active: true }
        ];

        for (const branch of branches) {
            try {
                await DB.put('catalog_branches', branch);
            } catch (e) {
                // Already exists
            }
        }

        // Payment Methods
        const paymentMethods = [
            { id: 'pm1', name: 'Efectivo USD', code: 'CASH_USD', active: true },
            { id: 'pm2', name: 'Efectivo MXN', code: 'CASH_MXN', active: true },
            { id: 'pm3', name: 'Efectivo EUR', code: 'CASH_EUR', active: true },
            { id: 'pm4', name: 'Efectivo CAD', code: 'CASH_CAD', active: true },
            { id: 'pm5', name: 'TPV Visa/MC', code: 'TPV_VISA', active: true },
            { id: 'pm6', name: 'TPV Amex', code: 'TPV_AMEX', active: true }
        ];

        for (const pm of paymentMethods) {
            try {
                await DB.put('payment_methods', pm);
            } catch (e) {
                // Already exists
            }
        }

        // Commission Rules (con entity_id específico)
        const allSellers = await DB.getAll('catalog_sellers') || [];
        const sebastianSeller = allSellers.find(s => s.name === 'SEBASTIAN');
        const omarSeller = allSellers.find(s => s.name === 'OMAR');
        const jcSeller = allSellers.find(s => s.name === 'JUAN CARLOS');
        const marinaGuide = (await DB.getAll('catalog_guides') || []).find(g => g.name === 'MARINA');

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
            entity_id: null, // null = default para todos los que no tengan regla específica
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
                if (existing) {
                    // Actualizar si cambió
                    await DB.put('commission_rules', rule);
                } else {
                    await DB.put('commission_rules', rule);
                }
            } catch (e) {
                console.error('Error creating commission rule:', e);
            }
        }

        // Precargar reglas de llegadas (arrival_rate_rules) si está vacío
        await this.loadArrivalRateRules();
        
        // Precargar nómina semanal
        await this.loadWeeklyPayroll();
        
        // Precargar costos fijos y variables iniciales
        await this.loadInitialCosts();
    },

    async loadArrivalRateRules() {
        try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:991',message:'loadArrivalRateRules START',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            const existingRules = await DB.getAll('arrival_rate_rules') || [];
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:995',message:'existingRules count',data:{count:existingRules.length,rules:existingRules.map(r=>({id:r.id,agency:r.agency_id,min:r.min_passengers,max:r.max_passengers}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            // Solo precargar si no hay reglas o si hay menos de 10 (puede estar incompleto)
            if (existingRules.length >= 10) {
                console.log(`Arrival rate rules ya existen (${existingRules.length}), omitiendo precarga`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:998',message:'Skipping precarga - enough rules',data:{count:existingRules.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            // Si hay reglas existentes pero pocas, limpiarlas primero para recargar
            if (existingRules.length > 0 && existingRules.length < 10) {
                console.log('Reglas incompletas detectadas, recargando...');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1005',message:'Clearing incomplete rules',data:{count:existingRules.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                for (const rule of existingRules) {
                    try {
                        await DB.delete('arrival_rate_rules', rule.id);
                    } catch (e) {
                        // Ignorar errores
                    }
                }
            }

            const agencies = await DB.getAll('catalog_agencies') || [];
            const branches = await DB.getAll('catalog_branches') || [];
            
            const tanitoursAgency = agencies.find(a => a.name.toUpperCase() === 'TANITOURS');
            const travelexAgency = agencies.find(a => a.name.toUpperCase() === 'TRAVELEX');
            const discoveryAgency = agencies.find(a => a.name.toUpperCase() === 'DISCOVERY');
            const veranosAgency = agencies.find(a => a.name.toUpperCase() === 'VERANOS');
            const tbAgency = agencies.find(a => a.name.toUpperCase() === 'TB');
            const ttfAgency = agencies.find(a => a.name.toUpperCase() === 'TTF');
            
            const branch1 = branches.find(b => b.id === 'branch1');
            const branch2 = branches.find(b => b.id === 'branch2');
            const branch3 = branches.find(b => b.id === 'branch3');
            const branch4 = branches.find(b => b.id === 'branch4');

            const rules = [];
            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');

            // TANITOURS: 11-15 → $1,300, 16-23 → $1,500, 24-39 → $2,500 (tarifa fija)
            if (tanitoursAgency) {
                rules.push(
                    { id: Utils.generateId(), agency_id: tanitoursAgency.id, branch_id: null, min_passengers: 11, max_passengers: 15, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1300, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TANITOURS: 11-15 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tanitoursAgency.id, branch_id: null, min_passengers: 16, max_passengers: 23, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1500, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TANITOURS: 16-23 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tanitoursAgency.id, branch_id: null, min_passengers: 24, max_passengers: 39, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 2500, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TANITOURS: 24-39 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                );
            }

            // TRAVELEX: Cualquier cantidad → $3,700 (tarifa fija)
            if (travelexAgency) {
                rules.push(
                    { id: Utils.generateId(), agency_id: travelexAgency.id, branch_id: null, min_passengers: 1, max_passengers: null, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 3700, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TRAVELEX: Cualquier cantidad', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                );
            }

            // DISCOVERY: Tienda 1 y 2 → $2,000 (city_tour), Tienda 3 y 4 → Sprinter $1,000 / Van $600
            if (discoveryAgency) {
                if (branch1) {
                    rules.push({ id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch1.id, min_passengers: 1, max_passengers: null, unit_type: 'city_tour', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 2000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: L Vallarta - City Tour', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' });
                }
                if (branch2) {
                    rules.push({ id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch2.id, min_passengers: 1, max_passengers: null, unit_type: 'city_tour', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 2000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: Malecón - City Tour', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' });
                }
                if (branch3) {
                    rules.push(
                        { id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch3.id, min_passengers: 1, max_passengers: null, unit_type: 'sprinter', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: San Sebastián - Sprinter', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                        { id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch3.id, min_passengers: 1, max_passengers: null, unit_type: 'van', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 600, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: San Sebastián - Van', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                    );
                }
                if (branch4) {
                    rules.push(
                        { id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch4.id, min_passengers: 1, max_passengers: null, unit_type: 'sprinter', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: Sayulita - Sprinter', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                        { id: Utils.generateId(), agency_id: discoveryAgency.id, branch_id: branch4.id, min_passengers: 1, max_passengers: null, unit_type: 'van', rate_per_passenger: 0, fee_type: 'flat', flat_fee: 600, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'DISCOVERY: Sayulita - Van', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                    );
                }
            }

            // VERANOS: Cualquier cantidad → $2,000 (tarifa fija)
            if (veranosAgency) {
                rules.push(
                    { id: Utils.generateId(), agency_id: veranosAgency.id, branch_id: null, min_passengers: 1, max_passengers: null, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 2000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'VERANOS: Cualquier cantidad', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                );
            }

            // TB: 1-6 → $300, 7-14 → $600, 15-18 → $800, 20-30 → $1,000, 30-45 → $1,200, +$20 por pasajero extra >45
            // Nota: El extra solo aplica después de 45 pasajeros, no después de cada rango
            if (tbAgency) {
                rules.push(
                    { id: Utils.generateId(), agency_id: tbAgency.id, branch_id: null, min_passengers: 1, max_passengers: 6, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 300, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TB: 1-6 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tbAgency.id, branch_id: null, min_passengers: 7, max_passengers: 14, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 600, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TB: 7-14 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tbAgency.id, branch_id: null, min_passengers: 15, max_passengers: 18, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 800, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TB: 15-18 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tbAgency.id, branch_id: null, min_passengers: 20, max_passengers: 30, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TB: 20-30 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: tbAgency.id, branch_id: null, min_passengers: 30, max_passengers: 45, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1200, extra_per_passenger: 20, active_from: today, active_until: null, notes: 'TB: 30-45 PAX + $20 extra >45', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                );
            }

            // TTF: 1-6 → $300, 7-14 → $600, 15-18 → $800, 20-30 → $1,000, 30-45 → $1,200 (tarifa fija, sin extra)
            if (ttfAgency) {
                rules.push(
                    { id: Utils.generateId(), agency_id: ttfAgency.id, branch_id: null, min_passengers: 1, max_passengers: 6, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 300, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TTF: 1-6 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: ttfAgency.id, branch_id: null, min_passengers: 7, max_passengers: 14, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 600, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TTF: 7-14 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: ttfAgency.id, branch_id: null, min_passengers: 15, max_passengers: 18, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 800, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TTF: 15-18 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: ttfAgency.id, branch_id: null, min_passengers: 20, max_passengers: 30, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1000, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TTF: 20-30 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' },
                    { id: Utils.generateId(), agency_id: ttfAgency.id, branch_id: null, min_passengers: 30, max_passengers: 45, unit_type: null, rate_per_passenger: 0, fee_type: 'flat', flat_fee: 1200, extra_per_passenger: 0, active_from: today, active_until: null, notes: 'TTF: 30-45 PAX', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sync_status: 'pending' }
                );
            }

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1084',message:'About to save rules',data:{count:rules.length,rules:rules.map(r=>({agency:r.agency_id,min:r.min_passengers,max:r.max_passengers,fee_type:r.fee_type,flat_fee:r.flat_fee}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            for (const rule of rules) {
                try {
                    await DB.add('arrival_rate_rules', rule);
                    await SyncManager.addToQueue('arrival_rate_rule', rule.id);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1087',message:'Rule saved',data:{id:rule.id,agency:rule.agency_id,min:rule.min_passengers,max:rule.max_passengers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                } catch (e) {
                    console.error('Error creating arrival rate rule:', e);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1090',message:'Error saving rule',data:{error:e.message,rule:rule.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                }
            }

            console.log(`✅ ${rules.length} reglas de llegadas precargadas`);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:1093',message:'Precarga completada',data:{count:rules.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
        } catch (e) {
            console.error('Error loading arrival rate rules:', e);
        }
    },

    async loadWeeklyPayroll() {
        try {
            // Verificar si ya existe nómina semanal
            const existingPayroll = await DB.getAll('cost_entries') || [];
            const hasPayroll = existingPayroll.some(c => 
                c.category === 'nomina' && 
                c.period_type === 'weekly' && 
                c.recurring === true
            );

            if (hasPayroll) {
                console.log('Nómina semanal ya existe, omitiendo precarga');
                return;
            }

            const branches = await DB.getAll('catalog_branches') || [];
            const branch1 = branches.find(b => b.id === 'branch1');
            const branch2 = branches.find(b => b.id === 'branch2');
            const branch3 = branches.find(b => b.id === 'branch3');
            const branch4 = branches.find(b => b.id === 'branch4');

            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const payrollCosts = [];

            // Tienda 1 (L Vallarta): CHELY $3,000, XIMENA $2,500, ANA $1,500, DULCE $2,000 → total $9,000 semanal
            if (branch1) {
                payrollCosts.push({
                    id: Utils.generateId(),
                    type: 'fijo',
                    category: 'nomina',
                    amount: 9000,
                    branch_id: branch1.id,
                    date: today,
                    period_type: 'weekly',
                    recurring: true,
                    auto_generate: true,
                    notes: 'Nómina semanal: CHELY $3,000, XIMENA $2,500, ANA $1,500, DULCE $2,000',
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                });
            }

            // Tienda 2 (Malecón): ANDREA $2,000, ITZEL $2,000, GUILLE $2,500 → total $6,500 semanal
            if (branch2) {
                payrollCosts.push({
                    id: Utils.generateId(),
                    type: 'fijo',
                    category: 'nomina',
                    amount: 6500,
                    branch_id: branch2.id,
                    date: today,
                    period_type: 'weekly',
                    recurring: true,
                    auto_generate: true,
                    notes: 'Nómina semanal: ANDREA $2,000, ITZEL $2,000, GUILLE $2,500',
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                });
            }

            // Tienda 3 (San Sebastián): OMAR $2,000, JUAN CARLOS $2,000 → total $4,000 semanal
            if (branch3) {
                payrollCosts.push({
                    id: Utils.generateId(),
                    type: 'fijo',
                    category: 'nomina',
                    amount: 4000,
                    branch_id: branch3.id,
                    date: today,
                    period_type: 'weekly',
                    recurring: true,
                    auto_generate: true,
                    notes: 'Nómina semanal: OMAR $2,000, JUAN CARLOS $2,000',
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                });
            }

            // Tienda 4 (Sayulita): OMAR $2,000, JUAN CARLOS $2,000, FANY $1,500, COVARRUBIAS $1,000 → total $6,500 semanal
            if (branch4) {
                payrollCosts.push({
                    id: Utils.generateId(),
                    type: 'fijo',
                    category: 'nomina',
                    amount: 6500,
                    branch_id: branch4.id,
                    date: today,
                    period_type: 'weekly',
                    recurring: true,
                    auto_generate: true,
                    notes: 'Nómina semanal: OMAR $2,000, JUAN CARLOS $2,000, FANY $1,500, COVARRUBIAS $1,000',
                    created_at: new Date().toISOString(),
                    sync_status: 'pending'
                });
            }

            for (const cost of payrollCosts) {
                try {
                    await DB.add('cost_entries', cost);
                    await SyncManager.addToQueue('cost_entry', cost.id);
                } catch (e) {
                    console.error('Error creating payroll cost:', e);
                }
            }

            console.log(`✅ ${payrollCosts.length} nóminas semanales precargadas`);
        } catch (e) {
            console.error('Error loading weekly payroll:', e);
        }
    },

    getSellerCommissionRule(name) {
        if (name === 'SEBASTIAN') return 'seller_sebastian';
        if (name === 'OMAR' || name === 'JUAN CARLOS') return 'seller_omar';
        return 'seller_default';
    },

    async loadInitialCosts() {
        try {
            // Verificar si ya existen costos fijos iniciales
            const existingCosts = await DB.getAll('cost_entries') || [];
            const hasInitialCosts = existingCosts.some(c => 
                (c.category === 'renta' || c.category === 'agua' || c.category === 'linea_amarilla' || c.category === 'licencias') &&
                c.recurring === true
            );

            if (hasInitialCosts) {
                console.log('Costos iniciales ya existen, omitiendo precarga');
                return;
            }

            const branches = await DB.getAll('catalog_branches') || [];
            const branch1 = branches.find(b => b.id === 'branch1');
            const branch2 = branches.find(b => b.id === 'branch2');
            const branch3 = branches.find(b => b.id === 'branch3');
            const branch4 = branches.find(b => b.id === 'branch4');

            const today = Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const initialCosts = [];

            // Costos fijos que aplican a todas las sucursales
            const fixedCosts = [
                { category: 'renta', name: 'Renta Local', amount: 0, period_type: 'monthly', notes: 'Renta del local' },
                { category: 'agua', name: 'Agua', amount: 0, period_type: 'monthly', notes: 'Servicio de agua' },
                { category: 'linea_amarilla', name: 'Línea Amarilla', amount: 10000, period_type: 'monthly', notes: 'Línea Amarilla $10,000 MXN mensual' },
                { category: 'licencias', name: 'Licencias y Permisos', amount: 0, period_type: 'monthly', notes: 'Licencias y permisos' }
            ];

            // Agregar costos fijos para cada sucursal
            for (const branch of [branch1, branch2, branch3, branch4].filter(b => b)) {
                for (const cost of fixedCosts) {
                    initialCosts.push({
                        id: Utils.generateId(),
                        type: 'fijo',
                        category: cost.category,
                        amount: cost.amount,
                        branch_id: branch.id,
                        date: today,
                        period_type: cost.period_type,
                        recurring: true,
                        auto_generate: false,
                        notes: `${cost.name} - ${branch.name}`,
                        created_at: new Date().toISOString(),
                        sync_status: 'pending'
                    });
                }
            }

            // Nota: Los costos variables (luz, pago_llegadas, despensa) no se crean automáticamente
            // porque sus montos varían. Se crean manualmente cuando se registran.

            for (const cost of initialCosts) {
                try {
                    await DB.add('cost_entries', cost);
                    if (typeof SyncManager !== 'undefined') {
                        await SyncManager.addToQueue('cost_entry', cost.id);
                    }
                } catch (e) {
                    console.error('Error creating initial cost:', e);
                }
            }

            console.log(`✅ ${initialCosts.length} costos iniciales precargados`);
        } catch (e) {
            console.error('Error loading initial costs:', e);
        }
    },

    async loadEmployees() {
        // Create demo employees - always ensure they're active
        const employees = [
            { id: 'emp1', name: 'Admin', role: 'admin', branch_id: 'branch1', active: true, barcode: 'EMP001' },
            { id: 'emp2', name: 'Vendedor 1', role: 'seller', branch_id: 'branch1', active: true, barcode: 'EMP002' }
        ];

        for (const emp of employees) {
            try {
                const existing = await DB.get('employees', emp.id);
                if (existing) {
                    // Update to ensure active and barcode
                    existing.active = true;
                    if (!existing.barcode || Utils.isBarcodeEmpty(existing.barcode)) {
                        existing.barcode = Utils.generateEmployeeBarcode(existing);
                    }
                    await DB.put('employees', existing);
                } else {
                    // Nuevo registro: generar código de barras si no existe
                    if (!emp.barcode || Utils.isBarcodeEmpty(emp.barcode)) {
                        emp.barcode = Utils.generateEmployeeBarcode(emp);
                    }
                    await DB.put('employees', emp);
                }
            } catch (e) {
                console.error('Error creating employee:', e);
                // Try again
                try {
                    if (!emp.barcode || Utils.isBarcodeEmpty(emp.barcode)) {
                        emp.barcode = Utils.generateEmployeeBarcode(emp);
                    }
                    await DB.put('employees', emp);
                } catch (e2) {
                    console.error('Error retrying:', e2);
                }
            }
        }

        // Create demo users - always ensure they're active
        const pinHash = await Utils.hashPin('1234');
        const users = [
            {
                id: 'user1',
                username: 'admin',
                employee_id: 'emp1',
                role: 'admin',
                permissions: ['all'],
                active: true,
                pin_hash: pinHash
            },
            {
                id: 'user2',
                username: 'vendedor1',
                employee_id: 'emp2',
                role: 'seller',
                permissions: ['pos', 'inventory_view', 'descuentos'],
                active: true,
                pin_hash: pinHash
            }
        ];

        for (const user of users) {
            try {
                const existing = await DB.get('users', user.id);
                if (existing) {
                    // Update to ensure active
                    existing.active = true;
                    existing.pin_hash = user.pin_hash; // Ensure PIN hash is set
                    await DB.put('users', existing);
                } else {
                    await DB.put('users', user);
                }
            } catch (e) {
                console.error('Error creating user:', e);
                // Try again
                try {
                    await DB.put('users', user);
                } catch (e2) {
                    console.error('Error retrying:', e2);
                }
            }
        }

        // Create demo inventory items
        await this.loadDemoInventory();

        // Create demo customers
        await this.loadDemoCustomers();
    },

    async loadDemoInventory() {
        const demoItems = [
            {
                id: 'inv1',
                sku: 'AN001',
                barcode: 'AN001',
                name: 'Anillo Oro 18k Diamante',
                metal: 'Oro 18k',
                stone: 'Diamante',
                size: '6',
                weight_g: 5.2,
                measures: '15mm',
                cost: 8000,
                price: 0,
                location: 'Vitrina 1',
                status: 'disponible',
                branch_id: 'branch1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            {
                id: 'inv2',
                sku: 'PU002',
                barcode: 'PU002',
                name: 'Pulsera Plata Sterling',
                metal: 'Plata 925',
                stone: 'Sin piedra',
                size: 'Mediana',
                weight_g: 12.5,
                measures: '18cm',
                cost: 2000,
                price: 0,
                location: 'Vitrina 2',
                status: 'disponible',
                branch_id: 'branch1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            {
                id: 'inv3',
                sku: 'CO003',
                barcode: 'CO003',
                name: 'Collar Oro 14k Perlas',
                metal: 'Oro 14k',
                stone: 'Perlas',
                size: '45cm',
                weight_g: 8.3,
                measures: '45cm',
                cost: 5000,
                price: 0,
                location: 'Vitrina 1',
                status: 'disponible',
                branch_id: 'branch1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            {
                id: 'inv4',
                sku: 'AR004',
                barcode: 'AR004',
                name: 'Aretes Oro 18k Esmeraldas',
                metal: 'Oro 18k',
                stone: 'Esmeraldas',
                size: 'Mediana',
                weight_g: 3.5,
                measures: '2cm',
                cost: 6000,
                price: 0,
                location: 'Vitrina 1',
                status: 'disponible',
                branch_id: 'branch1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            {
                id: 'inv5',
                sku: 'AN005',
                barcode: 'AN005',
                name: 'Anillo Plata 925 Zafiro',
                metal: 'Plata 925',
                stone: 'Zafiro',
                size: '7',
                weight_g: 4.8,
                measures: '16mm',
                cost: 3500,
                price: 0,
                location: 'Vitrina 2',
                status: 'disponible',
                branch_id: 'branch1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];

        let created = 0;
        for (const item of demoItems) {
            try {
                // Verificar si ya existe
                const existing = await DB.get('inventory_items', item.id);
                if (!existing) {
                    await DB.put('inventory_items', item);
                    created++;
                }
            } catch (e) {
                console.error(`Error creando item ${item.id}:`, e);
            }
        }
        console.log(`Productos demo creados: ${created} de ${demoItems.length}`);
        return created;
    },

    async loadDemoCustomers() {
        const demoCustomers = [
            {
                id: 'cust1',
                name: 'María González',
                email: 'maria.gonzalez@email.com',
                phone: '5551234567',
                notes: 'Cliente frecuente, prefiere anillos',
                created_at: new Date().toISOString()
            },
            {
                id: 'cust2',
                name: 'Juan Pérez',
                email: 'juan.perez@email.com',
                phone: '5559876543',
                notes: '',
                created_at: new Date().toISOString()
            }
        ];

        for (const customer of demoCustomers) {
            try {
                await DB.put('customers', customer);
            } catch (e) {
                // Already exists
            }
        }
    },

    async verifyAndFixBarcodes() {
        try {
            // Verificar y corregir empleados
            const employees = await DB.getAll('employees') || [];
            for (const emp of employees) {
                if (!emp.barcode || Utils.isBarcodeEmpty(emp.barcode)) {
                    emp.barcode = Utils.generateEmployeeBarcode(emp);
                    await DB.put('employees', emp);
                }
            }

            // Verificar y corregir vendedores
            const sellers = await DB.getAll('catalog_sellers') || [];
            for (const seller of sellers) {
                if (!seller.barcode || Utils.isBarcodeEmpty(seller.barcode)) {
                    seller.barcode = Utils.generateSellerBarcode(seller);
                    await DB.put('catalog_sellers', seller);
                }
            }

            // Verificar y corregir guías
            const guides = await DB.getAll('catalog_guides') || [];
            for (const guide of guides) {
                if (!guide.barcode || Utils.isBarcodeEmpty(guide.barcode)) {
                    guide.barcode = Utils.generateGuideBarcode(guide);
                    await DB.put('catalog_guides', guide);
                }
            }

            // Verificar y corregir agencias
            const agencies = await DB.getAll('catalog_agencies') || [];
            for (const agency of agencies) {
                if (!agency.barcode || Utils.isBarcodeEmpty(agency.barcode)) {
                    agency.barcode = Utils.generateAgencyBarcode(agency);
                    await DB.put('catalog_agencies', agency);
                }
            }

            // Verificar items de inventario
            const items = await DB.getAll('inventory_items') || [];
            for (const item of items) {
                if (!item.barcode || Utils.isBarcodeEmpty(item.barcode)) {
                    item.barcode = item.sku || `ITEM${item.id.substring(0, 6).toUpperCase()}`;
                    await DB.put('inventory_items', item);
                }
            }

            console.log('Códigos de barras verificados y corregidos');
        } catch (e) {
            console.error('Error verificando códigos de barras:', e);
        }
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
