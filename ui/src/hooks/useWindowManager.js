import { useCallback, useState } from "react";

let nextWinId = 1;

export function useWindowManager() {
  const [windows, setWindows] = useState([]);

  const openWindow = useCallback((def) => {
    setWindows((prev) => {
      // Si déjà ouverte (même type), ramener au premier plan
      if (!def.allowMultiple) {
        const existing = prev.find((w) => w.type === def.type);
        if (existing) {
          const maxZ = prev.reduce((m, w) => Math.max(m, w.zIndex), 50);
          return prev.map((w) => w.id === existing.id ? { ...w, zIndex: maxZ + 1 } : w);
        }
      }
      const maxZ = prev.reduce((m, w) => Math.max(m, w.zIndex), 50);
      const offset = (prev.length % 6) * 28; // cascade
      return [
        ...prev,
        {
          id: String(nextWinId++),
          type: def.type,
          title: def.title,
          x: 80 + offset,
          y: 50 + offset,
          width: def.width ?? 900,
          height: def.height ?? 620,
          zIndex: maxZ + 1,
          props: def.props ?? {},
        },
      ];
    });
  }, []);

  const closeWindow = useCallback((id) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusWindow = useCallback((id) => {
    setWindows((prev) => {
      const maxZ = prev.reduce((m, w) => Math.max(m, w.zIndex), 50);
      const win = prev.find((w) => w.id === id);
      if (!win || win.zIndex === maxZ) return prev;
      return prev.map((w) => w.id === id ? { ...w, zIndex: maxZ + 1 } : w);
    });
  }, []);

  const moveWindow = useCallback((id, x, y) => {
    setWindows((prev) => prev.map((w) => w.id === id ? { ...w, x, y } : w));
  }, []);

  const resizeWindow = useCallback((id, width, height) => {
    setWindows((prev) => prev.map((w) => w.id === id ? { ...w, width, height } : w));
  }, []);

  return { windows, openWindow, closeWindow, focusWindow, moveWindow, resizeWindow };
}
