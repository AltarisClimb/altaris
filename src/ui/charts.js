import { addDays, clamp, diffDays, esc, round, today } from "../core.js";
import { config } from "../data.js";
import { acwrZone, dailyLoads, firstLoadDate } from "../domain/workload.js";
import { fmtDate, fmtNum, t } from "../i18n/index.js";
/* ================================================================
   8. CHARTS
   Every chart takes its colours from theme tokens, keeps one scale
   per panel, and labels values the scale actually reaches.
   ================================================================ */
let _tipSeq = 0;

/** Hexagonal radar of normalized 0–100 domain scores. */
function radarChart(domains, series, opts){
  const o = opts || {};
  const W = 340, H = 300, cx = W/2, cy = H/2 + 4, R = 96;
  const n = domains.length;
  if (!n) return "";
  const ang = i => (Math.PI * 2 * i / n) - Math.PI / 2;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v/100), cy + Math.sin(ang(i)) * R * (v/100)];
  let g = "";
  [20,40,60,80,100].forEach(lv => {
    const p = domains.map((_, i) => pt(i, lv).join(",")).join(" ");
    g += '<polygon points="' + p + '" fill="none" class="gridln' + (lv===100?" b":"") + '"/>';
  });
  domains.forEach((_, i) => {
    const [x,y] = pt(i, 100);
    g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" class="gridln"/>';
  });
  g += '<text x="' + (cx+3) + '" y="' + (cy - R + 10) + '" class="ax" text-anchor="start">100</text>';
  g += '<text x="' + (cx+3) + '" y="' + (cy - R*0.5 + 10) + '" class="ax" text-anchor="start">50</text>';

  let sh = "";
  series.forEach((s, si) => {
    const pts = domains.map((d, i) => pt(i, s.values[d] == null ? 0 : s.values[d]));
    const poly = pts.map(p => p.join(",")).join(" ");
    sh += '<polygon points="' + poly + '" fill="' + s.color + '" fill-opacity="' + (si===0 ? .17 : .07) + '" stroke="' + s.color +
          '" stroke-width="2" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
    if (!s.dash) pts.forEach((p, i) => {
      const v = s.values[domains[i]];
      if (v == null) return;
      sh += '<circle cx="' + round(p[0],1) + '" cy="' + round(p[1],1) + '" r="4.5" fill="' + s.color + '" stroke="var(--surface)" stroke-width="2"/>';
    });
  });
  let lb = "";
  domains.forEach((d, i) => {
    const a = ang(i), lx = cx + Math.cos(a) * (R + 30), ly = cy + Math.sin(a) * (R + 30);
    const anchor = Math.abs(Math.cos(a)) < 0.25 ? "middle" : (Math.cos(a) > 0 ? "start" : "end");
    const v = series[0].values[d];
    lb += '<text x="' + round(lx,1) + '" y="' + round(ly,1) + '" class="axl" text-anchor="' + anchor + '">' + esc(t("d."+d)) + '</text>';
    lb += '<text x="' + round(lx,1) + '" y="' + round(ly+13,1) + '" class="ax" text-anchor="' + anchor + '" style="font-size:11px;fill:' +
          (v == null ? "var(--ink-3)" : series[0].color) + '">' + (v == null ? "—" : Math.round(v)) + '</text>';
  });
  const legend = series.length > 1
    ? '<div class="legend" style="margin-top:8px;justify-content:center">' + series.map(s =>
        '<span><i class="' + (s.dash ? "ln" : "") + '" style="background:' + s.color + '"></i>' + esc(s.label) + '</span>').join("") + '</div>'
    : "";
  return '<div class="chartbox" style="max-width:440px;margin:0 auto"><svg viewBox="-34 -14 ' + (W+68) + ' ' + (H+28) +
         '" role="img" aria-label="' + esc(o.alt || t("ov.profile")) + '">' + g + sh + lb + '</svg></div>' + legend;
}

