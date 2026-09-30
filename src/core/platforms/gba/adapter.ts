import type { PlatformAdapter } from "../../contracts.ts";
import { extensionOf, readAscii, sha256 } from "../../game-file/fingerprint.ts";
import type { DetectionResult, GameFile, PlatformMetadata } from "../../types.ts";

function hasGbaHeader(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 0xc0 && bytes[0xb2] === 0x96;
}

function headerChecksum(bytes: Uint8Array): string {
  if (bytes.byteLength < 0xbe) return "unavailable";
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i += 1) {
    checksum = (checksum - bytes[i] - 1) & 0xff;
  }
  const expected = bytes[0xbd];
  return checksum === expected ? `valid:${checksum.toString(16).padStart(2, "0")}` : `invalid:${checksum.toString(16)}!=${expected.toString(16)}`;
}

export const gbaPlatformAdapter: PlatformAdapter = {
  id: "gba",

  async detect(file: GameFile): Promise<DetectionResult> {
    const reasons: string[] = [];
    let confidence = 0;

    if (extensionOf(file.name) === ".gba") {
      confidence += 0.35;
      reasons.push("File extension is .gba.");
    }

    if (hasGbaHeader(file.bytes)) {
      confidence += 0.6;
      reasons.push("Nintendo/GBA header fixed value 0x96 found at 0xB2.");
    }

    return {
      platform: confidence > 0 ? "gba" : "unknown",
      confidence,
      reasons
    };
  },

  async inspect(file: GameFile): Promise<PlatformMetadata> {
    const bytes = file.bytes;
    return {
      platform: "gba",
      fileName: file.name,
      fileSize: file.size,
      checksum: sha256(bytes),
      title: readAscii(bytes, 0xa0, 12),
      gameId: readAscii(bytes, 0xac, 4),
      revision: bytes.byteLength > 0xbc ? `v${bytes[0xbc]}` : "unknown",
      details: {
        makerCode: readAscii(bytes, 0xb0, 2),
        fixedValue: bytes.byteLength > 0xb2 ? bytes[0xb2] : null,
        headerChecksum: headerChecksum(bytes)
      }
    };
  }
};
