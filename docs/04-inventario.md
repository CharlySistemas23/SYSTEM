# 04 - Inventario

Módulo de inventario (items, fotos, certificados, historial de precios, etiquetas) y de transferencias entre sucursales. Frontend: inventory.js, transfers.js. Backend: routes/inventory.js, routes/transfers.js.

## Propósito

- Gestionar ítems de inventario por sucursal: alta, edición, baja, filtros, búsqueda, vistas grid/lista, alertas de stock, fotos, certificados de joyería, historial de precios.
- Transferencias entre sucursales: crear envíos, aprobar, completar o cancelar; listar y filtrar por sucursal y estado.

## Frontend: inventory.js

Archivo: `Sistema/js/inventory.js`.

- **init()**: Comprueba permiso `inventory.view`. Si no hay #inventory-list, llama a setupUI(). Configura setupEventListeners(), loadInventory(), y escucha el evento `branch-changed` para recargar.
- **setupUI()**: Construye el HTML del módulo dentro de #module-content: barra de acciones (botón agregar si tiene permiso inventory.add), filtros (búsqueda, estado, categoría, metal, piedra, precio min/max, sucursal, certificado, proveedor, etc.), vista grid/lista, contenedor #inventory-list. Los botones de exportar/eliminar en lote dependen de permisos.
- **loadInventory()**: Obtiene datos de API (GET /api/inventory con query branch_id, status, search, category, etc.) o de DB local; aplica filtros y ordenación; renderiza tarjetas o filas en #inventory-list. Usa BranchManager.getCurrentBranchId() para filtrar por sucursal.
- **CRUD**: Crear/editar ítem mediante modales o formularios; eliminar con confirmación. deleteItem(itemId) llama al API DELETE o marca para sync. Permisos: inventory.add, inventory.edit, inventory.delete.
- **Fotos**: Subida y asociación a ítems (inventory_photos en IndexedDB; en backend las fotos pueden estar en inventory_items.photos como array de URLs o en tabla aparte según implementación).
- **Certificados e historial de precios**: inventory_certificates, inventory_price_history en IndexedDB; en backend inventory_items tiene certificate_number y certificate_details (JSONB).
- **Etiquetas joyería**: El módulo puede usar o enlazar con jewelry_label_editor.js para etiquetas.
- **Permisos usados**: inventory.view, inventory.add, inventory.edit, inventory.delete, inventory.update_stock, inventory.view_cost, inventory.edit_cost.

## Frontend: transfers.js

Archivo: `Sistema/js/transfers.js`.

- **init()**: Asegura #module-content, llama setupUI(), loadTransfers() y marca initialized.
- **setupUI()**: Genera header con botón "Nueva Transferencia" (si transfers.create), filtros (sucursal origen/destino, estado), lista de transferencias y modales para crear/ver detalle.
- **loadTransfers()**: GET /api/transfers (o DB local) con branch_id, status, from_branch_id, to_branch_id; pinta la tabla o lista.
- **Crear transferencia**: Modal para elegir sucursal destino, ítems y cantidades; POST /api/transfers. Permisos: transfers.view, transfers.create, transfers.approve.

## Backend: routes/inventory.js

Archivo: `backend/routes/inventory.js`. Montado en `/api/inventory`. Middleware: requireBranchAccess en todas las rutas. io inyectado con setIO(io); se usa emitInventoryUpdate tras crear/actualizar/eliminar.

- **GET /** : Lista items. Query: branch_id, status, search, category, metal, stone_type, min_price, max_price, material, purity, plating, style, finish, theme, condition, location_detail, collection. branch_id se normaliza; si el usuario no es master_admin se restringe a sus sucursales. JOIN con suppliers. Límite 1000.
- **GET /:id** : Un item por ID; se verifica acceso a branch_id.
- **POST /** : Crear item. body con todos los campos de inventory_items; branch_id por defecto req.user.branchId. Inserta en inventory_logs (entrada) y audit_logs. emitInventoryUpdate(io, branchId, 'created', item).
- **PUT /:id** : Actualizar item; verificación de branch; inventory_logs si cambia stock; audit_logs; emitInventoryUpdate(io, branchId, 'updated', item).
- **DELETE /:id** : Borrado lógico o físico según implementación; audit_logs; emitInventoryUpdate(io, branchId, 'deleted', { id }).

## Backend: routes/transfers.js

Archivo: `backend/routes/transfers.js`. Montado en `/api/transfers`. requireBranchAccess; setIO(io); emitTransferUpdate.

- **GET /** : Lista transferencias. Query: branch_id, status, from_branch_id, to_branch_id. Master admin puede filtrar por branch_id; usuarios normales solo ven where from_branch_id = user.branchId OR to_branch_id = user.branchId. JOIN branches (from/to), users (created_by, approved_by).
- **GET /:id** : Una transferencia con sus items (inventory_transfer_items).
- **POST /** : Crear transferencia (from_branch_id, to_branch_id, items[]). Valida sucursales y stock; crea inventory_transfers e inventory_transfer_items; emitTransferUpdate.
- **PATCH /:id** : Cambiar estado (approve, complete, cancel); actualiza stock en destino si aplica; emitTransferUpdate.

## Modelo de datos

- **PostgreSQL**: inventory_items, inventory_logs, inventory_transfers, inventory_transfer_items (ver [02-base-datos.md](02-base-datos.md)). inventory_items incluye branch_id, sku, barcode, name, category, subcategory, collection, metal, material, purity, plating, stone_type, stones (JSONB), measurements (JSONB), price, sale_price, cost, stock_actual, stock_min, stock_max, status, certificate_number, certificate_details (JSONB), photos (TEXT[]), supplier_id, etc.
- **IndexedDB**: inventory_items, inventory_photos, inventory_logs, inventory_certificates, inventory_price_history, inventory_transfers, inventory_transfer_items (db.js).

## Permisos

| Permiso | Uso |
|---------|-----|
| inventory.view | Ver listado y detalle |
| inventory.add | Botón agregar, crear ítem |
| inventory.edit | Editar ítem |
| inventory.delete | Eliminar ítem |
| inventory.update_stock | Ajustar stock |
| inventory.view_cost, inventory.edit_cost | Ver/editar costo |
| transfers.view | Ver transferencias |
| transfers.create | Crear transferencia |
| transfers.approve | Aprobar transferencia |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/inventory.js` | UI, loadInventory, CRUD, filtros, permisos. |
| `Sistema/js/transfers.js` | UI, loadTransfers, crear/aprobar/completar transferencias. |
| `backend/routes/inventory.js` | CRUD items, filtros por branch, Socket.IO inventory_updated. |
| `backend/routes/transfers.js` | CRUD transferencias, filtro por sucursal, Socket.IO transfer_updated. |
