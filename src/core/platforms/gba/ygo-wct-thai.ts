// Thai text for Yu-Gi-Oh! WCT 2004: validation, encoding, font glyphs and the ROM build.
//
// The game prints one byte per glyph from a fixed-width 1-bpp bitmap font. Thai clusters therefore get single-byte codes taken from
// bytes English never uses (0x80-0xFF except 0x92), and their bitmaps overwrite the 16-px font. The description screen is switched from
// the 10-px font to the 16-px font by changing one style constant, because Thai needs tall rows for tone marks. Wrapping is done by the
// game at spaces (0x20), so translations must separate phrases with spaces.
import { createHash } from "node:crypto";
import { composeThaiCluster } from "./thai-pixel-font.ts";
import { isThaiCluster, normalizeThaiText, splitTextClusters } from "./thai-font-pipeline.ts";
import { extractYgoCardTexts, ygoEntryOffset, ygoFonts, ygoTables } from "./ygo-wct-rom.ts";

export const ygoStyleWordOffset = 0x95858; // u32 style of the description printer: 0x0A87 = 10 px font, 0x1087 = 16 px font
const originalStyle = 0x0a87, thaiStyle = 0x1087;
export const ygoMaxWordClusters = 14; // longest run of Thai without a space; the game can only wrap at spaces
export const ygoMaxBytes = 900;

const firstSlot = 0x80, lastSlot = 0xff, apostrophe = 0x92;
export const ygoSlots = Array.from({ length: lastSlot - firstSlot + 1 }, (_, i) => firstSlot + i).filter((code) => code !== apostrophe);

export function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Each cluster is drawn into an 8-column, 16-row cell. "ำ" is drawn as aa with a ring above it.
// The shared Thai pixel font has a 6-row letter body (rows 5-10) sized for 8-px games; here the body is stretched to 8 rows by repeating
// two rows (the cell has room), which reads better at a fixed 8-px advance. Leading vowels sit against the right edge of their cell, next to
// the consonant they belong to; everything else sits against the left edge.
const leadingVowel = /^[\u0e40-\u0e44]$/;
function shape(cluster: string): Uint8Array | undefined {
  const glyph = composeThaiCluster(cluster === "ำ" ? "า\u0e4d" : cluster, { shadow: false });
  if (!glyph) return undefined;
  const cells: boolean[][] = Array.from({ length: 16 }, () => Array(8).fill(false));
  let ink = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!glyph.grid[y * 16 + x]) continue;
    if (x > 7) return undefined;
    ink = Math.max(ink, x + 1);
    const rows = y >= 5 && y <= 10 ? [y + (y > 6 ? 1 : 0), ...(y === 6 || y === 9 ? [y + (y > 6 ? 2 : 1)] : [])] : [y + (y > 10 ? 2 : 0)];
    for (const row of rows) if (row < 16) cells[row][x] = true;
  }
  const shift = leadingVowel.test(cluster) ? 8 - ink : 0;
  const rows = new Uint8Array(16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (cells[y][x]) rows[y] |= 0x80 >> (x + shift);
  return rows;
}

// Sara am sits after its consonant as a separate glyph, so "น้ำ" is "น้" + "ำ".
function pieces(text: string): string[] {
  return splitTextClusters(text).flatMap((cluster) => isThaiCluster(cluster) && cluster.length > 1 && cluster.endsWith("ำ") ? [cluster.slice(0, -1), "ำ"] : [cluster]);
}

// A cluster without its own glyph loses marks until something is drawn; the bare letter always exists.
function degrade(cluster: string): string[] {
  const [base, ...marks] = [...cluster];
  const out = [cluster];
  for (let n = marks.length - 1; n >= 0; n--) out.push(base + marks.slice(0, n).join(""));
  return out;
}

// The game wraps only at spaces. Long unspaced runs are split at real Thai word boundaries (ICU dictionary) so lines can break there.
const thaiWords = new Intl.Segmenter("th", { granularity: "word" });
const softRun = 10;
export function softSpaces(text: string): string {
  return normalizeThaiText(text).split(/( +|\n)/).map((part) => {
    if (!/[\u0e00-\u0e7f]/.test(part) || pieces(part).length <= softRun) return part;
    let out = "", run = 0;
    for (const { segment } of thaiWords.segment(part)) {
      const length = pieces(segment).length;
      if (run > 0 && run + length > softRun) { out += " "; run = 0; }
      out += segment; run += length;
    }
    return out;
  }).join("");
}

export type YgoAtlas = Map<string, { code: number; rows: Uint8Array }>;

export function createYgoAtlas(texts: string[]): YgoAtlas {
  const counts = new Map<string, number>();
  for (const text of texts) for (const cluster of pieces(softSpaces(text))) if (isThaiCluster(cluster)) counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  const drawable = [...counts.keys()].filter((cluster) => shape(cluster));
  const bare = new Set<string>();
  for (const cluster of counts.keys()) bare.add([...cluster][0]);
  // Letters first (every cluster can fall back to one), then clusters by frequency.
  const order = [
    ...[...bare].filter((cluster) => shape(cluster)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)),
    ...drawable.filter((cluster) => !bare.has(cluster)).sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
  ];
  const atlas: YgoAtlas = new Map();
  for (const cluster of order) {
    if (atlas.size >= ygoSlots.length) break;
    atlas.set(cluster, { code: ygoSlots[atlas.size], rows: shape(cluster)! });
  }
  return atlas;
}

