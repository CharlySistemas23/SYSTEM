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
        const apiUrl = API.baseURL;
        // Si la URL está vacía (mismo dominio), usar undefined para que Socket.io use el dominio actual
        // Si tiene valor, usar esa URL
        return apiUrl === '' ? undefined : apiUrl;
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
        
        // Si ya hay una conexión en progreso, esperar
        if (this.socket && !this.connected) {
            console.log('Conexión WebSocket en progreso, esperando...');
            return;
        }
        
        try {
            // Desconectar socket anterior si existe
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }
            
            // Crear nueva conexión con manejo mejorado de errores
            this.socket = window.io(this.serverURL, {
                auth: {
                    token: token
                },
                transports: ['websocket', 'polling'], // Intentar websocket primero, luego polling
                reconnection: true,
                reconnectionDelay: this.reconnectDelay,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelayMax: 10000,
                timeout: 20000, // Timeout de conexión
                forceNew: false // Reutilizar conexión si es posible
            });
            
            // Eventos de conexión
            this.socket.on('connect', () => {
                console.log('✅ WebSocket conectado');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connection-status', { connected: true });
            });
            
            this.socket.on('disconnect', (reason) => {
                // No loguear si es un disconnect normal antes de conectar
                if (reason !== 'io client disconnect' && reason !== 'transport close') {
                    console.log('❌ WebSocket desconectado:', reason);
                }
                this.connected = false;
                this.emit('connection-status', { connected: false, reason });
            });
            
            this.socket.on('connect_error', (error) => {
                // Solo loguear errores importantes, no warnings de conexión inicial
                if (error.message && !error.message.includes('xhr poll error')) {
                    console.warn('⚠️ Error conectando WebSocket:', error.message);
                }
                this.connected = false;
                this.reconnectAttempts++;
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('⚠️ Máximo de intentos de reconexión alcanzado');
                    // Intentar reconectar después de un delay más largo
                    setTimeout(() => {
                        if (!this.connected) {
                            console.log('🔄 Intentando reconexión manual...');
                            this.reconnectAttempts = 0;
                            const newToken = API.token || localStorage.getItem('api_token');
                            if (newToken) {
                                this.connect(newToken);
                            }
                        }
                    }, 30000); // Esperar 30 segundos antes de reintentar
                }
            });
            
            // Manejar reconexión exitosa
            this.socket.on('reconnect', (attemptNumber) => {
                console.log(`✅ WebSocket reconectado después de ${attemptNumber} intentos`);
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connection-status', { connected: true, reconnected: true });
            });
            
            // Manejar evento 'connected' del servidor
            this.socket.on('connected', (data) => {
                console.log('✅ WebSocket autenticado:', data);
                this.connected = true;
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
        
        // Transferencia creada/actualizada
        this.socket.on('transfer-created', (data) => {
            console.log('📦 Nueva transferencia creada:', data);
            this.emit('transfer-created', data);
        });
        
        this.socket.on('transfer-updated', (data) => {
            console.log('📝 Transferencia actualizada:', data);
            this.emit('transfer-updated', data);
        });
        
        // Reparación creada/actualizada
        this.socket.on('repair-created', (data) => {
            console.log('🔧 Nueva reparación creada:', data);
            this.emit('repair-created', data);
        });
        
        this.socket.on('repair-updated', (data) => {
            console.log('📝 Reparación actualizada:', data);
            this.emit('repair-updated', data);
        });
        
        // Sesión de caja creada/actualizada
        this.socket.on('cash-session-created', (data) => {
            console.log('💰 Nueva sesión de caja creada:', data);
            this.emit('cash-session-created', data);
        });
        
        this.socket.on('cash-session-updated', (data) => {
            console.log('📝 Sesión de caja actualizada:', data);
            this.emit('cash-session-updated', data);
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
        
        // Sucursal creada/actualizada/eliminada
        this.socket.on('branch-created', (data) => {
            console.log('🏢 Nueva sucursal creada:', data);
            this.emit('branch-created', data);
        });
        
        this.socket.on('branch-updated', (data) => {
            console.log('📝 Sucursal actualizada:', data);
            this.emit('branch-updated', data);
        });
        
        this.socket.on('branch-deleted', (data) => {
            console.log('🗑️ Sucursal eliminada:', data);
            this.emit('branch-deleted', data);
        });
        
        // Vendedor creado/actualizado/eliminado
        this.socket.on('seller-created', (data) => {
            console.log('👤 Nuevo vendedor creado:', data);
            this.emit('seller-created', data);
        });
        
        this.socket.on('seller-updated', (data) => {
            console.log('📝 Vendedor actualizado:', data);
            this.emit('seller-updated', data);
        });
        
        this.socket.on('seller-deleted', (data) => {
            console.log('🗑️ Vendedor eliminado:', data);
            this.emit('seller-deleted', data);
        });
        
        // Guía creado/actualizado/eliminado
        this.socket.on('guide-created', (data) => {
            console.log('👤 Nueva guía creada:', data);
            this.emit('guide-created', data);
        });
        
        this.socket.on('guide-updated', (data) => {
            console.log('📝 Guía actualizada:', data);
            this.emit('guide-updated', data);
        });
        
        this.socket.on('guide-deleted', (data) => {
            console.log('🗑️ Guía eliminada:', data);
            this.emit('guide-deleted', data);
        });
        
        // Agencia creada/actualizada/eliminada
        this.socket.on('agency-created', (data) => {
            console.log('🏢 Nueva agencia creada:', data);
            this.emit('agency-created', data);
        });
        
        this.socket.on('agency-updated', (data) => {
            console.log('📝 Agencia actualizada:', data);
            this.emit('agency-updated', data);
        });
        
        this.socket.on('agency-deleted', (data) => {
            console.log('🗑️ Agencia eliminada:', data);
            this.emit('agency-deleted', data);
        });
        
        // Regla de llegada creada/actualizada/eliminada
        this.socket.on('arrival-rate-rule-created', (data) => {
            console.log('📋 Nueva regla de llegada creada:', data);
            this.emit('arrival-rate-rule-created', data);
        });
        
        this.socket.on('arrival-rate-rule-updated', (data) => {
            console.log('📝 Regla de llegada actualizada:', data);
            this.emit('arrival-rate-rule-updated', data);
        });
        
        this.socket.on('arrival-rate-rule-deleted', (data) => {
            console.log('🗑️ Regla de llegada eliminada:', data);
            this.emit('arrival-rate-rule-deleted', data);
        });
        
        // Llegada de agencia creada
        this.socket.on('agency-arrival-created', (data) => {
            console.log('📥 Nueva llegada de agencia registrada:', data);
            this.emit('agency-arrival-created', data);
        });
        
        // Tipo de cambio actualizado/creado/eliminado
        this.socket.on('exchange-rate-created', (data) => {
            console.log('💱 Nuevo tipo de cambio creado:', data);
            this.emit('exchange-rate-created', data);
        });
        
        this.socket.on('exchange-rate-updated', (data) => {
            console.log('💱 Tipo de cambio actualizado:', data);
            this.emit('exchange-rate-updated', data);
        });
        
        this.socket.on('exchange-rate-deleted', (data) => {
            console.log('🗑️ Tipo de cambio eliminado:', data);
            this.emit('exchange-rate-deleted', data);
        });
        
        // Usuario creado/actualizado/eliminado
        this.socket.on('user-created', (data) => {
            console.log('👤 Nuevo usuario creado:', data);
            this.emit('user-created', data);
        });
        
        this.socket.on('user-updated', (data) => {
            console.log('📝 Usuario actualizado:', data);
            this.emit('user-updated', data);
        });
        
        this.socket.on('user-deleted', (data) => {
            console.log('🗑️ Usuario eliminado:', data);
            this.emit('user-deleted', data);
        });
        
        // Cliente eliminado
        this.socket.on('customer-deleted', (data) => {
            console.log('🗑️ Cliente eliminado:', data);
            this.emit('customer-deleted', data);
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

