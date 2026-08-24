import io, os, re, sys, glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdftext2 import text_of  # noqa: E402

CORPUS = os.path.join(os.environ["CLAUDE_JOB_DIR"], "tmp", "corpus")

ASK = re.compile(
    r"^(?:\d+[\.\)]\s*|[a-z][\.\)]\s*)?"
    r"(?:please\s+)?"
    r"(describe|provide|list|explain|indicate|identify|state|submit|detail|specify|confirm|"
    r"attach|include|outline|summarize|summarise|do you|does your|will you|can you|are you|"
    r"have you|how many|how do|how will|how are|how long|what is|what are|what types|what "
    r"percentage|who will|who is|is there|is your|would you)\b", re.I)

NOISE = re.compile(
    r"(page \d+|section \d+\.|table of contents|shall be deemed|the state reserves|"
    r"^\s*\d+\s*$|copyright|all rights reserved|proposer shall submit .{0,10}$)", re.I)


def read_any(path):
    head = open(path, "rb").read(5)
    if head.startswith(b"%PDF"):
        return text_of(path)
    raw = open(path, "rb").read()
    if raw[:2] == b"PK":                       # docx / xlsx zip
        import zipfile
        try:
            z = zipfile.ZipFile(path)
            names = [n for n in z.namelist() if n.endswith(".xml")]
            body = " ".join(z.read(n).decode("utf-8", "replace") for n in names[:40])
            return re.sub(r"<[^>]+>", " ", body)
        except Exception:
            return ""
    txt = raw.decode("utf-8", "replace")
    txt = re.sub(r"(?is)<(script|style).*?</\1>", " ", txt)
    return re.sub(r"<[^>]+>", " ", txt)


COMMON = set("the a an of to in for and or is are do does will can your you our we with "
              "that this any all be on as it from by not have has please provide describe what "
              "how many who when where which if their they there".split())


def looks_like_english(s):
    """⛔ THE PDF EXTRACTOR ALSO PULLS FONT AND ENCODING STREAMS, and those decode into runs of
    punctuation and stray capitals that sail through a question-mark test. One landed on the sheet
    reading "2 2 5 5 7 ; = B D D F H J K M O W X n r $ ?" -- it ends in a question mark and is not a
    question. Three cheap tests together are enough."""
    if not s:
        return False
    letters = sum(1 for c in s if c.isalpha() or c in " ,.'?()-")
    if letters / float(len(s)) < 0.80:
        return False
    words = [w for w in re.split(r"[^A-Za-z]+", s) if len(w) >= 3]
    if len(words) < 5:
        return False
    return sum(1 for w in words if w.lower() in COMMON) >= 2


def sentences(txt):
    txt = re.sub(r"\s+", " ", txt)
    # split on sentence ends and on numbered-list boundaries, which is how RFPs actually enumerate
    parts = re.split(r"(?<=[.?])\s+(?=[A-Z0-9])|\s(?=\d{1,2}\.\d?\s+[A-Z])", txt)
    return [p.strip() for p in parts if p.strip()]


def mine(path):
    txt = read_any(path)
    if len(txt) < 500:
        return None, 0
    out = []
    for s in sentences(txt):
        if len(s) < 25 or len(s) > 400:
            continue
        if NOISE.search(s):
            continue
        if not looks_like_english(s):
            continue
        if s.endswith("?") or ASK.match(s):
            s = re.sub(r"\s+", " ", s).strip()
            out.append(s)
    seen, uniq = set(), []
    for s in out:
        k = re.sub(r"[^a-z ]", "", s.lower())[:90]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(s)
    return uniq, len(txt)


manifest = {}
mf = os.path.join(CORPUS, "manifest.txt")
if os.path.exists(mf):
    for line in io.open(mf, encoding="utf-8"):
        bits = line.split()
        if len(bits) >= 3:
            manifest[bits[0]] = bits[-1]

total = 0
lines = []
for path in sorted(glob.glob(os.path.join(CORPUS, "*.bin"))):
    key = os.path.basename(path)[:2]
    qs, n = mine(path)
    if not qs:
        print("%s  --  unreadable or empty (%d chars)" % (key, n))
        continue
    total += len(qs)
    print("%s  %5d chars  %3d questions  %s" % (key, n, len(qs), manifest.get(key, "")[:70]))
    lines.append("\n\n## Source %s\n\n%s\n" % (key, manifest.get(key, "")))
    for q in qs:
        lines.append("- " + q)

out = os.path.join(os.environ["CLAUDE_JOB_DIR"], "tmp", "mined-questions.md")
io.open(out, "w", encoding="utf-8").write("\n".join(lines))
print("\nTOTAL question-shaped lines: %d  ->  %s" % (total, out))
