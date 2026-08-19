# Import the ABY quote-log spreadsheet (2024-2026) into the live D1 `quotes` table.
#
# ⭐ WHY THIS EXISTS: the history already in the tool covers TWO reps -- Eric (14) and Niels (307).
# The workbook covers NINE in 2026 alone and more in the earlier years, so "Quotes by agent" has
# been reporting on a fraction of the book with no sign that it was partial.
#
# 🔴 SAFETY: DRY RUN BY DEFAULT. Nothing is written without --execute, and even then the SQL is
# generated to a file first so it can be read before it runs.
#
#   py scripts/import_quote_log.py                 -> dry run + preview files
#   py scripts/import_quote_log.py --execute       -> also runs the generated SQL against --remote
#
# ⚠️ IDEMPOTENT: every run re-reads what is already live and imports only the excess, so running it
# twice does not double the book.

import argparse, datetime, io, json, os, re, subprocess, sys, unicodedata, uuid
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

XLSX = r"C:\Users\eric\OneDrive\Desktop\More ABY\ABY Quote Log 2024-2026.xlsx"
REPO = r"C:\Users\eric\dev\aby-quote-tool"
OUT = os.path.join(REPO, "scripts", "_import_out")

# ── Product vocabulary ────────────────────────────────────────────────────────────────────────
# ⭐ THE LEFT SIDE IS THE SHEET'S OWN WORDING; the right side is the id+name ALREADY IN THE TABLE,
# so imported rows group with the ones already there instead of forming a parallel vocabulary.
# ⛔ Anything not in here is NOT silently dropped -- it is reported and given its own slug, keeping
# the sheet's exact words, because inventing a mapping is how a product quietly becomes another one.
KNOWN = {
    "COBRA":                   ("product-cobra", "COBRA Administration"),
    "FSA":                     ("product-fsa",   "Section 125 Cafeteria Plan with FSA / DCAP / LFSA"),
    "DCAP":                    ("product-fsa",   "Section 125 Cafeteria Plan with FSA / DCAP / LFSA"),
    "LFSA":                    ("product-fsa",   "Section 125 Cafeteria Plan with FSA / DCAP / LFSA"),
    "ERISA Wrap":              ("product-erisa", "ERISA Wrap Document"),
    "HSA":                     ("product-hsa",   "Health Savings Account (HSA) Administration"),
    "HRA":                     ("product-hra",   "Health Reimbursement Arrangement (HRA)"),
    "POP / Section 125":       ("product-pop",   "Section 125 Premium Only Plan (POP)"),
    "ACA 1094/1095 Reporting": ("product-aca",   "ACA 1094/1095 Reporting"),
    "TX State Continuation":   ("product-stateContinuation", "Texas State Continuation"),
    "State Continuation":      ("product-stateContinuation", "Texas State Continuation"),
    "QTB":                     ("product-section132", "Qualified Transportation Benefit (QTB)"),
    "Medicare HRA":            ("product-mpra",  "Medicare Premium Reimbursement Arrangement"),
}
# Labels with no counterpart in the existing vocabulary. They keep the sheet's own words.
# ⏳ ERIC: "LSB" in particular is an abbreviation this script does not recognise.
NEW_SLUGS = {
    "ICHRA":     ("product-ichra",     "ICHRA"),
    "QSEHRA":    ("product-qsehra",    "QSEHRA"),
    "NDT":       ("product-ndt",       "Non-discrimination testing (NDT)"),
    "Form 5500": ("product-form5500",  "Form 5500"),
    "HIPAA":     ("product-hipaa",     "HIPAA"),
    "LSB":       ("product-lsb",       "LSB"),
}

# The earlier import wrote this label for a proposal that sat loose in no agency folder. The sheet
# now says "(no agency folder)". Same thing -- normalised so "Quotes by agency" does not grow two
# rows meaning one thing.
AGENCY_ALIASES = {"(no agency folder)": "(loose file – no agency folder)"}


def norm(s):
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).replace("\u2019", "'").replace("\u2018", "'")
    return " ".join(s.lower().split()).strip().rstrip(".,")


