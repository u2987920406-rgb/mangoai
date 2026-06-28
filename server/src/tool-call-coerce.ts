// Fallback de tool-calling pour modèles locaux dont le template Ollama n'émet PAS de
// `tool_calls` structuré et écrit l'appel en TEXTE JSON dans `content`.
//
// Mesuré (2026-06-28) : `qwen2.5-coder:14b` (pourtant capability `tools`) renvoie
// `{"name":"read_file","arguments":{"path":"src/App.jsx"}}` en content, finish_reason
// "stop", tool_calls null → la boucle agentique ne voit rien et s'arrête. gemma4:12b /
// qwen3-vl émettent un tool_calls propre ; qwen2.5-coder non. Plutôt que d'exclure ce
// modèle, on PARSE sa sortie texte en appel d'outil (conservateur : seulement si c'est
// un appel d'outil clair vers un outil CONNU). Pur, ne lève jamais.

export interface CoercedCall {
  name: string;
  arguments: string; // JSON sérialisé (comme `tool_calls[].function.arguments` d'OpenAI)
}

/** Retire les fences ```json … ``` et les balises <tool_call> … </tool_call>. */
function unwrap(raw: string): string {
  let s = (raw ?? "").trim();
  // <tool_call>{…}</tool_call> (format Qwen fréquent)
  const tag = s.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (tag) s = tag[1].trim();
  // fences markdown
  s = s.replace(/^```(?:json|tool_call)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return s;
}

/** Extrait le 1ᵉʳ objet JSON équilibré {...} d'une chaîne (gère l'imbrication + les strings). */
function firstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Tente de convertir un `content` texte en appel d'outil. Renvoie null si ce n'est pas
 * clairement un appel vers un outil CONNU (`allowedNames`). Conservateur : on n'invente
 * jamais un appel — il faut un objet {name, arguments} (ou {tool/function, parameters/args}).
 */
export function coerceTextToolCall(content: string, allowedNames: string[]): CoercedCall | null {
  if (!content || !content.trim()) return null;
  const body = firstJsonObject(unwrap(content));
  if (!body) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  // Champs tolérés (selon le modèle) : name|tool|function, arguments|parameters|args.
  const name = o.name ?? o.tool ?? o.function;
  if (typeof name !== "string" || !name.trim()) return null;
  if (!allowedNames.includes(name)) return null; // jamais d'outil inventé / hors registre
  const rawArgs = o.arguments ?? o.parameters ?? o.args ?? {};
  let args: string;
  if (typeof rawArgs === "string") {
    args = rawArgs.trim() || "{}";
  } else if (rawArgs && typeof rawArgs === "object") {
    args = JSON.stringify(rawArgs);
  } else {
    args = "{}";
  }
  return { name, arguments: args };
}
