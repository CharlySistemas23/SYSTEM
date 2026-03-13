// Script de Prueba Global - Crear 10 Sucursales de Prueba
// Ejecutar desde la consola del navegador: testBranches()

window.testBranches = async function() {
    console.log('🧪 INICIANDO PRUEBA GLOBAL DE SUCURSALES');
    console.log('==========================================');
    
    const results = {
        total: 10,
        created: 0,
        errors: [],
        success: []
    };
    
    // Datos de prueba
    const testBranches = [
        { code: 'TEST001', name: 'Sucursal Test 1', address: 'Calle Principal 123', phone: '1234567890', email: 'test1@example.com', active: true },
        { code: 'TEST002', name: 'Sucursal Test 2', address: 'Avenida Central 456', phone: '2345678901', email: 'test2@example.com', active: true },
        { code: 'TEST003', name: 'Sucursal Test 3', address: 'Boulevard Norte 789', phone: '3456789012', email: 'test3@example.com', active: true },
        { code: 'TEST004', name: 'Sucursal Test 4', address: 'Plaza Sur 321', phone: '4567890123', email: 'test4@example.com', active: true },
        { code: 'TEST005', name: 'Sucursal Test 5', address: 'Zona Este 654', phone: '5678901234', email: 'test5@example.com', active: true },
        { code: 'TEST006', name: 'Sucursal Test 6', address: 'Zona Oeste 987', phone: '6789012345', email: 'test6@example.com', active: true },
        { code: 'TEST007', name: 'Sucursal Test 7', address: 'Centro Histórico 147', phone: '7890123456', email: 'test7@example.com', active: true },
        { code: 'TEST008', name: 'Sucursal Test 8', address: 'Zona Industrial 258', phone: '8901234567', email: 'test8@example.com', active: true },
        { code: 'TEST009', name: 'Sucursal Test 9', address: 'Distrito Comercial 369', phone: '9012345678', email: 'test9@example.com', active: true },
        { code: 'TEST010', name: 'Sucursal Test 10', address: 'Zona Residencial 741', phone: '0123456789', email: 'test10@example.com', active: true }
    ];
    
    // Verificar que API esté configurado
    if (!API || !API.baseURL || !API.token) {
        console.error('❌ ERROR: API no configurado');
        console.log('💡 Solución:');
        console.log('1. Ve a Configuración → Sincronización');
        console.log('2. Configura la URL del servidor (ej: https://tu-railway.app)');
        console.log('3. Inicia sesión con admin / 1234');
        return results;
    }
    
    console.log(`✅ API configurado: ${API.baseURL}`);
    console.log(`✅ Token disponible: ${API.token ? 'Sí' : 'No'}`);
    console.log('');
    console.log('📝 Creando 10 sucursales de prueba...');
    console.log('');
    
    // Crear cada sucursal
    for (let i = 0; i < testBranches.length; i++) {
        const branchData = testBranches[i];
        const branchNumber = i + 1;
        
        try {
            console.log(`[${branchNumber}/10] Creando: ${branchData.name} (${branchData.code})...`);
            
            // Intentar crear con API
            let createdBranch;
            if (API.createBranch) {
                createdBranch = await API.createBranch(branchData);
                console.log(`   ✅ Creada con API - ID: ${createdBranch.id}`);
            } else {
                // Fallback: crear localmente
                createdBranch = {
                    ...branchData,
                    id: 'test_' + Date.now() + '_' + i,
                    created_at: new Date().toISOString()
                };
                await DB.put('catalog_branches', createdBranch);
                
                // Agregar a cola de sincronización
                if (typeof SyncManager !== 'undefined') {
                    await SyncManager.addToQueue('branch', 'create', createdBranch);
                }
                console.log(`   ⚠️ Creada localmente (se sincronizará después)`);
            }
            
            results.created++;
            results.success.push({
                number: branchNumber,
                code: branchData.code,
                name: branchData.name,
                id: createdBranch.id
            });
            
            // Pequeña pausa para evitar sobrecarga
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`   ❌ Error creando ${branchData.name}:`, error.message);
            results.errors.push({
                number: branchNumber,
                code: branchData.code,
                name: branchData.name,
                error: error.message
            });
        }
    }
    
    console.log('');
    console.log('==========================================');
    console.log('📊 RESULTADOS DE LA PRUEBA');
    console.log('==========================================');
    console.log(`Total intentado: ${results.total}`);
    console.log(`✅ Creadas exitosamente: ${results.created}`);
    console.log(`❌ Errores: ${results.errors.length}`);
    console.log('');
    
    if (results.success.length > 0) {
        console.log('✅ Sucursales creadas:');
        results.success.forEach(s => {
            console.log(`   ${s.number}. ${s.name} (${s.code}) - ID: ${s.id}`);
        });
        console.log('');
    }
    
    if (results.errors.length > 0) {
        console.log('❌ Errores encontrados:');
        results.errors.forEach(e => {
            console.log(`   ${e.number}. ${e.name} (${e.code}): ${e.error}`);
        });
        console.log('');
    }
    
    // Recargar la lista de sucursales
    if (typeof Branches !== 'undefined') {
        console.log('🔄 Recargando lista de sucursales...');
        await Branches.loadBranches();
        console.log('✅ Lista recargada');
    }
    
    // Verificar sincronización pendiente
    if (typeof SyncManager !== 'undefined') {
        const queueSize = SyncManager.getQueueSize();
        if (queueSize > 0) {
            console.log(`⚠️ Hay ${queueSize} elementos pendientes de sincronizar`);
            console.log('💡 Se sincronizarán automáticamente cuando haya conexión');
        }
    }
    
    console.log('');
    console.log('🎉 Prueba completada');
    console.log('');
    console.log('💡 Para limpiar las sucursales de prueba, ejecuta:');
    console.log('   cleanupTestBranches()');
    
    return results;
};

