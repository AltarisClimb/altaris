/* ALTARIS™ — analyse vidéo (Premium)
   © 2026 ALTARIS™. All rights reserved.

   Le grimpeur envoie une vidéo d'un essai ; son coach la regarde et commente à
   des instants précis (« 0:12 — hanche trop loin du mur »). Toucher un
   commentaire ramène la vidéo à ce moment. Document « videos » :
   { path, title, sessionId, createdAt, notes: [{ t, text, by, name, at }], readAt, seenAt }. */
import { $, $$, esc, uid } from "../core.js";
import { Session, Store, audit, can } from "../data.js";
import { fmtDate, t } from "../i18n/index.js";
import { MAX_BYTES, deleteMedia, mediaUrl, uploadMedia } from "../media.js";
import { Remote } from "../remote.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sessionsOf } from "./climber.js";

const isStaffUser = (u) => !!u && (u.role === "coach" || u.role === "admin");
const fmtT = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

function videosOf(userId){ return Store.list("videos").filter(v => v.userId === userId).sort((a, b) => b.createdAt - a.createdAt); }
/** Vidéos pas encore commentées par le coach. */
function toAnalyse(climberId){ return videosOf(climberId).filter(v => !(v.notes || []).length); }
/** Commentaires du coach arrivés depuis la dernière visite du grimpeur. */
function newNotes(v){ return (v.notes || []).filter(n => n.by !== v.userId && n.at > (v.readAt || 0)).length; }
function unreadVideo(userId){ return videosOf(userId).find(v => newNotes(v) > 0) || null; }

function status(v){
  const n = (v.notes || []).length, fresh = newNotes(v);
  if (!n) return '<span class="chip warn">' + esc(t("vd.pending")) + '</span>';
  return '<span class="chip ' + (fresh ? "acc" : "good") + '">' + esc(t(fresh ? "vd.newNotes" : "vd.notesN", { n: fresh || n })) + '</span>';
}

/** Panneau « Analyse vidéo » (Progrès du grimpeur, fiche athlète du coach). */
function videoPanel(u, self){
  const list = videosOf(u.id);
  if (!self && !list.length) return "";
  const allowed = !self || can(u, "video");
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("vd.title")) + '</span>' +
      (self ? '<button class="btn sm' + (allowed ? ' pri' : '') + '" data-act="video-new">' + ic(allowed ? "video" : "lock") + esc(t("vd.send")) + '</button>' : '') + '</div>' +
    (list.length
      ? '<div class="rows">' + list.slice(0, 8).map(v =>
          '<button class="rw" data-act="video-open" data-v="' + esc(v.id) + '"><span class="vd-ic">' + ic("video") + '</span>' +
            '<span class="gr"><span class="t1">' + esc(v.title || t("vd.untitled")) + '</span>' +
            '<span class="t2">' + esc(fmtDate(dateOf(v.createdAt), { day: "numeric", month: "short" })) + '</span></span>' +
            status(v) + ic("chevR", "chev") + '</button>').join("") + '</div>'
      : '<p class="small muted">' + esc(t(allowed ? "vd.emptyD" : "vd.premiumD")) + '</p>') +
  '</div>';
}

/** Envoyer une vidéo (grimpeur). sessionId : séance à laquelle la rattacher. */
function videoNewModal(sessionId){
  const me = Session.live();
  const recent = sessionsOf(me.id).filter(s => s.status === "done").slice(-8).reverse();
  let file = null;
  Modal.open({
    title: t("vd.send"),
    body: '<div class="stack">' +
      '<p class="small muted">' + esc(t("vd.sendD")) + '</p>' +
      '<label class="vd-drop" for="vd-file">' + ic("video") + '<span id="vd-fname">' + esc(t("vd.pick")) + '</span>' +
        '<input type="file" id="vd-file" accept="video/*" hidden></label>' +
      '<label class="f"><span class="lb">' + esc(t("vd.what")) + '</span>' +
        '<input class="inp" id="vd-title" maxlength="120" placeholder="' + esc(t("vd.whatPh")) + '"></label>' +
      (recent.length ? '<label class="f"><span class="lb">' + esc(t("vd.session")) + '</span><select class="inp" id="vd-session">' +
        '<option value="">—</option>' + recent.map(s => '<option value="' + esc(s.id) + '"' + (s.id === sessionId ? ' selected' : '') + '>' +
          esc(fmtDate(s.date, { day: "numeric", month: "short" }) + " · " + s.title) + '</option>').join("") + '</select></label>' : '') +
      '<p class="dim tiny">' + esc(t("vd.limits", { n: Math.round(MAX_BYTES / 1048576) })) + '</p>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="vd-ok" disabled>' + ic("send") + esc(t("vd.upload")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const ok = $("#vd-ok", root);
      $("#vd-file", root).onchange = (e) => {
        file = e.target.files && e.target.files[0];
        if (file && file.size > MAX_BYTES){ file = null; toast(t("vd.tooBig"), "crit"); }
        $("#vd-fname", root).textContent = file ? file.name + " · " + Math.round(file.size / 104857.6) / 10 + " Mo" : t("vd.pick");
        ok.disabled = !file;
      };
      ok.onclick = async () => {
        if (!file) return;
        ok.disabled = true; ok.textContent = t("vd.uploading");
        let path;
        try{ path = await uploadMedia(me.id, file); }
        catch(e){ ok.disabled = false; ok.textContent = t("vd.upload"); return toast(t(e.code === "too_big" ? "vd.tooBig" : "rv.uploadFailed"), "crit"); }
        const id = uid("v"), sel = $("#vd-session", root);
        const saved = await Store.put("videos", id, { id, userId: me.id, path, title: $("#vd-title", root).value.trim(),
          sessionId: sel ? sel.value || null : null, createdAt: Date.now(), notes: [], readAt: null, seenAt: null, size: file.size });
        if (!saved){ deleteMedia(path); ok.disabled = false; ok.textContent = t("vd.upload"); return; }
        audit("video_sent", id);
        Remote.notify({ kind: "video", athleteId: me.id, videoId: id });
        Modal.close(); toast(t("vd.sent"), "good");
      };
    }
  });
}

