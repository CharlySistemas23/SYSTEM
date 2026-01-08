// Sistema de Auditoría del Sistema POS
// Ejecutar desde la consola del navegador para verificar consistencia

const SystemAuditor = {
    results: [],
    errors: [],
    warnings: [],
    
    async audit() {
        console.log('🔍 INICIANDO AUDITORÍA DEL SISTEMA...\n');
        this.results = [];
        this.errors = [];
        this.warnings = [];
        
        // Esperar a que la BD esté lista
        if (!DB || !DB.db) {
            console.error('❌ La base de datos no está inicializada');
            return;
        }
        
        await this.checkDataConsistency();
        await this.checkMetricsConsistency();
        await this.checkBranchFiltering();
        await this.checkCommissionCalculation();
        await this.checkSyncData();
        
        this.generateReport();
    },
    
    async checkDataConsistency() {
        console.log('📊 Verificando consistencia de datos...');
        
        // 1. Verificar que todas las ventas tengan branch_id
        const sales = await DB.getAll('sales') || [];
        const salesWithoutBranch = sales.filter(s => !s.branch_id);
        if (salesWithoutBranch.length > 0) {
            this.errors.push({
                type: 'DATA_CONSISTENCY',
                module: 'sales',
                issue: `${salesWithoutBranch.length} ventas sin branch_id`,
                severity: 'ALTA',
                items: salesWithoutBranch.map(s => s.id)
            });
        }
        
        // 2. Verificar que todos los sale_items tengan commission_amount
        const saleItems = await DB.getAll('sale_items') || [];
        const itemsWithoutCommission = saleItems.filter(si => si.commission_amount === undefined || si.commission_amount === null);
        if (itemsWithoutCommission.length > 0) {
            this.warnings.push({
                type: 'DATA_CONSISTENCY',
                module: 'sale_items',
                issue: `${itemsWithoutCommission.length} items sin commission_amount (pueden ser ventas antiguas)`,
                severity: 'MEDIA',
                items: itemsWithoutCommission.map(si => si.id).slice(0, 10)
            });
        }
        
        // 3. Verificar que todos los inventory_items tengan branch_id
        const inventory = await DB.getAll('inventory_items') || [];
        const itemsWithoutBranch = inventory.filter(i => !i.branch_id);
        if (itemsWithoutBranch.length > 0) {
            this.errors.push({
                type: 'DATA_CONSISTENCY',
                module: 'inventory_items',
                issue: `${itemsWithoutBranch.length} items de inventario sin branch_id`,
                severity: 'ALTA',
                items: itemsWithoutBranch.map(i => i.id).slice(0, 10)
            });
        }
        
        // 4. Verificar consistencia stock_actual vs status
        const inconsistentStatus = inventory.filter(i => {
            const stock = i.stock_actual ?? 0;
            const status = i.status || 'disponible';
            // Si tiene stock pero está marcado como vendida, es inconsistente
            if (stock > 0 && status === 'vendida') return true;
            // Si no tiene stock pero está marcado como disponible, también es inconsistente
            if (stock <= 0 && status === 'disponible') return true;
            return false;
        });
        if (inconsistentStatus.length > 0) {
            this.errors.push({
                type: 'DATA_CONSISTENCY',
                module: 'inventory_items',
                issue: `${inconsistentStatus.length} items con status inconsistente con stock_actual`,
                severity: 'ALTA',
                items: inconsistentStatus.map(i => ({ id: i.id, stock: i.stock_actual, status: i.status })).slice(0, 10)
            });
        }
    },
    
    async checkMetricsConsistency() {
        console.log('🔢 Verificando consistencia de métricas...');
        
        const today = new Date().toISOString().split('T')[0];
        const todayStr = today;
        
        // Obtener ventas del día
        const allSales = await DB.getAll('sales') || [];
        const todaySales = allSales.filter(s => s.created_at && s.created_at.startsWith(todayStr));
        
        if (todaySales.length === 0) {
            console.log('⚠️ No hay ventas de hoy para comparar métricas');
            return;
        }
        
        // Calcular métricas manualmente
        const saleItems = await DB.getAll('sale_items') || [];
        const allPayments = await DB.getAll('payments') || [];
        
        let manualRevenue = 0;
        let manualCommissions = 0;
        let manualBankCommissions = 0;
        let manualMerchandiseCost = 0;
        
        for (const sale of todaySales) {
            manualRevenue += sale.total || 0;
            
            const items = saleItems.filter(si => si.sale_id === sale.id);
            for (const item of items) {
                manualMerchandiseCost += (item.cost || 0) * (item.quantity || 1);
                manualCommissions += item.commission_amount || 0;
            }
            
            const payments = allPayments.filter(p => p.sale_id === sale.id);
            for (const payment of payments) {
                manualBankCommissions += payment.bank_commission || 0;
            }
        }
        
        this.results.push({
            type: 'METRICS',
            label: 'Métricas del día (cálculo manual)',
            values: {
                ventas: todaySales.length,
                revenue: manualRevenue,
                commissions: manualCommissions,
                bankCommissions: manualBankCommissions,
                merchandiseCost: manualMerchandiseCost,
                grossProfit: manualRevenue - manualMerchandiseCost,
                netProfit: manualRevenue - manualMerchandiseCost - manualCommissions - manualBankCommissions
            }
        });
        
        // Verificar si hay items sin commission_amount
        const itemsWithoutCommission = saleItems.filter(si => {
            const sale = todaySales.find(s => s.id === si.sale_id);
            return sale && (si.commission_amount === undefined || si.commission_amount === null);
        });
        
        if (itemsWithoutCommission.length > 0) {
            this.warnings.push({
                type: 'METRICS',
                module: 'sale_items',
                issue: `${itemsWithoutCommission.length} items de ventas de hoy sin commission_amount`,
                severity: 'MEDIA',
                note: 'Estas ventas pueden tener comisiones calculadas incorrectamente'
            });
        }
    },
    
    async checkBranchFiltering() {
        console.log('🏢 Verificando filtrado por sucursal...');
        
        const currentBranchId = typeof BranchManager !== 'undefined' 
            ? BranchManager.getCurrentBranchId() 
            : localStorage.getItem('current_branch_id');
        
        if (!currentBranchId) {
            this.warnings.push({
                type: 'BRANCH_FILTERING',
                module: 'BranchManager',
                issue: 'No hay sucursal actual seleccionada',
                severity: 'MEDIA'
            });
            return;
        }
        
        // Verificar que los módulos principales filtren por branch_id
        const modules = ['sales', 'inventory_items', 'cost_entries', 'employees'];
        
        for (const module of modules) {
            try {
                const allItems = await DB.getAll(module) || [];
                const branchItems = allItems.filter(item => {
                    const itemBranchId = item.branch_id != null ? String(item.branch_id) : null;
                    return itemBranchId === String(currentBranchId);
                });
                
                this.results.push({
                    type: 'BRANCH_FILTERING',
                    module: module,
                    total: allItems.length,
                    currentBranch: branchItems.length,
                    otherBranches: allItems.length - branchItems.length
                });
            } catch (e) {
                this.warnings.push({
                    type: 'BRANCH_FILTERING',
                    module: module,
                    issue: `Error al verificar: ${e.message}`,
                    severity: 'BAJA'
                });
            }
        }
    },
    
    async checkCommissionCalculation() {
        console.log('💰 Verificando cálculo de comisiones...');
        
        // Verificar que existe la función calculateCommission
        if (typeof Utils === 'undefined' || typeof Utils.calculateCommission !== 'function') {
            this.errors.push({
                type: 'COMMISSION_CALCULATION',
                module: 'Utils',
                issue: 'La función Utils.calculateCommission no existe',
                severity: 'CRITICA'
            });
            return;
        }
        
        // Verificar que existen reglas de comisión
        const commissionRules = await DB.getAll('commission_rules') || [];
        if (commissionRules.length === 0) {
            this.warnings.push({
                type: 'COMMISSION_CALCULATION',
                module: 'commission_rules',
                issue: 'No hay reglas de comisión configuradas',
                severity: 'ALTA',
                note: 'Las comisiones se calcularán como 0'
            });
        }
        
        // Verificar que las ventas recientes tienen comisiones calculadas
        const recentSales = await DB.getAll('sales') || [];
        const last10Sales = recentSales
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);
        
        const saleItems = await DB.getAll('sale_items') || [];
        let salesWithCommissions = 0;
        let salesWithoutCommissions = 0;
        
        for (const sale of last10Sales) {
            const items = saleItems.filter(si => si.sale_id === sale.id);
            const hasCommissions = items.some(item => item.commission_amount !== undefined && item.commission_amount !== null);
            
            if (hasCommissions) {
                salesWithCommissions++;
            } else if (items.length > 0) {
                salesWithoutCommissions++;
            }
        }
        
        this.results.push({
            type: 'COMMISSION_CALCULATION',
            label: 'Últimas 10 ventas',
            withCommissions: salesWithCommissions,
            withoutCommissions: salesWithoutCommissions,
            totalItems: saleItems.length
        });
        
        if (salesWithoutCommissions > 0) {
            this.warnings.push({
                type: 'COMMISSION_CALCULATION',
                module: 'sales',
                issue: `${salesWithoutCommissions} de las últimas 10 ventas no tienen comisiones calculadas`,
                severity: 'MEDIA'
            });
        }
    },
    
    async checkSyncData() {
        console.log('🔄 Verificando datos de sincronización...');
        
        // Verificar queue de sincronización
        const syncQueue = await DB.query('sync_queue', 'status', 'pending') || [];
        const syncQueueFailed = await DB.query('sync_queue', 'status', 'failed') || [];
        const syncQueueSynced = await DB.query('sync_queue', 'status', 'synced') || [];
        
        this.results.push({
            type: 'SYNC',
            pending: syncQueue.length,
            failed: syncQueueFailed.length,
            synced: syncQueueSynced.length
        });
        
        if (syncQueueFailed.length > 0) {
            this.warnings.push({
                type: 'SYNC',
                module: 'sync_queue',
                issue: `${syncQueueFailed.length} items fallaron en sincronización`,
                severity: 'MEDIA'
            });
        }
        
        // Verificar que los datos eliminados estén en sync_deleted_items
        const deletedItems = await DB.getAll('sync_deleted_items') || [];
        if (deletedItems.length > 0) {
            this.results.push({
                type: 'SYNC',
                deletedItemsPending: deletedItems.length
            });
        }
    },
    
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📋 REPORTE DE AUDITORÍA');
        console.log('='.repeat(80) + '\n');
        
        console.log('✅ RESULTADOS:');
        console.log('─'.repeat(80));
        this.results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.type.toUpperCase()} - ${result.module || result.label || 'General'}:`);
            Object.entries(result).forEach(([key, value]) => {
                if (key !== 'type' && key !== 'module' && key !== 'label') {
                    console.log(`   ${key}: ${JSON.stringify(value)}`);
                }
            });
        });
        
        if (this.errors.length > 0) {
            console.log('\n❌ ERRORES CRÍTICOS:');
            console.log('─'.repeat(80));
            this.errors.forEach((error, index) => {
                console.log(`\n${index + 1}. [${error.severity}] ${error.module}: ${error.issue}`);
                if (error.items && error.items.length > 0) {
                    console.log(`   Items afectados: ${error.items.length} (mostrando primeros 5)`);
                }
            });
        }
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️ ADVERTENCIAS:');
            console.log('─'.repeat(80));
            this.warnings.forEach((warning, index) => {
                console.log(`\n${index + 1}. [${warning.severity}] ${warning.module}: ${warning.issue}`);
                if (warning.note) {
                    console.log(`   Nota: ${warning.note}`);
                }
            });
        }
        
        console.log('\n' + '='.repeat(80));
        console.log(`Total de errores: ${this.errors.length}`);
        console.log(`Total de advertencias: ${this.warnings.length}`);
        console.log('='.repeat(80) + '\n');
        
        // Exportar resultados
        const report = {
            timestamp: new Date().toISOString(),
            results: this.results,
            errors: this.errors,
            warnings: this.warnings,
            summary: {
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                criticalErrors: this.errors.filter(e => e.severity === 'CRITICA').length,
                highErrors: this.errors.filter(e => e.severity === 'ALTA').length
            }
        };
        
        // Guardar en localStorage para referencia
        localStorage.setItem('last_audit_report', JSON.stringify(report));
        
        console.log('💾 Reporte guardado en localStorage como "last_audit_report"');
        console.log('📋 Puedes accederlo con: JSON.parse(localStorage.getItem("last_audit_report"))\n');
        
        return report;
    },
    
    async fixCommonIssues() {
        console.log('🔧 Intentando corregir problemas comunes...\n');
        
        let fixed = 0;
        
        // 1. Corregir items sin commission_amount calculando retroactivamente
        const saleItems = await DB.getAll('sale_items') || [];
        const itemsWithoutCommission = saleItems.filter(si => 
            si.commission_amount === undefined || si.commission_amount === null
        );
        
        if (itemsWithoutCommission.length > 0 && typeof Utils !== 'undefined' && typeof Utils.calculateCommission === 'function') {
            console.log(`📊 Calculando comisiones para ${itemsWithoutCommission.length} items...`);
            
            const sales = await DB.getAll('sales') || [];
            const commissionRules = await DB.getAll('commission_rules') || [];
            
            for (const item of itemsWithoutCommission.slice(0, 50)) { // Limitar a 50 para no sobrecargar
                const sale = sales.find(s => s.id === item.sale_id);
                if (sale) {
                    const commissionAmount = await Utils.calculateCommission(
                        item.subtotal || 0,
                        sale.seller_id || null,
                        sale.guide_id || null
                    );
                    
                    await DB.put('sale_items', {
                        ...item,
                        commission_amount: commissionAmount
                    });
                    fixed++;
                }
            }
            
            console.log(`✅ ${fixed} items actualizados con comisiones calculadas`);
        }
        
        // 2. Corregir status inconsistente en inventory_items
        const inventory = await DB.getAll('inventory_items') || [];
        const inconsistentStatus = inventory.filter(i => {
            const stock = i.stock_actual ?? 0;
            const status = i.status || 'disponible';
            return (stock > 0 && status === 'vendida') || (stock <= 0 && status === 'disponible');
        });
        
        if (inconsistentStatus.length > 0) {
            console.log(`📦 Corrigiendo status de ${inconsistentStatus.length} items de inventario...`);
            
            for (const item of inconsistentStatus.slice(0, 50)) { // Limitar a 50
                const stock = item.stock_actual ?? 0;
                const correctStatus = stock > 0 ? 'disponible' : 'vendida';
                
                await DB.put('inventory_items', {
                    ...item,
                    status: correctStatus
                });
                fixed++;
            }
            
            console.log(`✅ ${fixed} items de inventario corregidos`);
        }
        
        console.log(`\n✅ Total de correcciones: ${fixed}`);
    }
};

// Exponer globalmente para uso en consola
window.SystemAuditor = SystemAuditor;

