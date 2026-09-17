# Mango — application autonome locale

Mango permet de créer et modifier des applications par conversation, puis d’en voir l’aperçu.
MangoQA contrôle les changements dans un processus séparé. Le mode autonome sert l’interface compilée et l’API sur une seule adresse, sans VS Code ni serveur Vite pour l’interface de Mango.

## Installation

Prérequis : **Node.js 22.18 minimum (24 recommandé)**, npm et Git. Internet est nécessaire pour installer les dépendances. Les deux dépôts doivent être côte à côte :

```text
Mango/
  mangoai/
  MangoQA/
```

Dans `mangoai` :

```sh
npm run setup
npx --prefix server playwright install chromium
npm start
```

Sous Linux, les bibliothèques système du navigateur peuvent nécessiter `npx --prefix server playwright install --with-deps chromium`.
Ouvrir **http://127.0.0.1:3000**. `Ctrl+C` arrête Mango et MangoQA.
Sous Windows, `Lancer-Mango.cmd` lance le même service après installation.

`npm run doctor` vérifie les fichiers, les droits de sauvegarde, Git, le lancement réel du navigateur et la disponibilité d’Ollama. L’absence d’Ollama ne signifie pas que Claude est connecté.

## Connecter un modèle

- **Ollama** : démarrer Ollama, installer ou rendre disponible le modèle souhaité, puis le sélectionner dans **Menu → Réglages → Intelligence**. Adapter `OLLAMA_URL` si le service tourne ailleurs.
- **Claude** : le chemin Claude utilise la connexion du SDK Claude Code ; connecter ce compte sur la machine. Une clé `ANTHROPIC_API_KEY` seule ne configure pas ce chemin.
- **MangoQA** : renseigner son modèle via `QA_OLLAMA_MODEL` dans `MangoQA/.env`, ou configurer son repli Claude. Le processus peut démarrer sans modèle disponible ; ses audits seront alors **non vérifiés**, jamais validés par défaut.

La création par IA dépend d’un fournisseur effectivement disponible. Aucun modèle n’est embarqué dans cette distribution. Un abonnement ou des frais fournisseur peuvent s’appliquer.

## Créer et livrer

1. Décrire la création dans la conversation, puis ouvrir le projet dans l’atelier.
2. Vérifier l’aperçu et demander des modifications ciblées.
3. Vérifier le fonctionnement réel des boutons, des données et des parcours importants.
4. Publier vers l’un des hébergeurs configurés. Le bouton de publication exécute les tests définis dans le projet, demande un nouvel audit MangoQA, puis compile. Un audit rouge, incomplet, absent ou un changement de sources pendant la vérification bloque l’envoi.

Le verdict QA reste un audit de code borné (sélection de fichiers et taille de contexte). Il ne constitue ni une certification de sécurité ni une preuve exhaustive du fonctionnement. Les tests absents ne sont pas inventés. Les branches non applicables sont distinguées des vérifications échouées techniquement.

Le déploiement actuel exporte un **site statique** (`dist/index.html`). Un backend, une base de données ou un serveur SSR nécessite un hébergement et une configuration supplémentaires. Les connexions Cloudflare/Vercel/Netlify sont à établir séparément. La publication réelle n’a pas été testée avec tes comptes lors de cet audit.

## Données et mises à jour

Copier `.env.example` vers `.env` pour adapter l’installation. Les variables du processus sont prioritaires, puis `.env`, puis `server/.env`.

| Variable | Usage |
|---|---|
| `MANGOAI_WORKSPACE` | Projets et mémoire, défaut `workspace` |
| `MANGO_DATA_DIR` | Registres et réglages, défaut `server/data` |
| `MANGOQA_DIR` | Dépôt de l’auditeur, défaut `../MangoQA` |
| `PORT` | Adresse de Mango, défaut `3000` |
| `OLLAMA_URL` | Service Ollama |
| `MANGO_BROWSER_CHANNEL` | Navigateur déjà installé, ex. `msedge` ; sinon Chromium Playwright |
| `MANGO_BROWSER_EXECUTABLE` | Chemin explicite d’un Chromium géré par l’administrateur |

Les chemins relatifs sont résolus depuis `mangoai`. Arrêter Mango avant une sauvegarde ; conserver **workspace, data et les fichiers .env**. Ne pas lancer deux installations sur les mêmes dossiers de données. Les fichiers de données inclus dans un dépôt existant ne sont pas automatiquement migrés quand on change ces chemins.

Le lanceur refuse un port occupé sans arrêter l’autre application. Il démarre et arrête les deux services ensemble. Si l’un meurt, il arrête l’ensemble et affiche l’erreur ; il ne masque pas la panne par une relance infinie.

## Périmètre de déploiement

Cette version est une application **mono-utilisateur locale**, utilisable dans un navigateur. Elle nécessite Node/npm/Git ; ce n’est pas encore un `.exe` contenant tous ses runtimes. La coque Tauri existante reste distincte et n’est pas certifiée redistribuable.

Par défaut l’accès est limité à la machine. Pour exposer le service réseau, un `MANGO_AUTH_TOKEN` aléatoire de 32 caractères minimum est obligatoire avec `HOST=0.0.0.0` (utilisateur HTTP : `mango`). Utiliser HTTPS hors localhost. Les aperçus restent locaux dans ce mode : ce n’est pas un hébergement multi-utilisateur sur Internet. Mango exécute des outils et du code avec les droits de son compte système ; l’authentification ne remplace pas une isolation des applications.

## Vérification

```sh
npm run typecheck
npm test
npm --prefix server run test:offline
npm --prefix ../MangoQA test
npm run test:standalone
npm run test:browser
```

Le test `server/src/tests/test-preview-live.ts` installe réellement le template, ouvre Vite dans Chromium, clique un compteur de test, compile, arrête, rouvre puis supprime le projet temporaire. Il n’appelle pas d’IA.

Le workflow `.github/workflows/quality.yml` prépare les contrôles automatiques après push. Il doit utiliser la version correspondante de MangoQA : les deux dépôts évoluent ensemble pour le verdict `unknown` et la corrélation des audits.
