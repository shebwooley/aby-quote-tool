"""Give the Tulsa-import firms real names, parents and cities.

    py scripts/name_tulsa_firms.py --dry
    py scripts/name_tulsa_firms.py --write

The import created one firm per email domain, named after the domain, because attaching 84
hubinternational.com people to one of FOUR existing HUB records would have welded them onto a firm
nobody chose. Eric then answered the question the script refused to answer for itself:

  "So for these you would say HUB-Tulsa, for example, as the subsidiary."
  "You can figure out the firm names from the emails, I would assume, right?"

Both are right, and the second is mostly right -- which is why every derived name keeps the domain
it came from in `needs_review`, so anything wrong is checkable rather than merely wrong.

⭐ WHICH PARENT, DECIDED ON EVIDENCE RATHER THAN GUESSED. The register holds HUB (42 quotes) and
HUB International (4); USI (338); Gallagher (316); Alliant (22); Relation (2). The canonical row is
the one carrying the book, and each of those is unambiguous. ⛔ A domain whose parent is NOT
obvious is left as a standalone firm -- a wrong parent is invisible and moves a whole branch of
history onto the wrong company.
"""
import argparse, io, os, re, subprocess, sys, csv, collections

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")
SRC = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\OK_Licensed_AH_Tulsa.csv"

# domain -> the EXISTING firm it is a Tulsa office of. Only where the evidence is unambiguous.
NATIONAL = {
    "hubinternational.com": "HUB",
    "ajg.com": "Gallagher",
    "usi.com": "USI",
    "alliant.com": "Alliant",
    "relationinsurance.com": "Relation",
}

# Words that appear glued onto the end of an agency domain. Longest first, so "insurance" wins
# over "ins" and "advisors" over "advisor".
SUFFIXES = ["insuranceagency", "insuranceservices", "insurancegroup", "insurance", "benefits",
            "financial", "advisors", "advisory", "associates", "solutions", "consulting",
            "partners", "services", "brokers", "brokerage", "agency", "group", "risk",
            "health", "wealth", "life", "ins", "agcy", "co", "llc", "inc"]

FIX = {"ins": "Ins", "agcy": "Agency", "llc": "LLC", "inc": "Inc", "usa": "USA", "ok": "OK"}

WEB = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\Broker_List_Prospects.csv"
WEBNAME = {}


def web_names():
    """domain -> the agency name the web prospecting list gives it.

    Built from BOTH the Website column and the email address, because a firm is sometimes on that
    list with one and not the other. Where rows disagree the MOST COMMON name wins.
    """
    out, tally = {}, collections.defaultdict(collections.Counter)
    try:
        rows = list(csv.DictReader(io.open(WEB, encoding="utf-8-sig", errors="replace")))
    except OSError:
        return out

    def dom(u):
        u = (u or "").lower().strip()
        u = re.sub(r"^https?://", "", u)
        u = re.sub(r"^www[.]", "", u)
        return u.split("/")[0].split("?")[0]

    for r in rows:
        ag = (r.get("Agency") or "").strip()
        if not ag:
            continue
        w = dom(r.get("Website"))
        if w:
            tally[w][ag] += 1
        em = (r.get("Email") or "").strip().lower()
        if "@" in em:
            tally[em.split("@")[1]][ag] += 1

    for d, c in tally.items():
        top = c.most_common(2)
        # A TIE IS NOT AN ANSWER. Two firms claiming one domain equally often is a fact about the
        # data, and picking one would put a name on screen that nobody can trace back.
        if len(top) == 1 or top[0][1] > top[1][1]:
            out[d] = top[0][0]
    return out


def words(stem):
    """Split a glued domain stem into words by peeling known suffixes off the end."""
    out = []
    s = stem
    changed = True
    while changed and s:
        changed = False
        for suf in SUFFIXES:
            if len(s) > len(suf) and s.endswith(suf):
                out.insert(0, suf)
                s = s[: -len(suf)]
                changed = True
                break
    if s:
        out.insert(0, s)
    return out


