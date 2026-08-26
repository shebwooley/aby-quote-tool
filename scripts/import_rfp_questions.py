"""Seed the RFP answer library from the workbook Niels was sent.

    py scripts/import_rfp_questions.py --dry
    py scripts/import_rfp_questions.py --write

SOURCE: "ONE FOLDER\\BenefitLab Project\\ABY Integration\\ABY RFP Questions for Niels.xlsx"
        367 rows, one per folded question, 46 carrying ABY's 2025 College Station answer.

WHY THE QUESTIONS LIVE IN D1 AND NOT IN A FILE IN THIS REPO. The repo IS the asset directory --
wrangler serves it -- and this app has already published its own source once (F-365). A JSON file
of ABY's question bank would be one .assetsignore entry away from public, and the ANSWERS that
follow it would be commercially sensitive. The database is the right home for both.

IDEMPOTENT, AND THAT IS THE WHOLE DESIGN. Re-running never touches `answer`, `status`, `owner`,
`needs_doc`, `doc_note` or `review_by` -- everything a human types. It inserts questions that are
missing and refreshes only the three columns that come FROM the workbook (topic, also_asked,
asked_by, seed_answer). So the sheet can be corrected and re-imported after Niels has started
work, which is a thing that will happen: the "Also asked as" column has visible parse debris in it.

THE ID IS DERIVED FROM THE QUESTION TEXT, not from the row number. A row number changes the moment
anybody sorts or inserts in the sheet, and a shifted id would re-attach every answer to the wrong
question -- silently, and unrecoverably once somebody has typed into it.
"""
import argparse, hashlib, io, json, os, re, subprocess, sys, zipfile

XLSX = (r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BenefitLab Project"
        r"\ABY Integration\ABY RFP Questions for Niels.xlsx")

PRIORITY = {"1 - first": 1, "2 - next": 2, "3 - later": 3, "4 - one-off": 4}

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")


