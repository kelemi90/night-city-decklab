import { createWorker, type Worker } from "tesseract.js";
import type { CatalogCard } from "@shared/deckRules";

let workerPromise: Promise<Worker> | undefined;

export type OcrMode =
  | "balanced"
  | "highContrast"
  | "lowLight"
  | "sharpened";

export const OCR_MODES: Array<{
  id: OcrMode;
  label: string;
  detail: string;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "General-purpose correction",
  },
  {
    id: "highContrast",
    label: "High contrast",
    detail: "For glare and busy backgrounds",
  },
  {
    id: "lowLight",
    label: "Low light",
    detail: "Brightens dark or shadowed cards",
  },
  {
    id: "sharpened",
    label: "Sharpened",
    detail: "For soft or slightly blurry text",
  },
];

function getWorker() {
  workerPromise ??= createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    workerBlobURL: false,

    logger: (message) => {
      console.log("[Tesseract]", message);
    },

    errorHandler: (error) => {
      console.error(
        "[Tesseract error handler]",
        error,
      );
    },
  });

  return workerPromise;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(255, value),
  );
}

export type OcrImageQuality = {
  sharpness: number;
  usable: boolean;
};

export async function assessOcrImageQuality(
  dataUrl: string,
): Promise<OcrImageQuality> {
  const image = await loadImage(dataUrl);

  /*
   * Keep this deliberately small and cheap. We only need
   * enough resolution to distinguish a sharp card from a
   * noticeably blurred capture.
   */
  const maxDimension = 420;
  const scale =
    Math.min(
      1,
      maxDimension /
        Math.max(
          image.naturalWidth,
          image.naturalHeight,
        ),
    );

  const canvas =
    document.createElement("canvas");

  canvas.width = Math.max(
    64,
    Math.round(
      image.naturalWidth * scale,
    ),
  );

  canvas.height = Math.max(
    64,
    Math.round(
      image.naturalHeight * scale,
    ),
  );

  const context =
    canvas.getContext(
      "2d",
      {
        willReadFrequently: true,
      },
    );

  if (!context) {
    throw new Error(
      "Unable to analyse image sharpness",
    );
  }

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const imageData =
    context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );

  const pixels = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  /*
   * Calculate luminance first. Then use the 4-neighbour
   * Laplacian:
   *
   *       0  1  0
   *       1 -4  1
   *       0  1  0
   *
   * Sharp images contain stronger high-frequency edges,
   * producing higher variance. Blur suppresses those edges.
   */
  const gray =
    new Float32Array(
      width * height,
    );

  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    for (
      let x = 0;
      x < width;
      x += 1
    ) {
      const index =
        (y * width + x) * 4;

      gray[
        y * width + x
      ] =
        pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114;
    }
  }

  let sum = 0;
  let sumSquared = 0;
  let count = 0;

  for (
    let y = 1;
    y < height - 1;
    y += 1
  ) {
    for (
      let x = 1;
      x < width - 1;
      x += 1
    ) {
      const index =
        y * width + x;

      const laplacian =
        gray[index - width] +
        gray[index - 1] -
        4 * gray[index] +
        gray[index + 1] +
        gray[index + width];

      sum += laplacian;
      sumSquared +=
        laplacian * laplacian;
      count += 1;
    }
  }

  const mean =
    count > 0
      ? sum / count
      : 0;

  const variance =
    count > 0
      ? Math.max(
          0,
          sumSquared / count -
            mean * mean,
        )
      : 0;

  /*
   * This threshold is intentionally conservative.
   * We do not reject borderline images here because OCR
   * should remain responsible for recognition.
   *
   * The UI can use `usable` only as a warning/retry hint.
   */
  const usable = variance >= 55;

  return {
    sharpness: Math.round(
      variance * 10,
    ) / 10,
    usable,
  };
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>(
    (resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);

      image.onerror = () =>
        reject(
          new Error(
            "Unable to load card image for OCR",
          ),
        );

      image.src = dataUrl;
    },
  );
}

async function prepareOriginalOcrCanvas(
  dataUrl: string,
) {
  const image = await loadImage(dataUrl);

  const targetHeight = Math.min(
    2200,
    Math.max(
      1600,
      image.naturalHeight,
    ),
  );

  const scale =
    targetHeight /
    Math.max(
      1,
      image.naturalHeight,
    );

  const canvas =
    document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(
      image.naturalWidth * scale,
    ),
  );

  canvas.height = Math.max(
    1,
    Math.round(
      image.naturalHeight * scale,
    ),
  );

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "OCR canvas is unavailable",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality =
    "high";

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

