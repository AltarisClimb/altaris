import { addDays, diffDays, round, sum, today } from "../core.js";
import { Store, config } from "../data.js";
import { latestAssessment } from "./scoring.js";
import { relDays, t } from "../i18n/index.js";
/* ================================================================
   4. WORKLOAD ANALYTICS — session load, ACWR, monotony, strain
   CDC §5. Load = RPE × duration (Foster session-RPE, arbitrary units).
   ================================================================ */
const sessionLoad = (rpe, minutes) => (rpe > 0 && minutes > 0) ? Math.round(rpe * minutes) : 0;

/** Map of ISO date -> total load, from validated sessions only. */
function dailyLoads(userId){
  const m = {};
  Store.list("sessions")
    .filter(s => s.userId === userId && s.status === "done" && s.load > 0)
    .forEach(s => { m[s.date] = (m[s.date] || 0) + s.load; });
  return m;
}
function loadSeries(userId, days, endDate){
  const end = endDate || today();
  const m = dailyLoads(userId);
  const out = [];
  for (let i = days - 1; i >= 0; i--){
    const d = addDays(end, -i);
    out.push({ date: d, load: m[d] || 0 });
  }
  return out;
}
function firstLoadDate(userId){
  const ds = Object.keys(dailyLoads(userId)).sort();
  return ds[0] || null;
}

/**
 * Acute:Chronic Workload Ratio.
 * method "ra"  : acute = Σ 7 d, chronic = Σ 28 d ÷ 4  (Gabbett rolling average)
 * method "ewma": exponentially weighted moving averages, λ = 2/(N+1)
 * Returns null while fewer than 28 days of history exist — the ratio is not
 * interpretable before then, and showing one anyway would be misleading.
 */
function computeACWR(userId, method, endDate){
  const end = endDate || today();
  const cfg = config();
  const m = method || cfg.acwrMethod || "ra";
  const first = firstLoadDate(userId);
  const history = first ? diffDays(end, first) + 1 : 0;
  const series = loadSeries(userId, 28, end);
  const acute = sum(series.slice(-7).map(x => x.load));
  const chronic = sum(series.map(x => x.load)) / 4;

  let ratio = null;
  if (history >= 28 && chronic > 0){
    if (m === "ewma"){
      const la = 2 / (7 + 1), lc = 2 / (28 + 1);
      let ea = 0, ec = 0;
      loadSeries(userId, Math.max(history, 28), end).forEach(d => {
        ea = d.load * la + ea * (1 - la);
        ec = d.load * lc + ec * (1 - lc);
      });
      ratio = ec > 0 ? ea / ec : null;
    } else {
      ratio = acute / chronic;
    }
  }
  const daysLogged = series.filter(x => x.load > 0).length;
  return { acute, chronic: Math.round(chronic), ratio: ratio == null ? null : round(ratio, 2),
           history, daysLogged, method: m, series };
}
function acwrZone(ratio){
  const c = config();
  if (ratio == null) return { key:"ld.insufficient", cls:"" };
  if (ratio < c.acwrLow)  return { key:"ld.zone.under",   cls:"warn" };
  if (ratio <= c.acwrHigh) return { key:"ld.zone.optimal", cls:"good" };
  if (ratio <= c.acwrCrit) return { key:"ld.zone.caution", cls:"warn" };
  return { key:"ld.zone.high", cls:"crit" };
}
/** Foster monotony (7 d) and strain. */
function monotonyStrain(userId, endDate){
  const s = loadSeries(userId, 7, endDate).map(x => x.load);
  const weekly = sum(s);
  const mean = weekly / 7;
  const sd = Math.sqrt(sum(s.map(x => (x - mean) * (x - mean))) / 7);
  if (weekly === 0) return { monotony: null, strain: null, weekly: 0 };
  const mono = sd > 0 ? mean / sd : null;
  return { monotony: mono == null ? null : round(mono, 2),
           strain: mono == null ? null : Math.round(weekly * mono),
           weekly: weekly };
}

/* ---------------- coach-side alerting ---------------- */
function alertsFor(userId){
  const cfg = config(), out = [];
  const activePain = Store.list("pain").filter(p => p.userId === userId && p.status === "active");
  const worst = activePain.reduce((a, p) => Math.max(a, p.eva || 0), 0);
  if (activePain.length){
    out.push({ k:"co.alertPain", sev: worst >= cfg.painAlert ? "crit" : "warn",
               d: activePain.length + " · " + t("pn.eva") + " " + worst + "/10" });
  }
  const a = computeACWR(userId);
  if (a.ratio != null){
    const z = acwrZone(a.ratio);
    if (z.cls === "crit" || z.cls === "warn")
      out.push({ k:"co.alertAcwr", sev: z.cls, d: "ACWR " + a.ratio.toFixed(2) + " · " + t(z.key) });
  }
  const missed = Store.list("sessions").filter(s =>
    s.userId === userId && s.status === "missed" && diffDays(today(), s.date) <= 14).length;
  if (missed >= 2) out.push({ k:"co.alertMissed", sev:"warn", d: missed + " / 14 " + t("g.days") });

  const u = Store.get("users", userId);
  const last = u && u.profile && u.profile.lastActive;
  if (last && (Date.now() - last) > 12 * 86400000)
    out.push({ k:"co.alertStale", sev:"warn", d: Math.round((Date.now() - last) / 86400000) + " " + t("g.days") });

  const la = latestAssessment(userId);
  if (!la) out.push({ k:"co.alertTest", sev:"warn", d: t("ts.noTests") });
  else if (diffDays(today(), la.date) > cfg.testValidityDays)
    out.push({ k:"co.alertTest", sev:"warn", d: relDays(la.date) });
  return out;
}
/** Any active pain on load-bearing structures blocks maximal tests. */
function maxLoadBlocked(userId){
  const blocking = ["finger_a2", "finger_a4", "finger_other", "elbow_med", "elbow_lat", "shoulder", "wrist"];
  return Store.list("pain").some(p => p.userId === userId && p.status === "active" && blocking.indexOf(p.location) >= 0);
}

export { acwrZone, alertsFor, computeACWR, dailyLoads, firstLoadDate, loadSeries, maxLoadBlocked, monotonyStrain, sessionLoad };
