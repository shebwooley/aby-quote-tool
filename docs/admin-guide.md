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
> ## 🔴 WHY IT IS BEHIND THE ADMIN LOGIN
>
> **Much of this is ABY-internal** — tags, notes, priority, who owns which relationship, which
> agencies are worth chasing. It sits at `/admin/guide`, behind the same password as every other
> admin page, and it must stay there. **A broker must never read ABY's sales notes about them.**
>
> ⭐ **The page you are reading is GENERATED from a single markdown file.** Editing it means
> editing that file and rebuilding — the page cannot be edited on its own. ⛔ That is deliberate:
> content with two homes in this project has diverged every single time — the requirement records
> and the website, the knowledge-base master and the search index, a record and its source.

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

#### Logging a quote that never went through the tool

**Sometimes an agent asks for rates and we just reply by email.** *Log a quote* — the folding panel
at the top of this page — records one, so the opportunity is tracked and you know to circle back.

- **Products are picked from buttons, not typed.** Click the ones the quote covered. Every product
  ABY sells is there, in the order they are actually quoted, so nothing can be misspelled or missed.
- **Set the effective date if you know it.** That is what puts the quote on **Today** as something
  with a deadline. Without it the row still exists but nothing will ever remind you about it.
- **The quote number carries an `M`** — `TX260826-M453-C` — so a hand-logged row is obvious in a
  list without opening anything. That is deliberate: *"how much is the quoting tool being used?"*
  must never be answered with a number inflated by rows somebody typed.

### Today

**What is due, across everything the tool knows about, on one page.** Built 2026-08-25, after the
same three screens on the BenefitLab side were merged into one.

It has two views of the same list. **What's due** groups by urgency — overdue, this week, the next
ninety days, then anything with no date at all. **By month** lays the same rows out as a calendar.
The button remembers which one you were on in the address bar, so a link to the month view can be
sent to somebody.

**Five things put rows on it:**

- **Your own to-dos.** Type one in at the top. A due date is optional.
- **Quote effective dates** — a quote still pending whose coverage is meant to start on a date that
  has not arrived yet. That date is the deadline the chase has to beat.
- **Follow-ups** — brokers with quotes out that have had no answer.
- **RFP deadlines** — the proposal date, the questions date and the pre-proposal meeting, for
  anything on the watch list that has not been passed on.
- **Signed authorizations** with a start date.

> ## ⚠️ The to-do list is SHARED, and that is not an oversight
>
> **There is one login to this admin and it does not know who is using it.** So the tool genuinely
> cannot tell Eric from Niels, and a list called *"my to-dos"* would be a lie on a screen two people
> share. **Instead every to-do says who it is for** — Eric, Niels, or nobody in particular — and the
> Owner filter at the top narrows to one person.
>
> ⭐ **That filter deliberately only narrows the TO-DOS.** Nothing else on the page belongs to a
> person, and hiding a quote deadline because it has no owner would make the filter look broken.

**Things worth knowing:**

- **A follow-up is one row per broker, not one per quote.** *"Chase 3 quotes that have had no
  answer"* is one phone call, and listing three rows for it would bury the rest of the page. The row
  says when the newest of them went out and when the oldest did.
- 🔴 **It is due a fortnight after the NEWEST quote you sent that broker, not the oldest.** Anchoring
  it on the oldest punishes the broker you are working with hardest: send a fifth quote today and the
  row would still read eleven weeks late, because the first one is. Measured on the real book, the
  oldest rule put fourteen brokers more than two months late; the newest rule puts four — and it
  leaves alone the seven quoted in the last fortnight, who should not be chased at all.
- **A quote nobody has touched for three months stops being a follow-up.** It is a dead lead, not
  work. Without that cut-off the page would list every quote back to 2008, because the old imported
  ones all count as pending.
