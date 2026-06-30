import { useState } from "react";
import { KeyboardPreview } from "./KeyboardPreview.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { useConfigurator } from "../hooks/useConfigurator.js";
import { FORMATS, SWITCHES, KEYCAPS, OPTIONS, formatPrice } from "../data/keyboard-data.js";

const STEPS = [
  { id: "format", label: "Format", num: 1 },
  { id: "switches", label: "Switches", num: 2 },
  { id: "keycaps", label: "Keycaps", num: 3 },
  { id: "options", label: "Options", num: 4 },
];

export function Configurator({ onAddToCart }) {
  const {
    config,
    price,
    format,
    switchData,
    keycap,
    selectedOptions,
    setFormat,
    setSwitch,
    setKeycap,
    toggleOption,
  } = useConfigurator();

  const [step, setStep] = useState("format");
  const [pressedKey, setPressedKey] = useState(null);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    onAddToCart(config);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div id="configurator" className="mx-auto max-w-6xl px-6 py-20">
      {/* En-tête */}
      <div className="forge-reveal mb-10 text-center" style={{ animationDelay: "0ms" }}>
        <Badge className="mb-4 bg-mango/15 text-mango border-mango/30">Configurateur</Badge>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
          Compose ton <span className="forge-text-gradient">arme de frappe</span>
        </h2>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Quatre étapes. Des centaines de combinaisons. Chaque clavier est assemblé à la main dans notre atelier.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* ── Colonne gauche : aperçu + étapes ── */}
        <div className="space-y-6">
          {/* Aperçu live */}
          <div className="forge-metal rounded-2xl p-6 forge-reveal" style={{ animationDelay: "100ms" }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">APERÇU LIVE</span>
                <span className="h-2 w-2 rounded-full bg-mango animate-pulse" />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{format?.name ?? "—"}</span>
                <span className="text-border">|</span>
                <span className="font-mono">{format?.keys ?? 0} touches</span>
              </div>
            </div>
            <KeyboardPreview
              format={format}
              keycap={keycap}
              rgbOn={config.optionIds.includes("rgb")}
              pressedKey={pressedKey}
            />
          </div>

          {/* Stepper */}
          <div className="flex flex-wrap gap-2">
            {STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  step === s.id
                    ? "bg-mango text-background shadow-lg shadow-mango/20"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === s.id ? "bg-background/20" : "bg-background/10"
                }`}>{s.num}</span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Étape active */}
          <div className="forge-metal rounded-2xl p-6 forge-fade" key={step}>
            {step === "format" && (
              <FormatStep formats={FORMATS} selected={config.formatId} onSelect={setFormat} />
            )}
            {step === "switches" && (
              <SwitchStep switches={SWITCHES} selected={config.switchId} onSelect={setSwitch} />
            )}
            {step === "keycaps" && (
              <KeycapStep keycaps={KEYCAPS} selected={config.keycapId} onSelect={setKeycap} />
            )}
            {step === "options" && (
              <OptionsStep
                options={OPTIONS}
                selected={config.optionIds}
                onToggle={toggleOption}
              />
            )}
          </div>
        </div>

        {/* ── Colonne droite : récap + prix ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="forge-metal rounded-2xl p-6 forge-reveal" style={{ animationDelay: "200ms" }}>
            <h3 className="mb-4 text-lg font-bold">Récapitulatif</h3>

            <div className="space-y-3 text-sm">
              <RecapRow label="Format" value={format?.name} sub={format?.tagline} />
              <RecapRow
                label="Switches"
                value={switchData?.name}
                sub={`${switchData?.type} · ${switchData?.force}`}
              />
              <RecapRow label="Keycaps" value={keycap?.name} sub={keycap?.description} />
              {selectedOptions.length > 0 ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 text-xs text-muted-foreground">Options</p>
                  {selectedOptions.map((o) => (
                    <div key={o.id} className="flex justify-between py-0.5">
                      <span className="text-foreground/80">{o.name}</span>
                      <span className="font-mono text-muted-foreground">+{formatPrice(o.price)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Détail du prix */}
            <div className="mt-4 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
              <PriceLine label={`Châssis ${format?.name ?? ""}`} value={format?.price ?? 0} />
              <PriceLine label={`Switches ${switchData?.name ?? ""}`} value={switchData?.price ?? 0} />
              <PriceLine label={`Keycaps ${keycap?.name ?? ""}`} value={keycap?.price ?? 0} />
              {selectedOptions.map((o) => (
                <PriceLine key={o.id} label={o.name} value={o.price} />
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-3xl font-bold forge-text-gradient">{formatPrice(price)}</span>
            </div>

            <Button
              onClick={handleAdd}
              className="mt-5 w-full bg-mango text-background hover:bg-coral transition-all text-base font-semibold h-12"
            >
              {added ? "✓ Ajouté au panier" : "Ajouter au panier"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Assemblé à la main · Livraison 3-4 semaines
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecapRow({ label, value, sub }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <p className="font-medium text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function PriceLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="truncate">{label}</span>
      <span className="font-mono">+{formatPrice(value)}</span>
    </div>
  );
}

// ── Étape Format ──────────────────────────────────────────────────────────────
function FormatStep({ formats, selected, onSelect }) {
  return (
    <div>
      <h3 className="mb-1 text-xl font-bold">Choisis ton format</h3>
      <p className="mb-5 text-sm text-muted-foreground">Le format détermine la taille et les touches disponibles.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {formats.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`group rounded-xl border-2 p-4 text-left transition-all ${
              selected === f.id
                ? "border-mango bg-mango/10 shadow-lg shadow-mango/10"
                : "border-border bg-secondary/50 hover:border-mango/40 hover:bg-secondary"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">{f.name}</span>
              <span className="font-mono text-sm text-mango">{formatPrice(f.price)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{f.tagline}</p>
            <p className="mt-2 text-xs text-foreground/70">{f.description}</p>
            <p className="mt-2 text-xs font-mono text-muted-foreground">{f.keys} touches</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Étape Switches ───────────────────────────────────────────────────────────
function SwitchStep({ switches, selected, onSelect }) {
  return (
    <div>
      <h3 className="mb-1 text-xl font-bold">Choisis tes switches</h3>
      <p className="mb-5 text-sm text-muted-foreground">Le cœur mécanique de chaque touche. Définit le ressenti et le son.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {switches.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group rounded-xl border-2 p-4 text-left transition-all ${
              selected === s.id
                ? "border-mango bg-mango/10 shadow-lg shadow-mango/10"
                : "border-border bg-secondary/50 hover:border-mango/40 hover:bg-secondary"
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Pastille couleur du switch */}
              <div
                className="h-10 w-10 rounded-lg flex-shrink-0 border-2 border-white/10"
                style={{ background: s.color, boxShadow: `0 0 12px ${s.color}40` }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{s.name}</span>
                  {s.price > 0 && <span className="font-mono text-xs text-mango">+{formatPrice(s.price)}</span>}
                </div>
                <div className="flex gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs">{s.type}</Badge>
                  <Badge variant="outline" className="text-xs">{s.force}</Badge>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-foreground/70">{s.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">🔊 {s.sound}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Étape Keycaps ────────────────────────────────────────────────────────────
function KeycapStep({ keycaps, selected, onSelect }) {
  return (
    <div>
      <h3 className="mb-1 text-xl font-bold">Choisis tes keycaps</h3>
      <p className="mb-5 text-sm text-muted-foreground">L'habit de ton clavier. Couleur, texture et personnalité.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {keycaps.map((k) => (
          <button
            key={k.id}
            onClick={() => onSelect(k.id)}
            className={`group rounded-xl border-2 p-4 text-left transition-all ${
              selected === k.id
                ? "border-mango bg-mango/10 shadow-lg shadow-mango/10"
                : "border-border bg-secondary/50 hover:border-mango/40 hover:bg-secondary"
            }`}
          >
            {/* Aperçu couleur */}
            <div className="mb-3 flex gap-1.5">
              <div
                className="h-8 flex-1 rounded-md border border-white/10"
                style={{ background: k.baseColor }}
              />
              <div
                className="h-8 w-8 rounded-md border border-white/10"
                style={{ background: k.accentColor }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold">{k.name}</span>
              {k.price > 0 && <span className="font-mono text-xs text-mango">+{formatPrice(k.price)}</span>}
            </div>
            <p className="mt-1 text-xs text-foreground/70">{k.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Étape Options ─────────────────────────────────────────────────────────────
function OptionsStep({ options, selected, onToggle }) {
  return (
    <div>
      <h3 className="mb-1 text-xl font-bold">Options & finitions</h3>
      <p className="mb-5 text-sm text-muted-foreground">La touche finale qui fait la différence.</p>
      <div className="space-y-3">
        {options.map((o) => {
          const isOn = selected.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => onToggle(o.id)}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                isOn
                  ? "border-mango bg-mango/10 shadow-lg shadow-mango/10"
                  : "border-border bg-secondary/50 hover:border-mango/40 hover:bg-secondary"
              }`}
            >
              {/* Toggle visuel */}
              <div
                className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                  isOn ? "bg-mango" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    isOn ? "left-6" : "left-1"
                  }`}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{o.name}</span>
                  <span className="font-mono text-sm text-mango">+{formatPrice(o.price)}</span>
                </div>
                <p className="mt-0.5 text-xs text-foreground/70">{o.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}