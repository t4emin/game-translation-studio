import type { PlatformAdapter } from "../contracts.ts";
import type { GameFile, PlatformMetadata } from "../types.ts";
import { gbaPlatformAdapter } from "./gba/adapter.ts";

const platformAdapters: PlatformAdapter[] = [gbaPlatformAdapter];

export function getPlatformAdapters(): PlatformAdapter[] {
  return platformAdapters;
}

export async function detectPlatform(file: GameFile, requestedPlatform = "auto"): Promise<PlatformMetadata> {
  const candidates =
    requestedPlatform === "auto"
      ? platformAdapters
      : platformAdapters.filter((adapter) => adapter.id === requestedPlatform);

  const detections = await Promise.all(candidates.map(async (adapter) => ({ adapter, result: await adapter.detect(file) })));
  const best = detections.sort((a, b) => b.result.confidence - a.result.confidence)[0];

  if (!best || best.result.confidence <= 0) {
    return {
      platform: "unknown",
      fileName: file.name,
      fileSize: file.size,
      checksum: "unavailable",
      details: {
        detection: "No platform adapter matched this file."
      }
    };
  }

  return best.adapter.inspect(file);
}
