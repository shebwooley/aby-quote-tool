-- ============================================================================
-- FOUR INDEXES ON THE CRM TABLES. Raised 2026-09-01, the day D1 hit the free
-- tier's 5,000,000 rows_read daily limit and Cloudflare emailed to say reads
-- would start erroring.
--
-- WHY THESE FOUR. `schema.sql` declares EIGHT indexes and every one of them is
-- on `quotes`, `commitments` or `aby_task`. There is NOT ONE index on
-- `agencies`, `people` or `broker_directory` -- the three tables the CRM joins
-- on constantly. Every one of these columns is a join key with no index behind
-- it:
--
--   agencies.parent_id          the recursive holding-company rollup. A
--                               recursive CTE joining on an unindexed column
--                               rescans the WHOLE agencies table at every
--                               level of the walk, and the model is three
--                               levels deep on purpose (F-420).
--   broker_directory.agency_id  the brokers-and-agencies list.
--   broker_directory.person_id  the LEFT JOIN to people behind the duplicate
--                               finder and the person search.
--   quotes.broker_agency        F-394's finding, verbatim: "Every agency
--                               screen joins quotes to agencies BY NAME."
--                               6,154 quotes against ~1,552 agencies is ~9.5
--                               million rows in ONE join -- which is more than
--                               the entire daily allowance, in a single page
--                               load.
--
-- HONEST LIMIT ON THIS DIAGNOSIS: it was made by reading the code and the
-- schema, NOT from D1's own query statistics, because querying D1 to
-- investigate is the very thing being rationed. These four are join keys with
-- no index, which is a real defect either way -- but I have NOT proven they
-- are the queries that burned the 5 million rows. If reads stay high after
-- this, the next place to look is the Performance view and the agency rollup,
-- which are the two heaviest screens on record.
--
-- SAFE TO RUN. CREATE INDEX adds no rows, changes no data and is reversible
-- with DROP INDEX. `IF NOT EXISTS` matches the style already in schema.sql, so
-- re-running is a no-op.
--
-- ⚠️ RUN IT AFTER THE LIMIT RESETS (2026-09-02 00:00 UTC) OR AFTER UPGRADING.
-- Building an index reads the table, and reads are what is currently capped.
--
-- ⚠️ `wrangler d1 execute --file` SPLITS ON SEMICOLONS (TRAPS #300), so every
-- statement below has to stand alone. Each is a complete CREATE INDEX; there
-- are no multi-statement constructs and no semicolons inside strings.
--
-- HOW TO RUN:
--   npx wrangler d1 execute <database> --remote --file=scripts/2026-09-01-crm-indexes.sql
--
-- HOW TO CHECK IT WORKED, without a big read:
--   npx wrangler d1 execute <database> --remote --command="SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agencies_parent_id ON agencies (parent_id);

CREATE INDEX IF NOT EXISTS idx_broker_directory_agency_id ON broker_directory (agency_id);

CREATE INDEX IF NOT EXISTS idx_broker_directory_person_id ON broker_directory (person_id);

CREATE INDEX IF NOT EXISTS idx_quotes_broker_agency ON quotes (broker_agency);
