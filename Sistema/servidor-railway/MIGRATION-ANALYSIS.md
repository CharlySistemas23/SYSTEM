# ANÁLISIS COMPLETO DEL SISTEMA POS - MIGRACIÓN A SERVIDOR CENTRALIZADO

## 📊 RESUMEN EJECUTIVO

Este documento analiza TODO el sistema POS módulo por módulo, función por función, para identificar qué necesita migrarse al servidor centralizado (Railway + PostgreSQL).

---

## 📋 TABLAS: IndexedDB vs PostgreSQL

### ✅ TABLAS QUE YA EXISTEN EN POSTGRESQL

| Tabla | IndexedDB | PostgreSQL | Estado |
|-------|-----------|------------|--------|
| `catalog_branches` | ✅ | ✅ | Completa |
| `users` | ✅ | ✅ | Completa |
| `employees` | ✅ | ✅ | Completa |
| `customers` | ✅ | ✅ | Completa |
| `catalog_sellers` | ✅ | ✅ | Completa |
| `catalog_guides` | ✅ | ✅ | Completa |
| `catalog_agencies` | ✅ | ✅ | Completa |
| `inventory_items` | ✅ | ✅ | Completa |
| `sales` | ✅ | ✅ | Completa |
| `sale_items` | ✅ | ✅ | Completa |
| `sale_payments` | ✅ | ✅ | Completa |
| `commission_rules` | ✅ | ✅ | Completa |
| `cost_entries` | ✅ | ✅ | Completa |
| `cash_sessions` | ✅ | ✅ | Completa |

### ❌ TABLAS QUE EXISTEN EN INDEXEDDB PERO FALTAN EN POSTGRESQL

| Tabla IndexedDB | ¿Qué guarda? | Prioridad | Tabla PostgreSQL necesaria |
|-----------------|--------------|-----------|---------------------------|
| `settings` | Configuraciones del sistema | 🔴 ALTA | `settings` |
| `device` | Info del dispositivo | 🟡 MEDIA | `devices` |
| `audit_log` | Log de auditoría | 🔴 ALTA | `audit_logs` |
| `payment_methods` | Métodos de pago configurados | 🔴 ALTA | `payment_methods` |
| `inventory_photos` | Fotos de productos (blobs) | 🔴 ALTA | `inventory_photos` |
| `inventory_logs` | Historial de cambios en inventario | 🟢 BAJA | `inventory_logs` |
| `inventory_certificates` | Certificados de joyería | 🟡 MEDIA | `inventory_certificates` |
| `inventory_price_history` | Historial de precios | 🟢 BAJA | `inventory_price_history` |
| `repairs` | Reparaciones de joyería | 🔴 ALTA | `repairs` |
| `repair_photos` | Fotos de reparaciones (blobs) | 🔴 ALTA | `repair_photos` |
| `sync_queue` | Cola de sincronización | 🟢 BAJA | **NO NECESARIA** (tiempo real) |
| `sync_logs` | Logs de sincronización | 🟢 BAJA | **NO NECESARIA** (tiempo real) |
| `sync_deleted_items` | Items eliminados para sync | 🟢 BAJA | **NO NECESARIA** (tiempo real) |
| `tourist_reports` | Reportes turísticos diarios | 🔴 ALTA | `tourist_reports` |
| `tourist_report_lines` | Líneas de reportes turísticos | 🔴 ALTA | `tourist_report_lines` |
| `cash_movements` | Movimientos de efectivo en caja | 🔴 ALTA | `cash_movements` |
| `barcode_scan_history` | Historial de escaneos | 🟡 MEDIA | `barcode_scan_history` |
| `barcode_print_templates` | Plantillas de impresión | 🟢 BAJA | `barcode_print_templates` |
| `arrival_rate_rules` | Reglas de tarifas de llegadas | 🔴 ALTA | `arrival_rate_rules` |
| `agency_arrivals` | Llegadas diarias de agencias | 🔴 ALTA | `agency_arrivals` |
| `budget_entries` | Presupuestos mensuales | 🟡 MEDIA | `budget_entries` |
| `daily_profit_reports` | Reportes de utilidad diaria | 🟡 MEDIA | `daily_profit_reports` |
| `exchange_rates_daily` | Tipos de cambio por fecha | 🔴 ALTA | `exchange_rates_daily` |
| `inventory_transfers` | Transferencias entre tiendas | 🔴 ALTA | `inventory_transfers` |
| `inventory_transfer_items` | Items de transferencias | 🔴 ALTA | `inventory_transfer_items` |
| `qa_test_runs` | Ejecuciones de QA | 🟢 BAJA | **NO NECESARIA** (desarrollo) |
| `qa_coverage` | Cobertura de QA | 🟢 BAJA | **NO NECESARIA** (desarrollo) |
| `qa_errors` | Errores de QA | 🟢 BAJA | **NO NECESARIA** (desarrollo) |
| `qa_fixes` | Fixes de QA | 🟢 BAJA | **NO NECESARIA** (desarrollo) |

