/* ALTARIS™ — programme automatique
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateProgram } from "../src/domain/program.js";

const ex = [];
for (const cat of ["doigts", "tirage", "gainage", "endurance", "mobilite", "antagonistes", "pliometrie", "equilibre", "echauffement", "recuperation"])
  for (let i = 0; i < 4; i++) ex.push({ id: cat + i, cat, lv: i === 3 ? "adv" : "all" });

const base = { userId: "u1", programId: "p1", exercises: ex, from: "2026-10-05" };   // lundi

test("4 semaines sur les jours de disponibilité, heure et durée du créneau", () => {
  const s = generateProgram({ ...base, profile: { availability: [
    { day: 1, start: "19:00", end: "21:00" }, { day: 3, start: "12:00", end: "13:00" }] } });
  assert.equal(s.length, 8);
  assert.deepEqual(s.slice(0, 2).map(x => [x.date, x.time, x.plannedMin]), [["2026-10-06", "19:00", 90], ["2026-10-08", "12:00", 60]]);
  assert.deepEqual([...new Set(s.map(x => x.program.week))], [1, 2, 3, 4]);
});

test("sans disponibilité : lundi, mercredi, vendredi à 18:00 ; intensité 5-6-7 puis décharge", () => {
  const s = generateProgram({ ...base, profile: {} });
  assert.equal(s.length, 12);
  assert.deepEqual(s.slice(0, 3).map(x => x.date), ["2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.deepEqual([1, 2, 3, 4].map(w => s.find(x => x.program.week === w).targetIntensity), [5, 6, 7, 4]);
});

test("chaque séance : échauffement, 3 exercices, retour au calme, sans doublon", () => {
  for (const x of generateProgram({ ...base, profile: {} })){
    assert.equal(x.exercises.length, 5);
    assert.ok(x.exercises[0].startsWith("echauffement"));
    assert.ok(x.exercises[4].startsWith("recuperation"));
    assert.equal(new Set(x.exercises).size, 5);
  }
});

test("point faible prioritaire, débutant sans exercice avancé", () => {
  const s = generateProgram({ ...base, profile: {}, weak: ["core"], track: "beginner" });
  const strength = s.find(x => x.program.theme === "strength");
  assert.ok(strength.exercises.filter(id => id.startsWith("gainage")).length >= 2);
  assert.ok(s.every(x => x.exercises.every(id => !id.endsWith("3"))));
});

test("essai : une semaine, jamais après la fin de l'essai ; jours déjà pris sautés", () => {
  const s = generateProgram({ ...base, profile: {}, weeks: 1, until: "2026-10-08", taken: ["2026-10-05"] });
  assert.deepEqual(s.map(x => x.date), ["2026-10-07"]);
});

test("même grimpeur, même programme : mêmes exercices (déterministe)", () => {
  const a = generateProgram({ ...base, profile: {} }), b = generateProgram({ ...base, profile: {} });
  assert.deepEqual(a.map(x => x.exercises), b.map(x => x.exercises));
});
