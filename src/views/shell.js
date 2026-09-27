import { APP_VERSION, COPYRIGHT, diffDays, esc, today, weekStart } from "../core.js";
import { Access, Session, Store } from "../data.js";
import { relTime, t } from "../i18n/index.js";
import { Remote } from "../remote.js";
import { logo } from "../ui/brand.js";
import { ic } from "../ui/icons.js";
import { unreadCount } from "./library.js";
import { inboxCount } from "./staff.js";
/* ================================================================
   9. VIEW STATE & SHELL
   ================================================================ */
const View = {
  tab: null,
  athlete: null,          // coach drilling into one athlete file
  exFilter: { cat:"all", lv:"all", q:"" },
  calMode: "week",            // calendrier : "day" | "week" | "month" | "year"
  calDate: null,              // date de référence (null = aujourd'hui)
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
  /* Grimpeur : « Aujourd'hui » d'abord (la séance du jour), le programme, la
     progression (ex-Synthèse). Tests et bibliothèque s'ouvrent depuis ces écrans. */
  climber: [["today","nav.today","home"],["calendar","nav.program","cal"],["overview","nav.progress","trend"],
            ["messages","nav.messages","chat"],["profile","nav.profile","user"]],
  /* Encadrants : « À traiter » d'abord ; le profil s'ouvre depuis l'avatar en haut à droite. */
  coach:   [["inbox","nav.inbox","alert"],["athletes","nav.athletes","users"],["planning","nav.planning","cal"],
            ["exercises","nav.exercises","book"],["messages","nav.messages","chat"]],
  /* L'admin est un coach avec des super-pouvoirs : les onglets coach (sur tous
     les grimpeurs), plus un onglet Admin (comptes, duos, paramètres, audit). */
  admin:   [["inbox","nav.inbox","alert"],["athletes","nav.athletes","users"],["planning","nav.planning","cal"],
            ["exercises","nav.exercises","book"],["messages","nav.messages","chat"],["admin","nav.admin","shield"]]
};
/** Onglets ouverts sans figurer dans la barre : le profil (avatar), et pour le
    grimpeur les tests et la bibliothèque (liens depuis Aujourd'hui et Progrès). */
const HIDDEN_TABS = ["profile", "tests", "exercises"];

/** Coach ou admin : tout ce qui relève de l'encadrement. */
function isStaff(u){ return !!u && (u.role === "coach" || u.role === "admin"); }

/** Présence d'une personne : en ligne (appli ouverte), sinon « vu il y a… » (mode Supabase). */
function isOnline(u){ return !!u && Remote.online.has(u.id); }
function presenceText(u){
  if (!Remote.client || !u) return "";
  if (isOnline(u)) return t("pr.online");
  return u.lastSeenAt ? t("pr.seen", { when: relTime(u.lastSeenAt) }) : t("pr.never");
}
/** Pastille verte (en ligne) ou grise (hors ligne) ; rien en mode local. */
function presenceDot(u){
  if (!Remote.client || !u) return "";
  const on = isOnline(u);
  return '<span class="pr-dot' + (on ? " on" : "") + '" title="' + esc(presenceText(u)) + '" aria-label="' + esc(presenceText(u)) + '"></span>';
}

function tabBadge(id){
  const me = Session.live(); if (!me) return 0;
  if (me.role === "climber"){
    if (id === "today") return Store.list("sessions").filter(s => s.userId === me.id && s.status === "planned" && diffDays(today(), s.date) >= 0).length;
    if (id === "messages") return unreadCount(me.id);
  }
  if (isStaff(me)){
    if (id === "inbox") return inboxCount(me);
    if (id === "messages") return unreadCount(me.id);
  }
  return 0;
}

/* ---------------- top bar ---------------- */
function topbar(){
  const me = Session.live();
  return '<div class="topbar">' +
    (me ? '<button class="home-link" data-act="home" title="' + esc(t("g.home")) + '" aria-label="' + esc(t("g.home")) + '">' + logo(19, { wordH: 15 }) + '</button>'
        : logo(19, { wordH: 15 })) +
    '<span class="spacer"></span>' +
    '<button class="btn icon sm ghost" data-act="theme" aria-label="' + esc(t("g.theme")) + '" title="' + esc(t("g.theme")) + '">' +
      ic(View.theme === "light" ? "moon" : "sun") + '</button>' +
    /* L'avatar ouvre le profil (la déconnexion s'y trouve). */
    (me ? '<button class="btn sm ghost" data-act="tab" data-v="profile" title="' + esc(t("nav.profile")) + '">' +
      '<span class="avatar sm">' + esc(initials(me.name)) + '</span>' +
      '<span class="tiny nowrap role-lb" style="max-width:110px;overflow:hidden;text-overflow:ellipsis">' + esc(t("role."+me.role)) + '</span>' +
      '</button>' : "") +
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

export { HIDDEN_TABS, TABS, View, initials, isOnline, isStaff, legalFooter, presenceDot, presenceText, tabBadge, tabsBar, topbar, watermark };
