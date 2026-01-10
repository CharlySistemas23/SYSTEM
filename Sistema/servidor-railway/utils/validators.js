// Módulo de Validaciones Reutilizables
// Proporciona funciones de validación comunes para todas las rutas

/**
 * Validar branch_id
 * @param {string} branchId - ID de sucursal a validar
 * @param {string} userBranchId - ID de sucursal del usuario
 * @param {boolean} isAdmin - Si el usuario es admin
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateBranchId(branchId, userBranchId, isAdmin = false) {
    if (!branchId) {
        return {
            valid: false,
            error: 'Branch ID es requerido'
        };
    }
    
    if (typeof branchId !== 'string' || branchId.trim().length === 0) {
        return {
            valid: false,
            error: 'Branch ID debe ser una cadena no vacía'
        };
    }
    
    // Si no es admin, debe ser su propia sucursal
    if (!isAdmin && branchId !== userBranchId) {
        return {
            valid: false,
            error: 'No tienes acceso a esta sucursal'
        };
    }
    
    return { valid: true };
}

/**
 * Validar formato de fecha (YYYY-MM-DD)
 * @param {string} date - Fecha a validar
 * @param {boolean} required - Si es requerida
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateDate(date, required = true) {
    if (!date) {
        if (required) {
            return {
                valid: false,
                error: 'Fecha es requerida'
            };
        }
        return { valid: true };
    }
    
    if (typeof date !== 'string') {
        return {
            valid: false,
            error: 'Fecha debe ser una cadena'
        };
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return {
            valid: false,
            error: 'Fecha debe tener el formato YYYY-MM-DD'
        };
    }
    
    // Validar que sea una fecha válida
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
        return {
            valid: false,
            error: 'Fecha inválida'
        };
    }
    
    return { valid: true };
}

/**
 * Validar número
 * @param {any} value - Valor a validar
 * @param {boolean} required - Si es requerido
 * @param {number} min - Valor mínimo (opcional)
 * @param {number} max - Valor máximo (opcional)
 * @returns {Object} { valid: boolean, error?: string, value?: number }
 */
export function validateNumber(value, required = true, min = null, max = null) {
    if (value === undefined || value === null || value === '') {
        if (required) {
            return {
                valid: false,
                error: 'Número es requerido'
            };
        }
        return { valid: true, value: null };
    }
    
    const num = parseFloat(value);
    if (isNaN(num)) {
        return {
            valid: false,
            error: 'Debe ser un número válido'
        };
    }
    
    if (min !== null && num < min) {
        return {
            valid: false,
            error: `El valor debe ser mayor o igual a ${min}`
        };
    }
    
    if (max !== null && num > max) {
        return {
            valid: false,
            error: `El valor debe ser menor o igual a ${max}`
        };
    }
    
    return { valid: true, value: num };
}

/**
 * Validar string
 * @param {any} value - Valor a validar
 * @param {boolean} required - Si es requerido
 * @param {number} minLength - Longitud mínima (opcional)
 * @param {number} maxLength - Longitud máxima (opcional)
 * @returns {Object} { valid: boolean, error?: string, value?: string }
 */
export function validateString(value, required = true, minLength = null, maxLength = null) {
    if (!value) {
        if (required) {
            return {
                valid: false,
                error: 'Campo es requerido'
            };
        }
        return { valid: true, value: null };
    }
    
    if (typeof value !== 'string') {
        return {
            valid: false,
            error: 'Debe ser una cadena de texto'
        };
    }
    
    const trimmed = value.trim();
    
    if (required && trimmed.length === 0) {
        return {
            valid: false,
            error: 'Campo no puede estar vacío'
        };
    }
    
    if (minLength !== null && trimmed.length < minLength) {
        return {
            valid: false,
            error: `Debe tener al menos ${minLength} caracteres`
        };
    }
    
    if (maxLength !== null && trimmed.length > maxLength) {
        return {
            valid: false,
            error: `Debe tener máximo ${maxLength} caracteres`
        };
    }
    
    return { valid: true, value: trimmed };
}

/**
 * Validar email
 * @param {string} email - Email a validar
 * @param {boolean} required - Si es requerido
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateEmail(email, required = false) {
    if (!email) {
        if (required) {
            return {
                valid: false,
                error: 'Email es requerido'
            };
        }
        return { valid: true };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            valid: false,
            error: 'Email inválido'
        };
    }
    
    return { valid: true };
}

/**
 * Validar array
 * @param {any} value - Valor a validar
 * @param {boolean} required - Si es requerido
 * @param {number} minLength - Longitud mínima (opcional)
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateArray(value, required = true, minLength = null) {
    if (!value) {
        if (required) {
            return {
                valid: false,
                error: 'Array es requerido'
            };
        }
        return { valid: true };
    }
    
    if (!Array.isArray(value)) {
        return {
            valid: false,
            error: 'Debe ser un array'
        };
    }
    
    if (minLength !== null && value.length < minLength) {
        return {
            valid: false,
            error: `Debe tener al menos ${minLength} elementos`
        };
    }
    
    return { valid: true };
}

/**
 * Validar objeto
 * @param {any} value - Valor a validar
 * @param {boolean} required - Si es requerido
 * @param {Array<string>} requiredFields - Campos requeridos (opcional)
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateObject(value, required = true, requiredFields = []) {
    if (!value) {
        if (required) {
            return {
                valid: false,
                error: 'Objeto es requerido'
            };
        }
        return { valid: true };
    }
    
    if (typeof value !== 'object' || Array.isArray(value)) {
        return {
            valid: false,
            error: 'Debe ser un objeto'
        };
    }
    
    // Validar campos requeridos
    for (const field of requiredFields) {
        if (!(field in value) || value[field] === undefined || value[field] === null) {
            return {
                valid: false,
                error: `Campo "${field}" es requerido`
            };
        }
    }
    
    return { valid: true };
}

/**
 * Validar ID (formato común)
 * @param {any} id - ID a validar
 * @param {boolean} required - Si es requerido
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateId(id, required = true) {
    if (!id) {
        if (required) {
            return {
                valid: false,
                error: 'ID es requerido'
            };
        }
        return { valid: true };
    }
    
    if (typeof id !== 'string' || id.trim().length === 0) {
        return {
            valid: false,
            error: 'ID debe ser una cadena no vacía'
        };
    }
    
    return { valid: true };
}

/**
 * Validar múltiples campos
 * @param {Object} fields - Objeto con campos a validar { fieldName: { value, validator, options } }
 * @returns {Object} { valid: boolean, errors: Object, values: Object }
 */
export function validateFields(fields) {
    const errors = {};
    const values = {};
    let allValid = true;
    
    for (const [fieldName, config] of Object.entries(fields)) {
        const { value, validator, options = {} } = config;
        const result = validator(value, options.required !== false, ...(options.args || []));
        
        if (!result.valid) {
            errors[fieldName] = result.error;
            allValid = false;
        } else {
            if (result.value !== undefined) {
                values[fieldName] = result.value;
            } else {
                values[fieldName] = value;
            }
        }
    }
    
    return {
        valid: allValid,
        errors,
        values
    };
}
