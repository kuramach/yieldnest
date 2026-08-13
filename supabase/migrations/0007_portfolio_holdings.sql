-- Direct holdings on a portfolio (replaces the Portfolio → Bucket → Holding hierarchy)
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id SERIAL PRIMARY KEY,
  portfolio_id INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT,
  asset_type TEXT DEFAULT 'etf',  -- 'stock' | 'etf' | 'bond'
  weight REAL NOT NULL DEFAULT 0,  -- 0 to 1
  quantity REAL DEFAULT 0,
  purchase_price REAL DEFAULT 0,
  cost_basis REAL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, ticker)
);

ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their portfolio holdings"
  ON portfolio_holdings FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );
