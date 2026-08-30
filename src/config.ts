import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

const configSchema = z.object({
  device: z.object({
    path: z.string().default("auto"),
    brightness: z.number().min(0).max(1).default(0.7),
  }).default({ path: "auto", brightness: 0.7 }),
  project: z.object({
    path: z.string().min(1),
  }).default({ path: process.cwd() }),
  profile: z.object({
    name: z.string().default("default"),
  }).default({ name: "default" }),
});

export type DeckConfig = z.infer<typeof configSchema>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(): Promise<{ config: DeckConfig; path: string }> {
  const candidates = [
    process.env.OMARCH_DECK_CONFIG,
    resolve(process.cwd(), "config.yaml"),
    resolve(homedir(), ".config/omarch-deck/config.yaml"),
    resolve(process.cwd(), "config.example.yaml"),
  ].filter((value): value is string => Boolean(value));

  const path = (await Promise.all(candidates.map(async candidate => ({ candidate, found: await exists(candidate) }))))
    .find(({ found }) => found)?.candidate;

  if (!path) {
    throw new Error("No configuration found. Copy config.example.yaml to config.yaml.");
  }

  const config = configSchema.parse(YAML.parse(await readFile(path, "utf8")));
  // A relative project path is taken from the config file's own directory so
  // the example config works wherever the repository is checked out.
  config.project.path = resolve(dirname(path), config.project.path);
  return { config, path };
}
