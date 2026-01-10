# 📋 Lista de Hojas que se Crean al Sincronizar

## 🎯 Hojas Principales (Siempre se crean cuando hay datos)

### Hojas que se crean automáticamente:

1. **SALES** - Ventas realizadas
2. **ITEMS** - Items/detalle de productos vendidos (se crea junto con SALES)
3. **PAYMENTS** - Pagos realizados (se crea junto con SALES)
4. **INVENTORY** - Catálogo de inventario/productos
5. **EMPLOYEES** - Empleados del sistema
6. **USERS** - Usuarios con acceso al sistema
7. **REPAIRS** - Reparaciones realizadas
8. **COSTS** - Costos fijos y variables
9. **CUSTOMERS** - Clientes
10. **INVENTORY_LOG** - Historial de movimientos de inventario
11. **AUDIT_LOG** - Log de auditoría del sistema
12. **TOURIST_DAILY_REPORTS** - Reportes diarios de ventas a turistas
13. **TOURIST_DAILY_LINES** - Líneas detalladas de reportes turistas
14. **ARRIVAL_RATE_RULES** - Tabulador de tarifas de llegadas por agencia
15. **AGENCY_ARRIVALS** - Registro de llegadas de pasajeros por agencia
16. **DAILY_PROFIT_REPORTS** - Reportes de utilidad diaria
17. **EXCHANGE_RATES_DAILY** - Tipos de cambio diarios (USD, CAD)
18. **INVENTORY_TRANSFERS** - Transferencias de inventario entre sucursales
19. **INVENTORY_TRANSFER_ITEMS** - Items incluidos en cada transferencia
20. **CATALOG_BRANCHES** - Catálogo de sucursales
21. **CATALOG_AGENCIES** - Catálogo de agencias
22. **CATALOG_SELLERS** - Catálogo de vendedores
23. **CATALOG_GUIDES** - Catálogo de guías

---

## 🌿 Hojas Separadas por Sucursal

**NOTA:** Las siguientes hojas se crean **SOLO** para entidades que tienen `branch_id`:
- Ventas (sales)
- Inventario (inventory_item)
- Transferencias (inventory_transfer)

### Formato de nombre:
`[HOJA_PRINCIPAL]_BRANCH_[ID_SUCURSAL]`

### Ejemplos (si tu sucursal se llama "test-branch"):

1. **SALES_BRANCH_test-branch** - Ventas de la sucursal "test-branch"
2. **ITEMS_BRANCH_test-branch** - Items vendidos en esa sucursal
3. **PAYMENTS_BRANCH_test-branch** - Pagos de esa sucursal
4. **INVENTORY_BRANCH_test-branch** - Inventario de esa sucursal
5. **INVENTORY_TRANSFERS_BRANCH_test-branch** - Transferencias desde esa sucursal
6. **INVENTORY_TRANSFER_ITEMS_BRANCH_test-branch** - Items de transferencias de esa sucursal

---

## ⚠️ IMPORTANTE

- **Las hojas se crean automáticamente** cuando sincronizas datos por primera vez
- **No necesitas crearlas manualmente** antes de sincronizar
- **Si una hoja ya existe**, el sistema la usa (no duplica)
- **Los headers se agregan automáticamente** cuando se crea la hoja
- **Las hojas por sucursal solo se crean** si tienes datos con `branch_id` diferente

---

## 📊 Resumen Total

- **23 hojas principales** (se crean cuando hay datos)
- **6 hojas por sucursal** × número de sucursales únicas
- **Total:** Depende de cuántas sucursales tengas y qué datos sincronices

---

## 🔍 ¿Qué hojas se crearán en mi caso?

Las hojas que se crearán dependen de:
1. **Qué datos tienes** en tu sistema POS
2. **Cuántas sucursales** diferentes tienen datos
3. **Qué tipos de entidades** has usado (ventas, inventario, etc.)

**Ejemplo:**
- Si tienes 2 sucursales con ventas e inventario:
  - Se crearán las 23 hojas principales
  - + 6 hojas × 2 sucursales = 12 hojas por sucursal
  - **Total: 35 hojas**

