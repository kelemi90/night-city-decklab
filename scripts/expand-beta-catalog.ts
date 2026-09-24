import fs from "node:fs/promises";
import { BETA_CARDS } from "../shared/betaCatalog.ts";

const API_URL = "https://api.netdeck.gg/api/cards/cyberpunk";

type ApiPrinting = {
  id?: string;
  collector_number?: string;
  image_url?: string;
  source_image_url?: string;
  set?: {
    code?: string;
    name?: string;
  } | null;
};

type ApiCard = {
  name?: string;
  printings?: ApiPrinting[];
};

type ApiResponse = {
  items?: ApiCard[];
  total?: number;
};

async function fetchPage(offset: number) {
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

const page1 = await fetchPage(0);
const page2 = await fetchPage(100);

const apiCards = [
  ...(page1.items ?? []),
  ...(page2.items ?? []),
];

const officialPrintings = apiCards.flatMap((card) =>
  (card.printings ?? []).map((printing) => ({
    cardName: card.name ?? "",
    ...printing,
  })),
);

const betaPrintings = officialPrintings.filter(
  (printing) =>
    printing.collector_number?.startsWith("β") &&
    printing.id,
);

const existingByPrintingId = new Map(
  BETA_CARDS
    .filter((card) => card.printingId)
    .map((card) => [card.printingId!, card]),
);

const missing = betaPrintings.filter(
  (printing) => !existingByPrintingId.has(printing.id!),
);

console.log(`Official API cards: ${apiCards.length}`);
console.log(`Official β printings: ${betaPrintings.length}`);
console.log(`Current β catalog: ${BETA_CARDS.length}`);
console.log(`Missing β printings: ${missing.length}`);

if (!missing.length) {
  console.log("\nNothing to add.");
  process.exit(0);
}

console.log("\n===== MISSING BETA PRINTINGS =====");

for (const printing of missing) {
  console.log(
    `${printing.collector_number} | ${printing.cardName} | ${printing.id}`,
  );
}

await fs.writeFile(
  "/tmp/missing-beta-printings.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      currentCount: BETA_CARDS.length,
      officialCount: betaPrintings.length,
      missingCount: missing.length,
      missing,
    },
    null,
    2,
  ) + "\n",
);

console.log("\nWrote /tmp/missing-beta-printings.json");
