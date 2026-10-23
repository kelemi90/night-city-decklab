import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createSessionToken,
  generateLocalOpenId,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "./_core/localAuth";

import {
  addActivity,
  addPriceSnapshot,
  addScan,
  createDeck,
  createDeckShare,
  createLocalUser,
  deleteUserData,
  exportUserData,
  getCollection,
  getDeckCards,
  getDeckShare,
  getPublicDeckShare,
  getUserByEmail,
  importCollection,
  listActivity,
  listCards,
  listDecks,
  listLatestPrices,
  listScans,
  updateScanCard,
  revokeDeckShare,
  saveDeckCards,
  upsertCollectionItem,
} from "./db";

import { storagePut } from "./storage";
import {
  FULL_CATALOG,
  PRICE_CURRENCY,
  type CatalogCard,
} from "../shared/deckRules";
import {
  CardmarketConfigurationError,
  fetchCardmarketDailyPrices,
  isCardmarketConfigured,
} from "./cardmarket";
import {
  CardTraderConfigurationError,
  fetchLiveCardTraderPrices,
  isCardTraderConfigured,
} from "./cardtrader";
import {
  ownedCatalogRows,
  recommendDeck,
  recommendDecks,
} from "./deckAdvisor";
import {
  optimizeDeckCandidates,
  type OptimizeDeckOptions,
} from "./simulator/optimizer";
import { getAiProviderStatus } from "./_core/llm";
import { askRulesJudge } from "./rulesJudge";

const cardId = z.number().int().positive();

const deckLine = z.object({
  cardId,
  quantity: z.number().int().min(1).max(3),
});

function publicUser<
  T extends { passwordHash?: string | null } | null | undefined,
>(user: T): Omit<NonNullable<T>, "passwordHash"> | null {
  if (!user) return null;

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser as Omit<NonNullable<T>, "passwordHash">;
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image data");
  }

  const contentType = match[1].toLowerCase();

  if (
    !(
      contentType === "image/jpeg" ||
      contentType === "image/png" ||
      contentType === "image/webp"
    )
  ) {
    throw new Error("Only JPEG, PNG, or WebP images are accepted");
  }

  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image must be between 1 byte and 8 MB");
  }

  return { contentType, buffer };
}

