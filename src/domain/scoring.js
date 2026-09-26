import { clamp, round, sum } from "../core.js";
import { Store } from "../data.js";
/* ---------------- piecewise-linear normalization ---------------- */
/** anchors: [[value, score], …] ascending by value. Returns 0–100. */
function interp(anchors, v){
  if (v == null || isNaN(v)) return null;
  if (v <= anchors[0][0]) return Math.max(0, anchors[0][1] * (v / (anchors[0][0] || 1)));
  for (let i = 0; i < anchors.length - 1; i++){
    const [x0, y0] = anchors[i], [x1, y1] = anchors[i+1];
    if (v <= x1) return y0 + (y1 - y0) * ((v - x0) / (x1 - x0));
  }
  const last = anchors[anchors.length - 1];
  return Math.min(100, last[1] + (v - last[0]) * 0.15);
}
const sexKey = (p) => ((p && p.sex) === "f" ? "f" : "m");   // "x" normalizes on the male curve, stated in the UI

/* ---------------- reference bands (ALTARIS v1) ---------------- */
const REF = {
  finger: { m:[[80,10],[100,30],[115,50],[130,70],[150,88],[170,100]],
            f:[[75,10],[94,30],[108,50],[122,70],[140,88],[158,100]] },
  repeat: { m:[[8,10],[15,30],[22,50],[32,72],[45,90],[60,100]],
            f:[[8,10],[15,30],[22,50],[32,72],[45,90],[60,100]] },
  pull:   { m:[[0,12],[15,32],[30,52],[45,72],[62,90],[80,100]],
            f:[[0,18],[10,38],[20,56],[32,74],[45,90],[60,100]] },
  core:   { m:[[3,12],[8,32],[15,52],[25,72],[40,90],[60,100]],
            f:[[3,16],[8,38],[14,58],[22,76],[35,92],[50,100]] },
  hip:    { m:[[50,15],[60,35],[70,55],[80,75],[90,92],[100,100]],
            f:[[52,15],[63,35],[74,55],[85,75],[95,92],[105,100]] },
  erot:   { m:[[60,15],[75,40],[90,65],[100,82],[110,95],[120,100]],
            f:[[65,15],[80,40],[95,65],[105,82],[115,95],[125,100]] },
  volume: { m:[[1,15],[3,38],[5,58],[8,78],[12,92],[16,100]],
            f:[[1,15],[3,38],[5,58],[8,78],[12,92],[16,100]] },
  endur:  { m:[[1,15],[3,35],[6,58],[10,78],[15,92],[20,100]],
            f:[[1,15],[3,35],[6,58],[10,78],[15,92],[20,100]] },
  bcore:  { m:[[10,15],[25,38],[45,60],[70,80],[100,93],[130,100]],
            f:[[10,15],[25,38],[45,60],[70,80],[100,93],[130,100]] }
};
const FL_COEF   = { tuck:1.0, advtuck:1.6, straddle:2.6, full:4.0 };
const POWER_PTS = { chin:25, throat:40, sternum:58, nipple:72, ribs:85, navel:100 };
const POWER_LB  = {
  chin:    ["Menton à la barre", "Chin to bar"],
  throat:  ["Gorge / clavicule", "Throat / collarbone"],
  sternum: ["Sternum", "Sternum"],
  nipple:  ["Ligne des pectoraux", "Chest line"],
  ribs:    ["Bas des côtes", "Lower ribs"],
  navel:   ["Nombril / taille", "Navel / waist"]
};
const FL_LB = {
  tuck:     ["Groupé", "Tuck"],
  advtuck:  ["Groupé avancé", "Advanced tuck"],
  straddle: ["Écarté", "Straddle"],
  full:     ["Complet", "Full"]
};

