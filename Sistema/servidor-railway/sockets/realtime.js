// WebSocket para tiempo real - Separado por tienda (branch_id)

module.exports = function(io) {
  io.use(async (socket, next) => {
    try {
      // Obtener token del handshake
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Token de autenticación requerido'));
      }

      // Verificar token (mismo proceso que en middleware/auth.js)
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verificar usuario en base de datos
      const db = require('../config/database');
      const userResult = await db.query(
        'SELECT id, username, branch_id, role, active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].active) {
        return next(new Error('Usuario no válido'));
      }

      const user = userResult.rows[0];

      // Agregar información del usuario al socket
      socket.userId = user.id;
      socket.branchId = user.branch_id; // IMPORTANTE: Para separar por tienda
      socket.role = user.role;

      next();
    } catch (error) {
      console.error('Error autenticando WebSocket:', error);
      next(new Error('Error de autenticación'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Cliente conectado: ${socket.userId} (Tienda: ${socket.branchId})`);

    // Unirse a la "sala" (room) de su tienda
    // Esto permite enviar eventos solo a computadoras de esa tienda
    socket.join(`branch_${socket.branchId}`);

    // Evento: Cliente solicita unirse a una sala específica (opcional, ya está en su sala)
    socket.on('join-branch', (branchId) => {
      // Solo permitir unirse a su propia tienda (seguridad)
      if (branchId === socket.branchId || socket.role === 'admin') {
        socket.join(`branch_${branchId}`);
        socket.emit('joined-branch', { branchId });
      } else {
        socket.emit('error', { message: 'No tienes permiso para acceder a esta tienda' });
      }
    });

    // Evento: Cliente solicita actualización de datos
    socket.on('request-update', async (data) => {
      const { entity, entityId } = data;
      const db = require('../config/database');

      try {
        // Obtener datos actualizados según el tipo de entidad
        let result;
        switch (entity) {
          case 'sales':
            result = await db.query(
              'SELECT * FROM sales WHERE id = $1 AND branch_id = $2',
              [entityId, socket.branchId]
            );
            if (result.rows.length > 0) {
              socket.emit('update', { entity: 'sale', data: result.rows[0] });
            }
            break;
          case 'inventory':
            result = await db.query(
              'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
              [entityId, socket.branchId]
            );
            if (result.rows.length > 0) {
              socket.emit('update', { entity: 'inventory-item', data: result.rows[0] });
            }
            break;
        }
      } catch (error) {
        console.error('Error en request-update:', error);
        socket.emit('error', { message: 'Error obteniendo datos' });
      }
    });

    // Evento: Ping/Pong para mantener conexión
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Manejo de desconexión
    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado: ${socket.userId} (Tienda: ${socket.branchId})`);
    });

    // Notificar al cliente que está conectado
    socket.emit('connected', {
      userId: socket.userId,
      branchId: socket.branchId,
      role: socket.role
    });
  });

  // Exportar función para emitir eventos desde las rutas
  return {
    emitToBranch: (branchId, event, data) => {
      io.to(`branch_${branchId}`).emit(event, data);
    },
    emitToAll: (event, data) => {
      io.emit(event, data);
    }
  };
};

