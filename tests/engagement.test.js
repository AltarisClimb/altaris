/* ALTARIS™ — plan adaptatif, programmes signature, paiement Stripe, récapitulatif hebdo
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { adaptation, revertAdaptation } from "../src/domain/adapt.js";
import { SIGNATURES, signaturePhases, signatureProgress } from "../src/domain/signature.js";
import { generateProgram } from "../src/domain/program.js";
import { formEncode, planFromSubscription, verifySignature } from "../supabase/functions/_shared/stripe.js";
import { localParts, streakAtRisk, streakBefore, weekStart, weeklyDigest } from "../supabase/functions/_shared/digest.js";
import { addDays } from "../src/core.js";

/* ---------- plan adaptatif ---------- */
const done = (id, date, rpe, ti) => ({ id, date, status: "done", type: "boulder", rpe, targetIntensity: ti, doneAt: Date.parse(date) });
const next = { id: "n", date: "2026-10-03", status: "planned", type: "fingerboard", targetIntensity: 7, plannedMin: 90 };

test("deux séances bien plus dures que prévu : la suivante est allégée", () => {
  const a = adaptation({ sessions: [done("a", "2026-09-28", 9, 6), done("b", "2026-09-30", 8, 6), next], day: "2026-10-01" });
  assert.equal(a.reason, "hard"); assert.equal(a.sessionId, "n");
  assert.equal(a.patch.targetIntensity, 6); assert.equal(a.patch.plannedMin, 75);
  assert.deepEqual(a.patch.adapted.from, { targetIntensity: 7, plannedMin: 90 });
  const back = revertAdaptation(Object.assign({}, next, a.patch));
  assert.equal(back.targetIntensity, 7); assert.equal(back.plannedMin, 90); assert.equal(back.adapted, undefined);
});

test("séances faciles : un cran de plus ; une seule séance ou déjà ajustée : rien", () => {
  assert.equal(adaptation({ sessions: [done("a", "2026-09-28", 3, 6), done("b", "2026-09-30", 4, 6), next], day: "2026-10-01" }).reason, "easy");
  assert.equal(adaptation({ sessions: [done("b", "2026-09-30", 9, 6), next], day: "2026-10-01" }), null);
  assert.equal(adaptation({ sessions: [done("a", "2026-09-28", 9, 6), done("b", "2026-09-30", 9, 6), Object.assign({}, next, { adapted: {} })], day: "2026-10-01" }), null);
  assert.equal(adaptation({ sessions: [done("a", "2026-09-28", 7, 6), done("b", "2026-09-30", 9, 6), next], day: "2026-10-01" }), null, "un seul écart fort");
});

test("douleur active au-dessus du seuil : nettement allégée, même sans historique", () => {
  const a = adaptation({ sessions: [next], pains: [{ status: "active", eva: 5 }], day: "2026-10-01", painAlert: 4 });
  assert.equal(a.reason, "pain"); assert.equal(a.patch.targetIntensity, 5); assert.equal(a.patch.plannedMin, 65);
  assert.equal(adaptation({ sessions: [next], pains: [{ status: "resolved", eva: 8 }], day: "2026-10-01", painAlert: 4 }), null);
});

/* ---------- programmes signature ---------- */
test("un programme signature couvre ses semaines, phase par phase, et on suit sa progression", () => {
  const sig = SIGNATURES.find(s => s.id === "first7a"), from = "2026-10-05";
  const ph = signaturePhases(sig, from);
  assert.deepEqual(ph.map(p => p.phase), ["base", "strength", "power", "taper"]);
  assert.equal(ph[ph.length - 1].to, addDays(from, 8 * 7 - 1));
  const cats = ["doigts", "tirage", "gainage", "endurance", "mobilite", "antagonistes", "pliometrie", "equilibre", "echauffement", "recuperation"];
  const exercises = cats.flatMap(c => [0, 1, 2].map(i => ({ id: c + i, cat: c, lv: "all" })));
  const list = generateProgram({ userId: "u", profile: {}, exercises, weeks: sig.weeks, maxWeeks: sig.weeks, from, phases: ph,
    programId: "sg1", signature: sig.id, weak: sig.weak });
  assert.equal(Math.max(...list.map(s => s.program.week)), 8);
  assert.ok(list.every(s => s.program.signature === "first7a" && s.program.weeks === 8));
  const pr = signatureProgress(list.map((s, i) => i < 4 ? Object.assign({}, s, { status: "done" }) : s), addDays(from, 9));
  assert.equal(pr.id, "first7a"); assert.equal(pr.week, 2); assert.equal(pr.weeks, 8); assert.equal(pr.done, 4);
  const comeback = generateProgram({ userId: "u", profile: {}, exercises, weeks: 4, from, phases: signaturePhases(SIGNATURES.find(s => s.id === "comeback"), from),
    intensityShift: -1, programId: "c" });
  assert.ok(comeback.every(s => s.targetIntensity <= 4), "retour après une pause : plus doux");
});

