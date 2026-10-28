import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { decodePokemonText } from "../src/core/platforms/gba/pokemon-gen3-text.ts";
import { missingProtectedNames, validateProtectedNames } from "../src/core/platforms/gba/pokemon-gen3-resources.ts";
import { manifest, extractDialogs, validateTranslation, digest, relocateDialogs, restoreTrailingControlTokens } from "../src/core/platforms/gba/firered-rom.ts";
import { buildTranslatedRom, createThaiAtlas, encodeDialog, rasterizeGlyph, analyzeThaiFontBuild } from "../src/core/platforms/gba/thai-font.ts";
import { composeThaiCluster } from "../src/core/platforms/gba/thai-pixel-font.ts";
import { analyzeThaiCluster, normalizeThaiText, splitTextClusters } from "../src/core/platforms/gba/thai-font-pipeline.ts";

test("control parameters are decoded atomically, including 0xff parameters",()=>{
  const bytes=Uint8Array.from([0xfc,4,1,0,2,0xfd,1,0xf9,0x10,0xff]);
  assert.equal(decodePokemonText(bytes,0,bytes.length).text,"[CTRL:04010002][VAR:PLAYER][SYMBOL:10]");
  assert.throws(()=>decodePokemonText(Uint8Array.from([0xfd]),0,1),/Truncated/);
  assert.throws(()=>decodePokemonText(Uint8Array.from([0xfc,4,1]),0,3),/Invalid/);
});
test("translations must preserve repeated controls and their order",()=>{
  const source="A[NEW_LINE]B[NEW_LINE][VAR:PLAYER]";
  assert.throws(()=>validateTranslation(source,"ก[NEW_LINE][VAR:PLAYER]"));
  assert.throws(()=>validateTranslation(source,"ก[VAR:PLAYER][NEW_LINE][NEW_LINE]"));
  assert.doesNotThrow(()=>validateTranslation(source,"ก[NEW_LINE]ข[NEW_LINE][VAR:PLAYER]"));
});
test("safe restore only appends missing trailing controls",()=>{
  assert.equal(restoreTrailingControlTokens("Hello[PROMPT_CLEAR]","สวัสดี"),"สวัสดี[PROMPT_CLEAR]");
  assert.equal(restoreTrailingControlTokens("A[NEW_LINE]B","ก"),"ก");
});
test("protected names must stay in English as often as in the source",()=>{
  const names=["OAK","PIKACHU","VIRIDIAN CITY","POKéMON"];
  const source="OAK: This PIKACHU is from[NEW_LINE]VIRIDIAN CITY. PIKACHU!";
  assert.deepEqual(missingProtectedNames(source,"OAK: PIKACHU ตัวนี้มาจาก[NEW_LINE]VIRIDIAN CITY PIKACHU!",names),[]);
  assert.deepEqual(missingProtectedNames(source,"โอ๊ค: PIKACHU ตัวนี้มาจาก[NEW_LINE]เมืองวิริเดียน",names),["OAK","PIKACHU","VIRIDIAN CITY"]);
  assert.deepEqual(missingProtectedNames("SOAKED cloak","เปียก",names),[]);
  assert.throws(()=>validateProtectedNames("A POKéMON!","โปเกมอน!",names),/POKéMON/);
});
test("Thai clusters include tone marks and render nonempty glyphs",()=>{
  const atlas=createThaiAtlas(["กิ้ กุ้ง น้ำ"]);
  assert.ok(atlas.has("กิ้"));
  assert.deepEqual(analyzeThaiCluster("กิ้").classes,["base","upper-mark","tone-mark"]);
  assert.ok(rasterizeGlyph("กิ้").pixels.some(v=>v!==0));
  assert.ok(rasterizeGlyph("กิ้").width<=16);
  assert.equal(new Set([...atlas.values()].map(g=>`${g.bank}:${g.code}`)).size,atlas.size);
});
test("Thai font pipeline normalizes text and reports precomposed capacity",()=>{
  const text="กา\u0e4d[NEW_LINE]กิ้ {PLAYER}";
  assert.equal(normalizeThaiText(text),"กำ[NEW_LINE]กิ้ {PLAYER}");
  assert.deepEqual(splitTextClusters(text).filter(part=>/[\u0e00-\u0e7f]/.test(part)),["กำ","กิ้"]);
  const report=analyzeThaiFontBuild([text]);
  assert.equal(report.strategy,"precomposed-glyphs");
  assert.equal(report.encoding,"fire-red-extended-font-banks");
  assert.equal(report.availableGlyphSlots,768);
  assert.equal(report.generatedGlyphs,2);
});

