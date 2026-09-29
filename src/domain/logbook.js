/* ALTARIS™ — carnet de croix : voies et blocs réalisés ou en projet
   © 2026 ALTARIS™. All rights reserved.

   Un document « ascents » par croix : { date, name, kind: "route" | "boulder",
   grade (notation française), style: "onsight" | "flash" | "redpoint" | "project",
   tries, place, notes }. Logique pure : pyramide, meilleure cotation par mois. */
import { addDays, today } from "../core.js";
import { FONT, SPORT } from "./grades.js";

const STYLES = ["onsight", "flash", "redpoint", "project"];
const KINDS = ["route", "boulder"];
const scale = (kind) => (kind === "boulder" ? FONT : SPORT);
const gradeIdx = (a) => scale(a.kind).indexOf(a.grade);
const isSend = (a) => a.style !== "project";

/** Croix réalisées d'un type, depuis une date (incluse). */
function sends(ascents, kind, since){
  return (ascents || []).filter(a => a.kind === kind && isSend(a) && gradeIdx(a) >= 0 && (!since || a.date >= since));
}

/** Meilleure cotation réalisée (ou null). */
function best(ascents, kind, since){
  const list = sends(ascents, kind, since);
  if (!list.length) return null;
  return scale(kind)[Math.max(...list.map(gradeIdx))];
}

/**
 * Pyramide : `levels` cotations en partant de la plus haute réalisée, avec le
 * nombre de croix et leur répartition par style. Vide sans croix.
 */
function pyramid(ascents, kind, since, levels){
  const list = sends(ascents, kind, since), sc = scale(kind);
  if (!list.length) return [];
  const top = Math.max(...list.map(gradeIdx)), n = levels || 5, out = [];
  for (let i = top; i > top - n && i >= 0; i--){
    const at = list.filter(a => gradeIdx(a) === i);
    out.push({ grade: sc[i], n: at.length, onsight: at.filter(a => a.style === "onsight").length,
               flash: at.filter(a => a.style === "flash").length, redpoint: at.filter(a => a.style === "redpoint").length });
  }
  return out;
}

/** Meilleure cotation réalisée chaque mois, sur les `months` derniers mois (le plus ancien d'abord). */
function bestByMonth(ascents, kind, months, day){
  const d0 = day || today(), n = months || 12, out = [];
  const [y, m] = d0.split("-").map(Number);
  for (let k = n - 1; k >= 0; k--){
    const dt = new Date(y, m - 1 - k, 1);
    const ym = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
    const inMonth = sends(ascents, kind).filter(a => a.date.slice(0, 7) === ym);
    out.push({ month: ym, grade: inMonth.length ? scale(kind)[Math.max(...inMonth.map(gradeIdx))] : null,
               idx: inMonth.length ? Math.max(...inMonth.map(gradeIdx)) : null, n: inMonth.length });
  }
  return out;
}

/** Chiffres d'ensemble sur 12 mois glissants. */
function logStats(ascents, day){
  const since = addDays(day || today(), -365), list = (ascents || []).filter(a => a.date >= since);
  return {
    sends: list.filter(isSend).length,
    flashes: list.filter(a => a.style === "flash" || a.style === "onsight").length,
    projects: (ascents || []).filter(a => a.style === "project").length,
    bestRoute: best(ascents, "route", since), bestBoulder: best(ascents, "boulder", since)
  };
}

export { KINDS, STYLES, best, bestByMonth, gradeIdx, isSend, logStats, pyramid, scale, sends };
