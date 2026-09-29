/* ================================================================
   3. CLIMBING DOMAIN MODEL
   Grade scales, level routing, test protocols, scoring, workload.
   ================================================================ */

/* ---------------- grade scales ---------------- */
const SPORT = ["4","5a","5b","5c","6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+","8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b"];
const FONT  = ["4","5","5+","6A","6A+","6B","6B+","6C","6C+","7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A"];
const FONT_V = { "4":"V0","5":"V1","5+":"V2","6A":"V3","6A+":"V4","6B":"V4","6B+":"V5","6C":"V5","6C+":"V6","7A":"V6","7A+":"V7","7B":"V8","7B+":"V9","7C":"V9","7C+":"V10","8A":"V11","8A+":"V12","8B":"V13","8B+":"V14","8C":"V15","8C+":"V16","9A":"V17" };
const fontLabel = (f) => f ? f + " / " + (FONT_V[f] || "") : "—";

/* Cotations affichées selon la langue de l'appli : françaises (6a, 6A) en
   français, américaines en anglais (YDS 5.10a pour la voie, échelle V pour le
   bloc). Les valeurs enregistrées restent françaises. */
const YDS = { "4":"5.6", "5a":"5.7", "5b":"5.8", "5c":"5.9", "6a":"5.10a", "6a+":"5.10b", "6b":"5.10c", "6b+":"5.10d",
  "6c":"5.11a", "6c+":"5.11b", "7a":"5.11d", "7a+":"5.12a", "7b":"5.12b", "7b+":"5.12c", "7c":"5.12d", "7c+":"5.13a",
  "8a":"5.13b", "8a+":"5.13c", "8b":"5.13d", "8b+":"5.14a", "8c":"5.14b", "8c+":"5.14c", "9a":"5.14d", "9a+":"5.15a", "9b":"5.15b" };
const sportLabel = (g, en) => !g ? "—" : en ? (YDS[g] || g) : g;
const boulderLabel = (f, en) => !f ? "—" : en ? (FONT_V[f] || f) : f;
/** Choix de cotation voie : [valeur enregistrée, libellé]. */
const sportOptions = (en) => SPORT.map(g => [g, sportLabel(g, en)]);
/** Choix de cotation bloc. En échelle V, plusieurs cotations Font partagent un
 *  même V : on garde la plus haute (V6 = 7A, le seuil du parcours avancé), plus
 *  la valeur déjà enregistrée si elle diffère. */
function boulderOptions(en, current){
  if (!en) return FONT.map(g => [g, g]);
  const byV = new Map();
  FONT.forEach(g => byV.set(FONT_V[g], g));
  const out = [...byV.entries()].map(([v, g]) => [g, v]);
  if (current && FONT.includes(current) && !out.some(o => o[0] === current))
    out.splice(out.findIndex(o => FONT.indexOf(o[0]) > FONT.indexOf(current)), 0, [current, FONT_V[current]]);
  return out;
}
/** « 7a / 6C » ou « 5.11d / V5 ». */
const gradePair = (p, en) => sportLabel((p || {}).gradeSport, en) + " / " + boulderLabel((p || {}).gradeBoulder, en);
const THRESHOLD_SPORT_IDX = SPORT.indexOf("7a");
const THRESHOLD_FONT_IDX  = FONT.indexOf("7A");

/**
 * CDC §4 routing rule: maximum level after working the route or problem.
 * Advanced/Expert requires ≥ 7a sport OR ≥ 7A Font (≈ V6).
 */
function trackFor(profile){
  if (!profile) return "beginner";
  const s = SPORT.indexOf(profile.gradeSport || "");
  const b = FONT.indexOf(profile.gradeBoulder || "");
  const adv = (s >= 0 && s >= THRESHOLD_SPORT_IDX) || (b >= 0 && b >= THRESHOLD_FONT_IDX);
  return adv ? "advanced" : "beginner";
}

export { FONT, FONT_V, SPORT, THRESHOLD_FONT_IDX, THRESHOLD_SPORT_IDX, YDS, boulderLabel, boulderOptions, fontLabel, gradePair, sportLabel, sportOptions, trackFor };
