import { $, $$, esc, sum } from "../core.js";
import { Store, config } from "../data.js";
import { trackFor } from "../domain/grades.js";
import { DOMAIN_ORDER, assessmentsOf, band, batteryFor, latestAssessment } from "../domain/scoring.js";
import { maxLoadBlocked } from "../domain/workload.js";
import { LI, fmtDate, fmtNum, t } from "../i18n/index.js";
import { progressLines } from "../ui/charts.js";
import { toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { View } from "./shell.js";
import { gradeEquivalent } from "../domain/benchmarks.js";
import { comparePanel } from "./training.js";
/* ================================================================
   14. TESTING ENGINE
   ================================================================ */
function viewTests(user){
  const u = user, p = u.profile || {};
  const track = trackFor(p);
  const battery = batteryFor(track);
  const hist = assessmentsOf(u.id);
  const la = latestAssessment(u.id);
  const cfg = config();
  const blocked = maxLoadBlocked(u.id);
  const domains = DOMAIN_ORDER[track];

  if (View.runner && View.runner.userId === u.id) return viewRunner(u);

  return '<div class="stack lg">' +
    '<div class="sec-head"><div><span class="eyebrow acc">' + esc(t("ts.title")) + '</span>' +
      '<h2>' + esc(track === "advanced" ? t("ts.batteryAdv") : t("ts.batteryBeg")) + '</h2>' +
      '<p>' + esc(track === "advanced" ? t("on.routeAdvD") : t("on.routeBegD")) + '</p></div>' +
      '<button class="btn pri noprint" data-act="test-start">' + ic("play") + esc(t("ts.start")) + '</button></div>' +

    (blocked ? '<div class="notice crit">' + ic("alert") + '<span><b>' + esc(t("ts.painBlock")) + '</b><br>' + esc(t("ts.painBlockD")) + '</span></div>' : '') +
    '<div class="notice warn">' + ic("alert") + '<span><b>' + esc(t("ts.warmup")) + '</b><br>' + esc(t("ts.warmupD")) + '</span></div>' +

    /* battery */
    '<div class="grid g2">' + battery.map(x => {
      const last = la && la.results && la.results[x.id];
      const sc = la && la.scores ? la.scores[x.domain] : null;
      const b = band(sc);
      const lock = blocked && (x.id === "finger" || x.id === "pull" || x.id === "repeat");
      return '<div class="panel pad stack sm" style="' + (lock ? "opacity:.55" : "") + '">' +
        '<div class="between"><span class="eyebrow">' + esc(t("d."+x.domain)) + '</span>' +
          (sc != null ? '<span class="chip ' + b.cls + '">' + Math.round(sc) + ' · ' + esc(t(b.k)) + '</span>' :
           lock ? '<span class="chip crit">' + ic("lock") + esc(t("ts.blockedTitle")) + '</span>' : '') + '</div>' +
        '<div style="font-family:var(--serif);font-size:19px;font-weight:600;line-height:1.25">' + esc(t(x.key + ".n")) + '</div>' +
        '<p class="muted small" style="line-height:1.55">' + esc(t(x.key + ".p")) + '</p>' +
        '<div class="stripe warn tiny muted" style="line-height:1.5">' + esc(t(x.key + ".s")) + '</div>' +
        (last && !last.skipped ? '<div class="row tight"><span class="chip acc">' +
            esc(fmtNum(x.metric(last), x.dec)) + ' ' + esc(x.unit) + '</span>' +
            (() => { const eq = gradeEquivalent(x.id, last); return eq ? '<span class="chip" title="' + esc(t("bm.disclaimer")) + '">≈ ' + esc((eq.below ? "< " : "") + eq.grade) + '</span>' : ''; })() +
            '<span class="chip">' + esc(fmtDate(la.date)) + '</span></div>' : '') +
      '</div>';
    }).join("") + '</div>' +

    comparePanel(u) +

    /* history */
    (hist.length ? '<div class="panel pad stack sm">' +
      '<div class="between"><span class="eyebrow">' + esc(t("ts.history")) + '</span>' +
        '<span class="chip">' + hist.length + '</span></div>' +
      progressLines(hist, domains) +
      '<div class="tw"><table class="dt"><thead><tr><th>' + esc(t("g.date")) + '</th>' +
        domains.map(d => '<th class="n">' + esc(t("d."+d)) + '</th>').join("") + '<th class="n">' + esc(t("ts.score")) + '</th></tr></thead><tbody>' +
        hist.filter(a => a.status === "complete").map(a => {
          const vals = domains.map(d => a.scores && a.scores[d] != null ? a.scores[d] : null);
          const ok = vals.filter(v => v != null);
          return '<tr><td>' + esc(fmtDate(a.date, {day:"2-digit",month:"short",year:"numeric"})) + '</td>' +
            vals.map(v => '<td class="n">' + (v == null ? '<span class="dim">—</span>' : Math.round(v)) + '</td>').join("") +
            '<td class="n" style="font-weight:600">' + (ok.length ? Math.round(sum(ok)/ok.length) : "—") + '</td></tr>';
        }).join("") + '</tbody></table></div>' +
      '<div class="row tight noprint"><button class="btn sm ghost" data-act="print">' + ic("print") + esc(t("g.print")) + '</button></div>' +
    '</div>' :
    '<div class="panel"><div class="empty">' + ic("test") + '<div class="t">' + esc(t("ts.noTests")) + '</div>' +
      '<div class="d">' + esc(t("ts.completeD")) + '</div></div></div>') +
  '</div>';
}

/* ---------------- runner ---------------- */
function viewRunner(u){
  const r = View.runner;
  const battery = batteryFor(r.battery);
  const test = battery[r.idx];
  const p = u.profile || {};
  if (!test) return "";
  const n = battery.length;
  const blocked = maxLoadBlocked(u.id) && (test.id === "finger" || test.id === "pull" || test.id === "repeat");

  return '<div class="stack lg" style="max-width:720px;margin:0 auto">' +
    '<div class="stack sm">' +
      '<div class="between"><button class="btn xs ghost" data-act="test-abort">' + ic("chevL") + esc(t("g.cancel")) + '</button>' +
        '<span class="eyebrow">' + esc(t("ts.battery")) + ' ' + (r.idx+1) + ' / ' + n + '</span></div>' +
      '<div class="steps">' + battery.map((_, i) =>
        '<span class="st ' + (i < r.idx ? "done" : i === r.idx ? "now" : "") + '"></span>').join("") + '</div></div>' +

    '<div class="panel pad stack">' +
      '<div class="stack sm"><span class="eyebrow acc">' + esc(t("d."+test.domain)) + '</span>' +
        '<h2 class="serif" style="font-size:24px">' + esc(t(test.key + ".n")) + '</h2></div>' +
      '<div class="stack sm">' +
        '<div><span class="eyebrow">' + esc(t("ts.protocol")) + '</span><p class="muted small" style="line-height:1.6;margin-top:3px">' + esc(t(test.key + ".p")) + '</p></div>' +
        '<div><span class="eyebrow">' + esc(t("ts.metric")) + '</span><p class="muted small" style="line-height:1.6;margin-top:3px">' + esc(t(test.key + ".m")) + '</p></div>' +
        '<div class="stripe warn"><span class="eyebrow">' + esc(t("ts.safety")) + '</span><p class="tiny muted" style="line-height:1.55;margin-top:3px">' + esc(t(test.key + ".s")) + '</p></div>' +
      '</div>' +

      (blocked ? '<div class="notice crit">' + ic("lock") + '<span><b>' + esc(t("ts.painBlock")) + '</b><br>' + esc(t("ts.painBlockD")) + '</span></div>' : '') +

      (test.timer && !blocked ? timerWidget(test) : '') +

      (!blocked ? '<div class="grid g2">' + test.fields.map(f => runnerField(test, f, r.results[test.id] || {})).join("") + '</div>' : '') +

      (!blocked ? '<div id="live-metric" class="notice acc">' + ic("trend") + '<span></span></div>' : '') +

      '<div class="row" style="justify-content:space-between">' +
        '<button class="btn ghost" data-act="test-skip">' + esc(t("ts.skip")) + '</button>' +
        (blocked ? '<button class="btn pri" data-act="test-skip">' + esc(t("g.next")) + ic("chevR") + '</button>'
                 : '<button class="btn pri" data-act="test-record">' + ic("check") + esc(r.idx === n-1 ? t("g.finish") : t("ts.record")) + '</button>') +
      '</div>' +
    '</div>' +
  '</div>';
}

function runnerField(test, f, vals){
  const v = vals[f.k];
  if (f.type === "choice"){
    return '<label class="f"><span class="lb">' + esc(t(f.lb)) + '</span><select class="inp" data-rf="' + f.k + '">' +
      Object.entries(f.choices).map(([k, lb]) => '<option value="' + k + '"' + (v === k ? " selected" : "") + '>' + esc(lb[LI()]) + '</option>').join("") +
      '</select></label>';
  }
  if (f.type === "scale5"){
    return '<label class="f"><span class="lb">' + esc(t(f.lb)) + '</span>' +
      '<div class="seg" role="group">' + [1,2,3,4,5].map(i =>
        '<button type="button" data-rf-set="' + f.k + '" data-v="' + i + '" class="' + (Number(v) === i ? "on" : "") + '">' + i + '</button>').join("") + '</div></label>';
  }
  return '<label class="f"><span class="lb">' + esc(t(f.lb)) + (f.req ? '' : ' <span class="dim">(' + esc(t("g.optional")) + ')</span>') + '</span>' +
    '<span class="unit"><input class="inp num" type="number" step="' + (f.step||1) + '" data-rf="' + f.k + '" value="' + (v == null ? "" : v) + '" inputmode="decimal">' +
    (f.unit ? '<span class="u">' + esc(f.unit) + '</span>' : '') + '</span>' +
    (f.hint ? '<span class="hint">' + esc(t(f.hint)) + '</span>' : '') + '</label>';
}

/* live 7 s / repeaters instrument */
function timerWidget(test){
  const isRep = test.timer.mode === "repeaters";
  return '<div class="panel flat pad stack sm noprint" id="timerbox" data-mode="' + test.timer.mode + '" data-work="' + (test.timer.work||7) + '" data-rest="' + (test.timer.rest||3) + '">' +
    '<span class="eyebrow center">' + esc(isRep ? t("t.repeat.n") : t("ts.timerStart")) + '</span>' +
    '<div class="ring"><svg viewBox="0 0 172 172" width="172" height="172">' +
      '<circle class="tr" cx="86" cy="86" r="76"/>' +
      '<circle class="pg" cx="86" cy="86" r="76" stroke-dasharray="477.5" stroke-dashoffset="0"/></svg>' +
      '<div class="ct"><div class="n" id="tm-n">' + (test.timer.work||7) + '</div>' +
      '<div class="p" id="tm-p">' + esc(t("ts.work")) + '</div></div></div>' +
    (isRep ? '<div class="center"><span class="eyebrow">' + esc(t("ts.rep")) + '</span>' +
      '<div class="num" id="tm-rep" style="font-size:30px;font-weight:600">0</div></div>' : '') +
    '<div class="row" style="justify-content:center">' +
      '<button class="btn pri" id="tm-go">' + ic("play") + esc(t("ts.timerStart")) + '</button>' +
      (isRep ? '<button class="btn" id="tm-fail">' + ic("x") + esc(t("ts.failure")) + '</button>' : '') +
    '</div></div>';
}

let _timer = null;
function bindTimer(){
  const box = $("#timerbox"); if (!box) return;
  const mode = box.dataset.mode, work = Number(box.dataset.work), rest = Number(box.dataset.rest);
  const nEl = $("#tm-n"), pEl = $("#tm-p"), repEl = $("#tm-rep"), pg = $(".ring .pg", box);
  const C = 477.5;
  let phase = "work", left = work, reps = 0, running = false;
  const paint = () => {
    nEl.textContent = left <= 0 ? 0 : (left < 1 ? left.toFixed(1) : Math.ceil(left));
    pEl.textContent = phase === "work" ? t("ts.work") : t("ts.restp");
    const total = phase === "work" ? work : rest;
    pg.style.strokeDashoffset = String(C * (1 - left / total));
    pg.classList.toggle("rest", phase === "rest");
    if (repEl) repEl.textContent = String(reps);
  };
  const stop = () => { clearInterval(_timer); _timer = null; running = false; $("#tm-go").innerHTML = ic("play") + t("ts.timerStart"); };
  paint();
  $("#tm-go").onclick = () => {
    if (running){ stop(); return; }
    running = true; $("#tm-go").innerHTML = ic("pause") + t("ts.timerStop");
    let last = performance.now();
    _timer = setInterval(() => {
      const now = performance.now(); const dt = (now - last) / 1000; last = now;
      left -= dt;
      if (left <= 0){
        if (mode === "repeaters"){
          if (phase === "work"){ reps++; phase = "rest"; left = rest; }
          else { phase = "work"; left = work; }
        } else { left = 0; stop(); }
      }
      paint();
    }, 60);
  };
  if ($("#tm-fail")) $("#tm-fail").onclick = () => {
    stop();
    const f = $('[data-rf="reps"]'); if (f){ f.value = String(reps); updateLiveMetric(); }
    toast(t("ts.rep") + " : " + reps, "good");
  };
}
function readRunnerFields(){
  const r = View.runner; if (!r) return {};
  const test = batteryFor(r.battery)[r.idx];
  const cur = Object.assign({}, r.results[test.id] || {});
  $$("[data-rf]").forEach(el => {
    const k = el.dataset.rf;
    cur[k] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
  });
  return cur;
}
function updateLiveMetric(){
  const r = View.runner; if (!r) return;
  const test = batteryFor(r.battery)[r.idx];
  const vals = readRunnerFields();
  const u = Store.get("users", r.userId) || {};
  const m = test.metric(vals), s = test.score(vals, u.profile || {});
  const box = $("#live-metric"); if (!box) return;
  if (m == null || isNaN(m)){ box.style.display = "none"; return; }
  box.style.display = "flex";
  const b = band(s);
  $("span", box).innerHTML = '<b>' + esc(t("ts.result")) + '</b> ' + esc(fmtNum(m, test.dec)) + ' ' + esc(test.unit) +
    (s == null ? "" : ' · ' + esc(t("ts.score")) + ' <b>' + Math.round(s) + '/100</b> · ' + esc(t(b.k)));
}

export { _timer, bindTimer, readRunnerFields, runnerField, timerWidget, updateLiveMetric, viewRunner, viewTests };
