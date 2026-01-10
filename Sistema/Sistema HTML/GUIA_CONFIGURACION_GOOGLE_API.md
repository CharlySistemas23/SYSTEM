# 🔧 Guía: Configurar Google Sheets API

## ⚠️ Error Actual
```
Error: Google Client ID no configurado. Configúralo en Configuración → Sincronización
```

## 📝 Pasos para Solucionarlo

### Paso 1: Acceder a la Configuración
1. Abre tu sistema en el navegador
2. En el menú lateral, busca "Configuración" (ícono ⚙️)
3. Haz clic en "Configuración"
4. Busca la pestaña o sección "Sincronización"

### Paso 2: Localizar la Sección de Google Sheets API
Busca un cuadro/tarjeta con el título:
```
📋 Configuración de Google Sheets API
```

### Paso 3: Configurar Google Client ID
**Campo:** `Google Client ID`

**Valor a pegar:**
```
363340186026-plrlt6epqr5g3ln61v9fbitjj25d54vb.apps.googleusercontent.com
```

### Paso 4: Configurar Spreadsheet ID
**Campo:** `Spreadsheet ID`

**Cómo obtenerlo:**
1. Abre tu Google Sheet (o crea uno nuevo)
2. Mira la URL del navegador:
   ```
   https://docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
   ```
3. Copia la parte que está entre `/d/` y `/edit`
4. Pégala en el campo "Spreadsheet ID"

**Ejemplo:**
- URL: `https://docs.google.com/spreadsheets/d/1awlhCklyVlnYxhC3i6wMYhgDE/edit`
- ID: `1awlhCklyVlnYxhC3i6wMYhgDE`

### Paso 5: Guardar Configuración
1. Haz clic en el botón: **"Guardar Configuración Google"**
2. Espera a ver el mensaje de confirmación

### Paso 6: Probar Autenticación
1. Haz clic en el botón: **"Probar Autenticación"** (ícono 🔑)
2. Se abrirá una ventana de Google
3. Selecciona tu cuenta de Google
4. Haz clic en "Permitir" para dar acceso a Google Sheets

### Paso 7: Verificar
1. **Recarga la página** (presiona F5 o Ctrl+R)
2. Intenta sincronizar de nuevo
3. Los errores deberían desaparecer

---

## 🎯 Valores Necesarios

### Google Client ID
```
363340186026-plrlt6epqr5g3ln61v9fbitjj25d54vb.apps.googleusercontent.com
```

### Spreadsheet ID
(Tu valor personal - obténlo de la URL de tu Google Sheet)

---

## ✅ Checklist

- [ ] Accedí a Configuración → Sincronización
- [ ] Pegué el Google Client ID
- [ ] Obtuve el Spreadsheet ID de mi Google Sheet
- [ ] Pegué el Spreadsheet ID
- [ ] Guardé la configuración
- [ ] Probé la autenticación (y acepté permisos)
- [ ] Recargué la página
- [ ] Intenté sincronizar de nuevo

---

## 🆘 Si No Encuentras la Sección

1. **Asegúrate de estar en la sección correcta:**
   - Menú → Configuración → Sincronización

2. **Busca estos textos en la página:**
   - "Configuración de Google Sheets API"
   - "Google Client ID"
   - "Spreadsheet ID"

3. **Si no aparece:**
   - Verifica que hayas actualizado los archivos `sync_ui.js` y `sync.js`
   - Limpia la caché del navegador (Ctrl+Shift+Delete)
   - Recarga la página (Ctrl+F5)

---

## 📞 Próximos Pasos

Una vez configurado correctamente:
1. ✅ Los errores desaparecerán
2. ✅ Podrás sincronizar datos
3. ✅ Se crearán las hojas automáticamente en Google Sheets
4. ✅ Los datos se escribirán correctamente

