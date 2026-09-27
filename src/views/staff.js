import { byId, diffDays, esc, iso, sum, today } from "../core.js";
import { Access, Session, Store, config, planOf } from "../data.js";
import { FONT, SPORT, THRESHOLD_FONT_IDX, THRESHOLD_SPORT_IDX, fontLabel, trackFor } from "../domain/grades.js";
import { DOMAIN_ORDER, assessmentsOf, latestAssessment, limiters } from "../domain/scoring.js";
import { weekProgress } from "../domain/progress.js";
import { acwrZone, alertsFor, computeACWR, loadSeries, monotonyStrain } from "../domain/workload.js";
import { LI, fmtDate, fmtNum, fmtTime, relDays, t } from "../i18n/index.js";
import { Remote } from "../remote.js";
import { acwrSeries, progressLines, radarChart, sparkline, workloadChart } from "../ui/charts.js";
import { ic } from "../ui/icons.js";
import { activePain, kpi, painLabel, sessionsOf, viewCalendar } from "./climber.js";
import { getThread } from "./library.js";
import { INJURY_SITES } from "./onboarding.js";
import { View, initials, isOnline, isStaff, presenceDot } from "./shell.js";
import { duration } from "./today.js";
/* ================================================================
   18. COACH COMMAND CENTER
   ================================================================ */
function viewFleet(me){
  const list = Access.climbers();
  const withAlerts = list.map(c => ({ c, al: alertsFor(c.id), a: computeACWR(c.id) }));
  withAlerts.sort((x, y) => {
    const sx = x.al.filter(a => a.sev === "crit").length * 10 + x.al.length;
    const sy = y.al.filter(a => a.sev === "crit").length * 10 + y.al.length;
    return sy - sx;
  });
  const totalCrit = sum(withAlerts.map(x => x.al.filter(a => a.sev === "crit").length));

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.coach.portal")) + '</span>' +
      '<h2>' + esc(t("co.fleet")) + '</h2><p>' + list.length + ' ' + esc(t("nav.athletes").toLowerCase()) + '</p></div>' +
      '<button class="btn sm ghost noprint" data-act="print">' + ic("print") + esc(t("g.print")) + '</button></div>' +

    '<div class="grid g4">' +
      kpi(t("nav.athletes"), String(list.length), "", t("co.fleet")) +
      kpi(t("co.alerts"), String(sum(withAlerts.map(x => x.al.length))), "", totalCrit + " " + t("pn.redFlag").toLowerCase(), totalCrit ? "crit" : "") +
      kpi(t("cal.actualLoad"), fmtNum(sum(list.map(c => monotonyStrain(c.id).weekly))), t("ld.au"), t("ov.weekLoad")) +
      kpi(t("ts.title"), String(list.filter(c => latestAssessment(c.id)).length) + " / " + list.length, "", t("ts.history")) +
    '</div>' +

    /* Une carte par grimpeur : pastille verte / orange / rouge, la semaine, la
       dernière séance, la courbe de charge et les alertes. Toute la carte ouvre la fiche. */
    (list.length ? '<div class="fl-grid">' +
      withAlerts.map(({ c, al }) => {
        const p = c.profile || {};
        const status = al.some(x => x.sev === "crit") ? "crit" : al.length ? "warn" : "good";
        const mine = sessionsOf(c.id), wk = weekProgress(mine);
        const last = mine.filter(s => s.status === "done").pop();
        return '<button class="fl-card ' + status + '" data-act="athlete" data-v="' + esc(c.id) + '">' +
          '<span class="fl-head"><span class="av-wrap"><span class="avatar">' + esc(initials(c.name)) + '</span>' + presenceDot(c) + '</span>' +
            '<span class="fl-name"><b>' + esc(c.name) + '</b>' +
              '<span class="dim tiny">' + esc(p.gradeSport || "—") + ' / ' + esc(p.gradeBoulder || "—") + '</span></span>' +
            '<span class="fl-dot ' + status + '" title="' + esc(t("fl." + status)) + '"></span></span>' +
          '<span class="fl-line">' + (isOnline(c) ? '<b class="pr-on">' + esc(t("pr.online")) + '</b> · ' : '') + esc(t("fl.week", { done: wk.done, total: wk.total })) + ' · ' +
            esc(last ? t("fl.lastDone", { when: relDays(last.date) }) : t("fl.noneDone")) + '</span>' +
          '<span class="fl-spark">' + sparkline(loadSeries(c.id, 28)) + '</span>' +
          '<span class="fl-alerts">' + (al.length
            ? al.slice(0, 3).map(x => '<span class="chip ' + x.sev + '">' + esc(t(x.k)) + '</span>').join("") +
              (al.length > 3 ? '<span class="chip">+' + (al.length - 3) + '</span>' : '')
            : '<span class="chip good">' + esc(t("co.noAlerts")) + '</span>') + '</span>' +
        '</button>';
      }).join("") + '</div>'
      : '<div class="panel"><div class="empty">' + ic("users") + '<div class="t">' + esc(t("co.noAthletes")) + '</div>' +
        '<div class="d">' + esc(t("co.noAthletesD")) + '</div></div></div>') +
  '</div>';
}

