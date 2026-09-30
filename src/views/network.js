/* ALTARIS™ — mise en réseau : ma région, mes langues, l'annuaire
   © 2026 ALTARIS™. All rights reserved.

   La région est choisie dans une liste (pas de géolocalisation). L'annuaire
   est facultatif et réciproque : on y voit les autres seulement si l'on y
   figure. Il montre un prénom, un rôle, une région, des langues — rien d'autre. */
import { $, $$, esc } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { LANGUAGES, REGIONS, REGION_OTHER, cleanLanguages, directoryFor, languageName } from "../domain/network.js";
import { LOC, t } from "../i18n/index.js";
import { render } from "../main.js";
import { Remote } from "../remote.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { View, initials } from "./shell.js";

const regionLabel = (r) => !r ? "—" : r === REGION_OTHER ? t("nw.other") : r;
const langList = (codes) => cleanLanguages(codes).map(c => languageName(c, LOC())).join(", ");

/** « Occitanie · Français, Anglais » : pour la fiche d'un coach ou d'un grimpeur. */
function whereLine(u){
  if (!u) return "";
  return [u.region ? regionLabel(u.region) : "", langList(u.languages)].filter(Boolean).join(" · ");
}

/** Personnes de l'annuaire : lues une fois par session (mode Supabase), comptes locaux sinon. */
function people(me){
  if (!Remote.client) return Store.list("users").filter(u => u.directoryOptin && u.status !== "suspended");
  if (View.directory === undefined){
    View.directory = null;
    Remote.directory().then(list => { View.directory = list; render(); }).catch(() => { View.directory = []; render(); });
  }
  return View.directory || [];
}

function networkSection(me){
  /* Migration pas encore appliquée : la section reste masquée plutôt que d'échouer à l'enregistrement. */
  if (Remote.client && !Remote.networkReady) return "";
  const list = me.directoryOptin ? directoryFor(me, people(me)) : [];
  const near = list.filter(p => p.sameRegion);
  const shown = (near.length ? near : list).slice(0, 12);
  const langs = langList(me.languages);
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("nw.title")) + '</span>' +
      '<button class="btn sm noprint" data-act="network-edit">' + ic("edit") + esc(t("g.edit")) + '</button></div>' +
    '<div class="rows">' +
      '<div class="rw"><span class="gr"><span class="t2 nw-k">' + esc(t("nw.region")) + '</span></span><span class="v">' + esc(regionLabel(me.region)) + '</span></div>' +
      '<div class="rw"><span class="gr"><span class="t2 nw-k">' + esc(t("nw.languages")) + '</span></span><span class="v">' + esc(langs || "—") + '</span></div>' +
    '</div>' +
    (me.directoryOptin
      ? '<span class="eyebrow">' + esc(near.length ? t("nw.near", { region: regionLabel(me.region) }) : t("nw.members")) + '</span>' +
        (shown.length ? '<div class="nw-list">' + shown.map(p =>
          '<div class="nw-p"><span class="avatar sm">' + esc(initials(p.name)) + '</span>' +
            '<span class="nw-main"><b>' + esc(p.name) + '</b><span>' + esc(t("role." + p.role)) + ' · ' + esc(regionLabel(p.region)) +
              (p.languages && p.languages.length ? ' · ' + esc(langList(p.languages)) : '') + '</span></span>' +
            (p.shared.length ? '<span class="chip acc" title="' + esc(t("nw.sharedLang")) + '">' + esc(p.shared.map(c => c.toUpperCase()).join(" ")) + '</span>' : '') +
          '</div>').join("") + '</div>'
          : '<p class="small muted">' + esc(View.directory === null ? t("g.loading") : t("nw.empty")) + '</p>')
      : '<p class="small muted">' + esc(t("nw.optinD")) + '</p>') +
  '</div>';
}

function networkModal(){
  const me = Session.live(); if (!me) return;
  const mine = new Set(me.languages || []);
  const known = !me.region || REGIONS.includes(me.region) || me.region === REGION_OTHER;
  Modal.open({
    title: t("nw.title"),
    body: '<div class="stack">' +
      '<label class="f"><span class="lb">' + esc(t("nw.region")) + '</span><select class="inp" id="nw-region">' +
        '<option value="">—</option>' +
        (known ? '' : '<option value="' + esc(me.region) + '" selected>' + esc(me.region) + '</option>') +
        REGIONS.map(r => '<option value="' + esc(r) + '"' + (me.region === r ? ' selected' : '') + '>' + esc(r) + '</option>').join("") +
        '<option value="' + REGION_OTHER + '"' + (me.region === REGION_OTHER ? ' selected' : '') + '>' + esc(t("nw.other")) + '</option>' +
      '</select><span class="hint">' + esc(t("nw.regionD")) + '</span></label>' +
      '<div class="f"><span class="lb">' + esc(t("nw.languages")) + '</span><div class="row tight" id="nw-langs">' +
        LANGUAGES.map(c => '<button type="button" class="filt' + (mine.has(c) ? ' on' : '') + '" data-lang="' + c + '" aria-pressed="' + mine.has(c) + '">' +
          esc(languageName(c, LOC())) + '</button>').join("") + '</div></div>' +
      '<label class="nw-opt"><input type="checkbox" id="nw-optin"' + (me.directoryOptin ? ' checked' : '') + '> <span><b>' + esc(t("nw.optin")) + '</b><br>' +
        '<span class="small muted">' + esc(t("nw.optinD")) + '</span></span></label>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="nw-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-lang]", root).forEach(b => b.onclick = () => { const on = !b.classList.contains("on"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      $("#nw-ok", root).onclick = async () => {
        const region = $("#nw-region", root).value || null;
        const optin = $("#nw-optin", root).checked;
        if (optin && !region) return toast(t("nw.needRegion"), "crit");
        const languages = cleanLanguages($$("[data-lang].on", root).map(b => b.dataset.lang));
        if (!await Store.put("users", me.id, Object.assign({}, me, { region, languages, directoryOptin: optin }))) return;
        View.directory = undefined;                 // relire l'annuaire avec le nouveau choix
        audit("network_updated", "");
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

export { networkModal, networkSection, regionLabel, whereLine };
