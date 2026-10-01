import type { GbaGenericScan } from "../../types.ts";

const previewLimit = 200;

export function scanGbaResources(bytes: Uint8Array): GbaGenericScan {
  return {
    ascii: scanAscii(bytes),
    shiftJis: scanShiftJis(bytes),
    pointers: scanPointers(bytes),
    compression: scanCompression(bytes)
  };
}

function scanAscii(bytes: Uint8Array): GbaGenericScan["ascii"] {
  const examples: GbaGenericScan["ascii"]["examples"] = [];
  let count = 0;
  for (let offset = 0; offset < bytes.length;) {
    const start = offset;
    while (offset < bytes.length && isAsciiTextByte(bytes[offset])) offset++;
    const length = offset - start;
    if (length >= 6) {
      count++;
      const text = decodeAscii(bytes.slice(start, offset), 500);
      const confidence = asciiTextConfidence(text, length);
      if (confidence >= 0.58) examples.push({ offset: start, length, text, confidence });
    }
    offset = Math.max(offset + 1, start + 1);
  }
  return { count, examples: topTextExamples(examples) };
}

function scanShiftJis(bytes: Uint8Array): GbaGenericScan["shiftJis"] {
  const examples: GbaGenericScan["shiftJis"]["examples"] = [];
  let count = 0;
  const decoder = new TextDecoder("shift_jis", { fatal: false });
  for (let offset = 0; offset < bytes.length - 1;) {
    const start = offset;
    let pairs = 0;
    while (offset < bytes.length - 1 && isShiftJisPair(bytes[offset], bytes[offset + 1])) {
      pairs++;
      offset += 2;
    }
    if (pairs >= 4) {
      count++;
      if (examples.length < previewLimit) {
        const raw = bytes.slice(start, offset);
        examples.push({ offset: start, length: raw.length, text: decoder.decode(raw).replace(/\0/g, ""), confidence: Math.min(0.9, 0.45 + pairs / 20) });
      }
    }
    offset = Math.max(offset + 1, start + 1);
  }
  return { count, examples };
}

function scanPointers(bytes: Uint8Array): GbaGenericScan["pointers"] {
  const examples: GbaGenericScan["pointers"]["examples"] = [];
  const targets = new Set<number>();
  let count = 0;
  for (let offset = 0; offset <= bytes.length - 4; offset += 4) {
    const value = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    if (value < 0x08000000 || value >= 0x08000000 + bytes.length) continue;
    const target = value - 0x08000000;
    if (target < 0 || target >= bytes.length) continue;
    count++;
    targets.add(target);
    if (examples.length < previewLimit) {
      const byte = bytes[target];
      const confidence = isAsciiTextByte(byte) || byte === 0xff || byte === 0xfe ? 0.72 : 0.45;
      examples.push({ offset, target, confidence });
    }
  }
  return { count, uniqueTargets: targets.size, examples };
}

function scanCompression(bytes: Uint8Array): GbaGenericScan["compression"] {
  const examples: GbaGenericScan["compression"]["examples"] = [];
  let count = 0;
  for (let offset = 0; offset <= bytes.length - 4; offset++) {
    if (bytes[offset] !== 0x10) continue;
    const decompressedSize = bytes[offset + 1] | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16);
    if (decompressedSize <= 0 || decompressedSize > 0x200000) continue;
    count++;
    if (examples.length < previewLimit) examples.push({ offset, type: "gba-lz77-candidate", confidence: 0.45 });
  }
  return { count, examples };
}

function isAsciiTextByte(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

function decodeAscii(bytes: Uint8Array, limit = 80): string {
  return new TextDecoder("ascii").decode(bytes).replace(/\s+/g, " ").trim().slice(0, limit);
}

function isShiftJisPair(first: number, second: number): boolean {
  const lead = (first >= 0x81 && first <= 0x9f) || (first >= 0xe0 && first <= 0xfc);
  const trail = (second >= 0x40 && second <= 0x7e) || (second >= 0x80 && second <= 0xfc);
  return lead && trail;
}

function topTextExamples(examples: GbaGenericScan["ascii"]["examples"]): GbaGenericScan["ascii"]["examples"] {
  const seen = new Set<string>();
  return examples
    .sort((a, b) => b.confidence - a.confidence || b.length - a.length)
    .filter((entry) => {
      const key = entry.text.slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, previewLimit);
}

function asciiTextConfidence(text: string, length: number): number {
  if (!/[A-Za-z]{3}/.test(text)) return 0;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const spaces = (text.match(/\s/g) ?? []).length;
  const vowels = (text.match(/[AEIOUaeiou]/g) ?? []).length;
  const punctuation = (text.match(/[.!?,'":;-]/g) ?? []).length;
  const symbols = (text.match(/[^A-Za-z0-9\s.!?,'":;\-()]/g) ?? []).length;
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z][A-Za-z'.-]{1,}$/.test(word));
  const common = (text.match(/\b(the|you|and|to|of|in|is|it|that|this|for|with|your|have|get|not|are|will|was|on|from)\b/gi) ?? []).length;
  const repeated = /(.)\1{5,}/.test(text) ? 0.18 : 0;
  const letterRatio = letters / Math.max(1, text.length);
  const symbolRatio = symbols / Math.max(1, text.length);
  const wordRatio = words.join("").length / Math.max(1, letters);
  let score = 0.28;
  score += Math.min(0.22, length / 260);
  score += Math.min(0.18, common * 0.035);
  score += Math.min(0.12, spaces * 0.008);
  score += Math.min(0.1, punctuation * 0.012);
  score += letterRatio > 0.45 && letterRatio < 0.9 ? 0.14 : -0.12;
  score += vowels / Math.max(1, letters) > 0.22 ? 0.08 : -0.08;
  score += wordRatio > 0.65 ? 0.08 : -0.04;
  score -= Math.min(0.25, symbolRatio * 1.5) + repeated;
  return Math.max(0, Math.min(0.98, score));
}
