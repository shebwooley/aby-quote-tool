"""build_field_list.py - the FIELD LIST for ABY's account managers (Eric and Niels, 10-01-2026).

Eric: "a list of all of the field names ... (whatever would show up in a json) so I can pass it on to
the account management team so they could match those to import them into their tool (or at least
map them)."

Built FROM THE CODE, never typed by hand, so it cannot drift from what the export really carries:
the setup questions come from public/assets/js/data/application-questions.js (evaluated by node), and
the authorization block mirrors handleCommitmentExport in worker.js. Re-run it whenever a question is
added or changed:

    py scripts/build_field_list.py "<output .xlsx path>"
"""
import json
import subprocess
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

REPO = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'ABY-Application-Field-List.xlsx'

dump = subprocess.run(
    ['node', '-e', "const Q=require('./public/assets/js/data/application-questions.js');"
     "process.stdout.write(JSON.stringify({forms:Q.FORMS,sections:Q.SECTIONS}))"],
    cwd=REPO, capture_output=True, text=True, check=True)
data = json.loads(dump.stdout)
FORMS = {k: v['title'] for k, v in data['forms'].items()}

# What a value looks like in the JSON, by question type.
VALUE = {
    'text': 'text', 'textarea': 'text (up to 2,000 characters)', 'email': 'text (an email address)',
    'tel': 'text (a phone number)', 'state': 'text: two-letter state code, e.g. "TX"',
    'yesno': 'true or false', 'check': 'true when ticked, false when unticked; absent if never touched', 'choice': 'text: exactly one of the choices listed',
    'multi': 'list of text: any of the choices listed', 'list': 'list of text',
    # The four below are typed freely; the page suggests the format but does not enforce it, so the
    # list must not promise one (a date box, by contrast, always yields YYYY-MM-DD).
    'date': 'text: a date, YYYY-MM-DD', 'md': 'text as typed; asked as month and day, MM-DD',
    'number': 'text as typed; asked as a number', 'money': 'text as typed; asked as a dollar amount (e.g. 450.00)',
    'ein': 'text as typed; asked as an EIN, 12-3456789',
}

labels = {}
for s in data['sections']:
    for q in s['questions']:
        labels[q['key']] = q['label']


def cond_text(c):
    if not c:
        return ''
    if 'all' in c:
        return ' AND '.join(cond_text(x) for x in c['all'])
    who = '"' + labels.get(c['key'], c['key']) + '" (' + c['key'] + ')'
    if 'equals' in c:
        v = c['equals']
        return who + ' is ' + ('Yes' if v is True else 'No' if v is False else '"' + str(v) + '"')
    if 'notEquals' in c:
        v = c['notEquals']
        return who + ' is not ' + ('ticked' if v is True else '"' + str(v) + '"')
    if 'includes' in c:
        return who + ' includes "' + c['includes'] + '"'
    if 'includesAny' in c:
        return who + ' includes any of: ' + ', '.join(c['includesAny'])
    if 'oneOf' in c:
        return who + ' is one of: ' + ', '.join(c['oneOf'])
    return json.dumps(c)


HEAD_FILL = PatternFill('solid', fgColor='143C73')
HEAD_FONT = Font(bold=True, color='FFFFFF')


def sheet(wb, title, headers, rows, widths):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(vertical='top', wrap_text=True)
    for r in rows:
        ws.append(r)
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(65 + i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical='top', wrap_text=True)
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    return ws


wb = Workbook()
wb.remove(wb.active)

readme = [
    ['What this is', 'Every field ABY receives when an employer signs a quote and completes the setup questions, '
     'with the exact name it carries in the JSON file.'],
    ['Where the JSON comes from', 'ABY admin > Commitments > the employer\'s row > Export. One file per employer. '
     'The file\'s "schema" value is "aby.commitment/1".'],
    ['Two parts', '1. The AUTHORIZATION the employer signed on the quote (tab "Authorization"). '
     '2. The SETUP QUESTIONS they answered afterward, under "application" (tab "Setup questions").'],
    ['How setup answers are stored', 'application.answers is one object: each answer under its Field name, e.g. '
     '"co.legalName": "Acme Inc". A question nobody answered is simply ABSENT - never an empty string.'],
    ['A second, readable copy', 'application.answers_labeled repeats every answer as {section, key, question, answer}, '
     'in the order the employer saw them, for a person reading the file.'],
    ['Not every question is asked', 'An employer only sees the questions for the services they bought (column '
     '"Asked when buying"), and some only appear after an earlier answer (column "Only asked if").'],
    ['Field names are permanent', 'A field name never changes once real answers exist; new questions get new names. '
     'The wording of a question may be improved without changing its name.'],
    ['Not in the JSON, on purpose', 'Social Security numbers, dates of birth and bank account details. Those go '
     'through a secure upload, never the web form or the export.'],
    ['Billing contact', 'For COBRA and HSA, the employer can tick "same as the HR / payroll contact" '
     '(contact.billingSameAsHr = true). Then the billing questions are not asked: use contact.hr.* as the billing contact.'],
    ['Retired fields', 'hra.minReimb, hra.minReimbOther, mhra.minReimb, mhra.minReimbOther, fsa.minReimb and '
     'fsa.minReimbOther (minimum reimbursement) were removed on 10-01-2026 and will not appear.'],
    ['Signatures', 'Both signatures are a picture (a PNG data URL, "data:image/png;base64,..."): '
     'acceptance.signature_image on the authorization, application.signature_image on the setup questions.'],
    ['Count', str(sum(len(s['questions']) for s in data['sections'])) + ' setup-question fields in '
     + str(len(data['sections'])) + ' sections.'],
]
sheet(wb, 'Read me', ['Topic', 'Detail'], readme, [28, 110])

