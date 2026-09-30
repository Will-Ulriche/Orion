-- ============================================================
-- Session 4 — Module Financier
-- ============================================================

-- Grille tarifaire
CREATE TABLE IF NOT EXISTS fee_structures (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL, -- Stocké en centimes
    fee_type TEXT NOT NULL, -- INSCRIPTION, SCOLARITE, TRANSPORT, CANTINE, AUTRE
    applies_to TEXT NOT NULL, -- ALL, CLASS, LEVEL
    class_id TEXT,
    level TEXT,
    due_date TEXT,
    is_mandatory INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Index pour optimiser les recherches de frais par école et année
CREATE INDEX IF NOT EXISTS idx_fee_structures_year ON fee_structures(school_id, academic_year_id);

-- Paiements des élèves
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    enrollment_id TEXT NOT NULL,
    student_id TEXT NOT NULL, -- Redondant, mais accélère les filtres par élève
    fee_structure_id TEXT, -- Nullable pour un paiement "générique" ou acompte sans affectation précise
    amount INTEGER NOT NULL, -- Stocké en centimes
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL, -- ESPECES, MOBILE_MONEY, VIREMENT, CHEQUE
    reference TEXT, -- N° de chèque, transaction mobile, etc.
    receipt_number TEXT NOT NULL, -- Numéro séquentiel pour le reçu
    notes TEXT,
    recorded_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'VALID', -- VALID, CANCELLED
    cancelled_at TEXT,
    cancel_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (fee_structure_id) REFERENCES fee_structures(id)
);

-- Index pour optimiser la recherche des paiements d'un élève ou d'une inscription
CREATE INDEX IF NOT EXISTS idx_payments_enrollment ON payments(school_id, academic_year_id, enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(school_id, academic_year_id, student_id);
