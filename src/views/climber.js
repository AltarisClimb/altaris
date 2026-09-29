import { addDays, diffDays, esc, sum, today, weekStart } from "../core.js";
import { Store, config } from "../data.js";
import { Remote } from "../remote.js";
import { sessionStart, upcomingForAgenda, weekdayIndex } from "../domain/calendar.js";
import { exById, exName } from "../domain/exercises.js";
import { gradePair, trackFor } from "../domain/grades.js";
import { DOMAIN_ORDER, assessmentsOf, band, latestAssessment, limiters } from "../domain/scoring.js";
import { acwrZone, computeACWR, monotonyStrain } from "../domain/workload.js";
import { LANG, LI, fmtDate, fmtNum, relDays, t } from "../i18n/index.js";
import { acwrGauge, acwrSeries, radarChart, typeBars, workloadChart } from "../ui/charts.js";
import { ic } from "../ui/icons.js";
import { calDate, calMode, calToolbar, monthView, yearView } from "./calendar.js";
import { DAYS } from "./onboarding.js";
import { progressPanel } from "./progress.js";
import { benchPanel, loadsPanel } from "./training.js";
import { TYPE_COLOR } from "./today.js";
import { View } from "./shell.js";
/* ================================================================
   12. CLIMBER — overview
   ================================================================ */
function sessionsOf(userId){
  const l = Store.list("sessions").filter(s => s.userId === userId);
  l.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return l;
}
function nextSession(userId){
  return sessionsOf(userId).find(s => s.status === "planned" && diffDays(s.date, today()) >= 0) || null;
}
function pendingValidation(userId){
  return sessionsOf(userId).filter(s => s.status === "planned" && diffDays(today(), s.date) > 0);
}
function activePain(userId){ return Store.list("pain").filter(p => p.userId === userId && p.status === "active"); }

