/* ALTARIS™ — programmes « signature » : choisir, démarrer, suivre
   © 2026 ALTARIS™. All rights reserved. */
import { $, $$, addDays, esc, today, uid } from "../core.js";
import { Session, Store, audit, planOf } from "../data.js";
import { EXERCISES } from "../domain/exercises.js";
import { trackFor } from "../domain/grades.js";
import { FEATURES } from "../domain/plans.js";
import { generateProgram } from "../domain/program.js";
import { SIGNATURES, signatureById, signaturePhases, signatureProgress } from "../domain/signature.js";
import { goalOf } from "../domain/periodization.js";
import { climberGrade } from "../domain/benchmarks.js";
import { SPORT } from "../domain/grades.js";
import { t } from "../i18n/index.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sessionsOf } from "./climber.js";

const PHASE_COLOR = { base: "var(--s4)", strength: "var(--s3)", power: "var(--s6)", taper: "var(--s5)" };

/** Accueil : où en est le programme en cours, sinon une invitation à en choisir un. */
function signatureCard(me, hasFocus){
  const pr = signatureProgress(sessionsOf(me.id), today());
  if (pr){
    const pct = Math.round(100 * pr.done / Math.max(1, pr.total));
    return '<button class="panel sg-cur" data-act="signature">' +
      '<span class="eyebrow acc">' + esc(t("sg.current")) + '</span>' +
      '<span class="sg-cur-t">' + esc(t("sg." + pr.id)) + ' · ' + esc(t("sg.weekOf", { i: pr.week, n: pr.weeks })) + '</span>' +
      '<span class="sg-bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="small muted">' + esc(t("sg.doneOf", { d: pr.done, n: pr.total })) + '</span></button>';
  }
  if (hasFocus) return "";
  return '<button class="panel sg-cur" data-act="signature"><span class="eyebrow acc">' + esc(t("sg.title")) + '</span>' +
    '<span class="sg-cur-t">' + esc(t("sg.teaser")) + '</span><span class="small muted">' + esc(t("sg.teaserD")) + '</span></button>';
}

function signatureModal(){
  const me = Session.live(); if (!me) return;
  const cur = signatureProgress(sessionsOf(me.id), today());
  Modal.open({
    title: t("sg.title"), wide: true,
    body: '<div class="stack"><p class="small muted">' + esc(t("sg.intro")) + '</p><div class="sg-grid">' + SIGNATURES.map(s =>
      '<div class="sg-card' + (cur && cur.id === s.id ? ' on' : '') + '">' +
        '<div class="sg-h"><span class="sg-ic">' + ic(s.icon) + '</span><div><b>' + esc(t("sg." + s.id)) + '</b>' +
          '<span class="small muted">' + esc(t("sg.meta", { w: s.weeks })) + ' · ' + esc(t("sg.lv." + s.level)) + '</span></div></div>' +
        '<p class="small">' + esc(t("sg." + s.id + "D")) + '</p>' +
        '<div class="sg-ph">' + s.phases.map(([p, w]) => '<i style="flex:' + w + ';background:' + PHASE_COLOR[p] + '" title="' + esc(t("ph." + p)) + '"></i>').join("") + '</div>' +
        (cur && cur.id === s.id ? '<span class="chip acc">' + esc(t("sg.weekOf", { i: cur.week, n: cur.weeks })) + '</span>'
          : '<button class="btn sm pri" data-sg="' + s.id + '">' + ic("play") + esc(t("sg.start")) + '</button>') +
      '</div>').join("") + '</div></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-sg]", root).forEach(b => b.onclick = async () => { b.disabled = true; await startSignature(b.dataset.sg); });
    }
  });
}

