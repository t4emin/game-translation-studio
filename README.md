# Game Translation Studio

GBA-only translation workbench: analyze `.gba` ROMs, translate supported projects,
and export playable ROMs only when a FULL adapter exists.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Translation is local-only. FireRed Thai translation
uses checked-in/local translation JSON files; if a translation is missing or
invalid, the app stops and asks for local data instead of calling any external
API. Project progress is stored under .local/ and survives page reloads. The
source ROM is never overwritten.

## Deployment Note

The full ROM workflow uploads a 16 MiB `.gba` and exports a 17 MiB patched
`.gba`. Vercel Functions reject payloads around 4.5 MiB, so the hosted Vercel
version can show the UI but cannot run the upload/export pipeline as-is. Run the
app locally, or deploy it to a persistent Node server that allows 16-17 MiB
request/response bodies and writable project storage.

## License and ROMs

Code: AGPL-3.0-only (`LICENSE`). Thai font and translations: CC BY 4.0 (`LICENSE-ASSETS.md`).

No game ROM is included. You must supply your own legally obtained ROM, and the
project is not affiliated with Nintendo, Game Freak or Creatures. If you host
this app, do not keep users' ROMs on the server longer than the upload > process >
export flow needs, and do not offer exported ROMs as public downloads.

## Supported Input

Pokemon FireRed Version (USA/Europe), Rev 1, BPRE.
SHA-256: `729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`.

Currently translates 3,881 messages: 3,481 dialogue/story entries (including the
opening scene and trainer battle text) and 400 battle messages. An entry without a
local translation stays in English in the export. Names and the
naming keyboard stay unchanged, and translations must keep protected names in
English. Menus, Pokedex pages, descriptions and help screens remain original;
this is not a 100% translation of every screen.

Pokemon Emerald Version (USA/Europe), BPEE, is supported as an experimental
project. It extracts high-confidence Gen 3 text candidates and can export
rebuilt ROMs by relocating changed text, patching verified pointer references
and generating Thai glyphs into the verified Normal, Narrow and Short font banks
(528 glyph slots; slots 0x1D0-0x1DF hold game symbols and are left alone). 6,191 of
the 6,329 extracted messages have Thai translations (staff credits and a few names stay English) (NPC dialogue, Battle Frontier,
item, move and Pokedex descriptions, Match Call and menu text). Emulator verification
is still pending.

The Legend of Zelda: The Minish Cap (USA), BZME, is a supported
project. It reads the game's own message table (2,460 translatable messages; names (NPCs, items, places, characters) and
staff credits stay in English), writes a new table and Thai glyph banks into the free end of
the ROM, and repoints the language and font tables without patching game code. All 2,460
translatable messages (menus and dialogue, 100%) have Thai translations; names and staff credits stay in English.
Played in an emulator by the maintainer with the full translation applied, with no problems
found (not a frame-by-frame audit of every message).

Other `.gba` files can be analyzed in Generic / Experimental mode, but safe
injection and export are blocked unless a FULL adapter exists. PSP, PS2, ISO,
CSO and other consoles are not V1 targets.

Thai output includes shaped glyphs, relocated strings and updated pointers.
English-to-English export preserves the source ROM. Downloads are new files.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The translated opening scene has been tested in mGBA 0.10.5. This does not replace
a full-game playthrough. See [ROM_PIPELINE.md](ROM_PIPELINE.md) for implementation,
limits, sources and verification details.
