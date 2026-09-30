import type { TargetLanguage, TranslationEntry, ValidationIssue } from "../types.ts";

export interface LanguageProfile {
  id: TargetLanguage;
  label: string;
  guidance: string[];
  validateEntry(entry: TranslationEntry): ValidationIssue[];
}

export const thaiProfile: LanguageProfile = {
  id: "thai",
  label: "Thai",
  guidance: [
    "Use natural game localization rather than literal word-for-word translation.",
    "Preserve names, glossary terms and protected control tokens exactly.",
    "Treat Thai rendering and encoding as build-blocking technical constraints."
  ],
  validateEntry(entry) {
    const issues: ValidationIssue[] = [];
    if (entry.targetLanguage === "thai" && /[\u0E00-\u0E7F]/.test(entry.translatedText) === false && entry.translatedText.trim()) {
      issues.push({
        level: "warning",
        code: "thai-entry-has-no-thai-glyphs",
        entryId: entry.id,
        message: "Thai target entry does not contain Thai characters; review if this is intentional."
      });
    }
    return issues;
  }
};

export const englishProfile: LanguageProfile = {
  id: "english",
  label: "English",
  guidance: [
    "Use natural English localization with consistent terminology.",
    "Preserve protected tokens and text constraints exactly."
  ],
  validateEntry() {
    return [];
  }
};

export function languageProfile(language: TargetLanguage): LanguageProfile {
  return language === "thai" ? thaiProfile : englishProfile;
}
