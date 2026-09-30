/* ALTARIS™ — mise en réseau : région déclarée, langues parlées, annuaire
   © 2026 ALTARIS™. All rights reserved.

   La région est déclarée par la personne (pas de géolocalisation). L'annuaire
   est réciproque : on n'y voit les autres que si l'on y figure soi-même. */

/** Régions proposées. La valeur enregistrée est le nom lui-même (nom propre). */
const REGIONS = [
  "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est",
  "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur", "Outre-mer",
  "Belgique", "Suisse", "Luxembourg", "Québec", "Canada", "United Kingdom", "United States", "España", "Italia", "Deutschland"
];
const REGION_OTHER = "other";

/** Langues proposées (codes ISO 639-1). */
const LANGUAGES = ["fr", "en", "es", "de", "it", "pt", "nl", "ca", "ar", "pl"];

/** Nom d'une langue dans la langue de l'application (« Anglais », « English »). */
function languageName(code, locale){
  try{
    const n = new Intl.DisplayNames([locale || "fr"], { type: "language" }).of(code);
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
  }catch(e){ return code; }
}

/** Langues valides, sans doublon, dans l'ordre proposé. */
function cleanLanguages(list){
  const set = new Set(Array.isArray(list) ? list : []);
  return LANGUAGES.filter(l => set.has(l));
}

/** Annuaire vu par `me` : même région d'abord, puis langue commune ; vide si `me` n'y figure pas. */
function directoryFor(me, people){
  if (!me || !me.directoryOptin) return [];
  const mine = new Set(me.languages || []);
  return (people || [])
    .filter(p => p.id !== me.id && p.region)
    .map(p => Object.assign({}, p, {
      sameRegion: !!me.region && p.region === me.region,
      shared: (p.languages || []).filter(l => mine.has(l))
    }))
    .sort((a, b) => (b.sameRegion - a.sameRegion) || (b.shared.length - a.shared.length) ||
      (a.role === b.role ? 0 : a.role === "climber" ? 1 : -1) || a.name.localeCompare(b.name));
}

export { LANGUAGES, REGIONS, REGION_OTHER, cleanLanguages, directoryFor, languageName };
