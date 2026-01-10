// WebSocket para tiempo real - Separado por tienda (branch_id)
import jwt from 'jsonwebtoken';
import { queryOne } from '../config/database.js';
import { verifyToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_in_production';

export default function setupRealtime(io) {
  // Middleware de autenticación para WebSocket
  io.use(async (socket, next) => {
    try {
      // Obtener token del handshake
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.split(' ')[1] ||
                   socket.handshake.query?.token;
      
      if (!token) {
        console.warn('⚠️ Intento de conexión WebSocket sin token:', {
          ip: socket.handshake.address,
          timestamp: new Date().toISOString()
        });
        return next(new Error('Token de autenticación requerido'));
      }

      // Verificar token usando la misma función que el middleware
      const decoded = verifyToken(token);
      
      if (!decoded) {
        console.warn('⚠️ Intento de conexión WebSocket con token inválido:', {
          ip: socket.handshake.address,
          timestamp: new Date().toISOString()
        });
        return next(new Error('Token inválido o expirado'));
      }
      
      // Verificar expiración
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        console.warn('⚠️ Intento de conexión WebSocket con token expirado:', {
          userId: decoded.userId,
          ip: socket.handshake.address,
          timestamp: new Date().toISOString()
        });
        return next(new Error('Token expirado'));
      }
      
      // Verificar usuario en base de datos
      const user = await queryOne(
        'SELECT id, username, branch_id, role, active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (!user || !user.active) {
        console.warn('⚠️ Intento de conexión WebSocket con usuario inactivo:', {
          userId: decoded.userId,
          ip: socket.handshake.address,
          timestamp: new Date().toISOString()
        });
        return next(new Error('Usuario no válido o inactivo'));
      }

      // Agregar información del usuario al socket
      socket.userId = user.id;
      socket.branchId = user.branch_id || decoded.branchId; // IMPORTANTE: Para separar por tienda
      socket.role = user.role;
      socket.username = user.username;

      next();
    } catch (error) {
      console.error('❌ Error autenticando WebSocket:', {
        error: error.message,
        ip: socket.handshake.address,
        timestamp: new Date().toISOString()
      });
      next(new Error('Error de autenticación'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Cliente WebSocket conectado: ${socket.username || socket.userId} (Tienda: ${socket.branchId})`);

    // Unirse a la "sala" (room) de su tienda
    // Esto permite enviar eventos solo a computadoras de esa tienda
    if (socket.branchId) {
      socket.join(`branch_${socket.branchId}`);
    }
    
    // Admin también puede unirse a sala global
    if (socket.role === 'admin') {
      socket.join('admin');
    }

    // Evento: Cliente solicita unirse a una sala específica (opcional, ya está en su sala)
    socket.on('join-branch', (branchId) => {
      // Solo permitir unirse a su propia tienda o si es admin
      if (branchId === socket.branchId || socket.role === 'admin') {
        socket.join(`branch_${branchId}`);
        socket.emit('joined-branch', { branchId });
        console.log(`📡 Socket ${socket.userId} se unió a branch_${branchId}`);
      } else {
        console.warn(`⚠️ Intento de unirse a branch no autorizado: ${socket.userId} intentó ${branchId}`);
        socket.emit('error', { message: 'No tienes permiso para acceder a esta tienda' });
      }
    });

    // Evento: Cliente solicita actualización de datos
    socket.on('request-update', async (data) => {
      const { entity, entityId } = data;
      
      try {
        // Obtener datos actualizados según el tipo de entidad
        let result;
        switch (entity) {
          case 'sales':
            result = await queryOne(
              'SELECT * FROM sales WHERE id = $1 AND branch_id = $2',
              [entityId, socket.branchId]
            );
            if (result) {
              socket.emit('update', { entity: 'sale', data: result });
            }
            break;
          case 'inventory':
            result = await queryOne(
              'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
              [entityId, socket.branchId]
            );
            if (result) {
              socket.emit('update', { entity: 'inventory-item', data: result });
            }
            break;
          default:
            socket.emit('error', { message: 'Tipo de entidad no soportado' });
        }
      } catch (error) {
        console.error('Error en request-update:', error);
        socket.emit('error', { message: 'Error obteniendo datos', error: error.message });
      }
    });

    // Evento: Ping/Pong para mantener conexión viva
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
    
    // Enviar ping periódico para detectar desconexiones
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping', { timestamp: Date.now() });
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Cada 30 segundos

    // Manejo de desconexión
    socket.on('disconnect', (reason) => {
      clearInterval(pingInterval);
      console.log(`❌ Cliente WebSocket desconectado: ${socket.username || socket.userId} (Tienda: ${socket.branchId}, Razón: ${reason})`);
    });
    
    // Manejo de errores del socket
    socket.on('error', (error) => {
      console.error(`❌ Error en socket ${socket.userId}:`, error);
    });

    // Notificar al cliente que está conectado
    socket.emit('connected', {
      userId: socket.userId,
      branchId: socket.branchId,
      role: socket.role,
      username: socket.username,
      timestamp: new Date().toISOString()
    });
  });
  
  // Logging de eventos WebSocket (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    io.on('connection', (socket) => {
      const originalEmit = socket.emit.bind(socket);
      socket.emit = function(event, ...args) {
        if (!['pong', 'ping'].includes(event)) {
          console.log(`📤 WebSocket emit: ${event}`, args[0]);
        }
        return originalEmit(event, ...args);
      };
    });
  }
  
  return io;
}


