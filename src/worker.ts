import type { LoupedeckCT } from "loupedeck";
import { loadConfig } from "./config.js";
import { DeckController } from "./controller.js";
import { createCt, findCt } from "./device.js";

const RETRY_DELAY_MS = 3_000;
const CONNECT_TIMEOUT_MS = 5_000;
const RESTART_EXIT_CODE = 75;

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function connectWithTimeout(connect: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS);
  });
  try { await Promise.race([connect, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

async function main(): Promise<void> {
  const { config, path } = await loadConfig();
  console.log(`[config] loaded ${path} (${config.profile.name}); project=${config.project.path}`);
  console.log("[device] looking for Loupedeck CT (USB 2ec2:0003 or 2ec2:0007)");

  let stopping = false;
  let controller: DeckController | undefined;
  const stop = (): void => { stopping = true; controller?.stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    let deck: LoupedeckCT | undefined;
    try {
      const info = await findCt(config.device.path);
      if (!info?.path) {
        console.log(`[device] not available; retrying in ${RETRY_DELAY_MS / 1000}s`);
        await delay(RETRY_DELAY_MS);
        continue;
      }

      console.log(`[device] found ${info.path} (${info.vendorId?.toString(16)}:${info.productId?.toString(16).padStart(4, "0")})`);
      deck = createCt(info.path);
      await connectWithTimeout(deck.connect());
      const deviceInfo = await deck.getInfo();
      console.log(`[device] connected; serial=${deviceInfo.serial} firmware=${deviceInfo.version}`);
      controller = new DeckController(deck, config);
      await controller.start();
      await controller.close();
      controller = undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[device] ${message}`);
      if (message.startsWith("Connection timed out")) {
        console.log("[device] restarting client to recover firmware 0.1.x handshake");
        process.exit(RESTART_EXIT_CODE);
      }
      if (deck) {
        try { await deck.close(); } catch { /* reconnect below */ }
      }
    }
    if (!stopping) await delay(RETRY_DELAY_MS);
  }
  console.log("[omarch-deck] stopped");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
