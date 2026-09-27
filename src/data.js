import { requestRender } from "./bus.js";
import { LANG, t } from "./i18n/index.js";
import { FEATURES, effectivePlan } from "./domain/plans.js";
import { Remote, profilePatch } from "./remote.js";
import { toast } from "./ui/feedback.js";
/* ================================================================
   2. PERSISTENCE LAYER
   Shared artifact database when granted, with a local write-behind
   cache so entries made at the wall survive a dropped connection.
   ================================================================ */
const COLS = ["users", "assessments", "sessions", "pain", "threads", "routines", "config", "audit"];
const LS_KEY = "altaris.cache.v1";
const LS_Q   = "altaris.queue.v1";
/* Collections stockées dans Supabase (table athlete_docs) quand le projet est
   configuré. Les autres restent sur l'appareil pour l'instant. */
const REMOTE_COLS = ["sessions", "assessments", "pain"];
/* Données de santé (RGPD art. 9) : envoyées seulement si le grimpeur a donné
   son consentement explicite ; le serveur le vérifie aussi (RLS). */
const HEALTH_COLS = ["assessments", "pain"];
/** Formule du compte (essai, standard, premium, expired, staff). En mode local tout est ouvert. */
function planOf(u){ return Remote.client ? effectivePlan(u) : "staff"; }
function can(u, feature){ return FEATURES[planOf(u)][feature]; }
/** Consentement santé : sans objet en mode local (rien ne quitte l'appareil). */
function hasHealthConsent(u){ return !Remote.client || !!(u && u.healthConsentAt); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ligne athlete_docs → document de l'application. */
function fromDocRow(r){ return Object.assign({}, r.data, { id: r.id, userId: r.athlete_id }); }
/** Ligne messages → message de l'application. */
function fromMessageRow(r){
  return { id: r.id, from: r.sender_id, ts: Date.parse(r.created_at), text: r.body,
           ctx: r.context || null, videoUrl: r.video_url || null };
}
/** Réseau coupé (à réessayer) plutôt que refus du serveur (définitif). */
function isNetworkError(e){
  return !e || e instanceof TypeError || !e.code || /fetch|network/i.test(e.message || "");
}

const Store = {
  db: null,
  mode: "local",            // "cloud" | "local"
  ready: false,
  data: {},                 // col -> { id -> doc }
  queue: [],                // pending writes when cloud is unreachable
  subs: [],
  silent: false,
  _flushing: false,

  _blank(){ const o = {}; COLS.forEach(c => o[c] = {}); return o; },

  loadLocal(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      this.data = raw ? Object.assign(this._blank(), JSON.parse(raw)) : this._blank();
      const q = localStorage.getItem(LS_Q);
      this.queue = q ? JSON.parse(q) : [];
    }catch(e){ this.data = this._blank(); this.queue = []; }
  },
  saveLocal(){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(this.data));
      localStorage.setItem(LS_Q, JSON.stringify(this.queue));
    }catch(e){ /* storage full or blocked — cloud remains the source of truth */ }
  },

  async init(){
    this.loadLocal();
    this.ready = true;
    requestRender();                                   // paint immediately from cache
    let db = null;
    try{ db = await claude.use("db"); }catch(e){ db = null; }
    if (!db){ this.mode = "local"; requestRender(); return; }
    this.db = db; this.mode = "cloud";
    COLS.forEach(col => {
      try{
        db.collection(col).onSnapshot(
          snap => {
            const next = {};
            snap.docs.forEach(d => { const v = d.data(); if (v) next[d.id] = Object.assign({ id: d.id }, v); });
            this.data[col] = next;
            this.saveLocal();
            if (!this.silent) requestRender();
          },
          err => {
            if (err && (err.code === "revoked" || err.code === "not_granted")) this.mode = "local";
            requestRender();
          }
        );
      }catch(e){ /* malformed path is a programming error; nothing to recover at runtime */ }
    });
    this.flush();
    requestRender();
  },

  list(col){ return Object.values(this.data[col] || {}); },
  get(col, id){ return (this.data[col] || {})[id] || null; },

  /** Superpose les comptes Supabase aux documents "users" en cache.
   *  Les champs locaux (profile, plan…) sont conservés ; les comptes du mode
   *  PIN, qui n'existent pas côté serveur, sont écartés. */
  /** Compte supprimé : retirer aussi de cet appareil tout ce qui le concerne. */
  forgetUser(userId){
    delete (this.data.users || {})[userId];
    for (const col of COLS){
      if (col === "users" || col === "config" || col === "audit") continue;
      for (const d of Object.values(this.data[col] || {}))
        if (d.userId === userId || (col === "routines" && d.coachId === userId) ||
            (col === "threads" && (d.participants || []).includes(userId))) delete this.data[col][d.id];
    }
    if (this.data.threads) delete this.data.threads[userId];            // conversation (mode Supabase)
    for (const u of Object.values(this.data.users || {}))
      if (u.coachId === userId) this.data.users[u.id] = Object.assign({}, u, { coachId: null });
    this.queue = this.queue.filter(q => !(q.doc && q.doc.userId === userId));
    this.saveLocal();
  },

  mergeUsers(list){
    const prev = this.data.users || {};
    const next = {};
    Object.values(prev).forEach(u => { if (u.remote) next[u.id] = u; });
    list.forEach(u => { next[u.id] = Object.assign({}, prev[u.id], u, { remote: true }); });
    this.data.users = next;
    Remote.visible = new Set(list.map(u => u.id));
    this.saveLocal();
  },

  /** Write a whole document. Optimistic locally, queued if the cloud refuses. */
  async put(col, id, obj){
    /* Rôle, statut, nom et coach vivent dans Supabase : le serveur tranche
       d'abord (RLS + trigger), la copie locale ne suit qu'en cas de succès. */
    if (col === "users" && Remote.client){
      const before = this.get(col, id);
      const patch = before ? profilePatch(before, obj) : {};
      if (Object.keys(patch).length){
        try{ await Remote.updateProfile(id, patch); }
        catch(e){ toast(t("er.saveFailed"), "crit"); requestRender(); return false; }
      }
    }
    const doc = Object.assign({}, obj, { id: id });
    this.data[col] = this.data[col] || {};
    this.data[col][id] = doc;
    this.saveLocal();
    if (!this.silent) requestRender();
    if (Remote.client && REMOTE_COLS.includes(col)){
      /* Santé sans consentement : reste sur l'appareil, envoyée si l'accord est donné. */
      if (HEALTH_COLS.includes(col) && !hasHealthConsent(this.get("users", doc.userId))) return true;
      return this._putRemote(col, id, doc);
    }
    if (this.mode !== "cloud" || !this.db){ this._enqueue({ op:"set", col, id, doc }); return true; }
    try{
      const body = Object.assign({}, doc); delete body.id;
      await this.db.doc(col + "/" + id).set(body);
      return true;
    }catch(e){
      if (e && e.code === "quota_exceeded"){ toast(t("er.quota"), "crit"); return false; }
      if (e && e.code === "invalid_argument"){ toast(t("er.saveFailed"), "crit"); return false; }
      this._enqueue({ op:"set", col, id, doc });
      toast(t("er.offline"));
      return true;
    }
  },

  async del(col, id){
    if (this.data[col]) delete this.data[col][id];
    this.saveLocal();
    requestRender();
    if (Remote.client && REMOTE_COLS.includes(col)){
      try{ await Remote.delDoc(col, id); }
      catch(e){ if (isNetworkError(e)) this._enqueue({ op:"del", col, id, remote:true }); else toast(t("er.saveFailed"), "crit"); }
      return;
    }
    if (this.mode !== "cloud" || !this.db){ this._enqueue({ op:"del", col, id }); return; }
    try{ await this.db.doc(col + "/" + id).delete(); }
    catch(e){ this._enqueue({ op:"del", col, id }); }
  },

  /* ---------- collections synchronisées avec Supabase (REMOTE_COLS) ----------
     Écriture optimiste : la copie locale d'abord, puis le serveur. Hors ligne,
     l'écriture attend dans la file ; refusée par la RLS, elle est signalée et
     disparaîtra à la prochaine synchronisation. */
  async _putRemote(col, id, doc){
    const body = Object.assign({}, doc); delete body.id;
    try{ await Remote.putDoc(col, id, doc.userId, body); return true; }
    catch(e){
      if (isNetworkError(e)){ this._enqueue({ op:"set", col, id, doc, remote:true }); toast(t("er.offline")); return true; }
      toast(t("er.saveFailed"), "crit"); return false;
    }
  },

  async flushRemote(){
    const pending = this.queue.filter(q => q.remote);
    if (this._rflushing || !Remote.client || !pending.length) return;
    this._rflushing = true;
    for (const item of pending){
      try{
        if (item.op === "del") await Remote.delDoc(item.col, item.id);
        else { const b = Object.assign({}, item.doc); delete b.id; await Remote.putDoc(item.col, item.id, item.doc.userId, b); }
      }catch(e){ if (isNetworkError(e)) break; /* refusée : on l'abandonne */ }
      this.queue = this.queue.filter(q => q !== item);
    }
    this.saveLocal();
    this._rflushing = false;
    if (!this.queue.some(q => q.remote)){ toast(t("er.synced"), "good"); requestRender(); }
  },

  /** Remplace les collections synchronisées par ce que la RLS laisse voir.
   *  Les documents créés sur cet appareil avant la synchronisation sont
   *  envoyés une fois (s'ils concernent un grimpeur visible). */
  async syncRemote(){
    if (!Remote.client || !Session.user) return;
    await this.flushRemote();
    /* Comptes relus aussi : rôles, rattachements et « vu il y a… » à jour. */
    try{ this.mergeUsers(await Remote.profiles()); }catch(e){ /* hors ligne : cache */ }
    /* Admin : demandes de formule en attente, pour « À traiter ». */
    if (Session.user.role === "admin") try{ Remote.requests = await Remote.planRequests(); }catch(e){}
    for (const col of REMOTE_COLS){
      let rows;
      try{ rows = await Remote.docs(col); }catch(e){ continue; }             // hors ligne : on garde le cache
      const next = {};
      rows.forEach(r => { next[r.id] = fromDocRow(r); });
      const flag = "altaris.adopted." + col + "." + Session.user.id;
      let adopted = false;
      try{ adopted = !!localStorage.getItem(flag); }catch(e){}
      if (!adopted){
        let waiting = false;                     // données de santé sans consentement : on réessaiera plus tard
        for (const d of Object.values(this.data[col] || {})){
          if (next[d.id] || !UUID.test(d.userId || "") || !Access.canSee(d.userId)) continue;
          if (HEALTH_COLS.includes(col) && !hasHealthConsent(this.get("users", d.userId))){ waiting = true; continue; }
          if (await this._putRemote(col, d.id, d)) next[d.id] = d;
        }
        if (!waiting) try{ localStorage.setItem(flag, "1"); }catch(e){}
      }
      this.queue.filter(q => q.remote && q.col === col)
        .forEach(q => { if (q.op === "del") delete next[q.id]; else next[q.id] = q.doc; });
      /* Santé sans consentement : absente du serveur par construction, on garde la copie locale. */
      if (HEALTH_COLS.includes(col))
        Object.values(this.data[col] || {}).forEach(d => {
          if (!next[d.id] && !hasHealthConsent(this.get("users", d.userId))) next[d.id] = d;
        });
      this.data[col] = next;
    }
    await this.syncMessages();
    this.saveLocal();
    requestRender();
  },

  /* ---------- messagerie ----------
     En mode Supabase, "threads" contient une conversation par grimpeur (id =
     id du grimpeur), reconstruite depuis la table messages. Seuls mes
     marqueurs de lecture sont connus : read = { [moi]: ts }. */
  async syncMessages(){
    let rows, reads;
    try{ [rows, reads] = await Promise.all([Remote.messages(), Remote.reads()]); }
    catch(e){ return; }                                                  // hors ligne : on garde le cache
    this.data.threads = {};
    rows.forEach(r => this.addMessage(r, true));
    reads.forEach(r => { this._thread(r.athlete_id).read[r.user_id] = Date.parse(r.last_read_at); });
  },
  _thread(athleteId){
    this.data.threads = this.data.threads || {};
    return this.data.threads[athleteId] ||
      (this.data.threads[athleteId] = { id: athleteId, athleteId, participants: [athleteId], messages: [], read: {} });
  },
  /** Ajoute une ligne messages à sa conversation (ignorée si déjà présente). */
  addMessage(r, quiet){
    const th = this._thread(r.athlete_id);
    if (th.messages.some(m => m.id === r.id)) return;
    th.messages.push(fromMessageRow(r));
    if (!quiet){ this.saveLocal(); if (!this.silent) requestRender(); }
  },
  async sendMessage(athleteId, msg){
    try{
      this.addMessage(await Remote.sendMessage(athleteId, msg));
      Remote.notify({ kind: "message", athleteId });
      return true;
    }
    catch(e){ toast(t(isNetworkError(e) ? "er.offline" : "er.saveFailed"), "crit"); return false; }
  },
  /* ---------- consentement santé (RGPD art. 9) ---------- */
  /** Le grimpeur connecté donne son accord ; ses tests et douleurs locaux partent ensuite. */
  async giveHealthConsent(){
    await Remote.setHealthConsent(true);
    const me = this.get("users", Session.user.id);
    this.data.users[me.id] = Object.assign({}, me, { healthConsentAt: Date.now() });
    this.saveLocal();
    audit("health_consent_given", "");
    await this.syncRemote();
  },
  /** Retrait : le serveur efface tests et journal de douleur ; on les retire aussi d'ici. */
  async withdrawHealthConsent(){
    await Remote.setHealthConsent(false);
    const me = this.get("users", Session.user.id);
    this.data.users[me.id] = Object.assign({}, me, { healthConsentAt: null });
    for (const col of HEALTH_COLS){
      for (const d of Object.values(this.data[col] || {})) if (d.userId === me.id) delete this.data[col][d.id];
      this.queue = this.queue.filter(q => !(q.col === col && q.doc && q.doc.userId === me.id));
    }
    this.saveLocal();
    audit("health_consent_withdrawn", "");
    requestRender();
  },

  async markThreadRead(athleteId, ts){
    const th = this._thread(athleteId);
    th.read[Session.user.id] = ts;
    this.saveLocal();
    try{ await Remote.markRead(athleteId, ts); }catch(e){ /* sera recalculé à la prochaine synchro */ }
  },

  /** Synchronisation + changements en direct. Appelé après chaque connexion. */
  startRemote(){
    if (!Remote.client) return;
    this.syncRemote();
    Remote.saveDeviceInfo(Session.live(), LANG).catch(() => {});
    Remote.watch((col, id, row) => {
      if (!REMOTE_COLS.includes(col)) return;
      this.data[col] = this.data[col] || {};
      if (row) this.data[col][id] = fromDocRow(row); else delete this.data[col][id];
      this.saveLocal();
      if (!this.silent) requestRender();
    }, (row) => this.addMessage(row));
    /* Présence : le grimpeur rejoint son propre canal, un encadrant ceux de ses grimpeurs. */
    const me = Session.live();
    if (me){
      const ids = me.role === "climber" ? [me.id] : Access.climbers().map(c => c.id);
      Remote.startPresence(me.id, ids, () => { if (!this.silent) requestRender(); });
      Remote.touchSeen(me.id).catch(() => {});
    }
  },

  /** Sign-out on a shared device: drop what the server gives back at the next
   *  sign-in (REMOTE_COLS, messages, offline exercise list). Device-only
   *  collections and unsent writes in the queue are kept — deleting them here
   *  would lose them for good. */
  clearRemote(userId){
    REMOTE_COLS.forEach(c => {
      /* Données de santé d'un grimpeur sans consentement : jamais envoyées, donc
         seulement ici. On les garde, sinon la déconnexion les perdrait. */
      const keep = {};
      if (HEALTH_COLS.includes(c))
        Object.values(this.data[c] || {}).forEach(d => { if (!hasHealthConsent(this.get("users", d.userId))) keep[d.id] = d; });
      this.data[c] = keep;
    });
    this.data.threads = {};
    this.saveLocal();
    try{ if (userId) localStorage.removeItem("altaris.exercises." + userId); }catch(e){}
  },

  _enqueue(item){
    this.queue = this.queue.filter(q => !(q.col === item.col && q.id === item.id));
    this.queue.push(item);
    this.saveLocal();
  },

  async flush(){
    if (this._flushing || this.mode !== "cloud" || !this.db || !this.queue.length) return;
    this._flushing = true;
    const pending = this.queue.slice();
    for (const item of pending){
      try{
        if (item.op === "del") await this.db.doc(item.col + "/" + item.id).delete();
        else { const b = Object.assign({}, item.doc); delete b.id; await this.db.doc(item.col + "/" + item.id).set(b); }
        this.queue = this.queue.filter(q => q !== item);
      }catch(e){ break; }
    }
    this.saveLocal();
    this._flushing = false;
    if (pending.length && !this.queue.length){ toast(t("er.synced"), "good"); requestRender(); }
  }
};
/* .unref() empêche ce minuteur de maintenir le processus Node en vie
   quand la couche de données est importée par la suite de tests.
   Les navigateurs n'exposent pas unref(), d'où la garde. */
