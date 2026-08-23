#!/usr/bin/env node
/**
 * build_guide.mjs — turn docs/admin-guide.md into the page served at /admin/guide.
 *
 * ⭐⭐ THE MARKDOWN IS THE ONLY COPY. Eric asked for the guide to live in the app; writing it there
 * directly would mean a second hand-maintained version of every explanation, and content with two
 * homes has diverged EVERY time in this project (the requirement records and the website, the KB
 * master and the RAG, the record and its source HTML). So the page is GENERATED, and editing the
 * page means editing the markdown.
 *
 * 🔴 THE CONVERSION HAPPENS HERE, NOT IN THE WORKER, AND THAT IS DELIBERATE. worker.js is one giant
 * template literal: a backtick anywhere in it ends a page early, and the guide is full of inline
 * code spans (TRAPS #248, broken five times in one day). Emitting a JSON-escaped string means the
 * generated file contains no backtick and no raw newline at all, whatever the markdown says.
 *
 * Run:     node scripts/build_guide.mjs
 * Check:   node scripts/build_guide.mjs --check   (fails if the generated file is stale)
 *
 * ⚠️ --check is in the pre-commit hook. Without it, editing the markdown and forgetting to rebuild
 * would leave the page silently showing yesterday's guide -- a rule with no checker is a preference.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'docs', 'admin-guide.md');
const OUT = join(REPO, 'docs', 'admin-guide.generated.js');
const CHECK = process.argv.includes('--check');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Inline formatting.
 * ⚠️ CODE SPANS ARE EXTRACTED FIRST AND PUT BACK LAST. Otherwise a `**` inside a code span becomes
 * bold, and an underscore in a table name becomes italics -- both of which look like a typo in the
 * rendered guide rather than like a bug in this file.
 */
const SENTINEL = '\u0001';