---

## 🗂️ MÓDULOS DEL FRONTEND - ANÁLISIS COMPLETO

### 1. 🔐 AUTENTICACIÓN (`users.js`, `auth.js`)

**Estado:** ✅ **COMPLETO** (Backend + Frontend)

**Funciones:**
- ✅ Login por username/password
- ✅ Login por código de barras de empleado
- ✅ Gestión de sesiones JWT
- ✅ Cambio de PIN
- ✅ Gestión de usuarios (CRUD)

**Rutas Backend:**
- ✅ `/api/auth/login` - Login
- ✅ `/api/auth/login/barcode` - Login por barcode
- ✅ `/api/auth/me` - Obtener usuario actual
- ✅ `/api/auth/refresh` - Refrescar token

**Tablas:**
- ✅ `users`
- ✅ `employees`

**No necesita cambios.**

---

### 2. 🛒 POS / VENTAS (`pos.js`, `sales.js`)

**Estado:** ✅ **COMPLETO** (Backend + Frontend)

**Funciones:**
- ✅ Crear venta
- ✅ Agregar productos al carrito
- ✅ Aplicar descuentos
- ✅ Múltiples métodos de pago
- ✅ Cálculo de comisiones (seller, guide)
- ✅ Generación de folio
- ✅ Impresión de ticket
- ✅ Vista rápida de productos
- ✅ Búsqueda de productos

**Rutas Backend:**
- ✅ `GET /api/sales` - Listar ventas
- ✅ `POST /api/sales` - Crear venta
- ✅ `GET /api/sales/:id` - Obtener venta
- ✅ `PUT /api/sales/:id` - Actualizar venta
- ✅ `DELETE /api/sales/:id` - Eliminar venta

**Tablas:**
- ✅ `sales`
- ✅ `sale_items`
- ✅ `sale_payments`

**Funciones adicionales que usan:**
- `ExchangeRates.getExchangeRate()` - Tipo de cambio
- `ArrivalRules.calculateArrivalFee()` - Tarifa de llegadas
- `CommissionRules` - Cálculo de comisiones

**No necesita cambios principales.**
**⚠️ Depende de:**
- Exchange Rates (faltante)
- Arrival Rules (faltante)

---

### 3. 📦 INVENTARIO (`inventory.js`)

**Estado:** ✅ **PARCIAL** (Backend existe, faltan funciones)

**Funciones implementadas:**
- ✅ Crear/editar/eliminar productos
- ✅ Búsqueda y filtros
- ✅ Vista grid y lista
- ✅ Importar/Exportar Excel
- ✅ Gestión de stock
- ✅ Fotos de productos (local)
- ✅ Certificados de joyería (local)
- ✅ Historial de precios (local)

**Rutas Backend:**
- ✅ `GET /api/inventory` - Listar productos
- ✅ `POST /api/inventory` - Crear producto
- ✅ `GET /api/inventory/:id` - Obtener producto
- ✅ `PUT /api/inventory/:id` - Actualizar producto
- ✅ `DELETE /api/inventory/:id` - Eliminar producto

**Tablas PostgreSQL:**
- ✅ `inventory_items` - Existe

**Tablas faltantes:**
- ❌ `inventory_photos` - Fotos de productos
- ❌ `inventory_certificates` - Certificados
- ❌ `inventory_price_history` - Historial de precios
- ❌ `inventory_logs` - Logs de cambios