const romPath=process.env.TEST_ROM_PATH;
test("real ROM relocation preserves original bytes, header and unrelated resources",{skip:!romPath||!existsSync(romPath)},()=>{
  const original=readFileSync(romPath!);
  const hash=digest(original);
  const entries=extractDialogs(original);
  assert.ok(entries.length>2000);
  const entry=entries.find(e=>e.context==="gOakSpeech_Text_WelcomeToTheWorld")!;
  assert.ok(entry);
  entry.translatedText="สวัสดี![NEW_LINE]ยินดีที่ได้รู้จัก![PROMPT_CLEAR]ยินดีต้อนรับสู่โลก POKéMON![PROMPT_CLEAR]ฉันชื่อ OAK[ PROMPT_CLEAR]".replace("[ PROMPT_CLEAR]","[PROMPT_CLEAR]")+"ผู้คนเรียกฉันว่า[NEW_LINE]POKéMON PROFESSOR[PROMPT_CLEAR]";
  entry.status="translated";
  const result=buildTranslatedRom(original,[entry]);
  assert.equal(digest(original),hash,"building must not mutate a Buffer-backed ROM");
  assert.equal(hash,manifest.checksum);
  assert.ok(result.bytes.length<=0x2000000);
  assert.deepEqual(result.bytes.subarray(0,0xc0),original.subarray(0,0xc0));
  const atlas=createThaiAtlas([entry.translatedText]);
  const encoded=encodeDialog(entry.translatedText,original,atlas);
  const record=manifest.entries.find(r=>r.offset===entry.resource.offset)!;
  const allowed=new Set<number>();
  for(const ref of record.references){
    assert.equal(result.bytes.readUInt32LE(ref),0x09000000);
    for(let i=0;i<4;i++) allowed.add(ref+i);
  }
  for(const glyph of atlas.values()){
    const font=manifest.fonts.find(f=>f.id===glyph.bank)!;
    for(let i=0;i<64;i++) allowed.add(font.pixels+glyph.code*64+i);
    allowed.add(font.widths+glyph.code);
  }
  for(let i=0;i<original.length;i++) if(original[i]!==result.bytes[i]) assert.ok(allowed.has(i),`Unexpected byte change at ${i.toString(16)}`);
  assert.deepEqual(result.bytes.subarray(original.length,original.length+encoded.length),Buffer.from(encoded));
  assert.throws(()=>relocateDialogs(original,[{id:entry.id,bytes:encoded},{id:entry.id,bytes:encoded}]),/Duplicate/);
  const corrupt=Buffer.from(original);corrupt[0x100]^=1;
  assert.throws(()=>buildTranslatedRom(corrupt,[entry]),/original/);
});
test("real ROM battle messages are extracted, capped and built from the bundled translations",{skip:!romPath||!existsSync(romPath)},()=>{
  const original=readFileSync(romPath!);
  const entries=extractDialogs(original);
  const battle=entries.filter(e=>e.category==="system");
  assert.ok(battle.length>=400);
  assert.ok(battle.every(e=>e.constraints.maxBytes!<=335));
  assert.ok(!entries.some(e=>/^gText_An?[A-Z][a-z]+Move$|^sText_StatSharply$/.test(e.context??"")),"fixed-buffer fragments must stay out of the manifest");
  const local=new Map((JSON.parse(readFileSync("translations/pokemon-firered-rev1.thai.json","utf8")).entries as {id:string;sourceText:string;translatedText:string}[]).map(e=>[e.id+e.sourceText,e.translatedText]));
  const translated=battle.map(e=>({...e,translatedText:local.get(e.id+e.sourceText)??""})).filter(e=>e.translatedText);
  assert.equal(translated.length,battle.length);
  const result=buildTranslatedRom(original,translated);
  assert.equal(result.translated,battle.length);
  const used=translated.find(e=>e.context==="sText_AttackerUsedX")!;
  const record=manifest.entries.find(r=>r.offset===used.resource.offset)!;
  assert.ok(result.bytes.readUInt32LE(record.references[0])>=0x09000000);
  assert.throws(()=>buildTranslatedRom(original,[{...used,translatedText:"[VAR:0F] "+"ใช้".repeat(120)+"[NEW_LINE][VAR:PLAYER]"}]),/200-byte message limit/);
});
test("pixel font composes clusters on one baseline with a shadow and falls back for unknown characters",()=>{
  const plain=composeThaiCluster("ก")!,marked=composeThaiCluster("กี้")!,low=composeThaiCluster("กู")!;
  const rows=(g:{grid:Uint8Array})=>[...Array(16).keys()].filter(y=>g.grid.subarray(y*16,y*16+16).includes(1));
  assert.deepEqual(rows(plain),[5,6,7,8,9,10]);
  assert.equal(rows(marked)[0],0);
  assert.equal(rows(low).at(-1),13);
  assert.ok(plain.grid.includes(2));
  assert.equal(plain.width,7);
  assert.ok(composeThaiCluster("น้ำ")!.width>plain.width);
  assert.equal(composeThaiCluster("๙"),undefined);
  assert.ok(rasterizeGlyph("๙").pixels.some(v=>v!==0));
});

