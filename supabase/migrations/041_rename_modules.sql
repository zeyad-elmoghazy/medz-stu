-- =============================================================
-- MediZee · 041_rename_modules.sql
-- =============================================================
-- Data-only: new display names for the Year 1 and Year 2 modules.
-- Names live only in modules.name and are read at runtime, so no
-- app deploy is needed. Idempotent.
-- =============================================================

UPDATE modules AS m
SET name = v.name
FROM (VALUES
  ('101', 'ISK-101'),
  ('102', 'INT-102'),
  ('103', 'BMS-103'),
  ('104', 'CPS-104 (Cardiopulmonary System)'),
  ('205', 'Central Nervous System'),
  ('206', 'Gastrointestinal System'),
  ('207', 'Endocrine')
) AS v(code, name)
WHERE m.code = v.code;
