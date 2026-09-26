/* ALTARIS™ — flux d'agenda (Edge Function calendar) et heure des rappels
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeed, zonedInstant } from "../supabase/functions/_shared/ics.js";
import { buildICS } from "../src/domain/calendar.js";

const s = { id: "s-1", date: "2026-09-30", time: "18:30", title: "Force doigts", type: "boulder",
            plannedMin: 90, targetIntensity: 7, status: "planned", notes: "5×; repos" };

test("le flux et le téléchargement écrivent les mêmes horaires, UID et rappel", () => {
  const pick = (ics) => ics.split("\r\n").filter(l => /^(UID|DTSTART|DTEND|TRIGGER)/.test(l));
  assert.deepEqual(pick(buildFeed([s])), pick(buildICS([s], {})));
});

test("le flux se rafraîchit toutes les heures et nomme les exercices", () => {
  const ics = buildFeed([{ ...s, exercises: ["fd03", "inconnu"] }], { names: { fd03: "Max Hangs" }, lang: "fr" });
  assert.ok(ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"));
  assert.ok(ics.replace(/\r\n /g, "").includes("• Max Hangs"));
  assert.ok(!ics.includes("inconnu"));
});

test("séance faite : pas de rappel ; manquée : annulée ; repos : absent", () => {
  const ics = buildFeed([{ ...s, id: "a", status: "done" }, { ...s, id: "b", status: "missed" }, { ...s, id: "c", type: "rest" }]);
  assert.ok(!ics.includes("VALARM"));
  assert.ok(ics.includes("STATUS:CANCELLED"));
  assert.ok(!ics.includes("UID:c@"));
});

test("heure locale → instant : Paris en été (UTC+2) et en hiver (UTC+1)", () => {
  assert.equal(new Date(zonedInstant("2026-07-01", "18:00", "Europe/Paris")).toISOString(), "2026-07-01T16:00:00.000Z");
  assert.equal(new Date(zonedInstant("2026-12-01", "18:00", "Europe/Paris")).toISOString(), "2026-12-01T17:00:00.000Z");
  assert.equal(new Date(zonedInstant("2026-07-01", "18:00", "America/New_York")).toISOString(), "2026-07-01T22:00:00.000Z");
});