async function prepareProcessedOcrCanvas(
  dataUrl: string,
  mode: OcrMode,
) {
  const image = await loadImage(dataUrl);

  const targetHeight = Math.min(
    2200,
    Math.max(
      1600,
      image.naturalHeight,
    ),
  );

  const scale =
    targetHeight /
    Math.max(
      1,
      image.naturalHeight,
    );

  const source =
    document.createElement("canvas");

  source.width = Math.max(
    1,
    Math.round(
      image.naturalWidth * scale,
    ),
  );

  source.height = Math.max(
    1,
    Math.round(
      image.naturalHeight * scale,
    ),
  );

  const context =
    source.getContext(
      "2d",
      {
        willReadFrequently: true,
      },
    );

  if (!context) {
    throw new Error(
      "OCR canvas is unavailable",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality =
    "high";

  context.drawImage(
    image,
    0,
    0,
    source.width,
    source.height,
  );

  const pixels =
    context.getImageData(
      0,
      0,
      source.width,
      source.height,
    );

  const original =
    new Uint8ClampedArray(
      pixels.data,
    );

  const width = source.width;
  const height = source.height;

  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    for (
      let x = 0;
      x < width;
      x += 1
    ) {
      const index =
        (y * width + x) * 4;

      const gray =
        original[index] * 0.299 +
        original[index + 1] * 0.587 +
        original[index + 2] * 0.114;

      const leftIndex =
        (y * width +
          Math.max(0, x - 1)) *
        4;

      const rightIndex =
        (y * width +
          Math.min(width - 1, x + 1)) *
        4;

      const upIndex =
        (Math.max(0, y - 1) *
          width +
          x) *
        4;

      const downIndex =
        (Math.min(height - 1, y + 1) *
          width +
          x) *
        4;

      const left =
        original[leftIndex] * 0.299 +
        original[leftIndex + 1] * 0.587 +
        original[leftIndex + 2] * 0.114;

      const right =
        original[rightIndex] * 0.299 +
        original[rightIndex + 1] * 0.587 +
        original[rightIndex + 2] * 0.114;

      const up =
        original[upIndex] * 0.299 +
        original[upIndex + 1] * 0.587 +
        original[upIndex + 2] * 0.114;

      const down =
        original[downIndex] * 0.299 +
        original[downIndex + 1] * 0.587 +
        original[downIndex + 2] * 0.114;

      let value = gray;

      if (mode === "balanced") {
        value =
          gray > 150
            ? gray + 35
            : gray - 25;
      }

      if (mode === "highContrast") {
        value =
          gray > 145
            ? 255
            : 18;
      }

      if (mode === "lowLight") {
        value =
          ((gray / 255) ** 0.72) *
          255;
      }

      if (mode === "sharpened") {
        value =
          gray +
          (gray * 4 -
            left -
            right -
            up -
            down) *
            0.7;
      }

      const output = clamp(value);

      pixels.data[index] =
        output;
      pixels.data[index + 1] =
        output;
      pixels.data[index + 2] =
        output;
    }
  }

  context.putImageData(
    pixels,
    0,
    0,
  );

  return source;
}

async function prepareRegionalOcrCanvases(
  dataUrl: string,
) {
  const image = await loadImage(dataUrl);

  /*
   * Card names can appear in different vertical positions.
   * Use overlapping regions so text near a boundary is not
   * accidentally split between OCR passes.
   *
   * Each region is expressed as a fraction of the full card:
   *
   *   0.00 - 0.40
   *   0.20 - 0.60
   *   0.40 - 0.80
   *   0.60 - 1.00
   */
  const regions = [
    { top: 0.00, bottom: 0.40 },
    { top: 0.20, bottom: 0.60 },
    { top: 0.40, bottom: 0.80 },
    { top: 0.60, bottom: 1.00 },
  ];

  return regions.map(({ top, bottom }) => {
    const sourceTop =
      Math.round(image.naturalHeight * top);

    const sourceBottom =
      Math.round(image.naturalHeight * bottom);

    const sourceHeight =
      Math.max(1, sourceBottom - sourceTop);

    /*
     * Upscale each region so text occupies more pixels for
     * Tesseract. Keep the same maximum processing size as
     * the existing OCR pipeline.
     */
    const targetHeight = Math.min(
      1800,
      Math.max(1200, sourceHeight),
    );

    const scale =
      targetHeight /
      Math.max(1, sourceHeight);

    const canvas =
      document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(image.naturalWidth * scale),
    );

    canvas.height = Math.max(
      1,
      Math.round(sourceHeight * scale),
    );

    const context =
      canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Regional OCR canvas is unavailable",
      );
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      image,
      0,
      sourceTop,
      image.naturalWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas;
  });
}

