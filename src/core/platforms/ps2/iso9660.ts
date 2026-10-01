export interface IsoFileEntry {
  path: string;
  lba: number;
  offset: number;
  size: number;
  directory: boolean;
  suspicious: boolean;
  reason: string;
  stringCount?: number;
  sample?: string;
  samples?: string[];
}

export interface IsoStringCandidate {
  path: string;
  offset: number;
  encoding: "ascii" | "utf16le" | "shift-jis";
  text: string;
  confidence: number;
}

export interface IsoScanSummary {
  valid: boolean;
  volumeId?: string;
  systemId?: string;
  bootFile?: string;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  largestFiles: IsoFileEntry[];
  candidates: IsoFileEntry[];
  strings: IsoStringCandidate[];
  issues: string[];
}

const sectorSize = 2048;
const textExtensions = new Set([".TXT", ".MSG", ".MES", ".STR", ".SCR", ".DAT", ".BIN", ".PAK", ".PAC", ".ARC", ".IRX"]);
const fontExtensions = new Set([".TM2", ".TIM2", ".TEX", ".FNT", ".FONT"]);

export function scanPs2Iso(bytes: Uint8Array): IsoScanSummary {
  const issues: string[] = [];
  const pvd = sectorSize * 16;
  if (bytes.length < pvd + sectorSize || ascii(bytes, pvd + 1, 5) !== "CD001") {
    return { valid: false, fileCount: 0, directoryCount: 0, totalBytes: bytes.length, largestFiles: [], candidates: [], strings: [], issues: ["ISO9660 Primary Volume Descriptor was not found."] };
  }

  const systemId = trimIsoText(ascii(bytes, pvd + 8, 32));
  const volumeId = trimIsoText(ascii(bytes, pvd + 40, 32));
  const root = parseRecord(bytes, pvd + 156);
  if (!root || !root.directory) {
    return { valid: false, systemId, volumeId, fileCount: 0, directoryCount: 0, totalBytes: bytes.length, largestFiles: [], candidates: [], strings: [], issues: ["ISO9660 root directory record is invalid."] };
  }

  const entries: IsoFileEntry[] = [];
  const visited = new Set<number>();
  walkDirectory(bytes, root, "", entries, visited, issues);
  const files = entries.filter((entry) => !entry.directory);
  const bootFile = readSystemCnf(bytes, files);
  const candidates = files
    .map((entry) => scoreCandidate(bytes, entry))
    .filter((entry) => entry.suspicious)
    .sort((a, b) => candidateRank(b) - candidateRank(a));
  const strings = scanIsoStrings(bytes, files, candidates);

  return {
    valid: true,
    systemId,
    volumeId,
    bootFile,
    fileCount: files.length,
    directoryCount: entries.length - files.length,
    totalBytes: bytes.length,
    largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 12),
    candidates,
    strings,
    issues
  };
}

function walkDirectory(bytes: Uint8Array, directory: ParsedRecord, parent: string, entries: IsoFileEntry[], visited: Set<number>, issues: string[]) {
  if (visited.has(directory.offset)) return;
  visited.add(directory.offset);
  if (directory.offset + directory.size > bytes.length) {
    issues.push(`Directory extends beyond ISO: ${parent || "/"}`);
    return;
  }
  let cursor = directory.offset;
  const end = directory.offset + directory.size;
  while (cursor < end) {
    const length = bytes[cursor];
    if (length === 0) {
      cursor = (Math.floor(cursor / sectorSize) + 1) * sectorSize;
      continue;
    }
    const record = parseRecord(bytes, cursor);
    cursor += length;
    if (!record || record.name === "." || record.name === "..") continue;
    const entryPath = `${parent}/${record.name}`;
    const entry: IsoFileEntry = {
      path: entryPath,
      lba: record.lba,
      offset: record.offset,
      size: record.size,
      directory: record.directory,
      suspicious: false,
      reason: ""
    };
    entries.push(entry);
    if (record.directory) walkDirectory(bytes, record, entryPath, entries, visited, issues);
  }
}

interface ParsedRecord {
  name: string;
  lba: number;
  offset: number;
  size: number;
  directory: boolean;
}

