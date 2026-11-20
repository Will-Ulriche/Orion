CREATE TABLE IF NOT EXISTS public.fee_structures (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    fee_type TEXT NOT NULL,
    applies_to TEXT NOT NULL,
    class_id TEXT,
    level TEXT,
    due_date TEXT,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    enrollment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    fee_structure_id TEXT,
    amount NUMERIC(14,2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL,
    payment_method TEXT NOT NULL,
    reference TEXT,
    receipt_number TEXT NOT NULL,
    notes TEXT,
    recorded_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'VALID',
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fee_structures, public.payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fee_structures, public.payments TO authenticated;
GRANT ALL ON TABLE public.fee_structures, public.payments TO service_role;
