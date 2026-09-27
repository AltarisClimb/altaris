/* ALTARIS™ — visio de 30 min avec le coach (formule Premium)
   © 2026 ALTARIS™. All rights reserved.

   Le coach publie des créneaux ; le grimpeur Premium en réserve un par mois,
   peut l'annuler jusqu'à 24 h avant et rejoint la visio (Jitsi) 10 min avant.
   Le serveur impose ces règles (call_slots + guard_call_slot). */
import { $, $$, esc } from "../core.js";
import { Access, Session, Store, audit, can } from "../data.js";
import { buildEventICS } from "../domain/calendar.js";
import { callUsedThisMonth, cancellable, expandWeekly, joinable, slotsToRemove } from "../domain/plans.js";
import { downloadFile } from "../export.js";
import { LOC, t } from "../i18n/index.js";
import { render } from "../main.js";
import { Remote } from "../remote.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sendMessage } from "./library.js";
import { View } from "./shell.js";

const when = (ms) => new Date(ms).toLocaleString(LOC(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const hour = (ms) => new Date(ms).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" });

/** Carte « Visio avec votre coach » (grimpeur Premium) : réserver, rejoindre, annuler. */
function callCard(me){
  if (!Remote.client || me.role !== "climber" || !can(me, "calls")) return "";
  const coach = Access.myCoach(); if (!coach) return "";
  const mine = Remote.calls.filter(c => c.booked_by === me.id && c.start + c.minutes * 60000 > Date.now());
  const next = mine[0];
  if (next) return '<div class="panel pad stack sm vc-card">' +
    '<span class="eyebrow acc">' + esc(t("vc.title", { name: coach.name })) + '</span>' +
    '<div class="td-big">' + esc(when(next.start)) + '</div>' +
    '<div class="row tight noprint">' +
      '<a class="btn sm pri' + (joinable(next) ? '' : ' off') + '" ' + (joinable(next) ? 'href="' + esc(Remote.jitsiUrl(next.room)) + '" target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true"') + '>' +
        ic("video") + esc(t("vc.join")) + '</a>' +
      '<button class="btn sm" data-act="call-ics" data-v="' + esc(next.id) + '">' + ic("cal") + esc(t("cal.addToAgenda")) + '</button>' +
      (cancellable(next) ? '<button class="btn sm ghost" data-act="call-cancel" data-v="' + esc(next.id) + '">' + esc(t("vc.cancel")) + '</button>' : '') +
    '</div>' +
    /* Heure de fin, puis « se termine dans X min » pendant les 5 dernières minutes. */
    (() => {
      const end = next.start + next.minutes * 60000, left = end - Date.now();
      return left > 0 && left <= 5 * 60000 && Date.now() >= next.start
        ? '<div class="notice warn">' + ic("clock") + '<span>' + esc(t("vc.endsIn", { n: Math.ceil(left / 60000) })) + '</span></div>'
        : '<p class="small muted">' + esc(t("vc.endsAt", { time: hour(end) })) + '</p>';
    })() +
    '<p class="dim tiny">' + esc(joinable(next) ? t("vc.open") : t("vc.opensAt")) + '</p></div>';
  const used = callUsedThisMonth(Remote.calls, me.id);
  const free = Remote.calls.filter(c => !c.booked_by && c.start > Date.now()).length;
  return '<div class="panel pad stack sm vc-card">' +
    '<span class="eyebrow acc">' + esc(t("vc.title", { name: coach.name })) + '</span>' +
    '<p class="small muted">' + esc(used ? t("vc.usedD") : free ? t("vc.availD") : t("vc.noSlotD")) + '</p>' +
    (!used && free ? '<div class="row tight noprint"><button class="btn sm pri" data-act="call-book">' + ic("video") + esc(t("vc.book")) + '</button></div>' : '') +
  '</div>';
}

/** Choisir un créneau libre du coach (30 prochains jours), groupés par jour. */
function bookModal(){
  const me = Session.live(), coach = Access.myCoach(); if (!me || !coach) return;
  const horizon = Date.now() + 31 * 86400000;
  const free = Remote.calls.filter(c => !c.booked_by && c.start > Date.now() && c.start < horizon);
  const byDay = {};
  free.forEach(c => { const k = new Date(c.start).toLocaleDateString(LOC(), { weekday: "long", day: "numeric", month: "long" }); (byDay[k] = byDay[k] || []).push(c); });
  Modal.open({
    title: t("vc.book"),
    body: '<div class="stack">' +
      '<p class="small muted">' + esc(t("vc.bookD", { name: coach.name })) + '</p>' +
      (free.length ? Object.entries(byDay).map(([day, list]) =>
        '<div class="stack sm"><span class="eyebrow">' + esc(day) + '</span><div class="row tight">' +
          list.map(c => '<button class="filt" data-slot="' + esc(c.id) + '">' + esc(hour(c.start)) + '</button>').join("") +
        '</div></div>').join("") : '<p class="small muted">' + esc(t("vc.noSlotD")) + '</p>') +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-slot]", root).forEach(b => b.onclick = async () => {
        const slot = Remote.calls.find(c => c.id === b.dataset.slot);
        b.disabled = true;
        try{ await Remote.bookSlot(slot.id); }
        catch(e){ b.disabled = false; await Remote.loadCalls().catch(() => {}); return toast(t(e.code === "slot_taken" ? "vc.taken" : "er.saveFailed"), "crit"); }
        await Remote.loadCalls().catch(() => {});
        sendMessage(me.id, coach.id, { ctx: t("vc.ctx"), text: "📅 " + t("vc.booked", { when: when(slot.start) }) });
        audit("call_booked", slot.id);
        Modal.close(); toast(t("vc.bookedToast", { when: when(slot.start) }), "good"); render();
      });
    }
  });
}

