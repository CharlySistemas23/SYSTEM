# 06 - Clientes y servicios

Clientes, reparaciones, reportes de llegadas turistas y reglas de llegada (tabulador). Frontend: customers.js, repairs.js, tourist_report.js, arrival_rules.js. Backend: routes/customers.js, repairs.js, tourist.js, arrival-rules.js.

## Propósito

- **Clientes**: CRUD de clientes por sucursal (nombre, email, teléfono, dirección, notas); usados en ventas y reparaciones.
- **Reparaciones**: Órdenes de reparación (folio, cliente, descripción, costos estimado/real, fechas, estado); fotos; flujo pending → in_progress → completed/cancelled.
- **Llegadas turistas**: Reportes diarios por sucursal (tourist_reports, tourist_report_lines); captura de llegadas por agencia/guía (agency_arrivals); reglas de tarifas (arrival_rate_rules) por agencia/sucursal/tipo de unidad.
- **Reglas de llegada**: Catálogo de tarifas (flat_fee, rate_per_passenger, etc.) vinculado a catalog_agencies y branches; usado para calcular montos en agency_arrivals.

## Frontend

- **customers.js**: init, setupUI, loadCustomers; CRUD con API o DB; filtro por sucursal. Permisos: customers.view, customers.add, customers.edit, customers.delete.
- **repairs.js**: init, setupUI, loadRepairs; listado por estado; crear/editar reparación, completar, subir fotos. Permisos: repairs.view, repairs.create, repairs.edit, repairs.complete.
- **tourist_report.js**: init, setupUI, displayArrivals/displayReport; pestañas o vistas para reportes diarios y llegadas; uso de API tourist (reports, arrivals, rules). Permisos: arrivals.view, arrivals.register, arrivals.edit.
- **arrival_rules.js**: Gestión de reglas de tarifas (arrival_rate_rules); integrado en settings/catálogos o en módulo de llegadas según implementación.

## Backend

### customers.js (montado en /api/customers)

- Middleware: authenticateOptional (customers no usa requireBranchAccess en todas las rutas; el filtro por branch_id se aplica en las consultas).
- GET /: lista clientes (filtro branch_id desde query o req.user.branchId).
- GET /:id: un cliente; verificación de acceso a branch_id.
- POST /: crear cliente (branch_id).
- PUT /:id: actualizar cliente.
- DELETE /:id: eliminar cliente.
- Socket: emitCustomerUpdate tras crear/actualizar/eliminar.

### repairs.js (montado en /api/repairs)

- requireBranchAccess; setIO; emitRepairUpdate.
- GET /: lista reparaciones por branch_id, status, customer_id, etc.
- GET /:id: una reparación con fotos.
- POST /: crear reparación (folio, branch_id, customer_id, description, estimated_cost, status, etc.).
- PUT /:id: actualizar reparación.
- POST /:id/complete: marcar completada (completed_date, actual_cost).
- POST /:id/photos: subir foto (photo_url).
- DELETE /:id: requireMasterAdmin.

### tourist.js (montado en /api/tourist)

- Reglas: GET /rules, POST /rules, PUT /rules/:id, DELETE /rules/:id (arrival_rate_rules).
- Llegadas: GET /arrivals, POST /arrivals, DELETE /arrivals/:id (agency_arrivals).
- Reportes: GET /reports, GET /reports/:id, POST /reports, PUT /reports/:id, DELETE /reports/:id (tourist_reports, tourist_report_lines).
- Filtros por branch_id en todas las rutas (requireBranchAccess).

### arrival-rules.js (montado en /api/arrival-rules)

- GET /, GET /:id, POST /, PUT /:id, DELETE /: CRUD de arrival_rate_rules (agency_id, branch_id, fee_type, flat_fee, rate_per_passenger, active_from, active_until, unit_type, etc.).

## Modelo de datos

- **customers**: id, name, email, phone, address, notes, branch_id.
- **repairs**: id, folio, branch_id, customer_id, description, estimated_cost, actual_cost, estimated_delivery_date, completed_date, status, notes, created_by.
- **repair_photos**: repair_id, photo_url, description.
- **tourist_reports**: date, branch_id, total_pax, total_sales, status, notes.
- **tourist_report_lines**: report_id, sale_id.
- **arrival_rate_rules**: agency_id, branch_id, unit_type, fee_type, flat_fee, rate_per_passenger, active_from, active_until.
- **agency_arrivals**: date, branch_id, agency_id, guide_id, passengers, units, unit_type, calculated_fee, override, notes.

## Permisos

| Permiso | Uso |
|---------|-----|
| customers.view, .add, .edit, .delete | Clientes |
| repairs.view, .create, .edit, .complete | Reparaciones |
| arrivals.view, .register, .edit | Llegadas y reportes turistas |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/customers.js` | CRUD clientes. |
| `Sistema/js/repairs.js` | CRUD reparaciones, fotos, completar. |
| `Sistema/js/tourist_report.js` | Reportes y llegadas turistas. |
| `Sistema/js/arrival_rules.js` | Reglas de tarifas de llegadas. |
| `backend/routes/customers.js` | API clientes, emitCustomerUpdate. |
| `backend/routes/repairs.js` | API reparaciones, emitRepairUpdate. |
| `backend/routes/tourist.js` | API rules, arrivals, reports. |
| `backend/routes/arrival-rules.js` | API arrival_rate_rules. |
