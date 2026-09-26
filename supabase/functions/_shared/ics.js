// iCalendar feed of a climber's sessions, for the `calendar` Edge Function.
// Same format as src/domain/calendar.js (the in-app download); tests/feed.test.js
// checks both stay in line. Plain JS with no imports so Deno and Node can load it.

const DEFAULT_TIME = "18:00";
const DEFAULT_MIN = 60;

const TEXT = {
  fr: { min: "min", intensity: (n) => "Intensité " + n + "/10", reminder: (t) => "Séance dans 1 h : " + t, cal: "ALTARIS — séances" },
  en: { min: "min", intensity: (n) => "Intensity " + n + "/10", reminder: (t) => "Session in 1 h: " + t, cal: "ALTARIS — sessions" },
};

const pad = (n) => String(n).padStart(2, "0");
const local = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00";
const utc = (d) => local(d).slice(0, 13) + pad(d.getUTCSeconds()) + "Z";

function escapeText(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line) {
  const enc = new TextEncoder();
  const out = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = " " + ch; bytes = 1 + b; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n");
}

/** sessions: [{ id, date, time?, title, type, plannedMin, targetIntensity, notes, exercises, status }]
 *  opts: { lang, names: { [exerciseId]: name }, url, now } — times are floating (the phone's local time). */
export function buildFeed(sessions, opts = {}) {
  const T = TEXT[opts.lang] || TEXT.fr;
  const now = opts.now || new Date();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ALTARIS//Seances//FR", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:" + escapeText(T.cal), "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const s of sessions) {
    if (!s.date || s.type === "rest") continue;
    const [y, m, d] = s.date.split("-").map(Number);
    const [hh, mm] = (s.time || DEFAULT_TIME).split(":").map(Number);
    // Wall-clock arithmetic in UTC fields, written without a zone: stays "floating".
    const start = new Date(Date.UTC(y, m - 1, d, hh, mm));
    const end = new Date(start.getTime() + (s.plannedMin || DEFAULT_MIN) * 60000);
    const names = (s.exercises || []).map((id) => (opts.names || {})[id]).filter(Boolean).map((n) => "• " + n);
    const desc = [(s.plannedMin || DEFAULT_MIN) + " " + T.min + " · " + T.intensity(s.targetIntensity || 5)]
      .concat(s.notes ? ["", s.notes] : [])
      .concat(names.length ? [""].concat(names) : [])
      .concat(opts.url ? ["", opts.url] : []).join("\n");
    lines.push("BEGIN:VEVENT",
      "UID:" + s.id + "@altaris-climb.com",
      "DTSTAMP:" + utc(now),
      "DTSTART:" + local(start),
      "DTEND:" + local(end),
      "SUMMARY:" + escapeText("ALTARIS · " + s.title),
      "DESCRIPTION:" + escapeText(desc),
      ...(opts.url ? ["URL:" + opts.url] : []),
      "STATUS:" + (s.status === "missed" ? "CANCELLED" : "CONFIRMED"),
      ...(s.status === "planned" ? ["BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H",
        "DESCRIPTION:" + escapeText(T.reminder(s.title)), "END:VALARM"] : []),
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Instant (ms) of a wall-clock time in an IANA time zone, e.g. ("2026-09-30", "18:30", "Europe/Paris"). */
export function zonedInstant(date, time, timeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - ms;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);          // second pass settles DST transitions
}
