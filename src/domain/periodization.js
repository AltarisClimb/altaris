/* ALTARIS™ — objectif daté et périodisation
   © 2026 ALTARIS™. All rights reserved.

   « Projet 7c le 15 mars » : les semaines jusqu'à l'échéance sont découpées en
   phases, de la base vers la performance, avec une semaine d'affûtage à la fin.
   Le programme automatique choisit ses thèmes et son intensité selon la phase
   du jour. Logique pure. */
import { addDays, diffDays, today } from "../core.js";

const PHASES = ["base", "strength", "power", "taper"];
/* Thèmes du programme (voir program.js) qui alternent dans chaque phase, et intensité visée. */
const PHASE_THEMES = {
  base:     ["endurance", "strength", "endurance"],
  strength: ["strength", "endurance", "strength", "power"],
  power:    ["power", "strength", "power", "endurance"],
  taper:    ["power", "endurance"]
};
const PHASE_INTENSITY = { base: 5, strength: 7, power: 7, taper: 4 };

/**
 * Phases de `from` (inclus) jusqu'à l'échéance (incluse), en semaines entières :
 * dernière semaine d'affûtage (dès 2 semaines), puis ~25 % puissance, ~35 %
 * force et le reste en base. Moins de 4 semaines : force puis puissance.
 * Renvoie [{ phase, from, to }] contigus, ou [] si l'échéance est passée.
 */
function phasesUntil(goalDate, from){
  const start = from || today();
  if (!goalDate || goalDate < start) return [];
  const days = diffDays(goalDate, start) + 1;
  const weeks = Math.max(1, Math.ceil(days / 7));
  let plan;
  if (weeks === 1) plan = [["taper", 1]];
  else if (weeks < 4) plan = [["strength", weeks - 2], ["power", 1], ["taper", 1]].filter(x => x[1] > 0);
  else {
    const rest = weeks - 1;
    const power = Math.max(1, Math.round(rest * 0.25)), strength = Math.max(1, Math.round(rest * 0.35));
    plan = [["base", rest - power - strength], ["strength", strength], ["power", power], ["taper", 1]].filter(x => x[1] > 0);
  }
  /* Les semaines se comptent depuis l'échéance : c'est la première phase qui absorbe la semaine incomplète. */
  const out = [];
  let end = goalDate;
  for (let i = plan.length - 1; i >= 0; i--){
    const [phase, w] = plan[i];
    const begin = i === 0 ? start : addDays(end, -(w * 7) + 1);
    out.unshift({ phase, from: begin < start ? start : begin, to: end });
    end = addDays(begin, -1);
  }
  return out.filter(p => p.from <= p.to);
}

/** Phase d'une date, ou null en dehors de la préparation. */
function phaseOn(phases, date){
  const p = (phases || []).find(x => date >= x.from && date <= x.to);
  return p ? p.phase : null;
}

/** Objectif du profil : { text, date, days (jours restants), phases, phase (aujourd'hui) } ou null.
 *  Les phases partent du jour où l'échéance a été fixée (goalFrom) : elles ne glissent pas avec le temps. */
function goalOf(profile, day){
  const p = profile || {}, d0 = day || today();
  if (!p.goalDate || p.goalDate < d0) return null;
  const from = p.goalFrom && p.goalFrom <= d0 ? p.goalFrom : d0;
  const phases = phasesUntil(p.goalDate, from);
  return { text: p.goalText || "", date: p.goalDate, days: diffDays(p.goalDate, d0), phases, phase: phaseOn(phases, d0) };
}

export { PHASES, PHASE_INTENSITY, PHASE_THEMES, goalOf, phaseOn, phasesUntil };
