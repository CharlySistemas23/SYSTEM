// Rutas de Inventario
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los productos (con filtro por sucursal para admin)
router.get('/', asyncHandler(async (req, res) => {
    // CRÍTICO: Asegurar que branchId existe
    if (!req.user.branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }
    
    const branchId = req.user.branchId;
    const { status, sku, barcode, search, branchId: requestedBranchId } = req.query;

    // Verificar si es admin y si puede ver todas las tiendas
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    // Determinar qué branch_id usar para el filtro
    let filterBranchId = branchId; // Por defecto, su propia tienda
    
    if (isAdmin && requestedBranchId) {
        // Admin puede filtrar por una tienda específica
        filterBranchId = requestedBranchId;
    } else if (!isAdmin) {
        // Usuario normal solo ve su tienda (branchId ya está asignado)
        filterBranchId = branchId;
    }

    // Si es admin y NO se especificó branchId, mostrar TODAS las tiendas
    let queryText;
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && !requestedBranchId) {
        // Admin sin filtro: mostrar todas las tiendas
        queryText = `
            SELECT i.*, b.name as branch_name, b.id as branch_id 
            FROM inventory_items i
            LEFT JOIN catalog_branches b ON i.branch_id = b.id
            WHERE 1=1
        `;
    } else {
        // Filtrar por branch_id específico
        queryText = `
            SELECT i.*, b.name as branch_name, b.id as branch_id 
            FROM inventory_items i
            LEFT JOIN catalog_branches b ON i.branch_id = b.id
            WHERE i.branch_id = $${paramIndex}
        `;
        params.push(filterBranchId);
        paramIndex++;
    }

    if (status) {
        queryText += ` AND i.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    if (sku) {
        queryText += ` AND i.sku = $${paramIndex}`;
        params.push(sku);
        paramIndex++;
    }

    if (barcode) {
        queryText += ` AND i.barcode = $${paramIndex}`;
        params.push(barcode);
        paramIndex++;
    }

    if (search) {
        queryText += ` AND (i.name ILIKE $${paramIndex} OR i.sku ILIKE $${paramIndex} OR i.barcode ILIKE $${paramIndex})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex += 3;
    }

    // Ordenar: primero por sucursal (si es admin), luego por nombre
    if (isAdmin && !requestedBranchId) {
        queryText += ' ORDER BY b.name ASC, i.name ASC';
    } else {
        queryText += ' ORDER BY i.name ASC';
    }

    const items = await query(queryText, params);

    // Obtener foto primaria de cada producto
    const itemsWithPhotos = await Promise.all(items.map(async (item) => {
        const primaryPhoto = await queryOne(`
            SELECT photo_url, thumbnail_url 
            FROM inventory_photos 
            WHERE inventory_item_id = $1 
            ORDER BY is_primary DESC, created_at ASC 
            LIMIT 1
        `, [item.id]);
        
        return {
            ...item,
            primary_photo: primaryPhoto?.photo_url || primaryPhoto?.thumbnail_url || null
        };
    }));

    res.json({
        success: true,
        data: itemsWithPhotos,
        count: itemsWithPhotos.length
    });
}));

// Obtener un producto por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const item = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    // Obtener fotos y certificados
    const photos = await query('SELECT * FROM inventory_photos WHERE inventory_item_id = $1 ORDER BY is_primary DESC, created_at ASC', [id]);
    const certificates = await query('SELECT * FROM inventory_certificates WHERE inventory_item_id = $1 ORDER BY issue_date DESC', [id]);

    res.json({
        success: true,
        data: {
            ...item,
            photos: photos,
            certificates: certificates
        }
    });
}));

// Crear nuevo producto
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    
    const {
        id,
        sku,
        barcode,
        name,
        description,
        metal,
        stone,
        size,
        weight,
        dimensions,
        cost = 0,
        price = 0,
        stock = 0,
        location,
        status = 'disponible',
        deviceId
    } = req.body;

    if (!sku || !name) {
        return res.status(400).json({
            success: false,
            error: 'SKU y nombre son requeridos'
        });
    }

    // Verificar que el SKU no exista en esta tienda
    const existing = await queryOne(
        'SELECT * FROM inventory_items WHERE sku = $1 AND branch_id = $2',
        [sku, branchId]
    );

    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un producto con este SKU en esta tienda'
        });
    }

    const itemId = id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const itemData = {
        id: itemId,
        sku: sku,
        barcode: barcode || null,
        name: name,
        description: description || null,
        metal: metal || null,
        stone: stone || null,
        size: size || null,
        weight: weight || null,
        dimensions: dimensions || null,
        cost: cost,
        price: price,
        stock: stock,
        branch_id: branchId, // CRÍTICO: Usar branch_id del token
        location: location || null,
        status: status,
        device_id: deviceId || null,
        sync_status: 'synced'
    };

    const item = await insert('inventory_items', itemData);

    // Emitir evento WebSocket a la sucursal correspondiente
    emitToBranch(req.io, branchId, 'inventory-item-created', item);

    res.status(201).json({
        success: true,
        data: item
    });
}));

