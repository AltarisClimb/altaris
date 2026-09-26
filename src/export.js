import { $, APP_VERSION, COPYRIGHT, esc } from "./core.js";
import { COLS, Session, Store } from "./data.js";
import { t } from "./i18n/index.js";
import { body } from "./main.js";
import { Modal, toast } from "./ui/feedback.js";
import { ic } from "./ui/icons.js";
import { watermark } from "./views/shell.js";
/* ================================================================
   21. EXPORT
   ================================================================ */
async function saveFile(filename, text){
  let dl = null;
  try{ dl = await claude.use("downloads"); }catch(e){ dl = null; }
  if (dl){
    try{ await dl.save({ filename, data: text }); toast(t("g.saved"), "good"); return; }
    catch(e){ if (e && e.code === "declined") return; }
  }
  Modal.open({
    title: filename, wide: true,
    body: '<div class="stack"><p class="small muted">' + esc(t("g.copy")) + '</p>' +
      '<textarea class="inp" style="min-height:320px;font-family:var(--mono);font-size:11px" readonly id="ex-ta">' + esc(text) + '</textarea></div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.close")) + '</button><button class="btn pri" id="ex-cp">' + ic("copy") + esc(t("g.copy")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#ex-cp", root).onclick = () => { $("#ex-ta", root).select(); document.execCommand("copy"); toast(t("g.copied"), "good"); };
    }
  });
}
function exportPayload(scope){
  const me = Session.live();
  const stamp = { generatedAt: new Date().toISOString(), generatedBy: me ? me.name : "—", userId: me ? me.id : null,
                  notice: COPYRIGHT, watermark: (me ? me.name : "") + "|" + Date.now(), app: "ALTARIS " + APP_VERSION };
  if (scope === "mine" && me){
    return { _altaris: stamp, user: me,
      assessments: Store.list("assessments").filter(a => a.userId === me.id),
      sessions: Store.list("sessions").filter(s => s.userId === me.id),
      pain: Store.list("pain").filter(p => p.userId === me.id),
      threads: Store.list("threads").filter(x => (x.participants||[]).indexOf(me.id) >= 0) };
  }
  const o = { _altaris: stamp };
  COLS.forEach(c => o[c] = Store.list(c));
  return o;
}

export { downloadFile, exportPayload, saveFile };

/** Vrai téléchargement (Blob). Pour un .ics, le téléphone propose ensuite de
 *  l'ouvrir avec son agenda (Calendrier iOS, Google Agenda, Outlook…). */
function downloadFile(filename, text, mime){
  const blob = new Blob([text], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