export function validateShareExpiry(value: Date | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }

  const now = Date.now();

  if (
    Number.isNaN(value.getTime()) ||
    value.getTime() <= now ||
    value.getTime() > now + 366 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("Share expiry must be within the next 366 days");
  }

  return value;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => publicUser(opts.ctx.user)),

    register: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100),
          email: z.string().trim().email().max(320),
          password: z.string().min(8).max(200),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const email = normalizeEmail(input.email);

        const existingUser = await getUserByEmail(email);

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }

        const passwordHash = await hashPassword(input.password);

        const user = await createLocalUser({
          openId: generateLocalOpenId(),
          name: input.name.trim(),
          email,
          passwordHash,
        });

        const sessionToken = await createSessionToken(user.openId, {
          name: user.name ?? "",
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);

        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

        return publicUser(user);
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email().max(320),
          password: z.string().min(1).max(200),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const email = normalizeEmail(input.email);

        const user = await getUserByEmail(email);

        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const passwordValid = await verifyPassword(
          input.password,
          user.passwordHash,
        );

        if (!passwordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const sessionToken = await createSessionToken(user.openId, {
          name: user.name ?? "",
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);

        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

        return publicUser(user);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);

      ctx.res.clearCookie(COOKIE_NAME, {
        ...cookieOptions,
        maxAge: -1,
      });

      return { success: true } as const;
    }),
  }),

  catalog: router({
    list: publicProcedure.query(() => listCards()),

    prices: publicProcedure.query(() => listLatestPrices()),

    priceStatus: publicProcedure.query(() => ({
      providers: [
        {
          name: "Cardmarket",
          configured: isCardmarketConfigured(),
          currency: PRICE_CURRENCY,
          coverage: "Collection cards",
          updateCadence: "Daily file",
        },
        {
          name: "CardTrader",
          configured: isCardTraderConfigured(),
          currency: PRICE_CURRENCY,
          coverage: "Welcome to Night City + Beta Edition",
          updateCadence: "Live marketplace",
        },
      ],
    })),

    aiStatus: publicProcedure.query(() => getAiProviderStatus()),

    refreshPrices: protectedProcedure.mutation(async ({ ctx }) => {
      const catalog = await listCards();
      const collection = await getCollection(ctx.user.id);

      const ids = Array.from(
        new Set(
          collection.length
            ? collection.map((item) => item.cardId)
            : catalog.slice(0, 10).map((card) => card.id),
        ),
      );

      const selected = catalog.filter((card) =>
        ids.includes(card.id),
      ) as CatalogCard[];

      const capturedAt = new Date().toISOString();

      const result = {
        success: true,
        capturedAt,
        cardmarket: {
          configured: isCardmarketConfigured(),
          updated: 0,
          unmatched: 0,
          productCount: 0,
        },
        cardtrader: {
          configured: isCardTraderConfigured(),
          updated: 0,
          unmatched: 0,
        },
      };

      // ------------------------------------------------------------
      // Cardmarket
      // ------------------------------------------------------------

      if (isCardmarketConfigured()) {
        try {
          const live = await fetchCardmarketDailyPrices(selected);

          for (const price of live.results) {
            await addPriceSnapshot(price.cardId, {
              source: price.source,
              currency: price.currency,
              marketCents: price.marketCents,
              lowCents: price.lowCents,
              highCents: price.highCents,
            });
          }

          result.cardmarket.updated = live.results.length;
          result.cardmarket.unmatched = live.unmatched.length;
          result.cardmarket.productCount = live.productCount;
        } catch (error) {
          if (!(error instanceof CardmarketConfigurationError)) {
            throw error;
          }
        }
      }

      // ------------------------------------------------------------
      // CardTrader
      // ------------------------------------------------------------

      if (isCardTraderConfigured()) {
        try {
          const live = await fetchLiveCardTraderPrices(selected);

          for (const price of live.results) {
            await addPriceSnapshot(price.cardId, {
              source: price.source,
              currency: price.currency,
              marketCents: price.marketCents,
              lowCents: price.lowCents,
              highCents: price.highCents,
            });
          }

          result.cardtrader.updated = live.results.length;
          result.cardtrader.unmatched = live.unmatched.length;
        } catch (error) {
          if (!(error instanceof CardTraderConfigurationError)) {
            throw error;
          }
        }
      }

      return result;
    }),
  }),

  publicDeck: router({
    get: publicProcedure
      .input(z.object({ token: z.string().min(8).max(32) }))
      .query(({ input }) => getPublicDeckShare(input.token)),
  }),

  collection: router({
    list: protectedProcedure.query(({ ctx }) =>
      getCollection(ctx.user.id),
    ),

    upsert: protectedProcedure
      .input(
        z.object({
          cardId,
          quantity: z.number().int().min(0).max(99),
          condition: z.string().max(32).default("NM"),
        }),
      )
      .mutation(({ ctx, input }) =>
        upsertCollectionItem(
          ctx.user.id,
          input.cardId,
          input.quantity,
          input.condition,
        ),
      ),

    importCsv: protectedProcedure
      .input(
        z.object({
          items: z
            .array(
              z.object({
                cardId,
                quantity: z.number().int().min(0).max(99),
                condition: z.string().max(32).optional(),
              }),
            )
            .max(1000),
        }),
      )
      .mutation(({ ctx, input }) =>
        importCollection(ctx.user.id, input.items),
      ),

    exportCsv: protectedProcedure.query(async ({ ctx }) => {
      const [collection, catalog] = await Promise.all([
        getCollection(ctx.user.id),
        listCards(),
      ]);

      const byId = new Map(
        catalog.map(card => [card.id, card]),
      );

      const rows = collection.map(item => [
        item.cardId,
        byId.get(item.cardId)?.name ?? `Card ${item.cardId}`,
        item.quantity,
        item.condition,
      ]);

      return (
        [
          ["cardId", "cardName", "quantity", "condition"],
          ...rows,
        ]
          .map(row =>
            row
              .map(value =>
                `"${String(value).replace(/"/g, '""')}"`,
              )
              .join(","),
          )
          .join("\n") + "\n"
      );
    }),
  }),

  activity: router({
    list: protectedProcedure.query(({ ctx }) =>
      listActivity(ctx.user.id),
    ),
  }),

  privacy: router({
    exportData: protectedProcedure.query(({ ctx }) =>
      exportUserData(ctx.user.id),
    ),

    deleteAccount: protectedProcedure.mutation(async ({ ctx }) =>
      deleteUserData(ctx.user.id),
    ),
  }),

  scans: router({
    list: protectedProcedure.query(({ ctx }) =>
      listScans(ctx.user.id),
    ),

    correct: protectedProcedure
      .input(
        z.object({
          scanId: z.number().int().positive(),
          cardId,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const scan = await updateScanCard(
          ctx.user.id,
          input.scanId,
          input.cardId,
        );

        await addActivity(
          ctx.user.id,
          "collection",
          "Card scan corrected",
          `Scan #${input.scanId} reassigned to catalog card #${input.cardId}.`,
        );

        return scan;
      }),

    create: protectedProcedure
      .input(
        z.object({
          cardId: cardId.optional(),
          frontDataUrl: z.string().max(11_200_000).optional(),
          backDataUrl: z.string().max(11_200_000).optional(),
          recognitionStatus: z
            .enum(["pending", "matched", "review"])
            .default("matched"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const urls: {
          frontImageUrl?: string;
          backImageUrl?: string;
        } = {};

        if (input.frontDataUrl) {
          const front = decodeDataUrl(input.frontDataUrl);

          urls.frontImageUrl = (
            await storagePut(
              `${ctx.user.id}/scans/front-${Date.now()}`,
              front.buffer,
              front.contentType,
            )
          ).url;
        }

        if (input.backDataUrl) {
          const back = decodeDataUrl(input.backDataUrl);

          urls.backImageUrl = (
            await storagePut(
              `${ctx.user.id}/scans/back-${Date.now()}`,
              back.buffer,
              back.contentType,
            )
          ).url;
        }

        const scan = await addScan(ctx.user.id, {
          cardId: input.cardId,
          ...urls,
          recognitionStatus: input.recognitionStatus,
        });

        if (input.cardId) {
          await upsertCollectionItem(
            ctx.user.id,
            input.cardId,
            1,
            "NM",
          );
        }

        await addActivity(
          ctx.user.id,
          "scan",
          "Card scan saved",
          input.cardId
            ? `Catalog card #${input.cardId} added to your collection.`
            : "Scan saved for manual review.",
        );

        return scan;
      }),
  }),

  decks: router({
    list: protectedProcedure.query(({ ctx }) =>
      listDecks(ctx.user.id),
    ),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(160),
          notes: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const deck = await createDeck(
          ctx.user.id,
          input.name,
          input.notes,
        );

        await addActivity(
          ctx.user.id,
          "deck",
          "Deck saved",
          input.name,
        );

        return deck;
      }),

    cards: protectedProcedure
      .input(
        z.object({
          deckId: z.number().int().positive(),
        }),
      )
      .query(({ ctx, input }) =>
        getDeckCards(ctx.user.id, input.deckId),
      ),

    saveCards: protectedProcedure
      .input(
        z.object({
          deckId: z.number().int().positive(),
          legends: z.array(deckLine),
          main: z.array(deckLine),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const lines = await saveDeckCards(
          ctx.user.id,
          input.deckId,
          input.legends,
          input.main,
        );

        await addActivity(
          ctx.user.id,
          "deck",
          "Deck cards updated",
          `Saved ${lines.length} deck lines.`,
        );

        return lines;
      }),

    share: protectedProcedure
      .input(
        z.object({
          deckId: z.number().int().positive(),
          expiresAt: z.coerce.date().nullable().optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        createDeckShare(
          ctx.user.id,
          input.deckId,
          validateShareExpiry(input.expiresAt),
        ),
      ),

    shareStatus: protectedProcedure
      .input(
        z.object({
          deckId: z.number().int().positive(),
        }),
      )
      .query(({ ctx, input }) =>
        getDeckShare(ctx.user.id, input.deckId),
      ),

    revokeShare: protectedProcedure
      .input(
        z.object({
          deckId: z.number().int().positive(),
        }),
      )
      .mutation(({ ctx, input }) =>
        revokeDeckShare(ctx.user.id, input.deckId),
      ),
  }),

  rulesJudge: router({
    ask: protectedProcedure
      .input(
        z.object({
          question: z.string().trim().min(1).max(1200),
          provider: z.enum(["ollama", "lmstudio", "omniroute"]).optional(),
        }),
      )
      .mutation(({ input }) => askRulesJudge(input)),
  }),

  advisor: router({
    recommend: protectedProcedure.mutation(async ({ ctx }) => {
      const collection = await getCollection(ctx.user.id);
      const result = await recommendDeck(
        ownedCatalogRows(collection),
      );

      await addActivity(
        ctx.user.id,
        "recommendation",
        "AI deck recommendation created",
        result.name,
      );

      return result;
    }),

    recommendMany: protectedProcedure
      .input(
        z.object({
          goals: z
            .array(
              z.enum([
                "aggro",
                "control",
                "midrange",
                "tempo",
              ]),
            )
            .min(1)
            .max(3),
          weights: z.object({
            speed: z.number().int().min(0).max(100),
            control: z.number().int().min(0).max(100),
            budget: z.number().int().min(0).max(100),
          }),
          edition: z.enum(["retail", "beta"]),
          provider: z.enum(["ollama", "lmstudio", "omniroute"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const collection = await getCollection(ctx.user.id);

        const editionCards = FULL_CATALOG.filter(
          (card) => (card.edition ?? "retail") === input.edition,
        );

        const recommendations = await recommendDecks(
          ownedCatalogRows(collection, editionCards),
          Array.from(new Set(input.goals)),
          input.weights,
          input.provider,
        );

        const simulationOptions: OptimizeDeckOptions = {
          gamesPerSide: 10,
          maxTurns: 200,
          weights: input.weights,
        };

        const optimized = await optimizeDeckCandidates(
          recommendations,
          FULL_CATALOG,
          simulationOptions,
        );

        await addActivity(
          ctx.user.id,
          "recommendation",
          "AI deck comparison created",
          `${recommendations.length} strategy builds generated and simulated.`,
        );

        return optimized.candidates.map((candidate) => ({
          ...candidate.recommendation,
          edition: input.edition,
          advisorConfig: {
            goals: Array.from(new Set(input.goals)),
            weights: input.weights,
            provider: input.provider,
          },
          simulation: candidate.evaluation,
          matchups: candidate.matchups,
          preferenceFit: candidate.preferenceFit,
        }));
      }),
  }),
});

export type AppRouter = typeof appRouter;
