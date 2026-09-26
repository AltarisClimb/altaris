// Private calendar feed: GET /functions/v1/calendar?t=<token>[&lang=en]
// Deploy with --no-verify-jwt: calendar apps cannot sign in; the secret token is the key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFeed } from "../_shared/ics.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

const notFound = () => new Response("Not found", { status: 404 });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return notFound();

  const { data: tok } = await admin.from("calendar_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tok) return notFound();
  const { data: prof } = await admin.from("profiles").select("status, lang").eq("id", tok.user_id).maybeSingle();
  if (!prof || prof.status !== "active") return notFound();

  // The last 30 days and everything ahead.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("athlete_docs").select("id, data")
    .eq("col", "sessions").eq("athlete_id", tok.user_id).gte("data->>date", since);
  const sessions = (rows ?? []).map((r) => ({ ...r.data, id: r.id }));

  const lang = url.searchParams.get("lang") === "en" ? "en" : (prof.lang === "en" ? "en" : "fr");
  const slugs = [...new Set(sessions.flatMap((s) => s.exercises ?? []))];
  const names: Record<string, string> = {};
  if (slugs.length) {
    const { data: ex } = await admin.from("exercises").select("slug, title").in("slug", slugs);
    for (const e of ex ?? []) names[e.slug] = e.title?.[lang] || e.title?.fr || e.slug;
  }

  return new Response(buildFeed(sessions, { lang, names, url: Deno.env.get("SITE_URL") ?? "" }), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
});
