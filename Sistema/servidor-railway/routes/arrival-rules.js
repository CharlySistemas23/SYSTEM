// Rutas de Reglas de Tarifas de Llegadas
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch, emitToAll } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todas las reglas
router.get('/', asyncHandler(async (req, res) => {
    const { agencyId, branchId, activeOnly = 'false' } = req.query;
    const userBranchId = req.user.branchId;

    let queryText = `
        SELECT ar.*, 
               a.name as agency_name,
               b.name as branch_name
        FROM arrival_rate_rules ar
        LEFT JOIN catalog_agencies a ON ar.agency_id = a.id
        LEFT JOIN catalog_branches b ON ar.branch_id = b.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Filtrar por sucursal del usuario si no es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin) {
        queryText += ` AND (ar.branch_id = $${paramIndex} OR ar.branch_id IS NULL)`;
        params.push(userBranchId);
        paramIndex++;
    } else if (branchId) {
        queryText += ` AND (ar.branch_id = $${paramIndex} OR ar.branch_id IS NULL)`;
        params.push(branchId);
        paramIndex++;
    }

    if (agencyId) {
        queryText += ` AND ar.agency_id = $${paramIndex}`;
        params.push(agencyId);
        paramIndex++;
    }

    if (activeOnly === 'true') {
        const today = new Date().toISOString().split('T')[0];
        queryText += ` AND ar.active_from <= $${paramIndex} AND (ar.active_until IS NULL OR ar.active_until >= $${paramIndex})`;
        params.push(today, today);
        paramIndex += 2;
    }

    queryText += ` ORDER BY ar.active_from DESC, ar.agency_id, ar.min_passengers`;

    const rules = await query(queryText, params);

    res.json({
        success: true,
        data: rules
    });
}));

// Obtener una regla específica
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const rule = await queryOne(`
        SELECT ar.*, 
               a.name as agency_name,
               b.name as branch_name
        FROM arrival_rate_rules ar
        LEFT JOIN catalog_agencies a ON ar.agency_id = a.id
        LEFT JOIN catalog_branches b ON ar.branch_id = b.id
        WHERE ar.id = $1
    `, [id]);

    if (!rule) {
        return res.status(404).json({
            success: false,
            error: 'Regla no encontrada'
        });
    }

    // Verificar acceso si no es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && rule.branch_id && rule.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a esta regla'
        });
    }

    res.json({
        success: true,
        data: rule
    });
}));

// Calcular tarifa de llegada
router.post('/calculate', asyncHandler(async (req, res) => {
    const { agencyId, branchId, passengers, unitType, date } = req.body;
    const userBranchId = req.user.branchId || branchId;

    if (!agencyId || !passengers) {
        return res.status(400).json({
            success: false,
            error: 'agencyId y passengers son requeridos'
        });
    }

    const searchDate = date || new Date().toISOString().split('T')[0];

    // Obtener reglas activas para esta agencia
    let queryText = `
        SELECT * FROM arrival_rate_rules
        WHERE agency_id = $1
        AND active_from <= $2
        AND (active_until IS NULL OR active_until >= $2)
    `;
    const params = [agencyId, searchDate];
    let paramIndex = 3;

    // Filtrar por sucursal
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && (branchId || userBranchId)) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId || userBranchId);
        paramIndex++;
    } else if (isAdmin && branchId) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
        paramIndex++;
    }

    queryText += ` ORDER BY branch_id NULLS LAST, min_passengers DESC`;

    const rules = await query(queryText, params);

    // Filtrar reglas aplicables
    let applicableRules = rules.filter(rule => {
        // Verificar rango de pasajeros
        if (passengers < rule.min_passengers) return false;
        if (rule.max_passengers && passengers > rule.max_passengers) return false;

        // Verificar tipo de unidad si está especificado
        if (unitType && rule.unit_type && rule.unit_type !== unitType) return false;

        return true;
    });

    // Priorizar reglas específicas de sucursal sobre genéricas
    if (applicableRules.length > 0) {
        const branchSpecific = applicableRules.filter(r => r.branch_id);
        if (branchSpecific.length > 0) {
            applicableRules = branchSpecific;
        }
    }

    // Priorizar reglas específicas de tipo de unidad
    if (unitType && applicableRules.length > 0) {
        const unitSpecific = applicableRules.filter(r => r.unit_type === unitType);
        if (unitSpecific.length > 0) {
            applicableRules = unitSpecific;
        }
    }

    // Seleccionar la regla más específica (mayor min_passengers)
    const selectedRule = applicableRules.sort((a, b) => b.min_passengers - a.min_passengers)[0];

    if (!selectedRule) {
        return res.json({
            success: true,
            data: {
                calculatedFee: 0,
                overrideRequired: true,
                message: 'No se encontró regla aplicable. Se requiere tarifa manual.',
                rule: null
            }
        });
    }

    // Calcular tarifa según el tipo de tarifa
    let calculatedFee = 0;
    const feeType = selectedRule.fee_type || 'per_passenger';
    const ratePerPassenger = parseFloat(selectedRule.rate_per_passenger || 0);
    const flatFee = parseFloat(selectedRule.flat_fee || 0);
    const extraPerPassenger = parseFloat(selectedRule.extra_per_passenger || 0);
    
    if (feeType === 'flat') {
        // Tarifa fija
        calculatedFee = flatFee;
        // Si hay extra_per_passenger, agregarlo
        if (extraPerPassenger > 0 && passengers > (selectedRule.max_passengers || 999)) {
            const extraPassengers = passengers - (selectedRule.max_passengers || passengers);
            calculatedFee += extraPerPassenger * extraPassengers;
        }
    } else {
        // Tarifa por pasajero
        calculatedFee = flatFee + (ratePerPassenger * passengers);
        // Si hay extra_per_passenger, agregarlo
        if (extraPerPassenger > 0 && passengers > (selectedRule.max_passengers || 999)) {
            const extraPassengers = passengers - (selectedRule.max_passengers || passengers);
            calculatedFee += extraPerPassenger * extraPassengers;
        }
    }

    res.json({
        success: true,
        data: {
            calculatedFee: calculatedFee,
            overrideRequired: false,
            message: 'Tarifa calculada exitosamente',
            rule: {
                id: selectedRule.id,
                agency_id: selectedRule.agency_id,
                min_passengers: selectedRule.min_passengers,
                max_passengers: selectedRule.max_passengers,
                unit_type: selectedRule.unit_type,
                fee_type: feeType,
                rate_per_passenger: ratePerPassenger,
                flat_fee: flatFee,
                extra_per_passenger: extraPerPassenger
            },
            calculation: {
                fee_type: feeType,
                flat_fee: flatFee,
                rate_per_passenger: ratePerPassenger,
                extra_per_passenger: extraPerPassenger,
                passengers: passengers,
                total: calculatedFee
            }
        }
    });
}));

// Crear nueva regla
router.post('/', asyncHandler(async (req, res) => {
    const { agency_id, branch_id, min_passengers, max_passengers, unit_type, rate_per_passenger, flat_fee, fee_type, extra_per_passenger, active_from, active_until, notes } = req.body;
    const userBranchId = req.user.branchId;

    if (!agency_id || !min_passengers || !active_from) {
        return res.status(400).json({
            success: false,
            error: 'agency_id, min_passengers y active_from son requeridos'
        });
    }
    
    // Validar que al menos tenga flat_fee o rate_per_passenger
    const finalFeeType = fee_type || (flat_fee > 0 ? 'flat' : 'per_passenger');
    if (finalFeeType === 'flat' && !flat_fee) {
        return res.status(400).json({
            success: false,
            error: 'flat_fee es requerido cuando fee_type es "flat"'
        });
    }
    if (finalFeeType === 'per_passenger' && !rate_per_passenger && !flat_fee) {
        return res.status(400).json({
            success: false,
            error: 'rate_per_passenger o flat_fee es requerido cuando fee_type es "per_passenger"'
        });
    }

    // Si no es admin, usar la sucursal del usuario
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const finalBranchId = (!isAdmin || !branch_id) ? userBranchId : branch_id;

    // Verificar que la agencia existe
    const agency = await queryOne(`
        SELECT id FROM catalog_agencies
        WHERE id = $1
    `, [agency_id]);

    if (!agency) {
        return res.status(400).json({
            success: false,
            error: 'Agencia no encontrada'
        });
    }

    const ruleId = `arrival_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const rule = await insert('arrival_rate_rules', {
        id: ruleId,
        agency_id: agency_id,
        branch_id: finalBranchId || null,
        min_passengers: parseInt(min_passengers),
        max_passengers: max_passengers ? parseInt(max_passengers) : null,
        unit_type: unit_type || null,
        fee_type: finalFeeType,
        rate_per_passenger: parseFloat(rate_per_passenger || 0),
        flat_fee: parseFloat(flat_fee || 0),
        extra_per_passenger: parseFloat(extra_per_passenger || 0),
        active_from: active_from,
        active_until: active_until || null,
        notes: notes || null,
        sync_status: 'synced'
    });

    // Emitir evento WebSocket
    emitToBranch(req.io, finalBranchId || userBranchId, 'arrival-rate-rule-created', rule);

    res.status(201).json({
        success: true,
        data: rule,
        message: 'Regla creada exitosamente'
    });
}));

