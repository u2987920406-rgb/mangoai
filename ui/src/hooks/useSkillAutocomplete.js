import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// #174 — Skills à invocation directe : « /slug args » tapé au composer est
// remplacé par le corps de la skill (substitution côté back). Extrait de
// Chat.jsx sans changement de comportement : bibliothèque de skills, ouverture/
// fermeture de l'autocomplete « /slug », et expansion du slug avant envoi.
export function useSkillAutocomplete({ input, inputRef, busy, setInput }) {
  const [skills, setSkills] = useState([]);
  const [menuActive, setMenuActive] = useState(0);            // item surligné de l'autocomplete /slug
  const [menuDismissed, setMenuDismissed] = useState(false);  // Échap ferme jusqu'à la frappe suivante
  const expandingRef = useRef(false);                        // évite deux expansions concurrentes (double-Entrée)

  const refetchSkills = useCallback(() => {
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((d) => setSkills((d.skills ?? []).filter((s) => s && s.slug)))
      .catch(() => {});
  }, []);
  useEffect(() => { refetchSkills(); }, [refetchSkills]);
  const startsSlash = input.startsWith("/");
  useEffect(() => { if (startsSlash) refetchSkills(); }, [startsSlash, refetchSkills]);

  // Autocomplete : ouvert uniquement tant que le slug est en cours de frappe
  // (slash + slug SANS espace) ; dès qu'un espace est tapé, on passe aux arguments
  // et le menu se ferme. Un slug inconnu tapé en entier n'ouvre rien de spécial.
  const slugTyping = /^\/(\S*)$/.exec(input);
  const slugQuery = slugTyping ? slugTyping[1].toLowerCase() : null;
  const skillSuggestions = useMemo(() => {
    if (slugQuery === null) return [];
    return skills.filter((s) => s.slug.toLowerCase().includes(slugQuery)).slice(0, 6);
  }, [slugQuery, skills]);
  const skillMenuOpen = skillSuggestions.length > 0 && !menuDismissed && !busy;
  // Reset de la sélection + réouverture (après Échap) à chaque frappe — MAIS uniquement
  // pour une commande « /… » (le seul cas où l'autocomplete existe). Sans ce gate,
  // 2 setState partaient à CHAQUE frappe de prose ; en dev (StrictMode double les
  // effets) la frappe rapide empile assez de rendus synchrones pour franchir la limite
  // React « Maximum update depth exceeded ». Gaté sur `startsSlash` → zéro churn hors slug.
  useEffect(() => {
    if (!startsSlash) return;
    setMenuActive(0);
    setMenuDismissed(false);
  }, [input, startsSlash]);

  // Complète le composer avec « /slug » + un espace (prêt pour les arguments).
  const completeSkill = (s) => {
    if (!s) return;
    setInput(`/${s.slug} `);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  // Résout « /slug [args] » → corps expansé (substitution $ARGUMENTS côté back),
  // ou null si le slug est inconnu / l'endpoint échoue → l'appelant envoie alors
  // le texte brut tel quel (garde-fou : un slash + slug inconnu ne casse rien).
  const skillSlugs = useMemo(() => new Set(skills.map((s) => s.slug)), [skills]);
  async function maybeExpandSkill(raw) {
    const m = /^\/([^\s]+)([\s\S]*)$/.exec(raw);
    if (!m || !skillSlugs.has(m[1])) return null;
    const args = m[2].trim();
    try {
      const r = await fetch(`/api/skills/${encodeURIComponent(m[1])}?args=${encodeURIComponent(args)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return typeof d.expanded === "string" ? d.expanded : null;
    } catch {
      return null;
    }
  }

  return {
    skills,
    menuActive, setMenuActive,
    menuDismissed, setMenuDismissed,
    expandingRef,
    skillSuggestions,
    skillMenuOpen,
    completeSkill,
    maybeExpandSkill,
  };
}
