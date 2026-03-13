-- Esquema de Base de Datos para Sistema POS Opal & Co
-- PostgreSQL - Multisucursal con Tiempo Real

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsquedas de texto

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
    role VARCHAR(50) NOT NULL DEFAULT 'employee', -- employee, manager, admin, master_admin
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    branch_ids UUID[] DEFAULT ARRAY[]::UUID[], -- Para managers/admins con múltiples sucursales
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
    role VARCHAR(50) NOT NULL DEFAULT 'employee', -- employee, manager, admin, master_admin
    active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT NULL, -- permisos asignados por master_admin (array de strings)
    permissions_by_branch JSONB DEFAULT NULL, -- { "branch-uuid": ["perm1", ...], ... } permisos por sucursal
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
    subcategory VARCHAR(100), -- Subcategoría (ej. "Cubana" dentro de "Cadenas")
    collection VARCHAR(100), -- Colección (ej. "Verano 2024")
    metal VARCHAR(100),
    material VARCHAR(100), -- Material principal (Oro, Plata, Acero, etc.)
    purity VARCHAR(50), -- Ley/Pureza (10K, 14K, 18K, .925, etc.)
    plating VARCHAR(100), -- Baño (Rodio, Oro amarillo, Oro rosa, etc.)
    stone_type VARCHAR(100),
    stone_weight DECIMAL(10, 2),
    stones JSONB, -- [{type, cut, color, clarity, carats, size_mm}] - Múltiples piedras
    weight DECIMAL(10, 2),
    measurements JSONB, -- {ring_size, chain_length, bracelet_width, etc.} - Medidas específicas
    price DECIMAL(12, 2) NOT NULL DEFAULT 0, -- Precio sugerido (puede estar vacío)
    sale_price DECIMAL(12, 2), -- Precio de venta (editable por usuario, puede estar vacío)
    cost DECIMAL(12, 2) DEFAULT 0,
    discount DECIMAL(5, 2), -- Descuento (%)
    discount_amount DECIMAL(12, 2), -- Descuento (monto fijo)
    currency VARCHAR(3) DEFAULT 'MXN', -- Moneda (MXN, USD)
    margin_percent DECIMAL(5, 2), -- Margen % (calculado automáticamente)
    stock_actual INTEGER DEFAULT 0,
    stock_min INTEGER DEFAULT 0,
    stock_max INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'disponible', -- disponible, vendida, apartada, reparacion, exhibicion, reservado
    condition VARCHAR(50), -- Condición (Nuevo, Seminuevo, Exhibición)
    location_detail VARCHAR(100), -- Ubicación detallada (Vitrina 1, Caja fuerte, Taller)
    style VARCHAR(100), -- Estilo (Clásico, Minimalista, Luxury, Vintage, etc.)
    finish_type VARCHAR(100), -- Tipo de acabado (Pulido, Mate, Satinado, etc.)
    theme VARCHAR(100), -- Tema (Corazón, Cruz, Inicial, Ojo, Flor, etc.)
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    certificate_number VARCHAR(100),
    certificate_details JSONB, -- Detalles del certificado (tipo, laboratorio, etc.)
    supplier VARCHAR(255), -- Nombre del proveedor
    supplier_code VARCHAR(100), -- Código del proveedor
    notes TEXT, -- Notas generales
    photos TEXT[], -- URLs de fotos
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
    action VARCHAR(50) NOT NULL, -- entrada, salida, vendida, transferencia, etc.
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
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, completed, cancelled
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
    type VARCHAR(50) NOT NULL, -- 'fijo', 'variable'
    category VARCHAR(100), -- 'renta', 'agua', 'comisiones', 'costo_ventas', 'pago_llegadas', 'comisiones_bancarias', etc.
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    notes TEXT,
    period_type VARCHAR(50), -- 'one_time', 'daily', 'weekly', 'monthly', 'yearly'
    recurring BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_branch_id ON cost_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_date ON cost_entries(date);
