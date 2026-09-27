import { $, $$, COPYRIGHT, esc, today, uid } from "./core.js";
import { Access, Session, Store, audit, can, hasHealthConsent, planOf } from "./data.js";
import { FEATURES } from "./domain/plans.js";
import { Remote } from "./remote.js";
import { DEFAULT_TIME, sessionStart } from "./domain/calendar.js";
import { EXERCISES, EX_CATS, EX_LV_COLOR, exById, exField, exName } from "./domain/exercises.js";
import { FONT, SPORT, fontLabel } from "./domain/grades.js";
import { sessionLoad } from "./domain/workload.js";
import { LANG, LI, fmtDateLong, fmtNum, t } from "./i18n/index.js";
import { body, render } from "./main.js";
import { topo } from "./ui/brand.js";
import { Modal, toast } from "./ui/feedback.js";
import { ic } from "./ui/icons.js";
import { PAIN_SITES, kpi, painLabel } from "./views/climber.js";
import { exerciseModal, sendMessage } from "./views/library.js";
import { DAYS, SESSION_TYPES, fNum, fSelect } from "./views/onboarding.js";
/* ================================================================
   20. MODALS — session sheet, RPE validation, block editor,
       pain report, availability, profile, account, legal
   ================================================================ */
function sessionSheet(id){
  const s = Store.get("sessions", id); if (!s) return;
  const me = Session.live();
  const isCoach = me.role === "coach" || me.role === "admin";
  const u = Store.get("users", s.userId);
  const exs = (s.exercises||[]).map(exById).filter(Boolean);
  Modal.open({
    title: s.title, wide: true,
    body: '<div class="stack">' +
      '<div class="row tight"><span class="chip acc">' + esc(fmtDateLong(s.date)) + '</span>' +
        '<span class="chip">' + esc(t("st."+s.type)) + '</span>' +
        '<span class="chip">' + esc(t("cal.targetVol")) + ' ' + (s.plannedMin||0) + '′</span>' +
        '<span class="chip">' + esc(t("cal.targetInt")) + ' ' + (s.targetIntensity||5) + '/10</span>' +
        '<span class="chip ' + (s.status==="done"?"good":s.status==="missed"?"crit":"") + '">' + esc(t("cal."+(s.status==="done"?"done":s.status==="missed"?"missed":"planned"))) + '</span>' +
        (isCoach ? '<span class="chip">' + esc(u ? u.name : "") + '</span>' : '') + '</div>' +
      (s.notes ? '<div class="stack sm"><span class="eyebrow">' + esc(t("co.blockNotes")) + '</span>' +
        '<p class="small muted" style="line-height:1.6;white-space:pre-wrap">' + esc(s.notes) + '</p></div>' : '') +
      (exs.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("co.pickExercises")) + '</span>' +
        '<div class="rows">' + exs.map(e => '<button class="rw" data-ex="' + esc(e.id) + '">' +
          '<span class="lvdot" style="background:' + EX_LV_COLOR[e.lv] + '"></span>' +
          '<span class="gr"><span class="t1">' + esc(exName(e)) + '</span><span class="t2">' + esc(exField(e,"dose")) + '</span></span>' +
          ic("chevR","chev") + '</button>').join("") + '</div></div>' : '') +
      (s.status === "done" ? '<div class="grid g3">' +
        kpi("RPE", String(s.rpe), "/10", t("rpe.scale")) +
        kpi(t("rpe.realDur"), String(s.actualMin), t("g.min"), "") +
        kpi(t("ld.session"), fmtNum(s.load), t("ld.au"), t("ld.formula")) + '</div>' +
        (s.feedback ? '<div class="stack sm"><span class="eyebrow">' + esc(t("rpe.feedback")) + '</span>' +
          '<p class="small muted" style="line-height:1.6;white-space:pre-wrap">' + esc(s.feedback) + '</p></div>' : '') : '') +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>' +
      (isCoach ? '<button class="btn" data-edit>' + ic("edit") + esc(t("g.edit")) + '</button>' : '') +
      (s.status !== "done" && !isCoach ? '<button class="btn pri" data-val>' + ic("check") + esc(t("ov.validate")) + '</button>' : '') +
      (s.status === "planned" && isCoach ? '<button class="btn danger" data-miss>' + esc(t("cal.markMissed")) + '</button>' : ''),
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-ex]", root).forEach(b => b.onclick = () => exerciseModal(b.dataset.ex));
      const e = $("[data-edit]", root); if (e) e.onclick = () => { Modal.close(); blockEditor(s.userId, s.date, s.id); };
      const v = $("[data-val]", root); if (v) v.onclick = () => { Modal.close(); rpeModal(s.id); };
      const m = $("[data-miss]", root); if (m) m.onclick = async () => {
        await Store.put("sessions", s.id, Object.assign({}, s, { status:"missed" }));
        audit("session_missed", s.id); Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

function rpeModal(id){
  const s = Store.get("sessions", id); if (!s) return;
  const exs = (s.exercises||[]).map(exById).filter(Boolean);
  let rpe = s.rpe || 0, dur = s.actualMin || s.plannedMin || 60;
  const doneEx = new Set(s.doneExercises || (s.exercises||[]));
  Modal.open({
    title: t("rpe.title"), wide: true,
    body: '<div class="stack">' +
      '<div class="row tight"><span class="chip acc">' + esc(fmtDateLong(s.date)) + '</span><span class="chip">' + esc(s.title) + '</span></div>' +
      (exs.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("rpe.exercises")) + '</span>' +
        '<div class="grid g2">' + exs.map(e => '<label class="check on" data-exchk="' + esc(e.id) + '">' +
          '<input type="checkbox" checked><span class="t">' + esc(exName(e)) + '</span></label>').join("") + '</div></div>' : '') +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("rpe.q")) + '</span>' +
        '<div class="rpe" id="rpe-grid">' + [1,2,3,4,5,6,7,8,9,10].map(i =>
          '<button data-rpe="' + i + '" class="' + (rpe===i?"on":"") + '">' + i + '</button>').join("") + '</div>' +
        '<div class="rpe-lb"><span>' + esc(t("rpe.1")) + '</span><span>' + esc(t("rpe.10")) + '</span></div>' +
        '<p class="dim tiny" id="rpe-desc">' + (rpe ? esc(t("rpe."+rpe)) : esc(t("rpe.scale"))) + '</p></div>' +
      '<label class="f" style="max-width:260px"><span class="lb">' + esc(t("rpe.realDur")) + '</span>' +
        '<span class="unit"><input class="inp num" type="number" id="rpe-dur" value="' + dur + '" step="5" min="5" max="600" inputmode="numeric">' +
        '<span class="u">' + esc(t("g.min")) + '</span></span></label>' +
      '<div class="notice acc" id="rpe-load">' + ic("trend") + '<span></span></div>' +
      '<label class="f"><span class="lb">' + esc(t("rpe.feedback")) + '</span>' +
        '<textarea class="inp" id="rpe-fb" placeholder="' + esc(t("rpe.feedbackPh")) + '">' + esc(s.feedback||"") + '</textarea></label>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>' +
      '<button class="btn pri" id="rpe-ok">' + ic("check") + esc(t("ov.validate")) + '</button>',
    onMount(root){
      const upd = () => {
        const L = sessionLoad(rpe, Number($("#rpe-dur", root).value) || 0);
        $("#rpe-load span", root).innerHTML = '<b>' + esc(t("rpe.computed")) + '</b> ' + rpe + ' × ' +
          esc(String($("#rpe-dur", root).value)) + ' ' + esc(t("g.min")) + ' = <b>' + fmtNum(L) + ' ' + esc(t("ld.au")) + '</b>';
        $("#rpe-desc", root).textContent = rpe ? t("rpe."+rpe) : t("rpe.scale");
      };
      upd();
      $$("[data-rpe]", root).forEach(b => b.onclick = () => {
        rpe = Number(b.dataset.rpe);
        $$("[data-rpe]", root).forEach(x => x.classList.toggle("on", Number(x.dataset.rpe) === rpe));
        upd();
      });
      $("#rpe-dur", root).addEventListener("input", upd);
      $$("[data-exchk]", root).forEach(l => l.onclick = () => setTimeout(() => l.classList.toggle("on", $("input", l).checked), 0));
      $("[data-c]", root).onclick = () => Modal.close();
      $("#rpe-ok", root).onclick = async () => {
        if (!rpe) return toast(t("er.required"), "crit");
        const d = Number($("#rpe-dur", root).value) || 0;
        if (d <= 0) return toast(t("er.number"), "crit");
        const done = $$("[data-exchk]", root).filter(l => $("input", l).checked).map(l => l.dataset.exchk);
        await Store.put("sessions", s.id, Object.assign({}, s, {
          status: "done", rpe, actualMin: d, load: sessionLoad(rpe, d),
          feedback: $("#rpe-fb", root).value.trim(), doneExercises: done, doneAt: Date.now()
        }));
        audit("session_validated", s.id + " RPE" + rpe + " " + d + "min");
        Remote.notify({ kind: "done", athleteId: s.userId, sessionId: s.id });
        Modal.close();
        toast(t("rpe.validated"), "good");
      };
    }
  });
}

