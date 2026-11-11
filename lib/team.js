// THE ABY TEAM, ONE LIST (Eric, 11-10-2026: "We also introduce team members like account managers, so I'd like to have
// a page where we can quickly and easily copy their contact info."; Fable review 11-10-2026, F10: staff contact details
// lived in three places).
//
// This list feeds: the Team page (/admin/team) and the internal quote overlay's rep list (ABY_INTERNAL_JS in
// worker.js, the seven who are not public). Eric and Niels are ALSO in public/assets/js/data/reps.js, because that
// file is what the PUBLIC quote page loads and it cannot import from here; check_team.mjs asserts the two agree.
//
// `public: true` = on the public quote page (reps.js). The rest appear only to signed-in ABY staff.
// A title left blank shows nothing; fill one in when Eric says what it is.

export const ABY_TEAM = [
  { id: 'eric',   name: 'Eric Johnson',       title: '', phone: '(817) 366-7536', email: 'eric@abybenefits.com',   public: true },
  { id: 'niels',  name: 'Niels Christiansen', title: '', phone: '(303) 378-1690', email: 'niels@abybenefits.com',  public: true },
  { id: 'sara',   name: 'Sara Wallace',       title: '', phone: '(817) 510-5843', email: 'sara@abybenefits.com'   },
  { id: 'mark',   name: 'Mark Tawadrous',     title: '', phone: '(817) 510-5841', email: 'mark@abybenefits.com'   },
  { id: 'martha', name: 'Martha Martinez',    title: '', phone: '(817) 510-5838', email: 'martha@abybenefits.com' },
  { id: 'sam',    name: 'Sam Kimbrell',       title: '', phone: '(817) 510-5845', email: 'sam@abybenefits.com'    },
  { id: 'joe',    name: 'Joe Schoppe',        title: '', phone: '(817) 510-5839', email: 'joe@abybenefits.com'    },
  { id: 'katie',  name: 'Katie Tawadrous',    title: '', phone: '(817) 510-5846', email: 'katie@abybenefits.com'  },
  { id: 'gage',   name: 'Gage Bridges',       title: '', phone: '(817) 510-5847', email: 'gage@abybenefits.com'   },
];

// The seven the internal overlay adds to the rep list (Eric and Niels already come from reps.js there).
export function internalRepsForOverlay() {
  return ABY_TEAM.filter((p) => !p.public)
    .map((p) => ({ id: p.id, name: p.name, title: p.title, phone: p.phone, email: p.email }));
}

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function firstName(p) { return String(p.name).split(' ')[0]; }

// What "Copy contact" puts on the clipboard: an email signature block.
export function contactBlock(p) {
  return [p.name, p.title, 'ABY Benefits', p.phone, p.email].filter(Boolean).join('\n');
}

// What "Copy intro" puts on the clipboard. Claude's draft wording (11-10-2026), Eric to change as he likes.
export function introText(p) {
  const role = p.title ? ', ' + (/^[aeiou]/i.test(p.title) ? 'an ' : 'a ') + p.title + ' at ABY Benefits' : ' at ABY Benefits';
  return 'I would like to introduce ' + p.name + role + ', who will be your main contact going forward. ' +
    firstName(p) + ' can be reached at ' + p.phone + ' or ' + p.email + '.';
}

// The page. `header` = the shared admin bar CSS, `nav` = abyAdminNav('/admin/team') HTML (both from worker.js).
export function adminTeamHTML(header, nav) {
  const cards = ABY_TEAM.map((p) =>
    '<li class="person">' +
      '<div class="who"><strong>' + esc(p.name) + '</strong>' +
        (p.title ? '<span class="title">' + esc(p.title) + '</span>' : '') +
        '<span>' + esc(p.phone) + '</span>' +
        '<span><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a></span>' +
      '</div>' +
      '<div class="act">' +
        '<button type="button" class="copy" data-label="Copy contact" data-text="' + esc(contactBlock(p)) + '">Copy contact</button>' +
        '<button type="button" class="copy alt" data-label="Copy intro" data-text="' + esc(introText(p)) + '">Copy intro</button>' +
      '</div>' +
    '</li>').join('');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Team &mdash; ABY admin</title><style>' +
    '*{box-sizing:border-box} body{margin:0;font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}' +
    header +
    'main{max-width:60em;margin:26px auto 80px;padding:0 16px}' +
    '.doc{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:28px 32px}' +
    'h1{font-size:26px;margin:0 0 6px} .lead{margin:0 0 12px;color:#3a4a5e}' +
    'ul.team{list-style:none;margin:0;padding:0}' +
    'li.person{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #eef2f6}' +
    'li.person:last-child{border-bottom:0}' +
    '.who strong{display:block;font-size:17px} .who span{display:block;color:#3a4a5e;font-size:15px}' +
    '.who .title{color:#1a5c3a;font-weight:600} .who a{color:#1d4f8f}' +
    '.act{display:flex;gap:8px;flex-shrink:0}' +
    '.act button{font:inherit;font-size:15px;padding:7px 14px;border-radius:7px;cursor:pointer;background:#1a5c3a;color:#fff;border:1px solid #1a5c3a}' +
    '.act button.alt{background:#fff;color:#1a5c3a} .act button.done{background:#2e7d4f;color:#fff}' +
    '.note{margin:22px 0 0;padding:12px 16px;background:#f7f9fc;border-left:4px solid #1a5c3a;border-radius:0 8px 8px 0;color:#3a4a5e;font-size:15px}' +
    '@media (max-width:640px){.doc{padding:20px 16px} li.person{flex-direction:column;align-items:flex-start}}' +
    '</style></head><body>' + nav +
    '<main><div class="doc"><h1>Team</h1>' +
    '<p class="lead">ABY&rsquo;s people, to paste into an email. <b>Copy contact</b> copies the name, phone and email as a block. ' +
    '<b>Copy intro</b> copies a sentence introducing that person as the client&rsquo;s contact.</p>' +
    '<ul class="team">' + cards + '</ul>' +
    '<p class="note">Someone new, a new number, or a title to add? Tell Eric; the list is changed in one place and shows up here and in the quote tool&rsquo;s rep list.</p>' +
    '</div></main>' +
    '<script>function logout(){fetch("/api/admin/logout",{method:"POST"}).then(function(){location.href="/admin"})}' +
    'document.addEventListener("click",function(e){var b=e.target.closest("button.copy");if(!b)return;' +
    'var t=b.getAttribute("data-text"),l=b.getAttribute("data-label");var done=function(){b.textContent="Copied";b.classList.add("done");' +
    'setTimeout(function(){b.textContent=l;b.classList.remove("done")},1800)};' +
    'if(navigator.clipboard){navigator.clipboard.writeText(t).then(done,function(){window.prompt("Copy this:",t)})}' +
    'else{window.prompt("Copy this:",t)}});</script>' +
    '</body></html>';
}
