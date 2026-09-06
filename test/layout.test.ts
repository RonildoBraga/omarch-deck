import assert from "node:assert/strict";
import test from "node:test";
import { DIALS, STRIP_DIALS } from "../src/layout.js";

// The strip is 60px wide and `sans-serif` resolves to a monospace face, so the
// advance is 0.6em: 6 characters at bold 14px is 50.4px against a 54px budget.
// Longer strings are condensed by fillText rather than truncated, which reads
// as a rendering fault rather than a label.
const MAX_STRIP_CHARS = 6;

test("every side dial is labelled within the strip's width budget", () => {
  for (const [side, ids] of Object.entries(STRIP_DIALS)) {
    assert.equal(ids.length, 3, `${side} strip has three dials beside it`);
    for (const id of ids) {
      const dial = DIALS.find(candidate => candidate.id === id);
      assert.ok(dial, `${id} is missing from DIALS`);
      assert.ok(dial.strip, `${id} needs a strip legend`);
      assert.ok(dial.strip.length <= MAX_STRIP_CHARS, `"${dial.strip}" exceeds ${MAX_STRIP_CHARS} characters`);
      assert.equal(dial.strip, dial.strip.toUpperCase(), `"${dial.strip}" should be upper case`);
    }
  }
});

test("the centre wheel has no side strip and so no legend", () => {
  assert.equal(DIALS.find(candidate => candidate.id === "knobCT")?.strip, undefined);
});

test("the strips together cover all six side dials exactly once", () => {
  const labelled = Object.values(STRIP_DIALS).flat();
  assert.equal(new Set(labelled).size, 6);
  assert.equal(DIALS.filter(dial => dial.strip).length, 6);
});
