// THE BROKER LOGIN GATE - IS IT WIRED, AND IS IT WIRED IN BOTH PLACES?
//
// ERIC, 2026-09-08: "I would like to set it up where a broker has to log in in order to quote."
//
// THE GATE SHIPS OFF. This checker exists because a gate that is off is invisible: nothing exercises
// it, so it can rot for weeks and then fail to hold on the day somebody turns it on. That is the
// shape of TRAPS #333 - a gate that fails closed is invisible when it breaks, because broken and
// not-yet-applicable look identical.
//
// THE RULES, AND RULE 2 IS THE ONE THAT MATTERS:
//   1. the flag exists and DEFAULTS TO FALSE - turning it on must stay a deliberate act
//   2. BOTH the page and the SAVE are gated. A wall on the form with an open endpoint underneath is
//      not a refusal (TRAPS #386), and anyone can post straight to /api/quotes
//   3. the gate lets ABY STAFF through - they quote at /aby behind the admin cookie, and a gate that
//      locked out the only people currently using the tool would be the worst possible outcome
//   4. it does NOT gate /aby, /admin, /broker or /q/ - a gate that catches the door itself is a
//      lockout, and one that catches /q/ breaks a link already sitting in an employer's inbox
//
// A FIFTH RULE WAS WRITTEN HERE AND DELETED THE SAME HOUR, and the reason is worth more than the
// rule was. It banned a backtick in ANY line comment and found 150, all harmless: TRAPS #248's
// hazard is a backtick inside the PAGE TEMPLATE LITERALS, which check_worker_pages.mjs already
// guards by parsing every emitted page. The rule duplicated a better guard and got its scope
// wrong. Deleting beat narrowing (TRAPS #402). Do not re-add it here.
//
// Run: node scripts/check_broker_gate.mjs   ·   node scripts/check_broker_gate.mjs --self-test

import { readFileSync } from "node:fs";

const W = "worker.js";
let failed = 0;
const ok = (m) => console.log("  ok    " + m);
const bad = (m, d) => { failed++; console.log("  FAIL  " + m + (d ? "\n        " + d : "")); };

/** The gate block on the page, and the guard inside handleSaveQuote. Sliced, not grepped globally,
 *  so a mention in a comment somewhere else cannot satisfy a rule (TRAPS #94 / #270). */
function slices(src) {
  const saveAt = src.indexOf("async function handleSaveQuote(");
  return {
    save: saveAt < 0 ? "" : src.slice(saveAt, saveAt + 1200),
    page: src.slice(0, saveAt < 0 ? src.length : saveAt),
  };
}

