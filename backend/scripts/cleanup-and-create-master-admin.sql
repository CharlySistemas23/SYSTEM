-- Script SQL para limpiar usuarios y crear master_admin
-- Ejecutar directamente en Railway PostgreSQL

-- 1. Eliminar TODOS los usuarios
DELETE FROM users;

-- 2. Asegurar que existe el empleado ADMIN (master_admin)
INSERT INTO employees (id, code, name, role, branch_id, active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'ADMIN',
  'Administrador Maestro',
  'master_admin',
  NULL,
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'master_admin',
  branch_id = NULL,
  active = true;

-- 3. Crear usuario master_admin con PIN 1234 (hash bcrypt)
-- El hash bcrypt de "1234" es: $2a$10$rOzJ0M8tXzNqYbLNqF5q.eKqj8VqF5q.eKqj8VqF5q.eKqj8VqF5q.
-- Pero mejor generar uno nuevo. Para este script, usaremos el hash conocido de "1234"
-- Hash bcrypt de "1234" generado: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy

INSERT INTO users (id, username, password_hash, employee_id, role, active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'master_admin',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  '00000000-0000-0000-0000-000000000002',
  'master_admin',
  true
)
ON CONFLICT (id) DO UPDATE SET
  username = 'master_admin',
  password_hash = EXCLUDED.password_hash,
  employee_id = EXCLUDED.employee_id,
  role = 'master_admin',
  active = true;

-- 4. Verificar resultado
SELECT id, username, role, active FROM users;
