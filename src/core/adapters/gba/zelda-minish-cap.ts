import type { GameAdapter } from "../../contracts.ts";
import { buildMinishRom, createMinishAtlas, digest, encodeMessage, extractMinishEntries, validateMinishTranslation } from "../../platforms/gba/minish-cap-rom.ts";
import { validateProtectedNames } from "../../platforms/gba/pokemon-gen3-resources.ts";
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

export const zeldaMinishCapChecksum = "bedc74df62755f705398273de8ed3bc59be610cf55760d0b9aa277f1f5035e73";

// Character and place names stay in English, as in the Pokemon adapters.
const protectedNames = ["Zelda", "Ezlo", "Vaati", "Hyrule", "Link"];

export const zeldaMinishCapMetadata: GameAdapterMetadata = {
  id: "gba-zelda-minish-cap-bzme-v0",
  name: "The Legend of Zelda: The Minish Cap (USA)",
  platform: "gba",
  status: "experimental",
  gameId: "BZME",
  region: "USA",
  revision: "v0",
  checksum: zeldaMinishCapChecksum,
  supportedTargets: ["thai", "english"],
  capabilities: {
    extraction: true,
    fontAnalysis: true,
    thaiBuild: true,
    englishBuild: true,
    safeInjection: true,
    rebuild: true,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Extraction reads the game's own message table (80 groups, 3,699 messages); NPC names and staff credits are skipped.",
    "Rebuild writes a new message table and Thai glyph banks into the free end of the ROM and repoints the language and font tables. No game code is patched.",
    "Not yet verified in an emulator. No ROM bytes are bundled in this project."
  ]
};

function sourceMap(bytes: Uint8Array) {
  return new Map(extractMinishEntries(bytes).map((entry) => [entry.id, entry]));
}

export const zeldaMinishCapAdapter: GameAdapter = {
  id: zeldaMinishCapMetadata.id,
  platform: "gba",

  async matches(metadata: PlatformMetadata): Promise<boolean> {
    return (
      metadata.platform === "gba" &&
      metadata.title === "GBAZELDA MC" &&
      metadata.gameId === "BZME" &&
      metadata.revision === "v0" &&
      metadata.checksum === zeldaMinishCapChecksum
    );
  },

  async extract(context: GameContext): Promise<ExtractionResult> {
    let found: ReturnType<typeof extractMinishEntries>;
    try {
      found = extractMinishEntries(context.file.bytes);
    } catch (error) {
      return { entries: [], issues: [{ level: "error", code: "minish-cap-no-table", message: error instanceof Error ? error.message : "Minish Cap message table could not be read." }] };
    }
    const entries = found.map((entry): TranslationEntry => ({
      id: entry.id,
      sourceText: entry.text,
      translatedText: "",
      sourceLanguage: "english",
      targetLanguage: "thai",
      category: entry.category,
      context: `Text group ${entry.group} #${entry.index}`,
      resource: { path: `group-${entry.group}`, offset: entry.offset, index: entry.index },
      constraints: { fixedLength: false },
      protectedTokens: entry.text.match(/\[[^\]]+\]/g) ?? [],
      status: "untranslated",
      warnings: []
    }));
    return {
      entries,
      issues: [{ level: "info", code: "minish-cap-message-table", message: `Read ${entries.length.toLocaleString()} Minish Cap messages from the game's message table.` }]
    };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: true,
      canRenderEnglish: true,
      notes: ["Thai glyphs use font groups 4, 5 and 6 (768 slots), which English text never uses."],
      blockers: []
    };
  },

  async prepareTargetLanguage(_context: unknown, language: TargetLanguage): Promise<LanguagePreparationResult> {
    return language === "thai" || language === "english"
      ? { ok: true, issues: [] }
      : { ok: false, issues: [{ level: "error", code: "minish-cap-target-unsupported", message: "Unsupported Minish Cap target language." }] };
  },

  async validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const sources = context?.file?.bytes ? sourceMap(context.file.bytes) : undefined;
    let atlas: ReturnType<typeof createMinishAtlas> | undefined;
    try {
      if (context?.file?.bytes) atlas = createMinishAtlas(entries.map((entry) => entry.translatedText));
    } catch (error) {
      return { ok: false, issues: [{ level: "error", code: "minish-cap-font-validation", message: error instanceof Error ? error.message : "Minish Cap font validation failed" }] };
    }
    for (const entry of entries) {
      try {
        if (!entry.translatedText.trim()) throw new Error("Empty translation");
        validateMinishTranslation(entry.sourceText, entry.translatedText);
        validateProtectedNames(entry.sourceText, entry.translatedText, protectedNames);
        if (sources && atlas) {
          const source = sources.get(entry.id);
          if (!source || source.text !== entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
          encodeMessage(entry.translatedText, context.file.bytes, atlas);
        }
      } catch (error) {
        issues.push({ level: "error", code: "translation-validation", entryId: entry.id, message: error instanceof Error ? error.message : "Invalid translation" });
      }
    }
    return { ok: issues.length === 0, issues };
  },

  async inject(context: GameContext, entries: TranslationEntry[]): Promise<InjectionResult> {
    try {
      const translations = new Map(entries.filter((entry) => entry.translatedText).map((entry) => [entry.id, entry.translatedText]));
      context.outputBytes = buildMinishRom(context.file.bytes, translations).bytes;
      return { ok: true, issues: [] };
    } catch (error) {
      return { ok: false, issues: [{ level: "error", code: "minish-cap-injection-failed", message: error instanceof Error ? error.message : "Minish Cap injection failed" }] };
    }
  },

  async rebuild(context: GameContext): Promise<BuildResult> {
    if (!context.outputBytes) return { ok: false, issues: [{ level: "error", code: "minish-cap-rebuild-missing", message: "No injected Minish Cap ROM is available." }] };
    return { ok: true, issues: [], outputBytes: context.outputBytes, checksum: digest(context.outputBytes) };
  },

  async validateBuild(context: GameContext): Promise<BuildValidation> {
    const output = context.outputBytes;
    if (!output) return { ok: false, issues: [{ level: "error", code: "minish-cap-build-missing", message: "No rebuilt Minish Cap ROM is available." }] };
    if (output.length !== context.file.bytes.length) return { ok: false, issues: [{ level: "error", code: "minish-cap-size-changed", message: "Output ROM size changed unexpectedly." }] };
    if (!Buffer.from(output.subarray(0, 0xc0)).equals(Buffer.from(context.file.bytes.subarray(0, 0xc0)))) {
      return { ok: false, issues: [{ level: "error", code: "minish-cap-header-changed", message: "Output ROM header changed unexpectedly." }] };
    }
    return { ok: true, issues: [] };
  }
};
