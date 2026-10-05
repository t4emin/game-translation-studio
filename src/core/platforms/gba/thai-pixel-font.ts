// Thai pixel font. Clusters are composed from parts on a fixed grid so every glyph shares one
// baseline and stroke weight, instead of scaling an outline font per cluster.
//
// The letter and mark shapes come from the project team's own 8px Thai lettering, as first drawn for the
// "Pokemon Emerald Beyond Hoenn - TH" translation, and are licensed under CC BY 4.0 (see LICENSE-ASSETS.md).
//
// 16-row cell, matching the FireRed Latin fonts (baseline on row 10):
//   rows 0-3   tone marks and upper vowels      rows 5-10  letter body
//   rows 2-4   tall stems                       rows 11-13 descenders and lower vowels
// Pixel values follow the game's glyph format: 0 transparent, 1 text, 2 shadow.

const BODY_TOP = 5;
const BODY_ROWS = 6;

const body: Record<string, string[]> = {
  ก: [".###.", "#...#", ".#..#", "#...#", "#...#", "#...#"],
  ข: [".#..#", "#.#.#", ".##.#", "..#.#", "..#.#", ".####"],
  ฃ: [".#.#.#", "#.##.#", ".#.#.#", "...#.#", "...#.#", "..####"],
  ค: [".####.", "##...#", "#..#.#", "#.#.##", "##.#.#", ".#...#"],
  ฅ: [".####.", "##...#", "#..#.#", "#.#.##", "##.#.#", ".#...#"],
  ฆ: [".#.#..#", "#.##..#", ".#.#..#", "..##..#", ".#.####", "..##..#"],
  ง: ["...#.", "..#.#", "#..##", ".#..#", "..#.#", "...##"],
  จ: [".###.", "#...#", "..#.#", ".#.##", "..#.#", "....#"],
  ฉ: [".####..", "#....#.", "..#..#.", ".#.#.#.", "..#####", "...#.#."],
  ช: [".#..#.", "#.##..", ".##.#.", "..#.#.", "..#.#.", ".####."],
  ซ: [".#.#.#.", "#.##.#.", ".#.#.#.", "...#.#.", "...#.#.", "..####."],
  ฌ: [".###..#", "#...#.#", ".#..#.#", "##..#.#", "#.#.###", ".#.##.#"],
  ญ: [".###..#", "#...#.#", ".#..#.#", "##..#.#", "#.#.#.#", ".#..###"],
  ฎ: ["..###.", ".#...#", "..#..#", ".##..#", "#.#..#", ".#..##"],
  ฏ: ["..###.", ".#...#", "..#..#", ".##..#", "#.#..#", ".#.#.#"],
  ฐ: [".###", "#...", ".###", ".#.#", "..##", "...#"],
  ฑ: [".#.#..#", "#.##.##", ".#.##.#", "...#..#", "...#..#", "...#..#"],
  ฒ: [".#.##..#", "#.#.#..#", "#...#..#", "#.#.#..#", "##..##.#", ".#.##.##"],
  ณ: [".###..#.", "#...#.#.", ".#..#.#.", "##..#.#.", "#.#.#.##", ".#..##.#"],
  ด: [".####.", "#....#", "#.#..#", "##.#.#", "###..#", ".#...#"],
  ต: [".##.#.", "#..#.#", "#.#..#", "##.#.#", ".##..#", ".#...#"],
  ถ: [".###.", "#...#", ".#..#", "##..#", "#.#.#", ".#..#"],
  ท: [".#...#", "#.#.##", ".###.#", "..#..#", "..#..#", "..#..#"],
  ธ: [".###", "#...", "####", "...#", "#..#", "####"],
  น: [".#...#.", "#.#..#.", ".##..#.", "..#..#.", "..#.#.#", "..##.#."],
  บ: [".#...#", "#.#..#", ".##..#", "..#..#", "..#..#", ".#####"],
  ป: [".#...#", "#.#..#", ".##..#", "..#..#", "..#..#", ".#####"],
  ผ: [".#..#", "#.#.#", "##..#", "#...#", "#.#.#", ".#.#."],
  ฝ: [".#..#", "#.#.#", "##..#", "#...#", "#.#.#", ".#.#."],
  พ: [".#....#", "#.#...#", ".##.#.#", "..##.##", "..#...#", "..#...#"],
  ฟ: [".#....#", "#.#...#", ".##.#.#", "..##.##", "..#...#", "..#...#"],
  ภ: ["..###.", ".#...#", "..#..#", ".##..#", "#.#..#", ".#...#"],
  ม: [".#...#", "#.#..#", ".##..#", ".###.#", "#.#.##", ".##..#"],
  ย: [".#..#", "#.#.#", "##..#", ".##.#", "#...#", ".###."],
  ร: [".####", "#....", ".###.", "...##", "..#.#", "...#."],
  ฤ: [".###.", "#...#", ".#..#", "##..#", "#.#.#", ".#..#"],
  ล: [".####.", "#....#", "..####", ".##..#", ".#.#.#", "..#..#"],
  ว: [".###.", "#...#", "....#", "...##", "..#.#", "...#."],
  ศ: [".#####", "##...#", "#..#.#", "#.#.##", "##.#.#", ".#...#"],
  ษ: [".#...#.", "#.#..#.", ".######", "..#..#.", "..#..#.", ".#####."],
  ส: [".#####", "#....#", "..####", ".##..#", ".#.#.#", "..#..#"],
  ห: [".##..#.", "#.#.#.#", ".##.##.", "..##.#.", "..#..#.", "..#..#."],
  ฬ: [".#....#", "#.#...#", ".##.#.#", "..##.##", "..#...#", "..#...#"],
  อ: [".####.", "#....#", "..#..#", ".#.#.#", ".##..#", ".####."],
  ฮ: [".#####", "#....#", "..#..#", ".#.#.#", ".##..#", ".####."],
  ะ: [".#...", "#.#.#", ".###.", ".#...", "#.#.#", ".###."],
  า: [".###.", "#...#", "....#", "....#", "....#", "....#"],
  เ: ["#..", "#..", "#..", "##.", "#.#", ".#."],
  แ: ["#..#..", "#..#..", "#..#..", "##.##.", "#.##.#", ".#..#."],
  โ: ["...#..", "...#..", "...#..", "...##.", "...#.#", "....#."],
  ใ: ["..#..", "..#..", "..#..", "..##.", "..#.#", "...#."],
  ไ: ["....#..", "....#..", "....#..", "....##.", "....#.#", ".....#."],
  ๆ: [".....", ".#.#.", "#####", ".#..#", "....#", "....#"],
  ฯ: [".....", "#...#", ".####", "....#", "....#", "....#"],
  ฦ: [".###.", "#...#", ".#..#", "##..#", "#.#.#", ".#..#"]
};