function viewAthleteFile(me){
  const u = Store.get("users", View.athlete);
  if (!u || !Access.canSee(u.id)) { View.athlete = null; return viewFleet(me); }
  const p = u.profile || {};
  const track = trackFor(p);
  const a = computeACWR(u.id, View.acwrMethod);
  const ms = monotonyStrain(u.id);
  const la = latestAssessment(u.id);
  const lim = limiters(u.id);
  const al = alertsFor(u.id);
  const pains = Store.list("pain").filter(x => x.userId === u.id).sort((x,y) => y.createdAt - x.createdAt);
  const hist = assessmentsOf(u.id);
  const recent = sessionsOf(u.id).filter(s => diffDays(today(), s.date) <= 21 && diffDays(today(), s.date) >= -7).reverse();
  const cfg = config();

  return '<div class="stack lg">' +
    '<div class="row noprint"><button class="btn sm ghost" data-act="athlete" data-v="">' + ic("chevL") + esc(t("g.back")) + '</button></div>' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("co.athleteFile")) + '</span>' +
      '<h2>' + esc(u.name) + '</h2>' +
      '<p>' + esc(track === "advanced" ? t("on.routeAdv") : t("on.routeBeg")) + ' · ' + esc(p.gradeSport||"—") + ' / ' + esc(p.gradeBoulder ? fontLabel(p.gradeBoulder) : "—") +
      (p.weightKg ? ' · ' + p.weightKg + ' kg' : '') + (p.heightCm ? ' · ' + p.heightCm + ' cm' : '') + '</p></div>' +
      '<div class="row tight noprint">' +
        '<button class="btn sm pri" data-act="plan-athlete" data-v="' + esc(u.id) + '">' + ic("cal") + esc(t("co.plan")) + '</button>' +
        '<button class="btn sm" data-act="thread-go" data-v="' + esc(u.id) + '">' + ic("chat") + esc(t("ms.title")) + '</button>' +
        '<button class="btn sm ghost" data-act="print">' + ic("print") + esc(t("g.print")) + '</button></div></div>' +

    (al.length ? '<div class="stack sm">' + al.map(x =>
      '<div class="notice ' + x.sev + '">' + ic("alert") + '<span><b>' + esc(t(x.k)) + '</b> — ' + esc(x.d) + '</span></div>').join("") + '</div>' : '') +

    '<div class="grid g4">' +
      kpi(t("ov.acwr"), a.ratio == null ? "—" : a.ratio.toFixed(2), "", t(acwrZone(a.ratio).key), acwrZone(a.ratio).cls) +
      kpi(t("ov.weekLoad"), fmtNum(ms.weekly), t("ld.au"), t("ld.formula")) +
      kpi(t("ov.monotony"), ms.monotony == null ? "—" : ms.monotony.toFixed(2), "", t("ld.monotonyD"), ms.monotony > cfg.monoHigh ? "warn" : "") +
      kpi(t("ov.lastTest"), la ? relDays(la.date) : "—", "", la ? fmtDate(la.date, {day:"2-digit",month:"short",year:"numeric"}) : t("ts.noTests")) +
    '</div>' +

    '<div class="g-split">' +
      '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ov.profile")) + '</span>' +
        (la ? radarChart(DOMAIN_ORDER[track], [{ label: t("g.today"), color:"var(--accent)", values: la.scores || {} }])
            : '<div class="empty">' + ic("test") + '<div class="t">' + esc(t("ts.noTests")) + '</div></div>') + '</div>' +
      '<div class="stack sm">' +
        (lim ? '<div class="panel pad stack sm">' +
          '<div class="stripe crit stack sm" style="gap:2px"><span class="eyebrow">' + esc(t("ov.limiter")) + '</span>' +
            '<div style="font-weight:600">' + esc(t("d."+lim.weak[0])) + ' · ' + Math.round(lim.weak[1]) + '/100</div></div>' +
          '<div class="stripe good stack sm" style="gap:2px"><span class="eyebrow">' + esc(t("ov.strength")) + '</span>' +
            '<div style="font-weight:600">' + esc(t("d."+lim.strong[0])) + ' · ' + Math.round(lim.strong[1]) + '/100</div></div></div>' : '') +
        '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("co.medical")) + '</span>' +
          ((p.injuries||[]).length ? '<div class="row tight">' + p.injuries.map(k => {
            const s = INJURY_SITES.find(x => x[0] === k);
            return '<span class="chip warn">' + esc(s ? s[1][LI()] : k) + '</span>'; }).join("") + '</div>'
            : '<p class="dim tiny">' + esc(t("g.none")) + '</p>') +
          (pains.length ? '<div class="rows" style="margin-top:4px">' + pains.slice(0,5).map(x =>
            '<div class="rw" style="padding:8px 0"><span class="stripe ' + (x.status==="resolved"?"":x.eva>=cfg.painAlert?"crit":"warn") + ' gr">' +
            '<span class="t1" style="font-size:13px">' + esc(painLabel(x.location)) + ' · ' + x.eva + '/10</span>' +
            '<span class="t2">' + esc(fmtDate(x.date)) + ' · ' + esc(t("pn.when."+x.onset)) + (x.context ? ' · ' + esc(x.context) : '') + '</span></span>' +
            '<span class="chip ' + (x.status==="resolved"?"good":"crit") + '">' + esc(x.status==="resolved"?t("pn.resolved"):t("ad.active")) + '</span></div>').join("") + '</div>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ld.title")) + '</span>' +
      workloadChart(acwrSeries(u.id, 42, View.acwrMethod)) + '</div>' +

    (hist.length > 1 ? '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ts.progress")) + '</span>' +
      progressLines(hist, DOMAIN_ORDER[track]) + '</div>' : '') +

    '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("cal.thisWeek")) + ' · 21 ' + esc(t("g.days")) + '</span>' +
      (recent.length ? '<div class="tw"><table class="dt"><thead><tr><th>' + esc(t("g.date")) + '</th><th>' + esc(t("g.name")) + '</th>' +
        '<th>' + esc(t("g.type")) + '</th><th class="n">RPE</th><th class="n">' + esc(t("g.duration")) + '</th><th class="n">' + esc(t("ld.session")) + '</th></tr></thead><tbody>' +
        recent.map(s => '<tr><td>' + esc(fmtDate(s.date, {weekday:"short",day:"2-digit",month:"short"})) + '</td>' +
          '<td>' + esc(s.title) + '</td><td><span class="chip">' + esc(t("st."+s.type)) + '</span></td>' +
          '<td class="n">' + (s.rpe || '<span class="dim">—</span>') + '</td>' +
          '<td class="n">' + ((s.actualMin || s.plannedMin || 0)) + '′</td>' +
          '<td class="n">' + (s.load ? fmtNum(s.load) : '<span class="chip ' + (s.status==="missed"?"crit":"") + '">' + esc(t("cal."+(s.status==="missed"?"missed":"planned"))) + '</span>') + '</td></tr>').join("") +
        '</tbody></table></div>' : '<p class="dim tiny">' + esc(t("g.noData")) + '</p>') +
    '</div>' +
  '</div>';
}

