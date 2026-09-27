/* ================================================================
   ALTARIS™ Pro Platform — single-file build
   © 2026 ALTARIS™. All rights reserved. Registered Trademark.
   Confidential and Proprietary Systems.
   ================================================================ */

const APP_VERSION = "1.18.0";
const COPYRIGHT = "© 2026 ALTARIS™. All rights reserved. Registered Trademark. Confidential and Proprietary Systems.";

/* ---------------- tiny DOM helpers ---------------- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const uid = (p) => (p || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
/** « Prénom NOM » : prénom tel que saisi, nom de famille en majuscules (accents gardés), espaces nettoyés. */
const personName = (first, last) => [String(first || "").trim().replace(/\s+/g, " "),
  String(last || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("fr-FR")].filter(Boolean).join(" ");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d) => { const m = Math.pow(10, d || 0); return Math.round(v * m) / m; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const byId = (arr, id) => arr.find(x => x.id === id);

/* ---------------- date helpers (local, ISO yyyy-mm-dd) ---------------- */
const iso = (d) => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth()+1).padStart(2,"0") + "-" + String(x.getDate()).padStart(2,"0"); };
const parseISO = (s) => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
/** Monday-based start of week */
const weekStart = (s) => { const d = parseISO(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };

export { $, $$, APP_VERSION, COPYRIGHT, addDays, byId, clamp, diffDays, esc, iso, parseISO, personName, round, sum, today, uid, weekStart };
