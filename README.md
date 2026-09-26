# ALTARIS™ Pro Platform — paquet de déploiement

© 2026 ALTARIS™. All rights reserved. Registered Trademark.
Confidential and Proprietary Systems.

---

## 1. Ce que contient ce dossier

```
index.html              coquille : métadonnées, feuilles de style, point de montage
src/
  main.js               amorçage et boucle de rendu
  bus.js                relie la couche de données au rendu sans cycle d'imports
  core.js               helpers DOM, dates, arithmétique
  config.js             URL + clé publique Supabase (vide = mode local)
  remote.js             client Supabase : connexion, profils, exercices, affectations
  data.js               persistance locale, session, RBAC côté client
  i18n/                 fr-FR.js · en-US.js · index.js
  domain/               grades.js · scoring.js · workload.js · exercises.js
  ui/                   tokens.css · components.css · icons · charts · brand · feedback · poses
  vendor/               supabase.js (client officiel, MIT, copié tel quel)
  views/                shell · auth · onboarding · climber · testing · library · staff
  modals.js  seed.js  export.js  actions.js
tests/                  suite exécutable avec node --test
supabase/               migrations SQL, seed généré, tests RLS
scripts/                serve, test-db, build-seed, build-bank-v2
sw.js                   service worker (mode hors ligne)
manifest.webmanifest    manifeste PWA
vercel.json             en-têtes de sécurité et politique de cache
```

**Modules ES natifs, aucune étape de build, aucune dépendance npm** (le client Supabase est copié dans `src/vendor/`). Le
navigateur charge `src/main.js` et résout les imports lui-même. `package.json`
ne sert qu'à lancer les tests.

Une seule ressource externe : les polices Google (Cormorant Garamond, Barlow,
IBM Plex Mono).

### Lancer les tests

```bash
npm test          # 45 tests, aucune dépendance à installer
```

Ils couvrent le calcul de charge et l'ACWR (moyenne glissante et EWMA), la
monotonie et la contrainte de Foster, la normalisation des scores, l'aiguillage
au seuil 7a/V6, les garde-fous de douleur, et un contrôle qui refuse tout
module oublié dans le pré-cache du service worker.

### Servir en local

```bash
npm run serve     # http://localhost:8080
```

Ouvrir `index.html` en `file://` ne fonctionne pas : les modules ES exigent
le protocole HTTP.

### Deux règles à respecter en modifiant le code

1. **Tout fichier ajouté sous `src/` doit être listé dans `PRECACHE` de
   `sw.js`**, sinon le mode hors ligne casse en silence. Le test
   `tests/precache.test.js` échoue si vous l'oubliez.
2. **La couche `data.js` et `domain/` ne doit jamais importer `views/` ni
   `actions.js`.** C'est ce qui permet de tester le métier sous Node sans
   navigateur. Le bus de rendu (`bus.js`) existe pour ça.

## 2. LIRE AVANT DE DÉPLOYER — où vivent les données

Tout dépend de `src/config.js` :

- **Rempli** (URL du projet + clé publique Supabase) : connexion par e-mail et
  mot de passe, comptes, rôles, rattachements coach et bibliothèque d'exercices
  sur Supabase, protégés par la RLS. Le pied de page affiche « Comptes
  synchronisés ».
- **Vide** : **mode local**, comme avant — profils à code PIN, tout dans le
  `localStorage` du navigateur. Le pied de page affiche « Mode local ». Utile
  pour une démo hors ligne.

> **Déjà sur Supabase :** comptes, bibliothèque, affectations, **séances**
> (le coach planifie, le grimpeur valide) et **messagerie** grimpeur ↔ coach,
> en direct.
>
> **Tests et journal de douleur** sont aussi sur Supabase, **seulement si le
> grimpeur a donné son accord** (données de santé, RGPD art. 9). Sans accord,
> ils restent sur son appareil et ne sont pas partagés.
>
> **Encore sur l'appareil :** routines, paramètres et journal d'audit.

---

## 3. Mise en ligne — GitHub + Vercel

