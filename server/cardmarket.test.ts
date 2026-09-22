import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCardmarketDailyPrices } from "./cardmarket";
import { ENV } from "./_core/env";
import type { CatalogCard } from "../shared/deckRules";

const betaCard: CatalogCard = {
  id: 152,
  name: "V",
  subtitle: "Streetkid",
  kind: "legend",
  color: "red",
  cost: 5,
  power: 6,
  ram: 2,
  rarity: "Rare",
  setName: "Welcome to Night City — Beta",
  marketCents: 0,
  sourceUrl: "https://cyberpunktcg.com/cards/v-streetkid",
  imageUrl: "https://example.com/v.webp",
  printingId: "79119e83-b50b-4a79-8a6c-f496d9ed7ef6",
  collectorNumber: "β005a",
  edition: "beta",
};

describe("Cardmarket daily prices", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    ENV.cardmarketProductCatalogUrl =
      "https://example.com/cardmarket-products.json";
    ENV.cardmarketPriceGuideUrl =
      "https://example.com/cardmarket-prices.json";
  });

  it("matches a Beta card to the Beta expansion and converts EUR prices to cents", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              {
                idProduct: 12345,
                name: "V - Streetkid",
                idExpansion: 6714,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            priceGuides: [
              {
                idProduct: 12345,
                low: 0.2,
                trend: 2.5,
                avg: 2.1,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await fetchCardmarketDailyPrices([betaCard]);

    expect(result.results).toEqual([
      {
        cardId: 152,
        source: "Cardmarket daily price guide",
        currency: "EUR",
        marketCents: 250,
        lowCents: 20,
        highCents: 250,
        matchedProduct: "V - Streetkid",
      },
    ]);

    expect(result.unmatched).toEqual([]);
    expect(result.productCount).toBe(1);
    expect(result.priceGuideCount).toBe(1);
    expect(result.matchedProductCount).toBe(1);
  });

  it("falls back from trend to average and then low", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              {
                idProduct: 20001,
                name: "V - Streetkid",
                idExpansion: 6714,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            priceGuides: [
              {
                idProduct: 20001,
                low: 0.75,
                trend: null,
                avg: 1.25,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const averageResult = await fetchCardmarketDailyPrices([betaCard]);

    expect(averageResult.results[0]?.marketCents).toBe(125);

    vi.restoreAllMocks();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              {
                idProduct: 20002,
                name: "V - Streetkid",
                idExpansion: 6714,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            priceGuides: [
              {
                idProduct: 20002,
                low: 0.75,
                trend: null,
                avg: null,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const lowResult = await fetchCardmarketDailyPrices([betaCard]);

    expect(lowResult.results[0]?.marketCents).toBe(75);
  });

  it("does not match a Beta card to a non-Beta expansion", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            products: [
              {
                idProduct: 30001,
                name: "V - Streetkid",
                idExpansion: 9999,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            priceGuides: [
              {
                idProduct: 30001,
                low: 1,
                trend: 2,
                avg: 1.5,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await fetchCardmarketDailyPrices([betaCard]);

    expect(result.results).toEqual([]);
    expect(result.unmatched).toEqual([152]);
    expect(result.matchedProductCount).toBe(0);
  });

  it("throws when Cardmarket URLs are not configured", async () => {
    ENV.cardmarketPriceGuideUrl = "";
    ENV.cardmarketProductCatalogUrl =
      "https://example.com/cardmarket-products.json";

    await expect(
      fetchCardmarketDailyPrices([betaCard]),
    ).rejects.toMatchObject({
      code: "CARDMARKET_NOT_CONFIGURED",
    });
  });
});
