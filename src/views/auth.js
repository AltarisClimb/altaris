import { $, esc, personName, uid } from "../core.js";
import { Session, Store, audit } from "../data.js";
import { t } from "../i18n/index.js";
import { body, loadExercises, render } from "../main.js";
import { topo } from "../ui/brand.js";
import { Remote } from "../remote.js";
import { Modal, toast } from "../ui/feedback.js";
import { ic } from "../ui/icons.js";
import { TABS, View, initials } from "./shell.js";
/* ================================================================
   10. AUTH
   ================================================================ */
/* Le logo est déjà dans la barre du haut : pas de second logo ni de slogan ici. */
/** Champ mot de passe avec un bouton Afficher / Masquer. */
function pwField(id, attrs){
  return '<span class="unit"><input class="inp" id="' + id + '"' + attrs + '>' +
    '<button type="button" class="u pw-eye" data-act="pw-toggle" data-v="' + id + '" aria-pressed="false">' + esc(t("auth.show")) + '</button></span>';
}

function authHead(){ return topo(); }

/* ---------------- Supabase : e-mail + mot de passe ---------------- */
function viewAuthRemote(){
  return '<main><div class="stack lg" style="max-width:520px;margin:22px auto 0">' + authHead() +
    '<form class="panel pad stack" data-act-submit="remote-signin" novalidate>' +
      '<div class="stack sm"><span class="eyebrow">' + esc(t("auth.title")) + '</span>' +
        '<p class="muted small">' + esc(t("auth.remoteSubtitle")) + '</p></div>' +
      '<label class="f"><span class="lb">' + esc(t("auth.email")) + '</span>' +
        '<input class="inp" id="li-mail" data-fk="li-mail" type="email" autocomplete="username" required></label>' +
      '<label class="f"><span class="lb">' + esc(t("auth.password")) + '</span>' +
        pwField("li-pass", ' data-fk="li-pass" type="password" autocomplete="current-password" required') + '</label>' +
      '<div id="li-err" class="notice crit" style="display:none">' + ic("alert") + '<span></span></div>' +
      '<button class="btn sm" type="button" id="li-resend" data-act="resend-confirm" style="display:none">' + ic("send") + esc(t("auth.resend")) + '</button>' +
      '<button class="btn pri wide" type="submit">' + esc(t("auth.signIn")) + '</button>' +
      '<button class="btn ghost sm" type="button" data-act="remote-forgot">' + esc(t("auth.forgot")) + '</button>' +
    '</form>' +
    '<button class="btn wide" data-act="new-account">' + ic("plus") + esc(t("auth.create")) + '</button>' +
    '<div class="notice"><span>' + ic("lock") + '</span><span><b>' + esc(t("auth.security")) + '</b><br>' + esc(t("auth.securityRemoteD")) + '</span></div>' +
  '</div></main>';
}

function authError(root, msg){
  const e = $("#li-err", root) || $("#na-err", root) || $("#sp-err", root);
  if (!e) return toast(msg, "crit");
  e.style.display = "flex"; $("span", e).textContent = msg;
}

/** Message lisible pour les erreurs usuelles de Supabase Auth. */
function authMessage(err){
  const code = err && (err.code || "");
  if (err && (err.name === "AuthRetryableFetchError" || err instanceof TypeError)) return t("auth.remoteDown");
  if (code === "invalid_credentials") return t("auth.badCredentials");
  if (code === "email_not_confirmed") return t("auth.notConfirmed");
  if (code === "user_already_exists") return t("auth.exists");
  if (code === "weak_password") return t("auth.weakPassword");
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return t("auth.rateLimited");
  return (err && err.message) || t("er.saveFailed");
}

async function remoteSignIn(){
  const mail = $("#li-mail").value.trim(), pass = $("#li-pass").value;
  if (!mail || !pass) return authError(document, t("er.required"));
  const resend = $("#li-resend");
  if (resend) resend.style.display = "none";
  try{ await Remote.signIn(mail, pass); }
  catch(e){
    /* Compte pas encore activé : proposer de renvoyer l'e-mail de confirmation. */
    if (e && e.code === "email_not_confirmed" && resend) resend.style.display = "";
    return authError(document, authMessage(e));
  }
  const state = await Session.restoreRemote();
  if (state === "suspended") return authError(document, t("auth.suspended"));
  if (!Session.user) return authError(document, t("auth.noProfile"));
  enter(Session.user);
}

