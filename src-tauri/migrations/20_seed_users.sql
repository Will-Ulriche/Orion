-- ============================================================
-- SEED Utilisateurs — Orion ERP
-- Compatible : Supabase (PostgreSQL) + SQLite (Tauri)
-- ============================================================

-- 1. Nettoyage ciblé
DELETE FROM user_roles
  WHERE user_id IN ('usr-dir-001','usr-sec-001','usr-prof-001','usr-prof-002',
                    'usr-prof-003','usr-prof-004','usr-prof-005','usr-admin-001');
DELETE FROM profiles
  WHERE user_id IN ('usr-dir-001','usr-sec-001','usr-prof-001','usr-prof-002',
                    'usr-prof-003','usr-prof-004','usr-prof-005','usr-admin-001');
DELETE FROM users
  WHERE id IN ('usr-dir-001','usr-sec-001','usr-prof-001','usr-prof-002',
               'usr-prof-003','usr-prof-004','usr-prof-005','usr-admin-001');

-- 2. Utilisateurs
INSERT INTO users (id, email, status, created_at, updated_at) VALUES
('usr-dir-001',   'direction@cso-lome.tg',   'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-sec-001',   'secretariat@cso-lome.tg', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-prof-001',  'k.koffi@cso-lome.tg',     'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-prof-002',  'a.agbayou@cso-lome.tg',   'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-prof-003',  'k.mensah@cso-lome.tg',    'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-prof-004',  'a.hounsi@cso-lome.tg',    'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-prof-005',  'e.dodzi@cso-lome.tg',     'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('usr-admin-001', 'admin@cso-lome.tg',       'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. Profils
INSERT INTO profiles (id, user_id, school_id, first_name, last_name, phone, created_at, updated_at) VALUES
('prof-dir-001',   'usr-dir-001',   'school-1', 'Kwesi',          'AMOUZOU', '+228 90 00 00 01', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-sec-001',   'usr-sec-001',   'school-1', 'Adjoua',         'TCHAOU',  '+228 90 00 00 02', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-prof-001',  'usr-prof-001',  'school-1', 'Kwame Edouard',  'KOFFI',   '+228 90 10 20 30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-prof-002',  'usr-prof-002',  'school-1', 'Amélie Sophie',  'AGBAYOU', '+228 91 20 30 40', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-prof-003',  'usr-prof-003',  'school-1', 'Komivi Pierre',  'MENSAH',  '+228 92 30 40 50', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-prof-004',  'usr-prof-004',  'school-1', 'Akosua Reine',   'HOUNSI',  '+228 93 40 50 60', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-prof-005',  'usr-prof-005',  'school-1', 'Edem Christian', 'DODZI',   '+228 94 50 60 70', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('prof-admin-001', 'usr-admin-001', 'school-1', 'Super',          'Admin',   '+228 99 99 99 99', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 4. Attribution des rôles (récupération des IDs existants par nom)
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-dir-001',   'usr-dir-001',   'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'DIRECTION'  LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-sec-001',   'usr-sec-001',   'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'SECRETAIRE' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-prof-001',  'usr-prof-001',  'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'PROFESSEUR' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-prof-002',  'usr-prof-002',  'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'PROFESSEUR' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-prof-003',  'usr-prof-003',  'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'PROFESSEUR' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-prof-004',  'usr-prof-004',  'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'PROFESSEUR' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-prof-005',  'usr-prof-005',  'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'PROFESSEUR' LIMIT 1;
INSERT INTO user_roles (id, user_id, school_id, role_id, created_at)
SELECT 'ur-admin-001', 'usr-admin-001', 'school-1', id, CURRENT_TIMESTAMP FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
