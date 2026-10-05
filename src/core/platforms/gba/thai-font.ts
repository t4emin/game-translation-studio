import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";
import { manifest, latinByte, tokenBytes, validateTranslation, digest, relocateDialogs, verifyRom, extractDialogs } from "./firered-rom.ts";
import { createThaiFontPlan, isThaiCluster, normalizeThaiText, splitTextClusters, type ThaiFontBuildReport } from "./thai-font-pipeline.ts";
import { composeThaiCluster } from "./thai-pixel-font.ts";
import type { TranslationEntry } from "../../types.ts";

export const splitText = splitTextClusters;
type Glyph = { bank: number; code: number; width: number; pixels: Uint8Array };
// `slots` is how many Thai glyphs fit from code 0x120 (default 192); `dy` shifts glyphs down for fonts whose baseline is lower.
export type GbaFontSpec = { id: number; pixels: number; widths: number; length: number; hash: string; slots?: number; dy?: number };
const fireRedFontOrder: GbaFontSpec[] = [2,1,4,5].map(id=>manifest.fonts.find(font=>font.id===id)!);

// FireRed stores each 8-pixel row as big-endian 2bpp inside a little-endian u16.
function packGlyph(value:(x:number,y:number)=>number): Uint8Array {
  const pixels=new Uint8Array(64);
  for(let y=0;y<16;y++) for(let tileX=0;tileX<2;tileX++) {
    let row=0;
    for(let x=0;x<8;x++) row=(row<<2)|value(tileX*8+x,y);
    const offset=((y>>3)*2+tileX)*16+(y&7)*2;
    pixels[offset]=row&255; pixels[offset+1]=row>>8;
  }
  return pixels;
}

export function rasterizeGlyph(text: string, dy=0): { pixels: Uint8Array; width: number } {
  // Clusters the pixel font can draw use it; anything else falls back to rasterizing the outline font.
  const composed=composeThaiCluster(text,{dy});
  if(composed) return {pixels:packGlyph((x,y)=>composed.grid[y*16+x]),width:composed.width};
  if (!GlobalFonts.has("ThaiROM")) {
    if (!GlobalFonts.registerFromPath(join(process.cwd(),"assets/fonts/NotoSansThaiLooped-Regular.ttf"),"ThaiROM")) throw new Error("Thai font is missing.");
  }
  const source = createCanvas(48,48);
  const ctx=source.getContext("2d");
  ctx.font="13px ThaiROM"; ctx.fillStyle="#fff"; ctx.textBaseline="alphabetic";
  ctx.fillText(text,4,24);
  const sourceRgba=ctx.getImageData(0,0,48,48).data;
  let minX=48,minY=48,maxX=-1,maxY=-1;
  for(let y=0;y<48;y++) for(let x=0;x<48;x++) if(sourceRgba[(y*48+x)*4+3]>24) {
    minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
  }
  if(maxX<0) return {pixels:new Uint8Array(64),width:4};
  const glyphWidth=maxX-minX+1,glyphHeight=maxY-minY+1;
  const scale=Math.min(1,14/glyphWidth,15/glyphHeight);
  const drawWidth=Math.max(1,Math.ceil(glyphWidth*scale));
  const drawHeight=Math.max(1,Math.ceil(glyphHeight*scale));
  const sourceBaseline=24,destBaseline=13;
  const drawY=Math.max(0,Math.min(16-drawHeight,Math.round(destBaseline-(sourceBaseline-minY)*scale)));
  const canvas=createCanvas(16,16);
  const out=canvas.getContext("2d");
  out.imageSmoothingEnabled=true;
  out.drawImage(source,minX,minY,glyphWidth,glyphHeight,0,drawY,drawWidth,drawHeight);
  const width=Math.min(15,Math.max(4,drawWidth+1));
  const rgba=out.getImageData(0,0,16,16).data;
  const pixels=packGlyph((x,y)=>rgba[(y*16+x)*4+3]>=80 ? 1 : 0);
  return {pixels,width};
}

export function createThaiAtlas(texts: string[]): Map<string,Glyph> {
  return createThaiAtlasForFonts(texts,fireRedFontOrder);
}

/** Strips marks from a cluster, most decorative first, until a form the atlas holds is found. */
function simplerCluster(cluster: string, has: (value: string) => boolean): string | undefined {
  const steps=[/[\u0e48-\u0e4c]/g,/[\u0e31\u0e34-\u0e37\u0e47\u0e4d]/g,/[\u0e38-\u0e3a]/g];
  let value=cluster;
  for(const step of steps) {
    const next=value.replace(step,"");
    if(next!==value && next) { value=next; if(has(value)) return value; }
  }
  const base=[...cluster][0];
  return base!==cluster && has(base) ? base : undefined;
}

