-- ============================================================
-- Migration 21 — PIN par défaut du compte DIRECTION
-- Définit le code PIN « 1234 » (hash bcrypt) pour usr-dir-001.
-- Le Directeur peut ensuite le modifier depuis Utilisateurs.
-- ============================================================

UPDATE users
SET password_hash = '$2b$12$YnxaQYFw6rQs5eylmydV4ekGyb8HEdk8rY2zjuMstCUmlDO0ExNPq',
    updated_at    = CURRENT_TIMESTAMP
WHERE id = 'usr-dir-001';
