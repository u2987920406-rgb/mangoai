// Helpers purs + constantes extraits de Knowledge.jsx (Phase découpage UI :
// séparer le monolithe sans aucun changement de comportement).

// Idée #48 — extrait les pastilles de palette (hex + label) du Miroir pour les
// afficher : la moitié "visible" de la compréhension. Tolérant, dédupe les hex.
export const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

export function miroirSwatches(md) {
  if (!md) return [];
  const out = [];
  const seen = new Set();
  for (const raw of md.split(/\r?\n/)) {
    const m = raw.match(HEX_RE);
    if (!m) continue;
    const hex = m[0].toLowerCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    const after = raw.slice(raw.indexOf(m[0]) + m[0].length).trim();
    out.push({ hex, label: after.replace(/^[—–\-:•·]\s*/, "").trim() });
  }
  return out;
}

// The reviewer sometimes writes a YAML frontmatter header — metadata, not
// content; hide it from the rendered view.
export const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

// Idée #76 — applique/rejette une proposition et met à jour son statut localement.
export async function mutateProposal(runId, pid, action, setEvoRuns) {
  const r = await fetch(`/api/prompt-evolution/${encodeURIComponent(runId)}/${encodeURIComponent(pid)}/${action}`, { method: "POST" });
  if (!r.ok) return;
  const d = await r.json();
  const status = d.proposal?.status ?? (action === "apply" ? "applied" : "rejected");
  setEvoRuns((prev) =>
    (prev || []).map((run) =>
      run.id !== runId ? run : { ...run, proposals: run.proposals.map((p) => (p.id === pid ? { ...p, status } : p)) },
    ),
  );
}

// Brain-Dispatch #150 — chaque agent a SON cerveau, éditable ici (registre
// data/brain-registry.json). Le routage par cerveau s'active avec BRAIN_DISPATCH=on.
export const BRAIN_PROVIDERS = ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"];
export const FIELD_CLS = "rounded border border-edge bg-bg px-1.5 py-1 text-[11px] text-ink focus:border-accent focus:outline-none transition-colors";