// Rows above the body, bottom-aligned to the row just over it.
const ascender: Record<string, string[]> = {
  ช: [".....#"],
  ซ: ["......#"],
  ป: [".....#", ".....#"],
  ฝ: ["....#", "....#"],
  ฟ: ["......#", "......#"],
  ศ: [".....#"],
  ส: [".....#"],
  ฬ: ["......#", "......#", ".....#."],
  ฮ: [".....#"],
  โ: [".####.", "#.....", ".###..", "...#.."],
  ใ: ["###..", "#..#.", "##.#.", "...#."],
  ไ: ["#...#..", ".#.##..", "..#.#..", "....#.."]
};

// Rows under the baseline.
const descender: Record<string, string[]> = {
  ญ: [".......", "....###"],
  ฎ: ["...#.#", "..####"],
  ฏ: ["..#..#", ".#####"],
  ฐ: [".#.#", "####"],
  ฤ: ["....#", "....#"],
  ๆ: ["....#", "....#"],
  ฯ: ["....#", "....#"],
  ฦ: ["....#", "....#"]
};

// Upper vowels: the full shape, and a two-row shape used when a tone mark sits on top.
const upper: Record<string, { full: string[]; compact: string[] }> = {
  "\u0e34": { full: [".##.", "####"], compact: [".##.", "####"] },
  "\u0e35": { full: ["...#", "####"], compact: ["...#", "####"] },
  "\u0e36": { full: ["...#.", "..#.#", "####."], compact: ["...##", ".####"] },
  "\u0e37": { full: [".#.#", "####"], compact: [".#.#", "####"] },
  "\u0e31": { full: ["##.#", ".##."], compact: ["##.#", ".##."] },
  "\u0e47": { full: ["...#", "####", "#.#.", "###."], compact: ["#.#.", "###."] },
  "\u0e4d": { full: ["##", "##"], compact: ["##", "##"] }
};

