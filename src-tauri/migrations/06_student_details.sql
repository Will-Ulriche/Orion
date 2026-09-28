-- 06_student_details.sql
ALTER TABLE students ADD COLUMN photo_url TEXT;
ALTER TABLE students ADD COLUMN matricule TEXT;
ALTER TABLE students ADD COLUMN address TEXT;
ALTER TABLE students ADD COLUMN phone TEXT;
ALTER TABLE students ADD COLUMN parent_name TEXT;
ALTER TABLE students ADD COLUMN parent_phone TEXT;
ALTER TABLE students ADD COLUMN parent_email TEXT;
ALTER TABLE students ADD COLUMN blood_type TEXT;
ALTER TABLE students ADD COLUMN medical_notes TEXT;
