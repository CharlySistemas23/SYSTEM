-- Script para crear la tabla quick_captures en la base de datos
-- Ejecutar este script en Railway o en la base de datos PostgreSQL

-- Crear tabla quick_captures si no existe
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

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_quick_captures_date ON quick_captures(date);
CREATE INDEX IF NOT EXISTS idx_quick_captures_branch_id ON quick_captures(branch_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_seller_id ON quick_captures(seller_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_guide_id ON quick_captures(guide_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_agency_id ON quick_captures(agency_id);
CREATE INDEX IF NOT EXISTS idx_quick_captures_created_at ON quick_captures(created_at);
CREATE INDEX IF NOT EXISTS idx_quick_captures_original_report_date ON quick_captures(original_report_date);

-- Crear trigger para updated_at
CREATE TRIGGER update_quick_captures_updated_at BEFORE UPDATE ON quick_captures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Tabla quick_captures creada exitosamente';
END $$;
