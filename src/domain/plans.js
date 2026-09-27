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

export { FEATURES, PLANS, allows, effectivePlan, trialDaysLeft };
