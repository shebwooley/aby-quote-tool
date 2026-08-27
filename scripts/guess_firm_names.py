"""Turn the derived firm names into readable ones, by splitting the glued words.

    py scripts/guess_firm_names.py --dry     writes a CSV to review, changes nothing
    py scripts/guess_firm_names.py --write

Eric, 2026-08-26: "Grayfoxins is obviously Gray Fox Insurance... We don't know these agencies -
they're just prospects, and I'm not going to spend hours trying to clean up the names."

⭐⭐ THE DICTIONARY IS ERIC'S OWN DATA, WHICH IS WHY THIS CAN WORK AT ALL.
This project threw away a run-together-words rule once before, for the right reason: without a
dictionary it fires on "cheaper", "visit" and "UnitedHealthcare". The difference now is that there
IS one, and it is exactly the right shape:
  * every word in 1,500+ REAL agency names -- insurance, benefits, advisors, compass, cardinal
  * every first and last name of 2,300 PEOPLE on the books -- alan, farley, harrell, campbell
  * a short hand-written list of the words business names use that appear in neither
A general English dictionary would be WORSE: it would happily split a surname into two words.

HOW IT DECIDES, and it refuses far more often than it guesses:
  * a split is only accepted if EVERY piece is a known word of 3+ letters (or a known abbreviation)
  * among valid splits it takes the one with the FEWEST pieces, then the longest first word
  * one-piece results, unknown fragments and anything under three letters are left alone
⛔ A NAME IT CANNOT SPLIT KEEPS ITS FLAG. The flag means "a human should check this", so leaving it
lit on the ones still unreadable is the correct outcome, not a failure.
"""
import argparse, collections, csv, io, os, re, subprocess, sys, json

WRANGLER = (r"C:\Users\eric\AppData\Local\npm-cache\_npx"
            r"\32026684e21afda6\node_modules\.bin\wrangler.cmd")
WEB = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\Broker_List_Prospects.csv"
OUT = r"C:\Users\eric\OneDrive\Desktop\ONE FOLDER\BROKER LISTS\Firm_Name_Guesses.csv"

# Expanded after splitting. The value is what gets printed.
ABBREV = {
    "ins": "Insurance", "insur": "Insurance", "insurance": "Insurance", "insure": "Insurance",
    "agcy": "Agency", "agy": "Agency", "grp": "Group", "bnfts": "Benefits", "bene": "Benefits",
    "benefit": "Benefit", "benefits": "Benefits", "fin": "Financial", "fincl": "Financial",
    "svcs": "Services", "svc": "Service", "assoc": "Associates", "mgmt": "Management",
    "hlth": "Health", "co": "Co", "llc": "LLC", "inc": "Inc", "usa": "USA", "hr": "HR",
}
# Always upper-cased when they come out as a whole piece.
UPPER = {"usa", "hr", "aca", "llc", "az", "ok", "tx", "mo", "ar", "ks", "la", "tn", "ne", "nm",
         "co2", "cb", "jd", "bb", "abc"}

# Words business names use that neither the agency list nor the people list reliably contains.
EXTRA = """all plus pro my your our the one first best next new sky gold gray grey fox oak elm pine
river creek lake ridge summit peak stone rock iron steel star north south east west central united
allied premier prime select choice smart simple clear bright true blue green red silver eagle hawk
falcon lion bear wolf shield guard secure trust legacy heritage liberty freedom patriot pioneer
frontier compass anchor beacon bridge gateway harbor haven keystone landmark meridian pinnacle
apex vertex core essential vital thrive flourish elevate advance forward ahead onward upward
family friend neighbor community local main street town city metro state national global
help helper care caring cover coverage protect protection plan planning quote quoting
life health dental vision medicare senior group business owner employee employer worker
risk wealth money capital asset fund invest advisor advisors advisory consult consulting
partner partners associate solution solutions service services agency agent agents broker brokers
alliance network alliance direct express choice source resource resources point edge
"""

MORE = """dedicated compassion mesa lady connie empire heritage strategic egality elevate ellevate
crest custom express lease design citizens bell blake bobby brock angela kidd aaron oasis
covered cover assets wealth cox craig freedom bingham consultants advisors resource turner
velasco wave united agent your summit allen arizona solutions medicare group llc inc
"""

