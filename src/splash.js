/* ALTARIS™ — écran d'ouverture
   © 2026 ALTARIS™. All rights reserved.
   Script classique, chargé juste après le bloc #splash d'index.html (fichier
   séparé : la CSP interdit les scripts inline). L'animation est en CSS ; ici on
   la montre une fois par session, on la retire à la fin, et un toucher la passe. */
(function(){
  var el = document.getElementById("splash");
  if (!el) return;
  var seen = false;
  try{ seen = sessionStorage.getItem("altaris.splash") === "1"; sessionStorage.setItem("altaris.splash", "1"); }catch(e){}
  function done(){ if (el.parentNode) el.parentNode.removeChild(el); }
  if (seen){ done(); return; }
  /* Appli installée : l'écran de lancement du système montre déjà le logo sur le
     même fond. On enchaîne sans le redessiner, pour une seule transition continue. */
  try{
    if (navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches)) el.classList.add("sp-app");
  }catch(e){}
  el.addEventListener("click", function(){ el.classList.add("out"); setTimeout(done, 450); });
  setTimeout(done, el.classList.contains("sp-app") ? 3200 : 3700);
})();
