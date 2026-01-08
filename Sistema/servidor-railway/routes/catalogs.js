// Rutas de Catálogos (Sellers, Guides, Agencies)
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ==================== SELLERS (Vendedores) ====================

router.get('/sellers', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = 'SELECT * FROM catalog_sellers WHERE active = true';
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && requestedBranchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(requestedBranchId);
    } else if (!isAdmin) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
    }
    
    queryText += ' ORDER BY name';
    
    const sellers = await query(queryText, params);
    
    res.json({
        success: true,
        data: sellers,
        count: sellers.length
    });
}));

router.get('/sellers/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const seller = await queryOne('SELECT * FROM catalog_sellers WHERE id = $1', [id]);
    
    if (!seller) {
        return res.status(404).json({
            success: false,
            error: 'Vendedor no encontrado'
        });
    }
    
    res.json({
        success: true,
        data: seller
    });
}));

router.post('/sellers', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { name, barcode, branch_id } = req.body;
    
    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'El nombre es requerido'
        });
    }
    
    const sellerId = req.body.id || `seller_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const seller = await insert('catalog_sellers', {
        id: sellerId,
        name,
        barcode: barcode || null,
        branch_id: branch_id || branchId,
        active: true
    });
    
    emitToBranch(req.io, branchId, 'seller-created', seller);
    
    res.json({
        success: true,
        data: seller
    });
}));

router.put('/sellers/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, barcode, active, branch_id } = req.body;
    
    const seller = await queryOne('SELECT * FROM catalog_sellers WHERE id = $1', [id]);
    
    if (!seller) {
        return res.status(404).json({
            success: false,
            error: 'Vendedor no encontrado'
        });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (barcode !== undefined) updates.barcode = barcode;
    if (active !== undefined) updates.active = active;
    if (branch_id !== undefined) updates.branch_id = branch_id;
    
    const updated = await update('catalog_sellers', id, updates);
    
    emitToBranch(req.io, updated.branch_id || seller.branch_id, 'seller-updated', updated);
    
    res.json({
        success: true,
        data: updated
    });
}));

router.delete('/sellers/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const seller = await queryOne('SELECT * FROM catalog_sellers WHERE id = $1', [id]);
    
    if (!seller) {
        return res.status(404).json({
            success: false,
            error: 'Vendedor no encontrado'
        });
    }
    
    await remove('catalog_sellers', id);
    
    emitToBranch(req.io, seller.branch_id, 'seller-deleted', { id });
    
    res.json({
        success: true,
        message: 'Vendedor eliminado'
    });
}));

// ==================== GUIDES (Guías) ====================

router.get('/guides', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId, agencyId } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = 'SELECT * FROM catalog_guides WHERE active = true';
    const params = [];
    let paramIndex = 1;
    
    if (agencyId) {
        queryText += ` AND agency_id = $${paramIndex}`;
        params.push(agencyId);
        paramIndex++;
    }
    
    if (isAdmin && requestedBranchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(requestedBranchId);
    } else if (!isAdmin) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
    }
    
    queryText += ' ORDER BY name';
    
    const guides = await query(queryText, params);
    
    res.json({
        success: true,
        data: guides,
        count: guides.length
    });
}));

router.get('/guides/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const guide = await queryOne('SELECT * FROM catalog_guides WHERE id = $1', [id]);
    
    if (!guide) {
        return res.status(404).json({
            success: false,
            error: 'Guía no encontrado'
        });
    }
    
    res.json({
        success: true,
        data: guide
    });
}));

router.post('/guides', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { name, barcode, agency_id, branch_id } = req.body;
    
    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'El nombre es requerido'
        });
    }
    
    const guideId = req.body.id || `guide_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const guide = await insert('catalog_guides', {
        id: guideId,
        name,
        barcode: barcode || null,
        agency_id: agency_id || null,
        branch_id: branch_id || branchId,
        active: true
    });
    
    emitToBranch(req.io, branch_id || branchId, 'guide-created', guide);
    
    res.json({
        success: true,
        data: guide
    });
}));

