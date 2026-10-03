-- ============================================================
-- Migration 14 — Module Personnel
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
    id                          TEXT PRIMARY KEY,
    school_id                   TEXT NOT NULL,

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

    -- 2. Coordonnees
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
    annee_scolaire_id           TEXT,
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
    est_prof_principal          INTEGER NOT NULL DEFAULT 0,
    est_responsable_classe      INTEGER NOT NULL DEFAULT 0,
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

    -- 8. Informations systeme
    est_actif                   INTEGER NOT NULL DEFAULT 1,
    created_by                  TEXT,
    updated_by                  TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL,

    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_school      ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_matricule   ON staff(school_id, matricule);
CREATE INDEX IF NOT EXISTS idx_staff_nom         ON staff(school_id, nom, prenoms);
CREATE INDEX IF NOT EXISTS idx_staff_type        ON staff(school_id, type_personnel);
CREATE INDEX IF NOT EXISTS idx_staff_statut      ON staff(school_id, statut_administratif);
