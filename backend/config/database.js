import pg from 'pg';
const { Pool } = pg;

const isRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN
);

const useSSL = process.env.DB_SSL === 'false'
  ? false
  : (process.env.NODE_ENV === 'production' || isRailway)
    ? { rejectUnauthorized: false }
    : false;

// Configuración de la conexión a PostgreSQL optimizada para Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '45000', 10),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '45000', 10),
  maxUses: parseInt(process.env.DB_MAX_USES || '7500', 10),
});

const RETRY_BASE_MS = parseInt(process.env.DB_RETRY_BASE_MS || '600', 10);
const RETRY_MAX_MS = parseInt(process.env.DB_RETRY_MAX_MS || '5000', 10);
const DEFAULT_RETRIES = parseInt(process.env.DB_QUERY_RETRIES || '1', 10);

let consecutiveConnectionFailures = 0;
let globalBackoffUntil = 0;

const isConnectionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === '57P01' || // admin_shutdown
    error?.code === '57P03' || // cannot_connect_now
    error?.code === '53300' || // too_many_connections
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('client has encountered a connection error') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('could not connect to server') ||
    message.includes('terminated') ||
    message.includes('connection')
  );
};

const calculateBackoff = (attempt, failures = 0) => {
  const failureFactor = Math.max(1, failures);
  const raw = RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1)) * Math.min(failureFactor, 6);
  return Math.min(RETRY_MAX_MS, raw);
};

const getPoolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount
});

// Manejo de errores de conexión mejorado
pool.on('error', (err, client) => {
  // Solo loguear errores críticos, no todos los errores de conexión
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('terminated')) {
    console.error('⚠️ Error de conexión PostgreSQL (se reintentará automáticamente):', err.message);
  } else {
    console.error('Error inesperado en el cliente PostgreSQL:', err.message);
  }
  // El pool manejará la reconexión automáticamente
  // No terminar el proceso
});

// Manejo de eventos del pool solo en modo debug explícito.
if (process.env.DEBUG_DB === 'true') {
  pool.on('connect', (client) => {
    console.log('✅ Nueva conexión PostgreSQL establecida');
  });

  pool.on('remove', (client) => {
    // Solo loguear si es un error, no en remociones normales
    if (client._connectionError) {
      console.warn('⚠️ Cliente PostgreSQL removido del pool por error');
    }
  });
}

// Función para ejecutar queries con reintentos automáticos
export const query = async (text, params, retries = 2, timeoutMs = null) => {
  const start = Date.now();
  let lastError;
  const maxAttempts = Math.max(1, Number(retries ?? DEFAULT_RETRIES) || 0);
  const effectiveTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : parseInt(process.env.DB_APP_QUERY_TIMEOUT_MS || '15000', 10);
  const now = Date.now();

  if (globalBackoffUntil > now) {
    const waitLeft = globalBackoffUntil - now;
    const backoffError = new Error(`DB connection backoff active for ${waitLeft}ms`);
    backoffError.code = 'DB_BACKOFF_ACTIVE';
    throw backoffError;
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let timeoutId = null;
    const abortController = new AbortController();

    try {
      if (effectiveTimeout > 0) {
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, effectiveTimeout);
      }

      const res = await pool.query({
        text,
        values: params,
        signal: abortController.signal
      });

      if (timeoutId) clearTimeout(timeoutId);
      const duration = Date.now() - start;
      consecutiveConnectionFailures = 0;
      globalBackoffUntil = 0;
      
      // Solo loguear queries lentas o en modo debug
      if (duration > 1000 || process.env.DEBUG_DB === 'true') {
        console.log('Query ejecutada', { 
          duration: `${duration}ms`, 
          rows: res.rowCount,
          attempt,
          pool: getPoolStats()
        });
      }
      
      return res;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Query timeout after ${effectiveTimeout}ms`);
        timeoutError.code = 'QUERY_TIMEOUT';
        lastError = timeoutError;
      } else {
        lastError = error;
      }
      
      // Si es un error de conexión, reintentar
      if (isConnectionError(lastError)) {
        consecutiveConnectionFailures += 1;
      }

      if (isConnectionError(lastError) && attempt < maxAttempts) {
        const waitTime = calculateBackoff(attempt, consecutiveConnectionFailures);
        globalBackoffUntil = Date.now() + waitTime;
        console.warn(`⚠️ Error de conexión en query (intento ${attempt}/${maxAttempts}), reintentando en ${waitTime}ms...`, getPoolStats());
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (isConnectionError(lastError)) {
        const coolDown = Math.min(4000, calculateBackoff(maxAttempts, consecutiveConnectionFailures));
        globalBackoffUntil = Date.now() + coolDown;
      }
      
      // Si no es un error de conexión o se agotaron los reintentos, lanzar error
      if (attempt === maxAttempts) {
        console.error('Error ejecutando query después de reintentos:', { 
          error: lastError.message,
          code: lastError.code,
          attempts: attempt,
          pool: getPoolStats(),
          connectionFailures: consecutiveConnectionFailures
        });
      }
      
      throw lastError;
    }
  }
  
  throw lastError;
};

// Función para obtener un cliente del pool (para transacciones) con reintentos
export const getClient = async (retries = 2) => {
  let lastError;
  const maxAttempts = Math.max(1, Number(retries ?? DEFAULT_RETRIES) || 0);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      consecutiveConnectionFailures = 0;
      globalBackoffUntil = 0;
      const originalQuery = client.query.bind(client);
      const originalRelease = client.release.bind(client);
      
      // Wrapper para query con manejo de errores
      client.query = async (text, params) => {
        try {
          return await originalQuery(text, params);
        } catch (error) {
          // Si es error de conexión, el cliente puede estar muerto
          if (error.message.includes('terminated') || error.message.includes('Connection')) {
            console.warn('⚠️ Cliente PostgreSQL desconectado durante query, liberando...');
            try {
              originalRelease();
            } catch (e) {
              // Ignorar errores al liberar cliente muerto
            }
            throw error;
          }
          throw error;
        }
      };
      
      // Timeout para evitar que el cliente quede colgado
      const timeout = setTimeout(() => {
        console.warn('⚠️ Cliente PostgreSQL sin liberar después de 30 segundos');
      }, 30000);
      
      client.release = () => {
        clearTimeout(timeout);
        originalRelease();
      };
      
      return client;
    } catch (error) {
      lastError = error;
      
      // Si es un error de conexión, reintentar
      if (isConnectionError(error) && attempt < maxAttempts) {
        consecutiveConnectionFailures += 1;
        const waitTime = calculateBackoff(attempt, consecutiveConnectionFailures);
        console.warn(`⚠️ Error obteniendo cliente (intento ${attempt}/${maxAttempts}), reintentando en ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      if (attempt === maxAttempts) {
        console.error('Error obteniendo cliente después de reintentos:', {
          error: error.message,
          code: error.code,
          attempts: attempt,
          pool: getPoolStats(),
          connectionFailures: consecutiveConnectionFailures
        });
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

export default pool;
