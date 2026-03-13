-- Script de migración directa para Railway
-- Ejecutar con: railway connect postgres -c "psql < migrate-direct.sql"
-- O desde SSH: railway ssh --service Sistema-Oficial "cd /app && psql $DATABASE_URL < scripts/migrate-direct.sql"

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- TABLAS DE CONFIGURACIÓN Y CATÁLOGOS
-- ============================================

-- Sucursales
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(active);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);

-- Empleados
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    branch_ids UUID[] DEFAULT ARRAY[]::UUID[],
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_barcode ON employees(barcode);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active);
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);

-- Usuarios (login)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Catálogo de Agencias
CREATE TABLE IF NOT EXISTS catalog_agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_agencies_barcode ON catalog_agencies(barcode);
CREATE INDEX IF NOT EXISTS idx_catalog_agencies_active ON catalog_agencies(active);

-- Catálogo de Guías
CREATE TABLE IF NOT EXISTS catalog_guides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_guides_barcode ON catalog_guides(barcode);
CREATE INDEX IF NOT EXISTS idx_catalog_guides_agency_id ON catalog_guides(agency_id);

-- Catálogo de Vendedores
CREATE TABLE IF NOT EXISTS catalog_sellers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_sellers_barcode ON catalog_sellers(barcode);

-- ============================================
-- TABLAS DE CLIENTES (debe crearse antes de repairs y sales)
-- ============================================

-- Clientes
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    notes TEXT,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);

-- Agregar branch_id a customers si la tabla ya existe pero no tiene la columna
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE customers ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
        RAISE NOTICE '✅ Columna branch_id agregada a customers';
    END IF;
END $$;

-- ============================================
-- TABLAS DE INVENTARIO
-- ============================================

-- Items de Inventario
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    metal VARCHAR(100),
    stone_type VARCHAR(100),
    stone_weight DECIMAL(10, 2),
    weight DECIMAL(10, 2),
    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    cost DECIMAL(12, 2) DEFAULT 0,
    stock_actual INTEGER DEFAULT 0,
    stock_min INTEGER DEFAULT 0,
    stock_max INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'disponible',
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    certificate_number VARCHAR(100),
    photos TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_id ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name_trgm ON inventory_items USING gin(name gin_trgm_ops);

-- Logs de Inventario
CREATE TABLE IF NOT EXISTS inventory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    stock_before INTEGER,
    stock_after INTEGER,
    reason VARCHAR(100),
    notes TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_id ON inventory_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);

-- Transferencias entre Sucursales
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    to_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from_branch ON inventory_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to_branch ON inventory_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);