async function cancelCall(id){
  const me = Session.live(), coach = Access.myCoach(), slot = Remote.calls.find(c => c.id === id);
  if (!slot || !confirm(t("vc.cancelConfirm"))) return;
  try{ await Remote.cancelBooking(id); }
  catch(e){ return toast(t("vc.cancelLate"), "crit"); }
  await Remote.loadCalls().catch(() => {});
  if (coach) sendMessage(me.id, coach.id, { ctx: t("vc.ctx"), text: "❌ " + t("vc.cancelled", { when: when(slot.start) }) });
  audit("call_cancelled", id);
  toast(t("vc.cancelledToast"), "good"); render();
}

function callIcs(id){
  const slot = Remote.calls.find(c => c.id === id); if (!slot) return;
  const me = Session.live();
  const other = me.role === "climber" ? Access.myCoach() : Store.get("users", slot.booked_by);
  downloadFile("altaris-visio.ics", buildEventICS({ uid: "call-" + slot.id, start: slot.start, minutes: slot.minutes,
    title: t("vc.icsTitle", { name: other ? other.name : "ALTARIS" }), desc: Remote.jitsiUrl(slot.room), url: Remote.jitsiUrl(slot.room) }),
    "text/calendar;charset=utf-8");
}

/* ---------- côté coach : grille de disponibilités (clic = ouvrir / retirer) ----------
   Cases de 30 min, 7 h – 22 h, une semaine à la fois. Un clic ouvre une case vide
   ou retire un créneau libre ; à la souris, glisser applique le même geste à
   plusieurs cases. « Chaque semaine » répète l'ajout sur 8 semaines et retire
   toute la série à venir. Les créneaux réservés ne se retirent pas par erreur. */
const GRID_FROM = 7, GRID_TO = 22, REPEAT_WEEKS = 8;
const grid = { week: null, repeat: false };

