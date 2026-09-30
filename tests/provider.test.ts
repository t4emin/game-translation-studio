import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIAdapterAnalysisProvider } from "../src/core/providers/openai/analysis.ts";
import { OpenAITranslationProvider } from "../src/core/providers/openai/provider.ts";
import type { AnalysisReport, TranslationEntry } from "../src/core/types.ts";

test("AI translates prose fragments while names and game controls stay local",async()=>{
  const originalFetch=globalThis.fetch;
  const entry:TranslationEntry={id:"test",sourceText:"Hi OAK[NEW_LINE]Hello BULBASAUR[VAR:PLAYER]",translatedText:"",sourceLanguage:"english",targetLanguage:"thai",category:"dialog",resource:{},constraints:{},protectedTokens:["[NEW_LINE]","[VAR:PLAYER]"],status:"untranslated",warnings:[]};
  let count=0;
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.equal(body.store,false);
    assert.equal(body.text.format.strict,true);
    const payload=JSON.parse(body.input[1].content);
    count=payload.entries.length;
    for(const part of payload.entries){assert.ok(!/[\[\]]/.test(part.text));assert.ok(!/OAK|BULBASAUR/.test(part.text));}
    return Response.json({output:[{content:[{text:JSON.stringify({translations:payload.entries.map((part:{id:string;text:string})=>({id:part.id,translatedText:"สวัสดี "+(part.text.match(/<NAME_\d+>/g)??[]).join(" ")}))})}]}]});
  };
  try {
    const result=await new OpenAITranslationProvider("test-key").translateBatch({sourceLanguage:"english",targetLanguage:"thai",style:"concise",entries:[entry],glossary:[{source:"OAK",target:"OAK",exact:true},{source:"BULBASAUR",target:"BULBASAUR",exact:true}]});
    assert.equal(count,2);
    assert.equal(result.get("test"),"สวัสดี OAK[NEW_LINE]สวัสดี BULBASAUR[VAR:PLAYER]");
  }finally{globalThis.fetch=originalFetch;}
});

test("name-only fragments stay local and only invalid name responses are retried",async()=>{
  const originalFetch=globalThis.fetch;
  const entry:TranslationEntry={id:"retry",sourceText:"Hi OAK[NEW_LINE]Hello BILL[NEW_LINE]OAK!",translatedText:"",sourceLanguage:"english",targetLanguage:"thai",category:"dialog",resource:{},constraints:{},protectedTokens:[],status:"untranslated",warnings:[]};
  const calls:string[][]=[];
  globalThis.fetch=async(_url,init)=>{
    const payload=JSON.parse(JSON.parse(String(init?.body)).input[1].content);
    calls.push(payload.entries.map((part:{id:string})=>part.id));
    assert.ok(payload.entries.every((part:{context?:string})=>!part.context?.includes("Full message:")));
    return Response.json({output_text:JSON.stringify({translations:payload.entries.map((part:{id:string})=>({
      id:part.id,translatedText:calls.length===1&&part.id.endsWith("part-2")?"สวัสดี":"สวัสดี <NAME_0>"
    }))})});
  };
  try{
    const result=await new OpenAITranslationProvider("test-key").translateBatch({sourceLanguage:"english",targetLanguage:"thai",style:"concise",entries:[entry],glossary:["OAK","BILL"].map(name=>({source:name,target:name,exact:true}))});
    assert.deepEqual(calls,[["retry/part-0","retry/part-2"],["retry/part-2"]]);
    assert.equal(result.get("retry"),"สวัสดี OAK[NEW_LINE]สวัสดี BILL[NEW_LINE]OAK!");
  }finally{globalThis.fetch=originalFetch;}
});

test("adapter analysis sends only compact scan context to OpenAI",async()=>{
  const originalFetch=globalThis.fetch;
  const report:AnalysisReport={
    metadata:{
      platform:"gba",
      fileName:"Pokemon Emerald.gba",
      fileSize:16777216,
      checksum:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      title:"POKEMON EMER",
      gameId:"BPEE",
      revision:"1",
      details:{makerCode:"01",headerChecksum:153}
    },
    adapterStatus:"unsupported",
    compatibility:"unsupported",
    capabilities:{detection:"partial",extraction:"partial",translation:"manual",thaiFont:"unknown",injection:"blocked",rebuild:"blocked",validation:"partial"},
    genericScan:{
      ascii:{count:2,examples:[{offset:100,length:8,text:"OPTIONS",confidence:.8}]},
      shiftJis:{count:0,examples:[]},
      pointers:{count:1,uniqueTargets:1,examples:[{offset:200,target:300,confidence:.7}]},
      compression:{count:1,examples:[{offset:400,type:"lz77",confidence:.9}]}
    },
    issues:[{level:"error",code:"NO_FULL_ADAPTER",message:"No full adapter"}]
  };
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert.equal(body.store,false);
    assert.equal(body.text.format.strict,true);
    const payload=JSON.parse(body.input[1].content);
    assert.equal(payload.metadata.checksumPrefix,"0123456789abcdef");
    assert.equal(payload.metadata.checksum,undefined);
    assert.equal(payload.metadata.fileName,"Pokemon Emerald.gba");
    assert.equal(payload.metadata.title,"POKEMON EMER");
    assert.equal(payload.genericScan.ascii.examples[0].text,"OPTIONS");
    assert.deepEqual(payload.issueCodes,["NO_FULL_ADAPTER"]);
    return Response.json({output_text:JSON.stringify({
      likelyGame:"Pokemon Emerald",
      likelyEngine:"Pokemon Gen 3 GBA",
      confidence:.9,
      extractionHypothesis:"Use Emerald-specific tables and pointer ranges.",
      adapterReuse:["Reuse generic GBA scanner"],
      blockers:["Needs exact Emerald adapter"],
      nextSteps:["Create manifest from known Emerald revision"],
      buildSafety:"blocked"
    })});
  };
  try {
    const result=await new OpenAIAdapterAnalysisProvider("test-key","test-model").analyze(report);
    assert.equal(result.likelyGame,"Pokemon Emerald");
    assert.equal(result.buildSafety,"blocked");
  }finally{globalThis.fetch=originalFetch;}
});
