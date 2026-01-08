// Rutas de Autenticación
import express from 'express';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import { queryOne, query } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Login
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password, pin } = req.body;

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'Username es requerido'
        });
    }

    // Buscar usuario por username (case-insensitive)
    const user = await queryOne(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND active = true',
        [username]
    );

    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'Usuario o contraseña incorrectos'
        });
    }

    // Verificar password o PIN
    // Prioridad: 1) PIN si viene pin y existe pin_hash, 2) password si viene password y existe password_hash
    // Si viene pin pero no hay pin_hash, intentar con password_hash como fallback
    let isValid = false;
    
    if (pin) {
        // Si viene PIN, primero intentar con pin_hash
        if (user.pin_hash) {
            isValid = await bcrypt.compare(pin, user.pin_hash);
        } else if (user.password_hash) {
            // Si no hay pin_hash pero hay password_hash, intentar con password_hash (fallback)
            isValid = await bcrypt.compare(pin, user.password_hash);
        }
    } else if (password && user.password_hash) {
        // Si viene password, verificar con password_hash
        isValid = await bcrypt.compare(password, user.password_hash);
    }

    if (!isValid) {
        return res.status(401).json({
            success: false,
            error: 'Usuario o contraseña incorrectos'
        });
    }

    // Obtener información del empleado si existe
    let employee = null;
    if (user.employee_id) {
        employee = await queryOne(
            'SELECT * FROM employees WHERE id = $1 AND active = true',
            [user.employee_id]
        );
    }

    // Verificar que el empleado esté activo
    if (user.employee_id && !employee) {
        return res.status(401).json({
            success: false,
            error: 'Empleado asociado no encontrado o inactivo'
        });
    }

    // Generar token JWT
    const token = generateToken(user);

    // Obtener información de la sucursal
    let branch = null;
    if (user.branch_id) {
        branch = await queryOne(
            'SELECT * FROM catalog_branches WHERE id = $1 AND active = true',
            [user.branch_id]
        );
    }

    res.json({
        success: true,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            branchId: user.branch_id,
            employeeId: user.employee_id,
            role: user.role,
            permissions: user.permissions || []
        },
        employee: employee ? {
            id: employee.id,
            name: employee.name,
            role: employee.role,
            branchId: employee.branch_id
        } : null,
        branch: branch ? {
            id: branch.id,
            name: branch.name,
            address: branch.address
        } : null
    });
}));

// Login por código de barras del empleado
router.post('/login/barcode', asyncHandler(async (req, res) => {
    const { barcode, pin } = req.body;

    if (!barcode) {
        return res.status(400).json({
            success: false,
            error: 'Código de barras es requerido'
        });
    }

    if (!pin) {
        return res.status(400).json({
            success: false,
            error: 'PIN es requerido'
        });
    }

    // Buscar empleado por barcode
    const employee = await queryOne(
        'SELECT * FROM employees WHERE barcode = $1 AND active = true',
        [barcode]
    );

    if (!employee) {
        return res.status(401).json({
            success: false,
            error: 'Empleado no encontrado'
        });
    }

    // Buscar usuario asociado al empleado
    const user = await queryOne(
        'SELECT * FROM users WHERE employee_id = $1 AND active = true',
        [employee.id]
    );

    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'Usuario no encontrado para este empleado'
        });
    }

    // Verificar PIN
    if (!user.pin_hash) {
        return res.status(401).json({
            success: false,
            error: 'PIN no configurado para este usuario'
        });
    }

    const isValid = await bcrypt.compare(pin, user.pin_hash);
    if (!isValid) {
        return res.status(401).json({
            success: false,
            error: 'PIN incorrecto'
        });
    }

    // Generar token
    const token = generateToken(user);

    // Obtener información de la sucursal
    let branch = null;
    if (employee.branch_id) {
        branch = await queryOne(
            'SELECT * FROM catalog_branches WHERE id = $1 AND active = true',
            [employee.branch_id]
        );
    }

    res.json({
        success: true,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            branchId: user.branch_id || employee.branch_id,
            employeeId: user.employee_id,
            role: user.role,
            permissions: user.permissions || []
        },
        employee: {
            id: employee.id,
            name: employee.name,
            role: employee.role,
            branchId: employee.branch_id
        },
        branch: branch ? {
            id: branch.id,
            name: branch.name,
            address: branch.address
        } : null
    });
}));

// Verificar token (para validar si está activo)
router.get('/verify', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Token no proporcionado'
        });
    }

    const token = authHeader.substring(7);
    const { verifyToken } = await import('../middleware/auth.js');
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Token inválido'
        });
    }

    res.json({
        success: true,
        user: {
            userId: decoded.userId,
            username: decoded.username,
            branchId: decoded.branchId,
            role: decoded.role
        }
    });
}));

export default router;
