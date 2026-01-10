// Rutas de Configuración del Sistema
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch, emitToAll } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener todas las configuraciones
router.get('/', asyncHandler(async (req, res) => {
    const settings = await query('SELECT * FROM settings ORDER BY key');
    
    // Convertir a objeto clave-valor
    const settingsObj = {};
    settings.forEach(setting => {
        let value = setting.value;
        // Convertir según tipo
        if (setting.type === 'number') {
            value = parseFloat(value);
        } else if (setting.type === 'boolean') {
            value = value === 'true' || value === '1';
        } else if (setting.type === 'json') {
            try {
                value = JSON.parse(value);
            } catch (e) {
                value = value;
            }
        }
        settingsObj[setting.key] = value;
    });

    res.json({
        success: true,
        data: settingsObj
    });
}));

// Obtener una configuración específica
router.get('/:key', asyncHandler(async (req, res) => {
    const { key } = req.params;

    const setting = await queryOne('SELECT * FROM settings WHERE key = $1', [key]);

    if (!setting) {
        return res.status(404).json({
            success: false,
            error: 'Configuración no encontrada'
        });
    }

    let value = setting.value;
    // Convertir según tipo
    if (setting.type === 'number') {
        value = parseFloat(value);
    } else if (setting.type === 'boolean') {
        value = value === 'true' || value === '1';
    } else if (setting.type === 'json') {
        try {
            value = JSON.parse(value);
        } catch (e) {
            value = value;
        }
    }

    res.json({
        success: true,
        data: {
            key: setting.key,
            value: value,
            type: setting.type,
            description: setting.description
        }
    });
}));

// Crear o actualizar configuración
router.post('/', asyncHandler(async (req, res) => {
    const { key, value, type = 'string', description } = req.body;

    if (!key) {
        return res.status(400).json({
            success: false,
            error: 'key es requerido'
        });
    }

    // Verificar si existe
    const existing = await queryOne('SELECT * FROM settings WHERE key = $1', [key]);

    // Convertir valor según tipo
    let finalValue = value;
    if (type === 'number') {
        finalValue = String(parseFloat(value));
    } else if (type === 'boolean') {
        finalValue = value ? 'true' : 'false';
    } else if (type === 'json') {
        finalValue = typeof value === 'string' ? value : JSON.stringify(value);
    } else {
        finalValue = String(value);
    }

    let setting;
    if (existing) {
        // Actualizar
        setting = await update('settings', key, {
            value: finalValue,
            type: type,
            description: description || existing.description,
            updated_at: new Date().toISOString()
        });
    } else {
        // Crear
        setting = await insert('settings', {
            key: key,
            value: finalValue,
            type: type,
            description: description || null
        });
    }

    res.status(existing ? 200 : 201).json({
        success: true,
        data: setting,
        message: existing ? 'Configuración actualizada' : 'Configuración creada'
    });
}));

// Actualizar configuración
router.put('/:key', asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value, type, description } = req.body;

    const existing = await queryOne('SELECT * FROM settings WHERE key = $1', [key]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Configuración no encontrada'
        });
    }

    // Convertir valor según tipo
    const finalType = type || existing.type;
    let finalValue = value !== undefined ? value : existing.value;
    
    if (finalType === 'number') {
        finalValue = String(parseFloat(finalValue));
    } else if (finalType === 'boolean') {
        finalValue = finalValue ? 'true' : 'false';
    } else if (finalType === 'json') {
        finalValue = typeof finalValue === 'string' ? finalValue : JSON.stringify(finalValue);
    } else {
        finalValue = String(finalValue);
    }

    const setting = await update('settings', key, {
        value: finalValue,
        type: finalType,
        description: description !== undefined ? description : existing.description,
        updated_at: new Date().toISOString()
    });

    res.json({
        success: true,
        data: setting,
        message: 'Configuración actualizada'
    });
}));

// Eliminar configuración
router.delete('/:key', asyncHandler(async (req, res) => {
    const { key } = req.params;

    const existing = await queryOne('SELECT * FROM settings WHERE key = $1', [key]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Configuración no encontrada'
        });
    }

    await query('DELETE FROM settings WHERE key = $1', [key]);

    res.json({
        success: true,
        message: 'Configuración eliminada'
    });
}));

