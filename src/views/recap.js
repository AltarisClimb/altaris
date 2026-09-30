/* ALTARIS™ — bilan du mois : carte à l'écran et image partageable
   © 2026 ALTARIS™. All rights reserved.

   Du 1er au 7 du mois, l'accueil propose « Ton mois de septembre ». La carte
   s'exporte en image 1080 × 1350 (format Instagram), dessinée au canvas :
   partage natif sur téléphone, téléchargement ailleurs. */
import { esc, today } from "../core.js";
import { Session, Store } from "../data.js";
import { exById, exName } from "../domain/exercises.js";
import { boulderLabel, sportLabel } from "../domain/grades.js";
import { fmtLoad } from "../domain/loads.js";
import { monthRecap, previousMonth } from "../domain/recap.js";
import { LANG, LOC, t } from "../i18n/index.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { sessionsOf } from "./climber.js";
import { duration } from "./today.js";

const EN = () => LANG === "en";
const monthName = (ym) => { const m = new Date(ym + "-15").toLocaleDateString(LOC(), { month: "long", year: "numeric" }); return m.charAt(0).toUpperCase() + m.slice(1); };

function recapOf(u, ym){
  return monthRecap({ sessions: sessionsOf(u.id), ascents: Store.list("ascents").filter(a => a.userId === u.id),
    assessments: Store.list("assessments").filter(a => a.userId === u.id) }, ym);
}

/** Carte d'accueil, la première semaine du mois (si le mois écoulé a de quoi raconter). */
function recapTeaser(u){
  const d = today();
  if (Number(d.slice(8, 10)) > 7) return "";
  const ym = previousMonth(d), r = recapOf(u, ym);
  if (r.empty) return "";
  return '<button class="panel rc-teaser" data-act="recap" data-v="' + ym + '">' +
    '<span class="rc-t-ic">' + ic("trend") + '</span>' +
    '<span class="gr"><span class="eyebrow acc">' + esc(t("rc.ready")) + '</span>' +
      '<span class="t1">' + esc(t("rc.yourMonth", { m: monthName(ym) })) + '</span>' +
      '<span class="t2">' + esc(t("rc.teaser", { n: r.sessions, time: duration(r.minutes) })) + '</span></span>' + ic("chevR", "chev") + '</button>';
}

/** Choix des 6 derniers mois (onglet Progrès). */
function recapLinks(u){
  const out = [];
  let ym = previousMonth(today());
  for (let i = 0; i < 6; i++){ if (!recapOf(u, ym).empty) out.push(ym); ym = previousMonth(ym + "-15"); }
  if (!out.length) return "";
  return '<div class="panel pad stack sm"><span class="eyebrow">' + esc(t("rc.title")) + '</span><div class="row tight">' +
    out.map(m => '<button class="filt" data-act="recap" data-v="' + m + '">' + esc(monthName(m)) + '</button>').join("") + '</div></div>';
}

function stats(r){
  const s = [
    [String(r.sessions), t("rc.sessions")],
    [duration(r.minutes), t("rc.time")],
    [String(r.weeks), t("rc.weeks")]
  ];
  if (r.sends) s.push([String(r.sends), t("rc.sends")]);
  if (r.bestRoute) s.push([sportLabel(r.bestRoute, EN()), t("rc.bestRoute")]);
  if (r.bestBoulder) s.push([boulderLabel(r.bestBoulder, EN()), t("rc.bestBoulder")]);
  if (r.tests) s.push([String(r.tests), t("rc.tests")]);
  return s;
}
function recordLines(r){
  return r.records.map(x => { const e = exById(x.exId); return (e ? exName(e) : x.exId) + " · " + fmtLoad(x.load, t("hg.bw")); });
}

