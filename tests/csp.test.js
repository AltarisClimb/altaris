/* ALTARIS™ — la Content-Security-Policy de vercel.json reste cohérente avec le code
   © 2026 ALTARIS™. All rights reserved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPABASE_URL } from "../src/config.js";

const root = new URL("..", import.meta.url);
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === "Content-Security-Policy").value;
const directive = (name) => (csp.split(";").map(s => s.trim()).find(s => s.startsWith(name + " ")) || "").split(/\s+/).slice(1);

test("la CSP autorise le projet Supabase de config.js (API et temps réel)", () => {
  if (!SUPABASE_URL) return;
  const host = new URL(SUPABASE_URL).host;
  const connect = directive("connect-src");
  assert.ok(connect.includes("https://" + host), "connect-src doit contenir https://" + host);
  assert.ok(connect.includes("wss://" + host), "connect-src doit contenir wss://" + host);
});

test("index.html ne contient aucun script inline (interdit par script-src 'self')", () => {
  const html = readFileSync(new URL("index.html", root), "utf8");
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/\bsrc=/.test(m[1]) || m[2].trim());
  assert.deepEqual(inline.map(m => m[0].slice(0, 60)), []);
  assert.deepEqual(directive("script-src"), ["'self'"]);
});

test("vidéos et vocaux : lecture depuis Supabase Storage, micro autorisé pour l'appli", () => {
  const media = directive("media-src");
  if (SUPABASE_URL) assert.ok(media.includes("https://" + new URL(SUPABASE_URL).host), "media-src doit contenir le projet Supabase");
  assert.ok(media.includes("blob:"), "media-src doit accepter blob: (aperçu local)");
  const perms = vercel.headers.flatMap(h => h.headers).find(h => h.key === "Permissions-Policy").value;
  assert.ok(perms.includes("microphone=(self)"), "le message vocal du coach a besoin du micro");
});
