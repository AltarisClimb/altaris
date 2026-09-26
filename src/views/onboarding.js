import { esc } from "../core.js";
import { FONT, SPORT, fontLabel, trackFor } from "../domain/grades.js";
import { LI, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { View } from "./shell.js";
/* ================================================================
   11. ONBOARDING — level-based routing (CDC §4)
   ================================================================ */
const ONB_STEPS = ["on.s1","on.s2","on.s3","on.s4","on.s5"];
const INJURY_SITES = [
  ["pulley", ["Poulie de doigt (A2/A4)", "Finger pulley (A2/A4)"]],
  ["tendon", ["Tendinite de fléchisseur", "Flexor tendinopathy"]],
  ["elbow",  ["Coude (épicondylite / épitrochléite)", "Elbow (lateral / medial epicondylalgia)"]],
  ["shoulder",["Épaule (coiffe, labrum, instabilité)", "Shoulder (cuff, labrum, instability)"]],
  ["wrist",  ["Poignet", "Wrist"]],
  ["back",   ["Dos / lombaires", "Back / lumbar"]],
  ["knee",   ["Genou / ménisque", "Knee / meniscus"]],
  ["ankle",  ["Cheville", "Ankle"]]
];
const DAYS = [["Lundi","Monday"],["Mardi","Tuesday"],["Mercredi","Wednesday"],["Jeudi","Thursday"],["Vendredi","Friday"],["Samedi","Saturday"],["Dimanche","Sunday"]];
const SESSION_TYPES = ["boulder","lead","fingerboard","strength","endurance","outdoor","mobility","prehab","rest"];

function viewOnboarding(){
  const o = View.onb, d = o.data, step = o.step;
  const track = trackFor(d);
  let body = "";
  if (step === 0){
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.welcome")) + '</h2>' +
      '<p class="muted small">' + esc(t("on.welcomeD")) + '</p></div>' +
      '<div class="grid g2">' +
        fSelect("sex", t("on.sex"), [["f",t("on.sex.f")],["m",t("on.sex.m")],["x",t("on.sex.x")]], d.sex, t("on.sexHint")) +
        fNum("birthYear", t("on.birth"), "", d.birthYear, 1, 1930, 2020) +
        fNum("heightCm", t("on.height"), "cm", d.heightCm, 1, 120, 230) +
        fNum("weightKg", t("on.weight"), "kg", d.weightKg, .1, 30, 200, t("on.weightHint")) +
      '</div></div>';
  } else if (step === 1){
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.levelQ")) + '</h2>' +
      '<p class="muted small">' + esc(t("on.levelQD")) + '</p></div>' +
      '<div class="grid g2">' +
        fSelect("gradeSport", t("on.gradeSport"), [["",""]].concat(SPORT.map(g => [g,g])), d.gradeSport) +
        fSelect("gradeBoulder", t("on.gradeBoulder"), [["",""]].concat(FONT.map(g => [g, fontLabel(g)])), d.gradeBoulder) +
        fSelect("discipline", t("on.mainDisc"), [["boulder",t("on.disc.boulder")],["sport",t("on.disc.sport")],["both",t("on.disc.both")]], d.discipline) +
        fNum("years", t("on.years"), "", d.years, .5, 0, 60) +
      '</div>' +
      '<div class="notice ' + (track === "advanced" ? "acc" : "") + '">' + ic(track === "advanced" ? "target" : "shield") +
        '<span><b>' + esc(track === "advanced" ? t("on.routeAdv") : t("on.routeBeg")) + '</b><br>' +
        esc(track === "advanced" ? t("on.routeAdvD") : t("on.routeBegD")) + '</span></div>';
  } else if (step === 2){
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.injuries")) + '</h2>' +
      '<p class="muted small">' + esc(t("on.injuriesD")) + '</p></div>' +
      '<div class="grid g2">' + INJURY_SITES.map(([k, lb]) =>
        '<label class="check' + (d.injuries.indexOf(k) >= 0 ? " on" : "") + '">' +
          '<input type="checkbox" data-onb-inj="' + k + '"' + (d.injuries.indexOf(k) >= 0 ? " checked" : "") + '>' +
          '<span class="t">' + esc(lb[LI()]) + '</span></label>').join("") + '</div>' +
      '<label class="check' + (d.currentPain ? " on" : "") + '" style="border-color:' + (d.currentPain ? "var(--crit)" : "var(--line)") + '">' +
        '<input type="checkbox" data-onb="currentPain"' + (d.currentPain ? " checked" : "") + '>' +
        '<span><span class="t">' + esc(t("on.currentPain")) + '</span><span class="d">' + esc(t("on.currentPainD")) + '</span></span></label>' +
    '</div>';
  } else if (step === 3){
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.avail")) + '</h2>' +
      '<p class="muted small">' + esc(t("on.availD")) + '</p></div>' +
      (d.availability.length ? '<div class="panel rows">' + d.availability.map((s, i) =>
        '<div class="rw"><span class="gr"><span class="t1">' + esc(DAYS[s.day][LI()]) + ' · ' + esc(s.start) + '–' + esc(s.end) + '</span>' +
        '<span class="t2">' + esc(t("st."+s.type)) + '</span></span>' +
        '<button class="btn icon sm ghost" data-act="onb-rmslot" data-v="' + i + '" aria-label="' + esc(t("g.delete")) + '">' + ic("trash") + '</button></div>').join("") + '</div>' : '') +
      '<div class="panel pad stack sm"><div class="grid g4">' +
        '<label class="f"><span class="lb">' + esc(t("g.week")) + '</span><select class="inp" id="sl-day">' +
          DAYS.map((dd, i) => '<option value="' + i + '">' + esc(dd[LI()]) + '</option>').join("") + '</select></label>' +
        '<label class="f"><span class="lb">' + esc(t("ts.work")) + '</span><input class="inp num" id="sl-start" type="time" value="18:00"></label>' +
        '<label class="f"><span class="lb">' + esc(t("ts.restp")) + '</span><input class="inp num" id="sl-end" type="time" value="20:00"></label>' +
        '<label class="f"><span class="lb">' + esc(t("g.type")) + '</span><select class="inp" id="sl-type">' +
          SESSION_TYPES.filter(x => x !== "rest").map(x => '<option value="' + x + '">' + esc(t("st."+x)) + '</option>').join("") + '</select></label>' +
      '</div><button class="btn sm" data-act="onb-addslot">' + ic("plus") + esc(t("on.addSlot")) + '</button></div></div>';
  } else {
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.goals")) + '</h2></div>' +
      '<label class="f"><span class="lb">' + esc(t("on.goals")) + '</span>' +
        '<textarea class="inp" data-onb="goalText" placeholder="' + esc(t("on.goalPlaceholder")) + '">' + esc(d.goalText||"") + '</textarea></label>' +
      '<label class="f" style="max-width:230px"><span class="lb">' + esc(t("on.goalDate")) + '</span>' +
        '<input class="inp num" type="date" data-onb="goalDate" value="' + esc(d.goalDate||"") + '"></label>' +
      '<div class="notice acc">' + ic(track === "advanced" ? "target" : "shield") +
        '<span><b>' + esc(track === "advanced" ? t("on.routeAdv") : t("on.routeBeg")) + '</b><br>' +
        esc(track === "advanced" ? t("on.routeAdvD") : t("on.routeBegD")) + '</span></div></div>';
  }
  return '<main><div class="stack lg" style="max-width:660px;margin:0 auto">' +
    '<div class="stack sm">' +
      '<div class="between"><span class="eyebrow acc">' + esc(t("on.title")) + '</span>' +
      '<span class="eyebrow">' + esc(t("on.step")) + ' ' + (step+1) + ' / 5 · ' + esc(t(ONB_STEPS[step])) + '</span></div>' +
      '<div class="steps">' + ONB_STEPS.map((_, i) =>
        '<span class="st ' + (i < step ? "done" : i === step ? "now" : "") + '"></span>').join("") + '</div></div>' +
    '<div class="panel pad">' + body + '</div>' +
    '<div class="row" style="justify-content:space-between">' +
      (step > 0 ? '<button class="btn ghost" data-act="onb-prev">' + ic("chevL") + esc(t("g.previous")) + '</button>' : '<span></span>') +
      '<button class="btn pri" data-act="onb-next">' + esc(step === 4 ? t("g.finish") : t("g.next")) + ic("chevR") + '</button>' +
    '</div></div></main>';
}

/* small form field builders */
function fNum(k, lb, unit, v, step, min, max, hint){
  return '<label class="f"><span class="lb">' + esc(lb) + '</span>' +
    (unit ? '<span class="unit"><input class="inp num" type="number" data-onb="' + k + '" value="' + (v==null?"":v) + '" step="' + (step||1) + '"' +
      (min!=null?' min="'+min+'"':'') + (max!=null?' max="'+max+'"':'') + '><span class="u">' + esc(unit) + '</span></span>'
          : '<input class="inp num" type="number" data-onb="' + k + '" value="' + (v==null?"":v) + '" step="' + (step||1) + '">') +
    (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
}
function fSelect(k, lb, opts, v, hint){
  return '<label class="f"><span class="lb">' + esc(lb) + '</span><select class="inp" data-onb="' + k + '">' +
    opts.map(([val, txt]) => '<option value="' + esc(val) + '"' + (String(v||"") === String(val) ? " selected" : "") + '>' + esc(txt) + '</option>').join("") +
    '</select>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
}

export { DAYS, INJURY_SITES, ONB_STEPS, SESSION_TYPES, fNum, fSelect, viewOnboarding };
