import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";

const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

async function withConfig<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.OMARCH_DECK_CONFIG;
  process.env.OMARCH_DECK_CONFIG = path;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.OMARCH_DECK_CONFIG;
    else process.env.OMARCH_DECK_CONFIG = previous;
  }
}

async function writeTemp(name: string, contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "omarch-deck-"));
  const path = join(dir, name);
  await writeFile(path, contents);
  return path;
}

test("the example configuration is valid", async () => {
  await withConfig(fileURLToPath(new URL("../config.example.yaml", import.meta.url)), async () => {
    const { config } = await loadConfig();
    assert.equal(config.profile.name, "default");
    assert.equal(config.project.path, REPO);
  });
});

// Silently falling back left the user editing a file that was never read.
test("an unreadable OMARCH_DECK_CONFIG is an error, not a silent fallback", async () => {
  await withConfig("/nonexistent/omarch-deck/config.yaml", async () => {
    await assert.rejects(loadConfig(), /OMARCH_DECK_CONFIG=.*is not readable/);
  });
});

test("an empty configuration file means all defaults", async () => {
  const path = await writeTemp("config.yaml", "# nothing here\n");
  await withConfig(path, async () => {
    const { config } = await loadConfig();
    assert.equal(config.device.brightness, 0.7);
    assert.equal(config.profile.name, "default");
  });
});

// The service reprints whatever this throws every RestartSec seconds, so the
// message has to name the file and the field rather than dumping zod's issues.
test("an invalid value reports the file and the field", async () => {
  const path = await writeTemp("config.yaml", "device:\n  brightness: 3\n");
  await withConfig(path, async () => {
    await assert.rejects(loadConfig(), (error: Error) => {
      assert.match(error.message, /config\.yaml: device\.brightness:/);
      assert.doesNotMatch(error.message, /^\[/, "not a raw JSON issue array");
      return true;
    });
  });
});

test("a YAML syntax error reports the file", async () => {
  const path = await writeTemp("config.yaml", "device:\n  brightness: [unclosed\n");
  await withConfig(path, async () => {
    await assert.rejects(loadConfig(), (error: Error) => {
      assert.match(error.message, /config\.yaml: /);
      return true;
    });
  });
});
