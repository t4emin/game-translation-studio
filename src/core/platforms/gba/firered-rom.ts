import manifest from "../../adapters/gba/data/firered-rev1.json" with { type: "json" };
import { decodePokemonText, decodeMap, placeholders, controlLengths } from "./pokemon-gen3-text.ts";
import { digest, protectedPokemonNames } from "./pokemon-gen3-resources.ts";
import type { TranslationEntry } from "../../types.ts";

export { manifest };
export { digest };
export function verifyRom(bytes: Uint8Array) {
  if (digest(bytes) !== manifest.checksum) throw new Error("This file is not the original FireRed USA/Europe Rev 1 ROM.");
}

const nameCache=new WeakMap<Uint8Array,string[]>();
export function protectedNames(bytes:Uint8Array):string[] {
  let names=nameCache.get(bytes);
  if(!names) nameCache.set(bytes,names=protectedPokemonNames(bytes,[...manifest.preservedNames,"OAK","BILL","BROCK","MISTY","LT. SURGE","ERIKA","KOGA","SABRINA","BLAINE","GIOVANNI","LORELEI","BRUNO","AGATHA","LANCE"]));
  return names;
}

type ManifestEntry = { offset:number; length:number; hash:string; label:string; path:string; references:number[]; category?:string; maxBytes?:number };
// Menus, Pokedex pages and descriptions stay in the manifest but need per-window layout rules before they can be rebuilt.
const buildableCategories: Record<string, TranslationEntry["category"]> = { dialog: "dialog", battle: "system" };

export function extractDialogs(bytes: Uint8Array): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  for (const record of manifest.entries as ManifestEntry[]) {
    const category = buildableCategories[record.category ?? "dialog"];
    if (!category) continue;
    // These screens use specialized layout/rendering rather than normal dialogue.
    if (/help_system|trainer_card|flavor_text|fame_checker/.test(record.path)) continue;
    if (record.offset + record.length > bytes.length) continue;
    const raw = bytes.slice(record.offset, record.offset + record.length);
    if (digest(raw) !== record.hash) continue;
    const decoded = decodePokemonText(raw, 0, raw.length);
    if (decoded.unknownBytes.length || /\[CTRL:(06|0C|15)/.test(decoded.text)) continue;
    entries.push({
      id: `dialog-${record.offset.toString(16)}`, sourceText: decoded.text,
      translatedText: "", sourceLanguage: "english", targetLanguage: "thai", category,
      context: record.label, resource: { offset: record.offset, path: record.path },
      // Battle text is expanded into a 300-byte buffer: allow 200 bytes, or the original length when the game already prints more.
      constraints: { maxBytes: record.maxBytes ?? (category === "system" ? Math.max(200, record.length) : 900), fixedLength: false }, protectedTokens: decoded.protectedTokens,
      status: "untranslated", warnings: []
    });
  }
  return entries;
}

const reverse = new Map<string, number>();
for (const [byte, text] of decodeMap) if (!reverse.has(text)) reverse.set(text, byte);
reverse.set("'", 0xb4); reverse.set('"', 0xb2); reverse.set("…", 0xb0); reverse.set("·", 0xaf);
export function latinByte(char: string): number {
  const value = reverse.get(char);
  if (value === undefined) throw new Error(`Character cannot be encoded: ${char}`);
  return value;
}
export function tokenBytes(token: string): number[] {
  const line = reverse.get(token);
  if (line !== undefined) return [line];
  const m = token.match(/^\[(VAR|CTRL|BYTE|SYMBOL|KEY):([^\]]+)\]$/);
  if (!m) throw new Error(`Unknown control token ${token}`);
  if (m[1] === "VAR") {
    const known = [...placeholders].find(([,text]) => text === token)?.[0];
    if (known !== undefined) return [0xfd, known];
    if (/^[0-9A-F]{2}$/.test(m[2])) return [0xfd, parseInt(m[2],16)];
    throw new Error(`Unknown placeholder ${token}`);
  }
  if (!/^(?:[0-9A-F]{2})+$/.test(m[2])) throw new Error(`Invalid token ${token}`);
  const bytes = [...Buffer.from(m[2],"hex")];
  if (m[1] === "CTRL" && bytes.length !== 1 + controlLengths[bytes[0]]) throw new Error(`Invalid control length ${token}`);
  return [m[1] === "CTRL" ? 0xfc : m[1] === "SYMBOL" ? 0xf9 : m[1] === "KEY" ? 0xf8 : -1, ...bytes].filter(n=>n>=0);
}

