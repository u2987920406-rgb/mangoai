// Outils UNITY de l'Élève (Phase 3a) — compétence C#/Unity, gatée ELEVE_UNITY=on.
//
// L'édition de fichiers .cs/.unity passe par les outils write_file/edit_file existants
// (neutres). Ce qui MANQUAIT à Mango pour « coder sur Unity » : pouvoir BÂTIR et VÉRIFIER
// un projet Unity sans navigateur — deux actions propres au domaine :
//   • unity_build → build headless (signal objectif équivalent au `vite build` du web)
//   • unity_test  → suite de tests Unity (EditMode/PlayMode) via le test runner CLI
//
// Tout est borné, ne lève jamais, et deps injectables (tests sans Unity installé). Si
// UNITY_PATH n'est pas défini, l'outil le DIT franchement (pas de faux succès silencieux).

import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { runCmd } from "../inspection.js";
import { unityBinary } from "../domains.js";

/** Dépendances injectables (tests : pas de CLI Unity réel). */
export interface UnityToolDeps {
  /** Chemin du binaire Unity, ou null si absent. */
  binary: () => string | null;
  /** Lance le CLI Unity avec une ligne de commande complète. */
  run: (command: string, dir: string, timeoutMs: number) => Promise<{ code: number; out: string; timedOut: boolean }>;
}

const realUnityDeps: UnityToolDeps = {
  binary: unityBinary,
  run: runCmd,
};

const BUILD_TIMEOUT = 600_000;
const TEST_TIMEOUT = 600_000;

export function buildEleveUnityTools(projectDir: string, deps: UnityToolDeps = realUnityDeps): KernelTool[] {
  const needBinary = (): KernelToolResult | null => {
    const bin = deps.binary();
    if (!bin) {
      return {
        text:
          "Unity n'est pas disponible : UNITY_PATH n'est pas défini. Demande à l'utilisateur d'installer Unity " +
          "Editor et d'exporter UNITY_PATH (chemin du binaire Unity). Je ne peux pas construire un projet Unity sans lui.",
        isError: true,
      };
    }
    return null;
  };

  const unityBuild: KernelTool = {
    name: "unity_build",
    description:
      "Construit le projet Unity en HEADLESS (sans interface) pour vérifier qu'il compile et se package — " +
      "l'équivalent Unity de `check_build`. Appelle-le après avoir édité des scripts .cs ou des scènes pour " +
      "vérifier objectivement que rien n'est cassé. Échoue (isError) sur erreur de compilation C# / scène invalide.",
    inputSchema: {
      buildTarget: z
        .string()
        .optional()
        .describe("Cible de build (défaut StandaloneWindows64). Ex. StandaloneOSX, StandaloneLinux64, Android."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const missing = needBinary();
      if (missing) return missing;
      const target = typeof args.buildTarget === "string" && args.buildTarget.trim() ? args.buildTarget.trim() : "StandaloneWindows64";
      try {
        const cmd =
          `"${deps.binary()}" -batchmode -quit -nographics -projectPath "${projectDir}" ` +
          `-executeMethod Builder.PerformBuild -buildTarget ${target} -logFile -`;
        const { code, out, timedOut } = await deps.run(cmd, projectDir, BUILD_TIMEOUT);
        if (timedOut) return { text: `BUILD UNITY TIMEOUT (>${Math.round(BUILD_TIMEOUT / 1000)}s)\n${out.slice(-600)}`, isError: true };
        if (code !== 0) return { text: `BUILD UNITY CASSÉ (code ${code}) :\n${out.slice(-1500)}`, isError: true };
        return { text: `BUILD UNITY VERT (${target}).\n${out.slice(-400)}` };
      } catch (e) {
        return { text: `Build Unity non lancé : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  const unityTest: KernelTool = {
    name: "unity_test",
    description:
      "Lance la suite de tests Unity (Test Runner CLI) pour vérifier que la LOGIQUE marche, pas seulement qu'elle " +
      "compile. `testPlatform` = EditMode (rapide, logique pure) ou PlayMode (runtime). Échoue (isError) si un test rouge.",
    inputSchema: {
      testPlatform: z.enum(["EditMode", "PlayMode"]).optional().describe("Plateforme de test (défaut EditMode)."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const missing = needBinary();
      if (missing) return missing;
      const platform = args.testPlatform === "PlayMode" ? "PlayMode" : "EditMode";
      try {
        const cmd =
          `"${deps.binary()}" -batchmode -runTests -projectPath "${projectDir}" ` +
          `-testPlatform ${platform} -logFile -`;
        const { code, out, timedOut } = await deps.run(cmd, projectDir, TEST_TIMEOUT);
        if (timedOut) return { text: `TESTS UNITY TIMEOUT (>${Math.round(TEST_TIMEOUT / 1000)}s)\n${out.slice(-600)}`, isError: true };
        if (code !== 0) return { text: `TESTS UNITY ROUGES (code ${code}) :\n${out.slice(-1500)}`, isError: true };
        return { text: `TESTS UNITY VERTS (${platform}).\n${out.slice(-400)}` };
      } catch (e) {
        return { text: `Tests Unity non lancés : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  return [unityBuild, unityTest];
}
