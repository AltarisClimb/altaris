import { $, $$, addDays, byId, esc } from "../core.js";
import { Access, Session, Store, audit, config } from "../data.js";
import { EXERCISES, EX_CATS, EX_LV_COLOR, EX_LV_LB, exById, exField, exName, exVideo, setExVideo } from "../domain/exercises.js";
import { fontLabel, trackFor } from "../domain/grades.js";
import { latestAssessment } from "../domain/scoring.js";
import { LI, fmtDate, fmtDateLong, fmtTime, t } from "../i18n/index.js";
import { body, render } from "../main.js";
import { Remote } from "../remote.js";
import { topo } from "../ui/brand.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { exercisePose, variantPose } from "../ui/poses.js";
import { painLabel } from "./climber.js";
import { View, isStaff } from "./shell.js";
/* ================================================================
   15. EXERCISE BANK
   ================================================================ */
function viewExercises(){
  const f = View.exFilter;
  const me = Session.live();
  const q = (f.q || "").toLowerCase();
  const list = EXERCISES.filter(e =>
    (f.cat === "all" || e.cat === f.cat) &&
    (f.lv === "all" || e.lv === f.lv) &&
    (!q || exName(e).toLowerCase().indexOf(q) >= 0 || exField(e, "m").toLowerCase().indexOf(q) >= 0 || exField(e, "d").toLowerCase().indexOf(q) >= 0));
  const counts = {}; EX_CATS.forEach(c => counts[c] = EXERCISES.filter(e => e.cat === c).length);
  const routines = Store.list("routines").filter(r => !me || me.role === "admin" || r.coachId === me.id);
  /* Nombre d'affectations visibles (grimpeur : 1 si l'exercice lui est assigné). */
  const nAssigned = (e) => e.uuid ? Remote.assignments.filter(a => a.exercise_id === e.uuid).length : 0;

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ex.title")) + '</span>' +
      '<h2>' + EXERCISES.length + ' ' + esc(t("ex.count")) + '</h2>' +
      '<p>' + esc(t("ex.videoNone")) + '</p></div>' +
      (isStaff(me) ? '<button class="btn sm pri noprint" data-act="routine-new">' + ic("plus") + esc(t("ex.newRoutine")) + '</button>' : '') + '</div>' +

    (isStaff(me) && routines.length ? '<div class="panel pad stack sm">' +
      '<span class="eyebrow">' + esc(t("ex.routines")) + '</span>' +
      '<div class="row tight">' + routines.map(r =>
        '<span class="chip acc">' + esc(r.name) + ' · ' + (r.exerciseIds||[]).length +
        '<button data-act="routine-del" data-v="' + esc(r.id) + '" aria-label="' + esc(t("g.delete")) + '">' + ic("x") + '</button></span>').join("") + '</div></div>' : '') +

    '<div class="stack sm noprint">' +
      '<div class="row tight">' +
        '<button class="filt' + (f.cat === "all" ? " on" : "") + '" data-act="ex-cat" data-v="all">' + esc(t("g.all")) +
          '<span class="n">' + EXERCISES.length + '</span></button>' +
        EX_CATS.map(c => '<button class="filt' + (f.cat === c ? " on" : "") + '" data-act="ex-cat" data-v="' + c + '">' +
          esc(t("ex.cat."+c)) + '<span class="n">' + counts[c] + '</span></button>').join("") +
      '</div>' +
      '<div class="row tight">' +
        '<span class="unit" style="flex:1 1 220px;max-width:340px">' +
          '<input class="inp" data-fk="exq" data-act-input="ex-q" placeholder="' + esc(t("g.search")) + '" value="' + esc(f.q||"") + '">' +
          '<span class="u">' + ic("search") + '</span></span>' +
        '<div class="seg sm">' +
          '<button data-act="ex-lv" data-v="all" class="' + (f.lv==="all"?"on":"") + '">' + esc(t("g.all")) + '</button>' +
          ["inter","adv"].map(k => '<button data-act="ex-lv" data-v="' + k + '" class="' + (f.lv===k?"on":"") + '">' + esc(EX_LV_LB[k][LI()]) + '</button>').join("") +
        '</div>' +
      '</div></div>' +

    (list.length ? '<div class="grid g2">' + list.map(e =>
      '<button class="excard" data-act="ex-open" data-v="' + esc(e.id) + '">' +
        (exercisePose(e.meta) ? '<span class="exfig">' + exercisePose(e.meta) + '</span>' : '') +
        '<span class="eh"><span class="lvdot" style="background:' + EX_LV_COLOR[e.lv] + '"></span>' +
          '<span class="en">' + esc(exName(e)) + '</span>' +
          (exVideo(e.id) ? '<span style="color:var(--accent);flex:none">' + ic("video") + '</span>' : '') + '</span>' +
        '<span class="ed">' + esc(exField(e, "d")) + '</span>' +
        '<span class="em"><span class="chip">' + esc(t("ex.cat."+e.cat)) + '</span>' +
          '<span class="chip">' + esc(EX_LV_LB[e.lv][LI()]) + '</span>' +
          (nAssigned(e) ? '<span class="chip acc">' + esc(me && me.role === "climber" ? t("ex.assignedMe") : t("ex.assignedN", { n: nAssigned(e) })) + '</span>' : '') +
        '</span>' +
      '</button>').join("") + '</div>'
      : (!EXERCISES.length && Remote.client && me && me.role === "climber")
      ? '<div class="panel"><div class="empty">' + ic("book") + '<div class="t">' + esc(t("ex.emptyClimber")) + '</div>' +
        '<div class="d">' + esc(t("ex.emptyClimberD")) + '</div></div></div>'
      : '<div class="panel"><div class="empty">' + ic("search") + '<div class="t">' + esc(t("ex.noResult")) + '</div>' +
        '<button class="btn sm" style="margin-top:12px" data-act="ex-reset">' + esc(t("g.reset")) + '</button></div></div>') +
  '</div>';
}

