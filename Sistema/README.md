# Opal & Co - Sistema POS Multisucursal

Sistema de punto de venta (POS) completo con soporte multisucursal, gestión de inventario, reportes de utilidad, y sincronización con Google Sheets.

## 🚀 Características Principales

- ✅ **Multisucursal**: Gestión completa de múltiples sucursales con separación de datos
- ✅ **POS Avanzado**: Venta de productos con escaneo de códigos de barras
- ✅ **Inventario**: Gestión completa de inventario con transferencias entre sucursales
- ✅ **Reportes de Utilidad**: Cálculo automático de utilidad diaria (bruta y neta)
- ✅ **Llegadas de Pasajeros**: Registro de llegadas por agencia con cálculo automático de tarifas
- ✅ **Sincronización**: Sincronización automática con Google Sheets
- ✅ **Dashboard**: Vista consolidada de métricas por sucursal
- ✅ **Validación Automática**: Validación y corrección automática de datos multisucursal
- ✅ **Funcionamiento Offline**: Todos los datos se guardan localmente y funcionan sin internet
- ✅ **Gestión de Usuarios**: Sistema completo de permisos y roles

## 📋 Requisitos Previos

- Navegador moderno (Chrome, Firefox, Edge, Safari) - Versión reciente
- Cuenta de Google (para Google Sheets - opcional)
- Acceso a Google Apps Script (para sincronización - opcional)

## 🔧 Instalación y Configuración

### 1. Descargar o Clonar el Proyecto

```bash
# Si usas Git
git clone <tu-repositorio>
cd "Sistema HTML"

# O simplemente descarga y extrae el archivo ZIP
```

### 2. Configurar Google Apps Script (Opcional - para sincronización)

