import { CATALOG_CARDS, type CatalogCard } from "../shared/deckRules";
import { ENV } from "./_core/env";

const API_BASE = "https://api.cardtrader.com/api/v2";
const MIN_MARKETPLACE_INTERVAL_MS = 1050;

let lastMarketplaceRequest = 0;

export type LivePrice = {
  cardId: number;
  source: string;
  currency: "EUR";
  marketCents: number;
  lowCents: number;
  highCents: number;
  matchedBlueprint: string;
  expansionId: number;
  expansionName: string;
};

export class CardTraderConfigurationError extends Error {
  code = "CARDTRADER_NOT_CONFIGURED" as const;
}

async function request<T>(path: string): Promise<T> {
  if (!ENV.cardTraderToken) {
    throw new CardTraderConfigurationError(
      "Add CARDTRADER_API_TOKEN to enable live CardTrader prices.",
    );
  }

  const wait = Math.max(
    0,
    MIN_MARKETPLACE_INTERVAL_MS - (Date.now() - lastMarketplaceRequest),
  );

  if (wait) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  lastMarketplaceRequest = Date.now();

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${ENV.cardTraderToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CardTrader returned ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

type Blueprint = {
  id: number;
  name: string;
  expansion_id: number | null;
  version?: string | null;
  fixed_properties?: {
    collector_number?: string | null;
    cyberpunk_rarity?: string | null;
  } | null;
};

type MarketplaceProduct = {
  price?: {
    cents?: number;
    currency?: string;
  };
};

type MarketplaceProductsResponse = Record<string, MarketplaceProduct[]>;

type Expansion = {
  id: number;
  name: string;
  edition: "beta" | "retail";
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCollectorNumber(blueprint: Blueprint) {
  return blueprint.fixed_properties?.collector_number?.trim() ?? "";
}

function getExpectedCollectorNumber(
  card: CatalogCard,
  edition: Expansion["edition"],
) {
  const collectorNumber = card.collectorNumber?.trim();

  if (!collectorNumber) {
    return null;
  }

  if (edition === "beta") {
    return collectorNumber.startsWith("β")
      ? collectorNumber
      : `β${collectorNumber}`;
  }

  return collectorNumber.startsWith("β")
    ? collectorNumber.slice(1)
    : collectorNumber;
}

function nameMatches(card: CatalogCard, blueprint: Blueprint) {
  const cardName = normalize(`${card.name} ${card.subtitle ?? ""}`);
  const blueprintName = normalize(blueprint.name);

  return blueprintName === cardName;
}

function blueprintMatches(
  card: CatalogCard,
  blueprint: Blueprint,
  expansion: Expansion,
) {
  const collectorNumber = getCollectorNumber(blueprint);
  const expectedCollectorNumber = getExpectedCollectorNumber(
    card,
    expansion.edition,
  );

  if (!collectorNumber || !expectedCollectorNumber) {
    return false;
  }

  if (collectorNumber !== expectedCollectorNumber) {
    return false;
  }

  return nameMatches(card, blueprint);
}

export function calculateCardTraderPrices(values: number[]) {
  const sorted = values
    .filter((cents) => Number.isFinite(cents) && cents > 0)
    .sort((a, b) => a - b);

  if (!sorted.length) {
    return null;
  }

  const middleIndex = Math.floor(sorted.length / 2);

  const marketCents =
    sorted.length % 2 === 0
      ? Math.round(
        (sorted[middleIndex - 1] + sorted[middleIndex]) / 2,
      )
      : sorted[middleIndex];

  let filtered = sorted;

  // Only apply statistical filtering when there are enough
  // listings to make the calculation meaningful.
  if (sorted.length >= 4) {
    // Use the marketplace median as the robust reference point.
    //
    // A listing that is 20x or more above the median is treated
    // as an extreme marketplace anomaly.
    //
    // Examples:
    //
    //   €0.59, €0.69, €5.11, €1000.64, €5000.64
    //
    // Median = €5.11
    // 20x median = €102.20
    //
    // Therefore €1000.64 and €5000.64 are removed, while
    // €5.11 remains a valid marketplace price.
    const extremePriceThreshold = marketCents * 20;

    filtered = sorted.filter(
      (price) => price < extremePriceThreshold,
    );
  }

  return {
    marketCents,
    lowCents: filtered[0],
    highCents: filtered[filtered.length - 1],
  };
}

function summarizePrices(
  card: CatalogCard,
  blueprint: Blueprint,
  products: MarketplaceProduct[],
  expansion: Expansion,
): LivePrice | null {
  const values = products
    .map((product) => product.price)
    .filter(
      (
        price,
      ): price is {
        cents: number;
        currency?: string;
      } =>
        Boolean(
          price &&
          typeof price.cents === "number" &&
          (price.currency ?? "EUR") === "EUR",
        ),
    )
    .map((price) => price.cents)
    .filter((cents) => cents > 0);

  const priceSummary = calculateCardTraderPrices(values);

  if (!priceSummary) {
    return null;
  }

  return {
    cardId: card.id,
    source: `CardTrader marketplace (${expansion.edition === "beta" ? "Beta" : "Standard"
      })`,
    currency: "EUR",
    marketCents: priceSummary.marketCents,
    lowCents: priceSummary.lowCents,
    highCents: priceSummary.highCents,
    matchedBlueprint: blueprint.name,
    expansionId: expansion.id,
    expansionName: expansion.name,
  };
}

export async function fetchLiveCardTraderPrices(cards: CatalogCard[]) {
  if (!ENV.cardTraderToken || !ENV.cardTraderExpansionIds.length) {
    throw new CardTraderConfigurationError(
      "Add CARDTRADER_API_TOKEN and CARDTRADER_EXPANSION_IDS to enable live CardTrader prices.",
    );
  }

  const expansions: Expansion[] = ENV.cardTraderExpansionIds.map((id) => {
    const numericId = Number(id);

    if (numericId === 4839) {
      return {
        id: numericId,
        name: "Welcome to Night City | Beta Edition",
        edition: "beta",
      };
    }

    if (numericId === 4840) {
      return {
        id: numericId,
        name: "Welcome to Night City",
        edition: "retail",
      };
    }

    return {
      id: numericId,
      name: `CardTrader expansion ${numericId}`,
      edition: "retail",
    };
  });

  const allBlueprints: Array<{
    blueprint: Blueprint;
    expansion: Expansion;
  }> = [];

  for (const expansion of expansions) {
    const blueprints = await request<Blueprint[]>(
      `/blueprints/export?expansion_id=${encodeURIComponent(expansion.id)}`,
    );

    for (const blueprint of blueprints) {
      if (!getCollectorNumber(blueprint)) {
        continue;
      }

      allBlueprints.push({
        blueprint,
        expansion,
      });
    }
  }

  const results: LivePrice[] = [];
  const unmatched: number[] = [];

  for (const card of cards) {
    const matches = allBlueprints.filter(({ blueprint, expansion }) =>
      blueprintMatches(card, blueprint, expansion),
    );

    if (!matches.length) {
      unmatched.push(card.id);
      continue;
    }

    let matchedAny = false;

    for (const match of matches) {
      const response = await request<MarketplaceProductsResponse>(
        `/marketplace/products?blueprint_id=${match.blueprint.id}`,
      );

      const products = response[String(match.blueprint.id)] ?? [];

      const summary = summarizePrices(
        card,
        match.blueprint,
        products,
        match.expansion,
      );

      if (summary) {
        results.push(summary);
        matchedAny = true;
      }
    }

    if (!matchedAny) {
      unmatched.push(card.id);
    }
  }

  return {
    results,
    unmatched,
    expansionIds: ENV.cardTraderExpansionIds,
  };
}

export function isCardTraderConfigured() {
  return Boolean(
    ENV.cardTraderToken && ENV.cardTraderExpansionIds.length,
  );
}

export const cardTraderCatalogCount = CATALOG_CARDS.length;