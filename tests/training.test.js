/* ALTARIS™ — minuteur de suspension, charges, repères, périodisation, matériel, échauffement
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hangSummary, parseDose, phaseAt, phaseStart, schedule, timeUnderTension, totalDuration } from "../src/domain/hang.js";
import { missingGear, nearestEdge, edgeInText, usable } from "../src/domain/gear.js";
import { exerciseHistory, loggedExercises, suggestNext } from "../src/domain/loads.js";
import { benchmarks, climberGrade, compareAssessments, focusDomains, gradeEquivalent } from "../src/domain/benchmarks.js";
import { goalOf, phaseOn, phasesUntil } from "../src/domain/periodization.js";
import { retestStatus } from "../src/domain/progress.js";
import { buildWarmup, hasWarmup } from "../src/domain/warmup.js";
import { generateProgram } from "../src/domain/program.js";
import { addDays, diffDays } from "../src/core.js";

/* ---------- minuteur de suspension ---------- */
test("le dosage d'un exercice devient un protocole de suspension", () => {
  assert.deepEqual(parseDose("6 x (7s suspension / 3s repos), 3 min entre séries"),
    { work: 7, rest: 3, reps: 6, sets: 4, setRest: 180, prep: 10 });
  const mh = parseDose("5–6 x 6–10s à 85–95% de charge max, 3 min repos");
  assert.equal(mh.sets, 5); assert.equal(mh.work, 10); assert.equal(mh.reps, 1); assert.equal(mh.setRest, 180);
  const dh = parseDose("4–6 x 10s hang / 2 min rest");
  assert.equal(dh.sets, 4); assert.equal(dh.setRest, 120);
  const prose = parseDose("4 à 6 séries de 7-10 s, 3 min de repos. 2 séances par semaine");
  assert.equal(prose.sets, 4); assert.equal(prose.work, 10); assert.equal(prose.setRest, 180);
  assert.equal(parseDose("3 x 12 reps, 90 s repos"), null);
  assert.equal(parseDose("3 séries de 12 répétitions"), null);
  assert.equal(parseDose(""), null);
});

test("les phases s'enchaînent : prep, effort / repos, repos entre séries", () => {
  const ph = schedule({ work: 7, rest: 3, reps: 2, sets: 2, setRest: 60, prep: 5 });
  assert.deepEqual(ph.map(x => x.kind), ["prep", "work", "rest", "work", "setRest", "work", "rest", "work"]);
  assert.equal(totalDuration(ph), 5 + 7 + 3 + 7 + 60 + 7 + 3 + 7);
  assert.equal(timeUnderTension({ work: 7, rest: 3, reps: 2, sets: 2, setRest: 60, prep: 5 }), 28);
  assert.equal(phaseAt(ph, 0).phase.kind, "prep");
  const a = phaseAt(ph, 6);
  assert.equal(a.phase.kind, "work"); assert.equal(a.left, 6);
  assert.equal(phaseAt(ph, 5 + 7 + 3 + 7 + 1).phase.kind, "setRest");
  assert.ok(phaseAt(ph, 1000).done);
  assert.equal(phaseStart(ph, 2), 12);
  /* Une seule répétition par série : pas de repos entre répétitions. */
  assert.ok(!schedule({ work: 10, rest: 3, reps: 1, sets: 3, setRest: 120, prep: 0 }).some(x => x.kind === "rest"));
});

test("bilan d'une suspension : faites, ratées", () => {
  const ph = schedule({ work: 7, rest: 3, reps: 3, sets: 1, setRest: 0, prep: 0 });
  assert.deepEqual(hangSummary(ph, ph.length, [{ set: 1, rep: 3 }]), { planned: 3, done: 3, failed: 1, ok: 2 });
  assert.equal(hangSummary(ph, 2, []).done, 1);
});

/* ---------- matériel ---------- */
test("le matériel déclaré écarte les exercices infaisables", () => {
  const maxHang = { meta: { equipment: ["poutre", "haltères"] } }, campus = { meta: { equipment: ["campus board"] } };
  const none = { meta: { equipment: ["aucun"] } }, old = { id: "x" };
  assert.ok(usable(campus, null), "rien de déclaré : tout passe");
  const gear = { items: ["board"], edges: [15, 20, 25] };
  assert.ok(usable(maxHang, gear), "le lest est optionnel sur la poutre");
  assert.deepEqual(missingGear(campus, gear), ["campus"]);
  assert.ok(usable(none, gear)); assert.ok(usable(old, gear));
  assert.equal(nearestEdge([15, 25], 20), 25);
  assert.equal(nearestEdge([14, 18], 20), 18);
  assert.equal(nearestEdge([], 20), null);
  assert.equal(edgeInText("Poids de corps sur réglette 20mm"), 20);
});

