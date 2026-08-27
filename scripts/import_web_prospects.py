"""Import the web-sourced group-health prospects.

    py scripts/import_web_prospects.py --dry
    py scripts/import_web_prospects.py --write

SOURCE: BROKER LISTS\\Group_Contacts_All.csv -- 1,819 rows, the Group? = Y rows of the 12-state web
prospecting list with carriers, captives, FMOs and employers already removed.

⭐⭐ EVERY ROW IS A PROSPECT, WHATEVER THE PARENT FIRM HAS DONE. Eric, 2026-08-26:
"Just because we've done business with a different office doesn't mean any of them know who we are.
Every single one of these out of state people and agencies are prospects."
So an office of a firm ABY already quotes becomes a DIVISION carrying its own (zero) history --
never a merge into the existing relationship, which would hand these people a warmth they have not
earned and would hide them from the never-quoted filter that is the whole point of importing them.

THREE KINDS OF ROW, AND THE THIRD IS THE ONE THAT MATTERS:
  ① 1,140 carry an agency name          -> a firm, named from the list
  ② 95 have no agency but their OWN domain -> a firm derived from the domain, flagged
  ③ 578 have no agency and a FREE MAIL HOST -> NO FIRM AT ALL
🔴 ③ IS WHY THIS SCRIPT IS NOT A COPY OF THE TULSA ONE. 425 of them are on gmail.com. Deriving a
firm from the domain there would create a company called "Gmail" holding 425 people, and every
count, filter and rollup downstream would treat it as the biggest agency ABY knows. They are solo
agents on a personal address -- the source file calls them exactly that -- and a person with no
firm is a fact this register can hold.

⚠️ A NAME THAT EXISTS IN TWO STATES IS TWO OFFICES. HUB International appears in six states here.
Each becomes "HUB International - AZ" and so on, because merging them would invent a single
national row that nobody can call.
"""
import argparse, collections, csv, io, os, re, subprocess, sys, uuid

SRC = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\Group_Contacts_All.csv"
WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")

SOURCE_TAG = "web_research"

FREE_MAIL = {
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "msn.com",
    "comcast.net", "protonmail.com", "me.com", "live.com", "sbcglobal.net", "att.net", "cox.net",
    "bellsouth.net", "verizon.net", "mac.com", "ymail.com", "mail.com", "gmx.com", "earthlink.net",
}


def v(r, k):
    return (r.get(k) or "").strip()


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    """`wrangler d1 execute --file` splits on semicolons and knows nothing about string literals."""
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def domain_of(email):
    e = (email or "").strip().lower()
    return e.split("@")[1] if "@" in e else ""


