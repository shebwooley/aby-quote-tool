// Can a user REACH the things we built?
//
// ⭐⭐ WHY THIS EXISTS, AND WHY IT ASSERTS SOMETHING NO OTHER CHECKER DOES.
// F-367 -- the employer corrects the headcount on a quote -- was built, deployed and CORRECT. It
// was closed on "built, deployed and driven in a browser", and every word of that was true of the
// page it was driven on. The control renders only when window.__ABY_SHARED is true, which is only
// true on /q/<token>, and the ONLY way to mint that token was a button inside an EXPANDED ROW of
// the quote log. So the broker who had just written a quote had no route to it.
//
// Eric, 2026-08-22: "I only see download pdf, download html, and print, not share link."
//
// ⛔ EVERY OTHER CHECKER IN THIS REPO ASKS "IS IT CORRECT". None asks "can anybody get to it", and
// that is the gap this fills. A pricing assertion cannot fail when the feature is unreachable --
// the maths is fine; the door is missing.
//
// ⚠️ The closing note for F-367 claimed two guards, check_count_on_quote.js and
// check_employer_count.js. NEITHER FILE EVER EXISTED. So the feature ran unguarded while the notes
// said it was covered, which is how it stayed broken-in-practice for a day.
//
// ⭐ THE RULES BELOW ARE DELIBERATELY STRUCTURAL, NOT BEHAVIOURAL. They ask whether the affordance
// is emitted at all -- a link, a button, a route -- because that is exactly what nothing checked.
//
// Run:  node scripts/check_reachable.mjs
//       node scripts/check_reachable.mjs --self-test

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Source with its // comments removed, for rules that assert something is ABSENT.
// A rule saying "nothing calls X any more" is answered by the code, never by the note explaining
// why X went -- and that note is the single most likely place for the name to still appear.
// Deliberately line comments only: block comments are rare here, and a naive block stripper would
// eat the contents of the template literals these pages are built from.
const codeOnly = (src) => src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// SCOPED TO ONE PAGE ON PURPOSE. Every other admin page calls load() at boot and is right to:
// they have a single view and nothing cheaper to show first. A worker-wide grep for a bare
// load() would redden all of them.
function brokersPage(worker) {
  const start = worker.indexOf("function adminBrokersHTML()");
  if (start < 0) return "";
  const next = worker.indexOf("\nfunction ", start + 1);
  return worker.slice(start, next < 0 ? worker.length : next);
}