/** Per-day ACWR history, computed from one pass over the load map. */
function acwrSeries(userId, days, method){
  const m = dailyLoads(userId);
  const cfg = config();
  const meth = method || cfg.acwrMethod || "ra";
  const first = firstLoadDate(userId);
  const out = [];
  const la = 2/(7+1), lc = 2/(28+1);
  let ea = 0, ec = 0;
  const start = addDays(today(), -(days + 40));
  const ewma = {};
  for (let d = start; diffDays(today(), d) >= 0; d = addDays(d, 1)){
    const L = m[d] || 0;
    ea = L * la + ea * (1 - la);
    ec = L * lc + ec * (1 - lc);
    ewma[d] = ec > 0 ? ea / ec : null;
  }
  for (let i = days - 1; i >= 0; i--){
    const d = addDays(today(), -i);
    const hist = first ? diffDays(d, first) + 1 : 0;
    let ratio = null;
    if (hist >= 28){
      if (meth === "ewma") ratio = ewma[d];
      else {
        let a = 0, c = 0;
        for (let k = 0; k < 28; k++){ const dd = addDays(d, -k); const L = m[dd] || 0; c += L; if (k < 7) a += L; }
        ratio = c > 0 ? a / (c/4) : null;
      }
    }
    out.push({ date: d, load: m[d] || 0, ratio: ratio });
  }
  return out;
}

/**
 * Workload chart. Two stacked panels sharing one time axis — daily load in
 * arbitrary units above, the unitless ratio below. Deliberately NOT a
 * dual-axis chart: the two measures have incompatible scales.
 */
