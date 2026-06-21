// #140 (point #4) — test de RENDU d'un composant (JSX), au-delà des hooks.
// Toasts est pur (props → DOM) : idéal pour valider la chaîne render + jsdom.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Toasts from "./Toast.jsx";

describe("Toasts", () => {
  it("ne rend rien quand la liste est vide", () => {
    const { container } = render(<Toasts toasts={[]} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le texte de chaque toast", () => {
    render(
      <Toasts
        toasts={[
          { id: 1, kind: "success", text: "Sauvegardé" },
          { id: 2, kind: "error", text: "Échec réseau" },
        ]}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Sauvegardé")).toBeInTheDocument();
    expect(screen.getByText("Échec réseau")).toBeInTheDocument();
  });

  it("rend le lien externe quand linkUrl est fourni", () => {
    render(
      <Toasts
        toasts={[{ id: 1, kind: "success", text: "Publié", linkUrl: "https://exemple.app" }]}
        onDismiss={() => {}}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://exemple.app");
    expect(link).toHaveTextContent("exemple.app"); // le préfixe https:// est masqué
  });

  it("le bouton Fermer appelle onDismiss avec le bon id", () => {
    const onDismiss = vi.fn();
    render(
      <Toasts toasts={[{ id: 7, kind: "success", text: "X" }]} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
