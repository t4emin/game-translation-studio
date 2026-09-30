import type { GameFile, ValidationIssue } from "../types.ts";

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const allowedExtensions = new Set([".gba"]);

export function maxUploadBytes(): number {
  return DEFAULT_MAX_BYTES;
}

export function validateGameFile(file: GameFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!allowedExtensions.has(file.extension)) {
    issues.push({
      level: "error",
      code: "unsupported-extension",
      message: "Game Translation Studio V1 accepts only .gba files."
    });
  }

  if (file.size !== file.bytes.byteLength) {
    issues.push({
      level: "error",
      code: "size-mismatch",
      message: "The declared file size does not match the bytes received."
    });
  }

  if (file.size > maxUploadBytes()) {
    issues.push({
      level: "error",
      code: "file-too-large",
      message: `File exceeds the configured ${maxUploadBytes()} byte safety limit.`
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
