// Deterministic tests for the backend generator (Chantier #35).
// Tests pure functions only — no network, no process spawn, no filesystem side-effects.
import * as assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { hasBackend, scaffoldBackend, BACKEND_DIR_NAME } from "../backend-generator.js";
import { inferProjectType } from "../blueprints.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── hasBackend ────────────────────────────────────────────────────────────────
console.log("\nhasBackend()");

test("returns false when api/ absent", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    assert.equal(hasBackend(tmp), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("returns true when api/package.json present", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    const apiDir = path.join(tmp, BACKEND_DIR_NAME);
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, "package.json"), '{"name":"api"}', "utf8");
    assert.equal(hasBackend(tmp), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── scaffoldBackend ───────────────────────────────────────────────────────────
console.log("\nscaffoldBackend()");

test("creates api/ with package.json and src/index.ts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    scaffoldBackend(tmp);
    assert.ok(fs.existsSync(path.join(tmp, BACKEND_DIR_NAME, "package.json")), "package.json missing");
    assert.ok(fs.existsSync(path.join(tmp, BACKEND_DIR_NAME, "src", "index.ts")), "src/index.ts missing");
    assert.ok(fs.existsSync(path.join(tmp, BACKEND_DIR_NAME, "tsconfig.json")), "tsconfig.json missing");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("is idempotent — does not overwrite existing api/", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    scaffoldBackend(tmp);
    // Write a sentinel file in api/ then scaffold again
    const sentinel = path.join(tmp, BACKEND_DIR_NAME, "custom-route.ts");
    fs.writeFileSync(sentinel, "// my custom route", "utf8");
    scaffoldBackend(tmp); // must not overwrite
    assert.ok(fs.existsSync(sentinel), "custom file was deleted by re-scaffold");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("creates .env from .env.example", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    scaffoldBackend(tmp);
    assert.ok(fs.existsSync(path.join(tmp, BACKEND_DIR_NAME, ".env")), ".env missing");
    const content = fs.readFileSync(path.join(tmp, BACKEND_DIR_NAME, ".env"), "utf8");
    assert.ok(content.includes("PORT="), ".env must include PORT");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("package.json has dev and start scripts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-test-"));
  try {
    scaffoldBackend(tmp);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, BACKEND_DIR_NAME, "package.json"), "utf8"));
    assert.ok(pkg.scripts?.dev, "missing scripts.dev");
    assert.ok(pkg.scripts?.start, "missing scripts.start");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── blueprints: fullstack type detection ──────────────────────────────────────
console.log("\nblueprintsinferProjectType() — fullstack");

test("detects 'fullstack' from keyword 'fullstack'", () => {
  assert.equal(inferProjectType("une app fullstack React + Express"), "fullstack");
});

test("detects 'fullstack' from keyword 'backend'", () => {
  assert.equal(inferProjectType("ajoute un backend pour les webhooks"), "fullstack");
});

test("detects 'fullstack' from keyword 'express'", () => {
  assert.equal(inferProjectType("crée une route Express pour recevoir des paiements"), "fullstack");
});

test("detects 'fullstack' from 'api rest'", () => {
  assert.equal(inferProjectType("génère une API REST en Node.js"), "fullstack");
});

test("does not mis-classify a landing page as fullstack", () => {
  assert.notEqual(inferProjectType("crée un site vitrine pour mon restaurant"), "fullstack");
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
