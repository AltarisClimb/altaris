/* ALTARIS™ — connexion Supabase
   © 2026 ALTARIS™. All rights reserved.

   Renseigner les deux valeurs de Settings → API du projet Supabase.
   La clé « anon » est publique par conception : c'est la RLS qui protège
   les données. Ne jamais mettre ici la clé service_role.
   Laissées vides, l'application reste en mode local (code PIN). */
const SUPABASE_URL = "https://bunfdvzedeosliwylbzn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ncC6RsMSSBbpIeWLfD_csg_7vk_uCZh";

export { SUPABASE_ANON_KEY, SUPABASE_URL };
