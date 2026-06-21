// #140 — Livraison du projet (déploiement + push GitHub) extraite du
// god-component. Cohésif : URLs produites + drapeaux « en cours », réinitialisés
// au changement de projet. Dépend de projectName et des toasts (injectés).
// Note : `githubEnabled` (global, issu de /api/projects) reste géré par App.
import { useState, useEffect, useCallback } from "react";

export function useProjectDelivery({ projectName, pushToast }) {
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [githubUrl, setGithubUrl] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);

  // Changer de projet efface les URLs de livraison du projet précédent.
  useEffect(() => {
    setDeployedUrl(null);
    setGithubUrl(null);
  }, [projectName]);

  const deploy = useCallback(
    async (target = "cloudflare") => {
      if (deploying) return;
      setDeploying(true);
      try {
        const res = await fetch(`/api/deploy/${encodeURIComponent(projectName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          pushToast("error", d.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setDeployedUrl(d.url);
        pushToast("success", "Site publié en ligne 🎉", d.url);
      } catch (err) {
        pushToast("error", String(err));
      } finally {
        setDeploying(false);
      }
    },
    [deploying, projectName, pushToast],
  );

  const pushGithub = useCallback(
    async (targetRepo) => {
      if (pushingGithub) return;
      setPushingGithub(true);
      try {
        const res = await fetch(`/api/github/${encodeURIComponent(projectName)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ private: true, ...(targetRepo ? { targetRepo } : {}) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          pushToast("error", d.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setGithubUrl(d.url);
        pushToast("success", "Projet poussé sur GitHub 🐙", d.url);
      } catch (err) {
        pushToast("error", String(err));
      } finally {
        setPushingGithub(false);
      }
    },
    [pushingGithub, projectName, pushToast],
  );

  return { deployedUrl, githubUrl, deploying, pushingGithub, deploy, pushGithub };
}
