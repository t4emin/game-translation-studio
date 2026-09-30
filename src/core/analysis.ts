import { findGameAdapter } from "./adapters/registry.ts";
import { detectPlatform } from "./platforms/index.ts";
import { scanGbaResources } from "./platforms/gba/generic-scanner.ts";
import { validateGameFile } from "./security/file-safety.ts";
import type { AnalysisReport, CapabilityReport, GameAdapterMetadata, GameFile } from "./types.ts";

export async function analyzeGame(file: GameFile, requestedPlatform = "auto"): Promise<AnalysisReport> {
  const fileIssues = validateGameFile(file);
  const metadata = await detectPlatform(file, requestedPlatform);
  const matched = await findGameAdapter(metadata);
  const capabilities = capabilityReport(matched.metadata);
  const compatibility = matched.metadata
    ? Object.values(matched.metadata.capabilities).every(Boolean) ? "full" : "experimental"
    : metadata.platform === "gba" ? "experimental" : "unsupported";

  return {
    metadata,
    adapterStatus: matched.metadata?.status ?? "unsupported",
    adapter: matched.metadata,
    compatibility,
    capabilities,
    genericScan: metadata.platform === "gba" ? scanGbaResources(file.bytes) : undefined,
    issues: [
      ...fileIssues,
      ...(matched.adapter
        ? adapterCapabilityIssues(matched.metadata)
        : [
            {
              level: metadata.platform === "gba" ? "warning" as const : "error" as const,
              code: "no-game-adapter",
              message: metadata.platform === "gba"
                ? "No exact title/revision adapter matched. Generic analysis is available, but extraction candidates are experimental and injection/build are blocked."
                : "No exact title/revision Game Adapter matched. Extraction, injection and build are blocked."
            }
          ])
    ]
  };
}

function adapterCapabilityIssues(adapter: GameAdapterMetadata | undefined) {
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

function capabilityReport(adapter: GameAdapterMetadata | undefined): CapabilityReport {
  if (!adapter) {
    return {
      detection: "partial",
      extraction: "partial",
      translation: "manual",
      thaiFont: "unknown",
      injection: "blocked",
      rebuild: "blocked",
      validation: "partial"
    };
  }
  const fullBuild = adapter.capabilities.safeInjection && adapter.capabilities.rebuild;
  return {
    detection: "full",
    extraction: adapter.capabilities.extraction ? "full" : "none",
    translation: "available",
    thaiFont: adapter.capabilities.thaiBuild ? "full" : "unknown",
    injection: adapter.capabilities.safeInjection ? "full" : "blocked",
    rebuild: adapter.capabilities.rebuild ? "full" : "blocked",
    validation: fullBuild ? "full" : "partial"
  };
}
