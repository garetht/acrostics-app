export type XWordInfoPuzzle = {
  answerKey: string;
  clueData: string[];
  clues: string[];
  cols: number;
  copyright?: string | null;
  date: string;
  fullQuote?: string | null;
  gridLetters: string;
  gridNumbers: number[];
  mapTitle: number[];
  quote: string;
  rows: number;
};

export type NormalizedClue = {
  id: string;
  label: string;
  text: string;
  numbers: number[];
};

export type NormalizedGridCell = {
  index: number;
  row: number;
  col: number;
  number: number | null;
  clueLabel: string | null;
  isBlock: boolean;
};

export type NormalizedTitleCell = {
  clueId: string;
  label: string;
  sourceNumber: number;
};

export type NormalizedAcrosticPuzzle = {
  meta: {
    answerKey: string;
    copyright: string | null;
    date: string;
    fullQuote: string | null;
    quote: string;
  };
  clues: NormalizedClue[];
  cols: number;
  grid: NormalizedGridCell[];
  lookup: {
    clueIdByNumber: Record<number, string>;
    gridIndexByNumber: Record<number, number>;
    gridNumbersInOrder: number[];
    numbersByClueId: Record<string, number[]>;
    titleNumbers: number[];
  };
  rows: number;
  titleCells: NormalizedTitleCell[];
};

const htmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "\u2026",
  lt: "<",
  mdash: "\u2014",
  nbsp: " ",
  ndash: "\u2013",
  quot: '"',
  rdquo: "\u201d",
  rsquo: "\u2019",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#(?:x[a-fA-F0-9]+|\d+)|[a-zA-Z]+);/g, (entity, token) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    if (token.startsWith("#")) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    return htmlEntityMap[token] ?? entity;
  });
}

function parseClueNumbers(serializedNumbers: string): number[] {
  return serializedNumbers
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function normalizePuzzle(puzzle: XWordInfoPuzzle): NormalizedAcrosticPuzzle {
  const clueIdByNumber: Record<number, string> = {};
  const derivedLabelByNumber: Record<number, string> = {};
  const numbersByClueId: Record<string, number[]> = {};

  const clues = puzzle.clueData.map((serializedNumbers, clueIndex) => {
    const label = String.fromCharCode(65 + clueIndex);
    const numbers = parseClueNumbers(serializedNumbers);

    numbersByClueId[label] = numbers;

    for (const number of numbers) {
      clueIdByNumber[number] = label;
      derivedLabelByNumber[number] = label;
    }

    return {
      id: label,
      label,
      numbers,
      text: decodeHtmlEntities(puzzle.clues[clueIndex] ?? ""),
    };
  });

  const totalCellCount = puzzle.rows * puzzle.cols;
  const paddedGridNumbers = Array.from({ length: totalCellCount }, (_, index) => {
    const cellNumber = puzzle.gridNumbers[index] ?? 0;
    return cellNumber > 0 ? cellNumber : 0;
  });

  const sortedNumbers = Array.from(new Set(paddedGridNumbers.filter((number) => number > 0))).sort(
    (left, right) => left - right,
  );
  const gridLabelStream = puzzle.gridLetters.replace(/\s+/g, "");
  const gridLabelByNumber: Record<number, string> = {};

  sortedNumbers.forEach((number, index) => {
    const payloadLabel = gridLabelStream[index];

    if (payloadLabel) {
      gridLabelByNumber[number] = payloadLabel;
    }
  });

  const gridIndexByNumber: Record<number, number> = {};
  const gridNumbersInOrder: number[] = [];

  const grid = paddedGridNumbers.map((number, index) => {
    const row = Math.floor(index / puzzle.cols);
    const col = index % puzzle.cols;

    if (number === 0) {
      return {
        col,
        clueLabel: null,
        index,
        isBlock: true,
        number: null,
        row,
      };
    }

    gridIndexByNumber[number] = index;
    gridNumbersInOrder.push(number);

    return {
      col,
      clueLabel: gridLabelByNumber[number] ?? derivedLabelByNumber[number] ?? null,
      index,
      isBlock: false,
      number,
      row,
    };
  });

  const fallbackTitleNumbers = clues
    .map((clue) => clue.numbers[0])
    .filter((number): number is number => typeof number === "number");
  const requestedTitleNumbers = puzzle.mapTitle.length > 0 ? puzzle.mapTitle : fallbackTitleNumbers;
  const titleNumbers = requestedTitleNumbers.map((number, titleIndex) => {
    const clueId = clueIdByNumber[number];

    if (clueId) {
      return number;
    }

    return fallbackTitleNumbers[titleIndex];
  });

  const titleCells = titleNumbers.flatMap((sourceNumber, titleIndex) => {
    if (typeof sourceNumber !== "number" || !Number.isInteger(sourceNumber)) {
      return [];
    }

    const clueId = clueIdByNumber[sourceNumber] ?? clues[titleIndex]?.id;

    if (!clueId) {
      return [];
    }

    return [
      {
        clueId,
        label: clueId,
        sourceNumber,
      },
    ];
  });

  return {
    clues,
    cols: puzzle.cols,
    grid,
    lookup: {
      clueIdByNumber,
      gridIndexByNumber,
      gridNumbersInOrder,
      numbersByClueId,
      titleNumbers: titleCells.map((cell) => cell.sourceNumber),
    },
    meta: {
      answerKey: puzzle.answerKey,
      copyright: puzzle.copyright ?? null,
      date: puzzle.date,
      fullQuote: puzzle.fullQuote ?? null,
      quote: decodeHtmlEntities(puzzle.quote),
    },
    rows: puzzle.rows,
    titleCells,
  };
}
