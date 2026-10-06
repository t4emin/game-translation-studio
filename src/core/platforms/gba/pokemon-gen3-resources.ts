import { createHash } from "node:crypto";
import { decodePokemonText, readGbaPointer } from "./pokemon-gen3-text.ts";
import type { TranslationEntry } from "../../types.ts";

// Longest message read from the ROM. The intro speeches run past 400 bytes, and the game's own text buffer limit is about 1,000.
const maxTextBytes = 900;
export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type FixedTable = {
  pointerOffset: number;
  count: number;
  width: number;
  textLength?: number;
};

export const pokemonGen3NameTables: FixedTable[] = [
  { pointerOffset: 0x144, count: 412, width: 11 },
  { pointerOffset: 0x148, count: 355, width: 13 },
  { pointerOffset: 0x1c0, count: 78, width: 13 },
  { pointerOffset: 0x1c8, count: 377, width: 44, textLength: 13 }
];

export function protectedPokemonNames(bytes: Uint8Array, extra: string[] = []): string[] {
  const names = new Set(["POKéMON", "POKEMON", ...extra]);
  for (const table of pokemonGen3NameTables) {
    const base = readGbaPointer(bytes, table.pointerOffset);
    if (base === undefined) continue;
    const length = table.textLength ?? table.width;
    for (let index = 0; index < table.count; index += 1) {
      const decoded = decodePokemonText(bytes, base + index * table.width, length);
      if (!decoded.unknownBytes.length && /^[A-Za-zé][A-Za-zé0-9 .'-]{2,}$/.test(decoded.text)) names.add(decoded.text);
    }
  }
  return [...names];
}

const namePatterns = new WeakMap<string[], RegExp>();

// Names must stay in the source script: every protected name in the source has to appear as often in the translation.
export function missingProtectedNames(source: string, translated: string, names: string[]): string[] {
  if (!names.length) return [];
  let pattern = namePatterns.get(names);
  if (!pattern) {
    const alternatives = [...names].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    pattern = new RegExp(`(?<![A-Za-zé0-9])(?:${alternatives.join("|")})(?![A-Za-zé0-9])`, "g");
    namePatterns.set(names, pattern);
  }
  const count = (text: string) => {
    const counts = new Map<string, number>();
    for (const match of text.replace(/\[[^\]]+\]/g, " ").matchAll(pattern)) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    return counts;
  };
  const kept = count(translated);
  return [...count(source)].filter(([name, expected]) => (kept.get(name) ?? 0) < expected).map(([name]) => name);
}

export function validateProtectedNames(source: string, translated: string, names: string[]) {
  const missing = missingProtectedNames(source, translated, names);
  if (missing.length) throw new Error(`Translation must keep these names in English: ${missing.join(", ")}.`);
}

// A word that equals a text address is only a reference when its surroundings say so. Compressed graphics and audio data are full of
// words that happen to look like ROM pointers; rewriting one of those corrupts the picture or the sound.
export type ReferenceRegions = { codeEnd: number; scriptStart: number; scriptEnd: number };
const loadTargets = new WeakMap<Uint8Array, Set<number>>();

function literalPoolTargets(bytes: Uint8Array, codeEnd: number): Set<number> {
  let targets = loadTargets.get(bytes);
  if (targets) return targets;
  targets = new Set<number>();
  for (let at = 0; at + 2 <= Math.min(codeEnd, bytes.length); at += 2) {
    const half = bytes[at] | (bytes[at + 1] << 8);
    if ((half & 0xf800) === 0x4800) targets.add(((at + 4) & ~3) + (half & 0xff) * 4); // Thumb: ldr rX, [pc, #imm]
  }
  loadTargets.set(bytes, targets);
  return targets;
}

export function isRealReference(bytes: Uint8Array, offset: number, regions: ReferenceRegions, textTargets?: Set<number>): boolean {
  const word = (at: number) => at >= 0 && at + 4 <= bytes.length ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0 : 0;
  const isPointer = (at: number) => { const value = word(at); return value >= 0x08000000 && value < 0x08000000 + bytes.length; };
  if (offset < regions.codeEnd) return literalPoolTargets(bytes, regions.codeEnd).has(offset) || (isPointer(offset - 4) && isPointer(offset + 4));
  // Event scripts keep text pointers inline: loadword (0x0F, buffer) and message (0x67) followed by waitmessage (0x66).
  if (offset >= regions.scriptStart && offset < regions.scriptEnd) return true;
  if (bytes[offset - 2] === 0x0f && bytes[offset - 1] <= 3) return true;
  if (bytes[offset - 1] === 0x67 && bytes[offset + 4] === 0x66) return true;
  // Pointer tables: neighbours on both sides, two in a row on one side, or a neighbour that itself points at text.
  const textNeighbour = (at: number) => isPointer(at) && !!textTargets?.has(word(at) - 0x08000000);
  if (textNeighbour(offset - 4) || textNeighbour(offset + 4)) return true;
  const before = isPointer(offset - 4), after = isPointer(offset + 4);
  if ((before && after) || (after && isPointer(offset + 8)) || (before && isPointer(offset - 8))) return true;
  // Arrays of records: the same field holds a ROM pointer in the records around it.
  for (let stride = 8; stride <= 64; stride += 4) {
    let hits = 0;
    for (const k of [-2, -1, 1, 2]) if (isPointer(offset + k * stride)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

export function extractPointerTextCandidates(bytes: Uint8Array, options: { adapterId: string; limit: number; regions?: ReferenceRegions }): TranslationEntry[] {
  const candidates = new Map<number, { decoded: ReturnType<typeof decodePokemonText>; references: number[]; score: number }>();
  for (let offset = 0; offset <= bytes.length - 4; offset += 4) {
    const pointer = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    if (pointer < 0x08000000 || pointer >= 0x08000000 + bytes.length) continue;
    const target = pointer - 0x08000000;
    try {
      const decoded = decodePokemonText(bytes, target, maxTextBytes);
      if (bytes[target + decoded.rawLength - 1] !== 0xff) continue;
      const score = scorePokemonText(decoded.text, decoded.unknownBytes, decoded.rawLength);
      if (score < (options.regions ? minVerifiedScore : 1.4)) continue;
      const existing = candidates.get(target) ?? { decoded, references: [], score };
      existing.references.push(offset);
      existing.score = Math.max(existing.score, score);
      candidates.set(target, existing);
    } catch {}
  }

  if (options.regions) {
    const textTargets = new Set(candidates.keys());
    for (const [target, candidate] of candidates) {
      candidate.references = candidate.references.filter((reference) => isRealReference(bytes, reference, options.regions!, textTargets));
      if (!candidate.references.length) candidates.delete(target);
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0] - b[0])
    .slice(0, options.limit)
    .sort((a, b) => a[0] - b[0])
    .map(([offset, candidate], index) => ({
      id: `${options.adapterId}-candidate-${offset.toString(16)}`,
      sourceText: candidate.decoded.text,
      translatedText: "",
      sourceLanguage: "english",
      targetLanguage: "thai",
      category: inferCategory(candidate.decoded.text),
      context: `Pointer text candidate #${index + 1} at 0x${offset.toString(16).toUpperCase()} (${candidate.references.length} ref${candidate.references.length === 1 ? "" : "s"})`,
      resource: {
        offset,
        pointer: 0x08000000 + offset,
        index,
        references: candidate.references
      },
      constraints: {
        maxBytes: 900,
        fixedLength: false
      },
      protectedTokens: candidate.decoded.protectedTokens,
      status: "untranslated",
      warnings: []
    }));
}

const minRaw = Number(process.env.MIN_RAW ?? 8), minLetters = Number(process.env.MIN_LETTERS ?? 5);
const minVerifiedScore = Number(process.env.MIN_SCORE ?? 1.4);
function scorePokemonText(text: string, unknownBytes: number[], rawLength: number): number {
  const clean = text.replace(/\[[^\]]+\]/g, " ");
  const letters = clean.match(/[A-Za-z]/g)?.length ?? 0;
  const spaces = clean.match(/ /g)?.length ?? 0;
  if (unknownBytes.length || rawLength < minRaw || rawLength > maxTextBytes || letters < minLetters || !/[a-z]/.test(clean)) return 0;
  let score = letters / rawLength + Math.min(spaces, 6) * 0.05;
  if (/[.!?]/.test(clean)) score += 0.2;
  if (/\b(the|you|and|Pokemon|POK|TRAINER|BATTLE|What|This|that|your|with)\b/i.test(clean)) score += 0.3;
  if (/^[A-Z0-9 '\-.]+$/.test(clean.trim()) && spaces <= 2) score -= 0.35;
  return score;
}

function inferCategory(text: string): TranslationEntry["category"] {
  if (/\b(power|attack|damage|foe|status|raises|lowers|prevents)\b/i.test(text)) return "description";
  if (/\b(ball|berry|item|hold|mail|potion|stone|ticket)\b/i.test(text)) return "description";
  return "dialog";
}