/** Démarre un programme demain : remplace les séances à venir des programmes précédents. */
async function startSignature(id){
  const me = Session.live(), sig = signatureById(id); if (!me || !sig) return;
  const p = me.profile || {}, plan = planOf(me), from = addDays(today(), 1);
  const maxWeeks = plan === "trial" ? FEATURES.trial.programWeeks : sig.weeks;
  const mine = Store.list("sessions").filter(s => s.userId === me.id);
  const old = mine.filter(s => s.program && s.status === "planned" && s.date >= from);
  if (old.length && !confirm(t("sg.replaces", { n: old.length }))) return;
  const programId = uid("sg");
  const list = generateProgram({
    userId: me.id, profile: p, track: trackFor(p), exercises: EXERCISES, weak: sig.weak, weeks: sig.weeks, maxWeeks,
    from, taken: mine.filter(s => !s.program && s.date >= from).map(s => s.date), programId, gear: p.gear,
    phases: signaturePhases(sig, from), intensityShift: sig.intensityShift || 0, signature: sig.id,
    until: plan === "trial" && me.trialEndsAt ? new Date(me.trialEndsAt).toISOString().slice(0, 10) : null,
    label: (theme, w) => t("sg." + sig.id) + " · " + t("prg." + theme) + " · " + t("prg.week", { n: w })
  });
  if (!list.length) return toast(t("prg.nothing"), "crit");
  for (const s of old) await Store.del("sessions", s.id);
  let saved = 0;
  for (const s of list) if (await Store.put("sessions", s.id, s)) saved++;
  audit("signature_started", sig.id + " " + saved + " sessions");
  Modal.close();
  toast(t(plan === "trial" ? "sg.startedTrial" : "sg.started", { n: saved, name: t("sg." + sig.id) }), "good");
}

/** Choix du programme conseillé d'après le profil. */
function suggested(p){
  const i = SPORT.indexOf(climberGrade(p) || "");
  if (i < SPORT.indexOf("7a")) return "first7a";
  return p.goalDate ? "trip" : "fingers";
}

/**
 * Fin de l'accueil : « votre plan est prêt ». Les phases (objectif daté ou
 * programme conseillé), la première semaine concrète, ce que comprend l'essai,
 * puis un seul geste pour démarrer.
 */
function planPreviewModal(){
  const me = Session.live(); if (!me) return;
  const p = me.profile || {}, sig = signatureById(suggested(p)), from = addDays(today(), 1);
  const goal = goalOf(p);
  const phases = goal && goal.phases.length ? goal.phases : signaturePhases(sig, from);
  const week1 = generateProgram({ userId: me.id, profile: p, track: trackFor(p), exercises: EXERCISES, weak: sig.weak, weeks: 1,
    from, programId: "preview", gear: p.gear, phases, label: (theme) => t("prg." + theme) });
  const total = phases.reduce((n, x) => n + Math.round((Date.parse(x.to) - Date.parse(x.from)) / 86400000) + 1, 0) || 1;
  const plan = planOf(me);
  Modal.open({
    title: t("pv.title", { name: (me.name || "").split(" ")[0] }), wide: true,
    body: '<div class="stack pv">' +
      '<p class="pv-lead">' + esc(goal ? t("pv.goal", { text: goal.text || t("gl.noText"), n: goal.days }) : t("pv.sig", { name: t("sg." + sig.id), w: sig.weeks })) + '</p>' +
      '<div class="gl-bar pv-bar">' + phases.map(x => {
        const d = Math.round((Date.parse(x.to) - Date.parse(x.from)) / 86400000) + 1;
        return '<span style="flex:' + d + ';background:' + PHASE_COLOR[x.phase] + '"><em>' + esc(t("ph." + x.phase)) + '</em></span>';
      }).join("") + '</div>' +
      '<p class="small muted">' + esc(t("pv.weeks", { n: Math.round(total / 7) })) + '</p>' +
      (week1.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("pv.week1")) + '</span><div class="panel in-list">' + week1.map(s =>
        '<div class="in-row"><span class="in-ic">' + ic("cal") + '</span><span class="in-main"><span class="in-who">' + esc(s.title) + '</span>' +
        '<span class="in-what">' + esc(new Date(s.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + " · " + s.time + " · " + s.plannedMin + " min") + '</span></span></div>').join("") +
      '</div></div>' : '<p class="small muted">' + esc(t("pv.noSlots")) + '</p>') +
      (plan === "trial" ? '<div class="notice acc">' + ic("info") + '<span>' + esc(t("pv.trial")) + '</span></div>' : '') +
    '</div>',
    footer: '<button class="btn ghost" data-plans>' + esc(t("pl.see")) + '</button>' +
      '<button class="btn pri" data-go>' + ic("play") + esc(t(goal ? "pv.goGoal" : "pv.go")) + '</button>',
    onMount(root){
      $("[data-plans]", root).onclick = () => { Modal.close(); import("../modals.js").then(m => m.plansModal()); };
      $("[data-go]", root).onclick = async () => {
        $("[data-go]", root).disabled = true;
        if (goal){ Modal.close(); import("../modals.js").then(m => m.programModal()); return; }
        await startSignature(sig.id);
      };
    }
  });
}

export { planPreviewModal, signatureCard, signatureModal, startSignature };