function mondayOf(ms){
  const d = new Date(ms); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function gridHtml(me){
  const w0 = grid.week, now = Date.now();
  const mine = new Map(Remote.calls.filter(c => c.coach_id === me.id).map(c => [c.start, c]));
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(w0); d.setDate(d.getDate() + i); return d; });
  let rows = "";
  for (let h = GRID_FROM; h < GRID_TO; h++) for (const m of [0, 30]){
    rows += '<span class="vg-h">' + (m ? '' : String(h).padStart(2, "0") + ":00") + '</span>';
    for (const d of days){
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
      const slot = mine.get(at);
      const who = slot && slot.booked_by ? Store.get("users", slot.booked_by) : null;
      const past = at <= now;
      rows += '<button class="vg-c' + (slot ? (slot.booked_by ? ' booked' : ' open') : '') + (past ? ' past' : '') + '" data-ms="' + at + '"' +
        (past && !(slot && slot.booked_by) ? ' disabled' : '') +
        ' aria-label="' + esc(when(at) + " · " + (slot ? (slot.booked_by ? t("vc.bookedBy", { name: who ? who.name : "—" }) : t("vc.free")) : t("vc.closed"))) + '">' +
        (who ? esc(who.name.split(" ").map(x => x[0]).join("").slice(0, 2)) : '') + '</button>';
    }
  }
  const booked = Remote.calls.filter(c => c.coach_id === me.id && c.booked_by && c.start + c.minutes * 60000 > now);
  return '<div class="stack">' +
    '<p class="small muted">' + esc(t("vc.gridD")) + '</p>' +
    '<div class="between">' +
      '<div class="row tight"><button class="btn icon sm ghost" data-g="-1" aria-label="' + esc(t("g.previous")) + '">' + ic("chevL") + '</button>' +
        '<button class="btn sm ghost" data-g="0">' + esc(t("g.today")) + '</button>' +
        '<button class="btn icon sm ghost" data-g="1" aria-label="' + esc(t("g.next")) + '">' + ic("chevR") + '</button>' +
        '<span class="cal-title">' + esc(days[0].toLocaleDateString(LOC(), { day: "numeric", month: "short" }) + " – " +
          days[6].toLocaleDateString(LOC(), { day: "numeric", month: "short", year: "numeric" })) + '</span></div>' +
      '<label class="vg-rep"><input type="checkbox" id="vg-repeat"' + (grid.repeat ? ' checked' : '') + '> ' + esc(t("vc.repeatW", { n: REPEAT_WEEKS })) + '</label>' +
    '</div>' +
    '<div class="vg" id="vg">' +
      '<span></span>' + days.map(d => '<span class="vg-dh' + (d.toDateString() === new Date().toDateString() ? ' today' : '') + '">' +
        esc(d.toLocaleDateString(LOC(), { weekday: "short" })) + '<b>' + d.getDate() + '</b></span>').join("") +
      rows +
    '</div>' +
    '<div class="row tight small muted"><span class="vg-key open"></span>' + esc(t("vc.free")) +
      '<span class="vg-key booked"></span>' + esc(t("vc.bookedKey")) + '</div>' +
    (booked.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("vc.upcoming")) + '</span><div class="panel in-list">' + booked.map(c => {
      const who = Store.get("users", c.booked_by);
      return '<div class="in-row msg"><span class="in-ic">' + ic("video") + '</span><span class="in-main"><span class="in-who">' + esc(when(c.start)) + '</span>' +
        '<span class="in-what">' + esc(t("vc.bookedBy", { name: who ? who.name : "—" })) + '</span></span>' +
        '<button class="btn sm pri" data-act="call-join" data-v="' + esc(c.id) + '">' + esc(t("vc.join")) + '</button></div>';
    }).join("") + '</div></div>' : '') +
  '</div>';
}