/** Regarder une vidéo et ses commentaires ; le coach commente à l'instant affiché. */
function videoModal(id){
  const v0 = Store.get("videos", id); if (!v0) return;
  const me = Session.live(), staff = isStaffUser(me), owner = me.id === v0.userId;
  const who = Store.get("users", v0.userId);
  const notesHtml = (v) => (v.notes || []).length
    ? (v.notes || []).slice().sort((a, b) => a.t - b.t).map(n =>
        '<button class="vd-note" data-seek="' + n.t + '"><b>' + fmtT(n.t) + '</b><span>' + esc(n.text) + '</span>' +
          '<em>' + esc((n.name || "").split(" ")[0]) + '</em></button>').join("")
    : '<p class="small muted">' + esc(t(staff ? "vd.noNotesCoach" : "vd.noNotes")) + '</p>';
  Modal.open({
    title: v0.title || t("vd.untitled"), wide: true,
    body: '<div class="stack">' +
      '<p class="small muted">' + esc((who ? who.name + " · " : "") + fmtDate(dateOf(v0.createdAt), { day: "numeric", month: "long", year: "numeric" })) + '</p>' +
      '<div class="vd-player"><video id="vd-v" controls playsinline preload="metadata"></video><p class="dim tiny" id="vd-miss" hidden>' + esc(t("vd.gone")) + '</p></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("vd.notes")) + '</span><div class="vd-notes" id="vd-notes">' + notesHtml(v0) + '</div></div>' +
      (staff ? '<div class="vd-add"><span class="chip acc" id="vd-at">0:00</span>' +
        '<input class="inp" id="vd-text" maxlength="400" placeholder="' + esc(t("vd.notePh")) + '">' +
        '<button class="btn pri sm" id="vd-addb">' + ic("plus") + esc(t("vd.addNote")) + '</button></div>' : '') +
    '</div>',
    footer: (owner ? '<button class="btn danger" id="vd-del">' + ic("trash") + '</button>' : '') +
      '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>',
    async onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const video = $("#vd-v", root);
      const url = await mediaUrl(v0.path);
      if (url) video.src = url; else { video.hidden = true; $("#vd-miss", root).hidden = false; }
      const bindSeek = () => $$("[data-seek]", root).forEach(b => b.onclick = () => { video.currentTime = Number(b.dataset.seek); video.play().catch(() => {}); });
      bindSeek();
      /* Lu par le grimpeur / ouvert par le coach. */
      const cur = Store.get("videos", id);
      if (owner && newNotes(cur)) Store.put("videos", id, Object.assign({}, cur, { readAt: Date.now() }));
      if (staff && !cur.seenAt) Store.put("videos", id, Object.assign({}, cur, { seenAt: Date.now() }));
      if (staff){
        const at = $("#vd-at", root), input = $("#vd-text", root);
        let notified = false;
        video.addEventListener("timeupdate", () => { at.textContent = fmtT(video.currentTime || 0); });
        input.addEventListener("focus", () => video.pause());
        const add = async () => {
          const text = input.value.trim(); if (!text) return;
          const v = Store.get("videos", id);
          const notes = (v.notes || []).concat([{ t: Math.round((video.currentTime || 0) * 10) / 10, text, by: me.id, name: me.name, at: Date.now() }]);
          if (!await Store.put("videos", id, Object.assign({}, v, { notes, seenAt: v.seenAt || Date.now() }))) return;
          input.value = "";
          $("#vd-notes", root).innerHTML = notesHtml(Object.assign({}, v, { notes }));
          bindSeek();
          /* Une notification par visite, pas une par commentaire. */
          if (!notified){ notified = true; Remote.notify({ kind: "videoNote", athleteId: v.userId, videoId: id }); }
        };
        $("#vd-addb", root).onclick = add;
        input.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); add(); } });
      }
      const del = $("#vd-del", root);
      if (del) del.onclick = async () => {
        if (!confirm(t("vd.delConfirm"))) return;
        await Store.del("videos", id); deleteMedia(v0.path); audit("video_deleted", id);
        Modal.close(); toast(t("g.deleted"));
      };
    }
  });
}

export { toAnalyse, unreadVideo, videoModal, videoNewModal, videoPanel, videosOf };
