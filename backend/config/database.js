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
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // ⚡ Aumentado de 8 a 20 para manejar carga
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),  // ⚡ Mantener 2 conexiones warm
  idleTimeoutMillis: 15000, // ⚡ Reducido de 30s a 15s para liberar rápido
  connectionTimeoutMillis: 5000, // ⚡ Reducido de 10s a 5s (fail faster)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 30000, // ⚡ Reducido de 45s a 30s (queries complejas != auth queries)
  query_timeout: 30000,
});

const isConnectionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT' ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('terminated') ||
    message.includes('connection')
  );
};

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
  const maxAttempts = Math.max(1, Number(retries) || 0);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let queryPromise = pool.query(text, params);
      
      // ⚡ PERFORMANCE: Timeout más agresivo para queries críticas (ej: auth)
      if (timeoutMs) {
        queryPromise = Promise.race([
          queryPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
          )
        ]);
      }
      
      const res = await queryPromise;
      const duration = Date.now() - start;
      
      // Solo loguear queries lentas o en modo debug
      if (duration > 1000 || process.env.DEBUG_DB === 'true') {
        console.log('Query ejecutada', { 
          duration: `${duration}ms`, 
          rows: res.rowCount,
          attempt 
        });
      }
      
      return res;
    } catch (error) {
      lastError = error;
      
      // Si es un error de conexión, reintentar
      if (isConnectionError(error) && attempt < maxAttempts) {
        const waitTime = attempt * 500; // Backoff exponencial: 500ms, 1000ms, 1500ms
        console.warn(`⚠️ Error de conexión en query (intento ${attempt}/${maxAttempts}), reintentando en ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si no es un error de conexión o se agotaron los reintentos, lanzar error
      if (attempt === maxAttempts) {
        console.error('Error ejecutando query después de reintentos:', { 
          error: error.message,
          code: error.code,
          attempts: attempt
        });
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

// Función para obtener un cliente del pool (para transacciones) con reintentos
export const getClient = async (retries = 2) => {
  let lastError;
  const maxAttempts = Math.max(1, Number(retries) || 0);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
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
        const waitTime = attempt * 500;
        console.warn(`⚠️ Error obteniendo cliente (intento ${attempt}/${maxAttempts}), reintentando en ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      if (attempt === maxAttempts) {
        console.error('Error obteniendo cliente después de reintentos:', {
          error: error.message,
          code: error.code,
          attempts: attempt
        });
      }
      
      throw error;
    }
  }
  
  throw lastError;
};

export default pool;
