# Game Translation Studio

Local FireRed ROM translation: upload, translate, export a playable .gba.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Thai FireRed translation runs local-first from
`translations/pokemon-firered-rev1.thai.json`, so an OPENAI_API_KEY is not
required for the currently supported text set. If the local file is missing or
has invalid entries and OPENAI_API_KEY is configured, the app automatically uses
OpenAI only for those missing/invalid messages. Only extracted text/context is
sent to OpenAI; the ROM stays on this machine. API usage is billable. Translation
progress and cached results are stored under .local/ and survive page reloads.
The source ROM is never overwritten.

## Supported Input

Pokemon FireRed Version (USA/Europe), Rev 1, BPRE.
SHA-256: `729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`.

Currently translates 2,389 matched dialogue/story entries, including the opening
scene. Names stay unchanged. Battle UI, menus, specialized help screens and
unmatched resources remain original; this is not a 100% translation of every
screen. PSP/PS2 and other ROM revisions are not supported.

Thai output includes shaped glyphs, relocated strings and updated pointers.
English-to-English export preserves the source ROM. Downloads are new files.

## Verification

```bash
npm test
npm run typecheck
npm run build
TEST_ROM_PATH='/path/to/FireRed Rev 1.gba' npm test
```

The translated opening scene has been tested in mGBA 0.10.5. This does not replace
a full-game playthrough. See [ROM_PIPELINE.md](ROM_PIPELINE.md) for implementation,
limits, sources and verification details.
