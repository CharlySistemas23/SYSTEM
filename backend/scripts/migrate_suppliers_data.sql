-- =====================================================
-- SCRIPT DE MIGRACIÓN: Proveedores desde datos existentes
-- =====================================================
-- Este script migra proveedores desde campos legacy en inventory_items
-- y actualiza las referencias en inventory_items y cost_entries
--
-- Fecha: 2025-01-20
-- Versión: 1.0
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: Crear proveedores desde inventory_items.supplier
-- =====================================================
-- Extrae proveedores únicos del campo 'supplier' en inventory_items
-- y crea registros en la tabla suppliers

INSERT INTO suppliers (
    id,
    code,
    name,
    legal_name,
    supplier_type,
    category,
    status,
    branch_id,
    is_shared,
    created_at,
    updated_at
)
SELECT DISTINCT ON (LOWER(TRIM(supplier)))
    gen_random_uuid() as id,
    -- Generar código único basado en nombre
    UPPER(SUBSTRING(REGEXP_REPLACE(TRIM(supplier), '[^a-zA-Z0-9]', '', 'g'), 1, 10)) || 
    LPAD(ROW_NUMBER() OVER (ORDER BY LOWER(TRIM(supplier)))::text, 4, '0') as code,
    TRIM(supplier) as name,
    NULL as legal_name,
    NULL as supplier_type,
    NULL as category,
    'active' as status,
    -- Usar branch_id del item o NULL si no tiene
    MAX(i.branch_id) as branch_id,
    true as is_shared, -- Compartir por defecto
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM inventory_items i
WHERE 
    supplier IS NOT NULL 
    AND TRIM(supplier) != ''
    AND NOT EXISTS (
        SELECT 1 FROM suppliers s 
        WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(i.supplier))
    )
GROUP BY LOWER(TRIM(supplier))
ORDER BY LOWER(TRIM(supplier));

-- =====================================================
-- PASO 2: Actualizar inventory_items con supplier_id
-- =====================================================
-- Actualiza el campo supplier_id en inventory_items
-- basándose en la coincidencia del nombre

UPDATE inventory_items i
SET 
    supplier_id = s.id,
    updated_at = CURRENT_TIMESTAMP
FROM suppliers s
WHERE 
    i.supplier IS NOT NULL
    AND TRIM(i.supplier) != ''
    AND LOWER(TRIM(i.supplier)) = LOWER(TRIM(s.name))
    AND i.supplier_id IS NULL;

-- =====================================================
-- PASO 3: Crear proveedores desde cost_entries.supplier (si existe)
-- =====================================================
-- Si existe el campo supplier en cost_entries, crear proveedores
-- y actualizar cost_entries.supplier_id

-- Nota: Verificar primero si existe la columna supplier en cost_entries
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cost_entries' 
        AND column_name = 'supplier'
    ) THEN
        -- Crear proveedores desde cost_entries
        INSERT INTO suppliers (
            id,
            code,
            name,
            legal_name,
            supplier_type,
            category,
            status,
            branch_id,
            is_shared,
            created_at,
            updated_at
        )
        SELECT DISTINCT ON (LOWER(TRIM(ce.supplier)))
            gen_random_uuid() as id,
            UPPER(SUBSTRING(REGEXP_REPLACE(TRIM(ce.supplier), '[^a-zA-Z0-9]', '', 'g'), 1, 10)) || 
            LPAD((SELECT COUNT(*) FROM suppliers) + ROW_NUMBER() OVER (ORDER BY LOWER(TRIM(ce.supplier)))::text, 4, '0') as code,
            TRIM(ce.supplier) as name,
            NULL as legal_name,
            NULL as supplier_type,
            NULL as category,
            'active' as status,
            MAX(ce.branch_id) as branch_id,
            true as is_shared,
            CURRENT_TIMESTAMP as created_at,
            CURRENT_TIMESTAMP as updated_at
        FROM cost_entries ce
        WHERE 
            ce.supplier IS NOT NULL 
            AND TRIM(ce.supplier) != ''
            AND NOT EXISTS (
                SELECT 1 FROM suppliers s 
                WHERE LOWER(TRIM(s.name)) = LOWER(TRIM(ce.supplier))
            )
        GROUP BY LOWER(TRIM(ce.supplier))
        ORDER BY LOWER(TRIM(ce.supplier));

        -- Actualizar cost_entries con supplier_id
        UPDATE cost_entries ce
        SET 
            supplier_id = s.id,
            updated_at = CURRENT_TIMESTAMP
        FROM suppliers s
        WHERE 
            ce.supplier IS NOT NULL
            AND TRIM(ce.supplier) != ''
            AND LOWER(TRIM(ce.supplier)) = LOWER(TRIM(s.name))
            AND ce.supplier_id IS NULL;
    END IF;
