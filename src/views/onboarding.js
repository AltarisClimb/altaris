import { esc } from "../core.js";
import { boulderOptions, sportOptions, trackFor } from "../domain/grades.js";
import { LANG, LI, t } from "../i18n/index.js";
import { ic } from "../ui/icons.js";
import { View } from "./shell.js";
import { availGrid } from "./availgrid.js";
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
        fYear("birthYear", t("on.birth"), d.birthYear) +
        fRange("heightCm", t("on.height"), "cm", d.heightCm, 120, 220, 1, 170) +
        fRange("weightKg", t("on.weight"), "kg", d.weightKg, 30, 130, .5, 65, t("on.weightHint")) +
      '</div></div>';
  } else if (step === 1){
    body = '<div class="stack">' +
      '<div class="stack sm"><h2 class="serif" style="font-size:25px">' + esc(t("on.levelQ")) + '</h2>' +
      '<p class="muted small">' + esc(t("on.levelQD")) + '</p></div>' +
      '<div class="grid g2">' +
        fSelect("gradeSport", t("on.gradeSport"), [["",""]].concat(sportOptions(LANG === "en")), d.gradeSport) +
        fSelect("gradeBoulder", t("on.gradeBoulder"), [["",""]].concat(boulderOptions(LANG === "en", d.gradeBoulder)), d.gradeBoulder) +
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
      availGrid("onb", { get: () => View.onb.data.availability, set: (s) => { View.onb.data.availability = s; } }) +
    '</div>';
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
/** Année de naissance : menu déroulant, de la plus récente (8 ans) à 1930. data-num : relue en nombre. */
function fYear(k, lb, v){
  const top = new Date().getFullYear() - 8, years = [];
  for (let y = top; y >= 1930; y--) years.push(y);
  return '<label class="f"><span class="lb">' + esc(lb) + '</span><select class="inp" data-onb="' + k + '" data-num="1">' +
    '<option value=""></option>' + years.map(y => '<option value="' + y + '"' + (Number(v) === y ? " selected" : "") + '>' + y + '</option>').join("") +
    '</select></label>';
}
/** Curseur avec la valeur affichée à côté du libellé (mise à jour en direct par actions.js). */
function fRange(k, lb, unit, v, min, max, step, def, hint){
  const val = v == null || v === "" ? def : v;
  return '<label class="f"><span class="lb rg-lb">' + esc(lb) + '<b class="rg-v">' + esc(rangeText(val, unit)) + '</b></span>' +
    '<input class="rg" type="range" data-onb="' + k + '" data-unit="' + esc(unit) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">' +
    (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
}
function rangeText(v, unit){ return Number(v).toLocaleString(LANG === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 1 }) + " " + unit; }
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

export { DAYS, INJURY_SITES, ONB_STEPS, SESSION_TYPES, fNum, fRange, fSelect, fYear, rangeText, viewOnboarding };
