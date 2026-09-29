/* ALTARIS™ — carnet de croix : écran et saisie
   © 2026 ALTARIS™. All rights reserved.

   Dans « Progrès » (et la fiche athlète du coach) : pyramide des 12 derniers
   mois, meilleure cotation mois par mois, dernières croix et projets en cours.
   Les cotations suivent la langue de l'appli (enregistrées en notation française). */
import { $, $$, addDays, esc, today, uid } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { boulderLabel, boulderOptions, sportLabel, sportOptions } from "../domain/grades.js";
import { KINDS, STYLES, bestByMonth, logStats, pyramid, scale } from "../domain/logbook.js";
import { LANG, fmtDate, t } from "../i18n/index.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";

const EN = () => LANG === "en";
const gradeTxt = (kind, g) => (kind === "boulder" ? boulderLabel(g, EN()) : sportLabel(g, EN()));
function ascentsOf(userId){ return Store.list("ascents").filter(a => a.userId === userId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0))); }

function pyramidHtml(rows, kind){
  if (!rows.length) return '<p class="small muted">' + esc(t("lb.noneKind." + kind)) + '</p>';
  const max = Math.max(...rows.map(r => r.n), 1);
  return '<div class="lb-pyr">' + rows.map(r =>
    '<div class="lb-pr"><span class="lb-g">' + esc(gradeTxt(kind, r.grade)) + '</span>' +
      '<span class="lb-bar" style="width:' + Math.max(r.n ? 8 : 0, Math.round(100 * r.n / max)) + '%">' +
        (r.onsight ? '<i class="os" style="flex:' + r.onsight + '"></i>' : '') +
        (r.flash ? '<i class="fl" style="flex:' + r.flash + '"></i>' : '') +
        (r.redpoint ? '<i class="rp" style="flex:' + r.redpoint + '"></i>' : '') + '</span>' +
      '<span class="lb-n">' + r.n + '</span></div>').join("") + '</div>';
}

function monthsHtml(ascents, kind){
  const rows = bestByMonth(ascents, kind, 12);
  const idx = rows.filter(r => r.idx != null).map(r => r.idx);
  if (!idx.length) return "";
  const lo = Math.min(...idx) - 1, hi = Math.max(...idx);
  return '<div class="lb-months" aria-label="' + esc(t("lb.byMonth")) + '">' + rows.map(r =>
    '<span class="lb-m" title="' + esc(r.month + (r.grade ? " · " + gradeTxt(kind, r.grade) : "")) + '">' +
      (r.idx != null ? '<i style="height:' + Math.round(100 * (r.idx - lo) / Math.max(1, hi - lo)) + '%"><b>' + esc(gradeTxt(kind, r.grade)) + '</b></i>' : '') +
      '<em>' + esc(new Date(r.month + "-15").toLocaleDateString(EN() ? "en-US" : "fr-FR", { month: "narrow" })) + '</em></span>').join("") + '</div>';
}

/** Panneau « Carnet de croix ». self : le grimpeur lui-même (boutons d'ajout). */
function logbookPanel(u, self){
  const all = ascentsOf(u.id);
  if (!self && !all.length) return "";
  const since = addDays(today(), -365), st = logStats(all);
  const projects = all.filter(a => a.style === "project");
  const recent = all.filter(a => a.style !== "project").slice(0, 5);
  return '<div class="panel pad stack sm lb"><div class="between"><span class="eyebrow">' + esc(t("lb.title")) + '</span>' +
      (self ? '<button class="btn sm pri" data-act="ascent-new">' + ic("plus") + esc(t("lb.add")) + '</button>' : '') + '</div>' +
    (all.length ? (
      '<div class="lb-stats">' +
        '<div><b>' + st.sends + '</b><span>' + esc(t("lb.sends12")) + '</span></div>' +
        '<div><b>' + esc(st.bestRoute ? gradeTxt("route", st.bestRoute) : "—") + '</b><span>' + esc(t("lb.bestRoute")) + '</span></div>' +
        '<div><b>' + esc(st.bestBoulder ? gradeTxt("boulder", st.bestBoulder) : "—") + '</b><span>' + esc(t("lb.bestBoulder")) + '</span></div>' +
        '<div><b>' + st.flashes + '</b><span>' + esc(t("lb.flashes")) + '</span></div>' +
      '</div>' +
      '<div class="grid g2">' + KINDS.map(k =>
        '<div class="stack sm"><span class="small muted">' + esc(t("lb.pyr." + k)) + '</span>' + pyramidHtml(pyramid(all, k, since, 5), k) + monthsHtml(all, k) + '</div>').join("") + '</div>' +
      '<div class="lb-key small muted"><i class="os"></i>' + esc(t("lb.s.onsight")) + '<i class="fl"></i>' + esc(t("lb.s.flash")) + '<i class="rp"></i>' + esc(t("lb.s.redpoint")) + '</div>' +
      (projects.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("lb.projects")) + '</span><div class="rows">' + projects.map(a => row(a, self)).join("") + '</div></div>' : '') +
      (recent.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("lb.recent")) + '</span><div class="rows">' + recent.map(a => row(a, self)).join("") + '</div></div>' : '')
    ) : '<p class="small muted">' + esc(t("lb.emptyD")) + '</p>') +
  '</div>';
}
function row(a, self){
  const inner = '<span class="lb-grade ' + a.kind + '">' + esc(gradeTxt(a.kind, a.grade)) + '</span>' +
    '<span class="gr"><span class="t1">' + esc(a.name || t("lb.kind." + a.kind)) + '</span>' +
    '<span class="t2">' + esc([fmtDate(a.date, { day: "numeric", month: "short", year: "numeric" }), a.place, t("lb.s." + a.style),
      a.tries ? t("lb.triesN", { n: a.tries }) : ""].filter(Boolean).join(" · ")) + '</span></span>';
  return self ? '<button class="rw" data-act="ascent-edit" data-v="' + esc(a.id) + '">' + inner + ic("chevR", "chev") + '</button>'
              : '<div class="rw">' + inner + '</div>';
}

