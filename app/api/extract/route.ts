import { NextResponse } from "next/server";
import { extractGameText } from "@/core/extraction";
import { extensionOf } from "@/core/game-file/fingerprint";
import type { GameFile } from "@/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const upload = form.get("file");
  const platform = String(form.get("platform") ?? "auto");
  const preserveNames = String(form.get("preserveNames") ?? "true") !== "false";

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing game file." }, { status: 400 });
  }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const file: GameFile = {
    name: upload.name,
    size: upload.size,
    extension: extensionOf(upload.name),
    bytes
  };

  const result = await extractGameText(file, platform, { preserveNames });
  return NextResponse.json(result, {
    status: result.issues.some((issue) => issue.level === "error") ? 422 : 200
  });
}
