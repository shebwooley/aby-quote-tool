// DOES A SAVED QUOTE REMEMBER WHICH AGENCY RAN IT? (F-6, 09-25-2026)
//
// WHY THIS EXISTS, AND IT IS MEASURED RATHER THAN FEARED. Eric asked on 09-25 for abyquotes.com to be
// gated so that an invited broker's quote carries their logo automatically and shows up in our log as
// theirs. Four of the five parts were already built. The part that was NOT is the one nothing named:
// handleSaveQuote never asked who the broker was. It called adminWho() only, so ran_by = 'broker'
// meant "not an ABY admin session" rather than "a signed-in broker" (6,224 ABY against 2 broker), and
// agency_id appeared in no INSERT and no UPDATE anywhere in worker.js. The 5,903 rows that carry one
// were backfilled ONCE and it had been decaying: June 67 of 69, July 51 of 53, August 20 of 35,
// September 3 of 47. So the logo could only ever resolve by an exact match on free text.
//
// WHAT IT GUARDS, AND WHAT IT CANNOT. This reads SOURCE, which is the weaker kind of check (#88, #251):
// it proves the WIRING and never that a logo reached a page. The end-to-end proof needs a broker
// account to exist, and on 09-25 the brokers table was EMPTY - zero rows, ever - so that test is
// step 2 of F-6 and it is Eric's. This is what stops the wiring rotting in the meantime.
//
// ABY HAS NO BUILD STEP, so session start is the only trigger this can have.
//   node scripts/check_quote_agency_stamp.mjs [--self-test]

import { readFileSync } from "node:fs";

const SRC = readFileSync("worker.js", "utf8");
const SELF = process.argv.includes("--self-test");
let pass = 0, fail = 0;
const ok = (s) => { pass += 1; console.log("  ok    " + s); };
const bad = (s, why) => { fail += 1; console.log("  FAIL  " + s + "\n        " + why); };

/** The save handler's own text, so a match elsewhere in a 19,000-line file cannot satisfy a rule. */
function saveSlice(src) {
  const from = src.indexOf("async function handleSaveQuote(");
  if (from < 0) return "";
  // the next top-level declaration ends it
  const rest = src.slice(from + 10);
  const nextIdx = rest.search(/\nasync function |\nfunction /);
  return nextIdx < 0 ? src.slice(from) : src.slice(from, from + 10 + nextIdx);
}

/** The INSERT INTO quotes column list inside the save handler. */
function insertColumns(slice) {
  const i = slice.indexOf("INSERT INTO quotes");
  if (i < 0) return "";
  return slice.slice(i, i + 700);
}

