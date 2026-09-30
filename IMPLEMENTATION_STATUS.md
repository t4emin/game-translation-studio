# Implementation Status

## Implemented

- Exact FireRed Rev 1 fingerprint and source-matched text/font manifest.
- 2,389 dialogue/story entries plus read-only name tables.
- OpenAI translation wired to persistent local projects and cache.
- Names and control tokens restored locally outside model output.
- Pause/resume, progress, failed-message editing and original-language export.
- Thai grapheme shaping, rasterization and four extended font banks.
- Appended text resources, validated pointer updates and real .gba downloads.
- Black terminal interface: Upload, Translate, Export; radio language controls.

## Verification

- Unit and real-ROM integration tests verify token preservation, name preservation,
  nonempty Thai glyphs, output limits, unchanged input and exact changed-byte ranges.
- Desktop/mobile browser tests upload the real ROM and download patched output.
- The completed 2,389-message build exports as a 17 MiB ROM using 493 Thai glyphs.
- All 2,794 redirected text references and original-range byte changes verified.
- mGBA 0.10.5 runs the full output for 24,000 frames, displaying Thai in the
  opening scene and bedroom object interaction, and accepts input.
- All four Thai font banks have been exercised in mGBA.

## Limits

Not all game text is covered. Battle UI, menus, specialized help and unmatched
resources remain original. Full-game playthrough is not verified. The current
font atlas supports 768 unique Thai clusters and messages are limited to 900
encoded bytes. PSP and PS2 support remains unimplemented.

See [ROM_PIPELINE.md](ROM_PIPELINE.md) for details.
