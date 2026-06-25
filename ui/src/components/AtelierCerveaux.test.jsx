// #162 — test de rendu de l'Atelier des cerveaux. fetch mocké (jsdom), zéro réseau.
// On verrouille : (1) les agents s'affichent ; (2) la GARDE de capacités déclenche un
// bandeau quand l'agent `vision` reçoit un modèle SANS capability `vision` (piège
// GLM-4.6V) ; (3) « Sauvegarder » appelle PUT /api/brain-registry ; (4) « + » ouvre la modale.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AtelierCerveaux from "./AtelierCerveaux.jsx";

const REGISTRY = {
  vision: { provider: "ollama", model: "glm-4.6v:latest", timeoutMs: 60000 }, // SANS vision → garde
  codeur: { provider: "ollama", model: "gemma4:12b", timeoutMs: 120000 },
};
const DEFAULTS = REGISTRY;
const AGENTS = ["vision", "codeur"];
const EXPECTED_CAPS = { vision: ["vision"] };
const MODELS = [
  { name: "glm-4.6v:latest", size: 5_700_000_000, family: "glm", parameterSize: "9B" },
  { name: "gemma4:12b", size: 8_000_000_000, family: "gemma", parameterSize: "12B" },
  { name: "qwen3-vl:8b", size: 8_800_000_000, family: "qwen3vl", parameterSize: "8.8B" },
];
const CAPS = {
  "glm-4.6v:latest": ["tools", "thinking", "completion"], // PAS de vision
  "gemma4:12b": ["tools"],
  "qwen3-vl:8b": ["vision", "tools", "thinking"],
};

function jsonOf(obj) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
}

let putBody = null;

function installFetch() {
  putBody = null;
  global.fetch = vi.fn((url, opts) => {
    const u = String(url);
    const method = opts?.method || "GET";
    if (u.includes("/api/brain-registry") && method === "PUT") {
      putBody = JSON.parse(opts.body);
      return jsonOf({ registry: putBody });
    }
    if (u.includes("/api/brain-registry")) {
      return jsonOf({ registry: REGISTRY, defaults: DEFAULTS, agents: AGENTS, expectedCaps: EXPECTED_CAPS });
    }
    if (u.includes("/api/ollama/models")) return jsonOf({ ok: true, models: MODELS });
    if (u.includes("/api/ollama/caps")) {
      const name = new URL(u, "http://localhost").searchParams.get("name");
      return jsonOf({ ok: true, capabilities: CAPS[name] || [], family: "", parameterSize: "" });
    }
    return jsonOf({});
  });
}

describe("AtelierCerveaux", () => {
  beforeEach(installFetch);
  afterEach(() => { vi.restoreAllMocks(); });

  it("affiche les agents du registre", async () => {
    const { container } = render(<AtelierCerveaux onBack={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-agent="vision"]')).toBeTruthy());
    expect(container.querySelector('[data-agent="codeur"]')).toBeTruthy();
  });

  it("marque l'agent `codeur` comme l'Élève (les mains)", async () => {
    const { container } = render(<AtelierCerveaux onBack={() => {}} />);
    const codeur = await waitFor(() => {
      const el = container.querySelector('[data-agent="codeur"]');
      expect(el).toBeTruthy();
      return el;
    });
    expect(within(codeur).getByText(/Élève · les mains/)).toBeInTheDocument();
  });

  it("déclenche la garde : modèle sans `vision` sur l'agent vision → bandeau", async () => {
    const { container } = render(<AtelierCerveaux onBack={() => {}} />);
    // la garde dépend du fetch async des capabilities → on attend le bandeau
    await waitFor(() => {
      expect(container.querySelector('[data-warn="vision"]')).toBeTruthy();
    });
    expect(container.querySelector('[data-warn="vision"]').textContent).toMatch(/vision/i);
    // l'agent codeur n'exige rien → aucun bandeau
    expect(container.querySelector('[data-warn="codeur"]')).toBeFalsy();
  });

  it("« Sauvegarder » appelle PUT /api/brain-registry avec le registre édité", async () => {
    const { container } = render(<AtelierCerveaux onBack={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-agent="codeur"]')).toBeTruthy());
    // rendre le formulaire « dirty » en changeant le timeout de codeur
    const timeout = screen.getByLabelText("timeout de codeur");
    fireEvent.change(timeout, { target: { value: "99000" } });
    const save = await screen.findByRole("button", { name: /Sauvegarder/ });
    fireEvent.click(save);
    await waitFor(() => {
      expect(putBody).not.toBeNull();
    });
    const putCall = global.fetch.mock.calls.find((c) => (c[1]?.method) === "PUT");
    expect(putCall[0]).toContain("/api/brain-registry");
    expect(putBody.codeur.timeoutMs).toBe(99000);
  });

  it("« Ajouter un modèle » ouvre la modale (Local / Télécharger)", async () => {
    const { container } = render(<AtelierCerveaux onBack={() => {}} />);
    await waitFor(() => expect(container.querySelector('[data-agent="vision"]')).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Ajouter un modèle/ }));
    expect(await screen.findByText("Mes modèles locaux")).toBeInTheDocument();
    expect(screen.getByText("Télécharger")).toBeInTheDocument();
  });
});
