# OPAL & CO POS Backend - Servidor Centralizado

Servidor backend centralizado para OPAL & CO POS con soporte multi-tenant (múltiples tiendas) y actualizaciones en tiempo real mediante WebSockets.

## 🚀 Características

- ✅ **Multi-tenant**: Cada tienda tiene sus propios datos separados por `branch_id`
- ✅ **Autenticación JWT**: Login seguro con tokens
- ✅ **WebSockets**: Actualizaciones en tiempo real por tienda
- ✅ **API REST**: Endpoints para todas las operaciones
- ✅ **PostgreSQL**: Base de datos relacional robusta
- ✅ **CORS**: Configurado para permitir conexiones desde el frontend

## 📋 Requisitos

- Node.js >= 18.0.0
- PostgreSQL (Railway lo provee automáticamente)
- Cuenta en Railway.app

## 📁 Estructura del Proyecto

```
servidor-railway/
├── config/
│   └── database.js          # Configuración de PostgreSQL
├── database/
│   ├── schema.sql           # Esquema de base de datos
│   └── migrate.js           # Script de migración
├── middleware/
│   ├── auth.js              # Autenticación JWT
│   └── errorHandler.js      # Manejo de errores
├── routes/
│   ├── auth.js              # Rutas de autenticación
│   ├── sales.js             # Rutas de ventas
│   ├── employees.js         # Rutas de empleados
│   ├── inventory.js         # Rutas de inventario
│   ├── branches.js          # Rutas de sucursales
│   ├── customers.js         # Rutas de clientes
│   └── reports.js           # Rutas de reportes
├── server.js                # Servidor principal
├── package.json             # Dependencias
└── README.md                # Este archivo
```

## 🗄️ Base de Datos

### Tablas Principales

- `catalog_branches` - Sucursales/Tiendas
- `users` - Usuarios (con `branch_id`)
- `employees` - Empleados (con `branch_id`)
- `sales` - Ventas (con `branch_id`)
- `sale_items` - Items de venta
- `sale_payments` - Métodos de pago
- `inventory_items` - Productos (con `branch_id`)
- `customers` - Clientes
- `catalog_sellers` - Vendedores
- `catalog_guides` - Guías
- `catalog_agencies` - Agencias
- `commission_rules` - Reglas de comisión
- `cost_entries` - Costos (con `branch_id`)
- `cash_sessions` - Sesiones de caja (con `branch_id`)

### Multi-tenancy

Todos los datos están separados por `branch_id`. Cada usuario tiene un `branch_id` en su token JWT, y el servidor filtra automáticamente los datos según la tienda del usuario.

## 🔐 Autenticación

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user123",
    "username": "admin",
    "branchId": "branch1",
    "role": "admin"
  }
}
```

### Usar Token

Todas las rutas protegidas requieren el token en el header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📡 API Endpoints

### Autenticación
- `POST /api/auth/login` - Login con username/password
- `POST /api/auth/login/barcode` - Login con código de barras y PIN
- `GET /api/auth/verify` - Verificar token

### Ventas
- `GET /api/sales` - Obtener todas las ventas (solo de la tienda del usuario)
- `GET /api/sales/:id` - Obtener una venta
- `POST /api/sales` - Crear nueva venta
- `PUT /api/sales/:id` - Actualizar venta
- `DELETE /api/sales/:id` - Eliminar venta (solo admin)

### Empleados
- `GET /api/employees` - Obtener todos los empleados
- `GET /api/employees/:id` - Obtener un empleado
- `POST /api/employees` - Crear empleado
- `PUT /api/employees/:id` - Actualizar empleado
- `DELETE /api/employees/:id` - Eliminar empleado (solo admin)

### Inventario
- `GET /api/inventory` - Obtener todos los productos
- `GET /api/inventory/:id` - Obtener un producto
- `POST /api/inventory` - Crear producto
- `PUT /api/inventory/:id` - Actualizar producto
- `DELETE /api/inventory/:id` - Eliminar producto (solo admin)

### Sucursales
- `GET /api/branches` - Obtener todas las sucursales (admin ve todas)
- `GET /api/branches/:id` - Obtener una sucursal
- `POST /api/branches` - Crear sucursal (solo admin)
- `PUT /api/branches/:id` - Actualizar sucursal (solo admin)
- `DELETE /api/branches/:id` - Eliminar sucursal (solo admin)

### Clientes
- `GET /api/customers` - Obtener todos los clientes
- `GET /api/customers/:id` - Obtener un cliente
- `POST /api/customers` - Crear cliente
- `PUT /api/customers/:id` - Actualizar cliente
- `DELETE /api/customers/:id` - Eliminar cliente (solo admin)

### Reportes
- `GET /api/reports/dashboard` - KPIs del dashboard
- `GET /api/reports/commissions` - Reporte de comisiones
- `GET /api/reports/sales-by-seller` - Ventas por vendedor
- `GET /api/reports/sales-by-guide` - Ventas por guía

## 🔌 WebSockets

El servidor usa Socket.io para actualizaciones en tiempo real.

### Conectar

```javascript
import io from 'socket.io-client';

