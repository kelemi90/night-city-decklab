import { describe, expect, it } from "vitest";
import { matchOcrText, OCR_MODES } from "./cardOcr";
import type { CatalogCard } from "@shared/deckRules";

const cards: CatalogCard[] = [
  { id: 1, name: "Johnny Silverhand", subtitle: "Rocking Renegade", kind: "legend", color: "red", ram: 2, rarity: "Official", setName: "Test", marketCents: 100, sourceUrl: "", imageUrl: "" },
  { id: 2, name: "Ruthless Lowlife", subtitle: "", kind: "unit", color: "red", cost: 2, power: 4, ram: 1, rarity: "Official", setName: "Test", marketCents: 100, sourceUrl: "", imageUrl: "" },
];

describe("OCR card matching", () => {
  it("exposes balanced, contrast, low-light, and sharpened preprocessing profiles", () => {
    expect(OCR_MODES.map((mode) => mode.id)).toEqual(["balanced", "highContrast", "lowLight", "sharpened"]);
  });

  it("matches noisy OCR text against the official card catalog", () => {
    const result = matchOcrText("JOHNNY SILVERHAND\\nROCKING RENEGADE", cards);
    expect(result?.card.id).toBe(1);
    expect(result?.confidence).toBeGreaterThan(80);
  });

  it("returns no match when OCR text is unrelated", () => {
    expect(matchOcrText("night city barcode", cards)).toBeUndefined();
  });
});
