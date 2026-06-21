// #140 (point #4) — tests du hook useToasts (rendu réel via renderHook + jsdom).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToasts } from "./useToasts.js";

describe("useToasts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("démarre sans aucun toast", () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current.toasts).toEqual([]);
  });

  it("pushToast ajoute un toast avec kind/text/linkUrl", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.pushToast("success", "Fait", "http://x"));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      kind: "success",
      text: "Fait",
      linkUrl: "http://x",
    });
  });

  it("attribue des id uniques et croissants", () => {
    const { result } = renderHook(() => useToasts());
    act(() => { result.current.pushToast("info", "a"); });
    act(() => { result.current.pushToast("info", "b"); });
    const [t1, t2] = result.current.toasts;
    expect(t1.id).not.toBe(t2.id);
    expect(t2.id).toBeGreaterThan(t1.id);
  });

  it("dismissToast retire le bon toast par id", () => {
    const { result } = renderHook(() => useToasts());
    act(() => { result.current.pushToast("info", "a"); });
    act(() => { result.current.pushToast("info", "b"); });
    const idToDrop = result.current.toasts[0].id;
    act(() => result.current.dismissToast(idToDrop));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].text).toBe("b");
  });

  it("auto-dismiss après 8 s", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.pushToast("info", "éphémère"));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.toasts).toHaveLength(0);
  });
});
