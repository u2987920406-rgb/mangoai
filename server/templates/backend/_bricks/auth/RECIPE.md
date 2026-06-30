# Brique `auth` — recette d'assemblage

> Inscription / connexion / refresh / route protégée, à greffer sur un backend Express
> (cf. `templates/backend`). Hash de mot de passe et store utilisateur **remplaçables**
> sans toucher au code de la brique.

## Ce que la brique apporte

- `POST /api/auth/register` — `{ email, password }` → `{ user, accessToken, refreshToken }` (201)
- `POST /api/auth/login` — `{ email, password }` → tokens (200) / 401
- `POST /api/auth/refresh` — `{ refreshToken }` → nouveaux tokens (200) / 401
- `requireAuth(secret)` — middleware qui peuple `req.user = { id }` ou répond 401

## Assemblage (4 étapes)

1. **Copier** `src/password.ts`, `src/tokens.ts`, `src/store.ts`, `src/auth.ts` dans le `src/` du backend.
2. **Dépendances** : `npm i express` (déjà présent dans le template backend). Hash : **scrypt intégré, rien à installer**.
3. **Variable d'env** — `AUTH_SECRET` (obligatoire) :
   ```bash
   # .env
   AUTH_SECRET=<openssl rand -hex 32>
   ```
   Optionnel : `AUTH_HASH`, `AUTH_ACCESS_TTL`, `AUTH_REFRESH_TTL`.
4. **Monter** sur l'app Express (cf. `src/example.ts`) :
   ```ts
   import { createAuthRouter, requireAuth } from "./auth.js";

   app.use("/api/auth", createAuthRouter({ secret: process.env.AUTH_SECRET! }));
   app.get("/api/me", requireAuth(process.env.AUTH_SECRET!), (req, res) => res.json({ user: req.user }));
   ```

## Choix par défaut (et comment les durcir)

| Sujet | Défaut $0 | Upgrade |
|---|---|---|
| **Hash mot de passe** | scrypt (`node:crypto`, intégré) | `npm i argon2` + `AUTH_HASH=argon2` (repli auto scrypt si absent) |
| **Tokens** | HMAC-SHA256 maison (compact, suffisant en interne) | `jsonwebtoken` si interop JWT standard nécessaire |
| **Store utilisateur** | mémoire (`createMemoryUserStore`) | brique `db` : `createAuthRouter({ store })`, l'interface `UserStore` est le seul contrat |
| **Secret** | `process.env.AUTH_SECRET` | brique `vault` (#170) : résoudre `secret://auth/secret` côté serveur |

## Vérifier

```bash
# depuis server/
npx tsx templates/backend/_bricks/auth/tests/auth.test.ts
```
Le test démarre un vrai serveur sur un port éphémère et déroule register → login → refresh → `/api/me` (avec et sans token), plus les unités tokens/scrypt.

## Sécurité — limites assumées de la v1

- Refresh tokens **non révocables** (stateless). Pour une vraie déconnexion/rotation, stocker un identifiant de session côté `db` et le vérifier au refresh.
- Pas de rate-limit ici : c'est le rôle de la brique `securite` (helmet + rate-limit), à monter **avant** `/api/auth`.
- `AUTH_SECRET` en clair dans `.env` tant que la brique `vault` (#170) n'existe pas.
