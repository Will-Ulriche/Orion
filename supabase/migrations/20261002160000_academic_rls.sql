-- ============================================================
-- Correction des politiques RLS (Row Level Security)
-- Permet aux utilisateurs authentifiés de synchroniser les données
-- ============================================================

-- Politiques pour la table grading_periods
CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.grading_periods
    FOR ALL USING (auth.role() = 'authenticated');

-- Politiques pour les autres tables académiques qui en ont besoin
CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.class_subjects
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.subjects
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.grade_types
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.teacher_assignments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Permettre tout aux utilisateurs authentifiés" ON public.grades
    FOR ALL USING (auth.role() = 'authenticated');
