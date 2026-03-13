-- Script para identificar y eliminar datos demo/prueba
-- EJECUTAR CON PRECAUCIÓN - HACER BACKUP PRIMERO
-- Este script identifica datos que parecen ser de prueba

-- ============================================
-- IDENTIFICAR DATOS DEMO
-- ============================================

-- 1. Sucursales de prueba (buscar por nombres comunes de demo)
SELECT 'Sucursales de prueba:' as tipo, id, code, name, created_at 
FROM branches 
WHERE LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%'
   OR LOWER(code) LIKE 'TEST%'
   OR LOWER(code) LIKE 'DEMO%'
ORDER BY created_at;

-- 2. Empleados de prueba
SELECT 'Empleados de prueba:' as tipo, id, code, name, role, created_at 
FROM employees 
WHERE LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%'
   OR LOWER(code) LIKE 'TEST%'
   OR LOWER(code) LIKE 'DEMO%'
   OR email LIKE '%test%'
   OR email LIKE '%demo%'
ORDER BY created_at;

-- 3. Usuarios de prueba
SELECT 'Usuarios de prueba:' as tipo, u.id, u.username, e.name as employee_name, u.created_at 
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE LOWER(u.username) LIKE '%test%' 
   OR LOWER(u.username) LIKE '%demo%' 
   OR LOWER(u.username) LIKE '%prueba%'
ORDER BY u.created_at;

-- 4. Ventas de prueba (ventas con total 0 o muy pequeñas, o con nombres de prueba)
SELECT 'Ventas de prueba:' as tipo, s.id, s.total, s.created_at, c.name as customer_name
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
WHERE s.total = 0
   OR s.total < 1
   OR LOWER(c.name) LIKE '%test%'
   OR LOWER(c.name) LIKE '%demo%'
ORDER BY s.created_at DESC
LIMIT 100;

-- 5. Items de inventario de prueba
SELECT 'Inventario de prueba:' as tipo, i.id, i.name, i.code, i.stock, i.created_at
FROM inventory_items i
WHERE LOWER(i.name) LIKE '%test%' 
   OR LOWER(i.name) LIKE '%demo%' 
   OR LOWER(i.name) LIKE '%prueba%'
   OR LOWER(i.code) LIKE 'TEST%'
   OR LOWER(i.code) LIKE 'DEMO%'
ORDER BY i.created_at;

-- ============================================
-- ELIMINAR DATOS DEMO (DESCOMENTAR PARA EJECUTAR)
-- ============================================

-- IMPORTANTE: Hacer backup antes de ejecutar estas eliminaciones
-- pg_dump -h <host> -U <user> -d <database> > backup_antes_limpieza.sql

/*
BEGIN;

-- 1. Eliminar ventas de prueba (primero eliminar items y pagos relacionados)
DELETE FROM sale_items WHERE sale_id IN (
    SELECT id FROM sales 
    WHERE total = 0 OR total < 1
    OR customer_id IN (SELECT id FROM customers WHERE LOWER(name) LIKE '%test%' OR LOWER(name) LIKE '%demo%')
);

DELETE FROM sale_payments WHERE sale_id IN (
    SELECT id FROM sales 
    WHERE total = 0 OR total < 1
    OR customer_id IN (SELECT id FROM customers WHERE LOWER(name) LIKE '%test%' OR LOWER(name) LIKE '%demo%')
);

DELETE FROM sales 
WHERE total = 0 OR total < 1
   OR customer_id IN (SELECT id FROM customers WHERE LOWER(name) LIKE '%test%' OR LOWER(name) LIKE '%demo%');

-- 2. Eliminar clientes de prueba
DELETE FROM customers 
WHERE LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%';

-- 3. Eliminar items de inventario de prueba
DELETE FROM inventory_items 
WHERE LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%'
   OR LOWER(code) LIKE 'TEST%'
   OR LOWER(code) LIKE 'DEMO%';

-- 4. Eliminar usuarios de prueba (primero eliminar usuarios)
DELETE FROM users 
WHERE LOWER(username) LIKE '%test%' 
   OR LOWER(username) LIKE '%demo%' 
   OR LOWER(username) LIKE '%prueba%';

-- 5. Eliminar empleados de prueba
DELETE FROM employees 
WHERE LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%'
   OR LOWER(code) LIKE 'TEST%'
   OR LOWER(code) LIKE 'DEMO%'
   OR email LIKE '%test%'
   OR email LIKE '%demo%';

-- 6. Eliminar sucursales de prueba (solo si no tienen datos asociados)
-- Verificar primero que no tengan empleados, ventas o inventario
DELETE FROM branches 
WHERE (LOWER(name) LIKE '%test%' 
   OR LOWER(name) LIKE '%demo%' 
   OR LOWER(name) LIKE '%prueba%'
   OR LOWER(code) LIKE 'TEST%'
   OR LOWER(code) LIKE 'DEMO%')
   AND id NOT IN (SELECT DISTINCT branch_id FROM employees WHERE branch_id IS NOT NULL)
   AND id NOT IN (SELECT DISTINCT branch_id FROM sales WHERE branch_id IS NOT NULL)
   AND id NOT IN (SELECT DISTINCT branch_id FROM inventory_items WHERE branch_id IS NOT NULL);

COMMIT;
*/

-- ============================================
-- VERIFICAR RESULTADOS
-- ============================================

-- Contar registros restantes
SELECT 
    'Branches' as tabla, COUNT(*) as total 
FROM branches
UNION ALL
SELECT 'Employees', COUNT(*) FROM employees
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'Customers', COUNT(*) FROM customers
UNION ALL
SELECT 'Sales', COUNT(*) FROM sales
UNION ALL
SELECT 'Inventory Items', COUNT(*) FROM inventory_items;
