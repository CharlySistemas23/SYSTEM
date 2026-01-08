// Rutas de Tipos de Cambio
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, queryOne, insert, update } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener todos los tipos de cambio
router.get('/', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, limit = 100, offset = 0 } = req.query;

    let queryText = 'SELECT * FROM exchange_rates_daily WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (dateFrom) {
        queryText += ` AND date >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND date <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const rates = await query(queryText, params);

    res.json({
        success: true,
        data: rates
    });
}));

// Obtener tipo de cambio para una fecha específica
router.get('/:date', asyncHandler(async (req, res) => {
    const { date } = req.params;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
    }

    let rate = await queryOne(`
        SELECT * FROM exchange_rates_daily
        WHERE date = $1
    `, [date]);

    // Si no existe para esa fecha, buscar el más cercano anterior
    if (!rate) {
        rate = await queryOne(`
            SELECT * FROM exchange_rates_daily
            WHERE date <= $1
            ORDER BY date DESC
            LIMIT 1
        `, [date]);
    }

    // Si aún no existe, retornar valores por defecto
    if (!rate) {
        rate = {
            date: date,
            usd: 20.00,
            cad: 15.00,
            source: 'default'
        };
    }

    res.json({
        success: true,
        data: rate
    });
}));

// Obtener tipo de cambio actual (hoy)
router.get('/current', asyncHandler(async (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    let rate = await queryOne(`
        SELECT * FROM exchange_rates_daily
        WHERE date = $1
    `, [today]);

    // Si no existe para hoy, buscar el más reciente
    if (!rate) {
        rate = await queryOne(`
            SELECT * FROM exchange_rates_daily
            ORDER BY date DESC
            LIMIT 1
        `);
    }

    // Si aún no existe, retornar valores por defecto
    if (!rate) {
        rate = {
            date: today,
            usd: 20.00,
            cad: 15.00,
            source: 'default'
        };
    }

    res.json({
        success: true,
        data: rate
    });
}));

// Crear o actualizar tipo de cambio para una fecha
router.post('/', asyncHandler(async (req, res) => {
    const { date, usd, cad } = req.body;

    if (!date) {
        return res.status(400).json({
            success: false,
            error: 'date es requerido'
        });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
    }

    // Verificar si ya existe
    const existing = await queryOne(`
        SELECT * FROM exchange_rates_daily
        WHERE date = $1
    `, [date]);

    const rateId = existing?.id || `exchange_rate_${date.replace(/-/g, '')}_${Math.random().toString(36).substr(2, 9)}`;

    let rate;
    if (existing) {
        // Actualizar existente
        rate = await update('exchange_rates_daily', rateId, {
            usd: parseFloat(usd || existing.usd || 20.00),
            cad: parseFloat(cad || existing.cad || 15.00),
            updated_at: new Date().toISOString()
        });
    } else {
        // Crear nuevo
        rate = await insert('exchange_rates_daily', {
            id: rateId,
            date: date,
            usd: parseFloat(usd || 20.00),
            cad: parseFloat(cad || 15.00)
        });
    }

    res.status(existing ? 200 : 201).json({
        success: true,
        data: rate,
        message: existing ? 'Tipo de cambio actualizado' : 'Tipo de cambio creado'
    });
}));

// Actualizar tipo de cambio existente
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date, usd, cad } = req.body;

    const existing = await queryOne(`
        SELECT * FROM exchange_rates_daily
        WHERE id = $1
    `, [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Tipo de cambio no encontrado'
        });
    }

    const updateData = {};
    if (usd !== undefined) updateData.usd = parseFloat(usd);
    if (cad !== undefined) updateData.cad = parseFloat(cad);
    if (date && date !== existing.date) {
        // Verificar que no exista otro registro con esa fecha
        const conflict = await queryOne(`
            SELECT id FROM exchange_rates_daily
            WHERE date = $1 AND id != $2
        `, [date, id]);
        
        if (conflict) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un tipo de cambio para esa fecha'
            });
        }
        updateData.date = date;
    }

    updateData.updated_at = new Date().toISOString();

    const rate = await update('exchange_rates_daily', id, updateData);

    res.json({
        success: true,
        data: rate,
        message: 'Tipo de cambio actualizado'
    });
}));

// Eliminar tipo de cambio
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await queryOne(`
        SELECT * FROM exchange_rates_daily
        WHERE id = $1
    `, [id]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Tipo de cambio no encontrado'
        });
    }

    await query(`
        DELETE FROM exchange_rates_daily
        WHERE id = $1
    `, [id]);

    res.json({
        success: true,
        message: 'Tipo de cambio eliminado'
    });
}));

export default router;

