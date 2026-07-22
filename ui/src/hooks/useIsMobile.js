import { useEffect, useState } from "react";

// Seuil aligné sur le breakpoint `sm:` de Tailwind (640px), déjà utilisé pour
// le reste du responsive cette session (Header/Chat/WorkspaceTools/Preview).
const QUERY = "(max-width: 639px)";

// jsdom (environnement des tests vitest) n'implémente pas matchMedia — repli
// "pas mobile" plutôt qu'une exception qui casserait le rendu en test.
const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => hasMatchMedia() && window.matchMedia(QUERY).matches);

  useEffect(() => {
    if (!hasMatchMedia()) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
