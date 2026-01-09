// CSRF Protection Middleware
// Previene ataques Cross-Site Request Forgery

import { randomBytes, createHash } from 'crypto';

// Almacenar tokens en memoria (en producción usar Redis o similar)
const tokens = new Map();

// Generar token CSRF
export function generateCSRFToken() {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + (60 * 60 * 1000); // 1 hora
    
    tokens.set(token, {
        expires,
        createdAt: Date.now()
    });
    
    // Limpiar tokens expirados periódicamente
    if (tokens.size > 1000) {
        cleanupExpiredTokens();
    }
    
    return token;
}

// Validar token CSRF
export function validateCSRFToken(token) {
    if (!token) {
        return false;
    }
    
    const tokenData = tokens.get(token);
    if (!tokenData) {
        return false;
    }
    
    // Verificar expiración
    if (Date.now() > tokenData.expires) {
        tokens.delete(token);
        return false;
    }
    
    return true;
}

// Limpiar tokens expirados
function cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of tokens.entries()) {
        if (now > data.expires) {
            tokens.delete(token);
        }
    }
}

// Middleware para generar token CSRF
export function csrfToken(req, res, next) {
    // Solo para métodos que requieren protección
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    // Obtener token del header o body
    const token = req.headers['x-csrf-token'] || req.body?._csrf;
    
    if (!token) {
        return res.status(403).json({
            success: false,
            error: 'Token CSRF requerido'
        });
    }
    
    if (!validateCSRFToken(token)) {
        return res.status(403).json({
            success: false,
            error: 'Token CSRF inválido o expirado'
        });
    }
    
    // Eliminar token usado (one-time use)
    tokens.delete(token);
    
    next();
}

// Middleware para obtener token (para rutas GET)
export function getCSRFToken(req, res, next) {
    const token = generateCSRFToken();
    res.locals.csrfToken = token;
    res.setHeader('X-CSRF-Token', token);
    next();
}

// Endpoint para obtener token CSRF
export function csrfTokenRoute(req, res) {
    const token = generateCSRFToken();
    res.json({
        success: true,
        token,
        expiresIn: 3600 // segundos
    });
}
