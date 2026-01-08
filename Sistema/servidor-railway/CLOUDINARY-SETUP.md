# 📸 GUÍA DE CONFIGURACIÓN DE CLOUDINARY

## 🎯 ¿Qué es Cloudinary?

Cloudinary es un servicio en la nube para almacenar, optimizar y entregar imágenes y videos. En este sistema se usa para:

- ✅ Almacenar fotos de productos de inventario
- ✅ Almacenar fotos de reparaciones
- ✅ Almacenar certificados (PDFs, documentos)
- ✅ Generar thumbnails automáticamente
- ✅ Optimizar imágenes para carga rápida
- ✅ CDN global para entrega rápida

---

## 📋 PASO 1: CREAR CUENTA EN CLOUDINARY

### 1.1 Ir a Cloudinary
1. Ve a: https://cloudinary.com/
2. Haz clic en "Sign Up for Free"
3. Crea tu cuenta (puedes usar GitHub, Google, o email)

### 1.2 Verificar Email
- Revisa tu email y verifica tu cuenta
- Cloudinary tiene un plan **gratuito generoso** que incluye:
  - 25 GB de almacenamiento
  - 25 GB de ancho de banda mensual
  - Transformaciones de imágenes ilimitadas
  - CDN global

### 1.3 Acceder al Dashboard
- Una vez verificado, inicia sesión
- Verás el Dashboard de Cloudinary

---

## 🔑 PASO 2: OBTENER CREDENCIALES

### 2.1 Encontrar las Credenciales
En el Dashboard de Cloudinary:

1. En la parte superior, verás un banner con información de tu cuenta
2. O ve a: **Settings** (icono de engranaje) → **Security**
3. Verás tres valores importantes:
   - **Cloud Name** (ejemplo: `dabc123ef`)
   - **API Key** (ejemplo: `123456789012345`)
   - **API Secret** (ejemplo: `abcdefghijklmnopqrstuvwxyz123456`) ⚠️ **Secreto, no compartir**

### 2.2 Copiar las Credenciales
Anota estos tres valores, los necesitarás en el siguiente paso.

---

## ⚙️ PASO 3: CONFIGURAR EN RAILWAY

### 3.1 Agregar Variables de Entorno en Railway

1. Ve a **Railway Dashboard**: https://railway.app/
2. Selecciona tu proyecto/servicio
3. Ve a la pestaña **Variables** (o **Settings** → **Variables**)
4. Haz clic en **+ New Variable**
5. Agrega las siguientes variables:

#### Variable 1:
- **Name**: `CLOUDINARY_CLOUD_NAME`
- **Value**: Tu Cloud Name (ejemplo: `dabc123ef`)

#### Variable 2:
- **Name**: `CLOUDINARY_API_KEY`
- **Value**: Tu API Key (ejemplo: `123456789012345`)

#### Variable 3:
- **Name**: `CLOUDINARY_API_SECRET`
- **Value**: Tu API Secret (ejemplo: `abcdefghijklmnopqrstuvwxyz123456`)

### 3.2 Verificar Variables
Después de agregar las variables, deberías ver:

```
✅ CLOUDINARY_CLOUD_NAME = dabc123ef
✅ CLOUDINARY_API_KEY = 123456789012345
✅ CLOUDINARY_API_SECRET = ••••••••••••••••••••••••••••
```

⚠️ **Importante**: Railway ocultará el `API_SECRET` por seguridad (mostrará puntos).

---

## 🚀 PASO 4: VERIFICAR INSTALACIÓN

### 4.1 Instalar Paquetes (si es necesario)
Los paquetes ya están en `package.json`, pero si necesitas instalarlos localmente:

```bash
cd Sistema/servidor-railway
npm install cloudinary multer
```

### 4.2 Verificar que el Código esté Listo
El código ya está implementado en:
- ✅ `config/cloudinary.js` - Configuración de Cloudinary
- ✅ `routes/upload.js` - Endpoints para subir archivos
- ✅ Integrado en `server.js`

### 4.3 Desplegar a Railway
1. Haz commit y push de los cambios:
   ```bash
   git add .
   git commit -m "Agregar configuración de Cloudinary"
   git push
   ```

