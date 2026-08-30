import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("the example configuration is valid", async () => {
  const previous = process.env.OMARCH_DECK_CONFIG;
  process.env.OMARCH_DECK_CONFIG = new URL("../config.example.yaml", import.meta.url).pathname;
  try {
    const { config } = await loadConfig();
    assert.equal(config.profile.name, "default");
    assert.equal(config.profile.dials.knobTL?.clockwise, "volume-up");
  } finally {
    if (previous === undefined) delete process.env.OMARCH_DECK_CONFIG;
    else process.env.OMARCH_DECK_CONFIG = previous;
  }
});
