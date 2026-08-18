#!/usr/bin/env node
// Parse the JavaScript this worker EMITS into its pages.
//
// 🔴 WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. On 2026-08-17 the ABY admin page shipped broken
// and sat there saying "Loading quotes…" forever. The cause: a row of markup written inside
// `adminHTML()` used escaped quotes for an inline handler --
//
//     '<td><button onclick="toggleBroker(\'' + email + '\')">'
//
// -- but `adminHTML()` is a TEMPLATE LITERAL, and a template literal CONSUMES the backslashes. So
// the browser received `toggleBroker('' + email` : a syntax error, which stops EVERY script on the
// page, including the quote list that has nothing to do with the change.
//
// ⛔ `node --check worker.js` DOES NOT CATCH THIS, and that is the whole point. It proves the
// TEMPLATE is valid JavaScript. Nothing was checking the OUTPUT. Grepping the rendered page for
// the new markup -- which is what was done -- confirms presence and says nothing about whether it
// runs, which is TRAPS' "verify the rendered page" one level deeper: render it AND parse it.
//
//   node scripts/check_page_scripts.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'worker.js'), 'utf8');

// Every <script>…</script> the worker can emit, wherever it is written.
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!blocks.length) {
  console.error('  check_page_scripts: found NO page scripts. The extractor is broken, which is\n' +
                '  worse than a failure -- a check that silently examines nothing reads as a pass.');
  process.exit(1);
}

let bad = 0;
blocks.forEach((m, i) => {
  const line = src.slice(0, m.index).split('\n').length;
  // ⚠️ `${…}` is template interpolation, not JavaScript in its own right. Replace each with a
  // harmless literal so the SURROUNDING code can be parsed. Nested braces are handled by counting
  // rather than by a regex, because `${JSON.stringify({a:1})}` is real and a lazy match cuts it in
  // the wrong place -- which would report a false error and teach everyone to ignore this check.
  let code = '', depth = 0;
  for (let k = 0; k < m[1].length; k++) {
    const two = m[1].slice(k, k + 2);
    if (!depth && two === '${') { depth = 1; k++; code += '"__interp__"'; continue; }
    if (depth) {
      if (m[1][k] === '{') depth++;
      else if (m[1][k] === '}') { depth--; }
      continue;
    }
    code += m[1][k];
  }
  try {
    new vm.Script(code);
    console.log(`  ok   page script at worker.js:${line} (${m[1].length} chars)`);
  } catch (e) {
    bad++;
    console.error(`  FAIL page script at worker.js:${line} -- ${e.message}`);
  }
});

if (bad) {
  console.error(`\n  ${bad} emitted page script(s) will not parse in a browser.\n` +
    '  A syntax error here disables EVERY script on that page, not just the new code.\n' +
    '  Most likely cause: backslash-escaped quotes inside a template literal. Use data\n' +
    '  attributes and a delegated listener instead of an inline handler.\n');
  process.exit(1);
}
console.log(`\n  check_page_scripts: OK -- ${blocks.length} emitted page script(s) parse.`);
console.log('    ⚠️ This says nothing about whether they BEHAVE, only that a browser can read them.');
