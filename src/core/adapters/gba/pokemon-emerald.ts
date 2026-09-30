import type { GameAdapter } from "../../contracts.ts";
import { digest, protectedPokemonNames, extractPointerTextCandidates } from "../../platforms/gba/pokemon-gen3-resources.ts";
import { latinByte, tokenBytes, validateTranslation } from "../../platforms/gba/firered-rom.ts";
import type {
  BuildResult,
  BuildValidation,
  ExtractionResult,
  FontAnalysis,
  GameAdapterMetadata,
  GameContext,
  InjectionResult,
  LanguagePreparationResult,
  PlatformMetadata,
  TargetLanguage,
  TranslationEntry,
  ValidationIssue,
  ValidationResult
} from "../../types.ts";

export const pokemonEmeraldChecksum = "a9dec84dfe7f62ab2220bafaef7479da0929d066ece16a6885f6226db19085af";

const thaiExportBlocked: ValidationIssue = {
  level: "error",
  code: "emerald-thai-font-not-ready",
  message:
    "Pokemon Emerald safe injection/rebuild is available for Gen 3 encoded English text, but Thai export is blocked until an Emerald-specific font patch is verified."
};

export const pokemonEmeraldMetadata: GameAdapterMetadata = {
  id: "gba-pokemon-emerald-bpee-v0",
  name: "Pokemon Emerald Version (USA/Europe)",
  platform: "gba",
  status: "experimental",
  gameId: "BPEE",
  region: "USA/Europe",
  revision: "v0",
  checksum: pokemonEmeraldChecksum,
  supportedTargets: ["thai", "english"],
  capabilities: {
    extraction: true,
    fontAnalysis: true,
    thaiBuild: false,
    englishBuild: true,
    safeInjection: true,
    rebuild: true,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Extraction uses Pokemon Gen 3 text decoding plus pointer references to create high-confidence dialogue/description candidates.",
    "English rebuild relocates extracted pointer text candidates and patches verified pointer references. Thai export remains disabled until Emerald-specific font patching is implemented.",
    "No ROM bytes are bundled in this project."
  ]
};

export const pokemonEmeraldAdapter: GameAdapter = {
  id: pokemonEmeraldMetadata.id,
  platform: "gba",

  async matches(metadata: PlatformMetadata): Promise<boolean> {
    return (
      metadata.platform === "gba" &&
      metadata.title === "POKEMON EMER" &&
      metadata.gameId === "BPEE" &&
      metadata.revision === "v0" &&
      metadata.checksum === pokemonEmeraldChecksum
    );
  },

  async extract(context: GameContext): Promise<ExtractionResult> {
    const entries = extractPointerTextCandidates(context.file.bytes, { adapterId: "emerald", limit: 600 });
    return {
      entries,
      issues: entries.length
        ? [{ level: "warning", code: "emerald-experimental-extraction", message: "Emerald candidate extraction is available. English export can rebuild these candidates; Thai export is still blocked until font patching is mapped." }]
        : [{ level: "error", code: "emerald-no-candidates", message: "No high-confidence Emerald text candidates were found." }]
    };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: false,
      canRenderEnglish: true,
      notes: ["Emerald can rebuild Gen 3 encoded English text candidates."],
      blockers: ["Needs Emerald-specific font banks, widths and tile hashes."]
    };
  },

  async prepareTargetLanguage(_context: GameContext, language: TargetLanguage): Promise<LanguagePreparationResult> {
    return language === "english" ? { ok: true, issues: [] } : { ok: false, issues: [thaiExportBlocked] };
  },

  async validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const sources = candidateMap(context.file.bytes);
    for (const entry of entries) {
      try {
        validateTranslation(entry.sourceText, entry.translatedText);
        if (entry.translatedText) encodeEmeraldText(entry.translatedText);
        const source = sources.get(entry.id);
        if (!source || source.sourceText !== entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
      }
      catch (error) { issues.push({ level: "error", code: "translation-validation", entryId: entry.id, message: error instanceof Error ? error.message : "Invalid translation" }); }
    }
    return { ok: issues.length === 0, issues };
  },

  async inject(context: GameContext, entries: TranslationEntry[]): Promise<InjectionResult> {
    try {
      context.outputBytes = buildEmeraldRom(context.file.bytes, entries);
      return { ok: true, issues: [], outputPath: undefined };
    } catch (error) {
      return { ok: false, issues: [{ level: "error", code: "emerald-injection-failed", message: error instanceof Error ? error.message : "Emerald injection failed" }] };
    }
  },

  async rebuild(context: GameContext): Promise<BuildResult> {
    if (!context.outputBytes) return { ok: false, issues: [{ level: "error", code: "emerald-rebuild-missing", message: "No injected Emerald ROM is available." }] };
    return { ok: true, issues: [], outputBytes: context.outputBytes, checksum: digest(context.outputBytes) };
  },

  async validateBuild(context: GameContext): Promise<BuildValidation> {
    if (!context.outputBytes) return { ok: false, issues: [{ level: "error", code: "emerald-build-missing", message: "No rebuilt Emerald ROM is available." }] };
    if (context.outputBytes.length > 0x2000000) return { ok: false, issues: [{ level: "error", code: "emerald-build-too-large", message: "Output ROM exceeds the GBA 32 MiB limit." }] };
    if (!Buffer.from(context.outputBytes.subarray(0, 0xc0)).equals(Buffer.from(context.file.bytes.subarray(0, 0xc0)))) {
      return { ok: false, issues: [{ level: "error", code: "emerald-header-changed", message: "Output ROM header changed unexpectedly." }] };
    }
    return { ok: true, issues: [] };
  }
};

