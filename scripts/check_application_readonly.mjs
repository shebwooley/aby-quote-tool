// check_application_readonly - ABY's view of a submitted application shows every answer in WORDS (10-06-2026).
//
// ABY's processor read Pinetop's submitted application as "most of the application is blank ... especially
// eligibility and benefits offered". Every one of those was answered: a disabled checkbox or radio draws its tick in
// pale gray, and the Summary listed only the blanks. So:
//   · read-only, a question shows its answer as text, or "Left blank" - never a disabled control
//   · read-only, the Summary carries every answer on one page (the same rows the printout uses)
//   · ABY's view opens on that Summary
//   · the employer's own fill-in view still draws real controls
//
//   node scripts/check_application_readonly.mjs
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../public/assets/js/apply.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const html = readFileSync(new URL('../public/apply.html', import.meta.url), 'utf8');
const out = [];
const ok = (n, c) => out.push([n, !!c]);

const q = js.slice(js.indexOf('  function question(q) {'), js.indexOf('\n  }\n', js.indexOf('  function question(q) {')));
const ro = q.indexOf('if (state.readonly) {');
const last = q.lastIndexOf("return '<div class=\"' + cls + '\">' + lbl + hint + input + '</div>';");
ok('read-only, a question returns its answer in words', ro > 0 && q.includes('var said = shown(q, v);') && q.includes("(said ? esc(said) : 'Left blank')"));
ok('and that happens BEFORE any control is returned', ro > 0 && last > ro);
ok('the employer\'s own view still returns the real controls', last > 0);
ok('the read-only Summary carries every answer', js.includes("if (state.readonly) return out + '<h2 style=\"margin-top:22px\">All answers</h2><div class=\"sheet\">' + sheetRows() + '</div>' + signedBlock(false);"));
ok('the printout and the Summary use the same rows', (js.match(/sheetRows\(\)/g) || []).length >= 3 && js.includes('    out += sheetRows();'));
ok('ABY\'s view, and a ?view=all link, open on the Summary', js.includes('if (adminMode || (state.readonly && /[?&]view=all\\b/.test(location.search))) state.step = steps().length - 1;'));
// THE NO-LOGIN LINK (Eric, 10-06-2026: "Can we not just make that available without a login?").
const lib = readFileSync(new URL('../lib/application.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const adm = lib.slice(lib.indexOf('export async function handleAdminGetApplication'), lib.indexOf('export async function handleAdminReopenApplication'));
ok('only the ADMIN route adds the share link', adm.includes("shareLink: '/q/' + c.share_token + '/apply?view=all'") && !lib.slice(lib.indexOf('function payload('), lib.indexOf('// GET /api/q/')).includes('shareLink'));
ok('the ABY view shows it with Copy link', js.includes("if (adminMode && d.shareLink && d.status === 'submitted') {") && js.includes('id="copyShare">Copy link</button>'));
ok('the submitted email carries the no-login link', lib.includes("'/q/' + a.shareToken + '/apply?view=all'") && lib.includes('shareToken: ctx.token,'));
ok('the answers are dark and full size', /\.ro-ans \{ font-size: 16px; font-weight: 600; color: #111;/.test(html));

let fail = 0;
for (const [n, c] of out) { console.log((c ? 'ok    ' : 'FAIL  ') + n); if (!c) fail++; }
if (out.length < 10) { console.log('FAIL  only ' + out.length + ' rules ran'); fail++; }
console.log('\ncheck_application_readonly - ' + (out.length - fail) + ' of ' + out.length + ' passed');
process.exit(fail ? 1 : 0);
