// Rutas de Clientes
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los clientes
router.get('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const { search } = req.query;

    let queryText = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Si no es admin, filtrar por su tienda
    const viewAllBranches = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    if (!viewAllBranches && branchId) {
        queryText += ` AND (branch_id = $${paramIndex} OR branch_id IS NULL)`;
        params.push(branchId);
        paramIndex++;
    }

    if (search) {
        queryText += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        paramIndex += 3;
    }

    queryText += ' ORDER BY name ASC';

    const customers = await query(queryText, params);

    res.json({
        success: true,
        data: customers,
        count: customers.length
    });
}));

// Obtener un cliente por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const customer = await queryOne(
        'SELECT * FROM customers WHERE id = $1',
        [id]
    );

    if (!customer) {
        return res.status(404).json({
            success: false,
            error: 'Cliente no encontrado'
        });
    }

    // Verificar permisos
    const viewAllBranches = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!viewAllBranches && customer.branch_id && customer.branch_id !== branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a este cliente'
        });
    }

    res.json({
        success: true,
        data: customer
    });
}));

// Crear nuevo cliente
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    
    const {
        id,
        name,
        email,
        phone,
        address,
        notes
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'Nombre es requerido'
        });
    }

    const customerId = id || `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const customerData = {
        id: customerId,
        name: name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        notes: notes || null,
        branch_id: branchId, // Opcional: asociar a tienda
        sync_status: 'synced'
    };

    const customer = await insert('customers', customerData);

    // Emitir evento WebSocket
    req.io.to(`branch_${branchId}`).emit('customer-created', customer);

    res.status(201).json({
        success: true,
        data: customer
    });
}));

// Actualizar cliente
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const existingCustomer = await queryOne(
        'SELECT * FROM customers WHERE id = $1',
        [id]
    );

    if (!existingCustomer) {
        return res.status(404).json({
            success: false,
            error: 'Cliente no encontrado'
        });
    }

    // Verificar permisos
    const viewAllBranches = req.user.role === 'admin' || req.user.permissions?.includes('all');
    if (!viewAllBranches && existingCustomer.branch_id && existingCustomer.branch_id !== branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para modificar este cliente'
        });
    }

    const allowedFields = ['name', 'email', 'phone', 'address', 'notes'];
    const updateData = {};

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updateData[field] = req.body[field];
        }
    });

    const updatedCustomer = await update('customers', id, updateData);

    // Emitir evento WebSocket
    const targetBranchId = updatedCustomer.branch_id || branchId;
    req.io.to(`branch_${targetBranchId}`).emit('customer-updated', updatedCustomer);

    res.json({
        success: true,
        data: updatedCustomer
    });
}));

// Eliminar cliente
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Solo admin puede eliminar
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar clientes'
        });
    }

    const customer = await queryOne(
        'SELECT * FROM customers WHERE id = $1',
        [id]
    );

    if (!customer) {
        return res.status(404).json({
            success: false,
            error: 'Cliente no encontrado'
        });
    }

    await remove('customers', id);

    // Emitir evento WebSocket
    req.io.to(`branch_${customer.branch_id || branchId}`).emit('customer-deleted', { id });

    res.json({
        success: true,
        message: 'Cliente eliminado'
    });
}));

export default router;
