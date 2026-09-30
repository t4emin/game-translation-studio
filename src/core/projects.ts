import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { extractDialogs, verifyRom, validateTranslation, protectedNames } from "./platforms/gba/firered-rom.ts";
import { createThaiAtlas, encodeDialog, buildTranslatedRom, dialogLayout } from "./platforms/gba/thai-font.ts";
import { OpenAITranslationProvider } from "./providers/openai/provider.ts";
import { findLocalTranslation } from "./storage/local-translation-file.ts";
import type { TargetLanguage, TranslationEntry } from "./types.ts";

const root=join(process.cwd(),".local","projects");
const cacheRoot=join(process.cwd(),".local","translations");
export interface Project { id:string; name:string; target:TargetLanguage; created:string; entries:TranslationEntry[]; error?:string }
function path(id:string) {
  if(!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project ID");
  return join(root,id);
}
const globalState=globalThis as typeof globalThis & { translationLocks?: Set<string> };
const locks=globalState.translationLocks??=new Set();
async function save(project:Project) {
  const temp=join(path(project.id),`${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(project),{mode:0o600});
  await rename(temp,join(path(project.id),"project.json"));
}
export async function loadProject(id:string):Promise<Project> {
  return JSON.parse(await readFile(join(path(id),"project.json"),"utf8"));
}
export function projectView(project:Project) {
  const done=project.entries.filter(e=>e.status==="translated");
  return {id:project.id,name:project.name,target:project.target,total:project.entries.length,done:done.length,
    complete:done.length===project.entries.length, error:project.error??null,
    samples:done.slice(-5).map(e=>({id:e.id,source:e.sourceText,translation:e.translatedText})),
    failed:project.entries.filter(e=>e.status==="error").map(e=>({id:e.id,source:e.sourceText,translation:e.translatedText,error:e.warnings.join(" ")})),
    scope:"Map dialogue, story events and the Oak introduction. Names, battle UI, menus and help screens remain original."};
}
export async function createProject(name:string,bytes:Uint8Array,target:TargetLanguage):Promise<Project> {
  verifyRom(bytes);
  const entries=extractDialogs(bytes).map(e=>({...e,targetLanguage:target}));
  // Start with the opening scene so the first results can be checked in game.
  entries.sort((a,b)=>Number(b.resource.path?.includes("new_game_intro"))-Number(a.resource.path?.includes("new_game_intro")));
  const project:Project={id:randomUUID(),name,target,created:new Date().toISOString(),entries};
  await mkdir(path(project.id),{recursive:true,mode:0o700});
  await writeFile(join(path(project.id),"original.gba"),bytes,{mode:0o600});
  await save(project);
  return project;
}
export async function translateProjectBatch(id:string):Promise<Project> {
  if(locks.has(id)) throw new Error("This project is already translating. Wait for the current batch.");
  locks.add(id);
  try {
    const project=await loadProject(id);
    if(project.target==="english") {
      for(const entry of project.entries){entry.translatedText=entry.sourceText;entry.status="translated";entry.warnings=[];}
      project.error=undefined;await save(project);return project;
    }
    const original=await readFile(join(path(id),"original.gba"));
    const names=protectedNames(original);
    const glossary=(entries:TranslationEntry[])=>names.filter(name=>entries.some(e=>e.sourceText.includes(name))).map(name=>({source:name,target:name,exact:true}));
    const batch=project.entries.filter(e=>e.status!=="translated").slice(0,64);
    await mkdir(cacheRoot,{recursive:true,mode:0o700});
    const verify=(entry:TranslationEntry,text:string)=>{
      validateTranslation(entry.sourceText,text);
      if(project.target==="thai" && !/[\u0e00-\u0e7f]/.test(text)) throw new Error("The response did not contain a Thai translation.");
      encodeDialog(text,original,createThaiAtlas([text]),dialogLayout(entry));
    };
    let localMissing=0,localInvalid=0;
    for(const entry of batch) {
      const local=await findLocalTranslation(entry,project.target);
      if(local===undefined) {localMissing++;continue;}
      try {
        verify(entry,local);
        entry.translatedText=local; entry.status="translated"; entry.translationVersion=4; entry.warnings=[];
      } catch(error) {
        localInvalid++;
        entry.translatedText=local; entry.status="error"; entry.warnings=[error instanceof Error?error.message:"Invalid local translation"];
      }
    }
    let pending=batch.filter(e=>e.status!=="translated");
    const provider=new OpenAITranslationProvider();
    if(pending.length && !provider.isConfigured()) {
      project.error=`Local-first mode stopped: ${localMissing.toLocaleString()} missing and ${localInvalid.toLocaleString()} invalid local translation(s) in this batch. Add/fix translations/pokemon-firered-rev1.thai.json, or set OPENAI_API_KEY to auto-translate only the missing/invalid messages.`;
      await save(project);
      return project;
    }
    const key=(entry:TranslationEntry)=>join(cacheRoot,createHash("sha256").update(JSON.stringify(["firered-v3",provider.model,project.target,entry.sourceText,entry.context])).digest("hex")+".json");
    const apiPending:TranslationEntry[]=[];
    for(const entry of batch.filter(e=>e.status!=="translated")) {
      try {
        const cached=JSON.parse(await readFile(key(entry),"utf8")); verify(entry,cached.text);
        entry.translatedText=cached.text; entry.status="translated"; entry.translationVersion=3; entry.warnings=[];
      } catch {apiPending.push(entry);}
    }
    pending=apiPending;
    project.error=undefined;
    if(pending.length) {
      let translations:Map<string,string>;
      try {
        const chunks:TranslationEntry[][]=[];
        for(let i=0;i<pending.length;i+=8) chunks.push(pending.slice(i,i+8));
        const results=await Promise.allSettled(chunks.map(entries=>provider.translateBatch({sourceLanguage:"english",targetLanguage:project.target,style:"concise",glossary:glossary(entries),entries:entries.map(entry=>({...entry,constraints:{...entry.constraints,maxChars:dialogLayout(entry).scroll?undefined:22}}))})));
        translations=new Map(results.flatMap(result=>result.status==="fulfilled"?[...result.value]:[]));
        const failure=results.find(result=>result.status==="rejected");
        if(failure?.status==="rejected") project.error=failure.reason instanceof Error?failure.reason.message:"Some translation requests failed. Saved successful results; retry to continue.";
      }
      catch(error) {project.error=error instanceof Error?error.message:"Translation request failed";await save(project);throw error;}
      for(const entry of pending) {
        let translated=translations.get(entry.id);
        if(translated===undefined) continue;
        try {
          try {verify(entry,translated);} catch {
            const retry=await provider.translateBatch({sourceLanguage:"english",targetLanguage:project.target,style:"concise",glossary:glossary([entry]),entries:[{...entry,context:`${entry.context}. Previous answer failed validation. Make each fragment much shorter. Maximum 15 Thai characters per fragment.`}]});
            translated=retry.get(entry.id)!;verify(entry,translated);
          }
          entry.translatedText=translated;entry.status="translated";entry.translationVersion=3;entry.warnings=[];
          await writeFile(key(entry),JSON.stringify({text:translated}),{mode:0o600});
        } catch(error) {
          entry.translatedText=translated;entry.status="error";entry.warnings=[error instanceof Error?error.message:"Invalid translation"];
        }
      }
    }
    if(batch.some(e=>e.status==="error")) project.error="Some messages need a shorter translation or restored control tokens. Review the failed messages, or retry.";
    await save(project);
    return project;
  } finally {locks.delete(id);}
}
export async function editTranslation(id:string,entryId:string,text:string):Promise<Project> {
  if(locks.has(id)) throw new Error("Wait until the current batch finishes.");
  locks.add(id);
  try {
    const project=await loadProject(id),entry=project.entries.find(e=>e.id===entryId);
    if(!entry) throw new Error("Message not found");
    validateTranslation(entry.sourceText,text);
    const original=await readFile(join(path(id),"original.gba"));
    encodeDialog(text,original,createThaiAtlas([text]),dialogLayout(entry));
    entry.translatedText=text;entry.status="translated";entry.warnings=[];project.error=undefined;
    await save(project);return project;
  }finally{locks.delete(id);}
}
export async function changeTarget(id:string,target:TargetLanguage):Promise<Project> {
  if(locks.has(id)) throw new Error("Wait until the current batch finishes.");
  locks.add(id);
  try {
    const project=await loadProject(id);
    if(project.entries.some(e=>e.status==="translated")) throw new Error("Upload a new ROM to change the language of a translated project.");
    project.target=target;
    for(const entry of project.entries) entry.targetLanguage=target;
    await save(project);return project;
  }finally{locks.delete(id);}
}
export async function exportProject(id:string) {
  if(locks.has(id)) throw new Error("Wait until translation finishes.");
  const project=await loadProject(id);
  if(project.entries.some(e=>e.status!=="translated")) throw new Error("Translation is not complete yet.");
  const original=await readFile(join(path(id),"original.gba"));
  const result=buildTranslatedRom(original,project.entries);
  await writeFile(join(path(id),`translated-${project.target}.gba`),result.bytes,{mode:0o600});
  await writeFile(join(path(id),"build.json"),JSON.stringify({checksum:result.checksum,translated:result.translated,glyphs:result.glyphs,thaiFont:result.thaiFont,scope:projectView(project).scope},null,2));
  return {...result,name:`FireRed-Rev1-${project.target}.gba`};
}
