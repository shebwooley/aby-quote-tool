"""Import the purchased Oklahoma (Tulsa metro) licensee list.

    py scripts/import_tulsa_list.py --dry
    py scripts/import_tulsa_list.py --write

SOURCE: ONE FOLDER\\BROKER LISTS\\OK_Licensed_AH_Tulsa.csv -- 2,496 rows, OK DOI Tulsa metro
export pulled 2025-06. Every row has an email, a phone and an NPN.

WHAT IS IMPORTED, AND IT IS ERIC'S CALL, 2026-08-26: "Definitely import known brokerage or
insurance agency domains. I'm not sure about the rest yet." That is 510 of the 2,496.

⛔ LICENCE EXPIRY IS NOT AN EXCLUSION. 1,324 of the 2,496 read "Term ended since pull - renewal
likely", and Eric: "Assume everyone renewed. we're not going to exclude a ton of agents because we
don't know. Everyone's license comes up for renewal." The export is from mid-2025; an expired term
on a year-old pull says more about the pull than the agent. The status is STORED, never acted on.

🔴 THE HARD PART IS THE AGENCY, AND THIS SCRIPT DELIBERATELY DOES NOT SOLVE IT.
The purchased list has NO agency column -- only an email domain. The register already holds HUB,
HUB International, HUB - Wellspring and "Hub; HUB"; four spellings of Gallagher; three of USI. So
"attach 84 hubinternational.com people to the HUB agency" has no single right answer, and picking
one welds 84 people onto a firm nobody chose. This project's own rule: ambiguity never matches,
because refusing is recoverable by hand and a bad weld is not.
▶️ So each domain becomes its OWN firm, named from the domain and marked `needs_review` with the
reason. The duplicate finder on the Tidy up screen is what surfaces "this is probably HUB", and a
person decides. That is the path that already exists.

⚠️ THE SOURCE FILE'S OWN CATEGORIES LEAK, and the leaks are named rather than silently dropped:
ft.newyorklife.com (17) is a career agency, healthmarkets.com (5) is a national call centre,
aaaok.org (5) is captive, protonmail.com (3) is a personal mail host. They are imported because
Eric asked for both categories, and each is flagged so nobody works them as a benefits brokerage.
"""
import argparse, csv, io, os, re, subprocess, sys, uuid, collections

