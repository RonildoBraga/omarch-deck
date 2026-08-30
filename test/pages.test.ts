import assert from "node:assert/strict";
import test from "node:test";
import { PAGES } from "../src/pages.js";

test("every page fills the CT 4x3 touch grid", () => {
  for (const [name, keys] of Object.entries(PAGES)) {
    assert.equal(keys.length, 12, `${name} must contain exactly 12 keys`);
  }
});

test("destructive lock actions require a hold", () => {
  for (const keys of Object.values(PAGES)) {
    for (const key of keys.filter(candidate => candidate.action === "lock-screen")) {
      assert.ok((key.holdMs ?? 0) >= 1_000);
    }
  }
});