/* ---------------- test protocol catalogue ---------------- */
/* Each test declares its input fields, its derived metric and its domain. */
const TESTS = {
  /* ---- Advanced / Expert : the ALTARIS Battery (CDC §4.1) ---- */
  finger: {
    id:"finger", track:"advanced", domain:"finger", key:"t.finger", timer:{ mode:"single", work:7 },
    fields:[
      { k:"bw",    lb:"ts.bodyWeight", unit:"kg", step:.1, req:true },
      { k:"added", lb:"ts.addedLoad",  unit:"kg", step:.5, req:true, hint:"ts.assisted" }
    ],
    metric: (r) => (r.bw > 0 ? ((r.bw + r.added) / r.bw) * 100 : null),
    unit: "% BW", dec: 1,
    score: (r, p) => interp(REF.finger[sexKey(p)], (r.bw > 0 ? ((r.bw + r.added) / r.bw) * 100 : null))
  },
  repeat: {
    id:"repeat", track:"advanced", domain:"endurance", key:"t.repeat", timer:{ mode:"repeaters", work:7, rest:3 },
    fields:[
      { k:"load", lb:"ts.addedLoad", unit:"kg", step:.5, hint:"t.repeat.m" },
      { k:"reps", lb:"g.reps", unit:"reps", step:1, req:true }
    ],
    metric: (r) => r.reps, unit:"reps", dec:0,
    score: (r, p) => interp(REF.repeat[sexKey(p)], r.reps)
  },
  pull: {
    id:"pull", track:"advanced", domain:"pull", key:"t.pull",
    fields:[
      { k:"bw",    lb:"ts.bodyWeight", unit:"kg", step:.1, req:true },
      { k:"added", lb:"ts.addedLoad",  unit:"kg", step:.5, req:true }
    ],
    metric: (r) => (r.bw > 0 ? (r.added / r.bw) * 100 : null), unit:"% BW", dec:1,
    score: (r, p) => interp(REF.pull[sexKey(p)], (r.bw > 0 ? (r.added / r.bw) * 100 : null))
  },
  power: {
    id:"power", track:"advanced", domain:"power", key:"t.power",
    fields:[{ k:"height", lb:"t.power.m", type:"choice", choices:POWER_LB, req:true }],
    metric: (r) => POWER_PTS[r.height] ?? null, unit:"index", dec:0,
    score: (r) => POWER_PTS[r.height] ?? null
  },
  core: {
    id:"core", track:"advanced", domain:"core", key:"t.core", timer:{ mode:"count" },
    fields:[
      { k:"variant", lb:"g.type", type:"choice", choices:FL_LB, req:true },
      { k:"secs",    lb:"g.duration", unit:"s", step:.5, req:true },
      { k:"stable",  lb:"t.core.m", type:"scale5" }
    ],
    metric: (r) => (r.secs || 0) * (FL_COEF[r.variant] || 1), unit:"index", dec:1,
    score: (r, p) => interp(REF.core[sexKey(p)], (r.secs || 0) * (FL_COEF[r.variant] || 1))
  },
  mob: {
    id:"mob", track:"advanced", domain:"mobility", key:"t.mob",
    fields:[
      { k:"spread", lb:"t.mob.m", unit:"cm", step:1, req:true },
      { k:"height", lb:"on.height", unit:"cm", step:1, req:true },
      { k:"erot",   lb:"t.mob.m",  unit:"°",  step:1, req:true }
    ],
    metric: (r) => (r.height > 0 ? (r.spread / r.height) * 100 : null), unit:"% taille", dec:1,
    score: (r, p) => {
      const hip = interp(REF.hip[sexKey(p)], r.height > 0 ? (r.spread / r.height) * 100 : null);
      const er  = interp(REF.erot[sexKey(p)], r.erot);
      return (hip == null || er == null) ? null : hip * 0.6 + er * 0.4;
    }
  },

  /* ---- Beginner / Intermediate : no maximal edge loading (CDC §4) ---- */
  vol: {
    id:"vol", track:"beginner", domain:"volume", key:"t.vol",
    fields:[
      { k:"sessions", lb:"t.vol.m", unit:"/sem", step:.5, req:true },
      { k:"avgMin",   lb:"g.duration", unit:"min", step:5, req:true },
      { k:"months",   lb:"on.years", unit:"mois", step:1 }
    ],
    metric: (r) => ((r.sessions || 0) * (r.avgMin || 0)) / 60, unit:"h/sem", dec:1,
    score: (r) => interp(REF.volume.m, ((r.sessions || 0) * (r.avgMin || 0)) / 60)
  },
  eff: {
    id:"eff", track:"beginner", domain:"technique", key:"t.eff",
    fields:[
      { k:"clean",  lb:"t.eff.m", unit:"/20", step:1, req:true },
      { k:"moveS",  lb:"ts.work", unit:"s", step:1 },
      { k:"totalS", lb:"g.duration", unit:"s", step:1 }
    ],
    metric: (r) => ((r.clean || 0) / 20) * 100, unit:"% propres", dec:0,
    score: (r) => {
      const c = clamp(((r.clean || 0) / 20) * 100, 0, 100);
      const flow = (r.totalS > 0 && r.moveS != null) ? clamp((r.moveS / r.totalS) * 100, 0, 100) : null;
      return flow == null ? c : c * 0.6 + flow * 0.4;
    }
  },
  joint: {
    id:"joint", track:"beginner", domain:"resilience", key:"t.joint",
    fields:[
      { k:"episodes", lb:"on.injuries", unit:"", step:1, req:true },
      { k:"hangS",    lb:"g.duration", unit:"s", step:1, req:true },
      { k:"discomfort", lb:"pn.eva", type:"scale5" }
    ],
    metric: (r) => clamp(100 - (r.episodes || 0) * 12 - (((r.discomfort || 1) - 1) * 9), 0, 100), unit:"index", dec:0,
    score: (r) => {
      const base = clamp(100 - (r.episodes || 0) * 12 - (((r.discomfort || 1) - 1) * 9), 0, 100);
      const tol  = clamp(((r.hangS || 0) / 20) * 100, 0, 100);
      return base * 0.65 + tol * 0.35;
    }
  },
  basemob: {
    id:"basemob", track:"beginner", domain:"mobility", key:"t.basemob",
    fields:[
      { k:"spread", lb:"t.mob.m", unit:"cm", step:1, req:true },
      { k:"height", lb:"on.height", unit:"cm", step:1, req:true },
      { k:"shoulder", lb:"t.basemob.m", unit:"cm", step:1 },
      { k:"ankle",  lb:"t.basemob.m", unit:"cm", step:.5 }
    ],
    metric: (r) => (r.height > 0 ? (r.spread / r.height) * 100 : null), unit:"% taille", dec:1,
    score: (r, p) => {
      const hip = interp(REF.hip[sexKey(p)], r.height > 0 ? (r.spread / r.height) * 100 : null);
      const sh  = r.shoulder != null ? clamp(100 - r.shoulder * 8, 0, 100) : null;
      const an  = r.ankle != null ? clamp((r.ankle / 12) * 100, 0, 100) : null;
      const parts = [[hip, .5], [sh, .3], [an, .2]].filter(x => x[0] != null);
      if (!parts.length) return null;
      const w = sum(parts.map(x => x[1]));
      return sum(parts.map(x => x[0] * x[1])) / w;
    }
  },
  baseend: {
    id:"baseend", track:"beginner", domain:"endurance", key:"t.baseend",
    fields:[{ k:"minutes", lb:"g.duration", unit:"min", step:.5, req:true }],
    metric: (r) => r.minutes, unit:"min", dec:1,
    score: (r) => interp(REF.endur.m, r.minutes)
  },
  basecore: {
    id:"basecore", track:"beginner", domain:"core", key:"t.basecore",
    fields:[
      { k:"hollow", lb:"g.duration", unit:"s", step:1, req:true },
      { k:"raises", lb:"g.reps", unit:"reps", step:1, req:true }
    ],
    metric: (r) => (r.hollow || 0) * 0.5 + (r.raises || 0) * 2, unit:"index", dec:0,
    score: (r) => interp(REF.bcore.m, (r.hollow || 0) * 0.5 + (r.raises || 0) * 2)
  }
};
const batteryFor = (track) => Object.values(TESTS).filter(x => x.track === track);
const DOMAIN_ORDER = {
  advanced: ["finger", "endurance", "pull", "power", "core", "mobility"],
  beginner: ["volume", "technique", "endurance", "core", "mobility", "resilience"]
};

