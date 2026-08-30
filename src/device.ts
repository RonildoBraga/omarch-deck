import { LoupedeckCT, LoupedeckDevice, type DeviceInfo } from "loupedeck";

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

// The 2ec2:0007 CT revision (firmware 0.1.x) ignores the separate "A"/"L"/"R"
// display IDs the library uses for the CT. Verified on hardware: it only paints
// when the touch strip is addressed as one 480x270 "M" display with x offsets,
// exactly like the Loupedeck Live. The wheel screen "W" works as-is.
export function createCt(path: string): LoupedeckCT {
  const deck = new LoupedeckCT({ path, autoConnect: false, reconnectInterval: false });
  deck.displays = {
    center: { id: Buffer.from("\x00M"), width: 360, height: 270, offset: [60, 0] },
    left: { id: Buffer.from("\x00M"), width: 60, height: 270 },
    right: { id: Buffer.from("\x00M"), width: 60, height: 270, offset: [420, 0] },
    knob: { id: Buffer.from("\x00W"), width: 240, height: 240, endianness: "be" },
  };
  return deck;
}
