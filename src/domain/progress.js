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

/** Plus longue série de semaines d'affilée avec au moins une séance faite. */
function bestStreak(sessions){
  const weeks = [...new Set(sessions.filter(s => s.status === "done").map(s => weekStart(s.date)))].sort();
  let best = 0, run = 0, prev = null;
  for (const w of weeks){
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run); prev = w;
  }
  return best;
}

/** Évolution par qualité entre le premier et le dernier bilan complet (scores 0–100). */
function qualityDeltas(assessments){
  const list = assessments.filter(a => a.status === "complete" && a.scores).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 2) return [];
  const first = list[0], last = list[list.length - 1];
  return Object.keys(last.scores).filter(d => first.scores[d] != null)
    .map(d => ({ domain: d, from: first.scores[d], to: last.scores[d], delta: Math.round(last.scores[d] - first.scores[d]), since: first.date }))
    .sort((a, b) => b.delta - a.delta);
}

/* Badges : calculés à partir des données, rien n'est stocké. value/target pour
   afficher la progression de ceux qui ne sont pas encore gagnés. */
const BADGES = [
  ["first",     (x) => [x.done, 1]],
  ["ten",       (x) => [x.done, 10]],
  ["fifty",     (x) => [x.done, 50]],
  ["hours10",   (x) => [Math.floor(x.minutes / 60), 10]],
  ["fullWeek",  (x) => [x.fullWeek ? 1 : 0, 1]],
  ["streak4",   (x) => [x.best, 4]],
  ["streak12",  (x) => [x.best, 12]],
  ["guided5",   (x) => [x.guided, 5]],
  ["firstTest", (x) => [x.tests, 1]],
  ["progress",  (x) => [Math.max(0, x.bestDelta), 10]]
];
function badges(sessions, assessments){
  const done = sessions.filter(s => s.status === "done" && s.type !== "rest");
  const byWeek = {};
  sessions.filter(s => s.type !== "rest" && s.status !== "missed").forEach(s => {
    const w = weekStart(s.date); (byWeek[w] = byWeek[w] || { done: 0, total: 0 }).total++;
    if (s.status === "done") byWeek[w].done++;
  });
  const deltas = qualityDeltas(assessments || []);
  const x = {
    done: done.length,
    minutes: done.reduce((n, s) => n + (s.actualMin || s.plannedMin || 0), 0),
    fullWeek: Object.values(byWeek).some(w => w.total >= 2 && w.done === w.total),
    best: bestStreak(sessions),
    guided: done.filter(s => s.guided).length,
    tests: (assessments || []).filter(a => a.status === "complete").length,
    bestDelta: deltas.length ? deltas[0].delta : 0
  };
  return BADGES.map(([id, f]) => { const [value, target] = f(x); return { id, value: Math.min(value, target), target, earned: value >= target }; });
}

export { badges, bestStreak, focusSession, qualityDeltas, toValidate, weekProgress, weekStreak };
