/* ALTARIS™ — agenda du coach : ses disponibilités et les séances de ses grimpeurs
   © 2026 ALTARIS™. All rights reserved.

   Semaine : une grille 7 h – 22 h par cases de 30 min. Un clic ouvre une
   disponibilité (créneau de visio) ou la retire ; à la souris, glisser en
   ouvre plusieurs. Les séances des grimpeurs s'affichent à leur heure.
   Mois : chaque jour résume séances, disponibilités et visios ; un clic
   ouvre la semaine correspondante. */
import { $, addDays, esc, today, uid, weekStart } from "../core.js";
import { Access, Store } from "../data.js";
import { sessionStart } from "../domain/calendar.js";
import { expandWeekly, slotsToRemove } from "../domain/plans.js";
import { LOC, fmtDate, t } from "../i18n/index.js";
import { render } from "../main.js";
import { Remote } from "../remote.js";
import { toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { calDate, monthStart, periodTitle } from "./calendar.js";
import { coachJoin } from "./calls.js";
import { View, initials } from "./shell.js";
import { TYPE_COLOR } from "./today.js";

const FROM = 7, TO = 22, REPEAT_WEEKS = 8;
const state = { repeat: false, busy: false, scroll: 0 };

/* Disponibilités : table call_slots en mode Supabase, mémoire de l'onglet en mode local (démonstration). */
const Slots = {
  mine(me){ return Remote.calls.filter(c => c.coach_id === me.id); },
  async add(me, starts){
    if (Remote.client){ await Remote.addSlots(me.id, starts); await Remote.loadCalls(); return; }
    const have = new Set(this.mine(me).map(c => c.start));
    starts.filter(s => !have.has(s)).forEach(s => Remote.calls.push({ id: uid("slot"), coach_id: me.id, start: s, minutes: 30, booked_by: null }));
  },
  async remove(me, list){
    const ids = new Set(list.map(c => c.id));
    if (Remote.client){ await Remote.deleteFreeSlots([...ids]); await Remote.loadCalls(); return; }
    Remote.calls = Remote.calls.filter(c => !ids.has(c.id));
  }
};

const dayOf = (isoDate) => { const [y, m, d] = isoDate.split("-").map(Number); return new Date(y, m - 1, d); };
const isoOf = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const hhmm = (ms) => new Date(ms).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });

/** Séances (hors repos) des grimpeurs suivis, avec leur grimpeur et leur heure de début. */
function teamSessions(){
  return Access.climbers().flatMap(c => Store.list("sessions").filter(s => s.userId === c.id && s.type !== "rest")
    .map(s => ({ s, c, time: sessionStart(s, c.profile) })));
}

function chip(x, withTitle){
  const { s, c, time } = x;
  return '<button type="button" class="ag-ev' + (s.status === "done" ? ' done' : s.status === "missed" ? ' missed' : '') + '" style="--c:' + (TYPE_COLOR[s.type] || "var(--accent)") + '"' +
    ' data-act="session-open" data-v="' + esc(s.id) + '" title="' + esc(c.name + " · " + s.title + (time ? " · " + time : "")) + '">' +
    '<b>' + esc(initials(c.name)) + '</b>' + (withTitle ? '<span>' + esc(s.title) + '</span>' : '') + '</button>';
}

function toolbar(mode){
  return '<div class="cal-bar noprint">' +
    '<div class="row tight">' +
      '<button class="btn icon sm ghost" data-act="cal-nav" data-v="-1" aria-label="' + esc(t("g.previous")) + '">' + ic("chevL") + '</button>' +
      '<button class="btn sm ghost" data-act="cal-nav" data-v="0">' + esc(t("g.today")) + '</button>' +
      '<button class="btn icon sm ghost" data-act="cal-nav" data-v="1" aria-label="' + esc(t("g.next")) + '">' + ic("chevR") + '</button>' +
      '<span class="cal-title">' + esc(periodTitle(mode, calDate())) + '</span>' +
    '</div>' +
    '<div class="seg sm" role="tablist" aria-label="' + esc(t("cv.view")) + '">' + ["week", "month"].map(m =>
      '<button role="tab" aria-selected="' + (m === mode) + '" class="' + (m === mode ? "on" : "") + '" data-act="cal-mode" data-v="' + m + '">' +
        esc(t("cv." + m)) + '</button>').join("") + '</div>' +
  '</div>';
}

function legend(){
  return '<div class="ag-legend small muted">' +
    '<span><i class="ag-key open"></i>' + esc(t("ag.keyOpen")) + '</span>' +
    '<span><i class="ag-key booked"></i>' + esc(t("ag.keyBooked")) + '</span>' +
    '<span><i class="ag-key ev"></i>' + esc(t("ag.keySession")) + '</span></div>';
}

