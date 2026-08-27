"""Take the "MN - " prefix off the nine Minnesota agencies and put it in the state column.

    py scripts/fix_mn_agencies.py --dry
    py scripts/fix_mn_agencies.py --write

Eric, 2026-08-26: "There are about 9 or 10 agencies that start with MN. Can you please make the
state on them MN and drop MN from the front of the name?"

🔴 THE QUOTES HAVE TO MOVE WITH THE NAME. Every screen joins a quote to an agency BY NAME, so
renaming "MN - NFP" to something else while its two quotes still say "MN - NFP" drops them out of
every count -- which is F-394, where 588 quotes went quiet and 343 of them did so the afternoon the
Patriot divisions were created without renaming the quotes onto them.

⚠️ AND THREE OF THE NINE COLLIDE WITH A FIRM THAT ALREADY EXISTS:
  Benefits Advisory Group (2 quotes), NFP (7), Digital (0).
⛔ THEY ARE NOT MERGED INTO IT. Both rows are real ABY history and merging two firms is a decision
with no undo -- it is also exactly the mistake made earlier tonight, where a rename after an
existence check silently produced four duplicate names. So those three become "<Firm> - MN",
a DIVISION of the existing record, which is the same shape as HUB - Tulsa: the state is still in
the name, but as a suffix identifying an office rather than a prefix standing in for a column.
▶️ If Eric wants them merged instead, that is one instruction and this script records which three.
"""
import argparse, io, os, subprocess, sys

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")

# The nine, and the name each becomes. Measured on production 2026-08-26.
PLAIN = [
    "Connor & Gallagher",
    "Health & Life Financial",
    "Maguire Agency",
    "North Risk Partners",
    "Pharos",
    "Zimon",
]
# name -> already exists with its own history, so this becomes an office of it
COLLIDES = ["Benefits Advisory Group", "NFP", "Digital"]


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def rename(old, new, note):
    """Rename the agency AND everything that points at it by name."""
    return [
        # ⭐ THE QUOTES FIRST. If the agency rename succeeded and this failed, the quotes would be
        # orphaned -- and an orphaned quote is invisible rather than wrong, which is worse.
        "UPDATE quotes SET broker_agency = " + semis(new) +
        " WHERE lower(trim(broker_agency)) = lower(trim(" + semis(old) + "));",
        "UPDATE aby_sales SET agency = " + semis(new) +
        " WHERE lower(trim(agency)) = lower(trim(" + semis(old) + "));",
        "UPDATE broker_directory SET agency = " + semis(new) +
        " WHERE lower(trim(agency)) = lower(trim(" + semis(old) + "));",
        "UPDATE agencies SET name = " + semis(new) + ", state = 'MN'" + note +
        " WHERE lower(trim(name)) = lower(trim(" + semis(old) + "));",
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    stmts = []
    for n in PLAIN:
        stmts += rename("MN - " + n, n, "")
    for n in COLLIDES:
        # ⭐ THE PARENT LOOKUP RUNS BEFORE THIS ROW IS RENAMED, so a search for the bare name can
        # only find the OTHER record -- this one is still "MN - <name>" at that moment. No guard
        # needed, and adding one was what broke this line the first time.
        why = (' | Was "MN - ' + n + '". A firm called ' + n + ' already existed with its own '
               'quote history, so this is recorded as its Minnesota office rather than merged '
               'into it.')
        note = (", parent_id = (SELECT id FROM agencies WHERE lower(trim(name)) = lower(trim("
                + semis(n) + ")) LIMIT 1), relationship = 'division'"
                ", notes = COALESCE(notes,'') || " + semis(why))
        stmts += rename("MN - " + n, n + " - MN", note)

    print("renaming %d agencies (%d plain, %d as an office of an existing firm)"
          % (len(PLAIN) + len(COLLIDES), len(PLAIN), len(COLLIDES)))
    for n in PLAIN:
        print("   MN - %-28s ->  %-28s  state MN" % (n, n))
    for n in COLLIDES:
        print("   MN - %-28s ->  %-28s  state MN, division of %s" % (n, n + " - MN", n))

    if a.dry:
        print("")
        print("DRY RUN. Nothing was written.")
        return

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    path = os.path.join(here, "_mn.sql")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(stmts) + "\n")
    try:
        res = subprocess.run(
            [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--file", path, "-y"],
            cwd=root, capture_output=True, text=True, timeout=900)
        out = (res.stderr or "") + (res.stdout or "")
        if res.returncode != 0:
            print(out[-2000:] if out.strip() else "(no output)")
            sys.exit(1)
        print("")
        print("applied %d statements" % len(stmts))
    finally:
        try: os.remove(path)
        except OSError: pass


if __name__ == "__main__":
    main()
