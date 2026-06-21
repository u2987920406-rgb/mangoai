// #140 — étend `expect` avec les matchers DOM (toBeInTheDocument, etc.) et
// nettoie le DOM monté entre chaque test (évite les fuites inter-tests).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
