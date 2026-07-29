-- Portfolios: each user can have multiple named portfolios
CREATE TABLE IF NOT EXISTS portfolios (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  linked_360r_scenario_id INT,  -- optional link to 360Retirement scenario
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buckets: target-return tiers within a portfolio
CREATE TABLE IF NOT EXISTS buckets (
  id SERIAL PRIMARY KEY,
  portfolio_id INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Bucket',
  target_return REAL NOT NULL,   -- e.g. 0.07 for 7%
  lifespan_years INT NOT NULL DEFAULT 10,
  initial_amount REAL NOT NULL DEFAULT 0,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Holdings: individual securities within a bucket
CREATE TABLE IF NOT EXISTS bucket_holdings (
  id SERIAL PRIMARY KEY,
  bucket_id INT NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT,
  asset_type TEXT DEFAULT 'etf',  -- 'stock' | 'etf' | 'bond'
  weight REAL NOT NULL DEFAULT 0, -- 0 to 1
  quantity REAL DEFAULT 0,
  purchase_price REAL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bucket_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their buckets" ON buckets FOR ALL USING (
  portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
);
CREATE POLICY "users own their holdings" ON bucket_holdings FOR ALL USING (
  bucket_id IN (SELECT id FROM buckets WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()))
);
