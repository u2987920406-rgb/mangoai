/**
 * Pure unit tests for notes-rag helpers.
 * No network, no filesystem — only logic.
 */
import { parseTags, filterByProject, cosine } from "../notes-rag.js";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// parseTags
// ---------------------------------------------------------------------------
console.log("\n── parseTags ──");

assert(
  "comma-separated tags",
  parseTags("react, typescript, ux"),
  ["react", "typescript", "ux"]
);

assert(
  "newline-separated tags",
  parseTags("react\ntypescript\nux"),
  ["react", "typescript", "ux"]
);

assert(
  "mixed separators",
  parseTags("react, typescript\nux, design"),
  ["react", "typescript", "ux", "design"]
);

assert(
  "strip leading # characters",
  parseTags("#react, #typescript, #ux"),
  ["react", "typescript", "ux"]
);

assert(
  "lowercase conversion",
  parseTags("React, TypeScript, UX"),
  ["react", "typescript", "ux"]
);

assert(
  "trim whitespace",
  parseTags("  react  ,  typescript  ,  ux  "),
  ["react", "typescript", "ux"]
);

assert(
  "cap at 4 tags",
  parseTags("a, b, c, d, e, f"),
  ["a", "b", "c", "d"]
);

assert(
  "deduplicate tags",
  parseTags("react, react, typescript, react"),
  ["react", "typescript"]
);

assert(
  "empty input returns []",
  parseTags(""),
  []
);

assert(
  "only whitespace/commas returns []",
  parseTags("  ,  ,  "),
  []
);

assert(
  "two-word tag preserved",
  parseTags("clean code, react"),
  ["clean code", "react"]
);

assert(
  "multiple ## stripped",
  parseTags("##deep-work, #focus"),
  ["deep-work", "focus"]
);

// ---------------------------------------------------------------------------
// filterByProject
// ---------------------------------------------------------------------------
console.log("\n── filterByProject ──");

const notes = [
  { id: "1", ts: "2026-01-01T00:00:00Z", content: "note A", tags: [], project: "alpha" },
  { id: "2", ts: "2026-01-02T00:00:00Z", content: "note B", tags: [], project: "beta" },
  { id: "3", ts: "2026-01-03T00:00:00Z", content: "note C", tags: [] },
  { id: "4", ts: "2026-01-04T00:00:00Z", content: "note D", tags: [], project: "alpha" },
];

assert(
  "filter project alpha → 2 notes",
  filterByProject(notes, "alpha").map((n) => n.id),
  ["1", "4"]
);

assert(
  "filter project beta → 1 note",
  filterByProject(notes, "beta").map((n) => n.id),
  ["2"]
);

assert(
  "filter unknown project → 0 notes",
  filterByProject(notes, "gamma").map((n) => n.id),
  []
);

assert(
  "notes without project not included in strict filter",
  filterByProject(notes, "alpha").every((n) => n.project === "alpha"),
  true
);

// ---------------------------------------------------------------------------
// cosine (#61 vague 2 — semantic similarity)
// ---------------------------------------------------------------------------
console.log("\n── cosine ──");

// Tolérance flottante : la similarité cosinus ne tombe pas pile sur 1/-1 en IEEE754.
function assertClose(label: string, actual: number, expected: number, eps = 1e-9) {
  const ok = Math.abs(actual - expected) < eps;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} (attendu ≈${expected}, obtenu ${actual})`);
    failed++;
  }
}

assertClose("identical vectors → 1", cosine([1, 2, 3], [1, 2, 3]), 1);
assertClose("orthogonal vectors → 0", cosine([1, 0], [0, 1]), 0);
assertClose("opposite vectors → -1", cosine([1, 2], [-1, -2]), -1);
assertClose("zero vector → 0 (no NaN)", cosine([0, 0, 0], [1, 2, 3]), 0);
assertClose("scaled colinear vectors → 1", cosine([2, 4, 6], [1, 2, 3]), 1);
assertClose("different lengths handled (min len)", cosine([1, 0, 5], [1, 0]), 1);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n${passed}/${total} tests passed\n`);
if (failed > 0) process.exit(1);