- 🔴 **CHECK BEFORE YOU RING, AND THE PAGE SAYS SO.** Most of the quotes behind these rows did not
  come through the tool at all — they were loaded from the quote spreadsheet, and **on those rows
  Pending means either *still open* or *nobody wrote down what happened*.** Nothing in the data can
  tell the two apart. On the real book that is **122 of the 130** quotes in the window. So each row
  says how many of its quotes came from the spreadsheet, and a line above the list gives the total.
  ▶️ **If somebody knows those outcomes, recording them is what turns this from a caveat into a
  clean list.**
- ⏳ **RFP Watch has nothing in it yet**, so that chip reads zero. It is wired now rather than later
  because the day those dates arrive they are hard external deadlines, and a missed close date is an
  opportunity that cannot be recovered. **The chip stays on screen showing a zero rather than
  disappearing** — a chip that vanishes when it is empty cannot be told apart from one that was
  never built.
- 🔴 **The client list is deliberately NOT a source.** A renewal calendar needs an anniversary, and
  only 158 of the 3,190 client records carry a start date — every one of them recorded as an
  estimate. A calendar that prints an estimate as a due date is inventing work.
- **A to-do with no date gets its own list**, rather than being given a made-up day or quietly
  dropped.
- **Months more than three out are folded**, with a line saying what is inside. Three months is the
  same horizon the other view uses, so the two agree about what counts as near. ⭐ **A folded month
  opens itself if anything in it has already passed** — a fold that can hide something late is worse
  than no fold.
- **If one of the five sources cannot be read, the page says so at the top.** Otherwise it would
  simply show a shorter list, which nobody can tell apart from a quiet week.

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
- 🔴 **The old quotes are never relabeled.** A 2013 quote really was MHBT; rewriting it to MMA would
  put MMA in the log four years before it existed here.
- **A branch office is different from an acquisition.** HUB Fort Worth is alive and can be called;
  MHBT is a dead name. Both roll up, but only the branch stays on lists of people to contact.

### Marketing

**The same firms, with the columns you need when you are working them rather than analyzing
them.** It is the second button at the top of Brokers & Agencies, and the page remembers which
one you left it on. **Full description under *The CRM* below.**

### ~~Pipeline / prospects~~ — retired 2026-08-26

**This page is gone. Nothing it did was lost.** Its three jobs moved to where each belonged:

| It used to | Now |
|---|---|
| **Log a quote** | on the **Quote log**, beside the other 6,170 quotes |
| **Add prospects** | *Add a list from an event*, on **Brokers & Agencies → Marketing** |
| **Everyone we track** | the **Never quoted** filter on that same Marketing view |

⚠️ **The old address still works** — `/admin/pipeline` sends you to the Marketing view already
filtered to firms that have never quoted, so old links and bookmarks do not break.

⭐ **Why the paste box was not simply moved:** the Marketing one is better. It takes a person with
**no email address** (name and firm are enough), it **adopts** an address that arrives later onto
the person already on file rather than making a second copy, it tags a whole list at once, and it
recognizes anybody already known instead of duplicating them. The old box demanded an email.

### Referrals

Where a broker came from — the partner firm and the individual rep who sent them.

- ⭐ **The partner and the rep are tracked separately on purpose.** A general agency's reps each hold
  their own book and choose where to place it, so *"thank the rep"* is the relationship being
  maintained, and a partner-level total cannot express it.
- ⚠️ **Attribution is permanent, not a live pointer.** Dana referred that broker in March; that stays
  true after Dana leaves, which is why a rep is deactivated rather than deleted.

**To record one, use *Record a referral* at the bottom: type the broker's name or email, then pick
who sent them.** It searches the 4,961 people in the CRM — the same register Brokers & Agencies
works from — so recording a referral never makes a second copy of anybody. ⛔ **It cannot create a
person**; somebody not in the register yet is added on Brokers & Agencies first, where the identity
rules live.

🔴 **Until 2026-08-27 there was no way to add a broker here at all, and the scoreboard read zero for
everyone.** Eric: *"I see how to add a referral partner and a sales rep but not a broker... I think
this page is good conceptually but not in practice."* **The page was built on the `brokers` table,
which holds zero rows** — no broker has ever registered an account — so the two sides had no way to
meet. It reads `people` now.

