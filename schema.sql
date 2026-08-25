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
  products            TEXT    NOT NULL DEFAULT '[]', -- JSON array of product names
  -- Added 2026-08-06 (F-345). Before these, a signed authorization recorded NO BROKER AT
  -- ALL -- its only link to one was `quote_number`, which is not unique until the F-339
  -- migration lands. So "who sold this?" could only be answered through a key that could
  -- collide, and the admin list simply did not show it.
  -- ⭐ Denormalised ON PURPOSE rather than always joined: a commitment is a record of
  -- something somebody SIGNED, and must not change meaning because a row it points at
  -- changed later.
  -- ⚠️ On an existing database these arrive via /api/migrate as ALTER TABLE, so they are
  -- nullable with no default; rows signed before that carry NULL and the admin list falls
  -- back to the quote join for them.
  client_id           TEXT,                          -- the BenefitLab employer this is for
  broker_email        TEXT                           -- who sold it
);

CREATE INDEX IF NOT EXISTS commitments_submitted_at   ON commitments (submitted_at DESC);
CREATE INDEX IF NOT EXISTS commitments_quote_number   ON commitments (quote_number);
CREATE INDEX IF NOT EXISTS commitments_client_id      ON commitments (client_id);

-- ── The admin's own to-do list (F-403, 2026-08-25) ───────────────────────────
-- Also in worker.js MIGRATIONS, so /api/migrate creates it on an existing database.
-- ⚠️ There is no user identity behind /admin (one shared ADMIN_PASSWORD), so `owner` is a value
-- somebody PICKS -- '' , 'eric' or 'niels', the same vocabulary as assigned_rep. The list is
-- shared and must never be labelled "my" anything.
-- ⚠️ due_on is NULLABLE and NULL is a real answer: an undated to-do gets its own section on the
-- page rather than a made-up date.

CREATE TABLE IF NOT EXISTS aby_task (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  due_on        TEXT,                      -- 'YYYY-MM-DD', or NULL for no date
  owner         TEXT NOT NULL DEFAULT '',  -- '' | 'eric' | 'niels'
  entity_type   TEXT,                      -- 'agency' | 'broker' | 'client' | 'quote' | NULL
  entity_id     TEXT,
  entity_label  TEXT NOT NULL DEFAULT '',  -- denormalised: what it was about WHEN IT WAS WRITTEN
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL DEFAULT '',
  done_at       TEXT
);

CREATE INDEX IF NOT EXISTS aby_task_due  ON aby_task (due_on);
CREATE INDEX IF NOT EXISTS aby_task_done ON aby_task (done_at);
