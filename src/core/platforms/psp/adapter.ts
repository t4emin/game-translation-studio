import type { PlatformAdapter } from "../../contracts.ts";
import type { DetectionResult, GameFile, PlatformMetadata } from "../../types.ts";
import { extensionOf, sha256 } from "../../game-file/fingerprint.ts";

export const pspPlatformAdapter: PlatformAdapter = {
  id: "psp",

  async detect(file: GameFile): Promise<DetectionResult> {
    const ext = extensionOf(file.name);
    const possible = ext === ".iso" || ext === ".cso";
    return {
      platform: possible ? "psp" : "unknown",
      confidence: possible ? 0.15 : 0,
      reasons: possible ? ["PSP support is reserved architecturally; no title adapter is implemented."] : []
    };
  },

  async inspect(file: GameFile): Promise<PlatformMetadata> {
    return {
      platform: "psp",
      fileName: file.name,
      fileSize: file.size,
      checksum: sha256(file.bytes),
      details: {
        note: "PSP ISO/CSO inspection is not implemented yet."
      }
    };
  }
};
