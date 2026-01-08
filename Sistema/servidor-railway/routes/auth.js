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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:22',message:'Buscando usuario para login',data:{username:username,userFound:!!user,userId:user?.id,userActive:user?.active,hasPinHash:!!user?.pin_hash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,E'})}).catch(()=>{});
    // #endregion

    if (!user) {
        // #region agent log
        const debugInfo = { username, userFound: false };
        try {
            // Intentar buscar sin filtro de active para debug
            const userAny = await queryOne("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
            if (userAny) {
                debugInfo.userExistsButInactive = !userAny.active;
                debugInfo.userId = userAny.id;
            }
        } catch (e) {}
        // #endregion
        
        return res.status(401).json({
            success: false,
            error: 'Usuario o contraseña incorrectos',
            debug: debugInfo
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
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:42',message:'Comparando PIN con pin_hash',data:{pinProvided:pin,hasPinHash:!!user.pin_hash,pinValid:isValid,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        } else if (user.password_hash) {
            // Si no hay pin_hash pero hay password_hash, intentar con password_hash (fallback)
            isValid = await bcrypt.compare(pin, user.password_hash);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:45',message:'Comparando PIN con password_hash (fallback)',data:{pinProvided:pin,hasPasswordHash:!!user.password_hash,pinValid:isValid,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        }
    } else if (password && user.password_hash) {
        // Si viene password, verificar con password_hash
        isValid = await bcrypt.compare(password, user.password_hash);
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.js:52',message:'Resultado final de autenticación',data:{isValid:isValid,username:username,hasPin:!!pin,hasPassword:!!password,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!isValid) {
        // #region agent log
        const debugInfo = {
            username,
            userId: user.id,
            hasPin: !!pin,
            hasPassword: !!password,
            hasPinHash: !!user.pin_hash,
            hasPasswordHash: !!user.password_hash,
            active: user.active,
            isValid: false
        };
        // #endregion
        
        return res.status(401).json({
            success: false,
            error: 'Usuario o contraseña incorrectos',
            debug: debugInfo
        });
    }

    // Obtener información del empleado si existe
    let employee = null;
    if (user.employee_id) {
        employee = await queryOne(
            'SELECT * FROM employees WHERE id = $1 AND active = true',
            [user.employee_id]
        );
        
        // Si el empleado no existe o está inactivo, pero el usuario es admin,
        // permitir login pero registrar un warning
        if (!employee && user.role === 'admin') {
            console.warn(`⚠️  Usuario admin ${user.username} tiene employee_id (${user.employee_id}) pero el empleado no existe o está inactivo. Permitiendo login sin empleado.`);
            // Continuar sin empleado - el admin puede funcionar sin empleado asociado
        } else if (user.employee_id && !employee && user.role !== 'admin') {
            // Solo rechazar si NO es admin y el empleado no existe
            return res.status(401).json({
                success: false,
                error: 'Empleado asociado no encontrado o inactivo'
            });
        }
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

// Endpoint para inicializar/arreglar usuario admin (solo en desarrollo o con código secreto)
router.post('/setup-admin', asyncHandler(async (req, res) => {
    try {
        // Importar la función fixAdmin
        const { fixAdmin } = await import('../database/fix-admin.js');
        
        // Ejecutar fixAdmin
        await fixAdmin();
        
        // VERIFICAR que el usuario existe después de fixAdmin (con retry)
        let adminUser = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!adminUser && attempts < maxAttempts) {
            adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
            if (!adminUser && attempts < maxAttempts - 1) {
                console.log(`⚠️  Usuario no encontrado después de fixAdmin, reintentando... (${attempts + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 200)); // Esperar 200ms
                attempts++;
            } else {
                break;
            }
        }
        
        if (!adminUser) {
            throw new Error('Usuario admin no existe después de ejecutar fixAdmin. El usuario no se creó correctamente.');
        }
        
        // Verificar que el PIN funciona
        const pinTest = adminUser.pin_hash ? await bcrypt.compare('1234', adminUser.pin_hash) : false;
        
        if (!pinTest) {
            // Si el PIN no funciona, regenerarlo
            console.log('⚠️  PIN hash no válido, regenerando...');
            const pinHash = await bcrypt.hash('1234', 10);
            const { update } = await import('../config/database.js');
            await update('users', adminUser.id, { pin_hash: pinHash });
            // Verificar de nuevo
            adminUser = await queryOne("SELECT * FROM users WHERE username = 'admin'");
            const pinTest2 = adminUser.pin_hash ? await bcrypt.compare('1234', adminUser.pin_hash) : false;
            if (!pinTest2) {
                throw new Error('No se pudo establecer un PIN hash válido para el usuario admin');
            }
        }
        
        // Verificar que el usuario está activo
        if (!adminUser.active) {
            const { update } = await import('../config/database.js');
            await update('users', adminUser.id, { active: true });
            adminUser.active = true;
        }
        
        const debugInfo = {
            step: 'post-fixAdmin',
            userExists: !!adminUser,
            userId: adminUser.id,
            active: adminUser.active,
            hasPinHash: !!adminUser.pin_hash,
            pinTestValid: pinTest,
            attempts: attempts + 1
        };
        
        res.json({
            success: true,
            message: 'Usuario admin verificado y configurado correctamente',
            credentials: {
                username: 'admin',
                pin: '1234',
                companyCode: 'OPAL2024'
            },
            debug: { steps: [debugInfo] }
        });
    } catch (error) {
        console.error('Error en setup-admin:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error configurando usuario admin',
            debug: { error: error.message, stack: error.stack }
        });
    }
}));

export default router;