CREATE INDEX IF NOT EXISTS idx_cost_entries_type ON cost_entries(type);
CREATE INDEX IF NOT EXISTS idx_cost_entries_category ON cost_entries(category);

-- Repairs (Reparaciones)
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
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
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
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'closed'
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
    type VARCHAR(50) NOT NULL, -- 'opening', 'closing', 'deposit', 'withdrawal'
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_id ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON cash_movements(created_at);

-- ============================================
-- TABLAS DE VENTAS
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
    status VARCHAR(50) DEFAULT 'completed', -- completed, cancelled, pending, reserved
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
    method VARCHAR(50) NOT NULL, -- cash_usd, cash_mxn, cash_cad, tpv_visa, tpv_amex
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    bank VARCHAR(50), -- banamex, santander
    card_type VARCHAR(50), -- national, international
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

-- Arrival Rate Rules (Tabulador maestro de llegadas)
CREATE TABLE IF NOT EXISTS arrival_rate_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    unit_type VARCHAR(50), -- 'city_tour', 'sprinter', 'van', 'truck', NULL para cualquiera
    fee_type VARCHAR(20) NOT NULL DEFAULT 'flat', -- 'flat' o 'per_passenger'
    flat_fee DECIMAL(12, 2) DEFAULT 0,
    rate_per_passenger DECIMAL(12, 2) DEFAULT 0,
    extra_per_passenger DECIMAL(12, 2) DEFAULT 0,
    min_passengers INTEGER DEFAULT 1,
    max_passengers INTEGER,
    active_from DATE NOT NULL,
    active_until DATE, -- Cambiado de active_to a active_until para consistencia
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_agency_id ON arrival_rate_rules(agency_id);
CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_branch_id ON arrival_rate_rules(branch_id);
CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_active_from ON arrival_rate_rules(active_from);
CREATE INDEX IF NOT EXISTS idx_arrival_rate_rules_active_until ON arrival_rate_rules(active_until);

-- Agregar columnas faltantes a arrival_rate_rules si la tabla ya existe con estructura antigua
DO $$ 
BEGIN
    -- Agregar fee_type si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'fee_type'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN fee_type VARCHAR(20) NOT NULL DEFAULT 'flat';
    END IF;

    -- Agregar flat_fee si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'flat_fee'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN flat_fee DECIMAL(12, 2) DEFAULT 0;
    END IF;

    -- Agregar rate_per_passenger si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'rate_per_passenger'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN rate_per_passenger DECIMAL(12, 2) DEFAULT 0;
    END IF;

    -- Agregar extra_per_passenger si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'extra_per_passenger'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN extra_per_passenger DECIMAL(12, 2) DEFAULT 0;
    END IF;

    -- Agregar min_passengers si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'min_passengers'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN min_passengers INTEGER DEFAULT 1;
    END IF;

    -- Agregar max_passengers si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'max_passengers'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN max_passengers INTEGER;
    END IF;

    -- Agregar active_from si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'active_from'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN active_from DATE NOT NULL DEFAULT CURRENT_DATE;
    END IF;

    -- Renombrar active_to a active_until si existe, o agregar active_until si no existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'active_to'
    ) THEN
        ALTER TABLE arrival_rate_rules RENAME COLUMN active_to TO active_until;
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'active_until'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN active_until DATE;
    END IF;

    -- Agregar notes si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'notes'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN notes TEXT;
    END IF;

    -- Agregar unit_type si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' AND column_name = 'unit_type'
    ) THEN
        ALTER TABLE arrival_rate_rules ADD COLUMN unit_type VARCHAR(50);
    END IF;

    -- Actualizar registros existentes que tengan fee_type NULL
    UPDATE arrival_rate_rules SET fee_type = 'flat' WHERE fee_type IS NULL;

END $$;

