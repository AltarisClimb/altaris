import { setRenderer } from "./bus.js";
import { $ } from "./core.js";
import { Session, Store } from "./data.js";
import { LANG } from "./i18n/index.js";
import { viewAuth } from "./views/auth.js";
import { viewCalendar, viewOverview } from "./views/climber.js";
import { viewExercises, viewMessages, viewProfile } from "./views/library.js";
import { viewOnboarding } from "./views/onboarding.js";
import { TABS, View, legalFooter, tabsBar, topbar, watermark } from "./views/shell.js";
import { viewAccounts, viewAthleteFile, viewAudit, viewFleet, viewPairings, viewParams, viewPlanning } from "./views/staff.js";
import { bindTimer, updateLiveMetric, viewTests } from "./views/testing.js";
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
  const me = Session.live();
  if (!me) return viewAuth();
  if (me.role === "climber" && View.onb) return viewOnboarding();
  if (me.role === "climber" && !(me.profile||{}).onboarded && !View.onb){
    View.onb = { step:0, data: Object.assign({ sex:"x", discipline:"both", injuries:[], availability:[], goals:[] }, me.profile||{}) };
    return viewOnboarding();
  }
  if (!View.tab || !(TABS[me.role]||[]).some(x => x[0] === View.tab)) View.tab = TABS[me.role][0][0];
  let inner = "";
  switch (View.tab){
    case "overview":  inner = viewOverview(me); break;
    case "calendar":  inner = viewCalendar(me, false); break;
    case "tests":     inner = viewTests(me); break;
    case "exercises": inner = viewExercises(); break;
    case "messages":  inner = viewMessages(me); break;
    case "profile":   inner = viewProfile(me); break;
    case "athletes":  inner = View.athlete ? viewAthleteFile(me) : viewFleet(me); break;
    case "planning":  inner = viewPlanning(me); break;
    case "accounts":  inner = viewAccounts(); break;
    case "pairings":  inner = viewPairings(); break;
    case "params":    inner = viewParams(); break;
    case "audit":     inner = viewAudit(); break;
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
}

/* Le bus relie la couche de données au rendu sans créer de cycle. */
setRenderer(render);

/* boot */
(async function boot(){
  document.documentElement.setAttribute("lang", LANG === "en" ? "en-US" : "fr-FR");
  await Store.init();
  Session.restore();
  const me = Session.live();
  if (me) View.tab = TABS[me.role][0][0];
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
export { _rt, body, render, renderDebounced };