/** Coach/admin en mode Supabase : à qui cet exercice est assigné, et l'assigner à un de ses grimpeurs. */
function assignSection(e, me){
  if (!Remote.client || !isStaff(me) || !e.uuid) return "";
  const mine = Access.climbers();
  const assigned = Remote.assignments.filter(a => a.exercise_id === e.uuid);
  const taken = new Set(assigned.map(a => a.student_id));
  const free = mine.filter(c => !taken.has(c.id));
  const nameOf = (sid) => (Store.get("users", sid) || {}).name || "—";
  return '<div class="stack sm"><span class="eyebrow">' + esc(t("ex.assignedTo")) + '</span>' +
    (assigned.length
      ? '<div class="row tight">' + assigned.map(a => '<span class="chip acc">' + esc(nameOf(a.student_id)) +
          '<button data-unassign="' + esc(a.id) + '" aria-label="' + esc(t("g.delete")) + '">' + ic("x") + '</button></span>').join("") + '</div>'
      : '<p class="dim tiny">' + esc(t("ex.assignNone")) + '</p>') +
    (free.length
      ? '<span class="unit"><select class="inp" id="exa"><option value="">' + esc(t("ex.assignPick")) + '</option>' +
          free.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join("") + '</select>' +
        '<button class="u" id="exa-add" style="cursor:pointer;font-weight:600;color:var(--accent)">' + esc(t("ex.assign")) + '</button></span>'
      : (mine.length ? '' : '<p class="dim tiny">' + esc(t("co.noAthletesD")) + '</p>')) +
  '</div>';
}

