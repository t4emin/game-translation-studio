import { findGameAdapter } from "./adapters/registry.ts";
import { detectPlatform } from "./platforms/index.ts";
import { validateGameFile } from "./security/file-safety.ts";
import type { AnalysisReport, GameFile } from "./types.ts";

export async function analyzeGame(file: GameFile, requestedPlatform = "auto"): Promise<AnalysisReport> {
  const fileIssues = validateGameFile(file);
  const metadata = await detectPlatform(file, requestedPlatform);
  const matched = await findGameAdapter(metadata);

  return {
    metadata,
    adapterStatus: matched.metadata?.status ?? "unsupported",
    adapter: matched.metadata,
    issues: [
      ...fileIssues,
      ...(matched.adapter
        ? adapterCapabilityIssues(matched.metadata)
        : [
            {
              level: "error" as const,
              code: "no-game-adapter",
              message: "No exact title/revision Game Adapter matched. Extraction, injection and build are blocked."
            }
          ])
    ]
  };
}

function adapterCapabilityIssues(adapter: Awaited<ReturnType<typeof findGameAdapter>>["metadata"]) {
  if (!adapter) return [];
  const missing = Object.entries(adapter.capabilities)
    .filter(([, enabled]) => !enabled)
    .map(([capability]) => capability);

  if (missing.length === 0) return [{level:"info" as const,code:"dialogue-build-supported",message:adapter.notes[1]}];

  return [
    {
      level: "warning" as const,
      code: "adapter-build-not-ready",
      message: `Exact adapter matched (${adapter.name}). Extraction/review can continue, but build/export is disabled until these capabilities are implemented: ${missing.join(", ")}.`
    }
  ];
}
