-- ============================================================
-- ORI-SEC-007 — Durcissement RLS et isolation multi-établissement
-- ------------------------------------------------------------
-- MIGRATION PROPOSEE : ne pas appliquer automatiquement en production.
-- A valider sur une base Supabase de test après récupération du schéma
-- réel et des politiques distantes (voir le rapport d'audit).
--
-- Objectifs :
--  1. Corriger l'escalade via public.roles (RLS absente).
--  2. Supprimer les politiques "tout authenticated" sur le module académique.
--  3. Remplacer les politiques FOR ALL par des politiques SELECT/INSERT/
--     UPDATE/DELETE explicites et limitées aux rôles utiles.
--  4. Vérifier SUPER_ADMIN dans delete_school_cascade (SECURITY DEFINER).
--  5. Durcir les helpers SECURITY DEFINER (search_path, grants, profils
--     supprimés).
--  6. Restreindre les écritures Storage au dossier de l'établissement.
--
-- Le mode hors ligne et la synchronisation restent inchangés : le client
-- continue d'envoyer les mêmes payloads avec son JWT utilisateur. Seules
-- les lignes de l'établissement de l'utilisateur sont désormais acceptées.
-- ============================================================

-- ============================================================
-- 1. HELPERS DE PERIMETRE
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::text = auth.uid()::text
      AND r.name = 'SUPER_ADMIN'
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_school_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.school_id::text
  FROM public.profiles p
  WHERE p.user_id::text = auth.uid()::text
    AND p.school_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p.user_id AND u.status <> 'ACTIVE'
    )
  UNION
  SELECT ur.school_id::text
  FROM public.user_roles ur
  WHERE ur.user_id::text = auth.uid()::text
    AND ur.school_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
    )
    -- Un rôle ne suffit pas : le profil correspondant doit encore exister.
    -- Sinon un profil soft-deleted conserverait l'accès via user_roles.
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = ur.user_id
        AND p.school_id::text = ur.school_id::text
        AND p.deleted_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.user_school_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_school_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_school_role(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.school_id::text = p_school_id
      AND r.name = ANY (p_roles)
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = ur.user_id
          AND p.school_id::text = ur.school_id::text
          AND p.deleted_at IS NULL
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_school_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_role(text, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_school(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_super_admin()
      OR (
        p_school_id IN (SELECT public.user_school_ids())
        AND public.has_school_role(p_school_id, p_roles)
      );
$$;

REVOKE ALL ON FUNCTION public.can_manage_school(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_school(text, text[]) TO authenticated, service_role;

-- enrollment_history n'a pas de school_id : on résout l'école via l'inscription.
CREATE OR REPLACE FUNCTION public.enrollment_school_id(p_enrollment_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.school_id::text
  FROM public.enrollments e
  WHERE e.id::text = p_enrollment_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.enrollment_school_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_school_id(text) TO authenticated, service_role;

-- ============================================================
-- 2. TABLE roles : RLS MANQUANTE (ESCALADE DE PRIVILEGES)
-- ============================================================
-- roles n'avait jamais eu RLS. Un utilisateur authentifié pouvait renommer
-- son rôle en SUPER_ADMIN et obtenir tous les droits via is_super_admin().

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_read_authenticated" ON public.roles;
DROP POLICY IF EXISTS sec007_roles_select ON public.roles;

CREATE POLICY sec007_roles_select ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.roles FROM anon, authenticated;
GRANT SELECT ON TABLE public.roles TO authenticated;
-- Aucun GRANT INSERT/UPDATE/DELETE : les rôles se gèrent par migration
-- ou avec le rôle service_role, jamais depuis le client.

-- ============================================================
-- 3. TABLE schools
-- ============================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schools_read_own" ON public.schools;
DROP POLICY IF EXISTS sec007_schools_select ON public.schools;

CREATE POLICY sec007_schools_select ON public.schools
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR id::text IN (SELECT public.user_school_ids())
  );
-- Les écritures restent couvertes par super_admin_schools_all.

-- ============================================================
-- 4. TABLES users / profiles / user_roles
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sec007_users_select_self ON public.users;
CREATE POLICY sec007_users_select_self ON public.users
  FOR SELECT
  TO authenticated
  USING (id::text = auth.uid()::text);
-- super_admin_users_all reste la seule politique d'écriture.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Les utilisateurs peuvent voir leur propre profil" ON public.profiles;
DROP POLICY IF EXISTS sec007_profiles_select_self ON public.profiles;
DROP POLICY IF EXISTS sec007_profiles_select_managers ON public.profiles;

CREATE POLICY sec007_profiles_select_self ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id::text = auth.uid()::text
    AND deleted_at IS NULL
  );

CREATE POLICY sec007_profiles_select_managers ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.can_manage_school(
      school_id::text,
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  );
-- super_admin_profiles_all reste la seule politique d'écriture.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_user_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS sec007_user_roles_select_self ON public.user_roles;
DROP POLICY IF EXISTS sec007_user_roles_select_managers ON public.user_roles;

CREATE POLICY sec007_user_roles_select_self ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id::text = auth.uid()::text);

CREATE POLICY sec007_user_roles_select_managers ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    school_id IS NOT NULL
    AND public.can_manage_school(
      school_id::text,
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  );
-- super_admin_user_roles_all reste la seule politique d'écriture :
-- un utilisateur ne peut jamais s'attribuer un rôle.

-- ============================================================
-- 5. TABLE licenses
-- ============================================================

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sec007_licenses_select_own ON public.licenses;
CREATE POLICY sec007_licenses_select_own ON public.licenses
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR school_id::text IN (SELECT public.user_school_ids())
  );

-- IMPORTANT : l'activation d'une licence non attribuée par FirstConnectionGate
-- faisait un UPDATE direct depuis le client. Aucune politique d'écriture
-- n'est ajoutée ici : il faut la remplacer par une RPC SECURITY DEFINER
-- contrôlée (clé + rôle DIRECTION + établissement de l'utilisateur), sinon
-- n'importe quel compte authentifié pourrait réclamer une licence.

-- ============================================================
-- 6. POLITIQUES EXPLICITES DES TABLES METIER
-- ============================================================
-- Lecture :
--   - NULL = tous les membres de l'établissement (profils/roles).
--   - tableau = rôles explicitement autorisés.
-- Ecriture :
--   - tableau = rôles explicitement autorisés, dans leur établissement.
-- Les tables absentes du dépôt mais présentes en distant (staff, sections,
-- levels, series, fee_structures, payments) sont traitées seulement si
-- elles existent ET possèdent school_id.

DO $$
DECLARE
  cfg record;
  v_read_expr text;
  v_write_expr text;
BEGIN
  FOR cfg IN
    SELECT *
    FROM (VALUES
      ('academic_years',       NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('students',             NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('classes',              NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('enrollments',          NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('subjects',             NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('grade_types',          NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('grading_periods',      NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('class_subjects',       NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('teacher_assignments',  NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('grades',               NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE','PROFESSEUR']::text[]),
      ('fee_structures',       ARRAY['DIRECTION','COMPTABLE']::text[],           ARRAY['DIRECTION','COMPTABLE']::text[]),
      ('payments',             ARRAY['DIRECTION','COMPTABLE']::text[],           ARRAY['DIRECTION','COMPTABLE']::text[]),
      ('staff',                ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION']::text[]),
      ('sections',             NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('levels',               NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('series',               NULL::text[],                                    ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_categories',   ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_books',        ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_copies',       ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_readers',      ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_loans',        ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_returns',      ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_penalties',    ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_reservations', ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[]),
      ('library_settings',     ARRAY['DIRECTION','SECRETAIRE']::text[],         ARRAY['DIRECTION','SECRETAIRE']::text[])
    ) AS v(table_name, read_roles, write_roles)
  LOOP
    IF to_regclass('public.' || cfg.table_name) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = cfg.table_name
        AND column_name = 'school_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cfg.table_name);

    -- Anciennes politiques à supprimer.
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      cfg.table_name || '_school_scope', cfg.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Permettre tout aux utilisateurs authentifiés', cfg.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      cfg.table_name || '_select', cfg.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      cfg.table_name || '_insert', cfg.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      cfg.table_name || '_update', cfg.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      cfg.table_name || '_delete', cfg.table_name
    );

    IF cfg.read_roles IS NULL THEN
      v_read_expr :=
        'public.is_super_admin() OR school_id::text IN (SELECT public.user_school_ids())';
    ELSE
      v_read_expr := format(
        'public.can_manage_school(school_id::text, %L::text[])',
        cfg.read_roles::text
      );
    END IF;

    v_write_expr := format(
      'public.can_manage_school(school_id::text, %L::text[])',
      cfg.write_roles::text
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      cfg.table_name || '_select', cfg.table_name, v_read_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      cfg.table_name || '_insert', cfg.table_name, v_write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      cfg.table_name || '_update', cfg.table_name, v_write_expr, v_write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      cfg.table_name || '_delete', cfg.table_name, v_write_expr
    );
  END LOOP;
END $$;

-- ============================================================
-- 7. TABLE enrollment_history (pas de school_id)
-- ============================================================

ALTER TABLE public.enrollment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollment_history_school_scope ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_select ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_insert ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_update ON public.enrollment_history;
DROP POLICY IF EXISTS sec007_enrollment_history_delete ON public.enrollment_history;

CREATE POLICY sec007_enrollment_history_select ON public.enrollment_history
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.enrollment_school_id(enrollment_id::text)
       IN (SELECT public.user_school_ids())
  );

CREATE POLICY sec007_enrollment_history_insert ON public.enrollment_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  );

CREATE POLICY sec007_enrollment_history_update ON public.enrollment_history
  FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  )
  WITH CHECK (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  );

CREATE POLICY sec007_enrollment_history_delete ON public.enrollment_history
  FOR DELETE
  TO authenticated
  USING (
    public.can_manage_school(
      public.enrollment_school_id(enrollment_id::text),
      ARRAY['DIRECTION', 'SECRETAIRE']::text[]
    )
  );

-- ============================================================
-- 8. FONCTION delete_school_cascade : CONTROLE SUPER_ADMIN
-- ============================================================
-- La version précédente était SECURITY DEFINER, accordée à tous les
-- authenticated, sans aucune vérification : n'importe quel compte pouvait
-- supprimer n'importe quel établissement en fournissant son UUID.

DROP FUNCTION IF EXISTS public.delete_school_cascade(uuid);

CREATE OR REPLACE FUNCTION public.delete_school_cascade(p_school_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'library_returns',
        'library_penalties',
        'library_reservations',
        'library_loans',
        'library_copies',
        'library_readers',
        'library_books',
        'library_categories',
        'library_settings',
        'grades',
        'teacher_assignments',
        'class_subjects',
        'grading_periods',
        'grade_types',
        'subjects',
        'payments',
        'fee_structures',
        'enrollment_history',
        'enrollments',
        'classes',
        'students',
        'staff',
        'series',
        'levels',
        'sections',
        'academic_years',
        'audit_logs',
        'devices',
        'licenses',
        'user_roles',
        'profiles'
    ];
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'ORI-SEC-007: privileges SUPER_ADMIN requis'
            USING ERRCODE = '42501';
    END IF;

    FOREACH t IN ARRAY tables LOOP
        BEGIN
            IF t = 'enrollment_history' THEN
                EXECUTE
                    'DELETE FROM public.enrollment_history
                      WHERE enrollment_id::text IN (
                                SELECT id::text FROM public.enrollments
                                WHERE school_id::text = $1
                            )
                         OR academic_year_id::text IN (
                                SELECT id::text FROM public.academic_years
                                WHERE school_id::text = $1
                            )'
                    USING p_school_id;
            ELSE
                EXECUTE format('DELETE FROM public.%I WHERE school_id::text = $1', t)
                    USING p_school_id;
            END IF;
        EXCEPTION
            WHEN undefined_table  THEN NULL;
            WHEN undefined_column THEN NULL;
        END;
    END LOOP;

    DELETE FROM public.schools WHERE id::text = p_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_school_cascade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_cascade(text) TO authenticated, service_role;

-- ============================================================
-- 9. STORAGE : ECRITURE LIMITEE AU DOSSIER DE L'ETABLISSEMENT
-- ============================================================
-- La lecture publique existante n'est pas modifiée ici (URLs publiques).
-- En revanche, un utilisateur ne peut plus écraser/supprimer les photos
-- d'un autre établissement. Le chemin attendu reste {school_id}/{fichier}.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS staff_photos_auth_insert ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS staff_photos_auth_update ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS staff_photos_auth_delete ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS student_photos_auth_insert ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS student_photos_auth_update ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS student_photos_auth_delete ON storage.objects';

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

-- ============================================================
-- 10. PRIVILEGES ANON ET DERNIERES REVOCATIONS
-- ============================================================
-- L'application n'utilise aucune table publique sans JWT utilisateur.
-- L'accès anonyme est donc supprimé. Les authenticated conservent les
-- GRANT nécessaires aux flux SUPER_ADMIN, mais les politiques RLS
-- ci-dessus limitent l'écriture aux rôles et établissements autorisés.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Les journaux d'audit ne sont jamais écrits par le client.
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.audit_logs TO authenticated';
  END IF;
END $$;

-- ============================================================
-- 11. CONTROLES POST-MIGRATION A EXECUTER MANUELLEMENT
-- ============================================================
-- SELECT c.relname, c.relrowsecurity
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r'
-- ORDER BY c.relname;
--
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- SELECT p.oid::regprocedure, pg_get_userbyid(p.proowner) AS owner,
--        p.prosecdef, p.proconfig, p.proacl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('is_super_admin','user_school_ids','has_school_role',
--                     'can_manage_school','enrollment_school_id',
--                     'delete_school_cascade')
-- ORDER BY 1;
