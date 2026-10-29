-- Migration : Nettoyage des mots de passe en clair stockés dans auth.users
-- Référence : ORI-SEC-002 - Suppression du stockage des mots de passe en clair

-- Supprime la clé 'initial_password' (et toute clé 'password' résiduelle) de raw_user_meta_data
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'initial_password' - 'password'
WHERE raw_user_meta_data ? 'initial_password' OR raw_user_meta_data ? 'password';
