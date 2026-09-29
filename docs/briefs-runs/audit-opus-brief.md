# Brief — Audit Opus 5.5 de MangoOS / MangoQA

## 1. Contexte

MangoOS (dépôt local `/home/raf/projets/mangoai`, serveur Node/TS : ~103 000 lignes dans `server/src`, 595 fichiers) est un harnais de création d'applications par conversation longue : une discussion amont doit produire une application finie à 95 %. MangoQA (`/home/raf/projets/mangoqa`) est le processus d'audit séparé qui rend un verdict Feu Vert / Rouge. Le porteur du projet veut que ce harnais atteigne le niveau de Lovable / Base44 / Emergent.

Le harnais tourne aujourd'hui sur des modèles non-Anthropic (`server/data/brain-registry.json` : `codeur` = mimo-v2.6-pro, `architecte` = glm-5.3, plusieurs rôles = deepseek-v4-flash:0731). Le chemin Claude existe déjà dans le code (`@anthropic-ai/claude-agent-sdk`, provider `claude` avec opus/sonnet/haiku, table de coûts `agent/agent-contract.ts:165`), mais il n'était pas authentifié. Un abonnement **Claude Pro annuel** vient d'être activé et authentifié sur cette machine.

Documents de référence à lire : `fondation.md` (vision), `limites.md` (registre des limites, ~210 ko — l'explorer par recherche ciblée, pas en entier), `statut.md`, `pipeline-eleve-qa.md`, `wiki/index.md` + pages-entités, `audit-et-plan-mangoos-2.0.md` ; côté MangoQA : `FAILLES.md`, `README.md`.

## 2. Tâche

**Auditer** MangoOS et MangoQA, et produire un rapport d'audit + un plan d'action chiffré.

- **Inclus** : architecture du harnais ; pipeline Élève / Stratège / Forge / Gardien ; MangoQA (visages, verdicts, couverture) ; registre des cerveaux et affectation des modèles par rôle ; facilité d'usage et fiabilité perçues ; consommation de tokens de la boucle de génération.
- **Exclus** : toute modification de code ; tout refactoring ; tout run de génération d'application réelle ; l'esthétique de l'interface de MangoOS elle-même.

## 3. Contraintes

- **Lecture seule** : mode plan, aucune écriture dans les dépôts.
- Chaque constat cite `fichier:ligne`.
- Ne pas recopier le contenu des documents : les citer.
- Langue : français.
- Budget : borner à 40 tours.
- Ne jamais inventer un chiffre : le mesurer, ou écrire « non mesuré ».

## 4. Livrable

`/home/raf/projets/mangoai/audit-opus-2026-09-28.md`, en 4 parties :

- **A** — forces réelles à préserver (prouvées par le code, pas par les docs).
- **B** — faiblesses classées par gravité, chacune avec `fichier:ligne` et cause racine.
- **C** — ce qui empêche réellement d'atteindre le niveau Lovable/Base44, et ce qui n'est que du bruit.
- **D** — plan d'action priorisé : effort (S/M/L) et risque de régression (aucun / faible / élevé) par action.

Puis un HTML autonome : `/home/raf/projets/mangoai/audit-opus-2026-09-28.html`.

## 5. Critères (mesurables)

- **C1** — le rapport existe, ≥ 8 000 caractères, et chaque faiblesse porte un `fichier:ligne` vérifiable.
- **C2** — la partie D compte ≥ 5 actions, chacune avec effort et risque de régression.
- **C3** — une section « modèles » compare ≥ 3 affectations possibles par rôle (Opus 5.5 / DeepSeek 4.1 flash / MiMo / GLM) avec la consommation de quota induite sur une application complète.
- **C4** — `git -C /home/raf/projets/mangoai status --short` ne montre **aucun** fichier modifié par l'audit (hors le rapport et son HTML).
- **C5** — le HTML s'ouvre sans erreur et sa mise en page ne présente ni texte tronqué ni bloc superposé (vérifié par capture page par page).

## 6. Interdits

- **Aucune suppression de fichier, jamais.**
- Aucune modification de code source, de configuration, ni des données de `server/data/` (le registre des cerveaux ne doit pas être touché).
- Ne pas lancer de génération d'application réelle (pas d'appel de build `/api/chat`, pas de pipeline).
- Ne pas installer de dépendance, ne pas mettre à jour le dépôt.
- Rien d'inventé : chaque chiffre est mesuré ou marqué « non mesuré ».

## 7. Réponse attendue

Terminer par : chemins des livrables · nombre de faiblesses par gravité · les 3 actions les plus rentables · le tableau des affectations de modèles recommandées par rôle. **Un critère faux = pas terminé.**
