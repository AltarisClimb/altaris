// POST /functions/v1/checkout  { plan: "standard" | "premium" }  → { url }
// Opens a Stripe Checkout page for the signed-in climber. The plan itself is only
// changed by the stripe-webhook function once Stripe confirms the payment.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PREMIUM, SITE_URL.
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

  const { plan } = await req.json().catch(() => ({}));
  const price = plan === "premium" ? Deno.env.get("STRIPE_PRICE_PREMIUM") : plan === "standard" ? Deno.env.get("STRIPE_PRICE_STANDARD") : null;
  if (!price) return json({ error: "plan" }, 400);

  const { data: prof } = await admin.from("profiles").select("email, full_name, role, stripe_customer_id").eq("id", user.id).single();
  if (!prof || prof.role !== "student") return json({ error: "forbidden" }, 403);

  let customer = prof.stripe_customer_id;
  if (!customer) {
    const c = await stripe(secret, "POST", "customers", { email: prof.email, name: prof.full_name || undefined, metadata: { user_id: user.id } });
    customer = c.id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
  }
  const session = await stripe(secret, "POST", "checkout/sessions", {
    mode: "subscription", customer, client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: "true", locale: "auto",
    success_url: SITE + "/?tab=profile&billing=ok", cancel_url: SITE + "/?tab=profile",
  });
  return json({ url: session.url });
});
