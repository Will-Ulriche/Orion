-- ============================================================
-- Migration : Sécurisation des photos élèves et personnel (SEC-03)
-- 
-- Objectifs :
-- 1. Rendre les buckets "staff-photos" et "student-photos" privés (public = false).
-- 2. Supprimer les politiques RLS permissives qui autorisaient la lecture anonyme/publique.
-- 3. Restreindre la lecture (SELECT) aux seuls utilisateurs authentifiés
--    rattachés à l'établissement correspondant (ou SUPER_ADMIN).
-- 4. Garantir que les opérations d'écriture (INSERT, UPDATE, DELETE) restent
--    strictement limitées au dossier de l'établissement de l'utilisateur.
-- ============================================================

DO $$
BEGIN
  -- Vérifier que le schéma storage est bien présent
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  -- 1. Rendre les buckets privés
  UPDATE storage.buckets
  SET public = false
  WHERE id IN ('staff-photos', 'student-photos');

  -- 2. Supprimer les anciennes politiques de lecture publique
  EXECUTE 'DROP POLICY IF EXISTS "staff_photos_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "student_photos_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "staff_photos_auth_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "student_photos_auth_select" ON storage.objects';

  -- Supprimer d'éventuelles politiques d'écriture résiduelles pour les récréer proprement
  EXECUTE 'DROP POLICY IF EXISTS "staff_photos_auth_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "staff_photos_auth_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "staff_photos_auth_delete" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "student_photos_auth_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "student_photos_auth_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "student_photos_auth_delete" ON storage.objects';

  -- 3. Politiques de LECTURE (SELECT) restreintes au périmètre scolaire
  -- Seuls les utilisateurs authentifiés appartenant à l'école du dossier (ou SUPER_ADMIN)
  -- peuvent lire/télécharger les photos. Les requêtes anonymes sont bloquées.
  EXECUTE $p$
    CREATE POLICY staff_photos_auth_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY student_photos_auth_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  -- 4. Politiques d'ÉCRITURE (INSERT, UPDATE, DELETE) restreintes au périmètre scolaire
  EXECUTE $p$
    CREATE POLICY staff_photos_auth_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'staff-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY staff_photos_auth_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
      WITH CHECK (
        bucket_id = 'staff-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY staff_photos_auth_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'staff-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY student_photos_auth_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'student-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY student_photos_auth_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
      WITH CHECK (
        bucket_id = 'student-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY student_photos_auth_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND (
          public.is_super_admin()
          OR (storage.foldername(name))[1] IN (SELECT public.user_school_ids())
        )
      )
  $p$;

END $$;