const _flushTimer = setInterval(() => { Store.flush(); Store.flushRemote(); }, 12000);
if (_flushTimer && typeof _flushTimer.unref === "function") _flushTimer.unref();
if (typeof window !== "undefined"){
  window.addEventListener("online", () => { Store.flush(); Store.syncRemote(); });
  /* Filet si le temps réel est coupé : on resynchronise au retour sur l'onglet. */
  let _lastSync = 0;
  window.addEventListener("focus", () => { if (Date.now() - _lastSync > 30000){ _lastSync = Date.now(); Store.syncRemote(); } });
  /* « Vu il y a… » : activité notée au retour sur l'appli et toutes les 5 minutes. */
  const seen = () => { if (Remote.client && Session.user && document.visibilityState === "visible") Remote.touchSeen(Session.user.id).catch(() => {}); };
  document.addEventListener("visibilitychange", seen);
  setInterval(seen, 5 * 60000);
}

/* ---------------- audit log (one document per month) ---------------- */
async function audit(action, detail){
  const key = new Date().toISOString().slice(0, 7);            // YYYY-MM
  const cur = Store.get("audit", key) || { id: key, entries: [] };
  const entries = (cur.entries || []).slice(-299);
  entries.push({
    ts: Date.now(),
    actor: (Session.user && Session.user.id) || "anon",
    actorName: (Session.user && Session.user.name) || "—",
    role: (Session.user && Session.user.role) || "—",
    action: action,
    detail: detail || ""
  });
  await Store.put("audit", key, { entries });
}

