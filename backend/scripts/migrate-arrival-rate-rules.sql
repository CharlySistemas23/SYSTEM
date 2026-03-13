-- Migración para actualizar tabla arrival_rate_rules
-- Agregar columnas faltantes: fee_type, flat_fee, rate_per_passenger, extra_per_passenger, etc.

-- Verificar si la tabla existe antes de agregar columnas
DO $$ 
BEGIN
    -- Agregar fee_type si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'fee_type'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN fee_type VARCHAR(20) NOT NULL DEFAULT 'flat';
        RAISE NOTICE 'Columna fee_type agregada';
    ELSE
        RAISE NOTICE 'Columna fee_type ya existe';
    END IF;

    -- Agregar flat_fee si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'flat_fee'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN flat_fee DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna flat_fee agregada';
    ELSE
        RAISE NOTICE 'Columna flat_fee ya existe';
    END IF;

    -- Agregar rate_per_passenger si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'rate_per_passenger'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN rate_per_passenger DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna rate_per_passenger agregada';
    ELSE
        RAISE NOTICE 'Columna rate_per_passenger ya existe';
    END IF;

    -- Agregar extra_per_passenger si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'extra_per_passenger'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN extra_per_passenger DECIMAL(12, 2) DEFAULT 0;
        RAISE NOTICE 'Columna extra_per_passenger agregada';
    ELSE
        RAISE NOTICE 'Columna extra_per_passenger ya existe';
    END IF;

    -- Agregar min_passengers si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'min_passengers'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN min_passengers INTEGER DEFAULT 1;
        RAISE NOTICE 'Columna min_passengers agregada';
    ELSE
        RAISE NOTICE 'Columna min_passengers ya existe';
    END IF;

    -- Agregar max_passengers si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'max_passengers'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN max_passengers INTEGER;
        RAISE NOTICE 'Columna max_passengers agregada';
    ELSE
        RAISE NOTICE 'Columna max_passengers ya existe';
    END IF;

    -- Agregar active_from si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'active_from'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN active_from DATE NOT NULL DEFAULT CURRENT_DATE;
        RAISE NOTICE 'Columna active_from agregada';
    ELSE
        RAISE NOTICE 'Columna active_from ya existe';
    END IF;

    -- Agregar active_until si no existe (renombrar active_to si existe)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'active_to'
    ) THEN
        -- Renombrar active_to a active_until
        ALTER TABLE arrival_rate_rules 
        RENAME COLUMN active_to TO active_until;
        RAISE NOTICE 'Columna active_to renombrada a active_until';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'active_until'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN active_until DATE;
        RAISE NOTICE 'Columna active_until agregada';
    ELSE
        RAISE NOTICE 'Columna active_until ya existe';
    END IF;

    -- Agregar notes si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN notes TEXT;
        RAISE NOTICE 'Columna notes agregada';
    ELSE
        RAISE NOTICE 'Columna notes ya existe';
    END IF;

    -- Agregar unit_type si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'arrival_rate_rules' 
        AND column_name = 'unit_type'
    ) THEN
        ALTER TABLE arrival_rate_rules 
        ADD COLUMN unit_type VARCHAR(50);
        RAISE NOTICE 'Columna unit_type agregada';
    ELSE
        RAISE NOTICE 'Columna unit_type ya existe';
    END IF;

    -- Remover NOT NULL de fee_type después de agregar datos por defecto
    -- (ya lo agregamos como NOT NULL con DEFAULT, pero por si acaso)
    ALTER TABLE arrival_rate_rules 
    ALTER COLUMN fee_type DROP NOT NULL,
    ALTER COLUMN fee_type SET DEFAULT 'flat';

    -- Actualizar registros existentes que tengan fee_type NULL
    UPDATE arrival_rate_rules 
    SET fee_type = 'flat' 
    WHERE fee_type IS NULL;

    -- Volver a poner NOT NULL si es necesario
    ALTER TABLE arrival_rate_rules 
    ALTER COLUMN fee_type SET NOT NULL;

END $$;

-- Verificar que todas las columnas estén presentes
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'arrival_rate_rules' 
ORDER BY ordinal_position;
