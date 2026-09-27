import { $, $$, addDays, clamp, esc, today, uid, weekStart } from "./core.js";
import { Access, Session, Store, audit, can, config } from "./data.js";
import { buildICS, upcomingForAgenda } from "./domain/calendar.js";
import { trackFor } from "./domain/grades.js";
import { batteryFor, scoreAssessment } from "./domain/scoring.js";
import { setExercises } from "./domain/exercises.js";
import { downloadFile, exportPayload, saveFile } from "./export.js";
import { Remote } from "./remote.js";
import { fmtDate, fmtNum, t } from "./i18n/index.js";
import { render, renderDebounced } from "./main.js";
import { accountEditModal, availModal, blockEditor, calendarSubscribeModal, deleteAccountModal, healthConsentModal, kudosModal, plansModal, withPlan, legalModal, painModal, profileEditModal, rpeModal, sessionSheet, videoCheckModal, withHealthConsent } from "./modals.js";
import { purgeDemo, seedDemo } from "./seed.js";
import { toast } from "./ui/feedback.js";
import { askPin, newAccountModal, remoteForgot, remoteSetPassword, remoteSignIn, resendFromLogin } from "./views/auth.js";
import { exerciseModal, sendMessage } from "./views/library.js";
import { playerActions, startPlayer, stopPlayer } from "./views/player.js";
import { sessionsOf } from "./views/climber.js";
import { TABS, View } from "./views/shell.js";
import { _timer, readRunnerFields, updateLiveMetric } from "./views/testing.js";
/* ================================================================
   23. ACTION DISPATCH
   ================================================================ */
