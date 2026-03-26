import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

// Almacenar conexiones activas por usuario y sucursal
const activeConnections = new Map(); // userId -> Set of socketIds
const branchRooms = new Map(); // branchId -> Set of socketIds
const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN
);
const isProduction = process.env.NODE_ENV === 'production' || isRailway;
const allowUnsafeFallbackAuth = !isProduction || process.env.ALLOW_UNSAFE_FALLBACK_AUTH === 'true';
const requireTokenForMasterAdmin = isProduction && process.env.ALLOW_MASTER_ADMIN_HEADER_AUTH !== 'true';

export const setupSocketIO = (io) => {
  // Middleware de autenticación para Socket.IO (con soporte para autenticación opcional)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      // Intentar autenticación con token primero
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          // Verificar usuario
          const userResult = await query(
            `SELECT u.*, e.branch_id, e.branch_ids, e.role as employee_role
             FROM users u
             LEFT JOIN employees e ON u.employee_id = e.id
             WHERE u.id = $1 AND u.active = true`,
            [decoded.userId]
          );

          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const role = user.role || user.employee_role;
            socket.userId = user.id;
            socket.user = {
              id: user.id,
              username: user.username,
              role,
              branchId: user.branch_id,
              branchIds: user.branch_ids || (user.branch_id ? [user.branch_id] : []),
              isMasterAdmin: role === 'master_admin',
              authenticated: true
            };
            return next();
          }
        } catch (tokenError) {
          // Si el token es inválido, continuar con método alternativo
          console.warn('⚠️ Token inválido en Socket.IO, intentando autenticación alternativa');
        }
      }
      
      // Método alternativo: autenticación por username y branch_id
      const username = socket.handshake.auth.username || socket.handshake.headers['x-username'];
      const branchId = socket.handshake.auth.branchId || socket.handshake.headers['x-branch-id'];
      
      if (username) {
        const userResult = await query(
          `SELECT u.*, e.branch_id, e.branch_ids, e.role as employee_role
           FROM users u
           LEFT JOIN employees e ON u.employee_id = e.id
           WHERE u.username = $1 AND u.active = true`,
          [username]
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          const role = user.role || user.employee_role;
          const isMasterAdmin = role === 'master_admin';

          if (isMasterAdmin && requireTokenForMasterAdmin) {
            return next(new Error('master_admin requiere token válido en producción'));
          }

          const userBranchId = branchId || user.branch_id;
          socket.userId = user.id;
          socket.user = {
            id: user.id,
            username: user.username,
            role,
            branchId: userBranchId,
            branchIds: user.branch_ids || (user.branch_id ? [user.branch_id] : []),
            isMasterAdmin,
            authenticated: false
          };
          return next();
        } else {
          if (!allowUnsafeFallbackAuth) {
            return next(new Error('Usuario no válido para conexión Socket.IO'));
          }

          // Usuario temporal solo en modo fallback inseguro
          socket.userId = null;
          socket.user = {
            id: null,
            username: username,
            role: 'employee',
            branchId: branchId || null,
            branchIds: branchId ? [branchId] : [],
            isMasterAdmin: false,
            authenticated: false,
            isTemporary: true
          };
          return next();
        }
      }
      
      if (!allowUnsafeFallbackAuth) {
        return next(new Error('Autenticación requerida para Socket.IO'));
      }

      // Solo en modo fallback inseguro
      socket.userId = null;
      socket.user = {
        id: null,
        username: 'anonymous',
        role: 'employee',
        branchId: branchId || null,
        branchIds: branchId ? [branchId] : [],
        isMasterAdmin: false,
        authenticated: false,
        isTemporary: true
      };
      next();
    } catch (error) {
      console.error('Error en autenticación Socket.IO:', error);
        if (!allowUnsafeFallbackAuth) {
          return next(new Error('Error en autenticación Socket.IO'));
        }

        // Modo degradado solo en fallback inseguro
      socket.userId = null;
      socket.user = {
        id: null,
        username: 'anonymous',
        role: 'employee',
        branchId: null,
        branchIds: [],
        isMasterAdmin: false,
        authenticated: false,
        isTemporary: true
      };
      next();
    }
  });

  io.on('connection', async (socket) => {
    console.log(`✅ Cliente conectado: ${socket.userId} (${socket.user.username})`);

    // Registrar conexión
    if (!activeConnections.has(socket.userId)) {
      activeConnections.set(socket.userId, new Set());
    }
    activeConnections.get(socket.userId).add(socket.id);

    // Unirse a la sala del usuario para recibir eventos de sus propias capturas
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      console.log(`✅ Usuario ${socket.userId} unido a sala user:${socket.userId}`);
    }

    // Unirse a salas de sucursales
    if (socket.user.isMasterAdmin) {
      // Admin maestro se une a todas las sucursales activas automáticamente
      socket.join('master_admin');
      
      // Obtener todas las sucursales (activas e inactivas) para master admin
      // Master admin debe ver todas para poder gestionarlas
      try {
        const branchesResult = await query(
          'SELECT id, name, code, active, address, phone, email, created_at FROM branches ORDER BY name'
        );
        
        const subscribedBranches = [];
        if (branchesResult && branchesResult.rows && branchesResult.rows.length > 0) {
          branchesResult.rows.forEach(branch => {
            const branchId = branch.id;
            const roomName = `branch:${branchId}`;
            const inventoryRoom = `inventory:${branchId}`;
            const salesRoom = `sales:${branchId}`;
            
            // Unirse a todas las salas de esta sucursal
            socket.join(roomName);
            socket.join(inventoryRoom);
            socket.join(salesRoom);
            
            subscribedBranches.push({
              id: branchId,
              name: branch.name,
              code: branch.code,
              active: branch.active,
              address: branch.address,
              phone: branch.phone,
              email: branch.email,
              created_at: branch.created_at
            });
          });
        }
        
        console.log(`✅ Master admin suscrito a ${subscribedBranches.length} sucursales${subscribedBranches.length > 0 ? ': ' + subscribedBranches.map(b => b.name).join(', ') : ' (no hay sucursales activas)'}`);
        socket.emit('joined_room', { 
          room: 'master_admin', 
          allBranches: true,
          branches: subscribedBranches
        });
      } catch (error) {
        console.error('❌ Error suscribiendo master admin a sucursales:', error);
        socket.emit('joined_room', { 
          room: 'master_admin', 
          allBranches: false,
          branches: [],
          error: error.message
        });
      }
    } else {
      // Usuarios normales se unen solo a sus sucursales
      const branchIds = socket.user.branchIds || [];
      branchIds.forEach(branchId => {
        const roomName = `branch:${branchId}`;
        socket.join(roomName);
        
        if (!branchRooms.has(branchId)) {
          branchRooms.set(branchId, new Set());
        }
        branchRooms.get(branchId).add(socket.id);
        
        socket.emit('joined_room', { room: roomName });
      });
    }

    // Suscribirse a eventos de inventario
    socket.on('subscribe_inventory', (data) => {
      const { branchId } = data;
      
      if (socket.user.isMasterAdmin || socket.user.branchIds?.includes(branchId)) {
        socket.join(`inventory:${branchId}`);
        socket.emit('subscribed', { channel: `inventory:${branchId}` });
      }
    });

    // Suscribirse a eventos de ventas
    socket.on('subscribe_sales', (data) => {
      const { branchId } = data;
      
      if (socket.user.isMasterAdmin || socket.user.branchIds?.includes(branchId)) {
        socket.join(`sales:${branchId}`);
        socket.emit('subscribed', { channel: `sales:${branchId}` });
      }
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado: ${socket.userId}`);

      // Remover de conexiones activas
      if (activeConnections.has(socket.userId)) {
        activeConnections.get(socket.userId).delete(socket.id);
        if (activeConnections.get(socket.userId).size === 0) {
          activeConnections.delete(socket.userId);
        }
      }

      // Remover de salas de sucursales
      const branchIds = socket.user.branchIds || [];
      branchIds.forEach(branchId => {
        if (branchRooms.has(branchId)) {
          branchRooms.get(branchId).delete(socket.id);
          if (branchRooms.get(branchId).size === 0) {
            branchRooms.delete(branchId);
          }
        }
      });
    });
  });
};

// Función para emitir eventos a una sucursal específica
export const emitToBranch = (io, branchId, event, data) => {
  io.to(`branch:${branchId}`).emit(event, data);
  // También emitir a admin maestro
  io.to('master_admin').emit(event, { ...data, branchId });
};

// Función para emitir eventos de inventario
export const emitInventoryUpdate = (io, branchId, action, item) => {
  emitToBranch(io, branchId, 'inventory_updated', {
    action, // created, updated, deleted, stock_changed
    item,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de ventas
export const emitSaleUpdate = (io, branchId, action, sale) => {
  emitToBranch(io, branchId, 'sale_updated', {
    action, // created, updated, cancelled, completed
    sale,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos a todos (admin maestro)
export const emitToAll = (io, event, data) => {
  io.emit(event, data);
};

// Función para emitir eventos de sucursales
export const emitBranchUpdate = (io, action, branch) => {
  // Emitir a todos los usuarios conectados (master admin y usuarios de esa sucursal)
  io.to('master_admin').emit('branch_updated', {
    action, // created, updated, deleted, activated, deactivated
    branch,
    timestamp: new Date().toISOString()
  });
  
  // También emitir a usuarios de esa sucursal específica
  if (branch.id) {
    io.to(`branch:${branch.id}`).emit('branch_updated', {
      action,
      branch,
      timestamp: new Date().toISOString()
    });
  }
};

// Función para emitir eventos de reparaciones
export const emitRepairUpdate = (io, branchId, action, repair) => {
  emitToBranch(io, branchId, 'repair_updated', {
    action, // created, updated, completed, cancelled
    repair,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de clientes
export const emitCustomerUpdate = (io, branchId, action, customer) => {
  emitToBranch(io, branchId, 'customer_updated', {
    action, // created, updated, deleted
    customer,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de proveedores
export const emitSupplierUpdate = (io, action, supplier, user) => {
  const branchId = supplier.branch_id;
  emitToBranch(io, branchId, 'supplier_updated', {
    action, // created, updated, deleted
    supplier,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de transferencias
export const emitTransferUpdate = (io, branchId, action, transfer) => {
  emitToBranch(io, branchId, 'transfer_updated', {
    action, // created, sent, received, cancelled
    transfer,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de costos
export const emitCostUpdate = (io, branchId, action, cost) => {
  emitToBranch(io, branchId, 'cost_updated', {
    action, // created, updated, deleted
    cost,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de sesiones de caja
export const emitCashSessionUpdate = (io, branchId, action, session) => {
  emitToBranch(io, branchId, 'cash_session_updated', {
    action, // opened, closed
    session,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de movimientos de caja
export const emitCashMovementUpdate = (io, branchId, action, movement) => {
  emitToBranch(io, branchId, 'cash_movement_updated', {
    action, // created
    movement,
    branchId,
    timestamp: new Date().toISOString()
  });
};

// Función para emitir eventos de empleados (por sucursal o solo master_admin)
export const emitEmployeeUpdate = (io, branchId, action, employee) => {
  const payload = {
    action, // created, updated, deleted
    employee,
    branchId: branchId || employee?.branch_id || null,
    timestamp: new Date().toISOString()
  };
  if (branchId) {
    emitToBranch(io, branchId, 'employee_updated', payload);
  } else {
    io.to('master_admin').emit('employee_updated', payload);
  }
};

// Función para emitir eventos de usuarios (global: todos los admins)
export const emitUserUpdate = (io, action, user) => {
  io.to('master_admin').emit('user_updated', {
    action, // created, updated, deleted
    user,
    timestamp: new Date().toISOString()
  });
};
