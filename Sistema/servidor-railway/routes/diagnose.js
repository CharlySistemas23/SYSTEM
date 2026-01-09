// Rutas de Diagnóstico
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { migrate } from '../database/migrate-auto.js';
import { verifyAndRepairAll } from '../database/auto-repair.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Middleware para verificar que sea admin
router.use((req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.permissions?.includes('all'))) {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: 'Acceso denegado - Solo administradores'
        });
    }
});

// Verificar estado de las tablas
router.get('/tables', asyncHandler(async (req, res) => {
    const expectedTables = [
        'catalog_branches', 'users', 'employees', 'customers',
        'catalog_sellers', 'catalog_guides', 'catalog_agencies',
        'inventory_items', 'sales', 'sale_items', 'sale_payments',
        'cash_sessions', 'cash_movements', 'arrival_rate_rules',
        'agency_arrivals', 'repairs', 'tourist_reports',
        'inventory_transfers', 'cost_entries', 'exchange_rates_daily',
        'settings', 'payment_methods'
    ];
    
    const tablesStatus = [];
    
    for (const tableName of expectedTables) {
        try {
            await query(`SELECT 1 FROM ${tableName} LIMIT 1`);
            tablesStatus.push({ name: tableName, exists: true, error: null });
        } catch (error) {
            tablesStatus.push({
                name: tableName,
                exists: false,
                error: error.message || 'Tabla no existe'
            });
        }
    }
    
    const missingTables = tablesStatus.filter(t => !t.exists);
    
    res.json({
        success: true,
        total: expectedTables.length,
        existing: tablesStatus.filter(t => t.exists).length,
        missing: missingTables.length,
        tables: tablesStatus,
        missingTables: missingTables.map(t => t.name)
    });
}));

// Ejecutar migración manualmente
router.post('/migrate', asyncHandler(async (req, res) => {
    try {
        await migrate();
        
        res.json({
            success: true,
            message: 'Migración ejecutada exitosamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}));

// Ejecutar auto-reparación completa
router.post('/auto-repair', asyncHandler(async (req, res) => {
    try {
        const report = await verifyAndRepairAll();
        
        res.json({
            success: true,
            message: 'Auto-reparación ejecutada exitosamente',
            report: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}));

export default router;