const ACTIONS = {
  theme: () => {
    View.theme = View.theme === "light" ? null : "light";
    if (View.theme) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try{ View.theme ? localStorage.setItem("altaris.theme", "light") : localStorage.removeItem("altaris.theme"); }catch(e){}
    render();
  },
  signout: () => { View.tab = null; View.athlete = null; if (Remote.client) setExercises([]); Session.signOut(); },
  tab: (v) => { View.tab = v; View.athlete = null; window.scrollTo(0,0); render(); },
  /* Logo: back to the role's first tab (Synthèse for a climber, Athletes for coach/admin). */
  home: () => { const me = Session.live(); if (!me) return; View.tab = TABS[me.role][0][0]; View.athlete = null; window.scrollTo(0,0); render(); },
  legal: () => legalModal(),
  print: () => window.print(),
  "pick-user": (v) => { const u = Store.get("users", v); if (u) askPin(u); },
  "new-account": () => newAccountModal(),
  "remote-signin": () => remoteSignIn(),
  /* Afficher / masquer le mot de passe tapé (sans re-rendu : la saisie est conservée). */
  "pw-toggle": (v, el) => {
    const inp = document.getElementById(v); if (!inp) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    el.textContent = t(show ? "auth.hide" : "auth.show");
    el.setAttribute("aria-pressed", String(show));
  },
  "remote-forgot": () => remoteForgot(),
  "resend-confirm": (v, el) => resendFromLogin(el),
  "remote-setpass": () => remoteSetPassword(),
  "seed-demo": () => seedDemo(),
  "purge-demo": () => { if (confirm(t("ad.purgeConfirm"))) purgeDemo(); },
  "export-all": () => saveFile("altaris-export-" + today() + ".json", JSON.stringify(exportPayload("all"), null, 2)),
  /* Séances à venir → fichier .ics (rappel 1 h avant), à ouvrir avec l'agenda du téléphone. */
  /* --- séance guidée (src/views/player.js) --- */
  "play-start": (v) => withPlan("train", "pl.whyTrain", () => { startPlayer(v); window.scrollTo(0,0); render(); }),
  plans: () => plansModal(),
  "play-next": () => { playerActions.next(); window.scrollTo(0,0); render(); },
  "play-skip": () => { playerActions.skip(); window.scrollTo(0,0); render(); },
  "play-prev": () => { playerActions.prev(); window.scrollTo(0,0); render(); },
  "play-set": (v) => { playerActions.set(Number(v)); render(); },
  "play-preset": (v) => { playerActions.preset(Number(v)); render(); },
  "play-toggle": () => { playerActions.toggle(); render(); },
  "play-rpe": (v) => { playerActions.rpe(Number(v)); render(); },
  "play-finish": async () => { if (await playerActions.finish()){ window.scrollTo(0,0); render(); } },
  "play-close": () => {
    const p = View.player;
    if (p && !p.finished && Date.now() - p.startedAt > 60000 && !confirm(t("pl.quitConfirm"))) return;
    stopPlayer(); View.tab = "today"; window.scrollTo(0,0); render();
  },
  "play-message": () => { stopPlayer(); View.tab = "messages"; render(); },
  "cal-subscribe": () => calendarSubscribeModal(),
  kudos: (v) => kudosModal(v),
  /* Notifications : l'autorisation est demandée ici, suite à un geste de l'utilisateur (exigé par iOS). */
  "push-on": async () => {
    try{ await Remote.enablePush(); toast(t("nt.enabled"), "good"); }
    catch(e){ toast(t(Notification.permission === "denied" ? "nt.denied" : "nt.failed"), "crit"); }
    View.pushState = await Remote.pushState(); render();
  },
  "push-off": async () => {
    try{ await Remote.disablePush(); }catch(e){}
    View.pushState = await Remote.pushState(); render();
  },
  "cal-export": (v) => {
    const me = Session.live();
    const u = (v && Access.canSee(v) && Store.get("users", v)) || me;
    const list = upcomingForAgenda(sessionsOf(u.id));
    if (!list.length) return toast(t("cal.nothingToExport"));
    downloadFile("altaris-seances.ics",
      buildICS(list, { profile: u.profile, calName: t("cal.icsName"), url: location.origin }),
      "text/calendar;charset=utf-8");
    toast(t("cal.exported", { n: list.length }), "good");
  },
  "export-mine": () => saveFile("altaris-" + (Session.live()||{}).name + "-" + today() + ".json", JSON.stringify(exportPayload("mine"), null, 2)),
  "profile-edit": () => profileEditModal(),
  "acct-edit": (v) => accountEditModal(v),
  "acct-delete": (v) => deleteAccountModal(v),
  /* Demande de formule : ouvrir le compte ; une fois enregistré, la demande est marquée traitée. */
  "plan-req": (v) => {
    const r = (Remote.requests || []).find(x => x.id === v); if (!r) return;
    accountEditModal(r.user_id, async () => {
      try{ await Remote.handlePlanRequest(r.id); }catch(e){ return; }
      Remote.requests = Remote.requests.filter(x => x.id !== r.id);
    });
  },
  "acct-toggle": async (v) => {
    const u = Store.get("users", v); if (!u) return;
    if (!await Store.put("users", v, Object.assign({}, u, { status: u.status === "suspended" ? "active" : "suspended" }))) return;
    audit("account_status", u.name + " → " + (u.status === "suspended" ? "active" : "suspended"));
  },
  "acwr-m": (v) => { View.acwrMethod = v; render(); },
  week: (v) => { View.weekOf = v === "0" ? weekStart(today()) : addDays(View.weekOf, Number(v) * 7); render(); },
  athlete: (v) => { View.athlete = v || null; window.scrollTo(0,0); render(); },
  /* Depuis « À traiter » : ouvrir la fiche du grimpeur dans l'onglet Athlètes. */
  "athlete-go": (v) => { View.tab = "athletes"; View.athlete = v || null; window.scrollTo(0,0); render(); },
  "admin-tab": (v) => { View.adminTab = v; window.scrollTo(0,0); render(); },
  "cal-for": (v) => { View.calFor = v; render(); },
  "plan-athlete": (v) => { View.calFor = v; View.tab = "planning"; View.athlete = null; window.scrollTo(0,0); render(); },
  thread: (v) => { View.thread = v; render(); },
  "thread-go": (v) => { View.thread = v; View.tab = "messages"; View.athlete = null; render(); },
  "session-open": (v) => sessionSheet(v),
  validate: (v) => withPlan("train", "pl.whyTrain", () => rpeModal(v)),
  "block-new": (v, el) => blockEditor(v, el.dataset.d || null, null),
  "avail-edit": () => availModal(),
  "pain-new": () => withHealthConsent(painModal),
  /* Consentement santé, depuis le profil. */
  "hc-give": () => healthConsentModal(() => render()),
  "hc-withdraw": async () => {
    if (!confirm(t("hc.withdrawConfirm"))) return;
    try{ await Store.withdrawHealthConsent(); }
    catch(e){ return toast(t("er.saveFailed"), "crit"); }
    toast(t("hc.withdrawn"), "good");
  },
  "pain-resolve": async (v) => {
    const p = Store.get("pain", v); if (!p) return;
    await Store.put("pain", v, Object.assign({}, p, { status:"resolved" }));
    audit("pain_resolved", p.location);
  },
  "ex-cat": (v) => { View.exFilter.cat = v; render(); },
  "ex-lv": (v) => { View.exFilter.lv = v; render(); },
  "ex-open": (v) => exerciseModal(v),
  "ex-reset": () => { View.exFilter = { cat:"all", lv:"all", q:"" }; render(); },
  "routine-new": () => blockEditor((Access.climbers()[0]||{}).id || "", today(), null),
  "routine-del": async (v) => { await Store.del("routines", v); audit("routine_deleted", v); },
  "video-check": () => videoCheckModal(),
  "msg-send": async (v) => {
    const me = Session.live();
    const text = (View.msgDraft || "").trim();
    const url = ($("#msg-video") && $("#msg-video").value.trim()) || "";
    if (!text && !url) return;
    if (!await sendMessage(me.id, v, { text: text || t("ex.video"), videoUrl: url || null })) return;   // brouillon conservé
    View.msgDraft = "";
    render();
    audit("message_sent", v);
  },
  /* --- onboarding --- */
  "onb-prev": () => { View.onb.step = Math.max(0, View.onb.step - 1); window.scrollTo(0,0); render(); },
  "onb-next": async () => {
    collectOnb();
    const o = View.onb, d = o.data;
    if (o.step === 0 && (!d.weightKg || !d.heightCm)) return toast(t("er.required"), "crit");
    if (o.step === 1 && !d.gradeSport && !d.gradeBoulder) return toast(t("er.required"), "crit");
    if (o.step < 4){ o.step++; window.scrollTo(0,0); return render(); }
    const me = Session.live();
    const profile = Object.assign({}, me.profile || {}, d, { lastActive: Date.now(), onboarded: true });
    await Store.put("users", me.id, Object.assign({}, me, { profile }));
    audit("onboarding_complete", trackFor(profile));
    if (d.currentPain) setTimeout(() => painModal(), 400);
    View.onb = null; View.tab = "overview"; window.scrollTo(0,0); render();
    toast(t("on.done"), "good");
  },
  "onb-addslot": () => {
    collectOnb();
    View.onb.data.availability.push({ day: Number($("#sl-day").value), start: $("#sl-start").value, end: $("#sl-end").value, type: $("#sl-type").value });
    View.onb.data.availability.sort((a,b) => a.day - b.day || (a.start < b.start ? -1 : 1));
    render();
  },
  "onb-rmslot": (v) => { collectOnb(); View.onb.data.availability.splice(Number(v), 1); render(); },
  /* --- test runner --- */
  "test-start": () => withPlan("train", "pl.whyTrain", () => withHealthConsent(() => {
    const me = Session.live(), p = me.profile || {};
    /* Essai : bilan de base uniquement ; bilan complet avec une formule payante. */
    const battery = can(me, "fullTests") ? trackFor(p) : "beginner";
    /* Pre-fill what the profile already knows so the athlete types as little as possible at the wall. */
    const results = {};
    batteryFor(battery).forEach(x => {
      const pre = {};
      x.fields.forEach(f => {
        if (f.k === "bw" && p.weightKg != null) pre.bw = p.weightKg;
        if (f.k === "height" && p.heightCm != null) pre.height = p.heightCm;
      });
      if (Object.keys(pre).length) results[x.id] = pre;
    });
    View.runner = { userId: me.id, battery, idx: 0, results };
    window.scrollTo(0,0); render();
  })),
  "test-abort": () => { View.runner = null; render(); },
  "test-skip": () => {
    const r = View.runner, test = batteryFor(r.battery)[r.idx];
    r.results[test.id] = { skipped: true };
    advanceRunner();
  },
  "test-record": () => {
    const r = View.runner, test = batteryFor(r.battery)[r.idx];
    const vals = readRunnerFields();
    const missing = test.fields.filter(f => f.req && (vals[f.k] == null || vals[f.k] === ""));
    if (missing.length) return toast(t("er.required"), "crit");
    r.results[test.id] = vals;
    advanceRunner();
  }
};
async function advanceRunner(){
  const r = View.runner;
  const battery = batteryFor(r.battery);
  if (_timer){ clearInterval(_timer); _timer = null; }
  if (r.idx < battery.length - 1){ r.idx++; window.scrollTo(0,0); return render(); }
  const me = Session.live();
  const a = { id: uid("a"), userId: me.id, date: today(), battery: r.battery, results: r.results,
              status: "complete", createdBy: me.id };
  a.scores = scoreAssessment(a, me.profile || {});
  await Store.put("assessments", a.id, a);
  audit("assessment_completed", r.battery);
  View.runner = null; View.tab = "overview"; window.scrollTo(0,0); render();
  toast(t("ts.complete"), "good");
}
function collectOnb(){
  if (!View.onb) return;
  $$("[data-onb]").forEach(el => {
    const k = el.dataset.onb;
    if (el.type === "checkbox") View.onb.data[k] = el.checked;
    else if (el.type === "number") View.onb.data[k] = el.value === "" ? null : Number(el.value);
    else View.onb.data[k] = el.value;
  });
  const inj = [];
  $$("[data-onb-inj]").forEach(el => { if (el.checked) inj.push(el.dataset.onbInj); });
  if ($$("[data-onb-inj]").length) View.onb.data.injuries = inj;
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (el){
    const fn = ACTIONS[el.dataset.act];
    if (fn){ e.preventDefault(); fn(el.dataset.v, el); return; }
  }
  const rf = e.target.closest("[data-rf-set]");
  if (rf){
    const k = rf.dataset.rfSet;
    View.runner.results[batteryFor(View.runner.battery)[View.runner.idx].id] =
      Object.assign({}, readRunnerFields(), { [k]: Number(rf.dataset.v) });
    render();
  }
});
/* Formulaires : Entrée soumet, sans rechargement de page. */
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-act-submit]");
  if (!f) return;
  e.preventDefault();
  const fn = ACTIONS[f.dataset.actSubmit];
  if (fn) fn(f.dataset.v, f);
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-act-input]");
  if (el){
    if (el.dataset.actInput === "ex-q"){ View.exFilter.q = el.value; renderDebounced(); }
    if (el.dataset.actInput === "msg"){ View.msgDraft = el.value; }
    if (el.dataset.actInput === "pl-dur" && View.player){ View.player.durInput = el.value; }
    if (el.dataset.actInput === "pl-fb" && View.player){ View.player.fb = el.value; }
    return;
  }
  if (e.target.closest("[data-rf]")) updateLiveMetric();
  if (e.target.closest("[data-onb-inj]")){
    const l = e.target.closest("label"); if (l) l.classList.toggle("on", e.target.checked);
  }
  if (e.target.closest('[data-onb="currentPain"]')){
    const l = e.target.closest("label"); if (l) l.classList.toggle("on", e.target.checked);
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-act-change]");
  if (!el) return;
  if (el.dataset.actChange === "pair"){
    const u = Store.get("users", el.dataset.v); if (!u) return;
    if (!await Store.put("users", u.id, Object.assign({}, u, { coachId: el.value || null }))) return;
    audit("pairing_changed", u.name + " → " + (el.value ? (Store.get("users", el.value)||{}).name : "—"));
    toast(t("g.saved"), "good");
  }
  if (el.dataset.actChange === "cfg"){
    const c = Object.assign({}, config());
    c[el.dataset.v] = el.type === "number" ? Number(el.value) : el.value;
    delete c.id;
    await Store.put("config", "global", c);
    audit("config_changed", el.dataset.v + "=" + el.value);
    toast(t("g.saved"), "good");
  }
});

