/* ALTARIS™ — client Supabase (authentification et profils)
   © 2026 ALTARIS™. All rights reserved.

   Seuls les comptes vivent ici pour l'instant : login, rôle, statut et
   rattachement coach. Le reste des collections reste dans Store (local).
   Le schéma dit admin/teacher/student, l'interface admin/coach/climber :
   la traduction se fait uniquement dans ce fichier. */
import { SUPABASE_ANON_KEY, SUPABASE_URL, VAPID_PUBLIC_KEY } from "./config.js";

/** Clé VAPID (base64url) → octets, pour pushManager.subscribe. */
function b64urlToBytes(s){
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

/** Version du texte de consentement santé affiché (à changer si le texte change). */
const HEALTH_CONSENT_VERSION = "v1";

const ROLE_IN  = { admin: "admin", teacher: "coach", student: "climber" };
const ROLE_OUT = { admin: "admin", coach: "teacher", climber: "student" };

/* Le client (UMD, ~200 Ko) n'est chargé que si le projet est configuré. */
function loadClient(){
  if (globalThis.supabase) return Promise.resolve(globalThis.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "src/vendor/supabase.js";
    s.onload = () => resolve(globalThis.supabase);
    s.onerror = () => reject(new Error("supabase client failed to load"));
    document.head.appendChild(s);
  });
}

/** Profil Supabase → champs du document "users" de l'application. */
function fromProfile(p){
  return {
    id: p.id,
    name: p.full_name || p.email || "—",
    email: p.email || "",
    role: ROLE_IN[p.role] || "climber",
    status: p.status,
    coachId: p.teacher_id || null,
    createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
    healthConsentAt: p.health_consent_at ? Date.parse(p.health_consent_at) : null,
    timezone: p.timezone || null,
    lang: p.lang || null,
    lastSeenAt: p.last_seen_at ? Date.parse(p.last_seen_at) : null,
    plan: p.plan || "trial",
    trialEndsAt: p.trial_ends_at ? Date.parse(p.trial_ends_at) : null,
    subscriptionStatus: p.subscription_status || null,
    weeklyEmail: p.weekly_email !== false,
    region: p.region || null,
    languages: Array.isArray(p.languages) ? p.languages : [],
    directoryOptin: !!p.directory_optin
  };
}

/** Différence entre deux documents "users", exprimée en colonnes de profiles. */
function profilePatch(before, after){
  const patch = {};
  if (before.name !== after.name) patch.full_name = after.name;
  if (before.role !== after.role) patch.role = ROLE_OUT[after.role];
  if (before.status !== after.status) patch.status = after.status;
  if (after.plan && before.plan !== after.plan) patch.plan = after.plan;
  if (after.weeklyEmail !== undefined && before.weeklyEmail !== after.weeklyEmail) patch.weekly_email = !!after.weeklyEmail;
  if (after.region !== undefined && (before.region || null) !== (after.region || null)) patch.region = after.region || null;
  if (after.languages !== undefined && (before.languages || []).join() !== (after.languages || []).join()) patch.languages = after.languages || [];
  if (after.directoryOptin !== undefined && !!before.directoryOptin !== !!after.directoryOptin) patch.directory_optin = !!after.directoryOptin;
  if ((before.trialEndsAt || null) !== (after.trialEndsAt || null))
    patch.trial_ends_at = after.trialEndsAt ? new Date(after.trialEndsAt).toISOString() : null;
  if ((before.coachId || null) !== (after.coachId || null) || patch.role){
    /* Seuls les élèves ont un coach : le trigger refuse le contraire. */
    patch.teacher_id = after.role === "climber" ? (after.coachId || null) : null;
  }
  return patch;
}

