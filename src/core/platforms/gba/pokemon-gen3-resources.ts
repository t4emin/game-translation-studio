import { createHash } from "node:crypto";
import { decodePokemonText, readGbaPointer } from "./pokemon-gen3-text.ts";
import type { TranslationEntry } from "../../types.ts";

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

export function extractPointerTextCandidates(bytes: Uint8Array, options: { adapterId: string; limit: number }): TranslationEntry[] {
  const candidates = new Map<number, { decoded: ReturnType<typeof decodePokemonText>; references: number[]; score: number }>();
  for (let offset = 0; offset <= bytes.length - 4; offset += 4) {
    const pointer = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    if (pointer < 0x08000000 || pointer >= 0x08000000 + bytes.length) continue;
    const target = pointer - 0x08000000;
    try {
      const decoded = decodePokemonText(bytes, target, 240);
      if (bytes[target + decoded.rawLength - 1] !== 0xff) continue;
      const score = scorePokemonText(decoded.text, decoded.unknownBytes, decoded.rawLength);
      if (score < 1.4) continue;
      const existing = candidates.get(target) ?? { decoded, references: [], score };
      existing.references.push(offset);
      existing.score = Math.max(existing.score, score);
      candidates.set(target, existing);
    } catch {}
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

function scorePokemonText(text: string, unknownBytes: number[], rawLength: number): number {
  const clean = text.replace(/\[[^\]]+\]/g, " ");
  const letters = clean.match(/[A-Za-z]/g)?.length ?? 0;
  const spaces = clean.match(/ /g)?.length ?? 0;
  if (unknownBytes.length || rawLength < 8 || rawLength > 240 || letters < 5 || !/[a-z]/.test(clean)) return 0;
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
