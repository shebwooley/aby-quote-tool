-- ABY Quote Tool — D1 database schema
-- Run once with: npx wrangler d1 execute aby-quotes --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS quotes (
  id                  TEXT    PRIMARY KEY,
  quote_number        TEXT    NOT NULL,
  created_at          TEXT    NOT NULL,          -- ISO 8601 timestamp
  client_name         TEXT    NOT NULL DEFAULT '',
  effective_date      TEXT    NOT NULL DEFAULT '',
  broker_name         TEXT    NOT NULL DEFAULT '',
  broker_agency       TEXT    NOT NULL DEFAULT '',
  broker_phone        TEXT    NOT NULL DEFAULT '',
  broker_email        TEXT    NOT NULL DEFAULT '',
  rep_name            TEXT    NOT NULL DEFAULT '',
  rep_phone           TEXT    NOT NULL DEFAULT '',
  rep_email           TEXT    NOT NULL DEFAULT '',
  commission_included INTEGER NOT NULL DEFAULT 1, -- 1 = yes (−C), 0 = no (−NC)
  products            TEXT    NOT NULL DEFAULT '[]', -- JSON array
  ran_by              TEXT    DEFAULT 'broker',      -- 'ABY' (logged-in) or 'broker'
  state               TEXT    DEFAULT 'TX',          -- pricing state used
  adjustment          TEXT,                          -- JSON of the ABY rate override, or NULL
  adjustment_note     TEXT                           -- human description of the override (internal)
);

CREATE INDEX IF NOT EXISTS quotes_created_at   ON quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_client_name  ON quotes (client_name);
CREATE INDEX IF NOT EXISTS quotes_quote_number ON quotes (quote_number);

-- ── Migration: add status column (run once against existing database) ─────────
-- Cloudflare dashboard → D1 → aby-quotes → Query tab → paste and run:
--
--   ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'P';
--
-- P = Pending (default), S = Sold, D = Dead
-- COALESCE(status, 'P') in queries handles rows added before this migration.

-- ── Migration: attribution columns (ran_by / state / adjustment) ─────────────
-- For an existing database, either run these once, or just hit the gated
-- endpoint /api/migrate while logged in as ABY (it runs them idempotently):
--
--   ALTER TABLE quotes ADD COLUMN ran_by TEXT;
--   ALTER TABLE quotes ADD COLUMN state TEXT;
--   ALTER TABLE quotes ADD COLUMN adjustment TEXT;
--   ALTER TABLE quotes ADD COLUMN adjustment_note TEXT;
--
-- COALESCE(ran_by,'broker') / COALESCE(state,'TX') handle pre-migration rows.

-- ── Commitments (employer intent-to-proceed) ─────────────────────────────────
-- Run once: npx wrangler d1 execute aby-quotes --remote --file=schema.sql
-- (Safe to re-run — uses CREATE TABLE IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS commitments (
  id                  TEXT    PRIMARY KEY,
  quote_number        TEXT    NOT NULL,
  submitted_at        TEXT    NOT NULL,          -- ISO 8601 timestamp
  employer_name       TEXT    NOT NULL DEFAULT '',
  address             TEXT    NOT NULL DEFAULT '',
  city_state_zip      TEXT    NOT NULL DEFAULT '',
  auth_signer         TEXT    NOT NULL DEFAULT '',
  auth_title          TEXT    NOT NULL DEFAULT '',
  auth_email          TEXT    NOT NULL DEFAULT '',
  auth_phone          TEXT    NOT NULL DEFAULT '',
  hr_contact          TEXT    NOT NULL DEFAULT '',
  hr_title            TEXT    NOT NULL DEFAULT '',
  hr_email            TEXT    NOT NULL DEFAULT '',
  hr_phone            TEXT    NOT NULL DEFAULT '',
  start_date          TEXT    NOT NULL DEFAULT '',
  accepted_print      TEXT    NOT NULL DEFAULT '',
  accepted_sign       TEXT    NOT NULL DEFAULT '',
  products            TEXT    NOT NULL DEFAULT '[]'  -- JSON array of product names
);

CREATE INDEX IF NOT EXISTS commitments_submitted_at   ON commitments (submitted_at DESC);
CREATE INDEX IF NOT EXISTS commitments_quote_number   ON commitments (quote_number);
