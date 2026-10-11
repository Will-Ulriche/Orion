-- ============================================================
-- SEED DATA — Orion ERP (Données complètes et réalistes)
-- ============================================================
-- Ce script nettoie toutes les données non-système, puis insère
-- un jeu de données complet pour tous les modules.
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ── 1. NETTOYAGE (conservation des users/roles/school) ──────
DELETE FROM grades;
DELETE FROM teacher_assignments;
DELETE FROM class_subjects;
DELETE FROM grading_periods;
DELETE FROM grade_types;
DELETE FROM subjects;
DELETE FROM payments;
DELETE FROM fee_structures;
DELETE FROM enrollment_history;
DELETE FROM enrollments;
DELETE FROM classes;
DELETE FROM academic_years;
DELETE FROM staff;
DELETE FROM devices;
DELETE FROM licenses;
DELETE FROM user_roles;
DELETE FROM profiles;
DELETE FROM students;
DELETE FROM audit_logs;

-- Reset school info to a more complete record
UPDATE schools
SET
    name                 = 'Complexe Scolaire Orion',
    short_name           = 'CSO',
    address              = 'Avenue des Écoles, Lomé',
    city                 = 'Lomé',
    country              = 'Togo',
    phone_primary        = '+228 90 11 22 33',
    phone_secondary      = '+228 90 44 55 66',
    email                = 'direction@cso-lome.tg',
    website              = 'https://www.cso-lome.tg',
    currency             = 'XOF',
    timezone             = 'Africa/Lome',
    status               = 'ACTIVE'
WHERE id = 'school-1';

PRAGMA foreign_keys = ON;

-- ── 2. APPAREIL & LICENCE ────────────────────────────────────
INSERT INTO licenses (id, school_id, license_key, status, issued_at, starts_at, expires_at, max_devices, created_at, updated_at) VALUES
('lic-001', 'school-1', 'ORN-2024-TOGO-PRO-XQZT', 'ACTIVE', '2024-09-01', '2024-09-01', '2025-08-31', 5, datetime('now'), datetime('now'));

INSERT INTO devices (id, school_id, device_identifier, device_name, platform, status, last_seen_at, created_at, updated_at) VALUES
('dev-001', 'school-1', 'DEV-PC-DIRECTION-001', 'PC Direction', 'windows', 'ACTIVE', datetime('now'), datetime('now'), datetime('now')),
('dev-002', 'school-1', 'DEV-PC-SECRETARIAT-001', 'PC Secrétariat', 'windows', 'ACTIVE', datetime('now'), datetime('now'), datetime('now')),
('dev-003', 'school-1', 'DEV-PC-SALLE-PROFS-001', 'PC Salle des Profs', 'windows', 'BLOCKED', datetime('now'), datetime('now'), datetime('now'));

-- ── 3. ANNÉE SCOLAIRE ────────────────────────────────────────
INSERT INTO academic_years (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at) VALUES
('ay-2024-2025', 'school-1', '2024-2025', '2024-09-02', '2025-07-04', 'ACTIVE', 1, datetime('now'), datetime('now')),
('ay-2023-2024', 'school-1', '2023-2024', '2023-09-04', '2024-07-05', 'CLOSED', 0, datetime('now'), datetime('now'));

-- ── 4. CLASSES ───────────────────────────────────────────────
INSERT INTO classes (id, school_id, academic_year_id, name, level, created_at) VALUES
('cls-6a', 'school-1', 'ay-2024-2025', '6ème A', '6ème', datetime('now')),
('cls-6b', 'school-1', 'ay-2024-2025', '6ème B', '6ème', datetime('now')),
('cls-5a', 'school-1', 'ay-2024-2025', '5ème A', '5ème', datetime('now')),
('cls-5b', 'school-1', 'ay-2024-2025', '5ème B', '5ème', datetime('now')),
('cls-4a', 'school-1', 'ay-2024-2025', '4ème A', '4ème', datetime('now')),
('cls-4b', 'school-1', 'ay-2024-2025', '4ème B', '4ème', datetime('now')),
('cls-3a', 'school-1', 'ay-2024-2025', '3ème A', '3ème', datetime('now')),
('cls-3b', 'school-1', 'ay-2024-2025', '3ème B', '3ème', datetime('now'));