function coachCallsModal(){
  const me = Session.live(); if (!me) return;
  if (!grid.week) grid.week = mondayOf(Date.now());
  Modal.open({
    title: t("vc.slots"), wide: true,
    body: '<div id="vg-root">' + gridHtml(me) + '</div>',
    footer: '<button class="btn" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const host = $("#vg-root", root);
      const redraw = () => { host.innerHTML = gridHtml(me); };
      let busy = false;

      /* Appliquer un geste : ouvrir ou retirer les cases choisies (et leur série si « chaque semaine »). */
      const commit = async (mode, starts) => {
        if (!starts.length || busy) return;
        busy = true;
        try{
          if (mode === "add") await Remote.addSlots(me.id, expandWeekly(starts, grid.repeat ? REPEAT_WEEKS : 1));
          else await Remote.deleteFreeSlots(slotsToRemove(Remote.calls.filter(c => c.coach_id === me.id), starts, grid.repeat).map(c => c.id));
          await Remote.loadCalls();
        }catch(e){ toast(t("er.saveFailed"), "crit"); }
        busy = false;
        redraw();
      };

      /* Souris / stylet : glisser pour peindre. Toucher : un tap = une case (la grille défile). */
      let drag = null, justPainted = false;
      const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest(".vg-c") : null; };
      const eligible = (el, mode) => el && !el.disabled && !el.classList.contains("booked") &&
        (mode === "add" ? !el.classList.contains("open") : el.classList.contains("open"));
      host.addEventListener("pointerdown", (e) => {
        const el = e.target.closest(".vg-c");
        if (!el || e.pointerType === "touch" || el.disabled || el.classList.contains("booked")) return;
        e.preventDefault();
        drag = { mode: el.classList.contains("open") ? "remove" : "add", set: new Set([Number(el.dataset.ms)]) };
        el.classList.add(drag.mode === "add" ? "pend-add" : "pend-del");
      });
      host.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const el = cellAt(e.clientX, e.clientY);
        if (eligible(el, drag.mode) && !drag.set.has(Number(el.dataset.ms))){
          drag.set.add(Number(el.dataset.ms));
          el.classList.add(drag.mode === "add" ? "pend-add" : "pend-del");
        }
      });
      const end = () => { if (!drag) return; const d = drag; drag = null; justPainted = true; setTimeout(() => { justPainted = false; }, 0); commit(d.mode, [...d.set]); };
      host.addEventListener("pointerup", end);
      host.addEventListener("pointerleave", end);
      host.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-g]");
        if (nav){ const n = Number(nav.dataset.g); grid.week = n ? grid.week + n * 7 * 86400000 : mondayOf(Date.now());
                  grid.week = mondayOf(grid.week + 12 * 3600000); redraw(); return; }
        const el = e.target.closest(".vg-c");
        if (!el || justPainted) return;
        if (el.classList.contains("booked")){                       // réservé : ouvrir la visio
          const c = Remote.calls.find(x => x.start === Number(el.dataset.ms) && x.coach_id === me.id);
          if (c){ Modal.close(); coachJoin(c.id); }
          return;
        }
        if (el.disabled) return;
        commit(el.classList.contains("open") ? "remove" : "add", [Number(el.dataset.ms)]);
      });
      host.addEventListener("change", (e) => { if (e.target.id === "vg-repeat") grid.repeat = e.target.checked; });
    }
  });
}

/* ---------- côté coach : minuteur de la visio ----------
   La visio a lieu dans Jitsi (autre onglet) : le minuteur vit dans ALTARIS.
   5 min avant la fin prévue, le grimpeur reçoit un message automatique (et sa
   notification), le coach une notification système et un bip. L'avertissement
   part une seule fois par visio, même après un rechargement. */
const TIMER_KEY = "altaris.callTimer", WARNED_KEY = "altaris.callWarned.";
const WARN_BEFORE = 5 * 60000;
let timerTick = null;

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }

/** Le coach rejoint : ouvrir Jitsi et lancer le minuteur. */
function coachJoin(id){
  const c = Remote.calls.find(x => x.id === id); if (!c) return;
  window.open(Remote.jitsiUrl(c.room), "_blank", "noopener");
  View.callTimer = id; lsSet(TIMER_KEY, id);
  try{ if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); }catch(e){}
  render();
}
function closeTimer(){ View.callTimer = null; lsSet(TIMER_KEY, null); render(); }
/** Au démarrage : reprendre le minuteur d'une visio encore en cours. */
function restoreTimer(){
  const id = lsGet(TIMER_KEY); if (!id) return;
  const c = Remote.calls.find(x => x.id === id);
  if (c && c.start + c.minutes * 60000 > Date.now() - 10 * 60000) View.callTimer = id; else lsSet(TIMER_KEY, null);
}