// Actualizar producto
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existingItem = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!existingItem) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    const allowedFields = [
        'sku', 'barcode', 'name', 'description', 'metal', 'stone',
        'size', 'weight', 'dimensions', 'cost', 'price', 'stock',
        'location', 'status'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    // No permitir cambiar branch_id
    if (updateData.branch_id) {
        delete updateData.branch_id;
    }

    const updatedItem = await update('inventory_items', id, updateData);

    // Emitir evento WebSocket
    emitToBranch(req.io, branchId, 'inventory-item-updated', updatedItem);

    res.json({
        success: true,
        data: updatedItem
    });
}));

// Eliminar producto
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Solo admin puede eliminar
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar productos'
        });
    }

    const item = await queryOne(
        'SELECT * FROM inventory_items WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    await remove('inventory_items', id);

    // Emitir evento WebSocket
    emitToBranch(req.io, branchId, 'inventory-item-deleted', { id });

    res.json({
        success: true,
        message: 'Producto eliminado'
    });
}));

// ========== FOTOS DE INVENTARIO ==========

// Obtener fotos de un producto
router.get('/:id/photos', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el producto existe y pertenece a la sucursal
    const item = await queryOne('SELECT id FROM inventory_items WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    const photos = await query('SELECT * FROM inventory_photos WHERE inventory_item_id = $1 ORDER BY is_primary DESC, created_at ASC', [id]);

    res.json({
        success: true,
        data: photos
    });
}));

// Agregar foto a producto
router.post('/:id/photos', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { photo_url, thumbnail_url, is_primary = false } = req.body;
    const branchId = req.user.branchId;

    // Verificar que Cloudinary está configurado si se usa photo_url directamente
    // Si no hay photo_url, esperamos que se use /api/upload/image primero
    if (!photo_url) {
        return res.status(400).json({
            success: false,
            error: 'photo_url es requerido. Primero sube la imagen a /api/upload/image'
        });
    }

    // Verificar que el producto existe y pertenece a la sucursal
    const item = await queryOne('SELECT id FROM inventory_items WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    // Si esta foto es primaria, desmarcar las demás
    if (is_primary) {
        await query('UPDATE inventory_photos SET is_primary = false WHERE inventory_item_id = $1', [id]);
    }

    const photoId = `inv_photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const photo = await insert('inventory_photos', {
        id: photoId,
        inventory_item_id: id,
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

// Eliminar foto de producto
router.delete('/photos/:photoId', asyncHandler(async (req, res) => {
    const { photoId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que la foto existe y pertenece a un producto de la sucursal
    const photo = await queryOne(`
        SELECT ip.* FROM inventory_photos ip
        JOIN inventory_items i ON ip.inventory_item_id = i.id
        WHERE ip.id = $1 AND i.branch_id = $2
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
            // Formato: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
            const urlParts = photo.photo_url.split('/upload/');
            if (urlParts.length > 1) {
                // Obtener la parte después de /upload/
                const pathAfterUpload = urlParts[1];
                // Remover parámetros de transformación (v1234567890/)
                const pathWithoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
                // Remover extensión y obtener public_id
                const publicId = pathWithoutVersion.replace(/\.[^/.]+$/, '');
                
                const { deleteFromCloudinary } = await import('../config/cloudinary.js');
                await deleteFromCloudinary(publicId, 'image');
            }
        } catch (error) {
            console.warn('No se pudo eliminar de Cloudinary (continuando):', error.message);
            // Continuar aunque falle la eliminación en Cloudinary
        }
    }

    await query('DELETE FROM inventory_photos WHERE id = $1', [photoId]);

    res.json({
        success: true,
        message: 'Foto eliminada exitosamente'
    });
}));