auth = [
    ['schema', 'Always "aby.commitment/1"', 'text'],
    ['exported_at', 'When the file was exported', 'date and time (ISO 8601, UTC)'],
    ['commitment_id', 'ABY\'s id for this signed authorization', 'text'],
    ['signed_at', 'When the employer signed', 'date and time (ISO 8601, UTC)'],
    ['quote.quote_number', 'Quote number, e.g. TX260929-9184-C', 'text'],
    ['quote.quote_id', 'ABY\'s internal id for the quote', 'text'],
    ['quote.share_token', 'The code in the employer\'s quote link', 'text'],
    ['quote.proposal_url', 'Link to the proposal as the employer saw it', 'text (a web address)'],
    ['employer.name', 'Employer name as signed', 'text'],
    ['employer.address', 'Street address', 'text'],
    ['employer.city_state_zip', 'City, state and ZIP in one line', 'text'],
    ['employer.client_id', 'BenefitLab client id, when the quote came from BenefitLab', 'text'],
    ['authorized_signer.name', 'Person who signed', 'text'],
    ['authorized_signer.title', 'Their title', 'text'],
    ['authorized_signer.email', 'Their email', 'text'],
    ['authorized_signer.phone', 'Their phone', 'text'],
    ['hr_contact.name', 'HR contact', 'text'],
    ['hr_contact.title', 'HR contact title', 'text'],
    ['hr_contact.email', 'HR contact email', 'text'],
    ['hr_contact.phone', 'HR contact phone', 'text'],
    ['coverage.requested_start_date', 'Proposed administrative start date', 'text: a date, YYYY-MM-DD'],
    ['acceptance.printed_name', 'Printed name on the authorization', 'text'],
    ['acceptance.signature', 'Typed signature', 'text'],
    ['acceptance.signature_image', 'Drawn signature', 'picture (PNG data URL), or null'],
    ['acceptance.product_names', 'The services authorized, by name', 'list of text'],
    ['acceptance.products', 'The services authorized, with any option chosen', 'list'],
    ['broker.email', 'Broker email', 'text'],
    ['broker.name', 'Broker name', 'text'],
    ['broker.agency', 'Broker agency', 'text'],
    ['application', 'The setup questions (next rows); null if not started', 'object, or null'],
    ['application.status', '"draft" while being filled in, "submitted" once sent', 'text'],
    ['application.updated_at', 'Last time an answer was saved', 'date and time (ISO 8601, UTC)'],
    ['application.submitted_at', 'When it was submitted', 'date and time, or null'],
    ['application.submitted_by', 'Name of the person who submitted it', 'text, or null'],
    ['application.submitted_email', 'Their email', 'text, or null'],
    ['application.signature_image', 'Drawn signature on the setup questions', 'picture (PNG data URL), or null'],
    ['application.answers', 'Every answer, by Field name (tab "Setup questions")', 'object'],
    ['application.answers_labeled', 'The same answers with section and question wording', 'list'],
]
note = 'Every value is null when blank, never an empty string.'
sheet(wb, 'Authorization', ['JSON path', 'What it is', 'Value format'], auth, [34, 60, 40]).append(['', note, ''])

rows = []
for s in data['sections']:
    for q in s['questions']:
        asked = ', '.join(FORMS.get(f, f) for f in q['forms'])
        if q.get('unlessForm'):
            asked += ' (not when also buying ' + FORMS.get(q['unlessForm'], q['unlessForm']) + ')'
        rows.append([
            s['title'],
            q['key'],
            'application.answers["' + q['key'] + '"]',
            q['label'],
            VALUE.get(q['type'], q['type']),
            '; '.join(q.get('options') or []),
            asked if len(q['forms']) < len(FORMS) else 'Every service',
            cond_text(q.get('show')),
            'Optional' if q.get('optional') else '',
        ])
sheet(wb, 'Setup questions',
      ['Section', 'Field name', 'JSON path', 'Question', 'Value format', 'Choices', 'Asked when buying',
       'Only asked if', 'Note'],
      rows, [26, 30, 40, 55, 30, 40, 34, 45, 10])

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print('wrote', OUT, '-', len(rows), 'setup-question fields,', len(auth), 'authorization fields')
