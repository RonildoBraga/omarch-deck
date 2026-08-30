import { executeAction } from "./actions.js";
import { loadConfig } from "./config.js";
import { createCt, findCt, initializeDisplay } from "./device.js";

const RETRY_DELAY_MS = 3_000;
const CONNECT_TIMEOUT_MS = 5_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function connectWithTimeout(connect: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
      CONNECT_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([connect, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const { config, path } = await loadConfig();
  console.log(`[config] loaded ${path} (${config.profile.name})`);
  console.log("[device] looking for Loupedeck CT (USB 2ec2:0003 or 2ec2:0007)");

  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  while (!stopping) {
    try {
      const info = await findCt(config.device.path);
      if (!info) {
        console.log(`[device] not available; retrying in ${RETRY_DELAY_MS / 1000}s`);
        await delay(RETRY_DELAY_MS);
        continue;
      }

      console.log(`[device] found ${info.path} (${info.vendorId?.toString(16)}:${info.productId?.toString(16).padStart(4, "0")})`);
      const deck = createCt(info, config, executeAction);
      let disconnected = false;
      deck.on("disconnect", error => {
        disconnected = true;
        console.error(`[device] disconnected${error ? `: ${error.message}` : ""}`);
      });
      await connectWithTimeout(deck.connect());
      const deviceInfo = await deck.getInfo();
      console.log(`[device] connected; serial=${deviceInfo.serial} firmware=${deviceInfo.version}`);
      await initializeDisplay(deck, config);
      console.log("[device] display initialized; controls are active (Ctrl+C to stop)");

      while (!stopping && !disconnected) await delay(250);
      await deck.close();
    } catch (error) {
      console.error(`[device] ${error instanceof Error ? error.message : error}`);
    }

    if (!stopping) await delay(RETRY_DELAY_MS);
  }

  console.log("[omarch-deck] stopped");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
