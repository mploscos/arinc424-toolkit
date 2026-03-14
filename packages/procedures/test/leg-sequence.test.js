import test from "node:test";
import assert from "node:assert/strict";
import { validateProcedureLegSequence } from "../src/index.js";

const decoded = {
  procedureId: "procedure:test:1",
  legs: [
    { index: 0, seq: 1, pathTerminator: "IF", supported: true, fixId: "fix:1" },
    { index: 1, seq: 2, pathTerminator: "TF", supported: true, fixId: "fix:2" },
    { index: 2, seq: 3, pathTerminator: "CF", supported: true, fixId: "fix:3" }
  ],
  warnings: []
};

test("validateProcedureLegSequence accepts ordered phase 1 chain", () => {
  const result = validateProcedureLegSequence(decoded);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateProcedureLegSequence detects out-of-order sequences", () => {
  const result = validateProcedureLegSequence({
    ...decoded,
    legs: [
      { index: 0, seq: 2, pathTerminator: "IF", supported: true, fixId: "fix:1" },
      { index: 1, seq: 1, pathTerminator: "TF", supported: true, fixId: "fix:2" }
    ]
  });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /not strictly increasing/);
});

test("validateProcedureLegSequence warns on unsupported leg preservation", () => {
  const result = validateProcedureLegSequence({
    procedureId: "procedure:test:2",
    warnings: [],
    legs: [
      { index: 0, seq: 1, pathTerminator: "ZZ", supported: false, fixId: "fix:1" }
    ]
  });
  assert.equal(result.valid, true);
  assert.match(result.warnings[0], /unsupported path terminator/i);
});
