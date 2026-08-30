import assert from "node:assert/strict";
import test from "node:test";
import { ACTIONS, isActionName } from "../src/actions.js";

test("only registered actions are accepted", () => {
  assert.equal(isActionName("volume-up"), true);
  assert.equal(isActionName("rm -rf /"), false);
});

test("registered actions use direct executables rather than a shell", () => {
  for (const command of Object.values(ACTIONS)) {
    assert.ok(command.length >= 1);
    assert.equal(command.some(part => part.includes(";")), false);
  }
});
