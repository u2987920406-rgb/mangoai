import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "forge-cart";

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function useCart() {
  const [items, setItems] = useState(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  // Persistance
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Sync inter-onglet
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setItems(loadCart());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem = useCallback((config) => {
    setItems((prev) => {
      // Même config = incrémenter quantité
      const sig = JSON.stringify(config);
      const existing = prev.find((it) => JSON.stringify(it.config) === sig);
      if (existing) {
        return prev.map((it) =>
          it.id === existing.id ? { ...it, qty: it.qty + 1 } : it
        );
      }
      return [...prev, { id: Date.now() + Math.random(), config, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const updateQty = useCallback((id, qty) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, qty: Math.max(1, qty) } : it
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const count = items.reduce((sum, it) => sum + it.qty, 0);

  return {
    items,
    isOpen,
    setIsOpen,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addItem,
    removeItem,
    updateQty,
    clearCart,
    count,
  };
}