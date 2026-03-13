# 08 - Proveedores

Proveedores, órdenes de compra, pagos a proveedores y recibos (payment_invoices). Frontend: suppliers.js (y opcionalmente suppliers-advanced.js, suppliers-integration.js). Backend: routes/suppliers.js, purchase-orders.js, supplier-payments.js.

## Propósito

- Gestionar proveedores por sucursal: datos básicos, contactos, contratos, documentos, valoraciones, historial de precios.
- Órdenes de compra (purchase_orders, purchase_order_items): crear, editar, eliminar; ítems vinculados a inventario o productos.
- Pagos a proveedores (supplier_payments): registrar pagos, estados; recibos de pago (payment_invoices) para historial.
- Reportes: compras, pagos, análisis por proveedor.

## Frontend

- **suppliers.js**: init, setupUI, loadSuppliers; CRUD proveedores; filtros por sucursal y tipo; pestañas o vistas para contactos, contratos, documentos si están implementados. Permisos según rol (no hay constante específica en PermissionManager para suppliers; a menudo se usa employees.view o acceso por rol admin/manager).
- **suppliers-advanced.js / suppliers-integration.js**: Funcionalidad extendida o integración con otros módulos si existen.

## Backend

### suppliers.js (montado en /api/suppliers)

- requireBranchAccess; setIO; emitSupplierUpdate.
- GET /: lista proveedores (branch_id, status, supplier_type, search, etc.).
- GET /:id: un proveedor.
- POST /, PUT /:id, DELETE /:id: CRUD.
- GET /:id/items: ítems de inventario del proveedor.
- GET /:id/costs, /:id/stats, /:id/stats-advanced: costos y estadísticas.
- POST /:id/rate, /:id/rate-advanced: valoraciones (supplier_ratings).
- GET/POST/PUT/DELETE /:id/contacts: contactos (supplier_contacts).
- GET/POST/PUT/DELETE /:id/contracts: contratos (supplier_contracts).
- GET/POST/PUT/DELETE /:id/documents: documentos (supplier_documents).
- GET /:id/price-history, POST /:id/price-history: historial de precios (supplier_price_history).
- GET /reports/purchases, /reports/payments, /reports/analysis: reportes.

### purchase-orders.js (montado en /api/purchase-orders)

- GET /: lista órdenes (branch_id, status, supplier_id).
- GET /:id: una orden con ítems.
- POST /: crear orden; POST /:id/items, PUT/DELETE /items/:itemId: ítems de la orden.
- PUT /:id: actualizar orden.
- DELETE /:id: eliminar orden.

### supplier-payments.js (montado en /api/supplier-payments)

- GET /: lista pagos (branch_id, supplier_id, status).
- GET /:id: un pago.
- POST /: crear pago.
- PUT /:id: actualizar pago.
- POST /:id/pay: registrar pago (genera o vincula payment_invoices/recibos).
- DELETE /:id: eliminar pago.
- GET /receipts/list: listado de recibos de pago.

## Modelo de datos

- **suppliers**: id, code, barcode, name, branch_id, status, supplier_type, contactos/contratos/documentos en tablas relacionadas.
- **purchase_orders**: branch_id, supplier_id, status, dates, total.
- **purchase_order_items**: order_id, item_id o sku/name, quantity, unit_price.
- **supplier_payments**: supplier_id, branch_id, status, reference_number, due_date, amount, etc.
- **payment_invoices**: supplier_payment_id, receipt_number, payment_date (recibos de pago).

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/suppliers.js` | CRUD proveedores, listado, filtros. |
| `backend/routes/suppliers.js` | API proveedores, contactos, contratos, documentos, ratings, reportes; emitSupplierUpdate. |
| `backend/routes/purchase-orders.js` | API órdenes de compra e ítems. |
| `backend/routes/supplier-payments.js` | API pagos y recibos. |
