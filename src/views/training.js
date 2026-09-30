/* ALTARIS™ — entraînement : charges, repères de niveau, objectif daté, re-test,
   matériel, modèles de séance et séance libre
   © 2026 ALTARIS™. All rights reserved.

   Des panneaux réutilisés par « Aujourd'hui », « Progrès », les tests, le
   profil et la fiche athlète du coach, et les fenêtres qui vont avec. */
import { $, $$, esc, today, uid } from "../core.js";
import { Session, Store, audit, can, config } from "../data.js";
import { benchmarks, climberGrade, compareAssessments } from "../domain/benchmarks.js";
import { EXERCISES, exById, exName } from "../domain/exercises.js";
import { EDGES, GEAR, hasGear } from "../domain/gear.js";
import { exerciseHistory, fmtLoad, loggedExercises, suggestNext } from "../domain/loads.js";
import { goalOf } from "../domain/periodization.js";
import { adaptation } from "../domain/adapt.js";
import { retestStatus } from "../domain/progress.js";
import { TESTS, assessmentsOf } from "../domain/scoring.js";
import { buildWarmup } from "../domain/warmup.js";
import { LANG, fmtDate, fmtNum, t } from "../i18n/index.js";
import { sportLabel } from "../domain/grades.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sessionsOf } from "./climber.js";

const PHASE_COLOR = { base: "var(--s4)", strength: "var(--s3)", power: "var(--s6)", taper: "var(--s5)" };

/* ---------- petit graphique en ligne (charges) ---------- */
function lineMini(values, w, h){
  const W = w || 120, H = h || 34, vs = values.filter(v => v != null);
  if (vs.length < 2) return '<svg width="' + W + '" height="' + H + '" aria-hidden="true"></svg>';
  const min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const pts = values.map((v, i) => [4 + (W - 8) * i / (values.length - 1), H - 4 - (H - 8) * ((v - min) / span)]);
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" class="lg-line">' +
    '<polyline points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(" ") + '"/>' +
    pts.map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === pts.length - 1 ? 3 : 2) + '"/>').join("") + '</svg>';
}

/* ---------- 2. charges par exercice ---------- */
function loadsPanel(u, self){
  const all = sessionsOf(u.id), ids = loggedExercises(all).slice(0, 8);
  if (!ids.length) return self ? '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("ld.title2")) + '</span>' +
    '<p class="small muted">' + esc(t("ld.emptyD")) + '</p></div>' : '';
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t(self ? "ld.title2" : "ld.titleCoach")) + '</span>' +
      '<span class="small muted">' + esc(t("ld.titleD")) + '</span></div>' +
    '<div class="rows">' + ids.map(id => {
      const e = exById(id), h = exerciseHistory(all, id), last = h[h.length - 1];
      const sug = suggestNext(h, e && e.cat === "doigts" ? 2 : 2.5);
      return '<div class="rw lg-row"><span class="gr"><span class="t1">' + esc(e ? exName(e) : id) + '</span>' +
          '<span class="t2">' + esc(fmtDate(last.date, { day: "numeric", month: "short" })) + (last.edge ? ' · ' + last.edge + ' mm' : '') +
            (last.rpe ? ' · RPE ' + fmtNum(last.rpe, 1) : '') + ' · ' + esc(t("ld.sessionsN", { n: h.length })) + '</span></span>' +
        lineMini(h.map(x => x.top)) +
        '<span class="lg-v">' + esc(fmtLoad(last.top, t("hg.bw"))) + '</span>' +
        (sug ? '<span class="chip ' + (sug.why === "up" ? "good" : sug.why === "down" ? "warn" : "") + '">→ ' + esc(fmtLoad(sug.load, t("hg.bw"))) + '</span>' : '') +
      '</div>';
    }).join("") + '</div></div>';
}

/** Journal d'une séance faite (fiche séance). */
function sessionLog(s){
  const log = s.log || {}, ids = Object.keys(log);
  if (!ids.length) return "";
  return '<div class="stack sm"><span class="eyebrow">' + esc(t("ld.journal")) + '</span><div class="rows">' + ids.map(id => {
    const e = exById(id);
    return '<div class="rw"><span class="gr"><span class="t1">' + esc(e ? exName(e) : id) + '</span>' +
      '<span class="t2">' + log[id].map((x, i) => (i + 1) + '. ' + [x.load != null ? fmtLoad(x.load, t("hg.bw")) : "", x.edge ? x.edge + " mm" : "",
        x.reps != null ? t("ld.reps", { n: x.reps }) : "", x.rpe ? "RPE " + fmtNum(x.rpe, 1) : "", x.failed ? t("ld.e.max") : ""].filter(Boolean).join(" · ")).map(esc).join("<br>") +
      '</span></span></div>';
  }).join("") + '</div></div>';
}

