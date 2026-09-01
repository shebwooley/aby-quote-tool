// Drive handleCommitmentExport against fake rows. D1's daily read limit is exhausted until
// 2026-09-02, and check_crm cannot seed a local D1 here, so the function is exercised directly.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const start = src.indexOf("async function handleCommitmentExport");
const end = src.indexOf("\nasync function handleDeleteCommitment");
if (start < 0 || end < 0) { console.error("could not slice the handler"); process.exit(1); }

const jsonResp = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
const fn = new Function("jsonResp", src.slice(start, end) + "\nreturn handleCommitmentExport;")(jsonResp);

const db = (row, throwOnJoin) => ({
  prepare(sql) {
    return { bind() { return this; },
      async first() {
        if (throwOnJoin && sql.includes("LEFT JOIN")) throw new Error("no such column: c.client_id");
        return row;
      } };
  },
});
const req = { url: "https://abyquotes.com/api/commitments/abc/export" };

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? "  ok   " : "  FAIL ") + name + (cond ? "" : "  <- " + detail));
  if (!cond) fails++;
};

const NEW_ROW = {
  id: "abc", quote_number: "TX260826-1002-C", submitted_at: "2026-08-26T14:03:00.000Z",
  employer_name: "Employer Benefit Solutions", address: "12 Main St", city_state_zip: "Austin, TX 78701",
  auth_signer: "JP Hasegawa", auth_title: "CFO", auth_email: "jp@example.com", auth_phone: "512-555-0100",
  hr_contact: "", hr_title: "", hr_email: "", hr_phone: "",
  start_date: "2026-10-01", accepted_print: "JP Hasegawa", accepted_sign: "JP Hasegawa",
  products: JSON.stringify([{ name: "Dental" }, "Vision"]),
  client_id: "cli_1", quote_id: "q_1", share_token: "tok_xyz",
  broker_email: "b@firm.com", broker_email_resolved: "b@firm.com",
  quote_broker_name: "Dana Reyes", quote_broker_agency: "Firm LLC",
};

console.log("COMMITMENT EXPORT (F-416 iii)\n");

let res = await fn(req, "abc", { DB: db(NEW_ROW) });
let doc = JSON.parse(await res.text());
check("200 and a schema name", res.status === 200 && doc.schema === "aby.commitment/1", doc.schema);
check("the signed page's own fields survive",
  doc.authorized_signer.name === "JP Hasegawa" && doc.employer.name === "Employer Benefit Solutions",
  JSON.stringify(doc.authorized_signer));
check("it POINTS at the quote instead of copying it",
  doc.quote.proposal_url === "https://abyquotes.com/q/tok_xyz" && doc.quote.quote_id === "q_1",
  doc.quote.proposal_url);
check("NO PRICING is copied into the document",
  !/\b(rate|premium|monthly|annual|first_year|price|cost)\b/i.test(
    JSON.stringify({ ...doc, acceptance: { ...doc.acceptance, products: [] } })),
  "a price-like key reached the export");
check("both product shapes normalise -- string AND object",
  doc.acceptance.product_names.join(",") === "Dental,Vision", doc.acceptance.product_names.join(","));
check("the raw products blob is kept verbatim", Array.isArray(doc.acceptance.products) &&
  doc.acceptance.products.length === 2, JSON.stringify(doc.acceptance.products));
check("a blank field is null, not an empty string",
  doc.hr_contact.name === null && doc.hr_contact.email === null, JSON.stringify(doc.hr_contact));
check("it downloads under the quote number",
  (res.headers.get("content-disposition") || "").includes('Commitment-TX260826-1002-C.json'),
  res.headers.get("content-disposition"));

// An OLD row: signed before the link-back, so no token and no quote id.
const OLD_ROW = { ...NEW_ROW, share_token: null, quote_id: null, products: JSON.stringify(["Medical"]) };
res = await fn(req, "abc", { DB: db(OLD_ROW) });
doc = JSON.parse(await res.text());
check("an unlinked old row exports, with a NULL url rather than a dead one",
  res.status === 200 && doc.quote.proposal_url === null, doc.quote.proposal_url);

// A PRE-MIGRATION database: the broker join throws, and the authorization must still export.
res = await fn(req, "abc", { DB: db(NEW_ROW, true) });
doc = JSON.parse(await res.text());
check("the join throwing does NOT lose the signed record",
  res.status === 200 && doc.authorized_signer.name === "JP Hasegawa", res.status);

// Corrupt products must not take the whole export down with them.
res = await fn(req, "abc", { DB: db({ ...NEW_ROW, products: "{not json" }) });
doc = JSON.parse(await res.text());
check("unparseable products degrade to an empty list, they do not 500",
  res.status === 200 && doc.acceptance.product_names.length === 0, res.status);

res = await fn(req, "nope", { DB: db(null) });
check("a missing commitment is a 404, not a 200 with an empty shell", res.status === 404, res.status);

// ── THE FLOOR: a test that cannot fail is not a test. Sabotage each guard. ──────────────────
console.log("\nSABOTAGE -- each of these MUST break something above\n");
const sab = (name, from, to) => {
  const mutated = src.slice(start, end).replace(from, to);
  if (mutated === src.slice(start, end)) { console.log("  FAIL " + name + "  <- the mutation did not land"); fails++; return; }
  console.log("  (mutation landed) " + name);
  return new Function("jsonResp", mutated + "\nreturn handleCommitmentExport;")(jsonResp);
};

let f = sab("null-ing blanks removed", "return t === '' ? null : t;", "return t;");
if (f) { const d = JSON.parse(await (await f(req, "abc", { DB: db(NEW_ROW) })).text());
  check("  -> blank-is-null now fails, as it should", d.hr_contact.name !== null, "sabotage went unnoticed"); }

f = sab("404 removed", "return jsonResp({ error: 'No such commitment' }, 404);", "row = {};");
if (f) { const r = await f(req, "nope", { DB: db(null) });
  check("  -> missing-row now fails, as it should", r.status !== 404, "sabotage went unnoticed"); }

f = sab("object products no longer read .name", "String(p.name || '')", "String('')");
if (f) { const d = JSON.parse(await (await f(req, "abc", { DB: db(NEW_ROW) })).text());
  check("  -> product normalisation now fails, as it should",
    d.acceptance.product_names.join(",") !== "Dental,Vision", "sabotage went unnoticed"); }

console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
process.exit(fails ? 1 : 0);
