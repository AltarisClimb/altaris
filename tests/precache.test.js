/* Garde-fou hors ligne.
   Le service worker liste ses fichiers à la main. Un module ajouté sous src/
   et oublié ici casse le mode hors ligne en silence : l'app se charge en
   ligne, et tombe en panne au pied du mur. Ce test interdit l'oubli. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir){
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel)
         : (/\.(js|css)$/.test(name) ? [`./${rel}`] : []);
  });
}

test("le service worker pré-cache tous les fichiers de src/", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const listed = new Set([...sw.matchAll(/"(\.\/[^"]+)"/g)].map(m => m[1]));
  const missing = walk("src").filter(f => !listed.has(f));
  assert.deepEqual(missing, [], "à ajouter dans PRECACHE de sw.js");
});

test("le service worker ne référence pas de fichier disparu", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const cached = [...sw.matchAll(/"(\.\/src\/[^"]+)"/g)].map(m => m[1]);
  const onDisk = new Set(walk("src"));
  assert.deepEqual(cached.filter(f => !onDisk.has(f)), []);
});
