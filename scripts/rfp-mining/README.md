# RFP question mining

Turns public-entity RFP documents into a worksheet of questions for ABY to answer.
Built 2026-08-23. Python standard library only, no packages to install.

## Why it lives here

⭐ **The first pass at this stalled and the reason was recorded wrongly.** It looked like a rate
limit. It was **PDF parsing**: a plain fetch returns the document as compressed binary, and reading
it needs zlib decompression plus octal-escape handling before a single sentence is legible. Downloading
with `curl` and extracting locally got through 13 of 19 documents where fetching had got through none.

## The pipeline

| Step | Script | What it does |
|---|---|---|
| 1 | *(curl)* | Download each URL from the source register into a folder as `NN.bin` |
| 2 | `pdf_text.py` | Extract text from a PDF. Also usable on its own: `py pdf_text.py file.pdf 2000` |
| 3 | `mine_questions.py` | Pull question-shaped sentences out of every document |
| 4 | `build_worksheet.py` | Cluster the phrasings, attach ABY's existing answers, write the xlsx |
| — | `xlsx_writer.py` | Minimal `.xlsx` writer (inline strings, wrapped text, frozen header, filters) |

`mine_questions.py` and `build_worksheet.py` read `$CLAUDE_JOB_DIR/tmp`, which is a scratch
directory. **Point them at wherever the corpus actually lives before running.**

## What is worth knowing before changing any of it

⛔ **The PDF extractor also pulls font and encoding streams.** They decode into runs of punctuation
and stray capitals, and some of them end in a question mark. One reached a draft worksheet reading
`2 2 5 5 7 ; = B D D F H J K M O W X n r $ ?`. `looks_like_english()` in `mine_questions.py` is
what stops that, and it needs all three of its tests.

⛔ **Octal escapes matter more than they look.** Every smart quote in a Word-generated PDF arrives
as `\223` or `\224`. Ignore them and the text fills with literal `223`. And octal is **0-7** -- an
earlier version scanned any digit and died on `\8`.

⭐ **Clustering uses CONTAINMENT, not Jaccard.** "What is your claims turnaround time?" and
"Describe your claims turnaround time and how you monitor it" are one question; Jaccard scores them
low because the longer one carries extra words, and both then appear at frequency 1.

⚠️ **Do not raise the clustering threshold to force the count down.** Word overlap cannot tell
"the address of your home office" from "your banker's name and address" -- they score as near
identical and are different questions. **Two similar rows cost a reader a moment. A wrong merge
loses a question permanently.**

## Still not retrieved

See `corpus-failed.txt`. Four are access walls or 404s. The rest downloaded but are **image-only
scans with no text layer**, which cannot be extracted without OCR -- those need a person to open
them.
