# Brique `paiement` — recette d'assemblage

> Stripe **Checkout** (page de paiement hébergée) + réception de **webhooks signés** + **idempotence**.
> Le point de sécurité critique — la vérification de signature — est fait maison (`node:crypto`),
> et tout ce qui touche Stripe est **injectable** → la brique se teste sans compte ni réseau.

## Ce que la brique apporte

- `POST /api/payments/checkout` — `{ priceId, quantity?, mode?, successUrl?, cancelUrl?, customerEmail? }` → `{ id, url }` (rediriger l'utilisateur vers `url`).
- `POST /api/payments/webhook` — reçoit les événements Stripe, **vérifie la signature**, **déduplique**, puis appelle `onEvent`.
- `provides`: `payments`.

## Assemblage (3 étapes)

1. **Copier** `src/signature.ts`, `src/idempotency.ts`, `src/checkout.ts`, `src/payments.ts`.
2. **Dépendances** : `npm i express stripe`. Variables d'env :
   ```bash
   # .env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # donné par Stripe à la création du endpoint webhook
   ```
3. **Monter** — ⚠️ **ordre crucial** : le webhook AVANT tout `express.json()` global (la signature est calculée sur le corps **brut**) :
   ```ts
   import express from "express";
   import { createCheckoutRouter, createWebhookHandler } from "./payments.js";

   app.post(
     "/api/payments/webhook",
     express.raw({ type: "application/json" }),          // corps brut obligatoire
     createWebhookHandler({
       webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
       onEvent: async (e) => {
         if (e.type === "checkout.session.completed") { /* créditer la commande */ }
       },
     }),
   );
   app.use("/api/payments", express.json(), createCheckoutRouter({ successUrl: "...", cancelUrl: "..." }));
   ```

## Pourquoi vérifier la signature soi-même

Un webhook non vérifié = n'importe qui peut POSTER `checkout.session.completed` et déclencher une livraison sans avoir payé. Stripe signe `${timestamp}.${rawBody}` en HMAC-SHA256 ; `verifyStripeSignature` recalcule et compare en temps constant, **et** rejette les horodatages hors tolérance (rejeu). Implémenté avec `node:crypto` → **aucune dépendance pour la partie sécurité**.

## Idempotence

Stripe **réessaie** les webhooks → le même événement peut arriver plusieurs fois. `createMemoryIdempotencyStore` garantit un traitement unique par `event.id`. **En prod, persister** : brancher la brique `db` (table `processed_events`) — sinon un redémarrage réexécuterait des événements (voir `idempotency.ts` pour le store db prêt à copier).

## Vérifier

```bash
# depuis server/
npx tsx templates/backend/_bricks/paiement/tests/payments.test.ts
```
Signature (valide / falsifiée / mauvais secret / rejeu / mal formée), idempotence, construction des params, et HTTP bout-en-bout (`/checkout` + `/webhook` signé + doublon) avec un **faux client Stripe**.

## Limites assumées de la v1

- **Checkout hébergé** uniquement (pas de Payment Intents custom / Elements) — le plus sûr et le plus rapide à vendre ; le sur-mesure paiement = extension.
- Idempotence **mémoire par défaut** (non persistante) → brancher `db` pour la prod.
- Clés en clair dans `.env` tant que la brique `vault` (#170) n'existe pas.
