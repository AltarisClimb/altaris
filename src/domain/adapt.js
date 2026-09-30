/* ALTARIS™ — plan qui s'adapte après chaque séance
   © 2026 ALTARIS™. All rights reserved.

   Après une séance validée ou une douleur signalée, la prochaine séance prévue
   est ajustée si les signaux le justifient :
   - douleur active au-dessus du seuil d'alerte → nettement allégée ;
   - deux séances d'affilée ressenties bien au-dessus de l'intensité visée → allégée ;
   - deux séances d'affilée nettement en dessous → un cran plus intense.
   Les valeurs d'origine sont gardées (adapted.from) : le coach peut annuler.
   Aucune promesse chiffrée, seulement de la prudence. Logique pure. */
import { clamp } from "../core.js";

const RULES = {
  pain: { delta: -2, factor: 0.7 },
  hard: { delta: -1, factor: 0.85 },
  easy: { delta: 1, factor: 1 }
};

/** Prochaine séance prévue (aujourd'hui ou après), hors repos et re-test. */
function nextPlanned(sessions, day){
  return sessions.filter(s => s.status === "planned" && s.type !== "rest" && !s.retest && s.date >= day)
    .sort((a, b) => (a.date + (a.time || "")) < (b.date + (b.time || "")) ? -1 : 1)[0] || null;
}

/**
 * Ajustement à appliquer, ou null.
 * opts : { sessions, pains (actives), day, painAlert }
 * → { sessionId, reason, patch }
 */
function adaptation(opts){
  const o = opts || {}, sessions = o.sessions || [];
  const next = nextPlanned(sessions, o.day);
  if (!next || next.adapted) return null;
  let reason = null;
  if ((o.pains || []).some(p => p.status === "active" && (p.eva || 0) >= (o.painAlert || 4))) reason = "pain";
  else {
    const done = sessions.filter(s => s.status === "done" && s.type !== "rest" && s.rpe && s.targetIntensity)
      .sort((a, b) => (a.date === b.date ? (b.doneAt || 0) - (a.doneAt || 0) : a.date < b.date ? 1 : -1)).slice(0, 2);
    if (done.length === 2){
      const gaps = done.map(s => s.rpe - s.targetIntensity);
      if (gaps.every(g => g >= 2)) reason = "hard";
      else if (gaps.every(g => g <= -2)) reason = "easy";
    }
  }
  if (!reason) return null;
  const r = RULES[reason], ti = next.targetIntensity || 5, pm = next.plannedMin || 60;
  const targetIntensity = clamp(ti + r.delta, 2, 9);
  const plannedMin = Math.max(20, Math.round(pm * r.factor / 5) * 5);
  if (targetIntensity === ti && plannedMin === pm) return null;
  return { sessionId: next.id, reason, patch: { targetIntensity, plannedMin,
    adapted: { reason, at: Date.now(), from: { targetIntensity: ti, plannedMin: pm } } } };
}

/** Annuler un ajustement : retour aux valeurs d'origine. */
function revertAdaptation(s){
  if (!s || !s.adapted) return s;
  const out = Object.assign({}, s, s.adapted.from || {});
  delete out.adapted;
  return out;
}

export { adaptation, nextPlanned, revertAdaptation };
