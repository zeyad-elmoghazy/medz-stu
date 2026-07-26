-- =============================================================
-- Replace HIST chapter list with the updated curriculum.
-- 007_professor_authoring.sql already ran on deployed DBs, so its
-- seed edit alone won't reach them — this migration re-seeds.
-- Deleting cascades chapter_id -> NULL on questions (ON DELETE
-- SET NULL), so the cartilage backfill below reattaches them.
-- =============================================================

DELETE FROM chapters WHERE module_code IN ('101', '103', '104', '205', '206', '207');

INSERT INTO chapters (module_code, slug, name, ordinal)
VALUES
  -- HIST 101
  ('101', 'cytology',                     'Cytology',                     1),
  ('101', 'connective-tissue',            'Connective Tissue',            2),
  ('101', 'epithelium',                   'Epithelium',                   3),
  ('101', 'blood',                        'Blood',                        4),
  -- HIST 103
  ('103', 'cartilage',                    'Cartilage',                    1),
  ('103', 'bone',                         'Bone',                         2),
  ('103', 'muscle',                       'Muscle',                       3),
  ('103', 'skin',                         'Skin',                         4),
  -- HIST 104
  ('104', 'lymphatics',                   'Lymphatics',                   1),
  ('104', 'vascular',                     'Vascular',                     2),
  ('104', 'respiratory',                  'Respiratory',                  3),
  ('104', 'cytogenetics',                 'Cytogenetics',                 4),
  -- HIST 205
  ('205', 'nervous-tissue',               'Nervous Tissue',               1),
  ('205', 'central-nervous-system',       'Central Nervous System',       2),
  ('205', 'eye',                          'Eye',                          3),
  ('205', 'ear',                          'Ear',                          4),
  -- HIST 206
  ('206', 'digestive-tract',              'Digestive Tract',              1),
  ('206', 'digestive-glands',             'Digestive Glands',             2),
  ('206', 'urinary-system',               'Urinary System',               3),
  -- HIST 207
  ('207', 'endocrine-system',             'Endocrine System',             1),
  ('207', 'male-reproductive-system',     'Male Reproductive System',     2),
  ('207', 'female-reproductive-system',   'Female Reproductive System',   3)
ON CONFLICT (module_code, slug) DO NOTHING;

DO $$
DECLARE
  target_chapter UUID;
BEGIN
  SELECT id INTO target_chapter
  FROM chapters
  WHERE module_code = '103' AND slug = 'cartilage'
  LIMIT 1;

  IF target_chapter IS NOT NULL THEN
    UPDATE questions
    SET chapter_id = target_chapter
    WHERE subject_id = 'histology'
      AND chapter_id IS NULL;
  END IF;
END $$;
