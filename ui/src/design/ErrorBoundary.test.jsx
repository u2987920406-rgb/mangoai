import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ crash }) {
  if (crash) throw new Error("panne simulée");
  return <div>contenu sain</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("affiche le repli quand un enfant plante et garde le message", () => {
    render(
      <ErrorBoundary label="Cerveaux">
        <Boom crash />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/« Cerveaux » a rencontré un problème/)).toBeInTheDocument();
    expect(screen.getByText(/panne simulée/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });

  it("laisse passer les enfants quand tout va bien", () => {
    render(
      <ErrorBoundary label="X">
        <Boom crash={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("contenu sain")).toBeInTheDocument();
  });

  it("oublie l'erreur quand resetKey change (navigation ailleurs)", () => {
    function Harness() {
      const [key, setKey] = useState("a");
      return (
        <>
          <button onClick={() => setKey("b")}>naviguer</button>
          <ErrorBoundary label="P" resetKey={key}>
            <Boom crash={key === "a"} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByText(/a rencontré un problème/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("naviguer")); // resetKey a→b, l'enfant ne plante plus
    expect(screen.getByText("contenu sain")).toBeInTheDocument();
  });
});
