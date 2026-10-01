import { createProject, projectView } from "@/core/projects";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const form=await request.formData(),file=form.get("file"),target=form.get("target")??"thai",platform=String(form.get("platform")??"gba");
    const supported=platform==="ps2" ? ".iso" : ".gba";
    if(!(file instanceof File) || !file.name.toLowerCase().endsWith(supported)) return Response.json({error:`Upload a supported ${supported} file.`},{status:400});
    if(target!=="thai" && target!=="english") return Response.json({error:"Invalid target language"},{status:400});
    if(platform!=="gba" && platform!=="ps2") return Response.json({error:"Invalid platform"},{status:400});
    return Response.json(projectView(await createProject(file.name,new Uint8Array(await file.arrayBuffer()),target,platform)));
  } catch(error) {return Response.json({error:error instanceof Error?error.message:"Upload failed"},{status:400});}
}