function recapModal(ym){
  const u = Session.live();
  if (!u || u.role !== "climber") return;
  const r = recapOf(u, ym);
  const delta = r.sessions - r.prevSessions;
  Modal.open({
    title: t("rc.yourMonth", { m: monthName(ym) }), wide: true,
    body: '<div class="rc">' +
      '<div class="rc-head"><span class="eyebrow acc">ALTARIS</span><h3>' + esc(monthName(ym)) + '</h3>' +
        '<p class="small muted">' + esc(r.prevSessions ? t(delta >= 0 ? "rc.more" : "rc.less", { n: Math.abs(delta) }) : t("rc.first")) + '</p></div>' +
      '<div class="rc-grid">' + stats(r).map(([v, l]) => '<div><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>').join("") + '</div>' +
      (r.records.length ? '<div class="stack sm"><span class="eyebrow">' + esc(t("rc.records")) + '</span>' +
        recordLines(r).map(x => '<div class="rc-rec">' + ic("trend") + esc(x) + '</div>').join("") + '</div>' : '') +
      (r.coachWord ? '<blockquote class="rc-quote">« ' + esc(r.coachWord.text.length > 220 ? r.coachWord.text.slice(0, 217) + "…" : r.coachWord.text) + ' »<cite>' + esc(r.coachWord.name) + '</cite></blockquote>' : '') +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button><button class="btn pri" id="rc-share">' + ic("dl") + esc(t("rc.share")) + '</button>',
    onMount(root){
      root.querySelector("[data-c]").onclick = () => Modal.close();
      root.querySelector("#rc-share").onclick = () => shareImage(u, r).catch(() => toast(t("rc.shareFailed"), "crit"));
    }
  });
}

