// THE BROKER LOGIN GATE - IS IT WIRED, AND IS IT WIRED IN BOTH PLACES?
//
// ERIC, 2026-09-08: "I would like to set it up where a broker has to log in in order to quote."
//
// THE GATE IS ARMED SINCE 09-25-2026 (it shipped off for sixteen days, deliberately). This checker exists because a gate that is off is invisible: nothing exercises
// it, so it can rot for weeks and then fail to hold on the day somebody turns it on. That is the
// shape of TRAPS #333 - a gate that fails closed is invisible when it breaks, because broken and
// not-yet-applicable look identical.
//
// THE RULES, AND RULE 2 IS THE ONE THAT MATTERS:
//   1. the flag exists and is ARMED - inverted 09-25-2026 on Eric's decision, so switching the gate
//      back OFF now reaches a person instead of passing quietly
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

  // ---- 1. the flag, and it is now ARMED
  //
  // ⭐⭐ THIS RULE WAS INVERTED ON 09-25-2026 AND THE INVERSION IS THE RECORD OF A DECISION. It used to
  // require the flag to be FALSE, because arming a wall on a live tool is a decision rather than a
  // deployment. Eric made it: *"yes I want /broker closed"* and *"the main abyquotes.com page needs to
  // be a login."* ⛔ Leaving the old rule would have made his own decision fail the build.
  // ⚠️ It is asserted rather than merely allowed, so switching the gate back OFF also reaches a person.
  const m = src.match(/const BROKER_LOGIN_REQUIRED\s*=\s*(true|false)\s*;/);
  if (!m) bad("BROKER_LOGIN_REQUIRED is declared", "the gate has no switch");
  else if (m[1] !== "true")
    bad("BROKER_LOGIN_REQUIRED is ARMED",
        "it is FALSE in the committed source - the gate Eric asked for on 09-25 is switched off again");
  else ok("the gate has a switch and it is armed");

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

    // EMAIL IS OPT-IN AND THE LINK COMES BACK EITHER WAY.
    //
    // ⭐⭐ THIS RULE WAS "SENDS NO EMAIL" FOR ABOUT AN HOUR. Eric first said *"I don't think I want an
    // email to come from the site"*, then reconsidered - *"Maybe it would be ok to have the ability to
    // email the invite from the admin panel"* - and settled it with the safeguard intact: the email is a
    // convenience, the link on screen is the guarantee.
    // ⛔ THE INVARIANT IS NOT "no email". It is that a send can never be the only evidence, because a
    // send path that fails where nobody can see it is what cost him a month of ABY notifications (#520).
    if (!/body\.send === true/.test(invite))
      bad("emailing is OPT-IN per send", "no send flag - it either always mails or never does, and Eric asked for the choice");
    else if (!/link: linkFor/.test(invite) || !/const row = \{ email, role, link: linkFor \}/.test(invite))
      bad("the link is returned WHETHER OR NOT an email was asked for",
          "the link is conditional on the send, so a failed email would leave nothing to fall back on");
    // ⚠️ COUNTED, NOT TESTED FOR PRESENCE. There are TWO send sites - a new account and a re-issued link
    // - and a rule satisfied by either one stays green while the other silently drops its outcome. Its
    // sabotage proved that by mutating the first site and leaving the rule happy (#361).
    else if (((invite.match(/await sendSetPasswordEmail/g) || []).length)
             !== ((invite.match(/row\.emailed = await sendSetPasswordEmail/g) || []).length))
      bad("EVERY send records its outcome on the row",
          "a send site does not assign row.emailed, so for those people the screen cannot say whether the email went");
    else ok("emailing is opt-in, the outcome is per person, and the link comes back either way");

    // AND THE EDITABLE PROSE CANNOT CARRY THE LINK. If the link were a token inside the message, deleting
    // it would send a friendly invitation that lets nobody in - and it would look like it worked.
    // ⚠️ `\r?\n`, NOT `\n`. worker.js is entirely CRLF - 20,000 pairs, not one bare LF - so a pattern
    // anchored directly on a newline matches NOTHING and the rule reported the constant absent when it
    // was right there (#299, #378). The slicing above survives only because indexOf("\nasync function")
    // still finds the LF inside a CRLF; anything anchored on what PRECEDES the newline does not.
    const dflt = /const ABY_INVITE_EMAIL_DEFAULT = ([\s\S]*?);\r?\n/.exec(src);
    if (!dflt) bad("there is a default invitation to edit", "no ABY_INVITE_EMAIL_DEFAULT - Eric asked for it pre-written");
    else if (/https?:|\{link\}|set-password/.test(dflt[1]))
      bad("the default invitation contains NO link", "it does - the button is added by the sender so an edited message can never be linkless");
    else {
      ok("the default invitation is pre-written and carries no link of its own");

      // ---- AND IT STAYS IN HIS VOICE. Two corrections of his, 09-25-2026, each a standing rule.
      //
      // ⭐ BRITISH IDIOM, NOT JUST SPELLING: *"I've never said straight away in my life. We live in the
      // United States and don't talk like that."* Every phrase below is one that has actually been
      // written by me and corrected by him, or is unambiguously British. SOURCE-OF-TRUTH decision 10
      // says the rule applies to EVERYTHING we write, and he has raised it seven times.
      const brit = ["straight away", "sort it out", "whilst", "amongst", "organise", "realise",
                    "enrolment", "favour", "behaviour", "colour", "apologise", "have a look at it"];
      const hits = brit.filter((p) => new RegExp(p, "i").test(dflt[1]));
      if (hits.length) bad("the default invitation reads as American", "British idiom in it: " + hits.join(", "));
      else ok("the default invitation carries no British idiom");

      // ⭐ AND IT NAMES NO PRODUCTS. *"We don't sell 5500s separately."* My draft listed three services
      // and got one wrong. What ABY sells is a COMMERCIAL FACT and never mine to infer, so the default
      // enumerates nothing. ⛔ If Eric wants a product line in it, that is his edit and this rule goes
      // with it - it guards against ME putting a guessed list back, not against him adding a real one.
      if (/\b5500\b/.test(dflt[1]))
        bad("the default invitation names no products", "it names 5500, which Eric corrected: ABY does not sell those separately");
      else ok("the default invitation names no products, so no product fact is being guessed");
    }

    // A LOST LINK MUST BE RECOVERABLE. The link exists only on the screen that produced it, so a locked
    // account with no way to re-issue is a dead end nothing else can fix.
    if (!/issueResetToken\(env, existing\.id\)/.test(invite))
      bad("a LOCKED account can be re-invited for a fresh link", "it cannot, so a link lost before it is emailed leaves that person permanently locked out");
    else if (!/existing && !existing\.locked/.test(invite))
      bad("somebody who HAS set a password is still skipped", "re-inviting them would mint a reset token against a live account");
    else ok("a locked account gets a fresh link; an active account is still skipped");
  }

  // ---- 6. SELF-SIGNUP IS CLOSED. ACCOUNTS COME FROM ABY. ---------------------------------------
  //
  // ⭐⭐ THIS REPLACED A RULE THAT PINNED SIGNUP AS OPEN, AND THE REPLACEMENT IS THE POINT. That pin was
  // written the same evening on the premise that closing it was still an open question. It was not:
  // Eric had asked for invitations that afternoon and said so again plainly - *"I told you I want to be
  // able to invite them and don't want them to sign themselves up. so yes I want /broker closed."*
  // ⛔ The pin was deleted rather than softened, which is what its own note said to do.
  const upFlag = /const BROKER_SELF_SIGNUP = (true|false);/.exec(src);
  if (!upFlag) bad("BROKER_SELF_SIGNUP is declared", "closing signup has no switch, so the decision is invisible and reversing it is a rebuild");
  else if (upFlag[1] !== "false") bad("BROKER_SELF_SIGNUP is false", "self-signup is switched back ON in the committed source");
  else ok("self-signup has a switch and it is closed");

  // THE ENDPOINT REFUSES ON ITS OWN ACCOUNT. A page with no sign-up tab and an open POST underneath is
  // not a refusal - anyone can post straight at it (#386, the same lesson that put the quote gate on
  // the save as well as the form).
  const upAt = src.indexOf("async function handleBrokerSignup(");
  const upEnd = upAt < 0 ? -1 : src.indexOf("\nasync function ", upAt + 10);
  const signup = upAt < 0 ? "" : src.slice(upAt, upEnd < 0 ? undefined : upEnd);
  if (signup.length < 400) {
    bad("FLOOR: handleBrokerSignup was sliced", "got " + signup.length + " chars, so the rules below measure nothing");
  } else if (!/if \(!BROKER_SELF_SIGNUP\)/.test(signup)) {
    bad("the signup ENDPOINT refuses, not just the page", "the handler never reads the switch");
  } else if (signup.indexOf("if (!BROKER_SELF_SIGNUP)") > signup.indexOf("await request.json()")) {
    bad("the refusal comes BEFORE the body is read", "it is after, so a refused request still parses whatever was posted at it");
  } else if (!/invitation/i.test(signup.slice(0, signup.indexOf("let body")))) {
    bad("the refusal says where to go", "a refusal with no door is a dead end - the quote gate redirects rather than answering 403");
  } else ok("the signup endpoint refuses first, before the body, and names the way in");

  // AND THE PAGE OFFERS NO DOOR THAT REFUSES. ⛔ Plus the mirror hazard, which is the one that would
  // actually break something: removing markup and leaving its handler behind throws on a missing
  // element and takes the WHOLE script down, sign-in included.
  const bpAt = src.indexOf("function brokerPageHTML(");
  const bpEnd = bpAt < 0 ? -1 : src.indexOf("\nfunction ", bpAt + 10);
  const bp = bpAt < 0 ? "" : src.slice(bpAt, bpEnd < 0 ? undefined : bpEnd);
  if (bp.length < 2000) {
    bad("FLOOR: brokerPageHTML was sliced", "got " + bp.length + " chars");
  } else {
    const offersTab = /id="tabUp"/.test(bp);
    // ⚠️ AN ASSIGNMENT, NOT A MENTION. Its first version matched $('tabUp') anywhere and went red on the
    // COMMENT that explains why the handler was removed - #126, a negative assertion satisfied by the
    // prose describing the thing it forbids. The hazard is a handler being BOUND, so that is the test.
    const handlesTab = /\$\('tabUp'\)\s*\.\s*on\w+\s*=/.test(bp);
    if (offersTab) bad("the page offers no sign-up tab", "id=\"tabUp\" is still on the page while the endpoint refuses, so it is a door that says no");
    else if (handlesTab) bad("no handler survives for a control that is gone", "a $('tabUp') handler remains - it throws on a missing element and takes sign-in down with it (#356)");
    else if (!/Accounts are set up by ABY/.test(bp)) bad("the page SAYS where accounts come from", "the tab is gone and nothing explains it, which reads as a broken page");
    else ok("the page offers no sign-up tab, keeps no orphaned handler, and says accounts come from ABY");
  }

  // ---- 7. AND THE INVITE IS REACHABLE, WHICHEVER VIEW THE PAGE OPENS ON -------------------------
  //
  // 🔴 ERIC, MINUTES AFTER IT SHIPPED: *"I don't see how to invite a broker."* It was live and he was
  // on the other view. The card had been put beside the Registered brokers table, which is INSIDE
  // perfView, and `/admin/brokers` REMEMBERS the last view used in localStorage - so for anybody whose
  // last visit was Prospects the only way in did not exist. ⛔ Now the ONLY way to get an account is
  // this card, which makes reachability part of the gate rather than a nicety (#275, #284: built,
  // correct and unreachable).
  const abAt = src.indexOf("function adminBrokersHTML(");
  const abEnd = abAt < 0 ? -1 : src.indexOf("\nfunction ", abAt + 10);
  const ab = abAt < 0 ? "" : src.slice(abAt, abEnd < 0 ? undefined : abEnd);
  if (ab.length < 2000) {
    bad("FLOOR: adminBrokersHTML was sliced", "got " + ab.length + " chars");
  } else {
    const card = ab.indexOf("<h2>Invite a broker to quote</h2>");
    const perf = ab.indexOf('id="perfView"');
    if (card < 0) bad("the invite card is on /admin/brokers", "it is not there at all, so nobody can be given an account");
    else if (perf > 0 && card > perf)
      bad("the invite card sits OUTSIDE both views",
          "it is inside a view, so it is invisible on the other one - and the page reopens on whichever view was used last");
    else ok("the invite card sits above the view toggle, so it is there whichever view the page opens on");
  }
}

