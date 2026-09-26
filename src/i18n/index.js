import { requestRender } from "../bus.js";
import { diffDays, parseISO, today } from "../core.js";
import FR from "./fr-FR.js";
import EN from "./en-US.js";
/* ================================================================
   1. INTERNATIONALIZATION  —  strict fr-FR / en-US dictionaries
   ================================================================ */


/* Dictionnaires plats, un fichier par locale (CDC §7).
   Ajouter une langue = un fichier de plus dans cette table. */
const DICTS = { fr: FR, en: EN };
const FALLBACK = "fr";

/* --- language state --- */
/** First supported language in the user's preference list ("de-DE", "en-GB" → "en"). */
function pickLang(tags){
  for (const tag of tags || []){
    const base = String(tag || "").toLowerCase().split("-")[0];
    if (DICTS[base]) return base;
  }
  return FALLBACK;
}
function systemLang(){
  try{ return pickLang(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]); }
  catch(e){ return FALLBACK; }
}

/* La langue est toujours celle du téléphone ou de l'ordinateur : pas de choix
   manuel. Un ancien choix enregistré (sélecteur FR/EN retiré) est effacé. */
try{ localStorage.removeItem("altaris.lang"); }catch(e){}
let LANG = systemLang();
const LI = () => (LANG === "en" ? 1 : 0);

function applyLang(){
  LANG = systemLang();
  try{ document.documentElement.setAttribute("lang", LANG === "en" ? "en-US" : "fr-FR"); }catch(e){}
  requestRender();
}
if (typeof window !== "undefined"){
  window.addEventListener("languagechange", applyLang);
}
/** Traduit une clé. Repli sur le français puis sur la clé brute,
 *  pour qu'une clé manquante reste visible au lieu de rendre du vide. */
function t(key, vars){
  const d = DICTS[LANG] || DICTS[FALLBACK];
  let s = d[key];
  if (s == null) s = DICTS[FALLBACK][key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  return s;
}
/** locale-aware helpers */
const LOC = () => (LANG === "en" ? "en-US" : "fr-FR");
const fmtDate = (s, opt) => parseISO(s).toLocaleDateString(LOC(), opt || { day:"2-digit", month:"short" });
const fmtDateLong = (s) => parseISO(s).toLocaleDateString(LOC(), { weekday:"long", day:"numeric", month:"long", year:"numeric" });
const fmtNum = (n, d) => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString(LOC(), { minimumFractionDigits: d||0, maximumFractionDigits: d||0 });
const fmtTime = (ts) => new Date(ts).toLocaleString(LOC(), { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
function relDays(dateStr){
  const n = diffDays(today(), dateStr);
  if (n === 0) return t("g.today");
  if (LANG === "en") return n > 0 ? n + "d ago" : "in " + (-n) + "d";
  return n > 0 ? "il y a " + n + " j" : "dans " + (-n) + " j";
}

/** Temps écoulé depuis un instant (ms) : « à l'instant », « il y a 5 min », « il y a 3 h », puis en jours. */
function relTime(ts, now){
  const min = Math.floor(((now || Date.now()) - ts) / 60000);
  if (min < 2) return t("g.justNow");
  if (min < 60) return t("g.minAgo", { n: min });
  if (min < 24 * 60) return t("g.hAgo", { n: Math.floor(min / 60) });
  return relDays(new Date(ts).toISOString().slice(0, 10));
}

export { DICTS, LANG, LI, LOC, fmtDate, fmtDateLong, fmtNum, fmtTime, pickLang, relDays, relTime, t };
