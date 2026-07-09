// MangoOS Kernel — MCP / Registre d'outils (pilier 4, cf. fondation.md).
//
// MCP (Model Context Protocol) est le standard pour donner des OUTILS à un
// cerveau. MangoOS l'utilise déjà via le Claude Agent SDK (`vision.ts` =
// serveur MCP in-process). Le Kernel ajoute par-dessus un REGISTRE NEUTRE :
// un agent décrit son outil UNE fois (`KernelTool`), et le Kernel l'expose
//   - en serveur MCP SDK     → pour le cerveau Claude (`query()`),
//   - en function-calling     → pour les cerveaux OpenAI-compat (litellm/Ollama).
//
// C'est le pendant « outils » du Brain Adapter : l'outil est agnostique au
// cerveau, le Kernel fait l'adaptation. Standard à la périphérie (MCP/OpenAI),
// registre neutre au cœur.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z, type ZodRawShape } from 'zod'

/** Ce qu'un outil renvoie au cerveau (texte ; `isError` pour signaler un échec). */
export interface KernelToolResult {
  text: string
  isError?: boolean
}

/** Un outil neutre du Kernel. `inputSchema` est un ZodRawShape (comme le SDK). */
export interface KernelTool {
  name: string
  description: string
  inputSchema: ZodRawShape
  handler: (args: Record<string, unknown>) => Promise<KernelToolResult> | KernelToolResult
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export class ToolRegistry {
  private tools = new Map<string, KernelTool>()

  /** Enregistre un outil. Lève si le nom est déjà pris (pas d'écrasement silencieux). */
  register(t: KernelTool): void {
    if (this.tools.has(t.name)) {
      throw new Error(`Outil déjà enregistré : "${t.name}"`)
    }
    this.tools.set(t.name, t)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  get(name: string): KernelTool | undefined {
    return this.tools.get(name)
  }

  list(): KernelTool[] {
    return [...this.tools.values()]
  }

  names(): string[] {
    return [...this.tools.keys()]
  }

  /** Exécute un outil. Valide les arguments contre son schéma AVANT le handler
   * (le Kernel fait respecter le contrat), puis renvoie son résultat.
   * Lève si l'outil est inconnu ou si les arguments sont invalides. */
  async invoke(name: string, args: Record<string, unknown>): Promise<KernelToolResult> {
    const t = this.tools.get(name)
    if (!t) throw new Error(`Outil inconnu : "${name}"`)
    const parsed = z.object(t.inputSchema).parse(args) as Record<string, unknown>
    return t.handler(parsed)
  }
}

/** Adapte le registre en serveur MCP in-process pour le cerveau Claude (`query()`).
 * À passer dans `query({ options: { mcpServers: { kernel: <ici> } } })`. */
export function toMcpServer(
  registry: ToolRegistry,
  serverName = 'kernel',
): ReturnType<typeof createSdkMcpServer> {
  const tools = registry.list().map((kt) =>
    tool(kt.name, kt.description, kt.inputSchema, async (args: Record<string, unknown>) => {
      const r = await kt.handler(args)
      return {
        content: [{ type: 'text' as const, text: r.text }],
        ...(r.isError ? { isError: true } : {}),
      }
    }),
  )
  return createSdkMcpServer({ name: serverName, version: '1.0.0', tools })
}

/** Adapte le registre au format function-calling OpenAI (litellm/Ollama).
 * Le ZodRawShape est converti en JSON Schema via Zod v4 natif. */
export function toOpenAITools(registry: ToolRegistry): OpenAITool[] {
  return registry.list().map((kt) => ({
    type: 'function',
    function: {
      name: kt.name,
      description: kt.description,
      parameters: z.toJSONSchema(z.object(kt.inputSchema)) as Record<string, unknown>,
    },
  }))
}

// ── Registre par défaut du Kernel (singleton) ────────────────────────────────
let current: ToolRegistry | null = null

export function getToolRegistry(): ToolRegistry {
  if (current === null) current = new ToolRegistry()
  return current
}

export function setToolRegistry(registry: ToolRegistry): void {
  current = registry
}

export function resetToolRegistry(): void {
  current = null
}
