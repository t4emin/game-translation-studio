import type { GameAdapter } from "../../contracts.ts";
import { digest, protectedPokemonNames, extractPointerTextCandidates, validateProtectedNames } from "../../platforms/gba/pokemon-gen3-resources.ts";
import { latinByte, tokenBytes, validateTranslation } from "../../platforms/gba/firered-rom.ts";
import { createThaiAtlasForFonts, encodeDialogWithFonts, patchThaiFontsForFonts, type GbaFontSpec } from "../../platforms/gba/thai-font.ts";
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

// Emerald prints dialogue in FONT_NORMAL (1). Fonts 7 (narrow) and 2 (short) have their own glyph banks and the same
// 0x120 range free, so they extend the Thai capacity; fonts 3-5 reuse the short bank. Slots 0x1D0-0x1DF hold game symbols.
// Glyphs sit one row lower than FireRed's because the Emerald baseline is on row 11.
// High enough to keep every pointer-referenced message the scorer accepts (about 4,450 in the USA ROM).
const emeraldCandidateLimit = 6000;
// Emerald's code ends where the map scripts begin; the script region is where text pointers sit inside bytecode.
const emeraldReferenceRegions = { codeEnd: 0x1dc000, scriptStart: 0x1dc000, scriptEnd: 0x2b0000 };

