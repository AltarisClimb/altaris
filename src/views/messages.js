/* ALTARIS™ — messagerie : une conversation par grimpeur, présentée comme un fil de discussion
   © 2026 ALTARIS™. All rights reserved.

   Encadrant : la liste de ses grimpeurs à gauche (dernier message, non-lus),
   le fil à droite. Sur téléphone, la liste puis le fil. Grimpeur : le fil
   avec son coach. Un panneau d'émoticônes complète la saisie. */
import { $, byId, esc } from "../core.js";
import { Access, Store, can } from "../data.js";
import { LOC, t } from "../i18n/index.js";
import { Remote } from "../remote.js";
import { ic } from "../ui/icons.js";
import { callCard } from "./calls.js";
import { getThread, lockedView, markRead } from "./library.js";
import { View, initials, isStaff, presenceDot, presenceText } from "./shell.js";

const EMOJIS = ["👍", "👏", "💪", "🔥", "🙌", "🎉", "😀", "😅", "😂", "😉", "😍", "🤩", "🤔", "😬", "😴", "😢",
                "🙏", "👌", "✅", "❌", "⚠️", "❤️", "⭐", "🏆", "🧗", "🧗‍♀️", "🪨", "⛰️", "🤕", "🧊", "⏱️", "📅", "🎯", "📈", "🎥", "☀️"];

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|\s)+$/u;
/** Message fait seulement de quelques émoticônes : affiché en grand, sans bulle. */
function isEmojiOnly(text){ return !!text && text.length <= 14 && EMOJI_ONLY.test(text); }

function unreadIn(th, me){
  const last = (th.read || {})[me.id] || 0;
  return (th.messages || []).filter(m => m.from !== me.id && m.ts > last).length;
}
function lastOf(th){ return (th.messages || []).reduce((a, m) => (!a || m.ts > a.ts ? m : a), null); }

/** « Aujourd'hui », « Hier », sinon « lundi 28 septembre ». */
function dayLabel(ts){
  const d = new Date(ts), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 0) return t("g.today");
  if (days === 1) return t("ms.yesterday");
  return d.toLocaleDateString(LOC(), { weekday: "long", day: "numeric", month: "long" });
}
/** Heure si c'est aujourd'hui, sinon date courte : pour la liste des conversations. */
function shortWhen(ts){
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(LOC(), { day: "numeric", month: "short" });
}

/** Liste des conversations : les plus récentes d'abord, puis les grimpeurs sans message. */
function convList(me, partners, other){
  const rows = partners.map(x => { const th = getThread(me.id, x.id); return { x, last: lastOf(th), n: unreadIn(th, me) }; })
    .sort((a, b) => ((b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0)) || a.x.name.localeCompare(b.x.name));
  return '<div class="wa-list" role="list" aria-label="' + esc(t("ms.convs")) + '">' + rows.map(({ x, last, n }) =>
    '<button class="wa-conv' + (x.id === other.id ? ' on' : '') + '" role="listitem" data-act="thread" data-v="' + esc(x.id) + '">' +
      '<span class="av-wrap"><span class="avatar">' + esc(initials(x.name)) + '</span>' + presenceDot(x) + '</span>' +
      '<span class="wa-conv-main"><span class="wa-conv-top"><b>' + esc(x.name) + '</b>' +
          (last ? '<span class="wa-conv-when">' + esc(shortWhen(last.ts)) + '</span>' : '') + '</span>' +
        '<span class="wa-conv-last">' + (last ? (last.from === me.id ? esc(t("ms.you")) + ' ' : '') + esc((last.text || "").slice(0, 70)) : esc(t("ms.noMsgYet"))) + '</span></span>' +
      (n ? '<span class="in-badge">' + n + '</span>' : '') +
    '</button>').join("") + '</div>';
}

function bubbles(msgs, me){
  let day = "", prev = null, out = "";
  for (const m of msgs){
    const k = new Date(m.ts).toDateString();
    if (k !== day){ day = k; prev = null; out += '<div class="wa-day"><span>' + esc(dayLabel(m.ts)) + '</span></div>'; }
    const mine = m.from === me.id, who = Store.get("users", m.from);
    const follow = prev === m.from;
    const big = isEmojiOnly(m.text) && !m.ctx && !m.videoUrl;
    out += '<div class="msg ' + (mine ? "me" : "them") + (follow ? " follow" : "") + (big ? " big" : "") + '">' +
      (mine || follow ? '' : '<div class="who">' + esc(who ? who.name : "—") + '</div>') +
      (m.ctx ? '<div class="chip acc" style="margin-bottom:5px">' + esc(t("ms.context")) + ' : ' + esc(m.ctx) + '</div>' : '') +
      '<div class="tx">' + esc(m.text).replace(/\n/g, "<br>") + '</div>' +
      (m.videoUrl ? '<a class="vid" href="' + esc(m.videoUrl) + '" target="_blank" rel="noopener noreferrer">' + ic("video") + esc(t("ex.video")) + '</a>' : '') +
      '<div class="tm">' + esc(new Date(m.ts).toLocaleTimeString(LOC(), { hour: "2-digit", minute: "2-digit" })) + '</div></div>';
    prev = m.from;
  }
  return out;
}

