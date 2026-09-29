/* ALTARIS™ — matériel du grimpeur
   © 2026 ALTARIS™. All rights reserved.

   Le grimpeur déclare ce qu'il a sous la main (profile.gear). Les exercices de
   la base v2 listent leur matériel (content.meta.equipment, en français) : on
   écarte du programme ceux qui demandent un équipement absent, et le minuteur
   de suspension propose ses réglettes. Tant que rien n'est déclaré, tout passe. */

/* Clés proposées au grimpeur, dans l'ordre d'affichage. */
const GEAR = ["board", "pulley", "weights", "bar", "rings", "bands", "pinch", "campus", "wall", "sysboard", "lead", "speed"];
/* Profondeurs de réglettes proposées (mm). */
const EDGES = [6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 30, 35, 40];

/* Matériel de la base v2 → clé. Ce qui n'est pas listé (banc, corde à sauter,
   foam roller…) ne bloque jamais un exercice. */
const EQUIP_MAP = {
  "poutre": "board", "bloc de pince": "pinch", "campus board": "campus", "barre de traction": "bar",
  "haltères": "weights", "élastique": "bands", "anneaux/trx": "rings", "mur de bloc": "wall",
  "système board": "sysboard", "voie sae/falaise": "lead", "voie de vitesse": "speed"
};

/** Le grimpeur a-t-il déclaré son matériel ? */
const hasGear = (gear) => !!(gear && Array.isArray(gear.items));

/** Clés de matériel requises par un exercice (les inconnues sont ignorées). */
function required(ex){
  const list = (ex && ex.meta && ex.meta.equipment) || [];
  return [...new Set(list.map(x => EQUIP_MAP[String(x).toLowerCase()]).filter(Boolean))];
}

/** Matériel requis absent (vide si l'exercice est faisable ou si rien n'est déclaré). */
function missingGear(ex, gear){
  if (!hasGear(gear)) return [];
  const have = new Set(gear.items);
  /* Sur la poutre, le lest est une option (on peut aussi s'alléger) : les
     haltères ne bloquent pas un exercice « poutre + haltères ». */
  const req = required(ex);
  return req.filter(k => !have.has(k) && !(k === "weights" && req.includes("board")));
}
const usable = (ex, gear) => missingGear(ex, gear).length === 0;

/** Réglette la plus proche d'une profondeur visée, parmi celles déclarées. */
function nearestEdge(edges, target){
  const list = (edges || []).filter(n => n > 0);
  if (!list.length || !target) return null;
  return list.reduce((b, n) => (Math.abs(n - target) < Math.abs(b - target) || (Math.abs(n - target) === Math.abs(b - target) && n > b) ? n : b), list[0]);
}

/** Profondeur de réglette citée dans un texte (« réglette 20mm » → 20). */
function edgeInText(s){
  const m = String(s || "").match(/(\d{1,2})\s*mm/i);
  return m ? Number(m[1]) : null;
}

export { EDGES, EQUIP_MAP, GEAR, edgeInText, hasGear, missingGear, nearestEdge, required, usable };
