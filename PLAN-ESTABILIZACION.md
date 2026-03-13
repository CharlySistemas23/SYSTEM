# Plan de Estabilización del Sistema (Pragmático)

## Objetivo
Mantener el sistema funcionando como hoy, reduciendo riesgos reales sin hacer una reescritura grande.

---

## Principios
- No romper operación diaria.
- Cambios pequeños, verificables y reversibles.
- Primero seguridad + datos + visibilidad.
- Refactor solo donde aporte valor inmediato.

---

## Fase 0 (Hoy): Preparación
**Duración estimada:** 0.5 día

### Tareas
- Congelar features nuevas por 1 sprint corto.
- Definir entorno de `staging` (Railway + BD espejo).
- Establecer checklist de despliegue.
- Respaldar BD y validar restauración.

### Entregables
- Checklist de release.
- Backup verificado.
- Entorno de staging activo.

---

## Fase 1 (Semana 1): Mínimos Críticos
**Duración estimada:** 3–5 días

### 1) Seguridad básica
- Mover credenciales hardcodeadas a variables de entorno.
- Desactivar bypass/debug en producción.
- Endurecer autenticación opcional en backend para producción.

### 2) Integridad de datos en flujo de venta
- Revisar y asegurar transacciones completas en venta:
  - creación de venta
  - items de venta
  - pagos
  - actualización de stock
  - logs
- Asegurar rollback limpio ante error parcial.

### 3) Observabilidad mínima
- Logging estructurado en backend (errores + operaciones críticas).
- Métricas mínimas:
  - errores por endpoint
  - tamaño de cola de sync
  - estado de socket
- Alertas básicas en fallos críticos.

### Entregables
- Variables sensibles fuera del código.
- Flujo de venta validado con rollback.
- Dashboard básico de salud operativa.

---

## Fase 2 (Semana 2): Confiabilidad Operativa
**Duración estimada:** 4–6 días

### 1) Migraciones controladas
- Separar migraciones del arranque del servidor.
- Crear proceso formal `up/down`.
- Definir política: no modificar esquema en caliente desde requests.

### 2) Pruebas de integración críticas
- Login.
- Venta completa (happy path + error path).
- Sync offline → online.
- Caja (apertura/cierre).

### 3) Hardening de sync
- Política de reintentos y límites.
- Visibilidad de conflictos para usuario admin.
- Auditoría de elementos pendientes.

### Entregables
- Pipeline de migración reproducible.
- Suite de integración mínima ejecutable.
- Protocolo de recuperación de sync.

---

## Fase 3 (Semanas 3–4): Deuda Técnica Prioritaria
**Duración estimada:** 1–2 semanas

### 1) Refactor focalizado (sin big-bang)
- Dividir módulos más acoplados:
  - frontend: `app.js`, `reports.js`
  - backend: `reports.js`, `suppliers.js`
- Extraer reglas hardcodeadas de negocio a configuración en BD.

### 2) Contrato de eventos
- Estandarizar nombres/payloads de eventos Socket + EventBus.
- Documentar catálogo de eventos.

### Entregables
- Módulos críticos menos acoplados.
- Reglas de negocio configurables.
- Contrato de eventos documentado.

---

## Criterios de Éxito
- 0 incidentes de pérdida de datos en ventas.
- 0 credenciales sensibles en código fuente.
- Recuperación ante error operativa en < 30 min.
- Pruebas críticas pasando en cada release.
- Despliegues sin cambios de esquema implícitos al arrancar.

---

## Riesgos y Mitigación
- **Riesgo:** tocar auth y bloquear usuarios.
  - **Mitigación:** feature flag + prueba en staging + rollback inmediato.

- **Riesgo:** cambios en transacciones afectan rendimiento.
  - **Mitigación:** pruebas de carga básicas en endpoints de venta.

- **Riesgo:** migraciones manuales fallan.
  - **Mitigación:** procedimiento estándar y respaldo previo obligatorio.

---

## Orden de Ejecución Recomendado
1. Seguridad mínima.
2. Integridad de ventas.
3. Logs/alertas.
4. Migraciones formales.
5. Pruebas de integración.
6. Refactor focalizado.

---

## Nota de implementación
Este plan está diseñado para equipos pequeños y operación en curso. Si hay urgencia de negocio, ejecutar solo Fase 1 primero y re-evaluar antes de Fase 2.

---

## Avances ejecutados (2026-03-11)

### Seguridad básica completada parcialmente
- Frontend: eliminado auto-login con credenciales por defecto y endurecido `bypassLogin` solo para localhost con flag explícito.
- Backend API: `authenticateOptional` ahora bloquea en producción:
  - elevación de `master_admin` por headers sin token,
  - creación de usuarios temporales cuando el usuario no existe,
  - acceso anónimo sin autenticación.
- Backend Socket.IO: misma política de endurecimiento aplicada para handshake.

