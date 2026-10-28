import type { GameAdapter } from "../../contracts.ts";
import { buildYgoRom, digest, extractYgoCardTexts, validateYgoTranslation, createYgoAtlas, encodeYgoText, isNameList } from "../../platforms/gba/ygo-wct-thai.ts";
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

export const yugiohWctChecksum = "6e9aa7a7f8273af3257cb26975d9a15c36729e039d239f245b7af64256b9d98f";
const idPrefix = "ygo-desc-";

export const yugiohWctMetadata: GameAdapterMetadata = {
  id: "gba-yugioh-wct-2004-bywp-v0",
  name: "Yu-Gi-Oh! World Championship Tournament 2004 (Europe)",
  platform: "gba",
  status: "experimental",
  gameId: "BYWP",
  region: "Europe",
  revision: "v0",
  checksum: yugiohWctChecksum,
  supportedTargets: ["thai"],
  capabilities: {
    extraction: true,
    fontAnalysis: true,
    thaiBuild: true,
    englishBuild: false,
    safeInjection: true,
    rebuild: true,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Extraction reads the English card descriptions (lists of fusion-material card names are skipped). Card names, menus and duel messages are not translated yet.",
    "Rebuild writes Thai text to the free end of the ROM, repoints the English column of the description table, replaces unused Latin-1 glyphs of the 16 px font and switches the description printer to that font. Not verified in an emulator."
  ]
};

const cardOf = (id: string) => Number(id.slice(idPrefix.length));

function sourceMap(bytes: Uint8Array) {
  return new Map(extractYgoCardTexts(bytes).map((card) => [`${idPrefix}${String(card.card).padStart(4, "0")}`, card]));
}

export const yugiohWctAdapter: GameAdapter = {
  id: yugiohWctMetadata.id,
  platform: "gba",

  async matches(metadata: PlatformMetadata): Promise<boolean> {
    return metadata.platform === "gba" && metadata.title === "YWCT2004EUR" && metadata.gameId === "BYWP" && metadata.revision === "v0" && metadata.checksum === yugiohWctChecksum;
  },

  async extract(context: GameContext): Promise<ExtractionResult> {
    let entries: TranslationEntry[];
    try {
      entries = [...sourceMap(context.file.bytes)].filter(([, card]) => !isNameList(card.english)).map(([id, card]): TranslationEntry => ({
        id,
        sourceText: card.english,
        translatedText: "",
        sourceLanguage: "english",
        targetLanguage: "thai",
        category: "description",
        context: `Card ${card.card}: ${card.name}`,
        resource: { path: "card-descriptions", offset: card.descriptionOffset, index: card.card },
        constraints: { fixedLength: false, maxBytes: 900 },
        protectedTokens: card.english.match(/@\d|%[sd]/g) ?? [],
        status: "untranslated",
        warnings: []
      }));
    } catch (error) {
      return { entries: [], issues: [{ level: "error", code: "ygo-no-table", message: error instanceof Error ? error.message : "Card text tables could not be read." }] };
    }
    return { entries, issues: [{ level: "info", code: "ygo-card-descriptions", message: `Read ${entries.length.toLocaleString()} card descriptions from the game's text tables.` }] };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: true,
      canRenderEnglish: true,
      notes: ["Thai clusters use single-byte codes 0x80-0xFF (127 slots) in the fixed-width 16 px font; rare clusters lose tone marks."],
      blockers: []
    };
  },

  async prepareTargetLanguage(_context: unknown, language: TargetLanguage): Promise<LanguagePreparationResult> {
    return language === "thai"
      ? { ok: true, issues: [] }
      : { ok: false, issues: [{ level: "error", code: "ygo-target-unsupported", message: "Only Thai is supported for this game." }] };
  },

  async validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const sources = context?.file?.bytes ? sourceMap(context.file.bytes) : undefined;
    const atlas = createYgoAtlas(entries.map((entry) => entry.translatedText));
    for (const entry of entries) {
      try {
        validateYgoTranslation(entry.sourceText, entry.translatedText);
        if (sources) {
          const source = sources.get(entry.id);
          if (!source || source.english !== entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
          encodeYgoText(entry.translatedText, atlas);
        }
      } catch (error) {
        issues.push({ level: "error", code: "translation-validation", entryId: entry.id, message: error instanceof Error ? error.message : "Invalid translation" });
      }
    }
    return { ok: issues.length === 0, issues };
  },

  async inject(context: GameContext, entries: TranslationEntry[]): Promise<InjectionResult> {
    try {
      const translations = new Map(entries.filter((entry) => entry.translatedText).map((entry) => [cardOf(entry.id), entry.translatedText]));
      context.outputBytes = buildYgoRom(context.file.bytes, translations).bytes;
      return { ok: true, issues: [] };
    } catch (error) {
      return { ok: false, issues: [{ level: "error", code: "ygo-injection-failed", message: error instanceof Error ? error.message : "Yu-Gi-Oh! injection failed" }] };
    }
  },

  async rebuild(context: GameContext): Promise<BuildResult> {
    if (!context.outputBytes) return { ok: false, issues: [{ level: "error", code: "ygo-rebuild-missing", message: "No injected ROM is available." }] };
    return { ok: true, issues: [], outputBytes: context.outputBytes, checksum: digest(context.outputBytes) };
  },

  async validateBuild(context: GameContext): Promise<BuildValidation> {
    const output = context.outputBytes;
    if (!output) return { ok: false, issues: [{ level: "error", code: "ygo-build-missing", message: "No rebuilt ROM is available." }] };
    if (output.length !== context.file.bytes.length) return { ok: false, issues: [{ level: "error", code: "ygo-size-changed", message: "Output ROM size changed unexpectedly." }] };
    if (!Buffer.from(output.subarray(0, 0xc0)).equals(Buffer.from(context.file.bytes.subarray(0, 0xc0)))) {
      return { ok: false, issues: [{ level: "error", code: "ygo-header-changed", message: "Output ROM header changed unexpectedly." }] };
    }
    return { ok: true, issues: [] };
  }
};
