/* ALTARIS™ — grille hebdomadaire des disponibilités du grimpeur
   © 2026 ALTARIS™. All rights reserved.

   Sept colonnes (lundi → dimanche), des cases de 30 min de 6 h à 23 h. On
   choisit un type de séance (le « pinceau »), puis :
   - à la souris : cliquer-glisser trace la plage (sur plusieurs jours d'un
     coup si l'on glisse de côté) ; repasser sur une plage du même type l'efface ;
   - au doigt : toucher le début puis la fin d'une plage du même jour.
   La grille se met à jour sans re-rendu complet ; les créneaux sont rendus
   sous la forme { day, start, end, type } (profile.availability). */
import { esc } from "../core.js";
import { LI, t } from "../i18n/index.js";
import { DAYS, SESSION_TYPES } from "./onboarding.js";
import { TYPE_COLOR } from "./today.js";
import { N, START, STEP, toCells, toHM, toSlots } from "../domain/availability.js";

/* Évalué à l'usage : onboarding.js importe aussi ce module (cycle d'imports). */
const types = () => SESSION_TYPES.filter(x => x !== "rest");
const GRIDS = {};                 // id → { get, set, brush }

/** HTML de la grille. opts.get() / opts.set(slots) lisent et écrivent les créneaux. */
function availGrid(id, opts){
  const reg = GRIDS[id] = Object.assign({ brush: (GRIDS[id] || {}).brush || "boulder" }, opts);
  const g = toCells(reg.get());
  let cells = "";
  for (let i = 0; i < N; i++){
    const m = START + i * STEP;
    cells += '<span class="vg-h">' + (m % 60 === 0 ? toHM(m) : "") + '</span>';
    for (let d = 0; d < 7; d++) cells += cell(d, i, g[d][i]);
  }
  return '<div class="avg" data-avg="' + esc(id) + '">' +
    '<div class="avg-brush" role="radiogroup" aria-label="' + esc(t("av.brush")) + '">' + types().map(x =>
      '<button type="button" class="filt avg-b' + (reg.brush === x ? ' on' : '') + '" data-avg-brush="' + x + '" role="radio" aria-checked="' + (reg.brush === x) + '">' +
        '<i style="background:' + (TYPE_COLOR[x] || "var(--accent)") + '"></i>' + esc(t("st." + x)) + '</button>').join("") + '</div>' +
    '<p class="dim tiny">' + esc(t("av.hint")) + '</p>' +
    '<div class="vg avg-grid"><span></span>' + DAYS.map(dd => '<span class="vg-dh"><b>' + esc(dd[LI()].slice(0, 3)) + '</b></span>').join("") + cells + '</div>' +
    '<div class="avg-sum small muted" data-avg-sum>' + summary(reg.get()) + '</div>' +
  '</div>';
}
function cell(d, i, type){
  return '<button type="button" class="vg-c avg-c' + (type ? ' on' : '') + '" data-d="' + d + '" data-i="' + i + '"' +
    (type ? ' style="--type:' + (TYPE_COLOR[type] || "var(--accent)") + '" title="' + esc(t("st." + type)) + '"' : '') +
    ' aria-label="' + esc(DAYS[d][LI()] + " " + toHM(START + i * STEP)) + '"></button>';
}
function summary(slots){
  return (slots || []).length
    ? slots.map(s => esc(DAYS[s.day][LI()].slice(0, 3) + " " + s.start + "–" + s.end + " · " + t("st." + s.type))).join(" &nbsp;·&nbsp; ")
    : esc(t("on.availD"));
}

/** Rend la grille interactive (à appeler après chaque insertion dans le DOM). */
function bindAvailGrids(root){
  (root || document).querySelectorAll("[data-avg]").forEach(host => {
    if (host._bound) return;
    host._bound = true;
    const id = host.dataset.avg, reg = GRIDS[id]; if (!reg) return;
    let drag = null, anchor = null;
    const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".avg-c"); };
    const pos = (el) => [Number(el.dataset.d), Number(el.dataset.i)];
    const paint = (g) => {
      host.querySelectorAll(".avg-c").forEach(el => {
        const [d, i] = pos(el), type = g[d][i];
        el.classList.toggle("on", !!type);
        el.classList.remove("pend", "anchor");
        el.style.setProperty("--type", type ? (TYPE_COLOR[type] || "var(--accent)") : "");
        el.title = type ? t("st." + type) : "";
      });
      host.querySelector("[data-avg-sum]").innerHTML = summary(toSlots(g));
    };
    const apply = (a, b, mode) => {
      const g = toCells(reg.get());
      const [d0, d1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [i0, i1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (let d = d0; d <= d1; d++) for (let i = i0; i <= i1; i++) g[d][i] = mode === "erase" ? null : reg.brush;
      reg.set(toSlots(g));
      paint(g);
    };
    const preview = (a, b) => {
      const [d0, d1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [i0, i1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      host.querySelectorAll(".avg-c").forEach(el => { const [d, i] = pos(el); el.classList.toggle("pend", d >= d0 && d <= d1 && i >= i0 && i <= i1); });
    };
    const modeFor = (p) => (toCells(reg.get())[p[0]][p[1]] === reg.brush ? "erase" : "paint");

    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-avg-brush]"); if (!b) return;
      reg.brush = b.dataset.avgBrush;
      host.querySelectorAll("[data-avg-brush]").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); });
    });
    /* Souris / stylet : glisser. */
    host.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".avg-c"); if (!el || e.pointerType === "touch") return;
      e.preventDefault();
      const p = pos(el); drag = { from: p, to: p, mode: modeFor(p) };
      preview(p, p);
    });
    host.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const el = cellAt(e.clientX, e.clientY); if (!el || !host.contains(el)) return;
      drag.to = pos(el); preview(drag.from, drag.to);
    });
    const end = () => { if (!drag) return; const d = drag; drag = null; apply(d.from, d.to, d.mode); };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointerleave", end);
    /* Doigt : toucher le début, puis la fin (même jour). Toucher deux fois la même case la bascule seule. */
    host.addEventListener("click", (e) => {
      const el = e.target.closest(".avg-c"); if (!el || !(e.pointerType === "touch" || host._touch)) return;
      const p = pos(el);
      if (anchor && anchor.p[0] === p[0] && anchor.p[1] !== p[1]){ apply(anchor.p, p, anchor.mode); anchor = null; return; }
      if (anchor && anchor.p[0] === p[0] && anchor.p[1] === p[1]){ apply(p, p, anchor.mode); anchor = null; return; }
      anchor = { p, mode: modeFor(p) };
      host.querySelectorAll(".avg-c.anchor").forEach(x => x.classList.remove("anchor"));
      el.classList.add("anchor");
    });
    host.addEventListener("touchstart", () => { host._touch = true; }, { passive: true });
  });
}

export { availGrid, bindAvailGrids };
