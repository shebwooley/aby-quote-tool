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

-- ── Per-broker identity (F-6) ────────────────────────────────────────────────
-- Until this table existed, ABY had ONE shared ADMIN_PASSWORD and broker identity
-- was unverified free text typed onto each quote. So you could not say who ran a
-- given quote, and you could not revoke one person without changing the password
-- for everyone. Eric accepted that cost on 2026-07-26 in order to ship the
-- dashboard and the logins as one project; this is that project.
--
-- ⭐ EMAIL IS THE PRIMARY KEY, AND IT IS NOT A STYLE CHOICE. `quotes.broker_email`
-- is the ONLY link that already exists between a quote and a person, on every row
-- ever saved. Keying on anything else would need a backfill that cannot be done
-- reliably -- nothing else on a quote identifies a human.
-- ⚠️ STORED LOWERCASED AND TRIMMED, and every lookup normalises the same way.
-- Broker email is typed by hand into the quote form, so the SAME broker appears as
-- "Jane@Agency.com" and "jane@agency.com ", and an exact-match join silently splits
-- one person's quotes into two people.
--
-- 🔴 `pw_hash` IS A VERIFIER, NEVER A PASSWORD. PBKDF2-SHA256 over a per-row random
-- salt, using Web Crypto, which the Workers runtime provides -- no dependency.
-- `pw_iter` is stored per row so the cost can be raised later without invalidating
-- everybody: an old row verifies at its own iteration count and is re-hashed on the
-- next successful sign-in.
-- ⛔ NOBODY BUT THE BROKER EVER TYPES THEIR PASSWORD. ABY creates the row and issues
-- a one-time setup link; the broker sets the password themselves. There is no screen
-- anywhere that shows or sets somebody else's password.
CREATE TABLE IF NOT EXISTS brokers (
  email        TEXT    PRIMARY KEY,            -- lowercased, trimmed
  name         TEXT    NOT NULL DEFAULT '',
  agency       TEXT    NOT NULL DEFAULT '',
  phone        TEXT    NOT NULL DEFAULT '',
  -- 'broker' sees only their own quotes. 'aby' sees everything and can adjust rates.
  -- ⚠️ Checked explicitly as === 'aby' everywhere, never as a truthiness test, so a
  -- third role can be added without silently granting it staff powers.
  role         TEXT    NOT NULL DEFAULT 'broker',
  -- 'active' | 'disabled'. Disabling is the revocation this table exists to provide;
  -- the row is KEPT so their quotes still attribute to a named person.
  status       TEXT    NOT NULL DEFAULT 'active',
  created_at   TEXT    NOT NULL,
  last_seen_at TEXT,
  pw_hash      TEXT,
  pw_salt      TEXT,
  pw_iter      INTEGER
);

CREATE INDEX IF NOT EXISTS brokers_status ON brokers (status);
