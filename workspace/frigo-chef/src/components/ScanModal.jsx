import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, Check, X, UploadCloud } from "lucide-react";
import { INGREDIENTS } from "../data/ingredients.js";
import { Button } from "./ui/button.jsx";
import { cn } from "../lib/utils.js";

// Simule une détection d'ingrédients à partir d'une photo : on ne fait pas
// de vraie vision par ordinateur, mais on propose un geste crédible et fluide
// (upload → "analyse" → liste à cocher, exactement comme le ferait un vrai scan).
function simulateDetection(fileName) {
  // On tire un sous-ensemble plausible et stable (basé sur le nom du fichier)
  // pour que la démo semble réactive à l'image choisie plutôt que purement aléatoire.
  let seed = 0;
  for (const char of fileName) seed += char.charCodeAt(0);
  const shuffled = [...INGREDIENTS].sort((a, b) => {
    const ha = (seed * 31 + a.id.length) % 97;
    const hb = (seed * 31 + b.id.length) % 97;
    return ha - hb;
  });
  const count = 4 + (seed % 4); // 4 à 7 ingrédients "détectés"
  return shuffled.slice(0, count);
}

export function ScanModal({ open, onClose, onConfirm }) {
  const [status, setStatus] = useState("idle"); // idle | analyzing | done
  const [previewUrl, setPreviewUrl] = useState(null);
  const [detected, setDetected] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const fileInputRef = useRef(null);

  const checkedList = useMemo(() => [...checked], [checked]);

  if (!open) return null;

  function handleFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStatus("analyzing");
    // Latence simulée d'analyse — geste crédible, pas de vraie vision.
    setTimeout(() => {
      const results = simulateDetection(file.name || "photo");
      setDetected(results);
      setChecked(new Set(results.map((r) => r.id)));
      setStatus("done");
    }, 1100);
  }

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setStatus("idle");
    setPreviewUrl(null);
    setDetected([]);
    setChecked(new Set());
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleConfirm() {
    onConfirm(checkedList);
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold">Scanner le frigo</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Fermer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {status === "idle" && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-secondary/40 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <UploadCloud className="h-10 w-10 text-primary" />
              <span className="font-medium">Prends ou dépose une photo de ton frigo</span>
              <span className="text-sm text-muted-foreground">
                On te propose une liste d'ingrédients détectés à confirmer
              </span>
            </button>
          )}

          {status !== "idle" && previewUrl && (
            <div className="mb-4 overflow-hidden rounded-xl border border-border">
              <img src={previewUrl} alt="Photo du frigo" className="h-44 w-full object-cover" />
            </div>
          )}

          {status === "analyzing" && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Analyse de la photo en cours...</p>
            </div>
          )}

          {status === "done" && (
            <div>
              <p className="mb-3 text-sm text-muted-foreground">
                Voici ce qu'on a repéré — décoche ce qui ne va pas, on ajoute le reste à ton
                inventaire.
              </p>
              <ul className="space-y-1.5">
                {detected.map((ing) => {
                  const isChecked = checked.has(ing.id);
                  return (
                    <li key={ing.id}>
                      <button
                        type="button"
                        onClick={() => toggle(ing.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          isChecked
                            ? "border-primary/40 bg-accent"
                            : "border-border bg-background opacity-60",
                        )}
                      >
                        <img src={ing.image} alt="" className="h-9 w-9 rounded-md object-cover" />
                        <span className="flex-1 text-sm font-medium">{ing.label}</span>
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {isChecked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={handleClose}>
            Annuler
          </Button>
          {status === "done" ? (
            <Button onClick={handleConfirm} disabled={checkedList.length === 0}>
              <Camera className="h-4 w-4" />
              Ajouter {checkedList.length} ingrédient{checkedList.length > 1 ? "s" : ""}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={status === "analyzing"}>
              Choisir une photo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
