---
type: entite
tags: [architecture, contrat, executor, securite]
statut: actif
sources: [memory, statut]
maj: 2026-06-20
---

# Coque Rigide (contrat d'E/S)

> « Le modèle **propose**, MangoOS **exécute**. » Une coque qui transforme la sortie d'un LLM en plan d'action validé avant toute écriture sur disque. Livrée au **jalon C** (parser) puis **jalon D** (exécution).

## Rôle

Permettre à un cerveau non-Claude (l'[[eleve-local]]) d'agir en sécurité : il rend du texte balisé, MangoOS le valide, l'applique et le juge objectivement. La boucle Claude native (`runAgent`) reste intacte sur une route séparée.

## Détails clés

- **`contract.ts`** + spec `docs/contrat-es.md` : `parseContract(raw)` → `ActionPlan` validé ou `{ok:false,error}`. Format à **balises** `<mangoos>` (write/edit/run/summary/axiom) — pas JSON, car les actions portent du **code brut**. Réparation tentée avant rejet. Sécurité : chemins **project-relatifs** uniquement.
- **`executor.ts`** (`executeContract`) : applique le plan — write atomique via `safe-io`, edit exact (refuse un `<find>` absent/ambigu), run sandboxé (timeout + liste noire), défense en profondeur sur les chemins, **arrêt à la 1ʳᵉ erreur**.
- **`inspection.ts`** (`inspectProject`) : juge sur **signaux objectifs** (`ok|build-failed|timeout|no-deps|backend-no-deps|backend-failed`…) — jamais « le visuel a l'air bon ». Depuis le run 2026-06-20, valide aussi le **backend généré** (`api/`, `tsc --noEmit`).
- Orchestration par `eleve.ts` (`runRelay`) : voir [[eleve-local]].
- ⚠ Le succès en PRODUCTION reste build-only ; la **vérification d'effet** (changement réellement atterri) est traitée hors-prod par `audit-verify.ts` — voir [[eleve-local]] (discipline d'ablation).

## Liens

Exécute la sortie de [[eleve-local]] · complément de [[coque-souple]] (qui, elle, assemble l'entrée) · jugement objectif partagé avec [[boucle-nocturne]].

## Sources

[[memory]] (Coque Rigide jalon C/D, executor, inspection) · [[statut]] · `docs/contrat-es.md`.
