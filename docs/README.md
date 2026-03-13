# Documentación del sistema Opal & Co POS

Documentación técnica del sistema POS multisucursal, organizada por módulos y áreas. Cada documento describe propósito, archivos clave, flujos principales, modelo de datos y permisos cuando aplica.

## Índice

| Documento | Contenido |
|-----------|-----------|
| [00-estructura-visual](00-estructura-visual.md) | Estructura visual del sistema: layout global, autenticación, módulos estáticos/dinámicos, tabs y modales. |
| [01-arquitectura](01-arquitectura.md) | Stack (frontend/backend), flujo SPA, CORS, Socket.IO, despliegue (Railway/Vercel). |
| [02-base-datos](02-base-datos.md) | PostgreSQL (schema.sql), IndexedDB (db.js), stores y relación con la sincronización. |
| [03-autenticacion-permisos](03-autenticacion-permisos.md) | Login JWT, middleware auth/authOptional, PermissionManager, usuarios y roles. |
| [04-inventario](04-inventario.md) | Módulo inventario (inventory.js, transfers.js), rutas backend, modelo y permisos. |
| [05-ventas-pos](05-ventas-pos.md) | POS (pos.js), ventas (sales.js backend), pagos e impresión. |
| [06-clientes-servicios](06-clientes-servicios.md) | Clientes, reparaciones, llegadas turistas, reglas de llegada y catálogos relacionados. |
| [07-empleados-sucursales](07-empleados-sucursales.md) | Empleados, sucursales, branch_manager, catálogos (agencias, guías, vendedores). |
| [08-proveedores](08-proveedores.md) | Proveedores, órdenes de compra, pagos a proveedores y recibos. |
| [09-caja-costos-reportes](09-caja-costos-reportes.md) | Caja, costos, reportes y dashboard (KPIs, gráficos). |
| [10-sincronizacion](10-sincronizacion.md) | API client, SyncManager, Sync UI, cola de sincronización y conflictos. |
| [11-configuracion](11-configuracion.md) | Settings, backup, tipos de cambio, upload (Cloudinary), QA y debug. |
| [12-frontend-core](12-frontend-core.md) | app.js, ui.js, index.html, carga de módulos y dependencias del core. |

## Orden de lectura sugerido

- Para una visión general: **00-estructura-visual**, **01-arquitectura** y **02-base-datos**.
- Para entender acceso y permisos: **03-autenticacion-permisos** y **12-frontend-core**.
- Para un módulo concreto: usar el documento correspondiente (04 a 11).
- Para integración frontend-backend: **10-sincronizacion** junto con el módulo que interese.

## Convenciones

- Las rutas de archivos se indican relativas a la raíz del repositorio (p. ej. `backend/server.js`, `Sistema/js/app.js`).
- Los diagramas están en Mermaid cuando se incluyen.
- La documentación está en español.
