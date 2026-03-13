# 12 - Frontend core

Punto de entrada de la aplicación, carga de módulos, UI de navegación y dependencias entre app.js, ui.js, index.html, PermissionManager, BranchManager y Users.

## app.js

Archivo: `Sistema/js/app.js`.

- **Objeto App**: loadingModule, moduleLoadAbort, COMPANY_ACCESS_CODE ('OPAL2024').
- **init()**: evita doble inicialización. Inicializa en orden: código de empresa (initCompanyCodeAccess), DB.init(), API.init(), UI.init(), BarcodeManager, SyncManager.init(), UserManager.init(). En producción oculta el enlace de bypass de login.
- **initCompanyCodeAccess()**: pantalla de código de acceso (company-code-screen). Si ya hay sesión no muestra pantallas de login. Si el código está validado (localStorage company_code_validated), muestra directamente login-screen.
- **validateCompanyCode()**: compara con COMPANY_ACCESS_CODE; si coincide muestra login y opcionalmente guarda hash en localStorage (recordar código).
- **loadModule(moduleName)**: switch por nombre de módulo. Cancela carga anterior si existe (abortController). Para cada módulo comprueba si el objeto global correspondiente existe (Dashboard, POS, Inventory, Transfers, BarcodesModule, Repairs, Reports, Costs, Suppliers, Customers, Employees, Catalogs, Branches, Settings, Sync, Cash, QA, TouristReport) y llama a init() o a métodos de recarga (loadDashboard, loadProducts, loadInventory, loadTransfers, loadTab, loadRepairs, etc.). Algunos módulos (inventory, tourist-report, barcodes, repairs, reports, etc.) reconfiguran el DOM si el contenido está vacío o con "Cargando módulo". Si el módulo no está definido, muestra mensaje de error en el contenedor.
- **Módulos soportados en loadModule**: dashboard, pos, inventory, tourist-report, transfers, barcodes, repairs, reports, costs, suppliers, customers, employees, catalogs, branches, settings, sync, cash, qa.
- **Navegación**: al cargar la app se restaura el módulo guardado (localStorage current_module, current_subpage, current_subcategory) si el estado es válido; se llama a UI.showModule y App.loadModule.
- **Búsqueda global**: el input #global-search dispara búsqueda que puede redirigir a inventario, clientes, proveedores o ventas (loadModule correspondiente).
- **Logout**: limpia sesión (UserManager), token, current_user, oculta módulos y muestra login; SyncManager puede detenerse.

Los scripts de cada módulo se cargan en index.html (script tags); muchos exponen un objeto global (Inventory, POS, etc.) que App.loadModule utiliza.

## ui.js

Archivo: `Sistema/js/ui.js`.

- **init()**: setupNavigation(), setupModals(), setupGlobalSearch().
- **setupNavigation()**: clic en .nav-item lee data-module, hace showModule(module) y después App.loadModule(module) con debounce 50ms. Las secciones del sidebar están siempre expandidas (sin colapso).
- **filterMenuByPermissions()**: recorre .nav-item y comprueba PermissionManager.hasPermission(permiso asociado al módulo). Oculta o muestra items; también considera nav-admin-only (solo admin/master_admin ven Branches y QA).
- **showModule(moduleName, subPage, subCategory)**:
  - Guarda en localStorage: current_module, current_subpage, current_subcategory, navigation_timestamp.
  - Mapeo moduleToSection (dashboard/pos/cash/barcodes -> operaciones; inventory/transfers -> inventario; customers/repairs/tourist-report -> clientes; employees/catalogs -> administracion; reports/costs -> analisis; sync/settings/qa -> sistema).
  - Oculta todos los .module y el placeholder; muestra el elemento #module-{moduleName} si existe. Si no existe (módulos dinámicos), muestra #module-placeholder con #module-title y #module-content; opcionalmente limpia content si está vacío o solo "Cargando módulo" y no tiene elementos específicos del módulo (customers-list, repairs-list, etc.). Dispara el evento 'module-loaded' con detail.module.
  - Actualiza la clase .active en .nav-item según moduleName.