// Marcar foto como primaria
router.put('/photos/:photoId/primary', asyncHandler(async (req, res) => {
    const { photoId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que la foto existe y pertenece a un producto de la sucursal
    const photo = await queryOne(`
        SELECT ip.* FROM inventory_photos ip
        JOIN inventory_items i ON ip.inventory_item_id = i.id
        WHERE ip.id = $1 AND i.branch_id = $2
    `, [photoId, branchId]);

    if (!photo) {
        return res.status(404).json({
            success: false,
            error: 'Foto no encontrada'
        });
    }

    // Desmarcar todas las demás fotos del producto
    await query('UPDATE inventory_photos SET is_primary = false WHERE inventory_item_id = $1', [photo.inventory_item_id]);

    // Marcar esta como primaria
    await update('inventory_photos', photoId, {
        is_primary: true
    });

    res.json({
        success: true,
        message: 'Foto marcada como primaria'
    });
}));

// ========== CERTIFICADOS DE INVENTARIO ==========

// Obtener certificados de un producto
router.get('/:id/certificates', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el producto existe y pertenece a la sucursal
    const item = await queryOne('SELECT id FROM inventory_items WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    const certificates = await query('SELECT * FROM inventory_certificates WHERE inventory_item_id = $1 ORDER BY issue_date DESC', [id]);

    res.json({
        success: true,
        data: certificates
    });
}));

// Agregar certificado a producto
router.post('/:id/certificates', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        certificate_number,
        certificate_type,
        issuer,
        issue_date,
        certificate_url,
        notes
    } = req.body;
    const branchId = req.user.branchId;

    if (!certificate_number) {
        return res.status(400).json({
            success: false,
            error: 'certificate_number es requerido'
        });
    }

    // Verificar que el producto existe y pertenece a la sucursal
    const item = await queryOne('SELECT id FROM inventory_items WHERE id = $1 AND branch_id = $2', [id, branchId]);

    if (!item) {
        return res.status(404).json({
            success: false,
            error: 'Producto no encontrado'
        });
    }

    // Verificar que el número de certificado no exista
    const existing = await queryOne('SELECT id FROM inventory_certificates WHERE certificate_number = $1', [certificate_number]);
    if (existing) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un certificado con ese número'
        });
    }

    const certId = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const certificate = await insert('inventory_certificates', {
        id: certId,
        inventory_item_id: id,
        certificate_number: certificate_number,
        certificate_type: certificate_type || null,
        issuer: issuer || null,
        issue_date: issue_date || null,
        certificate_url: certificate_url || null,
        notes: notes || null
    });

    res.status(201).json({
        success: true,
        data: certificate,
        message: 'Certificado agregado exitosamente'
    });
}));

// Eliminar certificado
router.delete('/certificates/:certId', asyncHandler(async (req, res) => {
    const { certId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el certificado existe y pertenece a un producto de la sucursal
    const certificate = await queryOne(`
        SELECT ic.* FROM inventory_certificates ic
        JOIN inventory_items i ON ic.inventory_item_id = i.id
        WHERE ic.id = $1 AND i.branch_id = $2
    `, [certId, branchId]);

    if (!certificate) {
        return res.status(404).json({
            success: false,
            error: 'Certificado no encontrado'
        });
    }

    await query('DELETE FROM inventory_certificates WHERE id = $1', [certId]);

    res.json({
        success: true,
        message: 'Certificado eliminado exitosamente'
    });
}));

// Actualizar certificado
router.put('/certificates/:certId', asyncHandler(async (req, res) => {
    const { certId } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el certificado existe y pertenece a un producto de la sucursal
    const existing = await queryOne(`
        SELECT ic.* FROM inventory_certificates ic
        JOIN inventory_items i ON ic.inventory_item_id = i.id
        WHERE ic.id = $1 AND i.branch_id = $2
    `, [certId, branchId]);

    if (!existing) {
        return res.status(404).json({
            success: false,
            error: 'Certificado no encontrado'
        });
    }

    const updateData = {};
    if (req.body.certificate_number !== undefined && req.body.certificate_number !== existing.certificate_number) {
        // Verificar que el nuevo número no exista
        const conflict = await queryOne('SELECT id FROM inventory_certificates WHERE certificate_number = $1 AND id != $2', [req.body.certificate_number, certId]);
        if (conflict) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe otro certificado con ese número'
            });
        }
        updateData.certificate_number = req.body.certificate_number;
    }
    if (req.body.certificate_type !== undefined) updateData.certificate_type = req.body.certificate_type;
    if (req.body.issuer !== undefined) updateData.issuer = req.body.issuer;
    if (req.body.issue_date !== undefined) updateData.issue_date = req.body.issue_date;
    if (req.body.certificate_url !== undefined) updateData.certificate_url = req.body.certificate_url;
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    updateData.updated_at = new Date().toISOString();

    const certificate = await update('inventory_certificates', certId, updateData);

    res.json({
        success: true,
        data: certificate,
        message: 'Certificado actualizado exitosamente'
    });
}));

export default router;
