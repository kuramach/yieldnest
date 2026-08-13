-- Store the last known price per share (from brokerage import)
ALTER TABLE portfolio_holdings ADD COLUMN IF NOT EXISTS price REAL DEFAULT 0;
