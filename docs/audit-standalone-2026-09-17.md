# Audit et version autonome — 17 septembre 2026

## Conclusion

Mango possède déjà beaucoup de capacités : création conversationnelle, outils locaux, aperçus et auditeur indépendant. Son principal frein à un usage professionnel était la fiabilité de l'installation et la différence entre une fonctionnalité présente dans le code et une fonctionnalité réellement vérifiée. Cette livraison améliore ces fondations sans remplacer les mécanismes existants.

Le résultat est une application locale mono-utilisateur servie par Node, avec interface compilée et API sur une adresse. Ce n'est pas encore un exécutable autonome ni un service SaaS comparable à l'ensemble de Lovable.

Périmètre : mangoai à partir de `b66d38b`, MangoQA à partir de `28f6474`. Livraison GitHub autorisée par Raf après validation de l’audit. MangoQA associé : `e67700f4e132a6ce6c2a0d03db4127b43fa853b2` ; cette version est fixée dans le workflow.

## Constats et corrections

| Priorité | Constat | Correction livrée |
|---|---|---|
| Haute | Installation liée au poste développeur et au serveur Vite | Installation coordonnée des deux dépôts, chemins configurables, interface compilée servie par l'API, lanceur commun et commande doctor |
| Haute | Audit absent ou techniquement impossible confondu avec une validation | Verdict unknown, distinction non applicable / erreur technique, publication refusée en cas d'audit incomplet |
| Haute | Résultat QA ancien ou demande perdue pendant un audit | Corrélation par signalTimestamp, traitement différé du dernier signal reçu |
| Haute | Publication sans preuve de stabilité des sources | Tests du projet s'ils existent, nouvel audit obligatoire, empreinte avant contrôle et après compilation |
| Haute | Dépendances de production signalées vulnérables | Lockfiles actualisés ; pdfjs-dist 6.3.289, y compris la dépendance d'officeparser |
| Haute | Synchronisation Git pouvait forcer l'historique distant | Suppression du push forcé ; aucun push réel effectué pour cette livraison |
| Moyenne | Échec de sauvegarde de l'accueil masqué | Vérification HTTP, message accessible et nouvelle tentative |
| Moyenne | État des services peu lisible | Diagnostic stockage, Ollama et heartbeat MangoQA dans l'interface |
| Moyenne | Aperçus pouvaient laisser Vite actif après arrêt | Arrêt du groupe de processus créé par Mango sur POSIX, scénario réel de fermeture/réouverture |
| Moyenne | Tests silencieusement absents ou dépendants d'Edge / npx | Manifeste complété, erreur si sélection vide, Chromium configurable, esbuild local explicite |
| Moyenne | Fallback de surveillance QA ignorait durablement les nouveaux fichiers | Premier scan correctement terminé et test de régression |

Le service écoute localhost par défaut. Il refuse les origines étrangères et les hôtes inattendus sans authentification ; une exposition réseau exige un jeton. Ces protections ne constituent pas un sandbox pour exécuter du code non fiable.

## Vérifications exécutées

- Serveur : **242 scripts du groupe offline réussis, 0 échec**. Ce nombre compte des scripts, chacun pouvant contenir plusieurs assertions.
- Interface : **77 tests réussis** dans 12 fichiers ; vérification TypeScript et compilation réussies.
- MangoQA : **147 tests réussis** dans 11 fichiers, vérification TypeScript et régression du signal reçu pendant un audit.
- Autonome : **12 contrôles d'intégration réussis** : HTTP, authentification, SPA, API 404, refus des fichiers privés/origines étrangères, services, sauvegarde, port occupé, arrêt et persistance après redémarrage.
- Navigateur Chromium réel : premier lancement, sauvegarde, erreur HTTP provoquée et nouvelle tentative, rechargement, diagnostics, largeur mobile et ordinateur. Captures inspectées visuellement.
- Aperçu réel : installation d'un template, lancement Vite, clic sur un compteur, compilation, arrêt, réouverture et suppression du projet temporaire. C'est une fixture déterministe, pas une application créée par un modèle.
- Publication : 9 contrôles du garde-fou, dont refus d'audit indisponible/unknown/rouge, test échoué et source modifiée. Aucun hébergeur appelé.
- Interface : les avis élevés nanoid/postcss ont été corrigés. Le dernier `npm audit fix` signale encore un avis faible esbuild (serveur de développement sous Windows) ; il reste à traiter.
- npm audit de production : aucun avis connu dans les dernières réponses enregistrées pour le serveur et MangoQA. Des avis sur les dépendances de développement peuvent subsister ; cela ne prouve pas l'absence de vulnérabilités applicatives.

Le workflow GitHub Actions est préparé, mais n'a pas été exécuté sur GitHub. Les modifications MangoQA et Mango doivent être livrées ensemble.

## Limites et travail restant

1. **Modèles IA** : aucun compte utilisateur ni modèle Ollama disponible n'a été utilisé pour valider une génération complète. Les modèles doivent être configurés ; le diagnostic ne prétend pas que Claude est connecté.
2. **Publication réelle** : aucune livraison avec les comptes Cloudflare, Vercel ou Netlify de Raf. Les chemins existants publient du statique ; backend, base distante et SSR exigent une solution complémentaire.
3. **Distribution** : Node/npm/Git restent nécessaires. Pas d'installateur signé ni de runtime embarqué. Tests effectués sous Linux ; lanceur Windows fourni mais non exécuté sous Windows.
4. **Isolation** : application locale mono-utilisateur ; outils exécutés avec les droits du compte système. Une ouverture au public nécessite isolation, gestion des utilisateurs et revue des accès.
5. **Portée de QA** : revue bornée en nombre/taille de fichiers et contexte. Un feu vert ne certifie pas tous les parcours ni la sécurité entière. Aucun test n'est inventé pour un projet sans script test.
6. **Empreinte** : exclut les fichiers cachés, dépendances, sorties et métadonnées ; elle ne couvre pas les variables d'environnement ni les services externes. Ce n'est pas une construction hermétique signée.
7. **Données** : changer MANGO_DATA_DIR ne migre pas les anciennes données ; sauvegarder données, workspace et configuration avant migration.

## Pour gagner en efficacité comme un outil professionnel

Priorité suivante : valider avec ton modèle un parcours complet « demande → plan → création → modification → publication », sur une application petite mais utile. Définir avant génération trois critères observables, vérifier ces critères dans le navigateur, puis livrer une version identifiable avec procédure de retour arrière. Mesurer le temps jusqu'au premier résultat utile et les échecs rencontrés avant d'ajouter de nouveaux agents.

Voir [README](../README.md) pour lancer et configurer cette version.