END $$;

-- =====================================================
-- PASO 4: Crear contactos principales desde datos legacy
-- =====================================================
-- Si el proveedor tiene email o phone en inventory_items,
-- crear un contacto principal

INSERT INTO supplier_contacts (
    id,
    supplier_id,
    name,
    email,
    phone,
    is_primary,
    created_at,
    updated_at
)
SELECT DISTINCT ON (s.id)
    gen_random_uuid() as id,
    s.id as supplier_id,
    COALESCE(
        MAX(i.contact_person),
        'Contacto Principal'
    ) as name,
    MAX(i.email) FILTER (WHERE i.email IS NOT NULL AND TRIM(i.email) != '') as email,
    MAX(i.phone) FILTER (WHERE i.phone IS NOT NULL AND TRIM(i.phone) != '') as phone,
    true as is_primary,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM suppliers s
INNER JOIN inventory_items i ON i.supplier_id = s.id
WHERE 
    NOT EXISTS (
        SELECT 1 FROM supplier_contacts sc 
        WHERE sc.supplier_id = s.id AND sc.is_primary = true
    )
    AND (
        (i.email IS NOT NULL AND TRIM(i.email) != '') OR
        (i.phone IS NOT NULL AND TRIM(i.phone) != '')
    )
GROUP BY s.id;

-- =====================================================
-- PASO 5: Validación y reporte
-- =====================================================
-- Crear tabla temporal con estadísticas de migración

DO $$
DECLARE
    suppliers_created INTEGER;
    items_updated INTEGER;
    costs_updated INTEGER;
    contacts_created INTEGER;
BEGIN
    -- Contar proveedores creados en esta migración
    SELECT COUNT(*) INTO suppliers_created
    FROM suppliers
    WHERE created_at >= CURRENT_DATE;

    -- Contar items actualizados
    SELECT COUNT(*) INTO items_updated
    FROM inventory_items
    WHERE supplier_id IS NOT NULL
    AND updated_at >= CURRENT_DATE;

    -- Contar costos actualizados (si existe la columna)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cost_entries' 
        AND column_name = 'supplier_id'
    ) THEN
        SELECT COUNT(*) INTO costs_updated
        FROM cost_entries
        WHERE supplier_id IS NOT NULL
        AND updated_at >= CURRENT_DATE;
    END IF;

    -- Contar contactos creados
    SELECT COUNT(*) INTO contacts_created
    FROM supplier_contacts
    WHERE created_at >= CURRENT_DATE;

    -- Mostrar reporte
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRACIÓN DE PROVEEDORES COMPLETADA';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Proveedores creados: %', suppliers_created;
    RAISE NOTICE 'Items actualizados: %', items_updated;
    IF costs_updated IS NOT NULL THEN
        RAISE NOTICE 'Costos actualizados: %', costs_updated;
    END IF;
    RAISE NOTICE 'Contactos creados: %', contacts_created;
    RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- PASO 6: Verificación de integridad
-- =====================================================
-- Verificar que no haya items con supplier pero sin supplier_id

DO $$
DECLARE
    orphaned_items INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_items
    FROM inventory_items
    WHERE supplier IS NOT NULL
    AND TRIM(supplier) != ''
    AND supplier_id IS NULL;

    IF orphaned_items > 0 THEN
        RAISE WARNING 'Hay % items con supplier pero sin supplier_id. Revisar manualmente.', orphaned_items;
    END IF;
END $$;

COMMIT;

-- =====================================================
-- NOTAS POST-MIGRACIÓN
-- =====================================================
-- 1. Revisar los proveedores creados y completar información faltante
-- 2. Verificar que todos los items tengan supplier_id correcto
-- 3. Revisar contactos creados y agregar información adicional si es necesario
-- 4. Considerar limpiar campos legacy (supplier, supplier_code) después de validar
--
-- Para limpiar campos legacy (ejecutar después de validar):
-- ALTER TABLE inventory_items DROP COLUMN IF EXISTS supplier;
-- ALTER TABLE inventory_items DROP COLUMN IF EXISTS supplier_code;
-- ALTER TABLE cost_entries DROP COLUMN IF EXISTS supplier;
-- ALTER TABLE cost_entries DROP COLUMN IF EXISTS supplier_code;
