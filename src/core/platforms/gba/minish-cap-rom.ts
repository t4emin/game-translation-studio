// The Legend of Zelda: The Minish Cap (USA) text and font layout, from the zeldaret/tmc decompilation.
//
// Text: `translation` at 0x9B1D90 is a two-level table (group -> message) of 0-terminated byte strings.
// Seven pointers (0x109214..0x10922C) select it per language; USA points them all at the same table.
// Font: `gUnk_08109248` holds nine glyph-bank pointers. A glyph is 8x16 pixels, 4bpp, 64 bytes, low nibble
// first. Row 0 marks unused columns with 0xF, which gives each glyph its own width. Groups 0-4 are single
// glyphs; groups 5-8 draw two glyphs side by side (16px). Bytes 0x0B/0x0D/0x0E followed by an index select
// groups 4/5/6, which English text never uses, so they hold the Thai glyphs.
import { createHash } from "node:crypto";
import { composeThaiCluster } from "./thai-pixel-font.ts";
import { isThaiCluster, normalizeThaiText, splitTextClusters } from "./thai-font-pipeline.ts";
import { controlTokens } from "./firered-rom.ts";

export const TEXT_TABLE = 0x9b1d90;
export const TEXT_POINTER_SLOTS = [0x109214, 0x109218, 0x10921c, 0x109220, 0x109224, 0x109228, 0x10922c];
export const FONT_TABLE = 0x109248;
const LATIN_GROUP = 1;
const GLYPH_BYTES = 64;
/** Group number, prefix byte, glyph size in pieces and capacity. Groups 5 and 6 draw two pieces per glyph. */
const THAI_BANKS = [
  { group: 4, prefix: 0x0b, pieces: 1, slots: 256 },
  { group: 5, prefix: 0x0d, pieces: 2, slots: 256 },
  { group: 6, prefix: 0x0e, pieces: 2, slots: 256 }
] as const;
/** Staff credits and NPC names stay in their original language. */
const NAME_GROUPS = new Set([1, 2]);
/** Space available for one line of text in the dialog window, in pixels. */
export const LINE_WIDTH = 208;
/** Reserved width for what a `[VAR]` token inserts at run time: the player's name (`[VAR:00]`), or a button icon or number. */
const PLAYER_WIDTH = 48;
const VARIABLE_WIDTH = 24;
const COLORS = ["WHITE", "RED", "GREEN", "BLUE", "YELLOW"];

export interface MinishMessage { id: string; group: number; index: number; offset: number; bytes: Uint8Array }
export interface MinishEntry extends MinishMessage { text: string; category: "dialog" | "name" | "menu" }

export function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const u32 = (rom: Uint8Array, offset: number) => {
  if (offset < 0 || offset + 4 > rom.length) throw new Error("This file does not contain the Minish Cap message table.");
  return Buffer.from(rom.buffer, rom.byteOffset, rom.byteLength).readUInt32LE(offset);
};

export function messageId(group: number, index: number): string {
  return `minish-${group.toString(16).padStart(2, "0")}-${index.toString(16).padStart(3, "0")}`;
}

export function readMessages(rom: Uint8Array): MinishMessage[] {
  const groupCount = u32(rom, TEXT_TABLE) / 4;
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 255) throw new Error("This file does not contain the Minish Cap message table.");
  const messages: MinishMessage[] = [];
  for (let group = 0; group < groupCount; group++) {
    const base = TEXT_TABLE + u32(rom, TEXT_TABLE + group * 4);
    const count = u32(rom, base) / 4;
    for (let index = 0; index < count; index++) {
      const offset = base + u32(rom, base + index * 4);
      // A zero byte can be a control parameter (white is `02 00`), so step over control sequences.
      let end = offset;
      while (rom[end] !== 0) {
        if (end >= rom.length) throw new Error("A Minish Cap message is not terminated.");
        end += rom[end] < 0x10 ? controlLength(rom, end) : 1;
      }
      messages.push({ id: messageId(group, index), group, index, offset, bytes: rom.slice(offset, end) });
    }
  }
  return messages;
}

