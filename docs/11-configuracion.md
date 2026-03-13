# 11 - Configuración

Settings (general, financiero, catálogos, permisos, auditoría, sincronización, QA), backup, tipos de cambio, subida de archivos (Cloudinary) y endpoints de diagnóstico (debug).

## Propósito

- **Settings**: Pantalla única con pestañas para configuración general (empresa, moneda, etc.), financiero, gestión de catálogos (agencias, guías, vendedores, sucursales, métodos de pago, reglas de comisión), gestión de permisos de usuarios, auditoría (audit_log), sincronización (URL del API) y acceso al módulo QA.
- **Backup**: Backups automáticos de IndexedDB (o datos locales) cada 5 minutos; opción de elegir carpeta (File System Access API); limpieza de backups antiguos.
- **Exchange rates**: Tipos de cambio diarios (USD/CAD a MXN) para reportes y conversiones; API pública (sin auth) para consulta; frontend puede guardar en IndexedDB (exchange_rates_daily).
- **Upload**: Subida de imágenes (inventario, reparaciones, etc.) a Cloudinary; backend recibe multipart y devuelve URL.
- **QA**: Módulo de autopruebas (solo visible para admin); ejecución de pruebas y registro en qa_test_runs, qa_coverage, qa_errors, qa_fixes.
- **Debug**: Endpoint de diagnóstico para verificar conteos por sucursal (inventario, sesiones de caja) y detectar si "no hay datos" es por BD vacía o por conexión.

## Frontend: settings.js

Archivo: `Sistema/js/settings.js`.

- **init()**: Construye o muestra pestañas (#settings-tabs, #settings-content). Pestañas típicas: general, financiero, catálogos, permisos, auditoría, sincronización, QA.
- **General**: Datos de empresa, moneda por defecto, preferencias de visualización (guardado en settings en IndexedDB o enviado al backend si existe API de config).
- **Financiero**: Tipos de cambio, márgenes por defecto, categorías de costos (según implementación).
- **Catálogos**: Enlace o embebido de gestión de agencias, guías, vendedores, sucursales, métodos de pago, reglas de comisión; llama a API /api/catalogs/* y opcionalmente /api/branches.
- **Permisos**: Solo si PermissionManager.hasPermission('settings.manage_permissions'). Listado de usuarios/empleados; edición de permisos y permissions_by_branch por usuario (llamadas a API employees/user).
- **Auditoría**: Solo si settings.view_audit. Listado de audit_log (desde API o DB local) con filtros por usuario, acción, fecha.
- **Sincronización**: Configuración de URL del API (api_url); guardado en DB settings y en API.baseURL; botón probar conexión (checkHealth); mensaje de estado.
- **QA**: Enlace o botón para abrir módulo QA (nav-admin-only); visibility del ítem "QA" en el menú según permisos settings.qa.
- **settings_api.js**: Si existe, agrupa llamadas al backend relacionadas con configuración (guardar preferencias, obtener audit log, etc.).

## Backup (backup.js)

Archivo: `Sistema/js/backup.js`.

- **BackupManager**: init() carga directorio de backups (desde settings.backup_directory_info); createBackup() exporta datos de IndexedDB (o stores seleccionados) a archivo JSON; intervalo cada 5 minutos; maxBackups (p. ej. 50); cleanOldBackups() elimina los más antiguos.
- **File System Access API**: showDirectoryPicker para que el usuario elija carpeta; el handle no se puede persistir indefinidamente, pero la ruta/nombre se guarda para mostrar en UI.
- Uso: puede iniciarse desde App.init() o desde la pestaña de configuración/backup en settings.

## Exchange rates

- **Backend**: `backend/routes/exchange_rates.js` montado en `/api/exchange-rates`. GET / (lista por start_date, end_date); GET /today (tipo de cambio de hoy o el más reciente); POST para crear/actualizar (requiere auth o no según implementación). Tabla exchange_rates_daily (date, usd_to_mxn, cad_to_mxn).
- **Frontend**: `Sistema/js/exchange_rates.js` puede obtener tipos de cambio (API o fuente externa) y guardarlos en IndexedDB (exchange_rates_daily) o solo consumir desde API para reportes y POS.

## Upload (Cloudinary)

- **Backend**: `backend/routes/upload.js`; middleware multer para multipart; `backend/config/cloudinary.js` para credenciales y subida. POST /api/upload (o /api/upload/image) recibe archivo, lo sube a Cloudinary y devuelve URL. Usado por inventario (fotos de ítems), reparaciones (fotos), etc.
- **Variables de entorno**: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.

## QA y debug

- **Módulo QA**: En app.js loadModule('qa') carga el módulo de autopruebas (qa.js). Ejecuta pruebas sobre la UI o los datos y registra en IndexedDB (qa_test_runs, qa_coverage, qa_errors, qa_fixes). El ítem del menú "QA" tiene clase nav-admin-only y se muestra solo si el usuario es admin/master_admin o tiene permiso settings.qa.
- **Debug API**: `backend/routes/debug.js` montado en `/api/debug`. GET /data-stats: con authenticateOptional, devuelve inventory_count y cash_sessions_count para la sucursal del usuario (o total si master_admin). Sirve para diagnosticar si la BD del servidor tiene datos para esa sucursal.

## Permisos

| Permiso | Uso |
|---------|-----|
| settings.view | Ver configuración |
| settings.edit_general, .edit_financial | Editar general/financiero |
| settings.manage_catalogs | Gestionar catálogos |
| settings.manage_permissions | Gestionar permisos de usuarios |
| settings.view_audit | Ver auditoría |
| settings.sync | Configurar sincronización |
| settings.qa | Acceso al módulo QA |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/settings.js` | Pestañas de configuración, permisos, auditoría, sync, catálogos. |
| `Sistema/js/settings_api.js` | Llamadas API de configuración (si existe). |
| `Sistema/js/backup.js` | Backups automáticos IndexedDB, File System Access. |
| `Sistema/js/exchange_rates.js` | Consumo/actualización tipos de cambio. |
| `backend/routes/exchange_rates.js` | API tipos de cambio (GET/POST). |
| `backend/routes/upload.js` | Subida de archivos a Cloudinary. |
| `backend/config/cloudinary.js` | Configuración Cloudinary. |
| `backend/routes/debug.js` | GET /data-stats para diagnóstico. |
| `Sistema/js/qa.js` | Módulo de autopruebas. |