def effective(eff, est):
    """Real date if the sheet has one, otherwise the estimated-month PHRASE, matching what is
    already stored. `effective_date` in this table is a human string, not a date column."""
    if eff:
        s = str(eff).strip()
        m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
        if m:
            return "%s-%02d-%02d" % (m.group(3), int(m.group(1)), int(m.group(2)))
        m = re.match(r"^(\d{1,2})\.(\d{4})$", s)          # month + year only
        if m:
            return "%s-%02d" % (m.group(2), int(m.group(1)))
        return s
    return str(est).strip() if est else ""


def products_json(cell, unknown_counter):
    seen, out = set(), []
    for tok in str(cell or "").split(","):
        t = tok.strip()
        if not t:
            continue
        if t in KNOWN:
            pid, name = KNOWN[t]
        elif t in NEW_SLUGS:
            pid, name = NEW_SLUGS[t]
            unknown_counter[t] += 1
        else:
            pid, name = "product-" + re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-"), t
            unknown_counter["UNRECOGNISED: " + t] += 1
        if pid in seen:            # FSA + DCAP + LFSA collapse to one entry, as they already do
            continue
        seen.add(pid)
        out.append({"id": pid, "name": name, "inputs": {}})
    return json.dumps(out, ensure_ascii=False)


def d1(sql, remote=True):
    cmd = ["npx", "wrangler", "d1", "execute", "aby-quotes", "--command", sql, "--json"]
    if remote:
        cmd.insert(-1, "--remote")
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding="utf-8", shell=True)
    if r.returncode != 0:
        raise SystemExit("wrangler failed:\n" + (r.stderr or r.stdout)[-1500:])
    txt = r.stdout[r.stdout.index("["):]
    return json.loads(txt)[0]["results"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true", help="actually run the generated SQL")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    import openpyxl

    print("Reading what is already live ...")
    live = d1("SELECT client_name, substr(created_at,1,10) d, quote_number FROM quotes")
    live_keys = Counter((norm(r["client_name"]), r["d"] or "") for r in live)
    used_numbers = set(r["quote_number"] for r in live if r["quote_number"])
    seq = max([int(m.group(1)) for r in live for m in [re.search(r"-M(\d+)-", r["quote_number"] or "")] if m] + [0])
    print("  live rows: %d   distinct (employer,date) keys: %d   next M sequence: %d"
          % (len(live), len(live_keys), seq + 1))

    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    unknown = Counter()
    rows_out, per_year, skipped = [], Counter(), Counter()
    taken = Counter()            # how many of each key we have already accounted for

    for year in ("2024", "2025", "2026"):
        for r in wb["All Quotes " + year].iter_rows(min_row=2, values_only=True):
            if not r or not r[3]:
                continue
            rep, agency, agent, employer = r[0], r[1], r[2], r[3]
            prods, eff, est, dq = r[4], r[5], r[6], r[7]
            commission, srcfile, note = r[9], r[11], r[12]
            if not isinstance(dq, datetime.datetime):
                skipped["no usable Date Quoted"] += 1
                continue
            # 🔴🔴 DEDUPE ON PRESENCE, NOT ON COUNT, AND THE REASON MATTERS.
            # The earlier import MERGED every proposal for one employer on one day into a SINGLE
            # row carrying the combined product list. This workbook keeps them SEPARATE, one row
            # per proposal file. So for the same real quote the sheet can hold two rows where the
            # table holds one -- Britton & Associates on 2026-01-13 is "COBRA" and "ERISA Wrap" in
            # the sheet and one combined row in the table.
            # ⛔ A COUNT-BASED RULE READS THAT DIFFERENCE AS 40 MISSING QUOTES AND DUPLICATES 37
            # EMPLOYERS. Presence is the safe test: if this employer already has a quote on this
            # date, leave it alone. The cost is that a genuinely separate same-day proposal is not
            # added; that is much cheaper than double-counting a quote that is already there.
            key = (norm(employer), dq.strftime("%Y-%m-%d"))
            taken[key] += 1
            if live_keys.get(key, 0) > 0:
                skipped["already live (employer already has a quote that day)"] += 1
                continue

            seq += 1
            comm_txt = str(commission or "").strip()
            comm = 0 if comm_txt.lower().startswith("no commission") else 1
            qn = "TX%s-M%03d-%s" % (dq.strftime("%y%m%d"), seq, "C" if comm else "NC")
            while qn in used_numbers:
                seq += 1
                qn = "TX%s-M%03d-%s" % (dq.strftime("%y%m%d"), seq, "C" if comm else "NC")
            used_numbers.add(qn)

            # ⚠️ `commission_included` IS NOT NULL AND HAS ONLY TWO STATES, but the sheet has three:
            # "Quoted both ways" is 305 rows. It is stored as commissioned (the standard) and the
            # sheet's exact word is kept in `notes`, so the real answer is recoverable.
            notes = []
            if comm_txt and comm_txt.lower() not in ("commission", "no commission"):
                notes.append("Commission: " + comm_txt)
            if srcfile:
                notes.append("Source: " + str(srcfile).strip()[:300])
            if note:
                notes.append(str(note).strip()[:300])

            ag = str(agency or "").strip()
            rows_out.append({
                "id": str(uuid.uuid4()),
                "quote_number": qn,
                "created_at": dq.strftime("%Y-%m-%dT00:00:00.000Z"),
                "client_name": str(employer).strip(),
                "effective_date": effective(eff, est),
                "broker_name": str(agent or "").strip(),
                "broker_agency": AGENCY_ALIASES.get(ag, ag),
                "broker_phone": "", "broker_email": "", "rep_phone": "", "rep_email": "",
                "rep_name": str(rep or "").strip(),
                "commission_included": comm,
                "products": products_json(prods, unknown),
                "status": "P", "ran_by": "ABY", "state": "TX",
                "source_tag": "import-" + year,
                "notes": " | ".join(notes) if notes else None,
                "_year": year,
            })
            per_year[year] += 1

    print("\n=== WHAT THIS WOULD IMPORT ===")
    for y in ("2024", "2025", "2026"):
        print("  import-%s : %4d rows" % (y, per_year[y]))
    print("  TOTAL      : %4d rows   (live now %d -> %d)" % (len(rows_out), len(live), len(live) + len(rows_out)))
    print("\n  skipped: %s" % dict(skipped))
    if unknown:
        print("\n  ⚠️ PRODUCT LABELS WITH NO EXISTING COUNTERPART (kept verbatim, own slug):")
        for k, n in unknown.most_common():
            print("       %-34s %d" % (k, n))

    reps = Counter(r["rep_name"] or "(blank)" for r in rows_out)
    print("\n  by rep: %s" % dict(reps))

    prev = os.path.join(OUT, "preview.json")
    io.open(prev, "w", encoding="utf-8").write(json.dumps(rows_out[:40], indent=1, ensure_ascii=False))
    print("\n  first 40 rows written to %s" % prev)

    cols = ["id", "quote_number", "created_at", "client_name", "effective_date", "broker_name",
            "broker_agency", "broker_phone", "broker_email", "rep_name", "rep_phone", "rep_email",
            "commission_included", "products", "status", "ran_by", "state", "source_tag", "notes"]

    def lit(v):
        if v is None:
            return "NULL"
        if isinstance(v, int):
            return str(v)
        return "'" + str(v).replace("'", "''") + "'"

    sqlpath = os.path.join(OUT, "import.sql")
    with io.open(sqlpath, "w", encoding="utf-8") as f:
        for i in range(0, len(rows_out), 100):
            chunk = rows_out[i:i + 100]
            f.write("INSERT INTO quotes (" + ", ".join(cols) + ") VALUES\n")
            f.write(",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in chunk))
            f.write(";\n")
    print("  SQL written to %s (%d bytes)" % (sqlpath, os.path.getsize(sqlpath)))

    if not args.execute:
        print("\nDRY RUN. Nothing was written. Re-run with --execute to apply.")
        return

    print("\nExecuting against the REMOTE database ...")
    cmd = ["npx", "wrangler", "d1", "execute", "aby-quotes", "--remote", "--file", sqlpath, "-y"]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding="utf-8", shell=True)
    print((r.stdout or "")[-2000:])
    if r.returncode != 0:
        raise SystemExit("FAILED:\n" + (r.stderr or "")[-2000:])
    after = d1("SELECT COUNT(*) n FROM quotes")[0]["n"]
    print("\nDone. quotes table now holds %s rows." % after)


if __name__ == "__main__":
    main()