function normalizedText(
  value: string | undefined,
) {
  if (!value) return "";

  return normalize(value);
}

function levenshteinDistance(
  left: string,
  right: string,
) {
  if (left === right) return 0;

  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = new Array(
    right.length + 1,
  );

  let current = new Array(
    right.length + 1,
  );

  for (
    let index = 0;
    index <= right.length;
    index += 1
  ) {
    previous[index] = index;
  }

  for (
    let row = 1;
    row <= left.length;
    row += 1
  ) {
    current[0] = row;

    for (
      let column = 1;
      column <= right.length;
      column += 1
    ) {
      const substitutionCost =
        left[row - 1] ===
        right[column - 1]
          ? 0
          : 1;

      current[column] =
        Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] +
            substitutionCost,
        );
    }

    [previous, current] = [
      current,
      previous,
    ];
  }

  return previous[
    right.length
  ];
}

function similarity(
  left: string,
  right: string,
) {
  if (!left || !right) return 0;

  const distance =
    levenshteinDistance(
      left,
      right,
    );

  return (
    1 -
    distance /
      Math.max(
        left.length,
        right.length,
      )
  );
}

/*
 * Compare a catalog phrase against OCR text.
 *
 * OCR often recognizes only fragments of a subtitle.
 * For example:
 *
 *   "Ou MET FEEL ALTER"
 *
 * can be part of:
 *
 *   "You Might Feel a Little Pinch"
 *
 * Instead of requiring the complete subtitle to appear,
 * compare short OCR windows against the catalog subtitle.
 */
function fuzzyPhraseMatch(
  haystack: string,
  phrase: string,
) {
  if (!haystack || !phrase) {
    return 0;
  }

  if (haystack.includes(phrase)) {
    return 1;
  }

  const haystackWords =
    haystack.split(" ");

  const phraseWords =
    phrase.split(" ");

  if (
    !haystackWords.length ||
    !phraseWords.length
  ) {
    return 0;
  }

  let best = 0;

  /*
   * Compare individual catalog words against
   * OCR words first. This handles:
   *
   *   Vektar -> Vektor
   *   Alter  -> After
   */
  for (const phraseWord of phraseWords) {
    if (phraseWord.length < 3) {
      continue;
    }

    for (const ocrWord of Array.from(haystackWords)) {
      if (ocrWord.length < 3) {
        continue;
      }

      const score =
        similarity(
          phraseWord,
          ocrWord,
        );

      best = Math.max(
        best,
        score,
      );
    }
  }

  /*
   * Now compare short consecutive windows.
   *
   * This is useful when Tesseract combines or loses
   * some words while retaining the general phrase.
   */
  const phraseLength =
    phrase.length;

  const windowSizes = [
    Math.max(
      3,
      Math.round(
        phraseLength * 0.35,
      ),
    ),
    Math.max(
      4,
      Math.round(
        phraseLength * 0.5,
      ),
    ),
    Math.max(
      5,
      Math.round(
        phraseLength * 0.7,
      ),
    ),
    phraseLength,
  ];

  for (const size of windowSizes) {
    const normalizedSize =
      Math.min(
        size,
        phraseLength,
      );

    for (
      let start = 0;
      start <
      haystack.length;
      start += 1
    ) {
      const window =
        haystack.slice(
          start,
          start + normalizedSize,
        );

      if (
        window.length < 3
      ) {
        continue;
      }

      const score =
        similarity(
          window,
          phrase,
        );

      best = Math.max(
        best,
        score,
      );
    }
  }

  return best;
}

function wordEvidence(
  haystack: string,
  phrase: string,
) {
  const haystackWords =
    new Set(
      haystack
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3,
        ),
    );

  const phraseWords =
    phrase
      .split(" ")
      .filter(
        (word) =>
          word.length >= 3,
      );

  if (!phraseWords.length) {
    return 0;
  }

  let matched = 0;

  for (const phraseWord of phraseWords) {
    let best = 0;

    for (const ocrWord of Array.from(haystackWords)) {
      best = Math.max(
        best,
        similarity(
          phraseWord,
          ocrWord,
        ),
      );
    }

    /*
     * A word is considered OCR-supported
     * when it is reasonably close.
     */
    if (best >= 0.72) {
      matched += 1;
    }
  }

  return (
    matched /
    phraseWords.length
  );
}

