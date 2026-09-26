import { requestRender } from "./bus.js";
import { t } from "./i18n/index.js";
import { toast } from "./ui/feedback.js";
/* ================================================================
   2. PERSISTENCE LAYER
   Shared artifact database when granted, with a local write-behind
   cache so entries made at the wall survive a dropped connection.
   ================================================================ */
const COLS = ["users", "assessments", "sessions", "pain", "threads", "routines", "config", "audit"];
const LS_KEY = "altaris.cache.v1";
const LS_Q   = "altaris.queue.v1";

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

  /** Write a whole document. Optimistic locally, queued if the cloud refuses. */
  async put(col, id, obj){
    const doc = Object.assign({}, obj, { id: id });
    this.data[col] = this.data[col] || {};
    this.data[col][id] = doc;
    this.saveLocal();
    if (!this.silent) requestRender();
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
    if (this.mode !== "cloud" || !this.db){ this._enqueue({ op:"del", col, id }); return; }
    try{ await this.db.doc(col + "/" + id).delete(); }
    catch(e){ this._enqueue({ op:"del", col, id }); }
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
const _flushTimer = setInterval(() => Store.flush(), 12000);
if (_flushTimer && typeof _flushTimer.unref === "function") _flushTimer.unref();
if (typeof window !== "undefined") window.addEventListener("online", () => Store.flush());

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
  signIn(u){
    this.user = u;
    try{ localStorage.setItem("altaris.session", u.id); }catch(e){}
    touch(u.id);
    audit("sign_in", u.role);
  },
  signOut(){
    audit("sign_out", "");
    this.user = null;
    try{ localStorage.removeItem("altaris.session"); }catch(e){}
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
const Access = {
  /** Climbers visible to the signed-in user. */
  climbers(){
    const me = Session.live(); if (!me) return [];
    const all = Store.list("users").filter(u => u.role === "climber" && u.status !== "suspended");
    if (me.role === "admin") return all;
    if (me.role === "coach")  return all.filter(u => u.coachId === me.id);
    return all.filter(u => u.id === me.id);
  },
  canSee(userId){
    const me = Session.live(); if (!me) return false;
    if (me.id === userId) return true;
    if (me.role === "admin") return true;
    if (me.role === "coach"){ const u = Store.get("users", userId); return !!u && u.coachId === me.id; }
    return false;
  },
  /** Rows of a collection the signed-in user is allowed to read. */
  scoped(col){ return Store.list(col).filter(r => this.canSee(r.userId)); },
  myCoach(){
    const me = Session.live();
    return me && me.coachId ? Store.get("users", me.coachId) : null;
  }
};

export { Access, COLS, DEFAULT_CONFIG, LS_KEY, LS_Q, Session, Store, audit, config, touch };
