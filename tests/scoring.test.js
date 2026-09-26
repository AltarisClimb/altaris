/* Normalisation et scoring des tests physiques.
   Les référentiels sont des valeurs ALTARIS v1, ajustables par l'admin :
   ces tests vérifient la mécanique, pas la justesse physiologique. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REF, TESTS, band, batteryFor, interp, scoreAssessment } from "../src/domain/scoring.js";

test("interp respecte les points d'ancrage", () => {
  assert.equal(Math.round(interp(REF.finger.m, 130)), 70);
  assert.equal(Math.round(interp(REF.finger.m, 100)), 30);
});

test("interp interpole linéairement entre deux ancrages", () => {
  // 100 -> 30 et 115 -> 50, donc le milieu 107.5 -> 40
  assert.equal(Math.round(interp(REF.finger.m, 107.5)), 40);
});

test("interp borne le bas et prolonge le haut", () => {
  assert.ok(interp(REF.finger.m, 0) >= 0);
  assert.ok(interp(REF.finger.m, 200) >= 100);
  assert.equal(interp(REF.finger.m, null), null);
  assert.equal(interp(REF.finger.m, NaN), null);
});

test("force de doigts : masse totale en % du poids de corps", () => {
  assert.equal(Math.round(TESTS.finger.metric({ bw: 68.5, added: 24.5 }) * 10) / 10, 135.8);
  assert.equal(Math.round(TESTS.finger.metric({ bw: 60, added: 0 })), 100, "à vide = 100 % du poids");
  assert.equal(Math.round(TESTS.finger.metric({ bw: 60, added: -12 })), 80, "assistance = valeur négative");
  assert.equal(TESTS.finger.metric({ bw: 0, added: 10 }), null, "pas de division par zéro");
});

test("traction lestée : ratio lest sur masse corporelle", () => {
  assert.equal(Math.round(TESTS.pull.metric({ bw: 70, added: 35 })), 50);
  assert.equal(Math.round(TESTS.pull.metric({ bw: 70, added: 0 })), 0);
});

test("front lever : les secondes sont pondérées par la variante", () => {
  assert.equal(TESTS.core.metric({ variant: "tuck", secs: 10 }), 10);
  assert.equal(TESTS.core.metric({ variant: "straddle", secs: 14 }), 36.4);
  assert.ok(TESTS.core.metric({ variant: "full", secs: 5 }) >
            TESTS.core.metric({ variant: "tuck", secs: 15 }), "le complet vaut plus que le groupé");
});

test("les référentiels féminins sont distincts des masculins", () => {
  const r = { bw: 54, added: 9 };
  assert.notEqual(Math.round(TESTS.finger.score(r, { sex: "f" })),
                  Math.round(TESTS.finger.score(r, { sex: "m" })));
});

test("un sexe non précisé se normalise sans planter", () => {
  const s = TESTS.finger.score({ bw: 70, added: 20 }, { sex: "x" });
  assert.ok(s > 0 && s <= 100);
});

test("scoreAssessment note tous les domaines renseignés", () => {
  const a = { results: {
    finger: { bw: 68.5, added: 24.5 }, pull: { bw: 68.5, added: 34 }, repeat: { reps: 31 },
    power: { height: "nipple" }, core: { variant: "straddle", secs: 14 },
    mob: { spread: 124, height: 178, erot: 96 }
  }};
  const sc = scoreAssessment(a, { sex: "m" });
  assert.equal(Object.keys(sc).length, 6);
  assert.equal(sc.power, 72, "le point de contact est un barème direct");
  assert.ok(Object.values(sc).every(v => v >= 0 && v <= 100));
});

test("un test passé n'est pas noté", () => {
  const sc = scoreAssessment({ results: { finger: { skipped: true }, power: { height: "chin" } } }, { sex: "m" });
  assert.equal(sc.finger, undefined);
  assert.equal(sc.power, 25);
});

test("les paliers d'interprétation couvrent 0 à 100 sans trou", () => {
  assert.equal(band(20).k, "b.developing");
  assert.equal(band(50).k, "b.solid");
  assert.equal(band(70).k, "b.strong");
  assert.equal(band(90).k, "b.elite");
  assert.equal(band(null).k, "g.noData");
  for (let v = 0; v <= 100; v += 1) assert.ok(band(v).k, "score " + v + " sans palier");
});

test("CDC §4 : la batterie débutant exclut toute charge maximale sur réglette", () => {
  const beg = batteryFor("beginner").map(x => x.id);
  const adv = batteryFor("advanced").map(x => x.id);
  assert.equal(beg.length, 6);
  assert.equal(adv.length, 6);
  for (const forbidden of ["finger", "repeat", "pull"]) {
    assert.ok(!beg.includes(forbidden), forbidden + " ne doit pas être proposé à un débutant");
    assert.ok(adv.includes(forbidden), forbidden + " doit être proposé à un avancé");
  }
});