const socket = io('https://api.tudominio.com', {
  auth: {
    token: 'tu_token_jwt'
  }
});
```

### Eventos

**Recibir actualizaciones:**
- `sale-created` - Nueva venta creada
- `sale-updated` - Venta actualizada
- `sale-deleted` - Venta eliminada
- `employee-created` - Nuevo empleado creado
- `employee-updated` - Empleado actualizado
- `inventory-item-created` - Nuevo producto creado
- `inventory-item-updated` - Producto actualizado

**Ejemplo:**
```javascript
socket.on('sale-created', (sale) => {
  console.log('Nueva venta:', sale);
  // Actualizar UI
});
```

## 🚀 Despliegue en Railway

### Paso 1: Crear Cuenta en Railway

1. Ve a [railway.app](https://railway.app)
2. Crea una cuenta o inicia sesión con GitHub

### Paso 2: Crear Proyecto

1. Haz clic en "New Project"
2. Selecciona "Deploy from GitHub repo" o "Empty Project"

### Paso 3: Agregar PostgreSQL

1. En tu proyecto, haz clic en "+ New"
2. Selecciona "Database" → "PostgreSQL"
3. Railway creará automáticamente la base de datos y las variables de entorno

### Paso 4: Configurar Variables de Entorno

En Railway, ve a tu proyecto → Variables:

```
JWT_SECRET=tu_secret_muy_seguro_aqui
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://tudominio.com,https://www.tudominio.com
NODE_ENV=production
```

**Nota:** `DATABASE_URL` se configura automáticamente por Railway.

### Paso 5: Desplegar Código

**Opción A: Desde GitHub**
1. Sube el código a un repositorio de GitHub
2. En Railway, selecciona "Deploy from GitHub repo"
3. Selecciona tu repositorio y la carpeta `servidor-railway`

**Opción B: Desde CLI**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Paso 6: Ejecutar Migración

Después del primer despliegue, ejecuta la migración:

```bash
railway run npm run migrate
```

O desde la consola de Railway:
1. Ve a tu proyecto → "Deployments"
2. Abre el terminal
3. Ejecuta: `npm run migrate`

### Paso 7: Configurar Dominio (Opcional)

1. En Railway, ve a tu proyecto → "Settings" → "Networking"
2. Haz clic en "Generate Domain" o "Custom Domain"
3. Si usas dominio propio, configura el CNAME en Hostinger:
   - Tipo: CNAME
   - Nombre: api (o el subdominio que quieras)
   - Valor: [el dominio que Railway te dé]

## 🔧 Desarrollo Local

### Instalar Dependencias

```bash
cd servidor-railway
npm install
```

### Configurar Variables de Entorno

Crea un archivo `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/opal_pos
JWT_SECRET=tu_secret_local
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5500
NODE_ENV=development
```

### Ejecutar Migración

```bash
npm run migrate
```

### Iniciar Servidor

```bash
npm start
# o para desarrollo con auto-reload:
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## 📝 Notas Importantes

1. **Multi-tenancy**: Cada usuario solo puede acceder a los datos de su tienda (`branch_id`). Los admins pueden ver todas las tiendas.

2. **Seguridad**: 
   - Cambia `JWT_SECRET` en producción
   - Usa HTTPS siempre
   - Configura `CORS_ORIGIN` correctamente

3. **WebSockets**: Los usuarios solo reciben actualizaciones de su tienda (sala `branch_${branchId}`).

4. **Base de Datos**: Railway provee `DATABASE_URL` automáticamente. No necesitas configurarlo manualmente.

## 🐛 Troubleshooting

### Error: "Token inválido"
- Verifica que `JWT_SECRET` esté configurado correctamente
- Asegúrate de incluir el token en el header `Authorization: Bearer ...`

### Error: "No se puede conectar a la base de datos"
- Verifica que `DATABASE_URL` esté configurado en Railway
- Asegúrate de que PostgreSQL esté activo en Railway

### Error: "Tabla no existe"
- Ejecuta la migración: `npm run migrate`

### WebSockets no funcionan
- Verifica que Socket.io esté instalado correctamente
- Asegúrate de pasar el token en `auth.token` al conectar

## 📞 Soporte

Para problemas o preguntas, revisa los logs en Railway → Deployments → View Logs.

---

**Desarrollado para OPAL & CO POS** 🚀

