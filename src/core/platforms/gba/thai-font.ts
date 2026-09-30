import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join } from "node:path";
import { manifest, latinByte, tokenBytes, validateTranslation, digest, relocateDialogs, verifyRom, extractDialogs } from "./firered-rom.ts";
import { createThaiFontPlan, isThaiCluster, normalizeThaiText, splitTextClusters, type ThaiFontBuildReport } from "./thai-font-pipeline.ts";
import type { TranslationEntry } from "../../types.ts";

export const splitText = splitTextClusters;
type Glyph = { bank: number; code: number; width: number; pixels: Uint8Array };

export function rasterizeGlyph(text: string): { pixels: Uint8Array; width: number } {
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
  const canvas=createCanvas(16,16);
  const out=canvas.getContext("2d");
  out.imageSmoothingEnabled=true;
  out.drawImage(source,minX,minY,glyphWidth,glyphHeight,0,Math.max(0,Math.floor((16-drawHeight)/2)),drawWidth,drawHeight);
  const width=Math.min(15,Math.max(4,drawWidth+1));
  const rgba=out.getImageData(0,0,16,16).data;
  const pixels=new Uint8Array(64);
  // FireRed stores each 8-pixel row as big-endian 2bpp inside a little-endian u16.
  for(let y=0;y<16;y++) for(let tileX=0;tileX<2;tileX++) {
    let row=0;
    for(let x=0;x<8;x++) row=(row<<2)|(rgba[(y*16+tileX*8+x)*4+3]>=80 ? 1 : 0);
    const offset=((y>>3)*2+tileX)*16+(y&7)*2;
    pixels[offset]=row&255; pixels[offset+1]=row>>8;
  }
  return {pixels,width};
}

export function createThaiAtlas(texts: string[]): Map<string,Glyph> {
  const banks=[2,1,4,5];
  const slots=192;
  const {clusters}=createThaiFontPlan(texts,slots*manifest.fonts.length);
  return new Map(clusters.map((cluster,index)=>[cluster,{bank:banks[Math.floor(index/slots)],code:0x120+index%slots,...rasterizeGlyph(cluster)}]));
}

export function analyzeThaiFontBuild(texts:string[]): ThaiFontBuildReport {
  const slots=192;
  return createThaiFontPlan(texts,slots*manifest.fonts.length).report;
}

export function patchThaiFonts(original: Uint8Array, atlas: Map<string,Glyph>): Uint8Array {
  const patched=Uint8Array.from(original);
  for(const font of manifest.fonts) if(digest(original.slice(font.pixels,font.pixels+font.length))!==font.hash) throw new Error("Original font does not match this ROM revision.");
  for(const glyph of atlas.values()) {
    const font=manifest.fonts.find(f=>f.id===glyph.bank)!;
    patched.set(glyph.pixels,font.pixels+glyph.code*64);
    patched[font.widths+glyph.code]=glyph.width;
  }
  return patched;
}

export function dialogLayout(entry:TranslationEntry) {
  if(entry.context?.includes("ControlsGuide")) return {scroll:false,maxWidth:entry.context.includes("Intro")?232:188,maxLines:/DPad|LRButtons/.test(entry.context)?3:2};
  if(entry.context?.includes("PikachuIntro")) return {scroll:false,maxWidth:216,maxLines:8};
  return {scroll:true,maxWidth:204};
}

export function encodeDialog(text: string, rom: Uint8Array, atlas: Map<string,Glyph>, options: { scroll?: boolean; maxWidth?: number; maxLines?:number } = {}): Uint8Array {
  text=normalizeThaiText(text);
  const result:number[]=[];
  let bank=2, x=0, line=0;
  const maxWidth=options.maxWidth??204;
  const widths=manifest.fonts.find(f=>f.id===2)!.widths;
  const font=(next:number)=>{if(next!==bank){result.push(0xfc,0x06,next);bank=next;}};
  // Start and finish in a known font; only appended text uses the new glyph banks.
  result.push(0xfc,0x06,2);
  const newline=()=>{
    if(options.maxLines && line+1>=options.maxLines) throw new Error(`Text exceeds this screen's ${options.maxLines}-line limit. Shorten the translation.`);
    result.push(options.scroll!==false && line>=1 ? 0xfa : 0xfe);x=0;line++;
  };
  const pieces=splitText(text);
  const latinWord=(part:string)=>/^[A-Za-zÀ-ü0-9]$/.test(part);
  for(let index=0;index<pieces.length;index++) {
    const part=pieces[index];
    if(part.startsWith("[")) {
      if(part==="[NEW_LINE]"){newline();continue;}
      if(part==="[PROMPT_CLEAR]" || part==="[PROMPT_SCROLL]") {result.push(...tokenBytes(part));x=0;line=part==="[PROMPT_CLEAR]"?0:1;continue;}
      font(2);
      if(part.startsWith("[VAR:")) {
        const reserved=part==="[VAR:PLAYER]"||part==="[VAR:RIVAL]"?48:78;
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
    else {font(2);result.push(byte!);}
    x+=width;
  }
  font(2);result.push(0xff);
  if(result.length>900) throw new Error(`Translated message is ${result.length} bytes; shorten it to fit the 900-byte message limit.`);
  return Uint8Array.from(result);
}

export function buildTranslatedRom(original: Uint8Array, entries: TranslationEntry[]) {
  verifyRom(original);
  if(!entries.length) throw new Error("No translations supplied.");
  const translated=entries.filter(e=>e.translatedText && e.translatedText!==e.sourceText && e.category==="dialog");
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
