import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Subir imagen a Cloudinary
 * @param {Buffer|string} file - Archivo a subir (buffer o ruta)
 * @param {Object} options - Opciones de subida
 * @returns {Promise<Object>} Resultado de Cloudinary
 */
export async function uploadImage(file, options = {}) {
  const {
    folder = 'opal-pos',
    publicId = null,
    transformation = [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' }
    ],
    resourceType = 'image'
  } = options;

  try {
    const uploadOptions = {
      folder,
      transformation,
      resource_type: resourceType,
      overwrite: false,
      invalidate: true
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    let uploadResult;
    if (Buffer.isBuffer(file)) {
      // Si es un buffer, usar upload_stream
      uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file);
      });
    } else {
      // Si es una ruta de archivo
      uploadResult = await cloudinary.uploader.upload(file, uploadOptions);
    }

    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      // Generar URL de thumbnail
      thumbnail_url: cloudinary.url(uploadResult.public_id, {
        transformation: [
          { width: 200, height: 200, crop: 'fill' },
          { quality: 'auto' }
        ]
      })
    };
  } catch (error) {
    console.error('Error subiendo imagen a Cloudinary:', error);
    throw new Error(`Error al subir imagen: ${error.message}`);
  }
}

/**
 * Eliminar imagen de Cloudinary
 * @param {string} publicId - Public ID de la imagen
 * @returns {Promise<Object>} Resultado de eliminación
 */
export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error eliminando imagen de Cloudinary:', error);
    throw new Error(`Error al eliminar imagen: ${error.message}`);
  }
}

/**
 * Generar URL de imagen con transformaciones
 * @param {string} publicId - Public ID de la imagen
 * @param {Array} transformations - Transformaciones a aplicar
 * @returns {string} URL de la imagen transformada
 */
export function getImageUrl(publicId, transformations = []) {
  return cloudinary.url(publicId, {
    transformation: transformations
  });
}

export default cloudinary;