/** Ajouter ou modifier une croix. */
function ascentModal(id){
  const me = Session.live(), a = id ? Store.get("ascents", id) : null;
  const last = ascentsOf(me.id)[0];
  const d = Object.assign({ kind: (last && last.kind) || "boulder", style: "redpoint", date: today(), grade: "", name: "", place: (last && last.place) || "", tries: "", notes: "" }, a || {});
  const gradeSelect = (kind) => '<select class="inp" id="as-grade">' +
    (kind === "boulder" ? boulderOptions(EN(), d.grade) : sportOptions(EN())).map(([v, l]) =>
      '<option value="' + esc(v) + '"' + (v === d.grade ? " selected" : "") + '>' + esc(l) + '</option>').join("") + '</select>';
  if (!d.grade){
    const p = me.profile || {};
    d.grade = d.kind === "boulder" ? (p.gradeBoulder || "6A") : (p.gradeSport || "6a");
  }
  Modal.open({
    title: t(a ? "lb.edit" : "lb.add"),
    body: '<div class="stack">' +
      '<div class="seg" id="as-kind">' + KINDS.map(k => '<button type="button" data-k="' + k + '" class="' + (d.kind === k ? "on" : "") + '">' + esc(t("lb.kind." + k)) + '</button>').join("") + '</div>' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("lb.grade")) + '</span><span id="as-gw">' + gradeSelect(d.kind) + '</span></label>' +
        '<label class="f"><span class="lb">' + esc(t("g.date")) + '</span><input class="inp num" type="date" id="as-date" max="' + today() + '" value="' + esc(d.date) + '"></label>' +
        '<label class="f"><span class="lb">' + esc(t("lb.name")) + '</span><input class="inp" id="as-name" maxlength="80" value="' + esc(d.name) + '" placeholder="' + esc(t("lb.namePh")) + '"></label>' +
        '<label class="f"><span class="lb">' + esc(t("lb.place")) + '</span><input class="inp" id="as-place" maxlength="80" value="' + esc(d.place) + '" placeholder="' + esc(t("lb.placePh")) + '"></label>' +
      '</div>' +
      '<div class="stack sm"><span class="lb small">' + esc(t("lb.style")) + '</span><div class="row tight" id="as-style">' + STYLES.map(s =>
        '<button type="button" class="filt' + (d.style === s ? ' on' : '') + '" data-s="' + s + '">' + esc(t("lb.s." + s)) + '</button>').join("") + '</div></div>' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("lb.tries")) + '</span><input class="inp num" type="number" id="as-tries" min="1" max="999" value="' + esc(d.tries) + '"></label>' +
        '<label class="f"><span class="lb">' + esc(t("lb.notes")) + '</span><input class="inp" id="as-notes" maxlength="300" value="' + esc(d.notes) + '"></label>' +
      '</div></div>',
    footer: (a ? '<button class="btn danger" id="as-del">' + ic("trash") + '</button>' : '') +
      '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="as-ok">' + ic("check") + esc(t("g.save")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("#as-kind [data-k]", root).forEach(b => b.onclick = () => {
        d.grade = $("#as-grade", root).value;
        const idx = scale(d.kind).indexOf(d.grade);
        d.kind = b.dataset.k;
        /* Même rang de difficulté à peu près : 7a en voie ≈ 6C en bloc. */
        const sc = scale(d.kind);
        d.grade = sc[Math.max(0, Math.min(sc.length - 1, idx + (d.kind === "boulder" ? -3 : 3)))];
        $$("#as-kind [data-k]", root).forEach(x => x.classList.toggle("on", x === b));
        $("#as-gw", root).innerHTML = gradeSelect(d.kind);
      });
      $$("#as-style [data-s]", root).forEach(b => b.onclick = () => {
        d.style = b.dataset.s; $$("#as-style [data-s]", root).forEach(x => x.classList.toggle("on", x === b));
        if (d.style === "onsight" || d.style === "flash") $("#as-tries", root).value = 1;
      });
      const del = $("#as-del", root);
      if (del) del.onclick = async () => { if (!confirm(t("lb.delConfirm"))) return; await Store.del("ascents", a.id); audit("ascent_deleted", a.id); Modal.close(); };
      $("#as-ok", root).onclick = async () => {
        const nid = a ? a.id : uid("as");
        const tries = Number($("#as-tries", root).value) || null;
        const doc = Object.assign({}, a || {}, { id: nid, userId: me.id, kind: d.kind, grade: $("#as-grade", root).value,
          date: $("#as-date", root).value || today(), name: $("#as-name", root).value.trim(), place: $("#as-place", root).value.trim(),
          style: d.style, tries, notes: $("#as-notes", root).value.trim(), createdAt: (a && a.createdAt) || Date.now() });
        if (!await Store.put("ascents", nid, doc)) return;
        audit(a ? "ascent_updated" : "ascent_added", doc.grade);
        Modal.close();
        toast(t(doc.style === "project" ? "lb.savedProject" : "lb.saved"), "good");
      };
    }
  });
}

export { ascentModal, ascentsOf, logbookPanel };
