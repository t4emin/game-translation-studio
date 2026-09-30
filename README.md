# Game Translation Studio

GBA-only translation workbench: analyze `.gba` ROMs, translate supported projects,
and export playable ROMs only when a FULL adapter exists.

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

## Deployment Note

The full ROM workflow uploads a 16 MiB `.gba` and exports a 17 MiB patched
`.gba`. Vercel Functions reject payloads around 4.5 MiB, so the hosted Vercel
version can show the UI but cannot run the upload/export pipeline as-is. Run the
app locally, or deploy it to a persistent Node server that allows 16-17 MiB
request/response bodies and writable project storage.

## Supported Input

Pokemon FireRed Version (USA/Europe), Rev 1, BPRE.
SHA-256: `729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059`.

Currently translates 2,389 matched dialogue/story entries, including the opening
scene. Names stay unchanged. Battle UI, menus, specialized help screens and
unmatched resources remain original; this is not a 100% translation of every
screen. Other `.gba` files can be analyzed in Generic / Experimental mode, but
safe injection and export are blocked unless a FULL adapter exists. PSP, PS2,
ISO, CSO and other consoles are not V1 targets.

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
