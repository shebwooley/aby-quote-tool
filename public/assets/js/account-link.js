/* THE BROKER'S DOOR. It is the only thing on abyquotes.com that says an account exists.
 *
 * ERIC, 2026-09-08: "I would like to set it up where a broker has to log in in order to quote. That
 * way, we will know who is running the quote."
 *
 * MEASURED THE SAME NIGHT, AND IT IS WHY THIS FILE IS SO SMALL: the account system is already BUILT
 * and DEPLOYED. /broker serves Sign in, Create an account, Your details, Your agency with a shared
 * logo, invitations, and My quotes / Agency quotes. `F-53` records it shipping on 2026-08-18 with
 * 35 tests against the live worker.
 *
 * WHAT WAS MISSING WAS A DOOR. Fetched from the live site: abyquotes.com serves three href values,
 * all of them stylesheets, and the words "sign in", "log in", "create an account" and "my account"
 * appear ZERO times. `brokers` holds 0 rows because nobody can reach the page, not because nobody
 * wants an account - which is why `F-427`, `F-417` and `F-428` all trace back to that empty table.
 *
 * AND THE QUOTE LOG SAYS THE SAME THING FROM THE OTHER SIDE: of 6,191 quotes, 6,190 are
 * `ran_by = 'ABY'` and exactly ONE is `ran_by = 'broker'` - a real broker, JPH@ebslp.com of Employer
 * Benefit Solutions, on 2026-08-26, with `ran_by_who` null because there was no account to name.
 *
 * IT DOES NOT GATE ANYTHING. Quoting still works signed out. The gate is a separate, reversible
 * change and it is Eric's to switch on - putting up a wall while he is asleep is not a thing to do
 * to a live tool, even one no broker is currently using.
 */
(function () {
  "use strict";

  var el = document.getElementById("abyAccountLink");
  if (!el) return;

  /* NOT FOR ABY STAFF. The internal overlay injects into this same page at /aby, and an ABY admin
     is not a broker with a broker account - offering them "Sign in" would be offering the wrong
     door to the only people who currently use this tool. */
  if (window.ABY_INTERNAL) {
    el.style.display = "none";
    return;
  }

  /* SIGNED OUT IS THE DEFAULT AND THE LINK IS ALREADY CORRECT IN THE MARKUP.
     This only UPGRADES the label when a session turns out to exist, so a failed or slow request
     leaves a working, honest link rather than a blank space. A door that disappears when a fetch
     fails is worse than one that is occasionally out of date. */
  try {
    fetch("/api/broker/me", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.broker) return;
        var name = d.broker.name || d.broker.email || "";
        el.textContent = name ? "My account - " + name : "My account";
        el.title = "Your details, your agency, and the quotes on your account";
      })
      .catch(function () { /* leave the signed-out label. */ });
  } catch (e) { /* same. */ }
})();
