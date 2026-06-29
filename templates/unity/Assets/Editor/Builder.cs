// Point d'entrée du build HEADLESS appelé par MangoOS (domains.ts → inspectUnity) :
//   Unity -batchmode -quit -nographics -executeMethod Builder.PerformBuild -buildTarget <cible>
//
// Sort en code != 0 sur erreur de compilation ou échec de build → signal objectif
// équivalent au `vite build` du domaine web. Lit la cible depuis -buildTarget.
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class Builder
{
    static string[] Scenes()
    {
        return EditorBuildSettings.scenes
            .Where(s => s.enabled)
            .Select(s => s.path)
            .ToArray();
    }

    static BuildTarget ParseTarget()
    {
        var args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "-buildTarget" && Enum.TryParse(args[i + 1], out BuildTarget t))
                return t;
        }
        return BuildTarget.StandaloneWindows64;
    }

    public static void PerformBuild()
    {
        var target = ParseTarget();
        var scenes = Scenes();
        if (scenes.Length == 0)
            scenes = new[] { "Assets/Scenes/Main.unity" };

        string ext = target == BuildTarget.StandaloneWindows64 ? ".exe" : "";
        var options = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = "Build/MangoGame" + ext,
            target = target,
            options = BuildOptions.None,
        };

        var report = BuildPipeline.BuildPlayer(options);
        var summary = report.summary;
        Debug.Log($"[Builder] {summary.result} — {summary.totalSize} octets, {summary.totalErrors} erreur(s).");

        if (summary.result != BuildResult.Succeeded)
        {
            EditorApplication.Exit(1);
        }
        EditorApplication.Exit(0);
    }
}