def cells():
    """xlsx -> list of dicts. Plain zip + XML so nothing has to be installed.

    SHARED STRINGS ARE THE TRAP: most text lives in a separate table and the cell holds an INDEX
    into it (t="s"). Read the cell value directly and you get a row of integers that look like data.
    """
    z = zipfile.ZipFile(XLSX)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        xml = z.read("xl/sharedStrings.xml").decode("utf8")
        for si in re.findall(r"<si>(.*?)</si>", xml, re.S):
            shared.append("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))

    def unesc(x):
        return (x.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
                 .replace("&#10;", "\n").replace("&apos;", "'").replace("&amp;", "&"))

    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf8")
    rows = []
    for rm in re.finditer(r'<row[^>]*r="(\d+)"[^>]*>(.*?)</row>', sheet, re.S):
        got = {}
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(.*?)</c>', rm.group(2), re.S):
            col, attrs, inner = cm.group(1), cm.group(2), cm.group(3)
            t = re.search(r't="([^"]+)"', attrs)
            t = t.group(1) if t else "n"
            v = re.search(r"<v>(.*?)</v>", inner, re.S)
            if t == "s" and v:
                val = shared[int(v.group(1))]
            elif t == "inlineStr":
                val = "".join(re.findall(r"<t[^>]*>(.*?)</t>", inner, re.S))
            else:
                val = v.group(1) if v else ""
            got[col] = unesc(val).strip()
        rows.append(got)

    head = rows[0]
    out = []
    for r in rows[1:]:
        rec = {head.get(c, c): r.get(c, "") for c in head}
        if rec.get("Question"):
            out.append(rec)
    return out


def qid(question):
    """Stable id from the question text. See the module docstring for why not the row number."""
    norm = re.sub(r"\s+", " ", question.strip().lower())
    return "q_" + hashlib.sha1(norm.encode("utf8")).hexdigest()[:16]


def sql_str(x):
    """SQLite literal.

    NO DOUBLE QUOTES, EVER. In SQLite a double-quoted string that does not resolve to a column is
    silently treated as a string literal -- which is how a column check went vacuous in this
    project once already. And the caller splits on semicolons, so every statement here is written
    to be one line with its semicolons only at the end.
    """
    return "'" + str(x).replace("'", "''") + "'"


def run_sql(statements, label):
    """One --file per batch. wrangler splits on semicolons, so nothing may contain a bare one
    inside a string -- the question text CAN, so it is escaped through char(59) below."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_rfp_import.sql")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(statements) + "\n")
    try:
        res = subprocess.run(
            [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--file", path, "-y"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True, text=True, timeout=900)
        ok = res.returncode == 0
        print(("  ok   " if ok else "  FAIL ") + label)
        if not ok:
            print((res.stderr or res.stdout)[-1500:])
        return ok
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def semis(text):
    """Rebuild a string literal so it carries no bare semicolon.

    `wrangler d1 execute --file` SPLITS ON SEMICOLONS and does not know about string literals, so
    a question containing one is cut in half -- and the surviving half is often still valid SQL
    with a different WHERE. TRAPS #300, and these questions are full of them.
    """
    parts = text.split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    rows = cells()
    seen, recs = set(), []
    for r in rows:
        q = r["Question"].strip()
        i = qid(q)
        # A DUPLICATE QUESTION IS REPORTED, NEVER SILENTLY COLLAPSED. Two rows folding to one id
        # would mean the sheet says the same thing twice, which is a fact about the sheet.
        if i in seen:
            print("  ! duplicate question, skipped: " + q[:80])
            continue
        seen.add(i)
        recs.append({
            "id": i,
            "priority": PRIORITY.get(r.get("Priority", "").strip(), 4),
            "topic": r.get("Topic", "").strip(),
            "question": q,
            "also": r.get("Also asked as", "").strip(),
            "asked_by": int(re.sub(r"\D", "", r.get("Asked by", "") or "1") or 1),
            "seed": r.get("ABY's 2025 answer (please check)", "").strip(),
        })

    by_pri = {}
    for r in recs:
        by_pri[r["priority"]] = by_pri.get(r["priority"], 0) + 1
    print("READ %d questions" % len(recs))
    print("  by priority :", dict(sorted(by_pri.items())))
    print("  with a 2025 answer :", sum(1 for r in recs if r["seed"]))

    if a.dry:
        print("\n--- first row as SQL ---")
        print(stmt(recs[0])[:400])
        print("\nDRY RUN. Nothing was written.")
        return

    batch, n = [], 0
    for r in recs:
        batch.append(stmt(r))
        if len(batch) >= 40:
            n += 1
            if not run_sql(batch, "batch %d (%d rows)" % (n, len(batch))):
                sys.exit(1)
            batch = []
    if batch:
        n += 1
        if not run_sql(batch, "batch %d (%d rows)" % (n, len(batch))):
            sys.exit(1)
    print("\nwrote %d questions in %d batches" % (len(recs), n))
    print("NOTE: nothing a human typed was touched -- answer, status, owner, needs_doc, doc_note.")


def stmt(r):
    """INSERT the question, or refresh ONLY the columns that come from the workbook.

    ⛔ THE UPDATE LIST IS THE SAFETY OF THIS WHOLE SCRIPT. `answer`, `status`, `owner`, `needs_doc`,
    `doc_note` and `review_by` are absent on purpose -- they are what a person typed, and a
    re-import must never be able to reach them.
    """
    return (
        "INSERT INTO rfp_answer (id, priority, topic, question, also_asked, asked_by, seed_answer) "
        "VALUES (" + sql_str(r["id"]) + ", " + str(r["priority"]) + ", " + semis(r["topic"]) + ", "
        + semis(r["question"]) + ", " + semis(r["also"]) + ", " + str(r["asked_by"]) + ", "
        + semis(r["seed"]) + ") "
        "ON CONFLICT(id) DO UPDATE SET priority=excluded.priority, topic=excluded.topic, "
        "also_asked=excluded.also_asked, asked_by=excluded.asked_by, seed_answer=excluded.seed_answer;"
    )


if __name__ == "__main__":
    main()