/* ---------- 3. repères de niveau ---------- */
function benchPanel(u, la){
  const b = benchmarks(la, u.profile);
  if (!b.length) return "";
  const grade = climberGrade(u.profile);
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("bm.title")) + '</span>' +
      (grade ? '<span class="chip">' + esc(t("bm.grade", { g: sportLabel(grade, LANG === "en") })) + '</span>' : '') + '</div>' +
    '<div class="rows">' + b.map(x =>
      '<div class="rw"><span class="stripe ' + (x.verdict === "weak" ? "crit" : x.verdict === "asset" ? "good" : "") + ' gr">' +
        '<span class="t1">' + esc(t("d." + x.domain)) + ' ≈ <b>' + esc((x.below ? "< " : "") + sportLabel(x.grade, LANG === "en")) + '</b></span>' +
        '<span class="t2">' + esc(fmtNum(x.value, 0)) + ' ' + esc(x.unit) + (x.verdict ? ' · ' + esc(t("bm.v." + x.verdict)) : '') + '</span></span>' +
        (x.verdict === "weak" ? '<span class="chip crit">' + esc(t("bm.focus")) + '</span>' : x.verdict === "asset" ? '<span class="chip good">' + esc(t("bm.asset")) + '</span>' : '') +
      '</div>').join("") + '</div>' +
    '<p class="dim tiny">' + esc(t("bm.disclaimer")) + '</p></div>';
}

/* ---------- 4. objectif daté ---------- */
function phaseBar(g){
  const total = g.phases.reduce((n, p) => n + days(p) , 0) || 1;
  const d0 = today(), from = g.phases[0].from;
  const pos = Math.min(100, Math.max(0, 100 * dd(d0, from) / total));
  return '<div class="gl-bar" role="img" aria-label="' + esc(g.phases.map(p => t("ph." + p.phase)).join(", ")) + '">' + g.phases.map(p =>
      '<span style="flex:' + days(p) + ';background:' + PHASE_COLOR[p.phase] + '" title="' + esc(t("ph." + p.phase) + " · " + fmtDate(p.from) + " → " + fmtDate(p.to)) + '">' +
        '<em>' + esc(t("ph." + p.phase)) + '</em></span>').join("") +
    '<i style="left:' + pos.toFixed(1) + '%"></i></div>';
}
const dd = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const days = (p) => dd(p.to, p.from) + 1;

