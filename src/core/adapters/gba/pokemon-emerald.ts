import type { GameAdapter } from "../../contracts.ts";
import { protectedPokemonNames, extractPointerTextCandidates } from "../../platforms/gba/pokemon-gen3-resources.ts";
import { validateTranslation } from "../../platforms/gba/firered-rom.ts";
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

const exportBlocked: ValidationIssue = {
  level: "error",
  code: "emerald-export-not-ready",
  message:
    "Pokemon Emerald extraction is available, but safe injection/rebuild is blocked until an Emerald-specific relocation manifest and font patch are verified."
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
    fontAnalysis: false,
    thaiBuild: false,
    englishBuild: false,
    safeInjection: false,
    rebuild: false,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Extraction uses Pokemon Gen 3 text decoding plus pointer references to create high-confidence dialogue/description candidates.",
    "Build/export remains disabled until Emerald-specific text relocation, font patching and emulator validation are implemented.",
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
        ? [{ level: "warning", code: "emerald-experimental-extraction", message: "Emerald candidate extraction is available for review/translation, but export is blocked." }]
        : [{ level: "error", code: "emerald-no-candidates", message: "No high-confidence Emerald text candidates were found." }]
    };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: false,
      canRenderEnglish: true,
      notes: ["Emerald font patching has not been mapped yet."],
      blockers: ["Needs Emerald-specific font banks, widths and tile hashes."]
    };
  },

  async prepareTargetLanguage(_context: GameContext, _language: TargetLanguage): Promise<LanguagePreparationResult> {
    return { ok: false, issues: [exportBlocked] };
  },

  async validateTranslations(_context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    for (const entry of entries) {
      try { validateTranslation(entry.sourceText, entry.translatedText); }
      catch (error) { issues.push({ level: "error", code: "translation-validation", entryId: entry.id, message: error instanceof Error ? error.message : "Invalid translation" }); }
    }
    return { ok: issues.length === 0, issues };
  },

  async inject(): Promise<InjectionResult> {
    return { ok: false, issues: [exportBlocked] };
  },

  async rebuild(): Promise<BuildResult> {
    return { ok: false, issues: [exportBlocked] };
  },

  async validateBuild(): Promise<BuildValidation> {
    return { ok: false, issues: [exportBlocked] };
  }
};

export function emeraldProtectedNames(bytes: Uint8Array): string[] {
  return protectedPokemonNames(bytes, ["BIRCH", "ROXANNE", "BRAWLY", "WATTSON", "FLANNERY", "NORMAN", "WINONA", "TATE", "LIZA", "JUAN", "SIDNEY", "PHOEBE", "GLACIA", "DRAKE", "WALLACE"]);
}
