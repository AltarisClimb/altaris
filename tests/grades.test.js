/* Aiguillage par niveau — CDC §4 : seuil 7a / V6.
   Une erreur ici expose un débutant aux tests de charge maximale. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FONT, FONT_V, SPORT, trackFor } from "../src/domain/grades.js";

test("les échelles sont ordonnées et sans doublon", () => {
  assert.equal(new Set(SPORT).size, SPORT.length);
  assert.equal(new Set(FONT).size, FONT.length);
  assert.ok(SPORT.indexOf("7a") > SPORT.indexOf("6c+"));
  assert.ok(FONT.indexOf("7A") > FONT.indexOf("6C+"));
});

test("la correspondance Font vers V-scale est cohérente au seuil", () => {
  assert.equal(FONT_V["7A"], "V6");
  assert.equal(FONT_V["6C+"], "V6");
  assert.equal(FONT_V["8A"], "V11");
});

test("sous le seuil, parcours débutant", () => {
  assert.equal(trackFor({ gradeSport: "6c" }), "beginner");
  assert.equal(trackFor({ gradeSport: "6c+" }), "beginner");
  assert.equal(trackFor({ gradeBoulder: "6C+" }), "beginner");
  assert.equal(trackFor({}), "beginner", "profil vide : par défaut le parcours prudent");
  assert.equal(trackFor(null), "beginner");
});

test("au seuil ou au-dessus, parcours avancé", () => {
  assert.equal(trackFor({ gradeSport: "7a" }), "advanced");
  assert.equal(trackFor({ gradeSport: "8b" }), "advanced");
  assert.equal(trackFor({ gradeBoulder: "7A" }), "advanced");
});

test("une seule discipline au-dessus du seuil suffit", () => {
  assert.equal(trackFor({ gradeSport: "6b", gradeBoulder: "7A" }), "advanced");
  assert.equal(trackFor({ gradeSport: "7a", gradeBoulder: "6A" }), "advanced");
});

test("une cotation inconnue ne fait pas basculer en avancé", () => {
  assert.equal(trackFor({ gradeSport: "inexistant" }), "beginner");
});
