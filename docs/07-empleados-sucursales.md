# 07 - Empleados, sucursales y catálogos

Empleados, usuarios vinculados, sucursales y catálogos maestros (agencias, guías, vendedores, sucursales para selector, métodos de pago, reglas de comisión). Frontend: employees.js, branches.js, branch_manager.js; configuración de catálogos en settings.js. Backend: routes/employees.js, branches.js, catalogs.js.

## Propósito

- **Empleados**: CRUD de empleados (código, nombre, email, teléfono, rol, branch_id, branch_ids); solo master_admin. Vinculación con usuarios (login): crear/editar/eliminar usuario por empleado; permisos y permissions_by_branch.
- **Sucursales**: CRUD de sucursales (código, nombre, dirección, teléfono, email, active); solo master_admin. Listado público para selector y filtros.
- **Branch manager**: Sucursal actual del usuario (currentBranchId, currentBranch, userBranches). init() carga sucursales del API, migra IDs legacy a UUID, establece sucursal por empleado o localStorage. setCurrentBranch(id), getCurrentBranchId(), updateBranchSelector() (botones en topbar). Dispara evento branch-changed.
- **Catálogos**: Agencias (catalog_agencies), guías (catalog_guides, agency_id), vendedores (catalog_sellers); métodos de pago y reglas de comisión según schema. Se gestionan desde Configuración > Catálogos o desde módulos que los usan (POS, llegadas).

## Frontend

- **employees.js**: init, pestañas (empleados / usuarios); listado por sucursal; crear/editar empleado; crear/editar usuario para un empleado (username, password/pin, role, permissions, permissions_by_branch). Permisos: employees.view, .add, .edit, .delete, .view_users, .create_users, .edit_users, .reset_pin.
- **branches.js**: init, listado y CRUD de sucursales (solo visible para admin/master). Permisos: branches.view, branches.manage.
- **branch_manager.js**: init(), setCurrentBranch(id), getCurrentBranchId(), updateBranchSelector(); usa API.getBranches() y DB catalog_branches; envía x-branch-id en peticiones (vía API o headers). No es un “módulo” de pantalla; lo usan App, UserManager y todos los módulos que filtran por sucursal.
- **settings.js**: Pestaña o sección “Catálogos”: gestión de agencias, guías, vendedores, sucursales (lectura/alta/edición según permisos), métodos de pago, reglas de comisión. Llama a API /api/catalogs/*.

## Backend

### employees.js (montado en /api/employees)

- GET /: lista empleados (todos para master_admin; filtro por branch si se implementa). No usa requireBranchAccess en GET; usa authenticateOptional vía server.
- POST /: requireMasterAdmin; crear empleado.
- PUT /:id: requireMasterAdmin; actualizar empleado.
- DELETE /:id: requireMasterAdmin; eliminar empleado.
- POST /:employeeId/user: requireMasterAdmin; crear usuario para empleado (username, password, role, permissions, permissions_by_branch).
- PUT /user/:userId: requireMasterAdmin; actualizar usuario (role, permissions, permissions_by_branch, active).
- DELETE /user/:userId: requireMasterAdmin; eliminar usuario.

### branches.js (montado en /api/branches)

- authenticateOptional en todas; setIO; emitBranchUpdate.
- GET /: lista sucursales (activas o todas según query).
- GET /:id: una sucursal.
- POST /: requireMasterAdmin; crear sucursal.
- PUT /:id: requireMasterAdmin; actualizar sucursal.
- DELETE /:id: requireMasterAdmin; eliminar o desactivar.

### catalogs.js (montado en /api/catalogs)

- GET /agencies, /agencies/:id, /agencies/barcode/:barcode; POST/PUT/DELETE /agencies (POST/PUT/DELETE requireMasterAdmin).
- GET /guides, /guides/:id, /guides/barcode/:barcode; POST/PUT/DELETE /guides (requireMasterAdmin para escritura).
- GET /sellers, /sellers/:id, /sellers/barcode/:barcode; POST/PUT/DELETE /sellers (requireMasterAdmin para escritura).
- Catálogos no filtran por branch_id; son globales (agencias, guías, vendedores compartidos).

## Modelo de datos

- **employees**: id, code, barcode, name, email, phone, role (employee, manager, admin, master_admin), branch_id, branch_ids (UUID[]), active.
- **users**: id, username, password_hash, employee_id, role, active, permissions (JSONB), permissions_by_branch (JSONB), last_login.
- **branches**: id, code, name, address, phone, email, active.
- **catalog_agencies**: id, code, name, barcode, active.
- **catalog_guides**: id, code, name, barcode, agency_id, active.
- **catalog_sellers**: id, code, name, barcode, active.

## Permisos

| Permiso | Uso |
|---------|-----|
| employees.view, .add, .edit, .delete | Empleados |
| employees.view_users, .create_users, .edit_users, .reset_pin | Usuarios y PIN |
| branches.view, .manage | Sucursales |
| (Catálogos se gestionan desde settings; master_admin para escritura en API) | Agencias, guías, vendedores |

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/employees.js` | CRUD empleados y usuarios, permisos por sucursal. |
| `Sistema/js/branches.js` | CRUD sucursales (módulo admin). |
| `Sistema/js/branch_manager.js` | Sucursal actual, selector, branch-changed. |
| `Sistema/js/settings.js` | UI de catálogos (agencias, guías, vendedores, etc.). |
| `backend/routes/employees.js` | API empleados y usuarios. |
| `backend/routes/branches.js` | API sucursales, emitBranchUpdate. |
| `backend/routes/catalogs.js` | API agencies, guides, sellers. |
