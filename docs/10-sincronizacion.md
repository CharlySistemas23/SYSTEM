# 10 - Sincronización

Cliente API (api.js), gestor de sincronización (sync_manager.js) y UI de sincronización (sync_ui.js). Cola de cambios en IndexedDB y flujo de subida/bajada con el backend.

## Propósito

- **api.js**: Punto único de comunicación HTTP y Socket.IO con el backend: baseURL, token, login, verifyToken, initSocket; métodos por recurso (get/post/put/delete) con headers Authorization y x-username, x-branch-id.
- **sync_manager.js**: Mantener cola de operaciones pendientes (sync_queue); subir cambios al servidor (syncPending); opcionalmente descargar datos del servidor para actualizar IndexedDB; verificación de token y reintentos.
- **sync_ui.js**: Mostrar estado de conexión y sincronización en el topbar y en el módulo "Sincronización"; botón "Sincronizar ahora"; mensajes de éxito/error.
- Scripts en docs/ (verificar-sincronizacion.ps1, .sh): pasos de verificación manual si están documentados.

## API client (api.js)

Archivo: `Sistema/js/api.js`.

- **init()**: Lee settings.api_url desde DB y la asigna a baseURL (con normalización: protocolo, sin trailing slash, corrección .app para Railway). Lee api_token de localStorage; si no hay token puede intentar login automático (master_admin/1234). Si hay baseURL y token, llama a initSocket().
- **setBaseURL(url)**: Actualiza baseURL, persiste en DB (settings.api_url), reinicializa socket si hay token.
- **checkHealth({ timeoutMs, cacheMs })**: GET /health sin token; usa caché para no saturar. Devuelve true/false según respuesta OK.
- **login(username, password)**: POST /api/auth/login; guarda token en this.token y localStorage; initSocket() tras éxito.
- **verifyToken()**: GET /api/auth/verify con Authorization Bearer; devuelve { valid, user } o lanza/retorna error. Usado por SyncManager y UserManager para validar sesión.
- **initSocket()**: Conecta Socket.IO a baseURL con auth: { token } o { username, branchId } (desde UserManager/BranchManager). Eventos: connect, disconnect, inventory_updated, sale_updated, etc.
- **Peticiones REST**: Métodos genéricos (get, post, put, delete) que añaden Authorization y opcionalmente x-username, x-branch-id. Wrappers por recurso: getBranches, getInventory, createSale, getSales, getCustomers, etc., todos usando baseURL + /api/... y el token/headers.
- **Manejo de errores**: Respuestas no OK se traducen a mensajes; 401 puede provocar limpieza de token y redirección a login según contexto.

## SyncManager (sync_manager.js)

Archivo: `Sistema/js/sync_manager.js`.

- **init()**: loadQueue() desde IndexedDB (sync_queue). Si hay api_url y token (o localStorage), verifica token con API.verifyToken(); si es inválido limpia token e intenta login automático. Inicializa socket si falta. Llama a syncLocalDataToServer() (subir datos locales que no estén en servidor) y syncPending(). Configura setInterval (cada 10 s) para ejecutar syncPending() si hay elementos en cola y no está isSyncing. Escucha API.socket.on('connect') para sincronizar al reconectar.
- **loadQueue()**: DB.getAll('sync_queue') y asigna a this.syncQueue.
- **addToQueue(type, entityId, data)**: Crea ítem en sync_queue (type, entity_id, data, created_at, retry_count); evita duplicados (mismo type + entity_id). Persiste en DB y dispara syncPending() con requestIdleCallback o setTimeout(500).
- **syncPending()**: Si isSyncing sale. Sincroniza API.baseURL y API.token desde DB; verifica token (cada 60 s) y limpia si es inválido. Recorre syncQueue: según type (sale, inventory_item, customer, repair, cost_entry, inventory_transfer, etc.) llama al API correspondiente (POST/PUT); en éxito elimina de sync_queue y opcionalmente actualiza registro local con id del servidor; en error incrementa retry_count y deja en cola o mueve a sync_logs. sync_deleted_items se usa para enviar borrados al servidor (DELETE) cuando aplica.
- **syncLocalDataToServer()**: Detecta entidades locales (p. ej. ventas, reparaciones) con sync_status pending o sin id de servidor y las sube o las encola.
- **getQueueSize()**: Devuelve syncQueue.length.

Los módulos (POS, inventario, clientes, reparaciones, costos, transferencias) al crear/editar en local llaman a SyncManager.addToQueue(...) para que los cambios se suban cuando haya conexión.

## Sync UI (sync_ui.js)

Archivo: `Sistema/js/sync_ui.js`.

- **init()**: setupUI(), loadStatus(), startAutoUpdate(). Si el módulo "sync" se muestra en #module-content o #sync-ui-container, pinta tarjetas KPI (estado del servidor, estado de sincronización, cola pendiente, última sync) y botón "Sincronizar ahora".
- **setupUI()**: Genera HTML del módulo de sincronización (servidor, estado, cola, botón, logs recientes).
- **loadStatus()**: Consulta API.checkHealth(), SyncManager.getQueueSize(), última fecha de sync (sync_logs o variable); actualiza textos e indicadores (conectado/desconectado, pendientes, éxito/error).
- **startAutoUpdate()**: setInterval para refresh del estado cada X segundos.
- **Topbar**: El indicador #topbar-sync-status y #connection-status se actualizan desde este módulo o desde un listener global (API.socket connect/disconnect) para mostrar "Online" / "Offline" y mensaje de cola pendiente.
- **Sincronizar ahora**: Botón que llama a SyncManager.syncPending() y luego loadStatus() para refrescar la UI.

## Cola y conflictos

- **sync_queue**: Object store en IndexedDB (id, entity_type, entity_id, data, status, created_at, retry_count). entity_type identifica el recurso (sale, inventory_item, customer, repair, cost_entry, inventory_transfer, etc.); data puede ser el payload a enviar.
- **sync_logs**: Registro de intentos (éxito/error) para mostrar en UI y diagnóstico.
- **sync_deleted_items**: Metadata de ítems eliminados localmente (entity_type, entity_id, deleted_at) para enviar DELETE al servidor.
- No hay resolución automática de conflictos (last-write-wins o merge); el flujo es principalmente "local primero, luego subir". Si el servidor rechaza (ej. conflicto), el ítem puede quedar en cola con retry o marcarse como error en sync_logs.

## Scripts de verificación

- **docs/verificar-sincronizacion.ps1** y **docs/verificar-sincronizacion.sh**: Scripts para comprobar conectividad o estado del backend/sincronización desde línea de comandos; ver contenido en docs/ para detalles.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/api.js` | baseURL, token, login, verifyToken, initSocket, métodos HTTP y wrappers por recurso. |
| `Sistema/js/sync_manager.js` | loadQueue, addToQueue, syncPending, syncLocalDataToServer, intervalo y listeners. |
| `Sistema/js/sync_ui.js` | UI del módulo Sincronización, estado en topbar, "Sincronizar ahora". |
| `Sistema/js/db.js` | Stores sync_queue, sync_logs, sync_deleted_items. |