test("Minish Cap pixel font shifts to the game's baseline and fills the whole cell",()=>{
  const glyph=composeThaiCluster("กู",{dy:3,shadow:false})!;
  const rows=[...Array(16).keys()].filter(y=>glyph.grid.subarray(y*16,y*16+16).includes(1));
  assert.deepEqual(rows,[8,9,10,11,12,13,14,15]);
  assert.ok(!glyph.grid.includes(2));
  assert.equal(composeThaiCluster("ก",{dy:3,shadow:false})!.width,composeThaiCluster("ก")!.width-1);
});

const minishPath=process.env.TEST_MINISH_ROM_PATH;
test("Minish Cap messages round-trip and rebuild into a valid table",{skip:!minishPath||!existsSync(minishPath)},async()=>{
  const { readMessages, extractMinishEntries, decodeMessage, tokenBytes, buildMinishRom, TEXT_POINTER_SLOTS, FONT_TABLE }=await import("../src/core/platforms/gba/minish-cap-rom.ts");
  const original=readFileSync(minishPath!);
  const messages=readMessages(original);
  assert.equal(messages.length,3699);
  for(const message of messages) {
    const bytes:number[]=[];
    for(const part of decodeMessage(message.bytes).split(/(\[[^\]]+\])/g).filter(Boolean)) {
      if(part.startsWith("[")) bytes.push(...tokenBytes(part));
      else for(const char of part) bytes.push(char==="é"?0xe9:char.charCodeAt(0));
    }
    assert.deepEqual(Buffer.from(bytes),Buffer.from(message.bytes),message.id);
  }
  const entries=extractMinishEntries(original);
  const target=entries.find(e=>e.id==="minish-00-006")!;
  assert.equal(target.text,"[NEW_LINE]Unable to copy file.[NEW_LINE]");
  const result=buildMinishRom(original,new Map([[target.id,"[NEW_LINE]คัดลอกไฟล์ไม่สำเร็จ[NEW_LINE]"]]));
  assert.equal(result.translated,1);
  assert.equal(result.bytes.length,original.length);
  assert.deepEqual(result.bytes.subarray(0,0xc0),original.subarray(0,0xc0));
  const table=result.bytes.readUInt32LE(TEXT_POINTER_SLOTS[0]);
  assert.ok(TEXT_POINTER_SLOTS.every(slot=>result.bytes.readUInt32LE(slot)===table));
  assert.notEqual(result.bytes.readUInt32LE(FONT_TABLE+4*4),original.readUInt32LE(FONT_TABLE+4*4));
  assert.equal(result.bytes.readUInt32LE(FONT_TABLE+6*4),original.readUInt32LE(FONT_TABLE+6*4));
  assert.throws(()=>buildMinishRom(original,new Map([[target.id,"คัดลอก"]])),/control tokens/);
  assert.throws(()=>buildMinishRom(original,new Map([[target.id,"[NEW_LINE]"+"ก".repeat(40)+"[NEW_LINE]"]])),/wide/);
});

test("font specs can limit glyph slots and shift the baseline per bank",async()=>{
  const { createThaiAtlasForFonts }=await import("../src/core/platforms/gba/thai-font.ts");
  const fonts=[{id:1,pixels:0,widths:0,length:0,hash:"",slots:1,dy:1},{id:7,pixels:0,widths:0,length:0,hash:"",slots:1,dy:1}];
  const atlas=createThaiAtlasForFonts(["กก ขข ขข"],fonts);
  assert.equal(atlas.size,2);
  assert.deepEqual([...atlas.values()].map(g=>[g.bank,g.code]),[[1,0x120],[7,0x120]]);
  assert.throws(()=>createThaiAtlasForFonts(["กขค"],fonts),/supports 2/);
  const flat=composeThaiCluster("ก",{dy:0})!,shifted=composeThaiCluster("ก",{dy:1})!;
  const first=(g:{grid:Uint8Array})=>[...Array(16).keys()].find(y=>g.grid.subarray(y*16,y*16+16).includes(1));
  assert.equal(first(shifted),first(flat)!+1);
});

test("a full font degrades rare clusters to simpler forms instead of failing",async()=>{
  const { createThaiAtlasForFonts }=await import("../src/core/platforms/gba/thai-font.ts");
  const fonts=[{id:1,pixels:0,widths:0,length:0,hash:"",slots:8}];
  const text="ก ข ค ง จ ฉ ก้ ข้ ค้ ง้";
  assert.throws(()=>createThaiAtlasForFonts([text],fonts),/supports 8/);
  const atlas=createThaiAtlasForFonts([text],fonts,{degrade:true});
  assert.equal(atlas.size,10,"every cluster still resolves to a glyph");
  const slots=new Set([...atlas.values()].map(glyph=>glyph.code));
  assert.equal(slots.size,8,"only the font's slots are used");
  assert.ok([...atlas].some(([cluster,glyph])=>cluster.length>1&&glyph.code===atlas.get(cluster[0])!.code),"a dropped cluster reuses its plain letter");
});
