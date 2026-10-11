-- ============================================================
-- Migration 22 — PIN par défaut du compte SUPER_ADMIN
-- Définit le code PIN « 1234 » (hash bcrypt) pour usr-admin-001.
-- Permet la connexion locale au profil Super Admin.
-- ============================================================

UPDATE users
SET password_hash = '$2b$12$YnxaQYFw6rQs5eylmydV4ekGyb8HEdk8rY2zjuMstCUmlDO0ExNPq',
    updated_at    = CURRENT_TIMESTAMP
WHERE id = 'usr-admin-001';
