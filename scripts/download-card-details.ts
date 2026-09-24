import fs from "node:fs/promises";
import { CATALOG_CARDS } from "../shared/deckRules";
import { BETA_CARDS } from "../shared/betaCatalog";

const API_BASE = "https://api.netdeck.gg/api";
const OUTPUT = "client/public/card-art/details.json";

const ALL_CARDS = [...CATALOG_CARDS, ...BETA_CARDS];

type ApiCard = {
  rules_text: string | null;
  flavor_text: string | null;
  printing_id: string;
  card_type: string;
  classifications: string[];
  keywords: string[];
  artist?: string;
};

type CardDetails = {
  cardId: number;
  rulesText: string;
  flavorText: string | null;
  classifications: string[];
  keywords: string[];
  cardType: string;
  artist: string | null;
};

async function fetchCard(
  card: (typeof ALL_CARDS)[number],
): Promise<CardDetails> {
  const match = card.sourceUrl.match(/\/cards\/([^?]+)/);

  if (!match) {
    throw new Error(`Unable to extract slug for ${card.name}`);
  }

  const slug = match[1];

  const url =
    `${API_BASE}/cards/cyberpunk/${slug}` +
    `?printing=${encodeURIComponent(card.printingId ?? "")}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${card.name}: API returned ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as ApiCard;

  if (data.printing_id !== card.printingId) {
    throw new Error(
      `${card.name}: printing mismatch. ` +
        `Catalog=${card.printingId} API=${data.printing_id}`,
    );
  }

  return {
    cardId: card.id,
    rulesText: data.rules_text ?? "",
    flavorText: data.flavor_text,
    classifications: data.classifications ?? [],
    keywords: data.keywords ?? [],
    cardType: data.card_type,
    artist: data.artist ?? null,
  };
}

async function main() {
  await fs.mkdir("client/public/card-art", { recursive: true });

  const details: Record<string, CardDetails> = {};

  for (let index = 0; index < ALL_CARDS.length; index += 1) {
    const card = ALL_CARDS[index];
    const result = await fetchCard(card);

    details[String(card.id)] = result;

    console.log(
      `[${index + 1}/${ALL_CARDS.length}] ` +
        `${card.edition === "beta" ? "BETA" : "RETAIL"} ${card.name}`,
    );
  }

  await fs.writeFile(
    OUTPUT,
    JSON.stringify(details, null, 2) + "\n",
    "utf8",
  );

  console.log("");
  console.log(`Wrote ${ALL_CARDS.length} card details to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});