def pretty(domain):
    """A readable firm name from an email domain. A best effort, kept checkable by the note."""
    # Drop a generic SUBDOMAIN before taking the stem. agent.shelterinsurance.com is Shelter
    # Insurance, not "Agent" -- taking the first label named the mail host rather than the firm.
    labels = [x for x in domain.lower().split(".") if x]
    GENERIC = {"agent", "agents", "mail", "email", "www", "my", "ft", "team", "us", "web"}
    while len(labels) > 2 and labels[0] in GENERIC:
        labels.pop(0)
    stem = labels[0] if len(labels) <= 2 else labels[-2]
    stem = re.sub(r"[^a-z0-9-]", "", stem)
    parts = []
    for chunk in stem.split("-"):
        parts.extend(words(chunk))
    out = []
    for p in parts:
        if not p:
            continue
        out.append(FIX.get(p, p[:1].upper() + p[1:]))
    return " ".join(out) or domain


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    parts = str(text).split(";")
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

    WEBNAME.update(web_names())

    rows = list(csv.DictReader(io.open(SRC, encoding="utf-8-sig", errors="replace")))
    def v(r, k): return (r.get(k) or "").strip()
    target = [r for r in rows if v(r, "Domain Category") in
              {"Known benefits brokerage", "Insurance agency domain"}]

    # City per domain: the city MOST of its people are in, not a hardcoded Tulsa. 484 of the 510
    # are Tulsa, so the constant was right 95% of the time -- and wrong for a firm whose whole
    # office is in Broken Arrow, which is exactly the row somebody would query by city.
    bydom = {}
    for r in target:
        bydom.setdefault(v(r, "Domain").lower(), []).append(r)

    plans = []
    for dom, members in sorted(bydom.items()):
        old = dom + " (Tulsa import)"
        city = collections.Counter(v(r, "City") for r in members if v(r, "City")).most_common(1)
        city = city[0][0] if city else "Tulsa"
        # ⭐⭐ THREE SOURCES FOR A NAME, IN ORDER OF EVIDENCE. Deriving one from the domain was the
        # first plan and it is the WEAKEST of the three: with no dictionary,
        # alanfarleyinsurance.com becomes "Alanfarley Insurance". This project already threw away
        # a run-together-words rule once for exactly that reason.
        parent = NATIONAL.get(dom)
        real = WEBNAME.get(dom)
        if parent:
            # ① A national ABY already quotes. Eric: "you would say HUB-Tulsa, for example, as the
            # subsidiary." The Tulsa office hangs off the existing firm, so its quotes roll up.
            name = parent + " - Tulsa"
            note = ("Tulsa office, from the purchased OK DOI list. Domain " + dom +
                    ". Linked as a division of " + parent + ".")
        elif real:
            # ② The firm's OWN name, from the web prospecting list, which carries an Agency column
            # and a Website column for the same domain. Evidence, not derivation.
            name = real
            note = ("Name taken from the web prospecting list for domain " + dom +
                    ". Check the duplicate finder before working it.")
        else:
            # ③ Last resort, and flagged as such.
            name = pretty(dom)
            note = ("Name DERIVED from the email domain " + dom + " -- no other source had it, so "
                    "check the name itself, then the duplicate finder.")
        plans.append({"dom": dom, "old": old, "name": name, "city": city,
                      "parent": parent, "note": note, "n": len(members)})

    src = collections.Counter("parent" if p["parent"] else ("web list" if WEBNAME.get(p["dom"])
                              else "derived from the domain") for p in plans)
    print("where each firm name came from:")
    for k, n in src.most_common():
        print("   %-28s %d" % (k, n))
    print("")
    linked = [p for p in plans if p["parent"]]
    print("firms to rename : %d" % len(plans))
    print("linked to an existing national : %d  (%d people)"
          % (len(linked), sum(p["n"] for p in linked)))
    print("")
    print("%-38s %-34s %-14s %s" % ("domain", "new name", "city", "parent"))
    for p in plans[:14] if a.dry else linked:
        print("%-38s %-34s %-14s %s" % (p["dom"][:38], p["name"][:34], p["city"][:14], p["parent"] or ""))

    if a.dry:
        print("")
        print("--- a sample of the derived names ---")
        for p in plans:
            if not p["parent"]:
                print("   %-36s -> %s" % (p["dom"], p["name"]))
        print("")
        print("DRY RUN. Nothing was written.")
        return

    stmts = []
    for p in plans:
        sets = ["name = " + semis(p["name"]),
                "city = " + sql_str(p["city"]),
                "needs_review = " + semis(p["note"])]
        if p["parent"]:
            # ⛔ EXACT name match, and only against a row whose source is aby_broker: the
            # register also holds "HUB International" and "Hub; HUB", and matching loosely would
            # pick whichever happened to sort first.
            sets.append("parent_id = (SELECT id FROM agencies WHERE name = " + sql_str(p["parent"])
                        + " AND source = 'aby_broker' LIMIT 1)")
            sets.append("relationship = 'division'")
        stmts.append("UPDATE agencies SET " + ", ".join(sets) +
                     " WHERE lower(name) = lower(" + semis(p["old"]) + ");")
        stmts.append("UPDATE broker_directory SET agency = " + semis(p["name"]) +
                     " WHERE lower(agency) = lower(" + semis(p["old"]) + ");")

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
    print("renamed %d firms in %d batches" % (len(plans), n))


def run(batch, root, here, label):
    path = os.path.join(here, "_rename.sql")
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