function inline(s) {
  // 🔴 THE PLACEHOLDER IS A CONTROL CHARACTER, NOT A NUMBER PADDED WITH SPACES. The first
  // version used " <index> ", which matches real prose -- "2,213 active and 977 termed" contains
  // " 977 " -- so the restore step could replace a genuine figure with a code span.
  // ⭐ A placeholder must be something the source CANNOT contain, and U+0001 cannot appear in a
  // markdown file anybody typed.
  const spans = [];
  let t = String(s).replace(/`([^`]+)`/g, (_, code) => {
    spans.push(code);
    return SENTINEL + (spans.length - 1) + SENTINEL;
  });
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    /^https?:\/\//.test(href) ? `<a href="${esc(href)}" rel="noopener">${label}</a>` : label);
  // ⚠️ NON-GREEDY, AND ALLOWED TO SPAN ASTERISKS. [^*]+ cannot cross a nested italic, so a run
  // like "**moves a quote to *In process*, not *Sold*.**" matched nothing and rendered as literal
  // asterisks. Bold resolves first, then italics inside whatever it produced.
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return t.replace(new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g'),
                   (_, i) => '<code>' + esc(spans[Number(i)]) + '</code>');
}

function render(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inQuote = false;

  const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

  while (i < lines.length) {
    let line = lines[i];

    // Blockquotes carry the "read this first" boxes and are their own block, not a paragraph style.
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      lines[i] = q[1];
      line = q[1];
      if (!line.trim()) { i++; continue; }
    } else if (inQuote && line.trim()) {
      closeQuote();
    } else if (inQuote) {
      closeQuote();
      i++;
      continue;
    }

    if (!line.trim()) { i++; continue; }

    if (/^---+$/.test(line.trim())) { closeQuote(); out.push('<hr>'); i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    // Tables. ⚠️ A row is split on unescaped pipes only -- an escaped \| is a literal, which the
    // notes discipline already relies on elsewhere.
    if (line.includes('|') && /^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i].replace(/^>\s?/, ''))) {
        rows.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const cells = (r) => r.trim().replace(/^\||\|$/g, '')
        .split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const isRule = (r) => /^[\s|:-]+$/.test(r);
      const head = rows.length > 1 && isRule(rows[1]) ? cells(rows[0]) : null;
      const body = rows.slice(head ? 2 : 0).filter((r) => !isRule(r)).map(cells);
      out.push('<div class="tw"><table>');
      if (head) out.push('<thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>');
      out.push('<tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>');
      out.push('</table></div>');
      continue;
    }

    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      // 🔴 THE WHOLE ITEM IS ASSEMBLED BEFORE IT IS FORMATTED, AND THAT ORDER IS THE BUG THIS FIXES.
      // The first version called inline() on each physical line and joined the results, so a bold
      // run that WRAPPED -- which most of them do, in a hard-wrapped markdown file -- had its opening
      // asterisks on one line and its closing pair on the next, and neither half ever matched. It
      // rendered as literal ** in twelve places. ⭐ Paragraphs never had the defect because they
      // join first; the list branch was the odd one out.
      const items = [];
      while (i < lines.length) {
        const raw = lines[i].replace(/^>\s?/, '');
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(raw);
        if (m) { items.push(m[3]); i++; continue; }
        // A wrapped continuation line belongs to the item above it.
        if (items.length && raw.trim() && /^\s+\S/.test(raw)) {
          items[items.length - 1] += ' ' + raw.trim();
          i++;
          continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${tag}>`);
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para = [];
    while (i < lines.length) {
      const raw = lines[i].replace(/^>\s?/, '');
      if (!raw.trim() || /^(#{1,6}\s|---+$|\s*\||\s*([-*]|\d+\.)\s)/.test(raw)) break;
      para.push(raw.trim());
      i++;
    }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeQuote();
  return out.join('\n');
}

if (!existsSync(SRC)) {
  console.log('CANNOT RUN: docs/admin-guide.md is missing.');
  process.exit(2);
}

const html = render(readFileSync(SRC, 'utf8'));
const banner =
  '// GENERATED FROM docs/admin-guide.md BY scripts/build_guide.mjs -- DO NOT EDIT.\n' +
  '// Edit the markdown and re-run the script. build_guide.mjs --check is in the pre-commit hook,\n' +
  '// so an edit without a rebuild refuses the commit.\n';
const body = banner + 'export const ADMIN_GUIDE_HTML = ' + JSON.stringify(html) + ';\n';

// 🔴 The generated file must contain no backtick: worker.js imports it, and wrangler bundles the two
// together. JSON.stringify guarantees this, and asserting it means a future change of encoder cannot
// quietly reintroduce the trap.
// 🔴 US ENGLISH, BECAUSE THIS IS SHIPPED PROSE. The project's rule is US spelling in anything
// a user might see, and the guide is the only long piece of prose the tool serves. Eric caught
// "in anger" on 2026-08-23 -- a British idiom, not a spelling, and no spell-checker would flag it.
// ⭐⭐ CHECKED ON THE RENDERED HTML, NOT THE MARKDOWN. The source is hard-wrapped, so "not in
// anger" spanned a line break and was invisible to a grep of the file while being perfectly
// visible on the page. Match what the READER sees.
const BRITISH = [
  ['in anger', 'used for real'],
  ['analyse', 'analyze'], ['analysing', 'analyzing'], ['analysed', 'analyzed'],
  ['realise', 'realize'], ['realising', 'realizing'], ['realised', 'realized'],
  ['recognis', 'recogniz'], ['organis', 'organiz'],
  ['normalis', 'normaliz'], ['summaris', 'summariz'], ['prioritis', 'prioritiz'],
  ['categoris', 'categoriz'], ['apologis', 'apologiz'],
  ['behaviour', 'behavior'], ['colour', 'color'], ['licence', 'license'],
  ['defence', 'defense'], ['centre', 'center'], ['grey', 'gray'],
  ['whilst', 'while'], ['amongst', 'among'], ['learnt', 'learned'],
  ['relabell', 'relabel'], ['cancell', 'cancel'], ['programme', 'program'],
];
const flat = html.toLowerCase();
const found = BRITISH.filter(([bad]) => flat.indexOf(bad) !== -1);
if (found.length) {
  console.log('The guide is shipped prose and must be US English. Found:');
  for (const [bad, good] of found) console.log('  ' + bad + '  ->  ' + good);
  console.log('Fix docs/admin-guide.md and re-run.');
  process.exit(1);
}

if (body.indexOf('`') !== -1) {
  console.log('CANNOT RUN: the generated file contains a backtick, which would break worker.js.');
  process.exit(2);
}

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== body) {
    console.log('The admin guide page is STALE.');
    console.log('docs/admin-guide.md has changed since docs/admin-guide.generated.js was built.');
    console.log('Run: node scripts/build_guide.mjs');
    process.exit(1);
  }
  console.log('admin guide: the page matches the markdown (' + html.length + ' chars of HTML).');
  process.exit(0);
}

writeFileSync(OUT, body);
console.log('admin guide: wrote docs/admin-guide.generated.js (' + html.length + ' chars of HTML).');
