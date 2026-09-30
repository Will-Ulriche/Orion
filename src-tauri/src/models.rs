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
pub struct Class {
    pub id: String,
    pub school_id: String,
    pub academic_year_id: String,
    pub name: String,
    pub level: Option<String>,
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
