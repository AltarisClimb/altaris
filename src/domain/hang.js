/* ALTARIS™ — minuteur de suspension (poutre) : protocoles et enchaînement des phases
   © 2026 ALTARIS™. All rights reserved.

   Logique pure : un protocole (effort, repos, répétitions, séries, repos entre
   séries) devient une suite de phases ; phaseAt() dit où l'on en est après t
   secondes. L'écran (src/views/hang.js) ne fait que l'afficher. */

/* Protocoles courants. prep = compte à rebours avant la première suspension. */
const PROTOCOLS = {
  repeaters: { work: 7,  rest: 3, reps: 6, sets: 4, setRest: 180, prep: 10 },
  maxhang:   { work: 10, rest: 0, reps: 1, sets: 5, setRest: 180, prep: 10 },
  density:   { work: 30, rest: 0, reps: 1, sets: 6, setRest: 60,  prep: 10 },
  minedge:   { work: 10, rest: 0, reps: 1, sets: 4, setRest: 120, prep: 10 }
};
const LIMITS = { work: [3, 120], rest: [0, 60], reps: [1, 20], sets: [1, 12], setRest: [0, 600], prep: [0, 30] };

function clampProto(p){
  const o = {};
  for (const k of Object.keys(LIMITS)){
    const [a, b] = LIMITS[k], v = Math.round(Number(p && p[k]));
    o[k] = Math.max(a, Math.min(b, isNaN(v) ? PROTOCOLS.repeaters[k] : v));
  }
  if (o.reps === 1) o.rest = 0;
  return o;
}

/**
 * Protocole déduit du dosage d'un exercice, ou null si le texte ne décrit pas
 * une suspension chronométrée. Exemples compris :
 *   « 6 x (7s suspension / 3s repos), 3 min entre séries » → repeaters 7/3 × 6
 *   « 5–6 x 6–10s à 85–95% de charge max, 3 min repos »    → 5 × 10 s, 3 min
 *   « 4–6 x 10s suspension / 2 min repos »                   → 4 × 10 s, 2 min
 */
function parseDose(dose){
  const s = String(dose || "").toLowerCase().replace(/[–—]/g, "-");
  const rest = (() => {
    const m = s.match(/(\d+(?:[.,]\d+)?)\s*min/);
    if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
    const r = s.match(/(\d+)\s*s\s*(?:de\s*)?(?:repos|rest|descanso)/);
    return r ? Number(r[1]) : null;
  })();
  /* Répétitions : « N x (Ws … / Rs …) » */
  let m = s.match(/(\d+)\s*(?:-\s*\d+\s*)?x\s*\(\s*(\d+)\s*s[^/]*\/\s*(\d+)\s*s/);
  if (m) return clampProto({ work: +m[2], rest: +m[3], reps: +m[1], sets: 4, setRest: rest || 180, prep: 10 });
  /* Suspensions simples : « N(-M) x W(-W2)s » */
  m = s.match(/(\d+)\s*(?:-\s*\d+\s*)?x\s*(\d+)\s*(?:-\s*(\d+)\s*)?s\b/);
  if (m) return clampProto({ work: +(m[3] || m[2]), rest: 0, reps: 1, sets: +m[1], setRest: rest || 120, prep: 10 });
  /* En toutes lettres : « 4 à 6 séries de 7-10 s » */
  m = s.match(/(\d+)\s*(?:(?:à|to|-)\s*\d+\s*)?(?:séries|sets)\s*(?:de|of)\s*(\d+)\s*(?:-\s*(\d+)\s*)?s\b/);
  if (m) return clampProto({ work: +(m[3] || m[2]), rest: 0, reps: 1, sets: +m[1], setRest: rest || 120, prep: 10 });
  return null;
}

/** Suite des phases : prep, puis pour chaque série effort / repos…, repos entre séries. */
function schedule(proto){
  const p = clampProto(proto), out = [];
  if (p.prep) out.push({ kind: "prep", dur: p.prep, set: 1, rep: 1 });
  for (let s = 1; s <= p.sets; s++){
    for (let r = 1; r <= p.reps; r++){
      out.push({ kind: "work", dur: p.work, set: s, rep: r });
      if (r < p.reps && p.rest) out.push({ kind: "rest", dur: p.rest, set: s, rep: r });
    }
    if (s < p.sets && p.setRest) out.push({ kind: "setRest", dur: p.setRest, set: s, rep: p.reps });
  }
  return out;
}

const totalDuration = (phases) => phases.reduce((n, x) => n + x.dur, 0);
/** Temps sous tension (secondes) d'un protocole complet. */
const timeUnderTension = (proto) => { const p = clampProto(proto); return p.work * p.reps * p.sets; };

/** Où en est-on après `t` secondes : index de phase, secondes restantes, fini ? */
function phaseAt(phases, t){
  let acc = 0;
  for (let i = 0; i < phases.length; i++){
    if (t < acc + phases[i].dur) return { i, phase: phases[i], left: acc + phases[i].dur - t, start: acc };
    acc += phases[i].dur;
  }
  return { i: phases.length, phase: null, left: 0, start: acc, done: true };
}
/** Début (en secondes) de la phase i : pour « passer » une phase. */
const phaseStart = (phases, i) => phases.slice(0, i).reduce((n, x) => n + x.dur, 0);

/** Répétitions faites et ratées d'une séance de suspension. */
function hangSummary(phases, reached, failed){
  const works = phases.filter(x => x.kind === "work");
  const done = works.filter(x => phases.indexOf(x) < reached).length;
  return { planned: works.length, done, failed: (failed || []).length, ok: Math.max(0, done - (failed || []).length) };
}

export { LIMITS, PROTOCOLS, clampProto, hangSummary, parseDose, phaseAt, phaseStart, schedule, timeUnderTension, totalDuration };
