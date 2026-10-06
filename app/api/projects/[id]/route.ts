import { loadProject, projectView, editTranslation, changeTarget, deleteProject } from "@/core/projects";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context) {
  try{return Response.json(projectView(await loadProject((await context.params).id)));}
  catch{return Response.json({error:"Project not found"},{status:404});}
}
export async function PATCH(request:Request,context:Context) {
  try {
    const data=await request.json();
    if(data.target==="thai" || data.target==="english") return Response.json(projectView(await changeTarget((await context.params).id,data.target)));
    if(typeof data.entryId!=="string" || typeof data.text!=="string") throw new Error("Invalid translation");
    return Response.json(projectView(await editTranslation((await context.params).id,data.entryId,data.text)));
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Save failed"},{status:400});}
}
export async function DELETE(_request:Request,context:Context) {
  try{await deleteProject((await context.params).id);return Response.json({deleted:true});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Delete failed"},{status:400});}
}