-- Agency Arrivals (Captura diaria oficial de llegadas)
CREATE TABLE IF NOT EXISTS agency_arrivals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE SET NULL,
    passengers INTEGER NOT NULL DEFAULT 0,
    units INTEGER,
    unit_type VARCHAR(50), -- 'cruise', 'city_tour', 'excursion', etc.
    calculated_fee DECIMAL(12, 2) DEFAULT 0,
    override BOOLEAN DEFAULT false,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agency_arrivals_date ON agency_arrivals(date);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_branch_id ON agency_arrivals(branch_id);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_agency_id ON agency_arrivals(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_arrivals_guide_id ON agency_arrivals(guide_id);

-- Tourist Reports (Reportes Turísticos Diarios)
CREATE TABLE IF NOT EXISTS tourist_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    total_pax INTEGER DEFAULT 0,
    total_sales DECIMAL(12, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'completed'
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tourist_reports_date ON tourist_reports(date);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_branch_id ON tourist_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_tourist_reports_status ON tourist_reports(status);

-- Reportes Guardados (Saved Reports)
CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(50) NOT NULL, -- 'summary', 'daily', 'seller', 'agency', 'product', 'comparative'
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    date_from DATE,
    date_to DATE,
    filters JSONB, -- Filtros aplicados (seller_id, agency_id, guide_id, status, etc.)
    report_data JSONB NOT NULL, -- Datos del reporte (totales, KPIs, detalles, etc.)
    summary JSONB, -- Resumen del reporte (totales, utilidad bruta/neta, etc.)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_report_type ON saved_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_saved_reports_branch_id ON saved_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_at ON saved_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_saved_reports_date_range ON saved_reports(date_from, date_to);

-- Capturas Rápidas (Quick Captures)
CREATE TABLE IF NOT EXISTS quick_captures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES catalog_sellers(id) ON DELETE SET NULL,
    guide_id UUID REFERENCES catalog_guides(id) ON DELETE SET NULL,
    agency_id UUID REFERENCES catalog_agencies(id) ON DELETE SET NULL,
    product VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    merchandise_cost DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    is_street BOOLEAN DEFAULT false,
    payment_method VARCHAR(50),
    payments JSONB, -- Array de pagos múltiples: [{method, amount, currency}]
    date DATE NOT NULL, -- Fecha del reporte (puede ser histórica)
    original_report_date DATE, -- Fecha original asignada (para persistencia)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sync_status VARCHAR(50) DEFAULT 'synced' -- synced, pending, error
);

CREATE INDEX IF NOT EXISTS idx_quick_captures_date ON quick_captures(date);
CREATE INDEX IF NOT EXISTS idx_quick_captures_branch_id ON quick_captures(branch_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_seller_id ON quick_captures(seller_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_guide_id ON quick_captures(guide_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_agency_id ON quick_captures(agency_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_created_at ON quick_captures(created_at);
CREATE INDEX IF NOT EXISTS idx_quick_captures_original_report_date ON quick_captures(original_report_date);

-- Reportes Archivados de Capturas Rápidas (Archived Quick Capture Reports)
CREATE TABLE IF NOT EXISTS archived_quick_capture_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Información del período
    report_date DATE NOT NULL,                    -- Fecha del reporte (día específico)
    period_type VARCHAR(50) DEFAULT 'daily',      -- 'daily' (siempre para esta tabla)
    
    -- Sucursales
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    branch_ids UUID[],                            -- Para reportes multi-sucursal (futuro)
    
    -- Totales y métricas
    total_days INTEGER DEFAULT 1,                 -- Siempre 1 para reportes diarios
    total_captures INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    total_sales_mxn DECIMAL(12, 2) DEFAULT 0,
    total_cogs DECIMAL(12, 2) DEFAULT 0,
    total_commissions DECIMAL(12, 2) DEFAULT 0,
    total_arrival_costs DECIMAL(12, 2) DEFAULT 0,
    total_operating_costs DECIMAL(12, 2) DEFAULT 0,
    variable_costs_daily DECIMAL(12, 2) DEFAULT 0,
    fixed_costs_prorated DECIMAL(12, 2) DEFAULT 0,
    bank_commissions DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    net_profit DECIMAL(12, 2) DEFAULT 0,
    
    -- Datos detallados (JSONB)
    exchange_rates JSONB,                         -- {usd: 20.0, cad: 15.0}
    captures JSONB,                              -- Array completo de capturas
    daily_summary JSONB,                         -- [{date, captures, sales, profit}]
    seller_commissions JSONB,                    -- Comisiones por vendedor
    guide_commissions JSONB,                      -- Comisiones por guía
    arrivals JSONB,                              -- Llegadas del día
    metrics JSONB,                               -- Métricas: ticket promedio y % de cierre
    
    -- Metadatos
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(report_date, branch_id)                -- Un reporte por día por sucursal
);

-- Índices para archived_quick_capture_reports
CREATE INDEX IF NOT EXISTS idx_archived_qc_reports_date ON archived_quick_capture_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_archived_qc_reports_branch_id ON archived_quick_capture_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_archived_qc_reports_archived_at ON archived_quick_capture_reports(archived_at);
CREATE INDEX IF NOT EXISTS idx_archived_qc_reports_archived_by ON archived_quick_capture_reports(archived_by);

-- Reportes Históricos de Capturas Rápidas (Historical Quick Capture Reports)
CREATE TABLE IF NOT EXISTS historical_quick_capture_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Información del período
    period_type VARCHAR(50) NOT NULL,             -- 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
    period_name VARCHAR(100),                     -- 'Enero 2024', 'Q1 2024', 'Semana 1-2024'
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    
    -- Sucursales
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    branch_ids UUID[],                            -- Para reportes multi-sucursal
    
    -- Totales agregados
    total_days INTEGER DEFAULT 0,
    total_captures INTEGER DEFAULT 0,
    total_quantity INTEGER DEFAULT 0,
    total_sales_mxn DECIMAL(12, 2) DEFAULT 0,
    total_cogs DECIMAL(12, 2) DEFAULT 0,
    total_commissions DECIMAL(12, 2) DEFAULT 0,
    total_arrival_costs DECIMAL(12, 2) DEFAULT 0,
    total_operating_costs DECIMAL(12, 2) DEFAULT 0,
    gross_profit DECIMAL(12, 2) DEFAULT 0,
    net_profit DECIMAL(12, 2) DEFAULT 0,
    
    -- Resumen día por día
    daily_summary JSONB,                          -- [{date, captures, sales_mxn, gross_profit, net_profit}]
    
    -- Referencias a reportes archivados
    archived_report_ids UUID[],                   -- IDs de archived_quick_capture_reports incluidos
    
    -- Métricas agregadas
    metrics JSONB,                                -- Métricas: ticket promedio y % de cierre (agregadas del período)
    
    -- Metadatos
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(period_type, date_from, date_to, branch_id)  -- Evitar duplicados
);

-- Índices para historical_quick_capture_reports
CREATE INDEX IF NOT EXISTS idx_historical_qc_reports_period_type ON historical_quick_capture_reports(period_type);
CREATE INDEX IF NOT EXISTS idx_historical_qc_reports_branch_id ON historical_quick_capture_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_historical_qc_reports_date_range ON historical_quick_capture_reports(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_historical_qc_reports_created_at ON historical_quick_capture_reports(created_at);

-- Tourist Report Lines (Líneas de Reportes Turísticos)
CREATE TABLE IF NOT EXISTS tourist_report_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES tourist_reports(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_report_id ON tourist_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_tourist_report_lines_sale_id ON tourist_report_lines(sale_id);

-- ============================================
-- TABLAS DE PROVEEDORES
-- ============================================

-- Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Información Básica
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    tax_id VARCHAR(50),
    barcode VARCHAR(100) UNIQUE,
    
    -- Contacto
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    whatsapp VARCHAR(50),
    website VARCHAR(255),
    facebook VARCHAR(255),
    instagram VARCHAR(255),
    business_hours VARCHAR(255),
    
    -- Dirección
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'México',
    postal_code VARCHAR(20),
    
    -- Información Comercial
    supplier_type VARCHAR(50),
    category VARCHAR(100),
    payment_terms VARCHAR(100),
    payment_methods VARCHAR(255),
    delivery_days INTEGER,
    credit_limit DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'MXN',
    relationship_start_date DATE,
    
    -- Métricas y Evaluación
    rating DECIMAL(3, 2) DEFAULT 0,
    total_purchases DECIMAL(12, 2) DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    last_purchase_date DATE,
    average_delivery_days INTEGER,
    
    -- Estado y Control
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    tags TEXT[],
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    is_shared BOOLEAN DEFAULT true,
    
    -- Información Bancaria
    bank_name VARCHAR(255),
    bank_account VARCHAR(100),
    clabe VARCHAR(18),
    account_holder VARCHAR(255),
    bank_references TEXT,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_suppliers_barcode ON suppliers(barcode);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch_id ON suppliers(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING gin(name gin_trgm_ops);

-- Contactos de Proveedores
CREATE TABLE IF NOT EXISTS supplier_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    position VARCHAR(100),
    department VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    is_primary BOOLEAN DEFAULT false,
    contact_hours VARCHAR(100),
    communication_preference VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contacts_is_primary ON supplier_contacts(is_primary);

-- ============================================
-- TABLAS AVANZADAS DE PROVEEDORES (FASE 2+)
-- ============================================

-- Contratos de Proveedores
CREATE TABLE IF NOT EXISTS supplier_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    
    -- Información del Contrato
    contract_number VARCHAR(100) UNIQUE NOT NULL,
    contract_type VARCHAR(50) NOT NULL, -- exclusividad, volumen, precio_fijo, marco
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Fechas
    start_date DATE NOT NULL,
    end_date DATE,
    renewal_date DATE, -- Fecha de renovación automática
    auto_renew BOOLEAN DEFAULT false,
    
    -- Términos
    terms_and_conditions TEXT,
    payment_terms VARCHAR(100),
    delivery_terms VARCHAR(100),
    minimum_order_amount DECIMAL(12, 2),
    discount_percentage DECIMAL(5, 2),
    
    -- Estado
    status VARCHAR(50) DEFAULT 'active', -- active, expired, cancelled, pending_renewal
    is_exclusive BOOLEAN DEFAULT false,
    
    -- Documentos
    document_urls TEXT[], -- URLs de documentos en Cloudinary/S3
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_contracts_supplier_id ON supplier_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_status ON supplier_contracts(status);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_end_date ON supplier_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_renewal_date ON supplier_contracts(renewal_date);

-- Documentos de Proveedores
CREATE TABLE IF NOT EXISTS supplier_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES supplier_contracts(id) ON DELETE SET NULL,
    
    -- Información del Documento
    document_type VARCHAR(50) NOT NULL, -- factura, contrato, certificado, garantia, nota_credito, otro
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Archivo
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL, -- URL en Cloudinary/S3 o ruta local
    file_type VARCHAR(50), -- pdf, jpg, png, docx
    file_size INTEGER, -- Tamaño en bytes
    mime_type VARCHAR(100),
    
    -- Metadatos
    issue_date DATE,
    expiration_date DATE,
    document_number VARCHAR(100),
    
    -- Estado
    status VARCHAR(50) DEFAULT 'active', -- active, expired, archived
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_documents_supplier_id ON supplier_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_contract_id ON supplier_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_type ON supplier_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_supplier_documents_expiration_date ON supplier_documents(expiration_date);

-- Órdenes de Compra
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    
    -- Información de la Orden
    order_number VARCHAR(100) UNIQUE NOT NULL,
    reference_number VARCHAR(100), -- Número de referencia del proveedor
    
    -- Fechas
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    
    -- Estado
    status VARCHAR(50) DEFAULT 'draft', -- draft, pending, sent, confirmed, in_transit, received, partial, cancelled, completed
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- Totales
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    shipping_cost DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'MXN',
    
    -- Tracking
    tracking_number VARCHAR(100),
    carrier VARCHAR(100),
    shipping_method VARCHAR(100),
    
    -- Notas
    notes TEXT,
    internal_notes TEXT, -- Notas internas (no visibles para proveedor)
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_number ON purchase_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery_date ON purchase_orders(expected_delivery_date);

-- Items de Órdenes de Compra
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL, -- Opcional: si ya existe en inventario
    
    -- Información del Item
    sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Cantidades
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    
    -- Precios
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_percentage DECIMAL(5, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) GENERATED ALWAYS AS (
        (quantity_ordered * unit_price) - discount_amount
    ) STORED,
    
    -- Estado
    status VARCHAR(50) DEFAULT 'pending', -- pending, received, partial, cancelled
    
    -- Notas
    notes TEXT,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_inventory_id ON purchase_order_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_status ON purchase_order_items(status);

-- Cuentas por Pagar
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    -- Información del Pago
    payment_type VARCHAR(50) NOT NULL, -- invoice, payment, credit_note, debit_note
    reference_number VARCHAR(100) UNIQUE NOT NULL, -- Número de factura o referencia
    
    -- Montos
    amount DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    paid_amount DECIMAL(12, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'MXN',
    
    -- Fechas
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    payment_date DATE,
    
    -- Estado
    status VARCHAR(50) DEFAULT 'pending', -- pending, partial, paid, overdue, cancelled
    payment_method VARCHAR(50), -- cash, transfer, check, credit_card
    payment_reference VARCHAR(100), -- Referencia de pago bancario
    receipt_number VARCHAR(100), -- Número de folio del recibo (último recibo generado)
    
    -- Conciliación
    bank_reconciliation_date DATE,
    bank_reconciliation_reference VARCHAR(100),
    is_reconciled BOOLEAN DEFAULT false,
    
    -- Notas
    notes TEXT,
    
    -- Documentos
    document_urls TEXT[], -- URLs de facturas/documentos
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_po_id ON supplier_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_status ON supplier_payments(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_due_date ON supplier_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_reference_number ON supplier_payments(reference_number);

-- Historial de Pagos (Desglose)
CREATE TABLE IF NOT EXISTS payment_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_payment_id UUID REFERENCES supplier_payments(id) ON DELETE CASCADE,
    
    -- Información del Pago
    payment_date DATE NOT NULL,
    payment_amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_reference VARCHAR(100),
    receipt_number VARCHAR(100) UNIQUE, -- Número de folio del recibo
    
    -- Notas
    notes TEXT,
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_invoices_payment_id ON payment_invoices(supplier_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_payment_date ON payment_invoices(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_receipt_number ON payment_invoices(receipt_number);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_branch_id ON payment_invoices(branch_id);

-- Agregar branch_id a payment_invoices si no existe (para tablas existentes)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_invoices' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE payment_invoices 
        ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_payment_invoices_branch_id ON payment_invoices(branch_id);
    END IF;
END $$;

-- Historial de Precios
CREATE TABLE IF NOT EXISTS supplier_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    -- Información del Precio
    sku VARCHAR(100),
    item_name VARCHAR(255),
    unit_price DECIMAL(12, 2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    
    -- Fecha
    price_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_price_history_supplier_id ON supplier_price_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_history_item_id ON supplier_price_history(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_history_po_id ON supplier_price_history(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_history_date ON supplier_price_history(price_date);

-- Calificaciones Avanzadas de Proveedores
CREATE TABLE IF NOT EXISTS supplier_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    
    -- Calificación
    rating DECIMAL(3, 2) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    
    -- Categorías de Calificación
    quality_rating DECIMAL(3, 2) CHECK (quality_rating >= 0 AND quality_rating <= 5),
    delivery_rating DECIMAL(3, 2) CHECK (delivery_rating >= 0 AND delivery_rating <= 5),
    price_rating DECIMAL(3, 2) CHECK (price_rating >= 0 AND price_rating <= 5),
    communication_rating DECIMAL(3, 2) CHECK (communication_rating >= 0 AND communication_rating <= 5),
    service_rating DECIMAL(3, 2) CHECK (service_rating >= 0 AND service_rating <= 5),
    
    -- Comentarios
    comment TEXT,
    
    -- Contexto
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_ratings_supplier_id ON supplier_ratings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ratings_po_id ON supplier_ratings(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ratings_date ON supplier_ratings(created_at);

-- Interacciones con Proveedores
CREATE TABLE IF NOT EXISTS supplier_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    
    -- Tipo de Interacción
    interaction_type VARCHAR(50) NOT NULL, -- call, email, meeting, visit, negotiation, complaint, other
    
    -- Información
    subject VARCHAR(255),
    description TEXT,
    outcome TEXT,
    
    -- Fechas
    interaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    follow_up_date DATE,
    
    -- Contacto relacionado
    contact_id UUID REFERENCES supplier_contacts(id) ON DELETE SET NULL,
    
    -- Estado
    status VARCHAR(50) DEFAULT 'completed', -- scheduled, completed, cancelled, rescheduled
    
    -- Multisucursal
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    
    -- Auditoría
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_interactions_supplier_id ON supplier_interactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_interactions_type ON supplier_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_supplier_interactions_date ON supplier_interactions(interaction_date);
CREATE INDEX IF NOT EXISTS idx_supplier_interactions_contact_id ON supplier_interactions(contact_id);

-- Agregar supplier_id a inventory_items si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_items' AND column_name = 'supplier_id'
    ) THEN
        ALTER TABLE inventory_items 
        ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
        
        CREATE INDEX idx_inventory_items_supplier_id ON inventory_items(supplier_id);
    END IF;
END $$;

-- Agregar supplier_id a cost_entries si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cost_entries' AND column_name = 'supplier_id'
    ) THEN
        ALTER TABLE cost_entries 
        ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
        
        CREATE INDEX idx_cost_entries_supplier_id ON cost_entries(supplier_id);
    END IF;
END $$;

-- ============================================
-- TABLAS DE AUDITORÍA
-- ============================================

-- Log de Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================
-- TRIGGERS PARA UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger a todas las tablas con updated_at
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cost_entries_updated_at BEFORE UPDATE ON cost_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repairs_updated_at BEFORE UPDATE ON repairs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cash_sessions_updated_at BEFORE UPDATE ON cash_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_arrival_rate_rules_updated_at BEFORE UPDATE ON arrival_rate_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agency_arrivals_updated_at BEFORE UPDATE ON agency_arrivals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tourist_reports_updated_at BEFORE UPDATE ON tourist_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_reports_updated_at BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quick_captures_updated_at BEFORE UPDATE ON quick_captures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_archived_qc_reports_updated_at BEFORE UPDATE ON archived_quick_capture_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_historical_qc_reports_updated_at BEFORE UPDATE ON historical_quick_capture_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRACIONES: Agregar columnas faltantes si no existen
-- ============================================

-- Agregar columna daily_summary a archived_quick_capture_reports si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'archived_quick_capture_reports' 
        AND column_name = 'daily_summary'
    ) THEN
        ALTER TABLE archived_quick_capture_reports 
        ADD COLUMN daily_summary JSONB;
        
        RAISE NOTICE 'Columna daily_summary agregada a archived_quick_capture_reports';
    END IF;
END $$;

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Usuario administrador maestro se crea automáticamente al iniciar el servidor
-- Ver backend/server.js y backend/routes/auth.js para detalles
-- Username: admin, PIN: 1234, Rol: master_admin