const tone: Record<string, string[]> = {
  "\u0e48": ["#", "#"],
  "\u0e49": ["#.#", "##."],
  "\u0e4a": ["####", "#.#."],
  "\u0e4b": [".#.", "###", ".#."],
  "\u0e4c": ["##", "#."]
};

const lower: Record<string, string[]> = {
  "\u0e38": ["##", ".#"],
  "\u0e39": ["#.#", ".##"],
  "\u0e3a": ["#"]
};

const SARA_AM = "ำ";

export interface PixelGlyph {
  /** 16x16 pixel values, row-major: 0 transparent, 1 text, 2 shadow. */
  grid: Uint8Array;
  /** Cursor advance in pixels. */
  width: number;
}

export interface ComposeOptions {
  /** Rows to shift the whole cluster down, for fonts whose baseline sits lower than FireRed's. */
  dy?: number;
  /** Draw the drop shadow (FireRed). Fonts without one use the full 16x16 cell. */
  shadow?: boolean;
}

/** Composes one Thai grapheme cluster, or returns undefined when a character has no drawn part. */
export function composeThaiCluster(cluster: string, options: ComposeOptions = {}): PixelGlyph | undefined {
  const dy0 = options.dy ?? 0;
  const shadow = options.shadow ?? true;
  const [base, ...marks] = [...cluster];
  const rows = body[base];
  if (!rows) return undefined;
  let upperMark: string | undefined, toneMark: string | undefined, lowerMark: string | undefined, saraAm = false;
  for (const mark of marks) {
    if (upper[mark] && !upperMark) upperMark = mark;
    else if (tone[mark] && !toneMark) toneMark = mark;
    else if (lower[mark] && !lowerMark) lowerMark = mark;
    else if (mark === SARA_AM && !saraAm) saraAm = true;
    else return undefined;
  }

  const bodyWidth = Math.max(...rows.map((row) => row.length));
  // Marks hang over the letter, ending one column short of its right edge so they clear tall stems and ticks.
  const markRight = bodyWidth - 1;
  const upperRows = upperMark ? (toneMark ? upper[upperMark].compact : upper[upperMark].full) : undefined;
  const toneRows = toneMark ? tone[toneMark] : undefined;
  const lowerRows = lowerMark ? lower[lowerMark] : undefined;
  const widest = Math.max(upperRows?.[0].length ?? 0, toneRows?.[0].length ?? 0, lowerRows?.[0].length ?? 0);
  const pad = Math.max(0, widest - markRight);

  const pixels: [number, number][] = [];
  const draw = (part: string[], x: number, y: number) => {
    part.forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell === "#") pixels.push([x + dx, y + dy + dy0]); }));
  };
  draw(rows, pad, BODY_TOP);
  const stem = ascender[base];
  if (stem) draw(stem, pad, BODY_TOP - stem.length);
  if (descender[base] && !lowerMark) draw(descender[base], pad, BODY_TOP + BODY_ROWS);
  const upperTop = upperRows ? 4 - upperRows.length : 4;
  if (upperRows) draw(upperRows, pad + markRight - upperRows[0].length, upperTop);
  if (toneRows) draw(toneRows, pad + markRight - toneRows[0].length, Math.max(0, upperTop - toneRows.length));
  // Lower vowels sit one row under the letter, or flush against the bottom of the cell when it is shifted down.
  if (lowerRows) draw(lowerRows, pad + markRight - lowerRows[0].length, Math.min(BODY_TOP + BODY_ROWS + 1, 16 - dy0 - lowerRows.length));
  let inkWidth = pad + bodyWidth;
  if (saraAm) {
    // Sara am is a ring over the gap followed by a full-height sara aa.
    const aa = body["า"];
    draw(upper["\u0e4d"].full, inkWidth, 2);
    draw(aa, inkWidth + 2, BODY_TOP);
    inkWidth += 2 + Math.max(...aa.map((row) => row.length));
  }
  const limit = shadow ? 14 : 15;
  if (pixels.some(([x, y]) => x < 0 || x > limit || y < 0 || y > limit)) return undefined;

  const grid = new Uint8Array(256);
  for (const [x, y] of pixels) grid[y * 16 + x] = 1;
  if (shadow) for (const [x, y] of pixels) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
    const index = (y + dy) * 16 + x + dx;
    if (grid[index] === 0) grid[index] = 2;
  }
  return { grid, width: shadow ? Math.min(15, inkWidth + 2) : Math.min(16, inkWidth + 1) };
}