/* ---------- charges ---------- */
test("historique des charges et suggestion pour la prochaine séance", () => {
  const s = (id, date, sets) => ({ id, date, status: "done", log: { fd03: sets } });
  const sessions = [
    s("a", "2026-09-01", [{ load: 10, rpe: 7.5 }, { load: 12, rpe: 9 }]),
    s("b", "2026-09-08", [{ load: 12, rpe: 6 }, { load: 12, rpe: 6 }]),
    { id: "c", date: "2026-09-10", status: "planned", log: { fd03: [{ load: 30 }] } }
  ];
  const h = exerciseHistory(sessions, "fd03");
  assert.equal(h.length, 2);
  assert.equal(h[0].top, 12);
  assert.deepEqual(suggestNext(h, 2), { load: 14, delta: 2, why: "up", last: 12, edge: null, date: "2026-09-08" });
  const failed = exerciseHistory([s("d", "2026-09-15", [{ load: 14, rpe: 9, failed: true }])], "fd03");
  assert.equal(suggestNext(failed, 2).load, 12);
  assert.equal(suggestNext(exerciseHistory([s("e", "2026-09-15", [{ load: -5, rpe: 8 }])], "fd03"), 2).why, "hold");
  assert.equal(suggestNext([], 2), null);
  assert.deepEqual(loggedExercises(sessions), ["fd03"]);
});

/* ---------- repères de niveau ---------- */
test("niveau équivalent et point faible par rapport au niveau du grimpeur", () => {
  assert.equal(climberGrade({ gradeSport: "7a" }), "7a");
  assert.equal(climberGrade({ gradeBoulder: "7A" }), "7b+");
  assert.equal(climberGrade({}), null);
  assert.equal(gradeEquivalent("finger", { bw: 70, added: 28 }).grade, "7b");       // 140 % du poids de corps
  const a = { status: "complete", date: "2026-09-01",
    results: { finger: { bw: 70, added: 7 }, pull: { bw: 70, added: 35 } },
    scores: { finger: 30, pull: 80, core: 60, mobility: 50 } };
  const b = benchmarks(a, { gradeSport: "7b" });
  const f = b.find(x => x.test === "finger"), p = b.find(x => x.test === "pull");
  assert.equal(f.grade, "6b"); assert.equal(f.verdict, "weak");
  assert.equal(p.grade, "7b"); assert.equal(p.verdict, "match");
  assert.deepEqual(focusDomains(a, { gradeSport: "7b" }), ["finger"]);
  assert.deepEqual(focusDomains(a, {}), ["finger"], "sans niveau : la note la plus basse");
});

test("comparaison de deux bilans, test par test", () => {
  const prev = { results: { finger: { bw: 70, added: 7 }, core: { skipped: true } }, scores: { finger: 30 } };
  const last = { results: { finger: { bw: 70, added: 14 }, core: { variant: "tuck", secs: 10 } }, scores: { finger: 45 } };
  const rows = compareAssessments(prev, last);
  assert.equal(rows.length, 1);
  assert.equal(Math.round(rows[0].delta), 10);
  assert.equal(rows[0].scoreFrom, 30); assert.equal(rows[0].scoreTo, 45);
});

