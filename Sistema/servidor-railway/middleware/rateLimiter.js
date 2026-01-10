// Rate Limiting Middleware
// Previene abusos limitando el número de solicitudes por IP

// Store simple en memoria (en producción, usar Redis)
const requestCounts = new Map();
const requestWindows = new Map();

// Limpiar contadores antiguos cada minuto
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamp] of requestWindows.entries()) {
        if (now - timestamp > 60000) { // 1 minuto
            requestCounts.delete(ip);
            requestWindows.delete(ip);
        }
    }
}, 60000);

/**
 * Rate limiter básico
 * @param {number} maxRequests - Número máximo de solicitudes
 * @param {number} windowMs - Ventana de tiempo en milisegundos
 * @returns {function} Middleware
 */
export function rateLimiter(maxRequests = 100, windowMs = 60000) {
    return (req, res, next) => {
        // Obtener IP del cliente
        const ip = req.ip || 
                   req.headers['x-forwarded-for']?.split(',')[0] || 
                   req.connection.remoteAddress || 
                   'unknown';
        
        const now = Date.now();
        const windowStart = requestWindows.get(ip) || now;
        
        // Si la ventana expiró, reiniciar
        if (now - windowStart > windowMs) {
            requestCounts.set(ip, 1);
            requestWindows.set(ip, now);
            return next();
        }
        
        // Incrementar contador
        const count = (requestCounts.get(ip) || 0) + 1;
        requestCounts.set(ip, count);
        
        // Si excede el límite, rechazar
        if (count > maxRequests) {
            console.warn(`⚠️ Rate limit excedido para IP: ${ip} (${count} solicitudes en ${windowMs}ms)`);
            return res.status(429).json({
                success: false,
                error: 'Demasiadas solicitudes. Por favor, intenta más tarde.',
                retryAfter: Math.ceil((windowMs - (now - windowStart)) / 1000)
            });
        }
        
        // Agregar headers de rate limit
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
        res.setHeader('X-RateLimit-Reset', new Date(windowStart + windowMs).toISOString());
        
        next();
    };
}

/**
 * Rate limiter estricto para rutas sensibles (login, etc.)
 */
export const strictRateLimiter = rateLimiter(5, 60000); // 5 solicitudes por minuto

/**
 * Rate limiter normal para rutas generales
 */
export const normalRateLimiter = rateLimiter(100, 60000); // 100 solicitudes por minuto

/**
 * Rate limiter para rutas de API
 */
export const apiRateLimiter = rateLimiter(200, 60000); // 200 solicitudes por minuto