/* drag & drop of calendar blocks (coach) */
let _dragId = null;
document.addEventListener("dragstart", (e) => {
  const b = e.target.closest("[data-drag]"); if (!b) return;
  _dragId = b.dataset.drag; b.classList.add("dragging");
  try{ e.dataTransfer.setData("text/plain", _dragId); e.dataTransfer.effectAllowed = "move"; }catch(x){}
});
document.addEventListener("dragend", () => { $$(".blk.dragging").forEach(x => x.classList.remove("dragging")); $$(".day.drop").forEach(d => d.classList.remove("drop")); });
document.addEventListener("dragover", (e) => {
  const d = e.target.closest("[data-drop]"); if (!d || !_dragId) return;
  e.preventDefault(); d.classList.add("drop");
});
document.addEventListener("dragleave", (e) => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("drop"); });
document.addEventListener("drop", async (e) => {
  const d = e.target.closest("[data-drop]"); if (!d || !_dragId) return;
  e.preventDefault();
  const s = Store.get("sessions", _dragId);
  const date = d.dataset.drop;
  _dragId = null;
  $$(".day.drop").forEach(x => x.classList.remove("drop"));
  if (!s || s.date === date) return;
  await Store.put("sessions", s.id, Object.assign({}, s, { date }));
  Remote.notify({ kind: "session", athleteId: s.userId, sessionId: s.id, update: true });
  audit("session_moved", s.title + " → " + date);
  toast(t("g.saved"), "good");
});

