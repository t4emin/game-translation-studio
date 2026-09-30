import { createHash } from "node:crypto";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

export function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return Buffer.from(bytes.slice(start, start + length))
    .toString("ascii")
    .replace(/\0/g, "")
    .trim();
}
