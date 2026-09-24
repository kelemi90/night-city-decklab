import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { drizzle } from "drizzle-orm/mysql2";
import { CATALOG_CARDS, PRICE_CURRENCY } from "../shared/deckRules";
import { BETA_CARDS } from "../shared/betaCatalog";

const FULL_CATALOG = [...CATALOG_CARDS, ...BETA_CARDS];
import { ActivityEvent, CardScan, InsertUser, activityEvents, cards, cardScans, collectionItems, deckCards, deckShares, decks, priceSnapshots, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  } else {
    values.lastSignedIn = new Date();
    updateSet.lastSignedIn = new Date();
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result[0];
}

export async function createLocalUser(user: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db
    .insert(users)
    .values({
      openId: user.openId,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      loginMethod: "local",
      role: "user",
      lastSignedIn: new Date(),
    });

  const id = Number(result[0].insertId);

  const created = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!created[0]) {
    throw new Error("Failed to load newly created user");
  }

  return created[0];
}

export async function ensureCatalog() {
  const db = await getDb();
  if (!db) return;
  for (const card of FULL_CATALOG) {
    await db.insert(cards).values({
      id: card.id,
      name: card.name,
      subtitle: card.subtitle,
      kind: card.kind,
      color: card.color,
      cost: card.cost,
      power: card.power,
      ram: card.ram,
      rarity: card.rarity,
      setName: card.setName,
      sourceUrl: card.sourceUrl,
    }).onDuplicateKeyUpdate({ set: {
      name: card.name,
      subtitle: card.subtitle,
      kind: card.kind,
      color: card.color,
      cost: card.cost,
      power: card.power,
      ram: card.ram,
      rarity: card.rarity,
      setName: card.setName,
      sourceUrl: card.sourceUrl,
    } });
  }
}

export async function listCards() {
  const db = await getDb();
  if (!db) return FULL_CATALOG;
  await ensureCatalog();
  const rows = await db.select().from(cards).orderBy(cards.id);
  return rows.map((row) => {
    const catalog = FULL_CATALOG.find((card) => card.id === row.id);
    return { ...row, ...(catalog ?? {}), marketCents: catalog?.marketCents ?? 0 };
  });
}

export async function getCollection(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureCatalog();
  return db.select().from(collectionItems).where(eq(collectionItems.userId, userId)).orderBy(desc(collectionItems.updatedAt));
}

export async function upsertCollectionItem(userId: number, cardId: number, quantity: number, condition = "NM") {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await ensureCatalog();
  const existing = await db.select().from(collectionItems).where(and(eq(collectionItems.userId, userId), eq(collectionItems.cardId, cardId))).limit(1);
  if (existing[0]) {
    await db.update(collectionItems).set({ quantity, condition, updatedAt: new Date() }).where(eq(collectionItems.id, existing[0].id));
    return { ...existing[0], quantity, condition };
  }
  const result = await db.insert(collectionItems).values({ userId, cardId, quantity, condition });
  return { id: result[0].insertId, userId, cardId, quantity, condition };
}

export async function addScan(userId: number, input: { cardId?: number; frontImageUrl?: string; backImageUrl?: string; recognitionStatus?: "pending" | "matched" | "review" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(cardScans).values({ userId, ...input });
  return { id: result[0].insertId, userId, ...input } as CardScan;
}

export async function listScans(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cardScans).where(eq(cardScans.userId, userId)).orderBy(desc(cardScans.createdAt));
}