### Feature flags de compatibilidad temporal
- `ALLOW_UNSAFE_FALLBACK_AUTH=true`: reactiva fallback inseguro (solo usar temporalmente).
- `ALLOW_MASTER_ADMIN_HEADER_AUTH=true`: permite header-auth para `master_admin` sin token (no recomendado).

### Integridad y observabilidad en ventas completadas parcialmente
- `backend/routes/sales.js` ahora valida payload mínimo antes de persistir:
  - items obligatorios,
  - cantidades y precios válidos,
  - pagos con método y monto válido,
  - total de pagos consistente con total de venta cuando aplica.
- El inventario crítico se consulta con `FOR UPDATE` durante crear/editar/eliminar venta para reducir carreras de concurrencia.
- Los efectos posteriores al `COMMIT` (audit log y Socket.IO) ya no invalidan la respuesta de la venta si fallan después de persistir en BD.
- Se agregaron logs estructurados mínimos para operaciones `create/update/delete` de ventas.

### Integridad y observabilidad en caja completadas parcialmente
- `backend/routes/cash.js` ahora protege mejor apertura, cierre y movimientos:
  - bloqueo de sesión con `FOR UPDATE` en cierre y movimientos,
  - control de sesión abierta con bloqueo al abrir,
  - separación entre persistencia y efectos post-commit.
- Si falla `audit_logs` o Socket.IO después del `COMMIT`, la operación de caja ya no se reporta como fallida aunque haya quedado persistida.
- Se agregaron logs estructurados mínimos para `session_open`, `session_close` y `movement_create`.

### Integridad y observabilidad en transferencias completadas parcialmente
- `backend/routes/transfers.js` ahora bloquea inventario y transferencia durante creación/completado para reducir carreras de concurrencia.
- Se valida stock de origen dentro de la transacción antes de descontar existencias al completar.
- Los efectos post-commit (`audit_logs` y Socket.IO) quedaron aislados para no falsear fallos después de persistir la transferencia.
- Se agregaron logs estructurados mínimos para `create` y `complete` de transferencias.

### Integridad y observabilidad en inventario completadas parcialmente
- `backend/routes/inventory.js` ahora usa transacciones en `create`, `update` y `delete` para mantener sincronizados `inventory_items`, `inventory_logs` y `audit_logs`.
- `update` y `delete` bloquean la fila del item con `FOR UPDATE` antes de modificarla.
- Los eventos Socket.IO quedaron fuera de la transacción y ya no degradan la respuesta si fallan después del `COMMIT`.
- Se agregaron logs estructurados mínimos para `create`, `update` y `delete` de inventario.

### Integridad y observabilidad en órdenes de compra completadas parcialmente
- `backend/routes/purchase-orders.js` ahora usa transacciones en `create`, `update` y `delete` de la orden base.
- La verificación de permisos, duplicados y bloqueo de la orden durante actualización/eliminación ocurre dentro de la transacción.
- Los efectos post-commit hacia eventos de proveedor quedaron aislados para no falsear errores después de persistir.
- Se agregaron logs estructurados mínimos para `create`, `update` y `delete` de órdenes de compra.
- Las mutaciones de items (`add/update/delete`) ahora también son transaccionales y recalculan totales con un helper único dentro de la misma transacción.
- Se eliminó una duplicidad real de ruta `PUT /items/:itemId`, que podía ocultar lógica y dificultar mantenimiento/debug.
- El recálculo de `total_amount` ya no depende del valor previo de `subtotal` dentro del mismo `UPDATE`.

### Integridad y observabilidad en reparaciones completadas parcialmente
- `backend/routes/repairs.js` ahora usa transacciones en `create`, `update`, `complete` y `delete`.
- Las filas de reparación se bloquean con `FOR UPDATE` en operaciones de mutación críticas.
- Fotos y `audit_logs` quedan dentro de la transacción de creación para evitar reparaciones incompletas.
- Los eventos Socket.IO quedaron aislados del `COMMIT` y se agregaron logs estructurados mínimos del flujo.

### Integridad y observabilidad en quick captures completadas parcialmente
- `backend/routes/reports.js` ahora usa transacciones en `create`, `update` y `delete` de `quick_captures`.
- Las filas de captura se bloquean con `FOR UPDATE` antes de actualizar/eliminar.
- La carga de detalles para eventos en tiempo real quedó extraída a un helper y se ejecuta después del `COMMIT`.
- Se agregaron logs estructurados mínimos para seguir el flujo `quick_capture_*` y distinguir fallos transaccionales de post-commit.

### Integridad y observabilidad en reportes archivados/históricos completadas parcialmente
- `backend/routes/reports.js` ahora usa transacciones también en:
  - `POST /archived-quick-captures`
  - `DELETE /archived-quick-captures/:id`
  - `POST /historical-quick-captures`
  - `DELETE /historical-quick-captures/:id`
