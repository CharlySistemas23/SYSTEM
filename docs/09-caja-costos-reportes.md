# 09 - Caja, costos, reportes y dashboard

Caja (sesiones y movimientos), costos (cost_entries), reportes (reports.js y API) y dashboard (KPIs y gráficos). Frontend: cash.js, costs.js, reports.js, dashboard.js. Backend: routes/cash.js, costs.js, reports.js, dashboard.js.

## Propósito

- **Caja**: Apertura y cierre de sesión por sucursal y usuario; movimientos (depósitos, retiros); consulta de estado y reportes de caja.
- **Costos**: Registro de gastos/costos por sucursal (cost_entries): tipo (fijo/variable), categoría, monto, fecha, periodicidad; listado y filtros.
- **Reportes**: Múltiples pestañas o tipos (ventas, utilidad, costos, analíticas, exportación); filtros por fechas y sucursal; generación y export (Excel/PDF según implementación).
- **Dashboard**: KPIs (ventas hoy, tickets, ticket promedio, % cierre); top vendedores; alertas; datos por sucursal; opción “todas las sucursales” para master_admin (dashboard.view_all_branches).

## Frontend

- **cash.js**: init, setupUI; abrir/cerrar sesión (cash_sessions); registrar movimientos; listado de sesiones y movimientos. Permisos: cash.view, cash.open_session, cash.close_session, cash.view_reports.
- **costs.js**: init, pestañas o listado; CRUD cost_entries (tipo, categoría, monto, fecha). Permisos: costs.view, costs.add, costs.edit, costs.delete.
- **reports.js**: init, pestañas por tipo de reporte (resumen, diario, vendedor, agencia, producto, comparativo, etc.); filtros; botón exportar. Permisos: reports.view, reports.generate, reports.export, reports.view_profits, reports.view_costs, reports.view_analytics.
- **dashboard.js**: init, loadDashboard; obtiene ventas y métricas (API o DB); renderiza KPIs, top sellers, alertas; selector de sucursal para master_admin. Permisos: dashboard.view, dashboard.view_all_branches.

## Backend

### cash.js (montado en /api/cash)

- GET: listar sesiones (branch_id, date, status).
- GET /:id: una sesión con movimientos.
- POST: abrir sesión (branch_id, initial_amount, date).
- PATCH /:id/close: cerrar sesión (final_amount, difference, notes).
- POST /:id/movements: agregar movimiento (type: deposit/withdrawal, amount, description).

### costs.js (montado en /api/costs)

- requireBranchAccess; setIO; emitCostUpdate.
- GET: listar cost_entries (branch_id, date_from, date_to, type, category).
- GET /:id: una entrada.
- POST: crear cost_entry.
- PUT /:id: actualizar.
- DELETE /:id: eliminar.

### reports.js (montado en /api/reports)

- GET con query (branch_id, date_from, date_to, type): devolver datos agregados para reportes (ventas, utilidad, costos, por vendedor/agencia/producto). Puede incluir endpoints específicos por tipo de reporte (summary, daily, seller, agency, etc.).

### dashboard.js (montado en /api/dashboard)

- GET: KPIs y resumen (branch_id o todas para master_admin); ventas del día, tickets, ticket promedio, top vendedores, alertas (stock bajo, etc.). Query branch_id, date.

## Modelo de datos

- **cash_sessions**: branch_id, user_id, date, initial_amount, current_amount, final_amount, difference, status (open/closed), closed_at, closed_by.
- **cash_movements**: session_id, type (opening, closing, deposit, withdrawal), amount, description, created_by.
- **cost_entries**: branch_id, type (fijo, variable), category, amount, date, description, period_type, recurring.
- **daily_profit_reports**, **saved_reports**: ver schema; usados por reportes y dashboard.

## Permisos

| Permiso | Uso |
|---------|-----|
| cash.view, .open_session, .close_session, .view_reports | Caja |
| costs.view, .add, .edit, .delete | Costos |
| reports.view, .generate, .export, .view_profits, .view_costs, .view_analytics | Reportes |
| dashboard.view, .view_all_branches | Dashboard |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/cash.js` | Sesiones y movimientos de caja. |
| `Sistema/js/costs.js` | CRUD cost_entries. |
| `Sistema/js/reports.js` | Tipos de reporte, filtros, export. |
| `Sistema/js/dashboard.js` | KPIs, top sellers, alertas. |
| `backend/routes/cash.js` | API caja. |
| `backend/routes/costs.js` | API costos; emitCostUpdate. |
| `backend/routes/reports.js` | API datos para reportes. |
| `backend/routes/dashboard.js` | API KPIs y resumen. |
