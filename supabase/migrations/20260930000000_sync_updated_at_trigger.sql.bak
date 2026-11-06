-- Migration : mise à jour automatique de `updated_at`
--
-- Pourquoi c'est nécessaire au moteur de synchronisation :
-- la sync entrante (inbox) ne récupère que les lignes modifiées depuis le
-- dernier curseur, via le filtre PostgREST `updated_at=gt.<curseur>`.
-- Or `updated_at TIMESTAMPTZ DEFAULT NOW()` ne s'applique qu'à l'INSERT :
-- sans trigger, un UPDATE distant ne change jamais `updated_at`, la ligne
-- reste invisible aux tirages suivants et la modification n'est jamais
-- rapatriée sur le poste local.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `enrollment_history` n'a pas de `updated_at` : c'est `changed_at` qui sert
-- d'horodatage, et donc de curseur pour la sync entrante.
CREATE OR REPLACE FUNCTION public.set_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.changed_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_academic_years_updated_at ON public.academic_years;
CREATE TRIGGER trg_academic_years_updated_at
  BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_classes_updated_at ON public.classes;
CREATE TRIGGER trg_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON public.enrollments;
CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- `enrollment_history` n'a pas de colonne `updated_at` : son horodatage est
-- `changed_at`, que la sync entrante interroge directement comme curseur.
DROP TRIGGER IF EXISTS trg_enrollment_history_changed_at ON public.enrollment_history;
CREATE TRIGGER trg_enrollment_history_changed_at
  BEFORE UPDATE ON public.enrollment_history
  FOR EACH ROW
  WHEN (NEW.enrollment_id, NEW.student_id, NEW.academic_year_id,
        NEW.from_class_id, NEW.to_class_id, NEW.reason)
    IS DISTINCT FROM
       (OLD.enrollment_id, OLD.student_id, OLD.academic_year_id,
        OLD.from_class_id, OLD.to_class_id, OLD.reason)
  EXECUTE FUNCTION public.set_changed_at();