const Remote = {
  client: null,
  /** Mot de passe à redéfinir (arrivée par le lien « mot de passe oublié »). */
  recovery: false,
  /** Vrai tant que le démarrage n'a pas établi la session. */
  booting: true,
  /** Ids renvoyés par le dernier chargement : ce que la RLS laisse voir. */
  visible: new Set(),

  enabled(){ return !!(SUPABASE_URL && SUPABASE_ANON_KEY); },

  async init(onChange){
    if (!this.enabled()) return null;
    const lib = await loadClient();
    this.client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this.client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") this.recovery = true;
      /* Différé : le callback ne doit pas rappeler l'API auth en synchrone. */
      if (onChange) setTimeout(() => onChange(event), 0);
    });
    return this.client;
  },

  /** Lien reçu par e-mail (?token_hash=…&type=…) : la vérification se fait ici,
   *  sur le site, pas sur supabase.co. Renvoie "confirmed", "recovery",
   *  "expired" ou null s'il n'y a pas de lien dans l'adresse. */
  async consumeEmailLink(){
    /* Lien refusé par Supabase (expiré, déjà utilisé) : il revient avec #error=…&error_code=…
       On nettoie l'adresse et on le signale à l'écran de connexion. */
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("error_code") || h.get("error")){
      this.linkError = h.get("error_code") || h.get("error");
      history.replaceState(null, "", location.pathname + location.search);
      return "expired";
    }
    const q = new URLSearchParams(location.search);
    const token_hash = q.get("token_hash"), type = q.get("type");
    if (!token_hash || !type) return null;
    /* Le jeton ne sert qu'une fois : on le retire de l'adresse tout de suite. */
    history.replaceState(null, "", location.pathname + location.hash);
    const { error } = await this.client.auth.verifyOtp({ token_hash, type });
    if (error) return "expired";
    if (type === "recovery"){ this.recovery = true; return "recovery"; }
    return "confirmed";
  },

  async userId(){
    const { data } = await this.client.auth.getSession();
    return data.session ? data.session.user.id : null;
  },

  /** Profils visibles par l'utilisateur connecté (filtrés par la RLS). */
  async profiles(){
    const base = "id, email, full_name, role, status, teacher_id, created_at, health_consent_at, timezone, lang, last_seen_at, plan, trial_ends_at";
    /* Colonnes récentes absentes (migration pas encore appliquée) : on ne bloque pas
       la connexion pour autant, on relit avec un jeu de colonnes plus ancien. */
    const sets = [base + ", subscription_status, weekly_email, region, languages, directory_optin",
                  base + ", subscription_status, weekly_email", base];
    let data, error;
    for (const cols of sets){
      ({ data, error } = await this.client.from("profiles").select(cols));
      this.networkReady = !error && cols === sets[0];
      if (!error || error.code !== "42703") break;
    }
    if (error) throw error;
    return data.map(fromProfile);
  },
  networkReady: false,
  /** Annuaire réciproque (fonction directory()) : personnes inscrites, si je le suis aussi. */
  async directory(){
    const { data, error } = await this.client.rpc("directory");
    if (error) throw error;
    return (data || []).map(r => ({ id: r.id, name: r.name, role: ROLE_IN[r.role] || "climber", region: r.region, languages: r.languages || [] }));
  },

  /** Exercices visibles (RLS) : free pour tous, library pour coachs/admins,
   *  et pour un grimpeur ceux qui lui sont assignés. Lignes brutes. */
  async exercises(){
    const { data, error } = await this.client.from("exercises")
      .select("id, slug, visibility, category, level, title, content, video_url")
      .order("category").order("slug");
    if (error) throw error;
    return data;
  },

  /** Affectations visibles : un coach voit celles de ses grimpeurs, un admin
   *  toutes, un grimpeur les siennes. Gardées en mémoire pour les vues. */
  assignments: [],
  async loadAssignments(){
    const { data, error } = await this.client.from("assignments").select("id, exercise_id, student_id");
    if (error) throw error;
    this.assignments = data;
    return data;
  },
  async assign(exerciseUuid, studentId){
    const me = await this.userId();
    const { error } = await this.client.from("assignments")
      .insert({ exercise_id: exerciseUuid, student_id: studentId, assigned_by: me });
    if (error && error.code !== "23505") throw error;       // déjà assigné : rien à faire
    await this.loadAssignments();
  },
  async unassign(id){
    const { data, error } = await this.client.from("assignments").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new Error("assignment delete not permitted");
    await this.loadAssignments();
  },

  /* ---------- documents par athlète (table athlete_docs) ---------- */
  async docs(col){
    const { data, error } = await this.client.from("athlete_docs").select("id, athlete_id, data").eq("col", col);
    if (error) throw error;
    return data;
  },
  async putDoc(col, id, athleteId, data){
    const { error } = await this.client.from("athlete_docs")
      .upsert({ col, id, athlete_id: athleteId, data }, { onConflict: "col,id" });
    if (error) throw error;
  },
  async delDoc(col, id){
    const { error } = await this.client.from("athlete_docs").delete().eq("col", col).eq("id", id);
    if (error) throw error;
  },

  /* ---------- fichiers (bucket privé "media" : vidéos, vocaux) ----------
     Un dossier par grimpeur ; la RLS de Storage suit celle des documents. */
  async uploadMedia(athleteId, blob, ext, bucket){
    const path = athleteId + "/" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)) + "." + ext;
    const { error } = await this.client.storage.from(bucket || "media").upload(path, blob, { contentType: blob.type || undefined, upsert: false });
    if (error) throw error;
    return path;
  },
  _signed: {},
  /** Lien de lecture temporaire (1 h), gardé 50 min. */
  async mediaUrl(path, bucket){
    const b = bucket || "media", key = b + ":" + path, c = this._signed[key];
    if (c && c.until > Date.now()) return c.url;
    const { data, error } = await this.client.storage.from(b).createSignedUrl(path, 3600);
    if (error) throw error;
    this._signed[key] = { url: data.signedUrl, until: Date.now() + 50 * 60000 };
    return data.signedUrl;
  },
  async deleteMedia(path, bucket){
    const { error } = await this.client.storage.from(bucket || "media").remove([path]);
    if (error) throw error;
  },

  /* ---------- vidéos de démonstration des exercices (coachs, admins) ---------- */
  async exerciseDemos(){
    const { data, error } = await this.client.from("exercise_demos").select("exercise_id, path");
    if (error) throw error;
    return data;
  },
  async setDemo(exerciseUuid, path){
    const { data: { user } } = await this.client.auth.getUser();
    const { error } = await this.client.from("exercise_demos")
      .upsert({ exercise_id: exerciseUuid, path, added_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "exercise_id" });
    if (error) throw error;
  },
  async deleteDemo(exerciseUuid){
    const { error } = await this.client.from("exercise_demos").delete().eq("exercise_id", exerciseUuid);
    if (error) throw error;
  },
  /** Changements en direct (Realtime applique la même RLS).
   *  onDoc(col, id, row|null) pour athlete_docs, onMessage(row) pour chaque nouveau message. */
  watch(onDoc, onMessage){
    if (this._live) this.client.removeChannel(this._live);
    this._live = this.client.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "athlete_docs" }, (p) => {
        if (p.eventType === "DELETE") onDoc(p.old.col, p.old.id, null);
        else onDoc(p.new.col, p.new.id, p.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMessage(p.new))
      .subscribe();
  },

  /* ---------- présence : qui a l'appli ouverte ----------
     Un canal privé par grimpeur (presence:athlete:<id>) : le grimpeur, son coach
     et les admins y sont autorisés (politiques sur realtime.messages). */
  online: new Set(),
  _presence: [],
  startPresence(meId, athleteIds, onChange){
    this._presence.forEach(ch => this.client.removeChannel(ch));
    this._presence = [];
    const recompute = () => {
      const ids = new Set();
      this._presence.forEach(ch => Object.keys(ch.presenceState()).forEach(k => { if (k !== meId) ids.add(k); }));
      const changed = ids.size !== this.online.size || [...ids].some(id => !this.online.has(id));
      this.online = ids;
      if (changed && onChange) onChange();
    };
    [...new Set(athleteIds)].forEach(id => {
      const ch = this.client.channel("presence:athlete:" + id, { config: { private: true, presence: { key: meId } } });
      ch.on("presence", { event: "sync" }, recompute)
        .subscribe(status => { if (status === "SUBSCRIBED") ch.track({ at: Date.now() }).catch(() => {}); });
      this._presence.push(ch);
    });
  },
  /** « Vu il y a… » : dernière activité, au plus une écriture par minute. */
  async touchSeen(meId){
    if (!this.client || !meId || Date.now() - (this._seenAt || 0) < 60000) return;
    this._seenAt = Date.now();
    await this.client.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", meId);
  },

  /* ---------- messagerie (tables messages, message_reads) ---------- */
  async messages(){
    const { data, error } = await this.client.from("messages")
      .select("id, athlete_id, sender_id, body, context, video_url, created_at")
      .order("created_at").limit(5000);
    if (error) throw error;
    return data;
  },
  /** Mes marqueurs de lecture (la RLS ne renvoie que les miens). */
  async reads(){
    const { data, error } = await this.client.from("message_reads").select("athlete_id, user_id, last_read_at");
    if (error) throw error;
    return data;
  },
  async sendMessage(athleteId, msg){
    const { data, error } = await this.client.from("messages")
      .insert({ athlete_id: athleteId, body: msg.text, context: msg.ctx || null, video_url: msg.videoUrl || null })
      .select("id, athlete_id, sender_id, body, context, video_url, created_at").single();
    if (error) throw error;
    return data;
  },
  async markRead(athleteId, ts){
    const user_id = await this.userId();
    const { error } = await this.client.from("message_reads")
      .upsert({ athlete_id: athleteId, user_id, last_read_at: new Date(ts).toISOString() }, { onConflict: "athlete_id,user_id" });
    if (error) throw error;
  },

  /** Consentement RGPD art. 9 de l'utilisateur connecté (lui seul peut le donner ou le retirer).
   *  Le retrait efface côté serveur ses tests et son journal de douleur. */
  async setHealthConsent(on){
    const id = await this.userId();
    const patch = on ? { health_consent_at: new Date().toISOString(), health_consent_version: HEALTH_CONSENT_VERSION }
                     : { health_consent_at: null, health_consent_version: null };
    const { data, error } = await this.client.from("profiles").update(patch).eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new Error("consent update not permitted");
  },

  /* ---------- abonnement (Stripe, Edge Functions checkout / billing-portal) ---------- */
  /** Page de paiement Stripe pour cette formule ; lève une erreur si le paiement en ligne n'est pas en place. */
  async checkout(plan, period){
    const { data, error } = await this.client.functions.invoke("checkout", { body: { plan, period: period === "year" ? "year" : "month" } });
    if (error || !data || !data.url) throw error || new Error("checkout unavailable");
    return data.url;
  },
  /** Portail Stripe : carte enregistrée, factures, formule. Le compte client Stripe est créé au besoin. */
  async billingPortal(){
    const { data, error } = await this.client.functions.invoke("billing-portal", { body: {} });
    if (error || !data || !data.url) throw error || new Error("portal unavailable");
    return data.url;
  },

  /* ---------- notifications (Web Push) ---------- */
  /** Prévenir l'autre côté (Edge Function notify). Sans attente ni erreur visible : c'est un bonus. */
  notify(payload){
    if (!this.client || !VAPID_PUBLIC_KEY) return;
    this.client.functions.invoke("notify", { body: payload }).catch(() => {});
  },
  /** "on" | "off" | "denied" | "unsupported" (sur iPhone : appli non ajoutée à l'écran d'accueil). */
  async pushState(){
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  },
  async enablePush(){
    if (await Notification.requestPermission() !== "granted") throw new Error("permission");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await this.client.from("push_subscriptions")
      .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
    if (error) throw error;
  },
  async disablePush(){
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    await this.client.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  },

  /* ---------- abonnement d'agenda (Edge Function calendar) ---------- */
  /** Adresse privée du flux de séances ; créée à la première demande. */
  async calendarFeedUrl(lang){
    let { data } = await this.client.from("calendar_tokens").select("token").maybeSingle();
    if (!data){
      const r = await this.client.from("calendar_tokens").insert({}).select("token").single();
      if (r.error) throw r.error;
      data = r.data;
    }
    return SUPABASE_URL + "/functions/v1/calendar?t=" + data.token + (lang === "en" ? "&lang=en" : "");
  },
  /** Nouveau lien : l'ancien cesse de fonctionner (lien partagé par erreur, téléphone perdu…). */
  async resetCalendarFeed(){
    await this.client.from("calendar_tokens").delete().neq("token", "");
  },

  /** Fuseau et langue de l'appareil, pour les rappels et le texte des notifications. */
  async saveDeviceInfo(user, lang){
    let tz = null;
    try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; }catch(e){}
    if (!user || (user.timezone === tz && user.lang === lang)) return;
    await this.client.from("profiles").update({ timezone: tz, lang }).eq("id", user.id);
  },

  /* ---------- visios (Premium) : créneaux publiés par le coach ---------- */
  calls: [],
  /** Créneaux visibles (RLS) depuis hier : les siens pour un coach, ceux de son coach pour un grimpeur. */
  async loadCalls(){
    const { data, error } = await this.client.from("call_slots")
      .select("id, coach_id, starts_at, minutes, booked_by, booked_at, room")
      .gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at");
    if (error) throw error;
    this.calls = data.map(r => Object.assign({}, r, { start: Date.parse(r.starts_at) }));
    return this.calls;
  },
  async addSlots(coachId, starts){
    const rows = starts.map(ms => ({ coach_id: coachId, starts_at: new Date(ms).toISOString() }));
    const { error } = await this.client.from("call_slots").upsert(rows, { onConflict: "coach_id,starts_at", ignoreDuplicates: true });
    if (error) throw error;
  },
  async deleteSlot(id){
    const { error } = await this.client.from("call_slots").delete().eq("id", id);
    if (error) throw error;
  },
  /** Retirer plusieurs créneaux libres d'un coup (les réservés ne sont jamais touchés). */
  async deleteFreeSlots(ids){
    if (!ids.length) return;
    const { error } = await this.client.from("call_slots").delete().in("id", ids).is("booked_by", null);
    if (error) throw error;
  },
  /** Réserver : seulement si le créneau est encore libre (deux grimpeurs ne peuvent pas le prendre). */
  async bookSlot(id){
    const me = await this.userId();
    const { data, error } = await this.client.from("call_slots").update({ booked_by: me })
      .eq("id", id).is("booked_by", null).select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("slot taken"), { code: "slot_taken" });
  },
  async cancelBooking(id){
    const { error } = await this.client.from("call_slots").update({ booked_by: null }).eq("id", id);
    if (error) throw error;
  },
  jitsiUrl(room){ return "https://meet.jit.si/ALTARIS-" + room; },

  /* ---------- formules : demandes de changement ---------- */
  async requestPlan(plan){
    const { error } = await this.client.from("plan_requests").insert({ plan });
    if (error) throw error;
  },
  /** Demandes en attente (l'admin les voit toutes, un grimpeur les siennes). */
  async planRequests(){
    const { data, error } = await this.client.from("plan_requests")
      .select("id, user_id, plan, created_at").is("handled_at", null).order("created_at");
    if (error) throw error;
    return data;
  },
  async handlePlanRequest(id){
    const { error } = await this.client.from("plan_requests").update({ handled_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },

  /** Suppression définitive d'un compte (admin uniquement, vérifié par le serveur). */
  async deleteUser(id){
    const { error } = await this.client.rpc("admin_delete_user", { target: id });
    if (error) throw error;
  },

  async updateProfile(id, patch){
    /* Une ligne refusée par la RLS ne renvoie pas d'erreur, juste zéro ligne. */
    const { data, error } = await this.client.from("profiles").update(patch).eq("id", id).select("id");
    if (error) throw error;
    if (!data.length) throw new Error("profile update not permitted");
  },

  async signIn(email, password){
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  /** Renvoie true si une session est ouverte, false si l'e-mail doit être confirmé. */
  /** names = { first, last, full } ; le serveur recompose « Prénom NOM » à partir de first/last. */
  async signUp(email, password, names){
    const { data, error } = await this.client.auth.signUp({
      email, password,
      options: { data: { first_name: names.first, last_name: names.last, full_name: names.full },
                 emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    return !!data.session;
  },

  /** Renvoie l'e-mail de confirmation d'inscription (compte pas encore activé). */
  async resendConfirmation(email){
    const { error } = await this.client.auth.resend({ type: "signup", email,
      options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  },

  async resetPassword(email){
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  },

  async setPassword(password){
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    this.recovery = false;
  },

  async signOut(){
    try{ this.client.removeAllChannels(); await this.client.auth.signOut(); }
    catch(e){ /* déjà déconnecté ou hors ligne */ }
  }
};

export { HEALTH_CONSENT_VERSION, Remote, fromProfile, profilePatch };