function parseRecord(bytes: Uint8Array, offset: number): ParsedRecord | undefined {
  const length = bytes[offset];
  if (length < 34 || offset + length > bytes.length) return undefined;
  const lba = u32(bytes, offset + 2);
  const size = u32(bytes, offset + 10);
  const flags = bytes[offset + 25];
  const nameLength = bytes[offset + 32];
  if (offset + 33 + nameLength > bytes.length) return undefined;
  const rawName = bytes.subarray(offset + 33, offset + 33 + nameLength);
  const name = normalizeName(rawName);
  return { name, lba, offset: lba * sectorSize, size, directory: (flags & 0x02) !== 0 };
}

function scoreCandidate(bytes: Uint8Array, entry: IsoFileEntry): IsoFileEntry {
  const ext = extension(entry.path);
  const upperPath = entry.path.toUpperCase();
  const reasons: string[] = [];
  if (textExtensions.has(ext)) reasons.push(`${ext.slice(1)} container`);
  if (fontExtensions.has(ext)) reasons.push("font/texture candidate");
  if (/SCRIPT|DIALOG|MESSAGE|MSG|TEXT|EVENT|SCENARIO|STORY|SUBTITLE|FONT|KANJI|CHAR|TABLE/.test(upperPath)) reasons.push("name hints at text/font resources");
  const strings = sampleAscii(bytes, entry.offset, entry.size);
  if (strings.count) reasons.push("readable ASCII strings");
  return { ...entry, suspicious: reasons.length > 0, reason: reasons.join(", "), stringCount: strings.count, sample: strings.samples.join(" / ").slice(0, 240) || undefined, samples: strings.samples };
}

function readSystemCnf(bytes: Uint8Array, files: IsoFileEntry[]): string | undefined {
  const system = files.find((entry) => entry.path.toUpperCase() === "/SYSTEM.CNF");
  if (!system || system.offset + system.size > bytes.length) return undefined;
  const text = ascii(bytes, system.offset, Math.min(system.size, 4096));
  const match = text.match(/BOOT2?\s*=\s*cdrom0:\\([^;\r\n]+)(?:;1)?/i);
  return match?.[1].replace(/\\/g, "/").trim();
}

function sampleAscii(bytes: Uint8Array, offset: number, size: number): { count: number; samples: string[] } {
  if (offset >= bytes.length || size <= 0) return { count: 0, samples: [] };
  const end = Math.min(bytes.length, offset + Math.min(size, 128 * 1024));
  const chunks: string[] = [];
  let count = 0;
  let current = "";
  for (let i = offset; i < end; i += 1) {
    const value = bytes[i];
    if ((value >= 0x20 && value <= 0x7e) || value === 0x0a || value === 0x0d || value === 0x09) current += String.fromCharCode(value);
    else {
      if (current.trim().length >= 16) {
        count += 1;
        if (chunks.length < 8) chunks.push(current.trim().replace(/\s+/g, " "));
      }
      current = "";
    }
  }
  if (current.trim().length >= 16) {
    count += 1;
    if (chunks.length < 8) chunks.push(current.trim().replace(/\s+/g, " "));
  }
  return { count, samples: chunks };
}

function normalizeName(rawName: Uint8Array): string {
  if (rawName.length === 1 && rawName[0] === 0) return ".";
  if (rawName.length === 1 && rawName[0] === 1) return "..";
  return Buffer.from(rawName).toString("ascii").replace(/;1$/i, "");
}

function candidateRank(entry: IsoFileEntry): number {
  return (entry.stringCount ? 100 + Math.min(entry.stringCount, 100) : 0) + (entry.reason.includes("name hints") ? 50 : 0) + Math.min(entry.size / 1024 / 1024, 20);
}

