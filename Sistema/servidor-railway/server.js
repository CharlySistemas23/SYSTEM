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

// Configurar variables por defecto si no están definidas
process.env.JWT_SECRET = process.env.JWT_SECRET || 'opal_co_jwt_secret_change_in_production_2024';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
const server = createServer(app);

// Configurar Socket.io para WebSockets
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Permitir requests sin origin (archivos locales file://, Postman, etc.)
            // 'null' es el valor que el navegador envía cuando se abre desde file://
            if (!origin || origin === 'null') {
                return callback(null, true);
            }
            
            const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
            
            if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Permitir requests sin origin (archivos locales file://, Postman, etc.)
        // 'null' es el valor que el navegador envía cuando se abre desde file://
        if (!origin || origin === 'null') {
            return callback(null, true);
        }
        
        // Si CORS_ORIGIN está configurado, verificar contra la lista
        const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
        
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
// Manejar preflight OPTIONS requests explícitamente
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para agregar io a los requests
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Rutas de API (definidas antes de iniciar servidor)
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
        environment: process.env.NODE_ENV || 'development',
        database: process.env.DATABASE_URL ? 'connected' : 'not configured'
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

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

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
        const JWT_SECRET = process.env.JWT_SECRET || 'opal_co_jwt_secret_change_in_production_2024';
        const decoded = jwt.default.verify(token, JWT_SECRET);
        
        socket.userId = decoded.userId;
        socket.branchId = decoded.branchId; // CRÍTICO: branch_id del token
        socket.username = decoded.username;
        socket.role = decoded.role;
        
        next();
    } catch (error) {
        console.error('Error verificando token WebSocket:', error.message);
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

    // Eventos personalizados
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

// Función para esperar conexión a BD con reintentos
async function waitForDatabase(maxRetries = 10, delay = 2000) {
    const { query } = await import('./config/database.js');
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            await query('SELECT NOW()');
            return true;
        } catch (error) {
            if (i < maxRetries - 1) {
                console.log(`⏳ Esperando conexión a base de datos... (intento ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    return false;
}

// Función para verificar si las tablas existen
async function checkTablesExist() {
    try {
        const { query } = await import('./config/database.js');
        await query('SELECT 1 FROM catalog_branches LIMIT 1');
        return true;
    } catch (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
            return false;
        }
        throw error;
    }
}

// Función principal para iniciar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor OPAL & CO POS Backend...');
        
        // Inicializar base de datos
        initDatabase();
        
        // Esperar a que la base de datos esté disponible
        console.log('📡 Conectando a base de datos...');
        await waitForDatabase();
        console.log('✅ Base de datos conectada');
        
        // Verificar si las tablas existen
        const tablesExist = await checkTablesExist();
        
        if (!tablesExist) {
            console.log('🔄 Tablas no encontradas - ejecutando migración automática...');
            try {
                const { migrate } = await import('./database/migrate-auto.js');
                await migrate();
                console.log('✅ Migración automática completada exitosamente');
            } catch (migrateError) {
                console.error('⚠️  Error en migración automática:', migrateError.message);
                console.log('💡 Nota: El servidor iniciará pero necesitarás ejecutar: npm run migrate');
                // Continuar aunque falle la migración (puede que el usuario la ejecute manualmente)
            }
        } else {
            console.log('✅ Base de datos verificada - tablas existentes');
        }
        
        // Iniciar servidor HTTP
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log('');
            console.log('═══════════════════════════════════════════');
            console.log('✅ SERVIDOR INICIADO EXITOSAMENTE');
            console.log('═══════════════════════════════════════════');
            console.log(`📍 Puerto: ${PORT}`);
            console.log(`🌐 Ambiente: ${process.env.NODE_ENV}`);
            console.log(`📡 WebSockets: Habilitado`);
            console.log(`🔐 JWT: ${process.env.JWT_SECRET !== 'opal_co_jwt_secret_change_in_production_2024' ? '✅ Configurado' : '⚠️  Usando default (configura JWT_SECRET)'}`);
            console.log(`🗄️  Base de Datos: ${process.env.DATABASE_URL ? '✅ Configurada' : '⚠️  NO CONFIGURADA'}`);
            console.log(`🌍 CORS: ${process.env.CORS_ORIGIN || '* (todos)'}`);
            console.log('═══════════════════════════════════════════');
            console.log('');
        });
    } catch (error) {
        console.error('');
        console.error('❌ ERROR CRÍTICO INICIANDO SERVIDOR');
        console.error('═══════════════════════════════════════════');
        console.error('Mensaje:', error.message);
        if (error.code) {
            console.error('Código:', error.code);
        }
        console.error('');
        console.error('💡 Verifica:');
        console.error('   1. Que DATABASE_URL esté configurada en Railway');
        console.error('   2. Que PostgreSQL esté conectado al proyecto');
        console.error('   3. Revisa los logs de Railway para más detalles');
        console.error('═══════════════════════════════════════════');
        console.error('');
        
        // Intentar iniciar el servidor de todas formas (puede que solo falte migración)
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`⚠️  Servidor iniciado en puerto ${PORT} pero puede tener problemas de conexión`);
        });
    }
}

// Iniciar servidor
startServer();

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error.message);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    process.exit(1);
});
