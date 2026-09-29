/* ALTARIS™ — bilan du mois
   © 2026 ALTARIS™. All rights reserved.

   Le mois écoulé en quelques chiffres qui font plaisir : séances, heures,
   semaines actives, records de charge, croix, et le dernier mot du coach.
   Logique pure : l'écran et l'image partageable (src/views/recap.js) l'affichent. */
import { weekStart } from "../core.js";
import { best, sends } from "./logbook.js";

/** "2026-09" du mois précédant `day`. */
function previousMonth(day){
  const [y, m] = day.split("-").map(Number), d = new Date(y, m - 2, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
const inMonth = (date, ym) => String(date || "").slice(0, 7) === ym;

/**
 * data : { sessions, ascents, assessments } d'un grimpeur ; ym : "2026-09".
 */
function monthRecap(data, ym){
  const sessions = (data.sessions || []).filter(s => s.status === "done" && s.type !== "rest");
  const mine = sessions.filter(s => inMonth(s.date, ym));
  const before = sessions.filter(s => s.date.slice(0, 7) < ym);
  const minutes = mine.reduce((n, s) => n + (s.actualMin || s.plannedMin || 0), 0);
  const prevYm = previousMonth(ym + "-15");
  const prev = sessions.filter(s => inMonth(s.date, prevYm));

  /* Records : la meilleure charge du mois dépasse tout ce qui précède. */
  const topOf = (list, id) => {
    const loads = list.flatMap(s => ((s.log || {})[id] || []).map(x => x.load)).filter(v => v != null && !isNaN(v));
    return loads.length ? Math.max(...loads) : null;
  };
  const ids = [...new Set(mine.flatMap(s => Object.keys(s.log || {})))];
  const records = ids.map(id => ({ exId: id, load: topOf(mine, id), prev: topOf(before, id) }))
    .filter(r => r.load != null && (r.prev == null || r.load > r.prev))
    .sort((a, b) => (b.load - (b.prev || 0)) - (a.load - (a.prev || 0)));

  const asc = (data.ascents || []).filter(a => inMonth(a.date, ym));
  const reviews = mine.filter(s => s.review && s.review.text).sort((a, b) => b.review.at - a.review.at);
  return {
    month: ym,
    sessions: mine.length, minutes,
    weeks: new Set(mine.map(s => weekStart(s.date))).size,
    prevSessions: prev.length,
    records: records.slice(0, 3),
    sends: sends(asc, "route").length + sends(asc, "boulder").length,
    flashes: asc.filter(a => a.style === "flash" || a.style === "onsight").length,
    bestRoute: best(asc, "route"), bestBoulder: best(asc, "boulder"),
    tests: (data.assessments || []).filter(a => a.status === "complete" && inMonth(a.date, ym)).length,
    coachWord: reviews.length ? { text: reviews[0].review.text, name: reviews[0].review.name } : null,
    empty: !mine.length && !asc.length
  };
}

export { monthRecap, previousMonth };
