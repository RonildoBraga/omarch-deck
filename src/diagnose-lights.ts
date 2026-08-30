import type { LoupedeckCT } from "loupedeck";
import { createCt, findCt } from "./device.js";

const ROUND_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const CT_BUTTONS = [
  "home", "undo", "keyboard", "enter", "save",
  "fnL", "a", "c", "fnR", "b", "d", "e",
] as const;
const ALL_BUTTONS: ReadonlyArray<string | number> = [...ROUND_BUTTONS, ...CT_BUTTONS];
const COLOUR_PHASES = [
  ["red", "#ff0000"],
  ["green", "#00ff00"],
  ["blue", "#0000ff"],
  ["white", "#ffffff"],
  ["off", "#000000"],
] as const;

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function setLight(deck: LoupedeckCT, id: string | number, color: string): Promise<boolean> {
  try {
    // Firmware 0.1.2 applies SET_COLOR but does not acknowledge the command.
    // Transmit it without awaiting the library's never-resolving transaction.
    void deck.setButtonColor({ id, color });
    await delay(10);
    return true;
  } catch (error) {
    console.error(`[lights] ${id}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function setAll(deck: LoupedeckCT, color: string): Promise<void> {
  for (const id of ALL_BUTTONS) await setLight(deck, id, color);
}

async function main(): Promise<void> {
  console.log("[lights] looking for Loupedeck CT");
  const info = await findCt();
  if (!info?.path) throw new Error("No Loupedeck CT serial device found.");

  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  const deck = createCt(info.path);
  deck.on("down", ({ id }) => console.log(`[input] down ${id}`));
  deck.on("up", ({ id }) => console.log(`[input] up ${id}`));
  deck.on("disconnect", error => {
    if (error) console.error(`[device] disconnected: ${error.message}`);
    stopping = true;
  });

  await deck.connect();
  const deviceInfo = await deck.getInfo();
  console.log(`[device] connected; serial=${deviceInfo.serial} firmware=${deviceInfo.version}`);
  console.log(`[lights] testing ${ALL_BUTTONS.length} possible illuminated buttons`);
  console.log("[lights] watch for red, green, blue, white, then a white one-button chase");

  try {
    while (!stopping) {
      for (const [name, color] of COLOUR_PHASES) {
        if (stopping) break;
        console.log(`[lights] all ${name}`);
        await setAll(deck, color);
        await delay(1_200);
      }

      for (const id of ALL_BUTTONS) {
        if (stopping) break;
        await setAll(deck, "#000000");
        console.log(`[lights] chase ${id}`);
        await setLight(deck, id, "#ffffff");
        await delay(700);
      }
    }
  } finally {
    await setAll(deck, "#000000");
    await deck.close();
    console.log("[lights] stopped; LEDs switched off");
  }
}

main().catch(error => {
  console.error(`[lights] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
