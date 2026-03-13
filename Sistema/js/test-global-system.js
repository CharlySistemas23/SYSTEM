// Script de Prueba Global - Probar TODOS los módulos del sistema
// Ejecutar desde la consola: testGlobalSystem()

window.testGlobalSystem = async function() {
    console.log('🧪 PRUEBA GLOBAL DEL SISTEMA');
    console.log('==========================================');
    console.log('Verificando que Railway reciba datos de todos los módulos');
    console.log('');
    
    const results = {
        modules: {},
        total: 0,
        success: 0,
        errors: 0
    };
    
    // Verificar que API esté configurado (leer desde DB para asegurar sincronización)
    let apiUrl = null;
    try {
        if (typeof DB !== 'undefined') {
            const urlSetting = await DB.get('settings', 'api_url');
            apiUrl = urlSetting?.value || null;
        }
    } catch (error) {
        console.error('Error leyendo URL desde DB:', error);
    }
    
    // Sincronizar API.baseURL con la base de datos
    if (apiUrl && typeof API !== 'undefined') {
        API.baseURL = apiUrl;
    }
    
    const hasToken = (typeof API !== 'undefined' && API.token) || !!localStorage.getItem('api_token');
    
    if (!apiUrl) {
        console.error('❌ ERROR: API no configurado');
        console.log('💡 Solución:');
        console.log('1. Ve a Configuración → Sincronización');
        console.log('2. Configura la URL del servidor');
        console.log('3. Inicia sesión con admin / 1234');
        return results;
    }
    
    if (!hasToken) {
        console.error('❌ ERROR: URL configurada pero no hay sesión activa');
        console.log('💡 Solución: Inicia sesión con admin / 1234');
        return results;
    }
    
    console.log(`✅ API configurado: ${apiUrl}`);
    console.log(`✅ Token disponible: ${hasToken ? 'Sí' : 'No'}`);
    console.log('');
    
    // Verificar usuario actual
    const isMasterAdmin = UserManager?.currentUser?.is_master_admin || 
                         UserManager?.currentUser?.role === 'master_admin';
    
    // Obtener sucursal válida desde Railway
    let currentBranchId = null;
    try {
        const branches = await API.getBranches();
        if (branches && branches.length > 0) {
            currentBranchId = branches[0].id;
            console.log(`🏢 Sucursal encontrada: ${branches[0].name} (${currentBranchId})`);
        } else {
            // Si no hay sucursales, usar la del usuario o crear una por defecto
            currentBranchId = BranchManager?.getCurrentBranchId() || UserManager?.currentUser?.branchId;
            if (!currentBranchId) {
                console.warn('⚠️ No se encontró sucursal válida, algunos tests pueden fallar');
            }
        }
    } catch (error) {
        console.warn('⚠️ Error obteniendo sucursales:', error.message);
        currentBranchId = BranchManager?.getCurrentBranchId() || UserManager?.currentUser?.branchId;
    }
    
    console.log(`👤 Usuario: ${UserManager?.currentUser?.username || 'Desconocido'}`);
    console.log(`🏢 Sucursal actual: ${currentBranchId || 'No disponible'}`);
    console.log(`👑 Master Admin: ${isMasterAdmin ? 'Sí' : 'No'}`);
    console.log('');
    
    // Validar que tenemos branch_id válido antes de continuar
    if (!currentBranchId) {
        console.error('❌ No se puede continuar: No hay sucursal válida configurada');
        console.log('💡 Solución: Ve a Configuración → Sucursales y crea una sucursal primero');
        return results;
    }
    
    // ==========================================
    // 1. PRUEBA DE INVENTARIO
    // ==========================================
    console.log('📦 1. PROBANDO MÓDULO: INVENTARIO');
    console.log('-----------------------------------');
    results.modules.inventory = { tested: true, success: 0, errors: [] };
    
    try {
        const testItem = {
            barcode: 'TEST-INV-' + Date.now(),
            sku: 'SKU-TEST-' + Date.now(),
            name: 'Item de Prueba - Inventario',
            description: 'Item creado para prueba del sistema',
            category: 'joyeria',
            metal: 'oro',
            weight: 10.5,
            cost: 100,
            price: 200,
            stock_actual: 5,
            stock_min: 0,
            stock_max: 10,
            status: 'disponible',
            branch_id: currentBranchId
        };
        
        if (API.createInventoryItem) {
            const createdItem = await API.createInventoryItem(testItem);
            console.log(`   ✅ Item creado: ${createdItem.name} (ID: ${createdItem.id})`);
            results.modules.inventory.success++;
            results.success++;
        } else {
            console.log(`   ⚠️ API.createInventoryItem no disponible`);
            results.modules.inventory.errors.push('Método no disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.inventory.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 2. PRUEBA DE CLIENTES
    // ==========================================
    console.log('👤 2. PROBANDO MÓDULO: CLIENTES');
    console.log('-----------------------------------');
    results.modules.customers = { tested: true, success: 0, errors: [] };
    
    try {
        const testCustomer = {
            name: 'Cliente de Prueba',
            email: 'test@example.com',
            phone: '1234567890',
            address: 'Dirección de Prueba',
            branch_id: currentBranchId
        };
        
        if (API.createCustomer) {
            const createdCustomer = await API.createCustomer(testCustomer);
            console.log(`   ✅ Cliente creado: ${createdCustomer.name} (ID: ${createdCustomer.id})`);
            results.modules.customers.success++;
            results.success++;
        } else {
            console.log(`   ⚠️ API.createCustomer no disponible`);
            results.modules.customers.errors.push('Método no disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.customers.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 3. PRUEBA DE EMPLEADOS
    // ==========================================
    console.log('👔 3. PROBANDO MÓDULO: EMPLEADOS');
    console.log('-----------------------------------');
    results.modules.employees = { tested: true, success: 0, errors: [] };
    
    try {
        const testEmployee = {
            code: 'EMP-TEST-' + Date.now(),
            name: 'Empleado de Prueba',
            email: 'empleado.test@example.com',
            phone: '9876543210',
            role: 'seller',
            branch_id: currentBranchId,
            active: true
        };
        
        if (API.createEmployee) {
            const createdEmployee = await API.createEmployee(testEmployee);
            console.log(`   ✅ Empleado creado: ${createdEmployee.name} (ID: ${createdEmployee.id})`);
            results.modules.employees.success++;
            results.success++;
        } else {
            console.log(`   ⚠️ API.createEmployee no disponible`);
            results.modules.employees.errors.push('Método no disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.employees.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 4. PRUEBA DE REPARACIONES
    // ==========================================
    console.log('🔧 4. PROBANDO MÓDULO: REPARACIONES');
    console.log('-----------------------------------');
    results.modules.repairs = { tested: true, success: 0, errors: [] };
    
    try {
        const testRepair = {
            folio: 'REP-TEST-' + Date.now(),
            customer_id: null, // Se puede crear sin cliente
            description: 'Reparación de Prueba',
            estimated_cost: 50,
            branch_id: currentBranchId,
            status: 'pending'
        };
        
        if (API.createRepair) {
            const createdRepair = await API.createRepair(testRepair);
            console.log(`   ✅ Reparación creada: ${createdRepair.description} (ID: ${createdRepair.id})`);
            results.modules.repairs.success++;
            results.success++;
        } else {
            console.log(`   ⚠️ API.createRepair no disponible`);
            results.modules.repairs.errors.push('Método no disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.repairs.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 5. PRUEBA DE TRANSFERENCIAS
    // ==========================================
    console.log('🔄 5. PROBANDO MÓDULO: TRANSFERENCIAS');
    console.log('-----------------------------------');
    results.modules.transfers = { tested: true, success: 0, errors: [] };
    
    try {
        // Necesitamos otra sucursal para transferir
        const branches = await API.getBranches();
        const otherBranch = branches.find(b => b.id !== currentBranchId);
        
        if (otherBranch) {
            // Usar el item que acabamos de crear en la prueba de inventario
            // Primero obtener items recientes de la sucursal actual
            const inventoryItems = await API.getInventoryItems({ branch_id: currentBranchId, status: 'disponible' });
            
            // Filtrar items que tengan stock disponible y que pertenezcan a la sucursal actual
            const availableItems = inventoryItems.filter(item => 
                item.branch_id === currentBranchId && 
                (item.stock_actual || 0) > 0 && 
                item.status === 'disponible'
            );
            
            const testItem = availableItems.length > 0 ? availableItems[0] : null;
            
            if (testItem) {
                // Verificar que el item realmente pertenece a la sucursal actual
                if (testItem.branch_id !== currentBranchId) {
                    console.log(`   ⚠️ El item pertenece a otra sucursal (${testItem.branch_id}), omitiendo transferencia`);
                    results.modules.transfers.errors.push(`Item pertenece a otra sucursal`);
                } else {
                    const testTransfer = {
                        to_branch_id: otherBranch.id,
                        items: [{
                            item_id: testItem.id,
                            quantity: Math.min(1, testItem.stock_actual || 1)
                        }],
                        notes: 'Transferencia de Prueba'
                    };
                    
                    if (API.createTransfer) {
                        const createdTransfer = await API.createTransfer(testTransfer);
                        console.log(`   ✅ Transferencia creada: ${createdTransfer.id || 'OK'}`);
                        results.modules.transfers.success++;
                        results.success++;
                    } else {
                        console.log(`   ⚠️ API.createTransfer no disponible`);
                        results.modules.transfers.errors.push('Método no disponible');
                    }
                }
            } else {
                console.log(`   ⚠️ Se necesita un item de inventario disponible en la sucursal actual`);
                results.modules.transfers.errors.push('No hay items disponibles en inventario para transferir');
            }
        } else {
            console.log(`   ⚠️ Se necesita otra sucursal para crear transferencia`);
            results.modules.transfers.errors.push('No hay otra sucursal disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.transfers.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 6. PRUEBA DE COSTOS
    // ==========================================
    console.log('💰 6. PROBANDO MÓDULO: COSTOS');
    console.log('-----------------------------------');
    results.modules.costs = { tested: true, success: 0, errors: [] };
    
    try {
        const testCost = {
            type: 'variable',
            category: 'gastos_generales',
            description: 'Costo de Prueba',
            amount: 25.50,
            branch_id: currentBranchId,
            date: new Date().toISOString().split('T')[0]
        };
        
        if (API.createCost) {
            const createdCost = await API.createCost(testCost);
            console.log(`   ✅ Costo creado: ${createdCost.description} (ID: ${createdCost.id})`);
            results.modules.costs.success++;
            results.success++;
        } else {
            console.log(`   ⚠️ API.createCost no disponible`);
            results.modules.costs.errors.push('Método no disponible');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.costs.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // 7. PRUEBA DE SUCURSALES (Solo Master Admin)
    // ==========================================
    if (isMasterAdmin) {
        console.log('🏢 7. PROBANDO MÓDULO: SUCURSALES');
        console.log('-----------------------------------');
        results.modules.branches = { tested: true, success: 0, errors: [] };
        
        try {
            const testBranch = {
                code: 'TEST-' + Date.now(),
                name: 'Sucursal de Prueba',
                address: 'Dirección de Prueba',
                phone: '1234567890',
                email: 'test@example.com',
                active: true
            };
            
            if (API.createBranch) {
                const createdBranch = await API.createBranch(testBranch);
                console.log(`   ✅ Sucursal creada: ${createdBranch.name} (ID: ${createdBranch.id})`);
                results.modules.branches.success++;
                results.success++;
            } else {
                console.log(`   ⚠️ API.createBranch no disponible`);
                results.modules.branches.errors.push('Método no disponible');
            }
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
            results.modules.branches.errors.push(error.message);
            results.errors++;
        }
        
        console.log('');
    } else {
        console.log('🏢 7. PROBANDO MÓDULO: SUCURSALES');
        console.log('-----------------------------------');
        console.log('   ⚠️ Omitido: Se requiere ser Master Admin');
        results.modules.branches = { tested: false, success: 0, errors: [] };
        console.log('');
    }
    
    // ==========================================
    // 8. PRUEBA DE VENTAS (POS)
    // ==========================================
    console.log('💵 8. PROBANDO MÓDULO: VENTAS (POS)');
    console.log('-----------------------------------');
    results.modules.sales = { tested: true, success: 0, errors: [] };
    
    try {
        // Intentar obtener items para crear una venta desde Railway
        const items = await API.getInventoryItems({ branch_id: currentBranchId, status: 'disponible' }) || [];
        const testItem = items.length > 0 ? items[0] : null;
        
        if (testItem) {
            const unitPrice = parseFloat(testItem.price) || 100;
            const quantity = 1;
            const subtotal = unitPrice * quantity;
            
            const testSale = {
                branch_id: currentBranchId,
                items: [{
                    item_id: testItem.id,
                    sku: testItem.sku,
                    name: testItem.name,
                    quantity: quantity,
                    unit_price: unitPrice,
                    subtotal: subtotal,
                    discount_percent: 0,
                    guide_commission: 0,
                    seller_commission: 0
                }],
                payments: [{
                    method: 'cash_usd',
                    amount: subtotal,
                    currency: 'USD'
                }],
                discount_percent: 0,
                discount_amount: 0
            };
            
            if (API.createSale) {
                const createdSale = await API.createSale(testSale);
                console.log(`   ✅ Venta creada: Folio ${createdSale.folio || createdSale.id} (ID: ${createdSale.id})`);
                results.modules.sales.success++;
                results.success++;
            } else {
                console.log(`   ⚠️ API.createSale no disponible`);
                results.modules.sales.errors.push('Método no disponible');
            }
        } else {
            console.log(`   ⚠️ No hay items disponibles para crear venta`);
            results.modules.sales.errors.push('No hay items en inventario');
        }
    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.modules.sales.errors.push(error.message);
        results.errors++;
    }
    
    console.log('');
    
    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('==========================================');
    console.log('📊 RESUMEN DE LA PRUEBA GLOBAL');
    console.log('==========================================');
    console.log('');
    
    const moduleNames = {
        inventory: '📦 Inventario',
        customers: '👤 Clientes',
        employees: '👔 Empleados',
        repairs: '🔧 Reparaciones',
        transfers: '🔄 Transferencias',
        costs: '💰 Costos',
        branches: '🏢 Sucursales',
        sales: '💵 Ventas'
    };
    
    for (const [module, name] of Object.entries(moduleNames)) {
        const result = results.modules[module];
        if (result) {
            if (result.tested) {
                if (result.success > 0) {
                    console.log(`${name}: ✅ ${result.success} éxito(s)`);
                } else if (result.errors.length > 0) {
                    console.log(`${name}: ❌ ${result.errors.length} error(es)`);
                    result.errors.forEach(err => {
                        console.log(`   - ${err}`);
                    });
                } else {
                    console.log(`${name}: ⚠️ No probado (método no disponible)`);
                }
            } else {
                console.log(`${name}: ⚠️ Omitido`);
            }
        }
    }
    
    console.log('');
    console.log('==========================================');
    console.log(`Total módulos probados: ${Object.keys(results.modules).length}`);
    console.log(`✅ Éxitos: ${results.success}`);
    console.log(`❌ Errores: ${results.errors}`);
    console.log('');
    
    if (results.success > 0) {
        console.log('🎉 ¡Prueba completada!');
        console.log('');
        console.log('💡 Los datos de prueba se han guardado en Railway');
        console.log('💡 Puedes verificar en cada módulo que los datos aparezcan');
    }
    
    if (results.errors > 0) {
        console.log('⚠️ Algunos módulos tuvieron errores');
        console.log('💡 Revisa los mensajes de error arriba para más detalles');
    }
    
    console.log('');
    
    return results;
};

// Función para verificar estado de conexión
window.checkConnectionStatus = async function() {
    console.log('🔍 VERIFICANDO CONEXIÓN CON RAILWAY');
    console.log('==================================');
    
    if (!API || !API.baseURL) {
        console.error('❌ API no configurado');
        return false;
    }
    
    console.log(`📡 URL: ${API.baseURL}`);
    console.log(`🔑 Token: ${API.token ? 'Presente' : 'No presente'}`);
    console.log('');
    
    // Probar conexión básica
    try {
        console.log('🔄 Probando conexión...');
        const response = await fetch(`${API.baseURL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${API.token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Conexión exitosa');
            console.log(`👤 Usuario: ${data.username || 'Desconocido'}`);
            console.log(`👑 Master Admin: ${data.isMasterAdmin ? 'Sí' : 'No'}`);
            return true;
        } else {
            console.error(`❌ Error de conexión: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error de conexión: ${error.message}`);
        return false;
    }
};

console.log('');
console.log('🧪 Scripts de prueba global cargados:');
console.log('   testGlobalSystem() - Probar todos los módulos');
console.log('   checkConnectionStatus() - Verificar conexión con Railway');
console.log('');
