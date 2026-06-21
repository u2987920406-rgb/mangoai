import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectForm } from "./WindowManager.jsx";

// Le point d'entrée « créer une app » (fenêtre App Builder). Sa casse (#136 — le bouton
// disparu) a fait naître l'Auditeur de Flux #137 : on le verrouille. Logique testée :
// la porte `ready` (description non vide), le slug dérivé de la description (puis découplé
// dès que le nom est édité à la main), la soumission (clic + Cmd/Ctrl+Enter), l'annulation.

function setup(overrides = {}) {
  const props = { onCreate: vi.fn(), onCancel: vi.fn(), ...overrides };
  render(<NewProjectForm {...props} />);
  const [desc, nameInput] = screen.getAllByRole("textbox");
  const createBtn = screen.getByRole("button", { name: /Créer & construire/ });
  return { props, desc, nameInput, createBtn };
}

describe("NewProjectForm", () => {
  it("« Créer » est désactivé tant que la description est vide", () => {
    const { desc, createBtn } = setup();
    expect(createBtn).toBeDisabled();
    fireEvent.change(desc, { target: { value: "todo app" } });
    expect(createBtn).toBeEnabled();
  });

  it("le slug est dérivé de la description (slugify)", () => {
    const { desc, nameInput } = setup();
    fireEvent.change(desc, { target: { value: "todo app" } });
    expect(nameInput.value).toBe("todo-app");
  });

  it("éditer le nom à la main découple le slug de la description", () => {
    const { desc, nameInput } = setup();
    fireEvent.change(desc, { target: { value: "todo app" } });
    fireEvent.change(nameInput, { target: { value: "mon-app" } });
    expect(nameInput.value).toBe("mon-app");
    // changer la description ensuite ne réécrit plus le nom
    fireEvent.change(desc, { target: { value: "autre chose" } });
    expect(nameInput.value).toBe("mon-app");
  });

  it("clic sur Créer → onCreate(slug, description nettoyée)", () => {
    const { props, desc, createBtn } = setup();
    fireEvent.change(desc, { target: { value: "  todo app  " } });
    fireEvent.click(createBtn);
    expect(props.onCreate).toHaveBeenCalledWith("todo-app", "todo app");
  });

  it("Cmd/Ctrl+Enter soumet quand prêt, no-op si vide", () => {
    const { props, desc } = setup();
    // vide → ignoré
    fireEvent.keyDown(desc, { key: "Enter", ctrlKey: true });
    expect(props.onCreate).not.toHaveBeenCalled();
    // rempli → soumet
    fireEvent.change(desc, { target: { value: "todo app" } });
    fireEvent.keyDown(desc, { key: "Enter", metaKey: true });
    expect(props.onCreate).toHaveBeenCalledWith("todo-app", "todo app");
  });

  it("Annuler appelle onCancel", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