function blockEditor(userId, date, editId){
  const me = Session.live();
  const ex = editId ? Store.get("sessions", editId) : null;
  const routines = Store.list("routines").filter(r => r.coachId === me.id);
  let picked = new Set((ex && ex.exercises) || []);
  const athlete = Store.get("users", userId);
  const startTime = (ex && ex.time) ||
    sessionStart({ date: (ex && ex.date) || date || today() }, athlete && athlete.profile) || DEFAULT_TIME;
  const render_ = (root) => {
    $("#be-ex", root).innerHTML = picked.size
      ? Array.from(picked).map(id => { const e = exById(id); return e ?
          '<span class="chip acc">' + esc(exName(e)) + '<button data-unpick="' + esc(id) + '">' + ic("x") + '</button></span>' : ""; }).join("")
      : '<span class="dim tiny">' + esc(t("g.none")) + '</span>';
    $$("[data-unpick]", root).forEach(b => b.onclick = () => { picked.delete(b.dataset.unpick); render_(root); });
  };
  Modal.open({
    title: ex ? t("g.edit") : t("co.assignBlock"), wide: true,
    body: '<div class="stack">' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("co.blockTitle")) + '</span>' +
          '<input class="inp" id="be-title" value="' + esc(ex ? ex.title : "") + '" placeholder="' + esc(t("co.blockTitle")) + '"></label>' +
        '<label class="f"><span class="lb">' + esc(t("g.date")) + '</span>' +
          '<input class="inp num" type="date" id="be-date" value="' + esc(ex ? ex.date : (date || today())) + '"></label>' +
        /* Heure de début : pour l'agenda et le rappel 1 h avant. Par défaut, le créneau déclaré par le grimpeur ce jour-là. */
        '<label class="f"><span class="lb">' + esc(t("cal.time")) + '</span>' +
          '<input class="inp num" type="time" id="be-time" step="300" value="' + esc(startTime) + '">' +
          '<span class="hint">' + esc(t("cal.timeHint")) + '</span></label>' +
        '<label class="f"><span class="lb">' + esc(t("co.blockType")) + '</span><select class="inp" id="be-type">' +
          SESSION_TYPES.map(x => '<option value="' + x + '"' + (ex && ex.type === x ? " selected" : "") + '>' + esc(t("st."+x)) + '</option>').join("") + '</select></label>' +
        '<label class="f"><span class="lb">' + esc(t("co.blockDur")) + '</span>' +
          '<span class="unit"><input class="inp num" type="number" id="be-dur" step="5" min="0" max="600" value="' + (ex ? ex.plannedMin : 90) + '">' +
          '<span class="u">' + esc(t("g.min")) + '</span></span></label>' +
      '</div>' +
      '<label class="f"><span class="lb">' + esc(t("co.blockInt")) + ' — <span id="be-iv" class="num">' + (ex ? ex.targetIntensity : 6) + '</span>/10</span>' +
        '<input type="range" id="be-int" min="1" max="10" step="1" value="' + (ex ? ex.targetIntensity : 6) + '"></label>' +
      '<label class="f"><span class="lb">' + esc(t("co.blockNotes")) + '</span>' +
        '<textarea class="inp" id="be-notes" placeholder="' + esc(t("cal.targetVol")) + ' / ' + esc(t("cal.targetInt")) + '">' + esc(ex ? ex.notes||"" : "") + '</textarea></label>' +
      (routines.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("co.fromRoutine")) + '</span>' +
        '<div class="row tight">' + routines.map(r => '<button class="filt" data-routine="' + esc(r.id) + '">' + esc(r.name) + '</button>').join("") + '</div></div>' : '') +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("co.pickExercises")) + '</span>' +
        '<div class="row tight" id="be-ex"></div>' +
        '<span class="unit"><select class="inp" id="be-pick">' +
          EX_CATS.map(c => '<optgroup label="' + esc(t("ex.cat."+c)) + '">' +
            EXERCISES.filter(e => e.cat === c).map(e => '<option value="' + esc(e.id) + '">' + esc(exName(e)) + '</option>').join("") +
          '</optgroup>').join("") + '</select>' +
          '<button class="u" id="be-add" style="cursor:pointer;color:var(--accent);font-weight:600">' + esc(t("g.add")) + '</button></span>' +
      '</div>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>' +
      (ex ? '<button class="btn danger" id="be-del">' + ic("trash") + '</button>' : '') +
      '<button class="btn" id="be-routine">' + esc(t("ex.saveRoutine")) + '</button>' +
      '<button class="btn pri" id="be-ok">' + ic("check") + esc(t("g.save")) + '</button>',
    onMount(root){
      render_(root);
      $("#be-int", root).addEventListener("input", e => $("#be-iv", root).textContent = e.target.value);
      $("#be-add", root).onclick = () => { picked.add($("#be-pick", root).value); render_(root); };
      $$("[data-routine]", root).forEach(b => b.onclick = () => {
        const r = Store.get("routines", b.dataset.routine); if (!r) return;
        (r.exerciseIds||[]).forEach(id => picked.add(id));
        if (!$("#be-title", root).value) $("#be-title", root).value = r.name;
        if (r.type) $("#be-type", root).value = r.type;
        if (r.durationMin) $("#be-dur", root).value = r.durationMin;
        render_(root);
      });
      $("[data-c]", root).onclick = () => Modal.close();
      const del = $("#be-del", root); if (del) del.onclick = async () => {
        await Store.del("sessions", ex.id); audit("session_deleted", ex.id); Modal.close(); toast(t("g.deleted"));
      };
      $("#be-routine", root).onclick = async () => {
        const name = $("#be-title", root).value.trim() || t("ex.newRoutine");
        const id = uid("r");
        await Store.put("routines", id, { id, coachId: me.id, name, type: $("#be-type", root).value,
          durationMin: Number($("#be-dur", root).value)||0, exerciseIds: Array.from(picked), notes: $("#be-notes", root).value.trim() });
        audit("routine_created", name); toast(t("g.saved"), "good");
      };
      $("#be-ok", root).onclick = async () => {
        const title = $("#be-title", root).value.trim();
        if (!title) return toast(t("er.required"), "crit");
        if (!userId) return toast(t("co.noAthletesD"), "crit");
        const id = ex ? ex.id : uid("s");
        await Store.put("sessions", id, Object.assign({}, ex || {}, {
          id, userId, coachId: me.id, date: $("#be-date", root).value, time: $("#be-time", root).value || null, title,
          type: $("#be-type", root).value, plannedMin: Number($("#be-dur", root).value)||0,
          targetIntensity: Number($("#be-int", root).value)||5, notes: $("#be-notes", root).value.trim(),
          exercises: Array.from(picked), status: (ex && ex.status) || "planned"
        }));
        audit(ex ? "session_updated" : "session_assigned", title);
        Remote.notify({ kind: "session", athleteId: userId, sessionId: id, update: !!ex });
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

function painModal(){
  const me = Session.live();
  let site = null, eva = 3;
  Modal.open({
    title: t("pn.new"), wide: true,
    body: '<div class="stack">' +
      '<div class="notice warn">' + ic("alert") + '<span><b>' + esc(t("pn.redFlag")) + '</b><br>' + esc(t("pn.redFlagD")) + '</span></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("pn.where")) + '</span>' +
        '<div class="bmap" id="pn-map">' + PAIN_SITES.map(k =>
          '<button data-site="' + k + '">' + esc(painLabel(k)) + '</button>').join("") + '</div></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("pn.eva")) + ' — <span class="num" id="pn-ev">3</span>/10</span>' +
        '<input type="range" id="pn-eva" min="0" max="10" step="1" value="3">' +
        '<div class="rpe-lb"><span>0</span><span>10</span></div>' +
        '<p class="dim tiny">' + esc(t("pn.evaHint")) + '</p></div>' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("pn.when")) + '</span><select class="inp" id="pn-when">' +
          ["during","after","rest","morning"].map(k => '<option value="' + k + '">' + esc(t("pn.when."+k)) + '</option>').join("") + '</select></label>' +
        '<label class="f"><span class="lb">' + esc(t("g.date")) + '</span><input class="inp num" type="date" id="pn-date" value="' + today() + '"></label>' +
      '</div>' +
      '<label class="f"><span class="lb">' + esc(t("pn.context")) + '</span>' +
        '<textarea class="inp" id="pn-ctx" placeholder="' + esc(t("pn.contextPh")) + '"></textarea></label>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>' +
      '<button class="btn pri" id="pn-ok">' + ic("send") + esc(t("pn.submit")) + '</button>',
    onMount(root){
      $$("[data-site]", root).forEach(b => b.onclick = () => {
        site = b.dataset.site;
        $$("[data-site]", root).forEach(x => x.classList.toggle("on", x.dataset.site === site));
      });
      $("#pn-eva", root).addEventListener("input", e => { eva = Number(e.target.value); $("#pn-ev", root).textContent = e.target.value; });
      $("[data-c]", root).onclick = () => Modal.close();
      $("#pn-ok", root).onclick = async () => {
        if (!site) return toast(t("er.required"), "crit");
        const id = uid("p");
        await Store.put("pain", id, { id, userId: me.id, date: $("#pn-date", root).value, location: site,
          eva, onset: $("#pn-when", root).value, context: $("#pn-ctx", root).value.trim(),
          status: "active", createdAt: Date.now() });
        audit("pain_reported", site + " EVA" + eva);
        const coach = Access.myCoach();
        /* Le message au coach contient la douleur : seulement avec le consentement santé. */
        const shared = hasHealthConsent(Session.live());
        if (coach && shared){
          await sendMessage(me.id, coach.id, {
            ctx: t("pn.title"), text: painLabel(site) + " · " + t("pn.eva") + " " + eva + "/10 · " + t("pn.when."+$("#pn-when", root).value) +
              ($("#pn-ctx", root).value.trim() ? "\n" + $("#pn-ctx", root).value.trim() : "") });
        }
        Modal.close();
        toast(shared ? t("pn.sent") : t("hc.localOnly"), shared ? "good" : undefined);
        if (["finger_a2","finger_a4","finger_other","elbow_med","elbow_lat","shoulder","wrist"].indexOf(site) >= 0)
          setTimeout(() => toast(t("pn.autoAdaptD"), "crit"), 700);
      };
    }
  });
}

function availModal(){
  const me = Session.live();
  let slots = ((me.profile||{}).availability || []).slice();
  const paint = (root) => {
    $("#av-list", root).innerHTML = slots.length ? slots.map((s, i) =>
      '<div class="rw"><span class="gr"><span class="t1">' + esc(DAYS[s.day][LI()]) + ' · ' + esc(s.start) + '–' + esc(s.end) + '</span>' +
      '<span class="t2">' + esc(t("st."+s.type)) + '</span></span>' +
      '<button class="btn icon sm ghost" data-rm="' + i + '">' + ic("trash") + '</button></div>').join("")
      : '<div class="empty" style="padding:16px"><div class="d">' + esc(t("on.availD")) + '</div></div>';
    $$("[data-rm]", root).forEach(b => b.onclick = () => { slots.splice(Number(b.dataset.rm), 1); paint(root); });
  };
  Modal.open({
    title: t("cal.editAvail"),
    body: '<div class="stack"><div class="panel rows" id="av-list"></div>' +
      '<div class="grid g4">' +
        '<label class="f"><span class="lb">' + esc(t("g.week")) + '</span><select class="inp" id="av-day">' +
          DAYS.map((d, i) => '<option value="' + i + '">' + esc(d[LI()]) + '</option>').join("") + '</select></label>' +
        '<label class="f"><span class="lb">' + esc(t("ts.work")) + '</span><input class="inp num" type="time" id="av-s" value="18:00"></label>' +
        '<label class="f"><span class="lb">' + esc(t("ts.restp")) + '</span><input class="inp num" type="time" id="av-e" value="20:00"></label>' +
        '<label class="f"><span class="lb">' + esc(t("g.type")) + '</span><select class="inp" id="av-t">' +
          SESSION_TYPES.filter(x => x !== "rest").map(x => '<option value="' + x + '">' + esc(t("st."+x)) + '</option>').join("") + '</select></label>' +
      '</div><button class="btn sm" id="av-add">' + ic("plus") + esc(t("on.addSlot")) + '</button></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="av-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      paint(root);
      $("#av-add", root).onclick = () => {
        slots.push({ day: Number($("#av-day", root).value), start: $("#av-s", root).value, end: $("#av-e", root).value, type: $("#av-t", root).value });
        slots.sort((a,b) => a.day - b.day || (a.start < b.start ? -1 : 1));
        paint(root);
      };
      $("[data-c]", root).onclick = () => Modal.close();
      $("#av-ok", root).onclick = async () => {
        const u = Session.live();
        await Store.put("users", u.id, Object.assign({}, u, { profile: Object.assign({}, u.profile||{}, { availability: slots }) }));
        audit("availability_updated", slots.length + " slots");
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

function profileEditModal(){
  const u = Session.live(), p = u.profile || {};
  Modal.open({
    title: t("pf.title"), wide: true,
    body: '<div class="stack"><div class="grid g2">' +
      fSelect("sex", t("on.sex"), [["f",t("on.sex.f")],["m",t("on.sex.m")],["x",t("on.sex.x")]], p.sex) +
      fNum("birthYear", t("on.birth"), "", p.birthYear, 1) +
      fNum("heightCm", t("on.height"), "cm", p.heightCm, 1) +
      fNum("weightKg", t("on.weight"), "kg", p.weightKg, .1) +
      fSelect("gradeSport", t("on.gradeSport"), [["",""]].concat(SPORT.map(g=>[g,g])), p.gradeSport) +
      fSelect("gradeBoulder", t("on.gradeBoulder"), [["",""]].concat(FONT.map(g=>[g,fontLabel(g)])), p.gradeBoulder) +
      fSelect("discipline", t("on.mainDisc"), [["boulder",t("on.disc.boulder")],["sport",t("on.disc.sport")],["both",t("on.disc.both")]], p.discipline) +
      fNum("years", t("on.years"), "", p.years, .5) +
    '</div>' +
    '<label class="f"><span class="lb">' + esc(t("on.goals")) + '</span>' +
      '<textarea class="inp" data-onb="goalText">' + esc(p.goalText||"") + '</textarea></label>' +
    '<label class="f" style="max-width:230px"><span class="lb">' + esc(t("on.goalDate")) + '</span>' +
      '<input class="inp num" type="date" data-onb="goalDate" value="' + esc(p.goalDate||"") + '"></label></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="pe-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#pe-ok", root).onclick = async () => {
        const np = Object.assign({}, p);
        $$("[data-onb]", root).forEach(el => {
          const k = el.dataset.onb;
          np[k] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
        });
        await Store.put("users", u.id, Object.assign({}, u, { profile: np }));
        audit("profile_updated", "");
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

/** onSaved (optionnel) : appelé après un enregistrement réussi (ex. : demande de formule traitée). */
function accountEditModal(id, onSaved){
  const u = Store.get("users", id); if (!u) return;
  const coaches = Store.list("users").filter(x => x.role === "coach" || x.role === "admin");
  /* En mode Supabase, l'e-mail appartient à Supabase Auth et il n'y a pas de PIN. */
  const remote = !!Remote.client;
  Modal.open({
    title: u.name,
    body: '<div class="stack">' +
      '<label class="f"><span class="lb">' + esc(t("auth.fullName")) + '</span><input class="inp" id="ae-name" value="' + esc(u.name) + '"></label>' +
      '<label class="f"><span class="lb">' + esc(t("auth.email")) + '</span><input class="inp" id="ae-mail" value="' + esc(u.email||"") + '"' + (remote ? " disabled" : "") + '></label>' +
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("ad.role")) + '</span><select class="inp" id="ae-role">' +
          ["climber","coach","admin"].map(r => '<option value="' + r + '"' + (u.role===r?" selected":"") + '>' + esc(t("role."+r)) + '</option>').join("") + '</select></label>' +
        '<label class="f"><span class="lb">' + esc(t("ad.plan")) + '</span><select class="inp" id="ae-plan">' +
          ["trial","standard","premium"].map(r => '<option value="' + r + '"' +
            ((["standard","premium"].includes(u.plan) ? u.plan : "trial") === r ? " selected" : "") + '>' + esc(t("plan." + r)) + '</option>').join("") +
          '</select></label>' +
      '</div>' +
      /* Fin de l'essai : ne compte que pour la formule Essai (pour prolonger un essai, par exemple). */
      '<label class="f" style="max-width:240px"><span class="lb">' + esc(t("pl.trialEnd")) + '</span>' +
        '<input class="inp num" type="date" id="ae-trial" value="' + (u.trialEndsAt ? new Date(u.trialEndsAt).toISOString().slice(0, 10) : "") + '"></label>' +
      '<label class="f"><span class="lb">' + esc(t("ad.assignCoach")) + '</span><select class="inp" id="ae-coach">' +
        '<option value="">' + esc(t("g.unassigned")) + '</option>' +
        coaches.map(c => '<option value="' + esc(c.id) + '"' + (u.coachId===c.id?" selected":"") + '>' + esc(c.name) + '</option>').join("") + '</select></label>' +
      (remote ? '' :
      '<label class="f" style="max-width:200px"><span class="lb">' + esc(t("ad.resetPin")) + '</span>' +
        '<input class="inp num" id="ae-pin" maxlength="4" inputmode="numeric" placeholder="' + esc(String(u.pin)) + '"></label>') +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="ae-ok">' + esc(t("g.save")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#ae-ok", root).onclick = async () => {
        const pin = remote ? "" : $("#ae-pin", root).value.trim();
        if (pin && !/^\d{4}$/.test(pin)) return toast(t("er.pinFormat"), "crit");
        const ok = await Store.put("users", u.id, Object.assign({}, u, {
          name: $("#ae-name", root).value.trim() || u.name,
          email: remote ? u.email : $("#ae-mail", root).value.trim(),
          role: $("#ae-role", root).value,
          plan: $("#ae-plan", root).value,
          trialEndsAt: $("#ae-plan", root).value !== "trial" ? null
            : $("#ae-trial", root).value ? Date.parse($("#ae-trial", root).value + "T23:59:59Z") : (u.trialEndsAt || null),
          coachId: $("#ae-coach", root).value || null,
          pin: pin || u.pin
        }));
        if (!ok) return;
        audit("account_updated", u.name);
        if (onSaved) await onSaved();
        Modal.close(); toast(t("g.saved"), "good");
      };
    }
  });
}

function legalModal(){
  Modal.open({
    title: t("lg.notice"), wide: true,
    body: '<div class="stack">' +
      '<div class="notice acc">' + ic("shield") + '<span>' + esc(COPYRIGHT) + '</span></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("lg.honest")) + '</span>' +
        '<p class="small muted" style="line-height:1.65">' + esc(t("lg.honestD")) + '</p></div>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("lg.watermark")) + '</span>' +
        '<p class="small muted" style="line-height:1.65">' + esc(t("lg.watermarkD")) + '</p></div>' +
      topo() +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("ld.disclaimer")) + '</span>' +
        '<p class="small muted" style="line-height:1.65">' + esc(t("ld.disclaimerD")) + '</p></div>' +
    '</div>',
    footer: '<button class="btn pri" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){ $("[data-c]", root).onclick = () => Modal.close(); }
  });
}

function videoCheckModal(){
  Modal.open({
    title: t("ms.attachVideo"),
    body: '<div class="stack">' +
      '<p class="small muted" style="line-height:1.6">' + esc(t("ms.videoLimit")) + '</p>' +
      '<input type="file" accept="video/*" class="inp" id="vc-file">' +
      '<div id="vc-out"></div>' +
      '<div class="notice">' + ic("info") + '<span>' + esc(t("ms.videoNote")) + '</span></div>' +
    '</div>',
    footer: '<button class="btn pri" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#vc-file", root).addEventListener("change", e => {
        const f = e.target.files[0]; if (!f) return;
        const out = $("#vc-out", root);
        const mb = f.size / 1048576;
        if (mb > 30){ out.innerHTML = '<div class="notice crit">' + ic("alert") + '<span>' + esc(t("ms.videoTooBig")) + ' (' + mb.toFixed(1) + ' Mo)</span></div>'; return; }
        const v = document.createElement("video");
        v.preload = "metadata"; v.src = URL.createObjectURL(f);
        v.onloadedmetadata = () => {
          const d = v.duration;
          if (d > 45) out.innerHTML = '<div class="notice crit">' + ic("alert") + '<span>' + esc(t("ms.videoTooLong")) + ' (' + d.toFixed(0) + ' s)</span></div>';
          else out.innerHTML = '<div class="notice"><span>' + ic("check") + '</span><span>' + esc(f.name) + ' — ' + mb.toFixed(1) + ' Mo · ' + d.toFixed(0) + ' s · ' +
            esc(t("ms.videoNote")) + '</span></div>';
          v.src = ""; URL.revokeObjectURL(v.src);
        };
      });
    }
  });
}

/* ---------------- formules : comparaison et demande ----------------
   reason (optionnel) : pourquoi on l'affiche (« la messagerie est réservée au Premium »…). */
const PLAN_ROWS = [["pl.fTests", "fullTests"], ["pl.fProgram", "programWeeks"], ["pl.fLibrary", "train"],
                   ["pl.fMessaging", "messaging"], ["pl.fCalls", "calls"]];
function plansModal(reason){
  const me = Session.live(); if (!me) return;
  const cur = planOf(me);
  const cell = (plan, f) => {
    const v = FEATURES[plan][f];
    if (f === "programWeeks") return esc(t("pl.weeks", { n: v }));
    if (f === "fullTests") return v ? "✓" : esc(t("pl.basicTests"));
    return v ? "✓" : "—";
  };
  Modal.open({
    title: t("pl.title"), wide: true,
    body: '<div class="stack">' +
      (reason ? '<div class="notice acc">' + ic("info") + '<span>' + esc(reason) + '</span></div>' : '') +
      '<div class="pk-grid">' + ["trial", "standard", "premium"].map(plan =>
        '<div class="pk' + (plan === cur || (plan === "trial" && cur === "expired") ? ' cur' : '') + (plan === "premium" ? ' best' : '') + '">' +
          '<div class="pk-h"><b>' + esc(t("plan." + plan)) + '</b><span class="small muted">' + esc(t("plan." + plan + "D")) + '</span></div>' +
          '<ul>' + PLAN_ROWS.map(([k, f]) => '<li><span>' + esc(t(k)) + '</span><b>' + cell(plan, f) + '</b></li>').join("") + '</ul>' +
          (plan === cur ? '<span class="chip acc">' + esc(t("pl.current")) + '</span>'
            : plan === "trial" ? (cur === "expired" ? '<span class="chip crit">' + esc(t("plan.expired")) + '</span>' : '')
            : '<button class="btn sm' + (plan === "premium" ? ' pri' : '') + '" data-req="' + plan + '">' + esc(t("pl.want")) + '</button>') +
        '</div>').join("") + '</div>' +
      '<p class="dim tiny">' + esc(t("pl.howD")) + '</p>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-req]", root).forEach(b => b.onclick = async () => {
        b.disabled = true;
        try{ if (Remote.client) await Remote.requestPlan(b.dataset.req); }
        catch(e){ b.disabled = false; return toast(t("er.saveFailed"), "crit"); }
        audit("plan_requested", b.dataset.req);
        Modal.close(); toast(t("pl.requested", { plan: t("plan." + b.dataset.req) }), "good");
      });
    }
  });
}
/** Lance action() si la formule le permet, sinon montre les formules avec la raison. */
function withPlan(feature, reasonKey, action){
  const me = Session.live();
  if (me && can(me, feature)) return action();
  plansModal(t(reasonKey));
}

