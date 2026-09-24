import type { Express, Request, Response } from "express";

const API_URL = "https://api.netdeck.gg/api/cards/cyberpunk";
const CACHE_TTL_MS = 5 * 60 * 1000;

type ApiPrinting = {
  id?: string;
  image_url?: string;
  collector_number?: string;
  set?: {
    code?: string;
  } | null;
};

type ApiCard = {
  printings?: ApiPrinting[];
};

type ApiResponse = {
  items?: ApiCard[];
};

let cachedPrintings: Map<string, string> | null = null;
let cacheExpiresAt = 0;
let loadingPromise: Promise<Map<string, string>> | null = null;

async function loadPrintingImages(): Promise<Map<string, string>> {
  const now = Date.now();

  if (cachedPrintings && now < cacheExpiresAt) {
    return cachedPrintings;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const printings = new Map<string, string>();

    for (const offset of [0, 100]) {
      const response = await fetch(
        `${API_URL}?limit=100&offset=${offset}`,
      );

      if (!response.ok) {
        throw new Error(
          `Netdeck API returned HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as ApiResponse;

      for (const card of data.items ?? []) {
        for (const printing of card.printings ?? []) {
          if (printing.id && printing.image_url) {
            printings.set(printing.id, printing.image_url);
          }
        }
      }

      if ((data.items ?? []).length < 100) {
        break;
      }
    }

    cachedPrintings = printings;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;

    return printings;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export function registerCardArtProxy(app: Express) {
  app.get(
    "/api/card-art/:printingId",
    async (req: Request, res: Response) => {
      const { printingId } = req.params;

      if (!/^[0-9a-f-]{36}$/i.test(printingId)) {
        res.status(400).json({
          error: "Invalid printing ID",
        });
        return;
      }

      try {
        const printings = await loadPrintingImages();
        const imageUrl = printings.get(printingId);

        if (!imageUrl) {
          res.status(404).json({
            error: "Card artwork not found",
          });
          return;
        }

        const imageResponse = await fetch(imageUrl);

        if (!imageResponse.ok) {
          throw new Error(
            `Artwork CDN returned HTTP ${imageResponse.status}`,
          );
        }

        const contentType =
          imageResponse.headers.get("content-type") ??
          "image/webp";

        const contentLength =
          imageResponse.headers.get("content-length");

        res.status(200);
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=60",
        );
        res.setHeader(
          "X-Content-Type-Options",
          "nosniff",
        );

        if (contentLength) {
          res.setHeader("Content-Length", contentLength);
        }

        if (!imageResponse.body) {
          throw new Error("Artwork response had no body");
        }

        const reader = imageResponse.body.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            res.write(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }

        res.end();
      } catch (error) {
        console.error(
          "[CardArt] Failed to proxy artwork:",
          error,
        );

        if (!res.headersSent) {
          res.status(502).json({
            error: "Failed to load card artwork",
          });
        } else {
          res.end();
        }
      }
    },
  );
}
