// ErrorBoundary — un panneau qui plante ne casse plus tout le shell (audit §3.2 U7).
// Racine (repli plein écran) ET par panneau (repli local, le reste du shell survit).
// Les boundaries React DOIVENT être des composants classe.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "./Button";
import { cx, TEXT } from "./tokens";

interface Props {
  children: ReactNode;
  /** Étiquette du panneau (pour le message + pour re-monter sur changement de section). */
  label?: string;
  /** Change de valeur → l'erreur est oubliée (ex. clé de section active). */
  resetKey?: string | number;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Naviguer ailleurs efface l'erreur du panneau précédent.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[MangoOS] panneau « ${this.props.label ?? "?"} » a planté :`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-err/25 bg-err/10">
          <TriangleAlert size={26} className="text-err" />
        </div>
        <div className={cx(TEXT.md, "font-medium text-ink")}>
          {this.props.label ? `« ${this.props.label} » a rencontré un problème` : "Ce panneau a rencontré un problème"}
        </div>
        <p className={cx(TEXT.base, "max-w-[380px] leading-relaxed text-dim")}>
          Le reste de MangoOS continue de fonctionner. Tu peux réessayer ce panneau.
        </p>
        <code className="max-w-[420px] truncate rounded bg-edge-soft px-2 py-1 font-mono text-[11px] text-faint">
          {this.state.error.message}
        </code>
        <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => this.setState({ error: null })}>
          Réessayer
        </Button>
      </div>
    );
  }
}