function enter(u){
  Session.signIn(u);
  loadExercises();
  Store.startRemote();
  View.tab = TABS[u.role][0][0];
  render();
}

/* ---------------- e-mail de confirmation : renvoi ----------------
   Supabase limite les envois ; le bouton attend 60 s entre deux renvois. */
const RESEND_WAIT = 60;
async function resendConfirmation(email, btn){
  if (!email) return toast(t("auth.forgotNeedsMail"), "crit");
  const label = btn.innerHTML;
  btn.disabled = true;
  try{ await Remote.resendConfirmation(email); toast(t("auth.resent", { email }), "good"); }
  catch(e){ btn.disabled = false; return toast(authMessage(e), "crit"); }
  let left = RESEND_WAIT;
  btn.textContent = t("auth.resendIn", { n: left });
  const timer = setInterval(() => {
    left--;
    if (!btn.isConnected || left <= 0){ clearInterval(timer); btn.disabled = false; btn.innerHTML = label; return; }
    btn.textContent = t("auth.resendIn", { n: left });
  }, 1000);
}

/** Depuis l'écran de connexion (compte pas encore activé). */
function resendFromLogin(el){ resendConfirmation($("#li-mail").value.trim(), el); }

/** Après l'inscription : vérifier sa boîte mail, avec renvoi possible. */
function checkMailModal(email){
  Modal.open({
    title: t("auth.checkMail"),
    body: '<div class="stack center">' +
      '<div class="pl-burst" style="--type:var(--accent)">' + ic("send") + '</div>' +
      '<p style="line-height:1.6">' + esc(t("auth.checkMailD", { email })) + '</p>' +
      '<p class="small muted" style="line-height:1.55">' + esc(t("auth.checkSpam")) + '</p>' +
    '</div>',
    footer: '<button class="btn" id="cm-resend">' + ic("send") + esc(t("auth.resend")) + '</button>' +
            '<button class="btn pri" data-c>' + esc(t("g.close")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#cm-resend", root).onclick = (e) => resendConfirmation(email, e.currentTarget);
    }
  });
}

async function remoteForgot(){
  const mail = $("#li-mail").value.trim();
  if (!mail) return authError(document, t("auth.forgotNeedsMail"));
  try{ await Remote.resetPassword(mail); toast(t("auth.resetSent"), "good"); }
  catch(e){ authError(document, authMessage(e)); }
}

function remoteSignUpModal(){
  Modal.open({
    title: t("auth.newTitle"),
    body: '<div class="stack">' +
      /* Prénom et nom séparés : le nom de famille est enregistré en majuscules. */
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("auth.firstName")) + '</span><input class="inp" id="na-first" autocomplete="given-name"></label>' +
        '<label class="f"><span class="lb">' + esc(t("auth.lastName")) + '</span><input class="inp" id="na-last" autocomplete="family-name" style="text-transform:uppercase"></label>' +
      '</div>' +
      '<label class="f"><span class="lb">' + esc(t("auth.email")) + '</span><input class="inp" id="na-mail" type="email" autocomplete="email"></label>' +
      '<label class="f"><span class="lb">' + esc(t("auth.password")) + '</span>' +
        pwField("na-pass", ' type="password" autocomplete="new-password"') +
        '<span class="hint">' + esc(t("auth.passwordHint")) + '</span></label>' +
      '<div class="notice acc">' + ic("shield") + '<span>' + esc(t("auth.remoteRoleD")) + '</span></div>' +
      '<div id="na-err" class="notice crit" style="display:none">' + ic("alert") + '<span></span></div>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="na-ok">' + esc(t("g.confirm")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#na-ok", root).onclick = async () => {
        const first = $("#na-first", root).value, last = $("#na-last", root).value;
        const name = first.trim() && last.trim() ? personName(first, last) : "";
        const mail = $("#na-mail", root).value.trim();
        const pass = $("#na-pass", root).value;
        if (!name || !mail || !pass) return authError(root, t("er.required"));
        if (pass.length < 8) return authError(root, t("auth.passwordHint"));
        let signedIn;
        try{ signedIn = await Remote.signUp(mail, pass, { first: personName(first, ""), last: personName("", last), full: name }); }
        catch(e){ return authError(root, authMessage(e)); }
        Modal.close();
        if (!signedIn){ checkMailModal(mail); return; }
        await Session.restoreRemote();
        if (!Session.user) return toast(t("auth.noProfile"), "crit");
        audit("account_created", Session.user.role);
        if (Session.user.role === "climber"){ View.onb = { step: 0, data: { sex:"x", discipline:"both", injuries: [], availability: [], goals: [] } }; }
        enter(Session.user);
      };
    }
  });
}

