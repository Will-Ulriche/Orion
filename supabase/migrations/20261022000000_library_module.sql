-- ============================================================
-- Session 6 : Module Bibliothèque (schéma distant)
-- ============================================================
-- Aligne le schéma Supabase sur la migration locale 24_library_module.sql.
-- Le poste local étant l'application de référence, les identifiants sont des
-- UUID (générés par rusqlite côté client) et les horodatages des TIMESTAMPTZ.

-- 1. Catégories de classement
CREATE TABLE IF NOT EXISTS public.library_categories (
    id          UUID PRIMARY KEY,
    school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    code        TEXT,
    description TEXT,
    color       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_categories_school
    ON public.library_categories(school_id, name);

-- 2. Catalogue des livres (ouvrages)
CREATE TABLE IF NOT EXISTS public.library_books (
    id               UUID PRIMARY KEY,
    school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    category_id      UUID REFERENCES public.library_categories(id) ON DELETE SET NULL,
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
    is_reference     BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_books_school
    ON public.library_books(school_id, title);
CREATE INDEX IF NOT EXISTS idx_library_books_category
    ON public.library_books(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_isbn
    ON public.library_books(school_id, isbn) WHERE isbn IS NOT NULL;

-- 3. Exemplaires et inventaire
CREATE TABLE IF NOT EXISTS public.library_copies (
    id                 UUID PRIMARY KEY,
    school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    book_id            UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
    inventory_code     TEXT NOT NULL,
    barcode            TEXT,
    status             TEXT NOT NULL DEFAULT 'DISPONIBLE',
    condition          TEXT DEFAULT 'Bon',
    acquisition_date   TEXT,
    acquisition_source TEXT,
    price              NUMERIC(12, 2),
    location           TEXT,
    notes              TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_copies_book
    ON public.library_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_library_copies_status
    ON public.library_copies(school_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_copies_inventory
    ON public.library_copies(school_id, inventory_code);

-- 4. Lecteurs (élèves, personnels, externes)
CREATE TABLE IF NOT EXISTS public.library_readers (
    id            UUID PRIMARY KEY,
    school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    reader_type   TEXT NOT NULL DEFAULT 'ELEVE',
    student_id    UUID REFERENCES public.students(id) ON DELETE SET NULL,
    -- Le module personnel n'est pas encore synchronisé (pas de table `public.staff`
    -- en base distante) : `staff_id` est conservé sans clé étrangère pour ne pas
    -- bloquer la synchronisation des lecteurs.
    staff_id      UUID,
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
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_readers_school
    ON public.library_readers(school_id, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_readers_card
    ON public.library_readers(school_id, card_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_readers_student
    ON public.library_readers(school_id, student_id) WHERE student_id IS NOT NULL;

-- 5. Emprunts
CREATE TABLE IF NOT EXISTS public.library_loans (
    id              UUID PRIMARY KEY,
    school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    copy_id         UUID NOT NULL REFERENCES public.library_copies(id) ON DELETE CASCADE,
    reader_id       UUID NOT NULL REFERENCES public.library_readers(id) ON DELETE CASCADE,
    book_id         UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
    loan_date       TIMESTAMPTZ DEFAULT NOW(),
    due_date        TIMESTAMPTZ NOT NULL,
    returned_at     TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'EN_COURS',
    loan_condition  TEXT,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_loans_reader
    ON public.library_loans(reader_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_copy
    ON public.library_loans(copy_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_school
    ON public.library_loans(school_id, status);

-- 6. Retours
CREATE TABLE IF NOT EXISTS public.library_returns (
    id             UUID PRIMARY KEY,
    school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    loan_id        UUID NOT NULL REFERENCES public.library_loans(id) ON DELETE CASCADE,
    copy_id        UUID NOT NULL REFERENCES public.library_copies(id) ON DELETE CASCADE,
    reader_id      UUID NOT NULL REFERENCES public.library_readers(id) ON DELETE CASCADE,
    returned_at    TIMESTAMPTZ NOT NULL,
    loan_condition TEXT,
    late_days      INTEGER NOT NULL DEFAULT 0,
    fine_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    remarks        TEXT,
    handled_by     UUID,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_returns_school
    ON public.library_returns(school_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_library_returns_loan
    ON public.library_returns(loan_id);

-- 7. Pénalités (retards, pertes, dégradations)
CREATE TABLE IF NOT EXISTS public.library_penalties (
    id           UUID PRIMARY KEY,
    school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    reader_id    UUID NOT NULL REFERENCES public.library_readers(id) ON DELETE CASCADE,
    loan_id      UUID REFERENCES public.library_loans(id) ON DELETE SET NULL,
    penalty_type TEXT NOT NULL DEFAULT 'RETARD',
    amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    days_late    INTEGER NOT NULL DEFAULT 0,
    description  TEXT,
    status       TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    paid_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_penalties_school
    ON public.library_penalties(school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_penalties_reader
    ON public.library_penalties(reader_id);

-- 8. Réservations (portent sur l'ouvrage, pas sur l'exemplaire)
CREATE TABLE IF NOT EXISTS public.library_reservations (
    id             UUID PRIMARY KEY,
    school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    book_id        UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
    reader_id      UUID NOT NULL REFERENCES public.library_readers(id) ON DELETE CASCADE,
    reserved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    available_at   TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ,
    status         TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    queue_position INTEGER NOT NULL DEFAULT 1,
    notified_at    TIMESTAMPTZ,
    fulfilled_at   TIMESTAMPTZ,
    loan_id        UUID REFERENCES public.library_loans(id) ON DELETE SET NULL,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_reservations_school
    ON public.library_reservations(school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_reservations_book
    ON public.library_reservations(book_id, status);

-- 9. Paramètres de la bibliothèque (une ligne par établissement)
CREATE TABLE IF NOT EXISTS public.library_settings (
    id                     UUID PRIMARY KEY,
    school_id              UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
    loan_duration_days     INTEGER NOT NULL DEFAULT 14,
    max_loans_per_reader   INTEGER NOT NULL DEFAULT 3,
    fine_per_day           NUMERIC(12, 2) NOT NULL DEFAULT 100,
    grace_days             INTEGER NOT NULL DEFAULT 0,
    reservation_expiry_days INTEGER NOT NULL DEFAULT 7,
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Curseur de synchronisation : triggers updated_at
-- ============================================================
-- Sans trigger, un UPDATE distant ne modifie pas `updated_at` et la ligne
-- reste invisible aux tirages suivants de la sync entrante.
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'library_categories',
        'library_books',
        'library_readers',
        'library_copies',
        'library_loans',
        'library_returns',
        'library_penalties',
        'library_reservations',
        'library_settings'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
    END LOOP;
END $$;

-- ============================================================
-- Sécurité (RLS)
-- ============================================================
-- L'authentification est portée par les tables `profiles` / `user_roles` :
-- chaque utilisateur authentifié ne voit que son établissement.
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'library_categories',
        'library_books',
        'library_readers',
        'library_copies',
        'library_loans',
        'library_returns',
        'library_penalties',
        'library_reservations',
        'library_settings'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_school_scope', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR ALL
             USING (
                 school_id::text IN (
                     SELECT school_id::text FROM public.profiles
                     WHERE user_id::text = auth.uid()::text
                 )
                 OR school_id::text IN (
                     SELECT school_id::text FROM public.user_roles
                     WHERE user_id::text = auth.uid()::text
                 )
             )', t || '_school_scope', t);
    END LOOP;
END $$;

-- ============================================================
-- Suppression d'un établissement : tables filles de la bibliothèque
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_school_cascade(p_school_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'library_returns',
        'library_penalties',
        'library_reservations',
        'library_loans',
        'library_copies',
        'library_readers',
        'library_books',
        'library_categories',
        'library_settings',
        'grades',
        'teacher_assignments',
        'class_subjects',
        'grading_periods',
        'grade_types',
        'subjects',
        'enrollment_history',   -- pas de school_id : rattaché via inscription/année
        'enrollments',
        'classes',
        'students',
        'academic_years',
        'audit_logs',
        'devices',
        'licenses',
        'user_roles',
        'profiles'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        BEGIN
            IF t = 'enrollment_history' THEN
                EXECUTE
                    'DELETE FROM public.enrollment_history
                      WHERE enrollment_id::text IN (
                                SELECT id::text FROM public.enrollments
                                WHERE school_id::text = $1
                            )
                         OR academic_year_id::text IN (
                                SELECT id::text FROM public.academic_years
                                WHERE school_id::text = $1
                            )'
                    USING p_school_id;
            ELSE
                EXECUTE format('DELETE FROM public.%I WHERE school_id::text = $1', t)
                    USING p_school_id;
            END IF;
        EXCEPTION
            WHEN undefined_table  THEN NULL;  -- table absente : ignorer
            WHEN undefined_column THEN NULL;  -- pas de colonne school_id : ignorer
        END;
    END LOOP;

    -- L'établissement lui-même.
    DELETE FROM public.schools WHERE id::text = p_school_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_school_cascade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_cascade(text) TO authenticated, service_role;
