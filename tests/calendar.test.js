/* ALTARIS™ — export des séances vers l'agenda (.ics)
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildICS, sessionStart, upcomingForAgenda, weekdayIndex } from "../src/domain/calendar.js";

const profile = { availability: [{ day: 2, start: "18:30", end: "20:30", type: "boulder" }] };   // mercredi
const s = { id: "s-1", date: "2026-09-30", title: "Force doigts", type: "boulder",
            plannedMin: 90, targetIntensity: 7, status: "planned", notes: "Échauffement long, puis 5×; repos" };

test("jour de la semaine : 0 = lundi, comme les créneaux", () => {
  assert.equal(weekdayIndex("2026-09-28"), 0);   // lundi
  assert.equal(weekdayIndex("2026-09-30"), 2);   // mercredi
  assert.equal(weekdayIndex("2026-10-04"), 6);   // dimanche
});

test("heure de début : celle du coach, sinon le créneau du jour, sinon aucune", () => {
  assert.equal(sessionStart({ ...s, time: "07:15" }, profile), "07:15");
  assert.equal(sessionStart(s, profile), "18:30");
  assert.equal(sessionStart({ ...s, date: "2026-10-01" }, profile), null);
});

test("seules les séances prévues à venir partent dans l'agenda, dans l'ordre", () => {
  const list = upcomingForAgenda([
    { ...s, id: "b", date: "2026-10-02" },
    { ...s, id: "a", date: "2026-09-30" },
    { ...s, id: "old", date: "2026-09-20" },
    { ...s, id: "done", status: "done" },
    { ...s, id: "rest", type: "rest" }
  ], "2026-09-26");
  assert.deepEqual(list.map(x => x.id), ["a", "b"]);
});

test("événement : heure locale, durée, rappel 1 h avant, UID stable", () => {
  const ics = buildICS([s], { profile, calName: "ALTARIS", now: new Date(Date.UTC(2026, 8, 26, 10, 0, 0)) });
  const lines = ics.split("\r\n");
  assert.ok(lines.includes("DTSTART:20260930T183000"));
  assert.ok(lines.includes("DTEND:20260930T200000"), "18:30 + 90 min");
  assert.ok(lines.includes("TRIGGER:-PT1H"));
  assert.ok(lines.includes("UID:s-1@altaris-climb.com"));
  assert.ok(lines.includes("DTSTAMP:20260926T100000Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
});

test("texte échappé (virgules, points-virgules, retours) et lignes de 75 octets max", () => {
  const ics = buildICS([s], { profile });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("5×\\; repos"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test("sans heure connue : 18:00 par défaut, durée 60 min si non précisée", () => {
  const ics = buildICS([{ ...s, date: "2026-10-01", plannedMin: 0 }], {});
  assert.ok(ics.includes("DTSTART:20261001T180000"));
  assert.ok(ics.includes("DTEND:20261001T190000"));
});
