/* ALTARIS™ — charges par série et surcharge progressive
   © 2026 ALTARIS™. All rights reserved.

   Pendant la séance guidée, chaque série peut être notée : charge (kg, négative
   = allègement à la poulie ou à l'élastique), réglette (mm), effort ressenti
   (RPE) et échec. Le journal est rangé dans la séance (session.log = { [idExercice]: [série…] }).
   Logique pure : historique par exercice et suggestion pour la prochaine fois. */

/* Effort d'une série, en un geste : valeur RPE enregistrée. */
const SET_EFFORT = [["easy", 6], ["ok", 7.5], ["hard", 9], ["max", 10]];

/** Séances faites qui ont un journal pour cet exercice, de la plus ancienne à la plus récente. */
function exerciseHistory(sessions, exId){
  return sessions
    .filter(s => s.status === "done" && s.log && (s.log[exId] || []).length)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.doneAt || 0) - (b.doneAt || 0)))
    .map(s => {
      const sets = s.log[exId];
      const loads = sets.map(x => x.load).filter(v => v != null && !isNaN(v));
      const rpes = sets.map(x => x.rpe).filter(Boolean);
      return {
        date: s.date, sessionId: s.id, sets,
        top: loads.length ? Math.max(...loads) : null,
        edge: (sets.find(x => x.edge) || {}).edge || null,
        rpe: rpes.length ? rpes.reduce((n, v) => n + v, 0) / rpes.length : null,
        failed: sets.filter(x => x.failed).length
      };
    });
}

const round05 = (v) => Math.round(v * 2) / 2;

/**
 * Charge conseillée pour la prochaine séance, d'après la dernière :
 * échec ou effort maximal → on redescend d'un pas ; séries faciles → on monte
 * d'un pas ; sinon on garde. step : 2 kg sur la poutre, 2,5 kg ailleurs.
 * null tant qu'aucune charge n'a été notée.
 */
function suggestNext(history, step){
  const last = history[history.length - 1];
  if (!last || last.top == null) return null;
  const st = step || 2.5;
  let why = "hold", load = last.top;
  if (last.failed > 0 || (last.rpe != null && last.rpe >= 9.5)){ why = "down"; load = last.top - st; }
  else if (last.rpe != null && last.rpe <= 6.5){ why = "up"; load = last.top + st; }
  return { load: round05(load), delta: round05(load - last.top), why, last: last.top, edge: last.edge, date: last.date };
}

/** Exercices qui ont au moins une charge notée, du plus récemment travaillé au plus ancien. */
function loggedExercises(sessions){
  const seen = new Map();
  sessions.filter(s => s.status === "done" && s.log).forEach(s => {
    Object.entries(s.log).forEach(([id, sets]) => {
      if (!(sets || []).some(x => x.load != null)) return;
      if (!seen.has(id) || seen.get(id) < s.date) seen.set(id, s.date);
    });
  });
  return [...seen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([id]) => id);
}

/** « +12 kg », « −5 kg », « PDC » (poids du corps). */
function fmtLoad(v, bwLabel){
  if (v == null || isNaN(v)) return "—";
  if (v === 0) return bwLabel || "0 kg";
  const n = Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (v > 0 ? "+" : "−") + n + " kg";
}

export { SET_EFFORT, exerciseHistory, fmtLoad, loggedExercises, suggestNext };