-- ── 5. PERSONNEL ─────────────────────────────────────────────
INSERT INTO staff (id, school_id, matricule, nom, prenoms, sexe, date_naissance, lieu_naissance, nationalite, type_personnel, fonction, statut_professionnel, matiere_principale, diplome_academique, specialite, telephone_principal, email, date_recrutement, statut_administratif, est_actif, annee_scolaire_id, created_at, updated_at) VALUES
('st-001', 'school-1', 'MAT-001', 'KOFFI', 'Kwame Edouard', 'M', '1978-03-15', 'Lomé', 'Togolaise', 'Enseignant', 'Professeur de Mathématiques', 'Fonctionnaire', 'Mathématiques', 'CAPES Mathématiques', 'Mathématiques', '+228 90 10 20 30', 'k.koffi@cso-lome.tg', '2005-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-002', 'school-1', 'MAT-002', 'AGBAYOU', 'Amélie Sophie', 'F', '1982-07-22', 'Kpalimé', 'Togolaise', 'Enseignant', 'Professeure de Français', 'Fonctionnaire', 'Français', 'CAPES Lettres Modernes', 'Littérature française', '+228 91 20 30 40', 'a.agbayou@cso-lome.tg', '2007-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-003', 'school-1', 'MAT-003', 'MENSAH', 'Komivi Pierre', 'M', '1975-11-05', 'Atakpamé', 'Togolaise', 'Enseignant', 'Professeur de Sciences', 'Contractuel', 'SVT', 'Licence Sciences Biologiques', 'Biologie', '+228 92 30 40 50', 'k.mensah@cso-lome.tg', '2010-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-004', 'school-1', 'MAT-004', 'HOUNSI', 'Akosua Reine', 'F', '1990-04-18', 'Lomé', 'Togolaise', 'Enseignant', 'Professeure d''Anglais', 'Contractuel', 'Anglais', 'Licence Langues Étrangères Appliquées', 'Anglais', '+228 93 40 50 60', 'a.hounsi@cso-lome.tg', '2015-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-005', 'school-1', 'MAT-005', 'DODZI', 'Edem Christian', 'M', '1968-09-30', 'Sokodé', 'Togolaise', 'Enseignant', 'Professeur d''Histoire-Géographie', 'Fonctionnaire', 'Histoire-Géographie', 'CAPES Histoire-Géo', 'Histoire moderne', '+228 94 50 60 70', 'e.dodzi@cso-lome.tg', '2000-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-006', 'school-1', 'MAT-006', 'TCHAOU', 'Adjoua Marie', 'F', '1985-01-12', 'Lomé', 'Togolaise', 'Administratif', 'Secrétaire de Direction', 'Contractuel', NULL, 'BTS Secrétariat', NULL, '+228 95 60 70 80', 'a.tchaou@cso-lome.tg', '2012-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-007', 'school-1', 'MAT-007', 'ABALO', 'Séna Joël', 'M', '1970-06-25', 'Anécho', 'Togolaise', 'Administratif', 'Comptable', 'Fonctionnaire', NULL, 'BTS Comptabilité', NULL, '+228 96 70 80 90', 'j.abalo@cso-lome.tg', '2003-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-008', 'school-1', 'MAT-008', 'FIAGBE', 'Kosi Innocent', 'M', '1980-08-19', 'Lomé', 'Togolaise', 'Technique', 'Informaticien', 'Contractuel', NULL, 'Licence Informatique', NULL, '+228 97 80 90 00', 'k.fiagbe@cso-lome.tg', '2018-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-009', 'school-1', 'MAT-009', 'ADANLETE', 'Yawa Félicité', 'F', '1987-02-28', 'Tsévié', 'Togolaise', 'Enseignant', 'Professeure de Physique-Chimie', 'Vacataire', 'Physique-Chimie', 'Maîtrise Chimie', 'Chimie organique', '+228 98 90 00 11', 'y.adanlete@cso-lome.tg', '2020-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now')),
('st-010', 'school-1', 'MAT-010', 'ATIGLO', 'Kossi Bernard', 'M', '1972-12-07', 'Kara', 'Togolaise', 'De service', 'Gardien', 'Contractuel', NULL, 'BEPC', NULL, '+228 99 00 11 22', NULL, '2008-09-01', 'Actif', 1, 'ay-2024-2025', datetime('now'), datetime('now'));

