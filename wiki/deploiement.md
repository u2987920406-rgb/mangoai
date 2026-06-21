---
type: entite
tags: [architecture, deploiement, github, supabase]
statut: actif
sources: [memory, statut]
maj: 2026-06-20
---

# Déploiement & intégrations externes

> Comment une app générée sort de MangoOS : versionnée sur GitHub, dotée d'une DB/auth Supabase, et publiée chez un hébergeur. Posture sécurité : **login CLI one-time**, pas de token en clair quand c'est évitable.

## Rôle

Fermer la chaîne « du prompt à l'app en ligne ». Toutes ces intégrations sont **natives** (modules serveur dédiés), cohérentes avec la posture local-first et le cap produit en 2 phases (interne → bêta).

## Détails clés

- **GitHub natif** (idée 16) — `github.ts` : `GITHUB_TOKEN` (scope `repo`) dans `server/.env`, repo créé si absent (privé par défaut), **force-push via URL inline authentifiée** (token jamais écrit dans `.git/config`). `POST /api/github/:name`. **Push réel validé** (2026-06-13). ⚠ Le token a fuité en clair pendant l'audit → à régénérer en fine-grained.
- **Supabase** (idée 17) — bloc `SUPABASE_RULES` (tous modes) : l'agent construit avec `@supabase/supabase-js`, client lisant `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, **RLS obligatoire**, jamais de clé en dur. `.env`/`.env.local` git-ignorés ET exclus du zip (sinon fuite via GitHub/export). App `todo-supabase` validée en live.
- **Déploiement multi-cibles** (idée 18) — `deploy.ts` : registre de providers `cloudflare|vercel|netlify`. `buildDist` commun (`npm run build` → vérif `dist/index.html`) puis CLI dédié (`wrangler pages` / `vercel deploy` / `netlify-cli deploy`). Auth = **login CLI one-time** dans `server/`, pas de token en `.env` (honorés si présents mais jamais requis). `POST /api/deploy/:name`. ⚠ e2e live à confirmer après login one-time.
- **Coffre local** `.credentials/` (git-ignoré) : pense-bête des clés (Supabase, pointeur GitHub). NE JAMAIS recopier dans un fichier tracké.

## Liens

Boutons UI dans le header · secrets gérés en cohérence avec [[memoire-expertise]] (jamais dans un magasin tracké) · concerne le passage Phase A → Phase B (voir [[plan]]).

## Sources

[[memory]] (GitHub #16, Supabase #17, déploiement #18, coffre `.credentials`) · [[statut]] idées 10/16/17/18.