/** Prévenir le grimpeur (automatique à T-5 min, ou bouton « Prévenir maintenant »). */
async function warnClimber(c, manual){
  if (lsGet(WARNED_KEY + c.id) && !manual) return;
  lsSet(WARNED_KEY + c.id, "1");
  const me = Session.live(), who = Store.get("users", c.booked_by);
  const left = Math.max(1, Math.round((c.start + c.minutes * 60000 - Date.now()) / 60000));
  await sendMessage(me.id, c.booked_by, { ctx: t("vc.ctx"), text: "⏱️ " + t("vc.endingSoon", { n: left }) });
  try{
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(t("vc.endingCoach", { n: left, name: who ? who.name.split(" ")[0] : "" }), { body: t("vc.warnedD"), tag: "call-" + c.id });
  }catch(e){}
  beepOnce();
  if (manual) toast(t("vc.warned"), "good");
}
function beepOnce(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.12; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
  }catch(e){}
}

let restored = false;
function timerWidget(){
  if (!Remote.client) return "";
  /* Après un rechargement : reprendre le minuteur dès que les créneaux sont chargés. */
  if (!View.callTimer && !restored && Remote.calls.length){ restored = true; restoreTimer(); }
  if (!View.callTimer) return "";
  const c = Remote.calls.find(x => x.id === View.callTimer); if (!c) return "";
  const who = Store.get("users", c.booked_by);
  return '<div class="ct" id="ct" role="timer" aria-live="off">' +
    '<div class="ct-top"><span class="ct-who">' + ic("video") + esc(t("vc.title", { name: who ? who.name : "—" })) + '</span>' +
      '<button class="btn icon xs ghost" data-act="call-timer-close" aria-label="' + esc(t("g.close")) + '">' + ic("x") + '</button></div>' +
    '<div class="ct-time" id="ct-time">—</div>' +
    '<div class="ct-bar"><span id="ct-bar"></span></div>' +
    '<div class="row tight"><a class="btn xs" href="' + esc(Remote.jitsiUrl(c.room)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("vc.backToCall")) + '</a>' +
      '<button class="btn xs ghost" data-act="call-warn" data-v="' + esc(c.id) + '"' + (lsGet(WARNED_KEY + c.id) ? ' disabled' : '') + '>' + esc(t("vc.warnNow")) + '</button></div>' +
  '</div>';
}

/** Repeint le minuteur chaque seconde et déclenche l'avertissement à T-5 min. */
function bindCallTimer(){
  if (timerTick){ clearInterval(timerTick); timerTick = null; }
  if (!View.callTimer) return;
  const paint = () => {
    const c = Remote.calls.find(x => x.id === View.callTimer);
    const el = document.getElementById("ct"); if (!c || !el){ clearInterval(timerTick); timerTick = null; return; }
    const end = c.start + c.minutes * 60000, now = Date.now();
    const notStarted = now < c.start, left = Math.max(0, end - (notStarted ? c.start : now));
    const s = Math.ceil((notStarted ? c.start - now : left) / 1000);
    document.getElementById("ct-time").textContent = notStarted ? t("vc.startsIn", { t: fmtMs(s) })
      : left > 0 ? t("vc.left", { t: fmtMs(s) }) : t("vc.over");
    document.getElementById("ct-bar").style.width = (notStarted ? 0 : Math.min(100, 100 * (now - c.start) / (c.minutes * 60000))) + "%";
    el.classList.toggle("warn", !notStarted && left <= WARN_BEFORE && left > 0);
    el.classList.toggle("over", left <= 0);
    if (!notStarted && left <= WARN_BEFORE && left > 0 && !lsGet(WARNED_KEY + c.id)){
      warnClimber(c, false);
      const b = el.querySelector("[data-act=call-warn]"); if (b) b.disabled = true;
    }
  };
  paint();
  timerTick = setInterval(paint, 1000);
}
function fmtMs(s){ return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

export { bindCallTimer, bookModal, callCard, callIcs, cancelCall, closeTimer, coachCallsModal, coachJoin, restoreTimer, timerWidget, warnClimber };
