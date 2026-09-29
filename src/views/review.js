/* ALTARIS™ — retour du coach sur une séance terminée
   © 2026 ALTARIS™. All rights reserved.

   Le coach ouvre une séance faite : elle est marquée « vue » (seenBy). Il peut
   laisser un mot, une note par exercice et un message vocal (session.review).
   Le grimpeur voit « Vu par … » puis le retour, signalé sur son accueil tant
   qu'il ne l'a pas ouvert (review.readAt). */
import { $, $$, diffDays, esc, today } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { exById, exName } from "../domain/exercises.js";
import { fmtDate, t } from "../i18n/index.js";
import { canRecord, deleteMedia, mediaUrl, uploadMedia, voiceRecorder } from "../media.js";
import { Remote } from "../remote.js";
import { toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sessionsOf } from "./climber.js";

const isStaffUser = (u) => !!u && (u.role === "coach" || u.role === "admin");

/** Séances faites ces 10 derniers jours, sans retour du coach. */
function toReview(climberId){
  return sessionsOf(climberId).filter(s => s.status === "done" && !s.review && s.type !== "rest" && diffDays(today(), s.date) <= 10);
}
/** Dernier retour pas encore lu par le grimpeur. */
function unreadReview(userId){
  return sessionsOf(userId).filter(s => s.review && !s.review.readAt).sort((a, b) => b.review.at - a.review.at)[0] || null;
}

/** À l'ouverture de la fiche : le coach marque la séance vue, le grimpeur marque le retour lu. */
async function onOpen(s){
  const me = Session.live(); if (!me || s.status !== "done") return;
  if (isStaffUser(me) && !(s.seenBy || {})[me.id]){
    Store.silent = true;
    try{ await Store.put("sessions", s.id, Object.assign({}, s, { seenBy: Object.assign({}, s.seenBy || {}, { [me.id]: Date.now() }) })); }
    finally{ Store.silent = false; }
  }
  if (me.id === s.userId && s.review && !s.review.readAt){
    const cur = Store.get("sessions", s.id);
    await Store.put("sessions", s.id, Object.assign({}, cur, { review: Object.assign({}, cur.review, { readAt: Date.now() }) }));
  }
}

/** Bloc « retour du coach » de la fiche séance (lecture ; formulaire pour l'encadrant). */
function reviewBlock(s){
  if (s.status !== "done") return "";
  const me = Session.live(), r = s.review;
  const seen = Object.keys(s.seenBy || {}).map(id => Store.get("users", id)).filter(Boolean);
  let out = '<div class="stack sm rv">';
  if (r){
    out += '<div class="rv-card"><span class="eyebrow acc">' + esc(t("rv.from", { name: r.name || "" })) + '</span>' +
      (r.text ? '<p class="rv-text">' + esc(r.text) + '</p>' : '') +
      Object.entries(r.notes || {}).filter(([, v]) => v).map(([id, v]) => {
        const e = exById(id);
        return '<div class="rv-note"><b>' + esc(e ? exName(e) : id) + '</b> — ' + esc(v) + '</div>';
      }).join("") +
      (r.audio ? '<audio class="rv-audio" controls preload="none" data-media="' + esc(r.audio) + '"></audio>' : '') +
      '<span class="dim tiny">' + esc(fmtDate(new Date(r.at).toISOString().slice(0, 10), { day: "numeric", month: "long" })) + '</span></div>';
  } else if (!isStaffUser(me) && seen.length){
    out += '<div class="rv-seen">' + ic("check") + esc(t("rv.seenBy", { name: seen.map(u => u.name.split(" ")[0]).join(", ") })) + '</div>';
  }
  if (isStaffUser(me)) out += reviewForm(s);
  return out + '</div>';
}

