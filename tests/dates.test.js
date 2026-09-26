/* Helpers de date — tout le calendrier et l'ACWR en dépendent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, diffDays, iso, parseISO, weekStart } from "../src/core.js";

test("iso et parseISO font un aller-retour", () => {
  assert.equal(iso(parseISO("2026-09-26")), "2026-09-26");
});

test("addDays franchit les fins de mois et d'année", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29", "2028 est bissextile");
});

test("diffDays compte les jours calendaires", () => {
  assert.equal(diffDays("2026-09-10", "2026-09-03"), 7);
  assert.equal(diffDays("2026-09-03", "2026-09-10"), -7);
  assert.equal(diffDays("2026-09-03", "2026-09-03"), 0);
});

test("weekStart retombe toujours sur un lundi", () => {
  for (const d of ["2026-09-26", "2026-09-21", "2026-09-27", "2027-01-01"]) {
    assert.equal(parseISO(weekStart(d)).getDay(), 1, d);
  }
  assert.equal(weekStart("2026-09-21"), "2026-09-21", "un lundi est son propre début de semaine");
});
