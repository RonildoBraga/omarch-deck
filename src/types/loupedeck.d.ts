declare module "loupedeck" {
  import { EventEmitter } from "node:events";

  export interface DeviceInfo {
    path?: string;
    host?: string;
    vendorId?: number;
    productId?: number;
    serialNumber?: string;
  }

  export interface Touch {
    id: number;
    x: number;
    y: number;
    target: { screen?: string; key?: number };
  }

  export class LoupedeckDevice extends EventEmitter {
    static list(options?: {
      ignoreSerial?: boolean;
      ignoreWebsocket?: boolean;
    }): Promise<DeviceInfo[]>;
  }

  export class LoupedeckCT extends LoupedeckDevice {
    constructor(options?: {
      path?: string;
      host?: string;
      autoConnect?: boolean;
      reconnectInterval?: number | false;
    });
    connect(): Promise<void>;
    close(): Promise<void> | undefined;
    getInfo(): Promise<{ serial: string; version: string }>;
    setBrightness(value: number): Promise<void>;
    setButtonColor(options: { id: string | number; color: string }): Promise<void>;
    vibrate(pattern?: number): Promise<void>;
    drawKey(index: number, callback: DrawCallback): Promise<void>;
    drawScreen(id: "left" | "center" | "right" | "knob", callback: DrawCallback): Promise<void>;
    on(event: "connect", listener: (info: { address: string }) => void): this;
    on(event: "disconnect", listener: (error?: Error) => void): this;
    on(event: "down" | "up", listener: (event: { id: string | number }) => void): this;
    on(event: "rotate", listener: (event: { id: string; delta: number }) => void): this;
    on(event: "touchstart" | "touchmove" | "touchend", listener: (event: { changedTouches: Touch[]; touches: Touch[] }) => void): this;
  }

  type DrawCallback = (
    context: {
      fillStyle: string;
      font: string;
      textAlign: string;
      textBaseline: string;
      fillRect(x: number, y: number, width: number, height: number): void;
      fillText(text: string, x: number, y: number, maxWidth?: number): void;
    },
    width: number,
    height: number,
  ) => void;
}
