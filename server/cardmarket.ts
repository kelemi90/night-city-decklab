import { CATALOG_CARDS, type CatalogCard } from "../shared/deckRules";
import { ENV } from "./_core/env";

const CARDMARKET_BETA_EXPANSION_ID = 6714;

export type CardmarketPrice = {
  cardId: number;
  source: "Cardmarket daily price guide";
  currency: "EUR";
  marketCents: number;
  lowCents: number;
  highCents: number;
  matchedProduct: string;
};

type CardmarketProduct = {
  idProduct: number;
  name: string;
  idCategory?: number;
  categoryName?: string;
  idExpansion?: number;
  idMetacard?: number;
};

type CardmarketPriceGuideEntry = {
  idProduct: number;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
};

export class CardmarketConfigurationError extends Error {
  code = "CARDMARKET_NOT_CONFIGURED" as const;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cardFullName(card: CatalogCard) {
  return card.subtitle?.trim()
    ? `${card.name} - ${card.subtitle.trim()}`
    : card.name;
}

/**
 * Cardmarket's downloadable JSON price values are EUR amounts,
 * not cents.
 *
 * Example:
 *   0.20 -> 20 cents
 *   4.99 -> 499 cents
 *   34   -> 3400 cents
 */
function eurosToCents(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100);
}

async function fetchJson<T>(url: string, description: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Cardmarket ${description} returned ${response.status} ${response.statusText}.`,
    );
  }

  return response.json() as Promise<T>;
}

function buildProductMap(products: CardmarketProduct[]) {
  const map = new Map<string, CardmarketProduct[]>();

  for (const product of products) {
    if (!product.name || !Number.isInteger(product.idProduct)) {
      continue;
    }

    const key = normalize(product.name);
    const existing = map.get(key) ?? [];
    existing.push(product);
    map.set(key, existing);
  }

  return map;
}

function buildPriceMap(entries: CardmarketPriceGuideEntry[]) {
  const map = new Map<number, CardmarketPriceGuideEntry>();

  for (const entry of entries) {
    if (!Number.isInteger(entry.idProduct)) {
      continue;
    }

    map.set(entry.idProduct, entry);
  }

  return map;
}

function createPrice(
  cardId: number,
  product: CardmarketProduct,
  guide: CardmarketPriceGuideEntry,
): CardmarketPrice | null {
  const lowCents = eurosToCents(guide.low);
  const trendCents = eurosToCents(guide.trend);
  const averageCents = eurosToCents(guide.avg);

  /*
   * Cardmarket exposes several price measurements.
   *
   * Use trend as the market value when available, otherwise avg,
   * otherwise low.
   */
  const marketCents = trendCents ?? averageCents ?? lowCents;

  if (marketCents == null) {
    return null;
  }

  /*
   * Cardmarket's daily guide does not provide a true marketplace
   * high-listing value. Use the highest available guide metric.
   */
  const highCents = Math.max(
    lowCents ?? marketCents,
    trendCents ?? marketCents,
    averageCents ?? marketCents,
    marketCents,
  );

  return {
    cardId,
    source: "Cardmarket daily price guide",
    currency: "EUR",
    marketCents,
    lowCents: lowCents ?? marketCents,
    highCents,
    matchedProduct: product.name,
  };
}

function productsForCard(
  card: CatalogCard,
  candidates: CardmarketProduct[],
) {
  /*
   * Cardmarket Beta is currently available as expansion 6714.
   *
   * Do not allow Beta products to be selected for retail cards.
   * Retail MS01 singles are not available on Cardmarket yet.
   */
  if (card.edition === "beta") {
    return candidates.filter(
      (candidate) =>
        candidate.idExpansion === CARDMARKET_BETA_EXPANSION_ID,
    );
  }

  /*
   * Retail Cardmarket singles are not available yet.
   *
   * Returning no candidates here prevents the importer from
   * accidentally using Beta or another Cyberpunk product variant.
   */
  return [];
}

export async function fetchCardmarketDailyPrices(cards: CatalogCard[]) {
  if (!ENV.cardmarketPriceGuideUrl) {
    throw new CardmarketConfigurationError(
      "Add CARDMARKET_PRICE_GUIDE_URL to enable Cardmarket daily prices.",
    );
  }

  if (!ENV.cardmarketProductCatalogUrl) {
    throw new CardmarketConfigurationError(
      "Add CARDMARKET_PRODUCT_CATALOG_URL to enable Cardmarket daily prices.",
    );
  }

  const [catalog, guide] = await Promise.all([
    fetchJson<{ products?: CardmarketProduct[] }>(
      ENV.cardmarketProductCatalogUrl,
      "product catalogue",
    ),
    fetchJson<{ priceGuides?: CardmarketPriceGuideEntry[] }>(
      ENV.cardmarketPriceGuideUrl,
      "price guide",
    ),
  ]);

  const products = catalog.products ?? [];
  const priceGuides = guide.priceGuides ?? [];

  const productMap = buildProductMap(products);
  const priceMap = buildPriceMap(priceGuides);

  const results: CardmarketPrice[] = [];
  const unmatched: number[] = [];
  const matchedProducts = new Set<number>();

  for (const card of cards) {
    const fullName = cardFullName(card);
    const candidates = productMap.get(normalize(fullName)) ?? [];
    const editionCandidates = productsForCard(card, candidates);

    /*
     * For a known edition, only use products belonging to that
     * edition's known Cardmarket expansion.
     *
     * If several products remain, prefer one with a price guide.
     */
    const product =
      editionCandidates.find((candidate) =>
        priceMap.has(candidate.idProduct),
      ) ?? editionCandidates[0];

    if (!product) {
      unmatched.push(card.id);
      continue;
    }

    const priceGuide = priceMap.get(product.idProduct);

    if (!priceGuide) {
      unmatched.push(card.id);
      continue;
    }

    const price = createPrice(card.id, product, priceGuide);

    if (!price) {
      unmatched.push(card.id);
      continue;
    }

    results.push(price);
    matchedProducts.add(product.idProduct);
  }

  return {
    results,
    unmatched,
    productCount: products.length,
    priceGuideCount: priceGuides.length,
    matchedProductCount: matchedProducts.size,
  };
}

export function isCardmarketConfigured() {
  return Boolean(
    ENV.cardmarketPriceGuideUrl &&
      ENV.cardmarketProductCatalogUrl,
  );
}

export const cardmarketCatalogCount = CATALOG_CARDS.length;