2. Railway detectará los cambios y hará deploy automáticamente

3. Ve a **Railway Dashboard** → Tu servicio → **Logs**

4. Busca el mensaje:
   ```
   ✅ Cloudinary configurado correctamente
   ```

   Si ves:
   ```
   ⚠️  Cloudinary no configurado - las funciones de subida de archivos estarán deshabilitadas
   ```
   
   Significa que las variables de entorno no están configuradas correctamente.

---

## 📤 PASO 5: PROBAR LA SUBIDA DE ARCHIVOS

### 5.1 Endpoints Disponibles

Una vez configurado, tendrás estos endpoints:

#### Subir una imagen:
```bash
POST /api/upload/image
Content-Type: multipart/form-data

Form Data:
- file: [archivo de imagen]
- type: inventory (opcional: 'inventory', 'repair', 'certificate')
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "public_id": "opal-pos/inventory/abc123",
    "url": "https://res.cloudinary.com/tu-cloud/image/upload/...",
    "thumbnail_url": "https://res.cloudinary.com/tu-cloud/image/upload/w_300,h_300/...",
    "medium_url": "https://res.cloudinary.com/tu-cloud/image/upload/w_800,h_800/...",
    "width": 1920,
    "height": 1080,
    "format": "jpg",
    "bytes": 245678
  }
}
```

#### Subir múltiples imágenes:
```bash
POST /api/upload/images
Content-Type: multipart/form-data

Form Data:
- files: [array de archivos de imagen]
- type: inventory
```

#### Subir un archivo (PDF, documento):
```bash
POST /api/upload/file
Content-Type: multipart/form-data

Form Data:
- file: [archivo PDF/documento]
- type: certificate (opcional)
```

#### Eliminar archivo:
```bash
DELETE /api/upload/:publicId?resourceType=image
```

### 5.2 Usar desde el Frontend

Ejemplo de código JavaScript para subir una imagen:

```javascript
async function uploadImage(file, type = 'inventory') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
        const response = await fetch('/api/upload/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}` // Token JWT
            },
            body: formData
        });

        const result = await response.json();
        
        if (result.success) {
            // Usar result.data.url para guardar en la base de datos
            return result.data;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error subiendo imagen:', error);
        throw error;
    }
}
```

---

## 🔗 PASO 6: INTEGRAR CON MÓDULOS EXISTENTES

### 6.1 Agregar Foto a Producto (Inventario)

**Flujo:**
1. Usuario selecciona imagen en el frontend
2. Frontend sube imagen a `/api/upload/image?type=inventory`
3. Cloudinary devuelve URL
4. Frontend llama a `/api/inventory/:id/photos` con la URL
5. Backend guarda URL en `inventory_photos`

**Ejemplo:**
```javascript
// 1. Subir imagen
const uploadResult = await uploadImage(file, 'inventory');
// uploadResult.url = "https://res.cloudinary.com/..."

// 2. Guardar en base de datos
await API.post(`/api/inventory/${itemId}/photos`, {
    photo_url: uploadResult.url,
    thumbnail_url: uploadResult.thumbnail_url,
    is_primary: true
});
```

### 6.2 Agregar Foto a Reparación

Similar al anterior:
```javascript
// 1. Subir imagen
const uploadResult = await uploadImage(file, 'repair');

// 2. Guardar en base de datos
await API.post(`/api/repairs/${repairId}/photos`, {
    photo_url: uploadResult.url,
    thumbnail_url: uploadResult.thumbnail_url,
    is_primary: false
});
```

### 6.3 Agregar Certificado

```javascript
// 1. Subir PDF
const formData = new FormData();
formData.append('file', pdfFile);
formData.append('type', 'certificate');

const response = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
});

const result = await response.json();

// 2. Guardar en base de datos
await API.post(`/api/inventory/${itemId}/certificates`, {
    certificate_number: 'CERT-001',
    certificate_type: 'diamante',
    certificate_url: result.data.url, // URL del PDF en Cloudinary
    issuer: 'GIA'
});
```

---

## 📁 ESTRUCTURA DE CARPETAS EN CLOUDINARY

Las imágenes se organizarán automáticamente así:

```
opal-pos/
  ├── inventory/          # Fotos de productos
  │   └── [imágenes]
  ├── repairs/            # Fotos de reparaciones
  │   └── [imágenes]
  ├── certificates/       # Certificados (PDFs)
  │   └── [documentos]
  └── [otros archivos]    # Archivos generales
