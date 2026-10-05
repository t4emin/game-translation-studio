// usage: node --experimental-strip-types tools/translate/merge.ts <emerald|minish> map1.json [map2.json ...]
// Map files live in .local/translate-work/ (gitignored).
// Map files: {"shortId": "compact thai"}; compact markers ↵ ¶ ⇣ expand to game tokens.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { pokemonEmeraldAdapter } from "../../src/core/adapters/gba/pokemon-emerald.ts";
import { zeldaMinishCapAdapter } from "../../src/core/adapters/gba/zelda-minish-cap.ts";
import { splitTextClusters, isThaiCluster } from "../../src/core/platforms/gba/thai-font-pipeline.ts";
const root = new URL("../../", import.meta.url).pathname;
const dir = root + ".local/translate-work";
const game = process.argv[2];
const cfg = game === "emerald"
  ? { adapter: pokemonEmeraldAdapter, rom: "Pokemon - Emerald Version (USA, Europe).gba", prefix: "emerald-candidate-", short: "e:", file: "gba-pokemon-emerald-bpee-v0.thai.json" }
  : { adapter: zeldaMinishCapAdapter, rom: "Legend of Zelda, The - The Minish Cap (USA).gba", prefix: "minish-", short: "z:", file: "gba-zelda-minish-cap-bzme-v0.thai.json" };
const bytes = new Uint8Array(readFileSync(`${root}reference-roms/${cfg.rom}`));
const context: any = { file: { name: "x.gba", size: bytes.length, extension: ".gba", bytes }, metadata: {}, adapterId: cfg.adapter.id };
const sources = new Map((await cfg.adapter.extract(context)).entries.map((e) => [e.id, e]));
const outPath = `${root}translations/${cfg.file}`;
const existing = new Map<string, string>();
if (existsSync(outPath)) for (const e of JSON.parse(readFileSync(outPath, "utf8")).entries) existing.set(e.id, e.translatedText);
const expand = (t: string) => t.replaceAll("↵", "[NEW_LINE]").replaceAll("¶", "[PROMPT_CLEAR]").replaceAll("⇣", "[PROMPT_SCROLL]");
const incoming = new Map<string, string>();
for (const f of process.argv.slice(3)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Record<string, string>)) {
  const id = k.startsWith(cfg.short) ? cfg.prefix + k.slice(cfg.short.length) : k;
  if (!sources.has(id)) { console.log("UNKNOWN", k); continue; }
  incoming.set(id, expand(v));
}
const all = new Map([...existing, ...incoming]);
const toEntries = (m: Map<string, string>) => [...m].map(([id, t]) => ({ ...sources.get(id)!, translatedText: t, status: "translated" as const }));
let result = await cfg.adapter.validateTranslations(context, toEntries(all));
if (result.issues.some((i) => !i.entryId)) { for (const i of result.issues) console.log("GLOBAL |", i.message); console.log("ABORTED: nothing saved"); process.exit(1); }
const bad = new Set(result.issues.filter((i) => i.entryId && incoming.has(i.entryId)).map((i) => i.entryId!));
for (const i of result.issues) console.log(i.entryId ? i.entryId.replace(cfg.prefix, cfg.short) : "GLOBAL", "|", i.message);
for (const id of bad) all.delete(id);
// Entries that were already stored but now fail (should not happen) are dropped as well.
for (const i of result.issues) if (i.entryId && !incoming.has(i.entryId)) { console.log("STORED BAD", i.entryId); all.delete(i.entryId); }
const clusters = new Set<string>();
for (const t of all.values()) for (const c of splitTextClusters(t)) if (isThaiCluster(c)) clusters.add(c);
const entries = [...all].map(([id, translatedText]) => { const s = sources.get(id)!; return { id, sourceHash: createHash("sha256").update(s.sourceText).digest("hex"), sourceText: s.sourceText, translatedText, status: "translated", warnings: [], translationVersion: 1 }; });
entries.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(outPath, JSON.stringify({ version: 1, game: cfg.adapter.id, sourceLanguage: "english", targetLanguage: "thai", entryCount: entries.length, generatedFrom: "local-reviewed-project", entries }, null, 2) + "\n");
console.log(`saved ${entries.length}/${sources.size} (new ok ${[...incoming.keys()].filter((id) => all.has(id)).length}, rejected ${bad.size}); unique Thai clusters ${clusters.size}`);
