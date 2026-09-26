/* ALTARIS™ — synchronisation des séances avec Supabase (serveur simulé)
   © 2026 ALTARIS™. All rights reserved. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/* toast() écrit dans le DOM : un DOM minimal suffit sous Node. */
globalThis.document = {
  createElement: () => ({ style: {}, remove(){} }),
  querySelector: () => ({ appendChild(){} })
};

const { Session, Store } = await import("../src/data.js");
const { Remote } = await import("../src/remote.js");
const { resetStore } = await import("./_helpers.js");

const COACH = "00000000-0000-0000-0000-0000000000b1";
const ATH   = "00000000-0000-0000-0000-0000000000c1";
const OTHER = "00000000-0000-0000-0000-0000000000c2";

let server, calls, fail;
beforeEach(() => {
  resetStore();
  Store.data.users[COACH] = { id: COACH, name: "Coach", role: "coach", status: "active" };
  Store.data.users[ATH]   = { id: ATH, name: "Etienne", role: "climber", status: "active", coachId: COACH };
  Session.user = Store.data.users[COACH];
  server = {}; calls = []; fail = null;
  Remote.visible = new Set();
  Remote.client = {};                                   // mode Supabase
  Remote.docs = async (col) => Object.entries(server).map(([id, r]) => ({ id, athlete_id: r.athlete_id, data: r.data }));
  Remote.putDoc = async (col, id, athlete_id, data) => {
    calls.push(["put", id, athlete_id]);
    if (fail) throw fail;
    server[id] = { athlete_id, data };
  };
  Remote.delDoc = async (col, id) => { calls.push(["del", id]); if (fail) throw fail; delete server[id]; };
});

test("une séance créée par le coach part sur le serveur, rattachée au grimpeur", async () => {
  const ok = await Store.put("sessions", "s-1", { userId: ATH, title: "Force", status: "planned" });
  assert.equal(ok, true);
  assert.deepEqual(calls, [["put", "s-1", ATH]]);
  assert.equal(server["s-1"].data.title, "Force");
  assert.equal("id" in server["s-1"].data, false, "l'id est la clé, pas une donnée");
});

test("hors ligne : la séance attend dans la file puis part au retour du réseau", async () => {
  fail = new TypeError("Failed to fetch");
  assert.equal(await Store.put("sessions", "s-2", { userId: ATH, title: "Endurance" }), true);
  assert.equal(Store.queue.filter(q => q.remote).length, 1);
  fail = null;
  await Store.flushRemote();
  assert.equal(Store.queue.filter(q => q.remote).length, 0);
  assert.equal(server["s-2"].data.title, "Endurance");
});

test("refus du serveur (RLS) : signalé, pas mis en file", async () => {
  fail = { code: "42501", message: "new row violates row-level security policy" };
  assert.equal(await Store.put("sessions", "s-3", { userId: OTHER, title: "X" }), false);
  assert.equal(Store.queue.length, 0);
});

test("la synchronisation remplace le cache par ce que voit le serveur", async () => {
  server["s-srv"] = { athlete_id: ATH, data: { title: "Du serveur" } };
  Store.data.sessions["s-stale"] = { id: "s-stale", userId: "u-demo", title: "Démo locale" };
  await Store.syncRemote();
  assert.deepEqual(Object.keys(Store.data.sessions), ["s-srv"]);
  assert.equal(Store.data.sessions["s-srv"].userId, ATH);
});

test("les séances créées avant la synchronisation sont envoyées une seule fois", async () => {
  Store.data.sessions["s-old"] = { id: "s-old", userId: ATH, title: "Créée hors ligne" };
  Store.data.sessions["s-hidden"] = { id: "s-hidden", userId: OTHER, title: "Pas mon grimpeur" };
  await Store.syncRemote();
  assert.ok(server["s-old"], "séance du grimpeur envoyée");
  assert.equal(server["s-hidden"], undefined, "grimpeur non visible : rien n'est envoyé");
});

test("suppression : retirée du serveur", async () => {
  server["s-4"] = { athlete_id: ATH, data: {} };
  Store.data.sessions["s-4"] = { id: "s-4", userId: ATH };
  await Store.del("sessions", "s-4");
  assert.equal(server["s-4"], undefined);
});

test("les autres collections restent locales", async () => {
  await Store.put("pain", "p-1", { userId: ATH, eva: 3 });
  assert.deepEqual(calls, []);
});

/* ---------------- messagerie ---------------- */
function useFakeMessaging(){
  const rows = [], reads = [];
  Remote.messages = async () => rows.slice();
  Remote.reads = async () => reads.slice();
  Remote.sendMessage = async (athlete_id, msg) => {
    if (fail) throw fail;
    const r = { id: "m" + rows.length, athlete_id, sender_id: Session.user.id, body: msg.text,
                context: msg.ctx || null, video_url: msg.videoUrl || null, created_at: new Date().toISOString() };
    rows.push(r);
    return r;
  };
  Remote.markRead = async (athlete_id, ts) => { reads.push({ athlete_id, user_id: Session.user.id, last_read_at: new Date(ts).toISOString() }); };
  return { rows, reads };
}

test("un message du grimpeur arrive dans la conversation que voit le coach", async () => {
  const srv = useFakeMessaging();
  Session.user = Store.data.users[ATH];
  assert.equal(await Store.sendMessage(ATH, { text: "Bonjour coach" }), true);
  Session.user = Store.data.users[COACH];
  Store.data.threads = {};
  await Store.syncMessages();
  const th = Store.data.threads[ATH];
  assert.equal(th.messages.length, 1);
  assert.equal(th.messages[0].from, ATH);
  assert.equal(th.messages[0].text, "Bonjour coach");
  assert.equal(srv.rows.length, 1);
});

test("un message reçu en direct n'est pas affiché deux fois", async () => {
  useFakeMessaging();
  const row = { id: "live-1", athlete_id: ATH, sender_id: COACH, body: "Salut", created_at: new Date().toISOString() };
  Store.addMessage(row);
  Store.addMessage(row);
  assert.equal(Store.data.threads[ATH].messages.length, 1);
});

test("échec d'envoi : rien n'est ajouté, l'appelant garde le brouillon", async () => {
  useFakeMessaging();
  fail = new TypeError("Failed to fetch");
  assert.equal(await Store.sendMessage(ATH, { text: "hors ligne" }), false);
  assert.equal((Store.data.threads[ATH] || { messages: [] }).messages.length, 0);
});

test("marquer comme lu enregistre mon marqueur, relu à la synchronisation", async () => {
  const srv = useFakeMessaging();
  await Store.markThreadRead(ATH, 1700000000000);
  assert.equal(srv.reads.length, 1);
  Store.data.threads = {};
  await Store.syncMessages();
  assert.equal(Store.data.threads[ATH].read[COACH], 1700000000000);
});
