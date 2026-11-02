-- ============================================================
-- LIC-01 : RPC sécurisée d'activation de licence pour Orion
-- ------------------------------------------------------------
-- Cette fonction SECURITY DEFINER permet à la DIRECTION d'un
-- établissement de faire vérifier une licence déjà attribuée à son
-- établissement sans jamais pouvoir modifier la table `licenses`.
--
-- Note d'architecture :
-- La politique RLS standard `sec007_licenses_select_own` et l'Edge
-- Function `issue-license-token` assurent déjà la vérification et
-- la signature sécurisée sans nécessiter obligatoirement cette RPC.
-- Si cette RPC est appliquée, cette version garantit l'absence
-- totale d'oracle d'existence (messages d'erreur uniformisés).
--
-- Règles garanties :
-- 1. Seuls les utilisateurs authentifiés de l'établissement (rôle DIRECTION
--    ou SUPER_ADMIN) peuvent exécuter cette fonction.
-- 2. La licence doit correspondre strictement à l'établissement de l'appelant.
-- 3. Aucun UPDATE direct sur la table `licenses` n'est autorisé.
-- 4. Le statut doit être impérativement 'ACTIVE'.
-- 5. Les dates starts_at et expires_at sont vérifiées côté serveur.
-- 6. Aucun secret privé ni token n'est manipulé ici (la signature RS256
--    est déléguée à l'Edge Function issue-license-token).
-- 7. Les clés inexistantes et celles d'autres écoles renvoient exactement
--    le même code d'erreur et message (suppression de l'oracle d'existence).
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_license(
  p_license_key text,
  p_school_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_lic record;
  v_is_super_admin boolean;
  v_user_schools text[];
  v_has_role boolean;
  v_clean_key text;
BEGIN
  -- 1. Vérification de l'authentification
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour activer une licence'
      USING ERRCODE = '42501';
  END IF;

  v_clean_key := upper(trim(p_license_key));
  IF v_clean_key IS NULL OR v_clean_key = '' THEN
    RAISE EXCEPTION 'Clé de licence vide ou invalide'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Vérification des habilitations de l'appelant
  v_is_super_admin := public.is_super_admin();

  IF NOT v_is_super_admin THEN
    -- Vérifier que l'utilisateur appartient bien à l'établissement demandé
    SELECT array_agg(school_id::text) INTO v_user_schools
    FROM public.user_school_ids() AS school_id;

    IF v_user_schools IS NULL OR NOT (p_school_id = ANY(v_user_schools)) THEN
      RAISE EXCEPTION 'Non autorisé pour cet établissement'
        USING ERRCODE = '42501';
    END IF;

    -- Vérifier que l'utilisateur possède le rôle DIRECTION dans cet établissement
    v_has_role := public.has_school_role(p_school_id, ARRAY['DIRECTION']::text[]);
    IF NOT v_has_role THEN
      RAISE EXCEPTION 'Seule la direction de l''établissement peut activer la licence'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Recherche de la licence correspondante
  SELECT id, school_id, license_key, status, starts_at, expires_at, max_devices, created_at
  INTO v_lic
  FROM public.licenses
  WHERE license_key = v_clean_key;

  -- 4. Contrôle d'existence et d'attribution (uniformisé : aucun oracle d'existence)
  -- Ne révèle JAMAIS à l'appelant si la clé existe pour un autre établissement.
  IF NOT FOUND OR v_lic.school_id::text <> p_school_id THEN
    RAISE EXCEPTION 'Clé de licence invalide, introuvable ou non attribuée à votre établissement'
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Contrôle du statut
  IF v_lic.status = 'REVOKED' THEN
    RAISE EXCEPTION 'Cette clé de licence a été révoquée'
      USING ERRCODE = 'P0001';
  ELSIF v_lic.status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Cette clé de licence est suspendue'
      USING ERRCODE = 'P0001';
  ELSIF v_lic.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Cette clé de licence n''est pas active'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Contrôle des dates de validité
  IF v_lic.starts_at IS NOT NULL AND v_lic.starts_at > now() THEN
    RAISE EXCEPTION 'Cette clé de licence n''est pas encore active'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_lic.expires_at IS NOT NULL AND v_lic.expires_at <= now() THEN
    RAISE EXCEPTION 'Cette clé de licence est expirée'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Renvoi des informations de licence validées (AUCUNE modification en base)
  RETURN to_jsonb(v_lic);
END;
$$;

-- Révocation des droits publics et octroi aux utilisateurs authentifiés et service_role
REVOKE ALL ON FUNCTION public.activate_license(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text) TO authenticated, service_role;
