import { createClient } from '@supabase/supabase-js';

// Récupération des variables d'environnement Vite (à définir dans un fichier .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

// Instance Supabase partagée
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
