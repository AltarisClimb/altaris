/* ALTARIS™ — nom de famille en majuscules à l'inscription
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { personName } from "../src/core.js";

test("le nom de famille passe en majuscules, le prénom reste tel quel", () => {
  assert.equal(personName("Guillaume", "Ménard"), "Guillaume MÉNARD");
  assert.equal(personName("Élodie", "de la Tour"), "Élodie DE LA TOUR");
  assert.equal(personName("Jean-Luc", "d'Ormesson"), "Jean-Luc D'ORMESSON");
});

test("espaces nettoyés, champs vides ignorés", () => {
  assert.equal(personName("  Anne  Marie ", "  Le   Goff "), "Anne Marie LE GOFF");
  assert.equal(personName("Solo", ""), "Solo");
  assert.equal(personName("", "ONLY"), "ONLY");
});
