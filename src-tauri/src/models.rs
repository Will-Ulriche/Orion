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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Student {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: Option<String>,
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
}
