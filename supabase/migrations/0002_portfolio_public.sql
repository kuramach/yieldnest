-- Add public/import fields to portfolios
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imported_from_id INT REFERENCES portfolios(id) ON DELETE SET NULL;

-- Allow anyone (even unauthenticated) to read public portfolios
CREATE POLICY "public portfolios are readable" ON portfolios
  FOR SELECT USING (is_public = true);

-- Allow authenticated users to read buckets of public portfolios
CREATE POLICY "buckets of public portfolios are readable" ON buckets
  FOR SELECT USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE is_public = true)
  );

-- Allow authenticated users to read holdings of public portfolios
CREATE POLICY "holdings of public portfolios are readable" ON bucket_holdings
  FOR SELECT USING (
    bucket_id IN (
      SELECT bk.id FROM buckets bk
      JOIN portfolios p ON p.id = bk.portfolio_id
      WHERE p.is_public = true
    )
  );
