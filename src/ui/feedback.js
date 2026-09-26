import { $, esc } from "../core.js";
import { t } from "../i18n/index.js";
import { ic } from "./icons.js";
function toast(msg, kind){
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  el.setAttribute && el.setAttribute("role", kind === "crit" ? "alert" : "status");
  $("#toasts").appendChild(el);
  /* Une erreur doit pouvoir se lire : 6 s au lieu de 2,6 s ; un tap la ferme. */
  const hide = () => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; setTimeout(() => el.remove(), 260); };
  el.onclick = hide;
  setTimeout(hide, kind === "crit" ? 6000 : 2600);
}

/* ---------------- modal stack ---------------- */
const Modal = {
  open(opts){
    this.close();
    const root = $("#modal-root");
    root.innerHTML =
      '<div class="scrim" data-scrim><div class="modal' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title||"") + '">' +
        '<header><h3>' + esc(opts.title || "") + '</h3>' +
          '<button class="btn icon sm ghost" data-close aria-label="' + esc(t("g.close")) + '">' + ic("x") + '</button></header>' +
        '<div class="body">' + opts.body + '</div>' +
        (opts.footer ? '<footer>' + opts.footer + '</footer>' : '') +
      '</div></div>';
    const scrim = $("[data-scrim]", root);
    scrim.addEventListener("mousedown", e => { if (e.target === scrim) Modal.close(); });
    $("[data-close]", root).onclick = () => Modal.close();
    document.addEventListener("keydown", Modal._esc);
    if (opts.onMount) opts.onMount(root);
    const first = $(".body input, .body select, .body textarea, .body button", root);
    if (first && window.innerWidth > 760) first.focus();
  },
  _esc(e){ if (e.key === "Escape") Modal.close(); },
  close(){
    $("#modal-root").innerHTML = "";
    document.removeEventListener("keydown", Modal._esc);
  },
  isOpen(){ return !!$("#modal-root .scrim"); }
};

export { Modal, toast };