FREE_STOP = {"gmail", "yahoo", "outlook", "hotmail", "aol", "icloud", "msn", "protonmail"}

# ⛔ NOT AGENCIES, WHATEVER THE COLUMN SAYS. Somebody's "website" was their scheduling link or a
# social profile, and the import took it as the firm's name. Renaming calendly.com to "Calendly"
# would invent an insurance agency called Calendly and put it on a call list.
NOT_A_FIRM_HOST = {
    "calendly", "linktr", "linkedin", "facebook", "instagram", "twitter", "youtube", "google",
    "sites", "wixsite", "squarespace", "godaddysites", "weebly", "wordpress", "blogspot",
    "healthsherpa", "ehealthinsurance", "medicare", "healthcare",
}


def sql_str(x):
    return "'" + str(x).replace("'", "''") + "'"


def semis(text):
    parts = str(text).split(";")
    if len(parts) == 1:
        return sql_str(text)
    return " || char(59) || ".join(sql_str(p) for p in parts)


def d1(sql, root):
    res = subprocess.run(
        [WRANGLER, "d1", "execute", "aby-quotes", "--remote", "--json", "--command", sql],
        cwd=root, capture_output=True, text=True, timeout=600)
    out = (res.stdout or "") + (res.stderr or "")
    try:
        return json.loads(out[out.index("["):])[0].get("results", [])
    except Exception:
        print(out[-1200:]); sys.exit(1)


def build_vocab(root):
    """Words we are willing to split into. Built from what Eric already has."""
    vocab = collections.Counter()

    def add(text, require_space=True):
        # 🔴 ONLY LEARN FROM TEXT THAT HAS A SPACE IN IT. A single run-together token teaches
        # the splitter that the run-together form IS a word, which is the opposite of the job. This
        # bit twice from two sources: 707 domain-derived agency names in the register, and 153
        # domain-shaped values in the web list's own Agency column.
        # ⚠️ AND A CAP ON LENGTH. "insuranceagency" is 15 letters and survived both filters
        # by arriving inside a longer phrase; no real single word in an agency name is that long.
        text = text or ""
        if require_space and " " not in text.strip():
            return
        for w in re.split(r"[^A-Za-z]+", text):
            if len(w) > 14:
                continue
            # 🔴 CAMEL CASE IS SPLIT BEFORE IT GOES IN, and without this the vocabulary
            # POISONS ITSELF. A real agency written "InsuranceGroup" arrived as the single word
            # "insurancegroup", so the splitter then preferred it as ONE piece -- fewest pieces
            # wins -- and "Blev Ins Insurancegroup" came out unchanged. The dictionary has to hold
            # words, not the same run-together strings it is meant to take apart.
            for part in re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", w) or [w]:
                if len(part) >= 3:
                    vocab[part.lower()] += 1

    # ① real agency names -- BUT ONLY THE MULTI-WORD ONES.
    # 🔴 THE DICTIONARY WAS LEARNING FROM THE NAMES IT IS MEANT TO FIX. It read every
    # agency name, and 707 of those are themselves domain-derived single words like
    # "Floresinsuranceagency" and "Insurancegroup". So "insurancegroup" entered the vocabulary
    # as ONE word, the splitter preferred it -- fewest pieces wins -- and the name came out
    # unchanged. A one-word name teaches nothing anyway; only a name with a space in it is
    # evidence about where words end.
    for r in d1("SELECT name FROM agencies WHERE COALESCE(needs_review,'') = '' "
                "AND name LIKE '% %'", root):
        add(r.get("name"))
    # ② every person's name -- this is what supplies the surnames
    for r in d1("SELECT name FROM people WHERE COALESCE(name,'') <> ''", root):
        add(r.get("name"))
    # ③ the web list's own agency column, which is richer than what got imported
    try:
        for row in csv.DictReader(io.open(WEB, encoding="utf-8-sig", errors="replace")):
            add(row.get("Agency"))
            add(row.get("Agent Name"))
    except OSError:
        pass
    # ④ the hand-written business words
    add(EXTRA, require_space=False)
    add(MORE, require_space=False)
    for k in ABBREV:
        vocab[k] += 5
    for w in FREE_STOP:
        vocab.pop(w, None)
    return vocab


