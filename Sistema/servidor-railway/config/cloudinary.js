// Configuración de Cloudinary para gestión de archivos e imágenes
import cloudinary from 'cloudinary';
import multer from 'multer';
import { createWriteStream, unlink } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const unlinkAsync = promisify(unlink);

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Usar HTTPS
});

// Verificar configuración
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    console.log('✅ Cloudinary configurado correctamente');
} else {
    console.warn('⚠️  Cloudinary no configurado - las funciones de subida de archivos estarán deshabilitadas');
    console.warn('💡 Configura las variables de entorno: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
}

// Directorio temporal para archivos antes de subirlos
const uploadsDir = path.join(__dirname, '../uploads');
if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para almacenamiento temporal
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Configurar multer con límites
export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
    },
    fileFilter: (req, file, cb) => {
        // Permitir imágenes y PDFs
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WebP) y PDFs.'));
        }
    }
});

// Función helper para subir imagen a Cloudinary
export async function uploadImageToCloudinary(filePath, options = {}) {
    try {
        // Determinar carpeta
        const folder = options.folder || 'opal-pos';
        
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folder,
            resource_type: 'image',
            overwrite: false,
            use_filename: true,
            unique_filename: true,
            eager: [
                { width: 300, height: 300, crop: 'limit', quality: 'auto' },
                { width: 800, height: 800, crop: 'limit', quality: 'auto' }
            ],
            ...options
        });

        // Eliminar archivo temporal después de subir
        try {
            await unlinkAsync(filePath);
        } catch (err) {
            console.warn('No se pudo eliminar archivo temporal:', filePath);
        }

        return {
            public_id: result.public_id,
            url: result.secure_url,
            thumbnail_url: result.eager && result.eager[0] ? result.eager[0].secure_url : result.secure_url,
            medium_url: result.eager && result.eager[1] ? result.eager[1].secure_url : result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes
        };
    } catch (error) {
        // Intentar eliminar archivo temporal incluso si falla
        try {
            await unlinkAsync(filePath);
        } catch (err) {
            // Ignorar error de eliminación
        }
        console.error('Error subiendo imagen a Cloudinary:', error);
        throw error;
    }
}

// Función helper para subir archivo (PDF, etc.)
export async function uploadFileToCloudinary(filePath, options = {}) {
    try {
        const folder = options.folder || 'opal-pos/documents';
        
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folder,
            resource_type: 'raw',
            overwrite: false,
            use_filename: true,
            unique_filename: true,
            ...options
        });

        // Eliminar archivo temporal
        try {
            await unlinkAsync(filePath);
        } catch (err) {
            console.warn('No se pudo eliminar archivo temporal:', filePath);
        }

        return {
            public_id: result.public_id,
            url: result.secure_url,
            bytes: result.bytes,
            format: result.format
        };
    } catch (error) {
        // Intentar eliminar archivo temporal
        try {
            await unlinkAsync(filePath);
        } catch (err) {
            // Ignorar error
        }
        console.error('Error subiendo archivo a Cloudinary:', error);
        throw error;
    }
}

// Función helper para eliminar archivo de Cloudinary
export async function deleteFromCloudinary(publicId, resourceType = 'image') {
    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType
        });
        return result;
    } catch (error) {
        console.error('Error eliminando de Cloudinary:', error);
        throw error;
    }
}

// Función helper para obtener URL de thumbnail
export function getThumbnailUrl(publicId, width = 300, height = 300) {
    return cloudinary.url(publicId, {
        width: width,
        height: height,
        crop: 'limit',
        quality: 'auto',
        format: 'auto'
    });
}

// Función helper para obtener URL optimizada
export function getOptimizedUrl(publicId, options = {}) {
    return cloudinary.url(publicId, {
        quality: 'auto',
        fetch_format: 'auto',
        ...options
    });
}

// Exportar instancia de cloudinary para uso directo
export { cloudinary };

