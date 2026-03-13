# 13 - Persistencia y Carga Rápida (Cache-First)

Plan para que el sistema muestre datos al instante al abrir sesión, sin esperar 1-2 minutos por la API. Los datos permanecen en IndexedDB entre sesiones y se actualizan en segundo plano.

---

## 1. Objetivos

| Objetivo | Descripción |
|----------|-------------|
| **Carga inmediata** | Al abrir inventario, empleados, POS, etc., ver datos en <1 segundo desde IndexedDB |
| **Persistencia** | IndexedDB ya persiste entre cierre de pestaña/sesión; no borrar al cerrar |
| **Sin re-inicialización** | Evitar que el sistema "reinicie" o espere sync completo para funcionar |
| **Actualización en background** | Sincronizar con API en segundo plano; actualizar UI cuando termine |
| **Cobertura global** | Aplicar el patrón a inventario, empleados, POS, proveedores, clientes, etc. |

---

## 2. Patrón: Cache-First + Stale-While-Revalidate

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Usuario abre módulo (Inventario, Empleados, etc.)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PASO 1 (inmediato, ~50-200ms):                                          │
│  Cargar desde IndexedDB → Mostrar en pantalla                            │
│  Si hay datos en caché: UI lista al instante                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PASO 2 (background, no bloquea):                                        │
│  Si API disponible → Fetch desde servidor                                │
│  Cuando responda: Merge con IndexedDB, actualizar UI si cambió algo      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Beneficios:**
- Usuario ve datos inmediatamente (aunque sean de la última sync)
- Filtros funcionan al instante sobre datos locales
- Al conectar, datos se actualizan sin bloquear

---

## 3. Módulos a Adaptar

| Módulo | Store IndexedDB | API | Prioridad |
|--------|-----------------|-----|-----------|
| **Inventario** | `inventory_items` | `getInventoryItems` | Alta |
| **Empleados** | `employees` | `getEmployees` | Alta |
| **POS** | `inventory_items` (disponibles) | `getInventoryItems` | Alta |
| **Proveedores** | `suppliers` | `getSuppliers` | Media |
| **Clientes** | `customers` | `getCustomers` | Media |
| **Sucursales** | `catalog_branches` | `getBranches` | Alta |
| **Vendedores/Guías/Agencias** | `catalog_sellers`, `catalog_guides`, `catalog_agencies` | `getSellers`, `getGuides`, `getAgencies` | Media |
| **Reparaciones** | `repairs` | `getRepairs` | Media |
| **Transferencias** | `inventory_transfers` | API transfers | Media |
| **Catálogos (metales, piedras)** | Puede derivarse de inventario o store dedicado | N/A | Baja |

---

## 4. Implementación por Capas

### 4.1. Capa 1: DataLoader (servicio reutilizable)

Crear `Sistema/js/data_loader.js` como servicio central:

```javascript
/**
 * DataLoader - Patrón Cache-First para todo el sistema
 * 
 * Uso:
 *   const items = await DataLoader.load('inventory_items', {
 *     api: () => API.getInventoryItems(filters),
 *     saveToStore: (data) => data.forEach(i => DB.put('inventory_items', i)),
 *     options: { filterBranchId, viewAllBranches, ... }
 *   });
 */
const DataLoader = {
    async load(storeName, config) {
        // 1. Cargar desde IndexedDB (inmediato)
        let cached = await DB.getAll(storeName, null, null, config.dbOptions || {});
        // 2. Aplicar filtros locales si hay
        if (config.filter) cached = cached.filter(config.filter);
        // 3. Si hay callback onCached, usarlo (mostrar UI)
        if (config.onCached) config.onCached(cached);
        
        // 4. Si hay API, cargar en background
        if (config.api && typeof API !== 'undefined' && API.baseURL) {
            this._fetchInBackground(config).catch(e => console.warn('Background sync:', e));
        }
        
        return cached;
    },
    async _fetchInBackground(config) {
        const fresh = await config.api();
        if (config.saveToStore && Array.isArray(fresh)) {
            for (const item of fresh) {
                await DB.put(config.storeName, item, { autoBranchId: false });
            }
        }
        if (config.onFresh) config.onFresh(fresh);
    }
};
```

### 4.2. Capa 2: Cambio en loadInventory (ejemplo)

**Antes (API-first, bloqueante):**
```
1. API.getInventoryItems()  → espera 2 min
2. Guardar en IndexedDB
3. Mostrar
```

