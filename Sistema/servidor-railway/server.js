// Servidor Principal - OPAL & CO POS Backend
// Servidor centralizado con WebSockets para tiempo real
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { initDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { autoRepairMiddleware } from './middleware/autoRepair.js';

// Para ES modules: obtener __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas
import authRoutes from './routes/auth.js';
import salesRoutes from './routes/sales.js';
import employeesRoutes from './routes/employees.js';
import inventoryRoutes from './routes/inventory.js';
import branchesRoutes from './routes/branches.js';
import customersRoutes from './routes/customers.js';
import reportsRoutes from './routes/reports.js';
import cashRoutes from './routes/cash.js';
import exchangeRatesRoutes from './routes/exchange-rates.js';
import arrivalRulesRoutes from './routes/arrival-rules.js';
import settingsRoutes from './routes/settings.js';
import repairsRoutes from './routes/repairs.js';
import transfersRoutes from './routes/transfers.js';
import touristReportsRoutes from './routes/tourist-reports.js';
import costsRoutes from './routes/costs.js';
import profitRoutes from './routes/profit.js';
import uploadRoutes from './routes/upload.js';
import usersRoutes from './routes/users.js';
import catalogsRoutes from './routes/catalogs.js';
import diagnoseRoutes from './routes/diagnose.js';
import auditRoutes from './routes/audit.js';

// Cargar variables de entorno
dotenv.config();

// Configurar variables por defecto si no están definidas
process.env.JWT_SECRET = process.env.JWT_SECRET || 'opal_co_jwt_secret_change_in_production_2024';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
const server = createServer(app);


// Origins permitidos exactos (según requerimientos)
const ALLOWED_ORIGINS = [
    'https://system-umber-psi.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
];

// Función helper para verificar origen permitido
const isOriginAllowed = (origin) => {
    if (!origin || origin === 'null') {
        // Permitir null origin solo en desarrollo
        return process.env.NODE_ENV !== 'production';
    }
    
    // Verificar origins exactos primero
    if (ALLOWED_ORIGINS.includes(origin)) {
        return true;
    }
    
    // Verificar variable de entorno CORS_ORIGIN
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
        const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
        if (allowedOrigins.includes('*')) return true;
        if (allowedOrigins.includes(origin)) return true;
    }
    
    // Permitir cualquier dominio .vercel.app, .netlify.app, .railway.app, etc. (fallback)
    if (origin.includes('.vercel.app') || 
        origin.includes('.netlify.app') || 
        origin.includes('.railway.app') ||
        origin.includes('.railway.dev')) {
        return true;
    }
    
    // Permitir localhost para desarrollo (puertos comunes)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return true;
    }
    
    return false;
};

// CRÍTICO: Manejar preflight OPTIONS PRIMERO - antes de cualquier otro middleware
// Express procesa las rutas en orden, así que esto debe ir ANTES de app.use()
app.options('*', (req, res) => {
    const origin = req.headers.origin;
    
    console.log(`🔍 OPTIONS preflight desde: ${origin} para ${req.path}`);
    
    if (isOriginAllowed(origin)) {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');
        console.log(`✅ OPTIONS: Headers CORS enviados para ${origin}`);
        res.sendStatus(200);
    } else {
        console.warn(`⚠️ OPTIONS: Origen no permitido: ${origin}`);
        res.sendStatus(403);
    }
});

// Middleware CORS personalizado - Agregar headers a TODAS las respuestas
// Este middleware DEBE ejecutarse en TODAS las peticiones
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // SIEMPRE agregar headers CORS si el origen está permitido
    if (isOriginAllowed(origin)) {
        // Agregar headers CORS a todas las respuestas
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
        
        if (origin && (origin.includes('.vercel.app') || origin.includes('.netlify.app'))) {
            console.log(`✅ CORS: Permitiendo origen: ${origin} para ${req.method} ${req.path}`);
        }
    } else {
        console.warn(`⚠️ CORS: Origen no permitido: ${origin} para ${req.method} ${req.path}`);
    }
    
    next();
});