// Función para limpiar las sucursales de prueba
window.cleanupTestBranches = async function() {
    console.log('🧹 LIMPIANDO SUCURSALES DE PRUEBA');
    console.log('==================================');
    
    if (!API || !API.baseURL || !API.token) {
        console.error('❌ ERROR: API no configurado');
        return;
    }
    
    try {
        // Obtener todas las sucursales
        const branches = await API.getBranches();
        
        // Filtrar las de prueba (códigos TEST001-TEST010)
        const testBranches = branches.filter(b => 
            b.code && b.code.startsWith('TEST') && 
            /^TEST\d{3}$/.test(b.code)
        );
        
        console.log(`📋 Encontradas ${testBranches.length} sucursales de prueba`);
        
        if (testBranches.length === 0) {
            console.log('✅ No hay sucursales de prueba para eliminar');
            return;
        }
        
        let deleted = 0;
        let errors = 0;
        
        for (const branch of testBranches) {
            try {
                console.log(`🗑️ Eliminando: ${branch.name} (${branch.code})...`);
                
                if (API.deleteBranch) {
                    await API.deleteBranch(branch.id);
                    console.log(`   ✅ Eliminada`);
                } else {
                    await DB.delete('catalog_branches', branch.id);
                    console.log(`   ⚠️ Eliminada localmente`);
                }
                
                deleted++;
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error(`   ❌ Error eliminando ${branch.name}:`, error.message);
                errors++;
            }
        }
        
        console.log('');
        console.log('==================================');
        console.log(`✅ Eliminadas: ${deleted}`);
        console.log(`❌ Errores: ${errors}`);
        console.log('');
        
        // Recargar lista
        if (typeof Branches !== 'undefined') {
            await Branches.loadBranches();
            console.log('✅ Lista recargada');
        }
        
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
    }
};

// Función para verificar el estado del sistema
window.checkSystemStatus = async function() {
    console.log('🔍 VERIFICANDO ESTADO DEL SISTEMA');
    console.log('==================================');
    
    const status = {
        api: {
            configured: false,
            connected: false,
            url: null,
            token: null
        },
        database: {
            local: false,
            branches: 0
        },
        sync: {
            queue: 0,
            syncing: false
        }
    };
    
    // Verificar API
    if (typeof API !== 'undefined') {
        status.api.configured = !!API.baseURL;
        status.api.url = API.baseURL || 'No configurado';
        status.api.token = !!API.token;
        status.api.connected = !!(API.baseURL && API.token);
    }
    
    // Verificar base de datos local
    if (typeof DB !== 'undefined') {
        try {
            const branches = await DB.getAll('catalog_branches') || [];
            status.database.local = true;
            status.database.branches = branches.length;
        } catch (error) {
            console.error('Error verificando DB local:', error);
        }
    }
    
    // Verificar sincronización
    if (typeof SyncManager !== 'undefined') {
        status.sync.queue = SyncManager.getQueueSize();
        status.sync.syncing = SyncManager.isSyncing;
    }
    
    console.log('📡 API:');
    console.log(`   Configurado: ${status.api.configured ? '✅' : '❌'}`);
    console.log(`   URL: ${status.api.url}`);
    console.log(`   Token: ${status.api.token ? '✅' : '❌'}`);
    console.log(`   Conectado: ${status.api.connected ? '✅' : '❌'}`);
    console.log('');
    
    console.log('💾 Base de Datos Local:');
    console.log(`   Disponible: ${status.database.local ? '✅' : '❌'}`);
    console.log(`   Sucursales: ${status.database.branches}`);
    console.log('');
    
    console.log('🔄 Sincronización:');
    console.log(`   Cola pendiente: ${status.sync.queue}`);
    console.log(`   Sincronizando: ${status.sync.syncing ? '⏳' : '✅'}`);
    console.log('');
    
    return status;
};

console.log('');
console.log('🧪 Scripts de prueba cargados:');
console.log('   testBranches() - Crear 10 sucursales de prueba');
console.log('   cleanupTestBranches() - Eliminar sucursales de prueba');
console.log('   checkSystemStatus() - Verificar estado del sistema');
console.log('');
