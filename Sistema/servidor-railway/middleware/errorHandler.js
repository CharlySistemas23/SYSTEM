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

// Manejo de Errores
export function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    
    // Agregar headers CORS a respuestas de error
    addCORSHeaders(req, res);

    // Error de validación
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: err.message || 'Error de validación',
            details: err.errors
        });
    }

    // Error de base de datos
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

    // Error genérico
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Error interno del servidor'
    });
}

// Wrapper para async routes
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

