-- Migration 18 : Offline Auth
ALTER TABLE users ADD COLUMN password_hash TEXT;