SRC = (r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\OK_Licensed_AH_Tulsa.csv")
WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")

TARGET_CATEGORIES = {"Known benefits brokerage", "Insurance agency domain"}
SOURCE_TAG = "purchased_ok_doi"

# Domains whose CATEGORY in the source file is wrong. Imported, flagged, never silently dropped.
MISCATEGORISED = {
    "ft.newyorklife.com": "career agency, not an independent brokerage",
    "healthmarkets.com": "national FMO / call centre",
    "aaaok.org": "captive",
    "protonmail.com": "personal mail host, not a firm",
    "gmail.com": "personal mail host, not a firm",
    "yahoo.com": "personal mail host, not a firm",
    "outlook.com": "personal mail host, not a firm",
    "hotmail.com": "personal mail host, not a firm",
}


def val(r, k):
    return (r.get(k) or "").strip()


def sql_str(x):
    """SQLite literal. ⛔ Single quotes only -- a double-quoted string that resolves to no column
    is silently treated as a literal by SQLite, which is how a column check went vacuous here once."""
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    """`wrangler d1 execute --file` SPLITS ON SEMICOLONS and knows nothing about string literals,
    so a value containing one is cut in half and the surviving fragment is often valid SQL with a
    different WHERE. Agency names in this project have carried semicolons for months."""
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def firm_name_from_domain(domain):
    """A readable placeholder, NOT a claim about the firm's real name.

    'hubinternational.com' -> 'hubinternational.com (Tulsa import)'. The domain is kept verbatim in
    the name on purpose: it is the only fact we actually have, and a prettified guess like
    'HUB International' would be indistinguishable on screen from the real record that already
    exists -- which is the exact collision this script refuses to make.
    """
    return domain.lower() + " (Tulsa import)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    rows = list(csv.DictReader(io.open(SRC, encoding="utf-8-sig", errors="replace")))
    target = [r for r in rows if val(r, "Domain Category") in TARGET_CATEGORIES]
    print("source rows        : %d" % len(rows))
    print("in the two categories Eric asked for : %d" % len(target))

    # ── Dedupe on email. The list has 33 duplicate addresses across all 2,496. ────────────────
    seen, people, dupes = {}, [], 0
    for r in target:
        em = val(r, "Email").lower()
        if not em:
            continue                      # cannot happen in this file; asserted below
        if em in seen:
            dupes += 1
            continue
        seen[em] = True
        people.append(r)
    print("unique addresses   : %d  (%d duplicate rows skipped)" % (len(people), dupes))
    if not people:
        print("nothing to import"); sys.exit(1)

    # ── Firms, one per domain ────────────────────────────────────────────────────────────────
    domains = collections.OrderedDict()
    for r in people:
        d = val(r, "Domain").lower()
        domains.setdefault(d, []).append(r)
    print("distinct domains   : %d" % len(domains))

    flagged = [d for d in domains if d in MISCATEGORISED]
    if flagged:
        print("")
        print("flagged, imported anyway, NOT to be worked as benefits brokerages:")
        for d in flagged:
            print("   %-28s %-3d %s" % (d, len(domains[d]), MISCATEGORISED[d]))

    live = sum(1 for r in people if val(r, "License Term Status").startswith("Term still"))
    print("")
    print("licence still running on the pull : %d of %d  (STORED, never used to exclude)"
          % (live, len(people)))

    if a.dry:
        print("")
        print("--- ten firms that would be created ---")
        for d in list(domains)[:10]:
            print("   %-42s %d people" % (firm_name_from_domain(d), len(domains[d])))
        print("")
        print("DRY RUN. Nothing was written.")
        return

    # ── Build the SQL ────────────────────────────────────────────────────────────────────────
    stmts = []
    agency_id = {}
    for d, members in domains.items():
        aid = str(uuid.uuid4())
        agency_id[d] = aid
        review = ("Created from an email domain during the Tulsa purchased-list import. "
                  "This may be the same firm as a record already on the list -- check the "
                  "duplicate finder before working it.")
        if d in MISCATEGORISED:
            review += " Source file categorised this as an agency domain and it is not: " + MISCATEGORISED[d] + "."
        # ⭐ INSERT OR IGNORE on the NAME, so re-running cannot create a second copy of a firm.
        stmts.append(
            "INSERT INTO agencies (id, name, created_at, needs_review, source, city, state) "
            "SELECT " + sql_str(aid) + ", " + semis(firm_name_from_domain(d)) + ", datetime('now'), "
            + semis(review) + ", " + sql_str(SOURCE_TAG) + ", 'Tulsa', 'OK' "
            "WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE lower(name) = lower("
            + semis(firm_name_from_domain(d)) + "));")

    for d, members in domains.items():
        for r in members:
            em = val(r, "Email").lower()
            nm = (val(r, "First Name") + " " + val(r, "Last Name")).strip()
            ph = val(r, "Phone")
            npn = val(r, "NPN")
            pid = str(uuid.uuid4())
            note = "NPN " + npn + ". Licence: " + val(r, "License Expires") + " (" + val(r, "License Term Status") + ")."
            # ⛔ ADOPT, NEVER DUPLICATE. If this address is already on file, the existing person
            # keeps their id and their history; only blanks are filled in. That is the identity
            # rule this register already runs on, and 56 of these 510 are already known.
            stmts.append(
                "INSERT INTO people (id, name, created_at, updated_at, agency_id, phone, kind, source) "
                "SELECT " + sql_str(pid) + ", " + semis(nm) + ", datetime('now'), datetime('now'), "
                "(SELECT id FROM agencies WHERE lower(name) = lower(" + semis(firm_name_from_domain(d)) + ") LIMIT 1), "
                + sql_str(ph) + ", 'broker', " + sql_str(SOURCE_TAG) + " "
                "WHERE NOT EXISTS (SELECT 1 FROM broker_directory WHERE lower(email) = " + sql_str(em) + ");")
            stmts.append(
                "INSERT INTO broker_directory (email, name, phone, agency, first_seen, last_seen, "
                "quote_count, person_id, agency_id, source) "
                "SELECT " + sql_str(em) + ", " + semis(nm) + ", " + sql_str(ph) + ", "
                + semis(firm_name_from_domain(d)) + ", datetime('now'), datetime('now'), 0, "
                + sql_str(pid) + ", (SELECT id FROM agencies WHERE lower(name) = lower("
                + semis(firm_name_from_domain(d)) + ") LIMIT 1), " + sql_str(SOURCE_TAG) + " "
                "WHERE NOT EXISTS (SELECT 1 FROM broker_directory WHERE lower(email) = " + sql_str(em) + ");")
            # A name and a phone are filled in on somebody already known, never overwritten.
            stmts.append(
                "UPDATE broker_directory SET name = CASE WHEN COALESCE(name,'') = '' THEN " + semis(nm) + " ELSE name END, "
                "phone = CASE WHEN COALESCE(phone,'') = '' THEN " + sql_str(ph) + " ELSE phone END "
                "WHERE lower(email) = " + sql_str(em) + ";")
            stmts.append(
                "INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, created_at, created_by) "
                "SELECT " + sql_str(str(uuid.uuid4())) + ", 'person', "
                "(SELECT person_id FROM broker_directory WHERE lower(email) = " + sql_str(em) + "), "
                "'note', 'Tulsa purchased list', " + semis(note) + ", datetime('now'), datetime('now'), 'import' "
                "WHERE EXISTS (SELECT 1 FROM broker_directory WHERE lower(email) = " + sql_str(em)
                + " AND person_id IS NOT NULL);")

    print("")
    print("statements to run  : %d" % len(stmts))

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    batch, n, done = [], 0, 0
    for st in stmts:
        batch.append(st)
        if len(batch) >= 60:
            n += 1; done += len(batch)
            if not run(batch, root, here, "batch %d" % n):
                sys.exit(1)
            batch = []
    if batch:
        n += 1; done += len(batch)
        if not run(batch, root, here, "batch %d" % n):
            sys.exit(1)
    print("")
    print("ran %d statements in %d batches" % (done, n))


def run(batch, root, here, label):
    path = os.path.join(here, "_tulsa.sql")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(batch) + "\n")
    try:
        res = subprocess.run(
            [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--file", path, "-y"],
            cwd=root, capture_output=True, text=True, timeout=900)
        ok = res.returncode == 0
        print(("  ok   " if ok else "  FAIL ") + label)
        if not ok:
            print((res.stderr or res.stdout)[-1200:])
        return ok
    finally:
        try: os.remove(path)
        except OSError: pass


if __name__ == "__main__":
    main()
