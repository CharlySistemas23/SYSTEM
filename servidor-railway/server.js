// Servidor Principal - OPAL & CO POS Backend
// Servidor centralizado con WebSockets para tiempo real
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';

// Rutas
import authRoutes from './routes/auth.js';
import salesRoutes from './routes/sales.js';
import employeesRoutes from './routes/employees.js';
import inventoryRoutes from './routes/inventory.js';
import branchesRoutes from './routes/branches.js';
import customersRoutes from './routes/customers.js';
import reportsRoutes from './routes/reports.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = createServer(app);

// Configurar Socket.io para WebSockets
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para agregar io a los requests
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Inicializar base de datos
initDatabase();

// Rutas de API
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/reports', reportsRoutes);

// Ruta de salud/status
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        name: 'OPAL & CO POS Backend',
        version: '1.0.0',
        description: 'Servidor centralizado multi-tenant con tiempo real',
        endpoints: {
            auth: '/api/auth',
            sales: '/api/sales',
            employees: '/api/employees',
            inventory: '/api/inventory',
            branches: '/api/branches',
            customers: '/api/customers',
            reports: '/api/reports',
            health: '/health'
        }
    });
});

// Manejo de WebSockets
io.use(async (socket, next) => {
    // Autenticación de WebSocket
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Token no proporcionado'));
    }

    // Verificar token (mismo código que en middleware/auth.js)
    try {
        const jwt = await import('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_in_production';
        const decoded = jwt.default.verify(token, JWT_SECRET);
        
        socket.userId = decoded.userId;
        socket.branchId = decoded.branchId; // CRÍTICO: branch_id del token
        socket.username = decoded.username;
        socket.role = decoded.role;
        
        next();
    } catch (error) {
        console.error('Error verificando token WebSocket:', error);
        return next(new Error('Token inválido'));
    }
});

io.on('connection', (socket) => {
    console.log(`✅ Usuario conectado: ${socket.username} (${socket.branchId})`);

    // Unirse a la sala de su tienda (para recibir actualizaciones solo de su tienda)
    if (socket.branchId) {
        socket.join(`branch_${socket.branchId}`);
        console.log(`📍 Usuario ${socket.username} unido a sala: branch_${socket.branchId}`);
    }

    // Evento de desconexión
    socket.on('disconnect', () => {
        console.log(`❌ Usuario desconectado: ${socket.username} (${socket.branchId})`);
    });

    // Eventos personalizados (si los necesitas)
    socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Escuchar eventos de actualización del cliente
    socket.on('sale-created', (data) => {
        // Re-emitir solo a la tienda correspondiente
        if (data.branch_id) {
            io.to(`branch_${data.branch_id}`).emit('sale-created', data);
        }
    });

    socket.on('inventory-updated', (data) => {
        if (data.branch_id) {
            io.to(`branch_${data.branch_id}`).emit('inventory-updated', data);
        }
    });
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

// Puerto
const PORT = process.env.PORT || 3000;

// Iniciar servidor
server.listen(PORT, () => {
    console.log('🚀 Servidor iniciado');
    console.log(`📍 Puerto: ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 WebSockets: Habilitado`);
    console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configurado' : '⚠️  NO CONFIGURADO'}`);
    console.log(`🗄️  Base de Datos: ${process.env.DATABASE_URL ? 'Configurada' : '⚠️  NO CONFIGURADA'}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});
