// Rutas de Reparaciones
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todas las reparaciones
router.get('/', asyncHandler(async (req, res) => {
    const { status, dateFrom, dateTo, limit = 100, offset = 0 } = req.query;
    const branchId = req.user.branchId;

    if (!branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado en token'
        });
    }

    let queryText = `
        SELECT r.*, 
               i.name as item_name,
               i.sku as item_sku
        FROM repairs r
        LEFT JOIN inventory_items i ON r.inventory_item_id = i.id
        WHERE r.branch_id = $1
    `;
    const params = [branchId];
    let paramIndex = 2;

    if (status) {
        queryText += ` AND r.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (dateFrom) {
        queryText += ` AND DATE(r.received_at) >= $${paramIndex}`;
        params.push(dateFrom);
        paramIndex++;
    }

    if (dateTo) {
        queryText += ` AND DATE(r.received_at) <= $${paramIndex}`;
        params.push(dateTo);
        paramIndex++;
    }

    queryText += ` ORDER BY r.received_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const repairs = await query(queryText, params);

    // Obtener fotos para cada reparación
    const repairsWithPhotos = await Promise.all(repairs.map(async (repair) => {
        const photos = await query('SELECT * FROM repair_photos WHERE repair_id = $1 ORDER BY is_primary DESC, created_at ASC', [repair.id]);
        return {
            ...repair,
            photos: photos
        };
    }));

    res.json({
        success: true,
        data: repairsWithPhotos
    });
}));

// Obtener una reparación específica
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const repair = await queryOne(`
        SELECT r.*, 
               i.name as item_name,
               i.sku as item_sku,
               i.price as item_price
        FROM repairs r
        LEFT JOIN inventory_items i ON r.inventory_item_id = i.id
        WHERE r.id = $1 AND r.branch_id = $2
    `, [id, branchId]);

    if (!repair) {
        return res.status(404).json({
            success: false,
            error: 'Reparación no encontrada'
        });
    }

    // Obtener fotos
    const photos = await query('SELECT * FROM repair_photos WHERE repair_id = $1 ORDER BY is_primary DESC, created_at ASC', [id]);

    res.json({
        success: true,
        data: {
            ...repair,
            photos: photos
        }
    });
}));