/* ---------- objectif daté ---------- */
test("les phases vont de la base à l'affûtage et couvrent toute la préparation", () => {
  const from = "2026-10-01", goal = addDays(from, 12 * 7 - 1);
  const ph = phasesUntil(goal, from);
  assert.deepEqual(ph.map(x => x.phase), ["base", "strength", "power", "taper"]);
  assert.equal(ph[0].from, from); assert.equal(ph[ph.length - 1].to, goal);
  for (let i = 1; i < ph.length; i++) assert.equal(ph[i].from, addDays(ph[i - 1].to, 1), "contiguës");
  assert.equal(diffDays(ph[3].to, ph[3].from), 6, "une semaine d'affûtage");
  assert.equal(phaseOn(ph, goal), "taper");
  assert.deepEqual(phasesUntil(addDays(from, 3), from).map(x => x.phase), ["taper"]);
  assert.deepEqual(phasesUntil(addDays(from, 20), from).map(x => x.phase), ["strength", "power", "taper"]);
  assert.deepEqual(phasesUntil("2026-01-01", from), []);
  const g = goalOf({ goalText: "Projet 7c", goalDate: goal }, from);
  assert.equal(g.phase, "base"); assert.equal(g.days, 83);
  assert.equal(goalOf({ goalDate: "2020-01-01" }, from), null);
  /* Six semaines plus tard, les phases fixées au départ n'ont pas bougé. */
  const later = goalOf({ goalDate: goal, goalFrom: from }, addDays(from, 42));
  assert.deepEqual(later.phases, ph);
  assert.equal(later.phase, phaseOn(ph, addDays(from, 42)));
});

/* ---------- re-test ---------- */
test("re-test dû 8 semaines après le dernier bilan complet", () => {
  const list = [{ status: "complete", date: "2026-08-01" }, { status: "draft", date: "2026-09-20" }];
  assert.equal(retestStatus(list, 56, "2026-09-20").due, false);
  const due = retestStatus(list, 56, "2026-09-26");
  assert.equal(due.due, true); assert.equal(due.next, "2026-09-26"); assert.equal(due.days, 56);
  assert.equal(retestStatus([], 56, "2026-09-26").first, true);
});

/* ---------- échauffement ---------- */
test("l'échauffement suit la séance : doigts pour la poutre, traversée avec un mur", () => {
  const lib = ["ec01", "ec02", "ec03", "ec04", "ec05", "fd01"].map(id => ({ id, cat: id.startsWith("ec") ? "echauffement" : "doigts",
    meta: { equipment: id === "ec04" ? ["mur de bloc"] : id === "fd01" ? ["poutre"] : ["aucun"] } }));
  lib.push({ id: "fd03", cat: "doigts", meta: { equipment: ["poutre"] } });
  const board = buildWarmup({ type: "fingerboard", exercises: ["fd03"] }, lib, null, 0);
  assert.deepEqual(board, ["ec01", "ec05", "ec03", "fd01"]);
  assert.deepEqual(buildWarmup({ type: "mobility", exercises: [] }, lib, null, 1), ["ec02", "ec05"]);
  assert.ok(buildWarmup({ type: "boulder", exercises: [] }, lib, null, 0).includes("ec04"));
  assert.ok(!buildWarmup({ type: "boulder", exercises: [] }, lib, { items: [] }, 0).includes("ec04"), "sans mur déclaré");
  assert.ok(hasWarmup({ exercises: ["ec01"] }, lib));
  assert.ok(!hasWarmup({ exercises: ["fd03"] }, lib));
});

/* ---------- programme : phases, matériel, re-test ---------- */
test("le programme suit la phase de l'objectif, le matériel et place le re-test", () => {
  const cats = ["doigts", "tirage", "gainage", "endurance", "mobilite", "antagonistes", "pliometrie", "equilibre", "echauffement", "recuperation"];
  const exercises = [];
  cats.forEach(c => { for (let i = 0; i < 3; i++) exercises.push({ id: c + i, cat: c, lv: "all", meta: { equipment: i === 0 && c === "doigts" ? ["campus board"] : ["aucun"] } }); });
  const from = "2026-10-05";                                          // un lundi
  const phases = phasesUntil(addDays(from, 20), from);                // force, puissance, affûtage
  const list = generateProgram({ userId: "u", profile: {}, exercises, weeks: 3, from, phases,
    gear: { items: ["board"] }, retestOn: addDays(from, 7), programId: "t" });
  assert.ok(list.every(s => !s.exercises.includes("doigts0")), "pas de campus sans campus");
  const retest = list.filter(s => s.retest);
  assert.equal(retest.length, 1); assert.equal(retest[0].date, addDays(from, 7));
  const taper = list.filter(s => s.program.phase === "taper");
  assert.ok(taper.length > 0);
  taper.forEach(s => { assert.equal(s.targetIntensity, 4); assert.ok(s.exercises.length <= 4); });
  assert.ok(list.filter(s => s.program.phase === "strength").every(s => s.targetIntensity === 7));
});
