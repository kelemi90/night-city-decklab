export type Point = { x: number; y: number };
export type CardQuad = [Point, Point, Point, Point];

export type RectifiedCard = {
  dataUrl: string;
  quad: CardQuad;
  confidence: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function luminance(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function orderQuad(points: Point[]): CardQuad {
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(-2).sort((a, b) => b.x - a.x);
  return [top[0], top[1], bottom[0], bottom[1]];
}

function localEdgeScore(edges: Float32Array, width: number, height: number, point: Point) {
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.018));
  let total = 0;
  let count = 0;
  for (let y = Math.max(1, Math.round(point.y) - radius); y <= Math.min(height - 2, Math.round(point.y) + radius); y += 1) {
    for (let x = Math.max(1, Math.round(point.x) - radius); x <= Math.min(width - 2, Math.round(point.x) + radius); x += 1) {
      total += edges[y * width + x];
      count += 1;
    }
  }
  return count ? total / count : 0;
}

/** Detect four likely card corners from a Sobel edge map. Designed for a centered, portrait trading card. */
export function detectCardQuad(source: HTMLCanvasElement): { quad: CardQuad; confidence: number } | null {
  const maxDimension = 480;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(64, Math.round(source.width * scale));
  const height = Math.max(64, Math.round(source.height * scale));
  const probe = document.createElement("canvas");
  probe.width = width;
  probe.height = height;
  probe.getContext("2d", { willReadFrequently: true })?.drawImage(source, 0, 0, width, height);
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = luminance(pixels, i * 4);
  const edges = new Float32Array(width * height);
  let maxEdge = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[i] = magnitude;
      maxEdge = Math.max(maxEdge, magnitude);
    }
  }
  const threshold = Math.max(24, maxEdge * 0.22);
  const cardHeight = height * 0.86;
  const cardWidth = Math.min(width * 0.84, cardHeight * 0.69);
  const center = { x: width / 2, y: height / 2 };
  const expected = [
    { x: center.x - cardWidth / 2, y: center.y - cardHeight / 2 },
    { x: center.x + cardWidth / 2, y: center.y - cardHeight / 2 },
    { x: center.x + cardWidth / 2, y: center.y + cardHeight / 2 },
    { x: center.x - cardWidth / 2, y: center.y + cardHeight / 2 },
  ];
  const candidates: Point[] = [];
  const searchRadius = Math.min(width, height) * 0.24;
  for (const target of expected) {
    let best: Point | undefined;
    let bestScore = 0;
    for (let y = Math.max(2, Math.floor(target.y - searchRadius)); y <= Math.min(height - 3, Math.ceil(target.y + searchRadius)); y += 2) {
      for (let x = Math.max(2, Math.floor(target.x - searchRadius)); x <= Math.min(width - 3, Math.ceil(target.x + searchRadius)); x += 2) {
        const edge = edges[y * width + x];
        if (edge < threshold) continue;
        const distance = Math.hypot(x - target.x, y - target.y) / searchRadius;
        const score = edge * (1 - Math.min(0.82, distance * 0.42)) + localEdgeScore(edges, width, height, { x, y }) * 0.25;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    if (!best) return null;
    candidates.push(best);
  }
  const ordered = orderQuad(candidates);
  const averageScore = ordered.reduce((sum, point) => sum + localEdgeScore(edges, width, height, point), 0) / 4;
  const confidence = clamp((averageScore - threshold) / Math.max(1, maxEdge - threshold), 0, 1);
  if (confidence < 0.08) return null;
  return { quad: ordered.map((point) => ({ x: point.x / scale, y: point.y / scale })) as CardQuad, confidence };
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const n = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-9) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j += 1) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map((row) => row[n]);
}

function homography(from: CardQuad, to: CardQuad) {
  const matrix: number[][] = [];
  const values: number[] = [];
  from.forEach((point, index) => {
    const target = to[index];
    matrix.push([point.x, point.y, 1, 0, 0, 0, -target.x * point.x, -target.x * point.y]);
    values.push(target.x);
    matrix.push([0, 0, 0, point.x, point.y, 1, -target.y * point.x, -target.y * point.y]);
    values.push(target.y);
  });
  const solved = solveLinearSystem(matrix, values);
  return solved ? [...solved, 1] : null;
}

function warpPerspective(source: HTMLCanvasElement, quad: CardQuad) {
  const width = Math.min(1000, Math.max(400, Math.round(Math.max(Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y), Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) * 1.35)));
  const height = Math.min(1450, Math.max(580, Math.round(width / 0.69)));
  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const targetContext = target.getContext("2d");
  if (!sourceContext || !targetContext) return null;
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const targetPixels = targetContext.createImageData(width, height);
  const destination: CardQuad = [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  const map = homography(destination, quad);
  if (!map) return null;
  const [a, b, c, d, e, f, g, h, i] = map;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = g * x + h * y + i;
      const sourceX = clamp(Math.round((a * x + b * y + c) / denominator), 0, source.width - 1);
      const sourceY = clamp(Math.round((d * x + e * y + f) / denominator), 0, source.height - 1);
      const destinationIndex = (y * width + x) * 4;
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      targetPixels.data[destinationIndex] = sourcePixels[sourceIndex];
      targetPixels.data[destinationIndex + 1] = sourcePixels[sourceIndex + 1];
      targetPixels.data[destinationIndex + 2] = sourcePixels[sourceIndex + 2];
      targetPixels.data[destinationIndex + 3] = 255;
    }
  }
  targetContext.putImageData(targetPixels, 0, 0);
  return target;
}

export function rectifyCanvas(source: HTMLCanvasElement): RectifiedCard {
  const detected = detectCardQuad(source);
  if (!detected) return { dataUrl: source.toDataURL("image/jpeg", 0.9), quad: [{ x: 0, y: 0 }, { x: source.width, y: 0 }, { x: source.width, y: source.height }, { x: 0, y: source.height }], confidence: 0 };
  const warped = warpPerspective(source, detected.quad);
  return { dataUrl: (warped ?? source).toDataURL("image/jpeg", 0.9), quad: detected.quad, confidence: detected.confidence };
}

export async function rectifyDataUrl(dataUrl: string): Promise<RectifiedCard> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to read image")); });
  const source = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  source.width = Math.max(1, Math.round(image.naturalWidth * scale));
  source.height = Math.max(1, Math.round(image.naturalHeight * scale));
  source.getContext("2d")?.drawImage(image, 0, 0, source.width, source.height);
  return rectifyCanvas(source);
}