**Rutas faltantes:**
- ❌ `POST /api/inventory/:id/photos` - Subir fotos
- ❌ `GET /api/inventory/:id/photos` - Obtener fotos
- ❌ `DELETE /api/inventory/photos/:id` - Eliminar foto
- ❌ `POST /api/inventory/:id/certificates` - Agregar certificado
- ❌ `GET /api/inventory/:id/certificates` - Obtener certificados

**⚠️ NECESITA:**
1. Tablas para fotos, certificados, logs
2. Integración Cloudinary para fotos
3. Endpoints para gestión de fotos/certificados

---

### 4. 💰 CAJA (`cash.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Abrir sesión de caja
- ✅ Cerrar sesión de caja
- ✅ Movimientos de efectivo (ingreso/egreso)
- ✅ Arqueo parcial
- ✅ Conciliación con ventas POS
- ✅ Historial de sesiones
- ✅ Estadísticas del día
- ✅ Generar reporte PDF

**Rutas Backend:**
- ❌ `GET /api/cash/sessions` - Listar sesiones
- ❌ `POST /api/cash/sessions` - Abrir sesión
- ❌ `PUT /api/cash/sessions/:id/close` - Cerrar sesión
- ❌ `GET /api/cash/sessions/:id` - Obtener sesión
- ❌ `POST /api/cash/movements` - Crear movimiento
- ❌ `GET /api/cash/sessions/:id/movements` - Movimientos de sesión
- ❌ `GET /api/cash/sessions/:id/reconcile` - Conciliación con ventas

**Tablas PostgreSQL:**
- ✅ `cash_sessions` - Existe
- ❌ `cash_movements` - **FALTA**

**⚠️ NECESITA:**
1. Crear tabla `cash_movements`
2. Crear ruta `/api/cash`
3. Implementar todos los endpoints

---

### 5. 💵 COSTOS (`costs.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Crear/editar/eliminar costos
- ✅ Filtrar por tipo, categoría, fecha, sucursal
- ✅ Costos recurrentes
- ✅ Presupuestos mensuales
- ✅ Reportes de costos
- ✅ Exportar Excel

**Rutas Backend:**
- ❌ `GET /api/costs` - Listar costos
- ❌ `POST /api/costs` - Crear costo
- ❌ `PUT /api/costs/:id` - Actualizar costo
- ❌ `DELETE /api/costs/:id` - Eliminar costo
- ❌ `GET /api/costs/recurring` - Costos recurrentes
- ❌ `GET /api/costs/budgets` - Presupuestos

**Tablas PostgreSQL:**
- ✅ `cost_entries` - Existe
- ❌ `budget_entries` - **FALTA**

**⚠️ NECESITA:**
1. Crear tabla `budget_entries`
2. Crear ruta `/api/costs`
3. Implementar todos los endpoints

---

### 6. 🔧 REPARACIONES (`repairs.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Crear/editar/eliminar reparación
- ✅ Estados: pendiente, en_proceso, completada, entregada
- ✅ Fotos de reparaciones (local)
- ✅ Generar folio
- ✅ Filtrar por estado
- ✅ Exportar Excel

**Rutas Backend:**
- ❌ `GET /api/repairs` - Listar reparaciones
- ❌ `POST /api/repairs` - Crear reparación
- ❌ `GET /api/repairs/:id` - Obtener reparación
- ❌ `PUT /api/repairs/:id` - Actualizar reparación
- ❌ `DELETE /api/repairs/:id` - Eliminar reparación
- ❌ `POST /api/repairs/:id/photos` - Subir fotos
- ❌ `GET /api/repairs/:id/photos` - Obtener fotos

**Tablas PostgreSQL:**
- ❌ `repairs` - **FALTA**
- ❌ `repair_photos` - **FALTA**

**⚠️ NECESITA:**
1. Crear tablas `repairs` y `repair_photos`
2. Crear ruta `/api/repairs`
3. Integración Cloudinary para fotos

---

