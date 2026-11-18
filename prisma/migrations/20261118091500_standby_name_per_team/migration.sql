-- Bereitschaftszeiten: gleicher Name für verschiedene Teams erlaubt
-- (z. B. „Nachtbereitschaft“ für Team Nord und Team Süd). Eindeutig bleibt der Name nur innerhalb eines Teams – das prüft die App.
DROP INDEX IF EXISTS "StandbyTime_name_key";
