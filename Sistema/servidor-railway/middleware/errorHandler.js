// Manejo de Errores
export function errorHandler(err, req, res, next) {
    console.error('Error:', err);

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