function exerciseModal(id){
  const e = exById(id); if (!e) return;
  const me = Session.live();
  const vid = exVideo(id);
  const sec = (lb, val) => val ? '<div class="stack sm" style="gap:3px"><span class="eyebrow">' + esc(lb) + '</span>' +
    '<p class="small muted" style="line-height:1.6">' + esc(val) + '</p></div>' : "";
  /* Champs de la base v2 : absents des exercices de la banque intégrée. */
  const lc = LI() ? "en" : "fr";
  const meta = e.meta || {};
  const extra = (e.extra || {})[lc] || {};
  const variants = (e.variants || [])[LI()] || [];
  const fig = exercisePose(e.meta);
  Modal.open({
    title: exName(e), wide: true,
    body: '<div class="stack">' +
      '<div class="row tight"><span class="chip acc">' + esc(t("ex.cat."+e.cat)) + '</span>' +
        '<span class="chip"><span class="lvdot" style="background:' + EX_LV_COLOR[e.lv] + ';margin:0"></span>' + esc(EX_LV_LB[e.lv][LI()]) + '</span>' +
        (extra.subcategory ? '<span class="chip">' + esc(extra.subcategory) + '</span>' : '') +
        (meta.duration ? '<span class="chip">' + ic("clock") + esc(meta.duration + " min") + '</span>' : '') + '</div>' +
      (fig ? '<div class="exfig lg">' + fig + '</div>' : '') +
      '<p style="font-size:15px;line-height:1.6">' + esc(exField(e, "d")) + '</p>' +
      topo() +
      sec(t("ex.equipment"), (extra.equipment || []).join(", ")) +
      sec(t("ex.muscles"), exField(e, "m")) +
      sec(t("ex.cues"), exField(e, "c")) +
      sec(t("ex.mistakes"), exField(e, "e")) +
      sec(t("ex.dosage"), exField(e, "dose")) +
      (variants.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("ex.variants")) + '</span>' +
        variants.map((v, i) => '<div class="exvar">' +
          (variantPose(e.meta, i) ? '<span class="exfig">' + variantPose(e.meta, i) + '</span>' : '<span></span>') +
          '<div class="stack sm" style="gap:2px"><b class="small">' + (i + 1) + '. ' + esc(v.name) + '</b>' +
          '<p class="small muted" style="line-height:1.5">' + esc(v.desc) + '</p></div></div>').join("") +
      '</div>' : '') +
      '<div class="stripe crit stack sm" style="gap:3px"><span class="eyebrow">' + esc(t("ex.contra")) + '</span>' +
        '<p class="small muted" style="line-height:1.6">' + esc(exField(e, "contra")) + '</p></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("ex.video")) + '</span>' +
        (vid ? '<a class="btn sm" href="' + esc(vid) + '" target="_blank" rel="noopener noreferrer">' + ic("video") + esc(t("g.open")) + '</a>'
             : '<p class="dim tiny">' + esc(t("ex.videoNone")) + '</p>') +
        (isStaff(me) ?
          '<span class="unit"><input class="inp" id="exv" placeholder="https://…" value="' + esc(vid||"") + '">' +
          '<button class="u" id="exv-save" style="cursor:pointer;font-weight:600;color:var(--accent)">' + esc(t("g.save")) + '</button></span>' : '') +
      '</div>' +
      assignSection(e, me) +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const b = $("#exv-save", root);
      if (b) b.onclick = async () => { await setExVideo(id, $("#exv", root).value.trim()); toast(t("g.saved"), "good"); Modal.close(); };
      /* Affectations : le serveur (RLS) vérifie que le grimpeur est bien le vôtre. */
      const reopen = () => { exerciseModal(id); render(); };
      const add = $("#exa-add", root);
      if (add) add.onclick = async () => {
        const sid = $("#exa", root).value; if (!sid) return;
        try{ await Remote.assign(e.uuid, sid); }
        catch(err){ return toast(t("er.saveFailed"), "crit"); }
        audit("exercise_assigned", exName(e) + " → " + ((Store.get("users", sid) || {}).name || sid));
        toast(t("ex.assigned"), "good"); reopen();
      };
      $$("[data-unassign]", root).forEach(x => x.onclick = async () => {
        try{ await Remote.unassign(x.dataset.unassign); }
        catch(err){ return toast(t("er.saveFailed"), "crit"); }
        audit("exercise_unassigned", exName(e));
        reopen();
      });
    }
  });
}

/* ================================================================
   16. MESSAGING
   ================================================================ */
function threadId(a, b){ return [a, b].sort().join("__"); }
function getThread(a, b){
  const id = threadId(a, b);
  return Store.get("threads", id) || { id, participants: [a, b], messages: [], read: {} };
}
function unreadCount(userId){
  return Store.list("threads").filter(th => (th.participants||[]).indexOf(userId) >= 0)
    .reduce((n, th) => {
      const last = (th.read || {})[userId] || 0;
      return n + (th.messages || []).filter(m => m.from !== userId && m.ts > last).length;
    }, 0);
}
async function markRead(th, userId){
  const read = Object.assign({}, th.read || {}); 
  const lastTs = (th.messages || []).reduce((m, x) => Math.max(m, x.ts), 0);
  if ((read[userId] || 0) >= lastTs) return;
  read[userId] = lastTs;
  await Store.put("threads", th.id, Object.assign({}, th, { read }));
}