// Actualizar regla
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const existing = await queryOne(`
        SELECT * FROM arrival_rate_rules
        WHERE id = $1
    `, [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Regla no encontrada'
        });
    }

    // Verificar acceso si no es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && existing.branch_id && existing.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para modificar esta regla'
        });
    }

    const updateData = {};
    if (req.body.agency_id !== undefined) updateData.agency_id = req.body.agency_id;
    if (req.body.branch_id !== undefined) {
        updateData.branch_id = isAdmin ? req.body.branch_id : userBranchId;
    }
    if (req.body.min_passengers !== undefined) updateData.min_passengers = parseInt(req.body.min_passengers);
    if (req.body.max_passengers !== undefined) updateData.max_passengers = req.body.max_passengers ? parseInt(req.body.max_passengers) : null;
    if (req.body.unit_type !== undefined) updateData.unit_type = req.body.unit_type || null;
    if (req.body.fee_type !== undefined) updateData.fee_type = req.body.fee_type;
    if (req.body.rate_per_passenger !== undefined) updateData.rate_per_passenger = parseFloat(req.body.rate_per_passenger || 0);
    if (req.body.flat_fee !== undefined) updateData.flat_fee = parseFloat(req.body.flat_fee || 0);
    if (req.body.extra_per_passenger !== undefined) updateData.extra_per_passenger = parseFloat(req.body.extra_per_passenger || 0);
    if (req.body.active_from !== undefined) updateData.active_from = req.body.active_from;
    if (req.body.active_until !== undefined) updateData.active_until = req.body.active_until || null;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes || null;

    const rule = await update('arrival_rate_rules', id, updateData);

    // Emitir evento WebSocket
    const branchIdToEmit = rule.branch_id || existing.branch_id || userBranchId;
    emitToBranch(req.io, branchIdToEmit, 'arrival-rate-rule-updated', rule);

    res.json({
        success: true,
        data: rule,
        message: 'Regla actualizada exitosamente'
    });
}));

