// Yu-Gi-Oh! World Championship Tournament 2004 (EUR, BYWP). Layout found with tools/survey/rom-survey.ts and by reading the Thumb code.
//
// Card names and descriptions are zero-terminated strings. Each has a u32 offset table with one entry per (card, language):
// entry = card * 6 + language, languages JP (Shift-JIS), EN, DE, FR, IT, ES. Card 0 is an empty dummy.
//   names:        table 0x58ACDC, offsets relative to 0x56E00C
//   descriptions: table 0x65CF38, offsets relative to 0x5917A4 (the code adds 0x085917A4 to the table value)
// The language comes from a byte at 0x02010014 (low 7 bits; 0 = JP). Descriptions are printed by 0x080828C8 with style 0x0A87,
// which selects the 10-pixel-tall 1-bpp font (glyphs 8 columns wide, 10 bytes per code, code = byte value).
export const ygoLanguages = ["jp", "en", "de", "fr", "it", "es"] as const;
export const ygoTables = {
  names: { table: 0x58acdc, base: 0x56e00c },
  descriptions: { table: 0x65cf38, base: 0x5917a4 }
} as const;
export const ygoCardCount = 1139;
export const ygoFonts = { 8: 0x6f69a8, 10: 0x6f71a8, 12: 0x6f7ba8, 16: 0x6f87a8 } as const; // 256 glyphs each, `height` bytes per glyph

export type YgoCardText = { card: number; nameOffset: number; descriptionOffset: number; name: string; english: string };

const u32 = (rom: Uint8Array, at: number) => (rom[at] | rom[at + 1] << 8 | rom[at + 2] << 16 | rom[at + 3] << 24) >>> 0;
// Latin-1 covers EN/DE/FR/IT/ES here; the game uses 0x92 for an apostrophe.
const decodeLatin = (bytes: Uint8Array) => [...bytes].map((b) => (b === 0x92 ? "’" : String.fromCharCode(b))).join("");

function readString(rom: Uint8Array, at: number): Uint8Array {
  let end = at; while (rom[end] !== 0) end++;
  return rom.subarray(at, end);
}

export function ygoEntryOffset(rom: Uint8Array, kind: keyof typeof ygoTables, card: number, language: number): number {
  const { table, base } = ygoTables[kind];
  return base + u32(rom, table + (card * 6 + language) * 4);
}

export function extractYgoCardTexts(rom: Uint8Array): YgoCardText[] {
  const cards: YgoCardText[] = [];
  for (let card = 1; card < ygoCardCount; card++) {
    const nameOffset = ygoEntryOffset(rom, "names", card, 1), descriptionOffset = ygoEntryOffset(rom, "descriptions", card, 1);
    if (descriptionOffset >= rom.length || nameOffset >= rom.length) throw new Error(`Card ${card} points outside the ROM.`);
    cards.push({ card, nameOffset, descriptionOffset, name: decodeLatin(readString(rom, nameOffset)), english: decodeLatin(readString(rom, descriptionOffset)) });
  }
  return cards;
}
