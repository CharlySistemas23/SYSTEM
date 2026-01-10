# ⚠️ SOLUCIÓN URGENTE - ERROR CORS

## 🔴 PROBLEMA ACTUAL

Los datos **NO se están enviando** a Google Sheets debido a errores CORS. El sistema está intentando usar `no-cors` como fallback, pero **esto NO funciona** con Google Apps Script.

## ✅ SOLUCIÓN PASO A PASO

### Paso 1: Actualizar Google Apps Script

1. **Abre tu Google Sheet**
2. **Ve a Extensiones → Apps Script**
3. **Borra TODO el código actual**
4. **Copia TODO el código del archivo `google_apps_script.js`** (está en tu proyecto)
5. **Guarda el proyecto** (Ctrl+S o Cmd+S)

### Paso 2: Verificar que el código tiene CORS

Asegúrate de que el código tenga estas funciones:

```javascript
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600'
    });
}

function doPost(e) {
  // ... tu código ...
  
  // Al final, antes del return:
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}
```

### Paso 3: REDESPLEGAR la Aplicación Web (CRÍTICO)

⚠️ **IMPORTANTE**: Solo guardar NO es suficiente. Debes crear una **NUEVA implementación**:

1. **Ve a Implementar → Nueva implementación**
   - Si no ves "Nueva implementación", ve a "Implementar → Gestionar implementaciones" y crea una nueva

2. **Configuración:**
   - **Tipo**: Aplicación web
   - **Ejecutar como**: Yo
   - **Quién tiene acceso**: **Cualquiera** (MUY IMPORTANTE)
   - **Versión**: Nueva (o Head)

3. **Click en "Implementar"**

4. **Copia la NUEVA URL** que aparece (será diferente a la anterior)

### Paso 4: Actualizar la URL en el Sistema POS

1. **Abre tu sistema POS**
2. **Ve a Configuración → Sincronización**
3. **Pega la NUEVA URL** de Google Apps Script
4. **Verifica que el TOKEN coincida** con el del Google Apps Script
5. **Guarda la configuración**

### Paso 5: Verificar que Funciona

1. **Abre la consola del navegador** (F12 → Console)
2. **Sincroniza manualmente**
3. **Busca en la consola:**
   - ✅ `✅ sincronizado exitosamente` → Funciona correctamente
   - ❌ `❌ ERROR CORS` → El Google Apps Script aún no está actualizado

4. **Si ves errores CORS:**
   - Verifica que seguiste TODOS los pasos
   - Asegúrate de haber creado una NUEVA implementación (no solo guardado)
   - Verifica que "Quién tiene acceso" esté en "Cualquiera"

### Paso 6: Verificar en Google Sheets

1. **Abre tu Google Sheet**
2. **Ve a las pestañas** (SALES, INVENTORY, etc.)
3. **Verifica que aparezcan los datos**

## 🔍 CÓMO VERIFICAR QUE CORS ESTÁ CONFIGURADO

### Opción 1: Probar con doGet

En Google Apps Script, ejecuta esta función de prueba:

```javascript
function testCORS() {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'CORS funcionando'
  }))
  .setMimeType(ContentService.MimeType.JSON)
  .setHeaders({
    'Access-Control-Allow-Origin': '*'
  });
}
```

Luego accede a la URL de tu aplicación web en el navegador. Deberías ver el JSON.

### Opción 2: Ver en la Consola del Navegador

Después de sincronizar, si CORS está configurado correctamente:
- ✅ NO deberías ver errores de CORS
- ✅ Deberías ver `✅ sincronizado exitosamente`
- ✅ La respuesta del servidor debería ser visible

## 🚨 SI TODAVÍA NO FUNCIONA

### Verifica esto:

1. ✅ ¿Actualizaste el código en Google Apps Script?
2. ✅ ¿Creaste una NUEVA implementación (no solo guardaste)?
3. ✅ ¿Configuraste "Quién tiene acceso" en "Cualquiera"?
4. ✅ ¿Actualizaste la URL en el sistema POS?
5. ✅ ¿El TOKEN coincide exactamente?

### Si todo está bien pero aún falla:

1. **Revisa los logs de Google Apps Script:**
   - Ve a Extensiones → Apps Script
   - Click en "Ejecuciones" (icono de reloj)
   - Revisa si hay ejecuciones recientes
   - Si NO hay ejecuciones, significa que las peticiones NO están llegando

2. **Prueba la URL directamente:**
   - Abre la URL de tu aplicación web en el navegador
   - Deberías ver un JSON con `success: true`

3. **Verifica el formato de la URL:**
   - Debe terminar en `/exec`
   - NO debe tener parámetros adicionales

## 📝 NOTAS IMPORTANTES

- **no-cors NO funciona** con Google Apps Script para verificar respuestas
- **Debes configurar CORS correctamente** en Google Apps Script
- **Cada vez que cambias el código**, debes crear una **NUEVA implementación**
- Los datos anteriores que se marcaron como "enviados" probablemente **NO se enviaron**
- Puedes re-agregar datos a la cola usando `forceRequeueEntityType()`

## 🔄 RE-AGREGAR DATOS A LA COLA

Si los datos anteriores no se enviaron, puedes re-agregarlos:

```javascript
// En la consola del navegador (F12)
await SyncManager.forceRequeueEntityType('sale', 100)
await SyncManager.forceRequeueEntityType('inventory_item', 100)
await SyncManager.forceRequeueEntityType('customer', 100)
// etc...
```

Luego sincroniza de nuevo.

