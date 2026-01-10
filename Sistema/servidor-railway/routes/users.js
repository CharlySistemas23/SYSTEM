// Rutas de Usuarios (para crear usuarios asociados a empleados)
import express from 'express';
import { authenticate, ensureOwnBranch } from '../middleware/auth.js';
import { query, queryOne, insert, update, remove } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';
import { emitToBranch } from '../utils/socket-emitter.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener todos los usuarios (solo admin puede ver todos)
router.get('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    const requestedBranchId = req.query.branchId || null;

    let queryText = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Si no es admin o no pidió ver todas, filtrar por su tienda
    if (!isAdmin || !requestedBranchId) {
        if (branchId) {
            queryText += ` AND branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
    } else if (requestedBranchId) {
        // Admin puede ver usuarios de otras tiendas si lo solicita
        queryText += ` AND branch_id = $${paramIndex}`;
        params.push(requestedBranchId);
        paramIndex++;
    }

    queryText += ' ORDER BY username ASC';

    const users = await query(queryText, params);

    // Obtener información de empleados asociados
    for (const user of users) {
        if (user.employee_id) {
            const employee = await queryOne('SELECT name, role FROM employees WHERE id = $1', [user.employee_id]);
            if (employee) {
                user.employee = employee;
            }
        }
    }

    res.json({
        success: true,
        data: users,
        count: users.length
    });
}));

// Obtener un usuario por ID
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [id]);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
        });
    }

    // Verificar permisos
    if (!isAdmin && user.branch_id !== branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes acceso a este usuario'
        });
    }

    // Obtener información del empleado asociado
    if (user.employee_id) {
        const employee = await queryOne('SELECT * FROM employees WHERE id = $1', [user.employee_id]);
        if (employee) {
            user.employee = employee;
        }
    }

    res.json({
        success: true,
        data: user
    });
}));

// Crear nuevo usuario (asociado a un empleado)
router.post('/', asyncHandler(async (req, res) => {
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');
    
    const {
        id,
        username,
        password,
        pin,
        employee_id,
        branch_id, // Si es admin, puede asignar a otra sucursal
        role = 'seller',
        permissions = [],
        active = true
    } = req.body;

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username es requerido'
        });
    }

    // Determinar branch_id final
    const finalBranchId = (isAdmin && branch_id) ? branch_id : branchId;

    // Verificar que el username no exista
    const existingUser = await queryOne('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (existingUser) {
        return res.status(400).json({
            success: false,
            error: 'Ya existe un usuario con este username'
        });
    }

    // Si hay employee_id, verificar que el empleado existe y pertenece a la sucursal correcta
    if (employee_id) {
        const employee = await queryOne('SELECT * FROM employees WHERE id = $1', [employee_id]);
        if (!employee) {
            return res.status(404).json({
                success: false,
                error: 'Empleado no encontrado'
            });
        }

        // Verificar que el empleado pertenece a la sucursal correcta
        if (employee.branch_id !== finalBranchId) {
            return res.status(400).json({
                success: false,
                error: 'El empleado no pertenece a la sucursal seleccionada'
            });
        }

        // Verificar que el empleado no tenga ya un usuario
        const existingUserForEmployee = await queryOne('SELECT id FROM users WHERE employee_id = $1', [employee_id]);
        if (existingUserForEmployee) {
            return res.status(400).json({
                success: false,
                error: 'Este empleado ya tiene un usuario asociado'
            });
        }
    }

    // Hashear password y PIN si se proporcionan
    let passwordHash = null;
    let pinHash = null;

    if (password) {
        passwordHash = await bcrypt.hash(password, 10);
    }

    if (pin) {
        pinHash = await bcrypt.hash(pin, 10);
    }

    const userId = id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const userData = {
        id: userId,
        username: username.toLowerCase(),
        password_hash: passwordHash,
        pin_hash: pinHash,
        employee_id: employee_id || null,
        branch_id: finalBranchId,
        role: role,
        permissions: permissions,
        active: active
    };

    const user = await insert('users', userData);

    // Emitir evento WebSocket
    emitToBranch(req.io, finalBranchId, 'user-created', user);

    // No devolver el hash de password
    delete user.password_hash;
    delete user.pin_hash;

    res.status(201).json({
        success: true,
        data: user,
        message: 'Usuario creado exitosamente'
    });
}));

// Actualizar usuario
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');

    const existingUser = await queryOne('SELECT * FROM users WHERE id = $1', [id]);

    if (!existingUser) {
        return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
        });
    }

    // Verificar permisos
    if (!isAdmin && existingUser.branch_id !== branchId) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para modificar este usuario'
        });
    }

    const updateData = {};

    // Campos permitidos para actualizar
    if (req.body.username !== undefined && req.body.username !== existingUser.username) {
        // Verificar que el nuevo username no exista
        const usernameExists = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [req.body.username.toLowerCase(), id]);
        if (usernameExists) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe otro usuario con este username'
            });
        }
        updateData.username = req.body.username.toLowerCase();
    }

    if (req.body.password !== undefined && req.body.password) {
        updateData.password_hash = await bcrypt.hash(req.body.password, 10);
    }

    if (req.body.pin !== undefined && req.body.pin) {
        updateData.pin_hash = await bcrypt.hash(req.body.pin, 10);
    }

    if (req.body.employee_id !== undefined) {
        if (req.body.employee_id) {
            // Verificar que el empleado existe
            const employee = await queryOne('SELECT * FROM employees WHERE id = $1', [req.body.employee_id]);
            if (!employee) {
                return res.status(404).json({
                    success: false,
                    error: 'Empleado no encontrado'
                });
            }

            // Verificar que no esté asociado a otro usuario
            const otherUser = await queryOne('SELECT id FROM users WHERE employee_id = $1 AND id != $2', [req.body.employee_id, id]);
            if (otherUser) {
                return res.status(400).json({
                    success: false,
                    error: 'Este empleado ya está asociado a otro usuario'
                });
            }
        }
        updateData.employee_id = req.body.employee_id || null;
    }

    // Solo admin puede cambiar estos campos
    if (isAdmin) {
        if (req.body.branch_id !== undefined) {
            updateData.branch_id = req.body.branch_id;
        }
        if (req.body.role !== undefined) {
            updateData.role = req.body.role;
        }
        if (req.body.permissions !== undefined) {
            updateData.permissions = req.body.permissions;
        }
    }

    if (req.body.active !== undefined) {
        updateData.active = req.body.active;
    }

    const updatedUser = await update('users', id, updateData);

    // Emitir evento WebSocket
    const targetBranchId = updatedUser.branch_id || branchId;
    emitToBranch(req.io, targetBranchId, 'user-updated', updatedUser);

    // No devolver el hash de password
    delete updatedUser.password_hash;
    delete updatedUser.pin_hash;

    res.json({
        success: true,
        data: updatedUser,
        message: 'Usuario actualizado exitosamente'
    });
}));

// Eliminar usuario
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branchId;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [id]);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
        });
    }

    // Solo admin puede eliminar
    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Solo administradores pueden eliminar usuarios'
        });
    }

    // No permitir eliminar el propio usuario
    if (user.id === req.user.userId) {
        return res.status(400).json({
            success: false,
            error: 'No puedes eliminar tu propio usuario'
        });
    }

    await remove('users', id);

    // Emitir evento WebSocket
    emitToBranch(req.io, user.branch_id || branchId, 'user-deleted', { id });

    res.json({
        success: true,
        message: 'Usuario eliminado exitosamente'
    });
}));

// Restablecer PIN de usuario
router.post('/:id/reset-pin', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { pin } = req.body;
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.includes('all');

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [id]);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
        });
    }

    if (!isAdmin && user.id !== req.user.userId) {
        return res.status(403).json({
            success: false,
            error: 'Solo puedes restablecer tu propio PIN'
        });
    }

    const newPin = pin || '1234'; // PIN por defecto si no se proporciona
    const pinHash = await bcrypt.hash(newPin, 10);

    await update('users', id, { pin_hash: pinHash });

    res.json({
        success: true,
        message: 'PIN restablecido exitosamente',
        defaultPin: !pin ? '1234' : undefined
    });
}));

export default router;

