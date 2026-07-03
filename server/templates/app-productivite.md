---
domaine: app-productivite
détection: [todo, to-do, tâches, tasks, kanban, notes, tracker, habitudes, habits, habit, productivité, productivity, checklist, liste, agenda, planner, organisation, pomodoro, focus]
---
# Outil de productivité

## Angle avant tout
Décide UN angle non-évident AVANT de coder, en commentaire en tête d'App :
- **Rituel du matin** : l'app a une temporalité (salutation selon l'heure, « 3 tâches pour aujourd'hui » mises en scène, clôture de journée) — un compagnon, pas un tableur.
- **Jardin qui pousse** : chaque complétion nourrit une métaphore visuelle persistante (streak = plante, constellation, mosaïque qui se remplit) — le progrès se contemple.
- **Papeterie de luxe** : l'app comme un beau carnet (texture papier, typo soignée, cocher = un geste calligraphique) — la matérialité du soin.
Interdit : la liste blanche de checkboxes natives avec un input en haut — le clone de tutoriel React vu 10 000 fois.

## Squelette
1. **Header identitaire** (~15 %) : nom de l'app avec caractère, date du jour formatée avec goût, UNE stat vivante (« 4/7 aujourd'hui », streak) — pas un dashboard de 6 KPIs.
2. **Zone de capture** : input d'ajout proéminent, focus au chargement, Enter pour valider ; l'item apparaît avec une animation d'insertion (slide + fade 200 ms).
3. **Corps** (~70 %) : la liste / le board kanban (3 colonnes drag & drop) / la grille d'habitudes (7 jours × habitudes). Groupement clair (aujourd'hui / plus tard / fait), items denses mais respirants (padding 14-18px).
4. **État vide SOIGNÉ** : illustration SVG inline ou grande typo chaleureuse + phrase qui donne envie + CTA vers la capture — jamais une zone blanche muette. Même exigence pour « tout est fait » (mini-célébration).
5. **Persistance localStorage** : charger au mount, sauver à chaque mutation (clé versionnée `app:v1`), try/catch au parse. Seed de 4-6 items crédibles au premier lancement pour que l'app arrive VIVANTE.

## Design
- **Typo** : humaniste chaleureuse pour l'UI (`'Inter', system-ui`) + display avec personnalité pour header et états vides (`'Fraunces', Georgia, serif` ou `'Space Grotesk', system-ui` selon l'angle). Tâches en 15-16px min.
- **Palette** : ancrée à l'usage (focus/deep work → encre + ambre calme ; habitudes santé → verts organiques ; kanban équipe → neutres + 1 accent par colonne max). Le fait-accompli en teinte éteinte, l'accent réservé à la complétion. Jamais le bleu-bootstrap par défaut.
- **Micro-interactions (la complétion est LE produit — elle doit être délicieuse)** :
  1. Cocher : la case se remplit avec un path SVG dessiné (stroke-dashoffset animé 250 ms), l'item `scale(1 → 1.02 → 1)`, le texte se barre par une ligne qui se trace (200 ms) — puis l'item glisse vers sa section « fait » après 500 ms de pause savourée.
  2. Streak/complétion totale : pulse de la stat + 6-10 particules confetti sobres aux couleurs de la palette (800 ms, une fois).
  3. Suppression : swipe/clic → l'item se compresse en hauteur (200 ms, easing sortant) avec undo toast 4 s — jamais de disparition sèche.
  4. Drag kanban : la carte prend `scale(1.03)` + ombre portée + tilt 2°, la zone cible se surligne.
- `prefers-reduced-motion` : remplacer par changements d'opacité/couleur instantanés, pas de confetti ni translation.

## Composants canoniques
- `useLocalStorage(key, initial)` : hook générique, sérialisation JSON, clé versionnée.
- `TaskItem` : checkbox custom SVG (jamais la native brute), états `todo | done | leaving`.
- `EmptyState` : illustration/typo + phrase + CTA — un composant à part entière, pas un `<p>`.
- `Toast` : undo de suppression, coin bas, auto-dismiss 4 s.
- `StatBadge` : compteur interpolé (compte en montant), pas de saut.

## Pièges (AVOID)
- **Complétion sans cérémonie** : cocher qui change juste un booléen à l'écran = l'app entière rate sa raison d'être (axiome 33).
- État vide négligé : c'est le PREMIER écran vu ; une zone blanche = première impression ratée. Le seed initial n'exempte pas de le soigner (l'utilisateur supprimera tout).
- localStorage naïf : parse sans try/catch = écran blanc au premier JSON corrompu ; oublier de sauver une mutation (le drag & drop, souvent) = données perdues au reload. Tester : ajouter, cocher, reload, vérifier (teste_parcours).
- Fonctionnalités en accumulation : tags + priorités + dates + filtres + recherche à moitié finis < UNE boucle capture→complétion parfaite (axiome 31).
- Éditer impossible : un double-clic doit permettre de corriger le texte d'un item — standard du genre trop souvent oublié.

## Données/Images
- ZÉRO image externe : icônes et illustrations d'états vides en SVG inline, cohérents avec la palette.
- Simuler : seed de tâches/habitudes crédibles et spécifiques (« Répondre à Léa sur le devis », « 20 min de course ») — jamais « Task 1 » ; dates relatives réalistes ; un streak déjà entamé pour que les stats vivent.