-- ── 6. ÉLÈVES ────────────────────────────────────────────────
INSERT INTO students (id, school_id, first_name, last_name, birth_date, gender, matricule, address, phone, parent_name, parent_phone, parent_email, created_at) VALUES
-- 6ème A (8 élèves)
('s-001', 'school-1', 'Koffi', 'AMEDZRO', '2012-03-14', 'M', 'E-2024-001', 'Tokoin, Lomé', NULL, 'M. AMEDZRO Kodjo', '+228 90 11 11 11', NULL, datetime('now')),
('s-002', 'school-1', 'Abla', 'DOSSOU', '2012-07-22', 'F', 'E-2024-002', 'Bè Klikamé, Lomé', NULL, 'Mme DOSSOU Akosua', '+228 90 22 22 22', NULL, datetime('now')),
('s-003', 'school-1', 'Edem', 'SODJI', '2011-11-05', 'M', 'E-2024-003', 'Agbalepedogan, Lomé', NULL, 'M. SODJI Mawulom', '+228 90 33 33 33', NULL, datetime('now')),
('s-004', 'school-1', 'Akoua', 'YOVO', '2012-01-30', 'F', 'E-2024-004', 'Agoe, Lomé', NULL, 'M. YOVO Kofi', '+228 90 44 44 44', NULL, datetime('now')),
('s-005', 'school-1', 'Mawuli', 'KLUTSE', '2012-05-18', 'M', 'E-2024-005', 'Adidogomé, Lomé', NULL, 'Mme KLUTSE Afi', '+228 90 55 55 55', NULL, datetime('now')),
('s-006', 'school-1', 'Dzidzor', 'AGBANYO', '2011-09-03', 'F', 'E-2024-006', 'Kodjoviakopé, Lomé', NULL, 'M. AGBANYO Yao', '+228 90 66 66 66', NULL, datetime('now')),
('s-007', 'school-1', 'Selom', 'ANANI', '2012-02-14', 'M', 'E-2024-007', 'Bè Afangan, Lomé', NULL, 'M. ANANI Kwasi', '+228 90 77 77 77', NULL, datetime('now')),
('s-008', 'school-1', 'Yawo', 'DAGBE', '2012-04-09', 'M', 'E-2024-008', 'Nukafu, Lomé', NULL, 'Mme DAGBE Séwa', '+228 90 88 88 88', NULL, datetime('now')),
-- 6ème B (7 élèves)
('s-009', 'school-1', 'Afi', 'KPENNO', '2012-06-20', 'F', 'E-2024-009', 'Hédranawoe, Lomé', NULL, 'M. KPENNO Elom', '+228 91 11 11 11', NULL, datetime('now')),
('s-010', 'school-1', 'Kodzo', 'MESSAN', '2011-12-15', 'M', 'E-2024-010', 'Tokoin Gbadago, Lomé', NULL, 'M. MESSAN Komlan', '+228 91 22 22 22', NULL, datetime('now')),
('s-011', 'school-1', 'Massiva', 'AGOU', '2012-08-07', 'F', 'E-2024-011', 'Lomé', NULL, 'Mme AGOU Yawa', '+228 91 33 33 33', NULL, datetime('now')),
('s-012', 'school-1', 'Komlan', 'DEVO', '2011-10-25', 'M', 'E-2024-012', 'Lomé', NULL, 'M. DEVO Agbenyo', '+228 91 44 44 44', NULL, datetime('now')),
('s-013', 'school-1', 'Akoebi', 'TCHAGNAOU', '2012-03-03', 'F', 'E-2024-013', 'Lomé', NULL, 'M. TCHAGNAOU Kofi', '+228 91 55 55 55', NULL, datetime('now')),
('s-014', 'school-1', 'Senyra', 'AMOU', '2012-01-11', 'F', 'E-2024-014', 'Lomé', NULL, 'Mme AMOU Kossiwa', '+228 91 66 66 66', NULL, datetime('now')),
('s-015', 'school-1', 'Dodzi', 'HOUNKPE', '2011-07-19', 'M', 'E-2024-015', 'Lomé', NULL, 'M. HOUNKPE Mawuko', '+228 91 77 77 77', NULL, datetime('now')),
-- 5ème A (8 élèves)
('s-016', 'school-1', 'Kossi', 'AGBEKO', '2011-04-22', 'M', 'E-2024-016', 'Lomé', NULL, 'M. AGBEKO Edem', '+228 92 11 11 11', NULL, datetime('now')),
('s-017', 'school-1', 'Mia', 'DAKEY', '2010-09-14', 'F', 'E-2024-017', 'Lomé', NULL, 'Mme DAKEY Afi', '+228 92 22 22 22', NULL, datetime('now')),
('s-018', 'school-1', 'Yao', 'GBLIVI', '2011-01-28', 'M', 'E-2024-018', 'Lomé', NULL, 'M. GBLIVI Kwame', '+228 92 33 33 33', NULL, datetime('now')),
('s-019', 'school-1', 'Akosua', 'DENTE', '2010-11-11', 'F', 'E-2024-019', 'Lomé', NULL, 'M. DENTE Yao', '+228 92 44 44 44', NULL, datetime('now')),
('s-020', 'school-1', 'Mawudem', 'ASSIH', '2011-06-05', 'M', 'E-2024-020', 'Lomé', NULL, 'Mme ASSIH Ablavi', '+228 92 55 55 55', NULL, datetime('now')),
('s-021', 'school-1', 'Kafui', 'LADZEKPO', '2010-08-30', 'F', 'E-2024-021', 'Lomé', NULL, 'M. LADZEKPO Sena', '+228 92 66 66 66', NULL, datetime('now')),
('s-022', 'school-1', 'Ama', 'TSELIKUI', '2011-03-17', 'F', 'E-2024-022', 'Lomé', NULL, 'M. TSELIKUI Edem', '+228 92 77 77 77', NULL, datetime('now')),
('s-023', 'school-1', 'Noel', 'KOFFI', '2010-12-25', 'M', 'E-2024-023', 'Lomé', NULL, 'M. KOFFI Kwabena', '+228 92 88 88 88', NULL, datetime('now')),
-- 5ème B (7 élèves)
('s-024', 'school-1', 'Yawa', 'FIASSIGBE', '2010-05-08', 'F', 'E-2024-024', 'Lomé', NULL, 'Mme FIASSIGBE Adzo', '+228 93 11 11 11', NULL, datetime('now')),
('s-025', 'school-1', 'Elom', 'ATSOU', '2011-02-16', 'M', 'E-2024-025', 'Lomé', NULL, 'M. ATSOU Komi', '+228 93 22 22 22', NULL, datetime('now')),
('s-026', 'school-1', 'Ablavi', 'TSIKATA', '2010-07-04', 'F', 'E-2024-026', 'Lomé', NULL, 'M. TSIKATA Kodjo', '+228 93 33 33 33', NULL, datetime('now')),
('s-027', 'school-1', 'Kokou', 'AGALI', '2010-10-20', 'M', 'E-2024-027', 'Lomé', NULL, 'Mme AGALI Séna', '+228 93 44 44 44', NULL, datetime('now')),
('s-028', 'school-1', 'Ximena', 'GADEDJISSO', '2011-01-03', 'F', 'E-2024-028', 'Lomé', NULL, 'M. GADEDJISSO Mlapa', '+228 93 55 55 55', NULL, datetime('now')),
('s-029', 'school-1', 'Koami', 'MAWUENA', '2010-06-15', 'M', 'E-2024-029', 'Lomé', NULL, 'Mme MAWUENA Afi', '+228 93 66 66 66', NULL, datetime('now')),
('s-030', 'school-1', 'Dossavi', 'KLUTSE', '2010-04-28', 'F', 'E-2024-030', 'Lomé', NULL, 'M. KLUTSE Teko', '+228 93 77 77 77', NULL, datetime('now')),
-- 4ème A (8 élèves)
('s-031', 'school-1', 'Esso', 'AKAKPO', '2009-08-12', 'M', 'E-2024-031', 'Lomé', NULL, 'M. AKAKPO Agbe', '+228 94 11 11 11', NULL, datetime('now')),
('s-032', 'school-1', 'Adzo', 'HOUNGAN', '2009-11-03', 'F', 'E-2024-032', 'Lomé', NULL, 'Mme HOUNGAN Yewande', '+228 94 22 22 22', NULL, datetime('now')),
('s-033', 'school-1', 'Komi', 'SEGBENU', '2010-02-19', 'M', 'E-2024-033', 'Lomé', NULL, 'M. SEGBENU Kwao', '+228 94 33 33 33', NULL, datetime('now')),
('s-034', 'school-1', 'Ewoenam', 'AHIABLE', '2009-05-30', 'F', 'E-2024-034', 'Lomé', NULL, 'M. AHIABLE Kofi', '+228 94 44 44 44', NULL, datetime('now')),
('s-035', 'school-1', 'Yevessem', 'ADOM', '2009-09-21', 'M', 'E-2024-035', 'Lomé', NULL, 'Mme ADOM Efui', '+228 94 55 55 55', NULL, datetime('now')),
('s-036', 'school-1', 'Massivi', 'SEGBLETO', '2009-12-07', 'M', 'E-2024-036', 'Lomé', NULL, 'M. SEGBLETO Wofa', '+228 94 66 66 66', NULL, datetime('now')),
('s-037', 'school-1', 'Foli', 'DOEVI', '2010-01-14', 'M', 'E-2024-037', 'Lomé', NULL, 'Mme DOEVI Adjo', '+228 94 77 77 77', NULL, datetime('now')),
('s-038', 'school-1', 'Delali', 'WUSSAH', '2009-07-09', 'F', 'E-2024-038', 'Lomé', NULL, 'M. WUSSAH Klutse', '+228 94 88 88 88', NULL, datetime('now')),
-- 4ème B (7 élèves)
('s-039', 'school-1', 'Selali', 'AMETONOU', '2009-03-15', 'F', 'E-2024-039', 'Lomé', NULL, 'M. AMETONOU Komla', '+228 95 11 11 11', NULL, datetime('now')),
('s-040', 'school-1', 'Kossiwa', 'DOSSOU', '2009-06-22', 'F', 'E-2024-040', 'Lomé', NULL, 'M. DOSSOU Eli', '+228 95 22 22 22', NULL, datetime('now')),
('s-041', 'school-1', 'Amegavi', 'BADJA', '2010-04-01', 'M', 'E-2024-041', 'Lomé', NULL, 'Mme BADJA Efua', '+228 95 33 33 33', NULL, datetime('now')),
('s-042', 'school-1', 'Sena', 'TSIKPLONOU', '2009-10-10', 'F', 'E-2024-042', 'Lomé', NULL, 'M. TSIKPLONOU Abi', '+228 95 44 44 44', NULL, datetime('now')),
('s-043', 'school-1', 'Nana', 'AKLESSO', '2009-08-18', 'F', 'E-2024-043', 'Lomé', NULL, 'Mme AKLESSO Kosi', '+228 95 55 55 55', NULL, datetime('now')),
('s-044', 'school-1', 'Togbui', 'SOSSOU', '2009-02-28', 'M', 'E-2024-044', 'Lomé', NULL, 'M. SOSSOU Kwami', '+228 95 66 66 66', NULL, datetime('now')),
('s-045', 'school-1', 'Akpe', 'GUEZOU', '2009-12-31', 'M', 'E-2024-045', 'Lomé', NULL, 'M. GUEZOU Togbena', '+228 95 77 77 77', NULL, datetime('now')),
-- 3ème A (8 élèves)
('s-046', 'school-1', 'Adote', 'NUWOAME', '2008-04-17', 'M', 'E-2024-046', 'Lomé', NULL, 'M. NUWOAME Kwaku', '+228 96 11 11 11', NULL, datetime('now')),
('s-047', 'school-1', 'Gbemi', 'AMAKPE', '2008-09-02', 'F', 'E-2024-047', 'Lomé', NULL, 'Mme AMAKPE Awo', '+228 96 22 22 22', NULL, datetime('now')),
('s-048', 'school-1', 'Kosi', 'AYAYI', '2009-01-20', 'M', 'E-2024-048', 'Lomé', NULL, 'M. AYAYI Elom', '+228 96 33 33 33', NULL, datetime('now')),
('s-049', 'school-1', 'Eyadema', 'AGBESSI', '2008-06-11', 'M', 'E-2024-049', 'Lomé', NULL, 'Mme AGBESSI Kossiwa', '+228 96 44 44 44', NULL, datetime('now')),
('s-050', 'school-1', 'Mawuse', 'DETOH', '2008-11-30', 'F', 'E-2024-050', 'Lomé', NULL, 'M. DETOH Yao', '+228 96 55 55 55', NULL, datetime('now')),
('s-051', 'school-1', 'Kafui', 'KPODO', '2008-03-25', 'M', 'E-2024-051', 'Lomé', NULL, 'M. KPODO Mlapa', '+228 96 66 66 66', NULL, datetime('now')),
('s-052', 'school-1', 'Mawuena', 'EDEM', '2009-07-07', 'F', 'E-2024-052', 'Lomé', NULL, 'M. EDEM Koffi', '+228 96 77 77 77', NULL, datetime('now')),
('s-053', 'school-1', 'Yetunde', 'KLAH', '2008-12-19', 'F', 'E-2024-053', 'Lomé', NULL, 'Mme KLAH Selom', '+228 96 88 88 88', NULL, datetime('now')),
-- 3ème B (7 élèves)
('s-054', 'school-1', 'Gbla', 'AKPA', '2008-02-08', 'M', 'E-2024-054', 'Lomé', NULL, 'M. AKPA Yao', '+228 97 11 11 11', NULL, datetime('now')),
('s-055', 'school-1', 'Ewoenam', 'AMEDJI', '2008-05-14', 'F', 'E-2024-055', 'Lomé', NULL, 'Mme AMEDJI Adzo', '+228 97 22 22 22', NULL, datetime('now')),
('s-056', 'school-1', 'Kossiwa', 'GBEDEMAH', '2009-08-27', 'F', 'E-2024-056', 'Lomé', NULL, 'M. GBEDEMAH Kodzo', '+228 97 33 33 33', NULL, datetime('now')),
('s-057', 'school-1', 'Femi', 'TOGBETO', '2008-01-04', 'M', 'E-2024-057', 'Lomé', NULL, 'Mme TOGBETO Ama', '+228 97 44 44 44', NULL, datetime('now')),
('s-058', 'school-1', 'Loli', 'DZAN', '2008-10-16', 'F', 'E-2024-058', 'Lomé', NULL, 'M. DZAN Kossi', '+228 97 55 55 55', NULL, datetime('now')),
('s-059', 'school-1', 'Kwasi', 'APEKE', '2008-04-29', 'M', 'E-2024-059', 'Lomé', NULL, 'M. APEKE Agbe', '+228 97 66 66 66', NULL, datetime('now')),
('s-060', 'school-1', 'Dedzoe', 'YEMANE', '2009-06-03', 'F', 'E-2024-060', 'Lomé', NULL, 'Mme YEMANE Kafui', '+228 97 77 77 77', NULL, datetime('now'));