/** Arrivée par le lien « mot de passe oublié » : choisir le nouveau. */
function viewSetPassword(){
  return '<main><div class="stack lg" style="max-width:520px;margin:22px auto 0">' + authHead() +
    '<form class="panel pad stack" data-act-submit="remote-setpass" novalidate>' +
      '<span class="eyebrow">' + esc(t("auth.newPassword")) + '</span>' +
      '<label class="f"><span class="lb">' + esc(t("auth.password")) + '</span>' +
        pwField("sp-pass", ' data-fk="sp-pass" type="password" autocomplete="new-password"') +
        '<span class="hint">' + esc(t("auth.passwordHint")) + '</span></label>' +
      '<div id="sp-err" class="notice crit" style="display:none">' + ic("alert") + '<span></span></div>' +
      '<button class="btn pri wide" type="submit">' + esc(t("g.save")) + '</button>' +
    '</form></div></main>';
}

async function remoteSetPassword(){
  const pass = $("#sp-pass").value;
  if (pass.length < 8) return authError(document, t("auth.passwordHint"));
  try{ await Remote.setPassword(pass); }
  catch(e){ return authError(document, authMessage(e)); }
  toast(t("g.saved"), "good");
  await Session.restoreRemote();
  if (Session.user) enter(Session.user); else render();
}

/* ---------------- mode local : profils + code PIN ---------------- */
function viewAuth(){
  if (Remote.enabled()) return viewAuthRemote();
  const users = Store.list("users").filter(u => u.status !== "suspended");
  users.sort((a,b) => (a.role === b.role ? a.name.localeCompare(b.name) : (a.role === "admin" ? -1 : b.role === "admin" ? 1 : a.role === "coach" ? -1 : 1)));
  return '<main><div class="stack lg" style="max-width:520px;margin:22px auto 0">' +
    authHead() +
    (users.length ? (
      '<div class="stack sm"><span class="eyebrow">' + esc(t("auth.title")) + '</span>' +
      '<p class="muted small">' + esc(t("auth.subtitle")) + '</p>' +
      '<div class="panel rows">' + users.map(u =>
        '<button class="rw" data-act="pick-user" data-v="' + esc(u.id) + '">' +
          '<span class="avatar' + (u.role === "admin" ? " acc" : "") + '">' + esc(initials(u.name)) + '</span>' +
          '<span class="gr"><span class="t1">' + esc(u.name) + '</span>' +
          '<span class="t2">' + esc(t("role."+u.role)) + (u.demo ? " · demo" : "") + '</span></span>' +
          ic("chevR","chev") + '</button>').join("") +
      '</div></div>'
    ) : (
      '<div class="panel pad stack sm"><div class="empty">' + ic("users") +
        '<div class="t">' + esc(t("auth.noAccounts")) + '</div>' +
        '<div class="d">' + esc(t("auth.noAccountsD")) + '</div></div></div>'
    )) +
    '<div class="grid g2">' +
      '<button class="btn pri wide" data-act="new-account">' + ic("plus") + esc(t("auth.create")) + '</button>' +
      (users.length ? "" : '<button class="btn wide" data-act="seed-demo">' + ic("dl") + esc(t("auth.demoSeed")) + '</button>') +
    '</div>' +
    (users.length ? "" : '<p class="dim tiny center" style="max-width:44ch;margin:0 auto">' + esc(t("auth.demoSeedD")) + '</p>') +
    '<div class="notice"><span>' + ic("lock") + '</span><span><b>' + esc(t("auth.security")) + '</b><br>' + esc(t("auth.securityD")) + '</span></div>' +
  '</div></main>';
}

