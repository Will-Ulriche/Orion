-- Insertion d'un établissement par défaut si la table est vide
INSERT OR IGNORE INTO schools (id, name) VALUES ('school-1', 'École par défaut');

-- Insertion de l'utilisateur système par défaut si la table est vide
INSERT OR IGNORE INTO users (id, email) VALUES ('system', 'system@orion.local');