-- ── 7. INSCRIPTIONS ──────────────────────────────────────────
INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_number, enrollment_date, status, enrollment_type, created_at, updated_at) VALUES
-- 6ème A
('en-001', 'school-1', 'ay-2024-2025', 's-001', 'cls-6a', 'INS-2024-001', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-002', 'school-1', 'ay-2024-2025', 's-002', 'cls-6a', 'INS-2024-002', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-003', 'school-1', 'ay-2024-2025', 's-003', 'cls-6a', 'INS-2024-003', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-004', 'school-1', 'ay-2024-2025', 's-004', 'cls-6a', 'INS-2024-004', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-005', 'school-1', 'ay-2024-2025', 's-005', 'cls-6a', 'INS-2024-005', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-006', 'school-1', 'ay-2024-2025', 's-006', 'cls-6a', 'INS-2024-006', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-007', 'school-1', 'ay-2024-2025', 's-007', 'cls-6a', 'INS-2024-007', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-008', 'school-1', 'ay-2024-2025', 's-008', 'cls-6a', 'INS-2024-008', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
-- 6ème B
('en-009', 'school-1', 'ay-2024-2025', 's-009', 'cls-6b', 'INS-2024-009', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-010', 'school-1', 'ay-2024-2025', 's-010', 'cls-6b', 'INS-2024-010', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-011', 'school-1', 'ay-2024-2025', 's-011', 'cls-6b', 'INS-2024-011', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-012', 'school-1', 'ay-2024-2025', 's-012', 'cls-6b', 'INS-2024-012', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-013', 'school-1', 'ay-2024-2025', 's-013', 'cls-6b', 'INS-2024-013', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-014', 'school-1', 'ay-2024-2025', 's-014', 'cls-6b', 'INS-2024-014', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
('en-015', 'school-1', 'ay-2024-2025', 's-015', 'cls-6b', 'INS-2024-015', '2024-09-02', 'ACTIVE', 'NOUVELLE', datetime('now'), datetime('now')),
-- 5ème A
('en-016', 'school-1', 'ay-2024-2025', 's-016', 'cls-5a', 'INS-2024-016', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-017', 'school-1', 'ay-2024-2025', 's-017', 'cls-5a', 'INS-2024-017', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-018', 'school-1', 'ay-2024-2025', 's-018', 'cls-5a', 'INS-2024-018', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-019', 'school-1', 'ay-2024-2025', 's-019', 'cls-5a', 'INS-2024-019', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-020', 'school-1', 'ay-2024-2025', 's-020', 'cls-5a', 'INS-2024-020', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-021', 'school-1', 'ay-2024-2025', 's-021', 'cls-5a', 'INS-2024-021', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-022', 'school-1', 'ay-2024-2025', 's-022', 'cls-5a', 'INS-2024-022', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-023', 'school-1', 'ay-2024-2025', 's-023', 'cls-5a', 'INS-2024-023', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
-- 5ème B
('en-024', 'school-1', 'ay-2024-2025', 's-024', 'cls-5b', 'INS-2024-024', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-025', 'school-1', 'ay-2024-2025', 's-025', 'cls-5b', 'INS-2024-025', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-026', 'school-1', 'ay-2024-2025', 's-026', 'cls-5b', 'INS-2024-026', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-027', 'school-1', 'ay-2024-2025', 's-027', 'cls-5b', 'INS-2024-027', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-028', 'school-1', 'ay-2024-2025', 's-028', 'cls-5b', 'INS-2024-028', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-029', 'school-1', 'ay-2024-2025', 's-029', 'cls-5b', 'INS-2024-029', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-030', 'school-1', 'ay-2024-2025', 's-030', 'cls-5b', 'INS-2024-030', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
-- 4ème A
('en-031', 'school-1', 'ay-2024-2025', 's-031', 'cls-4a', 'INS-2024-031', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-032', 'school-1', 'ay-2024-2025', 's-032', 'cls-4a', 'INS-2024-032', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-033', 'school-1', 'ay-2024-2025', 's-033', 'cls-4a', 'INS-2024-033', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-034', 'school-1', 'ay-2024-2025', 's-034', 'cls-4a', 'INS-2024-034', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-035', 'school-1', 'ay-2024-2025', 's-035', 'cls-4a', 'INS-2024-035', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-036', 'school-1', 'ay-2024-2025', 's-036', 'cls-4a', 'INS-2024-036', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-037', 'school-1', 'ay-2024-2025', 's-037', 'cls-4a', 'INS-2024-037', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-038', 'school-1', 'ay-2024-2025', 's-038', 'cls-4a', 'INS-2024-038', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
-- 4ème B
('en-039', 'school-1', 'ay-2024-2025', 's-039', 'cls-4b', 'INS-2024-039', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-040', 'school-1', 'ay-2024-2025', 's-040', 'cls-4b', 'INS-2024-040', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-041', 'school-1', 'ay-2024-2025', 's-041', 'cls-4b', 'INS-2024-041', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-042', 'school-1', 'ay-2024-2025', 's-042', 'cls-4b', 'INS-2024-042', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-043', 'school-1', 'ay-2024-2025', 's-043', 'cls-4b', 'INS-2024-043', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-044', 'school-1', 'ay-2024-2025', 's-044', 'cls-4b', 'INS-2024-044', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-045', 'school-1', 'ay-2024-2025', 's-045', 'cls-4b', 'INS-2024-045', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
-- 3ème A
('en-046', 'school-1', 'ay-2024-2025', 's-046', 'cls-3a', 'INS-2024-046', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-047', 'school-1', 'ay-2024-2025', 's-047', 'cls-3a', 'INS-2024-047', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-048', 'school-1', 'ay-2024-2025', 's-048', 'cls-3a', 'INS-2024-048', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-049', 'school-1', 'ay-2024-2025', 's-049', 'cls-3a', 'INS-2024-049', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-050', 'school-1', 'ay-2024-2025', 's-050', 'cls-3a', 'INS-2024-050', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-051', 'school-1', 'ay-2024-2025', 's-051', 'cls-3a', 'INS-2024-051', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-052', 'school-1', 'ay-2024-2025', 's-052', 'cls-3a', 'INS-2024-052', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-053', 'school-1', 'ay-2024-2025', 's-053', 'cls-3a', 'INS-2024-053', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
-- 3ème B
('en-054', 'school-1', 'ay-2024-2025', 's-054', 'cls-3b', 'INS-2024-054', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-055', 'school-1', 'ay-2024-2025', 's-055', 'cls-3b', 'INS-2024-055', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-056', 'school-1', 'ay-2024-2025', 's-056', 'cls-3b', 'INS-2024-056', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-057', 'school-1', 'ay-2024-2025', 's-057', 'cls-3b', 'INS-2024-057', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-058', 'school-1', 'ay-2024-2025', 's-058', 'cls-3b', 'INS-2024-058', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-059', 'school-1', 'ay-2024-2025', 's-059', 'cls-3b', 'INS-2024-059', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now')),
('en-060', 'school-1', 'ay-2024-2025', 's-060', 'cls-3b', 'INS-2024-060', '2024-09-02', 'ACTIVE', 'RENOUVELLEMENT', datetime('now'), datetime('now'));

-- ── 8. MATIÈRES ──────────────────────────────────────────────
INSERT INTO subjects (id, school_id, name, code, color, created_at, updated_at) VALUES
('sub-math', 'school-1', 'Mathématiques', 'MATH', '#4f46e5', datetime('now'), datetime('now')),
('sub-fr',   'school-1', 'Français',       'FR',   '#0891b2', datetime('now'), datetime('now')),
('sub-svt',  'school-1', 'SVT',            'SVT',  '#16a34a', datetime('now'), datetime('now')),
('sub-ang',  'school-1', 'Anglais',        'ANG',  '#dc2626', datetime('now'), datetime('now')),
('sub-hist', 'school-1', 'Histoire-Géo',   'HG',   '#d97706', datetime('now'), datetime('now')),
('sub-phys', 'school-1', 'Physique-Chimie','PC',   '#7c3aed', datetime('now'), datetime('now')),
('sub-eps',  'school-1', 'EPS',            'EPS',  '#059669', datetime('now'), datetime('now')),
('sub-art',  'school-1', 'Arts Plastiques','ART',  '#db2777', datetime('now'), datetime('now'));

-- ── 9. TYPES DE NOTES ────────────────────────────────────────
INSERT INTO grade_types (id, school_id, name, max_score, created_at, updated_at) VALUES
('gt-ctrl', 'school-1', 'Contrôle', 20.0, datetime('now'), datetime('now')),
('gt-exam', 'school-1', 'Examen', 20.0, datetime('now'), datetime('now')),
('gt-dv',   'school-1', 'Devoir', 20.0, datetime('now'), datetime('now'));

-- ── 10. PÉRIODES D'ÉVALUATION ────────────────────────────────
INSERT INTO grading_periods (id, school_id, academic_year_id, name, period_order, start_date, end_date, is_active, created_at, updated_at) VALUES
('gp-t1', 'school-1', 'ay-2024-2025', 'Trimestre 1', 1, '2024-09-02', '2024-12-13', 0, datetime('now'), datetime('now')),
('gp-t2', 'school-1', 'ay-2024-2025', 'Trimestre 2', 2, '2025-01-06', '2025-03-28', 1, datetime('now'), datetime('now')),
('gp-t3', 'school-1', 'ay-2024-2025', 'Trimestre 3', 3, '2025-04-07', '2025-07-04', 0, datetime('now'), datetime('now'));

-- ── 11. MATIÈRES PAR CLASSE (class_subjects) ─────────────────
-- 6ème A
INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, created_at, updated_at) VALUES
('cs-6a-math', 'school-1', 'ay-2024-2025', 'cls-6a', 'sub-math', 'st-001', 4.0, datetime('now'), datetime('now')),
('cs-6a-fr',   'school-1', 'ay-2024-2025', 'cls-6a', 'sub-fr',   'st-002', 3.0, datetime('now'), datetime('now')),
('cs-6a-svt',  'school-1', 'ay-2024-2025', 'cls-6a', 'sub-svt',  'st-003', 2.0, datetime('now'), datetime('now')),
('cs-6a-ang',  'school-1', 'ay-2024-2025', 'cls-6a', 'sub-ang',  'st-004', 3.0, datetime('now'), datetime('now')),
('cs-6a-hist', 'school-1', 'ay-2024-2025', 'cls-6a', 'sub-hist', 'st-005', 2.0, datetime('now'), datetime('now')),
('cs-6a-phys', 'school-1', 'ay-2024-2025', 'cls-6a', 'sub-phys', 'st-009', 3.0, datetime('now'), datetime('now'));
-- 6ème B
INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, created_at, updated_at) VALUES
('cs-6b-math', 'school-1', 'ay-2024-2025', 'cls-6b', 'sub-math', 'st-001', 4.0, datetime('now'), datetime('now')),
('cs-6b-fr',   'school-1', 'ay-2024-2025', 'cls-6b', 'sub-fr',   'st-002', 3.0, datetime('now'), datetime('now')),
('cs-6b-ang',  'school-1', 'ay-2024-2025', 'cls-6b', 'sub-ang',  'st-004', 3.0, datetime('now'), datetime('now')),
('cs-6b-hist', 'school-1', 'ay-2024-2025', 'cls-6b', 'sub-hist', 'st-005', 2.0, datetime('now'), datetime('now')),
('cs-6b-phys', 'school-1', 'ay-2024-2025', 'cls-6b', 'sub-phys', 'st-009', 3.0, datetime('now'), datetime('now'));
-- 3ème A
INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, created_at, updated_at) VALUES
('cs-3a-math', 'school-1', 'ay-2024-2025', 'cls-3a', 'sub-math', 'st-001', 5.0, datetime('now'), datetime('now')),
('cs-3a-fr',   'school-1', 'ay-2024-2025', 'cls-3a', 'sub-fr',   'st-002', 4.0, datetime('now'), datetime('now')),
('cs-3a-svt',  'school-1', 'ay-2024-2025', 'cls-3a', 'sub-svt',  'st-003', 3.0, datetime('now'), datetime('now')),
('cs-3a-ang',  'school-1', 'ay-2024-2025', 'cls-3a', 'sub-ang',  'st-004', 3.0, datetime('now'), datetime('now')),
('cs-3a-hist', 'school-1', 'ay-2024-2025', 'cls-3a', 'sub-hist', 'st-005', 3.0, datetime('now'), datetime('now')),
('cs-3a-phys', 'school-1', 'ay-2024-2025', 'cls-3a', 'sub-phys', 'st-009', 4.0, datetime('now'), datetime('now'));

-- ── 12. NOTES (T1 et T2 pour quelques classes) ────────────────
-- 6ème A — Mathématiques — T1
INSERT INTO grades (id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id, grading_period_id, grade_type_id, score, max_score, evaluation_date, recorded_by, is_absent, created_at, updated_at) VALUES
('gr-001', 'school-1', 'ay-2024-2025', 'en-001', 's-001', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 15.5, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-002', 'school-1', 'ay-2024-2025', 'en-002', 's-002', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 17.0, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-003', 'school-1', 'ay-2024-2025', 'en-003', 's-003', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 12.0, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-004', 'school-1', 'ay-2024-2025', 'en-004', 's-004', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 14.5, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-005', 'school-1', 'ay-2024-2025', 'en-005', 's-005', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 18.0, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-006', 'school-1', 'ay-2024-2025', 'en-006', 's-006', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 09.5, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-007', 'school-1', 'ay-2024-2025', 'en-007', 's-007', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 16.0, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
('gr-008', 'school-1', 'ay-2024-2025', 'en-008', 's-008', 'cs-6a-math', 'gp-t1', 'gt-ctrl', 13.5, 20.0, '2024-10-15', 'system', 0, datetime('now'), datetime('now')),
-- 6ème A — Français — T1
('gr-009',  'school-1', 'ay-2024-2025', 'en-001', 's-001', 'cs-6a-fr', 'gp-t1', 'gt-ctrl', 14.0, 20.0, '2024-10-16', 'system', 0, datetime('now'), datetime('now')),
('gr-010',  'school-1', 'ay-2024-2025', 'en-002', 's-002', 'cs-6a-fr', 'gp-t1', 'gt-ctrl', 16.5, 20.0, '2024-10-16', 'system', 0, datetime('now'), datetime('now')),
('gr-011',  'school-1', 'ay-2024-2025', 'en-003', 's-003', 'cs-6a-fr', 'gp-t1', 'gt-ctrl', 11.0, 20.0, '2024-10-16', 'system', 0, datetime('now'), datetime('now')),
('gr-012',  'school-1', 'ay-2024-2025', 'en-004', 's-004', 'cs-6a-fr', 'gp-t1', 'gt-ctrl', 13.5, 20.0, '2024-10-16', 'system', 0, datetime('now'), datetime('now')),
-- 3ème A — Mathématiques — T1
('gr-021', 'school-1', 'ay-2024-2025', 'en-046', 's-046', 'cs-3a-math', 'gp-t1', 'gt-exam', 16.5, 20.0, '2024-12-02', 'system', 0, datetime('now'), datetime('now')),
('gr-022', 'school-1', 'ay-2024-2025', 'en-047', 's-047', 'cs-3a-math', 'gp-t1', 'gt-exam', 14.0, 20.0, '2024-12-02', 'system', 0, datetime('now'), datetime('now')),
('gr-023', 'school-1', 'ay-2024-2025', 'en-048', 's-048', 'cs-3a-math', 'gp-t1', 'gt-exam', 18.5, 20.0, '2024-12-02', 'system', 0, datetime('now'), datetime('now')),
('gr-024', 'school-1', 'ay-2024-2025', 'en-049', 's-049', 'cs-3a-math', 'gp-t1', 'gt-exam', 11.0, 20.0, '2024-12-02', 'system', 0, datetime('now'), datetime('now')),
('gr-025', 'school-1', 'ay-2024-2025', 'en-050', 's-050', 'cs-3a-math', 'gp-t1', 'gt-exam', 15.5, 20.0, '2024-12-02', 'system', 0, datetime('now'), datetime('now'));

-- ── 13. GRILLE TARIFAIRE ────────────────────────────────────
INSERT INTO fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, due_date, is_mandatory, created_at, updated_at) VALUES
('fs-001', 'school-1', 'ay-2024-2025', 'Frais d''inscription',     3500000, 'INSCRIPTION', 'ALL', '2024-09-30', 1, datetime('now'), datetime('now')),
('fs-002', 'school-1', 'ay-2024-2025', 'Scolarité T1',             7500000, 'SCOLARITE',   'ALL', '2024-10-31', 1, datetime('now'), datetime('now')),
('fs-003', 'school-1', 'ay-2024-2025', 'Scolarité T2',             7500000, 'SCOLARITE',   'ALL', '2025-01-31', 1, datetime('now'), datetime('now')),
('fs-004', 'school-1', 'ay-2024-2025', 'Scolarité T3',             7500000, 'SCOLARITE',   'ALL', '2025-04-30', 1, datetime('now'), datetime('now')),
('fs-005', 'school-1', 'ay-2024-2025', 'Frais de transport',       2500000, 'TRANSPORT',   'ALL', NULL,         0, datetime('now'), datetime('now')),
('fs-006', 'school-1', 'ay-2024-2025', 'Cantine scolaire',         1800000, 'CANTINE',     'ALL', NULL,         0, datetime('now'), datetime('now'));

-- ── 14. PAIEMENTS ────────────────────────────────────────────
INSERT INTO payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, receipt_number, recorded_by, status, created_at, updated_at) VALUES
('pay-001', 'school-1', 'ay-2024-2025', 'en-001', 's-001', 'fs-001', 3500000, '2024-09-03', 'ESPECES',      'REC-2024-001', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-002', 'school-1', 'ay-2024-2025', 'en-001', 's-001', 'fs-002', 7500000, '2024-10-05', 'MOBILE_MONEY', 'REC-2024-002', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-003', 'school-1', 'ay-2024-2025', 'en-002', 's-002', 'fs-001', 3500000, '2024-09-04', 'ESPECES',      'REC-2024-003', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-004', 'school-1', 'ay-2024-2025', 'en-002', 's-002', 'fs-002', 7500000, '2024-10-07', 'ESPECES',      'REC-2024-004', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-005', 'school-1', 'ay-2024-2025', 'en-003', 's-003', 'fs-001', 3500000, '2024-09-05', 'VIREMENT',     'REC-2024-005', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-006', 'school-1', 'ay-2024-2025', 'en-004', 's-004', 'fs-001', 3500000, '2024-09-06', 'ESPECES',      'REC-2024-006', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-007', 'school-1', 'ay-2024-2025', 'en-005', 's-005', 'fs-001', 3500000, '2024-09-08', 'MOBILE_MONEY', 'REC-2024-007', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-008', 'school-1', 'ay-2024-2025', 'en-005', 's-005', 'fs-002', 7500000, '2024-10-10', 'MOBILE_MONEY', 'REC-2024-008', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-009', 'school-1', 'ay-2024-2025', 'en-046', 's-046', 'fs-001', 3500000, '2024-09-02', 'ESPECES',      'REC-2024-009', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-010', 'school-1', 'ay-2024-2025', 'en-046', 's-046', 'fs-002', 7500000, '2024-10-01', 'ESPECES',      'REC-2024-010', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-011', 'school-1', 'ay-2024-2025', 'en-046', 's-046', 'fs-003', 7500000, '2025-01-07', 'ESPECES',      'REC-2024-011', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-012', 'school-1', 'ay-2024-2025', 'en-047', 's-047', 'fs-001', 3500000, '2024-09-02', 'CHEQUE',       'REC-2024-012', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-013', 'school-1', 'ay-2024-2025', 'en-016', 's-016', 'fs-001', 3500000, '2024-09-03', 'ESPECES',      'REC-2024-013', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-014', 'school-1', 'ay-2024-2025', 'en-016', 's-016', 'fs-002', 7500000, '2024-10-02', 'MOBILE_MONEY', 'REC-2024-014', 'system', 'VALID', datetime('now'), datetime('now')),
('pay-015', 'school-1', 'ay-2024-2025', 'en-031', 's-031', 'fs-001', 3500000, '2024-09-04', 'ESPECES',      'REC-2024-015', 'system', 'VALID', datetime('now'), datetime('now'));
