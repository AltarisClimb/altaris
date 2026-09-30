// POST /functions/v1/billing-portal  → { url }
// Stripe's customer portal: change plan, update the card, download invoices, cancel.
// Secrets: STRIPE_SECRET_KEY, SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cors } from "../_shared/push.ts";
import { stripe } from "../_shared/stripe.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = Deno.env.get("SITE_URL") ?? "";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) return json({ error: "not configured" }, 503);
  const caller = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "auth" }, 401);
  const { data: prof } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!prof?.stripe_customer_id) return json({ error: "no customer" }, 404);
  const s = await stripe(secret, "POST", "billing_portal/sessions", { customer: prof.stripe_customer_id, return_url: SITE + "/?tab=profile" });
  return json({ url: s.url });
});