⚠️ **THERE ARE TWO QUOTE COLUMNS AND THEY ARE NEVER ADDED TOGETHER.**

| | |
|---|---|
| **Theirs** | quotes that name *this human* — an email of theirs, or their name beside their firm |
| **Firm** | every quote that firm has ever run |

**Only 142 of 6,170 quotes name a broker at all.** The rest are the imported back-catalogue, where
the agency was the folder name and no person was recorded. ⭐ **So a good referral can show 0 of
their own and 300 for their firm** — which is why both are on the row. ⛔ **Do not add them up
across a partner:** several brokers at one firm would each claim all of that firm's work.

### RFP Watch

Cities, counties, school districts and colleges putting these services out to bid.
**A different channel from Brokers and Agencies: those are insurance firms ABY quotes through,
these are public entities buying direct.** The two lists never merge.

- ⭐ **The value is not finding the RFP. It is never looking at the same dead one twice, and
  remembering why you passed.**
- 🔴 **Nothing is trusted until a person opens the issuing entity's own page.** See the
  full section below, which is worth reading before using it.

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

⛔ **Never "refresh" a recorded status.** Refreshing it destroys the only thing it was for — and
there is deliberately no way to edit one. **Recording again on a later date is a second
observation**, and that is exactly what makes the history worth having.

**Open a firm and use *Record them as*.** The five words are about VOLUME, not about how much you
want them — priority already answers that, and the two must not be mixed:

| | |
|---|---|
| **never quoted** | no quote, ever |
| **quoted once** | exactly one |
| **occasional** | two to five |
| **regular** | six or more |
| **former** | they quoted, and nothing in two years |

⭐⭐ **GOING QUIET OUTRANKS VOLUME.** A firm with plenty of quotes but none in two years reads
**former**, not *regular*. A firm that quoted and stopped is a different story from one that never
started, and it is usually the one that deserves the call.