// With `degrade`, a font that cannot hold every cluster keeps the most frequent ones and draws the rest
// without their tone marks or vowels, so a build never fails just because the vocabulary is large.
export function createThaiAtlasForFonts(texts: string[], fonts: GbaFontSpec[], options: { degrade?: boolean } = {}): Map<string,Glyph> {
  const capacity=fonts.reduce((sum,font)=>sum+(font.slots??192),0);
  let plan=createThaiFontPlan(texts,options.degrade?Number.MAX_SAFE_INTEGER:capacity);
  let clusters=plan.clusters;
  const dropped:string[]=[];
  if(options.degrade && clusters.length>capacity) {
    // Every base letter keeps a plain glyph so any dropped cluster has something to fall back to.
    const bases=[...new Set(clusters.map(cluster=>[...cluster][0]).filter(char=>/[\u0e01-\u0e2e\u0e40-\u0e44]/.test(char)))];
    const keep=[...new Set([...bases,...clusters])].slice(0,capacity);
    const kept=new Set(keep);
    dropped.push(...clusters.filter(cluster=>!kept.has(cluster)));
    clusters=keep;
  }
  const atlas=new Map<string,Glyph>();
  let index=0;
  for(const font of fonts) {
    const slots=font.slots??192;
    for(let slot=0;slot<slots && index<clusters.length;slot++,index++) {
      atlas.set(clusters[index],{bank:font.id,code:0x120+slot,...rasterizeGlyph(clusters[index],font.dy??0)});
    }
  }
  for(const cluster of dropped) {
    const alias=simplerCluster(cluster,value=>atlas.has(value));
    if(alias) atlas.set(cluster,atlas.get(alias)!);
  }
  return atlas;
}

export function analyzeThaiFontBuild(texts:string[]): ThaiFontBuildReport {
  const slots=192;
  return createThaiFontPlan(texts,slots*manifest.fonts.length).report;
}

export function patchThaiFonts(original: Uint8Array, atlas: Map<string,Glyph>): Uint8Array {
  return patchThaiFontsForFonts(original,atlas,fireRedFontOrder);
}

export function patchThaiFontsForFonts(original: Uint8Array, atlas: Map<string,Glyph>, fonts: GbaFontSpec[]): Uint8Array {
  const patched=Uint8Array.from(original);
  for(const font of fonts) if(digest(original.slice(font.pixels,font.pixels+font.length))!==font.hash) throw new Error("Original font does not match this ROM revision.");
  for(const glyph of atlas.values()) {
    const font=fonts.find(f=>f.id===glyph.bank)!;
    patched.set(glyph.pixels,font.pixels+glyph.code*64);
    patched[font.widths+glyph.code]=glyph.width;
  }
  return patched;
}

// `lineFont` returns to the base font before each line break, for banks whose line height differs.
type DialogLayout = { scroll?: boolean; maxWidth?: number; maxLines?: number; varWidth?: number; maxBytes?: number; lineFont?: boolean };
export function dialogLayout(entry:TranslationEntry): DialogLayout {
  const maxBytes=entry.constraints.maxBytes;
  if(entry.context?.includes("ControlsGuide")) return {scroll:false,maxWidth:entry.context.includes("Intro")?232:188,maxLines:/DPad|LRButtons/.test(entry.context)?3:2,maxBytes};
  if(entry.context?.includes("PikachuIntro")) return {scroll:false,maxWidth:216,maxLines:8,maxBytes};
  // The action prompt window is 14 tiles wide and never scrolls.
  if(/^gText_WhatWill(PkmnDo|PlayerThrow|OldManDo)$/.test(entry.context??"")) return {scroll:false,maxWidth:108,maxLines:2,varWidth:60,maxBytes};
  // Battle placeholders expand to "Wild/Foe" + nickname, move or item names.
  if(entry.category==="system") return {scroll:true,maxWidth:204,varWidth:90,maxBytes};
  return {scroll:true,maxWidth:204,maxBytes};
}

export function encodeDialog(text: string, rom: Uint8Array, atlas: Map<string,Glyph>, options: DialogLayout = {}): Uint8Array {
  return encodeDialogWithFonts(text,rom,atlas,fireRedFontOrder,options);
}

