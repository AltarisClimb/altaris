/* ALTARIS™ — séance guidée, plein écran
   © 2026 ALTARIS™. All rights reserved.

   Un exercice à la fois : illustration, dosage, consignes, compteur de séries et
   minuteur (bip + vibration). À la fin, l'effort ressenti en un geste, puis une
   carte « Bravo ». L'état vit dans View.player ; le minuteur et le chrono sont
   repeints sans re-rendu complet (bindPlayer). */
import { $, esc } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { exById, exField, exName } from "../domain/exercises.js";
import { weekProgress, weekStreak } from "../domain/progress.js";
import { sessionLoad } from "../domain/workload.js";
import { fmtNum, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { exercisePose } from "../ui/poses.js";
import { sessionsOf } from "./climber.js";
import { View } from "./shell.js";
import { TYPE_COLOR, duration } from "./today.js";

const PRESETS = [7, 10, 30, 60, 120, 180];
let tick = null;          // intervalle du chrono et du minuteur
let wakeLock = null;      // écran allumé pendant la séance

/* ---------- état ---------- */
function startPlayer(sessionId){
  const s = Store.get("sessions", sessionId); if (!s) return;
  View.player = { id: s.id, idx: 0, startedAt: Date.now(), sets: {}, done: [], rpe: 0,
                  timer: { dur: 30, left: 30, endAt: null }, finished: null };
  keepAwake(true);
}
function stopPlayer(){
  View.player = null;
  if (tick){ clearInterval(tick); tick = null; }
  keepAwake(false);
}
async function keepAwake(on){
  try{
    if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch(e){ /* non disponible : l'écran s'éteindra normalement */ }
}

/** Étapes : un exercice chacune (ou une seule étape libre si la séance n'en liste pas). */
function steps(s){
  const list = (s.exercises || []).map(exById).filter(Boolean);
  return list.length ? list : [null];
}

function timerLeft(tm){ return tm.endAt ? Math.max(0, (tm.endAt - Date.now()) / 1000) : tm.left; }
function fmtClock(sec){
  const s = Math.ceil(sec);
  return s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : String(s);
}
function elapsedMin(p){ return Math.max(1, Math.round((Date.now() - p.startedAt) / 60000)); }

/* ---------- actions (appelées depuis actions.js) ---------- */
const playerActions = {
  next(){ const p = View.player, s = Store.get("sessions", p.id), st = steps(s)[p.idx];
          if (st && !p.done.includes(st.id)) p.done.push(st.id); p.idx++; resetTimer(p); },
  skip(){ const p = View.player; p.idx++; resetTimer(p); },
  prev(){ const p = View.player; p.idx = Math.max(0, p.idx - 1); resetTimer(p); },
  set(delta){ const p = View.player, st = steps(Store.get("sessions", p.id))[p.idx], k = st ? st.id : "_";
              p.sets[k] = Math.max(0, (p.sets[k] || 0) + delta); },
  preset(sec){ const tm = View.player.timer; tm.dur = sec; tm.left = sec; tm.endAt = null; },
  toggle(){ const tm = View.player.timer;
            if (tm.endAt){ tm.left = timerLeft(tm); tm.endAt = null; }
            else { if (tm.left <= 0) tm.left = tm.dur; tm.endAt = Date.now() + tm.left * 1000; beep(0); } },
  rpe(n){ View.player.rpe = n; },
  async finish(){
    const p = View.player, s = Store.get("sessions", p.id);
    if (!p.rpe) return false;
    const min = Number(p.durInput) || elapsedMin(p);
    const done = p.done.length ? p.done : (s.exercises || []);
    await Store.put("sessions", s.id, Object.assign({}, s, {
      status: "done", rpe: p.rpe, actualMin: min, load: sessionLoad(p.rpe, min),
      feedback: (p.fb || "").trim(), doneExercises: done, doneAt: Date.now(), guided: true
    }));
    audit("session_validated", s.id + " RPE" + p.rpe + " " + min + "min (guided)");
    const me = Session.live(), all = sessionsOf(me.id);
    p.finished = { min, load: sessionLoad(p.rpe, min), done: done.length, total: (s.exercises || []).length,
                   week: weekProgress(all), streak: weekStreak(all) };
    if (tick){ clearInterval(tick); tick = null; }
    keepAwake(false);
    return true;
  }
};
function resetTimer(p){ p.timer.endAt = null; p.timer.left = p.timer.dur; }

/** Bip court (WebAudio) + vibration ; kind 0 = départ, 1 = fin. */
let audioCtx = null;
function beep(kind){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = kind ? 880 : 660; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (kind ? 0.45 : 0.12));
  }catch(e){}
  try{ if (kind && navigator.vibrate) navigator.vibrate([200, 100, 200]); }catch(e){}
}

