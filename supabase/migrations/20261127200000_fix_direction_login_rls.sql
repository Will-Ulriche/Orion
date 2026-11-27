-- ============================================================
-- 20261127200000 — Correction RLS connexion DIRECTION (boucle login)
-- ============================================================
-- Problème : la migration sec08 (20261118) a remplacé les SELECT policies
-- de users / profiles / user_roles par USING (public.is_super_admin()) seul.
-- Résultat : les comptes DIRECTION/SECRETAIRE/PROFESSEUR ne peuvent plus
-- lire leurs propres données → resolveUserRolesOnline() retourne [] →
-- syncUserToLocalDb() early-return → ProtectedRoute redirige vers /login.
--
-- Correction : restaurer l'accès en lecture à ses propres données pour
-- tout utilisateur authentifié, tout en préservant les restrictions WRITE.
-- ============================================================

-- ── 1. TABLE public.users ─────────────────────────────────────
-- Chaque utilisateur peut lire sa propre ligne.
-- Le SUPER_ADMIN peut lire toutes les lignes.

DROP POLICY IF EXISTS sec08_users_select ON public.users;
DROP POLICY IF EXISTS users_select        ON public.users;
DROP POLICY IF EXISTS sec007_users_select ON public.users;

CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR id::text = auth.uid()::text
  );

-- ── 2. TABLE public.profiles ─────────────────────────────────
-- Chaque utilisateur peut lire son propre profil (non supprimé).
-- Les membres d'un même établissement se lisent mutuellement (gestion d'équipe).
-- Le SUPER_ADMIN peut tout lire.

DROP POLICY IF EXISTS sec08_profiles_select         ON public.profiles;
DROP POLICY IF EXISTS sec007_profiles_select_self   ON public.profiles;
DROP POLICY IF EXISTS sec007_profiles_select_managers ON public.profiles;
DROP POLICY IF EXISTS profiles_select               ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      user_id::text = auth.uid()::text
      AND deleted_at IS NULL
    )
    OR (
      deleted_at IS NULL
      AND school_id::text IN (SELECT public.user_school_ids())
    )
  );

-- ── 3. TABLE public.user_roles ───────────────────────────────
-- Chaque utilisateur peut lire ses propres lignes de rôle.
-- Un utilisateur peut lire les rôles des membres de son établissement.
-- Le SUPER_ADMIN peut tout lire.
-- IMPORTANT : ne pas toucher aux policies INSERT/UPDATE/DELETE.

DROP POLICY IF EXISTS sec08_user_roles_select          ON public.user_roles;
DROP POLICY IF EXISTS sec007_user_roles_select_self    ON public.user_roles;
DROP POLICY IF EXISTS sec007_user_roles_select_managers ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select                ON public.user_roles;

CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id::text = auth.uid()::text
    OR (
      school_id IS NOT NULL
      AND school_id::text IN (SELECT public.user_school_ids())
    )
  );

-- ── Vérification : les policies WRITE restent inchangées ─────
-- Les policies sec08_*_insert / sec08_*_update / sec08_*_delete
-- et toutes les policies de modification existantes sont préservées.
-- Cette migration ne les modifie pas.
