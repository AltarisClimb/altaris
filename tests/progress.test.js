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

import { badges, bestStreak, qualityDeltas } from "../src/domain/progress.js";

test("meilleure série : la plus longue suite de semaines actives, même ancienne", () => {
  const list = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-07-20", "2026-07-27"].map((d, i) => S("s" + i, d, "done"));
  assert.equal(bestStreak(list), 4);
  assert.equal(bestStreak([]), 0);
});

test("évolution par qualité entre le premier et le dernier bilan", () => {
  const a = [
    { date: "2026-03-01", status: "complete", scores: { finger: 40, core: 60 } },
    { date: "2026-09-01", status: "complete", scores: { finger: 52, core: 58, pull: 70 } },
    { date: "2026-09-10", status: "draft", scores: { finger: 99 } }
  ];
  assert.deepEqual(qualityDeltas(a).map(d => [d.domain, d.delta]), [["finger", 12], ["core", -2]]);
  assert.deepEqual(qualityDeltas(a.slice(0, 1)), []);
});

test("badges : gagnés, ou progression vers l'objectif", () => {
  const list = [];
  for (let i = 0; i < 12; i++) list.push(S("d" + i, "2026-09-" + String(1 + i).padStart(2, "0"), "done", { guided: i < 2 }));
  const b = Object.fromEntries(badges(list, []).map(x => [x.id, x]));
  assert.equal(b.first.earned, true);
  assert.equal(b.ten.earned, true);
  assert.deepEqual([b.fifty.value, b.fifty.target, b.fifty.earned], [12, 50, false]);
  assert.deepEqual([b.guided5.value, b.guided5.earned], [2, false]);
  assert.equal(b.firstTest.earned, false);
});
