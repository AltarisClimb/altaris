/* ALTARIS™ — programmes « signature » : des cycles prêts à suivre
   © 2026 ALTARIS™. All rights reserved.

   Chaque programme fixe sa durée, l'enchaînement de ses phases et les qualités
   à prioriser ; le générateur (program.js) en tire les séances sur les jours
   de disponibilité du grimpeur. Logique pure. */
import { addDays } from "../core.js";

const SIGNATURES = [
  { id: "first7a",  weeks: 8, level: "inter", icon: "target",
    phases: [["base", 3], ["strength", 3], ["power", 1], ["taper", 1]], weak: ["finger", "pull"] },
  { id: "fingers",  weeks: 6, level: "inter", icon: "hang",
    phases: [["base", 1], ["strength", 4], ["taper", 1]], weak: ["finger"] },
  { id: "comeback", weeks: 4, level: "all", icon: "shield",
    phases: [["base", 4]], weak: ["mobility", "resilience"], intensityShift: -1 },
  { id: "trip",     weeks: 6, level: "all", icon: "sun",
    phases: [["base", 1], ["strength", 2], ["power", 2], ["taper", 1]], weak: ["power", "endurance"] }
];
const byId = (id) => SIGNATURES.find(s => s.id === id) || null;

/** Phases datées d'un programme qui commence à `from` : [{ phase, from, to }]. */
function signaturePhases(sig, from){
  const out = [];
  let d = from;
  for (const [phase, w] of sig.phases){
    out.push({ phase, from: d, to: addDays(d, w * 7 - 1) });
    d = addDays(d, w * 7);
  }
  return out;
}

/** Semaine en cours d'un programme signature, d'après ses séances : { id, week, weeks } ou null. */
function signatureProgress(sessions, day){
  const mine = sessions.filter(s => s.program && s.program.signature).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!mine.length) return null;
  const last = mine[mine.length - 1];
  if (last.date < day) return null;                       // programme terminé
  const cur = mine.filter(s => s.program.id === last.program.id);
  const now = cur.find(s => s.date >= day) || last;
  return { id: last.program.signature, programId: last.program.id, week: now.program.week, weeks: now.program.weeks || cur[cur.length - 1].program.week,
           done: cur.filter(s => s.status === "done").length, total: cur.length };
}

export { SIGNATURES, byId as signatureById, signaturePhases, signatureProgress };
