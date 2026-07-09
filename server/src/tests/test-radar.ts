// Pure unit tests for parseRadar() — no network, no LLM calls.
// Usage: npx tsx src/test-radar.ts
import { parseRadar } from "../radar.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? "assertEqual failed"}\n    actual:   ${a}\n    expected: ${e}`);
}

console.log("\ntest-radar — parseRadar()\n");

// ── Test 1: clean JSON with mix of relevant/irrelevant items ─────────────────
test("clean JSON → only relevant items returned", () => {
  const input = JSON.stringify({
    items: [
      { title: "Claude 4 released", link: "https://anthropic.com/claude4", source: "Anthropic", category: "modèle", relevant: true, summary: "Claude 4 is out.", whyMango: "Upgrade MangoOS's backbone." },
      { title: "Random cooking blog", link: "https://food.com/blog", source: "Other", category: "autre", relevant: false, summary: "Not AI related.", whyMango: "" },
      { title: "Ollama local models", link: "https://ollama.ai/news", source: "HuggingFace", category: "outil", relevant: true, summary: "New Ollama release.", whyMango: "Better local inference for MangoOS." },
    ],
  });
  const result = parseRadar(input);
  assert(result.length === 2, `Expected 2 items, got ${result.length}`);
  assert(result[0].title === "Claude 4 released", "First item title mismatch");
  assert(result[1].title === "Ollama local models", "Second item title mismatch");
  assert(result.every((it) => it.relevant === true), "All returned items should be relevant");
});

// ── Test 2: invalid category → normalized to "autre" ────────────────────────
test("category out of allowed list → normalized to 'autre'", () => {
  const input = JSON.stringify({
    items: [
      { title: "Unknown cat", link: "https://example.com", source: "X", category: "unknown-thing", relevant: true, summary: "Test.", whyMango: "Relevant." },
    ],
  });
  const result = parseRadar(input);
  assert(result.length === 1, `Expected 1 item, got ${result.length}`);
  assertEqual(result[0].category, "autre", "Category should be normalized to 'autre'");
});

// ── Test 3: JSON embedded in markdown code fence ─────────────────────────────
test("JSON inside markdown code fence → extracted correctly", () => {
  const input = `Here is the analysis:\n\`\`\`json\n${JSON.stringify({
    items: [
      { title: "Mistral new API", link: "https://mistral.ai/api", source: "HuggingFace", category: "api", relevant: true, summary: "Mistral launched a new API.", whyMango: "Alternative provider for MangoOS." },
    ],
  })}\n\`\`\``;
  const result = parseRadar(input);
  assert(result.length === 1, `Expected 1 item, got ${result.length}`);
  assert(result[0].title === "Mistral new API", "Title mismatch in markdown extraction");
  assertEqual(result[0].category, "api", "Category should be 'api'");
});

// ── Test 4: JSON embedded in plain text ──────────────────────────────────────
test("JSON embedded in surrounding text → extracted correctly", () => {
  const obj = {
    items: [
      { title: "DeepSeek v3 price drop", link: "https://deepseek.com/pricing", source: "HuggingFace", category: "prix", relevant: true, summary: "Prices halved.", whyMango: "Cheaper alternative provider." },
    ],
  };
  const input = `Analysis complete. Result: ${JSON.stringify(obj)} End of analysis.`;
  const result = parseRadar(input);
  assert(result.length === 1, `Expected 1 item, got ${result.length}`);
  assertEqual(result[0].category, "prix", "Category should be 'prix'");
});

// ── Test 5: empty string → [] ────────────────────────────────────────────────
test("empty string → []", () => {
  const result = parseRadar("");
  assertEqual(result, [], "Empty string should return empty array");
});

// ── Test 6: non-JSON string → [] ─────────────────────────────────────────────
test("non-JSON string → []", () => {
  const result = parseRadar("This is not JSON at all. No curly braces.");
  assertEqual(result, [], "Non-JSON should return empty array");
});

// ── Test 7: malformed JSON → [] ──────────────────────────────────────────────
test("malformed JSON → []", () => {
  const result = parseRadar('{ "items": [ { "title": "broken" ');
  assertEqual(result, [], "Malformed JSON should return empty array");
});

// ── Test 8: missing optional fields → default to empty strings ───────────────
test("missing optional fields → defaults to empty strings", () => {
  const input = JSON.stringify({
    items: [
      { title: "Sparse item", link: "https://example.com/sparse", source: "Anthropic", category: "modèle", relevant: true },
    ],
  });
  const result = parseRadar(input);
  assert(result.length === 1, `Expected 1 item, got ${result.length}`);
  assertEqual(result[0].summary, "", "Missing summary should default to ''");
  assertEqual(result[0].whyMango, "", "Missing whyMango should default to ''");
});

// ── Test 9: relevant as string "true" → treated as relevant ──────────────────
test("relevant: 'true' (string) → treated as relevant", () => {
  const input = JSON.stringify({
    items: [
      { title: "String relevant", link: "https://x.com", source: "HuggingFace", category: "outil", relevant: "true", summary: "ok", whyMango: "yes" },
    ],
  });
  const result = parseRadar(input);
  assert(result.length === 1, `Expected 1 item, got ${result.length}`);
});

// ── Test 10: all items irrelevant → [] ───────────────────────────────────────
test("all items irrelevant → []", () => {
  const input = JSON.stringify({
    items: [
      { title: "Cooking show", link: "https://cooking.tv", source: "Other", category: "autre", relevant: false, summary: "Food.", whyMango: "" },
      { title: "Sports news", link: "https://sports.com", source: "Other", category: "autre", relevant: false, summary: "Ball.", whyMango: "" },
    ],
  });
  const result = parseRadar(input);
  assertEqual(result, [], "All irrelevant items should return []");
});

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${passed}/${total} tests passed`);
if (failed > 0) {
  console.error(`${failed} test(s) FAILED`);
  process.exit(1);
}