### 7. 🔄 TRANSFERENCIAS (`transfers.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Crear transferencia entre tiendas
- ✅ Agregar múltiples productos
- ✅ Estados: pending, in_transit, completed, cancelled
- ✅ Confirmar recepción
- ✅ Filtrar por origen, destino, estado, fecha
- ✅ Exportar Excel

**Rutas Backend:**
- ❌ `GET /api/transfers` - Listar transferencias
- ❌ `POST /api/transfers` - Crear transferencia
- ❌ `GET /api/transfers/:id` - Obtener transferencia
- ❌ `PUT /api/transfers/:id/confirm` - Confirmar recepción
- ❌ `PUT /api/transfers/:id/cancel` - Cancelar transferencia
- ❌ `POST /api/transfers/:id/items` - Agregar items

**Tablas PostgreSQL:**
- ❌ `inventory_transfers` - **FALTA**
- ❌ `inventory_transfer_items` - **FALTA**

**⚠️ NECESITA:**
1. Crear tablas `inventory_transfers` y `inventory_transfer_items`
2. Crear ruta `/api/transfers`
3. Implementar lógica de transferencia de stock

---

### 8. 📊 DASHBOARD (`dashboard.js`)

**Estado:** ⚠️ **PARCIAL** (Consultas manuales, falta endpoints optimizados)

**Funciones implementadas:**
- ✅ KPIs: Ventas del día, tickets, promedio, tasa de cierre
- ✅ Top vendedores
- ✅ Gráficos de ventas
- ✅ Alertas: productos sin foto, stock bajo
- ✅ Vista consolidada (todas las sucursales)
- ✅ Vista por sucursal individual

**Rutas Backend:**
- ✅ `GET /api/reports/kpis` - KPIs básicos (existe)
- ❌ `GET /api/reports/dashboard` - Dashboard completo (falta)
- ❌ `GET /api/reports/top-sellers` - Top vendedores (falta)
- ❌ `GET /api/reports/alerts` - Alertas (falta)

**Tablas:**
- ✅ Usa múltiples tablas existentes

**⚠️ NECESITA:**
1. Endpoints optimizados para dashboard
2. Consultas agregadas (SUM, COUNT, AVG)
3. Caché de KPIs

---

### 9. 📈 REPORTES (`reports.js`)

**Estado:** ⚠️ **PARCIAL**

**Funciones implementadas:**
- ✅ Reporte de ventas
- ✅ Reporte de inventario
- ✅ Reporte de costos
- ✅ Reporte de utilidad
- ✅ Filtros por fecha, sucursal
- ✅ Exportar Excel/PDF

**Rutas Backend:**
- ✅ `GET /api/reports/sales` - Existe parcialmente
- ❌ `GET /api/reports/profit` - Utilidad (falta)
- ❌ `GET /api/reports/inventory` - Inventario (falta)

**⚠️ NECESITA:**
1. Endpoints de reportes optimizados
2. Agregaciones complejas

---

### 10. 💱 TIPOS DE CAMBIO (`exchange_rates.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Guardar tipo de cambio por fecha (USD, CAD)
- ✅ Obtener tipo de cambio para fecha específica
- ✅ Fallback a settings si no existe fecha
- ✅ Usado por módulo POS

**Rutas Backend:**
- ❌ `GET /api/exchange-rates` - Listar tipos de cambio
- ❌ `GET /api/exchange-rates/:date` - Tipo de cambio para fecha
- ❌ `POST /api/exchange-rates` - Guardar tipo de cambio
- ❌ `PUT /api/exchange-rates/:id` - Actualizar

**Tablas PostgreSQL:**
- ❌ `exchange_rates_daily` - **FALTA**

**⚠️ NECESITA:**
1. Crear tabla `exchange_rates_daily`
2. Crear ruta `/api/exchange-rates`
3. Integrar con módulo POS

---

### 11. 🚌 REGLAS DE LLEGADAS (`arrival_rules.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Crear regla de tarifa por pasajeros
- ✅ Calcular tarifa según agencia, pasajeros, tipo de unidad
- ✅ Validar vigencia de reglas (active_from, active_until)
- ✅ Usado por módulo POS para calcular costos de llegadas

