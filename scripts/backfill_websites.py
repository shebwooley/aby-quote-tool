"""Fill in agency websites, and merge the two duplicates Eric confirmed.

    py scripts/backfill_websites.py --dry
    py scripts/backfill_websites.py --write

Eric, 2026-08-26: "when you expand, perhaps to the right of location, we could add the website when
known? That would be helpful."

TWO SOURCES, NEITHER OF THEM TYPED BY ANYBODY:
  ① the web prospecting list carries a Website column -- 572 distinct agencies have one
  ② a Tulsa firm IS its email domain: the whole reason that import keyed firms on the domain

⛔ NOTHING IS INVENTED. A firm with neither is left blank, because a guessed URL on a screen
somebody calls from is worse than an empty cell -- they will click it.

AND THE TWO MERGES ERIC CONFIRMED BY EYE:
  "Yes A Benefit Source is the agency (same as A Benefit Source DFW) and Mary Lou Hudman is the
   agent." -- so the PERSON'S NAME had been baked into the agency name by the source list.
  "Yes 316 Health Insurance is the same company, two divisions."
⚠️ Both are merged the register's own way: the people move FIRST, then the emptied row becomes an
alias. An alias is hidden from the call list, so anybody left on it would silently drop off the
list Eric works from.
"""
import argparse, collections, csv, io, os, re, subprocess, sys

WEB = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\Group_Contacts_All.csv"
WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def tidy(url):
    """A URL somebody can click. Keeps the host, drops the tracking tail."""
    u = (url or "").strip()
    if not u:
        return ""
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u
    u = re.sub(r"[?#].*$", "", u)
    return u.rstrip("/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    rows = list(csv.DictReader(io.open(WEB, encoding="utf-8-sig", errors="replace")))
    def v(r, k): return (r.get(k) or "").strip()

    # ① From the web list. Keyed on the AGENCY NAME as the import wrote it, including the
    # "<Firm> - <STATE>" suffix a multi-state name got, or nothing will match.
    states = collections.defaultdict(set)
    for r in rows:
        if v(r, "Agency"):
            states[v(r, "Agency")].add(v(r, "State").upper())
    multi = {k for k, s in states.items() if len(s) > 1}

    byname = {}
    for r in rows:
        ag, st, site = v(r, "Agency"), v(r, "State").upper(), tidy(v(r, "Website"))
        if not ag or not site:
            continue
        name = (ag + " - " + st) if ag in multi else ag
        byname.setdefault(name, site)

    print("agency names with a website from the web list : %d" % len(byname))

    stmts = []
    for name, site in byname.items():
        # ⛔ ONLY WHERE IT IS BLANK, so re-running can never flatten a URL somebody corrected.
        stmts.append("UPDATE agencies SET website = " + sql_str(site) +
                     " WHERE lower(trim(name)) = lower(trim(" + semis(name) + "))"
                     " AND COALESCE(website,'') = '';")

    # ② A Tulsa firm is its domain. Read back out of the note the import left, which names it --
    # the domain is not stored in a column of its own, and re-deriving it from the CSV here would
    # be a second copy of the mapping rather than a use of the first.
    stmts.append(
        "UPDATE agencies SET website = 'https://' || "
        "trim(substr(notes, instr(notes, 'domain ') + 7, "
        "  CASE WHEN instr(substr(notes, instr(notes, 'domain ') + 7), ' ') > 0 "
        "       THEN instr(substr(notes, instr(notes, 'domain ') + 7), ' ') - 1 "
        "       ELSE length(notes) END)) "
        "WHERE source = 'purchased_ok_doi' AND COALESCE(website,'') = '' "
        "  AND instr(COALESCE(notes,''), 'domain ') > 0;")
    # Same, for the rows whose note says DERIVED rather than carrying a plain "domain <x>".
    stmts.append(
        "UPDATE agencies SET website = 'https://' || "
        "trim(substr(needs_review, instr(needs_review, 'domain ') + 7, "
        "  CASE WHEN instr(substr(needs_review, instr(needs_review, 'domain ') + 7), ' ') > 0 "
        "       THEN instr(substr(needs_review, instr(needs_review, 'domain ') + 7), ' ') - 1 "
        "       ELSE length(needs_review) END)) "
        "WHERE COALESCE(website,'') = '' AND instr(COALESCE(needs_review,''), 'domain ') > 0;")

    # ── THE TWO MERGES ERIC CONFIRMED ────────────────────────────────────────────────────────
    # People move first; the emptied row becomes an alias pointing at the survivor.
    for loser, winner in [("A Benefit Source (Mary Lou Hudman)", "A Benefit Source DFW"),
                          ("316healthinsurance.com", "316 Health Insurance (Garraway Enterprises LLC dba 316 Health Insurance)")]:
        w_id = "(SELECT id FROM agencies WHERE lower(trim(name)) = lower(trim(" + semis(winner) + ")) LIMIT 1)"
        l_id = "(SELECT id FROM agencies WHERE lower(trim(name)) = lower(trim(" + semis(loser) + ")) LIMIT 1)"
        stmts.append("UPDATE people SET agency_id = " + w_id + " WHERE agency_id = " + l_id + ";")
        stmts.append("UPDATE broker_directory SET agency_id = " + w_id + ", agency = " + semis(winner) +
                     " WHERE agency_id = " + l_id + ";")
        stmts.append("UPDATE agencies SET relationship = 'alias', parent_id = " + w_id +
                     ", needs_review = NULL, notes = COALESCE(notes,'') || " +
                     semis(" | Confirmed by Eric 2026-08-26 as the same firm as " + winner + ".") +
                     " WHERE lower(trim(name)) = lower(trim(" + semis(loser) + "));")

    print("statements : %d" % len(stmts))
    if a.dry:
        for st in stmts[:4]:
            print("   " + st[:120])
        print("")
        print("DRY RUN. Nothing was written.")
        return

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    batch, n = [], 0
    for st in stmts:
        batch.append(st)
        if len(batch) >= 60:
            n += 1
            if not run(batch, root, here, "batch %d" % n):
                sys.exit(1)
            batch = []
    if batch:
        n += 1
        if not run(batch, root, here, "batch %d" % n):
            sys.exit(1)
    print("")
    print("done in %d batches" % n)


def run(batch, root, here, label):
    path = os.path.join(here, "_sites.sql")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(batch) + "\n")
    try:
        res = subprocess.run(
            [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--file", path, "-y"],
            cwd=root, capture_output=True, text=True, timeout=900)
        out = (res.stderr or "") + (res.stdout or "")
        ok = res.returncode == 0
        if not ok:
            print("  FAIL " + label)
            print(out[-1500:] if out.strip() else "(no output)")
        return ok
    finally:
        try: os.remove(path)
        except OSError: pass


if __name__ == "__main__":
    main()
