# FireRed Rev 1 Translation Pipeline

## Implemented scope

The exact USA/Europe Rev 1 ROM (SHA-256
`729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`)
supports extraction, AI translation, Thai font generation, pointer relocation,
and download of a new `.gba` file. The original file is not overwritten.

The current manifest yields 2,389 supported dialogue entries. This is NOT a
complete translation of every string in the game. Battle UI, menus, help screens,
specialized layouts, ambiguous source matches and undecoded resources remain
original. Names are retained; known Pokemon, move, ability and item names and
game control tokens are reconstructed locally outside model output.

## Binary implementation

- `scripts/prepare-firered.mjs` matches encoded text and font resources from the
  [pret FireRed source](https://github.com/pret/pokefirered) against the exact ROM.
  The generated manifest contains offsets, hashes and labels, not ROM data.
- Strings are decoded with control parameter lengths; translation uses separate
  prose fragments and restores original tokens in their original order.
- Shaped Thai grapheme clusters are rasterized with Noto Sans Thai and encoded
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
reloading the page. API keys stay server-side in `.env`.

`POST /api/projects` uploads the ROM. `POST /api/projects/<id>/translate` advances
one batch. `GET /api/projects/<id>/export` returns the actual ROM once the selected
dialogue scope is translated. English-to-English export preserves the original.

Only extracted text/context is sent to OpenAI, never the ROM binary. API use is
billable. Requests use `store: false` and structured outputs following the
[official API documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

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
