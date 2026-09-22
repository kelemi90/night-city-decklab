import { describe, expect, it } from "vitest";
import { formatDeckExport } from "./deckExport";
import type { CatalogCard } from "@shared/deckRules";

const cards: CatalogCard[] = [
  { id: 1, name: "Hanako Arasaka", subtitle: "Daughter of the Emperor", kind: "legend", color: "yellow", ram: 2, rarity: "test", setName: "test", marketCents: 0, sourceUrl: "", imageUrl: "" },
  { id: 2, name: "Field Operator", kind: "unit", color: "yellow", ram: 1, rarity: "test", setName: "test", marketCents: 0, sourceUrl: "", imageUrl: "" },
  { id: 3, name: "Sandevistan", kind: "gear", color: "yellow", ram: 2, rarity: "test", setName: "test", marketCents: 0, sourceUrl: "", imageUrl: "" },
  { id: 4, name: "Detonate", kind: "program", color: "yellow", ram: 1, rarity: "test", setName: "test", marketCents: 0, sourceUrl: "", imageUrl: "" },
];

describe("formatDeckExport", () => {
  it("formats grouped sections with totals and subtitles", () => {
    const output = formatDeckExport("Sandevistan", [{ cardId: 1, quantity: 1 }], [{ cardId: 2, quantity: 2 }, { cardId: 3, quantity: 3 }, { cardId: 4, quantity: 2 }], cards);
    expect(output).toContain("# Sandevistan");
    expect(output).toContain("// Legends (1)");
    expect(output).toContain("1 Hanako Arasaka: Daughter of the Emperor");
    expect(output).toContain("// Units (2)");
    expect(output).toContain("// Gears (3)");
    expect(output).toContain("// Programs (2)");
  });
});