export async function updateScanCard(
  userId: number,
  scanId: number,
  newCardId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");

  await ensureCatalog();

  const catalogCard = await db
    .select()
    .from(cards)
    .where(eq(cards.id, newCardId))
    .limit(1);

  if (!catalogCard[0]) {
    throw new Error("Target card was not found in the catalog");
  }

  return db.transaction(async (tx) => {
    const existingScan = await tx
      .select()
      .from(cardScans)
      .where(
        and(
          eq(cardScans.id, scanId),
          eq(cardScans.userId, userId),
        ),
      )
      .limit(1);

    if (!existingScan[0]) {
      throw new Error("Scan not found");
    }

    const oldCardId = existingScan[0].cardId;

    if (oldCardId !== newCardId) {
      if (oldCardId !== null) {
        const oldCollection = await tx
          .select()
          .from(collectionItems)
          .where(
            and(
              eq(collectionItems.userId, userId),
              eq(collectionItems.cardId, oldCardId),
            ),
          )
          .limit(1);

        if (oldCollection[0]) {
          await tx
            .update(collectionItems)
            .set({
              quantity: Math.max(0, oldCollection[0].quantity - 1),
              updatedAt: new Date(),
            })
            .where(eq(collectionItems.id, oldCollection[0].id));
        }
      }

      const newCollection = await tx
        .select()
        .from(collectionItems)
        .where(
          and(
            eq(collectionItems.userId, userId),
            eq(collectionItems.cardId, newCardId),
          ),
        )
        .limit(1);

      if (newCollection[0]) {
        await tx
          .update(collectionItems)
          .set({
            quantity: newCollection[0].quantity + 1,
            updatedAt: new Date(),
          })
          .where(eq(collectionItems.id, newCollection[0].id));
      } else {
        await tx.insert(collectionItems).values({
          userId,
          cardId: newCardId,
          quantity: 1,
          condition: "NM",
        });
      }
    }

    await tx
      .update(cardScans)
      .set({
        cardId: newCardId,
        recognitionStatus: "matched",
      })
      .where(
        and(
          eq(cardScans.id, scanId),
          eq(cardScans.userId, userId),
        ),
      );

    return {
      ...existingScan[0],
      cardId: newCardId,
      recognitionStatus: "matched" as const,
    };
  });
}

export async function addPriceSnapshot(cardId: number, price: { source: string; currency: string; marketCents: number; lowCents?: number; highCents?: number }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(priceSnapshots).values({ cardId, ...price });
  return { id: result[0].insertId, cardId, ...price };
}

export async function listLatestPrices() {
  const db = await getDb();

  if (!db) {
    return CATALOG_CARDS.map((card) => ({
      cardId: card.id,
      source: "Catalog snapshot",
      currency: PRICE_CURRENCY,
      marketCents: card.marketCents,
      lowCents: Math.max(1, card.marketCents - 30),
      highCents: card.marketCents + 60,
    }));
  }

  const rows = await db
    .select()
    .from(priceSnapshots)
    .orderBy(desc(priceSnapshots.capturedAt));

  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.cardId}:${row.source}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function createDeck(userId: number, name: string, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(decks).values({ userId, name, notes });
  return { id: result[0].insertId, userId, name, notes };
}

export async function listDecks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(decks).where(eq(decks.userId, userId)).orderBy(desc(decks.updatedAt));
}

export async function saveDeckCards(userId: number, deckId: number, legends: { cardId: number; quantity: number }[], main: { cardId: number; quantity: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const deck = await db.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, userId))).limit(1);
  if (!deck[0]) throw new Error("Deck not found");
  await db.delete(deckCards).where(eq(deckCards.deckId, deckId));
  const lines = [...legends.map((line) => ({ ...line, deckId, slot: "legend" as const })), ...main.map((line) => ({ ...line, deckId, slot: "main" as const }))];
  if (lines.length) await db.insert(deckCards).values(lines);
  return lines;
}

export async function getDeckCards(userId: number, deckId: number) {
  const db = await getDb();
  if (!db) return [];
  const deck = await db.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, userId))).limit(1);
  if (!deck[0]) throw new Error("Deck not found");
  return db.select().from(deckCards).where(eq(deckCards.deckId, deckId));
}

export async function importCollection(userId: number, items: Array<{ cardId: number; quantity: number; condition?: string }>) {
  for (const item of items) await upsertCollectionItem(userId, item.cardId, item.quantity, item.condition ?? "NM");
  await addActivity(userId, "collection", "Collection imported", `${items.length} card lines imported from CSV.`);
  return getCollection(userId);
}

