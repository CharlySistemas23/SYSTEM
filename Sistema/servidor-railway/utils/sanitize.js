// Utilidades de Sanitización
// Previene XSS, SQL injection y otros ataques

/**
 * Sanitizar string - Remover caracteres peligrosos
 * @param {string} input - String a sanitizar
 * @param {Object} options - Opciones de sanitización
 * @returns {string} String sanitizado
 */
export function sanitizeString(input, options = {}) {
    if (!input || typeof input !== 'string') {
        return input;
    }
    
    const {
        allowHTML = false,
        maxLength = null,
        trim = true
    } = options;
    
    let sanitized = input;
    
    // Trim si está habilitado
    if (trim) {
        sanitized = sanitized.trim();
    }
    
    // Limitar longitud
    if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    // Si no se permite HTML, escapar caracteres peligrosos
    if (!allowHTML) {
        sanitized = sanitized
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
    
    // Remover caracteres de control
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    return sanitized;
}

/**
 * Sanitizar número - Validar y limpiar
 * @param {any} input - Valor a sanitizar
 * @param {Object} options - Opciones
 * @returns {number|null} Número sanitizado o null
 */
export function sanitizeNumber(input, options = {}) {
    const { min = null, max = null, integer = false } = options;
    
    if (input === null || input === undefined || input === '') {
        return null;
    }
    
    const num = parseFloat(input);
    if (isNaN(num)) {
        return null;
    }
    
    if (integer && !Number.isInteger(num)) {
        return Math.floor(num);
    }
    
    if (min !== null && num < min) {
        return min;
    }
    
    if (max !== null && num > max) {
        return max;
    }
    
    return num;
}

/**
 * Sanitizar email
 * @param {string} email - Email a sanitizar
 * @returns {string|null} Email sanitizado o null
 */
export function sanitizeEmail(email) {
    if (!email || typeof email !== 'string') {
        return null;
    }
    
    const sanitized = email.trim().toLowerCase();
    
    // Validar formato básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitized)) {
        return null;
    }
    
    // Limitar longitud
    if (sanitized.length > 255) {
        return null;
    }
    
    return sanitized;
}

/**
 * Sanitizar objeto completo
 * @param {Object} obj - Objeto a sanitizar
 * @param {Object} schema - Esquema de sanitización { field: { type, options } }
 * @returns {Object} Objeto sanitizado
 */
export function sanitizeObject(obj, schema) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    
    const sanitized = {};
    
    for (const [key, config] of Object.entries(schema)) {
        const { type, options = {} } = config;
        const value = obj[key];
        
        switch (type) {
            case 'string':
                sanitized[key] = sanitizeString(value, options);
                break;
            case 'number':
                sanitized[key] = sanitizeNumber(value, options);
                break;
            case 'email':
                sanitized[key] = sanitizeEmail(value);
                break;
            case 'boolean':
                sanitized[key] = Boolean(value);
                break;
            case 'date':
                sanitized[key] = sanitizeDate(value);
                break;
            case 'array':
                if (Array.isArray(value)) {
                    sanitized[key] = value.map(item => {
                        if (options.itemType === 'string') {
                            return sanitizeString(item, options.itemOptions || {});
                        }
                        return item;
                    });
                } else {
                    sanitized[key] = [];
                }
                break;
            default:
                sanitized[key] = value;
        }
    }
    
    return sanitized;
}

/**
 * Sanitizar fecha
 * @param {any} input - Fecha a sanitizar
 * @returns {string|null} Fecha en formato ISO o null
 */
export function sanitizeDate(input) {
    if (!input) {
        return null;
    }
    
    const date = new Date(input);
    if (isNaN(date.getTime())) {
        return null;
    }
    
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Sanitizar ID - Validar formato de ID
 * @param {any} input - ID a sanitizar
 * @returns {string|null} ID sanitizado o null
 */
export function sanitizeId(input) {
    if (!input) {
        return null;
    }
    
    const id = String(input).trim();
    
    // Validar que solo contenga caracteres alfanuméricos, guiones y guiones bajos
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return null;
    }
    
    // Limitar longitud
    if (id.length > 255) {
        return null;
    }
    
    return id;
}

/**
 * Sanitizar SQL - Prevenir SQL injection (solo para logging, no para queries)
 * @param {string} input - String que podría contener SQL
 * @returns {string} String sanitizado
 */
export function sanitizeSQL(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }
    
    // Remover palabras clave peligrosas de SQL
    const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE'];
    let sanitized = input;
    
    dangerous.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        sanitized = sanitized.replace(regex, '');
    });
    
    return sanitized;
}

/**
 * Middleware de sanitización para request body
 * @param {Object} schema - Esquema de sanitización
 */
export function sanitizeBody(schema) {
    return (req, res, next) => {
        if (req.body && schema) {
            req.body = sanitizeObject(req.body, schema);
        }
        next();
    };
}

/**
 * Middleware de sanitización para query parameters
 */
export function sanitizeQuery(req, res, next) {
    if (req.query) {
        const sanitized = {};
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                sanitized[key] = sanitizeString(value, { maxLength: 500 });
            } else {
                sanitized[key] = value;
            }
        }
        req.query = sanitized;
    }
    next();
}
