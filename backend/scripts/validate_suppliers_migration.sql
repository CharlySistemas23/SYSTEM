-- =====================================================
-- SCRIPT DE VALIDACIÓN: Migración de Proveedores
-- =====================================================
-- Este script valida que la migración se haya completado correctamente
--
-- Fecha: 2025-01-20
-- Versión: 1.0
-- =====================================================

-- =====================================================
-- 1. Verificar proveedores creados
-- =====================================================
SELECT 
    'Proveedores totales' as metric,
    COUNT(*) as value
FROM suppliers;

SELECT 
    'Proveedores activos' as metric,
    COUNT(*) as value
FROM suppliers
WHERE status = 'active';

SELECT 
    'Proveedores con código único' as metric,
    COUNT(DISTINCT code) as value
FROM suppliers;

-- =====================================================
-- 2. Verificar items con supplier_id
-- =====================================================
SELECT 
    'Items con supplier_id' as metric,
    COUNT(*) as value
FROM inventory_items
WHERE supplier_id IS NOT NULL;

SELECT 
    'Items con supplier pero sin supplier_id' as metric,
    COUNT(*) as value
FROM inventory_items
WHERE supplier IS NOT NULL 
    AND TRIM(supplier) != ''
    AND supplier_id IS NULL;

SELECT 
    'Items sin supplier ni supplier_id' as metric,
    COUNT(*) as value
FROM inventory_items
WHERE (supplier IS NULL OR TRIM(supplier) = '')
    AND supplier_id IS NULL;

-- =====================================================
-- 3. Verificar costos con supplier_id (si existe)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cost_entries' 
        AND column_name = 'supplier_id'
    ) THEN
        RAISE NOTICE 'Costos con supplier_id: %', (
            SELECT COUNT(*) FROM cost_entries WHERE supplier_id IS NOT NULL
        );
        RAISE NOTICE 'Costos con supplier pero sin supplier_id: %', (
            SELECT COUNT(*) FROM cost_entries 
            WHERE supplier IS NOT NULL 
                AND TRIM(supplier) != ''
                AND supplier_id IS NULL
        );
    END IF;
END $$;

-- =====================================================
-- 4. Verificar contactos creados
-- =====================================================
SELECT 
    'Contactos totales' as metric,
    COUNT(*) as value
FROM supplier_contacts;

SELECT 
    'Proveedores con contactos' as metric,
    COUNT(DISTINCT supplier_id) as value
FROM supplier_contacts;

SELECT 
    'Contactos principales' as metric,
    COUNT(*) as value
FROM supplier_contacts
WHERE is_primary = true;

-- =====================================================
-- 5. Verificar integridad referencial
-- =====================================================
SELECT 
    'Items con supplier_id inválido' as metric,
    COUNT(*) as value
FROM inventory_items i
WHERE i.supplier_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM suppliers s WHERE s.id = i.supplier_id
    );

-- =====================================================
-- 6. Reporte de proveedores más usados
-- =====================================================
SELECT 
    s.code,
    s.name,
    COUNT(DISTINCT i.id) as items_count,
    COUNT(DISTINCT sc.id) as contacts_count
FROM suppliers s
LEFT JOIN inventory_items i ON i.supplier_id = s.id
LEFT JOIN supplier_contacts sc ON sc.supplier_id = s.id
GROUP BY s.id, s.code, s.name
ORDER BY items_count DESC
LIMIT 10;

-- =====================================================
-- 7. Verificar duplicados potenciales
-- =====================================================
SELECT 
    LOWER(TRIM(name)) as normalized_name,
    COUNT(*) as count,
    STRING_AGG(code, ', ') as codes
FROM suppliers
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1;
