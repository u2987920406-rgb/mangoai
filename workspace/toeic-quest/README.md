# TOEIC Quest

Formation TOEIC gamifiée (React 19 + Vite 7 + Tailwind v4). Placement, parcours de 52 semaines
sur 3 niveaux, 7 parties officielles, audio SpeechSynthesis, progression 100 % locale
(`localStorage`, clé `toeicquest_progress_v1`).

## Commandes

```bash
npm run dev        # développement (port 5173)
npm run build      # build de production (dist/)
npm run preview    # sert le build
npm run test:e2e   # tests Playwright (build + preview automatiques sur le port 4188)
```

## Tests e2e (`npm run test:e2e`)

La suite `tests/parcours.spec.js` joue le parcours réel :

- Dashboard → test de placement (12 questions) → verdict de niveau
- Carte du parcours : vérification du verrouillage/déverrouillage des modules
- Module → session (feedback correct/incorrect, plafonnement des sessions libres à 12 questions)
- Écran de résultats : la revue des erreurs affiche énoncé, réponse donnée, bonne réponse, explication
- Diagnostic : maîtrise par partie + réinitialisation
- Bilan réussi à ≥ 75 % → déverrouillage du niveau suivant
- Persistance `localStorage`, score estimé borné [250, 990], **zéro** erreur console/pageerror

Prérequis une seule fois : `npx playwright install chromium`.

## Notes

- Les images du cœur de l'app (hero, thèmes, questions curées, placement) sont **locales**
  (`public/assets/pexels/`). Les questions générées (`src/data/bank/*.gen.js`) référencent
  encore des images Pexels distantes, avec repli propre hors-ligne.
- Typographie : Fraunces (display) + Nunito (body).
