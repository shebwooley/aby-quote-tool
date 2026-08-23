# The ABY tool, explained — for Niels

> **What this is.** A plain-English explanation of what the tool does and how each page works, written
> as features are built rather than reconstructed from memory afterwards. **Eric asked for it on
> 2026-08-23:** *"When you explain it to me like you just did, it would make sense to capture so you
> don't have to do it from memory again later."*
>
> ## 📏 THE RULES THAT KEEP IT READABLE — they are the whole point
>
> 1. **Written for somebody who knows the business and not the code.** No table names, no function
>    names, no file paths. If a sentence only makes sense to whoever wrote the feature, it does not
>    belong here.
> 2. **Every feature gets three things: what it does, why it works that way, and what to watch out
>    for.** The second and third are the ones nobody can reconstruct later.
> 3. **Added the same day the feature is built.** ⛔ A backlog of "explain this later" becomes a
>    document nobody writes.
> 4. **It says what is BUILT, and marks what is not.** ⏳ means not built yet. A guide that quietly
>    describes an intention reads exactly like one describing a feature.
>
> ## 🔴 WHY THIS LIVES HERE AND NOT IN THE APP
>
> Eric offered either. **It is here because much of it is ABY-internal** — tags, notes, priority, who
> owns which relationship, which agencies are worth chasing. **An in-app page is one authentication
> mistake away from a broker reading ABY's sales notes about them.**
> ⭐ An `/admin/guide` page can be GENERATED from this file later if it is wanted. ⛔ What must not
> happen is a second hand-written copy — content with two homes in this project has diverged every
> single time.

---

## What the tool is, in one paragraph

**ABY quotes outsourced-administration services — COBRA, FSA, ACA filing, ERISA, HSA, POP, HRA — for
employers, almost always through the broker who serves that employer.** The public tool at
`abyquotes.com` lets a broker build a quote and hand it to their client as a PDF or a link. Behind a
password, `/admin` is where ABY sees everything that has been quoted, who is a client today, which
agencies actually place business, and who to talk to next.

⭐ **The two halves have different audiences and must not be confused.** The quoting side is
**broker-facing** and should show nothing ABY would not say to a broker's face. The admin is
**ABY-only** and holds judgments — priority, notes, who is worth chasing.

---

## The pages

### The quote tool (public)

A broker fills in the employer, the headcount and the products, and gets a priced proposal.

- **Who ABY's rep is on the quote** is picked from a list. ⚠️ **The public tool offers only Eric and
  Niels.** When ABY runs a quote from inside `/aby`, seven more names are available — account
  managers and others who field requests. **That difference is deliberate**: anything on the public
  list is offered to every broker on the shared link.
- **The quote can be shared as a link**, and on that link **the employer can correct the headcount
  themselves** and see the price re-figure. It refuses a number outside the priced band and says ABY
  will confirm, rather than inventing a rate.
- ⚠️ **A quote records what it said at the time.** A later rate change never restates an old quote.

### Quote log

Every quote ever run — **6,154 of them, back to November 2008**, across 3,974 employers and 645
agencies.

- **Status is ABY's own vocabulary: Pending, In process, Sold, Dead.** ⚠️ It is deliberately NOT the
  same set the broker-facing tools use; ABY's log is about work ABY is doing.
- **Signing the authorization moves a quote to *In process*, not *Sold*.** A signature is intent, not
  money received — marking it sold would overstate the book.
- ⏳ **A quote that simply got no answer is not the same as one that was lost**, and the tool cannot
  yet tell them apart.

### Clients

**ABY's actual book — 3,190 records, 2,213 active and 977 termed.**

- 🔴 **A sale, a quote and a client are three different records, and none of them is the book on its
  own.** The quote log says who got a *proposal*; the sales list says who *bought*; the client list
  says who *is a client today*. **Only 12% of recorded sales appear in the client folder list, and
  nobody has yet explained why** — so the tool shows the three lists and deliberately does not merge
  them.
- ⚠️ **Retention is measured on the Active Groups tree only.** The Summit list was supplied as active
  groups only, so counting it would report a retention nobody earned.

### Brokers & Agencies

**The most useful page in the tool.** Every agency that has ever quoted, with what they have done:
quotes, sales, clients, how many are still with us, and who at ABY owns the relationship.

- **Acquired firms roll up under the survivor.** MHBT's quotes appear under MMA, and MHBT keeps its
  own historical count when you expand the row.
- 🔴 **The old quotes are never relabelled.** A 2013 quote really was MHBT; rewriting it to MMA would
  put MMA in the log four years before it existed here.
- **A branch office is different from an acquisition.** HUB Fort Worth is alive and can be called;
  MHBT is a dead name. Both roll up, but only the branch stays on lists of people to contact.

### Marketing *(new — see the CRM section below)*

### Pipeline / prospects

Agents and agencies ABY wants to work with **who have never quoted**. They cannot appear on Brokers &
Agencies, which is built from the quote log.

- ⚠️ **The page is empty because no list has ever been pasted into it**, not because it is broken.

### Referrals

Where a broker came from — the partner firm and the individual rep who sent them.

- ⭐ **The partner and the rep are tracked separately on purpose.** A general agency's reps each hold
  their own book and choose where to place it, so *"thank the rep"* is the relationship being
  maintained, and a partner-level total cannot express it.
- ⚠️ **Attribution is permanent, not a live pointer.** Dana referred that broker in March; that stays
  true after Dana leaves, which is why a rep is deactivated rather than deleted.

### Rates

What the tool charges for each product, so a human can check a quote against the sheet.

---

## The CRM — built 2026-08-23

**Eric:** *"I think I like the idea of brokers and agencies being the crm page essentially. With tags,
notes, etc. I want this to be really good and easy to read and work with for both me and Niels."*