router.put('/guides/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, barcode, active, agency_id, branch_id } = req.body;
    
    const guide = await queryOne('SELECT * FROM catalog_guides WHERE id = $1', [id]);
    
    if (!guide) {
        return res.status(404).json({
            success: false,
            error: 'Guía no encontrado'
        });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (barcode !== undefined) updates.barcode = barcode;
    if (active !== undefined) updates.active = active;
    if (agency_id !== undefined) updates.agency_id = agency_id;
    if (branch_id !== undefined) updates.branch_id = branch_id;
    
    const updated = await update('catalog_guides', id, updates);
    
    emitToBranch(req.io, updated.branch_id || guide.branch_id, 'guide-updated', updated);
    
    res.json({
        success: true,
        data: updated
    });
}));

router.delete('/guides/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const guide = await queryOne('SELECT * FROM catalog_guides WHERE id = $1', [id]);
    
    if (!guide) {
        return res.status(404).json({
            success: false,
            error: 'Guía no encontrado'
        });
    }
    
    await remove('catalog_guides', id);
    
    emitToBranch(req.io, guide.branch_id, 'guide-deleted', { id });
    
    res.json({
        success: true,
        message: 'Guía eliminado'
    });
}));

// ==================== AGENCIES (Agencias) ====================

router.get('/agencies', asyncHandler(async (req, res) => {
    const { branchId: requestedBranchId } = req.query;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    let queryText = 'SELECT * FROM catalog_agencies WHERE active = true';
    const params = [];
    let paramIndex = 1;
    
    if (isAdmin && requestedBranchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(requestedBranchId);
    } else if (!isAdmin) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
    }
    
    queryText += ' ORDER BY name';
    
    const agencies = await query(queryText, params);
    
    res.json({
        success: true,
        data: agencies,
        count: agencies.length
    });
}));

router.get('/agencies/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const agency = await queryOne('SELECT * FROM catalog_agencies WHERE id = $1', [id]);
    
    if (!agency) {
        return res.status(404).json({
            success: false,
            error: 'Agencia no encontrada'
        });
    }
    
    res.json({
        success: true,
        data: agency
    });
}));

router.post('/agencies', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { name, barcode, branch_id } = req.body;
    
    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'El nombre es requerido'
        });
    }
    
    const agencyId = req.body.id || `agency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const agency = await insert('catalog_agencies', {
        id: agencyId,
        name,
        barcode: barcode || null,
        branch_id: branch_id || branchId,
        active: true
    });
    
    emitToBranch(req.io, branch_id || branchId, 'agency-created', agency);
    
    res.json({
        success: true,
        data: agency
    });
}));

router.put('/agencies/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, barcode, active, branch_id } = req.body;
    
    const agency = await queryOne('SELECT * FROM catalog_agencies WHERE id = $1', [id]);
    
    if (!agency) {
        return res.status(404).json({
            success: false,
            error: 'Agencia no encontrada'
        });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (barcode !== undefined) updates.barcode = barcode;
    if (active !== undefined) updates.active = active;
    if (branch_id !== undefined) updates.branch_id = branch_id;
    
    const updated = await update('catalog_agencies', id, updates);
    
    emitToBranch(req.io, updated.branch_id || agency.branch_id, 'agency-updated', updated);
    
    res.json({
        success: true,
        data: updated
    });
}));

router.delete('/agencies/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const agency = await queryOne('SELECT * FROM catalog_agencies WHERE id = $1', [id]);
    
    if (!agency) {
        return res.status(404).json({
            success: false,
            error: 'Agencia no encontrada'
        });
    }
    
    await remove('catalog_agencies', id);
    
    emitToBranch(req.io, agency.branch_id, 'agency-deleted', { id });
    
    res.json({
        success: true,
        message: 'Agencia eliminada'
    });
}));

export default router;

