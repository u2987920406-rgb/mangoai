import { useState } from "react";

const LAYERS = [
  {
    id: 0,
    name: "Keycap",
    title: "Le keycap",
    description: "La coque visible de la touche. En PBT ou ABS, il définit la couleur, la texture et le profil ergonomique. Chaque keycap FORGE est teinté dans la masse et résistant à l'usure.",
    color: "#F2A33C",
    detail: "Profil Cherry · PBT double-shot · 1.5mm",
  },
  {
    id: 1,
    name: "Stem",
    title: "Le stem",
    description: "La tige centrale qui guide la touche en ligne droite. Sa forme (cross, box, choc) détermine la compatibilité avec les keycaps. Tolérance de 0.05mm.",
    color: "#E8624A",
    detail: "Cross MX · Polymère POM · Auto-lubrifiant",
  },
  {
    id: 2,
    name: "Switch",
    title: "Le switch",
    description: "Le cœur mécanique. Un ressort, un slider et des contacts métalliques. C'est lui qui produit le ressenti (linéaire, tactile, clicky) et le son de chaque frappe.",
    color: "#5B9BD5",
    detail: "Type: tactile · Force: 55g · Pré-travel: 2mm",
  },
  {
    id: 3,
    name: "PCB",
    title: "Le PCB",
    description: "Le circuit imprimé qui relie chaque switch à un microcontrôleur. C'est le cerveau du clavier. Il gère le matrix scanning, le NKRO et la programmabilité.",
    color: "#8a8f98",
    detail: "Hot-swap · Per-key RGB · USB-C · QMK/VIA",
  },
  {
    id: 4,
    name: "Plate",
    title: "La plaque de montage",
    description: "La structure métallique (alu, laiton, polycarbonate) qui maintient les switches en place. Son matériau influence la rigidité et le son global du clavier.",
    color: "#C89060",
    detail: "Aluminium 6063 · 1.5mm · Gasket mount",
  },
  {
    id: 5,
    name: "Case",
    title: "Le châssis",
    description: "Le corps du clavier. En aluminium anodisé, il apporte rigidité, poids et dissipation acoustique. C'est la fondation de chaque FORGE.",
    color: "#3A3A3A",
    detail: "Aluminium anodisé · 1.2kg · 5° typing angle",
  },
];

export function Anatomy() {
  const [active, setActive] = useState(0);
  const layer = LAYERS[active];

  return (
    <section id="anatomie" className="relative overflow-hidden py-20">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/18337017/pexels-photo-18337017.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1600"
          alt="Switches mécaniques de près"
          className="h-full w-full object-cover opacity-10"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="forge-reveal mb-10 text-center">
          <p className="mb-3 text-sm font-mono uppercase tracking-widest text-mango">Pédagogie</p>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Anatomie d'une touche</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Six couches. Du keycap au châssis. Explore ce qui se cache sous chaque frappe.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          {/* Schéma visuel */}
          <div className="forge-reveal relative" style={{ animationDelay: "100ms" }}>
            <div className="forge-metal relative mx-auto aspect-square max-w-md rounded-2xl p-8">
              <svg viewBox="0 0 300 300" className="h-full w-full">
                {/* Couches empilées (vue éclatée) */}
                {LAYERS.map((l, i) => {
                  const isActive = i === active;
                  const offset = i * 8;
                  const opacity = isActive ? 1 : 0.25;
                  const y = 40 + i * 30 + offset * 0.5;
                  const h = 28;
                  return (
                    <g
                      key={l.id}
                      onClick={() => setActive(i)}
                      style={{ cursor: "pointer", transition: "all 0.4s ease" }}
                      opacity={opacity}
                    >
                      <rect
                        x={40 + i * 4}
                        y={y}
                        width={220 - i * 8}
                        height={h}
                        rx={6}
                        fill={l.color}
                        stroke={isActive ? "#F2A33C" : "transparent"}
                        strokeWidth={isActive ? 2 : 0}
                        style={{
                          filter: isActive ? `drop-shadow(0 0 12px ${l.color}80)` : "none",
                          transition: "all 0.4s ease",
                        }}
                      />
                      <text
                        x={50 + i * 4}
                        y={y + h / 2 + 4}
                        fill="#111316"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="var(--font-mono)"
                      >
                        {l.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Clique sur une couche pour l'explorer
            </p>
          </div>

          {/* Détail de la couche active */}
          <div className="forge-reveal" style={{ animationDelay: "200ms" }}>
            <div key={active} className="forge-fade">
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-xl border-2 border-white/10"
                  style={{ background: layer.color, boxShadow: `0 0 20px ${layer.color}40` }}
                />
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Couche {active + 1} / {LAYERS.length}
                  </p>
                  <h3 className="text-2xl font-bold">{layer.title}</h3>
                </div>
              </div>
              <p className="text-base text-foreground/80 leading-relaxed">{layer.description}</p>
              <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-xs font-mono text-muted-foreground">Spécifications</p>
                <p className="mt-1 text-sm text-mango">{layer.detail}</p>
              </div>

              {/* Navigation entre couches */}
              <div className="mt-6 flex items-center gap-2">
                <button
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/50 text-muted-foreground transition-colors hover:text-mango disabled:opacity-30"
                >
                  ←
                </button>
                <div className="flex gap-1.5">
                  {LAYERS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActive(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === active ? "w-6 bg-mango" : "w-2 bg-border hover:bg-muted-foreground"
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setActive((a) => Math.min(LAYERS.length - 1, a + 1))}
                  disabled={active === LAYERS.length - 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/50 text-muted-foreground transition-colors hover:text-mango disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}