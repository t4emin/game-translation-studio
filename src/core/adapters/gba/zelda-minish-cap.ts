import type { GameAdapter } from "../../contracts.ts";
import type {
  BuildResult,
  BuildValidation,
  ExtractionResult,
  FontAnalysis,
  GameAdapterMetadata,
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
    "The Minish Cap is recognized exactly, but its script encoding, pointer tables, font banks and safe relocation path are not mapped yet."
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
    extraction: false,
    fontAnalysis: false,
    thaiBuild: false,
    englishBuild: false,
    safeInjection: false,
    rebuild: false,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Header title/game code are GBAZELDA MC / BZME. The current generic scan finds resource labels and binary-like data, not a safe script table.",
    "Extraction and export remain blocked until the Minish Cap script format, pointer references, font assets and rebuild checks are mapped.",
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

  async extract(): Promise<ExtractionResult> {
    return { entries: [], issues: [unsupportedIssue] };
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
