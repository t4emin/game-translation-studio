import test from "node:test";
import assert from "node:assert/strict";
import { OpenAITranslationProvider } from "../src/core/providers/openai/provider.ts";
import type { TranslationEntry } from "../src/core/types.ts";

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