function viewOverview(user){
  const u = user, p = u.profile || {};
  const track = trackFor(p);
  const a = computeACWR(u.id, View.acwrMethod);
  const ms = monotonyStrain(u.id);
  const la = latestAssessment(u.id);
  const lim = limiters(u.id);
  const next = nextSession(u.id);
  const pend = pendingValidation(u.id);
  const pains = activePain(u.id);
  const cfg = config();
  const series = acwrSeries(u.id, 42, View.acwrMethod);
  const domains = DOMAIN_ORDER[track];

  const typeRows = (() => {
    const m = {};
    sessionsOf(u.id).filter(s => s.status === "done" && diffDays(today(), s.date) <= 28).forEach(s => { m[s.type] = (m[s.type]||0) + (s.load||0); });
    return Object.entries(m).map(([k,v]) => ({ k: t("st."+k), v })).sort((x,y) => y.v - x.v);
  })();

  return '<div class="stack lg">' +
    /* header */
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("role.climber.portal")) + '</span>' +
      '<h2>' + esc(t("ov.hello")) + ', ' + esc(u.name.split(" ")[0]) + '</h2>' +
      '<p>' + esc(track === "advanced" ? t("on.routeAdv") : t("on.routeBeg")) + ' · ' +
        esc(gradePair(p, LANG === "en")) + '</p></div>' +
      '<div class="row tight noprint">' +
        '<button class="btn sm" data-act="pain-new">' + ic("pain") + esc(t("ov.reportPain")) + '</button>' +
        '<button class="btn sm ghost" data-act="print">' + ic("print") + esc(t("g.print")) + '</button></div></div>' +

    /* progrès en clair et badges, avant les chiffres techniques */
    progressPanel(u) +
    loadsPanel(u, true) +

    /* alerts */
    (pains.length ? '<div class="notice ' + (Math.max(...pains.map(x=>x.eva)) >= cfg.painAlert ? "crit" : "warn") + '">' + ic("alert") +
      '<span><b>' + esc(t("pn.active")) + ' (' + pains.length + ')</b> — ' +
      pains.map(x => esc(painLabel(x.location)) + " " + x.eva + "/10").join(" · ") +
      ' <button data-act="tab" data-v="profile" style="color:inherit;text-decoration:underline;font-weight:600">' + esc(t("g.viewAll")) + '</button></span></div>' : "") +

    /* load strip */
    '<div class="g-load">' +
      '<div class="panel pad stack sm" style="align-content:start">' +
        '<div class="between"><span class="eyebrow">' + esc(t("ov.acwr")) + '</span>' +
          '<div class="seg sm"><button data-act="acwr-m" data-v="ra" class="' + ((View.acwrMethod||cfg.acwrMethod)==="ra"?"on":"") + '">' + esc(t("ld.ra")) + '</button>' +
          '<button data-act="acwr-m" data-v="ewma" class="' + ((View.acwrMethod||cfg.acwrMethod)==="ewma"?"on":"") + '">' + esc(t("ld.ewma")) + '</button></div></div>' +
        acwrGauge(a.ratio) +
        (a.ratio == null ? '<p class="dim tiny center">' + esc(t("ld.insufficientD")) + ' (' + a.history + ' / 28 ' + esc(t("g.days")) + ')</p>'
                         : '<p class="dim tiny center">' + esc(t("ld.acute")) + ' ' + fmtNum(a.acute) + ' ' + esc(t("ld.au")) +
                           ' · ' + esc(t("ld.chronic")) + ' ' + fmtNum(a.chronic) + '</p>') +
      '</div>' +
      '<div class="grid g2" style="align-content:start">' +
        kpi(t("ov.weekLoad"), fmtNum(ms.weekly), t("ld.au"), t("ld.formula")) +
        kpi(t("ov.monotony"), ms.monotony == null ? "—" : ms.monotony.toFixed(2), "", t("ld.monotonyD"),
            ms.monotony != null && ms.monotony > cfg.monoHigh ? "warn" : "") +
        kpi(t("ov.strain"), ms.strain == null ? "—" : fmtNum(ms.strain), t("ld.au"), t("ld.strainD")) +
        kpi(t("ov.lastTest"), la ? relDays(la.date) : "—", "", la ? t("ts."+(la.battery==="advanced"?"batteryAdv":"batteryBeg")) : t("ts.noTests"),
            (!la || diffDays(today(), la.date) > cfg.testValidityDays) ? "warn" : "") +
      '</div>' +
    '</div>' +

    /* next session + validations */
    '<div class="grid g2">' +
      '<div class="panel stack sm" style="padding:15px">' +
        '<span class="eyebrow">' + esc(t("ov.nextSession")) + '</span>' +
        (next ? sessionCard(next, true) :
          '<div class="empty" style="padding:20px 8px">' + ic("cal") + '<div class="t">' + esc(t("ov.noSession")) + '</div>' +
          '<div class="d">' + esc(t("ov.noSessionD")) + '</div></div>') +
      '</div>' +
      '<div class="panel stack sm" style="padding:15px">' +
        '<div class="between"><span class="eyebrow">' + esc(t("ov.toValidate")) + '</span>' +
          (pend.length ? '<span class="chip warn">' + pend.length + '</span>' : '') + '</div>' +
        (pend.length ? '<div class="rows">' + pend.slice(0,4).map(s =>
            '<button class="rw" data-act="validate" data-v="' + esc(s.id) + '">' +
              '<span class="gr"><span class="t1">' + esc(s.title) + '</span>' +
              '<span class="t2">' + esc(fmtDate(s.date, {weekday:"short",day:"2-digit",month:"short"})) + ' · ' + esc(t("st."+s.type)) + '</span></span>' +
              '<span class="chip acc">' + esc(t("ov.validate")) + '</span></button>').join("") + '</div>'
          : '<div class="empty" style="padding:20px 8px">' + ic("check") + '<div class="t">' + esc(t("g.none")) + '</div>' +
            '<div class="d">' + esc(t("ov.toValidateD")) + '</div></div>') +
      '</div>' +
    '</div>' +

    /* performance profile */
    '<div class="g-split">' +
      '<div class="panel pad stack sm">' +
        '<div class="between"><span class="eyebrow">' + esc(t("ov.profile")) + '</span>' +
          (la ? '<span class="chip">' + esc(fmtDate(la.date, {day:"2-digit",month:"short",year:"numeric"})) + '</span>' : "") + '</div>' +
        (la ? radarChart(domains, [{ label: fmtDate(la.date), color:"var(--accent)", values: la.scores || {} }]
              .concat((function(){ const prev = assessmentsOf(u.id).filter(x => x.status==="complete")[1];
                return prev ? [{ label: t("ts.previous") + " · " + fmtDate(prev.date), color:"var(--s2)", dash:true, values: prev.scores || {} }] : []; })()))
            : '<div class="empty">' + ic("test") + '<div class="t">' + esc(t("ts.noTests")) + '</div>' +
              '<div class="d">' + esc(t("ts.completeD")) + '</div>' +
              '<button class="btn pri sm" style="margin-top:12px" data-act="tab" data-v="tests">' + esc(t("ov.doTest")) + '</button></div>') +
      '</div>' +
      '<div class="stack sm">' +
        (lim ? '<div class="panel pad stack sm">' +
          '<div class="stripe crit stack sm" style="gap:2px"><span class="eyebrow">' + esc(t("ov.limiter")) + '</span>' +
            '<div style="font-weight:600;font-size:15px">' + esc(t("d."+lim.weak[0])) + '</div>' +
            '<div class="dim tiny">' + esc(t("ts.score")) + ' ' + Math.round(lim.weak[1]) + '/100 · ' + esc(t("b.limiting")) + '</div></div>' +
          '<div class="stripe good stack sm" style="gap:2px"><span class="eyebrow">' + esc(t("ov.strength")) + '</span>' +
            '<div style="font-weight:600;font-size:15px">' + esc(t("d."+lim.strong[0])) + '</div>' +
            '<div class="dim tiny">' + esc(t("ts.score")) + ' ' + Math.round(lim.strong[1]) + '/100 · ' + esc(t(band(lim.strong[1]).k)) + '</div></div>' +
          '</div>' : "") +
        (typeRows.length ? '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("cal.actualLoad")) + ' · 28 ' + esc(t("g.days")) + '</span>' +
          typeBars(typeRows) + '</div>' : "") +
      '</div>' +
    '</div>' +

    benchPanel(u, la) +

    /* workload */
    '<div class="panel pad stack sm">' +
      '<div class="between"><span class="eyebrow">' + esc(t("ld.title")) + ' · 42 ' + esc(t("g.days")) + '</span>' +
        '<span class="chip">' + esc(t("ld.method")) + ' : ' + esc(t((View.acwrMethod||cfg.acwrMethod) === "ewma" ? "ld.ewma" : "ld.ra")) + '</span></div>' +
      workloadChart(series) +
      '<details class="dim tiny" style="margin-top:2px"><summary style="cursor:pointer;font-weight:600;color:var(--ink-2)">' +
        esc(t("ld.disclaimer")) + '</summary><p style="margin-top:6px;line-height:1.6">' + esc(t("ld.disclaimerD")) + '</p></details>' +
    '</div>' +
  '</div>';
}