function askPin(user){
  Modal.open({
    title: user.name,
    body: '<div class="stack">' +
      '<div class="row"><span class="avatar lg' + (user.role==="admin"?" acc":"") + '">' + esc(initials(user.name)) + '</span>' +
        '<div><div style="font-weight:600">' + esc(user.name) + '</div>' +
        '<div class="dim small">' + esc(t("role."+user.role)) + '</div></div></div>' +
      '<label class="f"><span class="lb">' + esc(t("auth.pin")) + '</span>' +
        '<input class="inp num" id="pinf" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">' +
        '<span class="hint">' + esc(t("auth.pinHint")) + '</span></label>' +
      '<div id="pinerr" class="notice crit" style="display:none">' + ic("alert") + '<span>' + esc(t("auth.wrongPin")) + '</span></div>' +
    '</div>',
    footer: '<button class="btn ghost" data-close2>' + esc(t("g.cancel")) + '</button>' +
            '<button class="btn pri" id="pinok">' + esc(t("auth.signIn")) + '</button>',
    onMount(root){
      const go = () => {
        const v = $("#pinf", root).value.trim();
        if (v === String(user.pin)){ Modal.close(); Session.signIn(user); View.tab = TABS[user.role][0][0]; render(); }
        else { $("#pinerr", root).style.display = "flex"; $("#pinf", root).value = ""; $("#pinf", root).focus(); }
      };
      $("#pinok", root).onclick = go;
      $("#pinf", root).addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      $("[data-close2]", root).onclick = () => Modal.close();
      $("#pinf", root).focus();
    }
  });
}

function newAccountModal(){
  if (Remote.enabled()) return remoteSignUpModal();
  const isFirst = Store.list("users").length === 0;
  Modal.open({
    title: t("auth.newTitle"),
    body: '<div class="stack">' +
      /* Prénom et nom séparés : le nom de famille est enregistré en majuscules. */
      '<div class="grid g2">' +
        '<label class="f"><span class="lb">' + esc(t("auth.firstName")) + '</span><input class="inp" id="na-first" autocomplete="given-name"></label>' +
        '<label class="f"><span class="lb">' + esc(t("auth.lastName")) + '</span><input class="inp" id="na-last" autocomplete="family-name" style="text-transform:uppercase"></label>' +
      '</div>' +
      '<label class="f"><span class="lb">' + esc(t("auth.email")) + ' <span class="dim">(' + esc(t("g.optional")) + ')</span></span>' +
        '<input class="inp" id="na-mail" type="email" autocomplete="email"></label>' +
      '<label class="f"><span class="lb">' + esc(t("auth.choosePin")) + '</span>' +
        '<input class="inp num" id="na-pin" inputmode="numeric" maxlength="4" placeholder="0000"></label>' +
      (isFirst ? '<div class="notice acc">' + ic("shield") + '<span>' + esc(t("auth.noAccountsD")) + '</span></div>'
               : '<label class="f"><span class="lb">' + esc(t("auth.roleSel")) + '</span><select class="inp" id="na-role">' +
                 '<option value="climber">' + esc(t("role.climber")) + '</option>' +
                 '<option value="coach">' + esc(t("role.coach")) + '</option>' +
                 '</select><span class="hint">' + esc(t("auth.roleHint")) + '</span></label>') +
      '<div id="na-err" class="notice crit" style="display:none">' + ic("alert") + '<span></span></div>' +
    '</div>',
    footer: '<button class="btn ghost" data-c>' + esc(t("g.cancel")) + '</button><button class="btn pri" id="na-ok">' + esc(t("g.confirm")) + '</button>',
    onMount(root){
      $("[data-c]", root).onclick = () => Modal.close();
      $("#na-ok", root).onclick = async () => {
        const first = $("#na-first", root).value, last = $("#na-last", root).value;
        const name = first.trim() && last.trim() ? personName(first, last) : "";
        const pin  = $("#na-pin", root).value.trim();
        const err  = (m) => { const e = $("#na-err", root); e.style.display = "flex"; $("span", e).textContent = m; };
        if (!name) return err(t("er.required"));
        if (!/^\d{4}$/.test(pin)) return err(t("er.pinFormat"));
        if (Store.list("users").some(u => u.name.toLowerCase() === name.toLowerCase())) return err(t("er.pinTaken"));
        const role = isFirst ? "admin" : $("#na-role", root).value;
        const u = {
          id: uid("u"), name, email: $("#na-mail", root).value.trim(), role, pin, status: "active",
          plan: "trial", coachId: null, createdAt: Date.now(), profile: { lastActive: Date.now() }
        };
        await Store.put("users", u.id, u);
        Modal.close();
        Session.signIn(u);
        audit("account_created", role);
        View.tab = TABS[role][0][0];
        if (role === "climber"){ View.onb = { step: 0, data: { sex:"x", discipline:"both", injuries: [], availability: [], goals: [] } }; }
        render();
      };
    }
  });
}

export { askPin, newAccountModal, remoteForgot, remoteSetPassword, remoteSignIn, resendFromLogin, viewAuth, viewSetPassword };