/* ---------------- global configuration ---------------- */
const DEFAULT_CONFIG = {
  acwrLow: 0.8, acwrHigh: 1.3, acwrCrit: 1.5,
  monoHigh: 2.0, testValidityDays: 84, painAlert: 4,
  thresholdSport: "7a", thresholdBoulder: "V6", acwrMethod: "ra"
};
function config(){ return Object.assign({}, DEFAULT_CONFIG, Store.get("config", "global") || {}); }

/* ---------------- session (who is signed in on this device) ---------------- */
const Session = {
  user: null,
  restore(){
    try{
      const id = localStorage.getItem("altaris.session");
      if (!id) return;
      const u = Store.get("users", id);
      if (u && u.status !== "suspended") this.user = u;
    }catch(e){}
  },
  /** Mode Supabase : la session vient du jeton, le compte de la table profiles.
   *  Renvoie "suspended" si le compte est suspendu (la session est fermée). */
  async restoreRemote(){
    this.user = null;
    const id = await Remote.userId();
    if (!id) return null;
    try{ Store.mergeUsers(await Remote.profiles()); }
    catch(e){ /* hors ligne : on garde les comptes en cache */ }
    const u = Store.get("users", id);
    if (!u) return null;
    if (u.status === "suspended"){ await Remote.signOut(); return "suspended"; }
    this.user = u;
    return null;
  },
  signIn(u){
    this.user = u;
    try{ localStorage.setItem("altaris.session", u.id); }catch(e){}
    touch(u.id);
    audit("sign_in", u.role);
  },
  signOut(){
    audit("sign_out", "");
    const id = this.user && this.user.id;
    this.user = null;
    try{ localStorage.removeItem("altaris.session"); }catch(e){}
    if (Remote.client){ Store.clearRemote(id); Remote.signOut(); }
    /* Le choix de l'onglet appartient à la couche vue : le dispatcher le
       remet à zéro avant d'appeler signOut(). Garder cette ligne ici
       ferait dépendre la couche de données de l'interface. */
    requestRender();
  },
  /** Always read the live document, not the snapshot taken at sign-in. */
  live(){ return this.user ? (Store.get("users", this.user.id) || this.user) : null; }
};
function touch(userId){
  const u = Store.get("users", userId);
  if (!u) return;
  const p = Object.assign({}, u.profile || {}, { lastActive: Date.now() });
  Store.put("users", userId, Object.assign({}, u, { profile: p }));
}

