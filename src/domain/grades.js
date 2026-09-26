/* ================================================================
   3. CLIMBING DOMAIN MODEL
   Grade scales, level routing, test protocols, scoring, workload.
   ================================================================ */

/* ---------------- grade scales ---------------- */
const SPORT = ["4","5a","5b","5c","6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+","8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b"];
const FONT  = ["4","5","5+","6A","6A+","6B","6B+","6C","6C+","7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A"];
const FONT_V = { "4":"V0","5":"V1","5+":"V2","6A":"V3","6A+":"V4","6B":"V4","6B+":"V5","6C":"V5","6C+":"V6","7A":"V6","7A+":"V7","7B":"V8","7B+":"V9","7C":"V9","7C+":"V10","8A":"V11","8A+":"V12","8B":"V13","8B+":"V14","8C":"V15","8C+":"V16","9A":"V17" };
const fontLabel = (f) => f ? f + " / " + (FONT_V[f] || "") : "—";
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

export { FONT, FONT_V, SPORT, THRESHOLD_FONT_IDX, THRESHOLD_SPORT_IDX, fontLabel, trackFor };