function run(src, label) {
  const slice = saveSlice(src);
  const before = { pass, fail };

  // RULE 1 - THE FLOOR (#360). Every rule below asks "does this text contain X", so an empty slice
  // makes all of them vacuously satisfiable in one direction and silently unfalsifiable in the other.
  if (slice.length < 4000) {
    bad("FLOOR: the save handler was sliced out of worker.js", "got " + slice.length + " chars - every rule below would be measuring nothing");
    return { checked: 0 };
  }
  ok("FLOOR: the save handler sliced (" + slice.length + " chars)");

  // RULE 2 - THE AGENCY COMES FROM THE SESSION, NOT FROM THE TYPED NAME.
  //
  // ⚠️ THIS RULE WAS WRONG ON ITS FIRST DRAFT AND THE SELF-TEST IS WHAT SAID SO. It asked whether
  // handleSaveQuote calls currentBroker - and it ALREADY DID, at the top, for the login gate. So the
  // rule was green before the fix existed and its sabotage could not redden it: a rule that is true
  // of the defect is not a rule (#148). The real invariant is narrower and is the actual change:
  // the value STAMPED is the session's agency, never the free text the broker typed.
  if (!/\bme\s*&&\s*me\.agency_id\b/.test(slice)) {
    bad("the stamp is gated on the SESSION's agency (me.agency_id)", "it is not, so it cannot be reading the signed-in broker");
  } else if (!/\.bind\(\s*String\(me\.agency_id\)/.test(slice)) {
    bad("the value bound is the SESSION's agency", "something else is bound - a typed agency name is not identity");
  } else ok("the agency stamped comes from the session, not from the typed name");

  // RULE 3 - FILL-ONLY. Identity keeps, content takes (#433). Without this guard a re-save could
  // rewrite the agency on a row the backfill had already settled.
  // THE STATEMENT, BOUNDED BY ITS OWN CLOSING QUOTE rather than by a character class or a fixed
  // window. Its first version excluded the single quote, which is the very character the SQL guard is
  // written with, so it truncated the statement just before the thing it was looking for and reported
  // the CODE broken (#24). A fixed window would bleed into the next statement instead (#172).
  const stampAt = slice.indexOf("UPDATE quotes SET agency_id");
  const stampSeg = stampAt < 0 ? "" : slice.slice(stampAt);
  const stampEnd = stampSeg.indexOf('"', 1);
  const stamp = !stampSeg ? "" : (stampEnd > 0 ? stampSeg.slice(0, stampEnd) : stampSeg.slice(0, 260));
  // A short window, used ONLY by the double-quote rule below - a statement written with double quotes
  // ends its own JS string early, so the exact segment above cannot contain the evidence.
  const stampWin = stampAt < 0 ? "" : slice.slice(stampAt, stampAt + 260);
  if (!stamp) {
    bad("there is an UPDATE that stamps agency_id", "no such statement in the save handler");
  } else if (!/COALESCE\(agency_id,\s*''\)\s*=\s*''/.test(stamp)) {
    bad("the agency_id stamp is FILL-ONLY", "no COALESCE(agency_id, '') = '' guard: a re-save could overwrite a settled agency");
  } else ok("the agency_id stamp is fill-only, so it cannot rewrite a settled agency");

  // RULE 3b - SINGLE QUOTES IN THE SQL. On D1 a double-quoted literal is read as an IDENTIFIER, which
  // makes a column check VACUOUSLY TRUE rather than failing loudly (the d1-double-quotes trap).
  if (stampWin && /COALESCE\(agency_id,\s*""\)/.test(stampWin)) {
    bad("the guard uses SQL string literals, not double quotes", 'COALESCE(agency_id, "") is an identifier comparison on D1 and is vacuous');
  } else if (stamp) ok("the guard uses single-quoted SQL literals");

  // RULE 4 - IT STAMPS ONLY THE AGENCY. ran_by is read by the quote-log filter, the origin badge and
  // every roll-up; this change must not widen what those four words mean.
  if (stamp && /\b(ran_by|ran_by_who|broker_email|client_id|broker_agency)\b/.test(stamp)) {
    bad("the stamp writes agency_id and nothing else", "it also touches attribution or typed fields: " + stamp.slice(0, 120));
  } else if (stamp) ok("the stamp writes agency_id and nothing else");

  // RULE 5 - IT IS SCOPED TO THE ROW.
  if (stamp && !/WHERE id = \?/.test(stamp)) {
    bad("the stamp is scoped to this quote's row id", "no WHERE id = ? - " + stamp.slice(0, 120));
  } else if (stamp) ok("the stamp is scoped to this quote's row id");

  // RULE 6 - BEST-EFFORT. A quote must save whether or not the stamp lands, the same footing as
  // resolved_pricing and source_tag. A throw here would cost a broker their quote.
  const at = slice.indexOf("UPDATE quotes SET agency_id");
  if (at > 0) {
    const window = slice.slice(Math.max(0, at - 700), at);
    const lastTry = window.lastIndexOf("try {");
    const lastCatch = window.lastIndexOf("catch");
    if (lastTry < 0 || lastCatch > lastTry) {
      bad("the stamp is best-effort (inside a try)", "it is not, so a failure here would fail the whole save");
    } else ok("the stamp is best-effort, so it cannot cost a broker their quote");
  }

  // RULE 7 - ONE WRITER. The big INSERT must still NOT list agency_id: two writers for one column is
  // how two paths come to disagree, and the INSERT is also the statement that must never fail
  // (a missing column there loses the quote silently - the source_tag lesson).
  const cols = insertColumns(slice);
  if (!cols) {
    bad("the INSERT INTO quotes was found", "could not slice it, so rule 7 is measuring nothing");
  } else if (/\bagency_id\b/.test(cols)) {
    bad("agency_id is NOT in the INSERT column list", "it is - there are now two writers for one column");
  } else ok("agency_id is stamped in exactly one place, not also in the INSERT");

  // RULE 8 - ran_by IS STILL DERIVED FROM THE ADMIN SESSION ALONE, unchanged.
  if (!/const ranBy = adminName \? 'ABY' : 'broker'/.test(slice)) {
    bad("ran_by is still derived from the admin session alone", "its derivation moved - that is a register decision, not a side effect");
  } else ok("ran_by is untouched: still 'ABY' when there is an admin session, 'broker' otherwise");

  return { checked: pass - before.pass + (fail - before.fail) };
}

console.log("\nDOES A SAVED QUOTE REMEMBER WHICH AGENCY RAN IT? (F-6)\n");
run(SRC, "live");

if (SELF) {
  console.log("\n  SELF-TEST - can each rule actually go red?\n");
  const cases = [
    ["the fill-only guard removed", (s) => s.replace(/ AND COALESCE\(agency_id, ''\) = ''/, "")],
    // THE TYPED NAME SUBSTITUTED FOR THE SESSION - the defect this change removes, and the shape a
    // later tidy-up would most plausibly reintroduce.
    // ⚠️ An earlier sabotage here swapped `currentBroker` for `adminWho` and could not redden anything,
    // twice over: that call appears 14 times so the bare replace hit ANOTHER handler (#361), and the
    // rule it aimed at was true of the defect as well as of the fix (#148).
    ["the typed agency name stamped instead of the session's", (s) => s.replace("String(me.agency_id), rowId", "String(brokerAgency), rowId")],
    ["the session gate dropped, so it would stamp on every save", (s) => s.replace("rowId && me && me.agency_id", "rowId")],
    ["the guard written with double quotes (vacuous on D1)", (s) => s.replace(/COALESCE\(agency_id, ''\) = ''/, 'COALESCE(agency_id, "") = ""')],
    ["the stamp also restamps ran_by", (s) => s.replace(/UPDATE quotes SET agency_id = \?/, "UPDATE quotes SET agency_id = ?, ran_by = 'broker'")],
    ["agency_id added to the INSERT as a second writer", (s) => s.replace(/\(id, quote_number, created_at, client_name, effective_date,/, "(id, agency_id, quote_number, created_at, client_name, effective_date,")],
  ];
  let caught = 0;
  for (const [name, mutate] of cases) {
    const mutated = mutate(SRC);
    if (mutated === SRC) { console.log("  BROKEN  " + name + " - the sabotage matched NOTHING, its anchor is gone (#361)"); continue; }
    // AND IT MUST HAVE LANDED IN THE SLICE THE RULES READ. A sabotage that mutates an identical
    // string elsewhere in a 19,000-line file changes nothing the rules can see, and scores as a MISS
    // that reads like a vacuous rule. That happened on the first run of this very harness.
    if (saveSlice(mutated) === saveSlice(SRC)) {
      console.log("  BROKEN  " + name + " - the sabotage landed OUTSIDE handleSaveQuote, so it tests nothing (#361)");
      continue;
    }
    const keep = { pass, fail };
    pass = 0; fail = 0;
    const quiet = console.log; console.log = () => {};
    run(mutated, name);
    console.log = quiet;
    const went = fail > 0;
    pass = keep.pass; fail = keep.fail;
    if (went) { caught += 1; console.log("  ok      " + name + " -> RED"); }
    else console.log("  MISS    " + name + " -> still green, so a rule is not reading what it claims");
  }
  console.log("\n  " + caught + "/" + cases.length + " sabotages reddened a rule");
  if (caught < cases.length) fail += 1;
}

console.log("\n  " + pass + " passed, " + fail + " failed");
console.log("  This reads SOURCE. It proves the WIRING, never that a logo reached a page - that needs");
console.log("  a broker account to exist, which is F-6 step 2 and is Eric's.\n");
process.exit(fail === 0 ? 0 : 1);