function stats(sessions, slots, now){
  const free = slots.filter(c => !c.booked_by && c.start > now).length;
  const booked = slots.filter(c => c.booked_by).length;
  const st = (cls, icon, v, label) => '<div class="in-stat ' + cls + '"><span class="in-stat-ic">' + ic(icon) + '</span>' +
    '<span class="in-stat-main"><b>' + v + '</b><span>' + esc(label) + '</span></span></div>';
  return '<div class="in-stats ag-stats">' +
    st("week", "cal", sessions.length, t("ag.stSessions")) +
    st("good", "check", sessions.filter(x => x.s.status === "done").length, t("ag.stDone")) +
    st("msg", "clock", free, t("ag.stFree")) +
    st("good", "video", booked, t("ag.stBooked")) + '</div>';
}

function weekHtml(me){
  const ws = weekStart(calDate()), now = Date.now(), todayIso = today();
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i));
  const all = teamSessions().filter(x => days.includes(x.s.date));
  const from = dayOf(days[0]).getTime(), to = dayOf(addDays(ws, 7)).getTime();
  const slots = Slots.mine(me).filter(c => c.start >= from && c.start < to);
  const byStart = new Map(slots.map(c => [c.start, c]));
  /* Séance placée dans la grille si elle a une heure entre 7 h et 22 h, sinon dans la ligne « journée ». */
  const cellOf = (x) => {
    if (!x.time) return null;
    const [h, m] = x.time.split(":").map(Number);
    if (isNaN(h) || h < FROM || h >= TO) return null;
    const d = dayOf(x.s.date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m >= 30 ? 30 : 0).getTime();
  };
  const timed = new Map(), allDay = {};
  for (const x of all){
    const at = cellOf(x);
    if (at == null) (allDay[x.s.date] = allDay[x.s.date] || []).push(x);
    else timed.set(at, (timed.get(at) || []).concat([x]));
  }

  let rows = '<span class="ag-h"></span>' + days.map(d =>
    '<span class="ag-dh' + (d === todayIso ? ' today' : '') + '">' + esc(fmtDate(d, { weekday: "short" })) + '<b>' + Number(d.slice(8)) + '</b></span>').join("");
  rows += '<span class="ag-h ag-allh">' + esc(t("ag.allDay")) + '</span>' + days.map(d =>
    '<span class="ag-all">' + (allDay[d] || []).map(x => chip(x, true)).join("") + '</span>').join("");
  for (let h = FROM; h < TO; h++) for (const m of [0, 30]){
    rows += '<span class="ag-h">' + (m ? '' : String(h).padStart(2, "0") + ":00") + '</span>';
    for (const d of days){
      const dd = dayOf(d), at = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate(), h, m).getTime();
      const slot = byStart.get(at), past = at <= now;
      const who = slot && slot.booked_by ? Store.get("users", slot.booked_by) : null;
      const evs = timed.get(at) || [];
      const label = hhmm(at) + " · " + (slot ? (slot.booked_by ? t("vc.bookedBy", { name: who ? who.name : "—" }) : t("ag.keyOpen")) : t("vc.closed"));
      rows += '<div class="ag-c' + (slot ? (slot.booked_by ? ' booked' : ' open') : '') + (past ? ' past' : '') + (m ? '' : ' hr') + '" data-ms="' + at + '"' +
        (past && !(slot && slot.booked_by) ? ' data-off="1"' : ' role="button" tabindex="0"') + ' aria-label="' + esc(label) + '">' +
        (who ? '<span class="ag-visio">' + ic("video") + esc(who.name.split(" ")[0]) + '</span>' : '') +
        evs.map(x => chip(x, evs.length === 1 && !who)).join("") + '</div>';
    }
  }
  return stats(all, slots, now) +
    '<div class="between ag-help"><p class="small muted">' + esc(t("ag.help")) + '</p>' +
      '<label class="vg-rep"><input type="checkbox" id="ag-repeat"' + (state.repeat ? ' checked' : '') + '> ' + esc(t("vc.repeatW", { n: REPEAT_WEEKS })) + '</label></div>' +
    '<div class="panel ag-wrap"><div class="ag-grid" id="ag-grid">' + rows + '</div></div>' + legend();
}

