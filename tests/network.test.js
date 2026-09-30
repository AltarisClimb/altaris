/* ALTARIS™ — réseau : langues, annuaire réciproque, colonnes de profil
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLanguages, directoryFor, languageName } from "../src/domain/network.js";
import { fromProfile, profilePatch } from "../src/remote.js";

test("langues : seulement celles proposées, sans doublon, dans l'ordre", () => {
  assert.deepEqual(cleanLanguages(["en", "xx", "fr", "en"]), ["fr", "en"]);
  assert.deepEqual(cleanLanguages(null), []);
  assert.equal(languageName("en", "fr"), "Anglais");
});

test("annuaire : rien si je n'y figure pas ; ma région puis les langues communes d'abord", () => {
  const people = [
    { id: "a", name: "Zoé B.", role: "climber", region: "Bretagne", languages: ["fr", "en"] },
    { id: "b", name: "Ana C.", role: "coach", region: "Occitanie", languages: ["es"] },
    { id: "c", name: "Bob D.", role: "climber", region: "Occitanie", languages: ["fr"] },
    { id: "me", name: "Moi", role: "climber", region: "Occitanie", languages: ["fr"] }
  ];
  assert.deepEqual(directoryFor({ id: "me", directoryOptin: false, region: "Occitanie" }, people), []);
  const list = directoryFor({ id: "me", directoryOptin: true, region: "Occitanie", languages: ["fr", "en"] }, people);
  assert.deepEqual(list.map(p => p.id), ["c", "b", "a"]);
  assert.equal(list[0].sameRegion, true);
  assert.deepEqual(list[2].shared, ["fr", "en"]);
});

test("profil : région, langues et inscription à l'annuaire vont et viennent du serveur", () => {
  const u = fromProfile({ id: "u", role: "teacher", status: "active", region: "Occitanie", languages: ["fr", "en"], directory_optin: true });
  assert.equal(u.region, "Occitanie");
  assert.deepEqual(u.languages, ["fr", "en"]);
  assert.equal(u.directoryOptin, true);
  assert.deepEqual(fromProfile({ id: "u", role: "student" }).languages, [], "colonnes absentes : valeurs neutres");
  assert.deepEqual(profilePatch(u, Object.assign({}, u, { region: "Bretagne", languages: ["fr"], directoryOptin: false })),
    { region: "Bretagne", languages: ["fr"], directory_optin: false });
  assert.deepEqual(profilePatch(u, Object.assign({}, u)), {});
});