function workloadChart(series){
  const cfg = config();
  const W = 720, PL = 40, PR = 12, PT = 10;
  const HA = 118, GAP = 34, HB = 104;
  const H = PT + HA + GAP + HB + 26;
  const n = series.length;
  const iw = W - PL - PR;
  const bw = Math.max(2, (iw / n) - 2);
  const maxLoad = Math.max(100, ...series.map(d => d.load));
  const tick = maxLoad <= 300 ? 100 : maxLoad <= 800 ? 200 : maxLoad <= 1600 ? 400 : 800;
  const yA = v => PT + HA - (v / maxLoad) * HA;
  const id = "wc" + (++_tipSeq);

  let g = "";
  for (let v = 0; v <= maxLoad; v += tick){
    g += '<line x1="' + PL + '" y1="' + round(yA(v),1) + '" x2="' + (W-PR) + '" y2="' + round(yA(v),1) + '" class="gridln"/>';
    g += '<text x="' + (PL-7) + '" y="' + round(yA(v)+3.5,1) + '" class="ax" text-anchor="end">' + v + '</text>';
  }
  let bars = "";
  series.forEach((d, i) => {
    if (d.load <= 0) return;
    const x = PL + (iw / n) * i + 1, h = Math.max(2, PT + HA - yA(d.load));
    const r = Math.min(4, bw/2, h);
    bars += '<path d="M' + round(x,1) + ' ' + round(PT+HA,1) + ' v' + round(-(h-r),1) +
            ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + ' h' + round(bw-2*r,1) +
            ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + ' v' + round(h-r,1) + 'Z" fill="var(--accent)" fill-opacity=".8"/>';
  });

  const yB0 = PT + HA + GAP;
  const maxR = Math.max(2.0, Math.ceil(Math.max(0, ...series.map(d => d.ratio || 0)) * 1.12 * 2) / 2);
  const yB = v => yB0 + HB - (v / maxR) * HB;
  let zones = "";
  const zb = [[0, cfg.acwrLow, "var(--warn)", .07], [cfg.acwrLow, cfg.acwrHigh, "var(--good)", .17],
              [cfg.acwrHigh, cfg.acwrCrit, "var(--warn)", .14], [cfg.acwrCrit, maxR, "var(--crit)", .16]];
  zb.forEach(z => {
    const y1 = yB(Math.min(z[1], maxR)), y2 = yB(z[0]);
    if (y2 - y1 <= 0) return;
    zones += '<rect x="' + PL + '" y="' + round(y1,1) + '" width="' + iw + '" height="' + round(y2-y1,1) + '" fill="' + z[2] + '" opacity="' + z[3] + '"/>';
  });
  [cfg.acwrLow, cfg.acwrHigh, cfg.acwrCrit].forEach(v => {
    if (v > maxR) return;
    zones += '<line x1="' + PL + '" y1="' + round(yB(v),1) + '" x2="' + (W-PR) + '" y2="' + round(yB(v),1) +
             '" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>';
    zones += '<text x="' + (PL-7) + '" y="' + round(yB(v)+3.5,1) + '" class="ax" text-anchor="end">' + v.toFixed(1) + '</text>';
  });
  zones += '<text x="' + (PL-7) + '" y="' + round(yB(0)+3.5,1) + '" class="ax" text-anchor="end">0</text>';
  zones += '<text x="' + (PL-7) + '" y="' + round(yB(maxR)+3.5,1) + '" class="ax" text-anchor="end">' + maxR.toFixed(1) + '</text>';

  let path = "", last = null, dots = "";
  series.forEach((d, i) => {
    const x = PL + (iw / n) * i + (iw/n)/2;
    if (d.ratio == null){ last = null; return; }
    const y = yB(d.ratio);
    path += (last === null ? "M" : "L") + round(x,1) + " " + round(y,1);
    last = i;
  });
  const lastPt = series.map((d,i) => ({d,i})).filter(o => o.d.ratio != null).pop();
  if (lastPt){
    const x = PL + (iw/n) * lastPt.i + (iw/n)/2, y = yB(lastPt.d.ratio);
    const z = acwrZone(lastPt.d.ratio);
    const col = z.cls === "good" ? "var(--good)" : z.cls === "crit" ? "var(--crit)" : z.cls === "warn" ? "var(--warn)" : "var(--accent)";
    dots = '<circle cx="' + round(x,1) + '" cy="' + round(y,1) + '" r="5" fill="' + col + '" stroke="var(--surface)" stroke-width="2"/>' +
           '<text x="' + round(Math.min(x + 9, W - PR - 26),1) + '" y="' + round(y - 9,1) + '" class="ax" style="font-size:11px;font-weight:600;fill:' + col +
           '">' + lastPt.d.ratio.toFixed(2) + '</text>';
  }

  let xlab = "";
  const step = Math.max(1, Math.round(n / 6));
  series.forEach((d, i) => {
    if (i % step !== 0 && i !== n-1) return;
    const x = PL + (iw/n) * i + (iw/n)/2;
    xlab += '<text x="' + round(x,1) + '" y="' + (H-6) + '" class="ax" text-anchor="middle">' + esc(fmtDate(d.date, {day:"2-digit",month:"2-digit"})) + '</text>';
  });

  let hit = "";
  series.forEach((d, i) => {
    const x = PL + (iw/n) * i;
    hit += '<rect x="' + round(x,1) + '" y="0" width="' + round(iw/n,2) + '" height="' + (PT+HA+GAP+HB) + '" fill="transparent" ' +
           'data-i="' + i + '" data-d="' + d.date + '" data-load="' + d.load + '" data-r="' + (d.ratio == null ? "" : d.ratio.toFixed(2)) + '"/>';
  });

  return '<div class="chartbox wide" id="' + id + '">' +
    '<div class="row tight" style="margin-bottom:2px"><span class="eyebrow">' + esc(t("ld.dailyLoad")) + ' · ' + esc(t("ld.au")) + '</span></div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t("ld.chart")) + '">' +
      g + bars +
      '<text x="' + PL + '" y="' + (yB0 - 9) + '" class="axl">' + esc(t("ld.acwr")) + '</text>' +
      zones +
      '<path d="' + path + '" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + xlab + hit +
    '</svg><div class="ctip" data-tip></div></div>';
}

/** Small inline sparkline of daily load — used in fleet rows. */
function sparkline(series, w, h){
  const W = w || 84, H = h || 24;
  const max = Math.max(1, ...series.map(d => d.load));
  const n = series.length;
  let bars = "";
  series.forEach((d, i) => {
    const bw = Math.max(1.2, (W/n) - 1.1);
    const bh = (d.load / max) * (H - 2);
    bars += '<rect x="' + round((W/n)*i,1) + '" y="' + round(H - bh,1) + '" width="' + round(bw,1) + '" height="' + round(Math.max(bh, d.load ? 1.5 : 0),1) +
            '" rx="1" fill="var(--accent)" fill-opacity="' + (d.load ? .75 : 0) + '"/>';
  });
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" style="display:block">' + bars + '</svg>';
}

