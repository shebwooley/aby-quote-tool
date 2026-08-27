"""Split a firm that is doing two jobs at once: holding company AND the office that quotes.

    py scripts/split_parent_offices.py --dry
    py scripts/split_parent_offices.py --only MMA --write
    py scripts/split_parent_offices.py --write          (all of them)

Eric, 2026-08-26:
  "There are some parent companies that have subsidiaries, but they have quotes or sales of their
   own. An example is MMA... I think what we need to do in this case is make it MMA-DFW that gets
   credit for the quotes and sales and then have a parent company of MMA that has MMA-DFW and
   other subsidiaries below it (and the sales roll up to the parent). companies like MHBT were
   purchased and rolled into MMA-DFW."

WHAT IT DOES, per firm:
  ① the EXISTING row keeps its id, its quotes and its history, and is RENAMED "<Name> - DFW"
  ② a NEW pure holding row called "<Name>" is created, with no quotes of its own
  ③ the DFW office becomes a child of the holding row
  ④ the old children are re-parented by what their relationship MEANS:
       succeeded (bought and folded in)  -> under the DFW OFFICE   <- Eric's MHBT example
       division  (another office)        -> under the HOLDING row
       alias     (a spelling of the name)-> under the HOLDING row

🔴 THE EXISTING ROW IS RENAMED RATHER THAN REPLACED, and that is the whole safety of this. Its id
is on every note, every tag and every event ever recorded against it; creating a new row for the
office and leaving the old one as the parent would silently move all of that onto the holding
company, which by definition has no history.

🔴 AND THE QUOTES MOVE WITH THE NAME. Everything joins a quote to an agency BY NAME, so a rename
without a matching UPDATE on `quotes` drops them out of every count -- F-394, where 588 quotes
went quiet and 343 did so the day the Patriot divisions were renamed without them.

⛔ TWO EXCLUSIONS, BOTH DELIBERATE:
  * a firm whose name ALREADY carries a location ("Patriot - Benefits Texas", "MMA - STL") --
    appending " - DFW" would produce "Patriot - Benefits Texas - DFW".
  * a firm with a state recorded that is not Texas -- the nine MN agencies were given their state
    an hour before this, and Eric's rule was "most of our agencies that have quoted a lot are in
    DFW". Most is not all, and the ones that say otherwise say so.
"""
import argparse, io, os, subprocess, sys, uuid, json

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def d1(sql, root):
    """Run one read-only statement and hand back the rows."""
    res = subprocess.run(
        [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--json", "--command", sql],
        cwd=root, capture_output=True, text=True, timeout=600)
    out = (res.stdout or "") + (res.stderr or "")
    try:
        start = out.index("[")
        return json.loads(out[start:])[0].get("results", [])
    except Exception:
        print(out[-1200:])
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    here = os.path.join(root, "scripts")

    where_only = (" AND a.name = " + sql_str(a.only)) if a.only else ""
    targets = d1(
        "WITH q AS (SELECT lower(trim(broker_agency)) k, COUNT(*) quotes FROM quotes "
        "WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1) "
        "SELECT a.id, a.name, COALESCE(q.quotes,0) quotes, COALESCE(a.state,'') st "
        "FROM agencies a LEFT JOIN q ON q.k = lower(trim(a.name)) "
        "WHERE (SELECT COUNT(*) FROM agencies c WHERE c.parent_id = a.id) > 0 "
        "  AND COALESCE(q.quotes,0) > 0 "
        "  AND a.name NOT LIKE '% - %' "
        "  AND COALESCE(a.state,'') IN ('','TX')" + where_only +
        " ORDER BY COALESCE(q.quotes,0) DESC", root)

    print("firms to split : %d" % len(targets))
    if not targets:
        print("nothing matched"); return

    stmts = []
    for t in targets:
        old, new, hid = t["name"], t["name"] + " - DFW", str(uuid.uuid4())
        print("   %-38s %5d quotes  ->  %-30s under a new %s"
              % (old[:38], t["quotes"], new[:30], old[:24]))

        # ① the holding row, created FIRST so the re-parenting below can point at it
        stmts.append(
            "INSERT INTO agencies (id, name, created_at, source, state, notes) "
            "SELECT " + sql_str(hid) + ", " + semis(old) + ", datetime('now'), "
            "(SELECT source FROM agencies WHERE id = " + sql_str(t["id"]) + "), "
            "(SELECT state FROM agencies WHERE id = " + sql_str(t["id"]) + "), " +
            semis("Holding company. Created 2026-08-26 when " + old + " was split: the row that "
                  "carries the quotes became " + new + ", and this is the parent its offices and "
                  "acquisitions hang from.") +
            " WHERE NOT EXISTS (SELECT 1 FROM agencies WHERE lower(trim(name)) = lower(trim("
            + semis(old) + ")) AND id <> " + sql_str(t["id"]) + ");")

        # ④ re-parent the existing children BEFORE the rename, while their parent_id still
        # points at the row about to become the office.
        #   succeeded -> the office (bought and folded into it)
        #   everything else -> the holding company
        stmts.append(
            "UPDATE agencies SET parent_id = (SELECT id FROM agencies WHERE lower(trim(name)) = "
            "lower(trim(" + semis(old) + ")) AND id <> " + sql_str(t["id"]) + " LIMIT 1) "
            "WHERE parent_id = " + sql_str(t["id"]) + " AND COALESCE(relationship,'') <> 'succeeded';")

        # ③ + ① the office keeps its id and everything attached to it, and gains a parent
        stmts.append(
            "UPDATE agencies SET name = " + semis(new) + ", relationship = 'division', "
            "parent_id = (SELECT id FROM agencies WHERE lower(trim(name)) = lower(trim("
            + semis(old) + ")) AND id <> " + sql_str(t["id"]) + " LIMIT 1), "
            "notes = COALESCE(notes,'') || " +
            semis(" | Renamed from \"" + old + "\" on 2026-08-26: this row carries the quotes, so "
                  "it is the office rather than the holding company.") +
            " WHERE id = " + sql_str(t["id"]) + ";")

        # 🔴 THE QUOTES, THE SALES AND THE DIRECTORY FOLLOW THE NAME.
        for tbl, col in (("quotes", "broker_agency"), ("aby_sales", "agency"),
                         ("broker_directory", "agency")):
            stmts.append(
                "UPDATE " + tbl + " SET " + col + " = " + semis(new) +
                " WHERE lower(trim(" + col + ")) = lower(trim(" + semis(old) + "));")

    print("")
    print("statements : %d" % len(stmts))
    if a.dry:
        print("DRY RUN. Nothing was written.")
        return

    batch, n = [], 0
    for st in stmts:
        batch.append(st)
        if len(batch) >= 40:
            n += 1
            if not run(batch, root, here, "batch %d" % n):
                sys.exit(1)
            batch = []
    if batch:
        n += 1
        if not run(batch, root, here, "batch %d" % n):
            sys.exit(1)
    print("done in %d batches" % n)


def run(batch, root, here, label):
    path = os.path.join(here, "_split.sql")
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
