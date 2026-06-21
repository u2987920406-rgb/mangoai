// #140 (point #4) — tests du hub usePreview (le cœur extrait d'App.jsx).
// On valide la logique pure (toggles, requestFix) ET le pont d'inspection qui
// passe par window.postMessage — le mécanisme le plus enchevêtré du hook.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePreview } from "./usePreview.js";
import { SCREENS } from "../nav.js";

// Émet un message « mangoos-preview » comme le ferait l'iframe d'aperçu.
function postPreviewMessage(data) {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

describe("usePreview", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ url: "http://127.0.0.1:5179" }) }),
    );
    global.fetch = fetchMock;
  });
  afterEach(() => vi.restoreAllMocks());

  // Hors workspace : pas d'effet POST preview parasite.
  const base = { screen: SCREENS.HOME, projectName: "demo", pushToast: () => {}, onRequestFix: () => {} };

  it("toggleInspect bascule le mode inspection", () => {
    const { result } = renderHook(() => usePreview(base));
    expect(result.current.inspecting).toBe(false);
    act(() => result.current.toggleInspect());
    expect(result.current.inspecting).toBe(true);
    act(() => result.current.toggleInspect());
    expect(result.current.inspecting).toBe(false);
  });

  it("bumpPreview incrémente la clé de remount de l'iframe", () => {
    const { result } = renderHook(() => usePreview(base));
    const k0 = result.current.previewKey;
    act(() => result.current.bumpPreview());
    expect(result.current.previewKey).toBe(k0 + 1);
  });

  it("requestFix sans erreur n'appelle pas onRequestFix", () => {
    const onRequestFix = vi.fn();
    const { result } = renderHook(() => usePreview({ ...base, onRequestFix }));
    act(() => result.current.requestFix());
    expect(onRequestFix).not.toHaveBeenCalled();
  });

  it("un message d'erreur de l'aperçu alimente previewErrors (dédupliqué)", () => {
    const { result } = renderHook(() => usePreview(base));
    act(() => postPreviewMessage({ source: "mangoos-preview", message: "ReferenceError: x" }));
    expect(result.current.previewErrors).toEqual(["ReferenceError: x"]);
    // même message → pas de doublon
    act(() => postPreviewMessage({ source: "mangoos-preview", message: "ReferenceError: x" }));
    expect(result.current.previewErrors).toEqual(["ReferenceError: x"]);
  });

  it("requestFix fabrique le prompt depuis les erreurs puis les vide", () => {
    const onRequestFix = vi.fn();
    const { result } = renderHook(() => usePreview({ ...base, onRequestFix }));
    act(() => postPreviewMessage({ source: "mangoos-preview", message: "Erreur A" }));
    act(() => result.current.requestFix());
    expect(onRequestFix).toHaveBeenCalledTimes(1);
    expect(onRequestFix.mock.calls[0][0]).toContain("Erreur A");
    expect(result.current.previewErrors).toEqual([]);
  });

  it("inspect-pick avec source cible l'élément + seede le Chat + toast succès", () => {
    const pushToast = vi.fn();
    const { result } = renderHook(() => usePreview({ ...base, pushToast }));
    act(() => result.current.toggleInspect()); // inspecting = true
    act(() =>
      postPreviewMessage({
        source: "mangoos-preview",
        type: "inspect-pick",
        src: "src/App.jsx:42",
        tag: "button",
        text: "Envoyer",
      }),
    );
    expect(result.current.inspecting).toBe(false); // l'inspection se termine
    expect(result.current.editTarget).toMatchObject({ src: "src/App.jsx:42", tag: "button" });
    expect(result.current.seedInput).toContain("src/App.jsx:42");
    expect(pushToast).toHaveBeenCalledWith("success", expect.stringContaining("src/App.jsx:42"));
  });

  it("inspect-pick sans source : pas d'editTarget mais seed + toast d'erreur", () => {
    const pushToast = vi.fn();
    const { result } = renderHook(() => usePreview({ ...base, pushToast }));
    act(() =>
      postPreviewMessage({ source: "mangoos-preview", type: "inspect-pick", tag: "div", text: "X" }),
    );
    expect(result.current.editTarget).toBeNull();
    expect(result.current.seedInput).toContain("<div>");
    expect(pushToast).toHaveBeenCalledWith("error", expect.any(String));
  });

  it("clearSeed / clearEditTarget / clearErrors remettent à zéro", () => {
    const { result } = renderHook(() => usePreview(base));
    act(() => {
      postPreviewMessage({ source: "mangoos-preview", type: "inspect-pick", src: "f:1", tag: "a", text: "t" });
      postPreviewMessage({ source: "mangoos-preview", message: "err" });
    });
    expect(result.current.editTarget).not.toBeNull();
    act(() => { result.current.clearSeed(); result.current.clearEditTarget(); result.current.clearErrors(); });
    expect(result.current.seedInput).toBeNull();
    expect(result.current.editTarget).toBeNull();
    expect(result.current.previewErrors).toEqual([]);
  });

  it("ignore les messages qui ne viennent pas de l'aperçu", () => {
    const { result } = renderHook(() => usePreview(base));
    act(() => postPreviewMessage({ source: "autre-chose", message: "bruit" }));
    expect(result.current.previewErrors).toEqual([]);
  });

  it("dans le workspace, démarre l'aperçu Vite (POST /api/preview → URL)", async () => {
    const { result } = renderHook(() =>
      usePreview({ ...base, screen: SCREENS.WORKSPACE }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("/api/preview/demo");
    await waitFor(() => expect(result.current.previewUrl).toBe("http://127.0.0.1:5179"));
  });
});
