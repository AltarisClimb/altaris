/* ALTARIS™ — bus de rendu
   © 2026 ALTARIS™. All rights reserved.

   La couche de données doit pouvoir demander un réaffichage sans importer
   l'interface : sans ce bus, data.js dépend de main.js, main.js dépend des
   vues, et la couche métier n'est plus testable hors navigateur.
   main.js enregistre le rendu au démarrage ; tout le reste passe par ici. */
let _render = () => {};

/** Enregistre la fonction de rendu. Appelé une fois, au démarrage. */
function setRenderer(fn){ _render = fn; }

/** Demande un réaffichage. Sans abonné (tests, Node), c'est un no-op. */
function requestRender(){ _render(); }

export { requestRender, setRenderer };
