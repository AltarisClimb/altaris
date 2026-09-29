/* ALTARIS™ — vidéos et messages vocaux : envoi, lecture, enregistrement
   © 2026 ALTARIS™. All rights reserved.

   En mode Supabase, les fichiers vont dans le bucket privé "media" (un dossier
   par grimpeur) et se lisent par lien temporaire. En mode local (démo), ils
   restent en mémoire le temps de la visite : chemins "local:…". */
import { Remote } from "./remote.js";

const LOCAL = new Map();          // chemin local → URL d'objet

const EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
              "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg" };
const MAX_BYTES = 150 * 1024 * 1024;

function extOf(blob){
  const type = (blob.type || "").split(";")[0];
  if (EXT[type]) return EXT[type];
  const m = /\.([a-z0-9]{2,4})$/i.exec(blob.name || "");
  return m ? m[1].toLowerCase() : "bin";
}

/** Envoie un fichier pour ce grimpeur ; renvoie son chemin. */
async function uploadMedia(athleteId, blob){
  if (blob.size > MAX_BYTES) { const e = new Error("too_big"); e.code = "too_big"; throw e; }
  if (!Remote.client){
    const path = "local:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "." + extOf(blob);
    LOCAL.set(path, URL.createObjectURL(blob));
    return path;
  }
  return Remote.uploadMedia(athleteId, blob, extOf(blob));
}

/** URL lisible par <video>/<audio>, ou null si le fichier n'est plus disponible. */
async function mediaUrl(path){
  if (!path) return null;
  if (path.startsWith("local:")) return LOCAL.get(path) || null;
  try{ return await Remote.mediaUrl(path); }catch(e){ return null; }
}

async function deleteMedia(path){
  if (!path) return;
  if (path.startsWith("local:")){ const u = LOCAL.get(path); if (u) URL.revokeObjectURL(u); LOCAL.delete(path); return; }
  try{ await Remote.deleteMedia(path); }catch(e){ /* déjà supprimé ou pas l'auteur : sans gravité */ }
}

/* ---------- message vocal ---------- */
function audioMime(){
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"])
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}
const canRecord = () => typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && audioMime() !== null;

/**
 * Enregistre au micro. start() → Promise, stop() → Promise<Blob>. Arrêt
 * automatique après maxSec secondes (onAuto est alors appelé avec le Blob).
 */
function voiceRecorder(maxSec, onAuto){
  let rec = null, stream = null, chunks = [], timer = null, resolveStop = null;
  const finish = () => new Promise(res => {
    resolveStop = res;
    if (rec && rec.state !== "inactive") rec.stop(); else res(null);
  });
  return {
    async start(){
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = audioMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(tr => tr.stop());
        clearTimeout(timer);
        const blob = new Blob(chunks, { type: (rec.mimeType || mime || "audio/webm").split(";")[0] });
        if (resolveStop) resolveStop(blob); else if (onAuto) onAuto(blob);
        resolveStop = null;
      };
      rec.start();
      timer = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, (maxSec || 120) * 1000);
    },
    stop: finish,
    cancel(){ resolveStop = () => {}; if (rec && rec.state !== "inactive") rec.stop(); }
  };
}

export { MAX_BYTES, canRecord, deleteMedia, mediaUrl, uploadMedia, voiceRecorder };
