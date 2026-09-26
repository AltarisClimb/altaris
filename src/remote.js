/* ALTARIS™ — client Supabase (authentification et profils)
   © 2026 ALTARIS™. All rights reserved.

   Seuls les comptes vivent ici pour l'instant : login, rôle, statut et
   rattachement coach. Le reste des collections reste dans Store (local).
   Le schéma dit admin/teacher/student, l'interface admin/coach/climber :
   la traduction se fait uniquement dans ce fichier. */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

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
    healthConsentAt: p.health_consent_at ? Date.parse(p.health_consent_at) : null
  };
}

/** Différence entre deux documents "users", exprimée en colonnes de profiles. */
function profilePatch(before, after){
  const patch = {};
  if (before.name !== after.name) patch.full_name = after.name;
  if (before.role !== after.role) patch.role = ROLE_OUT[after.role];
  if (before.status !== after.status) patch.status = after.status;
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
    const { data, error } = await this.client.from("profiles")
      .select("id, email, full_name, role, status, teacher_id, created_at, health_consent_at");
    if (error) throw error;
    return data.map(fromProfile);
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
  /** Changements en direct (Realtime applique la même RLS).
   *  onDoc(col, id, row|null) pour athlete_docs, onMessage(row) pour chaque nouveau message. */
  watch(onDoc, onMessage){
    this.client.removeAllChannels();
    this.client.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "athlete_docs" }, (p) => {
        if (p.eventType === "DELETE") onDoc(p.old.col, p.old.id, null);
        else onDoc(p.new.col, p.new.id, p.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => onMessage(p.new))
      .subscribe();
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
  async signUp(email, password, fullName){
    const { data, error } = await this.client.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    return !!data.session;
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
