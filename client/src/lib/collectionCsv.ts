export type CollectionCsvRow = { cardId: number; quantity: number; condition?: string };

export function parseCollectionCsv(csv: string): CollectionCsvRow[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const rows = lines.slice(1).map((line) => {
    const values = line.match(/(?:^|,)\s*("(?:[^"]|"")*"|[^,]*)/g)?.map((value) => value.replace(/^,\s*/, "").trim().replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
    return { cardId: Number(values[0]), quantity: Number(values[2]), condition: values[3] || "NM" };
  });
  return rows.filter((row) => Number.isInteger(row.cardId) && row.cardId > 0 && Number.isInteger(row.quantity) && row.quantity >= 0 && row.quantity <= 99);
}
