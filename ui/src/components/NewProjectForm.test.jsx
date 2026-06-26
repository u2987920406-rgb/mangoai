import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectForm } from "./WindowManager.jsx";

// Le point d'entrée « créer une app » (fenêtre App Builder). Sa casse (#136 — le bouton
// disparu) a fait naître l'Auditeur de Flux #137 : on le verrouille. Correctif UX (Raf) :
// ce champ ne sert QU'À NOMMER le projet et NE déclenche AUCUNE construction — il ouvre
// l'atelier (composer vide) où Raf choisit ensuite Construire / Discuter / Planifier.
// Logique testée : la porte `ready` (nom non vide), le slug dérivé du nom (slugify), la
// soumission qui passe le SLUG SEUL (jamais de prompt → pas de build auto), l'annulation.

function setup(overrides = {}) {
  const props = { onCreate: vi.fn(), onCancel: vi.fn(), ...overrides };
  render(<NewProjectForm {...props} />);
  const nameInput = screen.getByRole("textbox");
  const createBtn = screen.getByRole("button", { name: /Créer.*ouvrir/i });
  return { props, nameInput, createBtn };
}

describe("NewProjectForm", () => {
  it("« Créer » est désactivé tant que le nom est vide", () => {
    const { nameInput, createBtn } = setup();
    expect(createBtn).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: "ma-boutique" } });
    expect(createBtn).toBeEnabled();
  });

  it("le slug est dérivé du nom (slugify)", () => {
    const { props, nameInput, createBtn } = setup();
    fireEvent.change(nameInput, { target: { value: "Todo App" } });
    fireEvent.click(createBtn);
    expect(props.onCreate).toHaveBeenCalledWith("todo-app");
  });

  it("clic sur Créer → onCreate(slug) SANS prompt (aucune construction auto)", () => {
    const { props, nameInput, createBtn } = setup();
    fireEvent.change(nameInput, { target: { value: "mon-app" } });
    fireEvent.click(createBtn);
    // un seul argument : le slug. Jamais de description/prompt en 2ᵉ position.
    expect(props.onCreate).toHaveBeenCalledWith("mon-app");
    expect(props.onCreate.mock.calls[0]).toHaveLength(1);
  });

  it("Entrée soumet quand prêt, no-op si vide", () => {
    const { props, nameInput } = setup();
    // vide → ignoré
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(props.onCreate).not.toHaveBeenCalled();
    // rempli → soumet le slug seul
    fireEvent.change(nameInput, { target: { value: "todo app" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(props.onCreate).toHaveBeenCalledWith("todo-app");
  });

  it("Annuler appelle onCancel", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
