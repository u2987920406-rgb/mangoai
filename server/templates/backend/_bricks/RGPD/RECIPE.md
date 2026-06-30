# Brique `RGPD` — recette d'assemblage

> Les droits RGPD livrés clés en main : **export** des données (accès/portabilité), **droit à l'oubli**,
> **consentement** versionné, **rétention**. La brique ne connaît pas vos tables : vous lui **enregistrez
> des sources de données** (`collect`/`erase`), typiquement des requêtes de la brique `db`.

## Ce que la brique apporte (derrière l'authentification)

- `GET /api/privacy/export` → `{ exportedAt, userId, data, consents }` (droit d'accès/portabilité).
- `GET /api/privacy/consent` → consentements de l'utilisateur.
- `POST /api/privacy/consent` `{ purpose, granted }` → donner/retirer un consentement (versionné).
- `DELETE /api/privacy/me` → **droit à l'oubli** : efface toutes les sources + les consentements.
- Helpers de **rétention** (`isExpired`, `selectExpired`, `sweepExpired`) à planifier sur un cron.
- `provides`: `privacy`. `requires`: `auth` (les endpoints concernent l'utilisateur **connecté**).

## Assemblage (3 étapes)

1. **Copier** `src/consent.ts`, `src/registry.ts`, `src/retention.ts`, `src/privacy.ts`.
2. **Enregistrer vos sources de données** (une par catégorie) — `collect` pour l'export, `erase` pour l'oubli :
   ```ts
   const registry = new PrivacyRegistry();
   registry.register({
     name: "profil",
     collect: (uid) => db.prepare("SELECT * FROM users WHERE id = ?").get(uid),
     erase:   (uid) => db.prepare("DELETE FROM users WHERE id = ?").run(uid).changes,
   });
   ```
3. **Monter DERRIÈRE l'authentification** (la brique `auth` pose `req.user.id`) :
   ```ts
   import { requireAuth } from "./auth.js";
   import { createPrivacyRouter } from "./privacy.js";
   import { createMemoryConsentStore } from "./consent.js";

   app.use(
     "/api/privacy",
     requireAuth(process.env.AUTH_SECRET!),
     createPrivacyRouter({ registry, consents: createMemoryConsentStore(), purposes: ["marketing", "analytics"] }),
   );
   ```

## Composition avec les autres briques

- **`auth`** (requis) : fournit l'identité (`req.user.id`) sur laquelle s'appliquent export/oubli.
- **`db`** : les `collect`/`erase` des sources sont des `SELECT`/`DELETE` ; persister aussi consentements et rétention dans des tables dédiées.
- **Rétention** : planifier `sweepExpired(items, DAYS(n), Date.now(), eraseFn)` par catégorie (ex. logs 30 j, paniers abandonnés 90 j).

## Vérifier

```bash
# depuis server/
npx tsx templates/backend/_bricks/RGPD/tests/rgpd.test.ts
```
Registre (export/erase agrégés, doublon rejeté), consentement (donner/retirer/lister/effacer), rétention (TTL + balayage), et HTTP (401 sans user, export, consent + finalité inconnue 400, droit à l'oubli) avec un utilisateur simulé.

## Limites assumées de la v1

- L'**exhaustivité** dépend de vous : seules les sources **enregistrées** sont exportées/effacées. Enregistrer chaque table contenant des données personnelles (checklist au moment d'ajouter une table).
- Stores **mémoire** par défaut (consentements) → persister via `db` en prod (sinon perdus au redémarrage).
- Effacement = **suppression** ; si vous devez conserver une trace légale (facturation), prévoir une **anonymisation** plutôt qu'un DELETE dans la source concernée.