// Crear nueva reparación
router.post('/', asyncHandler(async (req, res) => {
    const {
        inventory_item_id,
        customer_name,
        customer_phone,
        customer_email,
        description,
        cost,
        notes
    } = req.body;
    const branchId = req.user.branchId;

    if (!description) {
        return res.status(400).json({
            success: false,
            error: 'description es requerido'
        });
    }

    // Generar folio
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    
    // Contar reparaciones del mes para generar número secuencial
    const monthStart = `${year}-${month}-01`;
    const monthEnd = `${year}-${month}-31`;
    
    const count = await queryOne(`
        SELECT COUNT(*) as count
        FROM repairs
        WHERE branch_id = $1
        AND DATE(received_at) >= $2
        AND DATE(received_at) <= $3
    `, [branchId, monthStart, monthEnd]);

    const sequentialNumber = String((parseInt(count?.count || 0) + 1)).padStart(4, '0');
    const folio = `REP-${year}${month}-${sequentialNumber}`;

    const repairId = `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const repair = await insert('repairs', {
        id: repairId,
        folio: folio,
        inventory_item_id: inventory_item_id || null,
        branch_id: branchId,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        description: description,
        cost: cost ? parseFloat(cost) : 0,
        status: 'pendiente',
        notes: notes || null,
        created_by: req.user.id,
        received_at: new Date().toISOString()
    });

    res.status(201).json({
        success: true,
        data: repair,
        message: 'Reparación creada exitosamente'
    });
}));

// Actualizar reparación
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM repairs WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Reparación no encontrada'
        });
    }

    const updateData = {};
    
    if (req.body.inventory_item_id !== undefined) updateData.inventory_item_id = req.body.inventory_item_id;
    if (req.body.customer_name !== undefined) updateData.customer_name = req.body.customer_name;
    if (req.body.customer_phone !== undefined) updateData.customer_phone = req.body.customer_phone;
    if (req.body.customer_email !== undefined) updateData.customer_email = req.body.customer_email;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.cost !== undefined) updateData.cost = parseFloat(req.body.cost);
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;

    // Manejar cambios de estado
    if (req.body.status !== undefined && req.body.status !== existing.status) {
        updateData.status = req.body.status;
        
        // Actualizar timestamps según el estado
        const now = new Date().toISOString();
        if (req.body.status === 'en_proceso' && !existing.started_at) {
            updateData.started_at = now;
        } else if (req.body.status === 'completada' && !existing.completed_at) {
            updateData.completed_at = now;
            if (!existing.started_at) {
                updateData.started_at = now;
            }
        } else if (req.body.status === 'entregada' && !existing.delivered_at) {
            updateData.delivered_at = now;
            if (!existing.completed_at) {
                updateData.completed_at = now;
            }
            if (!existing.started_at) {
                updateData.started_at = now;
            }
        }
    }

    updateData.updated_at = new Date().toISOString();

    const repair = await update('repairs', id, updateData);

    res.json({
        success: true,
        data: repair,
        message: 'Reparación actualizada exitosamente'
    });
}));

// Eliminar reparación
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existing = await queryOne('SELECT * FROM repairs WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Reparación no encontrada'
        });
    }

    // Eliminar fotos asociadas primero (incluyendo de Cloudinary)
    const photos = await query('SELECT * FROM repair_photos WHERE repair_id = $1', [id]);
    for (const photo of photos) {
        // Intentar eliminar de Cloudinary si está configurado
        if (process.env.CLOUDINARY_CLOUD_NAME && photo.photo_url && photo.photo_url.includes('cloudinary.com')) {
            try {
                const urlParts = photo.photo_url.split('/upload/');
                if (urlParts.length > 1) {
                    const pathAfterUpload = urlParts[1];
                    const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
                    const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');
                    const { deleteFromCloudinary } = await import('../config/cloudinary.js');
                    await deleteFromCloudinary(publicId, 'image');
                }
            } catch (error) {
                console.warn('No se pudo eliminar foto de Cloudinary:', error.message);
            }
        }
    }
    await query('DELETE FROM repair_photos WHERE repair_id = $1', [id]);

    // Eliminar reparación
    await remove('repairs', id);

    res.json({
        success: true,
        message: 'Reparación eliminada exitosamente'
    });
}));

// Agregar foto a reparación
router.post('/:id/photos', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { photo_url, thumbnail_url, is_primary = false } = req.body;
    const branchId = req.user.branchId;

    if (!photo_url) {
        return res.status(400).json({
            success: false,
            error: 'photo_url es requerido'
        });
    }

    // Verificar que la reparación existe y pertenece a la sucursal
    const repair = await queryOne('SELECT id FROM repairs WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!repair) {
        return res.status(404).json({
            success: false,
            error: 'Reparación no encontrada'
        });
    }

    // Si esta foto es primaria, desmarcar las demás
    if (is_primary) {
        await query('UPDATE repair_photos SET is_primary = false WHERE repair_id = $1', [id]);
    }

    const photoId = `repair_photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const photo = await insert('repair_photos', {
        id: photoId,
        repair_id: id,
        photo_url: photo_url,
        thumbnail_url: thumbnail_url || null,
        is_primary: is_primary
    });

    res.status(201).json({
        success: true,
        data: photo,
        message: 'Foto agregada exitosamente'
    });
}));

// Eliminar foto de reparación
router.delete('/photos/:photoId', asyncHandler(async (req, res) => {
    const { photoId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que la foto existe y pertenece a una reparación de la sucursal
    const photo = await queryOne(`
        SELECT rp.* FROM repair_photos rp
        JOIN repairs r ON rp.repair_id = r.id
        WHERE rp.id = $1 AND r.branch_id = $2
    `, [photoId, branchId]);

    if (!photo) {
        return res.status(404).json({
            success: false,
            error: 'Foto no encontrada'
        });
    }

    // Intentar eliminar de Cloudinary si está configurado y la URL es de Cloudinary
    if (process.env.CLOUDINARY_CLOUD_NAME && photo.photo_url && photo.photo_url.includes('cloudinary.com')) {
        try {
            // Extraer public_id de la URL de Cloudinary
            const urlParts = photo.photo_url.split('/upload/');
            if (urlParts.length > 1) {
                const pathAfterUpload = urlParts[1];
                const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
                const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');
                
                const { deleteFromCloudinary } = await import('../config/cloudinary.js');
                await deleteFromCloudinary(publicId, 'image');
            }
        } catch (error) {
            console.warn('No se pudo eliminar de Cloudinary (continuando):', error.message);
        }
    }

    await query('DELETE FROM repair_photos WHERE id = $1', [photoId]);

    res.json({
        success: true,
        message: 'Foto eliminada exitosamente'
    });
}));

export default router;