/** Length in bytes of the control sequence that starts at `at`, which holds a byte below 0x10. */
function controlLength(bytes: Uint8Array, at: number): number {
  const next = bytes[at + 1];
  switch (bytes[at]) {
    case 0x03: case 0x07: return 3;
    case 0x04: return next === 0x10 ? 3 : 2;
    case 0x05: return next === 0xff ? 2 : 3;
    case 0x06: return next === 0x05 ? 4 : 2;
    case 0x0a: return 1;
    default: return 2;
  }
}

const hex = (bytes: ArrayLike<number>) => [...Array.from(bytes)].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");

export function decodeMessage(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length;) {
    const byte = bytes[index];
    if (byte === 0x0a) { text += "[NEW_LINE]"; index++; continue; }
    if (byte < 0x10) {
      const length = Math.min(controlLength(bytes, index), bytes.length - index);
      const part = bytes.subarray(index, index + length);
      text += byte === 0x02 && COLORS[part[1]] ? `[COLOR:${COLORS[part[1]]}]`
        : byte === 0x06 && length === 2 ? `[VAR:${hex(part.subarray(1))}]`
        : byte === 0x0f && length === 2 ? `[SYMBOL:${hex(part.subarray(1))}]`
        : `[CTRL:${hex(part)}]`;
      index += length;
      continue;
    }
    index++;
    if (byte === 0xe9) text += "é";
    else if (byte >= 0x20 && byte < 0x7f && byte !== 0x5b && byte !== 0x5d) text += String.fromCharCode(byte);
    else text += `[BYTE:${hex([byte])}]`;
  }
  return text;
}

export function tokenBytes(token: string): number[] {
  const match = token.match(/^\[(COLOR|VAR|SYMBOL|CTRL|BYTE|NEW_LINE)(?::([0-9A-Za-z]+))?\]$/);
  if (!match) throw new Error(`Unknown control token ${token}`);
  const [, kind, value] = match;
  if (kind === "NEW_LINE") return [0x0a];
  if (!value) throw new Error(`Control token has no value: ${token}`);
  if (kind === "COLOR") {
    const color = COLORS.indexOf(value);
    if (color < 0) throw new Error(`Unknown color ${token}`);
    return [0x02, color];
  }
  if (!/^(?:[0-9A-F]{2})+$/.test(value)) throw new Error(`Invalid token ${token}`);
  const bytes = [...Buffer.from(value, "hex")];
  return kind === "VAR" ? [0x06, ...bytes] : kind === "SYMBOL" ? [0x0f, ...bytes] : bytes;
}

/**
 * Names stay in English: staff and NPC names, item names, character and place lists, and signs that only name a place.
 * Groups: 1 credits, 2 NPC names, 4 item names (indexes below 0x73; the rest are menu and tutorial text),
 * 6 signs (a sign with no sentence punctuation is a place name; 0x3d-0x43 are puzzle hints), 7 Wind Crest place names
 * (indexes from 0x0b), 8 character and place list.
 */
function isNameMessage(group: number, index: number, text: string): boolean {
  if (NAME_GROUPS.has(group) || group === 8) return true;
  if (group === 4) return index < 0x73;
  if (group === 7) return index >= 0x0b;
  if (group === 6) return !(index >= 0x3d && index <= 0x43) && !/[.!?,]/.test(text.replace(/\[[^\]]+\]/g, ""));
  return false;
}

export function extractMinishEntries(rom: Uint8Array): MinishEntry[] {
  return readMessages(rom).flatMap((message) => {
    const text = decodeMessage(message.bytes);
    // Skip empty slots and messages that hold nothing but control codes or numbers.
    if (!/[A-Za-z]{2}/.test(text.replace(/\[[^\]]+\]/g, " "))) return [];
    const category = isNameMessage(message.group, message.index, text) ? "name" : message.group === 0 || message.group === 46 ? "menu" : "dialog";
    return [{ ...message, text, category } as MinishEntry];
  });
}

// ---- Thai font ----------------------------------------------------------------------------------

export interface MinishGlyph { bank: number; slot: number; width: number; pieces: Uint8Array[] }
export type MinishAtlas = Map<string, MinishGlyph>;

function latinWidths(rom: Uint8Array): number[] {
  const bank = u32(rom, FONT_TABLE + LATIN_GROUP * 4) - 0x08000000;
  const widths: number[] = [];
  for (let code = 0; code < 256; code++) {
    const row = u32(rom, bank + code * GLYPH_BYTES);
    widths.push([...Array(8).keys()].filter((column) => ((row >>> (column * 4)) & 15) !== 15).length);
  }
  return widths;
}