export async function createDeckShare(userId: number, deckId: number, expiresAt?: Date | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const deck = await db.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, userId))).limit(1);
  if (!deck[0]) throw new Error("Deck not found");
  const existing = await db.select().from(deckShares).where(and(eq(deckShares.deckId, deckId), eq(deckShares.userId, userId))).limit(1);
  if (existing[0] && !existing[0].revokedAt) {
    await db.update(deckShares).set({ expiresAt: expiresAt ?? null }).where(eq(deckShares.id, existing[0].id));
    return { ...existing[0], expiresAt: expiresAt ?? null };
  }
  const token = nanoid(32);
  const result = await db.insert(deckShares).values({ deckId, userId, token, expiresAt: expiresAt ?? null });
  return { id: result[0].insertId, deckId, userId, token, createdAt: new Date(), expiresAt: expiresAt ?? null, revokedAt: null };
}

export async function revokeDeckShare(userId: number, deckId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const share = await db.select().from(deckShares).where(and(eq(deckShares.deckId, deckId), eq(deckShares.userId, userId))).limit(1);
  if (!share[0]) return undefined;
  await db.update(deckShares).set({ revokedAt: new Date() }).where(eq(deckShares.id, share[0].id));
  return { ...share[0], revokedAt: new Date() };
}

export function isDeckShareActive(share: { expiresAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  return !share.revokedAt && (!share.expiresAt || share.expiresAt > now);
}

export async function getDeckShare(userId: number, deckId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const share = await db.select().from(deckShares).where(and(eq(deckShares.deckId, deckId), eq(deckShares.userId, userId))).limit(1);
  return share[0];
}

export async function getPublicDeckShare(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const share = await db.select().from(deckShares).where(eq(deckShares.token, token)).limit(1);
  if (!share[0]) return undefined;
  if (!isDeckShareActive(share[0])) return undefined;
  const deck = await db.select().from(decks).where(eq(decks.id, share[0].deckId)).limit(1);
  if (!deck[0]) return undefined;
  const lines = await db.select().from(deckCards).where(eq(deckCards.deckId, deck[0].id));
  const catalog = await listCards();
  return { share: share[0], deck: deck[0], cards: lines.map((line) => ({ ...line, card: catalog.find((card) => card.id === line.cardId) })) };
}

export async function addActivity(userId: number, kind: "scan" | "deck" | "recommendation" | "collection", title: string, detail?: string) {
  const db = await getDb();
  if (!db) return null;
  // Activity is operational telemetry, not an audit archive. Keep it for 90 days.
  await db.delete(activityEvents).where(and(eq(activityEvents.userId, userId), lt(activityEvents.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))));
  const result = await db.insert(activityEvents).values({ userId, kind, title, detail });
  return { id: result[0].insertId, userId, kind, title, detail, createdAt: new Date() };
}

export async function listActivity(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.createdAt)).limit(30);
}

export async function exportUserData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const [profile, collection, scans, userDecks, activity] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(collectionItems).where(eq(collectionItems.userId, userId)),
    db.select().from(cardScans).where(eq(cardScans.userId, userId)),
    db.select().from(decks).where(eq(decks.userId, userId)),
    db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.createdAt)),
  ]);
  const deckIds = userDecks.map((deck) => deck.id);
  const [deckLines, shares] = await Promise.all([
    deckIds.length ? db.select().from(deckCards).where(inArray(deckCards.deckId, deckIds)) : Promise.resolve([]),
    db.select().from(deckShares).where(eq(deckShares.userId, userId)),
  ]);
  return { exportedAt: new Date().toISOString(), profile: profile[0] ?? null, collection, scans, decks: userDecks, deckCards: deckLines, shares, activity };
}

export async function deleteUserData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const userDecks = await db.select({ id: decks.id }).from(decks).where(eq(decks.userId, userId));
  await db.transaction(async (tx) => {
    for (const deck of userDecks) await tx.delete(deckCards).where(eq(deckCards.deckId, deck.id));
    await tx.delete(deckShares).where(eq(deckShares.userId, userId));
    await tx.delete(decks).where(eq(decks.userId, userId));
    await tx.delete(collectionItems).where(eq(collectionItems.userId, userId));
    await tx.delete(cardScans).where(eq(cardScans.userId, userId));
    await tx.delete(activityEvents).where(eq(activityEvents.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
  return { deleted: true } as const;
}