// ========== MÉTODOS DE PAGO ==========

// Obtener todos los métodos de pago
router.get('/payment-methods', asyncHandler(async (req, res) => {
    const methods = await query('SELECT * FROM payment_methods ORDER BY order_index, name');

    res.json({
        success: true,
        data: methods
    });
}));

// Obtener un método de pago específico
router.get('/payment-methods/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const method = await queryOne('SELECT * FROM payment_methods WHERE id = $1', [id]);

    if (!method) {
        return res.status(404).json({
            success: false,
            error: 'Método de pago no encontrado'
        });
    }

    res.json({
        success: true,
        data: method
    });
}));

// Crear método de pago
router.post('/payment-methods', asyncHandler(async (req, res) => {
    const { name, code, active = true, requires_bank = false, requires_type = false, order_index = 0 } = req.body;

    if (!name || !code) {
        return res.status(400).json({
            success: false,
            error: 'name y code son requeridos'
        });
    }

    // Verificar que el código no exista
    const existing = await queryOne('SELECT id FROM payment_methods WHERE code = $1', [code]);
    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un método de pago con ese código'
        });
    }

    const methodId = `payment_method_${code}_${Date.now()}`;

    const method = await insert('payment_methods', {
        id: methodId,
        name: name,
        code: code,
        active: active,
        requires_bank: requires_bank,
        requires_type: requires_type,
        order_index: parseInt(order_index || 0)
    });

    // Emitir evento WebSocket (payment_methods es global)
    emitToAll(req.io, 'payment-method-created', method);

    res.status(201).json({
        success: true,
        data: method,
        message: 'Método de pago creado'
    });
}));

// Actualizar método de pago (UPSERT)
router.put('/payment-methods/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, code, active = true, requires_bank = false, requires_type = false, order_index = 0 } = req.body;

    let existing = await queryOne('SELECT * FROM payment_methods WHERE id = $1', [id]);

    // UPSERT: Si no existe, crearlo
    if (!existing) {
        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: 'Nombre y código son requeridos para crear un nuevo método de pago'
            });
        }

        // Verificar que el código no exista en otro método
        const codeConflict = await queryOne('SELECT id FROM payment_methods WHERE code = $1', [code]);
        if (codeConflict) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un método de pago con ese código'
            });
        }

        existing = await insert('payment_methods', {
            id: id,
            name: name,
            code: code,
            active: active,
            requires_bank: requires_bank,
            requires_type: requires_type,
            order_index: parseInt(order_index || 0)
        });

        // Emitir evento WebSocket (payment_methods es global)
        emitToAll(req.io, 'payment-method-created', existing);

        return res.status(201).json({
            success: true,
            data: existing,
            message: 'Método de pago creado'
        });
    }

    // Si existe, actualizar
    // Si se cambia el código, verificar que no exista otro con ese código
    if (code && code !== existing.code) {
        const conflict = await queryOne('SELECT id FROM payment_methods WHERE code = $1 AND id != $2', [code, id]);
        if (conflict) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe otro método de pago con ese código'
            });
        }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (active !== undefined) updateData.active = active;
    if (requires_bank !== undefined) updateData.requires_bank = requires_bank;
    if (requires_type !== undefined) updateData.requires_type = requires_type;
    if (order_index !== undefined) updateData.order_index = parseInt(order_index);
    // updated_at se establece automáticamente en update(), no lo incluimos aquí
    const method = await update('payment_methods', id, updateData);

    // Emitir evento WebSocket (payment_methods es global)
    emitToAll(req.io, 'payment-method-updated', method);

    res.json({
        success: true,
        data: method,
        message: 'Método de pago actualizado'
    });
}));

// Eliminar método de pago
router.delete('/payment-methods/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await queryOne('SELECT * FROM payment_methods WHERE id = $1', [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Método de pago no encontrado'
        });
    }

    await remove('payment_methods', id);

    // Emitir evento WebSocket (payment_methods es global)
    emitToAll(req.io, 'payment-method-deleted', { id });

    res.json({
        success: true,
        message: 'Método de pago eliminado'
    });
}));

// ==================== COMMISSION RULES (Reglas de Comisión) ====================

