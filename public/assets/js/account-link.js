/* THE BROKER'S DOOR, AND THEIR DETAILS FILLED IN FOR THEM.
 *
 * ERIC, 2026-09-08: "I would like to set it up where a broker has to log in in order to quote. That
 * way, we will know who is running the quote."
 * ERIC, 09-25-2026, on finding that logging in did not fill anything in: "Well this is stupid. So an
 * agent logs in but it can't pre-fill their info, they have to type it in every time?"
 *
 * HE IS RIGHT, AND IT IS THE WHOLE POINT OF THE LOGIN. `handleBrokerProfile` in worker.js has carried
 * the comment "Save the details that then carry into every quote. This IS the feature Eric asked for"
 * since the account system was built - and nothing ever carried them. The quote form's Your name,
 * Agency, Phone and Email boxes were plain empty inputs, and this page never asked who was signed in
 * for anything except the label on the account link. The sign-in page meanwhile promised "Your details
 * fill in automatically on every quote you run", which was not true.
 *
 * ⛔ A BROKER RE-TYPING WHAT THE TOOL ALREADY KNOWS IS THE SEAM THIS WHOLE PLATFORM SELLS AGAINST.
 *
 * ONE FETCH, ONE READER. The label and the prefill both come from a single /api/broker/me call: two
 * calls for one fact is how two parts of a page come to disagree about who is signed in.
 *
 * ⚠️ ONLY EMPTY FIELDS ARE FILLED. A broker part-way through a quote, or a restored draft, must never
 * be overwritten by a late-arriving fetch.
 *
 * ---- WHAT THIS FILE USED TO SAY, CORRECTED 09-25-2026 -------------------------------------------
 *
 * It said "IT DOES NOT GATE ANYTHING. Quoting still works signed out." THAT IS NOW FALSE: Eric armed
 * BROKER_LOGIN_REQUIRED on 09-25 and closed self-signup, so the front page sends a visitor to /broker
 * and accounts come from ABY by invitation. A comment describing a gate as off, beside a gate that is
 * on, is the stale-warning shape this project keeps paying for.
 *
 * It also read the quote log as evidence that a broker had quoted on the public form. ⛔ ERIC
 * CORRECTED THAT ON 09-25: "Not one single broker has ever quoted anonymously on the front page. this
 * is a fairly new tool." The measurement is only that a couple of rows carry `ran_by = 'broker'`, and
 * that field means THERE WAS NO ABY ADMIN SESSION - it is the absence of one thing, not the presence
 * of another. He knows what those rows are; the log does not say.
 *
 * And `brokers` being empty is no longer "because nobody can reach the page" - there is a door now,
 * and signing up is deliberately closed. The first account comes from ABY's own invite screen.
 */
(function () {
  "use strict";

  /* NOT FOR ABY STAFF, AND THAT APPLIES TO BOTH HALVES. The internal overlay injects into this same
     page at /aby. An ABY admin is not a broker, so offering them "Sign in" is the wrong door - and
     filling THEIR details into a quote they are running ON BEHALF OF a broker would put the wrong
     name on it, which is worse than an empty box. */
  if (window.ABY_INTERNAL) {
    var link = document.getElementById("abyAccountLink");
    if (link) link.style.display = "none";
    return;
  }

  /* Fill a field only when it is EMPTY, and tell anything listening that it changed. */
  function fill(name, value) {
    if (!value) return false;
    var el = document.querySelector('[name="' + name + '"]');
    if (!el || String(el.value || "").trim() !== "") return false;
    el.value = value;
    /* An `input` event rather than a silent assignment: app.js keeps its own draft state, and a value
       set behind its back is a value it will not save. Harmless if nothing is listening. */
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { /* older browser */ }
    return true;
  }

  /* SIGNED OUT IS THE DEFAULT AND THE MARKUP IS ALREADY CORRECT FOR IT. This only UPGRADES the page
     when a session turns out to exist, so a failed or slow request leaves a working, honest form
     rather than a broken one. A door that disappears when a fetch fails is worse than a stale label. */
  try {
    fetch("/api/broker/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.broker) return;
        var b = d.broker;

        var el = document.getElementById("abyAccountLink");
        if (el) {
          var name = b.name || b.email || "";
          el.textContent = name ? "My account - " + name : "My account";
          el.title = "Your details, your agency, and the quotes on your account";
        }

        /* THE DETAILS THEMSELVES. `agency` is the firm's name as ABY recorded it at invite time, so an
           invited broker sees their own firm without typing it. ⛔ The logo is NOT set here: a file
           input cannot be prefilled by script, and it does not need to be - the client-facing quote
           resolves the firm's logo server-side from the agency id now stamped on the quote. */
        var filled = 0;
        if (fill("brokerName", b.name)) filled += 1;
        if (fill("brokerAgency", b.agency)) filled += 1;
        if (fill("brokerPhone", b.phone)) filled += 1;
        if (fill("brokerEmail", b.email)) filled += 1;

        /* Said out loud, once, where the fields are. Silently filling four boxes looks like the tool
           remembering something it should not, until you know it is your own account doing it. */
        if (filled) {
          var host = document.querySelector('[name="brokerName"]');
          var note = host && host.closest ? host.closest("div") : null;
          var target = note && note.parentNode ? note.parentNode : null;
          if (target && !document.getElementById("abyPrefillNote")) {
            var p = document.createElement("p");
            p.id = "abyPrefillNote";
            p.style.cssText = "font-size:12px;color:#5b6b7f;margin:6px 0 0";
            p.textContent = "Filled in from your account. Change anything here and it only affects this quote.";
            target.appendChild(p);
          }
        }
      })
      .catch(function () { /* leave the signed-out page exactly as it is. */ });
  } catch (e) { /* same. */ }
})();
