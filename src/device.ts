import { LoupedeckCT, LoupedeckDevice, type DeviceInfo, type Touch } from "loupedeck";
import type { DeckConfig } from "./config.js";

const LOUPEDECK_VENDOR_ID = 0x2ec2;
const CT_PRODUCT_IDS = new Set([0x0003, 0x0007]);

export async function findCt(pathPreference = "auto"): Promise<DeviceInfo | undefined> {
  const devices = await LoupedeckDevice.list({ ignoreWebsocket: true });
  return devices.find(device => {
    if (pathPreference !== "auto" && device.path !== pathPreference) return false;
    return device.vendorId === LOUPEDECK_VENDOR_ID &&
      device.productId !== undefined && CT_PRODUCT_IDS.has(device.productId);
  });
}

function eventDetails(touch: Touch): string {
  const target = touch.target.key === undefined
    ? touch.target.screen ?? "unknown"
    : `${touch.target.screen ?? "screen"}/key-${touch.target.key}`;
  return `${target} x=${touch.x} y=${touch.y}`;
}

export function createCt(
  info: DeviceInfo,
  config: DeckConfig,
  runAction: (name: string) => Promise<void>,
): LoupedeckCT {
  if (!info.path) throw new Error("The Loupedeck was detected without a serial device path.");

  const deck = new LoupedeckCT({ path: info.path, autoConnect: false, reconnectInterval: false });
  const dispatch = (action: string | undefined): void => {
    if (!action) return;
    void runAction(action).catch(error => console.error(`[action] ${error instanceof Error ? error.message : error}`));
  };

  deck.on("down", ({ id }) => {
    console.log(`[input] down ${id}`);
    const name = String(id);
    dispatch(config.profile.buttons[name]?.action ?? config.profile.dials[name]?.press);
  });
  deck.on("up", ({ id }) => console.log(`[input] up ${id}`));
  deck.on("rotate", ({ id, delta }) => {
    console.log(`[input] rotate ${id} delta=${delta}`);
    const dial = config.profile.dials[id];
    dispatch(delta < 0 ? dial?.counterClockwise : dial?.clockwise);
  });
  deck.on("touchstart", ({ changedTouches }) => {
    for (const touch of changedTouches) console.log(`[input] touchstart ${eventDetails(touch)}`);
  });
  deck.on("touchmove", ({ changedTouches }) => {
    for (const touch of changedTouches) console.log(`[input] touchmove ${eventDetails(touch)}`);
  });
  deck.on("touchend", ({ changedTouches }) => {
    for (const touch of changedTouches) {
      console.log(`[input] touchend ${eventDetails(touch)}`);
      if (touch.target.screen === "center" && touch.target.key !== undefined) {
        dispatch(config.profile.touch[String(touch.target.key)]?.action);
      }
    }
  });

  return deck;
}

export async function initializeDisplay(deck: LoupedeckCT, config: DeckConfig): Promise<void> {
  await deck.setBrightness(config.device.brightness);

  await deck.drawScreen("center", (context, width, height) => {
    context.fillStyle = "#0b0f14";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#7dd3fc";
    context.font = "bold 30px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("OMARCH", width / 2, height / 2 - 22);
    context.fillStyle = "#e2e8f0";
    context.font = "20px sans-serif";
    context.fillText("DECK", width / 2, height / 2 + 22);
  });

  await Promise.all(Object.entries(config.profile.touch).map(async ([key, binding]) => {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index > 11) return;
    await deck.drawKey(index, (context, width, height) => {
      context.fillStyle = "#172033";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#f8fafc";
      context.font = "bold 15px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(binding.label, width / 2, height / 2, width - 12);
    });
  }));
}
