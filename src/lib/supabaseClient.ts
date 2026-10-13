import { createClient } from '@supabase/supabase-js';

// Récupération des variables d'environnement Vite (à définir dans un fichier .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://reyxonfhvlybjhxlthvy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJleXhvbmZodmx5YmpoeGx0aHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDg1MDIsImV4cCI6MjEwNjEyNDUwMn0.E1r_pWl09sqbr0pjakApgC2YgSXzfsuOLoSFmk5efaw';
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Instance Supabase standard partagée (authentification et requêtes publiques)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Instance Supabase avec privilèges de service (contourne le RLS pour la gestion et validation des licences)
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : supabase;

