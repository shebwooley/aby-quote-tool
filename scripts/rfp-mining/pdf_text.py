"""Extract text from a PDF using only the standard library.

Handles the common case: FlateDecode content streams whose text is drawn with Tj / TJ
operators over literal strings. Good enough for Word-generated procurement documents,
which is what nearly every RFP is.
"""
import re, sys, zlib


def decompress_streams(raw):
    out = []
    for m in re.finditer(b"stream\r?\n", raw):
        start = m.end()
        end = raw.find(b"endstream", start)
        if end == -1:
            continue
        data = raw[start:end]
        try:
            out.append(zlib.decompress(data))
        except Exception:
            try:
                out.append(zlib.decompressobj().decompress(data))
            except Exception:
                pass
    return out


def literals(chunk):
    """Yield the parenthesised strings a content stream draws, honouring escapes."""
    res, i, n = [], 0, len(chunk)
    while i < n:
        c = chunk[i:i + 1]
        if c != b"(":
            i += 1
            continue
        depth, i, buf = 1, i + 1, []
        while i < n and depth:
            ch = chunk[i:i + 1]
            if ch == b"\\":
                nxt = chunk[i + 1:i + 2]
                # A backslash followed by digits is an OCTAL character code, and every smart
                # quote in a Word-generated PDF arrives that way. Passing it through verbatim
                # leaves literal 223 and 224 scattered through the sentence.
                if nxt in b"01234567":
                    j, digits = i + 1, b""
                    while j < n and len(digits) < 3 and chunk[j:j + 1] in b"01234567":
                        digits += chunk[j:j + 1]
                        j += 1
                    code = int(digits, 8) & 0xFF
                    buf.append({0x91: b"'", 0x92: b"'", 0x93: b'"', 0x94: b'"',
                                0x96: b"-", 0x97: b"-", 0x85: b"..."}.get(code, bytes([code])))
                    i = j
                    continue
                buf.append({b"n": b"\n", b"r": b"\n", b"t": b" ", b"b": b"",
                            b"f": b"", b"(": b"(", b")": b")",
                            b"\\": b"\\"}.get(nxt, nxt))
                i += 2
                continue
            if ch == b"(":
                depth += 1
            elif ch == b")":
                depth -= 1
                if not depth:
                    i += 1
                    break
            buf.append(ch)
            i += 1
        res.append(b"".join(buf))
    return res


def text_of(path):
    raw = open(path, "rb").read()
    parts = []
    for chunk in decompress_streams(raw):
        if b"Tj" not in chunk and b"TJ" not in chunk:
            continue
        for s in literals(chunk):
            try:
                parts.append(s.decode("latin-1"))
            except Exception:
                pass
        parts.append("\n")
    txt = "".join(parts)
    txt = txt.replace(chr(0), " ")
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


if __name__ == "__main__":
    t = text_of(sys.argv[1])
    print("CHARS: %d" % len(t))
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(t[:limit])