// Middleware CORS adicional usando el paquete cors (como respaldo)
app.use(cors({
    origin: function (origin, callback) {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS: Origen rechazado: ${origin}`);
            callback(new Error(`Origen ${origin} no permitido por CORS`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400
}));

// Configurar Socket.io para WebSockets
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // Permitir ambos transportes
    allowEIO3: true // Compatibilidad con versiones anteriores
});

// Configurar módulo de tiempo real
import setupRealtime from './sockets/realtime.js';
setupRealtime(io);
console.log('✅ WebSocket configurado');

// Rate Limiting - Protección contra abusos
import { generalLimiter } from './middleware/rateLimit.js';
import { sanitizeQuery } from './utils/sanitize.js';

// Aplicar rate limiting general (antes de otras rutas)
app.use(generalLimiter);

// Sanitizar query parameters globalmente
app.use(sanitizeQuery);

// Configurar límites de payload
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        // Validar tamaño antes de parsear
        if (buf.length > 10 * 1024 * 1024) { // 10MB
            throw new Error('Payload demasiado grande');
        }
    }
}));
app.use(express.urlencoded({ 
    extended: true,
    limit: '10mb'
}));

// Middleware para agregar io a los requests
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Middleware adicional para asegurar headers CORS en todas las respuestas
app.use((req, res, next) => {
    // Asegurar que los headers CORS estén presentes en todas las respuestas
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
        // Si no están los headers, agregarlos
        if (!res.get('Access-Control-Allow-Origin')) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
    }
    next();
});

// Buscar carpeta frontend ANTES de configurar rutas
console.log('');
console.log('🔍 Buscando carpeta frontend...');
console.log(`   __dirname: ${__dirname}`);
console.log(`   process.cwd(): ${process.cwd()}`);

const possiblePaths = [
    path.join(__dirname, 'frontend'),              // servidor-railway/frontend (dentro del proyecto) - PRIORIDAD 1
    path.join(process.cwd(), 'frontend'),          // Desde el directorio de trabajo actual - PRIORIDAD 2
    path.join(__dirname, '..', 'frontend'),        // Sistema/frontend (mismo nivel) - PRIORIDAD 3
    path.join(process.cwd(), '..', 'frontend'),    // Un nivel arriba desde cwd - PRIORIDAD 4
    path.join(__dirname, '..', '..', 'frontend')   // Dos niveles arriba - PRIORIDAD 5
];

let frontendPath = null;
for (let i = 0; i < possiblePaths.length; i++) {
    const testPath = possiblePaths[i];
    console.log(`   Probando: ${testPath}`);
    if (existsSync(testPath)) {
        console.log(`      ✓ Carpeta existe`);
        const indexPath = path.join(testPath, 'index.html');
        if (existsSync(indexPath)) {
            console.log(`      ✓ index.html encontrado`);
            frontendPath = testPath;
            console.log(`✅ Carpeta frontend encontrada en: ${frontendPath}`);
            break;
        } else {
            console.log(`      ✗ index.html no encontrado`);
        }
    } else {
        console.log(`      ✗ Carpeta no existe`);
    }
}

if (!frontendPath) {
    console.warn(`⚠️  AVISO: No se encontró la carpeta frontend en ninguna de estas ubicaciones:`);
    possiblePaths.forEach(p => console.warn(`   - ${p}`));
    console.warn(`   El frontend no se servirá desde este servidor.`);
    console.warn(`   💡 Solución: Asegúrate de que la carpeta 'frontend' esté disponible en Railway.`);
    console.warn(`   Opciones:`);
    console.warn(`   1. Verificar que servidor-railway/frontend/ existe en el repositorio`);
    console.warn(`   2. Verificar que servidor-railway/frontend/index.html existe`);
    console.warn(`   3. Verificar que la carpeta frontend no esté en .gitignore`);
}
console.log('');

// Rutas de API (definidas antes de servir archivos estáticos)
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/exchange-rates', exchangeRatesRoutes);
app.use('/api/arrival-rules', arrivalRulesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/repairs', repairsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/tourist-reports', touristReportsRoutes);
app.use('/api/costs', costsRoutes);
app.use('/api/profit', profitRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/catalogs', catalogsRoutes);
app.use('/api/diagnose', diagnoseRoutes);
app.use('/api/audit', auditRoutes);

// Endpoint para obtener token CSRF
import { csrfTokenRoute, getCSRFToken } from './middleware/csrf.js';
app.get('/api/csrf-token', csrfTokenRoute);

// Ruta de salud/status (antes de servir archivos estáticos)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: process.env.DATABASE_URL ? 'connected' : 'not configured'
    });
});

// Ruta de información de API (para debugging)
app.get('/api/info', (req, res) => {
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

// Servir archivos estáticos del frontend

// Solo servir archivos estáticos si encontramos el frontend
if (frontendPath) {
    app.use(express.static(frontendPath, {
        // Configuración para archivos estáticos
        maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0', // Cache en producción
        etag: true,
        lastModified: true,
        // No servir index.html automáticamente - lo manejaremos manualmente
        index: false
    }));
}

// Ruta raíz: servir index.html del frontend
app.get('/', (req, res) => {
    if (frontendPath) {
        const indexPath = path.resolve(frontendPath, 'index.html');
        if (existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            console.error(`❌ index.html no existe en: ${indexPath}`);
            res.json({
                name: 'OPAL & CO POS Backend',
                version: '1.0.0',
                description: 'Servidor centralizado multi-tenant con tiempo real',
                error: 'Frontend index.html no encontrado en la ruta esperada.',
                frontendPath: frontendPath,
                indexPath: indexPath
            });
        }
    } else {
        // Frontend no encontrado - mostrar información del API
        res.json({
            name: 'OPAL & CO POS Backend',
            version: '1.0.0',
            description: 'Servidor centralizado multi-tenant con tiempo real',
            error: 'Frontend no encontrado. Verifica que la carpeta frontend esté disponible.',
            searchedPaths: possiblePaths,
            endpoints: {
                auth: '/api/auth',
                sales: '/api/sales',
                employees: '/api/employees',
                inventory: '/api/inventory',
                branches: '/api/branches',
                customers: '/api/customers',
                reports: '/api/reports',
                health: '/health',
                info: '/api/info'
            }
        });
    }
});

// Ruta catch-all: servir index.html para rutas no encontradas (SPA routing)
// Debe ir DESPUÉS de todas las rutas de API y archivos estáticos
app.get('*', (req, res) => {
    // Si la ruta no es una ruta de API, servir index.html
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
        if (frontendPath) {
            const indexPath = path.join(frontendPath, 'index.html');
            if (existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).json({ error: 'Frontend index.html no encontrado' });
            }
        } else {
            res.status(404).json({ error: 'Frontend no disponible. Verifica la configuración en Railway.' });
        }
    } else {
        // Para rutas de API no encontradas, devolver 404 JSON
        res.status(404).json({ error: 'Endpoint no encontrado' });
    }
});

// Middleware de auto-reparación (antes de errorHandler)
app.use((err, req, res, next) => {
    autoRepairMiddleware(err, req, res, next);
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

io.on('connection', async (socket) => {
    console.log(`✅ Usuario conectado: ${socket.username} (${socket.branchId}) - Rol: ${socket.role}`);

    // Unirse a la sala de su tienda (para recibir actualizaciones solo de su tienda)
    if (socket.branchId) {
        socket.join(`branch_${socket.branchId}`);
        console.log(`📍 Usuario ${socket.username} unido a sala: branch_${socket.branchId}`);
    }

    // Si es admin, unirse también a la sala 'branch_all' para recibir eventos de todas las tiendas
    const isAdmin = socket.role === 'admin';
    if (isAdmin) {
        socket.join('branch_all');
        console.log(`👑 Admin ${socket.username} unido a sala: branch_all (todas las sucursales)`);
        
        // También unirse a todas las salas de sucursales activas
        try {
            const { query } = await import('./config/database.js');
            const branches = await query('SELECT id FROM catalog_branches WHERE active = true');
            for (const branch of branches) {
                socket.join(`branch_${branch.id}`);
            }
            console.log(`👑 Admin unido a ${branches.length} sucursales activas`);
        } catch (error) {
            console.error('Error uniendo admin a sucursales:', error);
        }
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
        // Re-emitir a la tienda correspondiente
        if (data.branch_id) {
            io.to(`branch_${data.branch_id}`).emit('sale-created', data);
            // También emitir a admin (sala branch_all)
            io.to('branch_all').emit('sale-created', data);
        }
    });

    socket.on('inventory-updated', (data) => {
        if (data.branch_id) {
            io.to(`branch_${data.branch_id}`).emit('inventory-item-updated', data);
            // También emitir a admin
            io.to('branch_all').emit('inventory-item-updated', data);
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

// Función para verificar si las tablas críticas existen
async function checkTablesExist() {
    try {
        const { query } = await import('./config/database.js');
        
        // Verificar TODAS las tablas necesarias para el funcionamiento del sistema
        const requiredTables = [
            // Tablas críticas básicas
            'catalog_branches', 'users', 'employees',
            // Catálogos
            'catalog_sellers', 'catalog_guides', 'catalog_agencies',
            // Datos principales
            'sales', 'sale_items', 'sale_payments',
            'inventory_items', 'customers', 'repairs',
            'cash_sessions', 'cash_movements',
            'exchange_rates_daily', 'arrival_rate_rules', 'agency_arrivals',
            'inventory_transfers', 'tourist_reports', 'tourist_report_lines',
            'cost_entries', 'commission_rules', 'settings', 'payment_methods'
        ];
        
        let existingCount = 0;
        const missingTables = [];
        
        for (const tableName of requiredTables) {
            try {
                await query(`SELECT 1 FROM ${tableName} LIMIT 1`);
                existingCount++;
            } catch (error) {
                if (error.code === '42P01' || error.message.includes('does not exist')) {
                    missingTables.push(tableName);
                } else {
                    throw error;
                }
            }
        }
        
        if (missingTables.length > 0) {
            console.log(`   ⚠️  Tablas faltantes (${missingTables.length}): ${missingTables.slice(0, 5).join(', ')}${missingTables.length > 5 ? '...' : ''}`);
            return false;
        }
        
        console.log(`✅ Verificadas ${existingCount}/${requiredTables.length} tablas requeridas`);
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
        
        // Verificar si las tablas requeridas existen
        console.log('🔍 Verificando existencia de tablas requeridas...');
        const tablesExist = await checkTablesExist();
        
        if (!tablesExist) {
            console.log('');
            console.log('🔄 Tablas faltantes detectadas - ejecutando migración automática...');
            console.log('');
            try {
                const { migrate } = await import('./database/migrate-auto.js');
                await migrate();
                console.log('');
                console.log('✅ Migración automática completada exitosamente');
                console.log('');
                
                // Verificar nuevamente después de la migración
                console.log('🔍 Verificación final de tablas...');
                const verifyTables = await checkTablesExist();
                if (!verifyTables) {
                    console.error('');
                    console.error('❌ ERROR: Algunas tablas aún no existen después de la migración');
                    console.error('💡 El servidor continuará, pero algunas funciones pueden no estar disponibles');
                    console.error('💡 Ejecuta manualmente desde Railway Console: npm run migrate');
                    console.error('');
                    // NO detener el servidor - permitir que funcione parcialmente
                } else {
                    console.log('✅ Todas las tablas requeridas verificadas correctamente');
                }
            } catch (migrateError) {
                console.error('');
                console.error('❌ ERROR en migración automática');
                console.error('═══════════════════════════════════════════');
                console.error('Mensaje:', migrateError.message);
                console.error('');
                console.error('💡 El servidor continuará, pero algunas funciones pueden no estar disponibles');
                console.error('💡 SOLUCIÓN:');
                console.error('   1. Ve a Railway Dashboard → Tu servicio → Console');
                console.error('   2. Ejecuta: npm run migrate');
                console.error('   3. Verifica los logs para ver qué tablas fallaron');
                console.error('═══════════════════════════════════════════');
                console.error('');
                // NO detener el servidor - permitir que funcione parcialmente
            }
        } else {
            console.log('✅ Base de datos verificada - todas las tablas requeridas existen');
        }
        
        // SIEMPRE ejecutar seed para asegurar datos iniciales (sucursal, empleado admin, usuario admin)
        console.log('');
        console.log('🌱 Verificando datos iniciales...');
        try {
            const { seedDatabase } = await import('./database/seed.js');
            await seedDatabase();
            console.log('✅ Seed completado');
        } catch (seedError) {
            console.warn('⚠️  Error en seed (continuando):', seedError.message);
            // No detener el servidor si falla el seed
        }
        
        // Ejecutar auto-reparación completa después de seed
        try {
            const { verifyAndRepairAll } = await import('./database/auto-repair.js');
            console.log('');
            console.log('🔧 Ejecutando auto-reparación inicial...');
            await verifyAndRepairAll();
            console.log('✅ Auto-reparación inicial completada');
        } catch (repairError) {
            console.error('⚠️ Error en auto-reparación inicial (no crítico):', repairError.message);
            // No detener el servidor si falla la auto-reparación
        }
        
        // Iniciar servidor HTTP
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, async () => {
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
            
            // Iniciar health check periódico
            startHealthCheck();
            console.log('✅ Health check periódico iniciado (cada 5 minutos)');
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
