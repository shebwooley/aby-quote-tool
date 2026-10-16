"""Build ABY's one-page bank forms (Eric, 10-16-2026: "Yes to the one pager").

The employer applications (HRA 12.2023, Medicare HRA, FSA 1.2025, HSA) each carried a bank section inside a
multi-page packet, and employers skipped it. These are the same sections as single pages, with the
wording of ABY's own forms, so they can be downloaded beside the secure upload and sent back on their own.

  public/assets/forms/ABY-reimbursement-bank-form.pdf  HRA, Medicare HRA, FSA: ABY pays reimbursements
  public/assets/forms/ABY-HSA-funding-bank-form.pdf    HSA funding option 2: ABY draws contributions

Typed fields are fillable; the check-signature blocks are boxes to sign in ink, because the signature is
scanned to print checks.  usage: py scripts/build_bank_forms.py
"""
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, black
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "forms"
LOGO = ROOT / "public" / "assets" / "images" / "aby-logo.png"
W, H = letter
LM, RM = 54, W - 54
NAVY = HexColor("#1f3a5f")
GREY = HexColor("#555555")


def header(c, title, sub):
    if LOGO.exists():
        c.drawImage(str(LOGO), LM, H - 78, width=120, height=40, preserveAspectRatio=True, mask="auto", anchor="sw")
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 16); c.drawRightString(RM, H - 56, title)
    c.setFillColor(GREY); c.setFont("Helvetica", 9); c.drawRightString(RM, H - 70, sub)
    c.setFillColor(black)
    return H - 100


def para(c, y, text, size=9, lead=12, width=RM - LM, font="Helvetica"):
    c.setFont(font, size)
    words, line = text.split(), ""
    for w in words:
        t = (line + " " + w).strip()
        if c.stringWidth(t, font, size) > width:
            c.drawString(LM, y, line); y -= lead; line = w
        else:
            line = t
    if line:
        c.drawString(LM, y, line); y -= lead
    return y


def section(c, y, text):
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 11); c.drawString(LM, y, text); c.setFillColor(black)
    c.setStrokeColor(NAVY); c.setLineWidth(0.6); c.line(LM, y - 3, RM, y - 3); c.setStrokeColor(black)
    return y - 18


def field(c, y, label, name, x=LM, width=None, hint=None, label_w=None):
    width = width or (RM - x)
    c.setFont("Helvetica", 9); c.drawString(x, y, label)
    lw = label_w or (c.stringWidth(label, "Helvetica", 9) + 6)
    c.acroForm.textfield(name=name, x=x + lw, y=y - 4, width=width - lw, height=15, borderWidth=0.5,
                         borderColor=GREY, fillColor=HexColor("#f6f8fb"), fontSize=9, forceBorder=True)
    if hint:
        c.setFont("Helvetica-Oblique", 7.5); c.setFillColor(GREY); c.drawString(x + lw, y - 13, hint); c.setFillColor(black)
        return y - 26
    return y - 22


def check(c, x, y, name, label):
    # A drawn square as well as the field: a viewer that does not render form fields, and a printed page, still show a box.
    c.setLineWidth(0.6); c.rect(x, y - 3, 10, 10)
    c.acroForm.checkbox(name=name, x=x, y=y - 3, size=10, borderWidth=0.5, borderColor=GREY, fillColor=HexColor("#f6f8fb"),
                        forceBorder=True)
    c.setFont("Helvetica", 9); c.drawString(x + 14, y - 1, label)
    return x + 14 + c.stringWidth(label, "Helvetica", 9) + 16


def employer_block(c, y):
    y = section(c, y, "Employer")
    y = field(c, y, "Company legal name", "company")
    half = (RM - LM) / 2 - 6
    field(c, y, "Plan", "plan", width=half)
    y = field(c, y, "ABY quote number (if known)", "quote", x=LM + half + 12, width=half)
    return y - 4


def bank_block(c, y, routing_hint, account_hint):
    y = section(c, y, "Bank account")
    y = field(c, y, "Financial institution name", "bank_name")
    y = field(c, y, "Street address", "bank_street")
    third = (RM - LM) / 3
    field(c, y, "City", "bank_city", width=third * 1.6 - 6)
    field(c, y, "State", "bank_state", x=LM + third * 1.6, width=third * 0.6 - 6)
    y = field(c, y, "Zip", "bank_zip", x=LM + third * 2.2, width=third * 0.8)
    y = field(c, y, "Routing transit / ABA number", "routing", hint=routing_hint)
    y = field(c, y, "Account number", "account", hint=account_hint)
    x = check(c, LM, y, "acct_checking", "Checking")
    check(c, x, y, "acct_savings", "Savings")
    return y - 22