const src = readFileSync(W, "utf8");

if (process.argv.includes("--self-test")) {
  const sabotages = [
    ["the gate was switched back OFF in the committed source",
      (s) => s.replace("const BROKER_LOGIN_REQUIRED = true;", "const BROKER_LOGIN_REQUIRED = false;")],
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
    // ---- the 09-25 signup closure (rule group 6)
    ["self-signup was switched back on",
      (s) => s.replace("const BROKER_SELF_SIGNUP = false;", "const BROKER_SELF_SIGNUP = true;")],
    ["the signup endpoint stopped refusing, leaving the page as the only wall",
      (s) => s.replace("  if (!BROKER_SELF_SIGNUP) {", "  if (false) {")],
    ["a sign-up tab was put back on the page while the endpoint still refuses",
      (s) => s.replace('<h2 id="authTitle">Sign in</h2>', '<button id="tabUp">Create an account</button><h2 id="authTitle">Sign in</h2>')],
    // ⚠️ Mutated inside brokerPageHTML's own slice: $('go') is not unique across the worker's pages, and
    // a bare replace would land on another one and test nothing (#361).
    ["markup removed and its handler left behind, which throws and kills sign-in",
      (s) => {
        const a = s.indexOf("function brokerPageHTML(");
        const b = s.indexOf("\nfunction ", a + 10);
        const seg = s.slice(a, b);
        return s.slice(0, a) + seg.replace("$('go').onclick=async function(){", "$('tabUp').onclick=function(){};\n $('go').onclick=async function(){") + s.slice(b);
      }],
    ["emailing stopped being opt-in, so every invite mails",
      (s) => s.replace("const wantsEmail = body.send === true;", "const wantsEmail = true;")],
    ["the link became conditional on the email, so a failed send leaves nothing",
      (s) => s.replace("const row = { email, role, link: linkFor };", "const row = { email, role };")],
    ["the send outcome stopped being recorded per person",
      (s) => s.replace("if (wantsEmail) row.emailed = await sendSetPasswordEmail(env, {", "if (wantsEmail) await sendSetPasswordEmail(env, {")],
    ["British idiom came back into the invitation",
      (s) => s.replace("If you have any trouble getting in, let us know.", "If you have any trouble getting in, we will sort it out straight away.")],
    // ⚠️ ANCHORED ON THE DECLARATION, NOT THE SENTENCE. Eric's words are QUOTED VERBATIM in the doc
    // comment above the constant, so a search for the sentence finds the COMMENT first and mutates
    // prose the rules never read - it reports "landed" and changes nothing that matters (#361, and the
    // same family as #126). Quoting a user's words next to the string that holds them makes a decoy of
    // every anchor. The "= '" prefix exists only at the declaration.
    ["a guessed product list came back into the invitation",
      (s) => s.replace("= 'ABY now gives you the ability to run quotes yourself!",
                       "= 'ABY now gives you the ability to run COBRA, FSA and 5500 quotes yourself!")],
    ["the default invitation grew a link of its own, which an edit could delete",
      (s) => s.replace("+ 'If you have any trouble getting in, let us know.';",
                       "+ 'Set your password here: https://abyquotes.com/broker/set-password';")],
    // (A sabotage that removed the link from a single push line lived here until the email option was
    //  added and the code moved to a `row` object. It was DELETED rather than repointed: "the link became
    //  conditional on the email" below covers the same invariant against the code as it is now.)
    ["a locked account went back to being skipped, so a lost link is a dead end",
      (s) => s.replace("      const again = await issueResetToken(env, existing.id);",
                       "      skipped.push({ email, why: 'already invited' }); const again = String('');")],
    ["an ACTIVE account could be re-invited, minting a reset token against a live login",
      (s) => s.replace("if (existing && !existing.locked) {", "if (false) {")],
    ["the invite card was moved back inside a view, where the other view cannot see it",
      (s) => {
        const a = s.indexOf("function adminBrokersHTML(");
        const b = s.indexOf("\nfunction ", a + 10);
        const seg = s.slice(a, b);
        const card = '  <div class="card"><h2>Invite a broker to quote</h2>';
        const i = seg.indexOf(card);
        const j = seg.indexOf('<div id="perfView">');
        if (i < 0 || j < 0) return s;
        // lift the heading line out and drop it after perfView opens
        const moved = seg.replace(card, '  <div class="card"><h2>Invite a broker MOVED</h2>')
          .replace('<div id="perfView">', '<div id="perfView">\n' + card);
        return s.slice(0, a) + moved + s.slice(b);
      }],
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
console.log("\n  ok - the gate is ARMED, self-signup is CLOSED, and accounts come from ABY by invitation.");
console.log("       ABY staff are unaffected: they quote at /aby behind the admin cookie.\n");
