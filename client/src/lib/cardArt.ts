import type { CatalogCard } from "@shared/deckRules";

const cardArt = new Map<number, string>();

let loadPromise: Promise<void> | undefined;

async function loadCardArtIndex() {
  if (!loadPromise) {
    loadPromise = fetch("/card-art/index.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load card artwork index: ${response.status}`,
          );
        }

        const index = (await response.json()) as Record<string, string>;

        for (const [id, url] of Object.entries(index)) {
          cardArt.set(Number(id), url);
        }
      })
      .catch((error) => {
        console.error("[CardArt] Failed to load artwork index:", error);
      });
  }

  await loadPromise;
}

void loadCardArtIndex();

export function getCardArtUrl(card: CatalogCard) {
  return cardArt.get(card.id) ?? card.imageUrl;
}