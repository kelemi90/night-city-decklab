import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATALOG_CARDS } from "../shared/deckRules.ts";

const API_BASE = "https://api.netdeck.gg/api";
const OUTPUT_DIR = path.resolve("data/card-art");

type ApiCard = {
  printing_id?: string;
  image_url?: string;
  source_image_url?: string;
};

function getSlug(sourceUrl: string): string {
  const match = sourceUrl.match(/\/cards\/([^?]+)/);

  if (!match) {
    throw new Error(`Could not extract card slug from sourceUrl: ${sourceUrl}`);
  }

  return match[1];
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchCard(card: (typeof CATALOG_CARDS)[number]): Promise<ApiCard> {
  const slug = getSlug(card.sourceUrl);

  const url =
    `${API_BASE}/cards/cyberpunk/` +
    `${encodeURIComponent(slug)}` +
    `?printing=${encodeURIComponent(card.printingId)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApiCard;
}

async function downloadFile(
  url: string,
  outputPath: string,
): Promise<number> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Image download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("image/webp")) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("Downloaded image is empty");
  }

  await writeFile(outputPath, buffer);

  return buffer.length;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log("========================================");
  console.log("NIGHT CITY DECKLAB CARD ART DOWNLOADER");
  console.log("========================================");
  console.log(`Cards : ${CATALOG_CARDS.length}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log();

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < CATALOG_CARDS.length; index++) {
    const card = CATALOG_CARDS[index];

    const filename =
      `${String(card.id).padStart(3, "0")}-` +
      `${safeFilename(card.name)}-` +
      `${safeFilename(card.subtitle ?? card.kind)}-` +
      `${card.printingId}.webp`;

    const outputPath = path.join(OUTPUT_DIR, filename);

    const progress = `[${index + 1}/${CATALOG_CARDS.length}]`;

    try {
      try {
        const existing = await stat(outputPath);

        if (existing.size > 0) {
          console.log(`${progress} SKIP  ${card.name} — already exists`);
          skipped++;
          continue;
        }
      } catch {
        // File does not exist; continue with download.
      }

      const apiCard = await fetchCard(card);

      if (apiCard.printing_id !== card.printingId) {
        throw new Error(
          `Printing mismatch: catalog=${card.printingId}, API=${apiCard.printing_id}`,
        );
      }

      if (!apiCard.image_url) {
        throw new Error("API did not return image_url");
      }

      const bytes = await downloadFile(apiCard.image_url, outputPath);

      console.log(
        `${progress} OK    ${card.name} — ${bytes.toLocaleString()} bytes`,
      );

      downloaded++;
    } catch (error) {
      failed++;

      console.error(
        `${progress} FAIL  ${card.name}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log();
  console.log("========================================");
  console.log("DOWNLOAD COMPLETE");
  console.log("========================================");
  console.log(`Downloaded : ${downloaded}`);
  console.log(`Skipped    : ${skipped}`);
  console.log(`Failed     : ${failed}`);
  console.log(`Total      : ${CATALOG_CARDS.length}`);
  console.log();

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
