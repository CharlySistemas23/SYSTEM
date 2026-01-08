// API Client - Cliente HTTP para comunicarse con Railway
// Reemplaza las llamadas a IndexedDB con llamadas al servidor centralizado

const API = {
    // URL base del servidor
    // Si estamos en el mismo dominio que el backend (frontend servido desde Railway),
    // usar URL relativa. Si no, usar la URL configurada o la default.
    baseURL: (() => {
        // Si hay una URL configurada manualmente, usarla
        const customUrl = localStorage.getItem('api_base_url');
        if (customUrl) return customUrl;
        
        // Si estamos en Vercel o producción, usar Railway
        const currentHost = window.location.hostname;
        
        // Si estamos en el mismo dominio que Railway (frontend servido desde Railway),
        // usar URL relativa (mismo dominio, no necesita CORS)
        if (currentHost.includes('railway.app') || currentHost.includes('railway.dev')) {
            return ''; // URL relativa - mismo dominio
        }
        
        // Para Vercel, Netlify, o cualquier otro hosting, usar Railway
        // Default: URL de Railway
        return 'https://system-production-9e21.up.railway.app';
    })(),
    
    // Token JWT almacenado localmente
    token: null,
    
    // Usuario actual
    currentUser: null,
    
    // Inicializar API
    init() {
        // Cargar token desde localStorage si existe
        const savedToken = localStorage.getItem('api_token');
        if (savedToken) {
            this.token = savedToken;
        }
        
        // Cargar usuario actual
        const savedUser = localStorage.getItem('api_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
            } catch (e) {
                console.error('Error parsing saved user:', e);
            }
        }
    },
    
    // Obtener headers con autenticación
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    },
    
    // Realizar petición HTTP
    async request(endpoint, options = {}) {
        // Si baseURL está vacío (mismo dominio), usar URL relativa
        const url = this.baseURL === '' ? endpoint : `${this.baseURL}${endpoint}`;
        
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...(options.headers || {})
            }
        };
        
        try {
            const response = await fetch(url, config);
            
            // Si la respuesta no es OK, lanzar error
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
            }
            
            // Parsear respuesta JSON
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Error en petición ${endpoint}:`, error);
            throw error;
        }
    },
    
    // GET request (con filtro de sucursal para admin)
    async get(endpoint, params = {}) {
        // Si es admin y hay un selector de sucursal activo, agregar branchId
        if (typeof BranchSelector !== 'undefined' && BranchSelector.isAdmin) {
            const branchParams = BranchSelector.getQueryParams();
            params = { ...params, ...branchParams };
        }
        
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return await this.request(url, { method: 'GET' });
    },
    
    // POST request
    async post(endpoint, data = {}) {
        return await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    // PUT request
    async put(endpoint, data = {}) {
        return await this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    // DELETE request
    async delete(endpoint) {
        return await this.request(endpoint, { method: 'DELETE' });
    },
    
    // ==================== AUTENTICACIÓN ====================
    
    // Login con username y password
    async login(username, password) {
        try {
            const response = await this.post('/api/auth/login', {
                username: username.toLowerCase(),
                password: password
            });
            
            if (response.success && response.token) {
                this.token = response.token;
                this.currentUser = response.user;
                
                // Guardar token y usuario en localStorage
                localStorage.setItem('api_token', this.token);
                localStorage.setItem('api_user', JSON.stringify(this.currentUser));
                
                return response;
            } else {
                throw new Error(response.error || 'Error de autenticación');
            }
        } catch (error) {
            console.error('Error en login:', error);
            throw error;
        }
    },
    
    // Login con código de barras y PIN
    async loginBarcode(barcode, pin) {
        try {
            const response = await this.post('/api/auth/login/barcode', {
                barcode: barcode,
                pin: pin
            });
            
            if (response.success && response.token) {
                this.token = response.token;
                this.currentUser = response.user;
                
                // Guardar token y usuario
                localStorage.setItem('api_token', this.token);
                localStorage.setItem('api_user', JSON.stringify(this.currentUser));
                
                return response;
            } else {
                throw new Error(response.error || 'Error de autenticación');
            }
        } catch (error) {
            console.error('Error en login con barcode:', error);
            throw error;
        }
    },
    
    // Verificar token
    async verifyToken() {
        try {
            const response = await this.get('/api/auth/verify');
            return response.success;
        } catch (error) {
            // Token inválido
            this.logout();
            return false;
        }
    },
    
    // Logout
    logout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('api_token');
        localStorage.removeItem('api_user');
    },
    
    // ==================== VENTAS ====================
    
    // Obtener todas las ventas
    async getSales(filters = {}) {
        const response = await this.get('/api/sales', filters);
        return response.data || [];
    },
    
    // Obtener una venta por ID
    async getSale(id) {
        const response = await this.get(`/api/sales/${id}`);
        return response.data;
    },
    
    // Crear nueva venta
    async createSale(saleData) {
        const response = await this.post('/api/sales', saleData);
        return response.data;
    },
    
    // Actualizar venta
    async updateSale(id, saleData) {
        const response = await this.put(`/api/sales/${id}`, saleData);
        return response.data;
    },
    
    // Eliminar venta
    async deleteSale(id) {
        const response = await this.delete(`/api/sales/${id}`);
        return response.success;
    },
    
    // ==================== EMPLEADOS ====================
    
    // Obtener todos los empleados
    async getEmployees(filters = {}) {
        const response = await this.get('/api/employees', filters);
        return response.data || [];
    },
    
    // Obtener un empleado por ID
    async getEmployee(id) {
        const response = await this.get(`/api/employees/${id}`);
        return response.data;
    },
    
    // Crear nuevo empleado
    async createEmployee(employeeData) {
        const response = await this.post('/api/employees', employeeData);
        return response.data;
    },
    
    // Actualizar empleado
    async updateEmployee(id, employeeData) {
        const response = await this.put(`/api/employees/${id}`, employeeData);
        return response.data;
    },
    
    // Eliminar empleado
    async deleteEmployee(id) {
        const response = await this.delete(`/api/employees/${id}`);
        return response.success;
    },
    
    // ==================== INVENTARIO ====================
    
    // Obtener todos los productos
    async getInventoryItems(filters = {}) {
        const response = await this.get('/api/inventory', filters);
        return response.data || [];
    },
    
    // Obtener un producto por ID
    async getInventoryItem(id) {
        const response = await this.get(`/api/inventory/${id}`);
        return response.data;
    },
    
    // Crear nuevo producto
    async createInventoryItem(itemData) {
        const response = await this.post('/api/inventory', itemData);
        return response.data;
    },
    
    // Actualizar producto
    async updateInventoryItem(id, itemData) {
        const response = await this.put(`/api/inventory/${id}`, itemData);
        return response.data;
    },
    
    // Eliminar producto
    async deleteInventoryItem(id) {
        const response = await this.delete(`/api/inventory/${id}`);
        return response.success;
    },
    
    // ==================== CLIENTES ====================
    
    // Obtener todos los clientes
    async getCustomers(filters = {}) {
        const response = await this.get('/api/customers', filters);
        return response.data || [];
    },
    
    // Obtener un cliente por ID
    async getCustomer(id) {
        const response = await this.get(`/api/customers/${id}`);
        return response.data;
    },
    
    // Crear nuevo cliente
    async createCustomer(customerData) {
        const response = await this.post('/api/customers', customerData);
        return response.data;
    },
    
    // Actualizar cliente
    async updateCustomer(id, customerData) {
        const response = await this.put(`/api/customers/${id}`, customerData);
        return response.data;
    },
    
    // Eliminar cliente
    async deleteCustomer(id) {
        const response = await this.delete(`/api/customers/${id}`);
        return response.success;
    },
    
    // ==================== SUCURSALES ====================
    
    // Obtener todas las sucursales
    async getBranches() {
        const response = await this.get('/api/branches');
        return response.data || [];
    },
    
    // Obtener una sucursal por ID
    async getBranch(id) {
        const response = await this.get(`/api/branches/${id}`);
        return response.data;
    },
    
    // Crear nueva sucursal (solo admin)
    async createBranch(branchData) {
        const response = await this.post('/api/branches', branchData);
        return response.data;
    },
    
    // Actualizar sucursal (solo admin)
    async updateBranch(id, branchData) {
        const response = await this.put(`/api/branches/${id}`, branchData);
        return response.data;
    },
    
    // Eliminar sucursal (solo admin)
    async deleteBranch(id) {
        const response = await this.delete(`/api/branches/${id}`);
        return response.success;
    },
    
    // ==================== REPORTES ====================
    
    // Obtener dashboard KPI
    async getDashboardKPIs(filters = {}) {
        const response = await this.get('/api/reports/dashboard', filters);
        return response.data;
    },
    
    // Obtener reporte de comisiones
    async getCommissionsReport(filters = {}) {
        const response = await this.get('/api/reports/commissions', filters);
        return response.data;
    },
    
    // Obtener ventas por vendedor
    async getSalesBySeller(filters = {}) {
        const response = await this.get('/api/reports/sales-by-seller', filters);
        return response.data;
    },
    
    // Obtener ventas por guía
    async getSalesByGuide(filters = {}) {
        const response = await this.get('/api/reports/sales-by-guide', filters);
        return response.data;
    },
    
    // ==================== USUARIOS ====================
    
    async getUsers(filters = {}) {
        const response = await this.get('/api/users', filters);
        return response.data || [];
    },
    
    async getUser(id) {
        const response = await this.get(`/api/users/${id}`);
        return response.data;
    },
    
    async createUser(userData) {
        const response = await this.post('/api/users', userData);
        return response.data;
    },
    
    async updateUser(id, userData) {
        const response = await this.put(`/api/users/${id}`, userData);
        return response.data;
    },
    
    async deleteUser(id) {
        const response = await this.delete(`/api/users/${id}`);
        return response.success;
    },
    
    async resetUserPin(id, pin) {
        const response = await this.post(`/api/users/${id}/reset-pin`, { pin });
        return response.success;
    },
    
    // ==================== REPARACIONES ====================
    
    async getRepairs(filters = {}) {
        const response = await this.get('/api/repairs', filters);
        return response.data || [];
    },
    
    async getRepair(id) {
        const response = await this.get(`/api/repairs/${id}`);
        return response.data;
    },
    
    async createRepair(repairData) {
        const response = await this.post('/api/repairs', repairData);
        return response.data;
    },
    
    async updateRepair(id, repairData) {
        const response = await this.put(`/api/repairs/${id}`, repairData);
        return response.data;
    },
    
    async deleteRepair(id) {
        const response = await this.delete(`/api/repairs/${id}`);
        return response.success;
    },
    
    // ==================== CAJA ====================
    
    async getCashSessions(filters = {}) {
        const response = await this.get('/api/cash/sessions', filters);
        return response.data || [];
    },
    
    async getCurrentCashSession() {
        const response = await this.get('/api/cash/sessions/current');
        return response.data;
    },
    
    async createCashSession(sessionData) {
        const response = await this.post('/api/cash/sessions', sessionData);
        return response.data;
    },
    
    async closeCashSession(id) {
        const response = await this.put(`/api/cash/sessions/${id}/close`);
        return response.data;
    },
    
    async createCashMovement(movementData) {
        const response = await this.post('/api/cash/movements', movementData);
        return response.data;
    },
    
    // ==================== TIPOS DE CAMBIO ====================
    
    async getExchangeRates(filters = {}) {
        const response = await this.get('/api/exchange-rates', filters);
        return response.data || [];
    },
    
    async getCurrentExchangeRate() {
        const response = await this.get('/api/exchange-rates/current');
        return response.data;
    },
    
    async createExchangeRate(rateData) {
        const response = await this.post('/api/exchange-rates', rateData);
        return response.data;
    },
    
    // ==================== TRANSFERENCIAS ====================
    
    async getTransfers(filters = {}) {
        const response = await this.get('/api/transfers', filters);
        return response.data || [];
    },
    
    async getTransfer(id) {
        const response = await this.get(`/api/transfers/${id}`);
        return response.data;
    },
    
    async createTransfer(transferData) {
        const response = await this.post('/api/transfers', transferData);
        return response.data;
    },
    
    async confirmTransfer(id) {
        const response = await this.put(`/api/transfers/${id}/confirm`);
        return response.data;
    },
    
    // ==================== REPORTES TURÍSTICOS ====================
    
    async getTouristReports(filters = {}) {
        const response = await this.get('/api/tourist-reports', filters);
        return response.data || [];
    },
    
    async getTouristReport(id) {
        const response = await this.get(`/api/tourist-reports/${id}`);
        return response.data;
    },
    
    async createTouristReport(reportData) {
        const response = await this.post('/api/tourist-reports', reportData);
        return response.data;
    },
    
    // ==================== COSTOS ====================
    
    async getCosts(filters = {}) {
        const response = await this.get('/api/costs', filters);
        return response.data || [];
    },
    
    async createCost(costData) {
        const response = await this.post('/api/costs', costData);
        return response.data;
    },
    
    // ==================== CONFIGURACIÓN ====================
    
    async getSettings() {
        const response = await this.get('/api/settings');
        return response.data || [];
    },
    
    async getSetting(key) {
        const response = await this.get(`/api/settings/${key}`);
        return response.data;
    },
    
    async setSetting(key, value) {
        const response = await this.post('/api/settings', { key, value });
        return response.data;
    },
    
    // ==================== UPLOAD ====================
    
    async uploadImage(file, type = 'inventory') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        
        const url = this.baseURL === '' ? '/api/upload/image' : `${this.baseURL}/api/upload/image`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
            throw new Error(errorData.error || `Error ${response.status}`);
        }
        
        return await response.json();
    },
    
    // ==================== HEALTH CHECK ====================
    
    // Verificar salud del servidor
    async healthCheck() {
        try {
            const response = await this.get('/health');
            return response;
        } catch (error) {
            console.error('Error en health check:', error);
            return null;
        }
    }
};

// Inicializar API al cargar
API.init();

// Exportar globalmente
window.API = API;