function viewPlanning(me){
  const list = Access.climbers();
  if (!list.length) return viewFleet(me);
  const target = View.calFor ? (byId(list, View.calFor) || list[0]) : list[0];
  return '<div class="stack lg">' +
    '<div class="row tight noprint">' + list.map(c =>
      '<button class="filt' + (c.id === target.id ? " on" : "") + '" data-act="cal-for" data-v="' + esc(c.id) + '">' + esc(c.name) + '</button>').join("") + '</div>' +
    viewCalendar(target, true) + '</div>';
}

/* ================================================================
   19. ADMIN CORE
   ================================================================ */
function viewAccounts(){
  const users = Store.list("users").sort((a,b) => a.role === b.role ? a.name.localeCompare(b.name) : (a.role === "admin" ? -1 : b.role === "admin" ? 1 : a.role === "coach" ? -1 : 1));
  /* En mode Supabase, les comptes naissent à l'inscription : pas de création ni de démo ici. */
  const remote = !!Remote.client;
  const counts = { admin:0, coach:0, climber:0 };
  users.forEach(u => counts[u.role]++);
  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.admin.portal")) + '</span>' +
      '<h2>' + esc(t("ad.accounts")) + '</h2><p>' + esc(t("ad.stats")) + ' · ' + users.length + ' ' + esc(t("nav.accounts").toLowerCase()) + '</p></div>' +
      '<div class="row tight noprint"><button class="btn sm ghost" data-act="export-all">' + ic("dl") + esc(t("ad.exportAll")) + '</button>' +
      (remote ? '' : '<button class="btn sm pri" data-act="new-account">' + ic("plus") + esc(t("ad.newAccount")) + '</button>') + '</div></div>' +
    (remote ? '<div class="notice">' + ic("info") + '<span>' + esc(t("ad.remoteAccountsD")) + '</span></div>' : '') +

    '<div class="grid g4">' +
      kpi(t("role.admin"), String(counts.admin), "", t("nav.accounts")) +
      kpi(t("role.coach"), String(counts.coach), "", t("co.fleet")) +
      kpi(t("role.climber"), String(counts.climber), "", t("nav.athletes")) +
      kpi(t("nav.tests"), String(Store.list("assessments").filter(a => a.status === "complete").length), "", t("ts.history")) +
    '</div>' +

    '<div class="panel"><div class="tw"><table class="dt" style="min-width:720px"><thead><tr>' +
      '<th>' + esc(t("g.name")) + '</th><th>' + esc(t("ad.role")) + '</th><th>' + esc(t("ad.assignCoach")) + '</th>' +
      '<th>' + esc(t("ad.plan")) + '</th><th>' + esc(t("g.status")) + '</th><th></th></tr></thead><tbody>' +
      users.map(u => {
        const coach = u.coachId ? Store.get("users", u.coachId) : null;
        return '<tr><td><span class="row tight nowrap"><span class="avatar sm' + (u.role==="admin"?" acc":"") + '">' + esc(initials(u.name)) + '</span>' +
          '<span><span style="font-weight:600;display:block">' + esc(u.name) + '</span>' +
          '<span class="dim tiny">' + esc(u.email || u.id) + '</span></span></span></td>' +
          '<td><span class="chip' + (u.role==="admin"?" acc":"") + '">' + esc(t("role."+u.role)) + '</span></td>' +
          '<td>' + (u.role === "climber" ? esc(coach ? coach.name : t("g.unassigned")) : '<span class="dim">—</span>') + '</td>' +
          '<td>' + (u.role === "climber" ? '<span class="chip' + (planOf(u) === "premium" ? ' acc' : planOf(u) === "expired" ? ' crit' : '') + '">' + esc(t("plan." + planOf(u))) + '</span>' : '<span class="dim">—</span>') + '</td>' +
          '<td><span class="chip ' + (u.status==="suspended"?"crit":"good") + '">' + esc(u.status==="suspended"?t("ad.suspended"):t("ad.active")) + '</span></td>' +
          '<td class="n noprint"><span class="row tight nowrap" style="justify-content:flex-end">' +
            '<button class="btn xs ghost" data-act="acct-edit" data-v="' + esc(u.id) + '">' + ic("edit") + '</button>' +
            '<button class="btn xs ghost" data-act="acct-toggle" data-v="' + esc(u.id) + '">' + esc(u.status==="suspended"?t("ad.reactivate"):t("ad.suspend")) + '</button>' +
            (u.id !== (Session.user && Session.user.id) ? '<button class="btn xs ghost" data-act="acct-delete" data-v="' + esc(u.id) + '" title="' + esc(t("ad.delete")) + '" aria-label="' + esc(t("ad.delete")) + '" style="color:var(--crit)">' + ic("trash") + '</button>' : '') +
          '</span></td></tr>';
      }).join("") + '</tbody></table></div></div>' +

    '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ad.subs")) + '</span>' +
      '<div class="notice">' + ic("info") + '<span>' + esc(t("ad.subsD")) + '</span></div></div>' +

    '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ad.dataOps")) + '</span>' +
      '<div class="row tight">' +
        '<button class="btn sm ghost" data-act="export-all">' + ic("dl") + esc(t("ad.exportAll")) + '</button>' +
        '<button class="btn sm danger" data-act="purge-demo">' + ic("trash") + esc(t("ad.purgeDemo")) + '</button>' +
        (remote || Store.list("users").length === 0 ? '' : '<button class="btn sm" data-act="seed-demo">' + ic("plus") + esc(t("auth.demoSeed")) + '</button>') +
      '</div></div>' +
  '</div>';
}