function monthHtml(me){
  const first = monthStart(calDate()), next = monthStart(calDate(), 1), now = Date.now(), todayIso = today();
  const gridFrom = weekStart(first);
  const days = []; for (let d = gridFrom; d < next || days.length % 7; d = addDays(d, 1)) days.push(d);
  const all = teamSessions().filter(x => x.s.date >= first && x.s.date < next);
  const slots = Slots.mine(me);
  const inMonth = slots.filter(c => { const k = isoOf(c.start); return k >= first && k < next; });
  const slotsBy = {}; slots.forEach(c => { const k = isoOf(c.start); (slotsBy[k] = slotsBy[k] || []).push(c); });
  const sessBy = {}; teamSessions().forEach(x => { (sessBy[x.s.date] = sessBy[x.s.date] || []).push(x); });
  const head = [0, 1, 2, 3, 4, 5, 6].map(i => '<span class="am-h">' + esc(fmtDate(addDays(gridFrom, i), { weekday: "short" })) + '</span>').join("");
  const cells = days.map(d => {
    const ss = sessBy[d] || [], sl = slotsBy[d] || [];
    const free = sl.filter(c => !c.booked_by && c.start > now).length, booked = sl.filter(c => c.booked_by).length;
    const names = [...new Set(ss.map(x => x.c.id))].map(id => ss.find(x => x.c.id === id));
    return '<button class="am-d' + (d < first || d >= next ? ' out' : '') + (d === todayIso ? ' today' : '') + '" data-act="agenda-day" data-v="' + d + '"' +
      ' aria-label="' + esc(fmtDate(d, { weekday: "long", day: "numeric", month: "long" }) + " · " + t("ag.daySum", { s: ss.length, f: free, b: booked })) + '">' +
      '<span class="am-n">' + Number(d.slice(8)) + '</span>' +
      (names.length ? '<span class="am-av">' + names.slice(0, 4).map(x => '<i style="--c:' + (TYPE_COLOR[x.s.type] || "var(--accent)") + '">' + esc(initials(x.c.name)) + '</i>').join("") +
        (names.length > 4 ? '<i class="more">+' + (names.length - 4) + '</i>' : '') + '</span>' : '') +
      (free ? '<span class="am-tag open">' + esc(t("ag.nFree", { n: free })) + '</span>' : '') +
      (booked ? '<span class="am-tag booked">' + ic("video") + booked + '</span>' : '') +
    '</button>';
  }).join("");
  return stats(all, inMonth, now) +
    '<p class="small muted">' + esc(t("ag.monthHelp")) + '</p>' +
    '<div class="panel pad"><div class="am-grid">' + head + cells + '</div></div>' + legend();
}

function viewAgenda(me){
  if (View.calMode !== "month") View.calMode = "week";        // l'agenda n'a que Semaine et Mois
  const mode = View.calMode;
  return '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("cal.title")) + '</span>' +
      '<h2>' + esc(t("ag.title")) + '</h2><p>' + esc(t("ag.sub")) + '</p></div>' +
      (Access.climbers().length ? '<div class="row tight noprint"><button class="btn sm pri" data-act="block-new" data-v="' + esc(Access.climbers()[0].id) + '">' +
        ic("plus") + esc(t("cal.addBlock")) + '</button></div>' : '') + '</div>' +
    toolbar(mode) + (mode === "month" ? monthHtml(me) : weekHtml(me)) +
    (Remote.client ? '' : '<p class="dim tiny">' + esc(t("ag.localNote")) + '</p>');
}

/** Gestes sur la grille : clic = ouvrir / retirer une disponibilité, glisser à la souris = plusieurs. */
function bindAgenda(me){
  const host = $("#ag-grid"); if (!host || !me) return;
  const rep = $("#ag-repeat"); if (rep) rep.onchange = () => { state.repeat = rep.checked; };
  /* La grille défile dans son cadre : on garde la position d'un rendu à l'autre. */
  host.scrollTop = state.scroll;
  host.addEventListener("scroll", () => { state.scroll = host.scrollTop; }, { passive: true });
  const commit = async (mode, starts) => {
    if (!starts.length || state.busy) return;
    state.busy = true;
    try{
      if (mode === "add") await Slots.add(me, expandWeekly(starts, state.repeat ? REPEAT_WEEKS : 1));
      else await Slots.remove(me, slotsToRemove(Slots.mine(me), starts, state.repeat));
    }catch(e){ toast(t("er.saveFailed"), "crit"); }
    state.busy = false;
    render();
  };
  const usable = (el) => el && !el.dataset.off && !el.classList.contains("booked");
  const eligible = (el, mode) => usable(el) && (mode === "add" ? !el.classList.contains("open") : el.classList.contains("open"));
  let drag = null, painted = false;
  host.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ag-ev")) return;
    const el = e.target.closest(".ag-c");
    if (!usable(el) || e.pointerType === "touch" || e.button) return;
    e.preventDefault();
    drag = { mode: el.classList.contains("open") ? "remove" : "add", set: new Set([Number(el.dataset.ms)]) };
    el.classList.add(drag.mode === "add" ? "pend-add" : "pend-del");
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest ? hit.closest(".ag-c") : null;
    if (eligible(el, drag.mode) && !drag.set.has(Number(el.dataset.ms))){
      drag.set.add(Number(el.dataset.ms));
      el.classList.add(drag.mode === "add" ? "pend-add" : "pend-del");
    }
  });
  const end = () => { if (!drag) return; const d = drag; drag = null; painted = true; setTimeout(() => { painted = false; }, 0); commit(d.mode, [...d.set]); };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointerleave", end);
  const tap = (el) => {
    if (!el || el.dataset.off) return;
    if (el.classList.contains("booked")){
      const c = Slots.mine(me).find(x => x.start === Number(el.dataset.ms));
      if (c && Remote.client) coachJoin(c.id);
      return;
    }
    commit(el.classList.contains("open") ? "remove" : "add", [Number(el.dataset.ms)]);
  };
  host.addEventListener("click", (e) => { if (!painted && !e.target.closest(".ag-ev")) tap(e.target.closest(".ag-c")); });
  host.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("ag-c")){ e.preventDefault(); tap(e.target); }
  });
}

export { bindAgenda, viewAgenda };