export function resolveCluster(cluster: string, atlas: YgoAtlas): string {
  for (const candidate of degrade(cluster)) if (atlas.has(candidate)) return candidate;
  throw new Error(`No glyph can draw: ${cluster}`);
}

export function encodeYgoText(text: string, atlas: YgoAtlas): Uint8Array {
  const bytes: number[] = [];
  for (const cluster of pieces(softSpaces(text))) {
    if (isThaiCluster(cluster)) { bytes.push(atlas.get(resolveCluster(cluster, atlas))!.code); continue; }
    for (const char of cluster) {
      const code = char === "’" ? apostrophe : char.charCodeAt(0);
      if (code === 0x0a || (code >= 0x20 && code < 0x7f) || code === apostrophe) bytes.push(code);
      else throw new Error(`Character cannot be encoded: ${char}`);
    }
  }
  if (bytes.length + 1 > ygoMaxBytes) throw new Error(`Translated text is ${bytes.length + 1} bytes; the limit is ${ygoMaxBytes}.`);
  return Uint8Array.from([...bytes, 0]);
}

const quoted = (text: string) => (text.match(/["“”][^"“”]+["“”]/g) ?? []).map((item) => item.slice(1, -1)).sort();
const codes = (text: string) => (text.match(/@\d|%[sd]/g) ?? []).join(" ");

// Fusion-material lines like `"A" + "B"` are only card names and stay as they are.
export const isNameList = (text: string) => /^(?:"[^"]+"|[A-Za-z0-9.,#'’ -]+?)(?: \+ (?:"[^"]+"|[A-Za-z0-9.,#'’ -]+?))+$/.test(text);

export function validateYgoTranslation(source: string, translated: string): void {
  if (!translated.trim()) throw new Error("Empty translation");
  if (isNameList(source)) {
    if (translated !== source) throw new Error("Lists of card names stay in English");
    return;
  }
  if (!/[฀-๿]/.test(translated)) throw new Error("Translation has no Thai text");
  if (codes(source) !== codes(translated)) throw new Error(`Control codes must match in order: ${codes(source) || "(none)"}`);
  const names = quoted(source), kept = quoted(translated);
  if (names.join("|") !== kept.join("|")) throw new Error(`Card names in quotes must stay in English: ${names.join(", ") || "(none)"}`);
  for (const word of softSpaces(translated).split(/[ \n]+/)) {
    const length = pieces(word).length;
    if (length > (/[\u0e00-\u0e7f]/.test(word) ? ygoMaxWordClusters : 24)) throw new Error(`Add spaces between phrases: "${word.slice(0, 20)}…" runs ${length} glyphs without one (limit ${ygoMaxWordClusters}).`);
  }
}

export function buildYgoRom(original: Uint8Array, translations: Map<number, string>): { bytes: Uint8Array; translated: number; glyphs: number; usedBytes: number } {
  const output = Uint8Array.from(original);
  if (translations.size === 0) return { bytes: output, translated: 0, glyphs: 0, usedBytes: 0 };
  const view = new DataView(output.buffer);
  if (view.getUint32(ygoStyleWordOffset, true) !== originalStyle) throw new Error("Description style constant does not match this ROM.");
  const atlas = createYgoAtlas([...translations.values()]);
  const encoded = new Map<number, Uint8Array>();
  for (const [card, text] of translations) {
    try { encoded.set(card, encodeYgoText(text, atlas)); } catch (error) { throw new Error(`Card ${card}: ${error instanceof Error ? error.message : "Encoding failed"}`); }
  }
  // New strings go into the unused tail; the English offset of each translated card is repointed.
  let tail = original.length;
  while (tail > 0 && (original[tail - 1] === 0xff || original[tail - 1] === 0)) tail--;
  let cursor = (tail + 0xff) & ~0xff;
  for (const [card, bytes] of encoded) {
    if (cursor + bytes.length > original.length) throw new Error("Translated text does not fit in the free space of the ROM.");
    output.set(bytes, cursor);
    view.setUint32(ygoTables.descriptions.table + (card * 6 + 1) * 4, cursor - ygoTables.descriptions.base, true);
    cursor += bytes.length;
  }
  // Glyph bitmaps replace unused Latin-1 codes in the 16-px font; the printer is switched to that font.
  for (const { code, rows } of atlas.values()) output.set(rows, ygoFonts[16] + code * 16);
  view.setUint32(ygoStyleWordOffset, thaiStyle, true);
  return { bytes: output, translated: encoded.size, glyphs: atlas.size, usedBytes: cursor - ((tail + 0xff) & ~0xff) };
}

export { extractYgoCardTexts, ygoEntryOffset };