/* ---------- Stripe ---------- */
test("encodage des paramètres Stripe", () => {
  assert.equal(formEncode({ mode: "subscription", line_items: [{ price: "p_1", quantity: 1 }], metadata: { user_id: "u" } }),
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Buser_id%5D=u");
});

test("signature du webhook : valide, falsifiée, trop ancienne", async () => {
  const secret = "whsec_test", body = '{"type":"x"}', ts = 1790000000;
  const sig = createHmac("sha256", secret).update(ts + "." + body).digest("hex");
  assert.equal(await verifySignature(body, "t=" + ts + ",v1=" + sig, secret, 300, ts + 10), true);
  assert.equal(await verifySignature(body + " ", "t=" + ts + ",v1=" + sig, secret, 300, ts + 10), false);
  assert.equal(await verifySignature(body, "t=" + ts + ",v1=" + sig, secret, 300, ts + 1000), false, "rejouée");
  assert.equal(await verifySignature(body, "", secret), false);
});

test("abonnement → formule : active tant que payée, essai expiré ensuite", () => {
  const prices = { standard: "price_s", premium: "price_p" };
  const sub = (status, price) => ({ status, items: { data: [{ price: { id: price } }] } });
  assert.deepEqual(planFromSubscription(sub("active", "price_p"), prices), { plan: "premium", status: "active", ended: false });
  assert.equal(planFromSubscription(sub("past_due", "price_s"), prices).plan, "standard");
  assert.deepEqual(planFromSubscription(sub("canceled", "price_p"), prices), { plan: "trial", status: "canceled", ended: true });
  assert.equal(planFromSubscription(sub("active", "price_other"), prices).plan, "trial");
  const both = { standard: ["price_s", "price_sy"], premium: ["price_p", "price_py"] };
  assert.equal(planFromSubscription(sub("active", "price_py"), both).plan, "premium", "prix annuel reconnu");
  assert.equal(planFromSubscription(sub("active", "price_s"), { standard: ["price_s", null], premium: [null, null] }).plan, "standard");
});

/* ---------- relances ---------- */
test("heure locale, début de semaine, série en jeu", () => {
  const p = localParts(Date.parse("2026-10-04T16:02:00Z"), "Europe/Paris");        // dimanche 18:02 à Paris
  assert.deepEqual([p.date, p.weekday, p.hour], ["2026-10-04", 6, 18]);
  assert.equal(weekStart("2026-10-04"), "2026-09-28");
  const S = (date) => ({ date, status: "done" });
  const hist = [S("2026-09-15"), S("2026-09-22"), S("2026-09-24")];     // semaines du 14 et du 21
  assert.equal(streakBefore(hist, "2026-10-04"), 2);
  assert.equal(streakAtRisk(hist, "2026-10-04"), 2, "rien cette semaine : la série de 2 semaines est en jeu");
  assert.equal(streakAtRisk(hist.concat([S("2026-09-30")]), "2026-10-04"), 0, "séance déjà faite cette semaine");
  assert.equal(streakAtRisk([S("2026-09-22")], "2026-10-04"), 0, "une seule semaine : pas encore une série");
});

test("e-mail du lundi : semaine passée, série, séances prévues", () => {
  const sessions = [
    { date: "2026-09-29", status: "done", type: "boulder", actualMin: 60, title: "Bloc" },
    { date: "2026-10-01", status: "done", type: "fingerboard", actualMin: 45, title: "Poutre" },
    { date: "2026-09-22", status: "done", type: "boulder", actualMin: 60, title: "Bloc" },
    { date: "2026-10-07", status: "planned", type: "lead", time: "18:00", title: "Voie <continuité>" }
  ];
  const d = weeklyDigest({ sessions, name: "Nils", today: "2026-10-05", lang: "fr", site: "https://app.test" });
  assert.equal(d.empty, false);
  assert.match(d.text, /2 séances · 105 min/);
  assert.match(d.text, /2 semaines d'affilée/);
  assert.match(d.text, /mercredi 18:00 · Voie <continuité>/);
  assert.ok(d.html.includes("Voie &lt;continuité&gt;"), "HTML échappé");
  assert.equal(weeklyDigest({ sessions: [], name: "", today: "2026-10-05", lang: "en", site: "" }).empty, true);
});
