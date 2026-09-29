-- Migration 08 : Champs avancés pour l'établissement
-- SQLite ne supporte pas IF NOT EXISTS dans ALTER TABLE.
-- Le runner de migration ignore l'erreur "duplicate column name" automatiquement.

ALTER TABLE schools ADD COLUMN logo_url TEXT;
ALTER TABLE schools ADD COLUMN stamp_url TEXT;
ALTER TABLE schools ADD COLUMN signature_url TEXT;
ALTER TABLE schools ADD COLUMN ministry_name TEXT;
ALTER TABLE schools ADD COLUMN head_title TEXT;
ALTER TABLE schools ADD COLUMN head_name TEXT;
ALTER TABLE schools ADD COLUMN slogan TEXT;
ALTER TABLE schools ADD COLUMN registration_number TEXT;
