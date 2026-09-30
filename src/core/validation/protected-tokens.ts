import type { TranslationEntry, ValidationIssue } from "../types.ts";

const tokenPattern = /(\{[A-Z0-9_:-]+\}|\[[A-Z0-9_:-]+\]|<[^>]+>)/g;

export function detectProtectedTokens(text: string): string[] {
  return Array.from(new Set(text.match(tokenPattern) ?? []));
}

export function validateProtectedTokens(entries: TranslationEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const entry of entries) {
    for (const token of entry.protectedTokens) {
      if (!entry.translatedText.includes(token)) {
        issues.push({
          level: "error",
          code: "missing-protected-token",
          entryId: entry.id,
          message: `Required protected token ${token} is missing from the translation.`
        });
      }
    }
  }

  return issues;
}