export function emeraldProtectedNames(bytes: Uint8Array): string[] {
  return protectedPokemonNames(bytes, ["BIRCH", "ROXANNE", "BRAWLY", "WATTSON", "FLANNERY", "NORMAN", "WINONA", "TATE", "LIZA", "JUAN", "SIDNEY", "PHOEBE", "GLACIA", "DRAKE", "WALLACE"]);
}

function candidateMap(bytes: Uint8Array): Map<string, TranslationEntry> {
  return new Map(extractPointerTextCandidates(bytes, { adapterId: "emerald", limit: 600 }).map((entry) => [entry.id, entry]));
}

function encodeEmeraldText(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const part of text.split(/(\[[^\]]+\])/g).filter(Boolean)) {
    if (part.startsWith("[")) {
      bytes.push(...tokenBytes(part));
      continue;
    }
    for (const char of part) bytes.push(latinByte(char));
  }
  bytes.push(0xff);
  if (bytes.length > 900) throw new Error(`Translated message is ${bytes.length} bytes; shorten it to fit the 900-byte message limit.`);
  return Uint8Array.from(bytes);
}

function buildEmeraldRom(original: Uint8Array, entries: TranslationEntry[]): Buffer {
  if (digest(original) !== pokemonEmeraldChecksum) throw new Error("This file is not the registered Pokemon Emerald USA/Europe ROM.");
  const translated = entries.filter((entry) => entry.translatedText && entry.translatedText !== entry.sourceText);
  if (!translated.length) return Buffer.from(original);
  const sources = candidateMap(original);
  const encoded = translated.map((entry) => {
    const source = sources.get(entry.id);
    if (!source || source.sourceText !== entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
    validateTranslation(source.sourceText, entry.translatedText);
    return { source, bytes: encodeEmeraldText(entry.translatedText) };
  });
  const total = encoded.reduce((sum, item) => sum + item.bytes.length + 3, 0);
  if (original.length + total > 0x2000000) throw new Error("Translated ROM exceeds the GBA 32 MiB limit.");
  const output = Buffer.alloc(Math.ceil((original.length + total) / 0x100000) * 0x100000, 0xff);
  output.set(original);
  let cursor = original.length;
  const seen = new Set<string>();
  for (const item of encoded) {
    if (seen.has(item.source.id)) throw new Error(`Duplicate entry ${item.source.id}`);
    seen.add(item.source.id);
    cursor = (cursor + 3) & ~3;
    output.set(item.bytes, cursor);
    for (const reference of item.source.resource.references ?? []) {
      if (Buffer.from(original.buffer, original.byteOffset, original.byteLength).readUInt32LE(reference) !== item.source.resource.pointer) {
        throw new Error(`Original text pointer mismatch at 0x${reference.toString(16).toUpperCase()}`);
      }
      output.writeUInt32LE(0x08000000 + cursor, reference);
    }
    cursor += item.bytes.length;
  }
  return output;
}