**Rutas Backend:**
- ❌ `GET /api/arrival-rules` - Listar reglas
- ❌ `POST /api/arrival-rules` - Crear regla
- ❌ `PUT /api/arrival-rules/:id` - Actualizar regla
- ❌ `DELETE /api/arrival-rules/:id` - Eliminar regla
- ❌ `POST /api/arrival-rules/calculate` - Calcular tarifa

**Tablas PostgreSQL:**
- ❌ `arrival_rate_rules` - **FALTA**
- ❌ `agency_arrivals` - **FALTA** (llegadas diarias)

**⚠️ NECESITA:**
1. Crear tablas `arrival_rate_rules` y `agency_arrivals`
2. Crear ruta `/api/arrival-rules`
3. Implementar lógica de cálculo

---

### 12. 📋 REPORTE TURISTA (`tourist_report.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Crear reporte turístico diario
- ✅ Agregar líneas de ventas al reporte
- ✅ Calcular totales y comisiones
- ✅ Cerrar reporte
- ✅ Exportar Excel
- ✅ Estadísticas de reportes

**Rutas Backend:**
- ❌ `GET /api/tourist-reports` - Listar reportes
- ❌ `POST /api/tourist-reports` - Crear reporte
- ❌ `GET /api/tourist-reports/:id` - Obtener reporte
- ❌ `PUT /api/tourist-reports/:id` - Actualizar reporte
- ❌ `POST /api/tourist-reports/:id/lines` - Agregar línea
- ❌ `PUT /api/tourist-reports/:id/close` - Cerrar reporte

**Tablas PostgreSQL:**
- ❌ `tourist_reports` - **FALTA**
- ❌ `tourist_report_lines` - **FALTA**

**⚠️ NECESITA:**
1. Crear tablas `tourist_reports` y `tourist_report_lines`
2. Crear ruta `/api/tourist-reports`
3. Implementar lógica de reportes

---

### 13. 💎 UTILIDAD (`profit.js`)

**Estado:** ⚠️ **PARCIAL** (Cálculos locales, falta backend)

**Funciones implementadas:**
- ✅ Calcular utilidad diaria
- ✅ Calcular utilidad mensual
- ✅ Revenue (ventas)
- ✅ COGS (costo de productos vendidos)
- ✅ Comisiones
- ✅ Costos operativos
- ✅ Utilidad neta

**Rutas Backend:**
- ❌ `GET /api/profit/daily/:date` - Utilidad diaria
- ❌ `GET /api/profit/monthly/:year/:month` - Utilidad mensual
- ❌ `POST /api/profit/recalculate` - Recalcular

**Tablas PostgreSQL:**
- ✅ Usa `sales`, `sale_items`, `cost_entries`
- ❌ `daily_profit_reports` - **FALTA** (caché de cálculos)

**⚠️ NECESITA:**
1. Crear tabla `daily_profit_reports` (opcional, para caché)
2. Crear ruta `/api/profit`
3. Endpoints optimizados con agregaciones

---

### 14. 📱 CÓDIGOS DE BARRAS (`barcodes.js`)

**Estado:** ✅ **FUNCIONAL** (No necesita backend, es cliente)

**Funciones:**
- ✅ Generar códigos de barras
- ✅ Escanear códigos de barras
- ✅ Historial de escaneos (local)
- ✅ Plantillas de impresión (local)

**Tablas:**
- 🟢 `barcode_scan_history` - Solo para analytics local
- 🟢 `barcode_print_templates` - Solo configuración local

**No necesita migración crítica.**
**Opcional:** Guardar historial en servidor para analytics.

---

### 15. ⚙️ CONFIGURACIÓN (`settings.js`, `app.js`)

**Estado:** ❌ **FALTA BACKEND**

**Funciones implementadas:**
- ✅ Configuración general (nombre empresa, etc.)
- ✅ Métodos de pago configurados
- ✅ Reglas de comisión
- ✅ Configuración de sucursales
- ✅ Configuración de tipos de cambio (fallback)
- ✅ Importar/Exportar datos