1. Abre [Google Apps Script](https://script.google.com/)
2. Crea un nuevo proyecto
3. Copia el contenido completo de `google_apps_script.js`
4. Pega el código en el editor
5. Guarda el proyecto (Ctrl+S o Cmd+S)
6. **Ejecuta la función `testScript`** para verificar que funciona:
   - Selecciona `testScript` en el menú desplegable
   - Click en "Ejecutar"
   - Revisa los registros de ejecución
7. Ve a **Implementar → Nueva implementación**
8. Tipo: **Aplicación web**
9. Ejecutar como: **Yo**
10. Quién tiene acceso: **Cualquiera**
11. Haz clic en **Implementar**
12. **Copia la URL de la aplicación web** (termina en `/exec`)
13. **Copia el TOKEN** del script (por defecto: `opal-co-sync-8f3k9m2x7p4w1n6v`)

### 3. Configurar el Sistema

1. Abre `index.html` en tu navegador
2. Inicia sesión (o usa bypass si está configurado)
3. Ve a **Configuración → Sincronización**
4. Ingresa:
   - **URL de sincronización**: La URL que copiaste del paso anterior
   - **Token**: El token del script
5. Click en **"Probar Conexión"** para verificar
6. Guarda la configuración

### 4. Configurar Sucursales

1. Ve a **Configuración → Catálogos → Gestionar Sucursales**
2. Crea al menos una sucursal
3. Actívala
4. Asigna empleados a las sucursales
5. Ejecuta **"Validar Sistema Multisucursal"** para verificar la configuración

## 📁 Estructura del Proyecto

```
Sistema HTML/
├── index.html              # Página principal
├── css/
│   └── styles.css          # Estilos principales
├── js/
│   ├── app.js              # Punto de entrada principal
│   ├── db.js               # Gestión de IndexedDB (almacenamiento local)
│   ├── branch_manager.js   # Gestión multisucursal
│   ├── branch_validator.js # Validaciones multisucursal
│   ├── permission_manager.js # Gestión de permisos
│   ├── pos.js              # Módulo POS (punto de venta)
│   ├── inventory.js        # Gestión de inventario
│   ├── transfers.js        # Transferencias entre sucursales
│   ├── dashboard.js        # Dashboard principal
│   ├── reports.js          # Reportes y análisis
│   ├── profit.js           # Cálculo de utilidad
│   ├── cash.js             # Gestión de caja
│   ├── customers.js        # Gestión de clientes
│   ├── employees.js        # Gestión de empleados
│   ├── users.js            # Gestión de usuarios
│   ├── repairs.js          # Gestión de reparaciones
│   ├── costs.js            # Gestión de costos
│   ├── tourist_report.js   # Reportes turísticos
│   ├── sync.js             # Sincronización con Google Sheets
│   ├── sync_ui.js          # Interfaz de sincronización
│   └── ...                 # Otros módulos
├── google_apps_script.js   # Script para Google Sheets
├── vercel.json             # Configuración de Vercel (si se despliega)
├── README.md               # Este archivo
└── GUIA_USUARIO_DEFINITIVA.md # Guía completa para usuarios
```

## 🗄️ Almacenamiento de Datos

### Almacenamiento Local (IndexedDB)

Todos los datos se guardan **localmente en el navegador** usando IndexedDB:

- **Base de datos**: `opal_pos_db`
- **Ubicación**: Carpeta del navegador en tu disco duro
- **Funciona offline**: No requiere conexión a internet
- **Persistente**: Los datos se mantienen aunque cierres el navegador

Para más detalles, consulta `ALMACENAMIENTO_LOCAL.md`

### Sincronización con Google Sheets (Opcional)

- Los datos se sincronizan automáticamente con Google Sheets
- Se crean hojas separadas por sucursal
- Funciona en segundo plano cuando hay conexión

## 🔐 Seguridad

### Token de Sincronización

El token en `google_apps_script.js` debe ser único y seguro. Para generar uno nuevo:

```javascript
// En la consola de Google Apps Script
Utilities.getUuid()
```

### Permisos de Usuario

El sistema tiene un sistema completo de permisos:
- **Admin**: Acceso completo a todas las funciones
- **Empleado**: Acceso limitado según permisos asignados
- **Vendedor**: Solo acceso a POS y funciones básicas

## 📊 Módulos del Sistema

### Operaciones
- **Dashboard**: Vista general de métricas y estadísticas
- **POS**: Punto de venta con escaneo de códigos de barras
- **Caja**: Gestión de caja y sesiones de caja
- **Códigos de Barras**: Generación y gestión de códigos de barras

### Inventario
- **Inventario**: Gestión completa de productos
- **Transferencias**: Transferencias entre sucursales

### Clientes y Servicios
- **Clientes**: Base de datos de clientes
- **Reparaciones**: Gestión de reparaciones

### Reportes
- **Reportes**: Reportes detallados de ventas, productos, vendedores
- **Utilidad**: Cálculo de utilidad diaria
- **Reportes Turísticos**: Reportes de llegadas y pasajeros

### Administración
- **Empleados**: Gestión de empleados
- **Usuarios**: Gestión de usuarios y permisos
- **Configuración**: Configuración del sistema

## 🌐 Despliegue

### Opción 1: Uso Local

Simplemente abre `index.html` en tu navegador. No requiere servidor.

### Opción 2: Despliegue en Vercel

1. Sube tu código a GitHub
2. Conecta con Vercel
3. El proyecto se desplegará automáticamente

## 🛠️ Desarrollo

### Ejecutar Localmente

No requiere servidor. Simplemente abre `index.html` en tu navegador.

### Estructura de Datos

Los datos se almacenan localmente en IndexedDB y se sincronizan con Google Sheets (opcional).

## 📝 Documentación Adicional

- `GUIA_USUARIO_DEFINITIVA.md` - Guía completa para usuarios finales
- `ALMACENAMIENTO_LOCAL.md` - Información sobre almacenamiento local

## 🐛 Solución de Problemas

### El sistema no sincroniza

1. Verifica que la URL de Google Apps Script sea correcta
2. Verifica que el token coincida en ambos lugares
3. Revisa la consola del navegador para errores (F12)
4. Verifica los logs en Google Apps Script

### No se ven datos en Google Sheets

1. Verifica que el script esté desplegado correctamente
2. Revisa los permisos de la aplicación web
3. Verifica que el spreadsheet se haya creado
4. Ejecuta `testScript` en Google Apps Script para verificar

### Problemas con multisucursal

1. Ejecuta "Validar Sistema Multisucursal" en Configuración
2. Verifica que exista al menos una sucursal activa
3. Verifica que los empleados tengan sucursal asignada
4. Verifica que el usuario tenga acceso a la sucursal

### Los datos no aparecen

1. Verifica que IndexedDB esté habilitado en el navegador
2. Revisa la consola del navegador (F12) para errores
3. Verifica que tengas permisos para ver los datos
4. Verifica que estés en la sucursal correcta

## 🔄 Actualizaciones

El sistema se actualiza automáticamente cuando hay cambios en el código. Los datos locales se mantienen intactos.

## 📄 Licencia

Este proyecto es privado y de uso interno.

## 👥 Soporte

Para soporte técnico, consulta la `GUIA_USUARIO_DEFINITIVA.md` o contacta al equipo de desarrollo.

---

**Versión**: 2.0.0  
**Última actualización**: 2024
