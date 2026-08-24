"""Send a prospecting CSV to the ABY CRM import endpoint, in batches.

WHY THIS EXISTS AND IS NOT A PASTE. The Marketing view's paste box is the right door for a
conference roster of twenty. The 2026-08 prospecting list is 1,819 rows across 658 firms and the
endpoint caps a request at 500, so a paste is four hand-split pastes with no record of which
succeeded. This is the same reasoning that kept scripts/rfp-mining: without it nobody can redo the
job.

WHAT IT DOES NOT DO, DELIBERATELY:
  * it does not construct an email address from a name and a domain. Every address in the source
    was published somewhere and the file stays that way (Eric, 2026-08-24).
  * it does not decide who is worth contacting. It sends what the CSV holds.
  * it does not retry a failed batch silently -- a batch that fails is reported and the run stops,
    because a partial import nobody knows about is worse than none.

DRY RUN IS THE DEFAULT AND IT REALLY CAN FAIL: it parses every row and reports what would be sent,
including the rows the server would refuse, without opening a session.

  py scripts/import_prospect_list.py <csv> --label "12-state prospect list 2026-08"
  py scripts/import_prospect_list.py <csv> --label "..." --send --base https://abyquotes.com
"""
import argparse, csv, io, json, os, sys, urllib.request, urllib.error

BATCH = 400   # under the endpoint's 500 cap, with room for it to tighten


def rows_from(path):
    out, skipped = [], []
    with io.open(path, encoding='utf-8-sig', newline='') as fh:
        for i, r in enumerate(csv.DictReader(fh), start=2):
            g = lambda k: (r.get(k) or '').strip()
            name, agency, email, phone = g('Agent Name'), g('Agency'), g('Email'), g('Phone')
            # The server is the authority on what it will accept; this only skips rows it could
            # not possibly place, so the reported total matches what actually gets sent.
            if not email and not (name and agency):
                skipped.append((i, name or agency or '(blank)', 'no email, and not both a name and a firm'))
                continue
            out.append({'name': name, 'agency': agency, 'email': email, 'phone': phone})
    return out, skipped


def post(base, path, payload, cookie):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode('utf-8'),
                                 headers={'Content-Type': 'application/json', 'Cookie': cookie})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv')
    ap.add_argument('--label', required=True, help='the tag every imported row carries')
    ap.add_argument('--happened-at', default='', help='YYYY-MM-DD; the server uses today if omitted')
    ap.add_argument('--base', default='https://abyquotes.com')
    ap.add_argument('--send', action='store_true', help='actually send. Without it this is a dry run')
    a = ap.parse_args()

    rows, skipped = rows_from(a.csv)
    withemail = sum(1 for r in rows if r['email'])
    print('%s: %d rows to send  (%d with an address, %d by name and firm)'
          % (os.path.basename(a.csv), len(rows), withemail, len(rows) - withemail))
    print('   %d skipped before sending' % len(skipped))
    for line, who, why in skipped[:10]:
        print('      line %-5d %-34s %s' % (line, who[:34], why))
    if not rows:
        print('Nothing to send.')
        return 1
    if not a.send:
        print('\nDRY RUN -- nothing was sent. Add --send to do it for real.')
        return 0

    pw = os.environ.get('ABY_ADMIN_PASSWORD')
    if not pw:
        print('Set ABY_ADMIN_PASSWORD first. It is not read from a file on purpose.')
        return 2
    req = urllib.request.Request(a.base + '/api/admin/login',
                                 data=json.dumps({'password': pw}).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        cookie = (r.headers.get('set-cookie') or '').split(';')[0]
    if not cookie:
        print('Signed in but got no session cookie.')
        return 2

    tot = {'added': 0, 'known': 0, 'adopted': 0, 'refused': 0, 'tagged': 0}
    for start in range(0, len(rows), BATCH):
        chunk = rows[start:start + BATCH]
        body = {'rows': chunk, 'label': a.label}
        if a.happened_at:
            body['happened_at'] = a.happened_at
        try:
            d = post(a.base, '/api/admin/crm/import', body, cookie)
        except urllib.error.HTTPError as e:
            print('BATCH %d FAILED (%s): %s' % (start // BATCH + 1, e.code, e.read().decode('utf-8')[:400]))
            print('STOPPING. Nothing after this batch was sent.')
            return 1
        if d.get('error'):
            print('BATCH %d REFUSED: %s' % (start // BATCH + 1, d['error']))
            return 1
        for k in tot:
            tot[k] += d.get(k, 0)
        print('  batch %d: %3d added  %3d known  %3d adopted  %3d refused  %3d tagged'
              % (start // BATCH + 1, d.get('added', 0), d.get('known', 0),
                 d.get('adopted', 0), d.get('refused', 0), d.get('tagged', 0)))

    # ALWAYS THE SPLIT, NEVER A TOTAL -- and re-count rather than trusting the sum, because a bulk
    # import into this database has silently dropped rows before (7 of 321, and 314 looked like success).
    print('\n%d added  %d already known  %d adopted an address  %d refused  %d tagged'
          % (tot['added'], tot['known'], tot['adopted'], tot['refused'], tot['tagged']))
    print('Now open /admin/brokers, Marketing, and filter on the tag to see them.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
