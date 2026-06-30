export function Atelier() {
  return (
    <section id="atelier" className="relative overflow-hidden py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Image */}
          <div className="forge-reveal relative">
            <div className="overflow-hidden rounded-2xl border border-border">
              <img
                src="https://images.pexels.com/photos/5152261/pexels-photo-5152261.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                alt="Atelier d'assemblage de claviers mécaniques sur-mesure"
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-4 -right-4 rounded-xl border border-mango/30 bg-card/90 p-4 backdrop-blur">
              <p className="text-3xl font-bold forge-text-gradient">2019</p>
              <p className="text-xs text-muted-foreground">Année de création</p>
            </div>
          </div>

          {/* Texte */}
          <div className="forge-reveal" style={{ animationDelay: "100ms" }}>
            <p className="mb-3 text-sm font-mono uppercase tracking-widest text-mango">L'atelier</p>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              Le métal, le feu,
              <br />
              <span className="forge-text-gradient">la précision.</span>
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              FORGE est né d'une obsession : créer des claviers qui durent toute une vie.
              Dans notre atelier, chaque châssis est fraisé dans un bloc d'aluminium,
              chaque switch est testé et lubrifié à la main, chaque keycap est inspecté
              au microscope.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Pas de chaîne de montage. Pas de robot. Juste des mains expertes,
              des outils de précision, et un seul objectif : la perfection tactile.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-4">
              {[
                { n: "48h", l: "par clavier" },
                { n: "12", l: "contrôles qualité" },
                { n: "5ans", l: "garantie" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
                  <p className="text-xl font-bold text-mango">{s.n}</p>
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <rect x="2" y="2" width="24" height="24" rx="6" fill="url(#footer-grad)" />
                <path d="M9 8h10M9 14h10M9 20h6" stroke="#111316" strokeWidth="2.5" strokeLinecap="round" />
                <defs>
                  <linearGradient id="footer-grad" x1="2" y1="2" x2="26" y2="26">
                    <stop stopColor="#F2A33C" />
                    <stop offset="1" stopColor="#E8624A" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                FORGE
              </span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Atelier de claviers mécaniques sur-mesure. Chaque pièce est assemblée à la main,
              testée et garantie 5 ans.
            </p>
          </div>

          {/* Liens */}
          <div>
            <p className="mb-3 text-sm font-semibold">Explorer</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#configurator" className="hover:text-mango transition-colors">Configurateur</a></li>
              <li><a href="#galerie" className="hover:text-mango transition-colors">Galerie</a></li>
              <li><a href="#anatomie" className="hover:text-mango transition-colors">Anatomie</a></li>
              <li><a href="#atelier" className="hover:text-mango transition-colors">Atelier</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="mb-3 text-sm font-semibold">Contact</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>atelier@forge-kb.fr</li>
              <li>+33 1 23 45 67 89</li>
              <li>12 rue de la Forge, Lyon</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© 2025 FORGE. Tous droits réservés.</p>
          <p className="text-xs text-muted-foreground">Fait main · Fait pour durer</p>
        </div>
      </div>
    </footer>
  );
}