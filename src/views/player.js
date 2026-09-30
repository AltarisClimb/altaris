/* ALTARIS™ — séance guidée, plein écran
   © 2026 ALTARIS™. All rights reserved.

   Un exercice à la fois : illustration, dosage, consignes, journal des séries
   (charge, réglette, effort — avec la charge conseillée d'après la dernière
   fois), minuteur de repos et, pour la poutre, le minuteur de suspension
   (hang.js). À la fin, l'effort ressenti en un geste, puis une carte « Bravo ».
   L'état vit dans View.player ; le minuteur et le chrono sont repeints sans
   re-rendu complet (bindPlayer). */
import { $, esc } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { EXERCISES, exById, exField, exName, exVideo } from "../domain/exercises.js";
import { bindDemos, isVideoFile } from "../media.js";
import { adaptText, autoAdapt } from "./training.js";
import { EDGES, edgeInText, nearestEdge } from "../domain/gear.js";
import { parseDose } from "../domain/hang.js";
import { SET_EFFORT, exerciseHistory, fmtLoad, suggestNext } from "../domain/loads.js";
import { buildWarmup, hasWarmup } from "../domain/warmup.js";
import { weekProgress, weekStreak } from "../domain/progress.js";
import { sessionLoad } from "../domain/workload.js";
import { fmtNum, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { exercisePose } from "../ui/poses.js";
import { Remote } from "../remote.js";
import { sessionsOf } from "./climber.js";
import { badgeTile, badgesOf } from "./progress.js";
import { View } from "./shell.js";
import { TYPE_COLOR, duration } from "./today.js";

const PRESETS = [7, 10, 30, 60, 120, 180];
let tick = null;          // intervalle du chrono et du minuteur
let wakeLock = null;      // écran allumé pendant la séance

/* ---------- état ---------- */
function startPlayer(sessionId){
  const s = Store.get("sessions", sessionId); if (!s) return;
  View.player = { id: s.id, idx: 0, startedAt: Date.now(), log: {}, cur: {}, done: [], rpe: 0,
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

/* Catégories où l'on note une charge ; ailleurs, la série est simplement comptée. */
const LOAD_CATS = ["doigts", "tirage", "poussee", "gainage", "antagonistes", "pliometrie"];
const takesLoad = (e) => !!e && LOAD_CATS.includes(e.cat);
/** Exercice de suspension : le minuteur dédié est proposé. */
const isHang = (e) => !!e && (e.cat === "doigts" || /^hang/.test(((e.meta || {}).pose || {}).pose || "")) && !!parseDose(exField(e, "dose"));
const loadStep = (e) => (e && e.cat === "doigts" ? 1 : 2.5);

/** Ce que l'on s'apprête à noter pour cet exercice : pré-rempli avec la charge conseillée. */
function current(p, e, userId){
  if (!e) return null;
  if (!p.cur[e.id]){
    const sug = takesLoad(e) ? suggestNext(exerciseHistory(sessionsOf(userId), e.id), e.cat === "doigts" ? 2 : 2.5) : null;
    const me = Session.live(), gear = ((me && me.profile) || {}).gear || {};
    const target = edgeInText(exField(e, "dose")) || 20;
    p.cur[e.id] = { load: sug ? sug.load : 0, edge: (sug && sug.edge) || nearestEdge(gear.edges, target) || target, effort: "ok" };
  }
  return p.cur[e.id];
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
  /** Série faite : noter charge, réglette et effort ; « − » retire la dernière. */
  logSet(){
    const p = View.player, s = Store.get("sessions", p.id), e = steps(s)[p.idx], k = e ? e.id : "_";
    const c = current(p, e, s.userId), eff = SET_EFFORT.find(x => x[0] === (c ? c.effort : "ok"));
    const set = !c ? {} : Object.assign({ rpe: eff[1] }, takesLoad(e) ? { load: c.load } : {},
      e.cat === "doigts" ? { edge: c.edge } : {}, c.effort === "max" ? { failed: true } : {});
    (p.log[k] = p.log[k] || []).push(set);
  },
  unlog(){ const p = View.player, e = steps(Store.get("sessions", p.id))[p.idx], k = e ? e.id : "_"; (p.log[k] || []).pop(); },
  load(d){ const p = View.player, s = Store.get("sessions", p.id), e = steps(s)[p.idx], c = current(p, e, s.userId);
           if (c) c.load = Math.round((c.load + Number(d) * loadStep(e)) * 2) / 2; },
  edge(mm){ const p = View.player, s = Store.get("sessions", p.id), c = current(p, steps(s)[p.idx], s.userId); if (c) c.edge = Number(mm); },
  effort(k){ const p = View.player, s = Store.get("sessions", p.id), c = current(p, steps(s)[p.idx], s.userId); if (c) c.effort = k; },
  /** Bilan du minuteur de suspension → séries de l'exercice en cours. */
  addSets(exId, sets){ const p = View.player; if (!p || !sets.length) return; (p.log[exId] = p.log[exId] || []).push(...sets); },
  /** Pas d'échauffement prévu : l'ajouter en tête de séance. */
  async addWarmup(){
    const p = View.player, s = Store.get("sessions", p.id), me = Session.live();
    const ids = buildWarmup(s, EXERCISES, ((me && me.profile) || {}).gear, Math.floor(p.startedAt / 1000));
    if (!ids.length) return;
    await Store.put("sessions", s.id, Object.assign({}, s, { exercises: ids.concat(s.exercises || []), plannedMin: (s.plannedMin || 0) + 12 }));
    p.idx = 0;
  },
  preset(sec){ const tm = View.player.timer; tm.dur = sec; tm.left = sec; tm.endAt = null; },
  toggle(){ const tm = View.player.timer;
            if (tm.endAt){ tm.left = timerLeft(tm); tm.endAt = null; }
            else { if (tm.left <= 0) tm.left = tm.dur; tm.endAt = Date.now() + tm.left * 1000; beep(0); } },
  rpe(n){ View.player.rpe = n; },
  async finish(){
    const p = View.player, s = Store.get("sessions", p.id);
    if (!p.rpe) return false;
    const earnedBefore = new Set(badgesOf(s.userId).filter(b => b.earned).map(b => b.id));
    /* Records de charge : la meilleure charge de la séance dépasse tout l'historique de l'exercice. */
    const history = sessionsOf(s.userId).filter(x => x.id !== s.id);
    const records = Object.entries(p.log).map(([id, sets]) => {
      const loads = (sets || []).map(x => x.load).filter(v => v != null && !isNaN(v));
      if (!loads.length) return null;
      const top = Math.max(...loads), h = exerciseHistory(history, id).map(x => x.top).filter(v => v != null);
      return h.length && top > Math.max(...h) ? { exId: id, load: top, prev: Math.max(...h) } : null;
    }).filter(Boolean);
    const min = Number(p.durInput) || elapsedMin(p);
    const done = p.done.length ? p.done : (s.exercises || []);
    const log = {};
    Object.entries(p.log).forEach(([k, v]) => { if (k !== "_" && v.length) log[k] = v; });
    await Store.put("sessions", s.id, Object.assign({}, s, {
      status: "done", rpe: p.rpe, actualMin: min, load: sessionLoad(p.rpe, min),
      feedback: (p.fb || "").trim(), doneExercises: done, doneAt: Date.now(), guided: true
    }, Object.keys(log).length ? { log } : {}));
    audit("session_validated", s.id + " RPE" + p.rpe + " " + min + "min (guided)");
    const me = Session.live(), all = sessionsOf(me.id);
    p.finished = { min, load: sessionLoad(p.rpe, min), done: done.length, total: (s.exercises || []).length,
                   week: weekProgress(all), streak: weekStreak(all),
                   newBadges: badgesOf(s.userId).filter(b => b.earned && !earnedBefore.has(b.id)), records };
    Remote.notify({ kind: "done", athleteId: s.userId, sessionId: s.id });
    p.finished.adapted = await autoAdapt(s.userId);
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

  const e = list[p.idx], key = e ? e.id : "_", sets = p.log[key] || [], tm = p.timer;
  const fig = e && exercisePose(e.meta);
  const dv = e && exVideo(e.id), demo = dv && isVideoFile(dv) ? dv : null;
  const me = Session.live();
  const warm = p.idx === 0 && !hasWarmup(s, EXERCISES) ? buildWarmup(s, EXERCISES, ((me && me.profile) || {}).gear, 0) : [];
  return '<div class="pl">' + head + '<div class="pl-body stack">' +
    '<div class="small muted">' + esc(t("pl.step", { i: p.idx + 1, n })) + '</div>' +
    (warm.length ? '<div class="notice acc">' + ic("info") + '<span>' + esc(t("wu.missing", { n: warm.length })) +
      ' <button class="link" data-act="play-warmup">' + esc(t("wu.add")) + '</button></span></div>' : '') +
    (demo ? '<div class="pl-fig pl-demo" data-demo-wrap><video data-demo="' + esc(demo) + '" muted loop playsinline autoplay preload="auto"></video></div>'
          : fig ? '<div class="pl-fig">' + fig + '</div>' : '') +
    '<h2 class="pl-h">' + esc(e ? exName(e) : s.title) + '</h2>' +
    (e && exField(e, "dose") ? '<div class="pl-dose">' + esc(exField(e, "dose")) + '</div>' : '') +
    (e && exField(e, "c") ? '<p class="small muted" style="line-height:1.55">' + esc(exField(e, "c")) + '</p>' : '') +
    (!e && s.notes ? '<p style="line-height:1.6">' + esc(s.notes) + '</p>' : '') +

    (e ? setLogger(p, e, s, sets) : '') +
    (isHang(e) ? '<button class="btn pri hg-open" data-act="hang-open" data-v="' + esc(e.id) + '">' + ic("timer") + esc(t("hg.open")) + '</button>' : '') +
    '<div class="pl-tools one">' +
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

/** Journal des séries de l'exercice : charge conseillée, réglages, séries notées. */
function setLogger(p, e, s, sets){
  const c = current(p, e, s.userId), load = takesLoad(e);
  const hist = load ? exerciseHistory(sessionsOf(s.userId), e.id) : [];
  const sug = load ? suggestNext(hist, e.cat === "doigts" ? 2 : 2.5) : null;
  const me = Session.live(), gear = ((me && me.profile) || {}).gear || {};
  const edges = (gear.edges || []).length ? gear.edges : EDGES.filter(n => n >= 10 && n <= 30);
  return '<div class="panel pl-log stack sm">' +
    '<div class="between"><span class="eyebrow">' + esc(t("pl.sets")) + '</span><span class="small muted">' + sets.length + '</span></div>' +
    (sug ? '<div class="pl-sug small">' + ic("trend") + '<span>' + esc(t("ld.last", { load: fmtLoad(sug.last, t("hg.bw")) })) + ' · <b>' +
      esc(t("ld.sug." + sug.why, { load: fmtLoad(sug.load, t("hg.bw")) })) + '</b></span></div>' : '') +
    (load ? '<div class="pl-log-row"><span class="lb">' + esc(t("hg.load")) + '</span>' +
      '<div class="hg-st-row"><button class="btn icon sm" data-act="play-load" data-v="-1" aria-label="−">−</button>' +
        '<span class="hg-st-v">' + esc(fmtLoad(c.load, t("hg.bw"))) + '</span>' +
        '<button class="btn icon sm" data-act="play-load" data-v="1" aria-label="+">+</button></div></div>' : '') +
    (e.cat === "doigts" ? '<div class="pl-log-row"><span class="lb">' + esc(t("hg.edge")) + '</span><div class="row tight">' + edges.map(n =>
      '<button class="filt' + (c.edge === n ? ' on' : '') + '" data-act="play-edge" data-v="' + n + '">' + n + '</button>').join("") + '</div></div>' : '') +
    '<div class="pl-log-row"><span class="lb">' + esc(t("ld.effortQ")) + '</span><div class="row tight">' + SET_EFFORT.map(([k]) =>
      '<button class="filt' + (c.effort === k ? ' on' : '') + '" data-act="play-effort" data-v="' + k + '">' + esc(t("ld.e." + k)) + '</button>').join("") + '</div></div>' +
    (sets.length ? '<div class="pl-log-sets">' + sets.map((x, i) =>
      '<span class="chip' + (x.failed ? ' crit' : '') + '">' + (i + 1) + ' · ' +
        esc([x.load != null ? fmtLoad(x.load, t("hg.bw")) : "", x.edge ? x.edge + " mm" : "", x.reps != null ? t("ld.reps", { n: x.reps }) : "",
             x.rpe ? t("ld.e." + (SET_EFFORT.find(y => y[1] === x.rpe) || ["ok"])[0]) : ""].filter(Boolean).join(" · ")) + '</span>').join("") + '</div>' : '') +
    '<div class="row tight"><button class="btn icon" data-act="play-unlog" aria-label="−"' + (sets.length ? '' : ' disabled') + '>−</button>' +
      '<button class="btn pri" style="flex:1" data-act="play-log">' + ic("plus") + esc(t("ld.setDone")) + '</button></div>' +
  '</div>';
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
    (f.newBadges.length ? '<div class="stack sm center"><span class="eyebrow acc">' + esc(t("pl.newBadge")) + '</span>' +
      '<div class="bd-grid bd-new">' + f.newBadges.map(badgeTile).join("") + '</div></div>' : '') +
    (f.records && f.records.length ? '<div class="pl-rec"><span class="pl-rec-ic">🏆</span><div class="stack sm"><b>' + esc(t(f.records.length > 1 ? "pl.records" : "pl.record")) + '</b>' +
      f.records.map(r => { const e = exById(r.exId); return '<span class="small">' + esc((e ? exName(e) : r.exId) + " · " + fmtLoad(r.load, t("hg.bw"))) +
        ' <span class="muted">(' + esc(t("pl.recPrev", { v: fmtLoad(r.prev, t("hg.bw")) })) + ')</span></span>'; }).join("") + '</div></div>' : '') +
    (f.adapted ? '<div class="notice acc">' + ic("info") + '<span>' + esc(adaptText(f.adapted)) + '</span></div>' : '') +
    (f.streak ? '<p class="center small">' + ic("trend") + ' ' + esc(t("pl.streak", { n: f.streak })) + '</p>' : '') +
    '<p class="center dim tiny">' + esc(t("pl.load", { n: fmtNum(f.load) })) + '</p>' +
    '<div class="pl-nav"><button class="btn ghost" data-act="play-message">' + ic("chat") + esc(t("pl.tellCoach")) + '</button>' +
      '<button class="btn pri" data-act="play-close">' + esc(t("pl.home")) + '</button></div>' +
  '</div></div>';
}

/** Chrono et minuteur : repeints 4 fois par seconde, sans re-rendu complet. */
function bindPlayer(){
  if (tick) clearInterval(tick);
  bindDemos(document);
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

export { bindPlayer, isHang, playerActions, startPlayer, stopPlayer, viewPlayer };
