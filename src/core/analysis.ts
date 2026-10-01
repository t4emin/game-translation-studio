import { findGameAdapter } from "./adapters/registry.ts";
import { detectPlatform } from "./platforms/index.ts";
import { scanGbaResources } from "./platforms/gba/generic-scanner.ts";
import { scanPs2Iso } from "./platforms/ps2/iso9660.ts";
import { validateGameFile } from "./security/file-safety.ts";
import type { AnalysisReport, CapabilityReport, GameAdapterMetadata, GameContext, GameFile, GbaGenericScan, TextPreviewEntry } from "./types.ts";

export async function analyzeGame(file: GameFile, requestedPlatform = "auto"): Promise<AnalysisReport> {
  const fileIssues = validateGameFile(file);
  const metadata = await detectPlatform(file, requestedPlatform);
  const matched = await findGameAdapter(metadata);
  const capabilities = capabilityReport(matched.metadata);
  const genericScan = metadata.platform === "gba" ? scanGbaResources(file.bytes) : undefined;
  const textPreview = metadata.platform === "gba" ? await gbaTextPreview(file, metadata, matched.adapter, genericScan) : undefined;
  const compatibility = matched.metadata
    ? Object.values(matched.metadata.capabilities).every(Boolean) ? "full" : "experimental"
    : metadata.platform === "gba" || metadata.platform === "ps2" ? "experimental" : "unsupported";

  return {
    metadata,
    adapterStatus: matched.metadata?.status ?? "unsupported",
    adapter: matched.metadata,
    compatibility,
    capabilities,
    genericScan,
    textPreview,
    isoScan: metadata.platform === "ps2" ? scanPs2Iso(file.bytes) : undefined,
    issues: [
      ...fileIssues,
      ...(matched.adapter
        ? adapterCapabilityIssues(matched.metadata)
        : [
            {
              level: metadata.platform === "unknown" ? "error" as const : "info" as const,
              code: "no-game-adapter",
              message: metadata.platform === "ps2"
                ? "PS2 ISO Explorer is active. Files and string candidates are shown below; translation/export need a file rule or game adapter."
                : metadata.platform === "gba"
                  ? "No exact title/revision adapter matched. Generic analysis is available; export needs a game adapter."
                  : "No exact title/revision Game Adapter matched."
            }
          ])
    ]
  };
}

async function gbaTextPreview(
  file: GameFile,
  metadata: GameContext["metadata"],
  adapter: Awaited<ReturnType<typeof findGameAdapter>>["adapter"],
  genericScan: GbaGenericScan | undefined
): Promise<AnalysisReport["textPreview"]> {
  if (adapter) {
    const extraction = await adapter.extract({ file, metadata, adapterId: adapter.id });
    const entries: TextPreviewEntry[] = extraction.entries
      .filter((entry) => entry.category !== "name")
      .map((entry) => ({
        id: entry.id,
        sourceText: entry.sourceText,
        category: entry.category,
        context: entry.context,
        offset: entry.resource.offset,
        length: entry.constraints.maxBytes
      }));
    if (entries.length) return { source: "adapter", total: entries.length, entries };
  }
  if (!genericScan) return undefined;
  const entries: TextPreviewEntry[] = [
    ...genericScan.ascii.examples.map((entry) => ({ id: `ascii-${entry.offset.toString(16)}`, sourceText: entry.text, category: "candidate" as const, offset: entry.offset, length: entry.length, confidence: entry.confidence })),
    ...genericScan.shiftJis.examples.map((entry) => ({ id: `shift-jis-${entry.offset.toString(16)}`, sourceText: entry.text, category: "candidate" as const, offset: entry.offset, length: entry.length, confidence: entry.confidence }))
  ];
  return { source: "generic", total: genericScan.ascii.count + genericScan.shiftJis.count, entries };
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
      message: adapter.capabilities.extraction
        ? `Exact adapter matched (${adapter.name}). Extraction/review can continue, but build/export is disabled until these capabilities are implemented: ${missing.join(", ")}.`
        : `Exact adapter matched (${adapter.name}), but extraction/build/export are disabled until these capabilities are implemented: ${missing.join(", ")}.`
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
