-- ── Collaboration ──────────────────────────────────────────────────────────

CREATE TABLE bucket_collaborators (
  id             SERIAL PRIMARY KEY,
  bucket_id      INT  NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  invited_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer','editor')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  invite_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  accepted_at    TIMESTAMPTZ,
  UNIQUE (bucket_id, invited_email)
);

CREATE TABLE bucket_proposals (
  id           SERIAL PRIMARY KEY,
  bucket_id    INT  NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  proposed_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','withdrawn')),
  title        TEXT NOT NULL,
  summary      TEXT,
  -- payload shape:
  -- {
  --   weight_changes: [{ holding_id, ticker, old_weight, new_weight }],
  --   additions:      [{ ticker, name, asset_type, weight }],
  --   removals:       [{ holding_id, ticker }],
  --   meta:           { lifespan_years?: { old, new }, target_return?: { old, new } }
  -- }
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES auth.users(id)
);

CREATE TABLE proposal_comments (
  id           SERIAL PRIMARY KEY,
  proposal_id  INT  NOT NULL REFERENCES bucket_proposals(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX ON bucket_collaborators (bucket_id);
CREATE INDEX ON bucket_collaborators (invite_token);
CREATE INDEX ON bucket_collaborators (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX ON bucket_proposals (bucket_id);
CREATE INDEX ON bucket_proposals (proposed_by);
CREATE INDEX ON proposal_comments (proposal_id);

-- ── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_bucket_owner(p_bucket_id INT, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM buckets b
    JOIN portfolios p ON p.id = b.portfolio_id
    WHERE b.id = p_bucket_id AND p.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_bucket_collaborator(p_bucket_id INT, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM bucket_collaborators
    WHERE bucket_id = p_bucket_id AND user_id = p_user_id AND status = 'active'
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE bucket_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE bucket_proposals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_comments    ENABLE ROW LEVEL SECURITY;

-- Allow active collaborators to read the bucket and its holdings
CREATE POLICY "collaborators can read bucket"
  ON buckets FOR SELECT
  USING (is_bucket_collaborator(id, auth.uid()));

CREATE POLICY "collaborators can read holdings"
  ON bucket_holdings FOR SELECT
  USING (is_bucket_collaborator(bucket_id, auth.uid()));

-- bucket_collaborators: owner manages; collaborator reads own row
CREATE POLICY "owner manages collaborators"
  ON bucket_collaborators FOR ALL
  USING (is_bucket_owner(bucket_id, auth.uid()));

CREATE POLICY "collaborator reads own invite"
  ON bucket_collaborators FOR SELECT
  USING (user_id = auth.uid() OR invited_email = auth.email());

CREATE POLICY "collaborator accepts own invite"
  ON bucket_collaborators FOR UPDATE
  USING (invited_email = auth.email());

-- bucket_proposals: owner reads/resolves all; collaborator creates/reads/withdraws own
CREATE POLICY "owner sees all proposals"
  ON bucket_proposals FOR ALL
  USING (is_bucket_owner(bucket_id, auth.uid()));

CREATE POLICY "collaborator manages own proposals"
  ON bucket_proposals FOR ALL
  USING (
    proposed_by = auth.uid()
    AND is_bucket_collaborator(bucket_id, auth.uid())
  );

CREATE POLICY "collaborator reads all proposals for bucket"
  ON bucket_proposals FOR SELECT
  USING (is_bucket_collaborator(bucket_id, auth.uid()));

-- proposal_comments: owner + active collaborators
CREATE POLICY "owner manages proposal comments"
  ON proposal_comments FOR ALL
  USING (
    proposal_id IN (
      SELECT id FROM bucket_proposals
      WHERE is_bucket_owner(bucket_id, auth.uid())
    )
  );

CREATE POLICY "collaborator manages own comments"
  ON proposal_comments FOR ALL
  USING (
    user_id = auth.uid()
    AND proposal_id IN (
      SELECT bp.id FROM bucket_proposals bp
      WHERE is_bucket_collaborator(bp.bucket_id, auth.uid())
    )
  );

CREATE POLICY "collaborator reads all comments on accessible proposals"
  ON proposal_comments FOR SELECT
  USING (
    proposal_id IN (
      SELECT bp.id FROM bucket_proposals bp
      WHERE is_bucket_collaborator(bp.bucket_id, auth.uid())
    )
  );

-- ── CSV / brokerage sync ────────────────────────────────────────────────────

ALTER TABLE bucket_holdings
  ADD COLUMN IF NOT EXISTS cost_basis     REAL,
  ADD COLUMN IF NOT EXISTS brokerage      TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE TABLE brokerage_syncs (
  id                SERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_id         INT  NOT NULL REFERENCES buckets(id)    ON DELETE CASCADE,
  source            TEXT NOT NULL,
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  holdings_updated  INT  NOT NULL DEFAULT 0,
  unmatched_tickers TEXT[] DEFAULT '{}',
  raw_snapshot      JSONB
);

ALTER TABLE brokerage_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their syncs"
  ON brokerage_syncs FOR ALL USING (auth.uid() = user_id);

CREATE INDEX ON brokerage_syncs (bucket_id);
