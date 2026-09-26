/* ALTARIS™ — séances vers l'agenda personnel (fichier iCalendar .ics)
   © 2026 ALTARIS™. All rights reserved.

   Chaque séance à venir devient un événement avec un rappel 1 h avant.
   L'UID est stable (id de la séance) : réimporter le fichier met à jour les
   événements au lieu de les dupliquer dans les agendas qui le gèrent. Les
   heures sont « flottantes » (sans fuseau) : l'agenda les lit à l'heure locale. */
import { diffDays, today } from "../core.js";
import { t } from "../i18n/index.js";
import { exById, exName } from "./exercises.js";

const DEFAULT_TIME = "18:00";
const DEFAULT_MIN = 60;
const REMINDER = "-PT1H";

/** 0 = lundi … 6 = dimanche, comme les créneaux de disponibilité. */
function weekdayIndex(iso){
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Heure de début : fixée par le coach, sinon le premier créneau déclaré ce jour-là, sinon null. */
function sessionStart(s, profile){
  if (s.time) return s.time;
  const slots = ((profile || {}).availability || []).filter(a => a.day === weekdayIndex(s.date));
  slots.sort((a, b) => (a.start < b.start ? -1 : 1));
  return slots.length ? slots[0].start : null;
}

/** Séances à mettre dans l'agenda : prévues, à partir d'aujourd'hui, hors jours de repos. */
function upcomingForAgenda(sessions, from){
  const d0 = from || today();
  return sessions.filter(s => s.status === "planned" && s.type !== "rest" && diffDays(s.date, d0) >= 0)
    .sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1));
}

const pad = (n) => String(n).padStart(2, "0");
function localStamp(date){
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "T" + pad(date.getHours()) + pad(date.getMinutes()) + "00";
}
function utcStamp(date){
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + "T" +
    pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + "Z";
}
function escapeText(s){
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** RFC 5545 : lignes de 75 octets au plus, suite précédée d'une espace. */
function fold(line){
  const enc = new TextEncoder();
  const out = []; let cur = "", bytes = 0;
  for (const ch of line){
    const b = enc.encode(ch).length;
    if (bytes + b > 75){ out.push(cur); cur = " " + ch; bytes = 1 + b; }
    else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n");
}

/** Fichier .ics des séances. opts : { profile, calName, url, now }. */
function buildICS(sessions, opts){
  const o = opts || {};
  const now = o.now || new Date();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ALTARIS//Seances//FR", "CALSCALE:GREGORIAN",
                 "METHOD:PUBLISH", "X-WR-CALNAME:" + escapeText(o.calName || "ALTARIS")];
  for (const s of sessions){
    const [y, m, d] = s.date.split("-").map(Number);
    const [hh, mm] = (sessionStart(s, o.profile) || DEFAULT_TIME).split(":").map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const end = new Date(start.getTime() + (s.plannedMin || DEFAULT_MIN) * 60000);
    const exercises = (s.exercises || []).map(id => { const e = exById(id); return e ? "• " + exName(e) : null; }).filter(Boolean);
    const desc = [t("st." + s.type) + " · " + (s.plannedMin || DEFAULT_MIN) + " " + t("g.min") + " · " + t("cal.intensity", { n: s.targetIntensity || 5 })]
      .concat(s.notes ? ["", s.notes] : [])
      .concat(exercises.length ? [""].concat(exercises) : [])
      .concat(o.url ? ["", o.url] : []).join("\n");
    lines.push("BEGIN:VEVENT",
      "UID:" + s.id + "@altaris-climb.com",
      "DTSTAMP:" + utcStamp(now),
      "DTSTART:" + localStamp(start),
      "DTEND:" + localStamp(end),
      "SUMMARY:" + escapeText("ALTARIS · " + s.title),
      "DESCRIPTION:" + escapeText(desc),
      ...(o.url ? ["URL:" + o.url] : []),
      "STATUS:CONFIRMED",
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + REMINDER,
      "DESCRIPTION:" + escapeText(t("cal.reminder", { title: s.title })),
      "END:VALARM",
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export { DEFAULT_TIME, buildICS, sessionStart, upcomingForAgenda, weekdayIndex };
