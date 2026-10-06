# FireRed Rev 1 Translation Pipeline

## Implemented scope

The exact USA/Europe Rev 1 ROM (SHA-256
`729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`)
supports extraction, AI translation, Thai font generation, pointer relocation,
and download of a new `.gba` file. The original file is not overwritten.

The manifest yields 3,881 buildable entries: 3,481 dialogue entries and 400 battle
messages, all with bundled Thai translations; an entry without one keeps the original
text. `scripts/extend-firered-manifest.mjs` appends the C-source strings, trainer
battle text and short lines that `prepare-firered.mjs` misses, and leaves out
strings the game copies into small RAM buffers. This is NOT a
complete translation of every string in the game. Battle menus, menus, help screens,
specialized layouts, ambiguous source matches and undecoded resources remain
original. Names are retained; known Pokemon, move, ability and item names and
game control tokens are reconstructed locally outside model output.

## Binary implementation

- `scripts/prepare-firered.mjs` matches encoded text and font resources from the
  [pret FireRed source](https://github.com/pret/pokefirered) against the exact ROM.
  The generated manifest contains offsets, hashes and labels, not ROM data.
- Strings are decoded with control parameter lengths; translation uses separate
  prose fragments and restores original tokens in their original order.
- Shaped Thai grapheme clusters are composed from a hand-drawn pixel font
  (`thai-pixel-font.ts`, with the same baseline and shadow as the Latin fonts; clusters it
  cannot draw fall back to rasterizing Noto Sans Thai) and encoded
  into unused extended glyph slots `0x120..0x1df` in four Latin font banks. The
  existing engine's `FC 06` font selection and `F9` glyph escape are used.
  English glyphs remain intact. The current limit is 768 unique Thai clusters.
- New strings are appended after the original 16 MiB image. Only manifest-listed
  references are redirected; strings are never written over adjacent resources.
- Output is capped at 32 MiB and each encoded message at 900 bytes to leave space
  for placeholder expansion in the game's 1,000-byte text buffer.
- Build validates source SHA-256, font hashes, original pointer values, controls,
  output length and terminators. Unsupported input fails with a specific reason.

## Storage and API

Projects and immutable input copies live under `.local/projects/<uuid>/`.
Validated translation cache entries live under `.local/translations/`. These
directories and `artifacts/` are ignored by git. Translation can resume after
reloading the page. Translation is local only; no external API is called.

`POST /api/projects` uploads the ROM. `POST /api/projects/<id>/translate` advances
one batch. `GET /api/projects/<id>/export` returns the actual ROM once the selected
dialogue scope is translated. English-to-English export preserves the original.

## Verification

12 automated tests include token order/multiplicity, local name preservation,
Thai rasterization and exact-byte comparisons against a locally supplied ROM.
Run the real-ROM test with `TEST_ROM_PATH` set to your input file.

Browser verification covers real upload, patched-file download, reload recovery,
and 1280px/390px/320px layouts. The complete supported set of 2,389 translated
messages was exported through the web app and run in mGBA 0.10.5 for 24,000
frames. The opening scene displays Thai, accepts input and reaches the player's
bedroom, where translated object dialogue also renders.

`scripts/verify-build.ts` verified all 2,794 redirected references, every encoded
message and all changed bytes within the original ROM range. The output is
17 MiB, uses 493 Thai glyphs and has SHA-256
`4a8c445676e393b871993d05a00a4a0db20b9ef2a025981c4388eb62a34ea0d0`.
The ROM is available locally at `artifacts/FireRed-Rev1-thai.gba`; the byte-level
verification report is `artifacts/build-verification.json`.

This is a smoke test, NOT a full-game playthrough. All supported messages have
been translated, but only selected screens have been visually reviewed. Machine
translations can still need editorial review, and unusual layouts can need fixes.

Font license: `assets/fonts/OFL.txt`. Emulator test harness: `scripts/verify-rom.c`.

## The Minish Cap (BZME)

Layout from the zeldaret/tmc decompilation, checked against the USA ROM.

- Messages: `0x9B1D90` holds a group -> message table (80 groups, 3,699 messages) of zero-terminated
  strings. A zero byte can be a control parameter (white is `02 00`), so readers must step over control
  sequences. Seven language pointers (`0x109214`-`0x10922C`) all point at it in the USA ROM.
- Fonts: nine glyph-bank pointers at `0x109248`. A glyph is 8x16, 4bpp, 64 bytes, low nibble first;
  `0xF` in row 0 marks unused columns and sets the glyph's width. Groups 5-8 use two glyphs per character.
- Thai: bytes `0B`/`0D`/`0E` plus an index select groups 4/5/6, which English text never uses
  (768 slots). Narrow clusters go to group 4, wide ones to groups 5 and 6.
- Build: the whole message table and the three glyph banks are written to the free tail of the ROM and the
  seven language pointers and three font pointers are repointed. Nothing is overwritten in place and the
  ROM size does not change.
- Limits: lines must fit 208 px, and a translation must keep the control tokens of the source in order.
  Layout of menus and credits is not checked yet.

## Yu-Gi-Oh! WCT 2004 (BYWP)

Code: `src/core/platforms/gba/ygo-wct-rom.ts` (layout), `ygo-wct-thai.ts` (validation, glyphs, build), adapter `yugioh-wct-2004.ts`.
Status: experimental, card descriptions only, not verified in an emulator.

- Card names (table `0x58ACDC`, base `0x56E00C`) and descriptions (table `0x65CF38`, base `0x5917A4`) are zero-terminated strings
  with a u32 offset per (card, language); entry = card * 6 + language, in the order JP (Shift-JIS), EN, DE, FR, IT, ES.
  1,138 real cards (card 0 is a dummy). Lists of fusion-material names (`"A" + "B"`) are skipped, leaving 1,087 descriptions.
- The language is a byte at `0x02010014`; Thai replaces the English column.
- Text is printed one byte at a time from a fixed-width 1-bpp bitmap font indexed by byte value: four sizes (8, 10, 12, 16 px tall) at
  `0x6F69A8`, `0x6F71A8`, `0x6F7BA8`, `0x6F87A8`, 256 glyphs each (advance = height / 2). Descriptions use the 10 px font (style word
  `0x0A87` at `0x95858`). Special bytes: `0x09`, `0x0A`, `0x0D`, `0x20`, `@` + digit, `\n`. The game wraps only at spaces and
  paginates a description by itself.
- Build: Thai strings go into the free ROM tail, the English offsets in the description table are repointed (a u32, so the tail is
  reachable), glyph bitmaps replace the unused Latin-1 codes `0x80-0xFF` (except `0x92`, 127 slots) in the 16 px font, and the style
  word becomes `0x1087` so descriptions use that font. Clusters are allocated by frequency; one without a slot loses its marks.
  Long Thai runs get spaces at real word boundaries (ICU) so the game can wrap. The other languages' text shares the 16 px font, so their accented letters would
  show Thai glyphs in a Thai build.
- Not done: names, menus and duel messages (block at `0x681480`, referenced from code), box size per screen, the JP printer.