function viewPairings(){
  const coaches = Store.list("users").filter(u => isStaff(u) && u.status !== "suspended");
  const climbers = Store.list("users").filter(u => u.role === "climber" && u.status !== "suspended");
  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.admin.portal")) + '</span>' +
      '<h2>' + esc(t("ad.pairings")) + '</h2><p>' + esc(t("ad.pairingsD")) + '</p></div></div>' +
    (climbers.length ? '<div class="panel"><div class="tw"><table class="dt"><thead><tr>' +
      '<th>' + esc(t("role.climber")) + '</th><th>' + esc(t("pf.level")) + '</th><th>' + esc(t("ad.assignCoach")) + '</th></tr></thead><tbody>' +
      climbers.map(c => '<tr><td><span class="row tight nowrap"><span class="avatar sm">' + esc(initials(c.name)) + '</span>' +
        '<span style="font-weight:600">' + esc(c.name) + '</span></span></td>' +
        '<td><span class="chip">' + esc((c.profile||{}).gradeSport || "—") + ' / ' + esc((c.profile||{}).gradeBoulder || "—") + '</span></td>' +
        '<td><select class="inp" style="min-height:36px;max-width:260px" data-act-change="pair" data-v="' + esc(c.id) + '">' +
          '<option value="">' + esc(t("g.unassigned")) + '</option>' +
          coaches.map(k => '<option value="' + esc(k.id) + '"' + (c.coachId === k.id ? " selected" : "") + '>' + esc(k.name) + '</option>').join("") +
        '</select></td></tr>').join("") + '</tbody></table></div></div>'
      : '<div class="panel"><div class="empty">' + ic("users") + '<div class="t">' + esc(t("g.noData")) + '</div></div></div>') +
  '</div>';
}

