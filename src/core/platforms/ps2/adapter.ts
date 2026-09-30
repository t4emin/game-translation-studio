import type { PlatformAdapter } from "../../contracts.ts";
import type { DetectionResult, GameFile, PlatformMetadata } from "../../types.ts";
import { extensionOf, sha256 } from "../../game-file/fingerprint.ts";

export const ps2PlatformAdapter: PlatformAdapter = {
  id: "ps2",

  async detect(file: GameFile): Promise<DetectionResult> {
    const possible = extensionOf(file.name) === ".iso";
    return {
      platform: possible ? "ps2" : "unknown",
      confidence: possible ? 0.1 : 0,
      reasons: possible ? ["PS2 support is reserved architecturally; no title adapter is implemented."] : []
    };
  },

  async inspect(file: GameFile): Promise<PlatformMetadata> {
    return {
      platform: "ps2",
      fileName: file.name,
      fileSize: file.size,
      checksum: sha256(file.bytes),
      details: {
        note: "PS2 ISO inspection is not implemented yet."
      }
    };
  }
};
