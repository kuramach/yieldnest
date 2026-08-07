ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS bucket_group  INTEGER CHECK (bucket_group IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS account_type  TEXT    CHECK (account_type IN ('taxable', 'pretax', 'roth'));
