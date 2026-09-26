/* Analytique de charge — CDC §5.
   Charge de séance = RPE × durée. ACWR = aigu 7 j / chronique 28 j ÷ 4.
   C'est le calcul le plus sensible de la plateforme : il pilote les alertes
   envoyées au coach. Toute régression ici se voit en salle, pas en revue. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, today } from "../src/core.js";
import { acwrZone, computeACWR, maxLoadBlocked, monotonyStrain, sessionLoad } from "../src/domain/workload.js";
import { Store } from "../src/data.js";
import { logSession, resetStore, setConfig } from "./_helpers.js";

const U = "athlete-test";

test("charge de séance = RPE × durée", () => {
  assert.equal(sessionLoad(7, 90), 630);
  assert.equal(sessionLoad(10, 60), 600);
  assert.equal(sessionLoad(0, 90), 0, "sans RPE, pas de charge");
  assert.equal(sessionLoad(7, 0), 0, "sans durée, pas de charge");
});

test("charge stable : ACWR vaut exactement 1", () => {
  resetStore();
  for (let i = 0; i < 28; i++) logSession(U, addDays(today(), -i), 100);
  const r = computeACWR(U, "ra");
  assert.equal(r.acute, 700, "7 jours × 100");
  assert.equal(r.chronic, 700, "2800 ÷ 4");
  assert.equal(r.ratio, 1);
  assert.equal(acwrZone(r.ratio).key, "ld.zone.optimal");
});

test("montée de charge brutale : le ratio la détecte", () => {
  resetStore();
  for (let i = 7; i < 28; i++) logSession(U, addDays(today(), -i), 100);
  for (let i = 0; i < 7; i++) logSession(U, addDays(today(), -i), 200);
  const r = computeACWR(U, "ra");
  assert.equal(r.acute, 1400);
  assert.equal(r.chronic, 875, "(1400 + 2100) ÷ 4");
  assert.equal(r.ratio, 1.6);
  assert.equal(acwrZone(r.ratio).key, "ld.zone.high");
});

test("moins de 28 jours d'historique : aucun ratio n'est affiché", () => {
  resetStore();
  for (let i = 0; i < 10; i++) logSession(U, addDays(today(), -i), 100);
  const r = computeACWR(U, "ra");
  assert.equal(r.ratio, null, "un ratio sur historique court serait trompeur");
  assert.equal(r.history, 10);
  assert.equal(acwrZone(r.ratio).key, "ld.insufficient");
});

test("aucune donnée : pas de division par zéro", () => {
  resetStore();
  const r = computeACWR(U, "ra");
  assert.equal(r.ratio, null);
  assert.equal(r.acute, 0);
  assert.equal(r.chronic, 0);
});

test("EWMA converge vers 1 sur une charge stable", () => {
  resetStore();
  for (let i = 0; i < 60; i++) logSession(U, addDays(today(), -i), 100);
  const r = computeACWR(U, "ewma");
  assert.ok(Math.abs(r.ratio - 1) < 0.06, "obtenu " + r.ratio);
});

test("les deux méthodes s'accordent sur le sens d'une montée de charge", () => {
  resetStore();
  for (let i = 7; i < 60; i++) logSession(U, addDays(today(), -i), 100);
  for (let i = 0; i < 7; i++) logSession(U, addDays(today(), -i), 220);
  assert.ok(computeACWR(U, "ra").ratio > 1.3);
  assert.ok(computeACWR(U, "ewma").ratio > 1.3);
});

test("les séances planifiées ou manquées ne comptent pas dans la charge", () => {
  resetStore();
  for (let i = 0; i < 28; i++) logSession(U, addDays(today(), -i), 100);
  Store.data.sessions["planifiee"] = { id: "planifiee", userId: U, date: today(), status: "planned", load: 5000 };
  Store.data.sessions["manquee"]   = { id: "manquee",   userId: U, date: today(), status: "missed",  load: 5000 };
  assert.equal(computeACWR(U, "ra").acute, 700, "seules les séances validées comptent");
});

test("la charge d'un athlète n'affecte pas celle d'un autre", () => {
  resetStore();
  for (let i = 0; i < 28; i++) { logSession(U, addDays(today(), -i), 100); logSession("autre", addDays(today(), -i), 900); }
  assert.equal(computeACWR(U, "ra").acute, 700);
});

test("monotonie de Foster = moyenne ÷ écart-type sur 7 jours", () => {
  resetStore();
  const xs = [300, 0, 200, 0, 400, 0, 100];
  xs.forEach((L, i) => { if (L) logSession(U, addDays(today(), -(6 - i)), L); });
  const m = xs.reduce((a, b) => a + b) / 7;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / 7);
  const ms = monotonyStrain(U);
  assert.equal(ms.weekly, 1000);
  assert.equal(ms.monotony, Math.round((m / sd) * 100) / 100);
  assert.equal(ms.strain, Math.round(1000 * (m / sd)), "contrainte = charge hebdo × monotonie");
});

test("une semaine parfaitement plate n'a pas de monotonie définie", () => {
  resetStore();
  for (let i = 0; i < 7; i++) logSession(U, addDays(today(), -i), 100);
  const ms = monotonyStrain(U);
  assert.equal(ms.monotony, null, "écart-type nul : le ratio n'existe pas");
  assert.equal(ms.weekly, 700);
});

test("les bornes de zone sont inclusives du bon côté", () => {
  resetStore();
  assert.equal(acwrZone(0.79).key, "ld.zone.under");
  assert.equal(acwrZone(0.80).key, "ld.zone.optimal");
  assert.equal(acwrZone(1.30).key, "ld.zone.optimal");
  assert.equal(acwrZone(1.31).key, "ld.zone.caution");
  assert.equal(acwrZone(1.50).key, "ld.zone.caution");
  assert.equal(acwrZone(1.51).key, "ld.zone.high");
});

test("les seuils réglés par l'administrateur sont pris en compte", () => {
  resetStore();
  setConfig({ acwrHigh: 1.1 });
  assert.equal(acwrZone(1.2).key, "ld.zone.caution", "1.2 dépasse le seuil haut ramené à 1.1");
  resetStore();
  assert.equal(acwrZone(1.2).key, "ld.zone.optimal", "retour aux valeurs par défaut");
});

test("CDC §4 : une douleur active bloque les tests de charge maximale", () => {
  resetStore();
  Store.data.pain.p1 = { id: "p1", userId: U, status: "active", location: "finger_a2", eva: 5 };
  assert.equal(maxLoadBlocked(U), true, "poulie A2");
  Store.data.pain.p1.location = "elbow_med";
  assert.equal(maxLoadBlocked(U), true, "coude interne");
  Store.data.pain.p1.location = "shoulder";
  assert.equal(maxLoadBlocked(U), true, "épaule");
});

test("une douleur non porteuse ou résolue ne bloque pas", () => {
  resetStore();
  Store.data.pain.p1 = { id: "p1", userId: U, status: "active", location: "knee", eva: 5 };
  assert.equal(maxLoadBlocked(U), false, "le genou ne porte pas en suspension");
  Store.data.pain.p1 = { id: "p1", userId: U, status: "resolved", location: "finger_a2", eva: 5 };
  assert.equal(maxLoadBlocked(U), false, "signalement résolu");
  resetStore();
  assert.equal(maxLoadBlocked(U), false, "aucun signalement");
});
