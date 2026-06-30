import { useEffect, useState } from "react";
import { Button } from "./ui/button.jsx";

const NAV_LINKS = [
  { href: "#configurator", label: "Configurateur" },
  { href: "#galerie", label: "Galerie" },
  { href: "#anatomie", label: "Anatomie" },
  { href: "#atelier", label: "Atelier" },
];

export function Navbar({ cartCount, onCartClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <a href="#top" className="flex items-center gap-2">
          <ForgeLogo />
          <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            FORGE
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-mango"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Cart + mobile toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={onCartClick}
            className="relative flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 text-sm transition-colors hover:border-mango/40 hover:text-mango"
          >
            <CartIcon />
            <span className="hidden sm:inline">Panier</span>
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-mango px-1 text-xs font-bold text-background">
                {cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/50 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-6xl px-6 py-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-mango"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative flex min-h-screen items-center overflow-hidden pt-16">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/5944189/pexels-photo-5944189.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1600"
          alt="Clavier mécanique premium avec rétroéclairage RGB"
          className="h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
      </div>

      {/* Grid overlay */}
      <div className="forge-grid-bg absolute inset-0 opacity-30" />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="forge-reveal mb-4 inline-flex items-center gap-2 rounded-full border border-mango/30 bg-mango/10 px-4 py-1.5 text-sm text-mango">
            <span className="h-2 w-2 rounded-full bg-mango animate-pulse" />
            Atelier de claviers mécaniques sur-mesure
          </div>

          <h1 className="forge-reveal text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl" style={{ animationDelay: "100ms" }}>
            Forge le clavier
            <br />
            <span className="forge-text-gradient">de tes mains.</span>
          </h1>

          <p className="forge-reveal mt-6 max-w-lg text-lg text-muted-foreground" style={{ animationDelay: "200ms" }}>
            Chaque clavier FORGE est assemblé à la main dans notre atelier. Format, switches, keycaps —
            chaque détail est choisi par toi, façonné par nous.
          </p>

          <div className="forge-reveal mt-8 flex flex-wrap gap-4" style={{ animationDelay: "300ms" }}>
            <Button
              asChild
              className="h-12 bg-mango px-8 text-base font-semibold text-background hover:bg-coral transition-all"
            >
              <a href="#configurator">Forge le tien →</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 border-border bg-background/50 px-8 text-base backdrop-blur hover:border-mango/40 hover:text-mango"
            >
              <a href="#galerie">Voir la galerie</a>
            </Button>
          </div>

          {/* Stats */}
          <div className="forge-reveal mt-12 flex gap-8" style={{ animationDelay: "400ms" }}>
            {[
              { n: "4", l: "formats" },
              { n: "12", l: "switches" },
              { n: "∞", l: "combinaisons" },
              { n: "100%", l: "main-made" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl font-bold text-mango">{s.n}</div>
                <div className="text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="flex h-9 w-5 items-start justify-center rounded-full border border-border p-1.5">
          <div className="h-2 w-1 animate-bounce rounded-full bg-mango" />
        </div>
      </div>
    </section>
  );
}

function ForgeLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="2" y="2" width="24" height="24" rx="6" fill="url(#forge-grad)" />
      <path d="M9 8h10M9 14h10M9 20h6" stroke="#111316" strokeWidth="2.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="forge-grad" x1="2" y1="2" x2="26" y2="26">
          <stop stopColor="#F2A33C" />
          <stop offset="1" stopColor="#E8624A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3h2l2.4 12.5a2 2 0 002 1.5h9.7a2 2 0 002-1.6L23 7H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
    </svg>
  );
}