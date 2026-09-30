// POST /functions/v1/stripe-webhook  (called by Stripe, deployed with --no-verify-jwt)
// The Stripe signature is the check. Keeps profiles.plan in line with the subscription:
// bought plan while active, back to an expired trial when it ends.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PREMIUM.
import { createClient } from "npm:@supabase/supabase-js@2";
import { planFromSubscription, stripe, verifySignature } from "../_shared/stripe.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const prices = { standard: Deno.env.get("STRIPE_PRICE_STANDARD"), premium: Deno.env.get("STRIPE_PRICE_PREMIUM") };

async function apply(sub: any) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY")!;
  let userId = sub.metadata?.user_id;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", sub.customer).maybeSingle();
    userId = data?.id;
  }
  if (!userId) return;
  // Always read the current state from Stripe (events can arrive out of order).
  const cur = await stripe(secret, "GET", "subscriptions/" + sub.id);
  const r = planFromSubscription(cur, prices);
  const patch: Record<string, unknown> = { plan: r.plan, subscription_status: r.status, stripe_customer_id: cur.customer };
  patch.trial_ends_at = r.ended ? new Date().toISOString() : null;
  await admin.from("profiles").update(patch).eq("id", userId).eq("role", "student");
}

Deno.serve(async (req) => {
  const body = await req.text();
  const ok = await verifySignature(body, req.headers.get("stripe-signature"), Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "", 300);
  if (!ok) return new Response("bad signature", { status: 400 });
  const event = JSON.parse(body);
  const obj = event.data?.object ?? {};
  if (event.type === "checkout.session.completed" && obj.subscription) {
    await apply({ id: obj.subscription, customer: obj.customer, metadata: { user_id: obj.client_reference_id } });
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    await apply(obj);
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
