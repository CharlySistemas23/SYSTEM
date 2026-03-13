import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Importar rutas
import authRoutes from './routes/auth.js';
import branchesRoutes from './routes/branches.js';
import employeesRoutes from './routes/employees.js';
import inventoryRoutes from './routes/inventory.js';
import salesRoutes from './routes/sales.js';
import customersRoutes from './routes/customers.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import catalogsRoutes from './routes/catalogs.js';
import repairsRoutes from './routes/repairs.js';
import cashRoutes from './routes/cash.js';
import transfersRoutes from './routes/transfers.js';
import costsRoutes from './routes/costs.js';
import suppliersRoutes from './routes/suppliers.js';
import purchaseOrdersRoutes from './routes/purchase-orders.js';
import supplierPaymentsRoutes from './routes/supplier-payments.js';
import touristRoutes from './routes/tourist.js';
import exchangeRatesRoutes from './routes/exchange_rates.js';
import uploadRoutes from './routes/upload.js';
import arrivalRulesRoutes from './routes/arrival-rules.js';
import debugRoutes from './routes/debug.js';

// Importar middleware
import { authenticateOptional } from './middleware/authOptional.js';
import { errorHandler } from './middleware/errorHandler.js';
import { query as dbQuery } from './config/database.js';

// Configurar dotenv
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN
);
const isProductionLike = process.env.NODE_ENV === 'production' || isRailway;

// Configurar trust proxy para Railway (confiar solo en el primer proxy, más seguro)
// Railway usa un solo proxy, así que 1 es suficiente y más seguro que true
app.set('trust proxy', 1);

// Función helper para determinar orígenes permitidos (debe estar antes de Socket.IO)
const getAllowedOrigins = () => {
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  return raw.length === 0 ? true : raw; // true = permitir todos, array = lista específica
};

// Configurar Socket.IO con la misma configuración CORS
const socketIOOrigins = getAllowedOrigins();
const io = new Server(httpServer, {
  cors: {
    origin: socketIOOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-username', 'x-branch-id']
  },
  transports: ['websocket', 'polling']
});

// Importar Socket.IO handlers (después de crear io)
import { setupSocketIO } from './socket/socketHandler.js';

// Hacer io disponible globalmente para las rutas
app.set('io', io);

