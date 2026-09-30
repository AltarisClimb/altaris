// POST /functions/v1/billing-portal  → { url }
// Stripe's customer portal: save or update the card, change plan, download invoices, cancel.
// The card lives at Stripe only; the app never sees or stores it.
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
  const { data: prof } = await admin.from("profiles").select("email, full_name, role, stripe_customer_id").eq("id", user.id).single();
  if (!prof || prof.role !== "student") return json({ error: "forbidden" }, 403);
  // No customer yet (never subscribed): create it, so a card can be saved ahead of a first payment.
  let customer = prof.stripe_customer_id;
  if (!customer) {
    const c = await stripe(secret, "POST", "customers", { email: prof.email, name: prof.full_name || undefined, metadata: { user_id: user.id } });
    customer = c.id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
  }
  const s = await stripe(secret, "POST", "billing_portal/sessions", { customer, return_url: SITE + "/?tab=profile" });
  return json({ url: s.url });
});
