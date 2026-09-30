/* ALTARIS™ — connexion Supabase
   © 2026 ALTARIS™. All rights reserved.

   Renseigner les deux valeurs de Settings → API du projet Supabase.
   La clé « anon » est publique par conception : c'est la RLS qui protège
   les données. Ne jamais mettre ici la clé service_role.
   Laissées vides, l'application reste en mode local (code PIN). */
const SUPABASE_URL = "https://bunfdvzedeosliwylbzn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ncC6RsMSSBbpIeWLfD_csg_7vk_uCZh";

/* Clé publique VAPID des notifications (Web Push). Elle se génère avec
   `npx web-push generate-vapid-keys` ; la clé privée va dans les secrets
   Supabase (VAPID_PRIVATE_KEY), jamais ici. Vide = notifications désactivées. */
const VAPID_PUBLIC_KEY = "";

/* Prix affichés dans la comparaison des formules (texte libre, ex. « 19 € / mois »).
   Vide = pas de prix affiché. Les vrais prix sont ceux de Stripe. */
const PLAN_PRICES = { standard: "", premium: "" };

export { PLAN_PRICES, SUPABASE_ANON_KEY, SUPABASE_URL, VAPID_PUBLIC_KEY };
