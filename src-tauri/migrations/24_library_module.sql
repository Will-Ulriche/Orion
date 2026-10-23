-- ============================================================
-- Migration 24 — Session 6 : Module Bibliothèque
-- ============================================================
-- Catalogue (ouvrages), catégories, exemplaires/inventaire, lecteurs,
-- emprunts, retours, pénalités et réservations.
-- Toute donnée est isolée par `school_id`.

-- 1. Catégories de classement
CREATE TABLE IF NOT EXISTS library_categories (
    id          TEXT PRIMARY KEY,
    school_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    code        TEXT,
    description TEXT,
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_library_categories_school ON library_categories(school_id, name);

-- 2. Catalogue des livres (ouvrages)
CREATE TABLE IF NOT EXISTS library_books (
    id               TEXT PRIMARY KEY,
    school_id        TEXT NOT NULL,
    category_id      TEXT,
    isbn             TEXT,
    title            TEXT NOT NULL,
    author           TEXT,
    publisher        TEXT,
    publication_year INTEGER,
    language         TEXT DEFAULT 'Français',
    edition          TEXT,
    pages            INTEGER,
    description      TEXT,
    shelf_location   TEXT,
    is_reference     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (category_id) REFERENCES library_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_library_books_school   ON library_books(school_id, title);
CREATE INDEX IF NOT EXISTS idx_library_books_category ON library_books(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_isbn ON library_books(school_id, isbn);

-- 3. Exemplaires et inventaire
CREATE TABLE IF NOT EXISTS library_copies (
    id                TEXT PRIMARY KEY,
    school_id         TEXT NOT NULL,
    book_id           TEXT NOT NULL,
    inventory_code    TEXT NOT NULL,
    barcode           TEXT,
    status            TEXT NOT NULL DEFAULT 'DISPONIBLE',
    condition         TEXT DEFAULT 'Bon',
    acquisition_date  TEXT,
    acquisition_source TEXT,
    price             REAL,
    location          TEXT,
    notes             TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_copies_book   ON library_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_library_copies_status ON library_copies(school_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_copies_inventory ON library_copies(school_id, inventory_code);

-- 4. Lecteurs (élèves, personnels, externes)
CREATE TABLE IF NOT EXISTS library_readers (
    id            TEXT PRIMARY KEY,
    school_id     TEXT NOT NULL,
    reader_type   TEXT NOT NULL DEFAULT 'ELEVE',
    student_id    TEXT,
    staff_id      TEXT,
    full_name     TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    card_number   TEXT NOT NULL,
    class_name    TEXT,
    max_loans     INTEGER NOT NULL DEFAULT 3,
    status        TEXT NOT NULL DEFAULT 'ACTIF',
    registered_at TEXT,
    expires_at    TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_library_readers_school ON library_readers(school_id, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_readers_card ON library_readers(school_id, card_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_readers_student ON library_readers(school_id, student_id)
    WHERE student_id IS NOT NULL;

-- 5. Emprunts
CREATE TABLE IF NOT EXISTS library_loans (
    id              TEXT PRIMARY KEY,
    school_id       TEXT NOT NULL,
    copy_id         TEXT NOT NULL,
    reader_id       TEXT NOT NULL,
    book_id         TEXT NOT NULL,
    loan_date       TEXT NOT NULL,
    due_date        TEXT NOT NULL,
    returned_at     TEXT,
    status          TEXT NOT NULL DEFAULT 'EN_COURS',
    loan_condition  TEXT,
    notes           TEXT,
    created_by      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (copy_id) REFERENCES library_copies(id) ON DELETE CASCADE,
    FOREIGN KEY (reader_id) REFERENCES library_readers(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_loans_reader ON library_loans(reader_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_copy   ON library_loans(copy_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_school ON library_loans(school_id, status);

-- 6. Retours
CREATE TABLE IF NOT EXISTS library_returns (
    id             TEXT PRIMARY KEY,
    school_id      TEXT NOT NULL,
    loan_id        TEXT NOT NULL,
    copy_id        TEXT NOT NULL,
    reader_id      TEXT NOT NULL,
    returned_at    TEXT NOT NULL,
    loan_condition TEXT,
    late_days      INTEGER NOT NULL DEFAULT 0,
    fine_amount    REAL NOT NULL DEFAULT 0,
    remarks        TEXT,
    handled_by     TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (loan_id) REFERENCES library_loans(id) ON DELETE CASCADE,
    FOREIGN KEY (copy_id) REFERENCES library_copies(id) ON DELETE CASCADE,
    FOREIGN KEY (reader_id) REFERENCES library_readers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_returns_school ON library_returns(school_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_library_returns_loan   ON library_returns(loan_id);

-- 7. Pénalités (retards, pertes, dégradations)
CREATE TABLE IF NOT EXISTS library_penalties (
    id           TEXT PRIMARY KEY,
    school_id    TEXT NOT NULL,
    reader_id    TEXT NOT NULL,
    loan_id      TEXT,
    penalty_type TEXT NOT NULL DEFAULT 'RETARD',
    amount       REAL NOT NULL DEFAULT 0,
    days_late    INTEGER NOT NULL DEFAULT 0,
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    paid_at      TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (reader_id) REFERENCES library_readers(id) ON DELETE CASCADE,
    FOREIGN KEY (loan_id) REFERENCES library_loans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_library_penalties_school ON library_penalties(school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_penalties_reader ON library_penalties(reader_id);

-- 8. Réservations (portent sur l'ouvrage, pas sur l'exemplaire)
CREATE TABLE IF NOT EXISTS library_reservations (
    id              TEXT PRIMARY KEY,
    school_id       TEXT NOT NULL,
    book_id         TEXT NOT NULL,
    reader_id       TEXT NOT NULL,
    reserved_at     TEXT NOT NULL,
    available_at    TEXT,
    expires_at      TEXT,
    status          TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    queue_position  INTEGER NOT NULL DEFAULT 1,
    notified_at     TEXT,
    fulfilled_at    TEXT,
    loan_id         TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
    FOREIGN KEY (reader_id) REFERENCES library_readers(id) ON DELETE CASCADE,
    FOREIGN KEY (loan_id) REFERENCES library_loans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_library_reservations_school ON library_reservations(school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_reservations_book   ON library_reservations(book_id, status);

-- 9. Paramètres de la bibliothèque (une ligne par établissement)
CREATE TABLE IF NOT EXISTS library_settings (
    id                     TEXT PRIMARY KEY,
    school_id              TEXT NOT NULL UNIQUE,
    loan_duration_days     INTEGER NOT NULL DEFAULT 14,
    max_loans_per_reader   INTEGER NOT NULL DEFAULT 3,
    fine_per_day           REAL    NOT NULL DEFAULT 100,
    grace_days             INTEGER NOT NULL DEFAULT 0,
    reservation_expiry_days INTEGER NOT NULL DEFAULT 7,
    updated_at             TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);
