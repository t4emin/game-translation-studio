import { NextResponse } from "next/server";
import { analyzeGame } from "@/core/analysis";
import { extensionOf } from "@/core/game-file/fingerprint";
import type { GameFile } from "@/core/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const upload = form.get("file");
  const platform = String(form.get("platform") ?? "auto");

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

  const report = await analyzeGame(file, platform);
  return NextResponse.json(report, { status: report.issues.some((issue) => issue.code === "unsupported-extension") ? 400 : 200 });
}
