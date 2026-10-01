import type { PlatformAdapter } from "../../contracts.ts";
import type { DetectionResult, GameFile, PlatformMetadata } from "../../types.ts";
import { extensionOf, sha256 } from "../../game-file/fingerprint.ts";
import { scanPs2Iso } from "./iso9660.ts";

export const ps2PlatformAdapter: PlatformAdapter = {
  id: "ps2",

  async detect(file: GameFile): Promise<DetectionResult> {
    const possible = extensionOf(file.name) === ".iso";
    const hasIsoDescriptor = file.bytes.length >= 0x8806 && Buffer.from(file.bytes.subarray(0x8001, 0x8006)).toString("ascii") === "CD001";
    return {
      platform: possible ? "ps2" : "unknown",
      confidence: possible ? hasIsoDescriptor ? 0.65 : 0.1 : 0,
      reasons: possible ? [hasIsoDescriptor ? "ISO9660 descriptor found; PS2 ISO explorer can inspect files." : "PS2 ISO extension selected; ISO9660 descriptor was not confirmed."] : []
    };
  },

  async inspect(file: GameFile): Promise<PlatformMetadata> {
    const iso = scanPs2Iso(file.bytes);
    return {
      platform: "ps2",
      fileName: file.name,
      fileSize: file.size,
      checksum: sha256(file.bytes),
      title: iso.volumeId,
      gameId: iso.bootFile,
      details: {
        iso9660: iso.valid ? "valid" : "invalid",
        volumeId: iso.volumeId ?? null,
        systemId: iso.systemId ?? null,
        bootFile: iso.bootFile ?? null,
        files: iso.fileCount,
        directories: iso.directoryCount
      }
    };
  }
};
