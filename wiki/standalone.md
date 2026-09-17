---
type: concept
tags: [standalone, installation, qualite]
maj: 2026-09-17
---

# Application autonome locale

`npm run setup` installe Mango et MangoQA côte à côte et compile l'interface. `npm start` sert UI et API sur localhost:3000 et gère les deux processus. `npm run doctor` vérifie l'environnement. Voir [installation](../README.md).

Les données et projets ont des chemins configurables. La publication exige les tests présents et un verdict QA complet correspondant à la demande. Un résultat inconnu reste non vérifié ; les sources sont recontrôlées avant envoi.

Ce mode nécessite Node, npm et Git. Il est mono-utilisateur, sans sandbox ni installateur signé. La création par IA et la publication avec les comptes de Raf restent à valider. Voir [audit et preuves](../docs/audit-standalone-2026-09-17.md).
