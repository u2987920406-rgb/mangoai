import { Button } from "./ui/button.jsx";
import { formatPrice, buildConfigSummary, calculatePrice } from "../data/keyboard-data.js";

export function CartDrawer({ isOpen, onClose, items, updateQty, removeItem, clearCart }) {
  const total = items.reduce((sum, it) => sum + calculatePrice(it.config) * it.qty, 0);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold">
            Panier
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({items.length} config{items.length > 1 ? "s" : ""})
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="forge-scroll-thin flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                  <path d="M3 3h2l2.4 12.5a2 2 0 002 1.5h9.7a2 2 0 002-1.6L23 7H6" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="20" r="1.5" />
                  <circle cx="18" cy="20" r="1.5" />
                </svg>
              </div>
              <p className="text-muted-foreground">Ton panier est vide</p>
              <Button
                onClick={onClose}
                variant="outline"
                className="mt-4 border-mango/30 text-mango hover:bg-mango/10"
              >
                Forge un clavier
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const summary = buildConfigSummary(item.config);
                const unitPrice = calculatePrice(item.config);
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-secondary/30 p-4"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <p className="font-bold text-sm">
                          FORGE {summary.format} · {summary.keycap}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {summary.switchName} · {summary.keys} touches
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-coral transition-colors"
                        aria-label="Supprimer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>

                    {summary.options.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {summary.options.map((o) => (
                          <span key={o} className="rounded bg-mango/10 px-2 py-0.5 text-xs text-mango">
                            {o}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border pt-2">
                      {/* Quantité */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.id, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-mango"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-mono">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.id, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-mango"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-mango">{formatPrice(unitPrice * item.qty)}</p>
                        <p className="text-xs text-muted-foreground">{formatPrice(unitPrice)} / unité</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={clearCart}
                className="w-full rounded-lg border border-border py-2 text-xs text-muted-foreground hover:border-coral/40 hover:text-coral transition-colors"
              >
                Vider le panier
              </button>
            </div>
          )}
        </div>

        {/* Footer avec total */}
        {items.length > 0 && (
          <div className="border-t border-border p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold forge-text-gradient">{formatPrice(total)}</span>
            </div>
            <Button className="w-full bg-mango text-background hover:bg-coral h-11 font-semibold">
              Passer commande
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Paiement sécurisé · Livraison 3-4 semaines
            </p>
          </div>
        )}
      </div>
    </>
  );
}