/* ---------- image 1080 × 1350 ---------- */
function wrap(ctx, text, maxW){
  const words = text.split(/\s+/), lines = [];
  let line = "";
  for (const w of words){
    const tryL = line ? line + " " + w : w;
    if (ctx.measureText(tryL).width > maxW && line){ lines.push(line); line = w; } else line = tryL;
  }
  if (line) lines.push(line);
  return lines;
}
function drawRecap(u, r){
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0B1220"); g.addColorStop(1, "#0E3A4A");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  /* courbes de niveau discrètes */
  x.strokeStyle = "rgba(34,211,238,.08)"; x.lineWidth = 2;
  for (let i = 0; i < 9; i++){ x.beginPath(); x.ellipse(W * .82, H * .18, 120 + i * 70, 80 + i * 52, -.4, 0, Math.PI * 2); x.stroke(); }
  const sans = '"Barlow", "Segoe UI", system-ui, sans-serif', serif = '"Cormorant Garamond", Georgia, serif';
  x.fillStyle = "#22D3EE"; x.font = "700 34px " + sans; x.fillText("ALTARIS", 80, 120);
  x.fillStyle = "#FFFFFF"; x.font = "600 92px " + serif; x.fillText(monthName(r.month), 80, 250);
  x.fillStyle = "rgba(255,255,255,.72)"; x.font = "500 38px " + sans; x.fillText((u.name || "").split(" ")[0], 80, 310);
  /* chiffres : grille de 2 colonnes */
  const s = stats(r).slice(0, 6);
  s.forEach(([v, l], i) => {
    const cx = 80 + (i % 2) * 470, cy = 430 + Math.floor(i / 2) * 190;
    x.fillStyle = "rgba(255,255,255,.06)"; roundRect(x, cx, cy - 90, 440, 160, 26); x.fill();
    x.fillStyle = "#FFFFFF"; x.font = "700 72px " + sans; x.fillText(v, cx + 32, cy + 6);
    x.fillStyle = "rgba(255,255,255,.65)"; x.font = "500 28px " + sans; x.fillText(l.toUpperCase(), cx + 32, cy + 48);
  });
  let y = 430 + Math.ceil(s.length / 2) * 190 + 10;
  const recs = recordLines(r).slice(0, 2);
  if (recs.length){
    x.fillStyle = "#22D3EE"; x.font = "700 30px " + sans; x.fillText(t("rc.records").toUpperCase(), 80, y); y += 50;
    x.fillStyle = "#FFFFFF"; x.font = "500 36px " + sans;
    recs.forEach(l => { x.fillText("↗ " + l, 80, y); y += 52; });
    y += 20;
  }
  if (r.coachWord && y < H - 260){
    x.fillStyle = "rgba(255,255,255,.9)"; x.font = "italic 500 40px " + serif;
    wrap(x, "« " + r.coachWord.text + " »", W - 160).slice(0, 3).forEach(l => { x.fillText(l, 80, y); y += 52; });
    x.fillStyle = "rgba(255,255,255,.6)"; x.font = "500 28px " + sans; x.fillText("— " + r.coachWord.name, 80, y + 6);
  }
  x.fillStyle = "rgba(255,255,255,.5)"; x.font = "500 26px " + sans; x.fillText("altaris-climb.com", 80, H - 70);
  return c;
}
function roundRect(x, a, b, w, h, r){ x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

/** Image d'une séance faite (1080 × 1350) : titre, date, durée, effort, mot du coach. Aucune donnée de santé. */
function drawSession(u, s){
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0B1220"); g.addColorStop(1, "#0E3A4A");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(34,211,238,.08)"; x.lineWidth = 2;
  for (let i = 0; i < 9; i++){ x.beginPath(); x.ellipse(W * .82, H * .18, 120 + i * 70, 80 + i * 52, -.4, 0, Math.PI * 2); x.stroke(); }
  const sans = '"Barlow", "Segoe UI", system-ui, sans-serif', serif = '"Cormorant Garamond", Georgia, serif';
  x.fillStyle = "#22D3EE"; x.font = "700 34px " + sans; x.fillText("ALTARIS", 80, 120);
  x.fillStyle = "rgba(255,255,255,.72)"; x.font = "500 36px " + sans;
  const day = new Date(s.date + "T12:00:00").toLocaleDateString(LOC(), { weekday: "long", day: "numeric", month: "long" });
  x.fillText(day.charAt(0).toUpperCase() + day.slice(1), 80, 210);
  x.fillStyle = "#FFFFFF"; x.font = "600 84px " + serif;
  let y = 310;
  wrap(x, s.title || t("st." + s.type), W - 160).slice(0, 3).forEach(l => { x.fillText(l, 80, y); y += 92; });
  y += 40;
  const tiles = [[duration(s.actualMin || s.plannedMin || 0), t("sh.duration")],
                 [s.rpe ? s.rpe + "/10" : "—", t("pl.effort")],
                 [t("st." + s.type), t("sh.type")],
                 [String((s.exercises || []).length || "—"), t("sh.exercises")]];
  tiles.forEach(([v, l], i) => {
    const cx = 80 + (i % 2) * 470, cy = y + 90 + Math.floor(i / 2) * 190;
    x.fillStyle = "rgba(255,255,255,.06)"; roundRect(x, cx, cy - 90, 440, 160, 26); x.fill();
    x.fillStyle = "#FFFFFF"; x.font = "700 " + (String(v).length > 9 ? 46 : 64) + "px " + sans; x.fillText(String(v), cx + 32, cy + 2);
    x.fillStyle = "rgba(255,255,255,.65)"; x.font = "500 28px " + sans; x.fillText(l.toUpperCase(), cx + 32, cy + 46);
  });
  y += 2 * 190 + 60;
  const word = s.review && s.review.text ? s.review.text : "";
  if (word && y < H - 260){
    x.fillStyle = "rgba(255,255,255,.9)"; x.font = "italic 500 40px " + serif;
    wrap(x, "« " + (word.length > 160 ? word.slice(0, 157) + "…" : word) + " »", W - 160).slice(0, 3).forEach(l => { x.fillText(l, 80, y); y += 52; });
  }
  x.fillStyle = "rgba(255,255,255,.72)"; x.font = "500 32px " + sans; x.fillText((u.name || "").split(" ")[0], 80, H - 120);
  x.fillStyle = "rgba(255,255,255,.5)"; x.font = "500 26px " + sans; x.fillText("altaris-climb.com", 80, H - 70);
  return c;
}
/** Partager une séance : feuille de partage du téléphone (Instagram, WhatsApp…), image téléchargée ailleurs. */
async function shareSession(u, s){
  try{ await document.fonts.ready; }catch(e){}
  return shareCanvas(drawSession(u, s), "altaris-" + s.date + ".png", s.title || "ALTARIS", t("sh.saved"));
}

async function shareImage(u, r){
  try{ await document.fonts.ready; }catch(e){}
  return shareCanvas(drawRecap(u, r), "altaris-" + r.month + ".png", t("rc.yourMonth", { m: monthName(r.month) }), t("rc.saved"));
}
async function shareCanvas(canvas, name, title, savedText){
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })){
    try{ await navigator.share({ files: [file], title }); return; }
    catch(e){ if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(savedText, "good");
}

export { drawRecap, drawSession, recapLinks, recapModal, recapTeaser, shareSession };
