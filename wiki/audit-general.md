---
type: entite
tags: [audit, retrospective, empirique, metriques, evolution]
statut: actif
sources: [historique, statut, fondation, idee]
maj: 2026-06-23
---

# Audit général de MangoOS (2026-06)

> Le **premier super audit rétrospectif + empirique** du projet : où en est Mango, comment il a évolué, ce qu'il a
> mis en place, **validé vs manquant**. Document complet = [[audit-general-2026-06|audit-general-2026-06.md]] (racine).

## Rôle

Reprendre MangoOS *depuis le début* (10 jours, 13→23 juin 2026) et **mesurer** l'évolution sur trois angles croisés :
**promesse** ([[fondation]]/[[idee]]) × **récit** ([[historique]]/[[statut]]/wiki) × **preuve** (tests + live + chiffres
`.metrics.jsonl`). Une capacité n'est « ✅ Validé » que si elle a une preuve. MangoQA en première classe (demande de Raf).

## Le constat en bref

- **Sens de l'évolution** : de « générer des apps avec le cerveau de Claude » → « **posséder un cerveau souverain,
  mesuré, qui s'auto-améliore et s'audite** ». L'intelligence migre vers l'intérieur : coquille → mémoire → audit →
  [[kernel]] → **moteur agentique** ([[eleve-local]] A→D) → **multi-cerveaux** ([[phase-e-multicerveaux]] E).
- **Le cœur custom tient ses promesses** (contrat [[coque-rigide]], [[memoire-expertise|mémoire]]/[[boucle-curation|curation]],
  [[mangoqa]], [[kernel]], moteur, [[brains|registre mesuré]]) — construit **et prouvé**.
- **MangoOS a dépassé son idée fondatrice** : clone Lovable mono-Claude ([[idee]]) → « Personal AI OS » souverain.

## Chiffres-clés (vérité-terrain, recalculés depuis le JSONL)

| Indicateur | Valeur |
|---|---|
| Tours | **1661** · coût tracé **182,87 $** · succès **89,3 %** · durée moy **86,9 s** |
| Coût par modèle | sonnet **135,16 $** (centre de coût) · eleve 30,64 $ · opus 13,97 $ · haiku 3,10 $ |
| Qui résout | **maitre (Claude) 1182** vs eleve seul **134** → souveraineté prouvée mais **minoritaire** |
| Production | **40 apps**, **23 builds** (58 %), **23 runs nocturnes**, **69 axiomes** |
| RUN 2026-06-20 | 3 apps (Svelte/Vue/React), gradient réutilisation **0→67 %** |

## Les 3 écarts honnêtes (cœur de l'audit)

1. **Souveraineté récente, pas majoritaire** — Claude a porté l'essentiel des résolutions sur les 10 jours.
2. **Cécité financière** — coût cloud GLM **non tracé** (`askEleveOpenAI` n'extrait pas le coût) → 182,87 $ sous-estimé.
   Voir [[audit-souverainete]] · chantier #134.
3. **Dette de promesses de périphérie** — A2A (pilier [[kernel]] annoncé), agents Image/Music/Office, [[vault-projet]],
   fine-tuning : **annoncés, non construits**. + **8 magasins** annoncés vs **4** synthétisés ([[memoire-expertise]]).

## MangoQA — ce qu'il a attrapé sur du réel

5 dimensions ([[mangoqa]]) : ① **Disjoncteur** 5 trips réels (cost-guard 12,65 $>5 $, kernel 787 s) · ② **Observateur**
architecture FAIL ×3 (peut-être trop strict) · ③ **Œil Design** `measured:0` sur UnoCSS/CSS-vars (aveugle ~60 % des
apps) · ④ **Auditeur de Flux** ([[flux]]) · ⑤ **Auditeur de Suite** ([[composer-os|#138]]). Le filet **fonctionne et est
honnête**.

## Liens

Synthétise [[historique]] + [[statut]] + [[fondation]] + [[idee]] + toutes les pages-entités. Le backlog priorisé
(coût #134, validation locale, A2A, portages hors `query()`, relier les magasins) vit dans le document racine §8.

## Sources

[[audit-general-2026-06|Document complet]] (racine) · `workspace/.metrics.jsonl` · `workspace/.mangoqa/` ·
`server/data/nocturnal.json` · `.axioms*.md`.
