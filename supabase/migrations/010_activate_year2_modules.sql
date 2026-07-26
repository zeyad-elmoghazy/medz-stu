-- Activate year-2 histology modules so professors can author
-- against them in UploadWizard (which filters on is_active).
UPDATE modules SET is_active = true WHERE code IN ('205', '206', '207');
