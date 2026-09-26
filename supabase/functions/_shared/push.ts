// Web Push to every device a user registered (table push_subscriptions).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… or https://…).
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:contact@altaris-climb.com",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

export type Push = { title: string; body: string; url: string; tag?: string };

/** Sends to all of the users' devices; forgets devices the push service says are gone. */
export async function pushTo(admin: SupabaseClient, userIds: string[], msg: Push): Promise<number> {
  if (!userIds.length) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}

export const TEXT = {
  fr: {
    message: (from: string) => "Message de " + from,
    newSession: "Nouvelle séance",
    changedSession: "Séance modifiée",
    reminder: "Séance dans 1 h",
    at: (date: string, time?: string) => date + (time ? " à " + time : ""),
  },
  en: {
    message: (from: string) => "Message from " + from,
    newSession: "New session",
    changedSession: "Session updated",
    reminder: "Session in 1 h",
    at: (date: string, time?: string) => date + (time ? " at " + time : ""),
  },
};

export function langOf(p: { lang?: string | null } | null): "fr" | "en" {
  return p?.lang === "en" ? "en" : "fr";
}

export function dayLabel(date: string, lang: "fr" | "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR",
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
