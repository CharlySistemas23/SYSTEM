// Database Manager - Backend API Wrapper
// Reemplaza IndexedDB con llamadas al servidor centralizado (Railway)
// Mantiene la misma interfaz para compatibilidad con el código existente

const DB = {
    initialized: false,
    
    // Mapeo de stores de IndexedDB a endpoints de API
    storeToEndpoint: {
        'employees': '/api/employees',
        'users': '/api/users',
        'inventory_items': '/api/inventory',
        'sales': '/api/sales',
        'sale_items': '/api/sales/items', // Items de venta (se crean junto con la venta)
        'payments': '/api/sales/payments', // Pagos de venta (se crean junto con la venta)
        'customers': '/api/customers',
        'repairs': '/api/repairs',
        'catalog_branches': '/api/branches',
        'catalog_agencies': '/api/catalogs/agencies',
        'catalog_guides': '/api/catalogs/guides',
        'catalog_sellers': '/api/catalogs/sellers',
        'cash_sessions': '/api/cash/sessions',
        'cash_movements': '/api/cash/movements',
        'exchange_rates_daily': '/api/exchange-rates',
        'arrival_rate_rules': '/api/arrival-rules',
        'agency_arrivals': '/api/arrival-rules/arrivals',
        'inventory_transfers': '/api/transfers',
        'tourist_reports': '/api/tourist-reports',
        'tourist_report_lines': '/api/tourist-reports/lines', // Líneas de reporte turístico (filtrado por reportId o saleId)
        'cost_entries': '/api/costs',
        'settings': '/api/settings',
        'payment_methods': '/api/settings/payment-methods',
        'commission_rules': '/api/settings/commission-rules'
    },
    
    // Inicializar (ya no necesita IndexedDB)
    async init() {
        if (this.initialized) return true;
        
        // Verificar que API esté disponible
        if (typeof API === 'undefined') {
            console.error('API no está disponible. Asegúrate de que api.js se cargue antes que db.js');
            return false;
        }
        
        this.initialized = true;
        console.log('✅ DB Manager inicializado (usando Backend API)');
        return true;
    },
    
    // Helper: Obtener endpoint para un store
    getEndpoint(storeName) {
        return this.storeToEndpoint[storeName] || null;
    },
    
    // Helper: Obtener método HTTP según la operación
    getHttpMethod(operation, storeName) {
        if (operation === 'get' || operation === 'getAll' || operation === 'query' || operation === 'count') {
            return 'GET';
        } else if (operation === 'add' || operation === 'put') {
            // PUT si tiene ID (actualizar), POST si no (crear)
            return 'PUT';
        } else if (operation === 'delete') {
            return 'DELETE';
        }
        return 'GET';
    },
    
    // ==================== OPERACIONES CRUD ====================
    
    // Agregar (crear nuevo)
    async add(storeName, data, options = {}) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            return await this.putLocal(storeName, data);
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            console.warn(`Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            return await this.putLocal(storeName, data);
        }
        
        try {
            const response = await API.post(endpoint, data);
            return response.data || response;
        } catch (error) {
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para ${storeName}, usando localStorage como fallback`);
                return await this.putLocal(storeName, data);
            }
            // No loggear errores de autenticación esperados (401 sin token)
            if (!error.requiresAuth && !(error.message && error.message.includes('Token no proporcionado'))) {
            console.error(`Error agregando a ${storeName}:`, error);
            }
            throw error;
        }
    },
    
    // Obtener por ID
    async get(storeName, key) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            return await this.getLocal(storeName, key);
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            // Si no tiene endpoint, intentar usar localStorage como fallback
            console.warn(`Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            return await this.getLocal(storeName, key);
        }
        
        try {
            const response = await API.get(`${endpoint}/${key}`);
            return response.data || null;
        } catch (error) {
            // Si no existe, retornar null (comportamiento compatible)
            if (error.message && error.message.includes('404')) {
                return null;
            }
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para ${storeName}, usando localStorage como fallback`);
                return await this.getLocal(storeName, key);
            }
            console.error(`Error obteniendo de ${storeName}:`, error);
            return null;
        }
    },
    
    // Obtener todos
    async getAll(storeName, indexName = null, query = null, options = {}) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            return await this.getAllLocal(storeName);
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            // Si no tiene endpoint, intentar usar localStorage como fallback
            console.warn(`Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            return await this.getAllLocal(storeName);
        }
        
        try {
            // Construir parámetros de query
            const params = {};
            if (indexName && query !== null && query !== undefined) {
                params[indexName] = query;
            }
            
            // Agregar filtros adicionales desde options
            if (options.filterByBranch !== false) {
                const branchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                if (branchId) {
                    params.branchId = branchId;
                }
            }
            
            const response = await API.get(endpoint, params);
            const data = response.data || [];
            
            // Si es un objeto con array interno, extraerlo
            if (Array.isArray(data)) {
                return data;
            } else if (data.items && Array.isArray(data.items)) {
                return data.items;
            } else if (data.data && Array.isArray(data.data)) {
                return data.data;
            }
            
            return [];
        } catch (error) {
            // Si el error es que la tabla no existe, solo loguear warning y retornar array vacío
            if (error.message && (error.message.includes('no existe') || error.message.includes('does not exist') || error.message.includes('Tabla no existe') || error.message.includes('relation') && error.message.includes('does not exist'))) {
                console.warn(`⚠️ Tabla para ${storeName} no existe aún. Ejecuta la migración del backend.`);
                return []; // Retornar array vacío, no romper el flujo
            }
            
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para ${storeName}, usando localStorage como fallback`);
                return await this.getAllLocal(storeName);
            }
            
            // Error HTTP 500 generalmente indica tabla faltante
            if (error.message && error.message.includes('500')) {
                console.warn(`⚠️ Error 500 obteniendo ${storeName}. Puede ser que la tabla no exista. Ejecuta la migración.`);
                return []; // Retornar array vacío, no romper el flujo
            }
            
            console.error(`Error obteniendo todos de ${storeName}:`, error);
            return []; // Siempre retornar array vacío en caso de error para no romper el flujo
        }
    },
    
    // Actualizar o crear (put)
    async put(storeName, data, options = {}) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            return await this.putLocal(storeName, data);
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            console.warn(`Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            return await this.putLocal(storeName, data);
        }
        
        if (!data || !data.id) {
            // Si no tiene ID, es una creación
            return await this.add(storeName, data, options);
        }
        
        try {
            const response = await API.put(`${endpoint}/${data.id}`, data);
            return response.data || response;
        } catch (error) {
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para ${storeName}, usando localStorage como fallback`);
                return await this.putLocal(storeName, data);
            }
            // No loggear errores de autenticación esperados (401 sin token)
            if (!error.requiresAuth && !(error.message && error.message.includes('Token no proporcionado'))) {
            console.error(`Error actualizando en ${storeName}:`, error);
            }
            throw error;
        }
    },
    
    // Eliminar
    async delete(storeName, key) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            return await this.deleteLocal(storeName, key);
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            console.warn(`Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            return await this.deleteLocal(storeName, key);
        }
        
        try {
            await API.delete(`${endpoint}/${key}`);
            return true;
        } catch (error) {
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para ${storeName}, usando localStorage como fallback`);
                return await this.deleteLocal(storeName, key);
            }
            // No loggear errores de autenticación esperados (401 sin token)
            if (!error.requiresAuth && !(error.message && error.message.includes('Token no proporcionado'))) {
            console.error(`Error eliminando de ${storeName}:`, error);
            }
            throw error;
        }
    },
    
    // Query por índice
    async query(storeName, indexName, query, options = {}) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            const all = await this.getAllLocal(storeName);
            if (indexName && query !== null && query !== undefined) {
                return all.filter(item => item[indexName] === query);
            }
            return all;
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            console.warn(`Query: Store ${storeName} no tiene endpoint mapeado, usando localStorage`);
            const all = await this.getAllLocal(storeName);
            if (indexName && query !== null && query !== undefined) {
                return all.filter(item => item[indexName] === query);
            }
            return all;
        }
        
        try {
            // Mapeo de nombres de índices comunes a parámetros de query del API
            const paramMap = {
                'sale_id': 'saleId',
                'report_id': 'reportId',
                'employee_id': 'employeeId',
                'branch_id': 'branchId',
                'item_id': 'itemId',
                'customer_id': 'customerId',
                'barcode': 'barcode',
                'folio': 'folio',
                'sku': 'sku',
                'date': 'date'
            };
            
            const paramName = paramMap[indexName] || indexName;
            const params = {};
            if (indexName && query !== null && query !== undefined) {
                params[paramName] = query;
            }
            
            // Agregar filtros adicionales desde options
            if (options.filterByBranch !== false) {
                const branchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
                if (branchId) {
                    params.branchId = branchId;
                }
            }
            
            const response = await API.get(endpoint, params);
            const data = response.data || [];
            
            // Si es un objeto con array interno, extraerlo
            if (Array.isArray(data)) {
                return data;
            } else if (data.items && Array.isArray(data.items)) {
                return data.items;
            } else if (data.data && Array.isArray(data.data)) {
                return data.data;
            }
            
            return [];
        } catch (error) {
            // Si no hay token, usar localStorage como fallback temporal
            if (error.requiresAuth || (error.message && error.message.includes('Token no proporcionado'))) {
                console.warn(`Sin token para query ${storeName}, usando localStorage como fallback`);
                const all = await this.getAllLocal(storeName);
                if (indexName && query !== null && query !== undefined) {
                    return all.filter(item => item[indexName] === query);
                }
                return all;
            }
            console.error(`Error en query de ${storeName}:`, error);
            return [];
        }
    },
    
    // Contar
    async count(storeName, indexName = null, query = null) {
        const all = await this.getAll(storeName, indexName, query);
        return all.length;
    },
    
    // Obtener por índice único (ej: barcode, folio, etc.)
    async getByIndex(storeName, indexName, value) {
        // Para stores locales, usar localStorage
        if (this.isLocalStore(storeName)) {
            const all = await this.getAllLocal(storeName);
            return all.find(item => item[indexName] === value) || null;
        }
        
        const endpoint = this.getEndpoint(storeName);
        if (!endpoint) {
            console.warn(`getByIndex: Store ${storeName} no tiene endpoint mapeado`);
            return null;
        }
        
        try {
            // Construir query por índice
            // Mapeo de nombres de índices comunes a parámetros de query
            const paramMap = {
                'barcode': 'barcode',
                'folio': 'folio',
                'sku': 'sku',
                'username': 'username',
                'employee_id': 'employeeId',
                'sale_id': 'saleId',
                'date': 'date'
            };
            
            const paramName = paramMap[indexName] || indexName;
            const params = {};
            params[paramName] = value;
            
            const response = await API.get(endpoint, params);
            const data = response.data || [];
            
            // Si es array, buscar el que coincida exactamente y retornar el primero
            if (Array.isArray(data)) {
                const found = data.find(item => {
                    // Verificar múltiples posibles nombres del campo
                    return item[indexName] === value || 
                           item[paramName] === value ||
                           (indexName === 'barcode' && (item.barcode === value || item.code === value));
                });
                return found || (data.length > 0 ? data[0] : null);
            }
            
            // Si es un objeto, verificar que coincida
            if (data && typeof data === 'object') {
                if (data[indexName] === value || data[paramName] === value) {
                    return data;
                }
            }
            
            return null;
        } catch (error) {
            // Si no existe, retornar null (comportamiento compatible)
            return null;
        }
    },
    
    // Limpiar store (solo para casos especiales - normalmente no se usa)
    async clear(storeName) {
        console.warn(`clear() no está soportado para ${storeName} en el backend. Esta operación es peligrosa.`);
        // No implementar clear para seguridad - requeriría endpoint especial de admin
        return Promise.resolve();
    },
    
    // ==================== MÉTODOS ESPECIALES PARA STORES SIN ENDPOINT ====================
    
    // Stores locales que aún pueden usar localStorage (settings, device, etc.)
    // sync_queue, sync_logs, sync_deleted_items ELIMINADOS - ya no hay sincronización local
    localStores: ['settings', 'device', 'audit_log', 
                  'barcode_scan_history', 'barcode_print_templates', 'qa_test_runs', 'qa_coverage', 
                  'qa_errors', 'qa_fixes', 'inventory_logs', 'inventory_price_history'],
    
    // Helper para verificar si es store local
    isLocalStore(storeName) {
        return this.localStores.includes(storeName);
    },
    
    // Métodos para stores locales (usar localStorage como fallback)
    async getLocal(storeName, key) {
        try {
            const stored = localStorage.getItem(`db_${storeName}_${key}`);
            return stored ? JSON.parse(stored) : null;
            } catch (e) {
            return null;
        }
    },
    
    async putLocal(storeName, data) {
        try {
            const key = data.id || data.key || 'default';
            localStorage.setItem(`db_${storeName}_${key}`, JSON.stringify(data));
            return data;
            } catch (e) {
            console.error(`Error guardando en localStorage (${storeName}):`, e);
            throw e;
        }
    },
    
    async getAllLocal(storeName) {
        try {
            const items = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`db_${storeName}_`)) {
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        items.push(item);
                    } catch (e) {
                        // Ignorar items corruptos
                    }
                }
            }
            return items;
        } catch (e) {
            return [];
        }
    },
    
    async deleteLocal(storeName, key) {
        try {
            localStorage.removeItem(`db_${storeName}_${key}`);
        } catch (e) {
            console.error(`Error eliminando de localStorage (${storeName}):`, e);
        }
    }
};

// Inicializar automáticamente cuando esté disponible
if (typeof window !== 'undefined') {
    window.DB = DB;
    
    // Intentar inicializar cuando API esté disponible
    if (typeof API !== 'undefined' && API.init) {
        DB.init();
    } else {
        // Esperar a que API esté disponible
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (typeof API !== 'undefined') {
                    DB.init();
                }
            }, 100);
        });
    }
}