export function validateTranslation(source: string, translated: string) {
  if (!translated.trim()) throw new Error("Empty translation");
  const expected = controlTokens(source);
  if (JSON.stringify(expected) !== JSON.stringify(controlTokens(translated))) {
    const hint = expected.length ? ` Expected, in order: ${expected.map((token) => token.replace(/^\[(NEW_LINE|PROMPT_\w+)\]$/, "↵")).join(" ")}` : " This message has none.";
    throw new Error(`Translation changed the order or number of game control tokens.${hint}`);
  }
  if (translated.length > 5000) throw new Error("Translation is too long");
}

export function controlTokens(text: string): string[] {
  return text.match(/\[[^\]]+\]/g) ?? [];
}

// The editor shows [NEW_LINE]/[PROMPT_*] as real line breaks, so typed breaks are turned back into those tokens.
export function restoreLineBreakTokens(source: string, translated: string): string {
  if (!/[\r\n]/.test(translated)) return translated;
  const prompts = controlTokens(source).filter((token) => /^\[PROMPT_(CLEAR|SCROLL)\]$/.test(token));
  let nextPrompt = 0;
  return translated.replace(/(?:[ \t]*\r?\n)+[ \t]*/g, (run) => {
    const breaks = (run.match(/\n/g) ?? []).length;
    if (breaks === 1) return "[NEW_LINE]";
    return prompts[nextPrompt++] ?? "[PROMPT_CLEAR]";
  });
}

export function restoreTrailingControlTokens(source: string, translated: string): string {
  const sourceTokens = controlTokens(source);
  const translatedTokens = controlTokens(translated);
  if (sourceTokens.length === translatedTokens.length) return translated;
  if (translatedTokens.length > sourceTokens.length) return translated;
  if (!translatedTokens.every((token, index) => token === sourceTokens[index])) return translated;
  const missing = sourceTokens.slice(translatedTokens.length);
  const suffixPattern = new RegExp(`${missing.map(escapeRegExp).join("\\s*")}\\s*$`);
  if (!suffixPattern.test(source)) return translated;
  return `${translated.trimEnd()}${missing.join("")}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface EncodedEntry { id: string; bytes: Uint8Array }
export function relocateDialogs(original: Uint8Array, encoded: EncodedEntry[], patchedFonts?: Uint8Array): Buffer {
  verifyRom(original);
  if (!encoded.length) throw new Error("No translated text to export.");
  const known = new Map(extractDialogs(original).map(e=>[e.id,e]));
  const records = new Map((manifest.entries as ManifestEntry[]).map(e=>[e.offset,e]));
  const seen = new Set<string>();
  const total = encoded.reduce((n,e)=>n+e.bytes.length+3,0);
  if (original.length + total > 0x2000000) throw new Error("Translated ROM exceeds the GBA 32 MiB limit.");
  const output = Buffer.alloc(Math.ceil((original.length+total)/0x100000)*0x100000,0xff);
  output.set(patchedFonts ?? original);
  let cursor=original.length;
  for (const entry of encoded) {
    if (seen.has(entry.id)) throw new Error(`Duplicate entry ${entry.id}`);
    seen.add(entry.id);
    const extracted=known.get(entry.id);
    const record=extracted && records.get(extracted.resource.offset!);
    if (!record) throw new Error(`Unrecognized entry ${entry.id}`);
    if (entry.bytes.length > (extracted?.constraints.maxBytes ?? 900) || entry.bytes.at(-1)!==0xff || entry.bytes.slice(0,-1).includes(0xff)) throw new Error(`Invalid or oversized encoded text: ${entry.id}`);
    cursor=(cursor+3)&~3;
    output.set(entry.bytes,cursor);
    for (const reference of record.references) {
      if (Buffer.from(original.buffer,original.byteOffset,original.byteLength).readUInt32LE(reference) !== 0x08000000+record.offset) throw new Error("Original text pointer mismatch");
      output.writeUInt32LE(0x08000000+cursor,reference);
    }
    cursor+=entry.bytes.length;
  }
  return output;
}