- **getModuleTitle(moduleName)**: títulos por módulo para el placeholder.
- **updateUserInfo(user)**: actualiza #current-user en el topbar.
- **updateBranchInfo(branch)**: actualiza #current-branch; puede mostrar botones de cambio de sucursal (BranchManager).
- **updateAdminNavigation(isAdmin)**: muestra u oculta elementos nav-admin-only.
- Modales y notificaciones: setupModals(), y utilidades para mostrar mensajes/alertas.

## index.html

Archivo: `Sistema/index.html`.

- **Estructura**: topbar, main-container (sidebar + content-area).
- **Topbar**: logo, #current-branch, #branch-buttons-container, #current-user, #global-search, #topbar-sync-status, botón sincronizar, botón logout.
- **Sidebar**: nav-section con data-section (operaciones, inventario, clientes, administracion, analisis, sistema). Cada sección tiene nav-section-header y nav-section-items con enlaces .nav-item y data-module. Módulos: dashboard, pos, cash, barcodes, inventory, transfers, customers, repairs, tourist-report, employees, catalogs, branches (nav-admin-only), suppliers, reports, costs, sync, settings, qa (nav-admin-only, oculto por defecto).
- **Content area**: company-code-screen, login-screen, después módulos con id module-{nombre}. Algunos módulos tienen contenedor fijo en el HTML (p. ej. module-dashboard, module-barcodes); otros usan el placeholder: module-placeholder con module-title y module-content, y el contenido lo inyecta el JS del módulo (customers, repairs, employees, catalogs, reports, costs, settings, sync, tourist-report, cash, etc.).
- **Scripts**: se cargan en orden (utils, db, api, permission_manager, branch_manager, sync_manager, sync_ui, users, ui, y luego módulos: dashboard, pos, inventory, transfers, barcodes, repairs, reports, costs, customers, employees, branches, suppliers, settings, cash, tourist_report, arrival_rules, etc., y finalmente app.js).

## Dependencias entre core

- **DB**: se inicializa primero en App.init(); lo usan API (settings para baseURL), SyncManager (sync_queue, sync_logs, stores de datos), UserManager (users, employees), y todos los módulos para lectura/escritura local.
- **API**: init() después de DB; usa settings.api_url y localStorage api_token. SyncManager y los módulos llaman a API.get/post/put/delete.
- **SyncManager**: init() después de API; usa API y DB para sincronización; Sync UI actualiza el indicador en el topbar.
- **PermissionManager**: no tiene init; usa UserManager.currentUser y BranchManager.getCurrentBranchId() en hasPermission. UI.filterMenuByPermissions() y los módulos llaman a hasPermission.
- **BranchManager**: init() desde UserManager tras login/restore; proporciona getCurrentBranchId() y setCurrentBranch(); actualiza el selector en el topbar y envía x-branch-id en las peticiones (vía api.js o directamente).
- **UserManager**: init() restaura sesión (token verify o localStorage); actualiza currentUser y currentEmployee, llama a PermissionManager.ensureUserPermissions, BranchManager.init, UI.updateUserInfo, UI.updateBranchInfo, UI.updateAdminNavigation, UI.filterMenuByPermissions.
- **UI**: init() configura navegación; showModule y filterMenuByPermissions se llaman desde App y UserManager. Los módulos no llaman a showModule salvo para redirección (p. ej. tras guardar ir a otro módulo).

Flujo típico al hacer clic en un ítem del menú: UI.setupNavigation captura el clic -> UI.showModule(moduleName) -> se muestra el contenedor o placeholder -> App.loadModule(moduleName) carga datos e inicializa el módulo (cada módulo define su propia UI dentro de su contenedor).

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `Sistema/js/app.js` | init (DB, API, UI, SyncManager, UserManager), loadModule (switch por módulo), código de empresa, búsqueda global, logout. |
| `Sistema/js/ui.js` | setupNavigation, showModule, filterMenuByPermissions, updateUserInfo, updateBranchInfo, updateAdminNavigation, modales. |
| `Sistema/index.html` | Topbar, sidebar (data-module), content-area (login, módulos estáticos, placeholder), carga de scripts. |
