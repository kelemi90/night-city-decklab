import fs from "node:fs/promises";

const inputFile = "shared/deckRules.ts";

const allowedRarities = new Set([
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Iconic Legend",
  "Iconic Other",
  "Iconic Secret",
  "Nova Rare",
  "Secret",
]);

const source = await fs.readFile(inputFile, "utf8");

const cardRegex =
  /(\{ id: \d+,[\s\S]*?edition: "retail" \s*\},?)/g;

const cards = [...source.matchAll(cardRegex)];

console.log(`Found ${cards.length} retail cards.`);

if (cards.length !== 151) {
  throw new Error(
    `Expected 151 retail cards, found ${cards.length}. Refusing to modify the catalog.`,
  );
}

function extractField(html, field) {
  const pattern = new RegExp(
    `${field}:\\\\?\\s*</span><span[^>]*>([^<]+)</span>`,
    "i",
  );

  const match = html.match(pattern);
  return match?.[1]?.trim() ?? null;
}

const replacements = [];

for (let index = 0; index < cards.length; index++) {
  const match = cards[index][1];

  const sourceUrlMatch = match.match(
    /sourceUrl: "(https:\/\/cyberpunktcg\.com\/cards\/[^"]+)"/,
  );

  if (!sourceUrlMatch) {
    throw new Error(`Card ${index + 1}: sourceUrl not found.`);
  }

  const url = sourceUrlMatch[1];

  console.log(`[${index + 1}/${cards.length}] ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${response.status}`,
    );
  }

  const html = await response.text();

  const rarity = extractField(html, "RARITY");
  const setName = extractField(html, "SET");

  if (!rarity) {
    throw new Error(`Could not extract rarity from ${url}`);
  }

  if (!setName) {
    throw new Error(`Could not extract set from ${url}`);
  }

  if (!allowedRarities.has(rarity)) {
    throw new Error(
      `Unknown rarity "${rarity}" from ${url}`,
    );
  }

  replacements.push({
    original: match,
    updated: match
      .replace(/rarity: "[^"]*"/, `rarity: ${JSON.stringify(rarity)}`)
      .replace(/setName: "[^"]*"/, `setName: ${JSON.stringify(setName)}`),
  });
}

let updatedSource = source;

for (const { original, updated } of replacements) {
  if (original === updated) continue;

  if (!updatedSource.includes(original)) {
    throw new Error("Could not find expected card entry in source.");
  }

  updatedSource = updatedSource.replace(original, updated);
}

await fs.writeFile(inputFile, updatedSource);

console.log("");
console.log("Retail catalog metadata updated successfully.");
console.log(`Cards processed: ${replacements.length}`);