function reviewForm(s){
  const r = s.review || {}, ids = Object.keys(s.log || {}).concat((s.doneExercises || s.exercises || []).filter(id => !(s.log || {})[id]));
  return '<details class="rv-form"' + (r.at ? '' : ' open') + '><summary>' + esc(t(r.at ? "rv.edit" : "rv.write")) + '</summary>' +
    '<div class="stack sm">' +
      '<textarea class="inp" id="rv-text" rows="3" maxlength="1500" placeholder="' + esc(t("rv.textPh")) + '">' + esc(r.text || "") + '</textarea>' +
      (ids.length ? '<div class="stack sm"><span class="lb small">' + esc(t("rv.perEx")) + '</span>' + ids.slice(0, 8).map(id => {
        const e = exById(id);
        return '<label class="rv-ex"><span>' + esc(e ? exName(e) : id) + '</span>' +
          '<input class="inp" data-rv-ex="' + esc(id) + '" maxlength="300" value="' + esc((r.notes || {})[id] || "") + '"></label>';
      }).join("") + '</div>' : '') +
      (canRecord() ? '<div class="rv-voice row tight" id="rv-voice">' +
        '<button type="button" class="btn sm" id="rv-rec">' + ic("mic") + '<span>' + esc(t(r.audio ? "rv.reRecord" : "rv.record")) + '</span></button>' +
        '<span class="small muted" id="rv-vstate">' + esc(r.audio ? t("rv.voiceKept") : t("rv.voiceD")) + '</span>' +
        (r.audio ? '<button type="button" class="btn xs ghost" id="rv-vdel">' + ic("trash") + '</button>' : '') +
      '</div>' : '') +
      '<div class="row tight"><button type="button" class="btn pri sm" id="rv-send">' + ic("send") + esc(t("rv.send")) + '</button></div>' +
    '</div></details>';
}

/** Branche la fiche : lecteurs audio, formulaire du coach. onSaved : fermer / rafraîchir. */
function mountReview(root, s, onSaved){
  $$("audio[data-media]", root).forEach(async (a) => { const u = await mediaUrl(a.dataset.media); if (u) a.src = u; else a.replaceWith(Object.assign(document.createElement("span"), { className: "dim tiny", textContent: t("rv.voiceGone") })); });
  const send = $("#rv-send", root); if (!send) return;
  let blob = null, removeAudio = false, rec = null, recording = false;
  const state = $("#rv-vstate", root), recBtn = $("#rv-rec", root);
  const setState = (k, vars) => { if (state) state.textContent = t(k, vars); };
  if (recBtn) recBtn.onclick = async () => {
    if (!recording){
      rec = voiceRecorder(120, (b) => { blob = b; recording = false; recBtn.classList.remove("rec"); setState("rv.voiceReady"); });
      try{ await rec.start(); }catch(e){ return toast(t("rv.micDenied"), "crit"); }
      recording = true; recBtn.classList.add("rec"); recBtn.querySelector("span").textContent = t("rv.stop"); setState("rv.recording");
    } else {
      blob = await rec.stop(); recording = false; recBtn.classList.remove("rec");
      recBtn.querySelector("span").textContent = t("rv.reRecord");
      setState("rv.voiceReady");
    }
  };
  const vdel = $("#rv-vdel", root); if (vdel) vdel.onclick = () => { removeAudio = true; blob = null; setState("rv.voiceRemoved"); vdel.remove(); };
  send.onclick = async () => {
    if (recording){ blob = await rec.stop(); recording = false; }
    const me = Session.live(), cur = Store.get("sessions", s.id);
    const text = $("#rv-text", root).value.trim(), notes = {};
    $$("[data-rv-ex]", root).forEach(i => { if (i.value.trim()) notes[i.dataset.rvEx] = i.value.trim(); });
    if (!text && !Object.keys(notes).length && !blob && !(cur.review && cur.review.audio && !removeAudio)) return toast(t("rv.empty"), "crit");
    send.disabled = true;
    let audio = cur.review && !removeAudio ? cur.review.audio || null : null;
    try{
      if (blob){ if (audio) deleteMedia(audio); audio = await uploadMedia(cur.userId, blob); }
      else if (removeAudio && cur.review && cur.review.audio) deleteMedia(cur.review.audio);
    }catch(e){ send.disabled = false; return toast(t(e.code === "too_big" ? "vd.tooBig" : "rv.uploadFailed"), "crit"); }
    const review = { by: me.id, name: me.name, at: Date.now(), text, notes, audio, readAt: null };
    const ok = await Store.put("sessions", cur.id, Object.assign({}, cur, { review,
      seenBy: Object.assign({}, cur.seenBy || {}, { [me.id]: Date.now() }) }));
    if (!ok){ send.disabled = false; return; }
    audit("session_reviewed", cur.id);
    Remote.notify({ kind: "review", athleteId: cur.userId, sessionId: cur.id });
    toast(t("rv.sent"), "good");
    if (onSaved) onSaved();
  };
}

export { mountReview, onOpen as openReview, reviewBlock, toReview, unreadReview };
