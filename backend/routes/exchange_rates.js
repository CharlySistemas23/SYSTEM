import express from 'express';
import { query } from '../config/database.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Listar tipos de cambio
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let sql = 'SELECT * FROM exchange_rates_daily WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (start_date) {
      sql += ` AND date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    sql += ' ORDER BY date DESC LIMIT 365';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tipos de cambio:', error);
    res.status(500).json({ error: 'Error al obtener tipos de cambio' });
  }
});

// Obtener tipo de cambio de hoy
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await query(
      'SELECT * FROM exchange_rates_daily WHERE date = $1 ORDER BY created_at DESC LIMIT 1',
      [today]
    );

    if (result.rows.length === 0) {
      // Si no hay tipo de cambio de hoy, devolver el más reciente
      const latestResult = await query(
        'SELECT * FROM exchange_rates_daily ORDER BY date DESC LIMIT 1'
      );

      if (latestResult.rows.length === 0) {
        return res.status(404).json({ error: 'No hay tipos de cambio registrados' });
      }

      return res.json(latestResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo tipo de cambio de hoy:', error);
    res.status(500).json({ error: 'Error al obtener tipo de cambio' });
  }
});

// Obtener tipo de cambio de una fecha específica
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;

    const result = await query(
      'SELECT * FROM exchange_rates_daily WHERE date = $1 ORDER BY created_at DESC LIMIT 1',
      [date]
    );

    if (result.rows.length === 0) {
      // Buscar el más cercano anterior
      const closestResult = await query(
        'SELECT * FROM exchange_rates_daily WHERE date <= $1 ORDER BY date DESC LIMIT 1',
        [date]
      );

      if (closestResult.rows.length === 0) {
        // Si la tabla está vacía, devolver un fallback estable para no romper POS.
        // El frontend también tiene fallback local, pero esto evita spam de errores y retries.
        const usd = parseFloat(process.env.DEFAULT_USD_TO_MXN || '20');
        const cad = parseFloat(process.env.DEFAULT_CAD_TO_MXN || '15');
        return res.json({
          id: `default-${date}`,
          date,
          usd_to_mxn: usd,
          cad_to_mxn: cad,
          source: 'default'
        });
      }

      return res.json(closestResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo tipo de cambio:', error);
    res.status(500).json({ error: 'Error al obtener tipo de cambio' });
  }
});

// Crear/actualizar tipo de cambio
router.post('/', [
  body('date').notEmpty().withMessage('Fecha requerida'),
  body('usd_to_mxn').isNumeric().withMessage('Tipo de cambio USD requerido'),
  body('cad_to_mxn').isNumeric().withMessage('Tipo de cambio CAD requerido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { date, usd_to_mxn, cad_to_mxn } = req.body;

    // Usar INSERT ... ON CONFLICT para evitar condiciones de carrera
    // Esto es más seguro que verificar y luego insertar
    let result;
    try {
      result = await query(
        `INSERT INTO exchange_rates_daily (date, usd_to_mxn, cad_to_mxn)
         VALUES ($1, $2, $3)
         ON CONFLICT (date) 
         DO UPDATE SET 
           usd_to_mxn = EXCLUDED.usd_to_mxn,
           cad_to_mxn = EXCLUDED.cad_to_mxn,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [date, usd_to_mxn, cad_to_mxn]
      );
      
      // Verificar si fue insert o update
      const wasUpdate = result.rows[0].updated_at && 
                        new Date(result.rows[0].updated_at) > new Date(result.rows[0].created_at);
      
      res.status(wasUpdate ? 200 : 201).json(result.rows[0]);
    } catch (insertError) {
      // Si falla por otra razón (no por duplicado), intentar actualizar
      if (insertError.code !== '23505') {
        const updateResult = await query(
          `UPDATE exchange_rates_daily
           SET usd_to_mxn = $1, cad_to_mxn = $2, updated_at = CURRENT_TIMESTAMP
           WHERE date = $3
           RETURNING *`,
          [usd_to_mxn, cad_to_mxn, date]
        );
        
        if (updateResult.rows.length > 0) {
          return res.status(200).json(updateResult.rows[0]);
        }
      }
      throw insertError;
    }
  } catch (error) {
    if (error.code === '23505') { // Unique violation (fallback)
      // Intentar actualizar si el INSERT falló
      try {
        const updateResult = await query(
          `UPDATE exchange_rates_daily
           SET usd_to_mxn = $1, cad_to_mxn = $2, updated_at = CURRENT_TIMESTAMP
           WHERE date = $3
           RETURNING *`,
          [usd_to_mxn, cad_to_mxn, date]
        );
        if (updateResult.rows.length > 0) {
          return res.status(200).json(updateResult.rows[0]);
        }
      } catch (updateError) {
        console.error('Error actualizando tipo de cambio:', updateError);
      }
      return res.status(400).json({ error: 'Ya existe un tipo de cambio para esta fecha' });
    }
    console.error('Error guardando tipo de cambio:', error);
    res.status(500).json({ error: 'Error al guardar tipo de cambio' });
  }
});

export default router;