/* ---------- rendu ---------- */
function viewPlayer(){
  const p = View.player, s = Store.get("sessions", p.id);
  if (!s){ stopPlayer(); return ""; }
  const color = TYPE_COLOR[s.type] || "var(--accent)";
  if (p.finished) return viewDone(s, p, color);
  const list = steps(s), n = list.length, onFinish = p.idx >= n;

  const head = '<div class="pl-top">' +
    '<button class="btn icon sm ghost" data-act="play-close" aria-label="' + esc(t("g.close")) + '">' + ic("x") + '</button>' +
    '<div class="pl-top-t"><div class="pl-name">' + esc(s.title) + '</div>' +
      '<div class="pl-bar"><span style="width:' + Math.round(100 * Math.min(p.idx, n) / n) + '%;background:' + color + '"></span></div></div>' +
    '<div class="pl-clock" id="pl-elapsed">0:00</div></div>';

  if (onFinish) return '<div class="pl">' + head + '<div class="pl-body stack lg">' +
    '<div class="stack sm"><span class="eyebrow">' + esc(t("pl.almost")) + '</span>' +
      '<h2 class="pl-h">' + esc(t("pl.howWasIt")) + '</h2></div>' +
    '<div class="pl-rpe">' + [1,2,3,4,5,6,7,8,9,10].map(i =>
      '<button data-act="play-rpe" data-v="' + i + '" class="' + (p.rpe === i ? "on" : "") + '" style="--h:' + (130 - i * 12) + '">' + i + '</button>').join("") + '</div>' +
    '<p class="small muted">' + esc(p.rpe ? t("rpe." + p.rpe) : t("pl.rpeHint")) + '</p>' +
    '<div class="grid g2">' +
      '<label class="f"><span class="lb">' + esc(t("rpe.realDur")) + '</span><span class="unit">' +
        '<input class="inp num" type="number" id="pl-dur" data-fk="pl-dur" data-act-input="pl-dur" min="1" max="600" value="' +
          esc(p.durInput != null ? p.durInput : elapsedMin(p)) + '">' +
        '<span class="u">' + esc(t("g.min")) + '</span></span></label>' +
      '<label class="f"><span class="lb">' + esc(t("rpe.feedback")) + '</span>' +
        '<input class="inp" id="pl-fb" data-fk="pl-fb" data-act-input="pl-fb" value="' + esc(p.fb || "") + '" placeholder="' + esc(t("rpe.feedbackPh")) + '"></label>' +
    '</div>' +
    '<div class="pl-nav"><button class="btn ghost" data-act="play-prev">' + ic("chevL") + esc(t("g.previous")) + '</button>' +
      '<button class="btn pri" data-act="play-finish"' + (p.rpe ? '' : ' disabled') + '>' + ic("check") + esc(t("pl.finish")) + '</button></div>' +
  '</div></div>';

  const e = list[p.idx], key = e ? e.id : "_", sets = p.sets[key] || 0, tm = p.timer;
  const fig = e && exercisePose(e.meta);
  return '<div class="pl">' + head + '<div class="pl-body stack">' +
    '<div class="small muted">' + esc(t("pl.step", { i: p.idx + 1, n })) + '</div>' +
    (fig ? '<div class="pl-fig">' + fig + '</div>' : '') +
    '<h2 class="pl-h">' + esc(e ? exName(e) : s.title) + '</h2>' +
    (e && exField(e, "dose") ? '<div class="pl-dose">' + esc(exField(e, "dose")) + '</div>' : '') +
    (e && exField(e, "c") ? '<p class="small muted" style="line-height:1.55">' + esc(exField(e, "c")) + '</p>' : '') +
    (!e && s.notes ? '<p style="line-height:1.6">' + esc(s.notes) + '</p>' : '') +

    '<div class="pl-tools">' +
      '<div class="panel pl-sets"><span class="eyebrow">' + esc(t("pl.sets")) + '</span>' +
        '<div class="pl-sets-row"><button class="btn icon" data-act="play-set" data-v="-1" aria-label="-1">−</button>' +
          '<span class="pl-sets-n">' + sets + '</span>' +
          '<button class="btn icon pri" data-act="play-set" data-v="1" aria-label="+1">+</button></div></div>' +
      '<div class="panel pl-timer"><span class="eyebrow">' + esc(t("pl.timer")) + '</span>' +
        '<button class="pl-time' + (tm.endAt ? ' run' : '') + '" id="pl-time" data-act="play-toggle">' + fmtClock(timerLeft(tm)) + '</button>' +
        '<div class="pl-presets">' + PRESETS.map(sec =>
          '<button class="filt' + (tm.dur === sec ? ' on' : '') + '" data-act="play-preset" data-v="' + sec + '">' + (sec < 60 ? sec + " s" : sec / 60 + " min") + '</button>').join("") + '</div></div>' +
    '</div>' +

    '<div class="pl-nav">' +
      (p.idx > 0 ? '<button class="btn ghost" data-act="play-prev">' + ic("chevL") + '</button>' : '<span></span>') +
      '<button class="btn ghost" data-act="play-skip">' + esc(t("pl.skip")) + '</button>' +
      '<button class="btn pri" data-act="play-next">' + ic("check") + esc(p.idx + 1 < n ? t("pl.next") : t("pl.last")) + '</button>' +
    '</div>' +
  '</div></div>';
}

