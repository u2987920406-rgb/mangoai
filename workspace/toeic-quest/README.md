# Yes I Can Toeic

Formation TOEIC gamifiée (React 19 + Vite 7 + Tailwind v4). Placement, parcours de 52 semaines
sur 3 niveaux, 7 parties officielles, audio SpeechSynthesis, progression 100 % locale
(`localStorage`, clé `yesicantoeic_progress_v1`).

## Commandes

```bash
npm run dev        # développement (port 5173)
npm run build      # build de production (dist/)
npm run preview    # sert le build
npm run test:e2e   # tests Playwright (build + preview automatiques sur le port 4188)
```

## Tests e2e (`npm run test:e2e`)

Deux profils Playwright (`desktop-chrome` + `mobile-pixel7`), plusieurs fichiers de specs :

- `tests/parcours.spec.js` — parcours réel : Dashboard → placement (12 questions) → verdict de niveau →
  carte du parcours (verrouillage/déverrouillage) → module → session (feedback, plafonnement des
  sessions libres à 12 questions) → résultats (revue des erreurs) → diagnostic (maîtrise, réinitialisation)
  → bilan ≥ 75 % débloque le niveau suivant → persistance `localStorage`, score borné [250, 990].
- `tests/bilan-echec.spec.js` — bilan < 75 % NE débloque PAS le niveau suivant (chemin symétrique).
- `tests/storage-corruption.spec.js` — `localStorage` de forme invalide (JSON valide mais champs de
  mauvais type, ou charabia) → repli propre, jamais de plantage.
- `tests/tts-fallback.spec.js` — sans `speechSynthesis`, le transcript s'affiche d'office.
- `tests/timer-expiry.spec.js` — expiration du timer d'examen termine la session proprement (horloge
  virtuelle Playwright, pas d'attente réelle de 5 minutes).
- `tests/placement-boundaries.spec.js` — bornes exactes de `resolvePlacement` (40 %/70 %), test logique
  pur hors navigateur.
- `tests/module-availability.spec.js` — garde de régression : tous les modules restent ≥ `MIN_PLAYABLE`.

Toutes les erreurs console/pageerror font échouer un test (sauf échecs de chargement d'images Pexels
distantes, tolérés avec repli). Prérequis une seule fois : `npx playwright install chromium`.

## Notes

- Les images du cœur de l'app (hero, thèmes, questions curées, placement) sont **locales**
  (`public/assets/pexels/`). Les questions générées (`src/data/bank/*.gen.js`) référencent
  encore des images Pexels distantes, avec repli propre hors-ligne (décision de localisation complète
  en attente — poids d'app vs couverture, voir le plan de livraison).
- Typographie : Fraunces (display) + Nunito (body), **auto-hébergées** (`public/fonts/`,
  déclarées dans `src/index.css`) — fonctionne hors-ligne (requis pour le wrap Capacitor).

---

## Déploiement

### Web

App 100 % statique (pas de backend). N'importe quel hébergeur statique gratuit convient :
**Netlify**, **Vercel** ou **Cloudflare Pages** (les trois ont un tier gratuit adapté à ce projet).

Configuration identique sur les trois :
- **Commande de build** : `npm run build`
- **Dossier à publier** : `dist`
- Déploiement automatique à chaque push si le dépôt est connecté au service (git non configuré dans ce
  repo pour l'instant — à faire au moment de choisir l'hébergeur).

### Mobile (Capacitor)

Projets natifs déjà scaffoldés (`android/`, `ios/`), icônes/splash déjà générés (voir « Identité visuelle »
ci-dessous pour les remplacer par le vrai logo du client). **Aucun build natif n'a pu être testé
pendant le développement** (pas d'Android Studio/Xcode sur la machine de développement, voir `limites.md`
L133) — le premier vrai build doit se faire sur un poste équipé.

#### Workflow général (à chaque changement de code ou de contenu)

```bash
npm run cap:sync     # équivaut à : npm run build && npx cap sync
                      # copie le nouveau build web dans android/ ET ios/, met à jour les plugins natifs
```

#### Android — build & signature

1. Prérequis : [Android Studio](https://developer.android.com/studio) installé (inclut le SDK + un JDK).
2. `npm run cap:android` (fait `cap:sync` puis ouvre le projet dans Android Studio).
3. Pour un **APK/AAB de test** : `Build → Build Bundle(s) / APK(s) → Build APK(s)` — installable direct
   sur un téléphone en mode développeur (`Build → Build Bundle(s)/APK(s)`, fichier dans
   `android/app/build/outputs/apk/`).
4. Pour une **version signée** (Play Store ou distribution directe) : `Build → Generate Signed Bundle / APK`.
   Android Studio guide la création d'un **keystore** (fichier `.jks`) la première fois — points
   d'attention réels :
   - **Garder ce fichier ET son mot de passe en lieu sûr** (gestionnaire de mots de passe, coffre-fort
     numérique) — perdu, il devient impossible de publier une mise à jour de l'app sous la même identité
     sur le Play Store, il faudrait republier comme une app entièrement nouvelle.
   - Choisir `AAB` (Android App Bundle) plutôt qu'`APK` si la cible est le Play Store (format exigé
     depuis 2021) ; `APK` reste très bien pour une distribution directe hors store.
5. Coût : **$0** — pas de compte développeur payant pour Android en dehors des frais ponctuels du Play
   Store ($25 une seule fois, si publication sur le store visée).

#### iOS — build & signature

1. Prérequis : un **Mac** avec **Xcode** installé (impossible sur Windows/Linux, limite d'Apple, pas de
   MangoOS/Capacitor).
2. `npm run cap:ios` (fait `cap:sync` puis ouvre le projet dans Xcode).
3. **Coût réel à anticiper : compte Apple Developer, 99 $/an** — c'est la seule ligne payante de tout ce
   projet ($0 partout ailleurs). Nécessaire pour signer l'app, que ce soit pour TestFlight (test) ou
   publication sur l'App Store.
4. Dans Xcode : sélectionner l'équipe de signature (`Signing & Capabilities`), puis
   `Product → Archive` → `Distribute App` → choisir **TestFlight** (test avec de vrais utilisateurs avant
   publication) ou **App Store Connect** (publication directe).

#### Identité visuelle — remplacer le placeholder

L'icône/splash actuels (`assets/icon.png`, `assets/splash.png`, `assets/splash-dark.png`) sont un
**placeholder** généré (orbe dégradé corail, cohérent avec la direction visuelle choisie, mais pas le
vrai logo du client). Pour les remplacer :
1. Remplacer `assets/icon.png` (1024×1024, fond opaque) et `assets/splash.png`/`splash-dark.png`
   (2732×2732) par les vrais visuels.
2. `npx capacitor-assets generate` régénère toutes les tailles pour Android/iOS/PWA en une commande.
3. `npm run cap:sync` pour propager dans les projets natifs.

### Checklist — à revérifier après tout changement de code ou de contenu

- [ ] `npm run build` reste vert.
- [ ] `npx playwright test` reste vert (desktop + mobile, 18 fichiers de specs — voir section Tests ci-dessus).
- [ ] `npm run cap:sync` si le changement doit atteindre les apps natives.
- [ ] Sur un vrai appareil/simulateur Android **et** iOS (aucun des deux n'est vérifiable depuis un
      navigateur desktop) : voix TTS (disponibilité réelle des voix dans la WebView), persistance
      `localStorage` après fermeture complète de l'app, affichage autour d'une encoche
      (`safe-area-inset`), taille des cibles tactiles sur les options de quiz et la carte des modules.