**Después (Cache-first):**
```
1. DB.getAll('inventory_items') → ~100ms
2. Aplicar filtros client-side
3. Mostrar (INMEDIATO)
4. En background: API.getInventoryItems() → guardar en IndexedDB → si cambió, actualizar UI
```

### 4.3. Capa 3: Orden de carga al iniciar app

En `app.js` o punto de entrada:

1. **DB.init()** (ya existe)
2. **SyncManager.init()** – restaura token, conecta socket, inicia sync en background
3. **Cargar módulo solicitado** – con cache-first, muestra datos locales al instante
4. **No esperar** a que SyncManager termine una sync completa antes de mostrar nada

---

## 5. Cambios Concretos por Archivo

### 5.1. `inventory.js` – loadInventory

| Paso | Acción |
|------|--------|
| 1 | **Primero** leer `DB.getAll('inventory_items', null, null, { filterByBranch: false })` |
| 2 | Aplicar filtros (branch, status, category, search, etc.) sobre el array local |
| 3 | Mostrar en pantalla (displayInventory) |
| 4 | **Después**, en `Promise` no bloqueante: llamar API.getInventoryItems(), guardar en IndexedDB, y solo si los datos cambiaron llamar de nuevo a displayInventory (o emitir evento para que Inventory refresque) |
| 5 | La verificación de items fantasma puede hacerse en background sin bloquear la primera pintada |

### 5.2. `employees.js` – loadEmployees / loadTab

Mismo patrón: primero DB, mostrar, luego API en background.

### 5.3. `pos.js` – carga de productos

Cargar `inventory_items` filtrado por `status: 'disponible'` desde IndexedDB primero; API en background.

### 5.4. `sync_manager.js`

- No bloquear el inicio de la app esperando sync completa
- Hacer sync en background; los módulos ya muestran caché
- Mantener evento `sync-complete` o similar para que los módulos opcionalmente refresquen

### 5.5. Sincronización inicial (primera vez)

Si IndexedDB está vacío (nuevo dispositivo/limpieza):
- Mostrar indicador "Cargando..."
- En ese caso sí esperar a la API antes de mostrar (solo cuando no hay caché)

---

## 6. Persistencia – Lo que ya existe

IndexedDB (`opal_pos_db`) **ya persiste**:
- Entre recargas de página
- Entre cierre y reapertura del navegador (mismo origen)
- Los datos no se borran al cerrar sesión

**No** se borra IndexedDB al:
- Cerrar sesión (logout)
- Cerrar la pestaña
- Reiniciar el navegador

Solo se borra si:
- El usuario limpia datos del sitio manualmente
- Se incrementa la versión de DB y se hace migración que borre
- Cambia el origen (dominio/puerto)

Por tanto, **la persistencia ya está**; el cambio clave es el **orden de carga** (cache-first).

---

## 7. Filtros rápidos

Con cache-first:
- Los datos están en memoria (o lectura muy rápida desde IndexedDB)
- Los filtros (metal, piedra, categoría, búsqueda) se aplican sobre el array local
- No hay llamadas a API por cada cambio de filtro
- Resultado: filtros instantáneos

---

## 8. Evitar “re-inicialización”

El sistema no debe “reiniciarse” en el sentido de:
- Volver a mostrar pantalla de login si ya hay sesión
- Esperar sync completo antes de mostrar cualquier módulo
- Recargar toda la app cuando cambia de módulo

Con cache-first:
- Cada módulo lee su caché local y pinta de inmediato
- El sync es un proceso en background que actualiza datos sin bloquear
- Cambiar de módulo es rápido (cada uno lee su store)

---

## 9. Resumen de Implementación

| Fase | Tarea | Archivos |
|------|-------|----------|
| 1 | Refactorizar `loadInventory` a cache-first | `inventory.js` |
| 2 | Refactorizar carga de empleados | `employees.js` |
| 3 | Refactorizar carga de productos en POS | `pos.js` |
| 4 | Asegurar que SyncManager no bloquee inicio | `sync_manager.js`, `app.js` |
| 5 | Opcional: crear DataLoader reutilizable | `data_loader.js` (nuevo) |
| 6 | Aplicar a proveedores, clientes, catálogos | `suppliers.js`, `customers.js`, etc. |

---

## 10. Consideraciones

- **Stale data**: Al abrir, pueden verse datos de hace horas; el sync en background los actualiza. Opcional: indicador "Última actualización: hace X min".
- **Modo offline**: Con cache-first, el sistema funciona sin conexión; solo no tendrá datos nuevos hasta que conecte.
- **Conflictos**: Mantener la lógica actual (last-write-wins, ghost items, etc.); el cache-first no cambia la resolución de conflictos.
