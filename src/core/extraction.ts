import { findGameAdapter } from "./adapters/registry.ts";
import { detectPlatform } from "./platforms/index.ts";
import { validateGameFile } from "./security/file-safety.ts";
import type { ExtractionResult, GameContext, GameFile, TranslationEntry, ValidationIssue } from "./types.ts";

export interface ExtractGameTextOptions {
  preserveNames?: boolean;
}

export async function extractGameText(
  file: GameFile,
  requestedPlatform = "auto",
  options: ExtractGameTextOptions = {}
): Promise<ExtractionResult> {
  const fileIssues = validateGameFile(file);
  if (fileIssues.some((issue) => issue.level === "error")) {
    return { entries: [], issues: fileIssues };
  }

  const metadata = await detectPlatform(file, requestedPlatform);
  const matched = await findGameAdapter(metadata);

  if (!matched.adapter) {
    return {
      entries: [],
      issues: [
        {
          level: "error",
          code: "no-game-adapter",
          message: "No exact title/revision Game Adapter matched. Extraction is blocked."
        }
      ]
    };
  }

  const context: GameContext = {
    file,
    metadata,
    adapterId: matched.adapter.id
  };

  const extraction = await matched.adapter.extract(context);
  const capabilityIssues: ValidationIssue[] = matched.metadata?.capabilities.extraction
    ? []
    : [
        {
          level: "error",
          code: "adapter-extraction-not-ready",
          message: "The matched adapter does not declare extraction support."
        }
      ];

  return {
    entries: options.preserveNames ?? true ? preserveNameEntries(extraction.entries) : extraction.entries,
    issues: [...capabilityIssues, ...extraction.issues]
  };
}

function preserveNameEntries(entries: TranslationEntry[]): TranslationEntry[] {
  return entries.map((entry) => {
    if (entry.category !== "name") return entry;

    return {
      ...entry,
      translatedText: entry.sourceText,
      status: "reviewed",
      warnings: Array.from(new Set([...entry.warnings, "Name preserved; excluded from translation by project setting."]))
    };
  });
}
