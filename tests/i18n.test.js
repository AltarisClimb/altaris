/* ALTARIS™ — les deux langues ont exactement les mêmes clés
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fr from "../src/i18n/fr-FR.js";
import en from "../src/i18n/en-US.js";

test("fr-FR et en-US définissent les mêmes clés", () => {
  const f = Object.keys(fr), e = Object.keys(en);
  assert.deepEqual(f.filter(k => !(k in en)), [], "manquantes en en-US");
  assert.deepEqual(e.filter(k => !(k in fr)), [], "manquantes en fr-FR");
});

test("chaque catégorie d'exercice a un libellé", async () => {
  const { EX_CATS } = await import("../src/domain/exercises.js");
  assert.deepEqual(EX_CATS.filter(c => !fr["ex.cat." + c] || !en["ex.cat." + c]), []);
});
