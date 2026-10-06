// usage: node --experimental-strip-types tools/translate/show.ts <emerald|minish|ygo> [start=0] [count=40] [category]
// Prints untranslated, translatable entries as `short-id | text` (↵ = [NEW_LINE], ¶ = [PROMPT_CLEAR], ⇣ = [PROMPT_SCROLL]).
// Emerald: entries that do not start right after a 0xFF terminator are fragments of another string (a pointer into the middle
// of it, or junk); they are hidden unless FRAGMENTS=1. Translate whole strings first.
// Also writes the extraction cache used by tm.py to .local/translate-work/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { pokemonEmeraldAdapter } from "../../src/core/adapters/gba/pokemon-emerald.ts";
import { zeldaMinishCapAdapter } from "../../src/core/adapters/gba/zelda-minish-cap.ts";
import { yugiohWctAdapter } from "../../src/core/adapters/gba/yugioh-wct-2004.ts";
const root = new URL("../../", import.meta.url).pathname;
const game = process.argv[2];
const start = Number(process.argv[3] ?? 0), count = Number(process.argv[4] ?? 40), category = process.argv[5];
const cfg = game === "emerald"
  ? { adapter: pokemonEmeraldAdapter, rom: "Pokemon - Emerald Version (USA, Europe).gba", prefix: "emerald-candidate-", short: "e:", file: "gba-pokemon-emerald-bpee-v0.thai.json" }
  : game === "ygo"
  ? { adapter: yugiohWctAdapter, rom: "1435 - Yu-Gi-Oh! - World Championship Tournament 2004 (E)(GBA).gba", prefix: "ygo-desc-", short: "y:", file: "gba-yugioh-wct-2004-bywp-v0.thai.json" }
  : { adapter: zeldaMinishCapAdapter, rom: "Legend of Zelda, The - The Minish Cap (USA).gba", prefix: "minish-", short: "z:", file: "gba-zelda-minish-cap-bzme-v0.thai.json" };
const bytes = new Uint8Array(readFileSync(`${root}reference-roms/${cfg.rom}`));
const entries = (await cfg.adapter.extract({ file: { name: "x.gba", size: bytes.length, extension: ".gba", bytes }, metadata: {}, adapterId: cfg.adapter.id } as any)).entries as any[];
mkdirSync(`${root}.local/translate-work`, { recursive: true });
if (game === "emerald") writeFileSync(`${root}.local/translate-work/emerald_entries.json`, JSON.stringify(entries.map((e) => ({ id: e.id, t: e.sourceText, c: e.category }))));
const file = `${root}translations/${cfg.file}`;
const done = new Set<string>(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).entries.map((e: any) => e.id) : []);
const isFragment = (e: any) => game === "emerald" && bytes[parseInt(e.id.slice(cfg.prefix.length), 16) - 1] !== 0xff;
const hideFragments = !process.env.FRAGMENTS;
const rest = entries.filter((e) => !done.has(e.id) && e.category !== "name" && (!category || e.category === category) && !(hideFragments && isFragment(e)));
console.log(`# ${rest.length} untranslated (of ${entries.length})`);
for (const e of rest.slice(start, start + count))
  console.log(`${cfg.short}${e.id.slice(cfg.prefix.length)} | ${e.sourceText.replaceAll("[NEW_LINE]", "↵").replaceAll("[PROMPT_CLEAR]", "¶").replaceAll("[PROMPT_SCROLL]", "⇣")}`);
