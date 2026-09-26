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

  // ---- 5. WHO CAN GET AN ACCOUNT AT ALL (Eric, 09-25-2026) ------------------------------------
  //
  // HIS QUESTION IS WHAT MADE THESE RULES: "So if an agent goes to the /broker link, they can sign up
  // for access to run quotes? Is there a way for us (ABY) to create an invite link? So that not just
  // anyone can sign up to quote?" The gate above only decides whether quoting needs A LOGIN. It says
  // nothing about who may OBTAIN one, so with self-signup open the gate is a sign-up form in front of
  // the same door.
  const inviteAt = src.indexOf("async function handleAdminInviteBroker(");
  const inviteEnd = inviteAt < 0 ? -1 : src.indexOf("\nasync function ", inviteAt + 10);
  const invite = inviteAt < 0 ? "" : src.slice(inviteAt, inviteEnd < 0 ? undefined : inviteEnd);

  if (invite.length < 800) {
    // A FLOOR (#360): every rule below asks "does this text contain X", so an empty slice makes them
    // all vacuously satisfiable and the block would tick while checking nothing.
    bad("FLOOR: the ABY invite handler was sliced", "got " + invite.length + " chars - rules 5a-5e would be measuring nothing");
  } else {
    ok("the ABY invite handler sliced (" + invite.length + " chars)");

    if (!/path === '\/api\/admin\/brokers\/invite'[^\n]*withAuth/.test(src))
      bad("the ABY invite is behind withAuth", "deciding who may quote through ABY's tool is ABY's, and an open invite route is worse than an open signup");
    else ok("the ABY invite is behind the admin password");

    // IT ATTACHES TO A FIRM AND NEVER MINTS ONE. Signup minting an agency per person is what fills the
    // CRM with duplicates and leaves the broker with no logo; doing it here as a side effect of an
    // invite would bring that back through a second door.
    if (!/FROM agencies WHERE id = \?/.test(invite) || !/not in the CRM/.test(invite))
      bad("an unknown firm is REFUSED", "the invite does not look up the agency and refuse it");
    else ok("an unknown firm is refused rather than created");
    if (/INSERT INTO agencies/.test(invite))
      bad("the invite never creates an agency", "it does - that is the duplicate-firm problem arriving through a second door");
    else ok("the invite creates no agency");

    // THE ROLE IS DERIVED, AND IT MUST CARRY FORWARD WITHIN THE BATCH. Read once before the loop and
    // never updated, this made EVERY person in a paste of five an administrator of the same firm,
    // because none of them existed when the question was asked. This rule exists because that was the
    // first version.
    if (!/adminExists/.test(invite))
      bad("the first person into a firm becomes its administrator, derived", "no such derivation - a typed role is a question Eric should not have to answer");
    else if (!/role === 'admin'\) adminExists = true/.test(invite))
      bad("the administrator carries forward WITHIN a batch", "it does not, so every person in one paste would be made an administrator");
    else ok("the role is derived and the administrator carries forward within a batch");

    // A LOCKED ACCOUNT, NOT AN OPEN ONE. verifyPassword refuses an empty stored hash, so this creates
    // an invitation; a generated password would create an account somebody else could hold.
    if (!/\.bind\(id, email, '',/.test(invite))
      bad("the invited account is LOCKED until they set a password", "it is not created with an empty password hash");
    else ok("the invited account is locked until they set their own password");

    if (!/linkBrokerIntoDirectory/.test(invite))
      bad("the invited person reaches the directory ABY works from", "only `brokers` is written, and the CRM does not read it");
    else ok("the invited person reaches the CRM directory too");
  }

  // ---- 5f. THE BASELINE PIN, AND A RED HERE IS A SIGNAL RATHER THAN A FAULT ---------------------
  // Self-signup is OPEN today: anyone who reaches /broker can create an account and, with the gate
  // armed, sign in and quote. That is the state Eric asked about, and it is pinned so that CLOSING it
  // reaches a person instead of being discovered later. ⭐ When it is closed, this rule goes red: read
  // it, confirm the change was deliberate, and DELETE the rule rather than softening it - the same
  // discipline check_share_guard.mjs uses for its measured split.
  if (!/path === '\/api\/broker\/signup'\s+&& method === 'POST'\) return handleBrokerSignup/.test(src))
    bad("SIGNAL, not a fault: self-signup is no longer open",
        "the signup route has changed shape. If it was deliberately closed or gated, that is the decision Eric was weighing on 09-25 - delete this rule");
  else ok("self-signup is still open (pinned): inviting is a gate only once signup is closed too");
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
    // ---- the 09-25 invite (rule group 5)
    ["the ABY invite route lost withAuth",
      (s) => s.replace("if (path === '/api/admin/brokers/invite' && method === 'POST') return withAuth(request, env, () => handleAdminInviteBroker(request, env));",
                       "if (path === '/api/admin/brokers/invite' && method === 'POST') return handleAdminInviteBroker(request, env);")],
    ["the invite started creating the firm instead of refusing it",
      (s) => s.replace("  if (!agency) return jsonResp({ error: 'That firm is not in the CRM. Add it there first, then invite.' }, 400);",
                       "  if (!agency) { await env.DB.prepare('INSERT INTO agencies (id, name) VALUES (?,?)').bind(agencyId, 'New').run(); }")],
    ["the administrator stopped carrying forward within a batch",
      (s) => s.replace("    if (role === 'admin') adminExists = true;", "")],
    ["the invited account was created with a usable password",
      (s) => s.replace(").bind(id, email, '', name, agency.name, '', agencyId, role, new Date().toISOString()).run();",
                       ").bind(id, email, 'x', name, agency.name, '', agencyId, role, new Date().toISOString()).run();")],
    // ⚠️ MUTATED INSIDE THE HANDLER'S OWN SLICE, because `linkBrokerIntoDirectory(env, {` appears in
    // signup and in the agency invite as well - a bare replace hits the FIRST one, in another
    // function, and tests nothing while scoring as a MISS (#361). Its first version did exactly that.
    ["the invited person stopped reaching the CRM directory",
      (s) => {
        const a = s.indexOf("async function handleAdminInviteBroker(");
        const b = s.indexOf("\nasync function ", a + 10);
        const seg = s.slice(a, b);
        return s.slice(0, a) + seg.replace("await linkBrokerIntoDirectory(env, {", "await Promise.resolve({") + s.slice(b);
      }],
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