function kpi(k, v, unit, sub, cls){
  return '<div class="kpi ' + (cls||"") + '"><span class="k">' + esc(k) + '</span>' +
    '<span class="v">' + esc(v) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span>' +
    (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</div>';
}

function sessionCard(s, showAction){
  const done = s.status === "done";
  const tm = sessionStart(s, (Store.get("users", s.userId) || {}).profile);
  return '<div class="stack sm">' +
    '<div class="row" style="gap:8px"><span class="chip acc">' + esc(fmtDate(s.date, {weekday:"long",day:"numeric",month:"long"})) + (tm ? ' · ' + esc(tm) : '') + '</span>' +
      '<span class="chip">' + esc(t("st."+s.type)) + '</span>' +
      '<span class="chip">' + (done ? s.actualMin : s.plannedMin) + ' ' + esc(t("g.min")) + '</span>' +
      (done ? '<span class="chip good">RPE ' + s.rpe + ' · ' + fmtNum(s.load) + ' ' + esc(t("ld.au")) + '</span>' : '') + '</div>' +
    '<div style="font-family:var(--serif);font-size:20px;font-weight:600">' + esc(s.title) + '</div>' +
    (s.notes ? '<p class="muted small" style="line-height:1.55">' + esc(s.notes) + '</p>' : '') +
    ((s.exercises||[]).length ? '<div class="row tight">' + s.exercises.slice(0,5).map(id => {
      const e = exById(id); return e ? '<span class="chip">' + esc(exName(e)) + '</span>' : ""; }).join("") +
      ((s.exercises||[]).length > 5 ? '<span class="chip">+' + ((s.exercises||[]).length - 5) + '</span>' : '') + '</div>' : '') +
    (showAction ? '<div class="row tight noprint"><button class="btn sm pri" data-act="session-open" data-v="' + esc(s.id) + '">' +
      ic("list") + esc(t("cal.sessionSheet")) + '</button>' +
      (diffDays(today(), s.date) >= 0 && !done ? '<button class="btn sm" data-act="validate" data-v="' + esc(s.id) + '">' + ic("check") + esc(t("ov.validate")) + '</button>' : '') +
      '</div>' : '') +
  '</div>';
}

/* ================================================================
   13. CALENDAR
   ================================================================ */
/* Coach : grille de la semaine, glisser-déposer pour déplacer une séance. */
function planningGrid(user){
  const asCoach = true;
  const u = user, p = u.profile || {};
  const mode = calMode();
  const ws = weekStart(calDate());
  const days = []; for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
  const all = sessionsOf(u.id);
  const inWeek = all.filter(s => days.indexOf(s.date) >= 0);
  const plannedLoad = sum(inWeek.filter(s => s.status !== "done").map(s => (s.plannedMin||0) * (s.targetIntensity||5)));
  const actualLoad  = sum(inWeek.filter(s => s.status === "done").map(s => s.load||0));
  const avail = p.availability || [];

  const head = '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("cal.title")) + '</span>' +
      '<h2>' + esc(asCoach ? u.name : t("nav.calendar")) + '</h2></div>' +
      '<div class="row tight noprint">' +
        (asCoach && Remote.client ? '<button class="btn sm" data-act="call-slots">' + ic("video") + esc(t("vc.slots")) + '</button>' : '') +
        (asCoach ? '<button class="btn sm pri" data-act="block-new" data-v="' + esc(u.id) + '"' + (mode === "day" ? ' data-d="' + calDate() + '"' : '') + '>' +
          ic("plus") + esc(t("cal.addBlock")) + '</button>' : '') +
      '</div></div>' + calToolbar();

  /* Mois, Année, Jour : vues partagées. La Semaine garde la grille de planification ci-dessous. */
  if (mode === "month") return '<div class="stack lg">' + head +
    '<div class="notice">' + ic("info") + '<span>' + esc(t("cal.dragHint")) + '</span></div>' +
    '<div class="panel pad">' + monthView(all, p, { asCoach: true, userId: u.id }) + '</div></div>';
  if (mode === "year") return '<div class="stack lg">' + head + '<div class="panel pad">' + yearView(all) + '</div></div>';
  if (mode === "day") return '<div class="stack lg">' + head + '<div class="panel ag">' + dayBlock(u, calDate(), true) + '</div></div>';

  return '<div class="stack lg">' + head +

    '<div class="grid g4">' +
      kpi(t("cal.plannedLoad"), fmtNum(plannedLoad), t("ld.au"), t("ld.formula")) +
      kpi(t("cal.actualLoad"), fmtNum(actualLoad), t("ld.au"), inWeek.filter(s=>s.status==="done").length + " / " + inWeek.length) +
      kpi(t("ov.acwr"), (function(){ const r = computeACWR(u.id).ratio; return r == null ? "—" : r.toFixed(2); })(), "",
          t(acwrZone(computeACWR(u.id).ratio).key), acwrZone(computeACWR(u.id).ratio).cls) +
      kpi(t("cal.myAvail"), String(avail.length), "", t("cal.editAvail")) +
    '</div>' +

    (asCoach ? '<div class="notice">' + ic("info") + '<span>' + esc(t("cal.dragHint")) + '</span></div>' : '') +

    '<div class="panel pad">' +
      '<div class="cal">' +
        DAYS.map(d => '<div class="dh">' + esc(d[LI()].slice(0,3)) + '</div>').join("") +
        days.map((d, di) => {
          const list = all.filter(s => s.date === d).sort(byTime(p));
          const slots = avail.filter(s => s.day === di);
          const isToday = d === today(), isPast = diffDays(today(), d) > 0;
          return '<div class="day' + (isToday ? " today" : "") + (isPast ? " past" : "") + '" data-drop="' + d + '">' +
            '<div class="dn">' + esc(fmtDate(d, {day:"numeric",month: window.innerWidth < 641 ? "long" : undefined, weekday: window.innerWidth < 641 ? "long" : undefined })) + '</div>' +
            slots.map(s => '<div class="av">' + esc(s.start) + '–' + esc(s.end) + ' · ' + esc(t("st."+s.type)) + '</div>').join("") +
            list.map(s => {
              const cls = s.status === "done" ? "done" : s.status === "missed" ? "missed" : s.type === "rest" ? "rest" : "";
              return '<button class="blk ' + cls + '" data-act="session-open" data-v="' + esc(s.id) + '" style="--type:' + (TYPE_COLOR[s.type] || 'var(--accent)') + '"' +
                (asCoach ? ' draggable="true" data-drag="' + esc(s.id) + '"' : '') + '>' +
                '<span class="bt">' + esc(s.title) + '</span>' +
                '<span class="bm">' + (s.status === "done" ? "RPE " + s.rpe + " · " + fmtNum(s.load)
                  : (sessionStart(s, p) ? sessionStart(s, p) + " · " : "") + (s.plannedMin||0) + "′ · I" + (s.targetIntensity||5)) + '</span></button>';
            }).join("") +
            (asCoach ? '<button class="btn xs ghost" style="margin-top:auto;opacity:.6" data-act="block-new" data-v="' + esc(u.id) + '" data-d="' + d + '">' + ic("plus") + '</button>' : '') +
          '</div>';
        }).join("") +
      '</div>' +
    '</div>' +

  '</div>';
}

/** Tri d'une journée par heure de début (séances sans heure en dernier). */
function byTime(profile){
  return (a, b) => (sessionStart(a, profile) || "99") < (sessionStart(b, profile) || "99") ? -1 : 1;
}
/** 90 → « 1 h 30 », 45 → « 45 min ». */
function fmtDuration(min){
  const m = Math.round(min || 0);
  if (m < 60) return m + " " + t("g.min");
  return Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : "");
}
/** « Aujourd'hui », « Demain » ou « mercredi 1 octobre ». */
function dayLabel(d){
  const dd = diffDays(d, today());
  if (dd === 0) return t("g.today");
  if (dd === 1) return t("cal.tomorrow");
  return fmtDate(d, { weekday: "long", day: "numeric", month: "long" });
}
/** Statut lisible d'une séance : [libellé, classe de puce]. */
function sessionStatus(s){
  if (s.status === "done") return [t("cal.done") + (s.rpe ? " · RPE " + s.rpe : ""), "good"];
  if (s.status === "missed") return [t("cal.missed"), "crit"];
  if (diffDays(today(), s.date) > 0) return [t("ov.toValidate"), "warn"];
  return [t("cal.planned"), ""];
}