**Rutas Backend:**
- ❌ `GET /api/settings` - Obtener configuración
- ❌ `PUT /api/settings` - Actualizar configuración
- ❌ `GET /api/settings/payment-methods` - Métodos de pago
- ❌ `POST /api/settings/payment-methods` - Crear método
- ❌ `GET /api/settings/commissions` - Reglas de comisión
- ❌ `POST /api/settings/commissions` - Crear regla

**Tablas PostgreSQL:**
- ❌ `settings` - **FALTA**
- ❌ `payment_methods` - **FALTA**
- ✅ `commission_rules` - Existe

**⚠️ NECESITA:**
1. Crear tablas `settings` y `payment_methods`
2. Crear ruta `/api/settings`
3. Endpoints de configuración

---

### 16. 🔍 QA / AUTOPRUEBAS (`qa.js`)

**Estado:** ✅ **NO NECESITA BACKEND** (Solo desarrollo)

**Funciones:**
- ✅ Ejecutar pruebas automáticas
- ✅ Detectar errores
- ✅ Auto-fixes
- ✅ Cobertura de pruebas

**Tablas IndexedDB:**
- `qa_test_runs`, `qa_coverage`, `qa_errors`, `qa_fixes`

**No necesita migración.**
**Son tablas de desarrollo/testing local.**

---

### 17. 🔄 SINCRONIZACIÓN (`sync.js`)

**Estado:** ✅ **OBSOLETO** (Ya no se necesita, es tiempo real)

**Funciones:**
- Sincronización con Google Sheets (obsoleto)
- Cola de sincronización (obsoleto)
- Logs de sincronización (obsoleto)

**Tablas IndexedDB:**
- `sync_queue`, `sync_logs`, `sync_deleted_items`

**⚠️ NO MIGRAR - ELIMINAR**
El sistema ahora es tiempo real con Socket.io, no necesita sincronización.

---

### 18. 🖨️ IMPRESIÓN (`printer.js`)

**Estado:** ✅ **NO NECESITA BACKEND** (Cliente)

**Funciones:**
- ✅ Impresión de tickets
- ✅ Impresión de etiquetas
- ✅ Impresión de reportes

**No necesita backend.**

---

### 19. 📤 BACKUP (`backup.js`)

**Estado:** ✅ **NO NECESITA BACKEND** (Exportación local)

**Funciones:**
- ✅ Exportar datos a Excel/JSON
- ✅ Importar datos

**No necesita backend.**
**Opcional:** Endpoint para backup del servidor.

---

### 20. 📱 AUDITORÍA (`system_auditor.js`)

**Estado:** ⚠️ **OPCIONAL**

**Funciones:**
- ✅ Log de acciones del sistema
- ✅ Detección de inconsistencias

**Tablas IndexedDB:**
- `audit_log`

**⚠️ OPCIONAL:**
- Crear tabla `audit_logs` en PostgreSQL para auditoría centralizada

---

## 📦 DEPENDENCIAS ENTRE MÓDULOS

```
POS (Ventas)
  ├── Exchange Rates (tipos de cambio) ❌ FALTA
  ├── Arrival Rules (tarifas llegadas) ❌ FALTA
  ├── Commission Rules ✅ Existe
  └── Inventory ✅ Existe

Inventory
  ├── Inventory Photos ❌ FALTA
  ├── Inventory Certificates ❌ FALTA
  └── Inventory Logs (opcional)

Cash
  └── Cash Movements ❌ FALTA

Repairs
  └── Repair Photos ❌ FALTA

Transfers
  └── Transfer Items ❌ FALTA

Dashboard
  ├── Sales ✅ Existe
  ├── Inventory ✅ Existe
  ├── Costs ✅ Existe
  └── Profit Reports (opcional)
```

---

## 🎯 PRIORIZACIÓN DE MIGRACIÓN

### 🔴 PRIORIDAD CRÍTICA (Bloquea funcionalidad principal)

1. **Caja (Cash)**
   - Tabla: `cash_movements`
   - Ruta: `/api/cash`

2. **Tipos de Cambio (Exchange Rates)**
   - Tabla: `exchange_rates_daily`
   - Ruta: `/api/exchange-rates`
   - **Dependencia:** POS no funciona bien sin esto