/** ACWR gauge — a 220° arc with the risk zones drawn behind the needle. */
function acwrGauge(ratio){
  const cfg = config();
  const W = 240, H = 148, cx = 120, cy = 126, R = 84, SW = 12;
  const maxR = 2.0;
  const toA = v => 180 + (clamp(v, 0, maxR) / maxR) * 180;          // degrees, clockwise from left
  const P = (a, r) => [cx + Math.cos(a * Math.PI/180) * r, cy + Math.sin(a * Math.PI/180) * r];
  const arc = (v0, v1, col, op) => {
    const a0 = toA(v0), a1 = toA(v1);
    if (a1 - a0 < 0.4) return "";
    const [x0,y0] = P(a0, R), [x1,y1] = P(a1, R);
    return '<path d="M' + round(x0,1) + ' ' + round(y0,1) + ' A' + R + ' ' + R + ' 0 ' + ((a1-a0) > 180 ? 1 : 0) + ' 1 ' +
           round(x1,1) + ' ' + round(y1,1) + '" fill="none" stroke="' + col + '" stroke-width="' + SW + '" opacity="' + (op||1) + '"/>';
  };
  /* zone track — the optimal band carries the colour, the rest stays recessive */
  let g = arc(0, cfg.acwrLow, "var(--warn)", .40) + arc(cfg.acwrLow, cfg.acwrHigh, "var(--good)", .95) +
          arc(cfg.acwrHigh, cfg.acwrCrit, "var(--warn)", .85) + arc(cfg.acwrCrit, maxR, "var(--crit)", .9);
  /* every tick names a value the dial reaches, placed outside the track */
  [0, cfg.acwrLow, cfg.acwrHigh, cfg.acwrCrit, maxR].forEach(v => {
    const a = toA(v), [x1,y1] = P(a, R + SW/2), [x2,y2] = P(a, R + SW/2 + 4);
    g += '<line x1="' + round(x1,1) + '" y1="' + round(y1,1) + '" x2="' + round(x2,1) + '" y2="' + round(y2,1) + '" stroke="var(--line)" stroke-width="1"/>';
    const [tx,ty] = P(a, R + SW/2 + 13);
    const anchor = v === 0 ? "start" : v === maxR ? "end" : "middle";
    g += '<text x="' + round(tx,1) + '" y="' + round(ty + (v === 0 || v === maxR ? 4 : 0),1) + '" class="ax" text-anchor="' + anchor + '">' +
         (v === maxR ? "2.0+" : v.toFixed(1)) + '</text>';
  });
  const z = acwrZone(ratio);
  const col = ratio == null ? "var(--ink-3)" : (z.cls === "good" ? "var(--good)" : z.cls === "crit" ? "var(--crit)" : "var(--warn)");
  if (ratio != null){
    const [mx,my] = P(toA(ratio), R);
    g += '<circle cx="' + round(mx,1) + '" cy="' + round(my,1) + '" r="8.5" fill="var(--surface)"/>' +
         '<circle cx="' + round(mx,1) + '" cy="' + round(my,1) + '" r="5.5" fill="' + col + '"/>';
  }
  /* readout sits in the dial opening, clear of the track and the ticks */
  g += '<text x="' + cx + '" y="' + (cy - 26) + '" text-anchor="middle" fill="' + col +
       '" style="font-family:var(--mono);font-size:34px;font-weight:600;letter-spacing:-.02em">' + (ratio == null ? "—" : ratio.toFixed(2)) + '</text>';
  g += '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" fill="' + col +
       '" style="font-family:var(--sans);font-size:10px;font-weight:700;letter-spacing:.11em;text-transform:uppercase">' + esc(t(z.key)) + '</text>';
  return '<div class="gauge"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="ACWR ' + (ratio == null ? "—" : ratio.toFixed(2)) + '">' + g + '</svg></div>';
}

