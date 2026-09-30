export const decodeMap = new Map<number, string>([
  [0x00, " "],
  [0x01, "À"],
  [0x02, "Á"],
  [0x03, "Â"],
  [0x04, "Ç"],
  [0x05, "È"],
  [0x06, "É"],
  [0x07, "Ê"],
  [0x08, "Ë"],
  [0x09, "Ì"],
  [0x0b, "Î"],
  [0x0c, "Ï"],
  [0x0d, "Ò"],
  [0x0e, "Ó"],
  [0x0f, "Ô"],
  [0x10, "Œ"],
  [0x11, "Ù"],
  [0x12, "Ú"],
  [0x13, "Û"],
  [0x14, "Ñ"],
  [0x15, "ß"],
  [0x16, "à"],
  [0x17, "á"],
  [0x19, "ç"],
  [0x1a, "è"],
  [0x1b, "é"],
  [0x1c, "ê"],
  [0x1d, "ë"],
  [0x1e, "ì"],
  [0x20, "î"],
  [0x21, "ï"],
  [0x22, "ò"],
  [0x23, "ó"],
  [0x24, "ô"],
  [0x25, "œ"],
  [0x26, "ù"],
  [0x27, "ú"],
  [0x28, "û"],
  [0x29, "ñ"],
  [0x2a, "º"],
  [0x2b, "ª"],
  [0x2d, "&"],
  [0x2e, "+"],
  [0x34, "Lv"],
  [0x35, "="],
  [0x36, ";"],
  [0x50, "▯"],
  [0x51, "¿"],
  [0x52, "¡"],
  [0x53, "PK"],
  [0x54, "MN"],
  [0x55, "PO"],
  [0x56, "Ké"],
  [0x5a, "Í"],
  [0x5b, "%"],
  [0x5c, "("],
  [0x5d, ")"],
  [0x68, "â"],
  [0x6f, "í"],
  [0x77, " "],
  [0x79, "↑"],
  [0x7a, "↓"],
  [0x7b, "←"],
  [0x7c, "→"],
  [0x84, "ᵉ"],
  [0x85, "<"],
  [0x86, ">"],
  [0xa0, "ʳᵉ"],
  [0xab, "!"],
  [0xac, "?"],
  [0xad, "."],
  [0xae, "-"],
  [0xaf, "•"],
  [0xb0, "..."],
  [0xb1, "“"],
  [0xb2, "”"],
  [0xb3, "‘"],
  [0xb4, "’"],
  [0xb5, "♂"],
  [0xb6, "♀"],
  [0xb7, "$"],
  [0xb8, ","],
  [0xb9, "×"],
  [0xba, "/"],
  [0xef, "▶"],
  [0xf0, ":"],
  [0xf1, "Ä"],
  [0xf2, "Ö"],
  [0xf3, "Ü"],
  [0xf4, "ä"],
  [0xf5, "ö"],
  [0xf6, "ü"],
  [0xfa, "[PROMPT_SCROLL]"],
  [0xfb, "[PROMPT_CLEAR]"],
  [0xfe, "[NEW_LINE]"]
]);

export const placeholders = new Map<number, string>([
  [0x01, "[VAR:PLAYER]"],
  [0x02, "[VAR:STRING1]"],
  [0x03, "[VAR:STRING2]"],
  [0x04, "[VAR:STRING3]"],
  [0x06, "[VAR:RIVAL]"],
  [0x07, "[VAR:VERSION]"]
]);

for (let i = 0; i <= 9; i += 1) decodeMap.set(0xa1 + i, String(i));
for (let i = 0; i < 26; i += 1) {
  decodeMap.set(0xbb + i, String.fromCharCode(65 + i));
  decodeMap.set(0xd5 + i, String.fromCharCode(97 + i));
}

export interface DecodedPokemonText {
  text: string;
  rawLength: number;
  protectedTokens: string[];
  unknownBytes: number[];
}

export const controlLengths: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 3, 5: 1, 6: 1, 7: 0, 8: 1, 9: 0,
  10: 0, 11: 2, 12: 1, 13: 1, 14: 1, 15: 0, 16: 2, 17: 1,
  18: 1, 19: 1, 20: 1, 21: 0, 22: 0, 23: 0, 24: 0
};

export function decodePokemonText(bytes: Uint8Array, offset: number, maxLength: number): DecodedPokemonText {
  const chunks: string[] = [];
  const protectedTokens: string[] = [];
  const unknownBytes: number[] = [];
  let rawLength = 0;

  for (let i = 0; i < maxLength && offset + i < bytes.byteLength; i += 1) {
    const byte = bytes[offset + i];
    rawLength += 1;

    if (byte === 0xff) break;

    if (byte === 0xfd) {
      const placeholder = bytes[offset + i + 1];
      if (placeholder === undefined || i + 1 >= maxLength) throw new Error("Truncated placeholder");
      const token = placeholders.get(placeholder) ?? `[VAR:${placeholder.toString(16).padStart(2, "0").toUpperCase()}]`;
      chunks.push(token);
      protectedTokens.push(token);
      i += 1;
      rawLength += 1;
      continue;
    }

    if (byte === 0xfc) {
      const command = bytes[offset + i + 1];
      const count = controlLengths[command];
      if (count === undefined || i + 1 + count >= maxLength || offset + i + 1 + count >= bytes.length) throw new Error("Invalid text control");
      const token = `[CTRL:${Buffer.from(bytes.slice(offset+i+1, offset+i+2+count)).toString("hex").toUpperCase()}]`;
      chunks.push(token);
      protectedTokens.push(token);
      i += 1 + count;
      rawLength += 1 + count;
      continue;
    }

    if (byte === 0xf9 || byte === 0xf8) {
      if (i + 1 >= maxLength || offset + i + 1 >= bytes.length) throw new Error("Truncated symbol");
      const token = `[${byte === 0xf9 ? "SYMBOL" : "KEY"}:${bytes[offset+i+1].toString(16).padStart(2,"0").toUpperCase()}]`;
      chunks.push(token); protectedTokens.push(token); i++; rawLength++; continue;
    }

    const decoded = decodeMap.get(byte);
    if (decoded) {
      chunks.push(decoded);
      if (decoded.startsWith("[")) protectedTokens.push(decoded);
    } else {
      const token = `[BYTE:${byte.toString(16).padStart(2, "0").toUpperCase()}]`;
      chunks.push(token);
      protectedTokens.push(token);
      unknownBytes.push(byte);
    }
  }

  return {
    text: chunks.join(""),
    rawLength,
    protectedTokens: Array.from(new Set(protectedTokens)),
    unknownBytes: Array.from(new Set(unknownBytes))
  };
}

export function readGbaPointer(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) return undefined;
  const pointer = Buffer.from(bytes.slice(offset, offset + 4)).readUInt32LE(0);
  if (pointer < 0x08000000 || pointer >= 0x0a000000) return undefined;
  const romOffset = pointer - 0x08000000;
  return romOffset < bytes.byteLength ? romOffset : undefined;
}
