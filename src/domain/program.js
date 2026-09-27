/* ALTARIS™ — programme d'entraînement automatique (1 à 4 semaines)
   © 2026 ALTARIS™. All rights reserved.

   Logique pure : à partir des disponibilités, du niveau et des points faibles
   du dernier bilan, propose des séances (échauffement, 3 exercices principaux,
   retour au calme) sur les jours libres. Intensité croissante sur 3 semaines,
   la 4e allégée. Le coach peut ensuite tout ajuster dans sa grille. */
import { addDays, today } from "../core.js";
import { weekdayIndex } from "./calendar.js";

/* Trois thèmes qui alternent sur les jours d'entraînement. */
const THEMES = [
  { key: "strength", type: "fingerboard", cats: ["doigts", "tirage", "gainage"] },
  { key: "endurance", type: "endurance", cats: ["endurance", "mobilite", "antagonistes"] },
  { key: "power", type: "boulder", cats: ["pliometrie", "equilibre", "antagonistes"] }
];
/* Qualité mesurée par les bilans → catégorie d'exercices qui la travaille. */
const DOMAIN_CAT = { finger: "doigts", pull: "tirage", power: "pliometrie", endurance: "endurance", core: "gainage",
                     mobility: "mobilite", volume: "equilibre", technique: "equilibre", resilience: "antagonistes" };
const INTENSITY = [5, 6, 7, 4];                 // semaine 4 : décharge
const DEFAULT_DAYS = [{ day: 0, start: "18:00" }, { day: 2, start: "18:00" }, { day: 4, start: "18:00" }];

/** Petit générateur pseudo-aléatoire déterministe (même grimpeur, même semaine → mêmes choix). */
function seeded(str){
  let h = 2166136261;
  for (const c of str){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/** Durée d'une séance générée : celle du créneau, entre 45 et 90 min (75 par défaut). */
function slotMinutes(s){
  if (!s || !s.start || !s.end) return 75;
  const [a, b] = [s.start, s.end].map(x => { const [h, m] = x.split(":").map(Number); return h * 60 + m; });
  return Math.max(45, Math.min(90, b - a || 75));
}

/**
 * opts : { userId, profile, exercises, weak (qualités faibles du dernier bilan),
 *          weeks (1 à 4), from (date ISO de début), until (date ISO max, essai), taken (dates déjà occupées),
 *          label (thème → titre traduit), programId }
 * Renvoie des documents « séance » prêts à enregistrer.
 */
function generateProgram(opts){
  const o = opts || {};
  const p = o.profile || {};
  const beginner = !["advanced"].includes(o.track);
  const weeks = Math.max(1, Math.min(4, o.weeks || 4));
  const from = o.from || addDays(today(), 1);
  const taken = new Set(o.taken || []);
  const days = ((p.availability || []).length ? p.availability : DEFAULT_DAYS)
    .slice().sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1))
    .filter((s, i, arr) => i === 0 || s.day !== arr[i - 1].day)          // un seul créneau par jour
    .slice(0, 4);
  const weakCats = (o.weak || []).map(d => DOMAIN_CAT[d]).filter(Boolean);
  const pool = (o.exercises || []).filter(e => !beginner || !e.lv || e.lv === "all");
  const byCat = (c) => pool.filter(e => e.cat === c);

  const pick = (list, n, rnd, avoid) => {
    const out = [], rest = list.filter(e => !avoid.has(e.id));
    while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
    return out;
  };

  const sessions = [];
  let themeIdx = 0;
  for (let w = 0; w < weeks; w++){
    const rnd = seeded((o.userId || "") + "|" + (o.programId || "") + "|" + w);
    for (let d = 0; d < 7; d++){
      const date = addDays(from, w * 7 + d);
      if (o.until && date > o.until) continue;
      const slot = days.find(s => s.day === weekdayIndex(date));
      if (!slot || taken.has(date)) continue;
      const theme = THEMES[themeIdx++ % THEMES.length];
      /* Catégories : celles du thème, les points faibles du thème d'abord. */
      const cats = theme.cats.slice().sort((a, b) => (weakCats.includes(b) ? 1 : 0) - (weakCats.includes(a) ? 1 : 0));
      const used = new Set();
      const main = [];
      for (const c of cats){
        const got = pick(byCat(c), weakCats.includes(c) && main.length === 0 ? 2 : 1, rnd, used);
        got.forEach(e => { used.add(e.id); main.push(e); });
        if (main.length >= 3) break;
      }
      const warm = pick(byCat("echauffement"), 1, rnd, used);
      const cool = pick(byCat("recuperation").length ? byCat("recuperation") : byCat("mobilite"), 1, rnd, used);
      const n = sessions.length + 1;
      sessions.push({
        id: "prg-" + (o.programId || "p") + "-" + n,
        userId: o.userId, date, time: slot.start || "18:00",
        title: (o.label ? o.label(theme.key, w + 1) : theme.key + " · S" + (w + 1)),
        type: theme.type, plannedMin: slotMinutes(slot), targetIntensity: INTENSITY[w],
        exercises: warm.concat(main.slice(0, 3), cool).map(e => e.id),
        notes: "", status: "planned",
        program: { id: o.programId || "p", week: w + 1, theme: theme.key }
      });
    }
  }
  return sessions;
}

export { DOMAIN_CAT, THEMES, generateProgram };
