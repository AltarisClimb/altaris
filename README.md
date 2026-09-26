# ALTARIS™ Pro Platform — paquet de déploiement

© 2026 ALTARIS™. All rights reserved. Registered Trademark.
Confidential and Proprietary Systems.

---

## 1. Ce que contient ce dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'application complète. Vanilla JS, aucun build, aucune dépendance npm. |
| `sw.js` | Service worker : cache l'app et les polices → l'app fonctionne hors ligne en salle. |
| `manifest.webmanifest` | Manifeste PWA : installation sur l'écran d'accueil iOS / Android. |
| `icon-192.png`, `icon-512.png`, `favicon.svg` | Icônes dérivées du logo officiel. |
| `vercel.json` | En-têtes de sécurité et politique de cache. Ignoré par les autres hébergeurs. |

Une seule ressource externe : les polices Google (Cormorant Garamond, Barlow,
IBM Plex Mono). Tout le reste est embarqué dans `index.html`.

---

## 2. LIRE AVANT DE DÉPLOYER — le point qui change tout

Dans sa version publiée comme artefact Claude, l'application utilise la base de
données du runtime Claude. Ce runtime **n'existe pas** sur Vercel, Cloudflare ou
GitHub Pages.

L'application le détecte et bascule automatiquement en **mode local** :
les données restent dans le `localStorage` du navigateur. Le pied de page
affiche « Mode local ».

Conséquence directe :

> **Chaque navigateur a sa propre base. Le coach ne voit pas les données de ses
> athlètes. La messagerie ne transmet rien.**

Déployer tel quel donne donc une **vitrine parfaitement fonctionnelle en
mono-poste** — idéale pour une démo commerciale, une levée, un test UX — mais
pas le produit multi-utilisateurs.

Pour obtenir le vrai produit, il faut brancher un backend : voir §5.

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

## 5. Passer au vrai multi-utilisateurs — Supabase

Le choix rationnel, parce qu'il coche exactement le cahier des charges :

| Besoin du CDC | Brique Supabase |
|---|---|
| PostgreSQL | Postgres managé |
| Stockage vidéo sécurisé (S3) | Supabase Storage |
| RBAC hermétique entre rôles | **Row Level Security** — appliqué côté serveur |
| Mise à jour temps réel | Realtime (remplace `onSnapshot` presque 1:1) |
| RGPD / résidence UE | régions UE au choix + DPA signable |
| Authentification | Auth intégrée (e-mail, magic link, OAuth) |

Tarifs : **Free 0 $** (500 Mo de base, 1 Go de stockage, 5 Go de trafic,
50 000 utilisateurs actifs/mois) — largement suffisant pour un pilote.
**Pro 25 $/mois** (8 Go de base, 100 Go de stockage, 250 Go de trafic).

⚠️ Choisis une **région UE explicite** (Paris, Francfort), pas le groupe
« Europe » qui inclut Londres et Zurich — hors UE.

### Ce qu'il y a à faire dans le code

Presque rien, et c'est voulu : toute la persistance est isolée dans un seul
objet, `Store`, au début du fichier (section 2, ~150 lignes). Il expose cinq
méthodes : `init`, `list`, `get`, `put`, `del`.

1. Remplacer `claude.use("db")` par le client Supabase.
2. Mapper `onSnapshot` sur `supabase.channel().on('postgres_changes', …)`.
3. Remplacer l'écran de code PIN par `supabase.auth`.
4. Écrire les politiques RLS — c'est là qu'est la vraie valeur : le cloisonnement
   coach/athlète devient **inviolable côté serveur**, alors qu'il est aujourd'hui
   seulement appliqué côté client dans l'objet `Access`.

Estimation : **2 à 4 jours**. Le reste du fichier ne bouge pas.

### Les 8 tables à créer

`users` · `assessments` · `sessions` · `pain` · `threads` · `routines` ·
`config` · `audit`

Elles correspondent une pour une à la constante `COLS` dans `index.html`.

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

- [ ] Authentification réelle (le code à 4 chiffres est un garde-fou d'usage, pas une sécurité)
- [ ] RLS côté serveur (aujourd'hui le RBAC est côté client)
- [ ] Consentement explicite RGPD article 9 pour les données de santé + AIPD
- [ ] Politique de conservation et de suppression des données
- [ ] Vérifier si l'hébergement de données de santé pour le compte de tiers déclenche la certification **HDS** en France
- [ ] Unités impériales (livres, pouces) si le marché en-US est visé
- [ ] Ne réintroduire aucune revendication chiffrée de réduction du risque de blessure