export function matchOcrText(
  text: string,
  cards: CatalogCard[],
) {
  const haystack = normalize(text);

  if (!haystack) return undefined;

  const words = new Set(
    haystack
      .split(" ")
      .map((word) => word.trim())
      .filter(
        (word) => word.length >= 2,
      ),
  );

  /*
   * Build a map of primary card names.
   *
   * A duplicated name requires the subtitle
   * to identify the exact card.
   */
  const cardsByName =
    new Map<string, CatalogCard[]>();

  for (const card of cards) {
    const name =
      normalizedText(card.name);

    if (!name) continue;

    const existing =
      cardsByName.get(name) ?? [];

    existing.push(card);

    cardsByName.set(
      name,
      existing,
    );
  }

  let best:
    | {
        card: CatalogCard;
        score: number;
        matchedName: boolean;
        matchedSubtitle: boolean;
      }
    | undefined;

  for (const card of cards) {
    const name =
      normalizedText(card.name);

    const subtitle =
      normalizedText(card.subtitle);

    if (!name) continue;

    const sameNameCards =
      cardsByName.get(name) ?? [];

    const duplicateName =
      sameNameCards.length > 1;

    const nameWords = name
      .split(" ")
      .filter(
        (word) => word.length >= 2,
      );

    const subtitleWords =
      subtitle
        .split(" ")
        .filter(
          (word) => word.length >= 2,
        );

    const nameExact =
      haystack.includes(name);

    const subtitleExact =
      Boolean(subtitle) &&
      haystack.includes(subtitle);

    const matchedNameWords =
      nameWords.filter((word) =>
        words.has(word),
      );

    const matchedSubtitleWords =
      subtitleWords.filter((word) =>
        words.has(word),
      );

    const nameOverlap =
      nameWords.length > 0
        ? matchedNameWords.length /
          nameWords.length
        : 0;

    const subtitleOverlap =
      subtitleWords.length > 0
        ? matchedSubtitleWords.length /
          subtitleWords.length
        : 0;

      /*
       * Duplicate primary name.
       *
       * OCR can make small errors in the card name,
       * so use fuzzy word evidence instead of requiring
       * an exact name match.
       *
       * The subtitle is still required to distinguish
       * cards that share the same primary name.
       */
      if (duplicateName) {
        if (!subtitle) {
          continue;
        }

        const nameEvidence =
          wordEvidence(
            haystack,
            name,
          );

        if (nameEvidence < 0.45) {
          continue;
        }

        if (subtitleExact) {
          const score =
            0.88 +
            nameEvidence * 0.12;

          if (
            !best ||
            score > best.score
          ) {
            best = {
              card,
              score,
              matchedName: true,
              matchedSubtitle: true,
            };
          }

          continue;
        }

        const subtitleEvidence =
          wordEvidence(
            haystack,
            subtitle,
          );

        const subtitleFuzzy =
          fuzzyPhraseMatch(
            haystack,
            subtitle,
          );

        /*
         * Require meaningful subtitle evidence.
         * This keeps duplicate-name cards from being
         * selected from the name alone.
         */
        if (
          subtitleEvidence < 0.25 &&
          subtitleFuzzy < 0.72
        ) {
          continue;
        }

        const subtitleScore =
          Math.max(
            subtitleEvidence,
            subtitleFuzzy * 0.65,
          );

        const score =
          0.72 +
          nameEvidence * 0.10 +
          subtitleScore * 0.18;

        if (
          !best ||
          score > best.score
        ) {
          best = {
            card,
            score,
            matchedName: true,
            matchedSubtitle: true,
          };
        }

        continue;
      }

    /*
     * Unique primary name.
     */
    if (nameExact) {
      const score =
        subtitleExact
          ? 1
          : 0.96;

      if (
        !best ||
        score > best.score
      ) {
        best = {
          card,
          score,
          matchedName: true,
          matchedSubtitle:
            subtitleExact,
        };
      }

      continue;
    }

    /*
     * Small OCR errors are allowed for
     * unique names.
     */
    if (
      nameWords.length >= 2 &&
      matchedNameWords.length >= 2 &&
      nameOverlap >= 0.5
    ) {
      const score =
        0.72 +
        nameOverlap * 0.18;

      if (
        !best ||
        score > best.score
      ) {
        best = {
          card,
          score,
          matchedName: true,
          matchedSubtitle: false,
        };
      }
    }
  }

  /*
   * Never guess from weak OCR evidence.
   */
  if (
    !best ||
    best.score < 0.70
  ) {
    return undefined;
  }

  return {
    ...best,
    confidence: Math.round(
      best.score * 100,
    ),
  };
}

