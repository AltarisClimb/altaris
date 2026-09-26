/* ALTARIS™ — « vu il y a… »
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { relTime } from "../src/i18n/index.js";

test("temps écoulé : à l'instant, minutes, heures", () => {
  const now = Date.UTC(2026, 8, 30, 12, 0);
  assert.equal(relTime(now - 30 * 1000, now), "à l'instant");
  assert.equal(relTime(now - 5 * 60000, now), "il y a 5 min");
  assert.equal(relTime(now - 3 * 3600000, now), "il y a 3 h");
});
