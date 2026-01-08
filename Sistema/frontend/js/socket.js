// WebSocket Client - Cliente Socket.io para tiempo real
// Conecta con Railway para recibir actualizaciones en tiempo real

const SocketManager = {
    socket: null,
    connected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectDelay: 3000,
    
    // URL del servidor WebSocket (usa la misma que API)
    get serverURL() {
        return API.baseURL;
    },
    
    // Event listeners
    listeners: {},
    
    // Inicializar Socket.io
    async init() {
        if (!window.io) {
            // Cargar Socket.io desde CDN si no está disponible
            await this.loadSocketIO();
        }
        
        // Conectar solo si hay un token
        const token = API.token || localStorage.getItem('api_token');
        if (token) {
            this.connect(token);
        }
    },
    
    // Cargar Socket.io desde CDN
    loadSocketIO() {
        return new Promise((resolve, reject) => {
            if (window.io) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Error cargando Socket.io'));
            document.head.appendChild(script);
        });
    },
    
    // Conectar al servidor WebSocket
    connect(token) {
        if (this.socket && this.connected) {
            console.log('Socket ya está conectado');
            return;
        }
        
        try {
            // Desconectar socket anterior si existe
            if (this.socket) {
                this.socket.disconnect();
            }
            
            // Crear nueva conexión
            this.socket = window.io(this.serverURL, {
                auth: {
                    token: token
                },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelayMax: 10000
            });
            
            // Eventos de conexión
            this.socket.on('connect', () => {
                console.log('✅ WebSocket conectado');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connection-status', { connected: true });
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('❌ WebSocket desconectado:', reason);
                this.connected = false;
                this.emit('connection-status', { connected: false, reason });
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Error conectando WebSocket:', error.message);
                this.connected = false;
                this.reconnectAttempts++;
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('⚠️ Máximo de intentos de reconexión alcanzado');
                }
            });
            
            // Eventos de tiempo real del servidor
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error creando conexión WebSocket:', error);
        }
    },
    
    // Configurar listeners para eventos del servidor
    setupEventListeners() {
        if (!this.socket) return;
        
        // Venta creada
        this.socket.on('sale-created', (data) => {
            console.log('📦 Nueva venta creada:', data);
            this.emit('sale-created', data);
        });
        
        // Venta actualizada
        this.socket.on('sale-updated', (data) => {
            console.log('📝 Venta actualizada:', data);
            this.emit('sale-updated', data);
        });
        
        // Venta eliminada
        this.socket.on('sale-deleted', (data) => {
            console.log('🗑️ Venta eliminada:', data);
            this.emit('sale-deleted', data);
        });
        
        // Empleado creado
        this.socket.on('employee-created', (data) => {
            console.log('👤 Nuevo empleado creado:', data);
            this.emit('employee-created', data);
        });
        
        // Empleado actualizado
        this.socket.on('employee-updated', (data) => {
            console.log('📝 Empleado actualizado:', data);
            this.emit('employee-updated', data);
        });
        
        // Empleado eliminado
        this.socket.on('employee-deleted', (data) => {
            console.log('🗑️ Empleado eliminado:', data);
            this.emit('employee-deleted', data);
        });
        
        // Producto creado
        this.socket.on('inventory-item-created', (data) => {
            console.log('📦 Nuevo producto creado:', data);
            this.emit('inventory-item-created', data);
        });
        
        // Producto actualizado
        this.socket.on('inventory-item-updated', (data) => {
            console.log('📝 Producto actualizado:', data);
            this.emit('inventory-item-updated', data);
        });
        
        // Producto eliminado
        this.socket.on('inventory-item-deleted', (data) => {
            console.log('🗑️ Producto eliminado:', data);
            this.emit('inventory-item-deleted', data);
        });
        
        // Cliente creado
        this.socket.on('customer-created', (data) => {
            console.log('👤 Nuevo cliente creado:', data);
            this.emit('customer-created', data);
        });
        
        // Cliente actualizado
        this.socket.on('customer-updated', (data) => {
            console.log('📝 Cliente actualizado:', data);
            this.emit('customer-updated', data);
        });
        
        // Sucursal creada/actualizada
        this.socket.on('branch-created', (data) => {
            console.log('🏢 Nueva sucursal creada:', data);
            this.emit('branch-created', data);
        });
        
        this.socket.on('branch-updated', (data) => {
            console.log('📝 Sucursal actualizada:', data);
            this.emit('branch-updated', data);
        });
        
        // Pong (respuesta a ping)
        this.socket.on('pong', (data) => {
            console.log('🏓 Pong recibido:', data);
        });
    },
    
    // Desconectar
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    },
    
    // Reconectar con nuevo token
    reconnect(token) {
        this.disconnect();
        if (token) {
            this.connect(token);
        }
    },
    
    // Emitir evento local
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error en listener de ${event}:`, error);
                }
            });
        }
    },
    
    // Escuchar eventos locales
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    },
    
    // Dejar de escuchar eventos
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    },
    
    // Enviar ping al servidor
    ping() {
        if (this.socket && this.connected) {
            this.socket.emit('ping');
        }
    },
    
    // Verificar si está conectado
    isConnected() {
        return this.connected && this.socket && this.socket.connected;
    }
};

// Exportar globalmente
window.SocketManager = SocketManager;

