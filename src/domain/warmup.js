/* ALTARIS™ — générateur d'échauffement
   © 2026 ALTARIS™. All rights reserved.

   10 à 15 minutes adaptées à la séance : général (cardio, articulations),
   épaules, puis doigts progressivement si la séance les sollicite, et une
   traversée facile quand il y a un mur. Logique pure : reçoit la bibliothèque. */
import { usable } from "./gear.js";

/* Exercices de la base v2 (catégorie « echauffement ») et pour les doigts, la suspension passive. */
const GENERAL = ["ec01", "ec02"], SHOULDERS = "ec05", FINGERS = ["ec03", "fd01"], TRAVERSE = "ec04";
const FINGER_TYPES = ["fingerboard", "boulder", "lead", "outdoor", "strength"];
const WALL_TYPES = ["boulder", "lead", "outdoor", "endurance"];

/** La séance a-t-elle déjà un échauffement ? */
function hasWarmup(session, exercises){
  const byId = new Map((exercises || []).map(e => [e.id, e]));
  return (session.exercises || []).some(id => (byId.get(id) || {}).cat === "echauffement");
}

/**
 * Ids d'exercices d'échauffement pour cette séance, dans l'ordre. `seed` fait
 * varier l'exercice général d'une séance à l'autre. Vide si la bibliothèque
 * n'a pas d'exercices d'échauffement.
 */
function buildWarmup(session, exercises, gear, seed){
  const byId = new Map((exercises || []).map(e => [e.id, e]));
  const ok = (id) => byId.has(id) && usable(byId.get(id), gear) && !(session.exercises || []).includes(id);
  const cats = new Set((session.exercises || []).map(id => (byId.get(id) || {}).cat));
  const fingers = FINGER_TYPES.includes(session.type) || cats.has("doigts");
  const out = [];
  const general = GENERAL.filter(ok);
  if (general.length) out.push(general[Math.abs(seed || 0) % general.length]);
  if (ok(SHOULDERS)) out.push(SHOULDERS);
  if (fingers) FINGERS.filter(ok).forEach(id => out.push(id));
  if (WALL_TYPES.includes(session.type) && ok(TRAVERSE)) out.push(TRAVERSE);
  /* Bibliothèque sans ces exercices : les deux premiers de la catégorie. */
  if (!out.length) (exercises || []).filter(e => e.cat === "echauffement" && ok(e.id)).slice(0, 2).forEach(e => out.push(e.id));
  return out;
}

export { buildWarmup, hasWarmup };
