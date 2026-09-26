// Reminder 1 h before each planned session. Called every 5 minutes by pg_cron
// (see README §5) with the header  x-cron-secret: <CRON_SECRET>.
// Deploy with --no-verify-jwt: the shared secret is the check.
import { createClient } from "npm:@supabase/supabase-js@2";
import { zonedInstant } from "../_shared/ics.js";
import { langOf, pushTo, TEXT } from "../_shared/push.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });
const SITE = Deno.env.get("SITE_URL") ?? "";
const DEFAULT_TZ = "Europe/Paris";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  const now = Date.now();
  // Sessions dated yesterday..tomorrow (UTC) cover every time zone for the next hour.
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("athlete_docs").select("id, athlete_id, data")
    .eq("col", "sessions").in("data->>date", [day(now - 86400000), day(now), day(now + 86400000)]);

  const due = (rows ?? []).filter((r) => r.data?.status === "planned" && r.data?.time && r.data?.type !== "rest");
  if (!due.length) return new Response(JSON.stringify({ sent: 0 }));
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
  return new Response(JSON.stringify({ sent }));
});
