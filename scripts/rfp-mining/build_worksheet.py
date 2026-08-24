import io, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xlsxout  # noqa: E402

BASE = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BenefitLab Project\ABY Integration"
TMP = os.path.join(os.environ["CLAUDE_JOB_DIR"], "tmp")
OUT = os.path.join(BASE, "ABY RFP Questions for Niels.xlsx")

STOP = set("the a an of to in for and or is are do does did will would can could your you our we "
           "us with that this these those any all be been being on at as it its from by not have "
           "has had please if their they there what who whom when where which why".split())


def keyset(q):
    w = [re.sub(r"(ies|es|s)$", "", x.lower()) for x in re.split(r"[^A-Za-z]+", q) if len(x) > 2]
    return set(x for x in w if x not in STOP)


pool = []
raw = io.open(os.path.join(TMP, "mined-questions.md"), encoding="utf-8").read()
src = None
for line in raw.split("\n"):
    line = line.strip()
    if line.startswith("## Source "):
        src = "doc" + line.replace("## Source ", "").strip()
    elif line.startswith("- ") and src:
        q = re.sub(r"^(?:Yes No\s*)?[a-z0-9]{1,3}[\.\)]\s*", "", line[2:].strip())
        if len(q) >= 25:
            pool.append([q, {src}, None])

v1 = io.open(os.path.join(BASE, "RFP-Question-Bank-v1-2026-08-23.md"), encoding="utf-8").read()
for m in re.finditer(r"^\|\s*\*\*(\d)/5\*\*\s*\|\s*(.+?)\s*\|\s*$", v1, re.M):
    n, q = int(m.group(1)), re.sub(r"\*\((.+?)\)\*", "", m.group(2)).strip()
    q = re.sub(r"\s+", " ", q)
    if len(q) >= 20:
        pool.append([q, set("v1src%d" % i for i in range(n)), None])

cs = io.open(os.path.join(BASE, "RFP-ABY-Answered-CollegeStation-TabB.md"), encoding="utf-8").read()
for line in cs.split("\n"):
    if not line.startswith("| ") or line.startswith("| #") or line.startswith("|---"):
        continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) >= 4 and cells[0].isdigit() and len(cells[2]) >= 12:
        pool.append([cells[2], {"collegestation"}, cells[3]])

clusters = []
for q, docs, ans in pool:
    k = keyset(q)
    if not k:
        continue
    best, best_score = None, 0.0
    for c in clusters:
        inter = len(k & c["keys"])
        if inter < 2:
            continue
        s = inter / float(min(len(k), len(c["keys"])))
        if s > best_score:
            best, best_score = c, s
    if best is not None and best_score >= 0.60:
        best["keys"] |= k
        best["docs"] |= docs
        best["forms"].append(q)
        if ans and not best["answer"]:
            best["answer"] = ans
    else:
        clusters.append({"keys": k, "docs": set(docs), "forms": [q], "answer": ans})

CATS = [
    ("About ABY", r"established|in business|how long|ownership|financial|number of employee|"
                  r"size of your staff|headquarter|located|history|years|full range"),
    ("References", r"reference|client list|retention|terminated|lost|similar size|comparable"),
    ("Our team and service", r"account manager|account executive|dedicated|assigned|key personnel|"
                             r"escalat|backup|call center|customer service|hours of operation"),
    ("Getting started", r"implement|transition|conversion|takeover|timeline|incumbent|go.?live|"
                        r"onboard|lead time|what do you need"),
    ("Claims and money", r"claim|reimburse|funding|deposit|substantiation|receipt|adjudicat|bank"),
    ("Debit cards", r"debit card|card issuance|card transaction"),
    ("Website and app", r"web ?site|online|portal|mobile app|log ?in|self.?service|internet"),
    ("COBRA", r"\bcobra\b|continuation coverage|qualifying event"),
    ("Retiree and direct billing", r"retiree|direct bill|premium billing"),
    ("ACA reporting", r"\baca\b|1095|1094|affordable care"),
    ("Plan documents and testing", r"plan document|non.?discrimination|testing|amendment|form 5500|"
                                   r"summary plan|compliance|erisa"),
    ("Security and privacy", r"security|encrypt|breach|soc ?2|cyber|disaster recovery|hipaa|"
                             r"business continuity|confidential|privacy|audit"),
    ("Insurance and licensing", r"lawsuit|legal action|litigation|licen[sc]|bonded|"
                                r"errors and omissions|liability insurance"),
    ("Payroll and data files", r"file feed|payroll|eligibility file|interface|integrat|"
                               r"data transmission|import|export|hris"),
    ("Reports", r"report"),
    ("Enrollment and employee communication", r"enrollment|educat|communicat|booklet|meeting|"
                                              r"webinar|material|multilingual|spanish"),
    ("Who we work with", r"subcontract|outsourc|partner|commission|independent|conflict of interest"),
    ("Fees", r"\bfee|price|pricing|rate guarantee|cost|contract term|performance guarantee|penalt"),
]


def cat_of(q):
    for name, pat in CATS:
        if re.search(pat, q, re.I):
            return name
    return "Anything else"


def pick(forms):
    return sorted(forms, key=lambda f: (0 if 40 <= len(f) <= 170 else 1,
                                        0 if f.rstrip().endswith("?") else 1, len(f)))[0]


rows = []
for c in clusters:
    q = pick(c["forms"])
    others = [f for f in c["forms"] if f != q]
    seen, trimmed = set(), []
    for o in others:
        k = re.sub(r"[^a-z]", "", o.lower())[:60]
        if k in seen:
            continue
        seen.add(k)
        trimmed.append(o)
    rows.append({"cat": cat_of(q), "freq": len(c["docs"]), "q": q,
                 "also": trimmed[:4], "ans": c["answer"] or ""})

rows.sort(key=lambda r: (-r["freq"], r["cat"], r["q"].lower()))

HEAD = ["Priority", "Topic", "Question", "Also asked as", "Asked by",
        "ABY's 2025 answer (please check)", "Niels' answer"]
WIDTH = [9, 24, 62, 52, 9, 52, 60]

out = []
for r in rows:
    pr = "1 - first" if r["freq"] >= 4 else ("2 - next" if r["freq"] == 3 else
                                             ("3 - later" if r["freq"] == 2 else "4 - one-off"))
    out.append([(pr, 4), (r["cat"], 2), (r["q"], 2),
                ("\n".join("- " + a for a in r["also"]), 3),
                (r["freq"], 4), (r["ans"], 2), ("", 2)])

xlsxout.write(OUT, "Questions", WIDTH, HEAD, out)
have = sum(1 for r in rows if r["ans"])
from collections import Counter
print("rows: %d | with an ABY answer: %d" % (len(rows), have))
for k, v in sorted(Counter(("1" if r["freq"] >= 4 else "2" if r["freq"] == 3 else
                            "3" if r["freq"] == 2 else "4") for r in rows).items()):
    print("  priority %s: %d" % (k, v))
print("variants folded in: %d" % sum(len(r["also"]) for r in rows))
print(OUT)
