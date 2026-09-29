/* ALTARIS™ — « Aujourd'hui » : l'accueil du grimpeur
   © 2026 ALTARIS™. All rights reserved.

   Une seule chose à faire en ouvrant l'appli : la séance du jour et son bouton
   Démarrer. Autour : la semaine en un anneau, la série de semaines actives, ce
   qui reste à valider et le dernier mot du coach. Les chiffres techniques sont
   dans l'onglet Progrès. */
import { diffDays, esc, today } from "../core.js";
import { Access, can, planOf } from "../data.js";
import { Remote } from "../remote.js";
import { trialDaysLeft } from "../domain/plans.js";
import { sessionStart } from "../domain/calendar.js";
import { exById } from "../domain/exercises.js";
import { focusSession, toValidate, weekProgress, weekStreak } from "../domain/progress.js";
import { fmtDate, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { exercisePose } from "../ui/poses.js";
import { sessionsOf } from "./climber.js";
import { callCard } from "./calls.js";
import { getThread } from "./library.js";
import { canTrainFree, goalCard, retestCard } from "./training.js";

/** Couleur d'un type de séance (bande des cartes, pastilles). */
const TYPE_COLOR = { boulder: "var(--s1)", lead: "var(--s2)", fingerboard: "var(--s6)", strength: "var(--s3)",
  endurance: "var(--s4)", outdoor: "var(--s5)", mobility: "var(--good)", prehab: "var(--warn)", rest: "var(--ink-3)" };

/** 90 → « 1 h 30 », 45 → « 45 min ». */
function duration(min){
  const m = Math.round(min || 0);
  return m < 60 ? m + " " + t("g.min") : Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : "");
}

/** « Aujourd'hui · 18:00 », « Demain · 18:00 », « jeudi 2 octobre ». */
function when(s, profile){
  const dd = diffDays(s.date, today());
  const day = dd === 0 ? t("g.today") : dd === 1 ? t("cal.tomorrow") : fmtDate(s.date, { weekday: "long", day: "numeric", month: "long" });
  const tm = sessionStart(s, profile);
  return day + (tm ? " · " + tm : "");
}

/** Anneau de la semaine : séances faites / prévues. */
function ring(done, total){
  const r = 34, c = 2 * Math.PI * r, p = total ? Math.min(1, done / total) : 0;
  return '<svg class="td-ring" viewBox="0 0 84 84" aria-hidden="true">' +
    '<circle cx="42" cy="42" r="' + r + '" class="bg"/>' +
    '<circle cx="42" cy="42" r="' + r + '" class="pg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"/>' +
    '<text x="42" y="40" text-anchor="middle" class="n">' + done + '/' + total + '</text>' +
    '<text x="42" y="55" text-anchor="middle" class="u">' + esc(t("td.sessions")) + '</text></svg>';
}