/* ---------------- RBAC ---------------- */
/* En mode Supabase, un compte resté en cache mais que la RLS ne renvoie plus
   (appareil partagé, rattachement changé) ne doit plus apparaître. */
function visible(u){ return !Remote.client || !Remote.visible.size || Remote.visible.has(u.id); }

const Access = {
  /** Climbers visible to the signed-in user. */
  climbers(){
    const me = Session.live(); if (!me) return [];
    const all = Store.list("users").filter(u => u.role === "climber" && u.status !== "suspended" && visible(u));
    if (me.role === "admin") return all;
    if (me.role === "coach")  return all.filter(u => u.coachId === me.id);
    return all.filter(u => u.id === me.id);
  },
  canSee(userId){
    const me = Session.live(); if (!me) return false;
    if (me.id === userId) return true;
    if (me.role === "admin") return true;
    if (me.role === "coach"){ const u = Store.get("users", userId); return !!u && u.coachId === me.id && visible(u); }
    return false;
  },
  /** Rows of a collection the signed-in user is allowed to read. */
  scoped(col){ return Store.list(col).filter(r => this.canSee(r.userId)); },
  myCoach(){
    const me = Session.live();
    return me && me.coachId ? Store.get("users", me.coachId) : null;
  }
};

export { Access, COLS, DEFAULT_CONFIG, HEALTH_COLS, LS_KEY, LS_Q, REMOTE_COLS, Session, Store, audit, can, config, fromDocRow, fromMessageRow, hasHealthConsent, isNetworkError, planOf, touch };
