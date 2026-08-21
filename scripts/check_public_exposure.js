#!/usr/bin/env node
/**
 * Is abyquotes.com publishing anything it should not?
 *
 * 🚨 THIS EXISTS BECAUSE ON 2026-08-21 IT WAS. `wrangler.jsonc` sets `assets.directory` to "." --
 * the whole repo -- so every file in it was uploaded and SERVED. Measured live that day:
 *   /.dev.vars 200 (ADMIN_PASSWORD, SESSION_SECRET, INTEGRATION_TOKEN) · /worker.js 200 (325KB of
 *   server source) · /.git/config, /.git/index, /.git/refs/heads/main and /.git/objects/<sha> all
 *   200, so the repository was CLONEABLE with full history · /schema.sql 200 · /scripts/*.py 200.
 *
 * ⭐⭐ NOTHING IN THE CODEBASE COULD HAVE CAUGHT IT, AND THAT IS THE POINT OF THIS FILE. Every other
 * checker here reads the SOURCE and asks whether the code is right. This one asks the SITE what it
 * will hand a stranger, which is a different question and the only one that would have noticed.
 * It was found by a human reading `wrangler deploy` output and thinking ".git looks wrong".
 *
 * 🔴 `.assetsignore` IS A DENY LIST, so the failure mode it leaves open is a NEW sensitive file
 * nobody adds a pattern for -- public by default until somebody remembers. That is what this
 * watches for.
 *
 * Run: node scripts/check_public_exposure.js [--host https://abyquotes.com]
 */

const args = process.argv.slice(2);
const hostArg = args.indexOf("--host");
const HOST = hostArg !== -1 ? args[hostArg + 1] : "https://abyquotes.com";

// MUST NOT be reachable. Each one was genuinely 200 before the fix unless marked.
const FORBIDDEN = [
  ["/.dev.vars", "wrangler's LOCAL secret file: admin password, session secret, integration token"],
  ["/.env", "the other conventional secret filename"],
  ["/worker.js", "the entire server source, including every admin page and business rule"],
  ["/wrangler.jsonc", "deployment config, including the D1 database id"],
  ["/.git/config", "git remote config -- and the entry point to cloning the whole repo"],
  ["/.git/HEAD", "git ref -- with objects reachable this yields full history"],
  ["/.git/index", "git index"],
  ["/.git/refs/heads/main", "git ref"],
  ["/.gitignore", "names the files worth looking for"],
  ["/schema.sql", "the database schema"],
  ["/scripts/import_quote_log.py", "the import tooling"],
  ["/package.json", "dependency list"],
  ["/README.md", "internal docs"],
];

// MUST stay reachable. ⚠️ WITHOUT THESE THE CHECK IS WORTHLESS: a site that is down, DNS that fails
// or a network with no route returns "not 200" for everything, and every FORBIDDEN row would pass.
// A checker that cannot tell "correctly hidden" from "nothing answered" is the one that reports all
// clear the day the site is broken.
const REQUIRED = [
  ["/", "the tool itself"],
  ["/assets/js/app.js", "the app JavaScript"],
  ["/assets/css/app.css", "the stylesheet"],
  ["/assets/js/data/reps.js", "the rep list -- PUBLIC BY DESIGN, see SOURCE-OF-TRUTH"],
];

async function status(path) {
  try {
    const r = await fetch(HOST + path, { redirect: "manual" });
    return r.status;
  } catch (e) {
    return `ERR ${String((e && e.message) || e).slice(0, 60)}`;
  }
}

(async () => {
  console.log(`asking ${HOST} what it will hand a stranger\n`);

  let exposed = 0, unreachable = 0;

  console.log("must NOT be served");
  for (const [p, why] of FORBIDDEN) {
    const s = await status(p);
    const bad = s === 200;
    if (bad) exposed++;
    console.log(`  ${bad ? "EXPOSED" : "ok     "} ${String(s).padEnd(4)} ${p}`);
    if (bad) console.log(`          ^ ${why}`);
  }

  console.log("\nmust STILL be served (the positive control)");
  for (const [p, why] of REQUIRED) {
    const s = await status(p);
    const bad = s !== 200;
    if (bad) unreachable++;
    console.log(`  ${bad ? "MISSING" : "ok     "} ${String(s).padEnd(4)} ${p}  (${why})`);
  }

  console.log("");
  if (unreachable) {
    console.log(`CANNOT ANSWER: ${unreachable} control path(s) did not return 200.`);
    console.log("The site may be down, blocked, or the deploy may have removed something it needed.");
    console.log("⛔ Do NOT read the section above as a pass -- with no working request, hidden and");
    console.log("   unreachable are the same result. Fix the control first.");
    process.exit(2);
  }
  if (exposed) {
    console.log(`${exposed} path(s) EXPOSED. Add a pattern to .assetsignore and redeploy.`);
    console.log("⚠️ `git push` does not deploy this worker. `npx wrangler deploy` does, every time.");
    process.exit(1);
  }
  console.log("nothing sensitive is served, and the tool is still up.");
  console.log("⚠️ This only checks the paths listed above. .assetsignore is a DENY list, so a NEW");
  console.log("   sensitive file is public until someone adds it here and to the ignore file.");
})();
