import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

const bindingSchema = z.object({
  label: z.string().min(1),
  action: z.string().min(1),
});

const dialSchema = z.object({
  counterClockwise: z.string().optional(),
  clockwise: z.string().optional(),
  press: z.string().optional(),
});

const configSchema = z.object({
  device: z.object({
    path: z.string().default("auto"),
    brightness: z.number().min(0).max(1).default(0.7),
  }).default({ path: "auto", brightness: 0.7 }),
  profile: z.object({
    name: z.string().default("default"),
    buttons: z.record(z.string(), bindingSchema).default({}),
    dials: z.record(z.string(), dialSchema).default({}),
    touch: z.record(z.string(), bindingSchema).default({}),
  }),
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

  const parsed = YAML.parse(await readFile(path, "utf8"));
  return { config: configSchema.parse(parsed), path };
}
