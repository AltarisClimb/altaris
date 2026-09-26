import { setRenderer } from "./bus.js";
import { $ } from "./core.js";
import { Session, Store } from "./data.js";
import { fromRow, setExercises } from "./domain/exercises.js";
import { LANG, t } from "./i18n/index.js";
import { Remote } from "./remote.js";
import { toast } from "./ui/feedback.js";
import { viewAuth, viewSetPassword } from "./views/auth.js";
import { viewCalendar, viewOverview } from "./views/climber.js";
import { viewExercises, viewMessages, viewProfile } from "./views/library.js";
import { viewOnboarding } from "./views/onboarding.js";
import { HIDDEN_TABS, TABS, View, legalFooter, tabsBar, topbar, watermark } from "./views/shell.js";
import { viewAdmin, viewAthleteFile, viewFleet, viewInbox, viewPlanning } from "./views/staff.js";
import { bindTimer, updateLiveMetric, viewTests } from "./views/testing.js";
import { bindPlayer, viewPlayer } from "./views/player.js";
import { viewToday } from "./views/today.js";
/* Import à effet de bord : actions.js n'exporte rien que main utilise,
   mais il enregistre tous les écouteurs d'événements de l'application.
   Sans cette ligne l'interface s'affiche et ne répond à aucun clic. */
import "./actions.js";

/* ================================================================
   24. RENDER & BOOT
   ================================================================ */
let _rt = null;
function renderDebounced(){ clearTimeout(_rt); _rt = setTimeout(render, 140); }

function body(){
  if (Remote.enabled() && Remote.booting) return "<main></main>";    // session pas encore connue : pas de flash de l'écran de connexion
  if (Remote.recovery) return viewSetPassword();
  const me = Session.live();
  if (!me) return viewAuth();
  if (me.role === "climber" && View.onb) return viewOnboarding();
  if (View.player) return viewPlayer();                              // séance guidée : plein écran, sans onglets
  if (me.role === "climber" && !(me.profile||{}).onboarded && !View.onb){
    View.onb = { step:0, data: Object.assign({ sex:"x", discipline:"both", injuries:[], availability:[], goals:[] }, me.profile||{}) };
    return viewOnboarding();
  }
  if (!View.tab || !((TABS[me.role]||[]).some(x => x[0] === View.tab) || HIDDEN_TABS.includes(View.tab))) View.tab = TABS[me.role][0][0];
  let inner = "";
  switch (View.tab){
    case "today":     inner = viewToday(me); break;
    case "overview":  inner = viewOverview(me); break;
    case "calendar":  inner = viewCalendar(me, false); break;
    case "tests":     inner = viewTests(me); break;
    case "exercises": inner = viewExercises(); break;
    case "messages":  inner = viewMessages(me); break;
    case "profile":   inner = viewProfile(me); break;
    case "athletes":  inner = View.athlete ? viewAthleteFile(me) : viewFleet(me); break;
    case "planning":  inner = viewPlanning(me); break;
    case "inbox":     inner = viewInbox(me); break;
    case "admin":     inner = viewAdmin(); break;
    default:          inner = viewOverview(me);
  }
  return tabsBar() + '<main>' + inner + '</main>';
}

function render(){
  if (!Store.ready) return;
  const app = $("#app");
  const act = document.activeElement;
  const fk = act && act.dataset ? act.dataset.fk : null;
  const selStart = act && typeof act.selectionStart === "number" ? act.selectionStart : null;
  const sy = window.scrollY;
  app.innerHTML = watermark() + topbar() + body() + legalFooter();
  if (fk){
    const el = $('[data-fk="' + fk + '"]');
    if (el){ el.focus(); if (selStart != null){ try{ el.setSelectionRange(selStart, selStart); }catch(e){} } }
  }
  window.scrollTo(0, sy);
  if (View.runner){ bindTimer(); updateLiveMetric(); }
  if (View.player) bindPlayer();
}

/* Le bus relie la couche de données au rendu sans créer de cycle. */
setRenderer(render);

/* Événements d'authentification survenus après le démarrage :
   déconnexion ailleurs (jeton révoqué) ou arrivée par un lien de réinitialisation. */
function onAuthEvent(event){
  if (event === "SIGNED_OUT" && Session.user){ Session.user = null; View.tab = null; View.athlete = null; render(); }
  if (event === "PASSWORD_RECOVERY") render();
}

/* Bibliothèque d'exercices depuis Supabase, avec une copie par utilisateur
   pour le mode hors ligne (au pied du mur, sans réseau). */
async function loadExercises(){
  if (!Remote.client || !Session.user) return;
  const key = "altaris.exercises." + Session.user.id;
  try{
    const rows = await Remote.exercises();
    setExercises(rows.map(fromRow));
    try{ localStorage.setItem(key, JSON.stringify(rows)); }catch(e){}
  }catch(e){
    try{ const rows = JSON.parse(localStorage.getItem(key) || "null"); if (rows) setExercises(rows.map(fromRow)); }catch(e2){}
  }
  try{ await Remote.loadAssignments(); }catch(e){ /* hors ligne : la liste d'affectations reste vide */ }
  render();
}

/* boot */
(async function boot(){
  document.documentElement.setAttribute("lang", LANG === "en" ? "en-US" : "fr-FR");
  /* Ouverture depuis une notification : /?tab=messages, /?tab=calendar… */
  const wantTab = new URLSearchParams(location.search).get("tab");
  if (wantTab && !new URLSearchParams(location.search).get("token_hash")) history.replaceState(null, "", location.pathname + location.hash);
  await Store.init();
  if (Remote.enabled()){
    setExercises([]);                    // la bibliothèque vient du serveur, pas de la banque intégrée
    try{
      await Remote.init(onAuthEvent);
      const link = await Remote.consumeEmailLink();
      if (link === "confirmed") toast(t("auth.emailConfirmed"), "good");
      if (link === "expired") toast(t("auth.linkExpired"), "crit");
      if (await Session.restoreRemote() === "suspended") toast(t("auth.suspended"), "crit");
    }catch(e){ toast(t("auth.remoteDown"), "crit"); }
    Remote.booting = false;
    loadExercises();
    if (Session.user) Store.startRemote();
  } else {
    Session.restore();
  }
  const me = Session.live();
  if (me) View.tab = wantTab && ((TABS[me.role]||[]).some(x => x[0] === wantTab) || HIDDEN_TABS.includes(wantTab))
    ? wantTab : TABS[me.role][0][0];
  render();
})();


/* Progressive Web App — real offline support, CDC §7.
   Only registers over http(s); a file:// open stays a plain page. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* render() est le point d'entrée du rendu : data.js, actions.js et les vues
   l'appellent toutes. Les déclarations de fonction étant hoistées, le cycle
   d'imports qui en résulte est résolu par le moteur de modules. */
export { _rt, body, loadExercises, render, renderDebounced };
