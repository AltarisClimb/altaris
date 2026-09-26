/* ALTARIS™ — client Supabase (authentification et profils)
   © 2026 ALTARIS™. All rights reserved.

   Seuls les comptes vivent ici pour l'instant : login, rôle, statut et
   rattachement coach. Le reste des collections reste dans Store (local).
   Le schéma dit admin/teacher/student, l'interface admin/coach/climber :
   la traduction se fait uniquement dans ce fichier. */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

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
    createdAt: p.created_at ? Date.parse(p.created_at) : Date.now()
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
      .select("id, email, full_name, role, status, teacher_id, created_at");
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

  async signOut(){ try{ await this.client.auth.signOut(); }catch(e){ /* déjà déconnecté ou hors ligne */ } }
};

export { Remote, fromProfile, profilePatch };
