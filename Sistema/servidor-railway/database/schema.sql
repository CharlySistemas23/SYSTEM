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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_branch_name UNIQUE (name)
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

-- Tabla de movimientos de efectivo
CREATE TABLE IF NOT EXISTS cash_movements (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
);

-- Tabla de tipos de cambio diarios
CREATE TABLE IF NOT EXISTS exchange_rates_daily (
    id VARCHAR(255) PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    usd DECIMAL(10, 4) NOT NULL DEFAULT 20.00,
    cad DECIMAL(10, 4) NOT NULL DEFAULT 15.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de reglas de tarifas de llegadas
CREATE TABLE IF NOT EXISTS arrival_rate_rules (
    id VARCHAR(255) PRIMARY KEY,
    agency_id VARCHAR(255),
    branch_id VARCHAR(255),
    min_passengers INTEGER NOT NULL,
    max_passengers INTEGER,
    unit_type VARCHAR(50),
    rate_per_passenger DECIMAL(10, 2) DEFAULT 0,
    fee_type VARCHAR(50) DEFAULT 'per_passenger',
    flat_fee DECIMAL(10, 2) DEFAULT 0,
    extra_per_passenger DECIMAL(10, 2) DEFAULT 0,
    active_from DATE NOT NULL,
    active_until DATE,
    notes TEXT,
    sync_status VARCHAR(50) DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES catalog_agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de llegadas de agencias (captura diaria)
CREATE TABLE IF NOT EXISTS agency_arrivals (
    id VARCHAR(255) PRIMARY KEY,
    date DATE NOT NULL,
    agency_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    passengers INTEGER NOT NULL DEFAULT 0,
    unit_type VARCHAR(50),
    arrival_fee DECIMAL(10, 2) DEFAULT 0,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES catalog_agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de reparaciones
CREATE TABLE IF NOT EXISTS repairs (
    id VARCHAR(255) PRIMARY KEY,
    folio VARCHAR(100) UNIQUE,
    inventory_item_id VARCHAR(255),
    branch_id VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    description TEXT NOT NULL,
    cost DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pendiente',
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    delivered_at TIMESTAMP,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de fotos de reparaciones
CREATE TABLE IF NOT EXISTS repair_photos (
    id VARCHAR(255) PRIMARY KEY,
    repair_id VARCHAR(255) NOT NULL,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE
);

-- Tabla de transferencias entre sucursales
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id VARCHAR(255) PRIMARY KEY,
    transfer_number VARCHAR(100) UNIQUE,
    from_branch_id VARCHAR(255) NOT NULL,
    to_branch_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    received_at TIMESTAMP,
    FOREIGN KEY (from_branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE,
    FOREIGN KEY (to_branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de items de transferencias
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id VARCHAR(255) PRIMARY KEY,
    transfer_id VARCHAR(255) NOT NULL,
    inventory_item_id VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

-- Tabla de fotos de inventario
CREATE TABLE IF NOT EXISTS inventory_photos (
    id VARCHAR(255) PRIMARY KEY,
    inventory_item_id VARCHAR(255) NOT NULL,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

-- Tabla de certificados de inventario
CREATE TABLE IF NOT EXISTS inventory_certificates (
    id VARCHAR(255) PRIMARY KEY,
    inventory_item_id VARCHAR(255) NOT NULL,
    certificate_number VARCHAR(255) UNIQUE,
    certificate_type VARCHAR(100),
    issuer VARCHAR(255),
    issue_date DATE,
    certificate_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

-- Tabla de reportes turísticos
CREATE TABLE IF NOT EXISTS tourist_reports (
    id VARCHAR(255) PRIMARY KEY,
    folio VARCHAR(100) UNIQUE,
    date DATE NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    total_sales DECIMAL(10, 2) DEFAULT 0,
    total_commissions DECIMAL(10, 2) DEFAULT 0,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
);

-- Tabla de líneas de reportes turísticos
CREATE TABLE IF NOT EXISTS tourist_report_lines (
    id VARCHAR(255) PRIMARY KEY,
    report_id VARCHAR(255) NOT NULL,
    sale_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES tourist_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de métodos de pago configurados
CREATE TABLE IF NOT EXISTS payment_methods (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    requires_bank BOOLEAN DEFAULT false,
    requires_type BOOLEAN DEFAULT false,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de presupuestos mensuales (opcional - mejora)
CREATE TABLE IF NOT EXISTS budget_entries (
    id VARCHAR(255) PRIMARY KEY,
    branch_id VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    category VARCHAR(100) NOT NULL,
    budgeted_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE,
    UNIQUE(branch_id, year, month, category)
);

-- Tabla de reportes de utilidad diaria (opcional - mejora)
CREATE TABLE IF NOT EXISTS daily_profit_reports (
    id VARCHAR(255) PRIMARY KEY,
    date DATE NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    revenue DECIMAL(10, 2) DEFAULT 0,
    cogs DECIMAL(10, 2) DEFAULT 0,
    commissions DECIMAL(10, 2) DEFAULT 0,
    costs DECIMAL(10, 2) DEFAULT 0,
    profit DECIMAL(10, 2) DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE,
    UNIQUE(date, branch_id)
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
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_id ON cash_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(type);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates_daily(date);
CREATE INDEX IF NOT EXISTS idx_arrival_rules_agency_id ON arrival_rate_rules(agency_id);
CREATE INDEX IF NOT EXISTS idx_arrival_rules_branch_id ON arrival_rate_rules(branch_id);
CREATE INDEX IF NOT EXISTS idx_arrival_rules_active_from ON arrival_rate_rules(active_from);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_date ON agency_arrivals(date);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_agency_id ON agency_arrivals(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_branch_id ON agency_arrivals(branch_id);
CREATE INDEX IF NOT EXISTS idx_repairs_branch_id ON repairs(branch_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_folio ON repairs(folio);
CREATE INDEX IF NOT EXISTS idx_repair_photos_repair_id ON repair_photos(repair_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from_branch ON inventory_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to_branch ON inventory_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_transfer_id ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_item_id ON inventory_transfer_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_photos_item_id ON inventory_photos(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_certificates_item_id ON inventory_certificates(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_certificates_number ON inventory_certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_date ON tourist_reports(date);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_branch_id ON tourist_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_status ON tourist_reports(status);
CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_report_id ON tourist_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_sale_id ON tourist_report_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_branch_date ON budget_entries(branch_id, year, month);
CREATE INDEX IF NOT EXISTS idx_daily_profit_reports_date ON daily_profit_reports(date);
CREATE INDEX IF NOT EXISTS idx_daily_profit_reports_branch_id ON daily_profit_reports(branch_id);

-- Índices compuestos para consultas frecuentes (mejora rendimiento)
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON sales(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_branch_status ON sales(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_employee_date ON sales(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_seller_date ON sales(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_guide_date ON sales(guide_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_agency_date ON sales(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory_id ON sale_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_status ON inventory_items(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_sku ON inventory_items(branch_id, sku);
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_entries_branch_date ON cost_entries(branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_cost_entries_type ON cost_entries(type);
CREATE INDEX IF NOT EXISTS idx_commission_rules_branch ON commission_rules(branch_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_entity ON commission_rules(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON commission_rules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_catalog_sellers_branch ON catalog_sellers(branch_id);
CREATE INDEX IF NOT EXISTS idx_catalog_guides_branch ON catalog_guides(branch_id);
CREATE INDEX IF NOT EXISTS idx_catalog_guides_agency ON catalog_guides(agency_id);
CREATE INDEX IF NOT EXISTS idx_catalog_agencies_branch ON catalog_agencies(branch_id);
CREATE INDEX IF NOT EXISTS idx_repairs_branch_status ON repairs(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_repairs_customer ON repairs(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_branch_status ON inventory_transfers(from_branch_id, status);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_branch_date ON tourist_reports(branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_branch_status ON tourist_reports(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_status ON cash_sessions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_opened ON cash_sessions(branch_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_type ON cash_movements(session_id, type);
CREATE INDEX IF NOT EXISTS idx_employees_branch_role ON employees(branch_id, role);
CREATE INDEX IF NOT EXISTS idx_employees_barcode ON employees(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date_desc ON exchange_rates_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_budget_entries_branch_year_month ON budget_entries(branch_id, year, month);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_branch_date ON agency_arrivals(branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_agency_date ON agency_arrivals(agency_id, date DESC);