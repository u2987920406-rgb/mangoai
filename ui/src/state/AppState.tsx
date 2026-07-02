// État global LÉGER de la 2.0 — un Context, pas un framework (audit §3.2 U3 : 427 useState / 0 Context).
// Porte : navigation active du shell, thème, toasts. Le reste demeure local aux écrans.
// La 1.0 (App.jsx) migrera dessus écran par écran en Phase C.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastItem {
  id: number;
  kind: "ok" | "error";
  text: string;
}

export interface AppState {
  /** Item de navigation actif du shell (id du catalogue). */
  active: string;
  setActive: (id: string) => void;
  /** Toasts (pont vers le composant Toast existant). */
  toasts: ToastItem[];
  pushToast: (kind: ToastItem["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children, initialActive = "accueil" }: { children: ReactNode; initialActive?: string }) {
  const [active, setActive] = useState(initialActive);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(
    () => ({ active, setActive, toasts, pushToast, dismissToast }),
    [active, toasts, pushToast, dismissToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState doit être utilisé sous <AppStateProvider>");
  return ctx;
}
