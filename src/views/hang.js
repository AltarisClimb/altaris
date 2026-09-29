/* ALTARIS™ — minuteur de suspension (poutre), plein écran
   © 2026 ALTARIS™. All rights reserved.

   Réglage (protocole, lest, réglette, voix), puis le minuteur : gros chiffres
   lisibles à deux mètres, couleur par phase, bips sur les 3 dernières secondes,
   voix « Suspends / Relâche », écran maintenu allumé. « Lâché » note une
   répétition ratée. Ouvert depuis la séance guidée, le bilan s'ajoute au
   journal de l'exercice. L'état vit dans View.hang ; bindHang() repeint les
   chiffres sans re-rendu complet. */
import { requestRender } from "../bus.js";
import { $, esc } from "../core.js";
import { Session } from "../data.js";
import { exById, exField, exName } from "../domain/exercises.js";
import { EDGES, edgeInText, nearestEdge } from "../domain/gear.js";
import { PROTOCOLS, clampProto, hangSummary, parseDose, phaseAt, phaseStart, schedule, timeUnderTension, totalDuration } from "../domain/hang.js";
import { SET_EFFORT, fmtLoad } from "../domain/loads.js";
import { LOC, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { View } from "./shell.js";

let tick = null, wakeLock = null, audioCtx = null;
const VOICE_KEY = "altaris.hangVoice";

/* ---------- état ---------- */
/** opts : { exId, fromPlayer, load, edge } */
function openHang(opts){
  const o = opts || {}, e = o.exId ? exById(o.exId) : null;
  const fromDose = e ? parseDose(exField(e, "dose")) : null;
  const me = Session.live(), gear = ((me && me.profile) || {}).gear || {};
  const target = e ? edgeInText(exField(e, "dose")) || edgeInText(e.d) || 20 : 20;
  let voice = true;
  try{ voice = localStorage.getItem(VOICE_KEY) !== "0"; }catch(err){}
  View.hang = {
    exId: o.exId || null, fromPlayer: !!o.fromPlayer,
    key: fromDose ? "dose" : "repeaters", proto: fromDose || Object.assign({}, PROTOCOLS.repeaters), dose: fromDose,
    load: o.load != null ? o.load : 0, edge: o.edge || nearestEdge(gear.edges, target) || target,
    voice, started: false, startAt: 0, pausedAt: null, pauseAcc: 0, failed: [], reached: 0, done: false,
    effort: null, lastIdx: -1, lastSec: null
  };
}
function closeHang(){
  if (tick){ clearInterval(tick); tick = null; }
  keepAwake(false);
  try{ if (window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
  View.hang = null;
}
async function keepAwake(on){
  try{
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch(e){}
}

const phasesOf = (h) => schedule(h.proto);
function elapsed(h){ return h.started ? ((h.pausedAt || Date.now()) - h.startAt - h.pauseAcc) / 1000 : 0; }

const hangActions = {
  proto(k){ const h = View.hang; h.key = k; h.proto = Object.assign({}, k === "dose" ? h.dose : PROTOCOLS[k]); },
  adj(v){
    const h = View.hang, [k, d] = String(v).split(":");
    const step = { work: 1, rest: 1, reps: 1, sets: 1, setRest: 15, prep: 5 }[k] || 1;
    h.proto = clampProto(Object.assign({}, h.proto, { [k]: (h.proto[k] || 0) + Number(d) * step }));
    h.key = "custom";
  },
  load(d){ const h = View.hang; h.load = Math.round((h.load + Number(d)) * 2) / 2; },
  edge(mm){ View.hang.edge = Number(mm); },
  voice(){ const h = View.hang; h.voice = !h.voice; try{ localStorage.setItem(VOICE_KEY, h.voice ? "1" : "0"); }catch(e){} },
  start(){
    const h = View.hang;
    unlockAudio();
    Object.assign(h, { started: true, startAt: Date.now(), pausedAt: null, pauseAcc: 0, failed: [], reached: 0, done: false, lastIdx: -1, lastSec: null });
    keepAwake(true);
  },
  pause(){
    const h = View.hang; if (!h.started || h.done) return;
    if (h.pausedAt){ h.pauseAcc += Date.now() - h.pausedAt; h.pausedAt = null; }
    else h.pausedAt = Date.now();
  },
  /** Passer à la phase suivante (repos trop long, suspension finie en avance). */
  skip(){
    const h = View.hang, ph = phasesOf(h), at = phaseAt(ph, elapsed(h));
    if (at.done) return;
    const target = phaseStart(ph, at.i + 1);
    h.startAt -= (target - elapsed(h)) * 1000;
  },
  /** Lâché pendant l'effort : répétition ratée, on passe au repos. */
  fail(){
    const h = View.hang, ph = phasesOf(h), at = phaseAt(ph, elapsed(h));
    if (!at.phase || at.phase.kind !== "work") return;
    h.failed.push({ set: at.phase.set, rep: at.phase.rep });
    beep(300, .25);
    hangActions.skip();
  },
  stop(){ const h = View.hang; h.reached = phaseAt(phasesOf(h), elapsed(h)).i; finish(h); },
  effort(v){ View.hang.effort = v; }
};
function finish(h){
  h.done = true; h.pausedAt = h.pausedAt || Date.now();
  if (tick){ clearInterval(tick); tick = null; }
  keepAwake(false);
}

/** Séries à ajouter au journal de l'exercice (séance guidée). */
function hangSets(h){
  const ph = phasesOf(h), works = ph.filter(x => x.kind === "work");
  const eff = SET_EFFORT.find(x => x[0] === h.effort);
  const out = [];
  for (let s = 1; s <= h.proto.sets; s++){
    const reached = works.filter(x => x.set === s && ph.indexOf(x) < h.reached);
    if (!reached.length) continue;
    const failed = h.failed.filter(x => x.set === s).length;
    out.push({ load: h.load, edge: h.edge, reps: reached.length - failed, secs: h.proto.work,
               rpe: eff ? eff[1] : null, failed: failed > 0 || undefined, hang: true });
  }
  return out;
}

/* ---------- son et voix ---------- */
function unlockAudio(){ try{ audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); }catch(e){} }
function beep(freq, len){
  try{
    unlockAudio();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.18; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (len || .12));
  }catch(e){}
}
function say(h, text){
  if (!h.voice) return;
  try{
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = LOC(); u.rate = 1.05;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- rendu ---------- */
function stepper(k, label, val, unit){
  return '<div class="hg-st"><span class="lb">' + esc(label) + '</span>' +
    '<div class="hg-st-row"><button class="btn icon sm" data-act="hang-adj" data-v="' + k + ':-1" aria-label="−">−</button>' +
    '<span class="hg-st-v">' + esc(val) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span>' +
    '<button class="btn icon sm" data-act="hang-adj" data-v="' + k + ':1" aria-label="+">+</button></div></div>';
}
function fmtDur(s){ return s >= 60 ? Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0") : Math.round(s) + " s"; }

function viewHang(){
  const h = View.hang, e = h.exId ? exById(h.exId) : null;
  const head = '<div class="pl-top">' +
    '<button class="btn icon sm ghost" data-act="hang-close" aria-label="' + esc(t("g.close")) + '">' + ic("x") + '</button>' +
    '<div class="pl-top-t"><div class="pl-name">' + esc(e ? exName(e) : t("hg.title")) + '</div></div>' +
    '<button class="btn icon sm ghost" data-act="hang-voice" aria-pressed="' + h.voice + '" title="' + esc(t("hg.voice")) + '">' +
      ic(h.voice ? "sound" : "mute") + '</button></div>';
  if (h.done) return '<div class="pl hg">' + head + summary(h) + '</div>';
  if (!h.started) return '<div class="pl hg">' + head + setup(h) + '</div>';
  return '<div class="pl hg run" id="hg" data-kind="prep">' + head +
    '<div class="hg-run">' +
      '<div class="hg-phase" id="hg-phase">—</div>' +
      '<div class="hg-time" id="hg-time">0</div>' +
      '<div class="hg-count"><span id="hg-set">—</span><span id="hg-rep">—</span></div>' +
      '<div class="hg-bar"><span id="hg-bar"></span></div>' +
      '<div class="hg-next small" id="hg-next"></div>' +
      '<div class="hg-meta small">' + esc(fmtLoad(h.load, t("hg.bw"))) + (h.edge ? ' · ' + h.edge + ' mm' : '') + '</div>' +
    '</div>' +
    '<div class="hg-ctl">' +
      '<button class="btn" data-act="hang-pause" id="hg-pause">' + ic(h.pausedAt ? "play" : "pause") + esc(h.pausedAt ? t("hg.resume") : t("hg.pause")) + '</button>' +
      '<button class="btn danger" data-act="hang-fail" id="hg-fail">' + esc(t("hg.fail")) + '</button>' +
      '<button class="btn ghost" data-act="hang-skip">' + esc(t("hg.skip")) + ic("chevR") + '</button>' +
      '<button class="btn ghost" data-act="hang-stop">' + esc(t("hg.stop")) + '</button>' +
    '</div></div>';
}

function setup(h){
  const p = h.proto, me = Session.live(), gear = ((me && me.profile) || {}).gear || {};
  const edges = (gear.edges || []).length ? gear.edges : EDGES.filter(n => n >= 10 && n <= 30);
  const keys = (h.dose ? ["dose"] : []).concat(Object.keys(PROTOCOLS));
  return '<div class="pl-body stack">' +
    '<div class="stack sm"><span class="eyebrow">' + esc(t("hg.protocol")) + '</span>' +
      '<div class="row tight">' + keys.map(k =>
        '<button class="filt' + (h.key === k ? ' on' : '') + '" data-act="hang-proto" data-v="' + k + '">' + esc(t("hg.p." + k)) + '</button>').join("") +
        (h.key === "custom" ? '<span class="filt on">' + esc(t("hg.p.custom")) + '</span>' : '') + '</div></div>' +
    '<div class="hg-grid">' +
      stepper("work", t("hg.work"), p.work, "s") +
      stepper("rest", t("hg.rest"), p.rest, "s") +
      stepper("reps", t("hg.reps"), p.reps, "") +
      stepper("sets", t("hg.sets"), p.sets, "") +
      stepper("setRest", t("hg.setRest"), fmtDur(p.setRest), "") +
      stepper("prep", t("hg.prep"), p.prep, "s") +
    '</div>' +
    '<p class="small muted">' + esc(t("hg.total", { t: fmtDur(totalDuration(schedule(p))), tut: fmtDur(timeUnderTension(p)) })) + '</p>' +
    '<div class="grid g2">' +
      '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("hg.load")) + '</span>' +
        '<div class="hg-st-row"><button class="btn icon sm" data-act="hang-load" data-v="-1">−</button>' +
          '<span class="hg-st-v">' + esc(fmtLoad(h.load, t("hg.bw"))) + '</span>' +
          '<button class="btn icon sm" data-act="hang-load" data-v="1">+</button></div>' +
        '<span class="dim tiny">' + esc(t("hg.loadD")) + '</span></div>' +
      '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("hg.edge")) + '</span>' +
        '<div class="row tight">' + edges.map(n =>
          '<button class="filt' + (h.edge === n ? ' on' : '') + '" data-act="hang-edge" data-v="' + n + '">' + n + '</button>').join("") + '</div>' +
        ((gear.edges || []).length ? '' : '<button class="link tiny" data-act="gear-edit">' + esc(t("gr.declare")) + '</button>') + '</div>' +
    '</div>' +
    '<div class="notice warn">' + ic("alert") + '<span>' + esc(t("hg.warm")) + '</span></div>' +
    '<button class="btn pri td-go" data-act="hang-start">' + ic("play") + esc(t("hg.start")) + '</button>' +
  '</div>';
}

function summary(h){
  const s = hangSummary(phasesOf(h), h.reached, h.failed);
  return '<div class="pl-body stack lg">' +
    '<div class="center stack sm"><h2 class="pl-h">' + esc(t("hg.doneT")) + '</h2>' +
      '<p class="muted">' + esc(fmtLoad(h.load, t("hg.bw"))) + (h.edge ? ' · ' + h.edge + ' mm' : '') + '</p></div>' +
    '<div class="pl-cards">' +
      '<div class="panel"><span class="eyebrow">' + esc(t("hg.repsDone")) + '</span><div class="td-big">' + s.ok + '/' + s.planned + '</div></div>' +
      '<div class="panel"><span class="eyebrow">' + esc(t("hg.failed")) + '</span><div class="td-big">' + s.failed + '</div></div>' +
      '<div class="panel"><span class="eyebrow">' + esc(t("hg.tut")) + '</span><div class="td-big">' + fmtDur(s.ok * h.proto.work) + '</div></div>' +
    '</div>' +
    (h.fromPlayer ? '<div class="stack sm"><span class="eyebrow">' + esc(t("ld.effortQ")) + '</span>' +
      '<div class="row tight">' + SET_EFFORT.map(([k]) =>
        '<button class="filt' + (h.effort === k ? ' on' : '') + '" data-act="hang-effort" data-v="' + k + '">' + esc(t("ld.e." + k)) + '</button>').join("") + '</div></div>' : '') +
    '<div class="pl-nav"><button class="btn ghost" data-act="hang-again">' + esc(t("hg.again")) + '</button>' +
      '<button class="btn pri" data-act="hang-save">' + ic("check") + esc(h.fromPlayer ? t("hg.save") : t("g.close")) + '</button></div>' +
  '</div>';
}

/** Chiffres, couleur et signaux sonores : 10 fois par seconde, sans re-rendu. */
function bindHang(){
  if (tick){ clearInterval(tick); tick = null; }
  const h = View.hang;
  if (!h || !h.started || h.done) return;
  const ph = phasesOf(h), total = totalDuration(ph);
  const paint = () => {
    const root = $("#hg"); if (!root || View.hang !== h){ clearInterval(tick); tick = null; return; }
    const el = elapsed(h), at = phaseAt(ph, el);
    if (at.done){
      h.reached = ph.length; say(h, t("hg.say.done")); beep(990, .5);
      finish(h); requestRender();
      return;
    }
    const x = at.phase, sec = Math.ceil(at.left);
    if (at.i !== h.lastIdx){
      if (h.lastIdx >= 0 || x.kind === "work"){
        if (x.kind === "work"){ beep(880, .35); say(h, t("hg.say.hang")); }
        else if (x.kind === "rest"){ beep(440, .25); say(h, t("hg.say.rest")); }
        else if (x.kind === "setRest"){ beep(440, .25); say(h, t("hg.say.setRest", { n: x.set })); }
      } else say(h, t("hg.say.ready"));
      h.lastIdx = at.i; h.lastSec = null;
      try{ if (navigator.vibrate) navigator.vibrate(x.kind === "work" ? 250 : [80, 60, 80]); }catch(e){}
    }
    if (x.kind !== "work" && sec <= 3 && sec >= 1 && h.lastSec !== sec && !h.pausedAt){ beep(660, .1); h.lastSec = sec; }
    root.dataset.kind = x.kind;
    root.classList.toggle("paused", !!h.pausedAt);
    $("#hg-phase").textContent = h.pausedAt ? t("hg.paused") : t("hg.k." + x.kind);
    $("#hg-time").textContent = x.dur >= 60 && sec >= 60 ? fmtDur(sec) : String(sec);
    $("#hg-set").textContent = t("hg.setN", { i: x.set, n: h.proto.sets });
    $("#hg-rep").textContent = h.proto.reps > 1 ? t("hg.repN", { i: x.rep, n: h.proto.reps }) : "";
    $("#hg-bar").style.width = Math.min(100, 100 * el / total) + "%";
    const nx = ph[at.i + 1];
    $("#hg-next").textContent = nx ? t("hg.next", { what: t("hg.k." + nx.kind), s: fmtDur(nx.dur) }) : t("hg.last");
    const f = $("#hg-fail"); if (f) f.disabled = x.kind !== "work";
  };
  paint();
  tick = setInterval(paint, 100);
}

export { bindHang, closeHang, hangActions, hangSets, openHang, viewHang };