/* Grimpeur : agenda lisible, la prochaine séance en tête, puis la semaine jour par jour. */
/** Une journée : séances dans l'ordre de l'heure (ou « Repos » et les créneaux dispo).
 *  asCoach : chaque ligne ouvre la fiche, et un bouton pose une séance ce jour-là. */
function dayBlock(u, d, asCoach){
  const p = u.profile || {};
  const list = sessionsOf(u.id).filter(s => s.date === d).sort(byTime(p));
  const slots = (p.availability || []).filter(a => a.day === weekdayIndex(d));
  const isToday = d === today();
  return '<div class="ag-day' + (isToday ? ' today' : '') + (diffDays(today(), d) > 0 ? ' past' : '') + '">' +
    '<div class="ag-dh">' + esc(fmtDate(d, { weekday: "long", day: "numeric", month: "long" })) +
      (isToday ? ' <span class="chip acc">' + esc(t("g.today")) + '</span>' : '') + '</div>' +
    (list.length ? list.map(s => {
      const st = sessionStatus(s), tm = sessionStart(s, p);
      const due = !asCoach && st[1] === "warn";
      return '<button class="ag-row" data-act="' + (due ? 'validate' : 'session-open') + '" data-v="' + esc(s.id) + '" style="--type:' + (TYPE_COLOR[s.type] || 'var(--accent)') + '">' +
        '<span class="ag-time">' + esc(tm || "—") + '</span>' +
        '<span class="ag-main"><span class="ag-t">' + esc(s.title) + '</span>' +
          '<span class="ag-m">' + esc(t("st." + s.type)) + (s.type === "rest" ? '' : ' · ' + esc(fmtDuration(s.status === "done" ? s.actualMin : s.plannedMin)) +
            ' · ' + esc(t("cal.intensity", { n: s.targetIntensity || 5 }))) + '</span></span>' +
        (s.kudos ? '<span class="chip acc" title="' + esc(t("kd.from", { name: s.kudos.name })) + '">' + esc(s.kudos.emoji) + '</span>' : '') +
        '<span class="chip ' + st[1] + '">' + esc(st[0]) + '</span>' + ic("chevR", "chev") +
      '</button>';
    }).join("")
    : '<div class="ag-empty">' + esc(t("cal.rest")) +
        (slots.length ? ' · ' + slots.map(a => esc(t("cal.availSlot", { start: a.start, end: a.end }))).join(", ") : '') + '</div>') +
    (asCoach ? '<div class="noprint" style="padding:6px 4px 2px"><button class="btn xs ghost" data-act="block-new" data-v="' + esc(u.id) + '" data-d="' + d + '">' +
      ic("plus") + esc(t("cal.addBlock")) + '</button></div>' : '') +
  '</div>';
}