/* ---------------- suppression définitive d'un compte (admin) ----------------
   Il faut taper le mot demandé pour activer le bouton : pas de suppression par erreur. */
function deleteAccountModal(id){
  const u = Store.get("users", id); if (!u) return;
  const me = Session.live();
  if (!me || me.role !== "admin" || me.id === id) return;
  const word = t("ad.deleteWord");
  Modal.open({
    title: t("ad.deleteTitle", { name: u.name }),
    body: '<div class="stack">' +
      '<div class="notice crit">' + ic("alert") + '<span>' + esc(t("ad.deleteD")) + '</span></div>' +
      '<ul class="small muted" style="line-height:1.55;padding-left:18px;margin:0">' +
        '<li>' + esc(t("ad.deleteWhat")) + '</li>' +
        (u.role !== "climber" ? '<li>' + esc(t("ad.deleteCoach")) + '</li>' : '') +
        '<li>' + esc(t("ad.deleteKeeps")) + '</li></ul>' +
      '<label class="f"><span class="lb">' + esc(t("ad.deleteType", { word })) + '</span>' +
        '<input class="inp" id="del-word" autocomplete="off" autocapitalize="characters"></label>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>' +
            '<button class="btn danger" id="del-ok" disabled>' + ic("trash") + esc(t("ad.delete")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      const ok = $("#del-ok", root);
      $("#del-word", root).oninput = (e) => { ok.disabled = e.target.value.trim().toUpperCase() !== word; };
      ok.onclick = async () => {
        ok.disabled = true;
        try{ if (Remote.client) await Remote.deleteUser(id); }
        catch(e){ ok.disabled = false; return toast(t("er.saveFailed"), "crit"); }
        Store.forgetUser(id);
        audit("account_deleted", u.name + " (" + u.role + ")");
        Modal.close(); toast(t("ad.deleted", { name: u.name }), "good");
        render();
      };
    }
  });
}

