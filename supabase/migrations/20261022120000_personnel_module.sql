-- ============================================================
-- Migration : Module Personnel (public.staff)
-- Aligne le schéma distant Supabase sur la migration locale
-- (14_personnel_module.sql) et le modèle Rust Staff.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id                   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

    -- 1. Informations personnelles
    matricule                   TEXT,
    nom                         TEXT NOT NULL,
    prenoms                     TEXT NOT NULL,
    sexe                        TEXT,                   -- 'M' | 'F'
    date_naissance              TEXT,
    lieu_naissance              TEXT,
    nationalite                 TEXT,
    photo_url                   TEXT,
    situation_matrimoniale      TEXT,
    nombre_enfants              INTEGER,

    -- 2. Coordonnées
    telephone_principal         TEXT,
    telephone_secondaire        TEXT,
    email                       TEXT,
    adresse                     TEXT,
    region                      TEXT,
    prefecture                  TEXT,
    commune                     TEXT,
    quartier                    TEXT,
    urgence_nom                 TEXT,
    urgence_telephone           TEXT,

    -- 3. Informations professionnelles
    type_personnel              TEXT,                   -- 'Enseignant' | 'Administratif' | 'Technique' | 'De service'
    fonction                    TEXT,
    statut_professionnel        TEXT,                   -- 'Fonctionnaire' | 'Contractuel' | 'Vacataire' | 'Benevole'
    matricule_professionnel     TEXT,
    categorie                   TEXT,
    grade                       TEXT,
    classe_grade                TEXT,
    echelon                     TEXT,
    indice                      INTEGER,
    diplome_academique          TEXT,
    diplome_professionnel       TEXT,
    specialite                  TEXT,
    date_recrutement            TEXT,
    date_entree_fonction_pub    TEXT,

    -- 4. Affectation
    etablissement               TEXT,
    annee_scolaire_id           UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    fonction_etablissement      TEXT,
    decision_affectation_num    TEXT,
    date_affectation            TEXT,
    date_prise_service          TEXT,
    date_arrivee_region         TEXT,
    date_arrivee_etablissement  TEXT,
    ancien_etablissement        TEXT,
    service_direction           TEXT,

    -- 5. Enseignement
    matiere_principale          TEXT,
    matieres_secondaires        TEXT,                   -- JSON array ou CSV
    classes_principales         TEXT,                   -- JSON array ou CSV
    volume_horaire_hebdo        REAL,
    est_prof_principal          BOOLEAN NOT NULL DEFAULT false,
    est_responsable_classe      BOOLEAN NOT NULL DEFAULT false,
    heures_prevues              REAL,
    heures_effectuees           REAL,

    -- 6. Situation administrative
    statut_administratif        TEXT NOT NULL DEFAULT 'Actif',
    date_debut_conge            TEXT,
    date_fin_conge              TEXT,
    date_disponibilite          TEXT,
    date_mutation               TEXT,
    date_suspension             TEXT,
    date_retraite               TEXT,
    date_depart                 TEXT,
    motif_depart                TEXT,
    observations                TEXT,

    -- 7. Informations système
    est_actif                   BOOLEAN NOT NULL DEFAULT true,
    created_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les performances et recherches
CREATE INDEX IF NOT EXISTS idx_staff_school      ON public.staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_matricule   ON public.staff(school_id, matricule);
CREATE INDEX IF NOT EXISTS idx_staff_nom         ON public.staff(school_id, nom, prenoms);
CREATE INDEX IF NOT EXISTS idx_staff_type        ON public.staff(school_id, type_personnel);
CREATE INDEX IF NOT EXISTS idx_staff_statut      ON public.staff(school_id, statut_administratif);
CREATE INDEX IF NOT EXISTS idx_staff_email       ON public.staff(school_id, lower(email));

-- Trigger de mise à jour automatique de updated_at pour la synchronisation entrante
DROP TRIGGER IF EXISTS trg_staff_updated_at ON public.staff;
CREATE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clé étrangère pour library_readers(staff_id) si la table existe
DO $$
BEGIN
  IF to_regclass('public.library_readers') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_library_readers_staff'
    ) THEN
      ALTER TABLE public.library_readers
        ADD CONSTRAINT fk_library_readers_staff
        FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- Sécurité (RLS) initiale du personnel
-- ============================================================
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Cloisonnement strict par établissement.
-- La politique est complétée et durcie par rôle dans 20261029000000_ori_sec_007_harden_rls.sql.
DROP POLICY IF EXISTS staff_school_scope ON public.staff;
CREATE POLICY staff_school_scope ON public.staff
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR school_id::text IN (
      SELECT school_id::text FROM public.profiles WHERE user_id::text = auth.uid()::text
      UNION
      SELECT school_id::text FROM public.user_roles WHERE user_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR school_id::text IN (
      SELECT school_id::text FROM public.profiles WHERE user_id::text = auth.uid()::text
      UNION
      SELECT school_id::text FROM public.user_roles WHERE user_id::text = auth.uid()::text
    )
  );

