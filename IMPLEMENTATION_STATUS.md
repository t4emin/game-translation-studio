# Implementation Status

## Implemented

- Exact FireRed Rev 1 fingerprint and source-matched text/font manifest.
- GBA-only V1 ingestion and analysis report.
- Read-only generic GBA scanner for ASCII, Shift-JIS, pointer and LZ77 candidates.
- Compatibility states that separate FULL adapter support from experimental analysis.
- 3,881 buildable entries (3,481 dialogue/story, 400 battle messages) plus read-only
  name tables, all with bundled Thai translations. Menus, Pokedex pages and
  descriptions are in the manifest (6,155 entries) but not buildable yet.
- Minish Cap (BZME): message table reader, Thai font banks 4/5/6, table rebuild and export. all 2,460
  translatable messages (menus and dialogue; 100%) have Thai translations, while 445 names and staff credits stay in
  English; played in an emulator by the maintainer with no problems found.
- Yu-Gi-Oh! WCT 2004 (BYWP): card description reader, Thai glyphs in unused Latin-1 codes of the 16 px font, text relocation to the ROM tail and export. all 1,087 descriptions translated; names, menus and duel messages are not covered. Experimental, not emulator-verified.
- Emerald: Thai glyphs now go in the Normal (1), Narrow (7) and Short (2) banks with a baseline one row lower, and
  dialogue starts in font 1 as the game does; 4,491 of 4,492 extracted messages translated (one credit line remains in English).
- Entries without a local translation are skipped and keep the original text on export.
- Translations must keep protected names (Pokemon, moves, items, places, characters) in English.
- Names and control tokens restored locally outside model output.
- Pause/resume, progress, failed-message editing and original-language export.
- Thai grapheme shaping, rasterization and four extended font banks.
- Thai font pipeline layer with normalization, visual cluster analysis,
  precomposed glyph strategy and build reports.
- Appended text resources, validated pointer updates and real .gba downloads.
- Black terminal interface: Upload, Analyze, Translate, Export; radio language controls.
- `/supported-games` renders the adapter registry.

## Verification

- Unit and real-ROM integration tests verify token preservation, name preservation,
  nonempty Thai glyphs, output limits, unchanged input and exact changed-byte ranges.
- Desktop/mobile browser tests upload the real ROM and download patched output.
- The 3,881-message build exports as a 17 MiB ROM using 527 Thai glyphs.
- All 4,533 redirected text references and original-range byte changes verified.
- Battle messages and the 1,092 dialogue entries added with them are verified at byte
  level only; they have not been run in an emulator yet.
- mGBA 0.10.5 runs the full output for 24,000 frames, displaying Thai in the
  opening scene and bedroom object interaction, and accepts input.
- All four Thai font banks have been exercised in mGBA.

## Limits

Unknown GBA games can be inspected, but generic candidates are not safe for
automatic injection. Battle menus, stat-change fragments, menus, specialized help
and unmatched FireRed resources remain original. Full-game playthrough is not verified. The current
font atlas supports 768 unique Thai clusters. Messages are limited to 900 encoded
bytes, trainer battle text to 250 and battle messages to 200. PSP, PS2, ISO and CSO are out of scope for V1.

See [ROM_PIPELINE.md](ROM_PIPELINE.md) for details.