def pretty_domain(d):
    stem = d.lower().split(".")[0]
    stem = re.sub(r"[^a-z0-9]", " ", stem).strip()
    return (stem[:1].upper() + stem[1:]) if stem else d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    rows = list(csv.DictReader(io.open(SRC, encoding="utf-8-sig", errors="replace")))
    print("source rows : %d" % len(rows))

    # ── Dedupe on email. A row with no email is kept: the file's rule is that a blank means
    # nothing was PUBLISHED, and those people carry a name, a firm and usually a phone.
    seen, people, dup = set(), [], 0
    for r in rows:
        em = v(r, "Email").lower()
        if em:
            if em in seen:
                dup += 1
                continue
            seen.add(em)
        people.append(r)
    print("after de-duplicating addresses : %d  (%d dropped)" % (len(people), dup))

    # ── Which agency names appear in more than one state, and therefore need a state suffix ──
    states = collections.defaultdict(set)
    for r in people:
        if v(r, "Agency"):
            states[v(r, "Agency")].add(v(r, "State").upper())
    multi = {k for k, s in states.items() if len(s) > 1}

    firms, assign, no_firm = {}, {}, 0
    for i, r in enumerate(people):
        ag, st = v(r, "Agency"), v(r, "State").upper()
        dom = domain_of(v(r, "Email"))
        if ag:
            # ⚠️ THE SUFFIX IS ADDED FOR EVERY MULTI-STATE NAME, not only where it collides today.
            # A name that is unique now and gains a second state next month would otherwise need
            # renaming, and renaming is exactly what created four duplicates on the Tulsa import.
            name = (ag + " - " + st) if ag in multi else ag
            note = "From the web prospecting list (" + v(r, "Source") + ")."
            key = (name, st)
        elif dom and dom not in FREE_MAIL:
            name = pretty_domain(dom)
            note = ("Name DERIVED from the email domain " + dom + " -- the list carried no agency "
                    "name. Check it, then check the duplicate finder.")
            key = (name, st)
        else:
            # ③ No firm. See the header: a firm called "Gmail" would be the biggest agency ABY knows.
            assign[i] = None
            no_firm += 1
            continue
        firms.setdefault(key, {"name": name, "state": st, "note": note,
                               "city": collections.Counter(), "n": 0, "id": str(uuid.uuid4())})
        firms[key]["n"] += 1
        if v(r, "City"):
            firms[key]["city"][v(r, "City")] += 1
        assign[i] = key

    print("firms to create/reuse : %d" % len(firms))
    print("people with no firm (personal address, no agency named) : %d" % no_firm)
    print("agency names spanning >1 state, so suffixed : %d" % len(multi))

    if a.dry:
        print("")
        print("--- the multi-state names ---")
        for k in sorted(multi)[:12]:
            print("   %-42s %s" % (k[:42], ",".join(sorted(states[k]))))
        print("")
        print("--- ten firms ---")
        for k in list(firms)[:10]:
            f = firms[k]
            print("   %-46s %-4s %d people" % (f["name"][:46], f["state"], f["n"]))
        print("")
        print("DRY RUN. Nothing was written.")
        return

    stmts = []
    for key, f in firms.items():
        city = f["city"].most_common(1)
        city = city[0][0] if city else ""
        # ⛔ MATCHED ON THE FULL NAME, and only reused if a row with that EXACT name already exists.
        # Anything else gets a new row. The Tulsa import proved that a rename after an existence
        # check is a second chance to collide, so this script never renames anything.
        stmts.append(
            "INSERT INTO agencies (id, name, created_at, needs_review, source, city, state) "
            "SELECT " + sql_str(f["id"]) + ", " + semis(f["name"]) + ", datetime('now'), "
            + semis(f["note"]) + ", " + sql_str(SOURCE_TAG) + ", " + sql_str(city) + ", "
            + sql_str(f["state"]) + " WHERE NOT EXISTS "
            "(SELECT 1 FROM agencies WHERE lower(trim(name)) = lower(trim(" + semis(f["name"]) + ")));")

    for i, r in enumerate(people):
        key = assign.get(i)
        em = v(r, "Email").lower()
        nm = v(r, "Agent Name")
        ph = v(r, "Phone")
        pid = str(uuid.uuid4())
        bits = [v(r, "Title"), v(r, "Specialty"), v(r, "Source"), v(r, "Source URL")]
        note = " | ".join(b for b in bits if b)
        agsel = ("(SELECT id FROM agencies WHERE lower(trim(name)) = lower(trim("
                 + semis(firms[key]["name"]) + ")) LIMIT 1)") if key else "NULL"

        if em:
            # Identity is the address. ADOPT anybody already on file rather than making a twin.
            guard = ("WHERE NOT EXISTS (SELECT 1 FROM broker_directory WHERE lower(email) = "
                     + sql_str(em) + ")")
            stmts.append(
                "INSERT INTO people (id, name, created_at, updated_at, agency_id, phone, kind, source) "
                "SELECT " + sql_str(pid) + ", " + semis(nm) + ", datetime('now'), datetime('now'), "
                + agsel + ", " + sql_str(ph) + ", 'broker', " + sql_str(SOURCE_TAG) + " " + guard + ";")
            stmts.append(
                "INSERT INTO broker_directory (email, name, phone, agency, first_seen, last_seen, "
                "quote_count, person_id, agency_id, source) SELECT " + sql_str(em) + ", " + semis(nm)
                + ", " + sql_str(ph) + ", " + (semis(firms[key]["name"]) if key else "''")
                + ", datetime('now'), datetime('now'), 0, " + sql_str(pid) + ", " + agsel + ", "
                + sql_str(SOURCE_TAG) + " " + guard + ";")
        else:
            # ⚠️ NO ADDRESS. Identity falls back to name + firm, and ONLY when that pair is not
            # already present -- the register's own rule, and the reason 6 rows with neither a
            # name nor a firm are skipped rather than guessed at.
            if not nm or not key:
                continue
            stmts.append(
                "INSERT INTO people (id, name, created_at, updated_at, agency_id, phone, kind, source) "
                "SELECT " + sql_str(pid) + ", " + semis(nm) + ", datetime('now'), datetime('now'), "
                + agsel + ", " + sql_str(ph) + ", 'broker', " + sql_str(SOURCE_TAG) +
                " WHERE NOT EXISTS (SELECT 1 FROM people WHERE lower(trim(name)) = lower(trim("
                + semis(nm) + ")) AND agency_id = " + agsel + ");")

        if note:
            who = ("(SELECT person_id FROM broker_directory WHERE lower(email) = " + sql_str(em) + ")"
                   if em else "(SELECT id FROM people WHERE lower(trim(name)) = lower(trim("
                   + semis(nm) + ")) AND agency_id = " + agsel + " LIMIT 1)")
            stmts.append(
                "INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, created_at, created_by) "
                "SELECT " + sql_str(str(uuid.uuid4())) + ", 'person', " + who + ", 'note', "
                "'Web prospecting list', " + semis(note) + ", datetime('now'), datetime('now'), 'import' "
                "WHERE " + who + " IS NOT NULL;")

    print("statements : %d" % len(stmts))
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
    path = os.path.join(here, "_web.sql")
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