const RULES = [
  // ── RFP WATCH (F-384) ───────────────────────────────────────────────────────────────────
  // Written in the SAME commit as the endpoints, not after them. Every one of these fails until a
  // control exists that calls the thing, which is the only version of this rule that has ever
  // worked here: three endpoints in one day were built, tested, deployed and unreachable.
  {
    name: "RFP Watch is in the admin navigation",
    why: "A page nobody can click is a route nobody visits. There is no other way in: it is not"
       + " linked from the quote log and it is not on the CRM.",
    holds: (f) => /href: '\/admin\/rfp-watch'/.test(f.worker)
               && /path === '\/admin\/rfp-watch'/.test(f.worker),
  },
  {
    name: "the page asks for its rows",
    why: "A table that renders before it fetches shows an empty list, and an empty list reads as"
       + " 'no opportunities' rather than as a broken screen. That is the base rate here, so a"
       + " quiet week and a dead page must not look the same.",
    holds: (f) => /fetch\('\/api\/admin\/rfp'/.test(f.worker) && /function load\(\)/.test(f.worker),
  },
  {
    name: "a pasted list can be previewed AND committed from the page",
    why: "The preview endpoint is useless without a control that then writes. Half a door is the"
       + " same as no door.",
    holds: (f) => /onclick="preview\(\)"/.test(f.worker)
               && /onclick="commitPaste\(\)"/.test(f.worker)
               && /\/api\/admin\/rfp\/import/.test(f.worker),
  },
  {
    name: "one opportunity can be added by hand",
    why: "The phone-call and word-of-mouth path. Without it the module only works for things that"
       + " arrive as a table, which is not how Corpus Christi or College Station arrived.",
    holds: (f) => /onclick="addOne\(\)"/.test(f.worker) && /function addOne\(/.test(f.worker),
  },
  {
    name: "a disposition can be set, and passing asks why",
    why: "Recording that ABY looked at an entity and passed, with the reason, is the whole value"
       + " of the module. An endpoint that refuses a blank reason needs a control that collects one.",
    holds: (f) => /setDisposition\(/.test(f.worker)
               && /\/api\/admin\/rfp\/decision/.test(f.worker)
               && /Why are we passing/.test(f.worker),
  },
  {
    name: "the verification gate has a button",
    why: "🔴 THE GATE IS THE MODULE. Nothing reaches verified_open except by somebody opening the"
       + " issuing entity's own page and saying what they saw. An endpoint with no button means"
       + " every row stays unverified for ever and the badge stops meaning anything.",
    holds: (f) => /onclick="verify\(/.test(f.worker)
               && /\/api\/admin\/rfp\/verify/.test(f.worker),
  },
  {
    name: "could-not-verify is offered, not just success",
    why: "Two of the three real items on 2026-08-17 could not be resolved without a phone call."
       + " If the only control is 'I confirmed the date', that outcome has nowhere to go and the"
       + " most useful finding of the week is silently lost.",
    holds: (f) => /unresolved:\s*true/.test(f.worker),
  },
  {
    name: "screened-out rows can be seen and overruled",
    why: "The negative rules are the half that earns its keep and they will sometimes be wrong."
       + " A row that vanished cannot be argued with.",
    holds: (f) => /id="dropped"/.test(f.worker) && /function keep\(/.test(f.worker),
  },
  // ── THE MARKETING VIEW (F-383) ──────────────────────────────────────────────────────────
  // Everything else this repo guards asks whether the CRM is CORRECT. These ask whether anybody
  // can get to it. The endpoints were built, tested with 74 assertions and deployed before the
  // page existed at all -- which is exactly the state F-367 shipped in.
  {
    name: "the marketing view has a visible switch on the page",
    why: "The rows, the tags and the bulk apply are all behind it. Without the toggle the whole"
       + " view is a route nobody can reach, which is how F-367 shipped.",
    holds: (f) => /id=['\"]vMkt['\"]/.test(f.worker) && /setView\('marketing'\)/.test(f.worker),
  },
  {
    name: "the switch actually asks the marketing endpoint for rows",
    why: "A toggle that flips a panel but fetches nothing renders an empty list, and an empty list"
       + " reads as 'no agencies' rather than as a broken screen.",
    holds: (f) => /\/api\/admin\/crm\/agencies/.test(f.worker) && /function loadMkt\(/.test(f.worker),
  },
  {
    name: "an event list can be pasted in from the marketing view",
    why: "WRITTEN IN THE SAME COMMIT AS THE ENDPOINT, deliberately (TRAPS #284). Three endpoints"
       + " in one day were built, tested and DEPLOYED with no control calling them, because"
       + " endpoint-then-checker-then-screen leaves a phase where everything is green and nothing"
       + " is reachable. A rule added with the endpoint FAILS until there is a door.",
    holds: (f) => /id="importBox"/.test(f.worker) && /function runImport\(/.test(f.worker)
      && /crm\/import/.test(f.worker),
  },
  {
    name: "a firm status can be recorded, and read back beside the live one",
    why: "Eric: we tagged this originally as one quote ever and now they have done six. The"
       + " whole feature is the COMPARISON, so both values must reach the screen and there must be"
       + " a control that records one. An endpoint alone records nothing anybody asked for.",
    holds: (f) => /id="recStatus"/.test(f.worker) && /function recordStatus\(/.test(f.worker)
      && /recordedStatus/.test(f.worker) && /derivedStatus/.test(f.worker),
  },
  {
    name: "an agency can see the people ABY already knows at their firm",
    why: "Written AFTER the endpoint rather than with it, which is the mistake this rule exists"
       + " to catch -- see TRAPS #284. /api/agency/people shipped with no screen calling it, for"
       + " the fifth time in one session. The point of the rule is that it FAILS until there is a"
       + " door, and it did.",
    holds: (f) => /id="peopleCard"/.test(f.worker) && /function loadAgencyPeople\(/.test(f.worker)
      && /agency\/people/.test(f.worker),
  },
  {
    name: "a recorded note can be removed from the screen it was typed on",
    why: "THIRD instance in one day of an endpoint built, tested and deployed with no control"
       + " calling it. /crm/delete had assertions proving it 404s on a second attempt while nothing"
       + " on any screen could reach it.",
    holds: (f) => /function delEvent\(/.test(f.worker) && /crm\/delete/.test(f.worker),
  },
  {
    name: "the acquisition control is on the firm panel",
    why: "The endpoint that records an acquisition was built, tested and DEPLOYED before any"
       + " control existed to call it -- the exact state F-367 shipped in, noticed only because"
       + " somebody went looking. Of 672 firms only 12 are mapped, so an unreachable control here"
       + " means the map never gets filled in.",
    holds: (f) => /id="fRel"/.test(f.worker) && /function saveRel\(/.test(f.worker)
      && /crm\/relationship/.test(f.worker),
  },
  {
    name: "a person can be added to a firm without inventing an event",
    why: "Eric, 2026-08-27: 'That is kind of a dumb way though to add someone because it is not"
       + " from an event. Kelly just works there and I know it.' The only way to record a person"
       + " was the event paste, which asks for a tag and a date -- so recording a plain fact about"
       + " who works where meant fabricating an occasion. The control belongs in the firm panel,"
       + " the one screen where you already know which firm you mean.",
    // ⭐ THE LAST TEST IS THE REACHABILITY HALF. The first three only prove the form EXISTS; a
    // function defined and never called is precisely the built-and-unreachable state this file
    // was written for, and it looks finished in every code search.
    // ⚠️ THE LAST TEST MUST MATCH A CALL, NOT THE NAME. Its first version was
    // /addPersonForm\(id\)/, which the function's own SIGNATURE satisfies -- so the rule was
    // green with the form rendered by nothing, which is the exact defect it exists to catch.
    // The self-test reported it MISSED on the first run. A checker that reads source text can
    // always be satisfied by the declaration of the thing it is looking for.
    holds: (f) => /function addPersonForm\(/.test(f.worker)
      && /function addFirmPerson\(/.test(f.worker)
      && /id="npName"/.test(f.worker)
      && /\+\s*addPersonForm\(id\)/.test(f.worker),
  },
  {
    name: "a hand-added person is not recorded as having come from an event",
    why: "Source is where we FIRST met somebody and it is written once, so a wrong value is not"
       + " something a later import quietly corrects. Eric: 'that event that I met Megan at was"
       + " really the source.' So the event paste sends event and the firm panel sends hand_added."
       + " If both sent the same value the distinction would exist only in the comments, and the"
       + " column would go back to meaning nothing.",
    holds: (f) => /source:\s*'hand_added'/.test(f.worker)
      && /source:\s*'event'/.test(f.worker),
  },
  {
    name: "bulk apply is reachable from the rows themselves",
    why: "Eric asked for tick-the-rows-pick-a-tag-apply. The bar only appears once something is"
       + " selected, so the checkbox is its only door.",
    holds: (f) => /id=['\"]bulkBar['\"]/.test(f.worker) && /function selOne\(/.test(f.worker)
      && /function applyBulk\(/.test(f.worker),
  },
  {
    name: "the quote page offers a way to share the quote",
    why: "Without it the employer-editable headcount cannot be reached at all (F-367, F-382).",
    holds: (f) => /id=['"]shareBtn['"]/.test(f.app) && /Copy share link/.test(f.app),
  },
  {
    name: "the share button is wired to the share endpoint",
    why: "A button that renders but calls nothing is the same defect one layer down.",
    holds: (f) => /\/share['"]?\s*,\s*\{\s*method:\s*['"]POST/.test(f.app)
      || /'\/api\/quotes\/'\s*\+\s*id\s*\+\s*'\/share'/.test(f.app),
  },
  {
    name: "the save hook keeps the quote id",
    why: "The share link needs the saved row's id. The hook discarded the whole response, which is"
       + " why the button could not exist on the quote page.",
    holds: (f) => /__abySavedQuoteId/.test(f.hook) && /res\.json\(\)/.test(f.hook),
  },
  {
    name: "the worker serves the shared quote route",
    why: "The token is useless without a route that renders it as the employer view.",
    holds: (f) => /\/q\//.test(f.worker) && /__ABY_SHARED/.test(f.worker),
  },
  {
    name: "the shared page turns the employer control on",
    why: "The control is gated on this flag; if the shared route never sets it, the page renders"
       + " as an ordinary quote and nothing says so.",
    holds: (f) => /employerEditableCounts/.test(f.app) && /__ABY_SHARED/.test(f.app),
  },
  {
    name: "every admin page is linked from the nav",
    why: "A page nobody links to is a page nobody opens -- the same failure at the page level.",
    holds: (f) => {
      const routes = [...f.worker.matchAll(/path === ['"](\/admin[^'"]*)['"]/g)].map((m) => m[1]);
      const linked = [...f.worker.matchAll(/href: ['"](\/[^'"]*)['"]/g)].map((m) => m[1]);
      // ⚠️ NORMALISE ALIASES FIRST. "/admin/" and "/admin.html" are the same page as "/admin",
      // and counting them as unlinked made this rule fail on a healthy tree. A checker that cries
      // wolf gets ignored, which is worse than not having it -- the same lesson the page checker's
      // own comments record twice.
      const norm = (r) => r.replace(/\.html$/, "").replace(/\/$/, "") || "/admin";
      const nav = new Set(linked.map(norm));
      // A ROUTE THAT REDIRECTS IS DELIBERATELY UNLINKED, AND THAT IS THE WHOLE POINT OF IT.
      // Added 2026-08-26 when /admin/pipeline was retired (F-408): the page is gone, the URL
      // survives so old bookmarks land somewhere useful, and putting it back in the nav would
      // undo the retirement. This rule failed on a correct tree until it knew the difference --
      // exactly the cry-wolf failure its own comment above warns about, arriving from a new angle.
      // Detected from the route's own body rather than from a list of exceptions kept here: an
      // exception list is a second thing to remember, and nothing would notice it going stale.
      const redirects = new Set(
        [...f.worker.matchAll(/path === ['"](\/admin[^'"]*)['"]\)?\s*\{([\s\S]{0,400}?)\n    \}/g)]
          .filter((m) => /Response\.redirect/.test(m[2]))
          .map((m) => norm(m[1])));
      const pages = [...new Set(routes.map(norm))]
        .filter((r) => !r.startsWith("/admin/api") && !redirects.has(r));
      const missing = pages.filter((p) => !nav.has(p));
      if (missing.length) console.log("         unlinked: " + missing.join(", "));
      return missing.length === 0;
    },
  },
  // ── THE ANALYSIS IS PAID FOR ONLY BY THE PERSON LOOKING AT IT ──────────────────────────────
  // Eric, 2026-08-24: "I thought you told me that the brokers and agencies list would load
  // quickly now, but it still has to feed in." The Marketing view's own query IS cheap -- it
  // asks for no quote and no sale -- but load() ran at boot regardless of which view you landed
  // on, so the cheap query sat behind the whole roll-up over every quote.
  // ⛔ UNREACHABLE IS NOT THE ONLY WAY A DOOR CAN BE SHUT. A screen you have to wait through is
  // one you stop opening, and nothing here measured that.
  {
    name: "the quote roll-up is not fetched until somebody opens the analysis view",
    why: "load() reads every quote ever run. Calling it at boot makes the Marketing view pay for"
       + " an analysis it never shows. The guard has to be the view switch, not the page.",
    holds: (f) => {
      const page = brokersPage(f.worker);
      return /var PERF_LOADED = false;/.test(page)
          && /if \(!PERF_LOADED\) load\(\);/.test(page)
          && !/^ load\(\);$/m.test(page);
    },
  },
  // ── TIDY UP (F-388) ─────────────────────────────────────────────────────────────────────────
  // ⛔ /api/admin/crm/agency-dupes SHIPPED ON 08-23 AND NO SCREEN EVER CALLED IT. It was also keyed
  // on punctuation alone, so it could not see the 57 real clusters sitting in front of it. An
  // unreachable finder that returns nothing reads exactly like a clean list -- which is why Eric
  // kept being told the agencies were organised while looking at 672 rows, a quarter of them junk.
  // -- THE CROSS-SELL LIST -----------------------------------------------------------------------
  // Eric, 2026-08-22: the admin is for quoting, keeping up with quotes, AND targeting marketing.
  // This is the screen that turns the agency cleanup into calls, so it is exactly the kind of thing
  // that gets built, gets deployed, and gets no door -- which is what this whole file exists for.
  // -- THE NEWEST ANSWER IS NOT THE NEWEST QUESTION ----------------------------------------------
  // Found on the live page 2026-08-24, not by any checker: stepping the product picker fired a
  // fetch per keystroke, an earlier response arrived last, and the screen showed the ACA heading
  // over the twelve firms that have never quoted HSA. Everything on it was real; it was answering
  // a question nobody had asked any more.
  // This is not a reachability rule in the strict sense, and it lives here anyway because this is
  // the file that asks whether the screen a person is looking at is the screen they think it is.
  {
    name: "the cross-sell list ignores a response its own picker has already superseded",
    why: "The picker said ACA over the HSA list. A confidently wrong marketing list makes a call that insults somebody.",
    holds: (f) => /var nqSeq = 0;/.test(f.worker)
               && /var mine = \+\+nqSeq;/.test(f.worker)
               && /if \(mine !== nqSeq\) return;/.test(f.worker),
  },
  {
    name: "the marketing list does the same with its four filters",
    why: "Same shape, same race: rows from the first request under the filters of the second.",
    holds: (f) => /var mktSeq = 0;/.test(f.worker)
               && /var mine = \+\+mktSeq;/.test(f.worker)
               && /if \(mine !== mktSeq\) return;/.test(f.worker),
  },
  // -- AN ANSWER MUST HAVE SOMEWHERE TO GO ------------------------------------------------------
  // ERIC, 2026-08-24: "I have told you about 12 times now that Hubs-Wellspring is not right and it
  // should be HUB - Wellspring. Why do you have that page for me to tidy up if you are going to
  // ignore the answers."
  // The database said why: not one crm_event against any of those rows, one tidy_message ever,
  // nothing in tidy_dismissed. The screen could tag, note, alias and bury a firm -- but it could
  // not RENAME one. Only a session running SQL could, so every correction he gave lived in a chat
  // window and the wrong spelling stayed. This is the door that was missing.
  {
    name: "a firm's name can be corrected from its own panel",
    why: "Twelve corrections were lost because there was nowhere on any screen to put them.",
    holds: (f) => /id="fName"/.test(f.worker)
               && /function saveName\(/.test(f.worker)
               && /crm\/rename/.test(f.worker),
  },
  {
    name: "a name can be marked settled without renaming it",
    why: '"That name is already right, stop asking" is an answer too, and it had no control.',
    holds: (f) => /function confirmName\(/.test(f.worker)
               && /function unconfirmName\(/.test(f.worker)
               && /This name is right/.test(f.worker),
  },
  {
    name: "the duplicate finder actually honours a confirmed name",
    why: "A control that records an answer the finder ignores is worse than no control.",
    holds: (f) => /a\.name_confirmed_at IS NULL/.test(f.worker),
  },
  {
    name: "the tidy-up screen says how many firms it is leaving alone",
    why: "A list that quietly stops offering rows reads as a list that has run out of them.",
    holds: (f) => /confirmedCount/.test(f.worker)
               && /not offered here at all/.test(f.worker),
  },
  {
    name: "resolving a group settles the surviving name",
    why: "Answering the question should retire it, or the same pair returns on the next near-match.",
    holds: (f) => /crm\/rename[\s\S]{0,400}?confirm: true/.test(f.worker),
  },
  {
    name: "the never-quoted cross-sell list is reachable from the marketing view",
    why: "A marketing list nobody can open produces no calls, which is the same as not having it.",
    holds: (f) => /id="nqBox"/.test(f.worker)
               && /function loadNeverQuoted\(/.test(f.worker)
               && /crm\/never-quoted/.test(f.worker)
               && /ontoggle="if\(this\.open\)loadNeverQuoted\(\)"/.test(f.worker),
  },
  {
    name: "the cross-sell list can be pointed at a product and a floor",
    why: "One frozen product is a report; a picker is a tool. The floor is what keeps it to relationships.",
    holds: (f) => /id="nqProduct"/.test(f.worker) && /id="nqMin"/.test(f.worker),
  },
  {
    name: "a firm on the cross-sell list opens from the name, like everywhere else",
    why: "A list of names you cannot open makes somebody search for each one by hand.",
    holds: (f) => /nqBox[\s\S]{0,4000}?openFirm\(/.test(f.worker),
  },
  // -- QUOTES THAT FELL OFF EVERY SCREEN ----------------------------------------------------------
  // A quote whose broker_agency matches no agency row is in nobody's count. It is produced by doing
  // half of the resolve rule: creating the new firm and not renaming the quotes onto it. 343 quotes
  // went quiet that way on 2026-08-24 under Benefits Texas and JME, and nothing said so.
  {
    name: "quotes whose agency name has no record are surfaced, not silently dropped",
    why: "This failure hides itself: the new firm reads 0 quotes and the old name vanishes.",
    holds: (f) => /orphanNames/.test(f.worker)
               && /orphans/.test(f.worker)
               && /no agency record answers to/.test(f.worker),
  },
  {
    name: "the duplicate finder is reachable from the marketing view",
    why: "It existed for a day with no caller. A finding nobody can see is not a finding.",
    holds: (f) => /id="tidyBox"/.test(f.worker)
               && /function loadDupes\(/.test(f.worker)
               && /crm\/agency-dupes/.test(f.worker),
  },
  {
    name: "a proposed duplicate can actually be resolved from that screen",
    why: "Listing them without a way to act is half a door. The control writes the alias.",
    holds: (f) => /function keepThis\(/.test(f.worker)
               && /relationship: 'alias'/.test(f.worker),
  },
  {
    name: "an alias is hidden from the call list, like an acquired name",
    why: "The whole point is that nobody dials a misspelling. If it stays on the list, marking it"
       + " achieved nothing.",
    holds: (f) => /NOT IN \('succeeded','alias'\)/.test(f.worker),
  },

  // -- RETIRING THE PIPELINE PAGE (F-408, 2026-08-26) --------------------------------------
  //
  // WHY A REMOVAL GETS MORE RULES THAN THE FEATURE DID, and it is the counter-lesson from F-400
  // on the dashboard side: A MERGE IS A REMOVAL, AND THE FAILURE MODE OF A REMOVAL IS SILENCE.
  // A successor that quietly stops being emitted does not throw, does not fail a syntax check,
  // and renders as a slightly shorter page nobody can tell from a quiet week. So each of the
  // retired page's three jobs is asserted to still have a home.
  {
    name: "the retired /admin/pipeline URL still answers, as a redirect",
    why: "Bookmarks, the admin guide and every note that named it would 404 otherwise -- the same"
       + " rule the dashboard follows for its ?view=calendar links.",
    holds: (f) => /path === '\/admin\/pipeline'/.test(f.worker)
               && /\/admin\/brokers\?view=marketing&quoted=no/.test(f.worker),
  },
  {
    name: "the page it redirects to honours ?view= and ?quoted=",
    why: "A retired page that redirects to whichever view you happened to leave the target on is a"
       + " broken link with extra steps. The destination has to obey the URL it was sent.",
    holds: (f) => /QS\.get\('view'\) === 'marketing'/.test(f.worker)
               && /QS\.get\('quoted'\)/.test(f.worker),
  },
  {
    name: "the page really is gone, not merely unlinked",
    why: "Half a retirement -- the function still there, the nav entry removed -- leaves a screen"
       + " reachable by URL that nobody maintains and no checker covers.",
    holds: (f) => !/function adminPipelineHTML\(/.test(f.worker)
               && !/href: '\/admin\/pipeline'/.test(f.worker),
  },
  {
    name: "successor 1 of 3: Log a quote is on the quote log",
    why: "It was the one thing on Pipeline with no equivalent elsewhere. If this stops being"
       + " emitted, the only way to record an emailed quote is gone and nothing else notices.",
    holds: (f) => /<details class="logq" id="logq">/.test(f.worker)
               && /id="qAdd"/.test(f.worker)
               && /fetch\('\/api\/admin\/quote'/.test(f.worker),
  },
  {
    name: "successor 2 of 3: a list of people can still be pasted in",
    why: "Pipeline's Add prospects box died with it. The Marketing view's event import is its"
       + " successor and writes to the right tables -- but only while it exists.",
    holds: (f) => /id="importBox"/.test(f.worker)
               && /fetch\('\/api\/admin\/crm\/import'/.test(f.worker),
  },
  {
    name: "successor 3 of 3: never-quoted firms can still be filtered to",
    why: "Pipeline's whole list was its prospect status. That question now lives as the Never"
       + " quoted option, and losing it would silently lose the page's reason for existing.",
    holds: (f) => /id="mQuoted"/.test(f.worker)
               && /<option value="no">Never quoted<\/option>/.test(f.worker),
  },
  {
    name: "the deleted endpoints have no orphaned routes",
    why: "A route pointing at a function that no longer exists is a 500 waiting for whoever"
       + " remembers the URL, and it throws at request time rather than at deploy time.",
    // TWICE DEFEATED BY THE COMMENT THAT RECORDS THE DELETION, WHICH IS THE LESSON WORTH KEEPING.
    // v1 matched the bare name and went red on the note naming what was removed. v2 matched a
    // CALL -- and the note writes the names with parentheses, so it went red again.
    // A NEGATIVE RULE MUST READ CODE, NOT PROSE. Tightening the pattern was chasing the phrasing;
    // stripping the comments answers the question actually being asked. This project already has
    // the mirror of this written down -- a comment SATISFYING the checker that parses it -- and
    // this is the same confusion arriving from the failing side.
    holds: (f) => {
      const code = codeOnly(f.worker);
      return !/handleAdminPipeline\s*\(/.test(code)
          && !/handleAdminAddProspects\s*\(/.test(code);
    },
  },

  // -- LOG A QUOTE: THE TWO DEFECTS ERIC REPORTED (2026-08-26) ------------------------------
  {
    name: "products are pills built from the catalog, not typed into a box",
    why: "The old free-text field mapped typed words through a lookup table, and the server took"
       + " whatever the page sent. Both ends now speak one vocabulary.",
    holds: (f) => /const QUOTE_PRODUCT_IDS = \[/.test(f.worker)
               && /class="pp" data-pid="/.test(f.worker)
               && /QUOTE_PRODUCT_IDS\.indexOf\(bare\) === -1/.test(f.worker),
  },
  {
    name: "every product the tool sells can be logged",
    why: "Section 127, Lifestyle and Direct Billing had NO entry in the old lookup table, so they"
       + " could not be logged by any spelling and the error blamed the typist. Read out of"
       + " products.js so a new product cannot be forgotten here.",
    holds: (f) => {
      const m = /const QUOTE_PRODUCT_IDS = \[([\s\S]*?)\];/.exec(f.worker);
      if (!m) return false;
      const offered = new Set((m[1].match(/'([A-Za-z0-9]+)'/g) || []).map((x) => x.slice(1, -1)));
      // READ OUT OF products.js, NEVER RESTATED HERE. A hardcoded expected list is a second copy
      // of the catalog, and the two would disagree the first time a product is added.
      const sold = (f.products.match(/^    id: '([A-Za-z0-9]+)',$/gm) || [])
        .map((x) => /'([A-Za-z0-9]+)'/.exec(x)[1]);
      if (!sold.length) return false;   // a fixture that finds nothing is a FAILURE, not a pass
      return sold.every((id) => offered.has(id));
    },
  },
  {
    name: "a hand-logged quote stores the rep's DISPLAY NAME, not the dropdown's id",
    why: "Eric, 2026-08-26: it 'assigned me but didn't capitalize my name'. The log's rep filter is"
       + " keyed on the full name, so 'eric' and 'Eric Johnson' become two people in that dropdown"
       + " and picking either hides the other's quotes.",
    holds: (f) => /const QUOTE_REP_NAMES = \{/.test(f.worker)
               && /const rep = repId \? QUOTE_REP_NAMES\[repId\] : '';/.test(f.worker),
  },
  {
    name: "the rep names match the ones the quote tool itself writes",
    why: "Two copies of one list -- worker.js and assets/js/data/reps.js -- and nothing enforced"
       + " that they agree. One fix applied to one copy of a pattern is not applied to the pattern.",
    holds: (f) => {
      const m = /const QUOTE_REP_NAMES = \{([\s\S]*?)\};/.exec(f.worker);
      if (!m) return false;
      const mine = (m[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)).sort();
      const theirs = (f.reps.match(/name: '([^']+)'/g) || [])
        .map((x) => /'([^']+)'/.exec(x)[1]).sort();
      if (!theirs.length) return false;  // could not read the tool's list: unchecked, not fine
      return mine.length === theirs.length && mine.every((n, i) => n === theirs[i]);
    },
  },
  {
    name: "the agency list has an A-Z bar, and a chosen letter is not capped",
    why: "Eric, 2026-08-26: 'with so many letters, it takes a long time to scroll.' The list is"
       + " capped at 150 rows, so a letter bar that did not lift the cap would answer 'take me to"
       + " S' with the first 150 firms -- the scrolling problem again, with a click in front of it.",
    holds: (f) => /id="azbar"/.test(f.worker)
               && /function renderAZ\(\)/.test(f.worker)
               && /var shown = \(MKT_ALL \|\| mktLetter\) \? tops : tops\.slice\(0, MKT_CAP\);/.test(f.worker),
  },
  {
    name: "a letter-filtered list says which letter is filtering it",
    why: "A list showing 42 of 665 firms with nothing on screen explaining why is how somebody"
       + " concludes four hundred agencies have gone missing. Same rule as every other filter here.",
    holds: (f) => /mktLetter \? ' \\u2014 ' \+ \(mktLetter === '#'/.test(f.worker),
  },
  {
    name: "a hand-logged quote can carry an effective date",
    why: "/admin/today builds its deadline rows from effective_date. The old form never asked for"
       + " one, so a quote logged specifically so somebody would circle back could not appear on"
       + " the page whose whole job is reminding you to circle back.",
    holds: (f) => /id="qEffective"/.test(f.worker)
               && /effectiveDate: document\.getElementById\('qEffective'\)\.value/.test(f.worker),
  },
];

const SABOTAGES = [
  // -- F-408: the pipeline retirement. Each sabotage is a way the merge could silently lose a job.
  {
    // Every rule in the block above has one of these. Written last because it was MISSING: nine
    // sabotages covered nine rules and "the page really is gone" had none, which would have made
    // it a claim nobody had ever seen fail. TRAPS #332 -- run it, then write it.
    why: "the retired page function is put back, so a screen nobody maintains is live again",
    apply: (f) => ({ ...f, worker: f.worker + "\nfunction adminPipelineHTML() { return ''; }\n" }),
  },
  {
    why: "the retired /admin/pipeline URL stops redirecting, so every old link 404s",
    apply: (f) => ({ ...f, worker: f.worker.replace(/view=marketing&quoted=no/g, "view=nowhere") }),
  },
  {
    why: "the destination stops honouring ?view=, so the redirect lands on the wrong tab",
    apply: (f) => ({ ...f, worker: f.worker.replace(/QS\.get\('view'\)/g, "QS.get('ignored')") }),
  },
  {
    why: "Log a quote stops being emitted on the quote log -- the job with no other home",
    apply: (f) => ({ ...f, worker: f.worker.replace(/<details class="logq" id="logq">/g,
                                                   '<details class="gone" id="gone">') }),
  },
  {
    why: "the event import disappears, so a list of people can no longer be pasted in anywhere",
    apply: (f) => ({ ...f, worker: f.worker.replace(/id="importBox"/g, 'id="wasImportBox"') }),
  },
  {
    why: "the Never quoted filter goes, taking the retired page's whole question with it",
    apply: (f) => ({ ...f, worker: f.worker.replace(/<option value="no">Never quoted<\/option>/g,
                                                   '<option value="no">Some other thing</option>') }),
  },
  {
    why: "a route is left pointing at a handler that was deleted",
    apply: (f) => ({ ...f, worker: f.worker + "\nhandleAdminPipeline(request, env);\n" }),
  },
  {
    why: "a product the tool sells is dropped from the pill list, so it cannot be logged at all",
    apply: (f) => ({ ...f, worker: f.worker.replace(/'directBilling',\n/g, "") }),
  },
  {
    why: "the rep goes back to being stored as the dropdown's lowercase id",
    apply: (f) => ({ ...f, worker: f.worker.replace(/const rep = repId \? QUOTE_REP_NAMES\[repId\] : '';/g,
                                                   "const rep = repId;") }),
  },
  {
    why: "worker.js and reps.js disagree about a rep's name",
    apply: (f) => ({ ...f, reps: f.reps.replace(/name: 'Eric Johnson'/g, "name: 'Eric R Johnson'") }),
  },
  {
    why: "the A-Z bar stops lifting the row cap, so a letter shows the first 150 firms again",
    apply: (f) => ({ ...f, worker: f.worker.replace(
      /var shown = \(MKT_ALL \|\| mktLetter\) \? tops : tops\.slice\(0, MKT_CAP\);/g,
      "var shown = MKT_ALL ? tops : tops.slice(0, MKT_CAP);") }),
  },
  {
    why: "the count stops naming the active letter, so a short list looks like lost data",
    apply: (f) => ({ ...f, worker: f.worker.replace(
      /mktLetter \? ' \\u2014 ' \+ \(mktLetter === '#'/g, "false ? '' + (mktLetter === '#'") }),
  },
  {
    why: "the effective date is dropped from the log-a-quote form, hiding the row from Today",
    apply: (f) => ({ ...f, worker: f.worker.replace(/id="qEffective"/g, 'id="qWhatever"') }),
  },

  {
    why: "the tidy-up screen loses its caller, so the finder is unreachable again",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function loadDupes\(/g, "function unusedDupes(") }),
  },
  {
    why: "an alias stays on the call list, so resolving one achieves nothing",
    // A STRING .replace() SWAPS THE FIRST MATCH ONLY. This phrase now appears twice -- the call
    // list and the duplicate finder -- so the one-shot version left the second in place and the
    // rule stayed green. A sabotage that only half-applies is reported MISSED and sends you
    // looking at the guard instead of at the sabotage.
    apply: (f) => ({ ...f, worker: f.worker.replace(/NOT IN \('succeeded','alias'\)/g, "<> 'succeeded'") }),
  },
  {
    why: "the eager boot-time load() is put back, so Marketing pays for the analysis again",
    apply: (f) => ({ ...f, worker: f.worker.replace(" var PERF_LOADED = false;", " var PERF_LOADED = false;\n load();") }),
  },
  {
    why: "the view switch stops loading the analysis, so Performance renders empty forever",
    apply: (f) => ({ ...f, worker: f.worker.replace(/if \(!PERF_LOADED\) load\(\);/g, "if (!PERF_LOADED) void 0;") }),
  },
  {
    why: "the RFP Watch nav link is gone, so the page has no door at all",
    apply: (f) => ({ ...f, worker: f.worker.replace(/href: '.admin.rfp-watch'/g, "href: '/admin/gone'") }),
  },
  {
    why: "the verify button is orphaned while the endpoint stays",
    apply: (f) => ({ ...f, worker: f.worker.replace(/onclick="verify/g, 'onclick="noop') }),
  },
  {
    why: "could-not-verify loses its control, so a phone-call outcome has nowhere to go",
    apply: (f) => ({ ...f, worker: f.worker.replace(/unresolved:\s*true/g, "unresolved: false") }),
  },
  {
    why: "the record-status control is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function recordStatus\(/g, "function unusedRec(") }),
  },
  {
    why: "the agency people card is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function loadAgencyPeople\(/g, "function unusedPeople(") }),
  },
  {
    why: "the event-list paste box is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function runImport\(/g, "function unusedImport(") }),
  },
  {
    why: "the note delete control is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function delEvent\(/g, "function unusedDel(") }),
  },
  {
    why: "the acquisition control is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function saveRel\(/g, "function unusedRel(") }),
  },
  {
    // ⭐ THE DEFINITION SURVIVES AND ONLY THE CALL GOES. That is the state this rule exists for:
    // a form that is fully written, correct, and rendered by nothing. Removing the function
    // instead would be caught by check_declarations, so it would prove a different guard.
    why: "the add-a-person form is built but never rendered",
    apply: (f) => ({ ...f, worker: f.worker.replace(/\+ addPersonForm\(id\)/g, "+ ''") }),
  },
  {
    // The distinction Eric asked for, collapsed: if the firm panel also claims "event", then
    // being told somebody works somewhere is recorded as having met them at an event.
    why: "a hand-added person is stamped as having come from an event",
    apply: (f) => ({ ...f, worker: f.worker.replace(/source: 'hand_added'/g, "source: 'event'") }),
  },
  {
    why: "the marketing switch is removed from the page",
    apply: (f) => ({ ...f, worker: f.worker.replace(/id="vMkt"/g, 'id="notTheSwitch"') }),
  },
  {
    why: "the marketing view stops fetching its rows",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function loadMkt\(/g, "function unusedLoad(") }),
  },
  {
    why: "the bulk apply bar is orphaned from the row checkboxes",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function selOne\(/g, "function unusedSel(") }),
  },
  {
    why: "the share button is removed from the quote page",
    apply: (f) => ({ ...f, app: f.app.replace(/id="shareBtn"/g, 'id="notShareBtn"') }),
  },
  {
    why: "the save hook goes back to discarding the response",
    apply: (f) => ({ ...f, hook: f.hook.replace(/__abySavedQuoteId/g, "unusedId") }),
  },
  {
    why: "the shared page stops enabling the employer control",
    apply: (f) => ({ ...f, app: f.app.replace(/employerEditableCounts/g, "unusedFlag") }),
  },
];

function load() {
  return {
    app: read("assets/js/app.js"),
    hook: read("save-hook.js"),
    worker: read("worker.js"),
    // ADDED 2026-08-26. Two rules compare worker.js against the tool's OWN data files rather than
    // against a list restated in here -- a restated list is a third copy and rots faster than
    // either of the two it is meant to police.
    products: read("assets/js/data/products.js"),
    reps: read("assets/js/data/reps.js"),
  };
}

function run(files) {
  return RULES.map((r) => ({ name: r.name, ok: !!r.holds(files) }));
}

const files = load();
const results = run(files);
let bad = 0;

console.log("REACHABILITY -- " + RULES.length + " rules");
for (const r of results) {
  console.log((r.ok ? "  ok   " : "  FAIL ") + r.name);
  if (!r.ok) {
    bad++;
    const rule = RULES.find((x) => x.name === r.name);
    console.log("         " + rule.why);
  }
}

if (process.argv.includes("--self-test")) {
  console.log("");
  console.log("SELF-TEST -- every sabotage must redden at least one rule");
  for (const s of SABOTAGES) {
    const before = run(files);
    const after = run(s.apply(files));
    const flipped = after.filter((a, i) => before[i].ok && !a.ok).length;
    console.log((flipped ? "  caught  " : "  MISSED  ") + s.why
      + (flipped ? "  (" + flipped + " rule(s) went green->red)" : ""));
    if (!flipped) bad++;
  }
}

console.log("");
if (bad) {
  console.log(">> " + bad + " problem(s). A feature nobody can reach is not shipped.");
  process.exit(1);
}
console.log("everything built is reachable from a screen a user is already on.");