/* ---------------- « Bravo » du coach sur une séance validée ----------------
   Enregistré sur la séance (le grimpeur le voit dans son programme) et envoyé
   comme message (il est notifié). */
const KUDOS = [["👏", "kd.clap"], ["💪", "kd.strong"], ["🔥", "kd.fire"]];
function kudosModal(sessionId){
  const s = Store.get("sessions", sessionId); if (!s) return;
  const me = Session.live(), who = Store.get("users", s.userId) || {};
  let emoji = KUDOS[0][0];
  Modal.open({
    title: t("kd.title", { name: (who.name || "").split(" ")[0] }),
    body: '<div class="stack">' +
      '<p class="small muted">' + esc(s.title) + (s.rpe ? ' · ' + esc(t("pl.effort")) + ' ' + s.rpe + '/10' : '') + '</p>' +
      '<div class="kd-row">' + KUDOS.map(([e, k], i) =>
        '<button class="kd' + (i === 0 ? ' on' : '') + '" data-kd="' + e + '"><span>' + e + '</span>' + esc(t(k)) + '</button>').join("") + '</div>' +
      '<label class="f"><span class="lb">' + esc(t("kd.word")) + ' <span class="dim">(' + esc(t("g.optional")) + ')</span></span>' +
        '<input class="inp" id="kd-text" maxlength="300" placeholder="' + esc(t("kd.wordPh")) + '"></label>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button>' +
            '<button class="btn pri" id="kd-ok">' + ic("send") + esc(t("kd.send")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $$("[data-kd]", root).forEach(b => b.onclick = () => {
        emoji = b.dataset.kd;
        $$("[data-kd]", root).forEach(x => x.classList.toggle("on", x === b));
      });
      $("#kd-ok", root).onclick = async () => {
        const word = $("#kd-text", root).value.trim();
        if (!await Store.put("sessions", s.id, Object.assign({}, s, { kudos: { by: me.id, name: me.name, emoji, at: Date.now() } }))) return;
        await sendMessage(me.id, s.userId, { ctx: t("kd.ctx", { title: s.title }), text: emoji + (word ? " " + word : "") });
        audit("kudos", s.id);
        Modal.close(); toast(t("kd.sent"), "good");
      };
    }
  });
}