function viewToday(me){
  const p = me.profile || {};
  const all = sessionsOf(me.id);
  const focus = focusSession(all);
  const late = toValidate(all);
  const wk = weekProgress(all);
  const streak = weekStreak(all);
  const coach = Access.myCoach();
  const first = focus && (focus.exercises || []).map(exById).find(e => e && e.meta && e.meta.pose);

  /* Dernier message du coach non lu. */
  let coachMsg = null;
  if (coach){
    const th = getThread(me.id, coach.id);
    const lastRead = (th.read || {})[me.id] || 0;
    coachMsg = (th.messages || []).filter(m => m.from !== me.id && m.ts > lastRead).sort((a, b) => b.ts - a.ts)[0] || null;
  }

  const isToday = focus && focus.date === today();
  const plan = planOf(me), daysLeft = trialDaysLeft(me);
  const doneToday = all.some(s => s.date === today() && s.status === "done");
  const hero = focus
    ? '<div class="td-hero" style="--type:' + (TYPE_COLOR[focus.type] || "var(--accent)") + '">' +
        '<div class="td-hero-main">' +
          '<span class="eyebrow">' + esc(isToday ? t("td.today") : t("ov.nextSession")) + '</span>' +
          '<div class="td-when">' + esc(when(focus, p)) + '</div>' +
          '<div class="td-title">' + esc(focus.title) + '</div>' +
          '<div class="row tight"><span class="chip">' + esc(t("st." + focus.type)) + '</span>' +
            '<span class="chip">' + esc(duration(focus.plannedMin)) + '</span>' +
            '<span class="chip">' + esc(t("cal.intensity", { n: focus.targetIntensity || 5 })) + '</span>' +
            ((focus.exercises || []).length ? '<span class="chip">' + esc(t("td.exercises", { n: focus.exercises.length })) + '</span>' : '') + '</div>' +
        '</div>' +
        (first ? '<div class="td-fig">' + exercisePose(first.meta) + '</div>' : '') +
        '<div class="td-cta">' +
          /* Séance de re-test : elle se fait dans l'onglet Tests. */
          (focus.retest
            ? '<button class="btn pri td-go" data-act="tab" data-v="tests">' + ic("test") + esc(t("rt.go")) + '</button>'
            : '<button class="btn pri td-go" data-act="play-start" data-v="' + esc(focus.id) + '">' + ic("play") + esc(t("td.start")) + '</button>') +
          '<button class="btn ghost" data-act="session-open" data-v="' + esc(focus.id) + '">' + esc(t("td.details")) + '</button>' +
        '</div>' +
      '</div>'
    : '<div class="td-hero none">' +
        '<div class="td-hero-main"><span class="eyebrow">' + esc(t("td.today")) + '</span>' +
          '<div class="td-title">' + esc(doneToday ? t("td.doneTitle") : t("td.restTitle")) + '</div>' +
          '<p class="muted small">' + esc(doneToday ? t("td.doneD") : coach ? t("td.restD") : t("td.noCoachD")) + '</p></div>' +
        '<div class="td-cta">' + (can(me, "train") && !doneToday ? '<button class="btn pri" data-act="program">' + ic("list") + esc(t("prg.create")) + '</button>' : '') +
          (coach && can(me, "messaging") ? '<button class="btn" data-act="tab" data-v="messages">' + ic("chat") + esc(t("td.askCoach")) + '</button>' : '') + '</div>' +
      '</div>';

  return '<div class="stack lg td">' +
    '<div class="sec-head"><div><h2>' + esc(t("td.hello", { name: (me.name || "").split(" ")[0] })) + '</h2></div></div>' +
    /* Formule : bandeau pendant l'essai, écran de choix une fois l'essai terminé. */
    (plan === "trial" ? '<div class="notice acc">' + ic("info") + '<span>' + esc(t("pl.trialLeft", { n: daysLeft })) +
      ' <button class="link" data-act="plans">' + esc(t("pl.see")) + '</button></span></div>' : '') +
    (plan === "expired"
      ? '<div class="td-hero none"><div class="td-hero-main"><span class="eyebrow">' + esc(t("plan.expired")) + '</span>' +
          '<div class="td-title">' + esc(t("pl.expiredT")) + '</div><p class="muted small">' + esc(t("pl.expiredD")) + '</p></div>' +
          '<div class="td-cta"><button class="btn pri td-go" data-act="plans">' + esc(t("pl.choose")) + '</button></div></div>'
      : hero) +

    (late.length ? '<div class="panel in-list">' + late.map(s =>
      '<div class="in-row warn"><span class="in-ic">' + ic("check") + '</span>' +
        '<span class="in-main"><span class="in-who">' + esc(s.title) + '</span>' +
        '<span class="in-what">' + esc(fmtDate(s.date, { weekday: "long", day: "numeric", month: "long" })) + ' · ' + esc(t("ov.toValidate")) + '</span></span>' +
        '<button class="btn sm pri" data-act="validate" data-v="' + esc(s.id) + '">' + esc(t("ov.validate")) + '</button></div>').join("") + '</div>' : '') +

    (plan !== "expired" ? retestCard(me) : '') +
    goalCard(me, true) +
    '<div class="td-stats">' +
      '<div class="panel td-stat">' + ring(wk.done, wk.total) +
        '<div><span class="eyebrow">' + esc(t("cal.thisWeek")) + '</span>' +
        '<div class="td-big">' + esc(duration(wk.minutes)) + '</div>' +
        '<div class="small muted">' + esc(t("td.ofPlanned", { time: duration(wk.plannedMinutes) })) + '</div></div></div>' +
      '<div class="panel td-stat"><div class="td-flame">' + ic("trend") + '</div>' +
        '<div><span class="eyebrow">' + esc(t("td.streak")) + '</span>' +
        '<div class="td-big">' + esc(t("td.weeks", { n: streak })) + '</div>' +
        '<div class="small muted">' + esc(streak ? t("td.streakD") : t("td.streakStart")) + '</div></div></div>' +
    '</div>' +

    /* Visio réservée dans les 7 prochains jours : rappel sur l'accueil. */
    (Remote.client && Remote.calls.some(c => c.booked_by === me.id && c.start + c.minutes * 60000 > Date.now() && c.start - Date.now() < 7 * 86400000) ? callCard(me) : '') +
    (coachMsg ? '<div class="panel pad stack sm td-msg">' +
      '<span class="eyebrow">' + esc(t("td.fromCoach", { name: coach.name })) + '</span>' +
      '<p class="td-quote">' + esc(coachMsg.text.length > 180 ? coachMsg.text.slice(0, 177) + "…" : coachMsg.text) + '</p>' +
      '<div><button class="btn sm" data-act="tab" data-v="messages">' + ic("chat") + esc(t("in.reply")) + '</button></div></div>' : '') +

    '<div class="row tight noprint">' +
      (canTrainFree(me) ? '<button class="btn sm" data-act="free-session">' + ic("timer") + esc(t("fs.title")) + '</button>' : '') +
      '<button class="btn sm ghost" data-act="pain-new">' + ic("pain") + esc(t("ov.reportPain")) + '</button>' +
      '<button class="btn sm ghost" data-act="tab" data-v="tests">' + ic("test") + esc(t("nav.tests")) + '</button>' +
    '</div>' +
  '</div>';
}

export { TYPE_COLOR, duration, viewToday };
