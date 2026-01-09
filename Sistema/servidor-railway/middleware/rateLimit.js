// Rate Limiting Middleware
// Previene abusos y ataques de fuerza bruta

import rateLimit from 'express-rate-limit';

// Rate limiting general para todas las rutas
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // Máximo 1000 requests por ventana
    message: {
        success: false,
        error: 'Demasiadas peticiones. Por favor, intenta más tarde.'
    },
    standardHeaders: true, // Retornar rate limit info en headers
    legacyHeaders: false,
    skip: (req) => {
        // Saltar rate limiting para health checks
        return req.path === '/health' || req.path === '/api/info';
    }
});

// Rate limiting estricto para autenticación (prevenir fuerza bruta)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Máximo 5 intentos de login por IP
    message: {
        success: false,
        error: 'Demasiados intentos de login. Por favor, espera 15 minutos antes de intentar nuevamente.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // No contar requests exitosos
    handler: (req, res) => {
        // Logging de intentos bloqueados
        console.warn('⚠️ Rate limit excedido para autenticación:', {
            ip: req.ip || req.connection?.remoteAddress,
            path: req.path,
            timestamp: new Date().toISOString()
        });
        
        res.status(429).json({
            success: false,
            error: 'Demasiados intentos de login. Por favor, espera 15 minutos antes de intentar nuevamente.',
            retryAfter: Math.ceil(15 * 60) // Segundos
        });
    }
});

// Rate limiting para APIs sensibles (crear, actualizar, eliminar)
export const sensitiveOperationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 30, // Máximo 30 operaciones por minuto
    message: {
        success: false,
        error: 'Demasiadas operaciones. Por favor, espera un momento.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting para búsquedas y consultas
export const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // Máximo 100 búsquedas por minuto
    message: {
        success: false,
        error: 'Demasiadas búsquedas. Por favor, espera un momento.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting para uploads
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // Máximo 50 uploads por ventana
    message: {
        success: false,
        error: 'Demasiados archivos subidos. Por favor, espera 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