function goalCard(u, self){
  const g = goalOf(u.profile);
  if (!g) return self ? '<div class="panel pad gl-empty"><div><span class="eyebrow">' + esc(t("gl.title")) + '</span>' +
      '<p class="small muted">' + esc(t("gl.emptyD")) + '</p></div>' +
      '<button class="btn sm" data-act="goal-edit">' + ic("target") + esc(t("gl.set")) + '</button></div>' : '';
  return '<div class="panel pad stack sm gl"><div class="between"><span class="eyebrow">' + esc(t(self ? "gl.title" : "gl.titleCoach")) + '</span>' +
      (self ? '<button class="btn xs ghost" data-act="goal-edit">' + ic("edit") + esc(t("g.edit")) + '</button>' : '') + '</div>' +
    '<div class="gl-head"><div class="gl-days"><b>' + (g.days === 0 ? esc(t("g.today")) : 'J-' + g.days) + '</b></div>' +
      '<div><div class="gl-text">' + esc(g.text || t("gl.noText")) + '</div>' +
      '<div class="small muted">' + esc(fmtDate(g.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) +
        (g.phase ? ' · ' + esc(t("gl.phaseNow", { p: t("ph." + g.phase) })) : '') + '</div></div></div>' +
    (g.phases.length ? phaseBar(g) : '') +
    (g.phase ? '<p class="small muted">' + esc(t("ph." + g.phase + "D")) + '</p>' : '') +
  '</div>';
}

function goalModal(){
  const me = Session.live(), p = me.profile || {};
  Modal.open({
    title: t("gl.title"),
    body: '<div class="stack">' +
      '<p class="small muted">' + esc(t("gl.modalD")) + '</p>' +
      '<label class="f"><span class="lb">' + esc(t("gl.what")) + '</span>' +
        '<input class="inp" id="gl-text" value="' + esc(p.goalText || "") + '" placeholder="' + esc(t("gl.whatPh")) + '"></label>' +
      '<label class="f" style="max-width:230px"><span class="lb">' + esc(t("on.goalDate")) + '</span>' +
        '<input class="inp num" type="date" id="gl-date" min="' + today() + '" value="' + esc(p.goalDate || "") + '"></label>' +
    '</div>',
    footer: (p.goalDate ? '<button class="btn ghost" id="gl-clear">' + esc(t("gl.clear")) + '</button>' : '') +
      '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="gl-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const save = async (text, date) => {
        const cur = Session.live(), np = Object.assign({}, cur.profile || {}, { goalText: text, goalDate: date || "" });
        /* La préparation part du jour où l'échéance est fixée : les phases ne glissent pas ensuite. */
        np.goalFrom = date ? (date === (cur.profile || {}).goalDate && (cur.profile || {}).goalFrom ? cur.profile.goalFrom : today()) : "";
        await Store.put("users", cur.id, Object.assign({}, cur, { profile: np }));
        audit("goal_updated", date || "-");
        Modal.close(); toast(t("g.saved"), "good");
      };
      const clr = $("#gl-clear", root); if (clr) clr.onclick = () => save("", "");
      $("#gl-ok", root).onclick = () => {
        const date = $("#gl-date", root).value;
        if (date && date < today()) return toast(t("gl.past"), "crit");
        save($("#gl-text", root).value.trim(), date);
      };
    }
  });
}

/* ---------- 5. re-test ---------- */
function retestCard(u){
  const rs = retestStatus(assessmentsOf(u.id), config().retestDays);
  if (!rs.due) return "";
  return '<div class="panel in-list"><div class="in-row acc"><span class="in-ic">' + ic("test") + '</span>' +
    '<span class="in-main"><span class="in-who">' + esc(t(rs.first ? "rt.firstT" : "rt.dueT")) + '</span>' +
    '<span class="in-what">' + esc(rs.first ? t("rt.firstD") : t("rt.dueD", { n: Math.round(rs.days / 7) })) + '</span></span>' +
    '<button class="btn sm pri" data-act="tab" data-v="tests">' + esc(t("rt.go")) + '</button></div></div>';
}

/** Avant / après : le dernier bilan complet face au précédent, test par test. */
function comparePanel(u){
  const list = assessmentsOf(u.id).filter(a => a.status === "complete");
  if (list.length < 2) return "";
  const last = list[0], prev = list[1], rows = compareAssessments(prev, last);
  if (!rows.length) return "";
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("rt.compare")) + '</span>' +
      '<span class="small muted">' + esc(fmtDate(prev.date, { day: "numeric", month: "short", year: "numeric" })) + ' → ' +
        esc(fmtDate(last.date, { day: "numeric", month: "short", year: "numeric" })) + '</span></div>' +
    '<div class="rows">' + rows.map(r => {
      const up = r.delta > 0.0001, down = r.delta < -0.0001;
      return '<div class="rw"><span class="gr"><span class="t1">' + esc(t(TESTS[r.test].key + ".n")) + '</span>' +
        '<span class="t2">' + esc(fmtNum(r.from, r.dec)) + ' → ' + esc(fmtNum(r.to, r.dec)) + ' ' + esc(r.unit) +
          (r.scoreFrom != null && r.scoreTo != null ? ' · ' + esc(t("ts.score")) + ' ' + Math.round(r.scoreFrom) + ' → ' + Math.round(r.scoreTo) : '') + '</span></span>' +
        '<span class="chip ' + (up ? "good" : down ? "crit" : "") + '">' + (up ? "+" : "") + esc(fmtNum(r.delta, r.dec)) + '</span></div>';
    }).join("") + '</div></div>';
}