function viewParams(){
  const c = config();
  const f = (k, lb, step, hint) => '<label class="f"><span class="lb">' + esc(lb) + '</span>' +
    '<input class="inp num" type="number" step="' + step + '" data-act-change="cfg" data-v="' + k + '" value="' + c[k] + '">' +
    (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.admin.portal")) + '</span>' +
      '<h2>' + esc(t("ad.params")) + '</h2><p>' + esc(t("ad.paramsD")) + '</p></div></div>' +
    '<div class="panel pad stack"><span class="eyebrow">' + esc(t("ld.acwr")) + '</span>' +
      '<div class="grid g3">' +
        f("acwrLow", t("ad.acwrLow"), .05, t("ld.zone.under")) +
        f("acwrHigh", t("ad.acwrHigh"), .05, t("ld.zone.optimal")) +
        f("acwrCrit", t("ad.acwrCrit"), .05, t("ld.zone.high")) +
        f("monoHigh", t("ad.monoHigh"), .1, t("ld.monotonyD")) +
      '</div>' +
      '<label class="f" style="max-width:300px"><span class="lb">' + esc(t("ld.method")) + '</span>' +
        '<select class="inp" data-act-change="cfg" data-v="acwrMethod">' +
          '<option value="ra"' + (c.acwrMethod==="ra"?" selected":"") + '>' + esc(t("ld.ra")) + '</option>' +
          '<option value="ewma"' + (c.acwrMethod==="ewma"?" selected":"") + '>' + esc(t("ld.ewma")) + '</option></select></label>' +
      '<div class="notice">' + ic("info") + '<span>' + esc(t("ld.disclaimerD")) + '</span></div>' +
    '</div>' +
    '<div class="panel pad stack"><span class="eyebrow">' + esc(t("ts.title")) + '</span>' +
      '<div class="grid g3">' +
        f("testValidityDays", t("ad.testValid") + " (" + t("g.days") + ")", 7) +
        f("painAlert", t("ad.painAlert"), 1) +
      '</div>' +
      '<div class="notice acc">' + ic("shield") + '<span><b>' + esc(t("ad.threshold")) + '</b> — ' +
        esc(SPORT[THRESHOLD_SPORT_IDX]) + ' / ' + esc(fontLabel(FONT[THRESHOLD_FONT_IDX])) + '. ' + esc(t("on.levelQD")) + '</span></div>' +
    '</div>' +
  '</div>';
}

function viewAudit(){
  const docs = Store.list("audit").sort((a,b) => a.id < b.id ? 1 : -1);
  const rows = [];
  docs.forEach(d => (d.entries||[]).forEach(e => rows.push(e)));
  rows.sort((a,b) => b.ts - a.ts);
  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.admin.portal")) + '</span>' +
      '<h2>' + esc(t("ad.audit")) + '</h2><p>' + esc(t("ad.auditD")) + '</p></div></div>' +
    (rows.length ? '<div class="panel"><div class="tw"><table class="dt"><thead><tr>' +
      '<th>' + esc(t("g.date")) + '</th><th>' + esc(t("g.name")) + '</th><th>' + esc(t("ad.role")) + '</th>' +
      '<th>' + esc(t("g.type")) + '</th><th>' + esc(t("g.notes")) + '</th></tr></thead><tbody>' +
      rows.slice(0, 200).map(e => '<tr><td class="num tiny">' + esc(fmtTime(e.ts)) + '</td>' +
        '<td>' + esc(e.actorName) + '</td><td><span class="chip">' + esc(t("role."+(e.role||"climber"))) + '</span></td>' +
        '<td><code style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + esc(e.action) + '</code></td>' +
        '<td class="dim tiny">' + esc(e.detail) + '</td></tr>').join("") + '</tbody></table></div></div>'
      : '<div class="panel"><div class="empty">' + ic("list") + '<div class="t">' + esc(t("ad.noAudit")) + '</div></div></div>') +
  '</div>';
}


/* ================================================================
   18b. À TRAITER — ce qui attend une action du coach, en une liste
   ================================================================ */
const SEV_ORDER = { crit: 0, msg: 1, warn: 2, info: 3 };

/** Éléments à traiter pour l'encadrant : messages, douleurs, séances à valider,
 *  charge hors zone, grimpeurs sans programme, bilans à refaire. */
function inboxItems(me){
  const cfg = config();
  const out = [];
  /* Admin : demandes de formule en attente (« Nils voudrait Premium »). */
  if (me.role === "admin") for (const r of Remote.requests || []){
    const c = Store.get("users", r.user_id);
    if (c) out.push({ sev: "msg", c, icon: "user", text: t("in.planReq", { plan: t("plan." + r.plan) }), act: "plan-req", v: r.id, btn: t("in.open") });
  }
  /* Visios réservées aujourd'hui avec ce coach. */
  const todayStr = new Date().toDateString();
  for (const call of (Remote.calls || []).filter(x => x.coach_id === me.id && x.booked_by && new Date(x.start).toDateString() === todayStr && x.start + x.minutes * 60000 > Date.now())){
    const u = Store.get("users", call.booked_by);
    if (u) out.push({ sev: "msg", c: u, icon: "video", text: t("vc.todayAt", { time: new Date(call.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }), act: "call-join", v: call.id, btn: t("vc.join") });
  }
  for (const c of Access.climbers()){
    const th = getThread(me.id, c.id);
    const lastRead = (th.read || {})[me.id] || 0;
    const unread = (th.messages || []).filter(m => m.from !== me.id && m.ts > lastRead).length;
    if (unread) out.push({ sev: "msg", c, icon: "chat", text: t("in.unread", { n: unread }), act: "thread-go", btn: t("in.reply") });

    for (const p of activePain(c.id)){
      out.push({ sev: (p.eva || 0) >= cfg.painAlert ? "crit" : "warn", c, icon: "pain",
        text: t("in.pain", { site: painLabel(p.location), eva: p.eva || 0 }), act: "athlete-go", btn: t("in.open") });
    }

    const mine = sessionsOf(c.id);
    const late = mine.filter(s => s.status === "planned" && diffDays(today(), s.date) > 0 && diffDays(today(), s.date) <= 14).length;
    if (late) out.push({ sev: "warn", c, icon: "check", text: t("in.toValidate", { n: late }), act: "thread-go", btn: t("in.nudge") });

    const acwr = alertsFor(c.id).find(a => a.k === "co.alertAcwr");
    if (acwr) out.push({ sev: acwr.sev, c, icon: "trend", text: t("in.load", { d: acwr.d }), act: "athlete-go", btn: t("in.open") });

    const soon = mine.some(s => s.status === "planned" && diffDays(s.date, today()) >= 0 && diffDays(s.date, today()) <= 7);
    if (!soon) out.push({ sev: "info", c, icon: "cal", text: t("in.noPlan"), act: "plan-athlete", btn: t("in.plan") });

    const la = latestAssessment(c.id);
    if (!la || diffDays(today(), la.date) > cfg.testValidityDays)
      out.push({ sev: "info", c, icon: "test", text: la ? t("in.testOld") : t("in.noTest"), act: "athlete-go", btn: t("in.open") });
  }
  return out.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.c.name.localeCompare(b.c.name));
}

/** Pastille de l'onglet : ce qui est urgent (tout sauf l'informatif). */
function inboxCount(me){ return inboxItems(me).filter(x => x.sev !== "info").length; }

function viewInbox(me){
  const items = inboxItems(me);
  const urgent = items.filter(x => x.sev !== "info");
  const later = items.filter(x => x.sev === "info");
  const row = (x) =>
    '<div class="in-row ' + x.sev + '">' +
      '<span class="in-ic">' + ic(x.icon) + '</span>' +
      '<span class="in-main"><span class="in-who">' + esc(x.c.name) + '</span>' +
        '<span class="in-what">' + esc(x.text) + '</span></span>' +
      '<button class="btn sm' + (x.sev === "info" ? ' ghost' : '') + '" data-act="' + x.act + '" data-v="' + esc(x.v || x.c.id) + '">' + esc(x.btn) + '</button>' +
    '</div>';

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("in.eyebrow")) + '</span>' +
      '<h2>' + esc(t("in.title")) + '</h2>' +
      '<p>' + esc(urgent.length ? t("in.summary", { n: urgent.length }) : t("in.allClear")) + '</p></div></div>' +

    (!Access.climbers().length
      ? '<div class="panel"><div class="empty">' + ic("users") + '<div class="t">' + esc(t("co.noAthletes")) + '</div>' +
        '<div class="d">' + esc(t("co.noAthletesD")) + '</div></div></div>'
      : (urgent.length ? '<div class="panel in-list">' + urgent.map(row).join("") + '</div>'
         : '<div class="panel"><div class="empty">' + ic("check") + '<div class="t">' + esc(t("in.allClear")) + '</div>' +
           '<div class="d">' + esc(t("in.allClearD")) + '</div></div></div>') +
        (later.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("in.later")) + '</span>' +
          '<div class="panel in-list">' + later.map(row).join("") + '</div></div>' : '') +
        recentFeed()) +
  '</div>';
}

