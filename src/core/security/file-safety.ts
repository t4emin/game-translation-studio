import type { GameFile, ValidationIssue } from "../types.ts";

const GBA_MAX_BYTES = 32 * 1024 * 1024;
const ISO_MAX_BYTES = 9 * 1024 * 1024 * 1024;
const allowedExtensions = new Set([".gba", ".iso"]);

export function maxUploadBytes(file?: Pick<GameFile, "extension">): number {
  return file?.extension === ".iso" ? ISO_MAX_BYTES : GBA_MAX_BYTES;
}

export function validateGameFile(file: GameFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!allowedExtensions.has(file.extension)) {
    issues.push({
      level: "error",
      code: "unsupported-extension",
      message: "Game Translation Studio accepts .gba for GBA and .iso for PS2 analysis."
    });
  }

  if (file.size !== file.bytes.byteLength) {
    issues.push({
      level: "error",
      code: "size-mismatch",
      message: "The declared file size does not match the bytes received."
    });
  }

  const maxBytes = maxUploadBytes(file);
  if (file.size > maxBytes) {
    issues.push({
      level: "error",
      code: "file-too-large",
      message: `File exceeds the configured ${maxBytes} byte safety limit.`
    });
  }

  if (file.name.includes("/") || file.name.includes("\\")) {
    issues.push({
      level: "error",
      code: "unsafe-file-name",
      message: "File names must not contain path separators."
    });
  }

  return issues;
}
