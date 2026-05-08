# ABY Quote Tool

A fast, deterministic, browser-based quoting tool for ABY Benefits LLC.
No server, no install, no WordPress. Open `index.html` in any modern browser
(Chrome, Edge, Firefox, Safari) and you're working.

## Quick start

Double-click `index.html`. Fill in the form. Click **Generate Quote**.
Click **Print / Save as PDF** to produce a deliverable PDF for the client.

## File map

```
aby-quote-tool/
├── index.html               ← entry point — open this
├── README.md                ← this file
└── assets/
    ├── css/
    │   ├── app.css          ← form / app shell styling
    │   ├── quote.css        ← quote document styling (screen + print)
    │   └── print.css        ← print-only overrides (hides form)
    ├── images/              ← drop ABY logo here later (placeholder text used today)
    └── js/
        ├── data/            ← THINGS THAT CHANGE OFTEN
        │   ├── products.js  ← what products exist + their input shape
        │   ├── pricing.js   ← all pricing tables (commissioned + no-commission)
        │   └── language.js  ← every word that appears on the quote
        ├── lib/             ← THINGS THAT DON'T CHANGE OFTEN
        │   ├── utils.js     ← formatting + quote number generation
        │   ├── engine.js    ← pricing computation (no HTML, no DOM)
        │   └── renderer.js  ← turns engine output + form data into quote HTML
        └── app.js           ← form controller (wires everything together)
```

The **separation between `data/` and `lib/`** is the architectural backbone:
day-to-day updates (price changes, language tweaks, new products) only ever
touch the data files. The library files are stable.

## Common updates

### Updating prices

All prices live in `assets/js/data/pricing.js`. The file has two parallel
rate sets: `commissioned` (currently in production, 5% baked in) and
`noCommission` (currently empty — pending Eric's update). Edit, save, reload.

Items marked `// TODO` are placeholders pending confirmation:
- FSA, HRA, HSA monthly rates for 100+ participants
- ICHRA / QSEHRA pricing (entire product — currently stubbed from existing proposal)
- COBRA: whether the legacy 2% premium retention still applies
- State Continuation standalone pricing (stubbed at $40 minimum)

### Updating language

All proposal language lives in `assets/js/data/language.js`. Edit, save, reload.
Each product has its own block; the standard sections (About ABY, Standard
Services, Disclaimer) live at the top of the file.

### Adding a product

1. Add an entry in `data/products.js` (defines name, input type, packages)
2. Add a matching entry in `data/pricing.js` under both `commissioned` and `noCommission`
3. Add an overview block in `data/language.js` under `products.<id>`

That's it. The form will pick up the new product automatically.

## How the commission toggle works

The toggle simply chooses which rate set the engine reads from:
- **Checked (default)** → reads from `pricing.commissioned`
- **Unchecked** → reads from `pricing.noCommission`, falls back to commissioned
  with a warning banner if no-commission rates aren't defined yet

The engine does no math on commission — it's a pure lookup. When the
no-commission rates come in, drop them into `pricing.noCommission` and the
toggle starts working without touching any other file.

The quote number suffix (`-C` or `-NC`) reflects the toggle state for internal
tracking. Clients don't see what it means.

## Future enhancements (not in v1)

- Standalone HTML quote download (one file with the quote and inline CSS)
- Saved-quotes / database
- Sequential quote numbers instead of random
- Admin pricing editor (so non-developers can update rates)
- ACA Reporting (1094/1095) pricing — already structured, just not surfaced
- Bundled-product discount rules
- ABY logo image (drop a `.svg` or `.png` into `assets/images/` and update
  `quote.css` `.aby-logo` selector)
