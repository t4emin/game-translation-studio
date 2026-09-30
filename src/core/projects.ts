import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { getGameAdapter, findGameAdapter } from "./adapters/registry.ts";
import { detectPlatform } from "./platforms/index.ts";
import { validateTranslation, protectedNames } from "./platforms/gba/firered-rom.ts";
import { emeraldProtectedNames } from "./adapters/gba/pokemon-emerald.ts";
import { protectedPokemonNames } from "./platforms/gba/pokemon-gen3-resources.ts";
import { OpenAITranslationProvider } from "./providers/openai/provider.ts";
import { findLocalTranslation } from "./storage/local-translation-file.ts";
import type { GameAdapterMetadata, GameContext, TargetLanguage, TranslationEntry } from "./types.ts";

const root=join(process.cwd(),".local","projects");
const cacheRoot=join(process.cwd(),".local","translations");
function path(id:string) {
  if(!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project ID");
  return join(root,id);
}
const globalState=globalThis as typeof globalThis & { translationLocks?: Set<string> };
const locks=globalState.translationLocks??=new Set();
type StoredMetadata = Pick<GameAdapterMetadata,"id"|"name"|"capabilities"|"notes">;
async function save(project:Project) {
  const temp=join(path(project.id),`${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(project),{mode:0o600});
  await rename(temp,join(path(project.id),"project.json"));
}
export async function loadProject(id:string):Promise<Project> {
  return hydrateProject(JSON.parse(await readFile(join(path(id),"project.json"),"utf8")));
}
export interface Project { id:string; name:string; target:TargetLanguage; created:string; adapterId:string; adapterName:string; adapterCapabilities:StoredMetadata["capabilities"]; entries:TranslationEntry[]; error?:string }
export interface ProjectExport { bytes:Buffer; checksum:string; name:string; translated:number; glyphs:number }
export function projectView(project:Project) {
  const done=project.entries.filter(e=>e.status==="translated");
  const exportBlocked=!canExport(project.adapterCapabilities,project.target);
  return {id:project.id,name:project.name,target:project.target,total:project.entries.length,done:done.length,
    complete:done.length===project.entries.length, error:project.error??null, adapterId:project.adapterId, adapterName:project.adapterName, exportBlocked,
    samples:done.slice(-5).map(e=>({id:e.id,source:e.sourceText,translation:e.translatedText})),
    failed:project.entries.filter(e=>e.status==="error").map(e=>({id:e.id,source:e.sourceText,translation:e.translatedText,error:e.warnings.join(" ")})),
    scope:exportBlocked?"Review/translation project only. Export is disabled until this adapter has safe injection and rebuild.":"Map dialogue, story events and the opening scene. Names, battle UI, menus and help screens remain original."};
}
export async function createProject(name:string,bytes:Uint8Array,target:TargetLanguage):Promise<Project> {
  const file={name,size:bytes.byteLength,extension:name.slice(name.lastIndexOf(".")).toLowerCase(),bytes};
  const metadata=await detectPlatform(file,"gba");
  const matched=await findGameAdapter(metadata);
  if(!matched.adapter || !matched.metadata) throw new Error("This ROM does not have a project adapter yet. Use Analyze / AI adapter analysis first.");
  if(!matched.metadata.capabilities.extraction) throw new Error(`Adapter ${matched.metadata.name} cannot extract text yet.`);
  const context:GameContext={file,metadata,adapterId:matched.metadata.id};
  const extraction=await matched.adapter.extract(context);
  const entries=extraction.entries.filter(e=>e.category!=="name").map(e=>({...e,targetLanguage:target}));
  if(!entries.length) throw new Error(`Adapter ${matched.metadata.name} did not find translatable non-name text.`);
  // Start with the opening scene so the first results can be checked in game.
  entries.sort((a,b)=>Number(b.resource.path?.includes("new_game_intro"))-Number(a.resource.path?.includes("new_game_intro")));
  const project:Project={id:randomUUID(),name,target,created:new Date().toISOString(),adapterId:matched.metadata.id,adapterName:matched.metadata.name,adapterCapabilities:matched.metadata.capabilities,entries};
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
    const context=await projectContext(project,new Uint8Array(original));
    const names=protectedNamesForProject(project,new Uint8Array(original));
    const glossary=(entries:TranslationEntry[])=>names.filter(name=>entries.some(e=>e.sourceText.includes(name))).map(name=>({source:name,target:name,exact:true}));
    const batch=project.entries.filter(e=>e.status!=="translated").slice(0,64);
    await mkdir(cacheRoot,{recursive:true,mode:0o700});
    const verify=async(entry:TranslationEntry,text:string)=>{
      validateTranslation(entry.sourceText,text);
      if(project.target==="thai" && !/[\u0e00-\u0e7f]/.test(text)) throw new Error("The response did not contain a Thai translation.");
      const result=await projectAdapter(project).adapter.validateTranslations(context,[{...entry,translatedText:text,status:"translated"}]);
      if(!result.ok) throw new Error(result.issues.map(issue=>issue.message).join(" "));
    };
    let localMissing=0,localInvalid=0;
    for(const entry of batch) {
      const local=await findLocalTranslation(entry,project.target);
      if(local===undefined) {localMissing++;continue;}
      try {
        await verify(entry,local);
        entry.translatedText=local; entry.status="translated"; entry.translationVersion=4; entry.warnings=[];
      } catch(error) {
        localInvalid++;
        entry.translatedText=local; entry.status="error"; entry.warnings=[error instanceof Error?error.message:"Invalid local translation"];
      }
    }
    let pending=batch.filter(e=>e.status!=="translated");
    const provider=new OpenAITranslationProvider();
    if(pending.length && !provider.isConfigured()) {
      project.error=`Local-first mode stopped: ${localMissing.toLocaleString()} missing and ${localInvalid.toLocaleString()} invalid local translation(s) in this batch. Add/fix a local translation file, or set OPENAI_API_KEY to auto-translate only the missing/invalid messages.`;
      await save(project);
      return project;
    }
    const key=(entry:TranslationEntry)=>join(cacheRoot,createHash("sha256").update(JSON.stringify([project.adapterId,provider.model,project.target,entry.sourceText,entry.context])).digest("hex")+".json");
    const apiPending:TranslationEntry[]=[];
    for(const entry of batch.filter(e=>e.status!=="translated")) {
      try {
        const cached=JSON.parse(await readFile(key(entry),"utf8")); await verify(entry,cached.text);
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
        const results=await Promise.allSettled(chunks.map(entries=>provider.translateBatch({sourceLanguage:"english",targetLanguage:project.target,style:"concise",glossary:glossary(entries),entries})));
        translations=new Map(results.flatMap(result=>result.status==="fulfilled"?[...result.value]:[]));
        const failure=results.find(result=>result.status==="rejected");
        if(failure?.status==="rejected") project.error=failure.reason instanceof Error?failure.reason.message:"Some translation requests failed. Saved successful results; retry to continue.";
      }
      catch(error) {project.error=error instanceof Error?error.message:"Translation request failed";await save(project);throw error;}
      for(const entry of pending) {
        let translated=translations.get(entry.id);
        if(translated===undefined) continue;
        try {
          try {await verify(entry,translated);} catch {
            const retry=await provider.translateBatch({sourceLanguage:"english",targetLanguage:project.target,style:"concise",glossary:glossary([entry]),entries:[{...entry,context:`${entry.context}. Previous answer failed validation. Make each fragment much shorter. Maximum 15 Thai characters per fragment.`}]});
            translated=retry.get(entry.id)!;await verify(entry,translated);
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
    const context=await projectContext(project,new Uint8Array(original));
    const result=await projectAdapter(project).adapter.validateTranslations(context,[{...entry,translatedText:text,status:"translated"}]);
    if(!result.ok) throw new Error(result.issues.map(issue=>issue.message).join(" "));
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
export async function exportProject(id:string):Promise<ProjectExport> {
  if(locks.has(id)) throw new Error("Wait until translation finishes.");
  const project=await loadProject(id);
  const adapter=projectAdapter(project);
  if(!canExport(project.adapterCapabilities,project.target)) throw new Error(`${project.adapterName} can be translated/reviewed, but export is blocked until safe injection and rebuild are implemented.`);
  if(project.entries.some(e=>e.status!=="translated")) throw new Error("Translation is not complete yet.");
  const original=await readFile(join(path(id),"original.gba"));
  const context=await projectContext(project,new Uint8Array(original));
  const prepared=await adapter.adapter.prepareTargetLanguage(context,project.target);
  if(!prepared.ok) throw new Error(prepared.issues.map(issue=>issue.message).join(" "));
  const validated=await adapter.adapter.validateTranslations(context,project.entries);
  if(!validated.ok) throw new Error(validated.issues.map(issue=>issue.message).join(" "));
  const injected=await adapter.adapter.inject(context,project.entries);
  if(!injected.ok) throw new Error(injected.issues.map(issue=>issue.message).join(" "));
  const rebuilt=await adapter.adapter.rebuild(context);
  if(!rebuilt.ok || !rebuilt.outputBytes || !rebuilt.checksum) throw new Error(rebuilt.issues.map(issue=>issue.message).join(" ") || "Rebuild failed.");
  const checked=await adapter.adapter.validateBuild(context);
  if(!checked.ok) throw new Error(checked.issues.map(issue=>issue.message).join(" "));
  const bytes=Buffer.from(rebuilt.outputBytes);
  const translated=project.entries.filter(e=>e.translatedText && e.translatedText!==e.sourceText).length;
  await writeFile(join(path(id),`translated-${project.target}.gba`),bytes,{mode:0o600});
  await writeFile(join(path(id),"build.json"),JSON.stringify({checksum:rebuilt.checksum,translated,glyphs:0,scope:projectView(project).scope},null,2));
  return {bytes,checksum:rebuilt.checksum,name:`${project.adapterName.replace(/[^A-Za-z0-9]+/g,"-")}-${project.target}.gba`,translated,glyphs:0};
}

function projectAdapter(project:Project) {
  const adapter=getGameAdapter(project.adapterId);
  if(!adapter) throw new Error(`Adapter is not registered: ${project.adapterId}`);
  return adapter;
}

async function projectContext(project:Project, bytes:Uint8Array):Promise<GameContext> {
  const file={name:project.name,size:bytes.byteLength,extension:project.name.slice(project.name.lastIndexOf(".")).toLowerCase(),bytes};
  return {file,metadata:await detectPlatform(file,"gba"),adapterId:project.adapterId};
}

function canExport(capabilities:StoredMetadata["capabilities"],target:TargetLanguage) {
  return capabilities.safeInjection && capabilities.rebuild && (target==="thai" ? capabilities.thaiBuild : capabilities.englishBuild);
}

function protectedNamesForProject(project:Project, bytes:Uint8Array):string[] {
  if(project.adapterId.includes("firered")) return protectedNames(bytes);
  if(project.adapterId.includes("emerald")) return emeraldProtectedNames(bytes);
  return protectedPokemonNames(bytes);
}

function hydrateProject(project:Project):Project {
  if(project.adapterId && project.adapterCapabilities) return project;
  const fireRed=getGameAdapter("gba-pokemon-firered-bpre-rev1");
  if(!fireRed) return project;
  return {...project,adapterId:fireRed.metadata.id,adapterName:fireRed.metadata.name,adapterCapabilities:fireRed.metadata.capabilities};
}