// Eliminar regla
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;

    const existing = await queryOne(`
        SELECT * FROM arrival_rate_rules
        WHERE id = $1
    `, [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Regla no encontrada'
        });
    }

    // Verificar acceso si no es admin
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin && existing.branch_id && existing.branch_id !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para eliminar esta regla'
        });
    }

    await remove('arrival_rate_rules', id);

    // Emitir evento WebSocket
    const branchIdToEmit = existing.branch_id || userBranchId;
    emitToBranch(req.io, branchIdToEmit, 'arrival-rate-rule-deleted', { id });

    res.json({
        success: true,
        message: 'Regla eliminada exitosamente'
    });
}));

// Obtener llegadas de agencias (alias para compatibilidad con frontend)
router.get('/arrivals', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, agencyId, branchId, limit = 1000, offset = 0 } = req.query;
    const userBranchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = `
        SELECT aa.*, 
               a.name as agency_name,
               b.name as branch_name
        FROM agency_arrivals aa
        LEFT JOIN catalog_agencies a ON aa.agency_id = a.id
        LEFT JOIN catalog_branches b ON aa.branch_id = b.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    // Filtrar por sucursal
    if (!isAdmin) {
        queryText += ` AND aa.branch_id = $${paramIndex}`;
        params.push(userBranchId);
        paramIndex++;
    } else if (branchId) {
        queryText += ` AND aa.branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }
    
    if (agencyId) {
        queryText += ` AND aa.agency_id = $${paramIndex}`;
        params.push(agencyId);
        paramIndex++;
    }
    
    if (dateFrom) {
        queryText += ` AND aa.date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }
    
    if (dateTo) {
        queryText += ` AND aa.date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }
    
    queryText += ` ORDER BY aa.date DESC, aa.created_at DESC`;
    
    if (limit) {
        queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));
    }
    
    const arrivals = await query(queryText, params);
    
    res.json({
        success: true,
        data: arrivals,
        count: arrivals.length
    });
}));

// Obtener llegadas de agencias (detallado)
router.get('/arrivals/list', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, agencyId, branchId } = req.query;
    const userBranchId = req.user.branchId;

    let queryText = `
        SELECT aa.*, 
               a.name as agency_name,
               b.name as branch_name
        FROM agency_arrivals aa
        LEFT JOIN catalog_agencies a ON aa.agency_id = a.id
        LEFT JOIN catalog_branches b ON aa.branch_id = b.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Filtrar por sucursal
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!isAdmin) {
        queryText += ` AND aa.branch_id = $${paramIndex}`;
        params.push(userBranchId);
        paramIndex++;
    } else if (branchId) {
        queryText += ` AND aa.branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    }

    if (agencyId) {
        queryText += ` AND aa.agency_id = $${paramIndex}`;
        params.push(agencyId);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND aa.date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND aa.date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` ORDER BY aa.date DESC, aa.created_at DESC`;

    const arrivals = await query(queryText, params);

    res.json({
        success: true,
        data: arrivals
    });
}));

// Crear llegada de agencia
router.post('/arrivals', asyncHandler(async (req, res) => {
    const { date, agency_id, passengers, unit_type, arrival_fee, notes } = req.body;
    const userBranchId = req.user.branchId;

    if (!date || !agency_id || !passengers) {
        return res.status(400).json({
            success: false,
            error: 'date, agency_id y passengers son requeridos'
        });
    }

    const arrivalId = `arrival_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const arrival = await insert('agency_arrivals', {
        id: arrivalId,
        date: date,
        agency_id: agency_id,
        branch_id: userBranchId,
        passengers: parseInt(passengers),
        unit_type: unit_type || null,
        arrival_fee: arrival_fee ? parseFloat(arrival_fee) : 0,
        notes: notes || null,
        created_by: req.user.id
    });

    // Emitir evento WebSocket
    emitToBranch(req.io, userBranchId, 'agency-arrival-created', arrival);

    res.status(201).json({
        success: true,
        data: arrival,
        message: 'Llegada registrada exitosamente'
    });
}));

export default router;

