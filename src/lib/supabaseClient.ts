import { createClient } from '@supabase/supabase-js';

// Récupération des variables d'environnement Vite (à définir dans un fichier .env)
// Seules la clé publique (anon) et l'URL sont exposées au frontend.
// La clé service_role ne doit JAMAIS être utilisée côté client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables Supabase manquantes : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.',
  );
}

// Instance Supabase standard partagée (authentification et requêtes publiques, RLS activé)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

