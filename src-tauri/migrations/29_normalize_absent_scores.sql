UPDATE grades
SET score = 0
WHERE COALESCE(is_absent, 0) = 1
  AND (score IS NULL OR score <> 0);
