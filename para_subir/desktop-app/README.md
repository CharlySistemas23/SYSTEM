# OpalCo Desktop

Aplicación de escritorio `.exe` para Opal & Co con auto-update.

## Comandos

- `npm install`
- `npm run start`
- `npm run dist:win`

## Auto-update

Está configurado con `electron-updater` usando proveedor `generic`:

- Feed: `https://raw.githubusercontent.com/CharlySistemas23/opal-co-releases/main/releases/windows`
- Se espera en esa ruta el `latest.yml` + instalador `.exe` generado por `electron-builder`.

## Publicación de actualización

1. Generar nuevo build:
   - `npm run dist:win`
2. Copiar desde `dist/` a `opal-co-releases/releases/windows/`:
   - `latest.yml`
   - `OpalCo-Setup-<version>.exe`
3. Commit/push en `opal-co-releases`.

Las PCs con la app instalada detectarán la nueva versión y podrán actualizar sin desinstalar.
