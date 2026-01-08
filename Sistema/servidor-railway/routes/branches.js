// Rutas de Sucursales/Tiendas
import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Obtener todas las sucursales (solo admin o usuarios con permisos)
router.get('/', authenticate, asyncHandler(async (req, res) => {
    // Solo admin puede ver todas las sucursales
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        // Si no es admin, solo devolver su sucursal
        const branch = await queryOne(
            'SELECT * FROM catalog_branches WHERE id = $1',
            [req.user.branchId]
        );
        return res.json({
            success: true,
            data: branch ? [branch] : [],
            count: branch ? 1 : 0
        });
    }

    const branches = await query(
        'SELECT * FROM catalog_branches ORDER BY name ASC'
    );

    res.json({
        success: true,
        data: branches,
        count: branches.length
    });
}));

// Obtener una sucursal por ID
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Si no es admin, solo puede ver su propia sucursal
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        if (id !== req.user.branchId) {
            return res.status(403).json({
                success: false,
                error: 'No tienes acceso a esta sucursal'
            });
        }
    }

    const branch = await queryOne(
        'SELECT * FROM catalog_branches WHERE id = $1',
        [id]
    );

    if (!branch) {
        return res.status(404).json({
            success: false,
            error: 'Sucursal no encontrada'
        });
    }

    res.json({
        success: true,
        data: branch
    });
}));

// Crear nueva sucursal (solo admin)
router.post('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
    const {
        id,
        name,
        address,
        phone,
        email,
        active = true
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'Nombre es requerido'
        });
    }

    const branchId = id || `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const branchData = {
        id: branchId,
        name: name,
        address: address || null,
        phone: phone || null,
        email: email || null,
        active: active
    };

    const branch = await insert('catalog_branches', branchData);

    // Emitir evento a todos (creación de sucursal)
    emitToAll('branch-created', branch);

    res.status(201).json({
        success: true,
        data: branch
    });
}));

// Actualizar sucursal (solo admin)
router.put('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingBranch = await queryOne(
        'SELECT * FROM catalog_branches WHERE id = $1',
        [id]
    );

    if (!existingBranch) {
        return res.status(404).json({
            success: false,
            error: 'Sucursal no encontrada'
        });
    }

    const allowedFields = ['name', 'address', 'phone', 'email', 'active'];
    const updateData = {};

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    const updatedBranch = await update('catalog_branches', id, updateData);

    // Emitir evento a todas las tiendas
    emitToAll('branch-updated', updatedBranch);

    res.json({
        success: true,
        data: updatedBranch
    });
}));

// Eliminar sucursal (solo admin - cuidado, elimina todos los datos asociados)
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const branch = await queryOne(
        'SELECT * FROM catalog_branches WHERE id = $1',
        [id]
    );

    if (!branch) {
        return res.status(404).json({
            success: false,
            error: 'Sucursal no encontrada'
        });
    }

    // WARNING: Esto eliminará todos los datos asociados (CASCADE)
    await remove('catalog_branches', id);

    // Emitir evento
    emitToAll('branch-deleted', { id });

    res.json({
        success: true,
        message: 'Sucursal eliminada (y todos sus datos asociados)'
    });
}));

export default router;
