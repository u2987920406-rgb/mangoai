import { render, screen, fireEvent } from "@testing-library/react";
import { Message } from "./Chat.jsx";

// Bouton « Relancer » sous CHAQUE message utilisateur (demande de Raf) : il recopie
// le texte du message dans la barre de saisie pour le modifier puis le renvoyer
// SOI-MÊME — pas d'envoi automatique. On verrouille : présent + appelle onReuse(texte)
// sous un message « user » ; absent sur un message « agent » (les pouces restent).

describe("Message — bouton Relancer (réutilisation d'un prompt utilisateur)", () => {
  it("affiche « Relancer » sous un message utilisateur", () => {
    render(<Message m={{ id: "1", role: "user", text: "un jeu de pétanque" }} onReuse={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Relancer/i })).toBeTruthy();
  });

  it("clic → onReuse reçoit le TEXTE exact du message (sans envoi auto)", () => {
    const onReuse = vi.fn();
    render(<Message m={{ id: "1", role: "user", text: "  ajoute un score  " }} onReuse={onReuse} />);
    fireEvent.click(screen.getByRole("button", { name: /Relancer/i }));
    expect(onReuse).toHaveBeenCalledWith("  ajoute un score  ");
  });

  it("pas de bouton Relancer si onReuse n'est pas fourni", () => {
    render(<Message m={{ id: "1", role: "user", text: "salut" }} />);
    expect(screen.queryByRole("button", { name: /Relancer/i })).toBeNull();
  });

  it("aucun bouton Relancer sur un message de l'agent", () => {
    render(<Message m={{ id: "2", role: "agent", text: "voici ma réponse" }} onReuse={vi.fn()} onFeedback={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Relancer/i })).toBeNull();
  });
});
