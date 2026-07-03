---
domaine: ia-chat
détection: [chat, chatbot, assistant, ia, ai, llm, gpt, conversation, playground, bot, agent conversationnel, messagerie ia, prompt, copilot, compagnon]
---
# Interface IA / chat / playground

## Angle avant tout
Décide UNE personnalité d'assistant AVANT de coder, en commentaire en tête d'App — l'interface découle du personnage :
- **L'oracle** : présence quasi-mystique — avatar génératif abstrait (orbe, ondes concentriques) qui respire au repos et s'intensifie quand « il pense », typo ample, silences mis en scène.
- **Le collègue nocturne** : chaleur dans le sombre — ton complice dans les réponses, réactions visuelles (l'avatar qui acquiesce), détails humains (heure, « il tape... », petites hésitations dans le streaming).
- **Le terminal augmenté** : esthétique console poétisée — mono élégant, curseur bloc qui clignote, réponses qui se « compilent », commandes /slash suggérées.
Interdit : le clone ChatGPT blanc-gris sans identité — bulles grises, avatar rond vide, aucune âme.

## Squelette
1. **Sidebar** (~22 %, repliable, cachée par défaut en mobile) : identité de l'assistant (nom + avatar animé), nouvelle conversation, historique de 3-5 conversations simulées aux titres crédibles.
2. **Fil de conversation** (~78 %) : messages user alignés droite (bulle accent, radius 18px, coin bas-droit réduit à 4px), assistant alignés gauche (fond élévation +1, pas de bordure) ; avatar assistant visible ; horodatage discret ; auto-scroll intelligent.
3. **Message d'accueil VIVANT** : l'assistant parle en premier (streamé aussi) + 3-4 suggestions de prompts en chips cliquables — jamais un fil vide.
4. **Zone de saisie** : textarea auto-extensible (1→5 lignes), bouton envoyer qui s'active à la frappe, Enter envoie / Shift+Enter saut de ligne, focus au chargement.
5. **Cycle de réponse simulé** : envoi → indicateur « réfléchit » (3 points qui ondulent, 600-1200 ms) → **streaming caractère par caractère** (15-30 ms/caractère, par petits paquets de 2-4 pour le naturel) + curseur ▍ clignotant en bout de texte → repos.

## Design
- **Typo** : `'Inter', system-ui` pour les messages (15-16px, line-height 1.6, medium — jamais thin sur sombre, pas d'italique), `'JetBrains Mono', ui-monospace, monospace` pour les blocs de code dans les réponses.
- **Palette dark élégant** : base true grey (#121216, jamais #000), élévation par décalages de fond (+4 à +6 % de luminosité par couche : fil < bulles < saisie), cartes sans bordures. **UN accent saturé** ancré à la personnalité (oracle → violet électrique ; collègue → ambre chaud ; terminal → vert phosphore adouci) réservé aux bulles user, au curseur et à l'avatar actif — tout le reste en neutres.
- **Micro-interactions** :
  1. Envoi : la bulle user apparaît en `translateY(8px) + scale(0.97) → normal` (180 ms, easing sortant) — elle « se pose » dans le fil.
  2. Avatar : au repos, respiration lente (scale 1 → 1.05, 3 s, boucle) ; pendant la génération, pulse accéléré ou rotation d'onde — l'état de l'IA se lit sans texte.
  3. Indicateur de réflexion : 3 points en ondulation décalée (translateY ±3px, délai 150 ms entre points).
  4. Chips de suggestion : hover `translateY(-2px)` + bordure accent (150 ms) ; disparition en fade quand la conversation démarre.
- `prefers-reduced-motion` : streaming par phrases entières (pas par caractère), avatar statique avec changement de couleur d'état, pas de respiration.

## Composants canoniques
- `useStreamingText(text)` : hook qui révèle progressivement (setInterval 15-30 ms, paquets de 2-4 caractères), retourne `{ displayed, isDone }` ; skippable au clic.
- `MessageBubble` : rôle user/assistant, rendu des sauts de ligne, bloc code stylé si la réponse en contient.
- `Avatar` : SVG/CSS animé avec états `idle | thinking | speaking` — jamais une image externe.
- `TypingIndicator` : les 3 points, dans une bulle assistant vide.
- `Composer` : textarea auto-resize, compteur discret, bouton envoyer désactivé si vide.

## Pièges (AVOID)
- **Auto-scroll tyrannique** : forcer le scroll bas pendant que l'utilisateur remonte lire = infuriant. Ne coller au bas QUE si l'utilisateur y était déjà (seuil ~80px) ; sinon afficher un bouton « ↓ nouveaux messages ».
- Réponses simulées bâclées : 3 échanges génériques (« Bonjour ! Comment puis-je aider ? ») = démo morte. Écrire 5-8 paires Q/R RICHES et spécifiques au personnage, avec structure (listes, code si pertinent), routées par mots-clés + réponse par défaut en personnage.
- Streaming qui casse la mise en page : le texte qui arrive fait sauter le layout → réserver `min-height` à la bulle en cours et streamer DANS la bulle.
- Envoi pendant la génération : sans verrou (ou file d'attente), les réponses se mélangent. Désactiver l'envoi ou empiler proprement — tester en envoyant 3 messages rapides (teste_parcours).
- Clone sans personnage : si on peut remplacer le nom de l'assistant par « ChatGPT » sans que rien ne cloche, l'angle est raté (axiome 25 : ancrage identitaire).

## Données/Images
- ZÉRO image externe : avatar en SVG/CSS génératif, icônes inline — l'identité visuelle est dessinée, pas téléchargée.
- Simuler : 5-8 paires question→réponse écrites en personnage (dont une avec bloc de code, une avec liste), historique de conversations aux titres crédibles (« Idées de nom pour le studio », « Debug du parser »), horodatages relatifs réalistes.
- localStorage : persister la conversation courante pour survivre au reload.
