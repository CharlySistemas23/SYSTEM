-- Esquema de Base de Datos PostgreSQL para OPAL & CO POS
-- Multi-tenant: Cada tienda separada por branch_id

-- Tabla de sucursales/tiendas
CREATE TABLE IF NOT EXISTS catalog_branches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de usuarios (con branch_id)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255),
    branch_id VARCHAR(255),
    role VARCHAR(50) DEFAULT 'seller',
    permissions JSONB DEFAULT '[]',
    active BOOLEAN DEFAULT true,
    pin_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

-- Tabla de empleados (con branch_id)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'seller',
    branch_id VARCHAR(255),
    barcode VARCHAR(100),
    employee_code VARCHAR(100),
    active BOOLEAN DEFAULT true,
    salary DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

-- Tabla de ventas (con branch_id)
CREATE TABLE IF NOT EXISTS sales (
    id VARCHAR(255) PRIMARY KEY,
    folio VARCHAR(100) UNIQUE,
    branch_id VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255),
    seller_id VARCHAR(255),
    guide_id VARCHAR(255),
    agency_id VARCHAR(255),
    customer_id VARCHAR(255),
    passengers INTEGER DEFAULT 1,
    currency VARCHAR(10) DEFAULT 'MXN',
    exchange_rate DECIMAL(10, 4) DEFAULT 1,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    seller_commission DECIMAL(10, 2) DEFAULT 0,
    guide_commission DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completada',
    notes TEXT,
    cart_data JSONB,
    device_id VARCHAR(255),
    sync_status VARCHAR(50) DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de items de venta
CREATE TABLE IF NOT EXISTS sale_items (
    id VARCHAR(255) PRIMARY KEY,
    sale_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255),
    inventory_item_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10, 2) DEFAULT 0,
    cost DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    commission DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Tabla de métodos de pago
CREATE TABLE IF NOT EXISTS sale_payments (
    id VARCHAR(255) PRIMARY KEY,
    sale_id VARCHAR(255) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'MXN',
    bank VARCHAR(100),
    payment_type VARCHAR(50),
    bank_commission DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Tabla de inventario (con branch_id)
CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR(255) PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metal VARCHAR(100),
    stone VARCHAR(100),
    size VARCHAR(50),
    weight DECIMAL(10, 2),
    dimensions VARCHAR(100),
    cost DECIMAL(10, 2) DEFAULT 0,
    price DECIMAL(10, 2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    branch_id VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'disponible',
    device_id VARCHAR(255),
    sync_status VARCHAR(50) DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    branch_id VARCHAR(255),
    sync_status VARCHAR(50) DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

-- Tabla de catálogos (con branch_id opcional)
CREATE TABLE IF NOT EXISTS catalog_sellers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255),
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS catalog_guides (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    agency_id VARCHAR(255),
    branch_id VARCHAR(255),
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS catalog_agencies (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255),
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

-- Tabla de reglas de comisión
CREATE TABLE IF NOT EXISTS commission_rules (
    id VARCHAR(255) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    branch_id VARCHAR(255),
    discount_pct DECIMAL(5, 2) DEFAULT 0,
    multiplier DECIMAL(5, 2) DEFAULT 1,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de costos (con branch_id)
CREATE TABLE IF NOT EXISTS cost_entries (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    amount DECIMAL(10, 2) NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    device_id VARCHAR(255),
    sync_status VARCHAR(50) DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de sesiones de caja (con branch_id)
CREATE TABLE IF NOT EXISTS cash_sessions (
    id VARCHAR(255) PRIMARY KEY,
    branch_id VARCHAR(255) NOT NULL,
    employee_id VARCHAR(255) NOT NULL,
    initial_amount DECIMAL(10, 2) DEFAULT 0,
    final_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'open',
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_cost_entries_branch_id ON cost_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_date ON cost_entries(date);
