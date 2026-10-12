-- Migration 23 : Authentification locale par nom d'utilisateur + mot de passe
-- Le nom d'utilisateur est attribué par la Direction lors de la création du compte.
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