```

---

## ✅ VERIFICACIÓN FINAL

### Checklist de Configuración:

- [ ] Cuenta de Cloudinary creada y verificada
- [ ] Credenciales obtenidas (Cloud Name, API Key, API Secret)
- [ ] Variables de entorno configuradas en Railway
- [ ] Deploy realizado en Railway
- [ ] Logs muestran: "✅ Cloudinary configurado correctamente"
- [ ] Prueba de subida de imagen exitosa

### Prueba Rápida:

Usa Postman, curl, o el frontend para probar:

```bash
curl -X POST https://tu-railway-url.railway.app/api/upload/image \
  -H "Authorization: Bearer TU_TOKEN_JWT" \
  -F "file=@/ruta/a/imagen.jpg" \
  -F "type=inventory"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/...",
    "thumbnail_url": "https://res.cloudinary.com/..."
  }
}
```

---

## 🔒 SEGURIDAD

### ✅ Buenas Prácticas:

1. **Nunca compartas tu API Secret**
   - Está en variables de entorno (Railway)
   - No lo incluyas en código fuente
   - No lo compartas en logs o mensajes

2. **Usa HTTPS siempre**
   - Cloudinary usa `secure: true` por defecto
   - Todas las URLs son HTTPS

3. **Validación de tipos de archivo**
   - Solo imágenes: JPEG, PNG, GIF, WebP
   - Solo PDFs para certificados
   - Tamaño máximo: 10MB

4. **Autenticación requerida**
   - Todos los endpoints de upload requieren JWT
   - Solo usuarios autenticados pueden subir archivos

---

## 💰 PLAN GRATUITO DE CLOUDINARY

El plan gratuito incluye:
- ✅ 25 GB de almacenamiento
- ✅ 25 GB de ancho de banda/mes
- ✅ Transformaciones ilimitadas
- ✅ CDN global
- ✅ Optimización automática

**Límites:**
- ⚠️ 25 GB de almacenamiento (suficiente para miles de imágenes)
- ⚠️ 25 GB de transferencia/mes (suficiente para ~100,000 vistas/mes)

Si necesitas más, hay planes de pago disponibles.

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Problema 1: "Cloudinary no configurado"
**Solución:**
- Verifica que las 3 variables de entorno estén en Railway
- Reinicia el servicio en Railway
- Revisa los logs para ver errores

### Problema 2: "Error al subir imagen"
**Solución:**
- Verifica que el archivo sea una imagen válida
- Verifica que el tamaño sea menor a 10MB
- Revisa los logs de Railway para el error específico
- Verifica que las credenciales sean correctas

### Problema 3: "401 Unauthorized"
**Solución:**
- Verifica que el token JWT sea válido
- Asegúrate de estar autenticado
- Revisa que el header `Authorization` esté presente

### Problema 4: Las imágenes no se muestran
**Solución:**
- Verifica que la URL de Cloudinary esté guardada en la base de datos
- Verifica que la URL sea HTTPS (no HTTP)
- Revisa que la URL no esté corrupta
- Prueba acceder a la URL directamente en el navegador

---

## 📞 SOPORTE

Si tienes problemas:
1. Revisa los logs de Railway
2. Verifica las credenciales en Cloudinary Dashboard
3. Prueba subir una imagen directamente desde Cloudinary Dashboard
4. Revisa la documentación de Cloudinary: https://cloudinary.com/documentation

---

## ✅ RESUMEN

Una vez configurado, Cloudinary:
- ✅ Almacenará todas tus fotos y archivos
- ✅ Generará thumbnails automáticamente
- ✅ Optimizará imágenes para carga rápida
- ✅ Servirá archivos desde CDN global
- ✅ Estará accesible desde cualquier lugar

**¡Tu sistema está listo para gestionar fotos y archivos de forma profesional! 🎉**

