-- Script para agregar branch_id a la tabla customers si no existe
-- Ejecutar: railway run --service=<ID_BACKEND> psql $DATABASE_URL -f scripts/add-branch-id-to-customers.sql

-- Agregar branch_id a customers si no existe
DO $$
BEGIN
    -- Verificar si la columna branch_id existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'customers' 
        AND column_name = 'branch_id'
    ) THEN
        -- Agregar la columna
        ALTER TABLE customers 
        ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
        
        -- Crear índice
        CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
        
        RAISE NOTICE '✅ Columna branch_id agregada a customers exitosamente';
    ELSE
        RAISE NOTICE 'ℹ️  La columna branch_id ya existe en customers';
    END IF;
END $$;