function viewMessages(me){
  const partners = me.role === "climber"
    ? (Access.myCoach() ? [Access.myCoach()] : [])
    : Access.climbers();
  if (!partners.length){
    return '<div class="stack lg"><div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ms.title")) + '</span>' +
      '<h2>' + esc(t("ms.noThread")) + '</h2></div></div>' +
      '<div class="panel"><div class="empty">' + ic("chat") + '<div class="t">' + esc(t("ms.noThread")) + '</div>' +
      '<div class="d">' + esc(me.role === "climber" ? t("ms.noCoach") : t("co.noAthletesD")) + '</div></div></div></div>';
  }
  const other = View.thread ? (byId(partners, View.thread) || partners[0]) : partners[0];
  const th = getThread(me.id, other.id);
  setTimeout(() => markRead(getThread(me.id, other.id), me.id), 0);
  const msgs = (th.messages || []).slice().sort((a,b) => a.ts - b.ts);

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ms.title")) + '</span>' +
      '<h2>' + esc(other.name) + '</h2><p>' + esc(t("role."+other.role)) + '</p></div></div>' +
    (partners.length > 1 ? '<div class="row tight noprint">' + partners.map(x => {
      const u = getThread(me.id, x.id);
      const n = (u.messages||[]).filter(m => m.from !== me.id && m.ts > ((u.read||{})[me.id]||0)).length;
      return '<button class="filt' + (x.id === other.id ? " on" : "") + '" data-act="thread" data-v="' + esc(x.id) + '">' +
        esc(x.name) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
    }).join("") + '</div>' : '') +

    '<div class="panel pad stack">' +
      (msgs.length ? '<div class="thread">' + msgs.map(m => {
        const mine = m.from === me.id;
        const who = Store.get("users", m.from);
        return '<div class="msg ' + (mine ? "me" : "them") + '">' +
          (mine ? '' : '<div class="who">' + esc(who ? who.name : "—") + '</div>') +
          (m.ctx ? '<div class="chip acc" style="margin-bottom:5px">' + esc(t("ms.context")) + ' : ' + esc(m.ctx) + '</div>' : '') +
          '<div>' + esc(m.text).replace(/\n/g, "<br>") + '</div>' +
          (m.videoUrl ? '<a class="vid" href="' + esc(m.videoUrl) + '" target="_blank" rel="noopener noreferrer">' + ic("video") + esc(t("ex.video")) + '</a>' : '') +
          '<div class="tm">' + esc(fmtTime(m.ts)) + '</div></div>';
      }).join("") + '</div>'
        : '<div class="empty">' + ic("chat") + '<div class="t">' + esc(t("ms.noThread")) + '</div></div>') +
      topo() +
      '<div class="stack sm noprint">' +
        '<textarea class="inp" data-fk="msg" data-act-input="msg" placeholder="' + esc(t("ms.placeholder")) + '">' + esc(View.msgDraft||"") + '</textarea>' +
        '<div class="row tight">' +
          '<span class="unit" style="flex:1 1 240px"><input class="inp" data-fk="msgv" id="msg-video" placeholder="' + esc(t("ms.videoLink")) + '">' +
            '<span class="u">' + ic("video") + '</span></span>' +
          '<button class="btn sm ghost" data-act="video-check">' + ic("video") + esc(t("ms.attachVideo")) + '</button>' +
          '<button class="btn sm pri" data-act="msg-send" data-v="' + esc(other.id) + '">' + ic("send") + esc(t("g.send")) + '</button>' +
        '</div>' +
        '<p class="dim tiny">' + esc(t("ms.videoLimit")) + ' · ' + esc(t("ms.videoNote")) + '</p>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ================================================================
   17. PROFILE + PAIN JOURNAL
   ================================================================ */
function viewProfile(me){
  const p = me.profile || {};
  const track = trackFor(p);
  const coach = Access.myCoach();
  const pains = Store.list("pain").filter(x => x.userId === me.id).sort((a,b) => b.createdAt - a.createdAt);
  const cfg = config();
  const la = latestAssessment(me.id);

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("pf.title")) + '</span>' +
      '<h2>' + esc(me.name) + '</h2><p>' + esc(t("role."+me.role)) + (me.email ? ' · ' + esc(me.email) : '') + '</p></div>' +
      '<div class="row tight noprint">' +
        '<button class="btn sm ghost" data-act="export-mine">' + ic("dl") + esc(t("pf.exportMine")) + '</button>' +
        '<button class="btn sm ghost" data-act="signout">' + ic("out") + esc(t("g.signOut")) + '</button></div></div>' +

    (me.role === "climber" ? '<div class="grid g2">' +
      '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("pf.anthro")) + '</span>' +
        '<div class="rows">' +
          rw(t("on.sex"), p.sex === "f" ? t("on.sex.f") : p.sex === "m" ? t("on.sex.m") : t("on.sex.x")) +
          rw(t("on.birth"), p.birthYear || "—") +
          rw(t("on.height"), p.heightCm ? p.heightCm + " cm" : "—") +
          rw(t("on.weight"), p.weightKg ? p.weightKg + " kg" : "—") +
          rw(t("on.years"), p.years != null ? p.years : "—") +
        '</div>' +
        '<button class="btn sm noprint" data-act="profile-edit">' + ic("edit") + esc(t("g.edit")) + '</button></div>' +
      '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("pf.level")) + '</span>' +
        '<div class="rows">' +
          rw(t("on.gradeSport"), p.gradeSport || "—") +
          rw(t("on.gradeBoulder"), p.gradeBoulder ? fontLabel(p.gradeBoulder) : "—") +
          rw(t("on.mainDisc"), t("on.disc." + (p.discipline || "both"))) +
          rw(t("pf.track"), track === "advanced" ? t("on.routeAdv") : t("on.routeBeg")) +
          rw(t("pf.coach"), coach ? coach.name : t("g.unassigned")) +
          rw(t("pf.retest"), la ? fmtDate(addDays(la.date, cfg.testValidityDays), {day:"2-digit",month:"short",year:"numeric"}) : t("ov.doTest")) +
        '</div></div>' +
    '</div>' : '') +

    (p.goalText ? '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("pf.goals")) + '</span>' +
      '<p style="font-family:var(--serif);font-size:19px;line-height:1.4">' + esc(p.goalText) + '</p>' +
      (p.goalDate ? '<span class="chip acc">' + esc(fmtDateLong(p.goalDate)) + '</span>' : '') + '</div>' : '') +

    (me.role === "climber" ? '<div class="panel pad stack sm">' +
      '<div class="between"><span class="eyebrow">' + esc(t("pn.title")) + '</span>' +
        '<button class="btn sm noprint" data-act="pain-new">' + ic("plus") + esc(t("pn.new")) + '</button></div>' +
      '<div class="notice warn">' + ic("alert") + '<span><b>' + esc(t("pn.redFlag")) + '</b><br>' + esc(t("pn.redFlagD")) + '</span></div>' +
      (pains.length ? '<div class="rows">' + pains.map(x =>
        '<div class="rw"><span class="stripe ' + (x.status === "resolved" ? "" : x.eva >= cfg.painAlert ? "crit" : "warn") + ' gr">' +
          '<span class="t1">' + esc(painLabel(x.location)) + ' · ' + esc(t("pn.eva")) + ' ' + x.eva + '/10</span>' +
          '<span class="t2">' + esc(fmtDate(x.date, {day:"2-digit",month:"short",year:"numeric"})) + ' · ' + esc(t("pn.when." + x.onset)) +
          (x.context ? ' · ' + esc(x.context) : '') + '</span></span>' +
          (x.status === "active" ? '<button class="btn xs noprint" data-act="pain-resolve" data-v="' + esc(x.id) + '">' + esc(t("pn.resolve")) + '</button>'
                                 : '<span class="chip good">' + esc(t("pn.resolved")) + '</span>') + '</div>').join("") + '</div>'
        : '<p class="dim tiny">' + esc(t("g.noData")) + '</p>') +
    '</div>' : '') +

    '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("pf.privacy")) + '</span>' +
      '<div class="notice">' + ic("lock") + '<span><b>' + esc(t("lg.honest")) + '</b><br>' + esc(t("lg.honestD")) + '</span></div></div>' +
  '</div>';
}
function rw(k, v){
  return '<div class="rw"><span class="gr"><span class="t2" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">' + esc(k) + '</span></span>' +
    '<span class="v">' + esc(v) + '</span></div>';
}

export { exerciseModal, getThread, markRead, rw, threadId, unreadCount, viewExercises, viewMessages, viewProfile };
