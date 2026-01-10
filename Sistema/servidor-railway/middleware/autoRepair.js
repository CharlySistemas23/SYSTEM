// Middleware de Auto-Reparación en Tiempo Real
// Intercepta errores y los repara automáticamente antes de devolver respuesta
import { repairOnDemand } from '../database/auto-repair.js';

let repairAttempts = new Map(); // Track de intentos de reparación por error
const MAX_REPAIR_ATTEMPTS = 2; // Máximo 2 intentos de reparación por tipo de error

/**
 * Middleware que intercepta errores y los repara automáticamente
 */
export async function autoRepairMiddleware(error, req, res, next) {
    // Solo reparar errores de base de datos específicos
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        const errorKey = `table_${error.message?.match(/relation "([^"]+)" does not exist/i)?.[1] || 'unknown'}`;
        const attempts = repairAttempts.get(errorKey) || 0;

        if (attempts < MAX_REPAIR_ATTEMPTS) {
            repairAttempts.set(errorKey, attempts + 1);
            
            try {
                console.log(`🔄 Auto-reparando error: ${error.message}`);
                const repairResult = await repairOnDemand(error);
                
                if (repairResult.repaired) {
                    console.log(`✅ Error reparado automáticamente: ${repairResult.table || 'tabla'}`);
                    // Limpiar contador después de 5 minutos
                    setTimeout(() => repairAttempts.delete(errorKey), 300000);
                    
                    // Retornar indicador de que se reparó (el errorHandler mostrará mensaje apropiado)
                    error.autoRepaired = true;
                    error.repairedTable = repairResult.table;
                }
            } catch (repairError) {
                console.error('❌ Error en auto-reparación:', repairError);
                // Continuar con el error original
            }
        }
    }

    // Pasar al siguiente middleware (errorHandler)
    next(error);
}

/**
 * Limpiar contadores de intentos periódicamente
 */
setInterval(() => {
    repairAttempts.clear();
}, 3600000); // Cada hora
