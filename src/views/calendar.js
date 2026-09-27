/* ALTARIS™ — calendrier multi-vues : jour, semaine, mois, année (façon Google Agenda)
   © 2026 ALTARIS™. All rights reserved.

   Partagé par le Programme du grimpeur et la Planification du coach. L'état vit
   dans View.calMode ("day" | "week" | "month" | "year") et View.calDate (date ISO
   de référence). La vue Semaine reste celle de chaque écran (agenda / grille). */
import { addDays, diffDays, esc, today, weekStart } from "../core.js";
import { sessionStart } from "../domain/calendar.js";
import { LI, LOC, fmtDate, fmtDateLong, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { DAYS } from "./onboarding.js";
import { View } from "./shell.js";
import { TYPE_COLOR } from "./today.js";

const MODES = ["day", "week", "month", "year"];

function calMode(){ return MODES.includes(View.calMode) ? View.calMode : "week"; }
function calDate(){ return View.calDate || today(); }

/** Date ISO du 1er du mois de d, décalée de n mois. */
function monthStart(d, n){
  const [y, m] = d.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + (n || 0), 1));
  return x.toISOString().slice(0, 10);
}

/** Déplacement ‹ › selon la vue ; 0 = aujourd'hui. */
function shiftDate(mode, d, n){
  if (!n) return today();
  if (mode === "day") return addDays(d, n);
  if (mode === "week") return addDays(d, 7 * n);
  if (mode === "month") return monthStart(d, n);
  return monthStart(d, 12 * n);
}

/** Titre de la période affichée. */
function periodTitle(mode, d){
  if (mode === "day") return fmtDateLong(d);
  if (mode === "week"){
    const ws = weekStart(d);
    return fmtDate(ws, { day: "numeric", month: "short" }) + " – " + fmtDate(addDays(ws, 6), { day: "numeric", month: "short", year: "numeric" });
  }
  if (mode === "month") return fmtDate(monthStart(d), { month: "long", year: "numeric" });
  return d.slice(0, 4);
}

/** Barre d'outils : ‹ Aujourd'hui › + titre + choix de la vue. */
function calToolbar(){
  const mode = calMode(), d = calDate();
  return '<div class="cal-bar noprint">' +
    '<div class="row tight">' +
      '<button class="btn icon sm ghost" data-act="cal-nav" data-v="-1" aria-label="' + esc(t("g.previous")) + '">' + ic("chevL") + '</button>' +
      '<button class="btn sm ghost" data-act="cal-nav" data-v="0">' + esc(t("g.today")) + '</button>' +
      '<button class="btn icon sm ghost" data-act="cal-nav" data-v="1" aria-label="' + esc(t("g.next")) + '">' + ic("chevR") + '</button>' +
      '<span class="cal-title">' + esc(periodTitle(mode, d)) + '</span>' +
    '</div>' +
    '<div class="seg sm" role="tablist" aria-label="' + esc(t("cv.view")) + '">' + MODES.map(m =>
      '<button role="tab" aria-selected="' + (m === mode) + '" class="' + (m === mode ? "on" : "") + '" data-act="cal-mode" data-v="' + m + '">' +
        esc(t("cv." + m)) + '</button>').join("") + '</div>' +
  '</div>';
}

/** Séances par date, triées par heure. */
function byDate(sessions, profile){
  const m = {};
  sessions.forEach(s => { (m[s.date] = m[s.date] || []).push(s); });
  Object.values(m).forEach(l => l.sort((a, b) => (sessionStart(a, profile) || "99") < (sessionStart(b, profile) || "99") ? -1 : 1));
  return m;
}

function evClass(s){ return s.status === "done" ? " done" : s.status === "missed" ? " missed" : s.type === "rest" ? " rest" : ""; }