**The column shows the MOVEMENT, not the value.** A recording that still matches today sits
quietly underneath (*"same since Feb 2024"*); one that has moved is called out (*"was quoted once
· Feb 2024"*). ⚠️ **Never recorded** and **recorded and unchanged** are written differently,
because they are different facts.

### Marking an acquisition where you notice it

**Open a firm and answer *what happened to this firm?*** — acquired by somebody, or a branch office
of them.

🔴 **The two do opposite things, and the wording on screen says which:**

| | |
|---|---|
| **Acquired** | the name is dead. It **leaves the Marketing list for good** — nobody can call it — and keeps counting for the firm that bought it |
| **Branch office** | still callable. It **stays** on the Marketing list with its own owner, and also rolls up |

⚠️ **Only top-level firms are offered as the parent.** A chain — A under B under C — would roll a
firm up to the wrong owner, so it is refused rather than allowed and silently mis-totalled.

⭐ **This exists because the data barely does: of 672 firms only 12 are recorded as acquired and 9
as branch offices**, and **47 rows have two firm names typed into one box** (*"MMA; MHBT"*). **Only
you and Niels know these facts; no query will ever work them out** — so the point is to make
recording one a click from the row you are already looking at.

⚠️ **Marking a firm as acquired makes it disappear from the list you are on.** That is the feature
working, and the count line says so rather than leaving you wondering.

### One person, one row on the agent list

**A broker whose quotes are sometimes typed with an email address and sometimes without used to
appear twice** — once under the address, once under the name. Jason Sandler was 3 quotes under one
and 3 under the other. **It was fifteen people, not the three anybody had noticed.**

⭐ **A quote with no address is now matched to the person by name — but only where that name
belongs to exactly one address.** Jason Sandler now reads 6 quotes in one row.

🔴 **Where a name belongs to TWO addresses, the rows stay apart, and that is the point.**
*Rebecca Hearne* has two addresses at two different agencies. Folding her together would move one
agency's quote history onto another, which is the one thing this must never do. **She is exactly
who the merge below is for:** the tool refuses to guess, and a person decides.

⚠️ **Nothing is rewritten and nothing is stored.** This is worked out fresh every time you look, so
the next quote that carries the address improves the answer on its own.

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

### The broker list, and attaching somebody to a firm

**Open *Brokers — every person, their firm, email and state* on the Marketing view.** Everything
else on that page is grouped by firm; this is the flat list — **one row per person**, name, firm,
email and state, and it is the only place somebody with **no firm on file** appears at all.

**Eric:** *"what I don't want is to open an agency name, see that there's no agents, and add an
agent when we already have a record of that agent separately — we just need the firm name attached.
I don't want to create duplicates."*

**To work through the ones we cannot place:** set **Firm: none on file**. That is **1,211 people**
today, a quarter of the register — nearly all of them from the CE list, where the roster gave a
personal email address and no agency.

**Start typing a firm beside their name and it offers the firms we already have**, with the quotes
and the people on each so two similar names can be told apart. Arrow down, Enter, done.

- ⭐ **A misspelling finds the right firm.** Typing *Blumburg* offers **Blumberg Benefits** and says
  which spelling it matched — the 114 alternate spellings and the 10 acquired names are all routes
  to the surviving firm, never destinations.
- ⭐ **A holding company says how many offices it has**, so a row with no quotes on it reads as
  *Higginbotham, 7 offices* rather than as a firm nothing has ever come through.
- 🔴 **It cannot create a firm, on purpose.** If nothing matches, check a shorter piece of the name
  first — a new firm is added on the firm list, where the name gets looked at.
- ⭐ **Getting it wrong is undoable.** *change* reopens the picker on anybody who already has a firm,
  and *no firm* beside it puts them back to blank.

⚠️ **State is the FIRM'S state, not the person's** — so it is blank until the firm is, and fills in
the moment you attach one. There is no state on a person and there should not be: the same fact in
two places is how two places end up disagreeing.

⚠️ **Browsing hides anybody somebody has already taken off the list** (retired, wrong record, not
interested); **searching by name finds them anyway**, because a search is for one person you
already have in mind. *Do not contact* and *deceased* are never in these results at all.

### Notes on a person — and the 3,298 that were invisible

**The NOTES column on the broker list opens what we know about somebody**, and lets you add to it.
A note carries the date the thing happened and they accumulate; it is not a field you overwrite.

🔴 **They were being stored and shown nowhere.** Notes on a *person* have been accepted since the
CRM was built, and the endpoint would serve them — but the only screen that ever asked for a
timeline asked for a *firm's*. **So every note anybody wrote on a human went into the database and
off the screen.** Found 2026-08-27 by writing one Eric asked for and then going to look at it.

⭐ **What that turned up is worth more than the fix: 3,298 notes on 2,173 people.** Most of them are
the provenance from the web-research import and they answer two questions that are otherwise
nowhere:

- **their job title and what they sell** — *"Senior Benefits Consultant | Group"*, *"Life & Health
  Insurance Agent | Group, Individual, Medicare"*
- **where the record came from**, as a link you can open — an agency team page, a NABIP chapter
  board, healthcare.gov's *Find Local Help* (1,662 of them), the Oklahoma DOI list

**1,125 people have more than one.** ⚠️ **So before deciding a prospect is a stranger, open their
notes** — we often already know what they do and where we found them.

### Same person twice

**On the Marketing view, *Same person twice* lists two records that are one human.** 60 groups
covering 121 records today.

⭐ **The cause is always the same and it is not a bug: one person, two email addresses.** Abby Crain
is `abby.crain@patriotgis.com` and `abby@benefitstexas.com` — the acquiring firm's address and the
acquired firm's. Bronwyn Alsup is her work address and her Yahoo one. **Identity here is keyed on the
email, so two addresses are two records by design** — it assumes somebody will eventually say they
are the same, and this is where you say it.

⚠️ **The addresses are the evidence, so they are the loudest thing on each row.** They are what tells
you these two are one person — or that they are not.

⛔ **Nothing merges on its own.** Two people really can share a name at one firm, and a wrong merge
moves one person's quote history onto another with nothing on any screen saying so.

**Press *Keep this one* on the record that should survive.** The other record's addresses and notes
move to it and the empty row goes. 🔴 **No quote is rewritten and no history changes firm** — the
quotes belong to the address, which is what makes this safe. **Press *Not the same person*** and the
pair stops being offered.

⚠️ **14 of the 60 groups have no firm on either side.** That is a weaker match — two records for
*Brady Lenz* with nothing to place either of them could genuinely be two people — so those are
marked and sorted last.

### Where a firm is

**Open a firm and type its city and state.** They start empty.

🔴 **Nothing could be filled in automatically: only 5 of the 6,154 quotes carry a broker phone
number**, so there is no area code to work from.

⭐ **The metro area is worked out from the city rather than typed** — Plano and Frisco both read as
DFW. Two hand-typed fields answering the same question disagree within a month.

⏳ **The best fix is to let the agency tell us** — see below.

---

### Adding a list from an event

**Open *Add a list from an event* at the top of the Marketing view and paste it in.** There is no
file to upload, and that is deliberate: copying rows straight out of Excel gives text this can
read, and — the part that matters — **you see exactly what you are about to add before it lands.**

⭐⭐ **THE COLUMNS ARE WORKED OUT, NOT DECLARED.** Name, firm, email and phone in any order. The
email is unmistakable, so it anchors each row and the rest is read around it — a badge list, a
registration export and a hand-typed list all order their columns differently, and having to
rearrange a spreadsheet first is how a feature stops being used.

**The preview shows what it understood**, and says up front how many rows have no email address
and therefore cannot be added. ⚠️ Finding that out after pressing the button is the wrong moment.

⭐ **The tag goes on during the paste.** *"Everyone at the Tulsa class, 14 August"* is one action:
paste the rows, pick the tag, set the date it happened, apply. Doing it in two steps is two chances
to tag the wrong set.

🔴 **A conference list will contain people we already know, and they are the valuable half.**
Anybody already on our books is **recognized and tagged, not duplicated** — creating a second record
for somebody who has quoted for years is exactly what the tool is built to prevent.

⚠️ **It tells you the split** — *"9 added, 4 already known and tagged, 1 refused"* — never just
*"14 imported"*. **A row with no email address creates nothing and is reported as refused**, because
an email is the only stable way to know who somebody is. Badge lists often have none, so expect a
real fraction of those.

⛔ **A re-pasted list never overwrites anybody.** Somebody already there may have an account,
quotes, a priority and an owner, and none of it is touched.

⭐ **The date is the date of the EVENT, not today.** Paste the Tulsa list in September and set
it to 14 August, and that is what the history says.

---

### The agency's own admin, and how it feeds ABY's list

**An agency administrator invites their colleagues** — paste names and emails, and each person gets
an email to set their own password. Whether colleagues can see each other's quotes is an agency
setting, and it **starts switched off**.

⭐⭐ **AN INVITED COLLEAGUE NOW APPEARS IN OUR LIST IMMEDIATELY**, and so does anybody who signs up
off a webinar unprompted. Before, an invite wrote only to the accounts table, which the CRM does not
read — so an agency could hand us six account managers and every one would have been invisible.

⭐ **And it works the other way. Their admin shows the people WE already know at their firm**,
prefilled — name, phone, how many quotes they have run — rather than making them retype colleagues
we have known for fifteen years. **The quote count is the point:** it is the evidence that we already
know this person, and what makes the row worth correcting.

🔴 **Somebody we already know is recognized, not duplicated**, and their invite does **not**
overwrite the name we hold. What we have was typed by somebody dealing with them.

### Who owns which field

⛔ **An agency administrator can never change how we see them.** This is enforced, not just intended.

| The agency owns | We own |
|---|---|
| the person's **name** and **phone** | **owner**, **priority**, **tags**, **notes** |
| whether they are still there | whether the firm was acquired or is a branch |

⚠️ **Their screen carries nothing internal at all** — no owner, no priority, no tags, no notes. **A
broker must never read what we think of them.** An administrator can only edit people at their own
firm; trying to reach somebody elsewhere by guessing an address is refused.

### 🔴 Two records for one firm

**When somebody signs up, the tool always creates a NEW agency record rather than attaching them to
one we already have.** That is deliberate: agency names are typed free text and email domains are
mixed and often personal, so guessing would put a stranger inside somebody else's book.

⚠️ **The consequence is that a firm we have quoted for years gets a second record the moment one of
their people registers.** The admin reports those pairs — matched ignoring punctuation and case — as
**suggestions only.** *Lone Star Insurance* and *Lone Star Insurance Services* may be one firm or
two, and only you and Niels know.

### 🔴 A firm row that is somebody's NAME

**At the top of *Tidy up* is a green block: firm rows that are actually a person's name, offered
against the firm we already have for them.** 16 rows today, holding 35 quotes.

🔴 **The rest of the Tidy up screen cannot find these and never will.** Both of its lists match on
**shared words** — and *Jason Sandler* shares no word with *Sandler Insurance*. So the biggest
single split in the book sat where nothing was looking: **12 quotes and 2 sales as "Jason Sandler",
30 and 10 as "Sandler Insurance" — one firm reading 29% smaller than it is.**

⭐ **The evidence is the person's own email address**, which is independent of both names.
`jason@sandlerins.com` says where he works more reliably than either row does.

| The row says | What it matched on |
|---|---|
| **their email domain** | strong — the domain is the firm's, e.g. `bdeaton@thedeatonagency.com` → *The Deaton Agency* |
| **surname only — check this one** | weaker, and shown as a prompt. It is what connects *Louanne Trebing* to *Trebing Insurance Services* — and it is also what would connect two unrelated Smiths |

⛔ **A personal email address is never used as evidence** — gmail, yahoo, hotmail and the rest say
nothing about where somebody works, and 1,140 of our 1,212 firm-less people are on one.

⛔ **A solo agent whose firm really is their own name is not an error.** Several of these have a
domain that is simply their own name. **Press *Not the same — leave it*** and it stops being asked.

**Pressing *Same firm* makes the person-named row an alias of the real firm** — the same act as
*Keep this* above it. Nothing is deleted, the quotes stay put and roll up to the survivor, and
changing the relationship back undoes it.

---

## RFP Watch

**Cities, counties, school districts and colleges buy these services directly, by putting them out
to bid.** ABY has more than two dozen municipal references, which is what makes this a credible lane.
This page is where those opportunities are tracked.

⛔ **IT IS A DIFFERENT CHANNEL FROM BROKERS AND AGENCIES, AND THE TWO LISTS NEVER MERGE.** An
agency is an insurance firm ABY quotes through. A public entity here is buying direct. Nothing on
this page is an agency record and nothing on Brokers and Agencies belongs here.

### What it is actually for

⭐⭐ **THE VALUE IS NOT FINDING THE RFP. IT IS NEVER LOOKING AT THE SAME DEAD ONE TWICE, AND
REMEMBERING WHY YOU PASSED.** A weekly document you read and close cannot do that. A year from now,
*"did we look at this county last time, and why did we not bid?"* is the question worth answering,
and it is the reason a pass has to say why.

### Getting opportunities onto the list

**Paste a list.** Any table with a heading row: tabs, pipes or commas. It works out which column is
which, shows you what it read, and **refuses anything it cannot map instead of guessing.** It reports
the split (*3 added, 1 already known, 1 refused*), never just a total, and pasting the same list next
week recognizes what it already holds rather than duplicating it.

⚠️ **A date it cannot read is dropped and SAID, never guessed.** An unreadable deadline that
silently became blank is exactly how a closed solicitation reads as open.

**Or add one by hand**, for something that arrived by phone or word of mouth. That is how Corpus
Christi and College Station arrived, so it is not the exception.

### The screening rules, and why the negative half matters most

Some things look like a match to a keyword search and are not: medical claims administration,
stop-loss, dental or vision or life lines, brokerage and consulting, retirement and deferred
compensation, and benefits administration *software*. **Four of the ten items reviewed in a real week
died on exactly those grounds.**

⭐ **A screened-out row is kept and shown, never deleted.** The rules can be wrong, and a row that
vanished cannot be argued with. Open **Screened out** at the bottom, and if one is really a fit,
press **This one is real**.

🔴 **One rule is deliberately narrower than it looks: the dental and vision test reads the
TITLE only.** A genuine FSA solicitation lists dental and vision as eligible expenses in its scope.
Reading that word across the whole scope would throw away the best fit on the page.

### The badges

| Badge | What it means |
|---|---|
| **Mandatory pre-proposal already held** | There was a required conference and it has happened. If attendance was truly required, ABY is not eligible and every hour after this point is wasted. |
| **Sources conflict** | Something does not add up, usually a stated weekday that does not match the stated date. |
| **Looks like last year** | The plan year had already started before proposals were due, which is what last year's solicitation looks like when it resurfaces. |
| **Deadline not confirmed** | Nobody has opened the issuing entity's own page yet. |
| **Closing soon** | Two weeks or less. |

### 🔴🔴 The verification gate, which is the whole point

**Nothing on this page is trusted because a search result or a digest said so.** In one real week,
two confident wrong answers came back: a solicitation that had closed nearly a year earlier, and a
deadline that was invented and dressed with a weekday that fell on a Saturday.

⛔ **So a deadline only becomes trustworthy when a person opens the issuing entity's own page and
says what they saw.** That is the **I checked their own page** button.

⭐ **If what they see disagrees with what was imported, BOTH are kept and both are shown.** The
tool does not pick a winner.

⭐⭐ **AND "I COULD NOT TELL" IS A REAL ANSWER, NOT A FAILURE.** Leave the date blank and say what
happened. That is how you record *their vendor page says there is no RFP right now, but the listing
says it closes in two weeks* -- which means somebody should make a phone call. In that real week,
two of the three live opportunities landed exactly there, and the phone call was the right next move
both times.

### Recording what ABY decided

Set the disposition on the row: reviewing, pursuing, submitted, won, lost, or passed.

⛔ **PASSING ASKS YOU WHY, AND WILL NOT SAVE WITHOUT AN ANSWER.** A blank reason a year from now
is indistinguishable from never having looked, and that is the one thing this page exists to prevent.

### A quiet week is the system working

⚠️ **Expect most weeks to be empty, especially in Texas.** In one measured week, fourteen
searches across Texas, Oklahoma, Louisiana, Arkansas and New Mexico produced **zero** qualifying
opportunities, and three nationwide. **That is the base rate for a niche service line, not a fault.**
The counts at the top of the page say how many are tracked and how many were screened out, so a quiet
week and a broken page do not look the same.

### What it does not do yet

There is **no automatic feed** -- ABY has no bid-site subscription, so everything arrives by paste or
by hand. There is **no AI** on this page: the screening is plain rules you can read, and nothing
writes an email or contacts anybody.

## ⏳ Not built yet, and worth knowing about

- Nobody has yet registered a real account, so the agency side has only ever been tested. It has never been used by a real agency. **The first agency that signs up is the real test.**

---

## 📌 Still to be written up

*These are pages and behaviors that exist and have not yet been explained here. Listed so the gap is
visible rather than assumed complete.*

- The internal `/aby` controls on the quote tool, and what a broker does not see
- How a quote reaches the BenefitLab broker dashboard
- Rate overrides, and the note that records why one was applied
- What the New & Lost Business reports contribute, and what they cannot say
- ⛔ **Not here on purpose: the RFP ANSWER library.** Answering a solicitation is work that
  happens in documents and in the knowledge base, not on this admin, so it has no page to
  explain. The question set for it lives in the planning folder.
