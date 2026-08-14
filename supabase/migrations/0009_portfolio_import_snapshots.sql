CREATE TABLE portfolio_import_snapshots (
  id SERIAL PRIMARY KEY,
  portfolio_id INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'schwab',
  label TEXT,
  total_market_value REAL NOT NULL DEFAULT 0,
  holdings JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX ON portfolio_import_snapshots (portfolio_id, imported_at DESC);

ALTER TABLE portfolio_import_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import snapshots"
  ON portfolio_import_snapshots
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
