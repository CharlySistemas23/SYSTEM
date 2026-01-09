// Rutas para Subida de Archivos a Cloudinary
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { upload, uploadImageToCloudinary, uploadFileToCloudinary } from '../config/cloudinary.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Middleware para manejar errores de multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'El archivo es demasiado grande. Tamaño máximo: 10MB'
            });
        }
        return res.status(400).json({
            success: false,
            error: `Error al subir archivo: ${err.message}`
        });
    }
    if (err) {
        return res.status(400).json({
            success: false,
            error: err.message || 'Error al procesar archivo'
        });
    }
    next();
};

// Subir una imagen
router.post('/image', upload.single('file'), handleMulterError, asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionó ningún archivo'
        });
    }

    // Verificar que Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({
            success: false,
            error: 'Cloudinary no está configurado. Contacta al administrador.'
        });
    }

    try {
        // Determinar carpeta según el tipo
        let folder = 'opal-pos';
        if (req.body.type === 'inventory') {
            folder = 'opal-pos/inventory';
        } else if (req.body.type === 'repair') {
            folder = 'opal-pos/repairs';
        } else if (req.body.type === 'certificate') {
            folder = 'opal-pos/certificates';
        }

        // Subir a Cloudinary
        const result = await uploadImageToCloudinary(req.file.path, { folder });

        res.json({
            success: true,
            data: result,
            message: 'Imagen subida exitosamente'
        });
    } catch (error) {
        console.error('Error subiendo imagen:', error);
        res.status(500).json({
            success: false,
            error: 'Error al subir imagen a Cloudinary: ' + error.message
        });
    }
}));

// Subir múltiples imágenes
router.post('/images', upload.array('files', 10), handleMulterError, asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionaron archivos'
        });
    }

    // Verificar que Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({
            success: false,
            error: 'Cloudinary no está configurado. Contacta al administrador.'
        });
    }

    try {
        // Determinar carpeta
        let folder = 'opal-pos';
        if (req.body.type === 'inventory') {
            folder = 'opal-pos/inventory';
        } else if (req.body.type === 'repair') {
            folder = 'opal-pos/repairs';
        }

        // Subir todas las imágenes
        const uploadPromises = req.files.map(file => 
            uploadImageToCloudinary(file.path, { folder })
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        res.json({
            success: true,
            data: uploadedFiles,
            count: uploadedFiles.length,
            message: `${uploadedFiles.length} imagen(es) subida(s) exitosamente`
        });
    } catch (error) {
        console.error('Error subiendo imágenes:', error);
        res.status(500).json({
            success: false,
            error: 'Error al subir imágenes a Cloudinary: ' + error.message
        });
    }
}));

// Subir un archivo (PDF, documento, etc.)
router.post('/file', upload.single('file'), handleMulterError, asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No se proporcionó ningún archivo'
        });
    }

    // Verificar que Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({
            success: false,
            error: 'Cloudinary no está configurado. Contacta al administrador.'
        });
    }

    try {
        // Determinar carpeta
        let folder = 'opal-pos/documents';
        if (req.body.type === 'certificate') {
            folder = 'opal-pos/certificates';
        }

        // Subir a Cloudinary
        const result = await uploadFileToCloudinary(req.file.path, { folder });

        res.json({
            success: true,
            data: result,
            message: 'Archivo subido exitosamente'
        });
    } catch (error) {
        console.error('Error subiendo archivo:', error);
        res.status(500).json({
            success: false,
            error: 'Error al subir archivo a Cloudinary: ' + error.message
        });
    }
}));

// Eliminar archivo de Cloudinary
router.delete('/:publicId', asyncHandler(async (req, res) => {
    const { publicId } = req.params;
    const { resourceType = 'image' } = req.query;

    if (!publicId) {
        return res.status(400).json({
            success: false,
            error: 'publicId es requerido'
        });
    }

    // Verificar que Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(500).json({
            success: false,
            error: 'Cloudinary no está configurado'
        });
    }

    try {
        const { deleteFromCloudinary } = await import('../config/cloudinary.js');
        const result = await deleteFromCloudinary(publicId, resourceType);

        if (result.result === 'ok') {
            res.json({
                success: true,
                message: 'Archivo eliminado exitosamente'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Archivo no encontrado en Cloudinary'
            });
        }
    } catch (error) {
        console.error('Error eliminando de Cloudinary:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar archivo de Cloudinary'
        });
    }
}));

export default router;

