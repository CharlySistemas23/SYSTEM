// Módulo de Validaciones Frontend
// Proporciona funciones de validación reutilizables para formularios

const Validators = {
    // Validar email
    email(email) {
        if (!email) return { valid: false, error: 'Email es requerido' };
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, error: 'Email inválido' };
        }
        return { valid: true };
    },
    
    // Validar teléfono
    phone(phone) {
        if (!phone) return { valid: true }; // Opcional
        // Permitir números, espacios, guiones, paréntesis
        const phoneRegex = /^[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(phone)) {
            return { valid: false, error: 'Teléfono inválido' };
        }
        // Debe tener al menos 10 dígitos
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) {
            return { valid: false, error: 'Teléfono debe tener al menos 10 dígitos' };
        }
        return { valid: true };
    },
    
    // Validar número
    number(value, options = {}) {
        const { required = true, min = null, max = null, integer = false } = options;
        
        if (!value && !required) return { valid: true };
        if (!value && required) return { valid: false, error: 'Número es requerido' };
        
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: 'Debe ser un número válido' };
        }
        
        if (integer && !Number.isInteger(num)) {
            return { valid: false, error: 'Debe ser un número entero' };
        }
        
        if (min !== null && num < min) {
            return { valid: false, error: `El valor debe ser mayor o igual a ${min}` };
        }
        
        if (max !== null && num > max) {
            return { valid: false, error: `El valor debe ser menor o igual a ${max}` };
        }
        
        return { valid: true, value: integer ? Math.floor(num) : num };
    },
    
    // Validar string
    string(value, options = {}) {
        const { required = true, minLength = null, maxLength = null, pattern = null } = options;
        
        if (!value && !required) return { valid: true };
        if (!value && required) return { valid: false, error: 'Campo es requerido' };
        
        const str = String(value).trim();
        
        if (required && str.length === 0) {
            return { valid: false, error: 'Campo no puede estar vacío' };
        }
        
        if (minLength !== null && str.length < minLength) {
            return { valid: false, error: `Debe tener al menos ${minLength} caracteres` };
        }
        
        if (maxLength !== null && str.length > maxLength) {
            return { valid: false, error: `Debe tener máximo ${maxLength} caracteres` };
        }
        
        if (pattern && !pattern.test(str)) {
            return { valid: false, error: 'Formato inválido' };
        }
        
        return { valid: true, value: str };
    },
    
    // Validar fecha
    date(date, options = {}) {
        const { required = true, min = null, max = null } = options;
        
        if (!date && !required) return { valid: true };
        if (!date && required) return { valid: false, error: 'Fecha es requerida' };
        
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            return { valid: false, error: 'Fecha inválida' };
        }
        
        if (min) {
            const minDate = new Date(min);
            if (dateObj < minDate) {
                return { valid: false, error: `La fecha debe ser posterior a ${min}` };
            }
        }
        
        if (max) {
            const maxDate = new Date(max);
            if (dateObj > maxDate) {
                return { valid: false, error: `La fecha debe ser anterior a ${max}` };
            }
        }
        
        return { valid: true, value: date };
    },
    
    // Validar PIN
    pin(pin, options = {}) {
        const { required = true, length = 4 } = options;
        
        if (!pin && !required) return { valid: true };
        if (!pin && required) return { valid: false, error: 'PIN es requerido' };
        
        const pinStr = String(pin);
        if (!/^\d+$/.test(pinStr)) {
            return { valid: false, error: 'PIN debe contener solo números' };
        }
        
        if (pinStr.length !== length) {
            return { valid: false, error: `PIN debe tener ${length} dígitos` };
        }
        
        return { valid: true, value: pinStr };
    },
    
    // Validar código de barras
    barcode(barcode, options = {}) {
        const { required = true, minLength = 8, maxLength = 20 } = options;
        
        if (!barcode && !required) return { valid: true };
        if (!barcode && required) return { valid: false, error: 'Código de barras es requerido' };
        
        const barcodeStr = String(barcode).trim();
        if (barcodeStr.length < minLength) {
            return { valid: false, error: `Código de barras debe tener al menos ${minLength} caracteres` };
        }
        
        if (barcodeStr.length > maxLength) {
            return { valid: false, error: `Código de barras debe tener máximo ${maxLength} caracteres` };
        }
        
        return { valid: true, value: barcodeStr };
    },
    
    // Validar SKU
    sku(sku, options = {}) {
        const { required = true } = options;
        
        if (!sku && !required) return { valid: true };
        if (!sku && required) return { valid: false, error: 'SKU es requerido' };
        
        const skuStr = String(sku).trim();
        if (skuStr.length === 0) {
            return { valid: false, error: 'SKU no puede estar vacío' };
        }
        
        return { valid: true, value: skuStr };
    },
    
    // Validar porcentaje
    percentage(value, options = {}) {
        const { required = true, min = 0, max = 100 } = options;
        
        const numResult = this.number(value, { required, min, max });
        if (!numResult.valid) {
            return numResult;
        }
        
        return { valid: true, value: numResult.value };
    },
    
    // Validar múltiples campos
    validateFields(fields) {
        const errors = {};
        const values = {};
        let allValid = true;
        
        for (const [fieldName, config] of Object.entries(fields)) {
            const { value, validator, options = {} } = config;
            const result = validator(value, options);
            
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
    },
    
    // Mostrar errores en formulario
    showFormErrors(formElement, errors) {
        // Limpiar errores anteriores
        formElement.querySelectorAll('.field-error').forEach(el => el.remove());
        formElement.querySelectorAll('.field-invalid').forEach(el => {
            el.classList.remove('field-invalid');
        });
        
        // Mostrar nuevos errores
        for (const [fieldName, errorMessage] of Object.entries(errors)) {
            const field = formElement.querySelector(`[name="${fieldName}"], #${fieldName}`);
            if (field) {
                field.classList.add('field-invalid');
                
                const errorEl = document.createElement('div');
                errorEl.className = 'field-error';
                errorEl.textContent = errorMessage;
                errorEl.style.cssText = `
                    color: #d32f2f;
                    font-size: 12px;
                    margin-top: 4px;
                    padding-left: 4px;
                `;
                
                // Insertar después del campo
                field.parentNode.insertBefore(errorEl, field.nextSibling);
            }
        }
    },
    
    // Limpiar errores de formulario
    clearFormErrors(formElement) {
        formElement.querySelectorAll('.field-error').forEach(el => el.remove());
        formElement.querySelectorAll('.field-invalid').forEach(el => {
            el.classList.remove('field-invalid');
        });
    },
    
    // Validar formulario completo
    validateForm(formElement, fieldValidations) {
        const formData = new FormData(formElement);
        const fields = {};
        
        for (const [fieldName, validation] of Object.entries(fieldValidations)) {
            const field = formElement.querySelector(`[name="${fieldName}"], #${fieldName}`);
            const value = field ? (field.value || field.textContent) : null;
            
            fields[fieldName] = {
                value,
                validator: validation.validator,
                options: validation.options || {}
            };
        }
        
        const result = this.validateFields(fields);
        
        if (!result.valid) {
            this.showFormErrors(formElement, result.errors);
        } else {
            this.clearFormErrors(formElement);
        }
        
        return result;
    }
};

// Exportar globalmente
window.Validators = Validators;