export function encodeDialogWithFonts(text: string, rom: Uint8Array, atlas: Map<string,Glyph>, fonts: GbaFontSpec[], options: DialogLayout = {}): Uint8Array {
  text=normalizeThaiText(text);
  const result:number[]=[];
  let bank=fonts[0]?.id??2, x=0, line=0;
  const maxWidth=options.maxWidth??204;
  const widths=fonts[0]!.widths;
  const font=(next:number)=>{if(next!==bank){result.push(0xfc,0x06,next);bank=next;}};
  // Start and finish in a known font; only appended text uses the new glyph banks.
  result.push(0xfc,0x06,bank);
  const newline=()=>{
    if(options.maxLines && line+1>=options.maxLines) throw new Error(`Text exceeds this screen's ${options.maxLines}-line limit. Shorten the translation.`);
    if(options.lineFont) font(fonts[0]?.id??2);
    result.push(options.scroll!==false && line>=1 ? 0xfa : 0xfe);x=0;line++;
  };
  const pieces=splitText(text);
  const latinWord=(part:string)=>/^[A-Za-zÀ-ü0-9]$/.test(part);
  for(let index=0;index<pieces.length;index++) {
    const part=pieces[index];
    if(part.startsWith("[")) {
      if(part==="[NEW_LINE]"){newline();continue;}
      if(part==="[PROMPT_CLEAR]" || part==="[PROMPT_SCROLL]") {result.push(...tokenBytes(part));x=0;line=part==="[PROMPT_CLEAR]"?0:1;continue;}
      font(fonts[0]?.id??2);
      if(part.startsWith("[VAR:")) {
        const reserved=options.varWidth??(part==="[VAR:PLAYER]"||part==="[VAR:RIVAL]"?48:78);
        if(x+reserved>maxWidth) newline();
        x+=reserved;
      }
      result.push(...tokenBytes(part));continue;
    }
    const glyph=atlas.get(part);
    const byte=glyph?undefined:latinByte(part);
    const width=glyph?.width??rom[widths+byte!];
    if(latinWord(part) && (index===0 || !latinWord(pieces[index-1]))) {
      let wordWidth=0;
      for(let next=index;next<pieces.length && latinWord(pieces[next]);next++) wordWidth+=rom[widths+latinByte(pieces[next])];
      if(x>0 && wordWidth<=maxWidth && x+wordWidth>maxWidth) newline();
    }
    if(x+width>maxWidth) newline();
    if(isThaiCluster(part) && !glyph) throw new Error(`Thai cluster is missing from the generated font atlas: ${part}`);
    if(glyph){font(glyph.bank);result.push(0xf9,glyph.code&255);}
    else {font(fonts[0]?.id??2);result.push(byte!);}
    x+=width;
  }
  font(fonts[0]?.id??2);result.push(0xff);
  const maxBytes=options.maxBytes??900;
  if(result.length>maxBytes) throw new Error(`Translated message is ${result.length} bytes; shorten it to fit the ${maxBytes}-byte message limit.`);
  return Uint8Array.from(result);
}

export function buildTranslatedRom(original: Uint8Array, entries: TranslationEntry[]) {
  verifyRom(original);
  if(!entries.length) throw new Error("No translations supplied.");
  const translated=entries.filter(e=>e.translatedText && e.translatedText!==e.sourceText && e.category!=="name");
  if(!translated.length) return {bytes:Buffer.from(original),glyphs:0,translated:0,checksum:digest(original)};
  const sources=new Map(extractDialogs(original).map(entry=>[entry.id,entry]));
  for(const entry of translated) {
    const source=sources.get(entry.id);
    if(!source || source.sourceText!==entry.sourceText) throw new Error(`Source text mismatch: ${entry.id}`);
    validateTranslation(source.sourceText,entry.translatedText);
  }
  const translatedTexts=translated.map(e=>e.translatedText);
  const thaiFont=analyzeThaiFontBuild(translatedTexts);
  const atlas=createThaiAtlas(translatedTexts);
  const fonts=patchThaiFonts(original,atlas);
  const encoded=translated.map(e=>{
    try{return {id:e.id,bytes:encodeDialog(e.translatedText,original,atlas,dialogLayout(sources.get(e.id)!))};}
    catch(error){throw new Error(`${e.id}: ${error instanceof Error?error.message:"Encoding failed"}`);}
  });
  const bytes=relocateDialogs(original,encoded,fonts);
  return {bytes,glyphs:atlas.size,translated:translated.length,checksum:digest(bytes),thaiFont};
}
