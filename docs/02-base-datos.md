# 02 - Base de datos

Resumen del esquema PostgreSQL, de IndexedDB en el frontend y de la relación entre ambos en la sincronización.

## PostgreSQL (backend)

Archivo: `backend/database/schema.sql`. Extensiones: `uuid-ossp`, `pg_trgm` (búsquedas de texto).

### Tablas por dominio

| Dominio | Tablas | Notas |
|---------|--------|--------|
| Configuración y catálogos | `branches`, `employees`, `users`, `catalog_agencies`, `catalog_guides`, `catalog_sellers` | users: permissions, permissions_by_branch (JSONB). employees: branch_id, branch_ids (UUID[]). |
| Clientes | `customers` | branch_id. Índice GIN en name (pg_trgm). |
| Inventario | `inventory_items`, `inventory_logs`, `inventory_transfers`, `inventory_transfer_items` | items: sku, barcode, branch_id, status, photos (TEXT[]), certificate_number, certificate_details (JSONB), stones (JSONB), measurements (JSONB). |
| Ventas | `sales`, `sale_items`, `payments` | sales: branch_id, seller_id, guide_id, agency_id, customer_id, folio, status. |
| Costos y caja | `cost_entries`, `cash_sessions`, `cash_movements` | Por branch_id y session_id. |
| Reparaciones | `repairs`, `repair_photos` | repairs: branch_id, customer_id, folio, status. |
| Reportes y analíticas | `daily_profit_reports`, `exchange_rates_daily`, `saved_reports`, `quick_captures`, `archived_quick_capture_reports`, `historical_quick_capture_reports` | daily_profit_reports y exchange por fecha/branch. |
| Llegadas y turismo | `arrival_rate_rules`, `agency_arrivals`, `tourist_reports`, `tourist_report_lines` | arrival_rate_rules: agency_id, branch_id, fee_type, flat_fee, rate_per_passenger. agency_arrivals: date, branch_id, agency_id, guide_id, passengers. |
| Proveedores | `suppliers`, `supplier_contacts`, `supplier_contracts`, `supplier_documents`, `purchase_orders`, `purchase_order_items`, `supplier_payments`, `payment_invoices`, `supplier_price_history`, `supplier_ratings`, `supplier_interactions` | suppliers: branch_id. Pagos y facturas/recibos vinculados. |
| Auditoría | `audit_logs` | Registro de acciones. |

### Índices relevantes

- Branches: active, code.
- Employees: barcode, branch_id, active, role.
- Users: username, employee_id, active.
- Inventory_items: sku, barcode, branch_id, status, category, name (GIN trgm).
- Sales: folio, branch_id, created_at, status, seller_id, agency_id, guide_id.
- Customers: branch_id, name (GIN trgm), email, phone.
- Repairs: folio, branch_id, status, customer_id.
- Cash_sessions: branch_id, user_id, date, status.
- Cost_entries: branch_id, date, type, category.
- Transfers: from_branch_id, to_branch_id, status.
- Tourist/agency: date, branch_id, agency_id, guide_id.

Las tablas de inventario, ventas, clientes, reparaciones, costos, caja y transferencias suelen filtrarse por `branch_id` en las consultas del backend.

## IndexedDB (frontend)

Archivo: `Sistema/js/db.js`. Base: `opal_pos_db`, versión 13.

### Object stores

Creados en `createStores(db, event)`; keyPath por defecto `id` salvo donde se indica.

| Store | keyPath | Índices típicos |
|-------|---------|-----------------|
| settings | key | — |
| device | id | — |
| audit_log | id (autoIncrement) | user_id, created_at |
| employees | id | barcode, branch_id |
| users | id | username, employee_id |
| catalog_agencies, catalog_guides, catalog_sellers | id | barcode, agency_id (guides) |
| catalog_branches, payment_methods | id | — |
| commission_rules | id | entity_type, entity_id |
| inventory_items | id | sku, barcode, branch_id, status |
| inventory_photos | id | item_id |
| inventory_logs | id | item_id, created_at |
| inventory_certificates | id | item_id, certificate_number |
| inventory_price_history | id | item_id, date |
| sales | id | folio, branch_id, seller_id, agency_id, guide_id, created_at, status, sync_status |
| sale_items | id | sale_id, item_id |
| payments | id | sale_id |
| customers | id | — |
| repairs | id | folio, status, sync_status |
| repair_photos | id | repair_id |
| cost_entries | id | branch_id, date, sync_status |
| sync_queue | id | entity_type, status, created_at |
| sync_logs | id | type, status, created_at |
| sync_deleted_items | id | entity_type, deleted_at |
| tourist_reports | id | date, branch_id, status, sync_status |
| tourist_report_lines | id | report_id, sale_id |
| cash_sessions | id | branch_id, user_id, date, status, created_at |
| cash_movements | id | session_id, type, created_at |
| barcode_scan_history | id | barcode, timestamp, context |
| barcode_print_templates | id | — |
| arrival_rate_rules | id | agency_id, branch_id, active_from, active_to |
| agency_arrivals | id | date, branch_id, agency_id |
| budget_entries | id | month, branch_id, year |
| daily_profit_reports | id | date, branch_id |
| exchange_rates_daily | id | date (unique), created_at |
| temp_quick_captures | id | date, branch_id, created_at (y en otro bloque seller_id, guide_id, agency_id) |
| inventory_transfers | id | from_branch_id, to_branch_id, status, created_at |
| inventory_transfer_items | id | transfer_id, item_id |
| qa_test_runs, qa_coverage, qa_errors, qa_fixes | id | run_id, module, etc. |
| archived_quick_captures | id | date, report_type, archived_at, archived_by |
| historical_reports | id | period_type, date_from, date_to, branch_id, created_at |
| suppliers | id | code, barcode, branch_id, status, supplier_type |
| supplier_payments | id | supplier_id, branch_id, status, reference_number, due_date |
| payment_invoices | id | supplier_payment_id, branch_id, receipt_number, payment_date, created_at |

### Operaciones

- `DB.init()`: abre la base y en `onupgradeneeded` llama a `createStores`.
- CRUD genérico: `DB.add(storeName, data)`, `DB.put(storeName, data)`, `DB.get(storeName, key)`, `DB.getAll(storeName)`, `DB.delete(storeName, key)`.
- Los módulos del frontend leen y escriben en estos stores para modo offline y para alimentar la cola de sincronización (`sync_queue`, `sync_logs`, `sync_deleted_items`).

## Relación entre PostgreSQL e IndexedDB

- **Fuente de verdad**: Después de una sincronización correcta, el backend (PostgreSQL) es la fuente de verdad. IndexedDB actúa como caché y soporte offline.
- **Sincronización**: El frontend mantiene una cola de cambios (`sync_queue`) y registros de borrados (`sync_deleted_items`). SyncManager sube pendientes y descarga datos del servidor; ver [10-sincronizacion.md](10-sincronizacion.md).
- **Datos maestros y transaccionales**: Tanto en PostgreSQL como en IndexedDB existen sucursales, empleados, usuarios, catálogos, inventario, ventas, clientes, reparaciones, costos, caja, transferencias, llegadas, proveedores y reportes. Los stores de sync (sync_queue, sync_logs, sync_deleted_items) solo existen en el frontend.
- **Campos de control**: Varias entidades en IndexedDB tienen `sync_status` (p. ej. sales, repairs, cost_entries, tourist_reports) para marcar si están sincronizadas con el servidor.
