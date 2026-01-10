// Función helper para agregar headers CORS (importada desde server.js o definida aquí)
const addCORSHeaders = (req, res) => {
    const origin = req.headers.origin;
    // Permitir cualquier origen .vercel.app, .netlify.app, o el configurado
    if (origin) {
        if (origin.includes('.vercel.app') || origin.includes('.netlify.app') || 
            origin.includes('localhost') || origin.includes('127.0.0.1') ||
            process.env.CORS_ORIGIN === '*' || 
            (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.split(',').includes(origin))) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
};

// Manejo de Errores Mejorado
export function errorHandler(err, req, res, next) {
    // Logging estructurado mejorado
    const errorLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        url: req.originalUrl || req.url,
        userId: req.user?.id || 'anonymous',
        username: req.user?.username || 'anonymous',
        branchId: req.user?.branchId || 'unknown',
        role: req.user?.role || 'unknown',
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        error: {
            message: err.message,
            name: err.name,
            code: err.code,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        },
        body: process.env.NODE_ENV === 'development' && req.body ? 
            (Object.keys(req.body).length > 0 ? req.body : undefined) : undefined,
        query: Object.keys(req.query).length > 0 ? req.query : undefined
    };
    
    // Logging según severidad
    if (err.statusCode >= 500 || !err.statusCode) {
        console.error('❌ ERROR CRÍTICO:', JSON.stringify(errorLog, null, 2));
    } else if (err.statusCode >= 400) {
        console.warn('⚠️ ERROR CLIENTE:', JSON.stringify(errorLog, null, 2));
    } else {
        console.log('ℹ️ INFO:', JSON.stringify(errorLog, null, 2));
    }
    
    // Agregar headers CORS a respuestas de error
    addCORSHeaders(req, res);

    // Error de validación
    if (err.name === 'ValidationError' || err.validationError) {
        return res.status(400).json({
            success: false,
            error: err.message || 'Error de validación',
            details: err.errors || err.validationErrors,
            field: err.field
        });
    }

    // Error de base de datos: tabla no existe (42P01)
    if (err.code === '42P01' || (err.message && err.message.includes('does not exist'))) {
        const tableName = err.message?.match(/relation "([^"]+)" does not exist/i)?.[1] || 'desconocida';
        
        // Si se intentó reparar automáticamente
        if (err.autoRepaired) {
            console.log(`✅ Tabla ${err.repairedTable || tableName} reparada automáticamente`);
            return res.status(500).json({
                success: false,
                error: 'Tabla reparada automáticamente. Por favor, intenta la operación nuevamente.',
                details: {
                    table: err.repairedTable || tableName,
                    autoRepaired: true,
                    hint: 'La tabla fue creada automáticamente. Intenta la operación de nuevo.'
                }
            });
        }
        
        console.error('❌ ERROR: Tabla no existe en la base de datos');
        console.error('   Tabla faltante:', tableName);
        console.error('   💡 Solución: Ejecuta la migración desde Railway Console: npm run migrate');
        console.error('   O visita: https://system-production-9e21.up.railway.app/diagnose.html');
        
        return res.status(500).json({
            success: false,
            error: 'Tabla no existe en la base de datos. Ejecuta la migración.',
            details: {
                table: tableName,
                code: err.code,
                hint: 'Visita /api/diagnose/auto-repair para ejecutar la reparación automáticamente',
                manualFix: 'Ejecuta desde Railway Console: npm run migrate'
            }
        });
    }
    
    // Error de base de datos: restricciones (23XX)
    if (err.code && err.code.startsWith('23')) { // PostgreSQL constraint violations
        return res.status(400).json({
            success: false,
            error: 'Error de restricción de base de datos',
            details: err.detail
        });
    }

    // Error JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Token inválido'
        });
    }

    // Error de branch_id faltante
    if (err.message && err.message.includes('Branch ID no encontrado')) {
        return res.status(400).json({
            success: false,
            error: err.message || 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }
    
    // Error de tamaño de payload
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            error: 'El payload es demasiado grande',
            maxSize: '10MB'
        });
    }
    
    // Error de timeout
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
        return res.status(504).json({
            success: false,
            error: 'Timeout en la solicitud. Por favor, intenta nuevamente.'
        });
    }
    
    // Error de conexión a base de datos
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        console.error('❌ ERROR DE CONEXIÓN A BASE DE DATOS');
        return res.status(503).json({
            success: false,
            error: 'Error de conexión a la base de datos. Por favor, intenta más tarde.',
            hint: 'Verifica que DATABASE_URL esté configurada correctamente'
        });
    }
    
    // Error genérico
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: err.message || 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { 
            stack: err.stack,
            code: err.code,
            name: err.name
        })
    });
}

// Wrapper para async routes
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

