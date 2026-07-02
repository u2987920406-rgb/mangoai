// Historique persisté de la conversation avec l'Esthète, par projet — calque direct
// de history.ts (.chat-history.json du chat principal), fichier séparé pour ne pas
// mélanger les deux conversations dans un même flux.
import path from "node:path";
import fs from "node:fs";
import { atomicWriteFileSync } from "./safe-io.js";
import type { ChatEntry } from "./history.js";

export const ESTHETE_HISTORY_FILE_NAME = ".esthete-history.json";

const ROLES = ["user", "agent", "thinking", "tool", "error", "status"] as const;

function isChatEntry(value: unknown): value is ChatEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === "string" &&
    typeof v.ts === "string" &&
    ROLES.includes(v.role as ChatEntry["role"])
  );
}

function file(dir: string): string {
  return path.join(dir, ESTHETE_HISTORY_FILE_NAME);
}

export function loadEstheteHistory(dir: string): ChatEntry[] {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file(dir), "utf8"));
    return Array.isArray(data) ? data.filter(isChatEntry) : [];
  } catch {
    return [];
  }
}

export function appendEstheteHistory(dir: string, entries: ChatEntry[]): void {
  if (entries.length === 0) return;
  const all = [...loadEstheteHistory(dir), ...entries];
  atomicWriteFileSync(file(dir), JSON.stringify(all, null, 2));
}

export function clearEstheteHistory(dir: string): void {
  atomicWriteFileSync(file(dir), JSON.stringify([], null, 2));
}
