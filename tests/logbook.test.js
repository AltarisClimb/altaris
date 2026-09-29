/* ALTARIS™ — carnet de croix et bilan du mois
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { best, bestByMonth, logStats, pyramid } from "../src/domain/logbook.js";
import { monthRecap, previousMonth } from "../src/domain/recap.js";

const A = (date, kind, grade, style) => ({ date, kind, grade, style: style || "redpoint" });
const log = [
  A("2026-09-02", "route", "7a"), A("2026-09-10", "route", "7a", "flash"), A("2026-09-12", "route", "6c+", "onsight"),
  A("2026-08-20", "route", "6c"), A("2026-09-05", "route", "7b", "project"),
  A("2026-09-15", "boulder", "6C"), A("2026-07-01", "boulder", "7A")
];

test("pyramide : de la meilleure croix vers le bas, par style, sans les projets", () => {
  const p = pyramid(log, "route", "2025-10-01", 3);
  assert.deepEqual(p.map(r => [r.grade, r.n]), [["7a", 2], ["6c+", 1], ["6c", 1]]);
  assert.equal(p[0].flash, 1); assert.equal(p[0].redpoint, 1); assert.equal(p[1].onsight, 1);
  assert.deepEqual(pyramid([], "route"), []);
  assert.equal(best(log, "route"), "7a", "le projet 7b ne compte pas");
});

test("meilleure cotation par mois et chiffres sur 12 mois", () => {
  const m = bestByMonth(log, "boulder", 3, "2026-09-30");
  assert.deepEqual(m.map(x => [x.month, x.grade]), [["2026-07", "7A"], ["2026-08", null], ["2026-09", "6C"]]);
  const s = logStats(log, "2026-09-30");
  assert.equal(s.sends, 6); assert.equal(s.flashes, 2); assert.equal(s.projects, 1);
  assert.equal(s.bestRoute, "7a"); assert.equal(s.bestBoulder, "7A");
});

test("bilan du mois : séances, records de charge, croix, mot du coach", () => {
  const S = (id, date, extra) => Object.assign({ id, date, status: "done", type: "fingerboard", actualMin: 60 }, extra);
  const sessions = [
    S("a", "2026-08-10", { log: { fd03: [{ load: 10 }] } }),
    S("b", "2026-09-02", { log: { fd03: [{ load: 12 }], ft01: [{ load: 5 }] } }),
    S("c", "2026-09-20", { review: { text: "Belle régularité", name: "Guillaume", at: 2 } }),
    S("d", "2026-09-21", { type: "rest" }), { id: "e", date: "2026-09-22", status: "planned", type: "boulder" }
  ];
  const r = monthRecap({ sessions, ascents: log, assessments: [{ status: "complete", date: "2026-09-03" }] }, "2026-09");
  assert.equal(r.sessions, 2); assert.equal(r.minutes, 120); assert.equal(r.weeks, 2); assert.equal(r.prevSessions, 1);
  assert.deepEqual(r.records.map(x => [x.exId, x.load, x.prev]).sort(), [["fd03", 12, 10], ["ft01", 5, null]].sort());
  assert.equal(r.sends, 4); assert.equal(r.bestRoute, "7a"); assert.equal(r.bestBoulder, "6C"); assert.equal(r.tests, 1);
  assert.deepEqual(r.coachWord, { text: "Belle régularité", name: "Guillaume" });
  assert.equal(monthRecap({ sessions: [], ascents: [] }, "2026-01").empty, true);
  assert.equal(previousMonth("2026-01-04"), "2025-12");
});
