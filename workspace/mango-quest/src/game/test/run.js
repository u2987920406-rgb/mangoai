// Tiny test runner — no external deps. Usage: node src/game/test/run.js
// Each test file exports a function that registers tests via the global `test`.
import { runAllTests } from "./harness.js";

// Import test suites
import "./constants.test.js";
import "./world.test.js";
import "./entities.test.js";
import "./movement.test.js";
import "./ai.test.js";
import "./combat.test.js";
import "./inventory.test.js";
import "./spells.test.js";
import "./save.test.js";
import "./quests.test.js";

const failed = runAllTests();
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("\n✅ All tests passed");
  process.exit(0);
}