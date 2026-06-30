import { useState, useMemo } from "react";
import { GALLERY_ITEMS, GALLERY_FILTERS } from "../data/keyboard-data.js";

export function Gallery() {
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return GALLERY_ITEMS;
    return GALLERY_ITEMS.filter((item) => item.style === filter);
  }, [filter]);

  return (
    <section id="galerie" className="mx-auto max-w-6xl px-6 py-20">
      <div className="forge-reveal mb-10 text-center">
        <p className="mb-3 text-sm font-mono uppercase tracking-widest text-mango">Nos signatures</p>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Galerie des claviers</h2>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Une sélection de claviers forgés dans notre atelier. Chaque pièce est unique.
        </p>
      </div>

      {/* Filtres */}
      <div className="forge-reveal mb-8 flex flex-wrap justify-center gap-2" style={{ animationDelay: "100ms" }}>
        {GALLERY_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
              filter === f.id
                ? "bg-mango text-background shadow-lg shadow-mango/20"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grille */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item, i) => (
          <div
            key={item.id}
            className="forge-reveal group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-mango/40"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={item.image}
                alt={item.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium capitalize text-mango backdrop-blur">
                {item.style}
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}