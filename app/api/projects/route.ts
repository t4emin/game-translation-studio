import { createProject, projectView } from "@/core/projects";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const form=await request.formData(),file=form.get("file"),target=form.get("target")??"thai";
    if(!(file instanceof File) || !file.name.toLowerCase().endsWith(".gba")) return Response.json({error:"Upload a supported .gba ROM file."},{status:400});
    if(target!=="thai" && target!=="english") return Response.json({error:"Invalid target language"},{status:400});
    return Response.json(projectView(await createProject(file.name,new Uint8Array(await file.arrayBuffer()),target)));
  } catch(error) {return Response.json({error:error instanceof Error?error.message:"Upload failed"},{status:400});}
}
