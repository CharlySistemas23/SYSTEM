# 05 - Ventas y POS

Punto de venta (POS) en frontend y API de ventas en backend. Incluye carrito, pagos, descuentos, impresión y tiempo real vía Socket.IO.

## Propósito

- POS: listar productos (inventario de la sucursal), agregar al carrito, aplicar descuentos, seleccionar cliente/vendedor/guía/agencia, registrar pagos (efectivo MXN/USD/CAD, TPV), completar venta y opcionalmente imprimir ticket.
- API de ventas: listar y filtrar ventas, obtener detalle con ítems y pagos, crear/actualizar/cancelar ventas. Actualización en tiempo real para otras pantallas (dashboard, reportes).

## Frontend: pos.js

Archivo: `Sistema/js/pos.js`.

- **init()**: Comprueba permiso `pos.view`. Carga catálogos (loadCatalogs), productos (loadProducts), favoritos, ventas pendientes; inicia reloj y auto-guardado del carrito; restaura carrito desde localStorage; configura listeners de Socket.IO (sale_updated, inventory_updated).
- **loadProducts()**: Obtiene ítems de inventario (API o DB) filtrados por sucursal actual; renderiza grid de productos en el POS. Filtros por búsqueda, categoría, etc.
- **Carrito**: cart[], addToCart, removeFromCart, actualizar cantidades; subtotal, descuento, total. currentCustomer, currentSeller, currentGuide, currentAgency para comisiones y reportes.
- **Completar venta**: Arma payload (branch_id, items, customer_id, seller_id, guide_id, agency_id, subtotal, discount, total, payments[]). Si hay API y token llama a API.createSale(saleData); si no, guarda en DB local y en cola de sync. Tras éxito: limpiar carrito, opción de impresión (printer.js), actualizar contador del día.
- **Permisos**: pos.view, pos.create_sale, pos.edit_sale, pos.cancel_sale, pos.apply_discount.
- **Dashboard y reportes**: Leen ventas desde API o DB (sales, sale_items, payments) para KPIs y listados; no tienen un módulo "ventas" aparte en el menú, se consultan desde Dashboard y Reportes.

## Backend: routes/sales.js

Archivo: `backend/routes/sales.js`. Montado en `/api/sales`. requireBranchAccess; setIO(io); emitSaleUpdate y emitInventoryUpdate.

- **GET /** : Lista ventas. Query: branch_id, start_date, end_date, status, seller_id, guide_id, agency_id. Filtro por branch (master_admin opcional, resto obligatorio). Incluye items_count. Límite 1000.
- **GET /:id** : Una venta con sale_items y payments. Verificación de acceso por branch_id.
- **POST /** : Crear venta. Body: branch_id, customer_id, seller_id, guide_id, agency_id, subtotal, discount_percent, discount_amount, total, status, items[], payments[]. Inserta en sales, sale_items, payments; actualiza stock en inventory_items (y inventory_logs); audit_logs; emitSaleUpdate(io, branchId, 'created', sale); emitInventoryUpdate para ítems vendidos.
- **PUT /:id** : Actualizar venta (editar ítems, pagos, descuento, cancelar). Ajuste de stock si hay cambios; emitSaleUpdate('updated', sale).
- **DELETE /:id** : Cancelar venta (status cancelled o borrado según implementación); devolución de stock; emitSaleUpdate('cancelled', sale).

## Modelo de datos

- **sales**: folio, branch_id, seller_id, guide_id, agency_id, customer_id, subtotal, discount_percent, discount_amount, total, status (completed, cancelled, pending, reserved), created_by, created_at.
- **sale_items**: sale_id, item_id, sku, name, quantity, unit_price, discount_percent, subtotal, guide_commission, seller_commission.
- **payments**: sale_id, method (cash_usd, cash_mxn, tpv_visa, etc.), amount, currency, bank, card_type.

## Permisos

| Permiso | Uso |
|---------|-----|
| pos.view | Ver POS y realizar ventas |
| pos.create_sale | Completar venta |
| pos.edit_sale | Editar venta pendiente |
| pos.cancel_sale | Cancelar venta |
| pos.apply_discount | Aplicar descuento en el ticket |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/pos.js` | POS: productos, carrito, pagos, createSale, Socket listeners. |
| `Sistema/js/printer.js` | Impresión de tickets (si se usa). |
| `backend/routes/sales.js` | CRUD ventas, ítems, pagos, stock, Socket.IO sale_updated. |
