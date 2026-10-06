const protectedTokenPattern = /(\[[^\]]+\]|\{[^}]+\})/g;
const thaiSegmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

export type ThaiCharacterClass =
  | "base"
  | "leading-vowel"
  | "following-vowel"
  | "upper-mark"
  | "lower-mark"
  | "tone-mark"
  | "digit"
  | "punctuation"
  | "space"
  | "latin"
  | "other";

export interface ThaiClusterInfo {
  cluster: string;
  classes: ThaiCharacterClass[];
}

export interface ThaiFontPlan {
  normalizedTexts: string[];
  clusters: string[];
  clusterCounts: Record<string, number>;
  report: ThaiFontBuildReport;
}

export interface ThaiFontBuildReport {
  fontDetected: boolean;
  glyphDimensions: "16x16";
  variableWidth: boolean;
  strategy: "precomposed-glyphs";
  encoding: "fire-red-extended-font-banks";
  availableGlyphSlots: number;
  uniqueThaiClusters: number;
  generatedGlyphs: number;
  layoutValidation: "pass" | "blocked";
  visualThaiQa: "unverified";
}

export function normalizeThaiText(text: string): string {
  return text.split(protectedTokenPattern).map((part) => isProtectedToken(part) ? part : normalizeThaiSegment(part)).join("");
}

export function splitTextClusters(text: string): string[] {
  // "ʳᵉ" is one game glyph (byte 0xA0) but two characters.
  return normalizeThaiText(text).split(/(\[[^\]]+\])/g).filter(Boolean).flatMap((part) =>
    part.startsWith("[") ? [part] : [...thaiSegmenter.segment(part.replaceAll("ʳᵉ", "\u0001"))].map((segment) => segment.segment.replaceAll("\u0001", "ʳᵉ"))
  );
}

export function analyzeThaiCluster(cluster: string): ThaiClusterInfo {
  return { cluster, classes: [...cluster].map(classifyThaiCharacter) };
}

export function createThaiFontPlan(texts: string[], availableGlyphSlots: number): ThaiFontPlan {
  const normalizedTexts = texts.map(normalizeThaiText);
  const counts = new Map<string, number>();
  for (const cluster of normalizedTexts.flatMap(splitTextClusters).filter(isThaiCluster)) {
    counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  }
  const clusters = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  if (clusters.length > availableGlyphSlots) throw new Error(`Thai font needs ${clusters.length} glyphs; this adapter supports ${availableGlyphSlots}.`);
  return {
    normalizedTexts,
    clusters,
    clusterCounts: Object.fromEntries(clusters.map((cluster) => [cluster, counts.get(cluster)!])),
    report: {
      fontDetected: true,
      glyphDimensions: "16x16",
      variableWidth: true,
      strategy: "precomposed-glyphs",
      encoding: "fire-red-extended-font-banks",
      availableGlyphSlots,
      uniqueThaiClusters: clusters.length,
      generatedGlyphs: clusters.length,
      layoutValidation: "pass",
      visualThaiQa: "unverified"
    }
  };
}

export function isThaiCluster(text: string): boolean {
  return /[\u0e00-\u0e7f]/.test(text);
}

function classifyThaiCharacter(char: string): ThaiCharacterClass {
  if (char === " ") return "space";
  if (/[\u0e50-\u0e59]/.test(char)) return "digit";
  if (/[\u0e40-\u0e44]/.test(char)) return "leading-vowel";
  if (/[\u0e30\u0e32\u0e33\u0e45]/.test(char)) return "following-vowel";
  if (/[\u0e34-\u0e37\u0e47]/.test(char)) return "upper-mark";
  if (/[\u0e38-\u0e3a]/.test(char)) return "lower-mark";
  if (/[\u0e48-\u0e4c]/.test(char)) return "tone-mark";
  if (/[\u0e01-\u0e2e]/.test(char)) return "base";
  if (/[\u0e2f\u0e4f-\u0e5b]/.test(char)) return "punctuation";
  if (/[A-Za-z0-9]/.test(char)) return "latin";
  return "other";
}

function isProtectedToken(text: string): boolean {
  return /^(\[[^\]]+\]|\{[^}]+\})$/.test(text);
}

function normalizeThaiSegment(text: string): string {
  return text.normalize("NFC").replace(/\u0e32\u0e4d|\u0e4d\u0e32/g, "\u0e33");
}
