/* ALTARIS™ — repères de niveau par test et comparaison de bilans
   © 2026 ALTARIS™. All rights reserved.

   « Ta force de doigts correspond à peu près à du 7b » : pour les tests de
   force mesurés (suspension maximale, traction lestée), un niveau équivalent
   tiré de repères de terrain couramment cités. Ce sont des ordres de grandeur,
   pas des normes : l'écran le dit. Ils servent à repérer ce qui retient le
   grimpeur par rapport à son propre niveau. Logique pure. */
import { FONT, SPORT } from "./grades.js";
import { TESTS } from "./scoring.js";

/* [cotation voie, valeur du test] croissants. Doigts : charge totale en % du
   poids de corps, 7-10 s sur 20 mm en demi-arqué. Traction : lest en % du poids
   de corps sur une répétition. */
const BENCH = {
  finger: [["6a", 100], ["6b", 110], ["6c", 120], ["7a", 130], ["7b", 140], ["7c", 150], ["8a", 160], ["8b", 172], ["8c", 185]],
  pull:   [["6a", 5],   ["6b", 15],  ["6c", 25],  ["7a", 35],  ["7b", 45],  ["7c", 55],  ["8a", 65],  ["8b", 75],  ["8c", 85]]
};

/** Cotation voie de référence du grimpeur : la voie, sinon le bloc converti (≈ 7A → 7b+). */
function climberGrade(profile){
  const p = profile || {};
  if (SPORT.includes(p.gradeSport)) return p.gradeSport;
  if (FONT.includes(p.gradeBoulder)){
    const base = { "4": "4", "5": "5b", "5+": "5c" }[p.gradeBoulder];
    if (base) return base;
    const i = SPORT.indexOf(p.gradeBoulder.toLowerCase());
    if (i >= 0) return SPORT[Math.min(SPORT.length - 1, i + 3)];
  }
  return null;
}

/** Niveau équivalent d'un résultat de test : { grade, below } (below = sous le premier repère), ou null. */
function gradeEquivalent(testId, result){
  const table = BENCH[testId], test = TESTS[testId];
  if (!table || !test || !result || result.skipped) return null;
  const v = test.metric(result);
  if (v == null || isNaN(v)) return null;
  let g = null;
  for (const [grade, min] of table) if (v >= min) g = grade;
  return g ? { grade: g, value: v } : { grade: table[0][0], value: v, below: true };
}

/** Écart en demi-cotations (6a → 6a+ = 1) entre l'équivalent d'un test et le niveau du grimpeur. */
function gradeGap(eq, grade){
  if (!eq || !grade) return null;
  const a = SPORT.indexOf(eq.grade), b = SPORT.indexOf(grade);
  if (a < 0 || b < 0) return null;
  return (eq.below ? a - 1 : a) - b;
}

/** Repères d'un bilan : un par test mesuré, avec l'écart au niveau du grimpeur. */
function benchmarks(assessment, profile){
  if (!assessment || !assessment.results) return [];
  const grade = climberGrade(profile);
  return Object.keys(BENCH).map(id => {
    const eq = gradeEquivalent(id, assessment.results[id]);
    if (!eq) return null;
    const gap = gradeGap(eq, grade);
    return { test: id, domain: TESTS[id].domain, grade: eq.grade, below: !!eq.below, value: eq.value,
             unit: TESTS[id].unit, gap, verdict: gap == null ? null : gap <= -2 ? "weak" : gap >= 2 ? "asset" : "match" };
  }).filter(Boolean);
}

/**
 * Qualités à cibler en priorité (au plus 2) : d'abord celles dont le repère est
 * nettement sous le niveau du grimpeur, puis la plus faible note du bilan.
 */
function focusDomains(assessment, profile){
  if (!assessment) return [];
  const out = benchmarks(assessment, profile).filter(b => b.verdict === "weak")
    .sort((a, b) => a.gap - b.gap).map(b => b.domain);
  const scores = Object.entries(assessment.scores || {}).sort((a, b) => a[1] - b[1]);
  /* Comme avant : la plus faible note, dès que le bilan en compte au moins 3. */
  if (scores.length >= 3 && !out.includes(scores[0][0])) out.push(scores[0][0]);
  return out.slice(0, 2);
}

/**
 * Comparaison de deux bilans, test par test : valeur mesurée et note avant /
 * après. Seuls les tests passés les deux fois sont gardés.
 */
function compareAssessments(prev, last){
  if (!prev || !last) return [];
  return Object.keys(last.results || {}).map(id => {
    const test = TESTS[id], a = (prev.results || {})[id], b = last.results[id];
    if (!test || !a || !b || a.skipped || b.skipped) return null;
    const from = test.metric(a), to = test.metric(b);
    if (from == null || to == null || isNaN(from) || isNaN(to)) return null;
    const sf = (prev.scores || {})[test.domain], sl = (last.scores || {})[test.domain];
    return { test: id, domain: test.domain, from, to, delta: to - from, unit: test.unit, dec: test.dec,
             scoreFrom: sf == null ? null : sf, scoreTo: sl == null ? null : sl };
  }).filter(Boolean);
}

export { BENCH, benchmarks, climberGrade, compareAssessments, focusDomains, gradeEquivalent, gradeGap };
