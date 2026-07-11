// Helpers + constantes partagés de l'écran d'accueil — extraits verbatim de
// Home.jsx (découpage UI sans changement de comportement).

/* ── Pièces jointes du chat d'accueil ────────────────────────────────────────
   Le chat d'accueil n'a PAS d'accès disque : pour qu'il "lise" un fichier, on
   lit son contenu côté client (texte) et on l'injecte dans le message, entre
   des balises [[FILE:nom]]…[[/FILE]] — envoyées à GLM, masquées à l'affichage
   (la bulle montre juste une puce 📎 nom + le texte tapé). */
export const FILE_BLOCK_RE = /\[\[FILE:([^\]]+)\]\]\n([\s\S]*?)\n\[\[\/FILE\]\]\n?/g;
export const buildFileBlock = (name, content) => `[[FILE:${name}]]\n${content}\n[[/FILE]]\n`;
export function splitFileBlocks(content = "") {
  const files = [];
  const clean = content.replace(FILE_BLOCK_RE, (_, name) => { files.push(name.trim()); return ""; }).trim();
  return { files, clean };
}
export const readFileText = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });

/* ── Modèles proposés dans le sélecteur (badge) ─────────────────────────────
   "eleve" n'a pas de nom fixe — c'est le cerveau local configuré dans Réglages
   (brain-registry.json). Le libellé ci-dessous est le REPLI ; ModelBadge le
   surcharge avec le vrai nom via useEleveLabel(). */
export const MODELS = [
  { id: "sonnet", label: "Claude Sonnet 4.6" },
  { id: "opus",   label: "Claude Opus 4.8"   },
  { id: "haiku",  label: "Claude Haiku 4.5"  },
  { id: "eleve",  label: "Élève"              },
];
