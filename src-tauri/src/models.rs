use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct School {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AcademicYear {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Section {
    pub id: String,
    pub school_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Level {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub name: String,
    pub level_order: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Series {
    pub id: String,
    pub school_id: String,
    pub level_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Class {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub name: String,
    pub level: Option<String>,
    pub level_id: Option<String>,
    pub series_id: Option<String>,
    /// Nombre d'élèves inscrits et actifs dans cette classe pour l'année en cours.
    /// Calculé à la lecture, jamais stocké.
    pub student_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Student {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: Option<String>,
    pub birth_place: Option<String>,
    pub gender: Option<String>,
    pub photo_url: Option<String>,
    pub matricule: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub parent_name: Option<String>,
    pub parent_phone: Option<String>,
    pub parent_email: Option<String>,
    pub blood_type: Option<String>,
    pub medical_notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentEnrollment {
    pub id: String,
    pub student_id: String,
    pub class_id: Option<String>,
    pub enrollment_type: String,
    pub status: String,
    // Extra fields joined from Student/Class tables for convenience
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub matricule: Option<String>,
    pub photo_url: Option<String>,
    pub class_name: Option<String>,
    pub class_level: Option<String>,
    pub birth_date: Option<String>,
    pub birth_place: Option<String>,
    pub gender: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeeStructure {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub name: String,
    pub amount: i64, // en centimes
    pub fee_type: String,
    pub applies_to: String,
    pub class_id: Option<String>,
    pub level: Option<String>,
    pub due_date: Option<String>,
    pub is_mandatory: bool,
    // Extra pour le frontend
    pub class_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Payment {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub enrollment_id: String,
    pub student_id: String,
    pub fee_structure_id: Option<String>,
    pub amount: i64, // en centimes
    pub payment_date: String,
    pub payment_method: String,
    pub reference: Option<String>,
    pub receipt_number: String,
    pub notes: Option<String>,
    pub recorded_by: String,
    pub status: String,
    pub cancelled_at: Option<String>,
    pub cancel_reason: Option<String>,
    // Extra
    pub fee_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentFinancialSummary {
    pub student_id: String,
    pub enrollment_id: String,
    pub first_name: String,
    pub last_name: String,
    pub class_name: String,
    pub total_due: i64,
    pub total_paid: i64,
    pub remaining_balance: i64,
    pub status: String, // SOLDE, PARTIEL, IMPAYE
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClassFinancialStat {
    pub class_id: Option<String>,
    pub class_name: String,
    pub student_count: i64,
    pub total_due: i64,
    pub total_paid: i64,
    pub remaining_balance: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MethodStat {
    pub method: String,
    pub amount: i64,
    pub payment_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentBalance {
    pub student_id: String,
    pub enrollment_id: String,
    pub first_name: String,
    pub last_name: String,
    pub class_name: String,
    pub total_due: i64,
    pub total_paid: i64,
    pub remaining_balance: i64,
    pub status: String, // SOLDE, PARTIEL, IMPAYE
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FinancialDashboard {
    pub total_due: i64,
    pub total_paid: i64,
    pub remaining_balance: i64,
    pub recovery_rate: f64, // en pourcentage (0.0 - 100.0)
    pub student_count: i64,
    pub settled_count: i64,
    pub partial_count: i64,
    pub unpaid_count: i64,
    pub cancelled_payment_count: i64,
    pub by_class: Vec<ClassFinancialStat>,
    pub by_method: Vec<MethodStat>,
    pub debtors: Vec<StudentBalance>,
}

// ============================================================
// SESSION 5 : MODULE PÉDAGOGIQUE (Notes & Résultats)
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Subject {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub code: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClassSubject {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub class_id: String,
    pub subject_id: String,
    pub teacher_id: Option<String>,
    pub coefficient: f64,
    pub weekly_hours: Option<f64>,
    pub subject_type: Option<String>,
    pub is_mandatory: Option<bool>,
    pub order_index: Option<i64>,
    pub color_icon: Option<String>,
    // Extra (JOIN)
    pub subject_name: Option<String>,
    pub subject_code: Option<String>,
    pub class_name: Option<String>,
    pub teacher_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GradingPeriod {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub class_id: Option<String>,
    pub name: String,
    pub period_order: i64,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GradeType {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub max_score: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Grade {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub enrollment_id: String,
    pub student_id: String,
    pub class_subject_id: String,
    pub grading_period_id: String,
    pub grade_type_id: String,
    pub score: f64,
    pub max_score: f64,
    pub evaluation_date: Option<String>,
    pub notes: Option<String>,
    pub recorded_by: String,
    pub is_absent: bool,
    // Extra (JOIN)
    pub student_first_name: Option<String>,
    pub student_last_name: Option<String>,
    pub subject_name: Option<String>,
    pub grade_type_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TeacherAssignment {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub teacher_id: String,
    pub class_subject_id: String,
    // Extra (JOIN)
    pub teacher_name: Option<String>,
    pub subject_name: Option<String>,
    pub class_name: Option<String>,
}

/// Moyenne d'une matière pour un élève sur une période, avec coefficient.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubjectAverage {
    pub class_subject_id: String,
    pub subject_name: String,
    pub subject_code: String,
    pub coefficient: f64,
    pub average: Option<f64>,      // None si aucune note
    pub class_average: Option<f64>, // Moyenne de la classe pour comparaison
    pub appreciation: String,       // Excellent / Bien / Assez Bien / Passable / Insuffisant
    pub grade_count: i64,
}

/// Résumé complet des moyennes d'un élève pour une période.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudentAverages {
    pub student_id: String,
    pub enrollment_id: String,
    pub first_name: String,
    pub last_name: String,
    pub grading_period_id: String,
    pub general_average: Option<f64>, // Moyenne générale pondérée
    pub rank: Option<i64>,            // Rang dans la classe
    pub class_size: i64,
    pub subjects: Vec<SubjectAverage>,
}

/// Entrée de classement pour une classe et une période.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClassRankingEntry {
    pub rank: i64,
    pub student_id: String,
    pub enrollment_id: String,
    pub first_name: String,
    pub last_name: String,
    pub general_average: Option<f64>,
    pub appreciation: String,
}

/// Statistiques d'une matière pour une classe sur une période.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubjectStats {
    pub class_subject_id: String,
    pub subject_name: String,
    pub subject_code: String,
    pub grade_count: i64,
    pub class_average: Option<f64>,
    pub min_score: Option<f64>,
    pub max_score: Option<f64>,
    pub success_rate: f64,
}

// ── MODULE PERSONNEL ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Staff {
    pub id: String,
    pub school_id: String,

    // 1. Informations personnelles
    pub matricule: Option<String>,
    pub nom: String,
    pub prenoms: String,
    pub sexe: Option<String>,
    pub date_naissance: Option<String>,
    pub lieu_naissance: Option<String>,
    pub nationalite: Option<String>,
    pub photo_url: Option<String>,
    pub situation_matrimoniale: Option<String>,
    pub nombre_enfants: Option<i64>,

    // 2. Coordonnees
    pub telephone_principal: Option<String>,
    pub telephone_secondaire: Option<String>,
    pub email: Option<String>,
    pub adresse: Option<String>,
    pub region: Option<String>,
    pub prefecture: Option<String>,
    pub commune: Option<String>,
    pub quartier: Option<String>,
    pub urgence_nom: Option<String>,
    pub urgence_telephone: Option<String>,

    // 3. Informations professionnelles
    pub type_personnel: Option<String>,
    pub fonction: Option<String>,
    pub statut_professionnel: Option<String>,
    pub matricule_professionnel: Option<String>,
    pub categorie: Option<String>,
    pub grade: Option<String>,
    pub classe_grade: Option<String>,
    pub echelon: Option<String>,
    pub indice: Option<i64>,
    pub diplome_academique: Option<String>,
    pub diplome_professionnel: Option<String>,
    pub specialite: Option<String>,
    pub date_recrutement: Option<String>,
    pub date_entree_fonction_pub: Option<String>,

    // 4. Affectation
    pub etablissement: Option<String>,
    pub annee_scolaire_id: Option<String>,
    pub fonction_etablissement: Option<String>,
    pub decision_affectation_num: Option<String>,
    pub date_affectation: Option<String>,
    pub date_prise_service: Option<String>,
    pub date_arrivee_region: Option<String>,
    pub date_arrivee_etablissement: Option<String>,
    pub ancien_etablissement: Option<String>,
    pub service_direction: Option<String>,

    // 5. Enseignement
    pub matiere_principale: Option<String>,
    pub matieres_secondaires: Option<String>,
    pub classes_principales: Option<String>,
    pub volume_horaire_hebdo: Option<f64>,
    pub est_prof_principal: bool,
    pub est_responsable_classe: bool,
    pub heures_prevues: Option<f64>,
    pub heures_effectuees: Option<f64>,

    // 6. Situation administrative
    pub statut_administratif: String,
    pub date_debut_conge: Option<String>,
    pub date_fin_conge: Option<String>,
    pub date_disponibilite: Option<String>,
    pub date_mutation: Option<String>,
    pub date_suspension: Option<String>,
    pub date_retraite: Option<String>,
    pub date_depart: Option<String>,
    pub motif_depart: Option<String>,
    pub observations: Option<String>,

    // 8. Systeme
    pub est_actif: bool,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
