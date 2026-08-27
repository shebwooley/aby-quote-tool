"""Repair the four duplicate firm names the Tulsa rename created.

    py scripts/fix_tulsa_collisions.py --dry
    py scripts/fix_tulsa_collisions.py --write

🔴 THIS IS A DEFECT I INTRODUCED AND IT IS WORTH NAMING PRECISELY.
The importer guarded against creating a duplicate: every INSERT carried
`WHERE NOT EXISTS (... WHERE lower(name) = ...)`. But it checked the name it was inserting --
"higginbotham.com (Tulsa import)" -- and the RENAME that ran afterwards changed that to
"Higginbotham", which already existed. So the guard was real, ran, passed, and protected nothing:
it tested the name at INSERT time and the collision was created at UPDATE time.

⭐⭐ THE LESSON, AND IT GENERALISES BEYOND THIS SCRIPT: A UNIQUENESS CHECK IS ONLY WORTH THE MOMENT
IT RUNS AT. Renaming is a second chance to collide and nothing was watching it.

TWO KINDS OF COLLISION, and they are not fixed the same way:

  ① TULSA vs AN EXISTING FIRM  -- Higginbotham (8 quotes), Risk Strategies (2 quotes).
     The Tulsa office is a real, separate office of a firm ABY already quotes. It becomes a
     DIVISION, exactly like HUB - Tulsa. ⛔ It is NOT merged into the parent: Eric, 2026-08-26 --
     "Just because we've done business with a different office doesn't mean any of them know who
     we are. Every single one of these out of state people and agencies are prospects." Merging
     would hand the Tulsa people a relationship they do not have.

  ② TULSA vs TULSA -- two domains that resolved to one name.
     shelterinsurance.com + agent.shelterinsurance.com, americanseniorbenefits.com + asb.insure.
     These really are one firm reached two ways, so the smaller becomes an ALIAS of the larger --
     the register's existing mechanism for a spelling variant, which keeps it off the call list
     without deleting anything.
"""
import argparse, io, os, subprocess, sys

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")

# ① Tulsa row -> the existing firm it is an office of. Renamed and parented, never merged.
DIVISIONS = {
    "93419383-6ed5-40a9-b313-befa5737c67e": ("Higginbotham - Tulsa", "6ee0efa4-4561-4471-aa52-f752099aa2ac"),
    "785c3cd1-8ab5-4d0e-912b-862ef253d25d": ("Risk Strategies - Tulsa", "044884f5-0e84-4add-95a8-968a06137fad"),
}

# ② the smaller Tulsa row -> the larger one it is a spelling variant of.
# ⭐ THE PEOPLE MOVE FIRST. An alias keeps its history but is hidden from the call list, so anybody
# left attached to it would silently drop off the list Eric works from.
ALIASES = {
    # American Senior Benefits: asb.insure (1 person) folds into americanseniorbenefits.com (3)
    "76a42ce1-c955-4e74-9ddb-2a929315c07f": "6e525d3d-0dcc-473c-a4c0-14ae0b5f5635",
}


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    stmts = []

    for child, (name, parent) in DIVISIONS.items():
        stmts.append(
            "UPDATE agencies SET name = " + sql_str(name) + ", parent_id = " + sql_str(parent) +
            ", relationship = 'division', needs_review = " +
            sql_str("Tulsa office of an agency ABY already quotes. A separate office: its people "
                    "have not done business with ABY and are prospects.") +
            " WHERE id = " + sql_str(child) + ";")
        stmts.append(
            "UPDATE broker_directory SET agency = " + sql_str(name) +
            " WHERE agency_id = " + sql_str(child) + ";")

    for small, big in ALIASES.items():
        # People first, then the alias marker -- in that order, or they vanish with it.
        stmts.append("UPDATE people SET agency_id = " + sql_str(big) +
                     " WHERE agency_id = " + sql_str(small) + ";")
        stmts.append("UPDATE broker_directory SET agency_id = " + sql_str(big) +
                     ", agency = (SELECT name FROM agencies WHERE id = " + sql_str(big) + ")" +
                     " WHERE agency_id = " + sql_str(small) + ";")
        stmts.append(
            "UPDATE agencies SET relationship = 'alias', parent_id = " + sql_str(big) +
            ", needs_review = " + sql_str("A second email domain for the same firm, folded in "
                                          "during the Tulsa import.") +
            " WHERE id = " + sql_str(small) + ";")

    # Shelter Insurance: both rows are from Tulsa, so pick the larger at run time rather than
    # hardcoding an id -- the two were created in an order nothing guarantees.
    stmts.append(
        "UPDATE people SET agency_id = (SELECT id FROM agencies WHERE lower(trim(name)) = 'shelter insurance' "
        "ORDER BY (SELECT COUNT(*) FROM people p2 WHERE p2.agency_id = agencies.id) DESC, id LIMIT 1) "
        "WHERE agency_id IN (SELECT id FROM agencies WHERE lower(trim(name)) = 'shelter insurance');")
    stmts.append(
        "UPDATE agencies SET relationship = 'alias', needs_review = " +
        sql_str("A second email domain for the same firm, folded in during the Tulsa import.") +
        ", parent_id = (SELECT id FROM agencies WHERE lower(trim(name)) = 'shelter insurance' "
        "ORDER BY (SELECT COUNT(*) FROM people p2 WHERE p2.agency_id = agencies.id) DESC, id LIMIT 1) "
        "WHERE lower(trim(name)) = 'shelter insurance' AND id <> "
        "(SELECT id FROM agencies WHERE lower(trim(name)) = 'shelter insurance' "
        "ORDER BY (SELECT COUNT(*) FROM people p2 WHERE p2.agency_id = agencies.id) DESC, id LIMIT 1);")

    print("statements: %d" % len(stmts))
    for s in stmts:
        print("   " + s[:110])

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    path = os.path.join(here, "_fix.sql")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(stmts) + "\n")
    print("")
    print("SQL written to " + path)

    if a.dry:
        print("DRY RUN. The file is there to read; nothing was executed.")
        return

    try:
        res = subprocess.run(
            [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--file", path, "-y"],
            cwd=root, capture_output=True, text=True, timeout=900)
        out = (res.stderr or "") + (res.stdout or "")
        if res.returncode != 0:
            # ⚠️ PRINT WHATEVER THERE IS. An earlier version indexed into `res.stderr` directly and
            # died with "NoneType is not subscriptable" -- so a failing migration reported a Python
            # error instead of the database's, which is the least useful possible outcome.
            print(out[-2000:] if out.strip() else "(the command produced no output at all)")
            sys.exit(1)
        print("applied")
    finally:
        try: os.remove(path)
        except OSError: pass


if __name__ == "__main__":
    main()