/* chart tooltips */
document.addEventListener("mousemove", (e) => {
  const box = e.target.closest(".chartbox"); if (!box) return;
  const tip = $("[data-tip]", box); if (!tip) return;
  const hit = e.target.closest("[data-d]");
  if (!hit){ tip.classList.remove("on"); return; }
  tip.classList.add("on");
  tip.innerHTML = '<div class="h">' + esc(fmtDate(hit.dataset.d, {weekday:"short",day:"2-digit",month:"short"})) + '</div>' +
    '<div class="l"><span><i style="background:var(--accent)"></i>' + esc(t("ld.dailyLoad")) + '</span><b>' + fmtNum(Number(hit.dataset.load)) + '</b></div>' +
    (hit.dataset.r ? '<div class="l"><span><i style="background:var(--ink-2)"></i>ACWR</span><b>' + esc(hit.dataset.r) + '</b></div>' : '');
  const r = box.getBoundingClientRect();
  tip.style.left = clamp(e.clientX - r.left + 12, 0, r.width - tip.offsetWidth - 4) + "px";
  tip.style.top  = clamp(e.clientY - r.top - 10, 0, r.height - tip.offsetHeight) + "px";
});
document.addEventListener("mouseleave", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("chartbox")){
    const tip = $("[data-tip]", e.target); if (tip) tip.classList.remove("on");
  }
}, true);

export { ACTIONS, _dragId, advanceRunner, collectOnb };
