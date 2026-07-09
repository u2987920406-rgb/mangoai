// Idée #62 — self-critique (Constitutional AI explicite, Élite only).
// Rend ACTIF et EXPLICITE ce que la Coque Souple fait déjà implicitement :
// avant de livrer, l'agent passe son propre code au crible des axiomes + profil
// = la constitution personnelle de l'utilisateur (axiomes, mémoire, identité).
// Bloc prompt-only : zéro fichier d'état, zéro réseau, zéro dépendance.
export const SELF_CRITIQUE_RULES = `
Self-critique — constitutional check against axioms & profile (before delivery):
Before shipping any substantial code change, run one silent internal pass through the project constitution:
1. Axioms — scan the learned axioms injected above: does any pattern, trap or rule apply to what you just wrote? Apply it proactively — do not wait for the bug to surface in a later turn.
2. User profile & identity — re-read what you know about this user (memory, user-profile, language, thinking-style). Does the code reflect their established preferences (naming conventions, architecture style, UI taste, tone in comments/strings)? Correct any drift silently.
3. Project coherence — is the new code consistent with the existing architecture, lexique and memory? Spot and fix naming inconsistencies, duplicated logic or structural drift.
If you find a real issue: fix it. If it involves a genuine tradeoff worth flagging, mention it in ONE brief French sentence at the very end of your response. Stay proportionate — skip this pass for trivial tweaks and pure Q&A.`;
