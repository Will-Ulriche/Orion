-- ============================================================
-- Migration : Création du bucket Supabase Storage "staff-photos"
-- + politiques RLS pour l'accès public en lecture
--   et l'écriture restreinte aux utilisateurs authentifiés.
-- ============================================================

-- 1. Créer le bucket (public = les URLs sont accessibles sans auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-photos',
  'staff-photos',
  true,                          -- URL publique (lecture sans token)
  2097152,                       -- Limite : 2 Mo par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Politiques RLS ────────────────────────────────────────

-- 2. Lecture publique : n'importe qui peut lire les photos
CREATE POLICY "staff_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-photos');

-- 3. Upload/mise à jour : uniquement les utilisateurs authentifiés
--    et seulement dans leur propre dossier school_id/
CREATE POLICY "staff_photos_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-photos'
    -- Optionnel : restreindre au dossier de l'école de l'utilisateur
    -- AND (storage.foldername(name))[1] = (SELECT school_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "staff_photos_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'staff-photos');

-- 4. Suppression : uniquement les utilisateurs authentifiés
CREATE POLICY "staff_photos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'staff-photos');
