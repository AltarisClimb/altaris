// Stripe helpers shared by the checkout, billing-portal and stripe-webhook functions.
// Plain JS (WebCrypto + fetch) so Node's test runner covers it too (tests/stripe.test.js).

const API = "https://api.stripe.com/v1/";

/** Flatten { a: { b: 1 }, list: [{ x: 2 }] } into Stripe's form encoding (a[b]=1&list[0][x]=2). */
export function formEncode(obj, prefix, out) {
  const parts = out || [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + "[" + k + "]" : k;
    if (typeof v === "object") formEncode(v, key, parts);
    else parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out ? parts : parts.join("&");
}

export async function stripe(secret, method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : formEncode(params || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || "stripe " + res.status);
  return data;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Checks a Stripe-Signature header ("t=…,v1=…") against the raw body.
 * Rejects signatures older than `tolerance` seconds (replays).
 */
export async function verifySignature(payload, header, secret, tolerance, nowSec) {
  if (!header || !secret) return false;
  const items = Object.fromEntries(String(header).split(",").map((kv) => kv.split("=").map((s) => s.trim())));
  const sigs = String(header).split(",").filter((kv) => kv.trim().startsWith("v1=")).map((kv) => kv.trim().slice(3));
  const ts = Number(items.t);
  if (!ts || !sigs.length) return false;
  const now = nowSec || Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (tolerance || 300)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + payload)));
  return sigs.some((s) => safeEqual(s, mac));
}

/**
 * What a subscription means for the profile: the plan bought while it is in
 * good standing; once it ends, back to an expired trial (training closed, data kept).
 */
export function planFromSubscription(sub, prices) {
  const priceId = sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
  const plan = priceId === prices.premium ? "premium" : priceId === prices.standard ? "standard" : null;
  const live = ["active", "trialing", "past_due"].includes(sub && sub.status);
  return { plan: live && plan ? plan : "trial", status: (sub && sub.status) || "canceled", ended: !live || !plan };
}
