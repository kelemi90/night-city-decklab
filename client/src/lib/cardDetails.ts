export type CardDetails = {
  cardId: number;
  rulesText: string;
  flavorText: string | null;
  classifications: string[];
  keywords: string[];
  cardType: string;
  artist: string | null;
};

let detailsPromise: Promise<Record<number, CardDetails>> | undefined;

export function loadCardDetails(): Promise<Record<number, CardDetails>> {
  if (!detailsPromise) {
    detailsPromise = fetch("/card-art/details.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load card details: ${response.status}`,
          );
        }

        const data = (await response.json()) as Record<
          string,
          CardDetails
        >;

        return Object.fromEntries(
          Object.entries(data).map(([id, details]) => [
            Number(id),
            details,
          ]),
        );
      })
      .catch((error) => {
        console.error("[CardDetails] Failed to load details:", error);
        return {};
      });
  }

  return detailsPromise;
}

export function formatRulesText(rulesText: string) {
  return rulesText.replace(/\{([^}]+)\}/g, "[$1]");
}
