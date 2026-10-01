import type { GameAdapter } from "../../contracts.ts";
import { scanGbaResources } from "../../platforms/gba/generic-scanner.ts";
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

const unsupportedIssue: ValidationIssue = {
  level: "error",
  code: "minish-cap-adapter-not-mapped",
  message:
    "The Minish Cap pack/export path is not implemented yet."
};

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
    fontAnalysis: false,
    thaiBuild: false,
    englishBuild: false,
    safeInjection: false,
    rebuild: false,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Header title/game code are GBAZELDA MC / BZME. Extraction surfaces ranked ASCII dialog/text candidates for review.",
    "Export needs a Minish Cap packer and text writer before rebuilt ROM output is available.",
    "No ROM bytes are bundled in this project."
  ]
};

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
    const candidates = scanGbaResources(context.file.bytes).ascii.examples
      .filter((entry) => entry.text.length >= 12)
      .slice(0, 600)
      .map((entry, index): TranslationEntry => ({
        id: `minish-ascii-${entry.offset.toString(16)}`,
        sourceText: entry.text,
        translatedText: "",
        sourceLanguage: "english",
        targetLanguage: "thai",
        category: "dialog",
        context: `ASCII text candidate #${index + 1}`,
        resource: { offset: entry.offset, index },
        constraints: { maxBytes: entry.length, fixedLength: true },
        protectedTokens: [],
        status: "untranslated",
        warnings: [`Candidate confidence ${Math.round(entry.confidence * 100)}%; writer/export is not implemented yet.`]
      }));
    return {
      entries: candidates,
      issues: candidates.length
        ? [{ level: "info", code: "minish-cap-candidate-extraction", message: "Minish Cap text candidates were extracted for review." }]
        : [{ level: "warning", code: "minish-cap-no-candidates", message: "No Minish Cap text candidates were found." }]
    };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: false,
      canRenderEnglish: false,
      notes: [],
      blockers: ["Needs Minish Cap font mapping."]
    };
  },

  async prepareTargetLanguage(_context: unknown, _language: TargetLanguage): Promise<LanguagePreparationResult> {
    return { ok: false, issues: [unsupportedIssue] };
  },

  async validateTranslations(_context: unknown, _entries: TranslationEntry[]): Promise<ValidationResult> {
    return { ok: false, issues: [unsupportedIssue] };
  },

  async inject(): Promise<InjectionResult> {
    return { ok: false, issues: [unsupportedIssue] };
  },

  async rebuild(): Promise<BuildResult> {
    return { ok: false, issues: [unsupportedIssue] };
  },

  async validateBuild(): Promise<BuildValidation> {
    return { ok: false, issues: [unsupportedIssue] };
  }
};
