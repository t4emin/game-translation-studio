// usage: node --experimental-strip-types tools/survey/rom-survey.ts <rom.gba> [--json out.json]
// Deterministic first look at a GBA ROM: strings, offset/pointer tables into them, and font width-table candidates.
// No model involved; results are hints for writing an adapter, not proof.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = process.argv[2];
if (!path) { console.error("usage: rom-survey.ts <rom.gba> [--json out.json]"); process.exit(1); }
const rom = new Uint8Array(readFileSync(path));
const u32 = (a: number) => (rom[a] | rom[a + 1] << 8 | rom[a + 2] << 16 | rom[a + 3] << 24) >>> 0;
const hex = (n: number) => "0x" + n.toString(16).toUpperCase();
const report: Record<string, unknown> = {};

// 1. Header
const ascii = (a: number, n: number) => String.fromCharCode(...rom.subarray(a, a + n)).replace(/\0+$/, "");
report.header = { title: ascii(0xa0, 12), gameCode: ascii(0xac, 4), maker: ascii(0xb0, 2), version: rom[0xbc], size: rom.length, sha256: createHash("sha256").update(rom).digest("hex") };
let freeTail = rom.length; while (freeTail > 0 && (rom[freeTail - 1] === 0xff || rom[freeTail - 1] === 0)) freeTail--;
report.freeTailBytes = rom.length - freeTail;

// 2. Strings: runs of printable Latin-1 ending in a zero byte, at least 8 chars, with letters/spaces dominating.
const isText = (b: number) => (b >= 0x20 && b < 0x7f) || b === 0x0a || b >= 0xc0;
type Str = { at: number; len: number };
const strings: Str[] = [];
for (let i = 0; i < rom.length;) {
  if (!isText(rom[i])) { i++; continue; }
  let j = i; while (j < rom.length && isText(rom[j])) j++;
  if (rom[j] === 0 && j - i >= 8) {
    let letters = 0; for (let k = i; k < j; k++) if (/[A-Za-z ]/.test(String.fromCharCode(rom[k]))) letters++;
    if (letters / (j - i) > 0.7 && /[a-z]{3}/.test(String.fromCharCode(...rom.subarray(i, Math.min(j, i + 64))))) strings.push({ at: i, len: j - i });
  }
  i = j + 1;
}
const starts = new Set(strings.map((s) => s.at));
// Density per 64 KiB block, merged into regions with text.
const blocks = new Map<number, number>();
for (const s of strings) blocks.set(s.at >> 16, (blocks.get(s.at >> 16) ?? 0) + s.len);
const regions: { from: number; to: number; strings: number; bytes: number }[] = [];
for (const [blk, bytes] of [...blocks].sort((a, b) => a[0] - b[0])) {
  const last = regions.at(-1);
  if (last && blk * 0x10000 - last.to <= 0x10000) { last.to = (blk + 1) * 0x10000; last.bytes += bytes; } else regions.push({ from: blk * 0x10000, to: (blk + 1) * 0x10000, strings: 0, bytes });
}
for (const r of regions) r.strings = strings.filter((s) => s.at >= r.from && s.at < r.to).length;
report.strings = { count: strings.length, regions: regions.filter((r) => r.bytes > 2000).map((r) => ({ from: hex(r.from), to: hex(r.to), strings: r.strings, bytes: r.bytes })) };

// 3. Pointer tables: runs of >= 16 consecutive u32 values 0x08xxxxxx, most landing on a string start.
const ptrTables: unknown[] = [];
for (let a = 0; a + 64 <= rom.length; a += 4) {
  let n = 0, hit = 0;
  while (a + n * 4 + 4 <= rom.length) {
    const v = u32(a + n * 4);
    if (v < 0x08000000 || v >= 0x08000000 + rom.length) break;
    if (starts.has(v - 0x08000000)) hit++;
    n++;
  }
  if (n >= 16 && hit / n > 0.5) { ptrTables.push({ at: hex(a), count: n, hitsOnStrings: hit }); a += n * 4 - 4; }
}
report.pointerTables = ptrTables;

