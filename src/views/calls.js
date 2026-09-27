/* ALTARIS™ — visio de 30 min avec le coach (formule Premium)
   © 2026 ALTARIS™. All rights reserved.

   Le coach publie des créneaux ; le grimpeur Premium en réserve un par mois,
   peut l'annuler jusqu'à 24 h avant et rejoint la visio (Jitsi) 10 min avant.
   Le serveur impose ces règles (call_slots + guard_call_slot). */
import { $, $$, esc } from "../core.js";
import { Access, Session, Store, audit, can } from "../data.js";
import { buildEventICS } from "../domain/calendar.js";
import { callUsedThisMonth, cancellable, joinable } from "../domain/plans.js";
import { downloadFile } from "../export.js";
import { LOC, t } from "../i18n/index.js";
import { render } from "../main.js";
import { Remote } from "../remote.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sendMessage } from "./library.js";

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

/* ---------- côté coach : ses créneaux ---------- */
function coachCallsModal(){
  const me = Session.live(); if (!me) return;
  const mine = Remote.calls.filter(c => c.coach_id === me.id && c.start + c.minutes * 60000 > Date.now());
  const d0 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  Modal.open({
    title: t("vc.slots"), wide: true,
    body: '<div class="stack">' +
      '<p class="small muted">' + esc(t("vc.slotsD")) + '</p>' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("g.date")) + '</span><input class="inp num" type="date" id="vc-date" value="' + d0 + '" min="' + new Date().toISOString().slice(0, 10) + '"></label>' +
        '<label class="f"><span class="lb">' + esc(t("cal.time")) + '</span><input class="inp num" type="time" id="vc-time" value="18:00" step="900"></label>' +
      '</div>' +
      '<label class="check"><input type="checkbox" id="vc-repeat"><span class="t">' + esc(t("vc.repeat")) + '</span></label>' +
      '<div><button class="btn sm pri" id="vc-add">' + ic("plus") + esc(t("vc.add")) + '</button></div>' +
      '<div class="panel in-list">' + (mine.length ? mine.map(c => {
        const who = c.booked_by ? Store.get("users", c.booked_by) : null;
        return '<div class="in-row' + (c.booked_by ? ' msg' : '') + '"><span class="in-ic">' + ic(c.booked_by ? "video" : "cal") + '</span>' +
          '<span class="in-main"><span class="in-who">' + esc(when(c.start)) + '</span>' +
          '<span class="in-what">' + esc(c.booked_by ? t("vc.bookedBy", { name: who ? who.name : "—" }) : t("vc.free")) + '</span></span>' +
          (c.booked_by ? '<a class="btn sm pri" href="' + esc(Remote.jitsiUrl(c.room)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("vc.join")) + '</a>'
                       : '<button class="btn sm ghost" data-del="' + esc(c.id) + '" aria-label="' + esc(t("g.delete")) + '">' + ic("trash") + '</button>') +
        '</div>'; }).join("") : '<div class="in-row"><span class="in-main"><span class="in-what">' + esc(t("vc.noneYet")) + '</span></span></div>') + '</div>' +
    '</div>',
    footer: '<button class="btn" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#vc-add", root).onclick = async () => {
        const [y, m, d] = $("#vc-date", root).value.split("-").map(Number), [hh, mm] = $("#vc-time", root).value.split(":").map(Number);
        if (!y || isNaN(hh)) return toast(t("er.required"), "crit");
        const first = new Date(y, m - 1, d, hh, mm).getTime();
        if (first <= Date.now()) return toast(t("vc.past"), "crit");
        const starts = $("#vc-repeat", root).checked ? [0, 1, 2, 3].map(w => first + w * 7 * 86400000) : [first];
        try{ await Remote.addSlots(me.id, starts); await Remote.loadCalls(); }
        catch(e){ return toast(t("er.saveFailed"), "crit"); }
        toast(t("vc.added", { n: starts.length }), "good"); coachCallsModal();
      };
      $$("[data-del]", root).forEach(b => b.onclick = async () => {
        try{ await Remote.deleteSlot(b.dataset.del); await Remote.loadCalls(); }
        catch(e){ return toast(t("er.saveFailed"), "crit"); }
        coachCallsModal();
      });
    }
  });
}

export { bookModal, callCard, callIcs, cancelCall, coachCallsModal };