/* ---------- vue Mois ---------- */
/** opts : { asCoach, userId } — le coach peut glisser une séance sur un autre jour. */
function monthView(sessions, profile, opts){
  const o = opts || {};
  const d = calDate(), first = monthStart(d), month = first.slice(0, 7);
  const start = weekStart(first);
  const map = byDate(sessions, profile);
  const weeks = [];
  for (let w = 0; w < 6; w++){
    const ws = addDays(start, 7 * w);
    if (w >= 4 && ws.slice(0, 7) !== month) break;       // 4 à 6 lignes selon le mois
    weeks.push(ws);
  }
  const MAX = 3;
  return '<div class="mo">' +
    '<div class="mo-head">' + DAYS.map(x => '<span>' + esc(x[LI()].slice(0, 3)) + '</span>').join("") + '</div>' +
    weeks.map(ws => '<div class="mo-row">' + [0, 1, 2, 3, 4, 5, 6].map(i => {
      const day = addDays(ws, i), list = map[day] || [];
      const out = day.slice(0, 7) !== month, isToday = day === today();
      return '<div class="mo-cell' + (out ? ' out' : '') + (isToday ? ' today' : '') + (diffDays(today(), day) > 0 ? ' past' : '') + '"' +
          (o.asCoach ? ' data-drop="' + day + '"' : '') + '>' +
        '<button class="mo-d" data-act="cal-go" data-v="' + day + '" aria-label="' + esc(fmtDateLong(day)) + '">' + Number(day.slice(8)) + '</button>' +
        list.slice(0, MAX).map(s => {
          const tm = sessionStart(s, profile);
          return '<button class="mo-ev' + evClass(s) + '" style="--type:' + (TYPE_COLOR[s.type] || "var(--accent)") + '" data-act="session-open" data-v="' + esc(s.id) + '"' +
            (o.asCoach ? ' draggable="true" data-drag="' + esc(s.id) + '"' : '') + ' title="' + esc((tm ? tm + " · " : "") + s.title) + '">' +
            (tm ? '<span class="mo-t">' + esc(tm) + '</span>' : '') + '<span class="mo-n">' + esc(s.title) + '</span></button>';
        }).join("") +
        (list.length > MAX ? '<button class="mo-more" data-act="cal-go" data-v="' + day + '">+' + (list.length - MAX) + '</button>' : '') +
        (o.asCoach && !out ? '<button class="mo-add" data-act="block-new" data-v="' + esc(o.userId) + '" data-d="' + day + '" aria-label="' + esc(t("cal.addBlock")) + '">' + ic("plus") + '</button>' : '') +
      '</div>';
    }).join("") + '</div>').join("") +
  '</div>';
}

/* ---------- vue Année ---------- */
function yearView(sessions){
  const y = calDate().slice(0, 4);
  const map = byDate(sessions, null);
  const months = [];
  for (let m = 0; m < 12; m++) months.push(y + "-" + String(m + 1).padStart(2, "0") + "-01");
  return '<div class="yr">' + months.map(first => {
    const start = weekStart(first), mon = first.slice(0, 7);
    const cells = [];
    for (let i = 0; i < 42; i++){
      const day = addDays(start, i);
      if (i >= 35 && day.slice(0, 7) !== mon) break;
      if (day.slice(0, 7) !== mon){ cells.push('<span class="yr-d out"></span>'); continue; }
      const list = map[day] || [], s = list[0];
      const done = list.length && list.every(x => x.status === "done");
      cells.push('<button class="yr-d' + (list.length ? ' has' : '') + (done ? ' done' : '') + (day === today() ? ' today' : '') + '"' +
        (s ? ' style="--type:' + (TYPE_COLOR[s.type] || "var(--accent)") + '"' : '') +
        ' data-act="cal-go" data-v="' + day + '" aria-label="' + esc(fmtDateLong(day) + (list.length ? " · " + list.length : "")) + '">' + Number(day.slice(8)) + '</button>');
    }
    const count = sessions.filter(s => s.date.slice(0, 7) === mon).length;
    return '<div class="yr-m"><button class="yr-h" data-act="cal-month" data-v="' + first + '">' +
        esc(new Date(first + "T12:00:00Z").toLocaleDateString(LOC(), { month: "long" })) +
        (count ? '<span class="n">' + count + '</span>' : '') + '</button>' +
      '<div class="yr-g">' + DAYS.map(x => '<span class="yr-w">' + esc(x[LI()].slice(0, 1)) + '</span>').join("") + cells.join("") + '</div></div>';
  }).join("") + '</div>';
}

export { calDate, calMode, calToolbar, monthStart, monthView, periodTitle, shiftDate, yearView };