function viewDone(s, p, color){
  const f = p.finished;
  return '<div class="pl pl-done" style="--type:' + color + '"><div class="pl-body stack lg">' +
    '<div class="pl-burst">' + ic("check") + '</div>' +
    '<div class="center stack sm"><h2 class="pl-h">' + esc(t("pl.bravo")) + '</h2>' +
      '<p class="muted">' + esc(s.title) + '</p></div>' +
    '<div class="pl-cards">' +
      '<div class="panel"><span class="eyebrow">' + esc(t("pl.time")) + '</span><div class="td-big">' + esc(duration(f.min)) + '</div></div>' +
      '<div class="panel"><span class="eyebrow">' + esc(t("pl.exercisesDone")) + '</span><div class="td-big">' + f.done + (f.total ? '/' + f.total : '') + '</div></div>' +
      '<div class="panel"><span class="eyebrow">' + esc(t("pl.effort")) + '</span><div class="td-big">' + p.rpe + '/10</div></div>' +
      '<div class="panel"><span class="eyebrow">' + esc(t("cal.thisWeek")) + '</span><div class="td-big">' + f.week.done + '/' + f.week.total + '</div></div>' +
    '</div>' +
    (f.streak ? '<p class="center small">' + ic("trend") + ' ' + esc(t("pl.streak", { n: f.streak })) + '</p>' : '') +
    '<p class="center dim tiny">' + esc(t("pl.load", { n: fmtNum(f.load) })) + '</p>' +
    '<div class="pl-nav"><button class="btn ghost" data-act="play-message">' + ic("chat") + esc(t("pl.tellCoach")) + '</button>' +
      '<button class="btn pri" data-act="play-close">' + esc(t("pl.home")) + '</button></div>' +
  '</div></div>';
}

/** Chrono et minuteur : repeints 4 fois par seconde, sans re-rendu complet. */
function bindPlayer(){
  if (tick) clearInterval(tick);
  const paint = () => {
    const p = View.player;
    if (!p || p.finished){ clearInterval(tick); tick = null; return; }
    const el = $("#pl-elapsed");
    if (el){ const s = Math.floor((Date.now() - p.startedAt) / 1000); el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
    const tm = p.timer, bt = $("#pl-time");
    if (tm.endAt && timerLeft(tm) <= 0){ tm.endAt = null; tm.left = 0; beep(1); if (bt) bt.classList.remove("run"); }
    if (bt) bt.textContent = fmtClock(timerLeft(tm));
  };
  paint();
  tick = setInterval(paint, 250);
}

export { bindPlayer, playerActions, startPlayer, stopPlayer, viewPlayer };