-- Items de Transferencias
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID REFERENCES inventory_transfers(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_transfer_id ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_item_id ON inventory_transfer_items(item_id);

-- Cost Entries (Costos y Gastos)
CREATE TABLE IF NOT EXISTS cost_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    notes TEXT,
    period_type VARCHAR(50),
    recurring BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_branch_id ON cost_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_date ON cost_entries(date);
CREATE INDEX IF NOT EXISTS idx_cost_entries_type ON cost_entries(type);
CREATE INDEX IF NOT EXISTS idx_cost_entries_category ON cost_entries(category);

-- Repairs (Reparaciones) - Ahora customers ya existe
CREATE TABLE IF NOT EXISTS repairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio VARCHAR(100) UNIQUE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    estimated_cost DECIMAL(12, 2) DEFAULT 0,
    actual_cost DECIMAL(12, 2) DEFAULT 0,
    estimated_delivery_date DATE,
    completed_date DATE,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_repairs_folio ON repairs(folio);
CREATE INDEX IF NOT EXISTS idx_repairs_branch_id ON repairs(branch_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_customer_id ON repairs(customer_id);

-- Repair Photos (Fotos de Reparaciones)
CREATE TABLE IF NOT EXISTS repair_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID REFERENCES repairs(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_repair_photos_repair_id ON repair_photos(repair_id);

-- Cash Sessions (Aperturas/Cierres de Caja)
CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    initial_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    final_amount DECIMAL(12, 2),
    difference DECIMAL(12, 2),
    status VARCHAR(50) DEFAULT 'open',
    notes TEXT,
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_id ON cash_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_id ON cash_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_date ON cash_sessions(date);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);

-- Cash Movements (Movimientos de Efectivo)
CREATE TABLE IF NOT EXISTS cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES cash_sessions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON cash_movements(created_at);

-- ============================================
-- TABLAS DE VENTAS - Ahora customers ya existe
-- ============================================

-- Ventas
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio VARCHAR(100) UNIQUE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES catalog_sellers(id) ON DELETE SET NULL,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE SET NULL,
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_folio ON sales(folio);
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_seller_id ON sales(seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_guide_id ON sales(guide_id);
CREATE INDEX IF NOT EXISTS idx_sales_agency_id ON sales(agency_id);

-- Items de Venta
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    sku VARCHAR(100),
    name VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    subtotal DECIMAL(12, 2) NOT NULL,
    guide_commission DECIMAL(12, 2) DEFAULT 0,
    seller_commission DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_item_id ON sale_items(item_id);

-- Pagos
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    method VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    bank VARCHAR(50),
    card_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);

-- ============================================
-- TABLAS DE REPORTES Y ANALÍTICAS
-- ============================================

-- Reportes de Utilidad Diaria
CREATE TABLE IF NOT EXISTS daily_profit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    total_sales DECIMAL(12, 2) DEFAULT 0,
    total_cogs DECIMAL(12, 2) DEFAULT 0,
    total_commissions DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    net_profit DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_profit_reports_date ON daily_profit_reports(date);
CREATE INDEX IF NOT EXISTS idx_daily_profit_reports_branch_id ON daily_profit_reports(branch_id);

-- Tipos de Cambio Diarios
CREATE TABLE IF NOT EXISTS exchange_rates_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL,
    usd_to_mxn DECIMAL(10, 4) NOT NULL,
    cad_to_mxn DECIMAL(10, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_daily_date ON exchange_rates_daily(date);

-- Reglas de Tasa de Llegada
CREATE TABLE IF NOT EXISTS arrival_rate_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE CASCADE,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE CASCADE,
    rate_percent DECIMAL(5, 2) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_agency_id ON arrival_rate_rules(agency_id);
CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_guide_id ON arrival_rate_rules(guide_id);

-- Llegadas de Agencias
CREATE TABLE IF NOT EXISTS agency_arrivals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    passengers INTEGER DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agency_arrivals_agency_id ON agency_arrivals(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_guide_id ON agency_arrivals(guide_id);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_date ON agency_arrivals(date);

-- Reportes Turísticos
CREATE TABLE IF NOT EXISTS tourist_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE SET NULL,
    total_passengers INTEGER DEFAULT 0,
    total_sales DECIMAL(12, 2) DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tourist_reports_date ON tourist_reports(date);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_branch_id ON tourist_reports(branch_id);

-- Líneas de Reportes Turísticos
CREATE TABLE IF NOT EXISTS tourist_report_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES tourist_reports(id) ON DELETE CASCADE,
    item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(12, 2) DEFAULT 0,
    subtotal DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_report_id ON tourist_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_item_id ON tourist_report_lines(item_id);

-- ============================================
-- TABLAS DE AUDITORÍA
-- ============================================

-- Logs de Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at (aplicar a todas las tablas que lo necesiten)
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'branches', 'employees', 'users', 'catalog_agencies', 'catalog_guides', 
            'catalog_sellers', 'customers', 'inventory_items', 'inventory_transfers',
            'cost_entries', 'repairs', 'cash_sessions', 'sales', 'daily_profit_reports',
            'exchange_rates_daily', 'arrival_rate_rules', 'agency_arrivals', 'tourist_reports'
        )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', tbl.table_name, tbl.table_name);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl.table_name, tbl.table_name);
    END LOOP;
END $$;

-- Mensaje de éxito
DO $$
BEGIN
    RAISE NOTICE '✅ Migración completada exitosamente';
END $$;
