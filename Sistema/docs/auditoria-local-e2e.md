# Auditoría local E2E (sin Railway/GitHub)

Esta auditoría corre completamente local en tus carpetas oficiales:
- Backend: `backend/backend`
- Frontend: `Sistema`

## 1) Levantar backend local

En terminal 1:

```powershell
cd backend/backend
$env:PORT=3001
npm install
npm start
```

## 2) Levantar frontend local

En terminal 2:

```powershell
cd Sistema
npm install
npm run start
```

## 3) Ejecutar auditoría E2E

En terminal 3:

```powershell
cd Sistema
$env:LOCAL_API_URL="http://127.0.0.1:3001"
$env:E2E_COMPANY_CODE="OPAL2024"
$env:E2E_USERNAME="master_admin"
$env:E2E_PIN="1234"
npm run audit:local
```

## Qué valida ahora

- Login local y entrada al sistema.
- Navegación de módulos críticos.
- Ausencia de errores JS y respuestas 5xx en endpoints API durante navegación.
- Detección de bucle en Sucursales por exceso de llamadas a `/api/branches`.
- Apertura/cierre del modal de `Nueva Sucursal`.

## Reporte

Después de correr, abre el reporte HTML:

```powershell
cd Sistema
npx playwright show-report tests/e2e/report
```

## Nota

Si tus credenciales locales son distintas, cambia las variables de entorno antes de correr las pruebas.
