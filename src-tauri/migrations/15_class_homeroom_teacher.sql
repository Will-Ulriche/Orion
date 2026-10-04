-- Migration 15 : Ajout du professeur titulaire à la table classes
ALTER TABLE classes ADD COLUMN homeroom_teacher_id TEXT REFERENCES staff(id);
