import type { CatalogCard } from "@shared/deckRules";

export type ExportLine = { cardId: number; quantity: number };

const GROUPS: Array<{ kind: CatalogCard["kind"]; label: string }> = [
  { kind: "legend", label: "Legends" },
  { kind: "unit", label: "Units" },
  { kind: "gear", label: "Gears" },
  { kind: "program", label: "Programs" },
];

function cardLabel(card: CatalogCard) {
  const subtitle = card.subtitle?.replace(/\u00a0/g, " ").trim();
  return subtitle ? `${card.name}: ${subtitle}` : card.name;
}

export function formatDeckExport(name: string, legends: ExportLine[], main: ExportLine[], cards: CatalogCard[]) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const allLines = [...legends, ...main];
  const sections = GROUPS.map(({ kind, label }) => {
    const lines = allLines
      .map((line) => ({ line, card: byId.get(line.cardId) }))
      .filter((entry) => entry.card?.kind === kind && entry.line.quantity > 0)
      .map((entry) => ({ line: entry.line, card: entry.card! }));
    if (!lines.length) return null;
    const total = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);
    return [`// ${label} (${total})`, ...lines.map(({ line, card }) => `${line.quantity} ${cardLabel(card)}`)].join("\n");
  }).filter((section): section is string => Boolean(section));

  return [`# ${name.trim() || "Untitled Deck"}`, "", ...sections].join("\n\n").trim() + "\n";
}
