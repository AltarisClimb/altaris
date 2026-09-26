/* ALTARIS™ — « Mes progrès » : évolution par qualité et badges
   © 2026 ALTARIS™. All rights reserved.
   En tête de l'onglet Progrès : ce qui a progressé, en mots simples, et les
   badges gagnés ou à portée. Les courbes techniques restent en dessous. */
import { esc } from "../core.js";
import { Store } from "../data.js";
import { badges, qualityDeltas } from "../domain/progress.js";
import { fmtDate, t } from "../i18n/index.js";
import { sessionsOf } from "./climber.js";

const BADGE_ICON = { first: "🎯", ten: "🔟", fifty: "🏅", hours10: "⏱️", fullWeek: "✅",
                     streak4: "🔥", streak12: "🏔️", guided5: "🧭", firstTest: "📏", progress: "📈" };

function badgesOf(userId){
  return badges(sessionsOf(userId), Store.list("assessments").filter(a => a.userId === userId));
}

function badgeTile(b){
  return '<div class="bd' + (b.earned ? ' on' : '') + '" title="' + esc(t("bd." + b.id + "D")) + '">' +
    '<span class="bd-ic" aria-hidden="true">' + BADGE_ICON[b.id] + '</span>' +
    '<span class="bd-t">' + esc(t("bd." + b.id)) + '</span>' +
    (b.earned ? '' : '<span class="bd-p"><span style="width:' + Math.round(100 * b.value / b.target) + '%"></span></span>' +
      '<span class="bd-n">' + b.value + '/' + b.target + '</span>') +
  '</div>';
}

function progressPanel(u){
  const deltas = qualityDeltas(Store.list("assessments").filter(a => a.userId === u.id));
  const list = badgesOf(u.id);
  const earned = list.filter(b => b.earned).length;
  return '<div class="panel pad stack">' +
    '<div class="between"><span class="eyebrow">' + esc(t("pg.title")) + '</span>' +
      '<button class="btn xs" data-act="tab" data-v="tests">' + esc(t("nav.tests")) + '</button></div>' +
    (deltas.length
      ? '<div class="pg-deltas">' + deltas.map(d =>
          '<div class="pg-d"><span class="pg-d-n ' + (d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '') + '">' +
            (d.delta > 0 ? '+' : '') + d.delta + '</span>' +
          '<span class="pg-d-t">' + esc(t("d." + d.domain)) + '</span>' +
          '<span class="pg-d-s">' + Math.round(d.from) + ' → ' + Math.round(d.to) + '</span></div>').join("") + '</div>' +
        '<p class="dim tiny">' + esc(t("pg.since", { date: fmtDate(deltas[0].since, { day: "numeric", month: "long", year: "numeric" }) })) + '</p>'
      : '<p class="small muted">' + esc(t("pg.needTwo")) + '</p>') +
    '<div class="between"><span class="eyebrow">' + esc(t("pg.badges")) + '</span><span class="small muted">' + earned + '/' + list.length + '</span></div>' +
    '<div class="bd-grid">' + list.map(badgeTile).join("") + '</div>' +
  '</div>';
}

export { BADGE_ICON, badgeTile, badgesOf, progressPanel };