function run(src) {
  failed = 0;
  const { save, page } = slices(src);

  // ---- FLOOR. Every rule below reads one of these; an empty slice makes them vacuous.
  if (!save || page.length < 1000) {
    bad("worker.js parses into a page half and a save half",
        `save=${save.length} page=${page.length} - every rule below would be vacuous`);
    return;
  }
  ok("worker.js slices into the page half and handleSaveQuote");

  // ---- 1. the flag, and its default
  const m = src.match(/const BROKER_LOGIN_REQUIRED\s*=\s*(true|false)\s*;/);
  if (!m) bad("BROKER_LOGIN_REQUIRED is declared", "the gate has no switch");
  else if (m[1] !== "false")
    bad("BROKER_LOGIN_REQUIRED defaults to false",
        "it is TRUE in the committed source - turning the gate on must be a deliberate, separate act");
  else ok("the gate has a switch and it defaults to off");

  // ---- 2. BOTH halves are gated
  const pageGated = /BROKER_LOGIN_REQUIRED && \(path === '\/'/.test(page);
  const saveGated = /BROKER_LOGIN_REQUIRED && !me/.test(save);
  if (!pageGated) bad("the public quote form is gated", "the flag is declared and the page never reads it");
  else if (!saveGated)
    bad("the SAVE is gated as well as the page",
        "a wall on the form with an open endpoint underneath is not a refusal (TRAPS #386)");
  else ok("both the quote form and the save endpoint read the flag");

  // ---- 3. ABY staff get through, on BOTH halves
  const pageStaff = /isAuthed\(request, env\)/.test(page.slice(page.indexOf("BROKER_LOGIN_REQUIRED && (path")));
  const saveStaff = /isAuthed\(request, env\)/.test(save);
  if (!pageStaff || !saveStaff)
    bad("ABY staff are let through the gate",
        "they are the ONLY people currently quoting - 6,190 of 6,191 quotes are ran_by=ABY - so a gate that stops them stops everything");
  else ok("ABY staff pass the gate on both halves");

  // ---- 4. it catches ONLY the public form
  const gateBlock = page.slice(page.indexOf("BROKER_LOGIN_REQUIRED && (path"), page.indexOf("BROKER_LOGIN_REQUIRED && (path") + 400);
  const overreach = ["'/aby'", "'/admin'", "'/broker'", "'/q/'"].filter((p) => gateBlock.includes(p));
  if (overreach.length)
    bad("the gate catches only the public quote form",
        `it also names ${overreach.join(", ")} - gating /broker is a lockout and gating /q/ breaks a link already in an employer's inbox`);
  else ok("the gate is scoped to the public quote form alone");

  // AND IT MUST SEND SOMEBODY SOMEWHERE. A 403 with no door is a dead end on a public tool.
  if (!/Response\.redirect\(new URL\('\/broker/.test(gateBlock))
    bad("a refused visitor is sent to the door", "refusing without naming where to go is a dead end");
  else ok("a refused visitor is redirected to /broker");

}

const src = readFileSync(W, "utf8");

if (process.argv.includes("--self-test")) {
  const sabotages = [
    ["the gate was left switched ON in the committed source",
      (s) => s.replace("const BROKER_LOGIN_REQUIRED = false;", "const BROKER_LOGIN_REQUIRED = true;")],
    ["the save endpoint stopped checking the flag",
      (s) => s.replace("if (BROKER_LOGIN_REQUIRED && !me &&", "if (false && !me &&")],
    ["the page stopped checking the flag",
      (s) => s.replace("if (BROKER_LOGIN_REQUIRED && (path === '/'", "if (false && (path === '/'")],
    ["ABY staff stopped being let through the save",
      (s) => s.replace("if (BROKER_LOGIN_REQUIRED && !me && !(await isAuthed(request, env)))",
                       "if (BROKER_LOGIN_REQUIRED && !me)")],
    ["the gate grew to catch the door itself",
      (s) => s.replace("(path === '/' || path === '/index.html')", "(path === '/' || path === '/broker')")],
    ["a refused visitor got no redirect",
      (s) => s.replace("return Response.redirect(new URL('/broker?next=quote', request.url).toString(), 302);",
                       "return new Response('no', { status: 403 });")],
];
  // A RED BASELINE SWALLOWS SABOTAGES: every mutation then 'fails' for the reason already
  // there, and the harness reports full marks. THIS ONE DID EXACTLY THAT - it printed 7/7 while
  // rule 5 was failing on 150 innocent comments, so not one sabotage was actually tested.
  const w0 = console.log;
  console.log = () => {};
  run(src);
  console.log = w0;
  if (failed > 0) {
    console.log('  REFUSING to self-test against a RED baseline - fix the real failure first.');
    process.exit(1);
  }
  console.log("\nSELF-TEST - each sabotage must turn the run red\n");
  let missed = 0, broken = 0;
  for (const [name, mutate] of sabotages) {
    const m = mutate(src);
    // TRAPS #361: a sabotage whose anchor is gone changes nothing and is scored as a miss.
    if (m === src) { console.log(`  BROKEN  ${name} - the sabotage matched nothing`); broken++; continue; }
    const w = console.log; console.log = () => {};
    run(m);
    console.log = w;
    if (failed > 0) console.log(`  ok    ${name}`);
    else { console.log(`  MISS  ${name}`); missed++; }
  }
  console.log(`\n  ${sabotages.length - missed - broken}/${sabotages.length} sabotages behaved as designed` +
    (broken ? ` (${broken} BROKEN)` : "") + (missed ? ` (${missed} missed)` : ""));
  process.exit(missed || broken ? 1 : 0);
}

console.log("\nBROKER LOGIN GATE - wired, scoped, and off\n");
run(src);
if (failed) { console.log(`\n  ${failed} failed\n`); process.exit(1); }
console.log("\n  ok - the gate is built and OFF. Flip BROKER_LOGIN_REQUIRED and redeploy to arm it.\n");
