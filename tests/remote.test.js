/* ALTARIS™ — traduction entre profils Supabase et comptes de l'application
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromProfile, profilePatch } from "../src/remote.js";

const base = { id: "u1", name: "Léa", email: "lea@x.fr", role: "climber", status: "active", coachId: null };

test("les rôles du schéma deviennent ceux de l'interface", () => {
  const p = { id: "u1", email: "a@x.fr", full_name: "A", status: "active", teacher_id: "t1", created_at: "2026-09-26T00:00:00Z" };
  assert.equal(fromProfile({ ...p, role: "student" }).role, "climber");
  assert.equal(fromProfile({ ...p, role: "teacher" }).role, "coach");
  assert.equal(fromProfile({ ...p, role: "admin" }).role, "admin");
  assert.equal(fromProfile({ ...p, role: "student" }).coachId, "t1");
});

test("un nom vide retombe sur l'e-mail", () => {
  assert.equal(fromProfile({ id: "u1", email: "a@x.fr", full_name: "", role: "student", status: "active" }).name, "a@x.fr");
});

test("seuls les champs modifiés partent au serveur", () => {
  assert.deepEqual(profilePatch(base, { ...base, profile: { sex: "f" } }), {});
  assert.deepEqual(profilePatch(base, { ...base, name: "Léa F." }), { full_name: "Léa F." });
  assert.deepEqual(profilePatch(base, { ...base, status: "suspended" }), { status: "suspended" });
});

test("l'e-mail ne part jamais par profiles (il appartient à Supabase Auth)", () => {
  assert.deepEqual(profilePatch(base, { ...base, email: "autre@x.fr" }), {});
});

test("rattacher un grimpeur envoie teacher_id", () => {
  assert.deepEqual(profilePatch(base, { ...base, coachId: "t1" }), { teacher_id: "t1" });
});

test("promouvoir un grimpeur rattaché retire son coach", () => {
  const paired = { ...base, coachId: "t1" };
  assert.deepEqual(profilePatch(paired, { ...paired, role: "coach" }), { role: "teacher", teacher_id: null });
});