3. **Reglas de Llegadas (Arrival Rules)**
   - Tablas: `arrival_rate_rules`, `agency_arrivals`
   - Ruta: `/api/arrival-rules`
   - **Dependencia:** POS usa esto para calcular costos

4. **Configuración (Settings)**
   - Tablas: `settings`, `payment_methods`
   - Ruta: `/api/settings`

### 🟡 PRIORIDAD ALTA (Funcionalidad importante)

5. **Reparaciones**
   - Tablas: `repairs`, `repair_photos`
   - Ruta: `/api/repairs`

6. **Transferencias**
   - Tablas: `inventory_transfers`, `inventory_transfer_items`
   - Ruta: `/api/transfers`

7. **Costos (mejorar)**
   - Tabla: `budget_entries`
   - Mejorar ruta `/api/costs`

8. **Inventario (fotos/certificados)**
   - Tablas: `inventory_photos`, `inventory_certificates`
   - Integración Cloudinary

### 🟢 PRIORIDAD MEDIA (Mejoras)

9. **Reporte Turista**
   - Tablas: `tourist_reports`, `tourist_report_lines`
   - Ruta: `/api/tourist-reports`

10. **Dashboard optimizado**
    - Endpoints agregados
    - Caché de KPIs

11. **Utilidad (Profit)**
    - Tabla: `daily_profit_reports` (opcional)
    - Endpoints optimizados

### 🔵 PRIORIDAD BAJA (Nice to have)

12. **Auditoría centralizada**
    - Tabla: `audit_logs`

13. **Historial de precios**
    - Tabla: `inventory_price_history`

14. **Logs de inventario**
    - Tabla: `inventory_logs`

15. **Analytics de códigos de barras**
    - Tabla: `barcode_scan_history` (opcional)

---

## 📝 RESUMEN DE TABLAS FALTANTES

### Tablas críticas (deben crearse):
1. `settings`
2. `payment_methods`
3. `cash_movements`
4. `exchange_rates_daily`
5. `arrival_rate_rules`
6. `agency_arrivals`
7. `repairs`
8. `repair_photos`
9. `inventory_transfers`
10. `inventory_transfer_items`
11. `inventory_photos`
12. `tourist_reports`
13. `tourist_report_lines`
14. `inventory_certificates`

### Tablas opcionales (mejoras):
15. `budget_entries`
16. `daily_profit_reports`
17. `audit_logs`
18. `inventory_price_history`
19. `inventory_logs`
20. `barcode_scan_history`

### Tablas que NO se migran (obsoletas o desarrollo):
- `sync_queue` (obsoleto - tiempo real)
- `sync_logs` (obsoleto - tiempo real)
- `sync_deleted_items` (obsoleto - tiempo real)
- `qa_test_runs` (desarrollo)
- `qa_coverage` (desarrollo)
- `qa_errors` (desarrollo)
- `qa_fixes` (desarrollo)
- `device` (local, opcional)

---

## 🚀 PLAN DE ACCIÓN RECOMENDADO

### FASE 1: Críticas (Semana 1-2)
1. Crear tablas críticas en `schema.sql`
2. Crear rutas: `/api/cash`, `/api/exchange-rates`, `/api/arrival-rules`, `/api/settings`
3. Actualizar frontend para usar nuevas rutas

### FASE 2: Altas (Semana 3-4)
4. Crear rutas: `/api/repairs`, `/api/transfers`
5. Mejorar `/api/costs` con `budget_entries`
6. Integrar Cloudinary para fotos

### FASE 3: Mejoras (Semana 5-6)
7. Crear ruta: `/api/tourist-reports`
8. Optimizar dashboard con endpoints agregados
9. Crear ruta: `/api/profit`

### FASE 4: Opcionales (Semana 7+)
10. Auditoría centralizada
11. Historiales y logs
12. Analytics avanzados

---

## ✅ CONCLUSIÓN

**Total de tablas a crear:** 14 críticas + 6 opcionales = 20 tablas

**Total de rutas a crear:** 10 nuevas rutas + mejoras a existentes

**Tiempo estimado:** 6-8 semanas para migración completa

**Estado actual:** ~70% del sistema migrado
**Estado objetivo:** 100% del sistema centralizado