// Obtener todas las reglas de comisión
router.get('/commission-rules', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = 'SELECT * FROM commission_rules WHERE active = true';
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && requestedBranchId) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(requestedBranchId);
        paramIndex++;
    } else if (!isAdmin && branchId) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
        paramIndex++;
    }
    // Si es admin y no se especifica branchId, mostrar todas (incluyendo las globales con branch_id NULL)
    
    queryText += ' ORDER BY created_at DESC';
    
    const rules = await query(queryText, params);
    
    res.json({
        success: true,
        data: rules,
        count: rules.length
    });
}));

// Obtener una regla de comisión por ID
router.get('/commission-rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    const rule = await queryOne(
        `SELECT * FROM commission_rules WHERE id = $1 ${isAdmin ? '' : 'AND (branch_id = $2 OR branch_id IS NULL)'}`,
        isAdmin ? [id] : [id, branchId]
    );
    
    // Si no existe, retornar null en lugar de 404
    if (!rule) {
        return res.json({
            success: true,
            data: null
        });
    }
    
    res.json({
        success: true,
        data: rule
    });
}));

// Crear nueva regla de comisión
router.post('/commission-rules', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    // Aceptar ambos formatos para compatibilidad (legacy: name/type/value, nuevo: entity_type/entity_id/discount_pct/multiplier)
    const { 
        // Formato nuevo (SQL)
        entity_type, 
        entity_id, 
        discount_pct, 
        multiplier,
        // Formato legacy (para compatibilidad)
        name, 
        type, 
        value, 
        conditions,
        branch_id, 
        active = true 
    } = req.body;
    
    // Validar formato nuevo
    if (entity_type !== undefined) {
        if (!entity_type) {
            return res.status(400).json({
                success: false,
                error: 'entity_type es requerido'
            });
        }
    } 
    // Validar formato legacy (compatibilidad)
    else if (name && type && value !== undefined) {
        // Convertir formato legacy a nuevo
        // Este caso se maneja en el bloque de conversión más abajo
    } else {
        return res.status(400).json({
            success: false,
            error: 'Se requiere entity_type o (name, type, value)'
        });
    }
    
    const ruleId = req.body.id || `commission_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Determinar valores finales (nuevo formato o conversión desde legacy)
    let finalEntityType, finalEntityId, finalDiscountPct, finalMultiplier;
    
    if (entity_type !== undefined) {
        // Usar formato nuevo directamente
        finalEntityType = entity_type;
        finalEntityId = entity_id || null;
        finalDiscountPct = parseFloat(discount_pct || 0);
        finalMultiplier = parseFloat(multiplier || 1);
    } else {
        // Convertir desde formato legacy
        // Intentar extraer información de conditions si existe
        let parsedConditions = {};
        if (conditions) {
            try {
                parsedConditions = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
            } catch (e) {
                parsedConditions = {};
            }
        }
        
        finalEntityType = parsedConditions.entity_type || type || 'seller';
        finalEntityId = parsedConditions.entity_id || null;
        finalDiscountPct = parseFloat(parsedConditions.discount_pct || 0);
        // En formato legacy, value podría ser el multiplier
        finalMultiplier = parseFloat(value || 1);
    }
    
    const rule = await insert('commission_rules', {
        id: ruleId,
        entity_type: finalEntityType,
        entity_id: finalEntityId,
        discount_pct: finalDiscountPct,
        multiplier: finalMultiplier,
        branch_id: branch_id || branchId,
        active
    });
    
    // Emitir evento WebSocket
    const branchIdToEmit = branch_id || branchId;
    emitToBranch(req.io, branchIdToEmit, 'commission-rule-created', rule);
    
    res.status(201).json({
        success: true,
        data: rule
    });
}));

// Actualizar regla de comisión (UPSERT)
router.put('/commission-rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    // Aceptar ambos formatos para compatibilidad
    const { 
        // Formato nuevo (SQL)
        entity_type, 
        entity_id, 
        discount_pct, 
        multiplier,
        // Formato legacy (para compatibilidad)
        name, 
        type, 
        value, 
        conditions,
        branch_id, 
        active = true 
    } = req.body;
    
    let existing = await queryOne(
        `SELECT * FROM commission_rules WHERE id = $1 ${isAdmin ? '' : 'AND (branch_id = $2 OR branch_id IS NULL)'}`,
        isAdmin ? [id] : [id, branchId]
    );
    
    // UPSERT: Si no existe, crearla
    if (!existing) {
        // Validar formato nuevo
        if (entity_type !== undefined) {
            if (!entity_type) {
                return res.status(400).json({
                    success: false,
                    error: 'entity_type es requerido para crear una nueva regla'
                });
            }
        } 
        // Validar formato legacy
        else if (!name || !type || value === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere entity_type o (name, type, value) para crear una nueva regla'
            });
        }
        
        // Determinar valores finales
        let finalEntityType, finalEntityId, finalDiscountPct, finalMultiplier;
        
        if (entity_type !== undefined) {
            finalEntityType = entity_type;
            finalEntityId = entity_id || null;
            finalDiscountPct = parseFloat(discount_pct || 0);
            finalMultiplier = parseFloat(multiplier || 1);
        } else {
            // Convertir desde formato legacy
            let parsedConditions = {};
            if (conditions) {
                try {
                    parsedConditions = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
                } catch (e) {
                    parsedConditions = {};
                }
            }
            
            finalEntityType = parsedConditions.entity_type || type || 'seller';
            finalEntityId = parsedConditions.entity_id || null;
            finalDiscountPct = parseFloat(parsedConditions.discount_pct || 0);
            finalMultiplier = parseFloat(value || 1);
        }
        
        existing = await insert('commission_rules', {
            id: id,
            entity_type: finalEntityType,
            entity_id: finalEntityId,
            discount_pct: finalDiscountPct,
            multiplier: finalMultiplier,
            branch_id: branch_id || branchId,
            active: active
        });
        
        // Emitir evento WebSocket
        const branchIdToEmit = branch_id || branchId;
        emitToBranch(req.io, branchIdToEmit, 'commission-rule-created', existing);
        
        return res.status(201).json({
            success: true,
            data: existing,
            message: 'Regla de comisión creada'
        });
    }
    
    // Si existe, actualizar
    const updates = {};
    
    // Actualizar campos del formato nuevo
    if (entity_type !== undefined) updates.entity_type = entity_type;
    if (entity_id !== undefined) updates.entity_id = entity_id;
    if (discount_pct !== undefined) updates.discount_pct = parseFloat(discount_pct);
    if (multiplier !== undefined) updates.multiplier = parseFloat(multiplier);
    
    // Si se envía formato legacy, convertir
    if (name || type || value !== undefined) {
        let parsedConditions = {};
        if (conditions) {
            try {
                parsedConditions = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
            } catch (e) {
                parsedConditions = {};
            }
        }
        
        if (type !== undefined) updates.entity_type = parsedConditions.entity_type || type;
        if (parsedConditions.entity_id !== undefined) updates.entity_id = parsedConditions.entity_id;
        if (parsedConditions.discount_pct !== undefined) updates.discount_pct = parseFloat(parsedConditions.discount_pct);
        if (value !== undefined) updates.multiplier = parseFloat(value);
    }
    
    if (active !== undefined) updates.active = active;
    if (branch_id !== undefined && isAdmin) updates.branch_id = branch_id;
    
    const updated = await update('commission_rules', id, updates);
    
    // Emitir evento WebSocket
    const branchIdToEmit = updated.branch_id || existing.branch_id || branchId;
    emitToBranch(req.io, branchIdToEmit, 'commission-rule-updated', updated);
    
    res.json({
        success: true,
        data: updated,
        message: 'Regla de comisión actualizada'
    });
}));

// Eliminar regla de comisión
router.delete('/commission-rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    const existing = await queryOne(
        `SELECT * FROM commission_rules WHERE id = $1 ${isAdmin ? '' : 'AND (branch_id = $2 OR branch_id IS NULL)'}`,
        isAdmin ? [id] : [id, branchId]
    );
    
    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Regla de comisión no encontrada'
        });
    }
    
    await remove('commission_rules', id);
    
    // Emitir evento WebSocket
    const branchIdToEmit = existing.branch_id || branchId;
    emitToBranch(req.io, branchIdToEmit, 'commission-rule-deleted', { id });
    
    res.json({
        success: true,
        message: 'Regla de comisión eliminada'
    });
}));

export default router;

