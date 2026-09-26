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
let LANG = (function(){
  try{
    const st = localStorage.getItem("altaris.lang");
    if (st === "fr" || st === "en") return st;
  }catch(e){}
  try{ return (navigator.language || "fr").toLowerCase().indexOf("en") === 0 ? "en" : "fr"; }catch(e){ return "fr"; }
})();
const LI = () => (LANG === "en" ? 1 : 0);
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
function setLang(l){
  LANG = l;
  try{ localStorage.setItem("altaris.lang", l); }catch(e){}
  document.documentElement.setAttribute("lang", l === "en" ? "en-US" : "fr-FR");
  requestRender();
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

export { DICTS, LANG, LI, LOC, fmtDate, fmtDateLong, fmtNum, fmtTime, relDays, setLang, t };
