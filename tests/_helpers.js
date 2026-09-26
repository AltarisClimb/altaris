/* ALTARIS™ — utilitaires de test
   © 2026 ALTARIS™. All rights reserved. */
import { COLS, Store } from "../src/data.js";

/** Repart d'une base vide. La couche de données est un objet simple :
 *  les tests écrivent dedans directement, sans réseau ni navigateur. */
export function resetStore(){
  Store.data = {};
  COLS.forEach(c => { Store.data[c] = {}; });
  Store.ready = true;
  Store.mode = "local";
  Store.queue = [];
}

/** Enregistre une séance validée pour l'athlète donné. */
export function logSession(userId, date, load){
  const id = "s-" + userId + "-" + date;
  Store.data.sessions[id] = { id, userId, date, status: "done", load, type: "boulder" };
}

/** Écrase la configuration globale (seuils ACWR, etc.). */
export function setConfig(patch){
  Store.data.config.global = Object.assign({ id: "global" }, patch);
}