function agenda(u){
  const p = u.profile || {};
  const mode = calMode();
  const ws = weekStart(calDate());
  const days = []; for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
  const all = sessionsOf(u.id);
  const inWeek = all.filter(s => days.indexOf(s.date) >= 0 && s.type !== "rest");
  const doneN = inWeek.filter(s => s.status === "done").length;
  const plannedMin = sum(inWeek.map(s => s.plannedMin || 0));
  const avail = p.availability || [];
  const next = nextSession(u.id);
  const nextTime = next && sessionStart(next, p);
  const upcoming = upcomingForAgenda(all).length;

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("cal.title")) + '</span>' +
      '<h2>' + esc(t("cal.mySessions")) + '</h2></div>' +
      /* En ligne : abonnement (mise à jour automatique) en premier, le fichier en secours. */
      '<div class="row tight noprint">' +
        '<button class="btn sm" data-act="program">' + ic("list") + esc(t("prg.mine")) + '</button>' +
        (Remote.client ? '<button class="btn sm pri" data-act="cal-subscribe">' + ic("cal") + esc(t("cal.subscribe")) + '</button>' : '') +
        '<button class="btn sm' + (Remote.client ? ' ghost' : ' pri') + '" data-act="cal-export" data-v="' + esc(u.id) + '"' + (upcoming ? '' : ' disabled') + '>' +
          (Remote.client ? ic("dl") + esc(t("cal.download")) : ic("cal") + esc(t("cal.addToAgenda"))) + '</button></div></div>' +

    (next ? '<div class="panel pad stack sm ag-next">' +
      '<span class="eyebrow">' + esc(t("ov.nextSession")) + '</span>' +
      '<div class="ag-when">' + esc(dayLabel(next.date)) + (nextTime ? ' · ' + esc(nextTime) : '') + '</div>' +
      '<div class="ag-title">' + esc(next.title) + '</div>' +
      '<div class="row tight"><span class="chip">' + esc(t("st." + next.type)) + '</span>' +
        '<span class="chip">' + esc(fmtDuration(next.plannedMin)) + '</span>' +
        '<span class="chip">' + esc(t("cal.intensity", { n: next.targetIntensity || 5 })) + '</span></div>' +
      '<div class="row tight noprint"><button class="btn sm" data-act="session-open" data-v="' + esc(next.id) + '">' +
        ic("list") + esc(t("cal.sessionSheet")) + '</button>' +
        (diffDays(today(), next.date) >= 0 ? '<button class="btn sm pri" data-act="validate" data-v="' + esc(next.id) + '">' +
          ic("check") + esc(t("ov.validate")) + '</button>' : '') + '</div>' +
    '</div>' : '') +

    calToolbar() +
    (mode === "week" && inWeek.length ? '<p class="small muted">' + esc(t("cal.weekSummary", { done: doneN, total: inWeek.length, time: fmtDuration(plannedMin) })) + '</p>' : '') +

    (mode === "month" ? '<div class="panel pad">' + monthView(all, p, {}) + '</div>'
     : mode === "year" ? '<div class="panel pad">' + yearView(all) + '</div>'
     : mode === "day" ? '<div class="panel ag">' + dayBlock(u, calDate(), false) + '</div>'
     : '<div class="panel ag">' + days.map(d => dayBlock(u, d, false)).join("") + '</div>') +

    '<p class="dim tiny noprint">' + esc(t("cal.addToAgendaD")) + '</p>' +

    '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("cal.myAvail")) + '</span>' +
      '<button class="btn xs" data-act="avail-edit">' + ic("edit") + esc(t("cal.editAvail")) + '</button></div>' +
      (avail.length ? '<div class="row tight">' + avail.map(a =>
        '<span class="chip">' + esc(DAYS[a.day][LI()].slice(0,3)) + ' ' + esc(a.start) + '–' + esc(a.end) + ' · ' + esc(t("st."+a.type)) + '</span>').join("") + '</div>'
        : '<p class="dim tiny">' + esc(t("on.availD")) + '</p>') + '</div>' +
  '</div>';
}

function viewCalendar(user, asCoach){ return asCoach ? planningGrid(user) : agenda(user); }

function painLabel(k){
  const M = {
    finger_a2:["Poulie A2 (doigt)","A2 pulley (finger)"], finger_a4:["Poulie A4 (doigt)","A4 pulley (finger)"],
    finger_other:["Doigt — autre","Finger — other"], elbow_med:["Coude interne","Medial elbow"],
    elbow_lat:["Coude externe","Lateral elbow"], shoulder:["Épaule","Shoulder"], wrist:["Poignet","Wrist"],
    back:["Dos / lombaires","Back / lumbar"], knee:["Genou","Knee"], ankle:["Cheville","Ankle"],
    hamstring:["Ischio-jambiers","Hamstring"], other:["Autre","Other"]
  };
  return (M[k] || M.other)[LI()];
}
const PAIN_SITES = ["finger_a2","finger_a4","finger_other","elbow_med","elbow_lat","shoulder","wrist","back","hamstring","knee","ankle","other"];

export { PAIN_SITES, activePain, kpi, nextSession, painLabel, pendingValidation, sessionCard, sessionsOf, viewCalendar, viewOverview };