function packPiece(grid: Uint8Array, x0: number, width: number): Uint8Array {
  const piece = new Uint8Array(GLYPH_BYTES);
  for (let row = 0; row < 16; row++) for (let column = 0; column < 8; column++) {
    const value = column >= width ? 0xf : grid[row * 16 + x0 + column] === 1 ? 0xe : 0;
    piece[row * 4 + (column >> 1)] |= column & 1 ? value << 4 : value;
  }
  return piece;
}

function rasterize(cluster: string): { width: number; pieces: Uint8Array[] } {
  const glyph = composeThaiCluster(cluster, { dy: 3, shadow: false });
  if (!glyph) throw new Error(`No Thai glyph shape is drawn for: ${cluster}`);
  const first = Math.min(8, glyph.width);
  const pieces = [packPiece(glyph.grid, 0, first)];
  if (glyph.width > 8) pieces.push(packPiece(glyph.grid, 8, glyph.width - 8));
  return { width: glyph.width, pieces };
}

export function createMinishAtlas(texts: string[]): MinishAtlas {
  const counts = new Map<string, number>();
  for (const text of texts) for (const cluster of splitTextClusters(text)) if (isThaiCluster(cluster)) counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  const clusters = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const shapes = new Map(clusters.map((cluster) => [cluster, rasterize(cluster)]));
  // Narrow clusters fill the single-glyph bank first; wide ones need a two-glyph bank.
  const used = THAI_BANKS.map(() => 0);
  const atlas: MinishAtlas = new Map();
  const place = (cluster: string, bank: number) => {
    const shape = shapes.get(cluster)!;
    atlas.set(cluster, { bank, slot: used[bank]++, width: shape.width, pieces: shape.pieces });
  };
  const free = (bank: number) => used[bank] < THAI_BANKS[bank].slots;
  for (const cluster of clusters) {
    const narrow = shapes.get(cluster)!.pieces.length === 1;
    const bank = narrow
      ? [0, 1, 2].find(free)
      : [1, 2].find(free);
    if (bank === undefined) throw new Error(`Thai font needs more glyphs than Minish Cap can hold (${THAI_BANKS.reduce((sum, item) => sum + item.slots, 0)}).`);
    place(cluster, bank);
  }
  return atlas;
}

// ---- Text encoding ------------------------------------------------------------------------------

export interface EncodeOptions { maxWidth?: number }

export function encodeMessage(text: string, rom: Uint8Array, atlas: MinishAtlas, options: EncodeOptions = {}): Uint8Array {
  const widths = latinWidths(rom);
  const maxWidth = options.maxWidth ?? LINE_WIDTH;
  const out: number[] = [];
  let x = 0, line = 1;
  for (const part of text.split(/(\[[^\]]+\])/g).filter(Boolean)) {
    if (part.startsWith("[")) {
      if (part === "[NEW_LINE]") { x = 0; line++; }
      else if (part.startsWith("[VAR:")) x += part === "[VAR:00]" ? PLAYER_WIDTH : VARIABLE_WIDTH;
      out.push(...tokenBytes(part));
      continue;
    }
    for (const cluster of splitTextClusters(part)) {
      const glyph = atlas.get(cluster);
      let width: number;
      if (glyph) {
        out.push(THAI_BANKS[glyph.bank].prefix, glyph.slot);
        width = glyph.width;
      } else {
        const code = cluster === "é" ? 0xe9 : cluster.length === 1 ? cluster.charCodeAt(0) : -1;
        if (code < 0x20 || (code > 0x7e && code !== 0xe9) || code === 0x5b || code === 0x5d) throw new Error(`Character cannot be encoded: ${cluster}`);
        out.push(code);
        width = widths[code];
      }
      x += width;
      if (x > maxWidth) throw new Error(`Line ${line} is ${x}px wide; the window holds ${maxWidth}px. Shorten it or add a line break.`);
    }
  }
  out.push(0);
  return Uint8Array.from(out);
}

export interface MinishBuild { bytes: Buffer; glyphs: number; translated: number; checksum: string }

