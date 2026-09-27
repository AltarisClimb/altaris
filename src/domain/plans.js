/* ALTARIS™ — formules : essai (7 jours), Standard, Premium
   © 2026 ALTARIS™. All rights reserved.

   Logique pure. Le serveur impose les mêmes règles (plan_of, athlete_write_allowed,
   politiques RLS) : ici, on décide seulement quoi montrer et quoi proposer. */

const PLANS = ["trial", "standard", "premium"];

/** Ce que chaque formule ouvre. "train" = démarrer une séance ou un test. */
const FEATURES = {
  trial:    { train: true,  fullTests: false, programWeeks: 1, messaging: false, calls: false },
  standard: { train: true,  fullTests: true,  programWeeks: 4, messaging: false, calls: false },
  premium:  { train: true,  fullTests: true,  programWeeks: 4, messaging: true,  calls: true  },
  expired:  { train: false, fullTests: false, programWeeks: 0, messaging: false, calls: false },
  staff:    { train: true,  fullTests: true,  programWeeks: 4, messaging: true,  calls: true  }
};

/** Formule effective : "staff" pour les encadrants, "expired" une fois l'essai fini. */
function effectivePlan(u, now){
  if (!u) return "expired";
  if (u.role && u.role !== "climber") return "staff";
  const plan = PLANS.includes(u.plan) ? u.plan : "trial";
  if (plan === "trial" && u.trialEndsAt && u.trialEndsAt < (now || Date.now())) return "expired";
  return plan;
}

function allows(u, feature, now){ return FEATURES[effectivePlan(u, now)][feature]; }

/** Jours d'essai restants (arrondi au-dessus), ou null hors essai. */
function trialDaysLeft(u, now){
  if (effectivePlan(u, now) !== "trial" || !u.trialEndsAt) return null;
  return Math.max(0, Math.ceil((u.trialEndsAt - (now || Date.now())) / 86400000));
}



/* ---------- visios (Premium) ---------- */
/** La visio du mois (calendaire, UTC comme le serveur) est-elle déjà réservée ? */
function callUsedThisMonth(calls, userId, now){
  const d = new Date(now || Date.now()), y = d.getUTCFullYear(), m = d.getUTCMonth();
  return calls.some(c => c.booked_by === userId && new Date(c.start).getUTCFullYear() === y && new Date(c.start).getUTCMonth() === m);
}
/** On peut rejoindre 10 min avant le début, et jusqu'à la fin prévue. */
function joinable(slot, now){
  const t = now || Date.now();
  return t >= slot.start - 10 * 60000 && t <= slot.start + (slot.minutes || 30) * 60000;
}
/** Annulation par le grimpeur : au moins 24 h avant (règle du serveur). */
function cancellable(slot, now){ return slot.start - (now || Date.now()) > 24 * 3600000; }

export { FEATURES, PLANS, allows, callUsedThisMonth, cancellable, effectivePlan, joinable, trialDaysLeft };
