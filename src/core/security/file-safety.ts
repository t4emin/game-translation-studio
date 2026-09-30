import type { GameFile, ValidationIssue } from "../types.ts";

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const allowedExtensions = new Set([".gba", ".iso", ".cso"]);

export function maxUploadBytes(): number {
  const configured = Number(process.env.GTS_MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

export function validateGameFile(file: GameFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!allowedExtensions.has(file.extension)) {
    issues.push({
      level: "error",
      code: "unsupported-extension",
      message: "Only .gba, .iso and .cso files are accepted by the ingestion layer."
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

export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
}
