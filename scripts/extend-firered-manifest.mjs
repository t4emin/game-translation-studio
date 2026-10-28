import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Append source-matched strings the base manifest misses (C strings, trainer battle text, short or repeated lines).
// Existing entries are kept byte-for-byte so translation IDs stay stable.
const [source, romPath] = process.argv.slice(2);
if (!source || !romPath) throw new Error('Usage: node scripts/extend-firered-manifest.mjs PRET_SOURCE ROM');
const manifestPath = 'src/core/adapters/gba/data/firered-rev1.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const rom = readFileSync(romPath);
const hash = (data) => createHash('sha256').update(data).digest('hex');
if (hash(rom) !== manifest.checksum) throw new Error('Wrong ROM revision');

const charmap = new Map();
for (const line of readFileSync(join(source, 'charmap.txt'), 'utf8').split('\n')) {
  const m = line.match(/^('(?:\\.|[^'])*'|[A-Za-z_0-9]+)\s*=\s*((?:[A-F0-9]{2}(?:\s+|$))+)/);
  if (!m) continue;
  const key = m[1].startsWith("'") ? m[1].slice(1, -1).replace(/\\'/g, "'") : `{${m[1]}}`;
  charmap.set(key, m[2].trim().split(/\s+/).map((v) => parseInt(v, 16)));
}
charmap.set('\\n', [0xfe]); charmap.set('\\p', [0xfb]); charmap.set('\\l', [0xfa]);
charmap.set('\\"', charmap.get('”')); charmap.set('$', [0xff]);
const plainKeys = [...charmap.keys()].filter((k) => !k.startsWith('{')).sort((a, b) => b.length - a.length);
function encode(text) {
  const bytes = [];
  for (let p = 0; p < text.length;) {
    if (text[p] === '{') {
      const end = text.indexOf('}', p);
      if (end < 0) throw new Error('Unclosed token');
      for (const word of text.slice(p + 1, end).split(/\s+/).filter(Boolean)) {
        const value = charmap.get(`{${word}}`);
        if (value) bytes.push(...value);
        else if (/^(0x[0-9A-Fa-f]+|\d+)$/.test(word)) bytes.push(Number(word) & 255);
        else throw new Error(`Unknown token ${word}`);
      }
      p = end + 1;
      continue;
    }
    const key = plainKeys.find((k) => text.startsWith(k, p));
    if (!key) throw new Error(`Unknown charmap text ${text.slice(p, p + 10)}`);
    bytes.push(...charmap.get(key)); p += key.length;
  }
  if (bytes.at(-1) !== 0xff) bytes.push(0xff);
  return Buffer.from(bytes);
}
function* walk(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    if (f.isDirectory()) yield* walk(path); else if (/\.(inc|s|c|h)$/.test(f.name)) yield path;
  }
}
function categoryOf(path) {
  if (/battle_message|battle/.test(path) && path.startsWith('src/')) return 'battle';
  if (/pokedex_text/.test(path)) return 'pokedex';
  if (/description|abilities\.h|item/.test(path) && path.startsWith('src/')) return 'description';
  if (path.startsWith('src/')) return 'menu';
  return 'dialog';
}

const strings = [];
// Strings the game copies into small RAM buffers (20 bytes or less) cannot grow, so they are never offered for translation.
const fixedBuffer = new Set(['sText_StatSharply', 'gBattleText_Rose', 'sText_StatHarshly', 'sText_StatFell', 'sText_ABoosted',
  'gText_Sleep', 'gText_Poison', 'gText_Burn', 'gText_Paralysis', 'gText_Ice', 'gText_Confusion', 'gText_Love',
  'sText_Accuracy', 'sText_Evasiveness', 'sText_Someones', 'sText_AllyPkmnPrefix', 'sText_AllyPkmnPrefix2', 'sText_AllyPkmnPrefix3',
  'gText_Loss', 'gText_Draw', 'gText_BattleSwitchWhich']);