/** Horizontal bars: load distribution by session type. */
function typeBars(rows){
  if (!rows.length) return "";
  const max = Math.max(...rows.map(r => r.v));
  const S = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--s6)"];
  return '<div class="stack sm">' + rows.map((r, i) =>
    '<div class="row nowrap" style="gap:9px">' +
      '<span style="width:84px;flex:0 0 auto;font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.k) + '</span>' +
      '<span style="flex:1 1 20px;min-width:0;height:9px;background:var(--surface-3);border-radius:99px;overflow:hidden;display:block">' +
        '<i style="display:block;height:100%;width:' + round((r.v/max)*100,1) + '%;background:' + S[i % 6] + ';border-radius:99px"></i></span>' +
      '<span class="num" style="width:52px;text-align:right;flex:0 0 auto;font-size:12.5px">' + fmtNum(r.v) + '</span>' +
    '</div>').join("") + '</div>';
}

/** Progress of one domain across successive assessments. */
function progressLines(assessments, domains){
  const list = assessments.slice().reverse().filter(a => a.status === "complete");
  if (list.length < 2) return "";
  const W = 660, H = 190, PL = 34, PR = 96, PT = 12, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const S = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--s6)"];
  const x = i => PL + (list.length === 1 ? iw/2 : (iw * i) / (list.length - 1));
  const y = v => PT + ih - (v/100) * ih;
  let g = "";
  [0,25,50,75,100].forEach(v => {
    g += '<line x1="' + PL + '" y1="' + round(y(v),1) + '" x2="' + (W-PR) + '" y2="' + round(y(v),1) + '" class="gridln"/>' +
         '<text x="' + (PL-6) + '" y="' + round(y(v)+3.5,1) + '" class="ax" text-anchor="end">' + v + '</text>';
  });
  let lines = "";
  const ends = [];
  domains.forEach((d, di) => {
    const pts = list.map((a, i) => (a.scores && a.scores[d] != null) ? [x(i), y(a.scores[d])] : null).filter(Boolean);
    if (pts.length < 2) return;
    lines += '<path d="' + pts.map((p, i) => (i ? "L" : "M") + round(p[0],1) + " " + round(p[1],1)).join(" ") +
             '" fill="none" stroke="' + S[di % 6] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(p => lines += '<circle cx="' + round(p[0],1) + '" cy="' + round(p[1],1) + '" r="3.4" fill="' + S[di % 6] + '" stroke="var(--surface)" stroke-width="1.6"/>');
    const lastP = pts[pts.length-1];
    ends.push({ y: lastP[1], y0: lastP[1], x: lastP[0], c: S[di % 6], lb: t("d."+d) });
  });
  /* Push overlapping end labels apart so every series stays readable. */
  ends.sort((a, b) => a.y - b.y);
  const MIN = 13;
  for (let i = 1; i < ends.length; i++)
    if (ends[i].y - ends[i-1].y < MIN) ends[i].y = ends[i-1].y + MIN;
  const overflow = ends.length ? Math.max(0, ends[ends.length-1].y - (PT + ih)) : 0;
  ends.forEach(e => e.y -= overflow);
  ends.forEach(e => {
    lines += '<line x1="' + round(e.x + 4,1) + '" y1="' + round(e.y0 != null ? e.y0 : e.y,1) + '" x2="' + round(e.x + 8,1) + '" y2="' + round(e.y,1) +
             '" stroke="' + e.c + '" stroke-width="1" opacity=".55"/>';
    lines += '<text x="' + round(e.x + 11,1) + '" y="' + round(e.y + 3.5,1) + '" class="ax" style="font-size:10.5px;fill:' + e.c +
             '">' + esc(e.lb) + '</text>';
  });
  let xl = "";
  list.forEach((a, i) => { xl += '<text x="' + round(x(i),1) + '" y="' + (H-6) + '" class="ax" text-anchor="middle">' + esc(fmtDate(a.date)) + '</text>'; });
  return '<div class="chartbox wide"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t("ts.progress")) + '">' + g + lines + xl + '</svg></div>';
}

export { _tipSeq, acwrGauge, acwrSeries, progressLines, radarChart, sparkline, typeBars, workloadChart };
