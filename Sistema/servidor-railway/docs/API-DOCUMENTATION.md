# 📚 Documentación de API

## 🔐 Autenticación

### Login
**POST** `/api/auth/login`

**Body:**
```json
{
  "username": "string",
  "password": "string",
  "pin": "string (opcional)"
}
```

**Respuesta:**
```json
{
  "success": true,
  "token": "jwt_token",
  "user": {
    "id": "string",
    "username": "string",
    "role": "string",
    "branchId": "string"
  }
}
```

### Logout
**POST** `/api/auth/logout`

**Headers:**
- `Authorization: Bearer {token}`

---

## 📦 Inventario

### Obtener todos los productos
**GET** `/api/inventory`

**Query Parameters:**
- `status` (opcional): Filtrar por estado
- `sku` (opcional): Buscar por SKU
- `barcode` (opcional): Buscar por código de barras
- `search` (opcional): Búsqueda general
- `branchId` (opcional): Filtrar por sucursal (solo admin)
- `limit` (opcional): Límite de resultados (default: 1000)
- `offset` (opcional): Offset para paginación

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "sku": "string",
      "name": "string",
      "cost": 0,
      "price": 0,
      "stock_actual": 0,
      "status": "string",
      "branch_id": "string"
    }
  ],
  "count": 0
}
```

### Crear producto
**POST** `/api/inventory`

**Body:**
```json
{
  "sku": "string (requerido)",
  "name": "string (requerido)",
  "metal": "string",
  "stone": "string",
  "size": "string",
  "weight": 0,
  "cost": 0,
  "price": 0,
  "location": "string",
  "status": "string"
}
```

### Actualizar producto
**PUT** `/api/inventory/:id`

**Body:** (mismos campos que crear)

### Eliminar producto
**DELETE** `/api/inventory/:id`

---

## 💰 Ventas

### Obtener todas las ventas
**GET** `/api/sales`

**Query Parameters:**
- `dateFrom` (opcional): Fecha desde (YYYY-MM-DD)
- `dateTo` (opcional): Fecha hasta (YYYY-MM-DD)
- `status` (opcional): Filtrar por estado
- `sellerId` (opcional): Filtrar por vendedor
- `guideId` (opcional): Filtrar por guía
- `branchId` (opcional): Filtrar por sucursal (solo admin)
- `limit` (opcional): Límite de resultados
- `offset` (opcional): Offset para paginación

### Crear venta
**POST** `/api/sales`

**Body:**
```json
{
  "folio": "string",
  "items": [
    {
      "inventoryItemId": "string",
      "quantity": 1,
      "price": 0
    }
  ],
  "payments": [
    {
      "method": "string",
      "amount": 0
    }
  ],
  "sellerId": "string",
  "guideId": "string",
  "customerId": "string",
  "total": 0
}
```

---

## 👥 Clientes

### Obtener todos los clientes
**GET** `/api/customers`

**Query Parameters:**
- `search` (opcional): Búsqueda por nombre, email o teléfono
- `limit` (opcional): Límite de resultados
- `offset` (opcional): Offset para paginación

### Crear cliente
**POST** `/api/customers`

**Body:**
```json
{
  "name": "string (requerido)",
  "email": "string",
  "phone": "string",
  "address": "string",
  "notes": "string"
}
```

---

## 👨‍💼 Empleados

### Obtener todos los empleados
**GET** `/api/employees`

**Query Parameters:**
- `branchId` (opcional): Filtrar por sucursal (solo admin)

### Crear empleado
**POST** `/api/employees`

**Body:**
```json
{
  "name": "string (requerido)",
  "role": "string",
  "barcode": "string",
  "active": true
}
```

---

## 💵 Costos

### Obtener todos los costos
**GET** `/api/costs`

**Query Parameters:**
- `dateFrom` (opcional): Fecha desde
- `dateTo` (opcional): Fecha hasta
- `type` (opcional): Tipo de costo
- `branchId` (opcional): Filtrar por sucursal

### Crear costo
**POST** `/api/costs`

**Body:**
```json
{
  "type": "string (requerido)",
  "category": "string",
  "amount": 0 (requerido),
  "date": "YYYY-MM-DD (requerido)",
  "notes": "string"
}
```

---

## 🔧 Reparaciones

### Obtener todas las reparaciones
**GET** `/api/repairs`

**Query Parameters:**
- `status` (opcional): Filtrar por estado
- `branchId` (opcional): Filtrar por sucursal

### Crear reparación
**POST** `/api/repairs`

**Body:**
```json
{
  "inventory_item_id": "string",
  "customer_name": "string",
  "description": "string (requerido)",
  "cost": 0,
  "status": "string"
}
```

---

## ⚙️ Configuración

### Obtener reglas de comisión
**GET** `/api/settings/commission-rules`

### Crear regla de comisión
**POST** `/api/settings/commission-rules`

**Body:**
```json
{
  "entity_type": "seller|guide|agency",
  "entity_id": "string",
  "discount_pct": 0,
  "multiplier": 1
}
```

---

## 🔒 Seguridad

### Rate Limiting
- **General**: 1000 requests / 15 minutos
- **Autenticación**: 5 intentos / 15 minutos
- **Operaciones sensibles**: 30 operaciones / minuto

### CSRF Protection
- Obtener token: **GET** `/api/csrf-token`
- Incluir en headers: `X-CSRF-Token: {token}`
- Tokens expiran en 1 hora

### Sanitización
- Todos los inputs son sanitizados automáticamente
- Query parameters sanitizados globalmente
- Body sanitizado en todas las rutas POST/PUT

---

## 📊 Códigos de Estado HTTP

- `200`: Éxito
- `201`: Creado
- `400`: Error de validación
- `401`: No autenticado
- `403`: Sin permisos / CSRF inválido
- `404`: No encontrado
- `429`: Demasiadas peticiones (rate limit)
- `500`: Error del servidor

---

## 🔄 WebSockets

### Eventos Emitidos
- `sale-created`: Nueva venta creada
- `sale-updated`: Venta actualizada
- `inventory-item-created`: Producto creado
- `inventory-item-updated`: Producto actualizado
- `customer-created`: Cliente creado
- `employee-created`: Empleado creado

### Conectar
```javascript
const socket = io('https://tu-servidor.com', {
  auth: {
    token: 'jwt_token'
  }
});
```

---

**Última actualización**: 2025-01-09
