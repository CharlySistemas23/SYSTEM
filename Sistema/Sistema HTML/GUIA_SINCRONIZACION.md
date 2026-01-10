# Guía de Sincronización con Google Sheets

## Cómo Funciona el Sistema de Sincronización

### 1. **Flujo de Sincronización**

El sistema funciona con una **cola de sincronización**:

1. **Agregar a la Cola**: Cuando se crea o modifica un dato (venta, inventario, etc.), se agrega automáticamente a la cola de sincronización (`sync_queue`)
2. **Procesar Cola**: El sistema procesa los elementos pendientes y los envía a Google Sheets
3. **Verificar Éxito**: Se marca como sincronizado si la operación fue exitosa

### 2. **Configuración Requerida**

Para que funcione la sincronización, necesitas:

1. **URL de Google Apps Script**: La URL de tu aplicación web desplegada
2. **Token de Seguridad**: El token configurado en el script de Google Apps Script

**Pasos para configurar:**

1. Abre Google Sheets
2. Ve a **Extensiones → Apps Script**
3. Pega el código de `google_apps_script.js`
4. Guarda el proyecto (Ctrl+S)
5. Ve a **Implementar → Nueva implementación**
6. Tipo: **Aplicación web**
7. Ejecutar como: **Yo**
8. Quién tiene acceso: **Cualquiera**
9. Click en **Implementar**
10. Copia la **URL de la aplicación web**
11. Genera un **TOKEN** seguro (puedes usar `Utilities.getUuid()` en la consola de Apps Script)
12. Configura la URL y TOKEN en el sistema POS (Configuración → Sincronización)

### 3. **Verificar que los Datos se Envían**

#### En la Consola del Navegador (F12):

Busca estos logs cuando sincronices:

- `🔄 Iniciando sincronización...` - Indica que comenzó el proceso
- `📋 Elementos pendientes en cola: X` - Muestra cuántos elementos hay
- `📦 Procesando X items de tipo Y...` - Indica qué tipo de datos se están procesando
- `📤 Enviando X registros a Google Sheets...` - Muestra cuántos registros se envían
- `✅ Y sincronizado exitosamente` - Confirma que se envió correctamente
- `❌ Error sincronizando Y` - Indica un error

#### Verificar en Google Sheets:

1. Abre tu Google Sheet
2. Ve a **Extensiones → Apps Script**
3. Click en **Ejecuciones** (icono de reloj)
4. Verifica que las ejecuciones se están registrando
5. Revisa los logs para ver si hay errores

### 4. **Problemas Comunes**

#### Los datos no se envían:

1. **Verifica la configuración:**
   - URL de sincronización configurada
   - Token correcto
   - Conexión a internet activa

2. **Revisa la consola del navegador:**
   - Busca errores en rojo
   - Verifica los logs de sincronización

3. **Verifica la cola de sincronización:**
   - Ve a **Configuración → Sincronización → Cola**
   - Revisa si hay elementos pendientes
   - Verifica si hay elementos fallidos

4. **Verifica Google Apps Script:**
   - Asegúrate de que el script esté desplegado
   - Verifica que el token en el script coincida con el del sistema
   - Revisa los logs de ejecución en Apps Script

#### Los datos se marcan como sincronizados pero no aparecen en Sheets:

1. **Verifica el token:**
   - El token en el script debe coincidir exactamente con el del sistema
   - Revisa que no haya espacios extra

2. **Verifica los permisos:**
   - La aplicación web debe tener acceso "Cualquiera"
   - El script debe tener permisos para editar el Sheet

3. **Revisa los logs de Apps Script:**
   - Ve a **Extensiones → Apps Script → Ejecuciones**
   - Revisa si hay errores en las ejecuciones

### 5. **Tipos de Datos que se Sincronizan**

- **Ventas** (`sale`) - Con items y pagos
- **Inventario** (`inventory_item`)
- **Clientes** (`customer`)
- **Empleados** (`employee`)
- **Reparaciones** (`repair`)
- **Costos** (`cost_entry`)
- **Reportes Turísticos** (`tourist_report`)
- **Catálogos** (sucursales, agencias, vendedores, guías)
- **Transferencias de Inventario** (`inventory_transfer`)
- **Y más...**

### 6. **Sincronización Automática**

El sistema puede sincronizar automáticamente:

- **Cada 5 minutos**
- **Cada 15 minutos**
- **Cada 30 minutos**
- **Cada hora**
- **Deshabilitada** (solo manual)

Configura esto en **Configuración → Sincronización → Configuración**

### 7. **Sincronización Manual**

Puedes sincronizar manualmente:

1. Click en el botón de sincronización en la barra superior (icono de sincronización)
2. O ve a **Configuración → Sincronización → Resumen** y click en **Sincronizar Ahora**

### 8. **Logs de Sincronización**

Puedes ver el historial completo de sincronizaciones en:

**Configuración → Sincronización → Logs**

Aquí verás:
- Fecha y hora de cada sincronización
- Cantidad de elementos sincronizados
- Errores si los hay
- Duración de la sincronización

### 9. **Solución de Problemas Avanzada**

Si los datos no se envían después de verificar todo lo anterior:

1. **Abre la consola del navegador (F12)**
2. **Ejecuta manualmente una sincronización**
3. **Copia todos los logs que aparezcan**
4. **Revisa específicamente:**
   - Si aparece `📤 Enviando X registros...`
   - Si aparece `✅ sincronizado exitosamente`
   - Si hay algún error `❌`

5. **Verifica en Google Apps Script:**
   - Ve a **Extensiones → Apps Script**
   - Click en **Ejecuciones**
   - Verifica si hay ejecuciones recientes
   - Revisa los logs de cada ejecución

### 10. **Notas Importantes**

- El sistema usa **CORS** primero para poder verificar la respuesta
- Si CORS falla, usa **no-cors** como fallback (pero no puede verificar la respuesta)
- Los datos se envían en **lotes** para mejor rendimiento
- Los elementos fallidos se reintentan automáticamente (hasta 5 veces por defecto)
- Los elementos sincronizados se mantienen en la cola para referencia histórica