// "a NORMAL move" fragments are spliced into the 16-byte battle text buffers; Pokeblock lines are unused in FireRed.
const fixedBufferPattern = /^gText_An?[A-Z][a-z]+Move$|^sText_PokeblockWasToo/;
for (const root of ['data', 'src']) for (const path of walk(join(source, root))) {
  const content = readFileSync(path, 'utf8');
  const rel = relative(source, path);
  if (/\.(inc|s)$/.test(path)) {
    for (const m of content.matchAll(/^(\w+)::?[^\n]*\n((?:[ \t]*\.string[^\n]*\n)+)/gm))
      strings.push({ path: rel, label: m[1], text: [...m[2].matchAll(/\.string\s+"((?:\\.|[^"\\])*)"/g)].map((x) => x[1]).join('') });
  } else {
    for (const m of content.matchAll(/String(?:Copy|Append)\w*\(\s*([^,;]+),\s*([gs]\w+)/g)) if (m[1].trim() !== 'gStringVar4') fixedBuffer.add(m[2]);
    for (const m of content.matchAll(/\b([gs]Text_\w+|gBattleText_\w+)\s*\+\s*\d/g)) fixedBuffer.add(m[1]);
    for (const m of content.matchAll(/(?:(\w+)\s*\[[^\]]*\]\s*=\s*|(\[\w+\])\s*=\s*|)_\(\s*((?:"(?:\\.|[^"\\])*"\s*)+)\)/g))
      strings.push({ path: rel, label: m[1] ?? m[2] ?? 'anonymous', text: [...m[3].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((x) => x[1]).join('') });
  }
}

// Word-aligned pointers cover C tables and literal pools; script commands embed unaligned pointers inside event script data.
const base = manifest.entries.filter((e) => !e.category);
const baseRefs = base.flatMap((e) => e.references);
const scriptStart = Math.min(...baseRefs.filter((p) => p % 4)), scriptEnd = Math.max(...baseRefs.filter((p) => p % 4));
const references = new Map();
// Text pointers stop at the move description table; later data is graphics and audio.
for (let p = 0x200; p < 0x490000; p++) {
  if (rom[p + 3] !== 0x08) continue;
  if (p % 4 !== 0 && (p < scriptStart || p > scriptEnd)) continue;
  const target = rom.readUInt32LE(p) - 0x08000000;
  if (!references.has(target)) references.set(target, []);
  references.get(target).push(p);
}

const taken = new Set(base.map((e) => e.offset));
let skippedFixed = 0;
const added = [], stats = {};
for (const item of strings) {
  // Names, labels and the naming-screen keyboard stay in the source language.
  if (!/[a-z]{3}/.test(item.text) || /keyboard_text/.test(item.path)) continue;
  if (fixedBuffer.has(item.label) || fixedBufferPattern.test(item.label)) { skippedFixed++; continue; }
  let bytes; try { bytes = encode(item.text); } catch { continue; }
  if (bytes.length < 4) continue;
  const hits = [];
  for (let p = rom.indexOf(bytes); p >= 0 && hits.length < 64; p = rom.indexOf(bytes, p + 1)) hits.push(p);
  const offset = hits.find((p) => !taken.has(p) && references.has(p));
  if (offset === undefined) continue;
  taken.add(offset);
  const category = categoryOf(item.path);
  const refs = references.get(offset);
  // trainerbattle (0x5C) defeat text is expanded into the 300-byte battle display buffer, so it gets a tighter byte cap.
  // Intro text (first pointer, except in the no-intro and early-rival layouts) is shown by the field script and keeps the normal cap.
  const fieldIntro = (p) => rom[p - 6] === 0x5c && rom[p - 5] !== 3 && rom[p - 5] !== 9;
  const trainerText = refs.some((p) => p % 4 !== 0 && !(rom[p - 2] === 0x0f && rom[p - 1] === 0) && rom[p - 1] !== 0x67 && !fieldIntro(p));
  added.push({ offset, length: bytes.length, hash: hash(bytes), label: item.label, path: item.path, references: refs, category, ...(trainerText ? { maxBytes: 250 } : {}) });
  stats[category] = (stats[category] ?? 0) + 1;
}
manifest.entries = [...base, ...added].sort((a, b) => a.offset - b.offset);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ base: base.length, skippedFixed, added: added.length, stats, scriptRange: [scriptStart.toString(16), scriptEnd.toString(16)] }));
