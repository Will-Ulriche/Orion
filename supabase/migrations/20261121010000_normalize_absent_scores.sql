UPDATE public.grades
SET score = 0
WHERE COALESCE(is_absent, false) = true
  AND (score IS NULL OR score <> 0);