/* ---------- 6. matériel ---------- */
function gearSection(me){
  const g = (me.profile || {}).gear;
  return '<div class="panel pad stack sm"><div class="between"><span class="eyebrow">' + esc(t("gr.title")) + '</span>' +
      '<button class="btn sm noprint" data-act="gear-edit">' + ic("edit") + esc(t("g.edit")) + '</button></div>' +
    (hasGear(g)
      ? '<div class="row tight">' + (g.items.length ? g.items.map(k => '<span class="chip">' + esc(t("gr." + k)) + '</span>').join("") : '<span class="dim tiny">' + esc(t("gr.nothing")) + '</span>') + '</div>' +
        ((g.edges || []).length ? '<p class="small muted">' + esc(t("gr.edges")) + ' : ' + g.edges.map(n => n + " mm").join(", ") + '</p>' : '')
      : '<p class="small muted">' + esc(t("gr.emptyD")) + '</p>') +
  '</div>';
}

function gearModal(){
  const me = Session.live(), g = (me.profile || {}).gear || {};
  const items = new Set(g.items || []), edges = new Set(g.edges || []);
  const chips = () => '<div class="stack sm"><span class="eyebrow">' + esc(t("gr.items")) + '</span><div class="row tight">' + GEAR.map(k =>
      '<button class="filt' + (items.has(k) ? ' on' : '') + '" data-gi="' + k + '">' + esc(t("gr." + k)) + '</button>').join("") + '</div></div>' +
    '<div class="stack sm"><span class="eyebrow">' + esc(t("gr.edges")) + '</span><div class="row tight">' + EDGES.map(n =>
      '<button class="filt' + (edges.has(n) ? ' on' : '') + '" data-ge="' + n + '">' + n + ' mm</button>').join("") + '</div>' +
      '<span class="dim tiny">' + esc(t("gr.edgesD")) + '</span></div>';
  Modal.open({
    title: t("gr.title"), wide: true,
    body: '<div class="stack"><p class="small muted">' + esc(t("gr.modalD")) + '</p><div class="stack" id="gr-body">' + chips() + '</div></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="gr-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      const bind = () => {
        $$("[data-gi]", root).forEach(b => b.onclick = () => { const k = b.dataset.gi; items.has(k) ? items.delete(k) : items.add(k); redraw(); });
        $$("[data-ge]", root).forEach(b => b.onclick = () => { const n = Number(b.dataset.ge); edges.has(n) ? edges.delete(n) : edges.add(n); redraw(); });
      };
      const redraw = () => { $("#gr-body", root).innerHTML = chips(); bind(); };
      bind();
      $("[data-c]", root).onclick = () => Modal.close();
      $("#gr-ok", root).onclick = async () => {
        const cur = Session.live();
        const gear = { items: GEAR.filter(k => items.has(k)), edges: [...edges].sort((a, b) => a - b) };
        await Store.put("users", cur.id, Object.assign({}, cur, { profile: Object.assign({}, cur.profile || {}, { gear }) }));
        audit("gear_updated", gear.items.join(","));
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

/* ---------- 7. modèles de séance et séance libre ---------- */
function myTemplates(me){
  return Store.list("routines").filter(r => (r.userId || r.coachId) === me.id).sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Enregistrer une séance comme modèle réutilisable. */
async function saveTemplate(sessionId){
  const s = Store.get("sessions", sessionId), me = Session.live(); if (!s || !me) return;
  const id = uid("r");
  const ok = await Store.put("routines", id, { id, coachId: me.id, userId: me.id, name: s.title, type: s.type,
    durationMin: s.plannedMin || 0, exerciseIds: (s.exercises || []).slice(), notes: s.notes || "" });
  if (ok){ audit("routine_created", s.title); toast(t("tp.saved"), "good"); }
}

/**
 * Séance du jour hors programme (modèle, échauffement express) : créée
 * maintenant, lancée tout de suite, effacée si on la quitte sans la finir.
 */
async function startAdhoc(fields){
  const me = Session.live(), id = uid("s"), now = new Date();
  const s = Object.assign({ id, userId: me.id, date: today(), time: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"),
    status: "planned", targetIntensity: 5, notes: "", adhoc: true }, fields);
  if (!(await Store.put("sessions", id, s))) return null;
  return id;
}

function freeSessionModal(onStart){
  const me = Session.live(), list = myTemplates(me);
  const warm = buildWarmup({ type: "boulder", exercises: [] }, EXERCISES, (me.profile || {}).gear, Date.now() % 7);
  Modal.open({
    title: t("fs.title"), wide: true,
    body: '<div class="stack">' +
      '<div class="fs-grid">' +
        '<button class="fs-card" data-fs="hang">' + ic("timer") + '<b>' + esc(t("hg.title")) + '</b><span>' + esc(t("fs.hangD")) + '</span></button>' +
        (warm.length ? '<button class="fs-card" data-fs="warm">' + ic("sun") + '<b>' + esc(t("wu.title")) + '</b><span>' + esc(t("fs.warmD", { n: warm.length })) + '</span></button>' : '') +
      '</div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("tp.title")) + '</span>' +
        (list.length ? '<div class="rows">' + list.map(r =>
          '<div class="rw"><span class="gr"><span class="t1">' + esc(r.name) + '</span>' +
            '<span class="t2">' + esc(t("st." + (r.type || "strength"))) + ' · ' + (r.durationMin || 0) + ' ' + esc(t("g.min")) + ' · ' +
              esc(t("td.exercises", { n: (r.exerciseIds || []).length })) + '</span></span>' +
            '<button class="btn icon xs ghost" data-tdel="' + esc(r.id) + '" aria-label="' + esc(t("g.delete")) + '">' + ic("trash") + '</button>' +
            '<button class="btn sm pri" data-tgo="' + esc(r.id) + '">' + ic("play") + esc(t("td.start")) + '</button></div>').join("") + '</div>'
          : '<p class="small muted">' + esc(t("tp.emptyD")) + '</p>') +
      '</div></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("[data-fs=hang]", root).onclick = () => { Modal.close(); onStart({ hang: true }); };
      const w = $("[data-fs=warm]", root);
      if (w) w.onclick = async () => {
        const id = await startAdhoc({ title: t("wu.title"), type: "mobility", plannedMin: 12, targetIntensity: 3, exercises: warm });
        Modal.close(); if (id) onStart({ sessionId: id });
      };
      $$("[data-tgo]", root).forEach(b => b.onclick = async () => {
        const r = Store.get("routines", b.dataset.tgo); if (!r) return;
        const id = await startAdhoc({ title: r.name, type: r.type || "strength", plannedMin: r.durationMin || 60,
          exercises: (r.exerciseIds || []).slice(), notes: r.notes || "", template: r.id });
        Modal.close(); if (id) onStart({ sessionId: id });
      });
      $$("[data-tdel]", root).forEach(b => b.onclick = async () => {
        if (!confirm(t("tp.delConfirm"))) return;
        await Store.del("routines", b.dataset.tdel); audit("routine_deleted", b.dataset.tdel);
        Modal.close(); freeSessionModal(onStart);
      });
    }
  });
}

/* ---------- plan qui s'adapte ---------- */
/** Ajuste la prochaine séance si les signaux le justifient ; renvoie la séance ajustée ou null. */
async function autoAdapt(userId){
  const u = Store.get("users", userId); if (!u || u.role !== "climber") return null;
  const a = adaptation({ sessions: sessionsOf(userId), pains: Store.list("pain").filter(p => p.userId === userId),
    day: today(), painAlert: config().painAlert });
  if (!a) return null;
  const s = Store.get("sessions", a.sessionId);
  const next = Object.assign({}, s, a.patch);
  if (!await Store.put("sessions", s.id, next)) return null;
  audit("session_adapted", s.id + " " + a.reason);
  return next;
}
/** Phrase qui explique l'ajustement au grimpeur. */
function adaptText(s){
  return t("ad2." + s.adapted.reason, { title: s.title, date: fmtDate(s.date, { weekday: "long", day: "numeric", month: "long" }),
    n: s.targetIntensity, min: s.plannedMin });
}
/** Encart de la fiche séance : explication, et « annuler » pour l'encadrant. */
function adaptNotice(s, staff){
  if (!s.adapted || s.status !== "planned") return "";
  return '<div class="notice ' + (s.adapted.reason === "pain" ? "warn" : "acc") + '">' + ic("info") + '<span>' + esc(adaptText(s)) +
    (staff ? ' <button class="link" data-adapt-undo>' + esc(t("ad2.undo")) + '</button>' : '') + '</span></div>';
}

/** Le grimpeur peut-il lancer une séance libre ? (formule) */
const canTrainFree = (me) => !!me && me.role === "climber" && can(me, "train");

export { adaptNotice, adaptText, autoAdapt, benchPanel, canTrainFree, comparePanel, freeSessionModal, gearModal, gearSection, goalCard, goalModal, lineMini, loadsPanel,
         myTemplates, retestCard, saveTemplate, sessionLog, startAdhoc };
