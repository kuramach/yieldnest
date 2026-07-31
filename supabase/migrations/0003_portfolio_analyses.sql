CREATE TABLE IF NOT EXISTS portfolio_analyses (
  id            SERIAL PRIMARY KEY,
  portfolio_id  INT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stats         JSONB NOT NULL DEFAULT '[]',
  ai_narrative  TEXT NOT NULL DEFAULT '',
  target_return DECIMAL(6,4) NOT NULL DEFAULT 0.07,
  available_cash DECIMAL(14,2) NOT NULL DEFAULT 0,
  portfolio_best  DECIMAL(6,4),
  portfolio_worst DECIMAL(6,4),
  portfolio_median DECIMAL(6,4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portfolio_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analyses"
  ON portfolio_analyses FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX portfolio_analyses_portfolio_id_idx ON portfolio_analyses(portfolio_id, created_at DESC);