/** Dernières séances validées par les grimpeurs (7 jours) : de quoi féliciter. */
function recentFeed(){
  const feed = Access.climbers()
    .flatMap(c => sessionsOf(c.id).filter(s => s.status === "done" && diffDays(today(), s.date) <= 7).map(s => ({ s, c })))
    .sort((a, b) => (b.s.doneAt || 0) - (a.s.doneAt || 0) || (a.s.date < b.s.date ? 1 : -1))
    .slice(0, 8);
  if (!feed.length) return "";
  return '<div class="stack sm"><span class="eyebrow">' + esc(t("in.feed")) + '</span><div class="panel in-list">' +
    feed.map(({ s, c }) =>
      '<div class="in-row feed"><span class="avatar sm">' + esc(initials(c.name)) + '</span>' +
        '<span class="in-main"><span class="in-who">' + esc(c.name.split(" ")[0]) + ' · ' + esc(s.title) + '</span>' +
          '<span class="in-what">' + esc(duration(s.actualMin || s.plannedMin)) + (s.rpe ? ' · ' + esc(t("pl.effort")) + ' ' + s.rpe + '/10' : '') +
            ' · ' + esc(relDays(s.date)) + '</span>' +
          (s.feedback ? '<span class="in-quote">« ' + esc(s.feedback) + ' »</span>' : '') + '</span>' +
        (s.kudos ? '<span class="chip acc">' + esc(s.kudos.emoji) + ' ' + esc(t("kd.given")) + '</span>'
                 : '<button class="btn sm" data-act="kudos" data-v="' + esc(s.id) + '">👏 ' + esc(t("kd.give")) + '</button>') +
      '</div>').join("") + '</div></div>';
}

/* ================================================================
   18c. ADMIN — comptes, duos, paramètres, audit sous un seul onglet
   ================================================================ */
const ADMIN_TABS = [["accounts", "nav.accounts"], ["pairings", "nav.pairings"], ["params", "nav.params"], ["audit", "nav.audit"]];
function viewAdmin(){
  const cur = ADMIN_TABS.some(x => x[0] === View.adminTab) ? View.adminTab : "accounts";
  const inner = cur === "pairings" ? viewPairings() : cur === "params" ? viewParams() : cur === "audit" ? viewAudit() : viewAccounts();
  return '<div class="stack lg">' +
    '<div class="seg noprint" role="tablist">' + ADMIN_TABS.map(([id, key]) =>
      '<button role="tab" aria-selected="' + (cur === id) + '" class="' + (cur === id ? "on" : "") + '" data-act="admin-tab" data-v="' + id + '">' +
        esc(t(key)) + '</button>').join("") + '</div>' +
    inner +
  '</div>';
}

export { inboxCount, inboxItems, viewAccounts, viewAdmin, viewAthleteFile, viewAudit, viewFleet, viewInbox, viewPairings, viewParams, viewPlanning };