// 4. Offset tables: ascending u32 runs whose values, plus a base, land on string starts (like Yu-Gi-Oh!'s 0x58ACDC table).
// Cheap pre-filter: ascending runs of >= 64 small values; then test candidate bases drawn from nearby string starts.
// A target counts if text starts there: 12 bytes of printable ASCII (with letters) or valid Shift-JIS pairs.
// Graphics data rarely passes. Line indexes (offsets to wrapped lines inside one string) pass too, so zero-preceded is reported separately.
const looksLikeText = (at: number) => {
  let letters = 0, k = at;
  while (k < at + 12 && k < rom.length) {
    const b = rom[k];
    if (b >= 0x20 && b < 0x7f) { if (/[A-Za-z]/.test(String.fromCharCode(b))) letters++; k++; }
    else if (((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef)) && rom[k + 1] >= 0x40 && rom[k + 1] <= 0xfc) k += 2;
    else if (b >= 0xc0 && b !== 0xff && k > at) k++;
    else if (b === 0 && k >= at + 3) break;
    else return false;
  }
  return letters >= 2 || (rom[at] >= 0x81 && rom[at] <= 0xef);
};
const offTables: unknown[] = [];
for (let a = 0; a + 256 <= rom.length; a += 4) {
  let n = 1, prev = u32(a);
  if (prev > 0x1000) continue;
  while (a + n * 4 + 4 <= rom.length) {
    const v = u32(a + n * 4);
    if (v < prev || v > 0x400000 || v - prev > 0x4000) break;
    prev = v; n++;
  }
  if (n < 64) continue;
  const avg = (prev - u32(a)) / n; if (avg < 3 || avg > 400) { a += n * 4 - 4; continue; }
  const last = a + n * 4;
  // The blob usually follows the table (after padding); try the next string starts after the table end as the base.
  // Blobs can start with non-Latin text (Shift-JIS), so any non-zero byte after a zero byte counts as a start.
  const nearby: Str[] = [{ at: last, len: 0 }];
  for (let p = last; p < last + 0x400 && nearby.length < 4; p++) if (rom[p] !== 0 && rom[p - 1] === 0) nearby.push({ at: p, len: 0 });
  let best: { base: number; hit: number; zp: number } | undefined;
  for (const s of nearby) {
    let hit = 0, zp = 0; const sample = Math.min(n, 200);
    for (let k = 0; k < sample; k++) { const at = s.at + u32(a + k * 4); if (at < rom.length && (starts.has(at) || looksLikeText(at))) { hit++; if (rom[at - 1] === 0) zp++; } }
    if (!best || hit > best.hit) best = { base: s.at, hit, zp };
  }
  if (best && best.hit / Math.min(n, 200) > 0.85) offTables.push({ at: hex(a), count: n, base: hex(best.base), hitRate: +(best.hit / Math.min(n, 200)).toFixed(2), kind: best.zp / best.hit > 0.8 ? "string-table" : "line-index" });
  a += n * 4 - 4;
}
report.offsetTables = offTables;

// 5. Font width tables: >= 96 consecutive bytes in 1..16 with a space-like narrow entry, not mostly constant.
const widthTables: unknown[] = [];
for (let a = 0; a + 96 <= rom.length;) {
  let n = 0; const seen = new Set<number>();
  while (a + n < rom.length && rom[a + n] >= 1 && rom[a + n] <= 16) { seen.add(rom[a + n]); n++; }
  if (n >= 96 && seen.size >= 5) { widthTables.push({ at: hex(a), length: n, distinct: seen.size }); a += n; } else a += Math.max(n, 1);
}
report.widthTableCandidates = widthTables.slice(0, 40);

// 6. Literal-pool references: how many strings are pointed at from outside any pointer table (UI strings).
const inTables = new Set<number>();
for (const t of ptrTables as { at: string; count: number }[]) for (let k = 0; k < t.count; k++) inTables.add(parseInt(t.at, 16) + k * 4);
let literal = 0;
for (let a = 0; a + 4 <= rom.length; a += 4) { const v = u32(a); if (v >= 0x08000000 && v < 0x08000000 + rom.length && starts.has(v - 0x08000000) && !inTables.has(a)) literal++; }
report.literalPoolStringRefs = literal;

console.log(JSON.stringify(report, null, 2));
const out = process.argv.indexOf("--json");
if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2));
