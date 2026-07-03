// État global LÉGER de la 2.0 — un Context, pas un framework (audit §3.2 U3 : 427 useState / 0 Context).
// Porte : navigation du shell (avec HISTORIQUE → bouton Retour), toasts, et la « graine »
// de projet (Accueil/palette → builder avec premier prompt). Le reste demeure local aux écrans.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastItem {
  id: number;
  kind: "ok" | "error";
  text: string;
}

/** Graine passée au builder : projet à ouvrir + premier prompt à auto-envoyer (optionnel). */
export interface BuilderSeed {
  project: string;
  prompt: string | null;
}

export interface AppState {
  /** Item de navigation actif du shell (id du catalogue). */
  active: string;
  /** Navigue vers un item en empilant l'historique (→ bouton Retour). */
  go: (id: string) => void;
  /** Revient à l'item précédent (no-op si historique vide). */
  back: () => void;
  /** true si le bouton Retour a quelque chose à dépiler. */
  canBack: boolean;
  /** Ouvre le builder sur un projet (créé au premier tour de chat si nouveau). */
  openProject: (name: string, prompt?: string | null) => void;
  builderSeed: BuilderSeed | null;
  consumeBuilderSeed: () => void;
  /** Va au builder et y ouvre la modale « Nouveau projet » (depuis n'importe quelle section). */
  requestNewProject: () => void;
  /** Nonce lu par le builder : incrémenté → ouvre la modale de création. 0 = rien. */
  newProjectNonce: number;
  /** Ouvre une conversation d'accueil PASSÉE (depuis l'écran « Conversation ») → va à l'Accueil et l'y charge. */
  openConversation: (convId: string) => void;
  /** convId de la conversation d'accueil à (re)charger, lu par l'Accueil au montage. null = nouvelle. */
  homeConvSeed: string | null;
  consumeHomeConvSeed: () => void;
  /** Toasts (pont vers le composant Toast existant). */
  toasts: ToastItem[];
  pushToast: (kind: ToastItem["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children, initialActive = "accueil" }: { children: ReactNode; initialActive?: string }) {
  const [active, setActive] = useState(initialActive);
  const [history, setHistory] = useState<string[]>([]);
  const [builderSeed, setBuilderSeed] = useState<BuilderSeed | null>(null);
  const [newProjectNonce, setNewProjectNonce] = useState(0);
  const [homeConvSeed, setHomeConvSeed] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const go = useCallback((id: string) => {
    setActive((current) => {
      if (id === current) return current;
      setHistory((h) => [...h, current].slice(-20)); // borne : 20 pas d'historique
      return id;
    });
  }, []);

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setActive(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  const openProject = useCallback((name: string, prompt: string | null = null) => {
    setBuilderSeed({ project: name, prompt });
    go("builder");
  }, [go]);

  const consumeBuilderSeed = useCallback(() => setBuilderSeed(null), []);

  const requestNewProject = useCallback(() => {
    setNewProjectNonce((n) => n + 1);
    go("builder");
  }, [go]);

  const openConversation = useCallback((convId: string) => {
    setHomeConvSeed(convId);
    go("accueil");
  }, [go]);

  const consumeHomeConvSeed = useCallback(() => setHomeConvSeed(null), []);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      active, go, back, canBack: history.length > 0,
      openProject, builderSeed, consumeBuilderSeed,
      requestNewProject, newProjectNonce,
      openConversation, homeConvSeed, consumeHomeConvSeed,
      toasts, pushToast, dismissToast,
    }),
    [active, go, back, history.length, openProject, builderSeed, consumeBuilderSeed, requestNewProject, newProjectNonce, openConversation, homeConvSeed, consumeHomeConvSeed, toasts, pushToast, dismissToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState doit être utilisé sous <AppStateProvider>");
  return ctx;
}
