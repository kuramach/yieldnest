-- Tax treatment classification on each holding
ALTER TABLE portfolio_holdings
  ADD COLUMN IF NOT EXISTS tax_treatment TEXT DEFAULT 'standard'
    CHECK (tax_treatment IN ('standard', '1256', 'collectible', 'ric'));

-- Distribution log: tracks dividends, ROC, capital gain distributions per holding
CREATE TABLE portfolio_holding_distributions (
  id SERIAL PRIMARY KEY,
  portfolio_id INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  ex_date DATE NOT NULL,
  pay_date DATE,
  tax_year INT NOT NULL,
  distribution_type TEXT NOT NULL
    CHECK (distribution_type IN ('ordinary', 'qualified', 'roc', 'stcg', 'ltcg', '1256')),
  amount_per_share REAL NOT NULL DEFAULT 0,
  shares_held REAL,
  total_amount REAL,
  spillback BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON portfolio_holding_distributions (portfolio_id, ticker, ex_date DESC);
CREATE INDEX ON portfolio_holding_distributions (portfolio_id, tax_year);

ALTER TABLE portfolio_holding_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own distributions"
  ON portfolio_holding_distributions
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