export function validateMinishTranslation(source: string, translated: string): void {
  if (!translated.trim()) throw new Error("Empty translation");
  const expected = controlTokens(source);
  if (JSON.stringify(expected) !== JSON.stringify(controlTokens(translated))) {
    const hint = expected.length ? ` Expected, in order: ${expected.map((token) => token.replace("[NEW_LINE]", "↵")).join(" ")}` : " This message has none.";
    throw new Error(`Translation changed the order or number of game control tokens.${hint}`);
  }
}

/** Rebuilds the message table with the translated messages and points the game at it. */
export function buildMinishRom(original: Uint8Array, translations: Map<string, string>): MinishBuild {
  const sources = new Map(extractMinishEntries(original).map((entry) => [entry.id, entry]));
  const changed = new Map<string, string>();
  for (const [id, text] of translations) {
    const source = sources.get(id);
    if (!source) throw new Error(`Unknown message: ${id}`);
    if (source.category === "name" || !text || text === source.text) continue;
    validateMinishTranslation(source.text, text);
    changed.set(id, normalizeThaiText(text));
  }
  if (!changed.size) return { bytes: Buffer.from(original), glyphs: 0, translated: 0, checksum: digest(original) };

  const atlas = createMinishAtlas([...changed.values()]);
  const encoded = new Map<string, Uint8Array>();
  for (const [id, text] of changed) {
    try { encoded.set(id, encodeMessage(text, original, atlas)); }
    catch (error) { throw new Error(`${id}: ${error instanceof Error ? error.message : "Encoding failed"}`); }
  }

  // New data goes into the unused tail of the ROM; nothing is moved or overwritten in place.
  const output = Buffer.from(original);
  let tail = original.length;
  while (tail > 0 && original[tail - 1] === 0xff) tail--;
  let cursor = (tail + 0xff) & ~0xff;
  const reserve = (size: number) => {
    const start = cursor;
    cursor = (cursor + size + 3) & ~3;
    if (cursor > original.length) throw new Error("Translated data does not fit in the free space of the ROM.");
    return start;
  };

  const messages = readMessages(original);
  const groups = new Map<number, MinishMessage[]>();
  for (const message of messages) groups.set(message.group, [...(groups.get(message.group) ?? []), message]);
  const sizes = [...groups.keys()].sort((a, b) => a - b).map((group) =>
    groups.get(group)!.reduce((sum, message) => sum + (encoded.get(message.id)?.length ?? message.bytes.length + 1), 0) + groups.get(group)!.length * 4);
  const tableStart = reserve(groups.size * 4 + sizes.reduce((sum, size) => sum + ((size + 3) & ~3), 0));
  let groupBase = groups.size * 4;
  [...groups.keys()].sort((a, b) => a - b).forEach((group, groupIndex) => {
    output.writeUInt32LE(groupBase, tableStart + groupIndex * 4);
    const list = groups.get(group)!;
    let stringBase = list.length * 4;
    list.forEach((message, index) => {
      output.writeUInt32LE(stringBase, tableStart + groupBase + index * 4);
      const bytes = encoded.get(message.id) ?? Uint8Array.from([...message.bytes, 0]);
      output.set(bytes, tableStart + groupBase + stringBase);
      stringBase += bytes.length;
    });
    groupBase += (stringBase + 3) & ~3;
  });
  for (const slot of TEXT_POINTER_SLOTS) output.writeUInt32LE(0x08000000 + tableStart, slot);

  THAI_BANKS.forEach((bank, bankIndex) => {
    const glyphs = [...atlas.values()].filter((glyph) => glyph.bank === bankIndex);
    if (!glyphs.length) return;
    const start = reserve(bank.slots * bank.pieces * GLYPH_BYTES);
    for (const glyph of glyphs) glyph.pieces.forEach((piece, pieceIndex) => output.set(piece, start + (glyph.slot * bank.pieces + pieceIndex) * GLYPH_BYTES));
    // A narrow glyph in a two-piece bank gets an all-0xF second piece, which draws with zero width.
    for (const glyph of glyphs) if (bank.pieces === 2 && glyph.pieces.length === 1) output.fill(0xff, start + (glyph.slot * 2 + 1) * GLYPH_BYTES, start + (glyph.slot * 2 + 2) * GLYPH_BYTES);
    output.writeUInt32LE(0x08000000 + start, FONT_TABLE + bank.group * 4);
  });
  return { bytes: output, glyphs: atlas.size, translated: changed.size, checksum: digest(output) };
}