### Two views over one list

**Brokers & Agencies keeps its rows and swaps its columns.**

| | **Performance** | **Marketing** |
|---|---|---|
| Answers | *Who has done what?* | *Who are we working?* |
| Shows | quotes, sales, clients, conversion, retention, owner | priority, owner, tags, last contact, notes |
| Hides | nobody | **agencies that no longer exist** — you cannot call MHBT |
| Also hides | **firms that have never quoted** — they are noise in an analysis | nobody |

⭐ **Why one page rather than two:** the rows are the same firms either way. Two pages would mean two
copies of the agency table, the acquisition rollup and the owner control — and the first time they
disagreed, nobody would know which was right.

### Notes and tags are different things

- **A note** is free text about one firm — *"Spoke to Jana, they're moving to a PEO in the spring."*
  Nobody ever lists these across firms.
- **A tag** is a label repeated word-for-word across many — *"sent quoting tool email"*, *"invited to
  webinar"* — and the entire point is to pull back everyone who has it.

🔴 **A tag is PICKED from a list, never retyped.** The first person to type *"Sent quote tool email"*
instead of *"sent quoting tool email"* would silently drop out of the list, and nothing would say so.
⭐ **Typing a genuinely new tag adds it to the list; after that it is chosen.** If you type one that
already exists in a different case, it files under the existing spelling automatically.

### Dates you can backdate

**Every note and tag records two dates: when the thing happened, and when it was typed.** The first
can be set to any past date; the second cannot be changed.

⭐ **This is what makes history work.** *"Invited to a webinar"* in March and again in September is two
real events, not one — and a tag applied twice on the same day is treated as a double-click and
ignored.

### Bulk apply

Tick the rows, pick a tag, set a date, apply. ⭐ **The number it reports is the number that landed** —
if six of forty were refused, it says six were refused and why.

### The recorded status, beside the live one

**Eric:** *"We could do an analysis to see we tagged this originally as one quote ever and now they've
done six, something is working."*

⭐⭐ **That question only works if the tag is FROZEN and the analysis is LIVE.** So a firm carries both:
what somebody *recorded* them as, on a date, which never changes; and what the quote log says about
them *today*, which is recomputed every time you look.

⛔ **Never "refresh" a recorded status.** Refreshing it destroys the only thing it was for.

### Marking an acquisition where you notice it

⏳ **Not built yet.** The mechanism exists and the data barely does: **of 685 agencies, only 12 are
recorded as acquired and 9 as branch offices.** There are also **47 rows with two firm names typed
into one box** (*"MMA; MHBT"*), and several spellings of the same firm.

⭐ **So the CRM will let you mark a firm as acquired-by or a branch-of, from the row you are looking
at** — which turns a research project into something cleared while working. **Only Eric and Niels
know these facts; no query will ever work them out.**

### A person is not an email address

**Eric:** *"Agents who move from one agency to another. We want the fact that they know and like us to
be recorded without taking their quote history with them — that stays with the agency. Just a note
that they quoted 7 while at the prior agency."*

**How it works:** the tool now tracks **the human being** separately from **their email address**.

- An email address belongs to an agency, so it changes when somebody moves firm.
- **The quotes stay with the address, and therefore with the agency where the work was done.**
- **The notes and tags stay with the person**, and follow them.
- Their record then reads: *7 quotes at the old firm, 4 at the new one*, rather than one meaningless
  total.

🔴 **Joining two records into one person is always a human decision.** Right now there are three
people in the directory with the same name at two addresses, and **all three need different answers**:

| | |
|---|---|
| **Rebecca Hearne** | two agencies, a quote at each — **a real move** |
| **Abby Crain** | same firm, two email domains — **not a move**: Patriot bought Benefits Texas |
| **Jacob Kellum-Hudman** | `.com` and `.net` at one firm — **just an alias** |

⛔ **Nothing in the data tells those apart.** The tool suggests the pair; a person decides. **And it
is reversible** — splitting them back restores exactly what was there before.

### Where a firm is

⏳ **City and state are now recorded on each agency, and are empty until somebody types them.**

🔴 **Nothing could be filled in automatically: only 5 of the 6,154 quotes carry a broker phone
number**, so there is no area code to work from.

⭐ **The metro area is worked out from the city rather than typed** — Plano and Frisco both read as
DFW. Two hand-typed fields answering the same question disagree within a month.

⏳ **The best fix is to let the agency tell us** — see below.

---

## ⏳ Not built yet, and worth knowing about

### The agency's own admin, and how it feeds ABY's list

**An agency administrator can already invite their colleagues** — paste names and emails, and each
person gets an email to set their own password. Whether colleagues can see each other's quotes is an
agency setting, and it **starts switched off**.

🔴 **Nobody has ever registered an account, so none of this has run in anger.**

**The gap:** an agent invited that way **would not appear in ABY's list at all**, because the list is
built from the quote log. And an agent ABY already knows would have to be **retyped** by their own
agency.

▶️ **Both are being fixed the same way:** an invited agent becomes a person ABY can see immediately,
and an agent ABY already knows appears in their agency's admin already filled in, to confirm or
correct.

🔴 **The rule that goes with it:** the agency controls a person's name, phone and title, **and their
own city and state**. ABY controls the owner, the priority, the tags and the notes. ⛔ **A broker must
never see a CRM note.**

---

## 📌 Still to be written up

*These are pages and behaviours that exist and have not yet been explained here. Listed so the gap is
visible rather than assumed complete.*

- The internal `/aby` controls on the quote tool, and what a broker does not see
- How a quote reaches the BenefitLab broker dashboard
- Rate overrides, and the note that records why one was applied
- What the New & Lost Business reports contribute, and what they cannot say