const emeraldFonts: GbaFontSpec[] = [
  { id: 1, pixels: 0x64c2e4, widths: 0x6542e4, length: 32768, hash: "9df725adb5e41ab40cde0bddc88e00f5014157aad2d8030662b934ad155f287d", slots: 176, dy: 1 },
  { id: 7, pixels: 0x63bee4, widths: 0x643ee4, length: 32768, hash: "3e1f45e425ebd58e870840e468bd4af5ef427b8dfa928dccf4909a83d39b41a9", slots: 176, dy: 1 },
  { id: 2, pixels: 0x6440e4, widths: 0x64c0e4, length: 32768, hash: "d3de13b611cdc84929a2eb1057ecc662e2cc065a78634c498e098991c9d9ad26", slots: 176, dy: 1 }
];

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
    thaiBuild: true,
    englishBuild: true,
    safeInjection: true,
    rebuild: true,
    emulatorVerified: false
  },
  notes: [
    "Exact ROM identity is recognized from GBA header and SHA-256.",
    "Extraction uses Pokemon Gen 3 text decoding plus pointer references to create high-confidence dialogue/description candidates.",
    "Rebuild relocates extracted pointer text candidates and patches verified pointer references. Thai build uses verified Emerald short font banks with precomposed glyphs.",
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
    const entries = extractPointerTextCandidates(context.file.bytes, { adapterId: "emerald", limit: emeraldCandidateLimit, regions: emeraldReferenceRegions });
    return {
      entries,
      issues: entries.length
        ? [{ level: "warning", code: "emerald-experimental-extraction", message: "Emerald candidate extraction is available. Rebuild patches verified pointer references and generated Thai glyphs into Emerald short font banks." }]
        : [{ level: "error", code: "emerald-no-candidates", message: "No high-confidence Emerald text candidates were found." }]
    };
  },

  async analyzeFont(): Promise<FontAnalysis> {
    return {
      canRenderThai: true,
      canRenderEnglish: true,
      notes: ["Emerald short font banks are mapped for generated Thai glyphs."],
      blockers: []
    };
  },

  async prepareTargetLanguage(_context: GameContext, language: TargetLanguage): Promise<LanguagePreparationResult> {
    return language === "english" || language === "thai" ? { ok: true, issues: [] } : { ok: false, issues: [{ level: "error", code: "emerald-target-unsupported", message: "Unsupported Emerald target language." }] };
  },

  async validateTranslations(context: GameContext, entries: TranslationEntry[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const sources = candidateMap(context.file.bytes);
    let atlas: ReturnType<typeof createThaiAtlasForFonts> | undefined;
    let fontRom: Uint8Array = context.file.bytes;
    try {
      atlas = createThaiAtlasForFonts(entries.map((entry) => entry.translatedText), emeraldFonts, { degrade: true });
      if (atlas.size) fontRom = patchThaiFontsForFonts(context.file.bytes, atlas, emeraldFonts);
    } catch (error) {
      return { ok: false, issues: [{ level: "error", code: "emerald-font-validation", message: error instanceof Error ? error.message : "Emerald font validation failed" }] };
    }
    const names = emeraldProtectedNames(context.file.bytes);
    for (const entry of entries) {
      try {
        validateTranslation(entry.sourceText, entry.translatedText);
        validateProtectedNames(entry.sourceText, entry.translatedText, names);
        if (entry.translatedText) encodeEmeraldText(entry.translatedText, fontRom, atlas, sources.get(entry.id));
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

const emeraldNameCache = new WeakMap<Uint8Array, string[]>();

export function emeraldProtectedNames(bytes: Uint8Array): string[] {
  let names = emeraldNameCache.get(bytes);
  if (!names) emeraldNameCache.set(bytes, names = protectedPokemonNames(bytes, ["BIRCH", "ROXANNE", "BRAWLY", "WATTSON", "FLANNERY", "NORMAN", "WINONA", "TATE", "LIZA", "JUAN", "SIDNEY", "PHOEBE", "GLACIA", "DRAKE", "WALLACE"]));
  return names;
}

// Extraction scans the whole ROM, so validating one entry at a time must not repeat it.
const candidateCache = new WeakMap<Uint8Array, Map<string, TranslationEntry>>();
function candidateMap(bytes: Uint8Array): Map<string, TranslationEntry> {
  let map = candidateCache.get(bytes);
  if (!map) candidateCache.set(bytes, map = new Map(extractPointerTextCandidates(bytes, { adapterId: "emerald", limit: emeraldCandidateLimit, regions: emeraldReferenceRegions }).map((entry) => [entry.id, entry])));
  return map;
}

// Description boxes are narrower than dialogue boxes: hold Thai lines to the widest English line and its line count.
function descriptionLayout(entry: { sourceText: string; category: string } | undefined, rom: Uint8Array) {
  if (!entry || entry.category !== "description") return undefined;
  const lines = entry.sourceText.split(/\[NEW_LINE\]|\[PROMPT_\w+\]/);
  // Battle messages with placeholders sit in the full-width battle box; the placeholder text is not part of the measured width.
  if (/\[VAR:/.test(entry.sourceText)) return { maxWidth: 204, maxLines: lines.length, varWidth: 90, scroll: false, lineFont: true };
  const widest = Math.max(...lines.map((line) => [...line.replace(/\[[^\]]+\]/g, "")].reduce((sum, char) => sum + rom[emeraldFonts[0].widths + latinByte(char)], 0)));
  return { maxWidth: widest + 6, maxLines: lines.length, scroll: false, lineFont: true };
}

function encodeEmeraldText(text: string, rom?: Uint8Array, atlas?: ReturnType<typeof createThaiAtlasForFonts>, entry?: { sourceText: string; category: string }): Uint8Array {
  if (/[\u0e00-\u0e7f]/.test(text)) {
    if (!rom || !atlas) throw new Error("Thai text requires a prepared Emerald font atlas.");
    return encodeDialogWithFonts(text, rom, atlas, emeraldFonts, descriptionLayout(entry, rom) ?? { lineFont: true });
  }
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
  const atlas = createThaiAtlasForFonts(translated.map((entry) => entry.translatedText), emeraldFonts, { degrade: true });
  const baseRom = atlas.size ? patchThaiFontsForFonts(original, atlas, emeraldFonts) : original;
  const encoded = translated.map((entry) => {
    const source = sources.get(entry.id);
    if (!source || source.sourceText !== entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
    validateTranslation(source.sourceText, entry.translatedText);
    return { source, bytes: /[\u0e00-\u0e7f]/.test(entry.translatedText) ? encodeDialogWithFonts(entry.translatedText, baseRom, atlas, emeraldFonts, descriptionLayout(source, baseRom) ?? { lineFont: true }) : encodeEmeraldText(entry.translatedText) };
  });
  const total = encoded.reduce((sum, item) => sum + item.bytes.length + 3, 0);
  if (original.length + total > 0x2000000) throw new Error("Translated ROM exceeds the GBA 32 MiB limit.");
  // A ROM that grows past 16 MiB is padded to the full 32 MiB cartridge size; emulators handle power-of-two sizes most reliably.
  const output = Buffer.alloc(original.length + total > 0x1000000 ? 0x2000000 : original.length, 0xff);
  output.set(baseRom);
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
