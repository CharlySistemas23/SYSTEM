# INSTRUCCIONES PARA DESPLEGAR EN VERCEL

## ⚠️ IMPORTANTE: SOBRE LOS DATOS

**El sistema usa IndexedDB, que es una base de datos LOCAL del navegador.**

Esto significa:
- ✅ **Cada usuario tiene su propia base de datos** en su navegador
- ✅ **Los datos se guardan automáticamente** cuando el usuario realiza acciones
- ✅ **Funciona completamente offline** sin necesidad de servidor
- ⚠️ **Los datos NO se comparten entre usuarios** (cada uno tiene su propia copia)
- ⚠️ **Si el usuario limpia el caché del navegador, pierde los datos**

## 🔄 CARGA AUTOMÁTICA DE DATOS

El sistema carga automáticamente los siguientes datos al iniciar:

1. **Agencias**: TRAVELEX, VERANOS, TANITOURS, DISCOVERY, TB, TTF
2. **Vendedores**: Lista completa de 29 vendedores con sus reglas de comisión
3. **Guías**: Guías por agencia con sus reglas de comisión
4. **Sucursales**: L Vallarta, Malecón, San Sebastián, Sayulita
5. **Reglas de Comisión**: Para vendedores y guías
6. **Reglas de Llegadas**: Tabulador completo de tarifas por agencia
7. **Nómina Semanal**: Costos de nómina por sucursal
8. **Costos Iniciales**: Renta, agua, línea amarilla, licencias

## 📋 PASOS PARA DESPLEGAR EN VERCEL

### 1. Preparar el Proyecto

Asegúrate de tener todos los archivos necesarios:
- ✅ `index.html`
- ✅ `css/styles.css`
- ✅ `js/*.js` (todos los módulos)
- ✅ `libs/*.js` (librerías)
- ✅ `assets/logo.png`
- ✅ `google_apps_script.js`
- ✅ `package.json`
- ✅ `vercel.json`

### 2. Subir a Vercel

```bash
# Opción 1: Desde la interfaz web de Vercel
# 1. Ve a vercel.com
# 2. Importa tu repositorio de GitHub
# 3. Vercel detectará automáticamente la configuración

# Opción 2: Desde la línea de comandos
npm i -g vercel
vercel
```

### 3. Configuración de Vercel

El archivo `vercel.json` ya está configurado para:
- ✅ Redirigir todas las rutas a `index.html` (SPA)
- ✅ Servir archivos estáticos correctamente

### 4. Verificar Despliegue

Después del despliegue:
1. Abre la URL de Vercel en tu navegador
2. Abre la consola del navegador (F12)
3. Verifica que aparezcan estos mensajes:
   ```
   🔄 Cargando datos básicos del sistema...
   ✅ Datos básicos del sistema cargados
   ```

## 🔍 VERIFICAR QUE LOS DATOS SE CARGUEN

### En la Consola del Navegador:

1. Abre las **Herramientas de Desarrollador** (F12)
2. Ve a la pestaña **Application** (Chrome) o **Storage** (Firefox)
3. Expande **IndexedDB** → `opal_pos_db`
4. Verifica que existan estos stores con datos:
   - `catalog_agencies` (debe tener 6 agencias)
   - `catalog_sellers` (debe tener 29 vendedores)
   - `catalog_guides` (debe tener guías)
   - `catalog_branches` (debe tener 4 sucursales)
   - `commission_rules` (debe tener reglas)
   - `arrival_rate_rules` (debe tener reglas de llegadas)
   - `cost_entries` (debe tener nómina y costos iniciales)

### Si los Datos No Aparecen:

1. **Recarga la página** (F5 o Ctrl+R)
2. **Limpia el caché y recarga** (Ctrl+Shift+R)
3. **Abre la consola** y busca errores
4. **Verifica la conexión a internet** (aunque funciona offline, necesita cargar los archivos JS)

## ⚠️ PROBLEMAS COMUNES

### Problema 1: "Los datos no aparecen"
**Solución**: 
- Los datos se cargan automáticamente la primera vez que se abre el sistema
- Si no aparecen, recarga la página
- Verifica la consola del navegador para errores

### Problema 2: "Cada usuario ve datos diferentes"
**Solución**: 
- Esto es NORMAL. IndexedDB es local a cada navegador
- Cada usuario tiene su propia base de datos
- Para compartir datos, usa la sincronización con Google Sheets

### Problema 3: "Los datos se pierden al recargar"
**Solución**: 
- Esto NO debería pasar. IndexedDB persiste los datos
- Si se pierden, puede ser que:
  - El navegador está en modo incógnito
  - El usuario limpió el caché
  - Hay un problema con los permisos del navegador

## 🔄 SINCRONIZACIÓN CON GOOGLE SHEETS

Para compartir datos entre usuarios, configura la sincronización:

1. **Configura Google Apps Script** (ver `README.md`)
2. **Configura la URL y TOKEN** en el módulo de Sincronización
3. **Sincroniza manualmente** o espera la sincronización automática

## ✅ VERIFICACIÓN FINAL

Después del despliegue, verifica:

- [ ] El sistema carga correctamente
- [ ] Los datos básicos se cargan automáticamente
- [ ] Puedes iniciar sesión (crea un usuario si no existe)
- [ ] Puedes ver el Dashboard
- [ ] Puedes acceder a todos los módulos
- [ ] Los datos persisten después de recargar la página

---

**Nota**: Los datos se cargan automáticamente la primera vez que un usuario accede al sistema en Vercel. No es necesario hacer nada adicional.

