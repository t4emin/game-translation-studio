"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Languages, Download, Pause, RotateCw, Check, Terminal } from "lucide-react";

type Project = {
  id:string; name:string; target:string; total:number; done:number; complete:boolean; error:string|null;
  samples:{id:string;source:string;translation:string}[];
  failed:{id:string;source:string;translation:string;error:string}[];
};
async function responseJson(response:Response) {
  const data=await response.json();
  if(!response.ok) throw new Error(data.error??"Request failed");
  return data;
}
const readable=(text:string)=>text.replace(/\[NEW_LINE\]/g,"\n").replace(/\[PROMPT_(CLEAR|SCROLL)\]/g,"\n\n");

export default function Home() {
  const [project,setProject]=useState<Project|null>(null);
  const [target,setTarget]=useState("thai");
  const [busy,setBusy]=useState<"upload"|"translate"|"export"|null>(null);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("รอไฟล์ ROM");
  const [stopping,setStopping]=useState(false);
  const stop=useRef(false);
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get("project");
    const id=requested&&/^[0-9a-f-]{36}$/.test(requested)?requested:localStorage.getItem("gts-project");
    if(id) fetch(`/api/projects/${id}`).then(responseJson).then((p:Project)=>{
      localStorage.setItem("gts-project",p.id);
      setProject(p);setTarget(p.target);setStatus(p.complete?"แปลเสร็จแล้ว พร้อม Export":"โหลดงานเดิมแล้ว");
    }).catch(()=>localStorage.removeItem("gts-project"));
    return ()=>{stop.current=true;};
  },[]);
  async function upload(file:File) {
    setBusy("upload");setError("");setStatus("กำลังอ่านข้อความจาก ROM...");
    try {
      const form=new FormData();form.set("file",file);form.set("target",target);
      const p:Project=await responseJson(await fetch("/api/projects",{method:"POST",body:form}));
      setProject(p);localStorage.setItem("gts-project",p.id);setStatus("พร้อมแปล");
    }catch(e){setError(e instanceof Error?e.message:"Upload failed");setStatus("อัปโหลดไม่สำเร็จ");}
    finally{setBusy(null);}
  }
  async function translate() {
    if(!project) return;
    setBusy("translate");setError("");setStopping(false);stop.current=false;setStatus("กำลังแปล...");
    try {
      let previous=project.done,stalled=0;
      while(!stop.current) {
        const p:Project=await responseJson(await fetch(`/api/projects/${project.id}/translate`,{method:"POST"}));
        setProject(p);
        stalled=p.done===previous?stalled+1:0;previous=p.done;
        if(p.error&&stalled>=3) throw new Error(p.error);
        if(stalled>=3) throw new Error("ยังแปลชุดนี้ไม่สำเร็จ บันทึกความคืบหน้าไว้แล้ว กรุณาลองอีกครั้ง");
        setStatus(p.error?"บันทึกแล้ว กำลังลองข้อความที่เหลือใหม่...":"กำลังแปล...");
        if(p.complete){setStatus("แปลเสร็จแล้ว พร้อม Export");break;}
      }
      if(stop.current) setStatus("พักการแปลแล้ว บันทึกความคืบหน้าไว้แล้ว");
    }catch(e){setError(e instanceof Error?e.message:"Translation failed");setStatus("การแปลหยุดชั่วคราว");
      try{setProject(await responseJson(await fetch(`/api/projects/${project.id}`)));}catch{}
    }finally{setBusy(null);setStopping(false);}
  }
  async function selectTarget(next:string) {
    if(!project){setTarget(next);return;}
    setBusy("upload");setError("");
    try {
      const p:Project=await responseJson(await fetch(`/api/projects/${project.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({target:next})}));
      setProject(p);setTarget(p.target);
    }catch(e){setError(e instanceof Error?e.message:"Language change failed");}
    finally{setBusy(null);}
  }
  async function download() {
    if(!project) return;
    setBusy("export");setError("");setStatus("กำลังดาวน์โหลด ROM...");
    try {
      const a=document.createElement("a");
      a.href=`/api/projects/${project.id}/export`;
      a.download=`FireRed-Rev1-${project.target}.gba`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("Export สำเร็จ");
    }catch(e){setError(e instanceof Error?e.message:"Export failed");setStatus("Export ไม่สำเร็จ");}
    finally{setBusy(null);}
  }
  async function save(entryId:string,text:string) {
    setError("");
    try{setProject(await responseJson(await fetch(`/api/projects/${project!.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId,text})})));}
    catch(e){setError(e instanceof Error?e.message:"Save failed");}
  }
  const percent=project?Math.round(project.done/project.total*100):0;
  return <main className="shell">
    <header className="topbar"><div className="brand"><img src="/logo.png" className="brandLogo" alt=""/><div><p className="eyebrow">LOCAL / FIRE RED REV 1</p><h1>Game Translation Studio</h1></div></div><Terminal size={22} aria-hidden="true"/></header>
    <section className="flow" aria-label="Translation">
      <div className="step"><span className="stepNumber">01</span><div className="stepBody"><h2>Upload ROM</h2><input aria-label="Upload ROM" type="file" accept=".gba" disabled={!!busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/><p className="fileName">{project?.name??"Pokemon FireRed / USA・Europe / Rev 1"}</p></div><Upload className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">02</span><div className="stepBody"><h2>แปลภาษา</h2><fieldset disabled={!!busy||!!project?.done}><legend>ภาษาปลายทาง</legend><label><input type="radio" name="target" checked={target==="thai"} onChange={()=>void selectTarget("thai")}/>ไทย</label><label><input type="radio" name="target" checked={target==="english"} onChange={()=>void selectTarget("english")}/>English</label></fieldset>
      <div className="actions"><button disabled={!project||!!busy||project.complete} onClick={()=>void translate()}>{project?.complete?<Check size={17}/>:project?.done?<RotateCw size={17}/>:<Languages size={17}/>} {project?.complete?"แปลเสร็จแล้ว":project?.done?"แปลต่อ":"แปล"}</button>{busy==="translate"&&<button className="secondary" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);setStatus("กำลังบันทึกชุดปัจจุบัน...");}}><Pause size={17}/>{stopping?"กำลังพัก...":"พัก"}</button>}</div></div><Languages className="stepIcon" size={20}/></div>
      <div className="step"><span className="stepNumber">03</span><div className="stepBody"><h2>Export</h2><button className="secondary" disabled={!project?.complete||!!busy} onClick={()=>void download()}><Download size={17}/>Export .gba</button></div><Download className="stepIcon" size={20}/></div>
    </section>
    <section className="progressArea" aria-live="polite"><div className="statusLine"><span className="prompt">&gt;</span><span>{status}</span>{project?.complete&&<Check size={17}/>}</div>{project&&<><progress max={project.total} value={project.done} aria-label="ข้อความที่แปลแล้ว"/><div className="progressLabel"><span>{project.done.toLocaleString()} / {project.total.toLocaleString()} ข้อความ</span><span>{percent}%</span></div></>}{error&&<p className="errorText" role="alert">{error}</p>}</section>
    <p className="scope">ขอบเขต: บทสนทนาและเนื้อเรื่อง · คงชื่อเดิม · เมนู หน้าต่อสู้ และคู่มือยังเป็นต้นฉบับ</p>
    {project&&<details className="details"><summary>คำแปล {project.failed.length>0&&`/ ต้องตรวจ ${project.failed.length} ข้อความ`}</summary>
      {project.failed.map(entry=><form className="translationRow" key={entry.id} onSubmit={event=>{event.preventDefault();void save(entry.id,String(new FormData(event.currentTarget).get("text")));}}><p>{readable(entry.source)}</p><textarea aria-label={`แก้คำแปล ${entry.id}`} name="text" defaultValue={entry.translation}/><p className="errorText">{entry.error}</p><button disabled={!!busy} type="submit"><Check size={16}/>บันทึก</button></form>)}
      {project.samples.map(entry=><div className="translationRow" key={entry.id}><p className="muted">{readable(entry.source)}</p><p>{readable(entry.translation)}</p></div>)}
      {!project.samples.length&&!project.failed.length&&<p className="muted">ยังไม่มีคำแปล</p>}
    </details>}
  </main>;
}