def sign_block(c, y, who="Authorized employer representative"):
    y = section(c, y, "Authorization")
    half = (RM - LM) / 2 - 6
    field(c, y, "Printed name", "signer_name", width=half)
    y = field(c, y, "Title", "signer_title", x=LM + half + 12, width=half)
    c.setFont("Helvetica", 9); c.drawString(LM, y - 14, "Signature (" + who.lower() + ")")
    c.line(LM + 190, y - 16, LM + half + 60, y - 16)
    c.drawString(LM + half + 80, y - 14, "Date")
    c.line(LM + half + 106, y - 16, RM, y - 16)
    return y - 34


def footer(c, text):
    c.setFont("Helvetica", 7.5); c.setFillColor(GREY)
    c.drawString(LM, 44, "Return this page through the secure upload on your ABY application. Please do not email it.")
    c.drawString(LM, 33, text)
    c.setFillColor(black)


ROUTING = "The first two numbers must be 01 through 12 or 21 through 32."
ACCOUNT = "Include leading zeros and hyphens, but no spaces or other symbols."
AUTH_TAIL = ("ABY Benefits LLC is granted authority to the Plan Service Provider (PSP) to originate credit/debit entries to and "
             "from the named account through the EFT Services. This authority is to remain in full force and effect until PSP "
             "and Bank have received written notification of its termination in such time and in such manner as to afford PSP "
             "and Bank a reasonable opportunity to act upon it.")


def reimbursement():
    c = canvas.Canvas(str(OUT / "ABY-reimbursement-bank-form.pdf"), pagesize=letter)
    c.setTitle("ABY Benefits - Bank Information for Reimbursements")
    y = header(c, "Bank Information for Reimbursements", "HRA, Medicare HRA and FSA")
    y = para(c, y, "Complete this page if ABY Benefits will pay your employees' reimbursements, by direct deposit or by "
                   "check. ABY draws each reimbursement from the account below.", size=9.5, lead=13) - 6
    y = employer_block(c, y)
    y = bank_block(c, y, ROUTING, ACCOUNT)
    y = section(c, y, "Direct deposit authorization")
    y = para(c, y, "This Direct Deposit Authorization gives ABY Benefits LLC authorization to debit the specified account for "
                   "the sole purpose of issuing direct deposit reimbursements to the bank account your employee has provided "
                   "on their direct deposit authorization. " + AUTH_TAIL, size=8, lead=10.5) - 6
    y = section(c, y, "Check signature (only if ABY prints reimbursement checks)")
    y = para(c, y, "Your signature is captured for the sole purpose of creating a facsimile, which is printed on your "
                   "employees' reimbursement checks. Sign in each block in black or dark blue ink, staying inside the border. "
                   "If checks need more than one signature, every signature must fit in each block. Then tick the block you "
                   "prefer.", size=8, lead=10.5) - 4
    bw, bh = (RM - LM - 16) / 2, 52
    for i, x in enumerate((LM, LM + bw + 16)):
        c.setLineWidth(0.8); c.rect(x, y - bh, bw, bh)
        check(c, x, y - bh - 12, "sig_pick_%d" % (i + 1), "Use signature block %d" % (i + 1))
    y = y - bh - 30
    y = sign_block(c, y)
    footer(c, "ABY Benefits LLC  |  Bank Information for Reimbursements  |  10.2026")
    c.save()


def hsa():
    c = canvas.Canvas(str(OUT / "ABY-HSA-funding-bank-form.pdf"), pagesize=letter)
    c.setTitle("ABY Benefits - HSA Funding Bank Information")
    y = header(c, "HSA Funding Bank Information", "Health Savings Account, funding option 2")
    y = para(c, y, "Complete this page if you chose funding option 2: you upload a contribution file each payroll and ABY "
                   "Benefits draws the contributions from the account below and deposits them to your employees' HSAs. "
                   "Not needed for option 1 (direct deposit through your payroll).", size=9.5, lead=13) - 6
    y = employer_block(c, y)
    y = bank_block(c, y, ROUTING, ACCOUNT)
    y = section(c, y, "Direct deposit authorization")
    y = para(c, y, "This Direct Deposit Authorization gives ABY Benefits LLC authorization to debit the specified account for "
                   "the sole purpose of HSA contributions to the assigned HSA bank account. " + AUTH_TAIL, size=8, lead=10.5) - 10
    y = sign_block(c, y)
    footer(c, "ABY Benefits LLC  |  HSA Funding Bank Information  |  10.2026")
    c.save()


if __name__ == "__main__":
    reimbursement()
    hsa()
    print("wrote", OUT / "ABY-reimbursement-bank-form.pdf", "and", OUT / "ABY-HSA-funding-bank-form.pdf")