```bash
cd deploy
git init
git add .
git commit -m "ALTARIS Pro Platform v1.0.0"
git branch -M main
git remote add origin git@github.com:<ton-compte>/altaris.git
git push -u origin main
```

Puis sur vercel.com :

1. **Add New… → Project → Import Git Repository**
2. Framework Preset : **Other**
3. Build Command : *(laisser vide)*
4. Output Directory : `.` *(la racine)*
5. **Deploy**

Environ 40 secondes. Tu obtiens `https://altaris-xxx.vercel.app`.
Domaine personnalisé : *Settings → Domains → Add*, puis un enregistrement
`CNAME` chez ton registrar (ou `A` vers l'IP fournie pour un domaine apex).

**Attention au plan.** La documentation Vercel est explicite : *« the Hobby plan
restricts users to non-commercial, personal use only »*. Si ALTARIS est une
activité commerciale, il faut le plan **Pro à 20 $/développeur/mois**.

Alternatives gratuites **sans** restriction commerciale, pour du statique :

- **Cloudflare Pages** — requêtes statiques illimitées, très bonne latence en Europe. Mon choix par défaut ici.
- **GitHub Pages** — gratuit, 100 Go/mois de bande passante, dépôt public ou privé selon le plan.
- **Netlify** — 100 Go/mois sur le plan gratuit.

Sur ces trois, `vercel.json` est inopérant : reporte les en-têtes dans
`_headers` (Cloudflare / Netlify) si tu y tiens.

---

## 4. Sans Git, en 30 secondes

```bash
npm i -g vercel
cd deploy
vercel --prod
```

Ou glisse-dépose le dossier sur app.netlify.com/drop.

---

## 5. Supabase — ce qui est en place

Projet en **région UE explicite** (Paris, Francfort), pas le groupe « Europe »
qui inclut Londres et Zurich.

| Élément | Où |
|---|---|
| Schéma + RLS (`profiles`, `exercises`, `assignments`) | `supabase/migrations/` |
| Tests des droits d'accès | `supabase/tests/rls.sql` — `scripts/test-db.sh`, et la CI à chaque push |
| Client (connexion, profils, exercices, affectations, séances, messages) | `src/remote.js`, client vendorisé `src/vendor/supabase.js` |
| Clé et URL du projet | `src/config.js` (clé publiable uniquement, jamais `service_role`) |
| Banque d'exercices v2 (82 exercices × 3 variantes + silhouettes) | `node scripts/build-bank-v2.mjs <outil-entrainement-escalade.html>` → migration |

**Rôles :** `admin` (coach avec super-pouvoirs : voit tous les grimpeurs et gère
la plateforme), `teacher` (coach : ses grimpeurs), `student` (grimpeur). Tout
nouveau compte est `student` ; un admin change le rôle dans l'onglet Comptes.
Le premier admin se crée depuis le SQL Editor :

```sql
update public.profiles set role = 'admin' where email = 'vous@exemple.fr';
```

**Exercices :** `library` = visibles des coachs et admins, et d'un grimpeur
seulement une fois assignés (fiche de l'exercice → « Assigner »). `free` =
visibles de tous ; seul un admin peut publier en `free`.

**Appliquer une nouvelle migration :** SQL Editor du projet (coller le fichier),
ou `npx supabase db push` après `npx supabase link`.

**E-mails :** SMTP personnalisé (Authentication → Emails → SMTP Settings) et
modèles dont les liens pointent vers le site :
`{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=email` (inscription),
`type=recovery` (mot de passe), `type=invite` (invitation).

### Notifications et abonnement d'agenda (Edge Functions)

Trois fonctions dans `supabase/functions/` :

| Fonction | Rôle | Appelée par |
|---|---|---|
| `notify` | notification « nouveau message » / « nouvelle séance » à l'autre côté | l'appli, juste après l'envoi (jeton de l'utilisateur) |
| `remind` | rappel 1 h avant chaque séance prévue avec une heure | `pg_cron` toutes les 5 min (secret partagé) |
| `calendar` | flux d'agenda privé (`webcal://…?t=<jeton>`) | l'agenda du téléphone, sans connexion |

Mise en place, une fois (depuis le dossier du dépôt) :

```bash
npx supabase init                      # crée supabase/config.toml si absent
npx supabase login
npx supabase link --project-ref bunfdvzedeosliwylbzn
npx web-push generate-vapid-keys       # note la clé publique et la clé privée
npx supabase secrets set VAPID_PUBLIC_KEY=<publique> VAPID_PRIVATE_KEY=<privée> \
  VAPID_SUBJECT=mailto:contact@altaris-climb.com CRON_SECRET=<longue chaîne aléatoire> \
  SITE_URL=https://<adresse du site>
npx supabase functions deploy notify
npx supabase functions deploy calendar --no-verify-jwt
npx supabase functions deploy remind --no-verify-jwt
```

Puis la clé **publique** dans `src/config.js` (`VAPID_PUBLIC_KEY`) — jamais la
privée. Tant qu'elle est vide, l'appli n'affiche pas les notifications.

Le rappel toutes les 5 minutes, dans le SQL Editor (remplacer le secret) :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('altaris-remind', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bunfdvzedeosliwylbzn.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb)
$$);
```

À savoir :
- **iPhone** : les notifications ne marchent que si ALTARIS est ajouté à
  l'écran d'accueil (Partager → Sur l'écran d'accueil), iOS 16.4 ou plus.
- Le rappel 1 h avant ne part que pour une séance **avec une heure** (champ
  Heure de la fiche de séance), à l'heure locale du grimpeur (fuseau enregistré
  à la connexion).
- Le lien d'agenda est personnel : qui l'a voit les séances. Le grimpeur peut
  le réinitialiser depuis la fenêtre d'abonnement.

### Reste à migrer

Les séances passent par la table générique `athlete_docs` (une ligne par
document, lisible par le grimpeur, son coach et les admins, en temps réel).
La messagerie a ses propres tables (`messages`, une ligne par message,
non modifiable ; `message_reads` pour les non-lus).

**Données de santé** (`assessments`, `pain`) : dans `athlete_docs`, mais le
serveur refuse de les écrire sans consentement du grimpeur
(`profiles.health_consent_at`). Lui seul peut le donner ou le retirer ; le
retrait efface ses tests et son journal de douleur du serveur. Côté appli,
le consentement est demandé au moment de signaler une douleur ou de passer
un test, et se gère dans le profil. Texte versionné : `HEALTH_CONSENT_VERSION`
dans `src/remote.js` (à changer si le texte change).

`routines` · `config` · `audit` ne sont pas liés à un grimpeur et
demanderont leurs propres tables.

---

## 6. Ce que je déconseille pour l'instant

**Ne réécris pas en Next.js maintenant.** Tu n'as aucune raison technique de le
faire avant d'avoir une cinquantaine d'utilisateurs réels. À ce stade, le fichier
unique est un avantage : zéro build, zéro dépendance à maintenir, zéro faille de
chaîne d'approvisionnement npm, déploiement instantané, et n'importe quel
développeur peut le reprendre.

Le jour où tu migres, ce sera pour de bonnes raisons — SEO d'une landing page,
rendu serveur, découpage d'équipe — pas par réflexe.

---

## 7. Avant d'ouvrir à de vrais athlètes

Rappel des points signalés lors de la livraison :

- [x] Authentification réelle (Supabase Auth, e-mail + mot de passe)
- [ ] RLS côté serveur — fait pour comptes, exercices et affectations ; reste les données d'entraînement et de santé (§5)
- [x] Consentement explicite RGPD article 9 pour les données de santé (écran de consentement, retrait avec effacement)
- [ ] AIPD (analyse d'impact) et registre des traitements
- [ ] Les messages d'alerte douleur envoyés au coach restent dans la messagerie après un retrait de consentement
- [ ] Politique de conservation et de suppression des données
- [ ] Vérifier si l'hébergement de données de santé pour le compte de tiers déclenche la certification **HDS** en France
- [ ] Unités impériales (livres, pouces) si le marché en-US est visé
- [ ] Ne réintroduire aucune revendication chiffrée de réduction du risque de blessure
