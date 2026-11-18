-- Geburtstag (ohne Jahr, MM-TT) je Mitarbeiter – sichtbar nur im eigenen Team
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthday" TEXT;
