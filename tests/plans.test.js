/* ALTARIS™ — formules : ce que chacune ouvre
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allows, effectivePlan, trialDaysLeft } from "../src/domain/plans.js";

const now = Date.UTC(2026, 9, 1, 12);
const day = 86400000;

test("formule effective : essai en cours, essai terminé, encadrant", () => {
  assert.equal(effectivePlan({ role: "climber", plan: "trial", trialEndsAt: now + 2 * day }, now), "trial");
  assert.equal(effectivePlan({ role: "climber", plan: "trial", trialEndsAt: now - 1 }, now), "expired");
  assert.equal(effectivePlan({ role: "climber", plan: "premium", trialEndsAt: now - day }, now), "premium");
  assert.equal(effectivePlan({ role: "coach", plan: "trial", trialEndsAt: now - day }, now), "staff");
  assert.equal(effectivePlan({ role: "climber", plan: "old-value" }, now), "trial");
});

test("ce qui est ouvert selon la formule", () => {
  const trial = { role: "climber", plan: "trial", trialEndsAt: now + day };
  const std = { role: "climber", plan: "standard" };
  const prem = { role: "climber", plan: "premium" };
  const over = { role: "climber", plan: "trial", trialEndsAt: now - day };
  assert.deepEqual([allows(trial, "fullTests", now), allows(std, "fullTests", now)], [false, true]);
  assert.deepEqual([allows(std, "messaging", now), allows(prem, "messaging", now)], [false, true]);
  assert.deepEqual([allows(prem, "calls", now), allows(std, "calls", now)], [true, false]);
  assert.deepEqual([allows(trial, "programWeeks", now), allows(std, "programWeeks", now)], [1, 4]);
  assert.equal(allows(over, "train", now), false);
});

test("jours d'essai restants", () => {
  assert.equal(trialDaysLeft({ role: "climber", plan: "trial", trialEndsAt: now + 2.5 * day }, now), 3);
  assert.equal(trialDaysLeft({ role: "climber", plan: "standard" }, now), null);
  assert.equal(trialDaysLeft({ role: "climber", plan: "trial", trialEndsAt: now - day }, now), null);
});
