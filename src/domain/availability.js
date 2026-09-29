/* ALTARIS™ — créneaux de disponibilité ↔ cases de 30 min (logique pure)
   © 2026 ALTARIS™. All rights reserved.
   Utilisé par la grille hebdomadaire (src/views/availgrid.js). */
const START = 6 * 60, END = 23 * 60, STEP = 30, N = (END - START) / STEP;

const toMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const toHM = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

/** Créneaux → cases [jour][case] = type | null (heures arrondies à la demi-heure). */
function toCells(slots){
  const g = Array.from({ length: 7 }, () => Array(N).fill(null));
  (slots || []).forEach(s => {
    const a = Math.max(0, Math.floor((toMin(s.start) - START) / STEP)), b = Math.min(N, Math.ceil((toMin(s.end) - START) / STEP));
    for (let i = a; i < b; i++) if (g[s.day]) g[s.day][i] = s.type || "boulder";
  });
  return g;
}
/** Cases → créneaux : une plage par suite de cases du même type. */
function toSlots(g){
  const out = [];
  g.forEach((col, day) => {
    let i = 0;
    while (i < N){
      if (!col[i]){ i++; continue; }
      const type = col[i], a = i;
      while (i < N && col[i] === type) i++;
      out.push({ day, start: toHM(START + a * STEP), end: toHM(START + i * STEP), type });
    }
  });
  return out;
}

export { END, N, START, STEP, toCells, toHM, toMin, toSlots };