function scanIsoStrings(bytes: Uint8Array, files: IsoFileEntry[], candidates: IsoFileEntry[]): IsoStringCandidate[] {
  const scanSet = new Map<string, IsoFileEntry>();
  for (const file of [...candidates, ...files.filter((file) => file.size <= 4 * 1024 * 1024)]) scanSet.set(file.path, file);
  const strings: IsoStringCandidate[] = [];
  for (const file of scanSet.values()) {
    if (file.offset >= bytes.length || file.size <= 0) continue;
    const end = Math.min(bytes.length, file.offset + Math.min(file.size, 2 * 1024 * 1024));
    strings.push(...scanAsciiStrings(bytes, file, end));
    strings.push(...scanUtf16LeStrings(bytes, file, end));
    strings.push(...scanShiftJisStrings(bytes, file, end));
  }
  const seen = new Set<string>();
  return strings
    .filter((entry) => entry.confidence >= 0.56)
    .sort((a, b) => b.confidence - a.confidence || b.text.length - a.text.length)
    .filter((entry) => {
      const key = `${entry.path}:${entry.text.slice(0, 120)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 500);
}

function scanAsciiStrings(bytes: Uint8Array, file: IsoFileEntry, end: number): IsoStringCandidate[] {
  const strings: IsoStringCandidate[] = [];
  let start = file.offset;
  let current = "";
  for (let i = file.offset; i < end; i += 1) {
    const value = bytes[i];
    if ((value >= 0x20 && value <= 0x7e) || value === 0x0a || value === 0x0d || value === 0x09) current += String.fromCharCode(value);
    else {
      pushText(strings, file, start, "ascii", current);
      current = "";
      start = i + 1;
    }
  }
  pushText(strings, file, start, "ascii", current);
  return strings;
}

function scanUtf16LeStrings(bytes: Uint8Array, file: IsoFileEntry, end: number): IsoStringCandidate[] {
  const strings: IsoStringCandidate[] = [];
  let start = file.offset;
  let current = "";
  for (let i = file.offset; i + 1 < end; i += 2) {
    const value = bytes[i] | (bytes[i + 1] << 8);
    if (value === 0x0a || value === 0x0d || value === 0x09 || (value >= 0x20 && value <= 0x7e)) current += String.fromCharCode(value);
    else {
      pushText(strings, file, start, "utf16le", current);
      current = "";
      start = i + 2;
    }
  }
  pushText(strings, file, start, "utf16le", current);
  return strings;
}

function scanShiftJisStrings(bytes: Uint8Array, file: IsoFileEntry, end: number): IsoStringCandidate[] {
  const strings: IsoStringCandidate[] = [];
  const decoder = new TextDecoder("shift_jis", { fatal: false });
  let start = file.offset;
  let raw: number[] = [];
  for (let i = file.offset; i < end;) {
    const first = bytes[i], second = bytes[i + 1];
    if ((first >= 0x20 && first <= 0x7e) || first === 0x0a || first === 0x0d || first === 0x09) {
      raw.push(first); i += 1; continue;
    }
    if (second !== undefined && isShiftJisPair(first, second)) {
      raw.push(first, second); i += 2; continue;
    }
    if (raw.length >= 12) pushText(strings, file, start, "shift-jis", decoder.decode(Uint8Array.from(raw)));
    raw = [];
    i += 1;
    start = i;
  }
  if (raw.length >= 12) pushText(strings, file, start, "shift-jis", decoder.decode(Uint8Array.from(raw)));
  return strings;
}

function pushText(strings: IsoStringCandidate[], file: IsoFileEntry, start: number, encoding: IsoStringCandidate["encoding"], rawText: string) {
  const text = rawText.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (text.length < 14 || text.length > 800) return;
  const confidence = textConfidence(text);
  if (confidence <= 0) return;
  strings.push({ path: file.path, offset: start, encoding, text: text.slice(0, 500), confidence });
}

function textConfidence(text: string): number {
  if (!/[A-Za-z]{3}|[\u3040-\u30ff\u4e00-\u9fff]{3}/.test(text)) return 0;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const japanese = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  const spaces = (text.match(/\s/g) ?? []).length;
  const common = (text.match(/\b(the|you|and|to|of|in|is|it|that|this|for|with|your|have|get|not|are|will|was|on|from|press|start|yes|no)\b/gi) ?? []).length;
  const symbols = (text.match(/[^A-Za-z0-9\s.!?,'":;\-()[\]\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  const ratio = (latin + japanese) / Math.max(1, text.length);
  let score = 0.32;
  score += Math.min(0.22, text.length / 300);
  score += Math.min(0.18, common * 0.035);
  score += spaces >= 2 ? 0.08 : 0;
  score += japanese >= 3 ? 0.24 : 0;
  score += ratio > 0.42 ? 0.12 : -0.12;
  score -= Math.min(0.28, symbols / Math.max(1, text.length) * 1.8);
  if (/(.)\1{7,}/.test(text)) score -= 0.2;
  return Math.max(0, Math.min(0.99, score));
}

function isShiftJisPair(first: number, second: number): boolean {
  const lead = (first >= 0x81 && first <= 0x9f) || (first >= 0xe0 && first <= 0xfc);
  const trail = (second >= 0x40 && second <= 0x7e) || (second >= 0x80 && second <= 0xfc);
  return lead && trail;
}

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index).toUpperCase() : "";
}

function trimIsoText(text: string): string {
  return text.replace(/\0/g, "").trim();
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, Math.min(bytes.length, offset + length))).toString("ascii");
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
