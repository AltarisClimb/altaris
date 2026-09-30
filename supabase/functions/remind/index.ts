// Reminder 1 h before each planned session. Called every 5 minutes by pg_cron
// (see README §5) with the header  x-cron-secret: <CRON_SECRET>.
// Deploy with --no-verify-jwt: the shared secret is the check.
// Also, at each climber's local time: Sunday 18:00 "your streak is at stake" push,
// Monday 08:00 weekly email (Brevo, BREVO_API_KEY; only when weekly_email is on).
import { createClient } from "npm:@supabase/supabase-js@2";
import { zonedInstant } from "../_shared/ics.js";
import { langOf, pushTo, TEXT } from "../_shared/push.ts";
import { localParts, streakAtRisk, weekStart, weeklyDigest } from "../_shared/digest.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });
const SITE = Deno.env.get("SITE_URL") ?? "";
const DEFAULT_TZ = "Europe/Paris";

/** Sunday streak push and Monday email, for climbers whose local time is in the window. */
async function weekly(now: number) {
  const { data: people } = await admin.from("profiles").select("id, email, full_name, timezone, lang, status, role, weekly_email")
    .eq("role", "student").eq("status", "active");
  const due = (people ?? []).map((p) => ({ p, t: localParts(now, p.timezone || DEFAULT_TZ) }))
    .filter(({ p, t }) => (t.weekday === 6 && t.hour === 18) || (t.weekday === 0 && t.hour === 8 && p.weekly_email && p.email));
  if (!due.length) return { streak: 0, emails: 0 };
  const since = new Date(now - 120 * 86400000).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("athlete_docs").select("athlete_id, data").eq("col", "sessions")
    .in("athlete_id", due.map((d) => d.p.id)).gte("data->>date", since);
  const byUser: Record<string, any[]> = {};
  for (const r of rows ?? []) (byUser[r.athlete_id] ??= []).push(r.data);
  let streak = 0, emails = 0;
  const brevo = Deno.env.get("BREVO_API_KEY"), from = Deno.env.get("MAIL_FROM") ?? "noreply@altaris-climb.com";
  for (const { p, t } of due) {
    const sessions = byUser[p.id] ?? [];
    const ref = p.id + "@" + weekStart(t.date);
    if (t.weekday === 6) {
      const n = streakAtRisk(sessions, t.date);
      if (!n) continue;
      const { error } = await admin.from("notification_log").insert({ kind: "streak", ref });
      if (error) continue;
      const T = TEXT[langOf(p)];
      streak += await pushTo(admin, [p.id], { title: T.streak(n), body: T.streakD, url: SITE + "/?tab=today", tag: "streak" });
    } else if (brevo) {
      const lang = langOf(p);
      const d = weeklyDigest({ sessions, name: (p.full_name || "").split(" ")[0], today: t.date, lang, site: SITE });
      if (d.empty) continue;
      const { error } = await admin.from("notification_log").insert({ kind: "weekly", ref });
      if (error) continue;
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { name: "ALTARIS", email: from }, to: [{ email: p.email, name: p.full_name || undefined }],
          subject: d.subject, htmlContent: d.html, textContent: d.text }),
      });
      if (res.ok) emails++;
    }
  }
  return { streak, emails };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  const now = Date.now();
  const week = await weekly(now).catch(() => ({ streak: 0, emails: 0 }));
  // Sessions dated yesterday..tomorrow (UTC) cover every time zone for the next hour.
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("athlete_docs").select("id, athlete_id, data")
    .eq("col", "sessions").in("data->>date", [day(now - 86400000), day(now), day(now + 86400000)]);

  const due = (rows ?? []).filter((r) => r.data?.status === "planned" && r.data?.time && r.data?.type !== "rest");
  if (!due.length) return new Response(JSON.stringify({ sent: 0, ...week }));
  const ids = [...new Set(due.map((r) => r.athlete_id))];
  const { data: profs } = await admin.from("profiles").select("id, timezone, lang, status").in("id", ids);
  const prof = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));

  let sent = 0;
  for (const r of due) {
    const p = prof[r.athlete_id];
    if (!p || p.status !== "active") continue;
    const start = zonedInstant(r.data.date, r.data.time, p.timezone || DEFAULT_TZ);
    const inMin = (start - now) / 60000;
    if (inMin <= 0 || inMin > 60) continue;
    // One reminder per session and start time (a moved session is reminded again).
    const ref = r.id + "@" + r.data.date + "T" + r.data.time;
    const { error } = await admin.from("notification_log").insert({ kind: "reminder", ref });
    if (error) continue;                                   // already sent
    const T = TEXT[langOf(p)];
    sent += await pushTo(admin, [r.athlete_id], {
      title: T.reminder, body: r.data.title + " · " + r.data.time, url: SITE + "/?tab=calendar", tag: "remind-" + r.id,
    });
  }
  return new Response(JSON.stringify({ sent, ...week }));
});
