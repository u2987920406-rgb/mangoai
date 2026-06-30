# Brique `securite` — recette d'assemblage

> Gardes transverses HTTP, **zéro dépendance** : en-têtes de sécurité (type helmet), CORS par
> allowlist, limiteur de débit, validation des entrées aux frontières, et garde « secrets hors-code ».
> Chaque garde est remplaçable par son équivalent npm sans changer le montage.

## Ce que la brique apporte

- `securityHeaders()` — CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS, Referrer/Permissions-Policy, retrait de `X-Powered-By`.
- `cors({ origins })` — autorisation **par allowlist** + préflight `OPTIONS`.
- `rateLimit({ windowMs, max })` — limiteur de débit en mémoire (horloge injectable).
- `validate(schema[, where])` — rejette une entrée invalide en **400** ; compatible **Zod** (`safeParse`), avec mini-schémas `object`/`string` intégrés.
- `requireEnv(names)` — **refuse de démarrer** si un secret obligatoire manque (échec rapide au boot).
- `provides`: `security`.

## Assemblage (3 étapes)

1. **Copier** `src/headers.ts`, `src/cors.ts`, `src/rate-limit.ts`, `src/validate.ts`, `src/secrets.ts`.
2. **Dépendances** : `npm i express` (déjà là). Tout le reste est **intégré** (aucune install). Variables d'env optionnelles : `CORS_ORIGINS`, `RATE_LIMIT_MAX`.
3. **Monter — l'ordre compte** (gardes AVANT le parsing du corps et les routes) :
   ```ts
   app.disable("x-powered-by");
   app.use(securityHeaders());
   app.use(cors({ origins: (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",") }));
   app.use(rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_MAX ?? 100) }));
   app.use(express.json());
   // route validée :
   app.post("/api/x", validate(object({ name: string({ min: 1 }) })), handler);
   ```

## Composition avec les autres briques

- **Avant `paiement`** : monter `rateLimit` et `securityHeaders` en amont protège `/api/payments/checkout` (anti-abus). ⚠️ Ne PAS appliquer `express.json()` global avant la route webhook (corps brut requis — cf. brique `paiement`).
- **Avant `auth`** : `rateLimit` sur `/api/auth/login` limite le bruteforce ; `validate` durcit les payloads.

## Vérifier

```bash
# depuis server/
npx tsx templates/backend/_bricks/securite/tests/securite.test.ts
```
`RateCounter` (fenêtre/reset), mini-schémas, `requireEnv`, et HTTP : en-têtes posés, CORS allow/deny + préflight, validation 200/400, rate-limit → 429 + `Retry-After`.

## Upgrades & lien #170

| Garde | Défaut $0 | Upgrade |
|---|---|---|
| En-têtes | `securityHeaders()` maison | `npm i helmet` → `helmet()` |
| CORS | `cors({ origins })` maison | `npm i cors` |
| Rate-limit | `rateLimit()` mémoire | `npm i express-rate-limit` (+ store Redis pour multi-instance) |
| Validation | mini-schémas `object`/`string` | `npm i zod` (même API `safeParse`) |
| **Secrets** | `requireEnv` lit `process.env` | **brique `vault` (#170)** : `requireEnv` résoudra des références `secret://...` côté serveur |

## Limites assumées de la v1

- Rate-limit **par process** (mono-instance) ; multi-instance → store partagé (Redis).
- En-têtes/validation volontairement minimalistes (couvrent le gros du risque) ; politiques riches = helmet/zod.
- `requireEnv` lit l'environnement en clair tant que la brique `vault` (#170) n'existe pas.
