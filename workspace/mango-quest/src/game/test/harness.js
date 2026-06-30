// Minimal test harness: test(name, fn) registers, runAllTests() executes.
const tests = [];

globalThis.test = function (name, fn) {
  tests.push({ name, fn });
};

function approxEq(a, b, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

globalThis.expect = function (actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (typeof actual === "number" && typeof expected === "number") {
        if (!approxEq(actual, expected)) throw new Error(`Expected ~${expected}, got ${actual}`);
        return;
      }
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) throw new Error(`Expected ${actual} >= ${n}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n)) throw new Error(`Expected ${actual} <= ${n}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toBeCloseTo(expected, digits = 2) {
      const pow = Math.pow(10, digits);
      if (Math.abs(actual - expected) * pow > 1) throw new Error(`Expected ~${expected}, got ${actual}`);
    },
    toContain(item) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) throw new Error(`Expected array to contain ${item}`);
      } else if (typeof actual === "string") {
        if (!actual.includes(item)) throw new Error(`Expected string to contain ${item}`);
      } else {
        throw new Error(`toContain not applicable to ${typeof actual}`);
      }
    },
  };
};

export function runAllTests() {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed (${tests.length} total)`);
  return failed;
}