/* ---------------- abonnement d'agenda (flux webcal privé) ----------------
   Le lien est créé à la demande ; l'agenda du téléphone le relit tout seul. */
async function calendarSubscribeModal(){
  let https;
  try{ https = await Remote.calendarFeedUrl(LANG); }
  catch(e){ return toast(t("cal.subFailed"), "crit"); }
  const webcal = https.replace(/^https:/, "webcal:");
  const google = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
  Modal.open({
    title: t("cal.subTitle"),
    body: '<div class="stack">' +
      '<p style="line-height:1.6">' + esc(t("cal.subIntro")) + '</p>' +
      '<div class="stack sm">' +
        '<a class="btn pri wide" href="' + esc(webcal) + '">' + ic("cal") + esc(t("cal.subOpen")) + '</a>' +
        '<a class="btn wide" href="' + esc(google) + '" target="_blank" rel="noopener noreferrer">' + ic("cal") + esc(t("cal.subGoogle")) + '</a>' +
      '</div>' +
      '<span class="unit"><input class="inp" id="cal-url" readonly value="' + esc(https) + '">' +
        '<button class="u" id="cal-copy" style="cursor:pointer;font-weight:600;color:var(--accent)">' + esc(t("cal.subCopy")) + '</button></span>' +
      '<p class="dim tiny">' + esc(t("cal.subPrivate")) + '</p>' +
    '</div>',
    footer: '<button class="btn ghost" id="cal-reset">' + esc(t("cal.subReset")) + '</button>' +
            '<button class="btn" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#cal-copy", root).onclick = async () => {
        try{ await navigator.clipboard.writeText(https); }
        catch(e){ $("#cal-url", root).select(); document.execCommand("copy"); }
        toast(t("g.copied"), "good");
      };
      $("#cal-reset", root).onclick = async () => {
        try{ await Remote.resetCalendarFeed(); }
        catch(e){ return toast(t("cal.subFailed"), "crit"); }
        toast(t("cal.subResetDone"), "good");
        calendarSubscribeModal();
      };
    }
  });
}

