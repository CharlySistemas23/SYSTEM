import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

/**
 * GET /api/debug/data-stats
 * Devuelve conteos de inventario y sesiones de caja para la sucursal del usuario.
 * Sirve para diagnosticar si "no hay datos" es por BD vacía o por fallo de conexión.
 * Requiere authenticateOptional (mismo que inventario/caja).
 */
router.get('/data-stats', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Se requiere usuario (token o x-username/x-branch-id)' });
    }
    const branchId = req.user.branchId || (req.headers['x-branch-id'] || '').trim() || null;
    const isMasterAdmin = !!req.user.isMasterAdmin;

    let inventoryCount = 0;
    let cashSessionsCount = 0;

    if (branchId || isMasterAdmin) {
      if (branchId) {
        const inv = await query(
          `SELECT COUNT(*)::int AS c FROM inventory_items WHERE branch_id = $1::uuid`,
          [branchId]
        );
        inventoryCount = inv?.rows?.[0]?.c ?? 0;
        const cash = await query(
          `SELECT COUNT(*)::int AS c FROM cash_sessions WHERE branch_id = $1::uuid`,
          [branchId]
        );
        cashSessionsCount = cash?.rows?.[0]?.c ?? 0;
      } else {
        const inv = await query(`SELECT COUNT(*)::int AS c FROM inventory_items`, []);
        inventoryCount = inv?.rows?.[0]?.c ?? 0;
        const cash = await query(`SELECT COUNT(*)::int AS c FROM cash_sessions`, []);
        cashSessionsCount = cash?.rows?.[0]?.c ?? 0;
      }
    }

    res.json({
      branch_id: branchId,
      inventory_count: inventoryCount,
      cash_sessions_count: cashSessionsCount,
      message: (inventoryCount === 0 && cashSessionsCount === 0)
        ? 'La base de datos del servidor no tiene registros para esta sucursal. Verifica migraciones o restauración en Railway.'
        : undefined
    });
  } catch (error) {
    console.error('Error en /api/debug/data-stats:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      details: error?.message
    });
  }
});

export default router;
