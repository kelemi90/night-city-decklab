import fs from "node:fs/promises";
import { BETA_CARDS } from "../shared/betaCatalog.ts";
import type { CatalogCard } from "../shared/deckRules";

const API_URL = "https://api.netdeck.gg/api/cards/cyberpunk";

type ApiPrinting = {
  id?: string;
  collector_number?: string;
  image_url?: string;
  source_image_url?: string;
  rarity?: string;
  set?: {
    code?: string;
    name?: string;
  } | null;
};

type ApiCard = {
  id?: string;
  name?: string;
  subname?: string | null;
  display_name?: string;
  slug?: string;
  color?: string;
  card_type?: string;
  cost?: number | null;
  power?: number | null;
  ram?: number | null;
  rarity?: string;
  printings?: ApiPrinting[];
};

type ApiResponse = {
  items?: ApiCard[];
  total?: number;
};

async function fetchPage(offset: number): Promise<ApiResponse> {
  const response = await fetch(
    `${API_URL}?limit=100&offset=${offset}`,
  );

  if (!response.ok) {
    throw new Error(
      `Netdeck API returned HTTP ${response.status} at offset ${offset}`,
    );
  }

  return (await response.json()) as ApiResponse;
}

function mapKind(cardType: string | undefined): CatalogCard["kind"] {
  switch (cardType?.toLowerCase()) {
    case "legend":
      return "legend";
    case "unit":
      return "unit";
    case "gear":
      return "gear";
    case "program":
      return "program";
    default:
      throw new Error(`Unsupported card type: ${cardType}`);
  }
}

function mapColor(color: string | undefined): CatalogCard["color"] {
  switch (color?.toLowerCase()) {
    case "red":
      return "red";
    case "blue":
      return "blue";
    case "green":
      return "green";
    case "yellow":
      return "yellow";
    default:
      throw new Error(`Unsupported card color: ${color}`);
  }
}

function buildSourceUrl(
  card: ApiCard,
  printing: ApiPrinting,
): string {
  if (!card.slug || !printing.id) {
    throw new Error(
      `Cannot build source URL for ${card.name ?? "unknown card"}`,
    );
  }

  return `https://cyberpunktcg.com/cards/${card.slug}?printing=${printing.id}`;
}

const page1 = await fetchPage(0);
const page2 = await fetchPage(100);

const apiCards = [
  ...(page1.items ?? []),
  ...(page2.items ?? []),
];

if (apiCards.length !== 151) {
  throw new Error(
    `Expected 151 official cards, received ${apiCards.length}`,
  );
}

const betaPrintings = apiCards.flatMap((card) =>
  (card.printings ?? [])
    .filter(
      (printing) =>
        printing.id &&
        printing.collector_number?.startsWith("β"),
    )
    .map((printing) => ({
      card,
      printing,
    })),
);

if (betaPrintings.length !== 218) {
  throw new Error(
    `Expected 218 official Beta printings, received ${betaPrintings.length}`,
  );
}

const existingByPrintingId = new Map(
  BETA_CARDS
    .filter((card) => card.printingId)
    .map((card) => [card.printingId!, card]),
);

const missing = betaPrintings.filter(
  ({ printing }) =>
    !existingByPrintingId.has(printing.id!),
);

if (missing.length !== 46) {
  throw new Error(
    `Expected 46 missing Beta printings, found ${missing.length}`,
  );
}

console.log(`Official cards: ${apiCards.length}`);
console.log(`Official Beta printings: ${betaPrintings.length}`);
console.log(`Existing Beta cards: ${BETA_CARDS.length}`);
console.log(`Missing Beta printings: ${missing.length}`);

const generatedCards: CatalogCard[] = missing.map(
  ({ card, printing }, index) => {
    if (!card.name) {
      throw new Error("Beta card has no name");
    }

    if (!printing.id) {
      throw new Error(`Beta card ${card.name} has no printing ID`);
    }

    if (!printing.image_url) {
      throw new Error(
        `Beta card ${card.name} ${printing.collector_number} has no image URL`,
      );
    }

    if (!printing.set?.name) {
      throw new Error(
        `Beta card ${card.name} ${printing.collector_number} has no set name`,
      );
    }

    if (!printing.rarity && !card.rarity) {
      throw new Error(
        `Beta card ${card.name} ${printing.collector_number} has no rarity`,
      );
    }

    return {
      id: 324 + index,
      name: card.name,
      ...(card.subname
        ? { subtitle: card.subname }
        : {}),
      kind: mapKind(card.card_type),
      color: mapColor(card.color),
      ...(card.cost !== null && card.cost !== undefined
        ? { cost: card.cost }
        : {}),
      ...(card.power !== null && card.power !== undefined
        ? { power: card.power }
        : {}),
      ram: card.ram ?? 0,
      rarity: printing.rarity ?? card.rarity!,
      setName: printing.set.name,
      marketCents: 0,
      sourceUrl: buildSourceUrl(card, printing),
      imageUrl:
        printing.source_image_url ??
        printing.image_url,
      printingId: printing.id,
      collectorNumber: printing.collector_number,
      edition: "beta",
    };
  },
);

const combined = [
  ...BETA_CARDS,
  ...generatedCards,
];

const ids = new Set<number>();
const printingIds = new Set<string>();

for (const card of combined) {
  if (ids.has(card.id)) {
    throw new Error(`Duplicate card ID: ${card.id}`);
  }

  ids.add(card.id);

  if (!card.printingId) {
    throw new Error(
      `Beta card ${card.id} has no printingId`,
    );
  }

  if (printingIds.has(card.printingId)) {
    throw new Error(
      `Duplicate printing ID: ${card.printingId}`,
    );
  }

  printingIds.add(card.printingId);
}

const expectedIds = Array.from(
  { length: 218 },
  (_, index) => 152 + index,
);

const actualIds = combined.map((card) => card.id);

if (
  JSON.stringify(actualIds) !==
  JSON.stringify(expectedIds)
) {
  throw new Error(
    "Beta IDs are not sequential 152–369",
  );
}

const output = `// AUTO-GENERATED FROM THE OFFICIAL CYBERPUNK TCG CARD CATALOG.
// Existing Beta entries are preserved; missing official Beta printings are appended.
// Re-run the Beta catalog generator instead. Do not edit manually.

import type { CatalogCard } from "./deckRules";

export const BETA_CARDS: CatalogCard[] = ${JSON.stringify(
  combined,
  null,
  2,
)};
`;

await fs.writeFile(
  "shared/betaCatalog.ts",
  output + "\n",
);

console.log("\n===== RESULT =====");
console.log(`Beta cards: ${combined.length}`);
console.log(`Existing preserved: ${BETA_CARDS.length}`);
console.log(`Newly added: ${generatedCards.length}`);
console.log(`ID range: ${combined[0].id}–${combined.at(-1)!.id}`);
console.log(`Unique printing IDs: ${printingIds.size}`);
console.log("\nNew cards:");

for (const card of generatedCards) {
  console.log(
    `${card.id} | ${card.collectorNumber} | ${card.name}${card.subtitle ? `: ${card.subtitle}` : ""} | ${card.printingId}`,
  );
}

console.log(
  "\nWrote shared/betaCatalog.ts",
);