function composer(other){
  return '<div class="wa-compose noprint">' +
    (View.emojiOpen ? '<div class="wa-emoji" role="group" aria-label="' + esc(t("ms.emoji")) + '">' + EMOJIS.map(e =>
      '<button type="button" data-act="emoji" data-v="' + e + '">' + e + '</button>').join("") + '</div>' : '') +
    (View.msgAttach ? '<div class="wa-attach"><div class="row tight">' +
        '<span class="unit" style="flex:1 1 220px"><input class="inp" data-fk="msgv" id="msg-video" placeholder="' + esc(t("ms.videoLink")) + '">' +
          '<span class="u">' + ic("video") + '</span></span>' +
        '<button class="btn sm ghost" data-act="video-check">' + ic("video") + esc(t("ms.attachVideo")) + '</button></div>' +
      '<p class="dim tiny">' + esc(t("ms.videoLimit")) + '</p></div>' : '') +
    '<div class="wa-bar">' +
      '<button type="button" class="wa-tool' + (View.emojiOpen ? ' on' : '') + '" data-act="emoji-toggle" aria-label="' + esc(t("ms.emoji")) + '" aria-pressed="' + !!View.emojiOpen + '">😊</button>' +
      '<button type="button" class="wa-tool' + (View.msgAttach ? ' on' : '') + '" data-act="msg-attach" aria-label="' + esc(t("ms.attachVideo")) + '" aria-pressed="' + !!View.msgAttach + '">' + ic("video") + '</button>' +
      '<textarea class="inp wa-input" rows="1" data-fk="msg" data-act-input="msg" data-enter="msg-send" data-v="' + esc(other.id) + '" placeholder="' + esc(t("ms.placeholder")) + '">' + esc(View.msgDraft || "") + '</textarea>' +
      '<button class="btn pri wa-send" data-act="msg-send" data-v="' + esc(other.id) + '" aria-label="' + esc(t("g.send")) + '">' + ic("send") + '</button>' +
    '</div></div>';
}

function viewMessages(me){
  /* Messagerie avec le coach : réservée au Premium (le serveur l'impose aussi). */
  if (me.role === "climber" && !can(me, "messaging")) return lockedView("pl.lockMsgT", "pl.lockMsgD", "chat");
  const staff = isStaff(me);
  const partners = staff ? Access.climbers() : (Access.myCoach() ? [Access.myCoach()] : []);
  if (!partners.length){
    return '<div class="stack lg"><div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ms.title")) + '</span>' +
      '<h2>' + esc(t("ms.noThread")) + '</h2></div></div>' +
      '<div class="panel"><div class="empty">' + ic("chat") + '<div class="t">' + esc(t("ms.noThread")) + '</div>' +
      '<div class="d">' + esc(staff ? t("co.noAthletesD") : t("ms.noCoach")) + '</div></div></div></div>';
  }
  /* Sans choix explicite : la conversation la plus récente. */
  const recent = partners.slice().sort((a, b) => {
    const la = lastOf(getThread(me.id, a.id)), lb = lastOf(getThread(me.id, b.id));
    return ((lb ? lb.ts : 0) - (la ? la.ts : 0)) || a.name.localeCompare(b.name);
  })[0];
  const other = (View.thread && byId(partners, View.thread)) || recent;
  const multi = staff && partners.length > 1;
  const th = getThread(me.id, other.id);
  /* Sur téléphone, un encadrant voit d'abord la liste : le fil n'est lu qu'une fois ouvert. */
  const reading = !multi || View.threadOpen || window.innerWidth > 760;
  if (reading) setTimeout(() => markRead(getThread(me.id, other.id), me.id), 0);
  const msgs = (th.messages || []).slice().sort((a, b) => a.ts - b.ts);

  return '<div class="stack">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ms.title")) + '</span>' +
      '<h2>' + esc(multi ? t("ms.byClimber") : other.name) + '</h2></div></div>' +
    callCard(me) +
    '<div class="wa' + (multi ? '' : ' solo') + (View.threadOpen ? ' open' : '') + '">' +
      (multi ? convList(me, partners, other) : '') +
      '<div class="wa-chat">' +
        '<div class="wa-head">' +
          (multi ? '<button class="btn icon sm ghost wa-back" data-act="thread-back" aria-label="' + esc(t("ms.convs")) + '">' + ic("chevL") + '</button>' : '') +
          '<span class="av-wrap"><span class="avatar">' + esc(initials(other.name)) + '</span>' + presenceDot(other) + '</span>' +
          '<span class="wa-who"><b>' + esc(other.name) + '</b><span>' + esc(presenceText(other) || t("role." + other.role)) + '</span></span>' +
          (staff ? '<button class="btn sm ghost noprint" data-act="athlete-go" data-v="' + esc(other.id) + '">' + ic("user") + '<span class="wa-lbl">' + esc(t("in.open")) + '</span></button>' : '') +
          (staff && Remote.client ? '<button class="btn icon sm ghost noprint" data-act="call-slots" aria-label="' + esc(t("vc.slots")) + '">' + ic("video") + '</button>' : '') +
        '</div>' +
        '<div class="wa-thread" id="wa-thread">' + (msgs.length ? bubbles(msgs, me)
          : '<div class="empty">' + ic("chat") + '<div class="t">' + esc(t("ms.start", { name: other.name.split(" ")[0] })) + '</div></div>') + '</div>' +
        composer(other) +
      '</div>' +
    '</div>' +
  '</div>';
}

/** Après chaque rendu : le fil au dernier message, la zone de saisie à la bonne hauteur. */
function bindMessages(){
  const th = $("#wa-thread"); if (!th) return;
  th.scrollTop = th.scrollHeight;
  growInput($(".wa-input"));
}
function growInput(el){
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 2, 140) + "px";
}

export { EMOJIS, bindMessages, growInput, isEmojiOnly, viewMessages };
