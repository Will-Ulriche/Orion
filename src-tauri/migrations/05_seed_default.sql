-- Insertion de l'utilisateur système technique par défaut si la table est vide
INSERT OR IGNORE INTO users (id, email) VALUES ('system', 'system@orion.local');