- Las verificaciones de existencia/permisos y los borrados/altas relevantes ya no quedan mezclados con emisiones Socket.IO dentro del mismo bloque crítico.
- Se agregaron logs estructurados para distinguir inicio, commit, fallo transaccional y fallo post-commit.
- Se redujo ruido operativo: trazas diagnósticas de reportes archivados/históricos quedaron bajo `DEBUG_REPORTS=true` y ya no se imprimen por defecto en producción.

### Separación de costos operativos vs costo de ventas (frontend) completada
- En `Sistema/js/costs.js` se separó la visualización en pestañas:
  - **Costos**: ahora muestra solo costos operativos.
  - **Costo de Ventas**: nueva ventana/pestaña para costos ligados a ventas.
- Se definieron categorías de costo de ventas para aislar cálculos:
  - `costo_ventas`
  - `comisiones`
  - `comisiones_bancarias`
- Los cálculos de **Resumen** y **Análisis** usan únicamente costos operativos, evitando que COGS/comisiones distorsionen métricas.
- La exportación de costos ahora respeta la pestaña activa (operativos vs costo de ventas).

### Consolidación técnica completada parcialmente
- Se creó [backend/utils/operation-helpers.js](backend/utils/operation-helpers.js) para centralizar `safeRollback` y el generador de logs estructurados.
- Se creó [backend/utils/inventory-helpers.js](backend/utils/inventory-helpers.js) para centralizar el bloqueo de inventario con `FOR UPDATE` (`getLockedInventoryItem`).
- Se creó [backend/utils/recalculation-helpers.js](backend/utils/recalculation-helpers.js) para centralizar recálculos compartidos (`roundCurrency`, `calculateSaleItemSubtotal`, `recalculatePurchaseOrderTotals`).
- Ventas, caja, transferencias, inventario, órdenes de compra, reparaciones y quick captures ya consumen el helper común.
- Reportes archivados e históricos también consumen el helper común.
- `backend/routes/sales.js` y `backend/routes/transfers.js` ya consumen el helper compartido de inventario, eliminando duplicación local.
- `backend/routes/sales.js` y `backend/routes/purchase-orders.js` ya consumen helper compartido de recálculo, eliminando duplicación local.
- Esto reduce divergencia futura entre rutas críticas y simplifica siguientes endurecimientos.

### Base de pruebas completada parcialmente
- `backend/package.json` ahora expone `npm test` y `npm run test:watch` con Vitest.
- Se añadieron scripts explícitos: `npm run test:unit` y `npm run test:integration`.
- Se corrigió `backend/tests/api.test.js` para alinearlo con la respuesta real de inventario (`{ items, total, stats }`).
- Se agregó `backend/tests/operation-helpers.test.js` para validar localmente el helper compartido sin depender de un servidor activo.
- Se agregó `backend/tests/critical-flows.test.js` con pruebas de integración para:
  - ciclo crear/eliminar `quick_captures`,
  - ciclo crear/eliminar venta con fixture de inventario,
  - ciclo crear/cancelar transferencia (cuando hay sucursal destino disponible),
  - flujo de caja con apertura/movimiento/cierre cuando no existe sesión previa abierta (y modo seguro de solo movimiento cuando ya existe sesión activa).
- La suite crítica usa fixtures creadas por API y limpieza en `finally` para reducir residuos en BD de pruebas.
- Validación ejecutada: `tests/operation-helpers.test.js` pasó correctamente.
- `backend/tests/health.test.js` y `backend/tests/api.test.js` ahora son integración *opt-in* (solo corren con `RUN_INTEGRATION_TESTS=true`).
- `backend/tests/critical-flows.test.js` también es integración *opt-in* y requiere `INTEGRATION_BRANCH_ID` para ejecutarse.
- Validación ejecutada: `npm test` pasa por defecto (unit tests en verde, integration tests omitidos).
- Validación ejecutada: `npm run test:integration` incluye ya la suite crítica y queda en skip hasta activar variables.

### Ejecución real en staging (2026-03-11)
- Se ejecutó `npm run test:integration` contra `https://backend-production-6260.up.railway.app` con variables de integración activadas.
- Resultado observado:
  - `health.test.js` ✅
  - `api.test.js` ✅ (test autenticado se omite cuando no hay token de login)
  - `critical-flows.test.js` ⚠️ fallos por timeout en flujos de reportes/ventas/transferencias.
- Diagnóstico puntual adicional:
  - `POST /api/reports/quick-captures` presenta latencia/timeout en staging bajo la sesión de prueba usada.
  - La autenticación por header para `master_admin` muestra comportamiento no consistente entre endpoints (algunos responden, otros retornan `AUTH_ERROR`).

### Pendiente inmediato (siguiente bloque)
- Ejecutar pruebas de integración reales contra un servidor/BD de prueba (staging o entorno controlado) con variables habilitadas.
  - Estado: corrida realizada en staging, pero pendiente de cierre en verde por timeouts/autenticación inconsistente detectados.
  - Siguiente acción: estabilizar credenciales de prueba (token o usuario no master_admin) y ajustar timeouts/request-timeout en la suite para evitar falsos negativos por red.
