// POST /functions/v1/notify  { kind: "message" | "session", athleteId, sessionId?, update? }
// Called by the app right after a message is sent or a session is saved. The caller's
// own token proves who they are; the database decides whether they may reach that climber.
// Content is read from the database, never taken from the request.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, dayLabel, langOf, pushTo, TEXT } from "../_shared/push.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = Deno.env.get("SITE_URL") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const caller = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "auth" }, 401);

  const { kind, athleteId, sessionId, update } = await req.json().catch(() => ({}));
  if (!athleteId || !["message", "session"].includes(kind)) return json({ error: "input" }, 400);
  const { data: allowed } = await caller.rpc("can_access_athlete", { athlete: athleteId });
  if (!allowed) return json({ error: "forbidden" }, 403);

  const { data: athlete } = await admin.from("profiles").select("id, teacher_id, lang").eq("id", athleteId).single();
  const { data: me } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
  const fromName = me?.full_name || me?.email || "ALTARIS";

  // The other side of the conversation: the climber writes to their coach, staff write to the climber.
  const toIds = user.id === athleteId ? (athlete?.teacher_id ? [athlete.teacher_id] : []) : [athleteId];
  if (!toIds.length) return json({ sent: 0 });
  const { data: dest } = await admin.from("profiles").select("lang").eq("id", toIds[0]).single();
  const T = TEXT[langOf(dest)];

  if (kind === "message") {
    const { data: last } = await admin.from("messages").select("body").eq("athlete_id", athleteId)
      .eq("sender_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!last) return json({ sent: 0 });
    const body = last.body.length > 140 ? last.body.slice(0, 137) + "…" : last.body;
    return json({ sent: await pushTo(admin, toIds, { title: T.message(fromName), body, url: SITE + "/?tab=messages", tag: "msg-" + athleteId }) });
  }

  // kind === "session": only staff plan sessions for a climber.
  if (user.id === athleteId || !sessionId) return json({ sent: 0 });
  const { data: doc } = await admin.from("athlete_docs").select("data").eq("col", "sessions").eq("id", sessionId)
    .eq("athlete_id", athleteId).maybeSingle();
  if (!doc) return json({ sent: 0 });
  const s = doc.data as { title: string; date: string; time?: string };
  const lang = langOf(dest);
  return json({ sent: await pushTo(admin, toIds, {
    title: update ? T.changedSession : T.newSession,
    body: s.title + " · " + T.at(dayLabel(s.date, lang), s.time),
    url: SITE + "/?tab=calendar", tag: "session-" + sessionId,
  }) });
});