// Configurar CORS con manejo mejorado (ANTES de helmet)
const corsOptions = {
  origin: (origin, callback) => {
    const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
    const allowAll = raw.length === 0 || raw.includes('*');
    
    // Permitir solicitudes sin origen (ej: Postman, curl, mobile apps)
    if (!origin) {
      return callback(null, true);
    }
    
    // Permitir todo si no hay configuración o si está explícitamente permitido con *
    if (allowAll) {
      return callback(null, true);
    }
    
    // Verificar si el origen está en la lista permitida
    if (raw.includes(origin)) {
      return callback(null, true);
    }
    
    // Rechazar si hay configuración explícita y el origen no está permitido
    console.warn(`⚠️ CORS: Origen rechazado: ${origin}. Permitidos: ${raw.join(', ')}`);
    callback(new Error(`CORS: Origen no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-username', 'x-branch-id'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// Aplicar CORS middleware ANTES de cualquier otra cosa
app.use(cors(corsOptions));

// Middleware para asegurar headers CORS en todas las respuestas
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const allowAll = raw.length === 0 || raw.includes('*');
  
  if (allowAll || !origin || raw.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username, x-branch-id');
  }
  next();
});

// Handler explícito para OPTIONS (preflight) - debe estar antes de las rutas
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const allowAll = raw.length === 0 || raw.includes('*');
  
  if (allowAll || !origin || raw.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username, x-branch-id');
    res.header('Access-Control-Max-Age', '86400'); // 24 horas
    return res.status(200).end();
  }
  
  res.status(403).json({ error: 'CORS: Origen no permitido' });
});

// Middleware de seguridad (después de CORS para no interferir)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (después de trust proxy)
// Límite más permisivo para evitar bloqueos durante sincronización inicial
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  // Aumentamos significativamente el límite para operaciones de sincronización masivas
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20000, // 20,000 solicitudes por 15 minutos
  message: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
  // Permitir más solicitudes durante el inicio
  skip: (req) => {
    // Excluir endpoints críticos de sincronización inicial
    const criticalPaths = [
      '/auth/verify',
      '/branches',
      '/employees',
      '/catalogs/agencies',
      '/catalogs/sellers',
      '/catalogs/guides',
      '/exchange-rates'
    ];
    return criticalPaths.some(path => req.path.includes(path));
  }
});

// Rate limiter más permisivo para endpoints de sincronización
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50000, // 50,000 solicitudes para sincronización
  standardHeaders: true,
  legacyHeaders: false
});

// No aplicar rate limit a preflight OPTIONS para evitar bloquear CORS
// Excluir endpoints críticos del rate limit (se usan frecuentemente durante inicio)
app.use('/api/', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  
  // Endpoints críticos de sincronización inicial - usar limiter más permisivo
  const syncPaths = ['/branches', '/employees', '/catalogs/', '/exchange-rates'];
  if (syncPaths.some(path => req.path.includes(path))) {
    return syncLimiter(req, res, next);
  }
  
  // Endpoints de autenticación - sin rate limit
  if (req.path === '/auth/verify' || req.path === '/auth/login') {
    return next();
  }
  
  // Resto de endpoints - usar limiter normal
  return limiter(req, res, next);
});

// Health check endpoint
app.get('/health', (req, res) => {
  // No exponer credenciales; solo mostrar host para debugging.
  let dbHost = null;
  try {
    if (process.env.DATABASE_URL) {
      dbHost = new URL(process.env.DATABASE_URL).host;
    }
  } catch (e) {
    dbHost = 'invalid_database_url';
  }
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dbConfigured: !!process.env.DATABASE_URL,
    dbHost
  });
});

// Health check de BD: valida que Postgres responda (sin exponer datos).
// Usa 1 intento para responder rápido en diagnósticos.
app.get('/health/db', async (req, res) => {
  try {
    const result = await dbQuery('SELECT 1 as ok', [], 1);
    res.json({
      status: 'OK',
      db: 'OK',
      result: result?.rows?.[0] || { ok: 1 },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health DB falló:', error?.message || error);
    res.status(503).json({
      status: 'OK',
      db: 'ERROR',
      error: error?.message || 'db_error',
      code: error?.code,
      timestamp: new Date().toISOString()
    });
  }
});

// Rutas públicas
app.use('/api/auth', authRoutes);

// Rutas protegidas (autenticación opcional - funciona con o sin token)
// Usa authenticateOptional que acepta token O username+branch_id
app.use('/api/branches', authenticateOptional, branchesRoutes);
app.use('/api/employees', authenticateOptional, employeesRoutes);
app.use('/api/inventory', authenticateOptional, inventoryRoutes);
app.use('/api/sales', authenticateOptional, salesRoutes);
app.use('/api/customers', authenticateOptional, customersRoutes);
app.use('/api/reports', authenticateOptional, reportsRoutes);
app.use('/api/dashboard', authenticateOptional, dashboardRoutes);
app.use('/api/catalogs', authenticateOptional, catalogsRoutes);
app.use('/api/repairs', authenticateOptional, repairsRoutes);
app.use('/api/cash', authenticateOptional, cashRoutes);
app.use('/api/transfers', authenticateOptional, transfersRoutes);
app.use('/api/costs', authenticateOptional, costsRoutes);
app.use('/api/suppliers', authenticateOptional, suppliersRoutes);
app.use('/api/purchase-orders', authenticateOptional, purchaseOrdersRoutes);
app.use('/api/supplier-payments', authenticateOptional, supplierPaymentsRoutes);
app.use('/api/tourist', authenticateOptional, touristRoutes);
app.use('/api/exchange-rates', exchangeRatesRoutes); // Público, no requiere auth
app.use('/api/arrival-rules', authenticateOptional, arrivalRulesRoutes);
app.use('/api/upload', authenticateOptional, uploadRoutes); // Autenticación opcional
if (!isProductionLike || process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', authenticateOptional, debugRoutes); // Diagnóstico: conteos por sucursal
}

// Configurar Socket.IO
setupSocketIO(io);

// Pasar io a las rutas que lo necesitan
import { setIO as setInventoryIO } from './routes/inventory.js';
import { setIO as setSalesIO } from './routes/sales.js';
import { setIO as setBranchesIO } from './routes/branches.js';
import { setIO as setRepairsIO } from './routes/repairs.js';
import { setIO as setCustomersIO } from './routes/customers.js';
import { setIO as setTransfersIO } from './routes/transfers.js';
import { setIO as setCostsIO } from './routes/costs.js';
import { setIO as setSuppliersIO } from './routes/suppliers.js';
import { setIO as setCashIO } from './routes/cash.js';
import { setIO as setEmployeesIO } from './routes/employees.js';
setInventoryIO(io);
setSalesIO(io);
setBranchesIO(io);
setRepairsIO(io);
setCustomersIO(io);
setTransfersIO(io);
setCostsIO(io);
setSuppliersIO(io);
setCashIO(io);
setEmployeesIO(io);

// Manejo de errores
app.use(errorHandler);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3000;

// Función helper para ejecutar schema.sql de forma segura
async function executeSchemaSafely(pool) {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const schemaPath = join(__dirname, 'database', 'schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf8');
  
  // Dividir el schema en statements individuales usando una expresión regular más robusta
  // Esto maneja correctamente CREATE TABLE multilínea, funciones, triggers, etc.
  
  // Primero, normalizar el SQL: eliminar comentarios de línea y normalizar espacios
  let normalizedSQL = schemaSQL
    .replace(/--[^\n]*/g, '') // Eliminar comentarios de línea
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Eliminar comentarios de bloque
  
  // Dividir por punto y coma, pero respetando bloques entre paréntesis y funciones
  const statements = [];
  let currentStatement = '';
  let parenDepth = 0;
  let inDollarQuote = false;
  let dollarQuote = null;
  
  for (let i = 0; i < normalizedSQL.length; i++) {
    const char = normalizedSQL[i];
    const nextChars = normalizedSQL.substring(i, i + 10);
    
    // Detectar inicio de función con $$ o $tag$
    if (char === '$' && !inDollarQuote) {
      const match = normalizedSQL.substring(i).match(/^\$([^$]*)\$/);
      if (match) {
        dollarQuote = match[0];
        inDollarQuote = true;
        currentStatement += dollarQuote;
        i += dollarQuote.length - 1;
        continue;
      }
    }
    
    // Detectar fin de función
    if (inDollarQuote && normalizedSQL.substring(i).startsWith(dollarQuote)) {
      currentStatement += dollarQuote;
      i += dollarQuote.length - 1;
      dollarQuote = null;
      inDollarQuote = false;
      continue;
    }
    
    // Si estamos dentro de una función, agregar todo sin procesar
    if (inDollarQuote) {
      currentStatement += char;
      continue;
    }
    
    // Contar paréntesis para detectar bloques
    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    }
    
    currentStatement += char;
    
    // Si encontramos punto y coma y no estamos dentro de paréntesis ni función, es el fin del statement
    if (char === ';' && parenDepth === 0 && !inDollarQuote) {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 5 && !trimmed.match(/^\s*$/)) {
        statements.push(trimmed);
      }
      currentStatement = '';
      parenDepth = 0;
    }
  }
  
  // Agregar el último statement si existe
  if (currentStatement.trim().length > 5) {
    statements.push(currentStatement.trim());
  }
  
  console.log(`📋 Schema.sql dividido en ${statements.length} statements`);
  
  // Separar statements por tipo para ejecutarlos en el orden correcto
  const createTables = [];
  const createIndexes = [];
  const createFunctions = [];
  const alterTables = [];
  const otherStatements = [];
  
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.length < 5) {
      continue;
    }
    
    const upper = trimmed.toUpperCase().replace(/\s+/g, ' ');
    // Detectar CREATE TABLE (con o sin IF NOT EXISTS)
    if (upper.match(/^CREATE\s+TABLE/)) {
      createTables.push(trimmed);
    } else if (upper.match(/^CREATE\s+(UNIQUE\s+)?INDEX/)) {
      createIndexes.push(trimmed);
    } else if (upper.match(/^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/)) {
      createFunctions.push(trimmed);
    } else if (upper.startsWith('ALTER TABLE')) {
      alterTables.push(trimmed);
    } else {
      otherStatements.push(trimmed);
    }
  }
  
  console.log(`📊 Clasificados: ${createTables.length} tablas, ${createIndexes.length} índices, ${createFunctions.length} funciones, ${alterTables.length} alteraciones, ${otherStatements.length} otros`);
  
  let executed = 0;
  let skipped = 0;
  let errors = 0;
  
  // Función helper para ejecutar un statement
  const executeStatement = async (statement, type, index) => {
    try {
      await pool.query(statement);
      executed++;
      return true;
    } catch (stmtError) {
      const errorMsg = stmtError.message.toLowerCase();
      const errorCode = stmtError.code;
      
      // Ignorar errores de "already exists" - es normal y esperado
      if (errorCode === '42P07' || errorCode === '42710' || 
          errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate') ||
          (errorMsg.includes('relation') && errorMsg.includes('already exists')) ||
          (errorMsg.includes('column') && errorMsg.includes('already exists'))) {
        skipped++;
        return false;
      }
      
      // Para errores de "does not exist" en índices, verificar si es una columna faltante
      if (errorMsg.includes('does not exist') && type === 'index') {
        // Si es un error de columna faltante, ignorarlo (puede ser una columna opcional)
        if (errorMsg.includes('column') && errorMsg.includes('does not exist')) {
          // Ignorar errores de columnas faltantes en índices (pueden ser opcionales)
          skipped++;
          return false;
        }
        // Para otros errores de "does not exist" en índices, puede ser que la tabla aún no existe
        console.warn(`⚠️  Error en ${type} ${index + 1}: ${stmtError.message.substring(0, 80)}`);
        errors++;
        return false;
      }
      
      // Para otros errores, loguear
      if (!errorMsg.includes('does not exist') || type === 'table') {
        console.warn(`⚠️  Error en ${type} ${index + 1}: ${stmtError.message.substring(0, 80)}`);
        errors++;
      }
      return false;
    }
  };
  
  // 1. Ejecutar funciones primero (pueden ser necesarias para triggers)
  for (let i = 0; i < createFunctions.length; i++) {
    await executeStatement(createFunctions[i], 'function', i);
  }
  
  // 2. Ejecutar CREATE TABLE
  for (let i = 0; i < createTables.length; i++) {
    await executeStatement(createTables[i], 'table', i);
    if ((i + 1) % 10 === 0) {
      console.log(`   ✅ ${i + 1}/${createTables.length} tablas procesadas...`);
    }
  }
  
  // 3. Ejecutar ALTER TABLE (agregar columnas, etc.)
  for (let i = 0; i < alterTables.length; i++) {
    await executeStatement(alterTables[i], 'alter', i);
  }
  
  // 4. Ejecutar CREATE INDEX (después de que las tablas existan)
  for (let i = 0; i < createIndexes.length; i++) {
    await executeStatement(createIndexes[i], 'index', i);
    if ((i + 1) % 20 === 0) {
      console.log(`   ✅ ${i + 1}/${createIndexes.length} índices procesados...`);
    }
  }
  
  // 5. Ejecutar otros statements (triggers, DO blocks, etc.)
  for (let i = 0; i < otherStatements.length; i++) {
    await executeStatement(otherStatements[i], 'other', i);
  }
  
  // 6. Reintentar índices que fallaron (puede que las tablas ya existan ahora)
  // Solo reintentar índices que fallaron por "does not exist" (tabla), no por columnas faltantes
  let retryCount = 0;
  const failedIndexes = []; // Guardar índices que fallaron por tabla no existente
  
  // Primera pasada: identificar índices que fallaron por tabla no existente
  for (let i = 0; i < createIndexes.length; i++) {
    const statement = createIndexes[i];
    try {
      await pool.query(statement);
      // Si ya existe, no hacer nada
    } catch (e) {
      const errorMsg = e.message.toLowerCase();
      // Solo reintentar si el error es de tabla no existente, no de columna faltante
      if (errorMsg.includes('does not exist') && !errorMsg.includes('column')) {
        failedIndexes.push(statement);
      }
      // Ignorar otros errores (columnas faltantes, ya existe, etc.)
    }
  }
  
  // Segunda pasada: reintentar solo los que fallaron por tabla no existente
  for (const statement of failedIndexes) {
    try {
      await pool.query(statement);
      retryCount++;
    } catch (e) {
      // Ignorar si aún falla
    }
  }
  
  if (retryCount > 0) {
    console.log(`   🔄 ${retryCount} índices creados en reintento`);
    executed += retryCount;
  }
  
  console.log(`✅ Schema ejecutado: ${executed} creados, ${skipped} ya existían, ${errors} errores`);
  return { executed, skipped, errors };
}

// Función para verificar si la base de datos necesita migración
async function checkAndMigrate() {
  if (process.env.SKIP_AUTO_MIGRATE === 'true') {
    console.log('⏭️  Auto-migración deshabilitada por SKIP_AUTO_MIGRATE');
    return;
  }

  try {
    const { Pool } = await import('pg');
    const isRailway = Boolean(
      process.env.RAILWAY_ENVIRONMENT_ID ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_PUBLIC_DOMAIN
    );
    const migrationSSL = process.env.DB_SSL === 'false'
      ? false
      : (process.env.NODE_ENV === 'production' || isRailway)
        ? { rejectUnauthorized: false }
        : false;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: migrationSSL,
      max: 1,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000
    });

    console.log('🔄 Iniciando verificación y migración de base de datos...');
    
    // SIEMPRE ejecutar schema.sql completo al inicio (es seguro porque usa IF NOT EXISTS)
    console.log('📦 Ejecutando schema.sql completo para asegurar que todas las tablas existan...');
    try {
      await executeSchemaSafely(pool);
      console.log('✅ Schema.sql ejecutado correctamente');
    } catch (schemaError) {
      console.error('❌ Error ejecutando schema.sql:', schemaError.message);
      // Continuar para verificar qué tablas existen
    }

    // Verificar todas las tablas relacionadas con suppliers
    const allRequiredTables = [
      'branches', 
      'quick_captures', 
      'archived_quick_capture_reports', 
      'historical_quick_capture_reports', 
      'suppliers',
      'supplier_contacts',
      'supplier_contracts',
      'supplier_documents',
      'supplier_payments',
      'supplier_price_history',
      'supplier_ratings',
      'supplier_interactions'
    ];
    
    const checkTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1::text[])
      ORDER BY table_name;
    `, [allRequiredTables]);
    
    const existingTables = checkTables.rows.map(r => r.table_name);
    const missingTables = allRequiredTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      console.log(`⚠️  Aún faltan ${missingTables.length} tablas después de ejecutar schema: ${missingTables.join(', ')}`);
      console.log('🔄 Intentando ejecutar schema.sql nuevamente para crear tablas faltantes...');
      
      try {
        // Ejecutar schema.sql nuevamente para asegurar que se creen las tablas faltantes
        await executeSchemaSafely(pool);
        
        // Verificar nuevamente
        const recheckTables = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ANY($1::text[])
          ORDER BY table_name;
        `, [allRequiredTables]);
        
        const recheckExisting = recheckTables.rows.map(r => r.table_name);
        const stillMissing = allRequiredTables.filter(t => !recheckExisting.includes(t));
        
        if (stillMissing.length > 0) {
          console.warn(`⚠️  Aún faltan ${stillMissing.length} tablas: ${stillMissing.join(', ')}`);
          console.log('💡 El servidor continuará, pero estas funcionalidades pueden no estar disponibles');
        } else {
          console.log('✅ Todas las tablas requeridas están presentes después del segundo intento');
        }
      } catch (retryError) {
        console.error('❌ Error en segundo intento de ejecutar schema:', retryError.message);
      }
    } else {
      console.log('✅ Todas las tablas requeridas están presentes');
    }
    
    // Continuar con migraciones adicionales (columnas, usuarios, etc.)
    try {
      // Migración: columna permissions en users (idempotente)
      try {
        const colCheck = await pool.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'permissions'
        `);
        if (colCheck.rows.length === 0) {
          console.log('🔄 Añadiendo columna permissions a users...');
          await pool.query(`ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT NULL`);
          console.log('✅ Columna users.permissions creada');
        }
      } catch (colError) {
        if (colError.code === '42701') console.log('ℹ️  Columna users.permissions ya existe');
        else console.warn('⚠️  Migración permissions:', colError.message);
      }

      // Migración: columna permissions_by_branch en users (permisos por sucursal)
      try {
        const colCheckBranch = await pool.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'permissions_by_branch'
        `);
        if (colCheckBranch.rows.length === 0) {
          console.log('🔄 Añadiendo columna permissions_by_branch a users...');
          await pool.query(`ALTER TABLE users ADD COLUMN permissions_by_branch JSONB DEFAULT NULL`);
          console.log('✅ Columna users.permissions_by_branch creada');
        }
      } catch (colError) {
        if (colError.code === '42701') console.log('ℹ️  Columna users.permissions_by_branch ya existe');
        else console.warn('⚠️  Migración permissions_by_branch:', colError.message);
      }

      // Crear usuario admin manualmente (solo si no existe)
      try {
        const adminCheck = await pool.query(`SELECT id FROM users WHERE username = 'master_admin' LIMIT 1`);
        
        if (adminCheck.rows.length === 0) {
          console.log('👤 Creando usuario admin maestro...');
          
          // Crear sucursal principal si no existe
          await pool.query(`
            INSERT INTO branches (id, name, code, address, phone, email, active)
            VALUES (
              '00000000-0000-0000-0000-000000000001',
              'Sucursal Principal',
              'MAIN',
              'Dirección principal',
              '1234567890',
              'admin@opalco.com',
              true
            )
            ON CONFLICT (id) DO NOTHING
          `);
          
          const branchResult = await pool.query(`SELECT id FROM branches WHERE code = 'MAIN' LIMIT 1`);
          if (!branchResult.rows || branchResult.rows.length === 0) {
            console.warn('⚠️  No se pudo encontrar la sucursal MAIN, continuando sin crear usuario admin');
            console.log('💡 Puedes crear el usuario admin manualmente con: npm run create-admin');
          } else {
            const branchId = branchResult.rows[0].id;
            
            // Crear empleado admin (master_admin NO debe tener branch_id para acceder a todas las sucursales)
            await pool.query(`
              INSERT INTO employees (id, code, name, role, branch_id, active)
              VALUES (
                '00000000-0000-0000-0000-000000000002',
                'ADMIN',
                'Administrador Maestro',
                'master_admin',
                NULL,
                true
              )
              ON CONFLICT (id) DO UPDATE SET
                role = 'master_admin',
                branch_id = NULL
            `);
            
            const employeeResult = await pool.query(`SELECT id FROM employees WHERE code = 'ADMIN' LIMIT 1`);
            if (!employeeResult.rows || employeeResult.rows.length === 0) {
              console.warn('⚠️  No se pudo encontrar el empleado ADMIN, continuando sin crear usuario admin');
              console.log('💡 Puedes crear el usuario admin manualmente con: npm run create-admin');
            } else {
              const employeeId = employeeResult.rows[0].id;
              
              // Crear usuario admin
              const bcrypt = await import('bcryptjs');
              const passwordHash = await bcrypt.default.hash('1234', 10);
              
              await pool.query(`
                INSERT INTO users (id, username, password_hash, employee_id, role, active)
                VALUES (
                  '00000000-0000-0000-0000-000000000001',
                  'master_admin',
                  $1,
                  $2,
                  'master_admin',
                  true
                )
                ON CONFLICT (id) DO NOTHING
              `, [passwordHash, employeeId]);
              
              console.log('✅ Usuario master_admin creado');
              console.log('📋 Credenciales: username=master_admin, PIN=1234');
            }
          }
        } else {
          console.log('✅ Usuario master_admin ya existe');
        }
      } catch (adminError) {
        console.warn('⚠️  Error creando usuario admin (no crítico):', adminError.message);
        console.log('💡 Puedes crear el usuario admin manualmente con: npm run create-admin');
        // No lanzar error, continuar con el servidor
      }
      
      // Verificar y agregar branch_id a customers si no existe
      const customersBranchCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'customers' 
          AND column_name = 'branch_id'
        );
      `);
      
      if (!customersBranchCheck.rows[0].exists) {
        console.log('🔄 Agregando branch_id a tabla customers...');
        try {
          await pool.query(`
            ALTER TABLE customers 
            ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
          `);
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
          `);
          console.log('✅ Columna branch_id agregada a customers');
        } catch (migrationError) {
          if (migrationError.code === '42701') {
            console.log('ℹ️  branch_id ya existe en customers');
          } else {
            console.error('⚠️  Error agregando branch_id a customers:', migrationError.message);
          }
        }
      }
      
      // Verificar y agregar columna daily_summary a archived_quick_capture_reports si no existe
      try {
        // Primero verificar que la tabla existe
        const tableExistsCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'archived_quick_capture_reports'
          );
        `);
        
        if (tableExistsCheck.rows[0].exists) {
          const dailySummaryCheck = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_schema = 'public' 
              AND table_name = 'archived_quick_capture_reports' 
              AND column_name = 'daily_summary'
            );
          `);
          
          if (!dailySummaryCheck.rows[0].exists) {
            console.log('🔄 Agregando daily_summary a tabla archived_quick_capture_reports...');
            try {
              await pool.query(`
                ALTER TABLE archived_quick_capture_reports 
                ADD COLUMN daily_summary JSONB;
              `);
              console.log('✅ Columna daily_summary agregada a archived_quick_capture_reports');
            } catch (migrationError) {
              if (migrationError.code === '42701') {
                console.log('ℹ️  daily_summary ya existe en archived_quick_capture_reports');
              } else {
                console.error('⚠️  Error agregando daily_summary a archived_quick_capture_reports:', migrationError.message);
              }
            }
          }
        } else {
          console.log('ℹ️  Tabla archived_quick_capture_reports no existe aún, se creará con el schema completo');
        }
      } catch (dailySummaryError) {
        console.error('⚠️  Error verificando/agregando daily_summary:', dailySummaryError.message);
        // No bloquear el inicio del servidor si falla esta migración
      }
      
      // ========== MIGRACIÓN: Nuevas columnas para inventory_items ==========
      // Agregar columnas nuevas de forma segura (sin afectar datos existentes)
      const newInventoryColumns = [
        { name: 'subcategory', type: 'VARCHAR(100)' },
        { name: 'collection', type: 'VARCHAR(100)' },
        { name: 'material', type: 'VARCHAR(100)' },
        { name: 'purity', type: 'VARCHAR(50)' },
        { name: 'plating', type: 'VARCHAR(100)' },
        { name: 'stones', type: 'JSONB' },
        { name: 'measurements', type: 'JSONB' },
        { name: 'sale_price', type: 'DECIMAL(12, 2)' },
        { name: 'discount', type: 'DECIMAL(5, 2)' },
        { name: 'discount_amount', type: 'DECIMAL(12, 2)' },
        { name: 'currency', type: 'VARCHAR(3) DEFAULT \'MXN\'' },
        { name: 'margin_percent', type: 'DECIMAL(5, 2)' },
        { name: 'condition', type: 'VARCHAR(50)' },
        { name: 'location_detail', type: 'VARCHAR(100)' },
        { name: 'style', type: 'VARCHAR(100)' },
        { name: 'finish_type', type: 'VARCHAR(100)' },
        { name: 'theme', type: 'VARCHAR(100)' },
        { name: 'certificate_details', type: 'JSONB' },
        { name: 'supplier', type: 'VARCHAR(255)' },
        { name: 'supplier_code', type: 'VARCHAR(100)' },
        { name: 'notes', type: 'TEXT' }
      ];
      
      for (const column of newInventoryColumns) {
        try {
          const columnCheck = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns 
              WHERE table_schema = 'public' 
              AND table_name = 'inventory_items' 
              AND column_name = $1
            );
          `, [column.name]);
          
          if (!columnCheck.rows[0].exists) {
            console.log(`🔄 Agregando columna ${column.name} a inventory_items...`);
            try {
              await pool.query(`
                ALTER TABLE inventory_items 
                ADD COLUMN ${column.name} ${column.type};
              `);
              console.log(`✅ Columna ${column.name} agregada a inventory_items`);
            } catch (migrationError) {
              if (migrationError.code === '42701') {
                console.log(`ℹ️  ${column.name} ya existe en inventory_items`);
              } else {
                console.error(`⚠️  Error agregando ${column.name} a inventory_items:`, migrationError.message);
              }
            }
          }
        } catch (error) {
          console.error(`⚠️  Error verificando columna ${column.name}:`, error.message);
          // Continuar con las demás columnas
        }
      }
      
      // Modificar columna price para permitir NULL (precio sugerido puede estar vacío)
      try {
        const priceNullCheck = await pool.query(`
          SELECT is_nullable 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'inventory_items' 
          AND column_name = 'price';
        `);
        
        if (priceNullCheck.rows.length > 0 && priceNullCheck.rows[0].is_nullable === 'NO') {
          console.log('🔄 Modificando columna price para permitir NULL...');
          try {
            await pool.query(`
              ALTER TABLE inventory_items 
              ALTER COLUMN price DROP NOT NULL;
            `);
            console.log('✅ Columna price ahora permite NULL');
          } catch (error) {
            console.error('⚠️  Error modificando columna price:', error.message);
          }
        }
      } catch (error) {
        console.error('⚠️  Error verificando columna price:', error.message);
      }
    } catch (migrationError) {
      console.error('⚠️  Error en migraciones adicionales:', migrationError.message);
      // No crítico, continuar
    }

    await pool.end();
  } catch (error) {
    console.error('⚠️  Error en auto-migración:', error.message);
    console.log('💡 Puedes ejecutar manualmente: npm run migrate && npm run create-admin');
  }
}

// Iniciar servidor después de verificar migración
async function startServer() {
  if (isProductionLike) {
    if (!process.env.JWT_SECRET || typeof process.env.JWT_SECRET !== 'string') {
      throw new Error('JWT_SECRET no configurado para entorno de producción');
    }
    if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string') {
      throw new Error('DATABASE_URL no configurado para entorno de producción');
    }
  }

  await checkAndMigrate();
  
  // Mostrar configuración CORS al iniciar
  const rawOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const corsInfo = rawOrigins.length === 0 
    ? '(vacío - permitir todo)' 
    : rawOrigins.join(', ');
  console.log(`🌍 CORS configurado - ALLOWED_ORIGINS: ${corsInfo}`);
  
  httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
    console.log(`📡 Socket.IO habilitado para tiempo real`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();

export { io };
