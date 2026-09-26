import { APP_VERSION, COPYRIGHT, diffDays, esc, sum, today, weekStart } from "../core.js";
import { Access, Session, Store } from "../data.js";
import { alertsFor } from "../domain/workload.js";
import { LANG_PREF, t } from "../i18n/index.js";
import { Remote } from "../remote.js";
import { logo } from "../ui/brand.js";
import { ic } from "../ui/icons.js";
import { unreadCount } from "./library.js";
/* ================================================================
   9. VIEW STATE & SHELL
   ================================================================ */
const View = {
  tab: null,
  athlete: null,          // coach drilling into one athlete file
  exFilter: { cat:"all", lv:"all", q:"" },
  weekOf: weekStart(today()),
  calFor: null,           // whose calendar a coach is looking at
  acwrMethod: null,
  thread: null,
  onb: null,              // onboarding wizard state
  runner: null,           // test runner state
  msgDraft: "",
  theme: null
};
try{ View.theme = localStorage.getItem("altaris.theme") || null; }catch(e){}
if (View.theme) document.documentElement.setAttribute("data-theme", View.theme);

const TABS = {
  climber: [["overview","nav.overview","home"],["calendar","nav.calendar","cal"],["tests","nav.tests","test"],
            ["exercises","nav.exercises","book"],["messages","nav.messages","chat"],["profile","nav.profile","user"]],
  coach:   [["athletes","nav.athletes","users"],["planning","nav.planning","cal"],["exercises","nav.exercises","book"],
            ["messages","nav.messages","chat"],["profile","nav.profile","user"]],
  /* L'admin est un coach avec des super-pouvoirs : tous les onglets coach
     (sur tous les grimpeurs), plus la gestion de la plateforme. */
  admin:   [["athletes","nav.athletes","users"],["planning","nav.planning","cal"],["exercises","nav.exercises","book"],
            ["messages","nav.messages","chat"],["accounts","nav.accounts","user"],["pairings","nav.pairings","shield"],
            ["params","nav.params","gear"],["audit","nav.audit","list"],["profile","nav.profile","user"]]
};

/** Coach ou admin : tout ce qui relève de l'encadrement. */
function isStaff(u){ return !!u && (u.role === "coach" || u.role === "admin"); }

function tabBadge(id){
  const me = Session.live(); if (!me) return 0;
  if (me.role === "climber"){
    if (id === "overview") return Store.list("sessions").filter(s => s.userId === me.id && s.status === "planned" && diffDays(today(), s.date) >= 0).length;
    if (id === "messages") return unreadCount(me.id);
  }
  if (isStaff(me)){
    if (id === "athletes") return sum(Access.climbers().map(c => alertsFor(c.id).filter(a => a.sev === "crit").length));
    if (id === "messages") return unreadCount(me.id);
  }
  return 0;
}

/* ---------------- top bar ---------------- */
function topbar(){
  const me = Session.live();
  return '<div class="topbar">' +
    logo(19, { wordH: 15 }) +
    '<span class="spacer"></span>' +
    '<div class="seg sm" role="group" aria-label="' + esc(t("g.language")) + '">' +
      '<button data-act="lang" data-v="auto" class="' + (LANG_PREF==="auto"?"on":"") + '" title="' + esc(t("g.langAutoD")) + '">' + esc(t("g.langAuto")) + '</button>' +
      '<button data-act="lang" data-v="fr" class="' + (LANG_PREF==="fr"?"on":"") + '">FR</button>' +
      '<button data-act="lang" data-v="en" class="' + (LANG_PREF==="en"?"on":"") + '">EN</button></div>' +
    '<button class="btn icon sm ghost" data-act="theme" aria-label="' + esc(t("g.theme")) + '" title="' + esc(t("g.theme")) + '">' +
      ic(View.theme === "light" ? "moon" : "sun") + '</button>' +
    (me ? '<button class="btn sm ghost" data-act="signout" title="' + esc(t("g.signOut")) + '">' +
      '<span class="avatar sm">' + esc(initials(me.name)) + '</span>' +
      '<span class="tiny nowrap role-lb" style="max-width:110px;overflow:hidden;text-overflow:ellipsis">' + esc(t("role."+me.role)) + '</span>' +
      ic("out") + '</button>' : "") +
  '</div>';
}
const initials = (n) => String(n||"?").trim().split(/\s+/).map(w => w[0]).slice(0,2).join("");

function tabsBar(){
  const me = Session.live(); if (!me) return "";
  const list = TABS[me.role] || [];
  return '<nav class="tabs noprint" role="tablist">' + list.map(([id, key, icon]) => {
    const b = tabBadge(id);
    return '<button role="tab" aria-selected="' + (View.tab === id) + '" class="' + (View.tab === id ? "on" : "") + '" data-act="tab" data-v="' + id + '">' +
      ic(icon) + '<span>' + esc(t(key)) + '</span>' + (b ? '<span class="dot"></span>' : "") + '</button>';
  }).join("") + '</nav>';
}

function legalFooter(){
  const me = Session.live();
  return '<footer class="legal"><div>' + esc(COPYRIGHT) + '</div>' +
    '<div class="noprint" style="margin-top:5px">' + esc(t("app.confidential")) + ' · ALTARIS™ Pro Platform ' + APP_VERSION +
    ' · <button data-act="legal" style="color:var(--accent);font-size:11px;font-weight:600">' + esc(t("lg.honest")) + '</button>' +
    /* Mode Supabase : les comptes sont en ligne, le reste encore sur l'appareil. */
    (Remote.client ? ' · <span title="' + esc(t("auth.syncModeD")) + '">' + esc(t("auth.syncMode")) + '</span>'
      : Store.mode === "local" ? ' · <span style="color:var(--warn)">' + esc(t("auth.localMode")) + '</span>' : "") +
    /* File d'attente vers la base de l'artefact : sans objet en mode Supabase. */
    (!Remote.client && Store.queue.length ? ' · <span style="color:var(--warn)">' + Store.queue.length + ' ⇅</span>' : "") +
    '</div>' +
    (me ? '<div class="printonly" style="margin-top:6px">' + esc(t("lg.watermark")) + ' — ' + esc(me.name) + ' · ' + esc(me.id) + ' · ' + esc(new Date().toISOString()) + '</div>' : "") +
  '</footer>';
}

/** Visible watermark grid, applied to printed and PDF exports. */
function watermark(){
  const me = Session.live(); if (!me) return "";
  const tag = me.name + " · " + new Date().toISOString().slice(0,16).replace("T"," ") + " · ALTARIS™";
  let s = "";
  for (let r = 0; r < 14; r++) for (let c = 0; c < 3; c++)
    s += '<span style="top:' + (r*78) + 'px;left:' + (c*300 - 40) + 'px">' + esc(tag) + '</span>';
  return '<div class="wmark" aria-hidden="true">' + s + '</div>';
}

export { TABS, View, initials, isStaff, legalFooter, tabBadge, tabsBar, topbar, watermark };
