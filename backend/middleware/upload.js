import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Configurar almacenamiento en memoria (para subir directamente a Cloudinary)
const storage = multer.memoryStorage();

// Filtro de archivos permitidos
const fileFilter = (req, file, cb) => {
  // Tipos MIME permitidos
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'), false);
  }
};

// Configurar multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 10 // Máximo 10 archivos
  },
  fileFilter: fileFilter
});

// Middleware para subir una imagen
export const uploadSingle = upload.single('image');

// Middleware para subir múltiples imágenes
export const uploadMultiple = upload.array('images', 10);

// Middleware para subir imágenes con campo específico
export const uploadField = (fieldName, maxCount = 10) => {
  return upload.fields([{ name: fieldName, maxCount }]);
};

export default upload;