/* ---------------- consentement données de santé (RGPD art. 9) ----------------
   Demandé au moment où il sert (douleur, test). Refuser n'empêche pas d'utiliser
   l'appli : then() est appelé dans les deux cas, les données restent alors locales. */
function healthConsentModal(then){
  const li = (k) => '<li style="margin:0 0 6px">' + esc(t(k)) + '</li>';
  Modal.open({
    title: t("hc.title"),
    body: '<div class="stack">' +
      '<p style="line-height:1.6">' + esc(t("hc.intro")) + '</p>' +
      '<ul class="small muted" style="line-height:1.55;padding-left:18px;margin:0">' +
        li("hc.what") + li("hc.who") + li("hc.keep") + li("hc.rights") + '</ul>' +
    '</div>',
    footer: '<button class="btn ghost" id="hc-no">' + esc(t("hc.decline")) + '</button>' +
            '<button class="btn pri" id="hc-yes">' + ic("check") + esc(t("hc.accept")) + '</button>',
    onMount(root){
      $("#hc-no", root).onclick = () => { Modal.close(); if (then) then(false); };
      $("#hc-yes", root).onclick = async () => {
        try{ await Store.giveHealthConsent(); }
        catch(e){ return toast(t("er.saveFailed"), "crit"); }
        Modal.close(); toast(t("hc.thanks"), "good");
        if (then) then(true);
      };
    }
  });
}
/** Lance action() après avoir demandé le consentement s'il manque (grimpeur en mode Supabase). */
function withHealthConsent(action){
  const me = Session.live();
  if (!me || me.role !== "climber" || hasHealthConsent(me)) return action();
  healthConsentModal(() => action());
}

export { accountEditModal, availModal, blockEditor, calendarSubscribeModal, deleteAccountModal, healthConsentModal, kudosModal, plansModal, withPlan, legalModal, painModal, profileEditModal, rpeModal, sessionSheet, videoCheckModal, withHealthConsent };
