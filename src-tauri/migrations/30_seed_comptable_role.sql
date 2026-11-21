-- Le rôle COMPTABLE est utilisé par les règles financières (RLS, commandes
-- Tauri et routes) mais n'était pas présent dans les rôles de base.
INSERT OR IGNORE INTO roles (id, name, description)
VALUES ('role_compta', 'COMPTABLE', 'Comptabilité établissement');
