/* ALTARIS™ — grille des disponibilités : créneaux ↔ cases
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCells, toSlots } from "../src/domain/availability.js";
import { boulderOptions, gradePair, sportOptions } from "../src/domain/grades.js";

test("des créneaux aux cases et retour, sans perte", () => {
  const slots = [{ day: 0, start: "18:00", end: "20:00", type: "boulder" }, { day: 0, start: "20:00", end: "21:00", type: "fingerboard" },
                 { day: 5, start: "09:30", end: "12:00", type: "outdoor" }];
  assert.deepEqual(toSlots(toCells(slots)), slots);
});

test("les heures hors grille sont bornées, les demi-heures arrondies", () => {
  const g = toCells([{ day: 2, start: "05:00", end: "07:10", type: "lead" }]);
  assert.deepEqual(toSlots(g), [{ day: 2, start: "06:00", end: "07:30", type: "lead" }]);
});

test("cotations selon la langue : françaises en français, américaines en anglais", () => {
  assert.equal(gradePair({ gradeSport: "7a", gradeBoulder: "6C" }, false), "7a / 6C");
  assert.equal(gradePair({ gradeSport: "7a", gradeBoulder: "6C" }, true), "5.11d / V5");
  assert.equal(sportOptions(true).find(o => o[0] === "6a")[1], "5.10a");
  const v = boulderOptions(true);
  assert.equal(new Set(v.map(o => o[1])).size, v.length, "un seul choix par cotation V");
  assert.equal(v.find(o => o[1] === "V6")[0], "7A", "V6 = seuil du parcours avancé");
  assert.ok(boulderOptions(true, "6A+").some(o => o[0] === "6A+"), "la valeur enregistrée reste sélectionnable");
});
