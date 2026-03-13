-- Script para agregar la agencia TROPICAL ADVENTURE y sus guías
-- Ejecutar este script en la base de datos de Railway

-- Script para agregar la agencia TROPICAL ADVENTURE y sus guías
-- Ejecutar este script en la base de datos de Railway

-- 1. Insertar o actualizar la agencia TROPICAL ADVENTURE
INSERT INTO catalog_agencies (code, name, active, created_at, updated_at)
VALUES ('TROPICAL_ADVENTURE', 'TROPICAL ADVENTURE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = EXCLUDED.active,
    updated_at = CURRENT_TIMESTAMP;

-- 2. Insertar los guías de TROPICAL ADVENTURE
DO $$
DECLARE
    agency_id_var UUID;
BEGIN
    -- Obtener el ID de la agencia que acabamos de crear/actualizar
    SELECT id INTO agency_id_var FROM catalog_agencies WHERE code = 'TROPICAL_ADVENTURE';
    
    IF agency_id_var IS NULL THEN
        RAISE EXCEPTION 'No se pudo encontrar la agencia TROPICAL_ADVENTURE';
    END IF;

    RAISE NOTICE '✅ Agencia TROPICAL ADVENTURE encontrada con ID: %', agency_id_var;

    -- 3. Insertar los guías de TROPICAL ADVENTURE
    -- NANCY
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_NANCY', 'NANCY', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- JAVIER
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_JAVIER', 'JAVIER', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- GINA
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_GINA', 'GINA', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- LUKE
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_LUKE', 'LUKE', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- JULIAN
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_JULIAN', 'JULIAN', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- GEOVANNY
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_GEOVANNY', 'GEOVANNY', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- NEYRA
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_NEYRA', 'NEYRA', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    -- ROGER
    INSERT INTO catalog_guides (code, name, agency_id, active, created_at, updated_at)
    VALUES ('TROPICAL_ADVENTURE_ROGER', 'ROGER', agency_id_var, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        agency_id = EXCLUDED.agency_id,
        active = EXCLUDED.active,
        updated_at = CURRENT_TIMESTAMP;

    RAISE NOTICE '✅ Agencia TROPICAL ADVENTURE y sus guías agregados correctamente';
END $$;

-- NOTA: Las reglas de llegadas para TROPICAL ADVENTURE se agregan automáticamente desde el frontend (app.js)
-- No es necesario agregarlas aquí. Se sincronizarán automáticamente cuando el sistema se inicialice.

-- Verificar que se crearon correctamente
SELECT 
    a.name as agencia,
    COUNT(g.id) as total_guias,
    STRING_AGG(g.name, ', ' ORDER BY g.name) as guias
FROM catalog_agencies a
LEFT JOIN catalog_guides g ON g.agency_id = a.id
WHERE a.code = 'TROPICAL_ADVENTURE'
GROUP BY a.name;