/* ---------------- scoring bands ---------------- */
function band(score){
  if (score == null) return { k:"g.noData", cls:"" };
  if (score < 35) return { k:"b.developing", cls:"crit" };
  if (score < 60) return { k:"b.solid",      cls:"warn" };
  if (score < 82) return { k:"b.strong",     cls:"good" };
  return              { k:"b.elite",      cls:"acc" };
}

/** Recompute every domain score for one assessment. */
function scoreAssessment(a, profile){
  const scores = {};
  Object.keys(a.results || {}).forEach(k => {
    const test = TESTS[k]; const r = a.results[k];
    if (!test || !r || r.skipped) return;
    const s = test.score(r, profile);
    if (s != null && !isNaN(s)) scores[test.domain] = clamp(round(s, 1), 0, 100);
  });
  return scores;
}
function latestAssessment(userId){
  const list = Store.list("assessments").filter(a => a.userId === userId && a.status === "complete");
  list.sort((x, y) => (x.date < y.date ? 1 : -1));
  return list[0] || null;
}
function assessmentsOf(userId){
  const list = Store.list("assessments").filter(a => a.userId === userId);
  list.sort((x, y) => (x.date < y.date ? 1 : -1));
  return list;
}
/** Lowest and highest scored domain of the most recent assessment. */
function limiters(userId){
  const a = latestAssessment(userId);
  if (!a || !a.scores) return null;
  const rows = Object.entries(a.scores);
  if (rows.length < 3) return null;
  rows.sort((x, y) => x[1] - y[1]);
  return { weak: rows[0], strong: rows[rows.length - 1] };
}

export { DOMAIN_ORDER, FL_COEF, FL_LB, POWER_LB, POWER_PTS, REF, TESTS, assessmentsOf, band, batteryFor, interp, latestAssessment, limiters, scoreAssessment, sexKey };
