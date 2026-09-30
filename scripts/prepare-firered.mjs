import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Build a revision-specific relocation manifest from exact source/ROM matches.
const [source, romPath] = process.argv.slice(2);
if (!source || !romPath) throw new Error('Usage: node scripts/prepare-firered.mjs PRET_SOURCE ROM');
const rom = readFileSync(romPath);
const hash = (data) => createHash('sha256').update(data).digest('hex');
if (hash(rom) !== '729041b940afe031302d630fdbe57c0c145f3f7b6d9b8eca5e98678d0ca4d059') throw new Error('Wrong ROM revision');
const charmap = new Map();
for (const line of readFileSync(join(source, 'charmap.txt'), 'utf8').split('\n')) {
  const m = line.match(/^('(?:\\.|[^'])*'|[A-Z_0-9]+)\s*=\s*((?:[A-F0-9]{2}(?:\s+|$))+)/);
  if (!m) continue;
  const key = m[1].startsWith("'") ? m[1].slice(1,-1).replace(/\\'/g, "'") : `{${m[1]}}`;
  charmap.set(key, m[2].trim().split(/\s+/).map(v => parseInt(v,16)));
}
charmap.set('\\n', [0xfe]); charmap.set('\\p', [0xfb]); charmap.set('\\l', [0xfa]);
charmap.set('\\"', charmap.get('“')); charmap.set('\\$', [0xff]);
const keys = [...charmap.keys()].sort((a,b) => b.length-a.length);
function encode(text) {
  const bytes=[];
  for(let p=0;p<text.length;) {
    const key=keys.find(k=>text.startsWith(k,p));
    if(!key) throw new Error(`Unknown charmap token ${text.slice(p,p+30)}`);
    bytes.push(...charmap.get(key)); p+=key.length;
  }
  if(bytes.at(-1)!==0xff) bytes.push(0xff);
  return Buffer.from(bytes);
}
function* walk(dir) {
  for(const f of readdirSync(dir,{withFileTypes:true})) {
    const path=join(dir,f.name);
    if(f.isDirectory()) yield* walk(path); else if(/\.(inc|s)$/.test(f.name)) yield path;
  }
}
const candidates=new Map(); let unmatched=0; let unparsed=0;
for(const path of [...walk(join(source,'data/maps')), ...walk(join(source,'data/text'))]) {
  const content=readFileSync(path,'utf8');
  const blocks=content.matchAll(/^([\w]+)::?[^\n]*\n((?:[ \t]*\.string[^\n]*\n)+)/gm);
  for(const m of blocks) {
    const text=[...m[2].matchAll(/\.string\s+"((?:\\.|[^"\\])*)"/g)].map(x=>x[1]).join('');
    let bytes; try {bytes=encode(text);}catch{unparsed++;continue;}
    if(bytes.length<12 || !/[a-z]{3}/.test(text)) continue;
    const offset=rom.indexOf(bytes);
    if(offset<0 || rom.indexOf(bytes,offset+1)>=0) {unmatched++;continue;}
    candidates.set(offset,{offset,length:bytes.length,hash:hash(bytes),label:m[1],path:relative(source,path),references:[]});
  }
}
// Script text references are byte-aligned; code literals and tables are word-aligned.
// Restrict scanning to code/scripts/text data, excluding graphical assets.
for(let p=0x200;p<0x480000;p++) {
  const target=rom.readUInt32LE(p)-0x08000000;
  const entry=candidates.get(target);
  if(!entry) continue;
  const scriptLoad=rom[p-2]===0x0f && rom[p-1]===0;
  const scriptMessage=rom[p-1]===0x67;
  if(p%4===0 || scriptLoad || scriptMessage) entry.references.push(p);
}
const entries=[...candidates.values()].filter(e=>e.references.length).sort((a,b)=>a.offset-b.offset);
const textSource=readFileSync(join(source,'src/text.c'),'utf8');
const fonts=[];
for(const [id,name] of [[1,'NormalCopy1'],[2,'Normal'],[4,'Male'],[5,'Female']]) {
  const file=name.startsWith('Normal')?'normal':name.toLowerCase();
  const png=join(source,`graphics/fonts/latin_${file}.png`);
  const bin=join(source,`graphics/fonts/latin_${file}.fwlatfont`);
  execFileSync(join(source,'tools/gbagfx/gbagfx'),[png,bin]);
  const pixels=readFileSync(bin);
  const widthMatch=textSource.match(new RegExp(`sFont${name}LatinGlyphWidths\\[\\] =\\s*\\{([\\s\\S]*?)\\}`));
  const widths=Buffer.from(widthMatch[1].match(/\d+/g).map(Number));
  const matches=[];
  for(let p=rom.indexOf(pixels);p>=0;p=rom.indexOf(pixels,p+1)) {
    const w=p+pixels.length;
    if(rom.subarray(w,w+widths.length).equals(widths)) matches.push({pixels:p,widths:w});
  }
  const selected=matches[[1,2,4,5].indexOf(id)];
  if(!selected) throw new Error(`Missing exact font ${name}`);
  fonts.push({id,name,...selected,length:pixels.length,widthLength:widths.length,hash:hash(pixels)});
}
mkdirSync('src/core/adapters/gba/data',{recursive:true});
const locations=JSON.parse(readFileSync(join(source,'src/data/region_map/region_map_sections.json'),'utf8')).map_sections.map(section=>section.name).filter(Boolean);
const trainers=[...readFileSync(join(source,'src/data/trainers.h'),'utf8').matchAll(/\.trainerName\s*=\s*_\("([^"]+)"\)/g)].map(match=>match[1]).filter(name=>/^[A-Z][A-Z '-]{2,}$/.test(name));
const preservedNames=[...new Set([...locations,...trainers,'LOSTELLE','CELIO','DAISY','MR. FUJI','FUJI','COPYCAT','POKéDEX'])].sort();
writeFileSync('src/core/adapters/gba/data/firered-rev1.json',JSON.stringify({checksum:hash(rom),sourceCommit:execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),entries,fonts,preservedNames},null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,unmatched,unparsed,fonts},null,2));
