import type { GameAdapter } from "../../contracts.ts";
import { decodePokemonText, readGbaPointer } from "../../platforms/gba/pokemon-gen3-text.ts";
import { extractDialogs, verifyRom, digest } from "../../platforms/gba/firered-rom.ts";
import { buildTranslatedRom } from "../../platforms/gba/thai-font.ts";
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

export const pokemonFireRedRev1Checksum = "729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059";

const pendingIssue: ValidationIssue = {
  level: "error",
  code: "adapter-implementation-pending",
  message:
    "No supported dialogue resources were found in this ROM."
};

export const pokemonFireRedRev1Metadata: GameAdapterMetadata = {
  id: "gba-pokemon-firered-bpre-rev1",
  name: "Pokemon FireRed Version (USA/Europe) Rev 1",
  platform: "gba",
  status: "supported",
  gameId: "BPRE",
  region: "USA/Europe",
  revision: "v1",
  checksum: pokemonFireRedRev1Checksum,
  supportedTargets: ["thai", "english"],
  capabilities: {
    extraction: true,
    fontAnalysis: true,
    thaiBuild: true,
    englishBuild: true,
    safeInjection: true,
    rebuild: true,
    emulatorVerified: true
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Build supports manifest-matched map/story dialogue and the opening scene. Names, battle UI, menus and help screens remain original.",
    "Thai composed glyphs and relocated dialogue were smoke-tested in mGBA 0.10.5 through the opening scene. Full-game playthrough is not verified.",
    "No ROM bytes are bundled in this project."
  ]
};

export const pokemonFireRedRev1Adapter: GameAdapter = {
  id: pokemonFireRedRev1Metadata.id,
  platform: "gba",

  async matches(metadata: PlatformMetadata): Promise<boolean> {
    return (
      metadata.platform === "gba" &&
      metadata.title === "POKEMON FIRE" &&
      metadata.gameId === "BPRE" &&
      metadata.revision === "v1" &&
      metadata.checksum === pokemonFireRedRev1Checksum
    );
  },

  async extract(context: GameContext): Promise<ExtractionResult> {
    const issues: ValidationIssue[] = [];
    const entries = [
      ...extractDialogs(context.file.bytes),
      ...extractFixedWidthTable(context, {
        id: "pokemon-names",
        label: "Pokemon names",
        pointerOffset: 0x144,
        count: 412,
        width: 11,
        category: "name"
      }),
      ...extractFixedWidthTable(context, {
        id: "move-names",
        label: "Move names",
        pointerOffset: 0x148,
        count: 355,
        width: 13,
        category: "name"
      }),
      ...extractFixedWidthTable(context, {
        id: "ability-names",
        label: "Ability names",
        pointerOffset: 0x1c0,
        count: 78,
        width: 13,
        category: "name"
      }),
      ...extractFixedWidthTable(context, {
        id: "type-names",
        label: "Type names",
        pointerOffset: 0x309dc,
        count: 18,
        width: 7,
        category: "name"
      }),
      ...extractFixedWidthTable(context, {
        id: "item-names",
        label: "Item names",
        pointerOffset: 0x1c8,
        count: 374,
        width: 44,
        textLength: 13,
        category: "name"
      })
    ];

    if (entries.length === 0) issues.push(pendingIssue);
    return { entries, issues };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: true,
      canRenderEnglish: true,
      notes: [
        "The original western FireRed font can render the extracted English character set.",
        "Build rasterizes shaped Thai clusters into unused extended Latin glyph slots. Up to 768 unique clusters per build."
      ],
      blockers: []
    };
  },

  async prepareTargetLanguage(context: GameContext, _language: TargetLanguage): Promise<LanguagePreparationResult> {
    try { verifyRom(context.file.bytes); return {ok:true,issues:[]}; }
    catch(error) { return buildFailure(error); }
  },

  async validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    try { buildTranslatedRom(context.file.bytes,entries); return {ok:true,issues:[]}; }
    catch(error) { return buildFailure(error); }
  },

  async inject(context: GameContext, entries: TranslationEntry[]): Promise<InjectionResult> {
    try { context.outputBytes=buildTranslatedRom(context.file.bytes,entries).bytes; return {ok:true,issues:[]}; }
    catch(error) { return buildFailure(error); }
  },

  async rebuild(context: GameContext): Promise<BuildResult> {
    if(!context.outputBytes) return buildFailure(new Error("No injected ROM is available."));
    return {ok:true,issues:[],outputBytes:context.outputBytes,checksum:digest(context.outputBytes)};
  },

  async validateBuild(context: GameContext): Promise<BuildValidation> {
    if(!context.outputBytes || context.outputBytes.length>0x2000000 || !Buffer.from(context.outputBytes.subarray(0,0xc0)).equals(Buffer.from(context.file.bytes.subarray(0,0xc0)))) return buildFailure(new Error("Output ROM header or size is invalid."));
    return {ok:true,issues:[]};
  }
};

function buildFailure(error:unknown): ValidationResult {
  return {ok:false,issues:[{level:"error",code:"rom-validation",message:error instanceof Error?error.message:"ROM validation failed"}]};
}

function extractFixedWidthTable(
  context: GameContext,
  config: {
    id: string;
    label: string;
    pointerOffset: number;
    count: number;
    width: number;
    textLength?: number;
    category: TranslationEntry["category"];
  }
): TranslationEntry[] {
  const baseOffset = readGbaPointer(context.file.bytes, config.pointerOffset);
  if (baseOffset === undefined) return [];

  const entries: TranslationEntry[] = [];
  const textLength = config.textLength ?? config.width;

  for (let index = 0; index < config.count; index += 1) {
    const offset = baseOffset + index * config.width;
    if (offset + textLength > context.file.bytes.byteLength) break;

    const decoded = decodePokemonText(context.file.bytes, offset, textLength);
    if (!decoded.text) continue;

    entries.push({
      id: `${config.id}-${index}`,
      sourceText: decoded.text,
      translatedText: "",
      sourceLanguage: "english",
      targetLanguage: "thai",
      category: config.category,
      context: `${config.label} #${index}`,
      resource: {
        offset,
        pointer: 0x08000000 + offset,
        index
      },
      constraints: {
        maxBytes: textLength,
        fixedLength: true
      },
      protectedTokens: decoded.protectedTokens,
      status: decoded.unknownBytes.length ? "warning" : "untranslated",
      warnings: decoded.unknownBytes.length
        ? [`Contains undecoded bytes: ${decoded.unknownBytes.map((byte) => `0x${byte.toString(16).toUpperCase()}`).join(", ")}`]
        : []
    });
  }

  return entries;
}