export async function recognizeCardName(
  dataUrl: string,
  cards: CatalogCard[],
  mode: OcrMode = "balanced",
) {
  console.log(
    "[OCR] Starting recognition",
    {
      mode,
      dataUrlLength:
        dataUrl.length,
    },
  );

  try {
    const worker =
      await getWorker();

    console.log(
      "[OCR] Worker ready",
    );

    /*
     * Pass 1:
     * Original colour image.
     *
     * This preserves text that can be lost
     * during grayscale/contrast processing.
     */
    const originalCanvas =
      await prepareOriginalOcrCanvas(
        dataUrl,
      );

    console.log(
      "[OCR] Original canvas",
      {
        width:
          originalCanvas.width,
        height:
          originalCanvas.height,
      },
    );

    const originalResult =
      await worker.recognize(
        originalCanvas,
      );

    const originalText =
      originalResult.data.text.trim();

    console.log(
      "[OCR] Original text:",
      JSON.stringify(
        originalText,
      ),
    );

    /*
     * Pass 2:
     * Processed image using the selected
     * OCR mode.
     */
    const processedCanvas =
      await prepareProcessedOcrCanvas(
        dataUrl,
        mode,
      );

    console.log(
      "[OCR] Processed canvas",
      {
        width:
          processedCanvas.width,
        height:
          processedCanvas.height,
      },
    );

    const processedResult =
      await worker.recognize(
        processedCanvas,
      );

    const processedText =
      processedResult.data.text.trim();

    console.log(
      "[OCR] Processed text:",
      JSON.stringify(
        processedText,
      ),
    );

    /*
     * Pass 3-6:
     * Regional OCR.
     *
     * Card names are not located consistently on this card
     * set. Some are near the top, while others are around
     * the lower third.
     *
     * Use four overlapping regions instead of assuming a
     * universal title position.
     */
    const regionalCanvases =
      await prepareRegionalOcrCanvases(
        dataUrl,
      );

    const regionalTexts: string[] = [];

    for (
      let index = 0;
      index < regionalCanvases.length;
      index += 1
    ) {
      const regionCanvas =
        regionalCanvases[index];

      console.log(
        `[OCR] Regional canvas ${index + 1}`,
        {
          width:
            regionCanvas.width,
          height:
            regionCanvas.height,
        },
      );

      const regionResult =
        await worker.recognize(
          regionCanvas,
        );

      const regionText =
        regionResult.data.text.trim();

      if (regionText) {
        regionalTexts.push(
          regionText,
        );
      }

      console.log(
        `[OCR] Regional text ${index + 1}:`,
        JSON.stringify(
          regionText,
        ),
      );
    }

    /*
     * Combine every OCR pass.
     *
     * We intentionally do not deduplicate words here.
     * The matcher normalizes the combined text itself.
     */
    const combinedText = [
      originalText,
      processedText,
      ...regionalTexts,
    ]
      .filter(Boolean)
      .join("\n");

    console.log(
      "[OCR] Combined text:",
      JSON.stringify(
        combinedText,
      ),
    );

    const match =
      matchOcrText(
        combinedText,
        cards,
      );

    console.log(
      "[OCR] Match result:",
      match,
    );

    return {
      text: combinedText,
      mode,
      match,
    };
  } catch (error) {
    console.error(
      "[OCR] recognizeCardName caught error:",
      error,
    );

    console.error(
      "[OCR] error type:",
      typeof error,
    );

    console.error(
      "[OCR] error JSON:",
      JSON.stringify(error),
    );

    console.error(
      "[OCR] error keys:",
      error &&
      typeof error === "object"
        ? Object.keys(error)
        : [],
    );

    console.error(
      "[OCR] error stack:",
      error instanceof Error
        ? error.stack
        : undefined,
    );

    throw error;
  }
}
