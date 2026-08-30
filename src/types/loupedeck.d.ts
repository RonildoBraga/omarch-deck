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

  export interface DisplayInfo {
    id: Buffer;
    width: number;
    height: number;
    offset?: [number, number];
    endianness?: "le" | "be";
  }

  export class LoupedeckCT extends LoupedeckDevice {
    displays: Record<"left" | "center" | "right" | "knob", DisplayInfo>;
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

  // Subset of the node-canvas 2D context that this project draws with.
  export interface DrawContext {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    lineCap: string;
    lineJoin: string;
    font: string;
    textAlign: string;
    textBaseline: string;
    save(): void;
    restore(): void;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise?: boolean): void;
    ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
    roundRect(x: number, y: number, width: number, height: number, radii?: number): void;
    stroke(): void;
    fill(): void;
    fillRect(x: number, y: number, width: number, height: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
  }

  type DrawCallback = (context: DrawContext, width: number, height: number) => void;
}
