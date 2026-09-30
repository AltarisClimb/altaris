// Weekly digest and streak-at-risk logic for the remind function.
// Plain JS so Node's test runner covers it (tests/digest.test.js).

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** Local calendar date, weekday (0 = Monday) and hour of an instant in a time zone. */
export function localParts(nowMs, tz) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  return { date: p.year + "-" + p.month + "-" + p.day, weekday: wd, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Monday of the week of a YYYY-MM-DD date. */
export function weekStart(date) {
  const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  return addDays(date, -wd);
}

/** Weeks in a row with at least one session done, ending with last week (the current one may still come). */
export function streakBefore(sessions, today) {
  const weeks = new Set(sessions.filter((s) => s.status === "done").map((s) => weekStart(s.date)));
  let w = addDays(weekStart(today), -7), n = 0;
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}

/** Streak at risk: a streak of 2+ weeks and nothing done yet this week. */
export function streakAtRisk(sessions, today) {
  const ws = weekStart(today);
  const thisWeek = sessions.some((s) => s.status === "done" && s.date >= ws && s.date <= today);
  const n = streakBefore(sessions, today);
  return !thisWeek && n >= 2 ? n : 0;
}

const TXT = {
  fr: {
    subject: "Votre semaine d'escalade", hello: (n) => "Bonjour " + n + ",", last: "La semaine passée",
    done: (n, m) => n + " séance" + (n > 1 ? "s" : "") + " · " + m + " min d'entraînement", none: "Pas de séance la semaine passée : on repart cette semaine ?",
    streak: (n) => "Série en cours : " + n + " semaine" + (n > 1 ? "s" : "") + " d'affilée", next: "Au programme cette semaine",
    nothing: "Rien de prévu pour l'instant : créez votre programme dans l'appli.", open: "Ouvrir ALTARIS",
    foot: "Vous recevez ce récapitulatif car il est activé dans votre profil ALTARIS (Profil → Notifications).",
    days: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  },
  en: {
    subject: "Your climbing week", hello: (n) => "Hi " + n + ",", last: "Last week",
    done: (n, m) => n + " session" + (n > 1 ? "s" : "") + " · " + m + " min of training", none: "No session last week: shall we get going again?",
    streak: (n) => "Current streak: " + n + " week" + (n > 1 ? "s" : "") + " in a row", next: "Planned this week",
    nothing: "Nothing planned yet: create your programme in the app.", open: "Open ALTARIS",
    foot: "You get this recap because it is enabled in your ALTARIS profile (Profile → Notifications).",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
};
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Monday email: last week in numbers, the streak, this week's sessions. */
export function weeklyDigest({ sessions, name, today, lang, site }) {
  const T = TXT[lang === "en" ? "en" : "fr"];
  const ws = weekStart(today), prev = addDays(ws, -7);
  const done = sessions.filter((s) => s.status === "done" && s.type !== "rest" && s.date >= prev && s.date < ws);
  const minutes = done.reduce((n, s) => n + (s.actualMin || s.plannedMin || 0), 0);
  const planned = sessions.filter((s) => s.status === "planned" && s.type !== "rest" && s.date >= ws && s.date <= addDays(ws, 6))
    .sort((a, b) => ((a.date + (a.time || "")) < (b.date + (b.time || "")) ? -1 : 1));
  const streak = streakBefore(sessions, today);
  const dayOf = (d) => T.days[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7];
  const lines = [
    T.hello(name || ""), "", T.last + " : " + (done.length ? T.done(done.length, minutes) : T.none),
    streak ? T.streak(streak) : "", "", T.next + " :",
    ...(planned.length ? planned.map((s) => "- " + dayOf(s.date) + (s.time ? " " + s.time : "") + " · " + s.title) : [T.nothing]),
    "", T.open + " : " + site, "", T.foot,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  const html =
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0B1220">' +
    '<p style="letter-spacing:.3em;font-size:12px;color:#0E7490;font-weight:700">ALTARIS</p>' +
    "<p>" + escH(T.hello(name || "")) + "</p>" +
    '<h2 style="font-family:Georgia,serif;font-weight:600;margin:18px 0 6px">' + escH(T.last) + "</h2>" +
    "<p>" + escH(done.length ? T.done(done.length, minutes) : T.none) + "</p>" +
    (streak ? "<p><b>" + escH(T.streak(streak)) + "</b></p>" : "") +
    '<h2 style="font-family:Georgia,serif;font-weight:600;margin:18px 0 6px">' + escH(T.next) + "</h2>" +
    (planned.length ? "<ul>" + planned.map((s) => "<li>" + escH(dayOf(s.date) + (s.time ? " " + s.time : "") + " · " + s.title) + "</li>").join("") + "</ul>"
      : "<p>" + escH(T.nothing) + "</p>") +
    '<p style="margin:24px 0"><a href="' + escH(site) + '" style="background:#0E7490;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">' + escH(T.open) + "</a></p>" +
    '<p style="font-size:12px;color:#667">' + escH(T.foot) + "</p></div>";
  return { subject: T.subject, text: lines.join("\n"), html, empty: !done.length && !planned.length && !streak };
}