def split(stem, vocab):
    """Best split of a glued word, or None if every piece cannot be accounted for.

    Dynamic programming over the string. Cost prefers FEWER pieces first and longer pieces second,
    so "insurancegroup" comes out as two words rather than "insu"+"ran"+"ce"+"group".
    """
    n = len(stem)
    best = [None] * (n + 1)
    best[0] = (0, 0, [])                    # (pieces, -sum of squares, words)
    for i in range(1, n + 1):
        for j in range(max(0, i - 18), i):
            if best[j] is None:
                continue
            w = stem[j:i]
            if len(w) < 3 or w not in vocab:
                continue
            pieces, score, words = best[j]
            cand = (pieces + 1, score - len(w) * len(w), words + [w])
            if best[i] is None or cand[:2] < best[i][:2]:
                best[i] = cand
    return best[n][2] if best[n] else None


def titlecase(w):
    if w in UPPER:
        return w.upper()
    if w in ABBREV:
        return ABBREV[w]
    # McLemore, O'Brien -- only where the source clearly has that shape.
    if w.startswith("mc") and len(w) > 4:
        return "Mc" + w[2:3].upper() + w[3:]
    return w[:1].upper() + w[1:]


def guess(name, vocab):
    """A better name, or None to leave it alone."""
    out, changed = [], False
    for chunk in re.split(r"(\s+)", name):
        if not chunk.strip():
            out.append(chunk)
            continue
        # Leave anything already mixed-case or containing a digit or punctuation alone: it was
        # probably right to begin with.
        # ⭐ LEADING DIGITS ARE KEPT AND THE REST IS STILL SPLIT. "316healthinsurance" was
        # skipped whole because it is not purely letters, so the one name Eric would most obviously
        # want fixed came out untouched.
        # ⭐ A HYPHEN IS A WORD BREAK THE OWNER ALREADY MADE FOR US. craig-insurance.com is
        # Craig Insurance, and leaving the hyphen produced "Craig-insurance" -- worse than either
        # the domain or the split, because it looks like a decision somebody made.
        chunk = chunk.replace("-", " ")
        if " " in chunk:
            out.append(" ".join((guess(w, vocab) or titlecase(w.lower()) if w.islower() or w.istitle() else w) for w in chunk.split()))
            changed = True
            continue
        lead = ""
        m0 = re.fullmatch(r"([0-9]+)([A-Za-z]+)", chunk)
        if m0:
            lead, chunk = m0.group(1) + " ", m0.group(2)
        if not re.fullmatch(r"[A-Za-z]+", chunk):
            out.append(lead + chunk)
            continue
        low = chunk.lower()
        if low in ABBREV and ABBREV[low] != chunk:
            out.append(lead + ABBREV[low]); changed = True; continue
        parts = split(low, vocab)
        if parts and len(parts) > 1:
            out.append(lead + " ".join(titlecase(p) for p in parts)); changed = True
        else:
            out.append(lead + chunk)
            if lead: changed = True
    new = re.sub(r"\s+", " ", "".join(out)).strip()
    return new if (changed and new and new != name) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not (a.write or a.dry):
        ap.error("pass --dry or --write")

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    here = os.path.join(root, "scripts")

    vocab = build_vocab(root)
    print("vocabulary: %d distinct words" % len(vocab))

    # ⭐ TWO POPULATIONS, AND ERIC SPOTTED THE SECOND ONE.
    # "There are others you didn't mark as questionable, but they obviously are. Like
    #  goagentforce.com... make it Go Agent Force and put goagentforce.com as the website."
    # He is right: 153 firms are named after a domain and NONE carried the flag, because the flag
    # only ever covered names I derived. These came in already domain-shaped from the web list's
    # own Agency column, so nothing marked them. A name is questionable because of what it LOOKS
    # LIKE, not because of which import produced it.
    rows = d1(
        "SELECT id, name, COALESCE(website,'') AS website FROM agencies "
        "WHERE COALESCE(needs_review,'') <> '' "
        "   OR name LIKE '%.com' OR name LIKE '%.net' OR name LIKE '%.org' OR name LIKE '%.io' "
        "   OR name LIKE '%.us' OR name LIKE '%.insure' OR name LIKE '%.agency' "
        "   OR name LIKE '%.insurance' OR name LIKE '%.co' "
        "ORDER BY name", root)
    print("names worth a look: %d" % len(rows))

    hits, misses = [], []
    for r in rows:
        name, domain = r["name"], ""
        m = re.fullmatch(r"([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\.([a-z]{2,10})", name)
        if m and "." in name:
            host = m.group(1).split(".")[-1].lower()
            # ⛔ A scheduling link or a social profile is not a firm. Left named as it is, and it
            # keeps its flag so a person sees it.
            if host in NOT_A_FIRM_HOST or host in FREE_STOP:
                misses.append((r["id"], name, None))
                continue
            domain = name.lower()
            name = m.group(1).split(".")[-1]      # drop www./sub and the TLD
        g = guess(name, vocab)
        if g is None and domain and name != r["name"]:
            # The TLD came off but nothing split -- still an improvement over showing a URL.
            g = titlecase(name.lower()) if name.islower() else name
            if g == r["name"]:
                g = None
        if g:
            hits.append((r["id"], r["name"], g, domain if not r.get("website") else ""))
        else:
            misses.append((r["id"], r["name"], None))

    print("could improve  : %d" % len(hits))
    print("left alone     : %d   (they keep the flag, which is the right answer)" % len(misses))
    print("")
    for h in hits[:30]:
        print("   %-34s ->  %-34s %s" % (h[1][:34], h[2][:34], ("+ website " + h[3]) if h[3] else ""))

    with io.open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["current name", "suggested name", "changed?"])
        for h in hits:
            w.writerow([h[1], h[2], "yes" + ((" + website " + h[3]) if h[3] else "")])
        for _, old, _ in misses:
            w.writerow([old, "", "left alone"])
    print("")
    print("wrote " + OUT)

    if a.dry:
        print("DRY RUN. Nothing was written to the database.")
        return

    stmts = []
    for fid, old, new, domain in hits:
        # ⛔ REFUSE A RENAME THAT COLLIDES. A rename landing on an existing name is exactly the
        # mistake made earlier tonight -- a guard that ran at INSERT time against a collision
        # created at UPDATE time, which produced four duplicate firms.
        stmts.append(
            "UPDATE agencies SET name = " + semis(new) +
            ", notes = COALESCE(notes,'') || " + semis(' | Name split from "' + old + '" 2026-08-26.') +
            " WHERE id = " + sql_str(fid) +
            "   AND NOT EXISTS (SELECT 1 FROM agencies x WHERE lower(trim(x.name)) = lower(trim("
            + semis(new) + ")) AND x.id <> " + sql_str(fid) + ");")
        # The directory carries the firm name too, and everything joins on it.
        stmts.append(
            "UPDATE broker_directory SET agency = " + semis(new) +
            " WHERE agency_id = " + sql_str(fid) + ";")
        # ⭐ THE DOMAIN BECOMES THE WEBSITE RATHER THAN BEING THROWN AWAY. Eric: "make it Go Agent
        # Force and put goagentforce.com as the website." The name was the only place that fact
        # lived, so renaming without this would DELETE information.
        if domain:
            stmts.append(
                "UPDATE agencies SET website = " + sql_str("https://" + domain) +
                " WHERE id = " + sql_str(fid) + " AND COALESCE(website,'') = '';")

    batch, n = [], 0
    for st in stmts:
        batch.append(st)
        if len(batch) >= 50:
            n += 1
            if not run(batch, root, here, "batch %d" % n): sys.exit(1)
            batch = []
    if batch:
        n += 1
        if not run(batch, root, here, "batch %d" % n): sys.exit(1)
    print("renamed %d firms in %d batches" % (len(hits), n))


def run(batch, root, here, label):
    path = os.path.join(here, "_names.sql")
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
            print(out[-1200:] if out.strip() else "(no output)")
        return ok
    finally:
        try: os.remove(path)
        except OSError: pass


if __name__ == "__main__":
    main()
