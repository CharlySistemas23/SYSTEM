// Rutas de Empleados
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);
router.use(ensureOwnBranch);

// Obtener todos los empleados (solo de la tienda del usuario)
router.get('/', asyncHandler(async (req, res) => {
    // CRÍTICO: Asegurar que branchId existe
    if (!req.user.branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID no encontrado. Por favor, inicia sesión nuevamente.'
        });
    }
    
    const branchId = req.user.branchId;

    // Si es admin y puede ver todas las tiendas (check desde permisos)
    const viewAllBranches = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const requestedBranchId = req.query.branchId || null;

    let queryText = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Si no es admin o no pidió ver todas, filtrar por su tienda
    if (!viewAllBranches || !requestedBranchId) {
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(branchId);
        paramIndex++;
    } else if (requestedBranchId) {
        // Admin puede ver empleados de otras tiendas si lo solicita
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(requestedBranchId);
        paramIndex++;
    }

    queryText += ' ORDER BY name ASC';

    const employees = await query(queryText, params);

    // Obtener estadísticas de ventas por empleado
    for (const emp of employees) {
        const sales = await query(
            `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total 
             FROM sales 
             WHERE seller_id = $1 OR employee_id = $1 
             AND status = 'completada'`,
            [emp.id]
        );
        emp.salesCount = parseInt(sales[0]?.count || 0);
        emp.totalSales = parseFloat(sales[0]?.total || 0);
    }

    res.json({
        success: true,
        data: employees,
        count: employees.length
    });
}));

// Obtener un empleado por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    const employee = await queryOne(
        'SELECT * FROM employees WHERE id = $1',
        [id]
    );

    if (!employee) {
        return res.status(404).json({
            success: false,
            error: 'Empleado no encontrado'
        });
    }

    // Verificar que pertenece a la tienda del usuario (a menos que sea admin)
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        if (employee.branch_id !== branchId) {
            return res.status(403).json({
                success: false,
                error: 'No tienes acceso a este empleado'
            });
        }
    }

    res.json({
        success: true,
        data: employee
    });
}));

// Crear nuevo empleado
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId; // Usar branch_id del token
    
    const {
        id,
        name,
        role = 'seller',
        barcode,
        employeeCode,
        active = true,
        salary = 0
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'Nombre es requerido'
        });
    }

    const employeeId = id || `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const employeeData = {
        id: employeeId,
        name: name,
        role: role,
        branch_id: branchId, // CRÍTICO: Usar branch_id del token
        barcode: barcode || null,
        employee_code: employeeCode || null,
        active: active,
        salary: salary
    };

    const employee = await insert('employees', employeeData);

    // Emitir evento WebSocket
    emitToBranch(req.io, branchId, 'employee-created', employee);

    res.status(201).json({
        success: true,
        data: employee
    });
}));

// Actualizar empleado
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Verificar que el empleado pertenece a esta tienda
    const existingEmployee = await queryOne(
        'SELECT * FROM employees WHERE id = $1',
        [id]
    );

    if (!existingEmployee) {
        return res.status(404).json({
            success: false,
            error: 'Empleado no encontrado'
        });
    }

    // Verificar permisos (solo puede modificar empleados de su tienda a menos que sea admin)
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        if (existingEmployee.branch_id !== branchId) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para modificar este empleado'
            });
        }
    }

    // Actualizar solo campos permitidos
    const allowedFields = ['name', 'role', 'barcode', 'employee_code', 'active', 'salary'];
    const updateData = {};

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            const dbField = field === 'employeeCode' ? 'employee_code' : field;
            updateData[dbField] = req.body[field];
        }
    });

    // No permitir cambiar branch_id a menos que sea admin
    if (req.body.branch_id && (req.user.role === 'admin' || req.user.permissions?.includes('all'))) {
        updateData.branch_id = req.body.branch_id;
    }

    const updatedEmployee = await update('employees', id, updateData);

    // Emitir evento WebSocket a la tienda correspondiente
    const targetBranchId = updatedEmployee.branch_id || branchId;
    emitToBranch(req.io, targetBranchId, 'employee-updated', updatedEmployee);

    res.json({
        success: true,
        data: updatedEmployee
    });
}));

// Eliminar empleado
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;

    // Solo admin puede eliminar
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('all')) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar empleados'
        });
    }

    const employee = await queryOne(
        'SELECT * FROM employees WHERE id = $1',
        [id]
    );

    if (!employee) {
        return res.status(404).json({
            success: false,
            error: 'Empleado no encontrado'
        });
    }

    await remove('employees', id);

    // Emitir evento WebSocket
    emitToBranch(req.io, employee.branch_id || branchId, 'employee-deleted', { id });

    res.json({
        success: true,
        message: 'Empleado eliminado'
    });
}));

export default router;
