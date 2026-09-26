/* ALTARIS™ — progression : semaine en cours, série, séance du jour
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { focusSession, toValidate, weekProgress, weekStreak } from "../src/domain/progress.js";

const S = (id, date, status, extra) => Object.assign({ id, date, status, type: "boulder", plannedMin: 60 }, extra);

test("semaine : séances faites, prévues, minutes (repos et manquées exclus)", () => {
  const list = [
    S("a", "2026-09-28", "done", { actualMin: 75 }),     // lundi
    S("b", "2026-09-30", "planned"),
    S("c", "2026-10-01", "missed"),
    S("d", "2026-10-02", "planned", { type: "rest" }),
    S("e", "2026-10-06", "planned")                      // semaine suivante
  ];
  assert.deepEqual(weekProgress(list, "2026-09-28"), { done: 1, total: 2, minutes: 75, plannedMinutes: 135 });
});

test("série : semaines d'affilée avec au moins une séance faite", () => {
  const list = [S("a", "2026-09-29", "done"), S("b", "2026-09-22", "done"), S("c", "2026-09-15", "done"), S("d", "2026-09-01", "done")];
  assert.equal(weekStreak(list, "2026-10-01"), 3);
});

test("série : pas encore de séance cette semaine, la série de la semaine passée tient", () => {
  const list = [S("b", "2026-09-22", "done"), S("c", "2026-09-15", "done")];
  assert.equal(weekStreak(list, "2026-09-28"), 2);
  assert.equal(weekStreak(list, "2026-10-06"), 0, "une semaine entière sans séance casse la série");
});

test("séance du jour : celle d'aujourd'hui, sinon la prochaine ; jamais un repos", () => {
  const list = [S("rest", "2026-09-30", "planned", { type: "rest" }), S("late", "2026-09-29", "planned"),
                S("next", "2026-10-02", "planned"), S("today", "2026-09-30", "planned", { time: "18:00" })];
  assert.equal(focusSession(list, "2026-09-30").id, "today");
  assert.equal(focusSession(list, "2026-10-01").id, "next");
  assert.equal(focusSession([], "2026-10-01"), null);
});

test("à valider : séances passées restées prévues, 14 jours max", () => {
  const list = [S("y", "2026-09-29", "planned"), S("old", "2026-09-01", "planned"), S("t", "2026-09-30", "planned"), S("ok", "2026-09-28", "done")];
  assert.deepEqual(toValidate(list, "2026-09-30").map(s => s.id), ["y"]);
});
