/* ALTARIS™ — lexique : les termes techniques expliqués simplement
   © 2026 ALTARIS™. All rights reserved.

   info("acwr") pose un petit « ? » à côté d'un terme ; un clic ouvre une
   fiche courte par-dessus l'écran (ou la fenêtre) en cours, sans la fermer. */
import { esc } from "../core.js";
import { t } from "../i18n/index.js";

/** Termes du lexique, dans l'ordre d'affichage. Textes : lx.<terme>.t / .d / .ex */
const TERMS = ["rpe", "load", "acwr", "monotony", "strain", "maxhang", "weightedPull", "phases", "deload", "antagonist", "onsight"];

function info(term){
  return '<button type="button" class="gl-i" data-act="term" data-v="' + esc(term) + '" aria-label="' +
    esc(t("lx.what", { term: t("lx." + term + ".t") })) + '">?</button>';
}

function card(term){
  return '<div class="gl-term"><b>' + esc(t("lx." + term + ".t")) + '</b>' +
    '<p>' + esc(t("lx." + term + ".d")) + '</p>' +
    '<p class="gl-ex">' + esc(t("lx." + term + ".ex")) + '</p></div>';
}

function closeTerm(){
  const el = document.getElementById("gl-pop");
  if (el) el.remove();
  document.removeEventListener("keydown", onKey, true);
}
function onKey(e){ if (e.key === "Escape"){ e.stopPropagation(); closeTerm(); } }

/** Ouvre la fiche d'un terme, ou tout le lexique si term est vide. */
function openTerm(term){
  closeTerm();
  const list = term && TERMS.includes(term) ? [term] : TERMS;
  const el = document.createElement("div");
  el.id = "gl-pop"; el.className = "gl-pop";
  el.innerHTML = '<div class="gl-card" role="dialog" aria-modal="true" aria-label="' + esc(t("lx.title")) + '">' +
    '<div class="gl-head"><span class="eyebrow acc">' + esc(t("lx.title")) + '</span>' +
      '<button type="button" class="btn sm ghost" data-gl-close>' + esc(t("g.close")) + '</button></div>' +
    '<div class="gl-body">' + list.map(card).join("") + '</div>' +
    (list.length === 1 ? '<button type="button" class="link small" data-gl-all>' + esc(t("lx.all")) + '</button>' : '') +
  '</div>';
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-gl-close]")) return closeTerm();
    if (e.target.closest("[data-gl-all]")) openTerm("");
  });
  document.body.appendChild(el);
  document.addEventListener("keydown", onKey, true);
  el.querySelector("[data-gl-close]").focus();
}

export { TERMS, info, openTerm };
