/* ALTARIS™ — progression du grimpeur : semaine en cours, série de semaines actives
   © 2026 ALTARIS™. All rights reserved.

   Logique pure (aucun DOM) : l'écran « Aujourd'hui » et la fin de séance guidée
   s'en servent, les tests aussi. */
import { addDays, diffDays, today, weekStart } from "../core.js";

/** Séances d'entraînement (hors repos) d'une semaine : faites, prévues au total, minutes. */
function weekProgress(sessions, ws){
  const from = ws || weekStart(today()), to = addDays(from, 6);
  const inWeek = sessions.filter(s => s.type !== "rest" && s.date >= from && s.date <= to && s.status !== "missed");
  const done = inWeek.filter(s => s.status === "done");
  return {
    done: done.length,
    total: inWeek.length,
    minutes: done.reduce((n, s) => n + (s.actualMin || s.plannedMin || 0), 0),
    plannedMinutes: inWeek.reduce((n, s) => n + (s.status === "done" ? (s.actualMin || 0) : (s.plannedMin || 0)), 0)
  };
}

/** Nombre de semaines d'affilée avec au moins une séance faite. La semaine en
 *  cours compte si elle en a une ; sinon on part de la précédente (la série
 *  n'est pas perdue un lundi matin). */
function weekStreak(sessions, day){
  const d0 = day || today();
  const doneWeeks = new Set(sessions.filter(s => s.status === "done").map(s => weekStart(s.date)));
  let w = weekStart(d0);
  if (!doneWeeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (doneWeeks.has(w)){ n++; w = addDays(w, -7); }
  return n;
}

/** La séance à mettre en avant aujourd'hui : prévue aujourd'hui, sinon la prochaine. */
function focusSession(sessions, day){
  const d0 = day || today();
  const planned = sessions.filter(s => s.status === "planned" && s.type !== "rest")
    .sort((a, b) => (a.date + (a.time || "")) < (b.date + (b.time || "")) ? -1 : 1);
  return planned.find(s => s.date === d0) || planned.find(s => diffDays(s.date, d0) > 0) || null;
}

/** Séances passées restées « prévues » : à valider (14 derniers jours). */
function toValidate(sessions, day){
  const d0 = day || today();
  return sessions.filter(s => s.status === "planned" && s.type !== "rest" && diffDays(d0, s.date) > 0 && diffDays(d0, s.date) <= 14);
}

export { focusSession, toValidate, weekProgress, weekStreak };
