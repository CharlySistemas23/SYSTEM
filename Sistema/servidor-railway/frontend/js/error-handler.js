// Error Handler Global - Manejo centralizado de errores
// Intercepta errores no manejados y los muestra al usuario

const ErrorHandler = {
    init() {
        // Interceptar errores de JavaScript no capturados
        window.addEventListener('error', (event) => {
            this.handleError(event.error || event.message, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });
        
        // Interceptar promesas rechazadas no manejadas
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, {
                type: 'unhandledrejection'
            });
        });
        
        // Interceptar errores de fetch/API
        this.interceptAPIErrors();
        
        console.log('✅ Error Handler inicializado');
    },
    
    // Interceptar errores de API
    interceptAPIErrors() {
        // Guardar método original de API.request
        if (typeof API !== 'undefined' && API.request) {
            const originalRequest = API.request.bind(API);
            
            // Wrapper que captura errores
            API.request = async function(...args) {
                try {
                    return await originalRequest(...args);
                } catch (error) {
                    // Si el error no tiene requiresAuth, manejarlo
                    if (!error.requiresAuth) {
                        ErrorHandler.handleAPIError(error, args[0]);
                    }
                    throw error;
                }
            };
        }
    },
    
    // Manejar errores generales
    handleError(error, context = {}) {
        // En desarrollo, loggear todo
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.error('❌ Error no manejado:', error, context);
        }
        
        // Extraer mensaje de error
        let message = 'Ha ocurrido un error inesperado';
        
        if (error) {
            if (typeof error === 'string') {
                message = error;
            } else if (error.message) {
                message = error.message;
            } else if (error.toString) {
                message = error.toString();
            }
        }
        
        // No mostrar errores de recursos (imágenes, etc.)
        if (context.filename && !context.filename.includes('.js')) {
            return;
        }
        
        // Mostrar notificación al usuario
        if (typeof Utils !== 'undefined' && Utils.showError) {
            Utils.showError(message, error);
        } else if (typeof Utils !== 'undefined' && Utils.showNotification) {
            Utils.showNotification(message, 'error', 5000);
        }
    },
    
    // Manejar errores específicos de API
    handleAPIError(error, endpoint) {
        let message = 'Error al comunicarse con el servidor';
        
        if (error.status === 401) {
            message = 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.';
            // Redirigir a login después de un momento
            setTimeout(() => {
                if (typeof App !== 'undefined' && App.showLogin) {
                    App.showLogin();
                }
            }, 2000);
        } else if (error.status === 403) {
            message = 'No tienes permiso para realizar esta acción';
        } else if (error.status === 404) {
            message = 'Recurso no encontrado';
        } else if (error.status === 500) {
            message = 'Error en el servidor. Por favor, intenta más tarde';
        } else if (error.status === 503) {
            message = 'Servicio no disponible. Por favor, intenta más tarde';
        } else if (error.message) {
            message = error.message;
        }
        
        // Mostrar error
        if (typeof Utils !== 'undefined' && Utils.showError) {
            Utils.showError(message, error);
        } else if (typeof Utils !== 'undefined' && Utils.showNotification) {
            Utils.showNotification(message, 'error', 5000);
        }
    },
    
    // Manejar errores de validación
    handleValidationError(errors) {
        if (!errors || typeof errors !== 'object') {
            return;
        }
        
        const errorMessages = Object.values(errors).filter(msg => msg);
        if (errorMessages.length > 0) {
            const message = errorMessages.length === 1 
                ? errorMessages[0]
                : `Errores de validación:\n${errorMessages.join('\n')}`;
            
            if (typeof Utils !== 'undefined' && Utils.showError) {
                Utils.showError(message);
            }
        }
    },
    
    // Wrapper para funciones async que pueden fallar
    async wrapAsync(fn, errorMessage = 'Error al ejecutar operación') {
        try {
            return await fn();
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }
};

// Inicializar al cargar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ErrorHandler.init());
} else {
    ErrorHandler.init();
}

// Exportar globalmente
window.ErrorHandler = ErrorHandler;
